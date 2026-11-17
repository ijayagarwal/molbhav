# Molbhav: progress log

This is the living record of what we are building, what is done, and what comes next. It is kept up to date
as work happens, so a person or an AI agent can pick up the project from this page. Git history has the
detail; this page has the story. Newest entries are at the top of each section.

**Last updated:** 17 Nov 2026

---

## 1. What we are building (one paragraph)

Molbhav (मोलभाव, "bargaining") is a voice-first buying agent for small building contractors (thekedars) in
India.
1. The contractor speaks one order in Hindi or Hinglish ("कल सुबह तक 2 टन 12mm सरिया Fe500D और 150 बोरी PPC…").
2. Molbhav's AI phone agents call nearby dealers and collect landed prices (rate + GST + delivery + unloading).
3. They bargain with the best two using only real, read-back-confirmed quotes.
4. They give the contractor's regular dealer a chance to match.
5. They hand back the cheapest comparable option as a "parchi" (receipt), with recordings as proof.

The contractor confirms by voice. It is a **web app only** (phone first, with a full desktop "Munshi desk"),
in Hindi by default with a full English switch. **Simulator mode is the default**: every flow works with
fictional DEMO dealers at zero call cost. Real AI calls happen only through a guarded path, after the
legal and account steps.

## 2. Where things are

| What | Where |
|---|---|
| Live app (production) | https://molbhav-weld.vercel.app |
| The money shot (20 s design piece) | https://molbhav-weld.vercel.app/styleguide/money-shot |
| Component styleguide (hi + en) | https://molbhav-weld.vercel.app/styleguide |
| App shell demo (phone + Munshi desk) | https://molbhav-weld.vercel.app/styleguide/shell |
| Founders' admin (read-only) | /app/admin (admin sessions only) |
| Code | https://github.com/ijayagarwal/molbhav (private) |
| Decisions (wins over every other doc) | `docs/DECISIONS.md`, especially §R (R1–R18) |
| Product, design, architecture | `docs/PRODUCT.md`, `docs/DESIGN.md`, `docs/ARCHITECTURE.md` |
| Phone agents' scripts | `docs/CALL_SCRIPT.md` |
| Build plan, phase by phase | `PROMPTS.md` |
| Deployments and infrastructure | `docs/DEPLOYMENTS.md` |
| Approved mockups | `design/reference/*.html` |

**Stack:**
- Next.js 16 on Vercel (Mumbai `bom1` for the voice routes);
- Convex for the database, realtime, jobs and auth (production in EU);
- Tailwind v4 with our tokens, Motion, Phosphor icons;
- Sarvam for speech-to-text and text-to-speech;
- Gemini Flash for parsing and extraction;
- Bolna for phone agents.

## 3. Phase tracker

Order (DECISIONS R11): 1A → 3 → 1B → 2A → 2B → 4 → 5 → 6A → 6B → 8A → 8B → 8C → Team test → 1C → 7 → 9 → 10.
Phase 4 (voice) waits for API keys, so the key-free phases go first.

| Phase | What | Status | Commit / tag |
|---|---|---|---|
| 0 | Read-through, doc fixes, plan centred on the negotiation agent | Done | `a2c67a4`, `bc66f4c` |
| 1A | Scaffold, Convex, anonymous auth, schema, access rules, CI, deploy | Done, reviewed | `phase-1A` |
| 3 | The negotiation brain: pricing, haggle, Hindi numbers, voice commands, sim personas, seed | Done, reviewed | `phase-3` |
| 1B | Tokens, fonts, wordmark, i18n (hi/en), styleguide | Done, reviewed | `phase-1B` |
| 2A | The 20-second money shot (design gate) | Done, approved by the user | `phase-2A` |
| 8A | Live-call guards (`claimDial`), CLI-only admin, disclosure check (pulled forward) | Done, reviewed | `phase-8A` |
| 2B | Component library, phone shell, Munshi desk, mic gestures, Space push-to-talk | Done, reviewed | `phase-2B` |
| 5 / 6A / 6B engine | Sim sweep, extraction, haggle, match, ranking, place + confirm (backend) | In progress (a parallel agent, own branch) | — |
| App screens | Onboarding, Home, Settings (language switch), Confirm | Done (sim; voice and typed parsing come with Phase 4) | see log |
| App screens 2 | Choose dealers, Sweep board, Result, Placed | In progress (wired to the engine branch) | — |
| 4 | Real voice: recorder, Sarvam STT, Gemini parse, read-back TTS | Waiting for keys (see §6) | — |
| 8B / 8C | Bolna dial, webhooks, report_quote; recordings and retention | Later (needs a Bolna account) | — |
| Team test | Real AI calls to teammates' verified phones | Later | — |
| 1C, 7, 9, 10 | Landing and waitlist; sandbox and presenter; hardening; go-live | Later | — |

