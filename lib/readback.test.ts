import { describe, expect, test } from "vitest";
import { DEMO_ITEMS } from "./fixtures/demoOrder";
import { readBackText } from "./readback";

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
});
