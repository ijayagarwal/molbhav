# Molbhav build pack

Everything you and Claude Code need to build Molbhav, the voice-first buying agent for small building contractors in India.

**Start with `START_HERE.md`.** It is the step-by-step guide for the whole team, written for a MacBook: setup from the zip to the first prompt, what you do by hand, and which Claude Code prompt to run when.

## What's inside
| File | What it is |
|---|---|
| `START_HERE.md` | The guide: field work, business registration and compliance, accounts, the build loop, go/no-go checks, demo |
| `CLAUDE.md` | Project memory Claude Code reads every session: stack, hard rules, conventions, glossary |
| `PROMPTS.md` | The build, phase by phase: copy-paste prompts with "done when" checks, plus the panel review and utility prompts |
| `docs/DECISIONS.md` | The expert panel's decisions with the debate behind each one, and why each tool was chosen (§T). **Wins over every other doc.** |
| `docs/PRODUCT.md` | Users, scope, flows, edge cases, domain model, metrics, business model, risks, validation plan |
| `docs/DESIGN.md` | The design system: brand, colour, type, motion, sound, components, every screen, voice UX, copy deck, desktop, touch and feel, showcase |
| `design/reference/*.html` | The approved mockups (phone app, desktop Munshi desk, presenter, landing, design system). Open them in a browser. |
| `docs/ARCHITECTURE.md` | Stack, diagram, folders, Convex schema, auth, flows, verified API details, LLM schemas, pricing rules with golden tests, personas, guards, cost |
| `docs/CALL_SCRIPT.md` | The four Bolna phone agents (Quote, Haggle, Match, Confirm): rules, settings, variables, Hindi prompts, dealer situations, testing ladder |
| `docs/TEAM_TEST.md` | Milestone 1 proof: role cards, six live-call runs on teammates' verified phones, checks, a run log |
| `docs/DEMO.md` | The 3-minute judge demo, Q&A answers, fallbacks, rehearsal checklist |
| `.env.example` | Every environment variable, and which of the three places it goes |
| `.mcp.json` | Connects Claude Code to Sarvam's docs server (approve it once with `/mcp`) |

The same mockups live on an editable design canvas, "Molbhav UI design", in your Claude artifacts (private until you share it).

## What is verified and what is assumed
- **Checked against vendor docs in November 2026:**
  - Bolna: call API, webhooks, custom functions, trial limits, the Indian-number compliance needs, `total_cost` in US cents.
  - Sarvam: STT endpoint, limits and pricing, ₹100 of free credit.
  - OpenAI: API data is not used for training (so one key, R19); gpt-5.4-mini pricing.
  - Next.js: CVE-2026-94545, fixed in 16.3.6.
  - `@vercel/og` 1.0.3 renders Devanagari conjuncts.
  - TRAI: the September 2026 A2P amendment.
  - GST: 18% on TMT steel and cement.
  - The palette's contrast ratios.
- **Still to confirm in the field** (DECISIONS.md §E):
  - contractors' words for brand tiers and bar sizes;
  - whether cement is usually quoted GST-inclusive;
  - DND applicability;
  - freight GST treatment (ask a CA);
  - exact current model ids.
- **Not market data:** every price in these docs and mockups is a test fixture. Replace pitch numbers with your own spread-test results.
- **Not legal advice:** confirm TRAI and DPDP obligations with your telephony provider and a lawyer in writing.
