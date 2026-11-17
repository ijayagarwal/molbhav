import { describe, expect, test } from "vitest";
import robots from "@/app/robots";

// Two readings of robots.txt: Google's (the longest matching rule wins, allow on a tie) and a strict crawler's
// (any matching disallow blocks). The public pages must be crawlable and the private ones blocked under both.
const rules = (() => {
  const r = robots().rules;
  const rule = Array.isArray(r) ? r[0] : r;
  const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
  return { userAgent: rule.userAgent, allow: list(rule.allow), disallow: list(rule.disallow) };
})();

function longestMatch(path: string): boolean {
  const allow = Math.max(-1, ...rules.allow.filter((p) => path.startsWith(p)).map((p) => p.length));
  const disallow = Math.max(-1, ...rules.disallow.filter((p) => path.startsWith(p)).map((p) => p.length));
  return allow >= disallow;
}
const strict = (path: string) => !rules.disallow.some((p) => path.startsWith(p));

describe("robots (Phase 1C)", () => {
  test("applies to every crawler", () => {
    expect(rules.userAgent).toBe("*");
  });

  test("/, /dealer and /privacy are crawlable", () => {
    for (const path of ["/", "/dealer", "/privacy", "/?ref=parchi_full"]) {
      expect(longestMatch(path), path).toBe(true);
      expect(strict(path), path).toBe(true);
    }
  });

  test("/app, /try, /p, /present and /styleguide are not", () => {
    for (const path of ["/app", "/app/order/abc/result", "/try", "/p/AbCdEfGhIjKlMnOpQrStUv", "/present", "/styleguide", "/styleguide/money-shot", "/api/e"]) {
      expect(longestMatch(path), path).toBe(false);
      expect(strict(path), path).toBe(false);
    }
  });
});
