import { describe, expect, test } from "vitest";
import { errorCode, sandboxErrorKey, tryProblemCopy } from "./copy";

describe("/try copy", () => {
  test("the sandbox's own limits say so; the rest is the app's copy", () => {
    expect(tryProblemCopy("rate_limited").key).toBe("try.errLimit");
    expect(tryProblemCopy("cap_reached").key).toBe("try.errCap");
    expect(tryProblemCopy("not_configured")).toMatchObject({ key: "try.errVoiceOff", soon: true });
    expect(tryProblemCopy("stt_failed").key).toBe("voice.errStt");
    expect(tryProblemCopy("bot").retry).toBe("reload");
  });

  test("mutation failures map to their message", () => {
    expect(sandboxErrorKey(errorCode({ data: { code: "rate_limited", retryAfterMs: 5 } }))).toBe("try.errLimit");
    expect(sandboxErrorKey("cap_reached")).toBe("try.errCap");
    expect(sandboxErrorKey("no_dealers")).toBe("try.errNoDealers");
    expect(sandboxErrorKey("expired")).toBe("try.expired");
    expect(sandboxErrorKey(errorCode(new Error("network")))).toBe("try.errStart");
  });
});
