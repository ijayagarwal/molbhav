import { describe, expect, test } from "vitest";
import { checkWaitlist, cleanCity, cleanName, cleanRef } from "./waitlist";

const base = { role: "contractor" as const, name: "Ramesh", phone: "9812345678", city: "Jaipur", consentContact: true };

describe("waitlist checks (G5, S4)", () => {
  test("a valid contractor is normalised", () => {
    expect(checkWaitlist({ ...base, name: "  रमेश   यादव ", phone: "+91 98123-45678", nextOrder: "this_month", ref: "parchi_full" })).toEqual({
      ok: true,
      entry: { role: "contractor", name: "रमेश यादव", phoneE164: "+919812345678", city: "Jaipur", nextOrder: "this_month", ref: "parchi_full", consentContact: true },
    });
  });

  test("an empty next order is fine; an unknown one is not", () => {
    expect(checkWaitlist({ ...base, nextOrder: "" }).ok).toBe(true);
    expect(checkWaitlist({ ...base, nextOrder: "someday" })).toEqual({ ok: false, fields: ["nextOrder"] });
  });

  test("consent is required", () => {
    expect(checkWaitlist({ ...base, consentContact: false })).toEqual({ ok: false, fields: ["consent"] });
  });

  test("every invalid field is listed in form order", () => {
    expect(checkWaitlist({ ...base, role: "boss" as never, name: "!!", phone: "12", city: "", consentContact: false })).toEqual({
      ok: false,
      fields: ["role", "name", "phone", "city", "consent"],
    });
  });

  test("a dealer: city is Jaipur, a known area, materials from the list, AI-call consent", () => {
    const dealer = {
      role: "dealer" as const,
      name: "Shree Ganesh Traders & Co.",
      phone: "09829012345",
      area: "jagatpura",
      materials: ["cement", "tmt_steel", "cement"],
      consentContact: true,
      consentAiCalls: true,
    };
    expect(checkWaitlist(dealer)).toEqual({
      ok: true,
      entry: {
        role: "dealer", name: "Shree Ganesh Traders & Co.", phoneE164: "+919829012345", city: "Jaipur", area: "jagatpura",
        materials: ["tmt_steel", "cement"], consentContact: true, consentAiCalls: true,
      },
    });
    expect(checkWaitlist({ ...dealer, area: "Delhi", materials: ["sand"], consentAiCalls: false })).toEqual({ ok: false, fields: ["area", "materials", "consent"] });
  });

  test("names, cities and refs", () => {
    expect(cleanName("A".repeat(61))).toBeNull();
    expect(cleanName("1234")).toBeNull();
    expect(cleanName("<b>")).toBeNull();
    expect(cleanName("श्री गणेश ट्रेडर्स")).toBe("श्री गणेश ट्रेडर्स");
    expect(cleanCity("Sawai Madhopur")).toBe("Sawai Madhopur");
    expect(cleanCity("जयपुर")).toBe("जयपुर");
    expect(cleanCity("Jaipur 302020")).toBeNull();
    expect(cleanRef("parchi_full")).toBe("parchi_full");
    expect(cleanRef("a b")).toBeUndefined();
    expect(cleanRef("x".repeat(41))).toBeUndefined();
    expect(cleanRef(null)).toBeUndefined();
  });
});
