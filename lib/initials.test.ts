import { describe, expect, test } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  test("Devanagari names, like the mockups", () => {
    expect(initials("अग्रवाल स्टील्स")).toBe("अग");
    expect(initials("ओम साई ट्रेडर्स")).toBe("ओसा");
    expect(initials("राठौड़ बिल्डिंग मटेरियल")).toBe("रा");
    expect(initials("गुप्ता हार्डवेयर")).toBe("गु");
    expect(initials("श्री बालाजी ट्रेडर्स")).toBe("शबा");
  });
  test("Latin names", () => {
    expect(initials("Agarwal Steels")).toBe("AG");
    expect(initials("Om Sai Traders")).toBe("OS");
    expect(initials("TEST · Shree Balaji")).toBe("SB");
  });
});
