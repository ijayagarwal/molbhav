import { describe, expect, test } from "vitest";
import { EVENT_NAMES, isEventName, normaliseEventPath, refChannel, validateEventProps } from "./analytics";

describe("analytics allow-list (G6)", () => {
  test("exactly the G6 event names", () => {
    expect([...EVENT_NAMES].sort()).toEqual(["dealer_optin", "parchi_cta", "parchi_open", "parchi_share", "try_start", "try_voice", "waitlist_submit"]);
    expect(isEventName("parchi_share")).toBe(true);
    for (const bad of ["hasOwnProperty", "__proto__", "page_view", 1, null]) expect(isEventName(bad)).toBe(false);
  });

  test("props: enum values only, keys sorted; anything else is null", () => {
    expect(validateEventProps("parchi_share", { mode: "munshi" })).toBe('{"mode":"munshi"}');
    expect(validateEventProps("waitlist_submit", { role: "other", ref: "none" })).toBe('{"ref":"none","role":"other"}');
    expect(validateEventProps("dealer_optin", undefined)).toBeUndefined();
    expect(validateEventProps("dealer_optin", {})).toBeUndefined();
    expect(validateEventProps("dealer_optin", { mode: "full" })).toBeNull();
    expect(validateEventProps("parchi_share", { mode: "Full" })).toBeNull();
    expect(validateEventProps("parchi_share", { mode: 1 })).toBeNull();
    expect(validateEventProps("parchi_share", ["full"])).toBeNull();
    expect(validateEventProps("parchi_share", "full")).toBeNull();
    expect(validateEventProps("waitlist_submit", { role: "contractor", phone: "+919812345678" })).toBeNull();
  });

  test("paths keep the route only", () => {
    expect(normaliseEventPath("/")).toBe("/");
    expect(normaliseEventPath("/dealer?ref=x")).toBe("/dealer");
    expect(normaliseEventPath("/p/Zk3_aQ-8sdfLkj23lkJ0xw")).toBe("/p/[id]");
    expect(normaliseEventPath("/app/order/k57abcdefghijklmnopqrstuvwxyz012/result")).toBe("/app/order/[id]/result");
    expect(normaliseEventPath("/p/abcdefghijklmnopqrstuv")).toBe("/p/[id]"); // a lowercase-only id is still too long to keep
    for (const bad of ["", "dealer", "//evil.example", "https://x.y/", 5, "/a/b/c/d/e/f/g"]) expect(normaliseEventPath(bad)).toBeNull();
  });

  test("ref becomes a channel", () => {
    expect(refChannel(undefined)).toBe("none");
    expect(refChannel("parchi_savings")).toBe("parchi");
    expect(refChannel("wa_group")).toBe("other");
  });
});
