import { describe, expect, test } from "vitest";
import { checkDealerApplication, dealerNameFrom, maskPhone, parseCoordinate, roundGeo } from "./dealerApplication";

const GOOD = { shopName: " Agarwal  Steels ", phone: "098290 12345", area: "mansarovar", materials: ["cement", "tmt_steel"], consent: true };

describe("checkDealerApplication", () => {
  test("normalises the shop, phone and materials; Jaipur only; no location unless given", () => {
    expect(checkDealerApplication(GOOD)).toEqual({
      ok: true,
      entry: { shopName: "Agarwal Steels", phoneE164: "+919829012345", city: "Jaipur", area: "mansarovar", materials: ["tmt_steel", "cement"] },
    });
  });

  test("lists the fields to fix, in the form's order; consent is required", () => {
    expect(checkDealerApplication({ shopName: "", phone: "12345", area: "nowhere", materials: [], consent: false })).toEqual({
      ok: false,
      fields: ["name", "phone", "area", "materials", "consent"],
    });
    expect(checkDealerApplication({ ...GOOD, materials: ["tmt_steel", "sand"] })).toEqual({ ok: false, fields: ["materials"] });
  });

  test("keeps the shop location only rounded to ~100 m, and only inside India", () => {
    const r = checkDealerApplication({ ...GOOD, lat: 26.912434, lng: 75.787271 });
    expect(r.ok && r.entry.geo).toEqual({ lat: 26.912, lng: 75.787 });
    const abroad = checkDealerApplication({ ...GOOD, lat: 51.5, lng: -0.12 });
    expect(abroad.ok && abroad.entry.geo).toBeUndefined();
  });
});

describe("roundGeo and parseCoordinate", () => {
  test("three decimals; NaN, infinities and missing values are dropped", () => {
    expect(roundGeo(26.91259, 75.78751)).toEqual({ lat: 26.913, lng: 75.788 });
    expect(roundGeo(Number.NaN, 75)).toBeNull();
    expect(roundGeo(26.9, Number.POSITIVE_INFINITY)).toBeNull();
    expect(roundGeo(undefined, 75)).toBeNull();
    expect(roundGeo(null, null)).toBeNull();
  });

  test("only plain decimal strings parse", () => {
    expect(parseCoordinate("26.912")).toBe(26.912);
    expect(parseCoordinate(" 75.5 ")).toBe(75.5);
    expect(parseCoordinate("1e3")).toBeNull();
    expect(parseCoordinate("")).toBeNull();
    expect(parseCoordinate(null)).toBeNull();
    expect(parseCoordinate("26.9; drop")).toBeNull();
  });
});

describe("maskPhone and dealerNameFrom", () => {
  test("the panel sees the last two digits only", () => {
    expect(maskPhone("+919829012345")).toBe("••••••45");
  });

  test("a form shop name becomes a dealers-table name, or null", () => {
    expect(dealerNameFrom("R.K. Traders")).toBe("R.K. Traders");
    expect(dealerNameFrom("Gupta Traders, Main Road (Sanganer)")).toBe("Gupta Traders Main Road Sanganer");
    expect(dealerNameFrom("श्री बालाजी सीमेंट")).toBe("श्री बालाजी सीमेंट");
    expect(dealerNameFrom("one two three four five six seven")).toBe("one two three four five six");
    expect(dealerNameFrom("  ")).toBeNull();
  });
});
