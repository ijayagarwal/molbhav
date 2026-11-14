import { describe, expect, test } from "vitest";
import { matchDealer, nameSkeleton, parseCommand, type DealerName } from "./commands";

const DEALERS: DealerName[] = [
  { id: "agarwal", names: ["Agarwal Steels", "अग्रवाल स्टील्स"] },
  { id: "omsai", names: ["Om Sai Traders", "ओम साई ट्रेडर्स"] },
  { id: "rathore", names: ["Rathore Building Material", "राठौड़ बिल्डिंग मटेरियल"] },
  { id: "balaji", names: ["Shree Balaji Traders", "श्री बालाजी ट्रेडर्स"] },
  { id: "gupta", names: ["Gupta Hardware", "गुप्ता हार्डवेयर"] },
];
const ctx = { dealers: DEALERS };
const kind = (s: string, c = ctx) => parseCommand(s, c);

describe("start", () => {
  test("clear start phrases", () => {
    for (const s of ["हाँ, शुरू कीजिए", "हां शुरू करो", "haan shuru karo", "शुरू कीजिए", "हाँ", "start", "जी हाँ", "हाँ जी", "ok", "हाँ, मोलभाव शुरू कीजिए"]) {
      expect(kind(s), s).toEqual({ kind: "start" });
    }
  });

  test("a yes with a correction or anything else does nothing", () => {
    for (const s of ["हाँ पर सीमेंट ढाई सौ बोरी करो", "हाँ लेकिन cement OPC चाहिए", "हाँ पर 10mm चाहिए", "रमेश जी बोल रहा हूँ", "जी", "ok ek minute", "haan but 16mm"]) {
      expect(kind(s).kind, s).toBe("none");
    }
  });
});

describe("negation, questions and hedges never act", () => {
  test("negations, in every spelling", () => {
    for (const s of [
      "अभी confirm मत करो", "नहीं, रुकिए", "हाँ… रुकिए", "रुको", "बाद में करेंगे", "abhi nahi", "confirm mat karo", "रद्द मत करो",
      "शुरू नहीं करना", "हाँ ना", "wait", "don't confirm Agarwal", "Don’t confirm agarwal", "do not confirm", "Agarwal ko confirm nhi karna",
      "अभी confirm नई करना", "confirm नहि", "एक मिनट", "hold karo",
    ]) {
      expect(kind(s).kind, s).toBe("none");
    }
  });

  test("questions and future tense", () => {
    for (const s of [
      "अग्रवाल पक्का बिल देगा?", "अग्रवाल का फाइनल रेट क्या है", "अग्रवाल का final rate क्या है", "अग्रवाल को कल confirm करेंगे",
      "अग्रवाल को confirm करूँ क्या", "क्या अग्रवाल को confirm करूँ?", "Om Sai ka rate pakka hai kya", "agarwal se kam kisi ko confirm karo",
    ]) {
      expect(kind(s).kind, s).toBe("none");
    }
  });

  test("पक्का about the bill or as a statement isn't a command", () => {
    expect(kind("अग्रवाल पक्का बिल").kind).toBe("none");
    expect(kind("ये पक्का है").kind).toBe("none");
  });
});

describe("cancel", () => {
  test("cancel words outside the undo window", () => {
    for (const s of ["रद्द", "रद्द करो", "cancel", "कैंसल कर दो", "कैंसिल", "radd karo"]) expect(kind(s), s).toEqual({ kind: "cancel" });
  });

  test("in the undo window, stopping is the safe action", () => {
    const undo = { dealers: DEALERS, undoWindow: true };
    expect(kind("नहीं नहीं, रुको!", undo)).toEqual({ kind: "cancel" });
    expect(kind("रुकिए", undo)).toEqual({ kind: "cancel" });
    expect(kind("रद्द", undo)).toEqual({ kind: "cancel" });
    expect(kind("रद्द मत करो", undo).kind).toBe("none");
    expect(kind("हाँ ठीक है", undo).kind).toBe("none");
  });
});

describe("confirm", () => {
  test("a named dealer with an imperative, in Hindi or Hinglish", () => {
    expect(kind("अग्रवाल को confirm करो")).toEqual({ kind: "confirm", dealerId: "agarwal" });
    expect(kind("Agarwal ko confirm karo")).toEqual({ kind: "confirm", dealerId: "agarwal" });
    expect(kind("aggarwal ko pakka karo")).toEqual({ kind: "confirm", dealerId: "agarwal" });
    expect(kind("ओम साई को कन्फर्म कीजिए")).toEqual({ kind: "confirm", dealerId: "omsai" });
    expect(kind("राठौड़ को confirm करो")).toEqual({ kind: "confirm", dealerId: "rathore" });
    expect(kind("balaji ko confirm kar do")).toEqual({ kind: "confirm", dealerId: "balaji" });
    expect(kind("agarwal confirm")).toEqual({ kind: "confirm", dealerId: "agarwal" });
  });

  test("confirm with no name confirms the shown winner", () => {
    expect(kind("confirm करो")).toEqual({ kind: "confirm" });
    expect(kind("हाँ, पक्का कीजिए")).toEqual({ kind: "confirm" });
    expect(kind("confirm")).toEqual({ kind: "confirm" });
  });

  test("words that only sound like a name never pick a dealer", () => {
    expect(kind("sir confirm karo")).toEqual({ kind: "confirm" }); // not Shree Balaji
    expect(kind("सारा confirm कर दो")).toEqual({ kind: "confirm" });
    const withKaur = { dealers: [...DEALERS, { id: "kaur", names: ["Kaur Steels"] }, { id: "khurana", names: ["Khurana Traders"] }] };
    expect(kind("confirm करो", withKaur)).toEqual({ kind: "confirm" });
  });

  test("a name that isn't on this screen, or a near miss, is not guessed", () => {
    expect(kind("शर्मा को confirm करो").kind).toBe("none");
    expect(kind("शाह को confirm करो").kind).toBe("none");
    const bindal = { dealers: [...DEALERS, { id: "bindal", names: ["Bindal Steels"] }] };
    expect(kind("Jindal wale ko confirm karo", bindal).kind).toBe("none");
  });

  test("two dealers named: no action", () => {
    expect(kind("अग्रवाल या गुप्ता को confirm करो").kind).toBe("none");
  });

  test("anything else: no action", () => {
    expect(kind("भाई साहब क्या हाल है").kind).toBe("none");
  });
});

describe("dealer name matching", () => {
  test("Devanagari and Latin spellings share a consonant skeleton", () => {
    expect(nameSkeleton("अग्रवाल")).toBe(nameSkeleton("Agarwal"));
    expect(nameSkeleton("Aggarwal")).toBe(nameSkeleton("Agarwal"));
    expect(nameSkeleton("राठौड़")).toBe(nameSkeleton("Rathore"));
    expect(nameSkeleton("गुप्ता")).toBe(nameSkeleton("Gupta"));
    expect(nameSkeleton("बंसल")).toBe(nameSkeleton("Bansal"));
  });

  test("generic shop words and fillers don't match", () => {
    expect(matchDealer(["steels", "wale", "ko"], DEALERS)).toEqual({ kind: "none" });
    expect(matchDealer(["ट्रेडर्स"], DEALERS)).toEqual({ kind: "none" });
  });
});
