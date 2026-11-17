import { describe, expect, test } from "vitest";
import { en } from "./i18n/en";
import { format } from "./i18n/format";
import { hi } from "./i18n/hi";
import { itemsLabel, itemTitle } from "./orderLabel";

const tHi = (k: keyof typeof hi, v?: Record<string, string | number>) => format(hi[k], v);
const tEn = (k: keyof typeof hi, v?: Record<string, string | number>) => format(en[k], v);

describe("order labels", () => {
  test("lists name the size and the cement type, and fall back to the dictionary's generic word", () => {
    expect(itemsLabel([{ material: "tmt_steel", diameterMm: 12 }, { material: "cement", cementType: "PPC" }], tHi)).toBe("TMT 12mm + PPC");
    expect(itemsLabel([{ material: "tmt_steel" }, { material: "cement" }], tHi)).toBe("TMT सरिया + सीमेंट");
    expect(itemsLabel([{ material: "cement" }], tEn)).toBe("Cement");
  });

  test("Confirm titles never invent a cement type", () => {
    expect(itemTitle({ material: "cement" }, tHi)).toBe("सीमेंट");
    expect(itemTitle({ material: "cement", cementType: "OPC53" }, tEn)).toBe("OPC53 cement");
    expect(itemTitle({ material: "tmt_steel", diameterMm: 16 }, tHi)).toBe("TMT सरिया");
  });
});
