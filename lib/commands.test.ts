import { describe, expect, test } from "vitest";
import { matchDealers, nameSkeleton, parseCommand, type DealerName } from "./commands";

const DEALERS: DealerName[] = [
  { id: "agarwal", names: ["Agarwal Steels", "अग्रवाल स्टील्स"] },
  { id: "omsai", names: ["Om Sai Traders", "ओम साई ट्रेडर्स"] },
  { id: "rathore", names: ["Rathore Building Material", "राठौड़ बिल्डिंग मटेरियल"] },
  { id: "balaji", names: ["Shree Balaji", "श्री बालाजी"] },
  { id: "gupta", names: ["Gupta Hardware", "गुप्ता हार्डवेयर"] },
];

describe("parseCommand (V4)", () => {
  test("start", () => {
    for (const s of ["हाँ, शुरू कीजिए", "हां शुरू करो", "haan shuru karo", "शुरू कीजिए", "हाँ", "start", "जी हाँ"]) {
      expect(parseCommand(s)).toEqual({ kind: "start" });
    }
  });

  test("any negation means no action", () => {
    for (const s of ["अभी confirm मत करो", "नहीं, रुकिए", "हाँ… रुकिए", "रुको", "बाद में करेंगे", "abhi nahi", "confirm mat karo", "रद्द मत करो", "शुरू नहीं करना", "हाँ ना", "wait"]) {
      expect(parseCommand(s, DEALERS)).toEqual({ kind: "none", reason: "negation" });
    }
  });

  test("cancel during the undo window", () => {
    for (const s of ["रद्द", "रद्द करो", "cancel", "कैंसल कर दो", "radd karo"]) expect(parseCommand(s)).toEqual({ kind: "cancel" });
  });

  test("confirm a named dealer, in Hindi or Hinglish", () => {
    expect(parseCommand("अग्रवाल को confirm करो", DEALERS)).toEqual({ kind: "confirm", dealerId: "agarwal" });
    expect(parseCommand("Agarwal ko confirm karo", DEALERS)).toEqual({ kind: "confirm", dealerId: "agarwal" });
    expect(parseCommand("aggarwal ko pakka karo", DEALERS)).toEqual({ kind: "confirm", dealerId: "agarwal" });
    expect(parseCommand("ओम साई को कन्फर्म कीजिए", DEALERS)).toEqual({ kind: "confirm", dealerId: "omsai" });
    expect(parseCommand("राठौड़ को confirm करो", DEALERS)).toEqual({ kind: "confirm", dealerId: "rathore" });
    expect(parseCommand("balaji ko confirm", DEALERS)).toEqual({ kind: "confirm", dealerId: "balaji" });
  });

  test("confirm without a name confirms the shown winner", () => {
    expect(parseCommand("confirm करो", DEALERS)).toEqual({ kind: "confirm" });
    expect(parseCommand("हाँ, पक्का कीजिए", DEALERS)).toEqual({ kind: "confirm" });
  });

  test("a name that isn't on this screen is not guessed", () => {
    expect(parseCommand("शर्मा को confirm करो", DEALERS)).toEqual({ kind: "none", reason: "unknown_dealer" });
  });

  test("two dealers named: ambiguous, no action", () => {
    expect(parseCommand("अग्रवाल या गुप्ता को confirm करो", DEALERS)).toEqual({ kind: "none", reason: "ambiguous_dealer" });
  });

  test("anything else: no action", () => {
    expect(parseCommand("भाई साहब क्या हाल है", DEALERS)).toEqual({ kind: "none", reason: "unknown" });
  });
});

describe("dealer name matching", () => {
  test("Devanagari and Latin spellings share a consonant skeleton", () => {
    expect(nameSkeleton("अग्रवाल")).toBe(nameSkeleton("Agarwal"));
    expect(nameSkeleton("Aggarwal")).toBe(nameSkeleton("Agarwal"));
    expect(nameSkeleton("राठौड़")).toBe(nameSkeleton("Rathore"));
    expect(nameSkeleton("श्री")).toBe(nameSkeleton("Shree"));
    expect(nameSkeleton("गुप्ता")).toBe(nameSkeleton("Gupta"));
  });

  test("generic shop words don't match on their own", () => {
    expect(matchDealers("steels wale ko", DEALERS)).toEqual([]);
    expect(matchDealers("ट्रेडर्स", DEALERS)).toEqual([]);
  });
});
