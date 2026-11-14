import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { CONTRAST_PAIRS, contrast, DARK, LIGHT } from "./tokens";

const css = readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf("}", start));
}

describe("design tokens", () => {
  test("globals.css mirrors lib/tokens.ts for both themes", () => {
    const light = block(":root");
    const dark = block('[data-theme="dark"]');
    for (const [name, hex] of Object.entries(LIGHT)) expect(light, name).toContain(`--${name}: ${hex};`);
    for (const [name, hex] of Object.entries(DARK)) expect(dark, name).toContain(`--${name}: ${hex};`);
  });

  test("the measured contrast table in DESIGN §5 holds", () => {
    const r = (fg: keyof typeof LIGHT, bg: keyof typeof LIGHT) => Math.round(contrast(LIGHT[fg], LIGHT[bg]) * 10) / 10;
    expect(r("ink", "paper")).toBe(16.7);
    expect(r("ink", "card")).toBe(18.7);
    expect(r("ink-2", "paper")).toBe(9.2);
    expect(r("ink-3", "paper")).toBe(5.3);
    expect(r("lal", "paper")).toBe(7.9);
    expect(r("hara", "paper")).toBe(7.9);
    expect(r("neel", "paper")).toBe(9.3);
    expect(r("ink", "haldi")).toBe(11.9);
    expect(r("haldi", "paper")).toBe(1.4); // never haldi text on light
  });

  test("every pair meets its minimum", () => {
    for (const p of CONTRAST_PAIRS) expect(contrast(LIGHT[p.fg], LIGHT[p.bg]), `${p.fg} on ${p.bg}`).toBeGreaterThanOrEqual(p.min);
  });
});