## 4. Session log (what happened, newest first)

### 17 Nov 2026
- **The user asked for:**
  - a full Hindi ⇄ English switch in Settings;
  - this living document;
  - regular checks of the design direction against the target audience;
  - more parallel agents, for speed without losing quality.
- **Phase 2B review fixed and tagged (`phase-2B`).**
  - Mic robustness:
    - each take has an id;
    - a second tap can't overlap a take that is still stopping;
    - the mic is released on unmount and on Esc;
    - only the finger that started the take drives it;
    - the cap and the no-speech timer start once the mic is really open.
  - Desk: a locked take shows रद्द and a send button in the dock.
  - The drawer under 1280 px is a labelled modal dialog: focus goes to Close, Tab stays inside, and focus returns to the row.
  - The locked phone sheet is modal, with focus on रद्द.
  - The ledger is an ARIA grid with one tab stop.
  - The scrubber has a visible focus ring.
  - ⌘K works on any keyboard layout; the hint reads "Ctrl K" off a Mac.
  - The DEMO stamp is now 14 px; scrims are documented in DESIGN §7.
- **The real app, first slice (sim, works end to end up to choosing dealers):**
  - **Onboarding** in three steps: language, name with privacy and consent, site. The anonymous session now starts at the consent tap. Every new contractor gets the default sim dealer book, so the full flow works at once.
  - **Home** (as `Main.html`): greeting, site, the "ऐसे बोलिए" example with Listen and "इसी से शुरू कीजिए" (the demo order as a draft), the running-sweep banner and recent orders.
  - **Settings:**
    - **language (हिंदी ⇄ English)**, switching the whole app; the choice is saved on the profile and in the cookie the server reads;
    - sounds, the spoken result and single-key shortcuts, saved per device;
    - the site, the demo-mode note and privacy.
  - **Confirm** (as `Confirm.html`): what was heard, item cards with tier chips (remembered per contractor), sheets for "by when" and credit, a read-back spoken by the browser, and "हाँ, मोलभाव शुरू कीजिए".
  - The language toggle is also in the phone top bar. The desk has the rail and the Bahi list of recent orders.
  - Until Phase 4 the mic and the typed composer say honestly that voice orders are coming soon.
  - Verified in a browser at 360 and 1440 px, in hi and en: no overflow; the whole path from onboarding to confirm works.
- **In progress:**
  - A parallel agent builds the sim call engine (Phases 5, 6A and 6B backend) on its own branch.
  - The real app screens are being built against the schema contract (ARCHITECTURE §4).

### 15–16 Nov 2026
- **Setup and plan:**
  - Set up the Mac, GitHub, Convex (dev in the US, prod in the EU), Vercel and CI.
  - Reviewed every doc and recorded changes as DECISIONS §R (R1–R18).
  - The plan now centres on the negotiation agent.
- **Phases built and reviewed:**
  - 1A (secure backend skeleton).
  - 3 (the brain, which lands on the exact TEAM_TEST numbers: winner ₹1,98,830, saved ₹5,470).
  - 1B (design system).
  - 2A (money shot). The user approved it, then asked for the bottom showcase fix. That pass also made yellow mean only "the winner" and turned the DEMO watermark into the mockup's corner stamp.
  - 8A (live-call guards), pulled forward while 2A was in review. A red team and a correctness review found and fixed S5 false passes, trusted round labels and leaky refusal codes.
- 2B was built: every component in hi and en, the phone shell and the Munshi desk at 1024, 1280 and 1536 px.

## 4b. Design direction inspections (repeated at each milestone)

### 17 Nov 2026: who it's for, and does the design fit them?

**The user:** a thekedar in Jaipur, 30–55. Hindi first; reads Devanagari and some Roman Hindi, little English. Lives on WhatsApp. Uses a ₹10–15k Android, often outdoors at noon, sometimes with dusty hands. Trusts dealers he knows, the bahi-khata and paper parchis.

