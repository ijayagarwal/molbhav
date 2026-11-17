import { describe, expect, test } from "vitest";
import { DEMO_ITEMS } from "./fixtures/demoOrder";
import { readBackReady, readBackText, resultSummaryText } from "./readback";

describe("readBackText (V3)", () => {
  test("Hindi: what and how much with the tier, then time and credit, then the closing statement", () => {
    const text = readBackText({ items: DEMO_ITEMS, deliverBy: "tomorrow_morning", creditDaysWanted: 15 }, "hi");
    expect(text).toBe("दो टन बारह mm लोकल ISI सरिया Fe500D, और डेढ़ सौ बोरी PPC सीमेंट। कल सुबह तक, पंद्रह दिन उधार। सही हो तो शुरू कीजिए।");
    expect(text.split("।").filter((s) => s.trim()).length).toBeLessThanOrEqual(3);
  });
  test("leaves out an unsaid delivery time and no credit", () => {
    expect(readBackText({ items: DEMO_ITEMS, deliverBy: "flexible" }, "hi")).toBe("दो टन बारह mm लोकल ISI सरिया Fe500D, और डेढ़ सौ बोरी PPC सीमेंट। सही हो तो शुरू कीजिए।");
  });
  test("English", () => {
    expect(readBackText({ items: DEMO_ITEMS, deliverBy: "tomorrow_morning", creditDaysWanted: 15 }, "en")).toBe(
      "2 tons 12 mm local ISI TMT steel Fe500D and 150 bags PPC cement. By tomorrow morning, 15 days credit. If that's right, start.",
    );
  });
  test("a site other than the default is spoken first in the second sentence, still 3 sentences", () => {
    const site = { hi: "मानसरोवर", en: "Mansarovar" };
    const hi = readBackText({ items: DEMO_ITEMS, deliverBy: "tomorrow_morning", creditDaysWanted: 15, site }, "hi");
    expect(hi).toBe("दो टन बारह mm लोकल ISI सरिया Fe500D, और डेढ़ सौ बोरी PPC सीमेंट। मानसरोवर साइट, कल सुबह तक, पंद्रह दिन उधार। सही हो तो शुरू कीजिए।");
    expect(hi.split("।").filter((s) => s.trim()).length).toBe(3);
    expect(readBackText({ items: DEMO_ITEMS, site }, "en")).toBe("2 tons 12 mm local ISI TMT steel Fe500D and 150 bags PPC cement. To the Mansarovar site. If that's right, start.");
  });
  test("readBackReady: every item needs a quantity and a unit", () => {
    expect(readBackReady(DEMO_ITEMS)).toBe(true);
    expect(readBackReady([])).toBe(false);
    expect(readBackReady([{ ...DEMO_ITEMS[0], quantity: undefined }])).toBe(false);
    expect(readBackReady([{ ...DEMO_ITEMS[0], unit: undefined }])).toBe(false);
  });
});

describe("resultSummaryText (V7)", () => {
  const demo = { winnerName: "अग्रवाल स्टील्स", totalPaise: 19_883_000, saved: 547_000, basis: "first_rate" as const, regularIsCheapest: false };
  test("Hindi: the winner and total, then the saving and its basis, spoken exactly", () => {
    expect(resultSummaryText(demo, "hi")).toBe("सबसे सस्ता: अग्रवाल स्टील्स, एक लाख अट्ठानवे हज़ार आठ सौ तीस रुपये, सब मिलाके। पाँच हज़ार चार सौ सत्तर रुपये कम, आपके dealer के पहले रेट से।");
  });
  test("English, and the regular-dealer-is-cheapest case", () => {
    expect(resultSummaryText({ ...demo, winnerName: "Agarwal Steels" }, "en")).toBe("Cheapest: Agarwal Steels, ₹1,98,830 all in. ₹5,470 less than your dealer's first rate.");
    expect(resultSummaryText({ ...demo, regularIsCheapest: true }, "hi")).toContain("आपके dealer ही सबसे सस्ते हैं।");
  });
});

