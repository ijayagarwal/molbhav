import { describe, expect, test } from "vitest";
import { callbackDelayMs } from "./callback";

const MIN = 60_000;

describe("callbackDelayMs (P8: one retry at the dealer's time, within 30 minutes)", () => {
  test.each([
    ["दस मिनट बाद", 10 * MIN],
    ["अभी busy हूँ, दस मिनट बाद कॉल करो", 10 * MIN],
    ["10 minute baad", 10 * MIN],
    ["पंद्रह-बीस मिनट में", 20 * MIN],
    ["आधे घंटे बाद", 30 * MIN],
    ["5 min", 5 * MIN],
  ])("%s", (text, ms) => {
    expect(callbackDelayMs(text)).toBe(ms);
  });

  test.each(["बाद में", "शाम को", "एक घंटे बाद", "चालीस मिनट बाद", "दो घंटे", "कल", "10", "", undefined])("no retry for %s", (text) => {
    expect(callbackDelayMs(text)).toBeNull();
  });
});
