import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { disclosureMade, firstSentence, parseTurns, scriptDiscloses } from "./transcript";

const CALL_SCRIPT = readFileSync(fileURLToPath(new URL("../docs/CALL_SCRIPT.md", import.meta.url)), "utf8");

/** Every "### Welcome" block in CALL_SCRIPT.md, by agent heading. */
function welcomes(): { agent: string; text: string }[] {
  const out: { agent: string; text: string }[] = [];
  let agent = "";
  const lines = CALL_SCRIPT.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) agent = lines[i].slice(3);
    if (lines[i].trim() === "### Welcome") {
      const open = lines.indexOf("```", i + 1);
      const close = lines.indexOf("```", open + 1);
      out.push({ agent, text: lines.slice(open + 1, close).join(" ").trim() });
    }
  }
  return out;
}

describe("welcomes in docs/CALL_SCRIPT.md (hard rule 3, C1)", () => {
  const all = welcomes();
  test("all four agents have one", () => {
    expect(all.map((w) => w.agent)).toEqual(["Agent 1: Quote", "Agent 2: Haggle", "Agent 3: Match (the contractor's regular dealer)", "Agent 4: Confirm (relays only)"]);
  });
  test.each(all)("$agent: the first sentence says AI and रिकॉर्ड", ({ text }) => {
    const first = firstSentence(text);
    expect(first.length).toBeGreaterThan(10);
    expect(scriptDiscloses(first)).toBe(true);
  });
  test.each(all)("$agent: no gendered first-person verb in the welcome", ({ text }) => {
    expect(text).not.toMatch(/(रहा|रही|गया|गई|सकता|सकती|करता|करती|चाहता|चाहती|देता|देती|बोलता|बोलती) (हूँ|हूं|था|थी)/u);
    expect(text).not.toMatch(/मैं/u); // the agent speaks for the contractor, never as a gendered "I"
  });
});

describe("firstSentence / scriptDiscloses", () => {
  test("stops at the first danda or question mark", () => {
    expect(firstSentence("नमस्ते जी, ये AI कॉल है। आगे बात।")).toBe("नमस्ते जी, ये AI कॉल है।");
    expect(firstSentence("Hello? AI call")).toBe("Hello?");
  });
  test("a disclosure in the second sentence doesn't count for our scripts", () => {
    expect(scriptDiscloses(firstSentence("नमस्ते जी। ये AI कॉल है और रिकॉर्ड हो रही है।"))).toBe(false);
    expect(scriptDiscloses("ये MAIL कॉल है, रिकॉर्ड हो रही है")).toBe(false); // "AI" inside a word
  });
});

const WELCOME = "assistant: नमस्ते जी, ये मोलभाव से AI कॉल है, रमेश जी की तरफ़ से, और कॉल रिकॉर्ड हो रही है। मानसरोवर साइट पे 2 टन सरिया चाहिए, स्टॉक में है?";

describe("disclosureMade (S5)", () => {
  test("the normal welcome, then rates", () => {
    expect(disclosureMade(`${WELCOME}\nuser: हाँ जी है, अट्ठावन रुपये किलो पड़ेगा`)).toBe(true);
  });

  test("a rate given before the disclosure was complete fails", () => {
    const cut = "assistant: नमस्ते जी, ये मोलभाव से AI कॉल है\nuser: हाँ बोलो, 58 चल रहा है\nassistant: जी, ये कॉल रिकॉर्ड हो रही है।";
    expect(disclosureMade(cut)).toBe(false);
  });

  test("the agent repeats the disclosure after being cut off, before any rate: passes (C6)", () => {
    const repeated =
      "assistant: नमस्ते जी, ये मोलभाव\nuser: हाँ कौन?\nassistant: जी, ये मोलभाव से AI कॉल है और कॉल रिकॉर्ड हो रही है।\nuser: अच्छा, 12mm का 58 रुपये";
    expect(disclosureMade(repeated)).toBe(true);
  });

  test("a size or a grade in the dealer's turn isn't a rate", () => {
    const t = "assistant: नमस्ते जी\nuser: 12 mm वाला? Fe 500D? बारह एमएम?\nassistant: ये AI कॉल है और रिकॉर्ड हो रही है\nuser: 58 रुपये";
    expect(disclosureMade(t)).toBe(true);
    expect(disclosureMade("assistant: नमस्ते जी\nuser: हाँ एक मिनट\nassistant: ये AI कॉल है, रिकॉर्ड हो रही है\nuser: 58")).toBe(true);
  });

  // Review of 8A: these passed before and must fail.
  test("आईएसआई (ISI) is not AI", () => {
    expect(disclosureMade("assistant: नमस्ते जी, कॉल रिकॉर्ड हो रही है, सरिया के लिए आईएसआई वाला\nuser: 58 रुपये")).toBe(false);
    expect(disclosureMade("assistant: वो लोग आ गए आईं, कॉल रिकॉर्ड हो रही है\nuser: 58")).toBe(false);
  });
  test("per-ton rates that look like a phone number still count as rates", () => {
    expect(disclosureMade("assistant: नमस्ते जी\nuser: 57500 58000 चल रहा है\nassistant: ये AI कॉल है और रिकॉर्ड हो रही है")).toBe(false);
  });
  test("a rate right after a size still counts", () => {
    expect(disclosureMade("assistant: नमस्ते जी\nuser: 12 mm 58 रुपये किलो\nassistant: ये AI कॉल है और रिकॉर्ड हो रही है")).toBe(false);
    expect(disclosureMade("assistant: नमस्ते जी\nuser: OPC 53 का 380\nassistant: ये AI कॉल है और रिकॉर्ड हो रही है")).toBe(false);
  });

  test("no disclosure at all fails even when no rate was given", () => {
    expect(disclosureMade("assistant: नमस्ते जी\nuser: अभी नहीं")).toBe(false);
  });

  test("spelling variants of the same spoken words are accepted in transcripts", () => {
    expect(disclosureMade("assistant: ये एआई कॉल है, रिकार्ड हो रही है\nuser: 58")).toBe(true);
  });

  test("parseTurns keeps continuation lines with their speaker", () => {
    expect(parseTurns("assistant: a\nb\nuser: c")).toEqual([
      { speaker: "agent", text: "a b" },
      { speaker: "dealer", text: "c" },
    ]);
  });
});