**What fits, and should stay:**
- The visual language is paper, ink and haldi (bahi-khata and parchi) with high contrast. All primary text and prices are at 7:1 or better, and buttons press into the paper. It reads in sunlight and feels like the ledger they already keep, not like a fintech app.
- Big targets everywhere: 56 px minimum, a 64 px primary button, an 88 px mic, a one-handed bottom dock. Language comes first in onboarding, as 120 px buttons.
- Hindi is the default and English is a full switch, now in Settings and the top bar. Mixed script ("dealer", "GST", "PPC") matches how they actually talk.
- Western digits with Indian grouping (₹1,98,830): the way dealers write and read rates.
- Honesty signals everywhere: DEMO badges and a stamp in sim, "हर call में बताएँगे कि ये AI है", "सिर्फ असली रेट बताया, नाम नहीं". For a buyer who fears being cheated, these build trust.
- Signature moments that mean something: the stamp when a rate lands, the red strike when a price drops, yellow only for the winner. The "₹5,470 कम" tally is the shareable proof.

**Risks to watch (with what we do about each):**
1. **Latin "match" inside Hindi** ("match कॉल", "आख़िर में match का मौका"). Most contractors say "मैच". Action: native-speaker review of every Hindi string before launch; consider "मैच".
2. **Reading load on Confirm.** Two item cards, tier questions and tiles is a lot of text for a low-literacy user. The read-back (Listen) carries it. Action: in Phase 4, play the read-back automatically after a voice order (V3), and keep tier questions to one tap.
3. **The browser's Hindi voice** varies by phone. Action: Sarvam Bulbul read-back in Phase 4 (needs the Sarvam key).
4. **Typing a name** in Devanagari on Android is slow. Roman names are accepted; speaking the name comes with Phase 4.
5. **Voice is the core promise and isn't live yet.** Until the keys arrive, Home leads with the example order, and the mic says plainly that voice is coming. No fake understanding.
6. **The desk is dense** (ledger, panel, Bahi). That suits the munshi persona; the phone stays single-column.

## 5. Key decisions to know (full list in DECISIONS.md)

- **R1:** phone agents never add numbers up; code computes every total.
- **R11:** the build order puts the negotiation agent first.
- **R12:** Claude Code does installs, sign-ins, env vars, deploys and agent setup. The founders give keys, accounts, phones, money, legal steps and design-taste reviews.
- **R17:** honesty hardening of pricing (what may win, what may be cited).
- **R18 (8A):**
  - Admin writes run only from the Convex command line.
  - Per order and dealer: 3 calls before placing, plus the confirm call and one retry.
  - Daily slots are proven through `callLog.opensSlot`.
  - Clients only ever see grouped refusal reasons.
  - Test phones must always be listed by hash.
  - Call hours stay within 9–21 IST.
- **Yellow (haldi) means the winner or "your action", and nothing else** (DESIGN §5). Every status has an icon and a word.

## 6. What we need from the founders

| Item | Why | How to get it |
|---|---|---|
| Sarvam API key | Speech-to-text and the spoken read-back (Phase 4) | dashboard.sarvam.ai → API keys → create. Paste it in chat, or ask Claude to set it from a file. |
| Gemini API key, free tier | Parsing the spoken order in development and on demo data | aistudio.google.com → Get API key |
| Gemini API key, billed | Anything real (live transcripts never go to the free tier) | A Google Cloud project with billing on, a budget alert and a daily quota → APIs → Generative Language API → key |
| `~/Downloads/demo.m4a` | The end-to-end voice test | Record the demo line from docs/DEMO.md in Voice Memos and save it to Downloads |
| A real phone for HTTPS tests | Mic and voice checks (Claude starts the tunnel) | Any Android in Chrome |
| Later: Bolna account + teammates' phone numbers | The Team test (real AI calls to teammates only) | START_HERE.md Part C5 |

## 7. Working agreements (from the founders)

- Claude does everything it can itself and asks only for what only the founders can give. Passwords are typed into macOS dialogs, never into chat.
- Claude opens the pages itself, checks them at phone and desk sizes against the mockups, and fixes what it finds before reporting. It proceeds without asking permission for routine work.
- Still off-limits without an explicit go-ahead at that moment:
  - placing any live call;
  - turning on live calls or changing production live-call settings;
  - spending money;
  - buying a number;
  - anything legally binding.
- Every phase gets an independent review by agents. Every review so far found real bugs.

## 8. How to run it

- **Install and check:** `pnpm install`, then `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- **App:** `pnpm dev`. **Convex:** `npx convex dev --once` after changes in `convex/`.
- **Seed demo data:** `npx convex run seed:reset`.
- **Deploy:** `npx vercel@65.16.0 deploy --prod --yes --scope ganges1`. Details are in `docs/DEPLOYMENTS.md`.
