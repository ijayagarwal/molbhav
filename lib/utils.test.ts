import { describe, expect, test } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  test("knows our tokens: size vs colour, shadows, radii", () => {
    expect(cn("text-title-1 text-ink", "text-ink-2")).toBe("text-title-1 text-ink-2");
    expect(cn("text-body", "text-label")).toBe("text-label");
    expect(cn("shadow-paint", "shadow-none")).toBe("shadow-none");
    expect(cn("rounded-card", "rounded-parchi")).toBe("rounded-parchi");
  });
});
