# Molbhav: Claude Code prompts, in order

## How to use this file
**Working model (DECISIONS R12): Claude Code does the work.** It runs the installs, CLI sign-ins (you approve a device code in the browser), env vars, deploys and the Bolna agent setup. You provide accounts, keys, phones, money, legal and field work, and the design-taste reviews. Claude still never places a live call itself, never bypasses a guard, and asks before anything that spends money or is legally binding.

1. **One phase at a time:** type `/phase <id>` (for example `/phase 1A`). A new conversation per phase (⌘⇧Esc) keeps context small; CLAUDE.md loads automatically, so context carries through the docs, not the chat.
2. **Plan, then build.** Claude posts a short plan, then builds. It stops to ask only when the plan needs something only you can give: an account, a key, a phone, money, a legal step or a design call.
3. **Check, then tag.**
   - Run the panel review (`/review`, bottom of this file) **before** checking "Done when".
   - Then Claude commits, pushes and tags: `git tag phase-1A && git push --tags`.
   - The full five-reviewer panel runs after 1A, 3, 2B, 5, 6B and 8B. After the other phases, run the light version (reviewers 4 and 5 only). This saves Claude usage.
4. **No dates.** Work steadily, one phase at a time. What you provide, per phase, is in `START_HERE.md` Part C.

**Two milestones, one codebase (G8).**
- **Milestone 1 (hackathon)** ends with real AI calls proven on teammates' verified phones (`docs/TEAM_TEST.md`).
- **Milestone 2 (real dealers)** adds Phase 10 and changes settings, numbers and consent. Nothing is rebuilt.

Run the phases in this order (DECISIONS R11: the negotiation agent first; phase ids are unchanged):

| Order | Phase | What | Milestone | Gate |
|---|---|---|---|---|
| 1 | 0 | Read-through and doc fixes (no code) | 1 | Done (DECISIONS §R) |
| 2 | 1A | Scaffold, Convex, auth, schema, access rules, CI, deploy pipeline | 1 | Access tests and CI green; the skeleton deploys |
| 3 | 3 | **The negotiation brain:** pricing, haggle, numbers, commands, personas, seed | 1 | Golden tests pass |
| 4 | 1B | Tokens, fonts, wordmark, i18n, styleguide | 1 | Styleguide right at 360 and 1440 px, fonts within budget |
| 5 | 2A | The 20-second "money shot" | 1 | **Your design review on a cheap Android at noon and on a 1440 px screen** (Claude continues with non-UI work meanwhile) |
| 6 | 2B | Component library and Munshi desk shell | 1 | Styleguide matches `design/reference` |
| 7 | 4 | Voice order (mic → Confirm) | 1 | Demo line works on your phone over HTTPS in about 2.5 s |
| 8 | 5 | Dealer pick and sim sweep | 1 | The demo order: 4 calls (2 stamps, 1 "जाँच बाकी", 1 no answer) and the held match |
| 9 | 6A | Haggle, match call, result | 1 | Result screen correct for every persona |
| 10 | 6B | Place, confirm, share | 1 | Full sim flow plus Playwright |
| 11 | 8A | Live-call guards and admin (no Bolna API yet) | 1 | Guard tests pass |
| 12 | 8B | Bolna dial, webhooks, report_quote, agent sync | 1 | One AI sweep to teammates' verified phones |
| 13 | 8C | Recordings and retention | 1 | Recording plays with seeking; crons verified |
| 14 | **Team test** | `docs/TEAM_TEST.md` Runs 1–6 (you and your teammates on the phones; Claude sets up and watches the logs) | 1 | Every check passes; the run log and clips are saved |
| 15 | 1C | Landing page, waitlist, dealer opt-in, privacy | 1 | Live URL collecting sign-ups |
| 16 | 7 | Presenter, landing hero board, sandbox | 1 (`/try` optional) | Judge demo runs in `/present` |
| 17 | 9 | Hardening, demo deployment, rehearsal | 1 | Drills pass, RUNBOOK written |
| 18 | 10 | Go-live for real dealers | **2** | First live sweep to an opted-in dealer from your own number |

Phase 3 comes right after 1A because it is the negotiation itself (pure, tested logic). Phases 8A–8C come before 1C and 7 on purpose: live calls are what Milestone 1 must prove. 8A has no UI dependency and can be pulled forward any time after 3.

**Hackathon minimum, if time runs short:** 1A → 3 → 1B → 2A → 4 → 5 → 6A → 6B → 8A → 8B → Team test (Runs 1–2) → Phase 7 item 3 (`/present`) → Phase 9 items 1–2 (demo deployment, drills).
- **Skip:** 1C, 2B's desk layout, 8C and `/try`.
- **Without 8C,** download the clips from the Bolna dashboard within 24 hours and skip the recording-seek check.
- **Live calls to teammates stay in,** because they're the proof.

---

## Phase 0: Read-through (no code)

**Done on 15 Nov 2026.** Its findings and fixes are DECISIONS.md §R. Re-run it only after large doc changes.

Do `START_HERE.md` Part A (A1–A5) first. Then paste:

```
Read CLAUDE.md, every file in docs/ (DECISIONS.md first) and skim design/reference/*.html. Then, without writing any code:
1. Summarise the product, stack, hard rules and the phase plan in 12 bullets so I can check you understood.
2. List anything contradictory, unclear or risky to build, citing file and section, with your suggested fix. DECISIONS.md wins over other docs.
3. List the exact accounts, keys, installs and env vars I still need before Phase 1A, before Phase 4, and before Phase 8B.
Do not create files yet.
```

Fix any doc issues it finds, or ask it to edit the docs, before moving on.

---

## Phase 1A: Scaffold, Convex, auth, schema and access rules

```
Phase 1A of Molbhav. Read CLAUDE.md; docs/DECISIONS.md §A, §R and F1, F2, F6, F10, B1, B10, S3, S4; docs/ARCHITECTURE.md §1, §3, §4, §5, §12, §15.

Build:
1. Scaffold (F10): this is a Mac (zsh, Apple Silicon). Run `pnpm create next-app@latest` (TypeScript, App Router, Tailwind v4, ESLint, pnpm, no src dir, alias @/*) in a TEMP folder outside this repo, then merge it in without touching docs/, design/, CLAUDE.md, PROMPTS.md, START_HERE.md, README.md, .env.example or .mcp.json, and merge .gitignore rather than replacing it.
   - Next.js must be >= 16.3.6 (F6); print the installed version.
   - package.json scripts: dev, build, start, "lint": "eslint .", typecheck, test (vitest), e2e (playwright), size (size-limit).
   - next.config.ts: allowedDevOrigins: ['*.trycloudflare.com'] (phone testing through a tunnel).
   - .gitignore includes .env*.local and .venv/.
2. Routes and layouts (F1, F2):
   - app/(marketing) holds server components with no Convex client.
   - app/(product) has a layout with the Convex Auth + Convex providers.
   - proxy.ts wraps Convex Auth's Next.js middleware (it handles /api/auth; check the current @convex-dev/auth docs for Next 16's proxy). It also sets the `lang` cookie and sends `/` to `/app` only when a session cookie exists.
   - app/manifest.ts with start_url and scope /app.
   - Placeholder pages for /, /dealer and /privacy in (marketing); /app, /try, /present and /styleguide live in (product).
3. Convex (R12): sign in with `npx convex login` (show me the device code and URL to approve), create the project "molbhav" and its dev deployment without prompts (check `npx convex dev --help` for the non-interactive flags), and push with `npx convex dev --once`. Install @convex-dev/auth (Anonymous provider; run `npx @convex-dev/auth` yourself), @convex-dev/workpool and @convex-dev/rate-limiter. Write convex/schema.ts exactly as ARCHITECTURE.md §4, including the §R changes (tell me about any further change and why).
4. Security baseline (B1, B10):
   - convex/lib/access.ts with requireContractor(ctx), requireOwner(ctx, doc) and requireAdmin(ctx) (against ADMIN_USER_IDS).
   - A rule that every public query and mutation uses them.
   - Anything that costs money, dials, seeds or touches media is internal.
   - Dealer phone numbers are never returned.
   - lib/server/hash.ts: HMAC-SHA256 with HASH_SECRET for IPs and phones, behind `import "server-only"` (and the same helper in Convex).
   - convex-test tests proving that user B cannot read or change user A's order, calls or quotes; that no public function returns phoneE164; and that non-admins can't call admin functions.
5. CI (GitHub Actions): commit convex/_generated so CI can typecheck without a deployment or a deploy key. Run typecheck, lint and test. Locally, run `npx convex dev --once` after schema or function changes and before a typecheck (F10).
6. Deploy pipeline (ARCHITECTURE §15, R12), once I have a Vercel account: sign in with the Vercel CLI (device code for me), create and link the project on my personal account, set the build command `npx convex deploy --cmd 'pnpm build'`, create the Convex production deployment and its deploy key (CLI if it can; otherwise tell me exactly which dashboard button to press and where to paste), set CONVEX_DEPLOY_KEY for Production, run `npx @convex-dev/auth --prod` and set SITE_URL, then deploy the skeleton. If the Convex plan has no preview deploy keys, turn Vercel previews off. If I don't have a Vercel account yet, skip this item and say so.
7. Check the versions you installed against the docs' claims: print `next`, `convex`, `@convex-dev/auth` versions, run `pnpm audit`, and stop and ask on any mismatch with F6 (M15).

Done when: typecheck, lint and test pass locally and in CI; the access tests pass; /app creates an anonymous session (visible in the Convex dashboard under Data → users, or via `npx convex data users`); the skeleton is live on Vercel (or item 6 is reported as waiting on the account). Commit.
```

---

## Phase 1B: Tokens, fonts, wordmark, i18n and styleguide

```
Phase 1B of Molbhav. Read docs/DECISIONS.md D1–D4, F8; docs/DESIGN.md §4–§8, §14, §17, §18; open design/reference/System.html in a browser.

Build:
1. Tokens (DESIGN.md §5–§7): every colour, radius, shadow and spacing token as Tailwind v4 @theme variables in app/globals.css. Light "Din" only in the UI; dark tokens defined under [data-theme="dark"] but not exposed.
   - Initialise shadcn/ui and restyle its primitives to our tokens.
   - Add a lint check that fails on shadcn's default classes only (shadow-sm/md/lg/xl/2xl, rounded-md, ring-offset-*), so our own painted-shadow tokens stay allowed.
2. Fonts (D3): write scripts/fonts.py (Python, run as `.venv/bin/python scripts/fonts.py`). It downloads the official sources (Anek Devanagari variable, Mukta, IBM Plex Mono) and uses fonttools (instancer + pyftsubset, with brotli; I have them in .venv) to write static woff2 subsets into app/fonts/:
   - Anek 700, normal width, Devanagari + Latin;
   - Anek 800 digits only (0-9 ₹ , .) with tnum at width 125, 112 and 100 (three files, about 3 KB each), for D4's width steps;
   - Mukta 400 and 600;
   - Plex Mono 500 and 600, Latin + ₹.

   Also copy static TTFs to assets/og/ for share images. Load the fonts with next/font/local and preload only Mukta 400 and the width-125 digits file. Use the subset ranges in DESIGN.md §6. Print every file's size; the fonts requested on the first render of /app must total ≤ 250 KB (measure it; drop Plex Mono 600 first if over, R13). Commit the generated files.
3. Wordmark as an inline SVG component (ink letters, 0.08em haldi painted shadow), per DESIGN.md §4.
4. i18n (F8): lib/i18n/{hi,en}.ts with every key from DESIGN.md §14. getDict(lang) on the server, useT() on the client, `<html lang>` set on the server from the `lang` cookie. Hindi is the default.
5. lib/numbers.ts: formatINR (Intl en-IN, ₹, Indian grouping, no decimals for whole rupees), with tests.
6. /styleguide v0: colours with measured contrast ratios, the type scale in hi and en, the wordmark, radii and painted shadows. Add size-limit to CI.

Done when: /styleguide renders correctly at 360 px and 1440 px in both languages; font sizes are reported and within budget; lint passes; there are no hard-coded colours or strings outside tokens and dictionaries. Commit.
```

---

## Phase 1C: Landing page, waitlist and dealer opt-in (deploy it)

Runs after the Team test (DECISIONS R11). The phase id is kept so references still work.

**Before this phase (you):**
- The team WhatsApp Business number (for `NEXT_PUBLIC_WHATSAPP_NUMBER`).
- Line up a lawyer to read `/privacy` and the consent text before the landing link is shared publicly.

```
Phase 1C of Molbhav. Read docs/DECISIONS.md G1, G2, G5, G6, S2, S4, B10, R11, R12; docs/DESIGN.md §14, §16, §21; docs/ARCHITECTURE.md §6.13; and design/reference/Landing.html and LandingPhone.html.

Build (server components only, no Convex client on these pages):
1. Landing `/` in the G1 order:
   - hero;
   - how it works (बोलिए → मोलभाव → पक्का);
   - honest-bargaining rules, including "your dealer always gets a chance to match";
   - for dealers;
   - waitlist.

   Copy rules:
   - The hero copy is exactly per G2, including the pilot line "जयपुर पायलट: हमारी टीम आपके लिए dealers को कॉल करती है". Never claim live AI calls.
   - Do NOT render the proof band or the sandbox section yet. They appear only when real figures or /try exist.
   - The header button and CTAs open /app (complete in sim by now), with WhatsApp click-to-chat (NEXT_PUBLIC_WHATSAPP_NUMBER) beside them.
   - "How it works" describes what the team does in the pilot; AI calling is shown as "जल्द" until Stage 2 (DESIGN §21).

   For now the hero visual is a static composition of tokens and a DEMO-watermarked parchi; Phase 7 replaces it with the live fixture board. Match the reference at 360 px and 1440 px.
2. Waitlist (G5):
   - Fields: name, WhatsApp number (E.164, India), city, role, next order, `ref` from the query string, and a required consent checkbox with the DPDP notice (S4).
   - It submits through a server action that HMAC-hashes the IP and calls waitlist.join with CONVEX_SERVER_SECRET, rate-limited by the IP hash.
3. /dealer (Hindi, phone-first):
   - Explains what Molbhav is: calls are AI and recorded, AI calls for at most 2 orders a day, and "आगे कॉल मत करना" stops them at once.
   - Form: shop name, area, materials, WhatsApp number, consent to AI quote calls. It writes waitlist role "dealer" with consentAiCalls.
   - It does NOT make the number callable (S2).
4. Analytics (G6): the /api/e route plus events.track (server secret, allow-listed names only, no personal data), if 6B hasn't built them already. Fire waitlist_submit and dealer_optin now.
5. Privacy page /privacy (plain Hindi + English): what we store, where (Convex in AWS US East; Vercel; Sarvam, Gemini and Bolna as processors), for how long, recordings, erasure on request.
6. SEO: metadata and a static OG image for `/`. robots allows `/`, `/dealer` and `/privacy`, and disallows /app, /try, /p, /present and /styleguide.
7. Deploy (R12): the pipeline exists since Phase 1A. Generate CONVEX_SERVER_SECRET and HASH_SECRET if they don't exist yet (`openssl rand -hex 32`, the same value everywhere), set every env var this phase needs on Vercel and with `npx convex env set --prod` yourself, deploy, and check the production URL. Show me the list of what you set (names only, never values).

Done when: the production URL loads fast on a phone (Lighthouse mobile performance ≥ 90 on `/`), a waitlist entry and a dealer opt-in appear in the Convex production dashboard, both languages work, and nothing on the page claims AI calls are live or shows unproven numbers.
```

---

## Phase 2A: The money shot (design quality gate, D8)

```
Phase 2A of Molbhav. Read docs/DECISIONS.md D2, D4, D6, D7, D8; docs/DESIGN.md §9, §10, §11 (DealerRow, PriceStrike, Parchi, BestSoFarRibbon, SlotChecklist), §15, §16, §20; open design/reference/Sweep.html and Result.html in a browser and study them.

Build only the 20-second "money shot" at /styleguide/money-shot, with production fonts and sound. Build its pieces as presentational components in components/mb/ (props only); Phase 2B extends them rather than replacing them.
1. Four DealerRows:
   - ringing (icon wiggle only);
   - talking (timer + SlotChecklist + DEMO caption);
   - then quotes stamping in at least 250 ms apart (Stamp).
2. A haggle drop:
   - PriceStrike (3 seeded path variants);
   - the new number stamped below, with "₹X कम हुआ" in hara;
   - BestSoFarRibbon updates.
3. The winner's Parchi (radius 4, perforated bottom edge, painted ink shadow, DEMO watermark) arriving, then the savings Tally (600 ms per-digit odometer) labelled "आपके dealer के पहले रेट से".
4. Earcons via Web Audio and Android-only haptics (DESIGN.md §10), behind a sound toggle. The AudioContext is resumed on a user tap.
5. Motion: LazyMotion + m + domAnimation, and MotionConfig reducedMotion="user" (fades only when reduced).
6. Money never wraps (D4): the price hero steps its width 125 → 112 → 100, then its size 44 → 36. Show a ₹12,40,500 case at 360 px.
7. A "replay" button, and a toggle between phone width (360) and desk width (1440, the ledger row layout per DESIGN.md §19).

Done when: it plays smoothly (no visibly dropped frames) on a mid-range Android in Chrome and on a 1440 px screen, reduced motion works, and lint passes. Then STOP: I will review it outdoors at noon before we continue. List anything you think still looks generic.
```

After your review, tell Claude Code exactly what to change. Repeat until it feels right; this gate decides how the whole product feels.

---

## Phase 2B: Component library and the Munshi desk shell

```
Phase 2B of Molbhav. Read docs/DESIGN.md §11–§13, §18–§20 and DECISIONS.md V1, V6, D5, D7; open every file in design/reference/.

Build every component in DESIGN.md §11 in components/mb/ (presentational, props only; extend the 2A components, don't replace them), with every state listed. Show each state on /styleguide in hi and en:
- MicButton: V1 hybrid gestures, wired to a FAKE recorder interface in lib/client/recorder.ts (the real one comes in Phase 4; plumbing per F4);
- ListeningSheet, TranscriptCard, ItemCard, Chip, TierChips;
- PrimaryButton, SecondaryButton;
- DealerRow: all states, including "आख़िर में match का मौका" and "जाँच बाकी";
- StatusPill, SlotChecklist, StopAllButton, BestSoFarRibbon, PriceStrike, Parchi;
- ComparisonTable (frozen first column);
- CallDetail (player + transcript + "what we understood");
- ModeBadge.

Layouts, with fixture data:
1. Phone shell: a 56 px top bar, a bottom voice dock with the safe area, and sheets that stay above the keyboard.
2. Munshi desk (D5), with a 72 px icon rail:
   - 1024–1279: main column plus a 400 px overlay drawer;
   - 1280–1535: a docked 400 px call panel;
   - ≥1536: a 300 px Bahi list, main (max 840) and a 420 px panel.

   Ledger columns exactly as D5.
3. Desktop push-to-talk (V6), wired to the fake recorder:
   - Space held for 150 ms starts it, only when focus is on the body or the dock.
   - Ignored in inputs and on buttons; e.repeat and isComposing are ignored.
   - Disabled on screens with a confirm or place action.
   - Stops on blur or visibilitychange.
   - ⌘K opens the composer. A setting turns single-key shortcuts off.

Done when: /styleguide shows every component and state in both languages; the shells match design/reference at 360, 1280 and 1536 px; keyboard navigation and focus rings work; the commit message includes a self-review against DESIGN.md §15 and §16 that lists anything not yet met.
```

---

## Phase 3: Pricing, haggle, numbers, commands and seed (the negotiation brain)

Runs right after 1A (DECISIONS R11). Nothing to provide: it needs no keys.

```
Phase 3 of Molbhav. Read docs/ARCHITECTURE.md §6.6, §9, §10; docs/PRODUCT.md §9; DECISIONS.md P1–P4, P7, C3, C4, B10 and §R (R1, R3, R5, R6, R7, R10, R13).

Build pure TypeScript in lib/ (no Convex imports), with tests next to each file:
1. lib/config.ts, all clearly marked as fixture data:
   - GST_RATE;
   - call hours and limits;
   - price-band seeds per city and material (steel per kg, cement per bag), with an updatedAt date; the live bands are the Convex priceBands table (R13);
   - BRAND_TIERS per city (steel: branded/local_isi; cement: branded/any);
   - CITY_AREAS per city (Jaipur: Mansarovar, Jagatpura, Vaishali Nagar, Malviya Nagar, Sanganer, Sitapura, Tonk Road, Ajmer Road, Jhotwara, Vidhyadhar Nagar, Raja Park, C-Scheme, and more), each with hi and en names (R7);
   - DELIVER_BY: the six deliverBy values with their hi/en phrases and an order for the tie-break.
2. lib/pricing.ts, exactly per §9:
   - money in integer paise, with unit normalisation; GST rounded to the paisa per line; the total rounded to the rupee once (R5);
   - per-line gstMode;
   - the stated all-in rule and lump_sum_mismatch (R1), with totalSource;
   - unknown delivery or unloading is flagged, never assumed free, and makes the quote not comparable (R6);
   - every flag, then comparable and citable;
   - rank by total within the tier (table order); the winner is the most credit days among quotes within 0.5% of the cheapest, then earlier deliveryBy, then lower total; lib/haggle's #1 and #2 follow the rank;
   - savings vs the regular dealer's firstTotal, else vs the median of comparable quote-round totals (lower middle for an even count), never vs the max; none with fewer than 2 comparable quotes and no regular-dealer rate.

   lib/pricing.test.ts covers every golden case in §9 (A, B, C, D, rank, savings 3,690, median fallback 140, tie flips, haggle inherit, haggle per item, haggle all-in only, all-in agrees, all-in disagrees, unloading unknown, median even count 1,780, rounding 2,01,040, not citable, kachcha) plus edge cases you think of.
3. lib/haggle.ts:
   - Input: the ranked quotes and the calls so far.
   - Output, in order: haggle #2 citing #1; then #1 citing #2's new total if it beat #1 (max 2 haggles); then the match call for the held regular dealer; then done.
   - Never cite a higher number or a non-citable quote.

   With tests.
4. lib/numbers.ts additions, with tests:
   - exact Hindi spoken money both ways ("दो लाख छह सौ दस रुपये" ⇄ 200610), plus Roman Hindi;
   - Hindi quantity words (sava, dedh, dhai, saade, paune, sau, hazaar, lakh);
   - a parser that finds rates in dealer turns, as digits or words (for rate_not_in_transcript);
   - the order line spoken for call variables, built in code.
5. lib/commands.ts (V4): a local grammar for voice commands (हाँ / शुरू कीजिए / confirm करो / <dealer> को confirm करो / रद्द / रुकिए). Any negation (मत, नहीं, रुकिए, बाद में) means no action. Tests include "अभी confirm मत करो" and "नहीं, रुकिए".
6. convex/sim/personas.ts: the personas in §10. For the demo order, perkg_gst_extra (Agarwal), perton_gst_incl (Om Sai), whatsapp_dodger (Rathore) and regular_match (Shree Balaji) use exactly the numbers of docs/TEAM_TEST.md Cards A–D, including their haggle and match drops, so sim and live show the same totals (winner ₹1,98,830; regular dealer ₹2,04,300 → ₹2,00,100). Om Sai's haggle is said as one all-in figure in sim ("सब मिलाके एक लाख निन्यानवे हज़ार चार सौ"), so the stated-total path is exercised.
7. convex/seed.ts (internal, CLI only):
   - demo contractor "Ramesh Yadav" (hi);
   - sites Mansarovar (default) and Jagatpura, from CITY_AREAS;
   - 9 fictional DEMO dealers across Jaipur, one per persona in §10, with isDemo true and invalid numbers +9100000000NN (Indian mobiles start with 6–9, so these can never ring anyone); a seed flag can force reprice_at_confirm on whichever dealer wins;
   - the dealer book: Agarwal, Om Sai, Rathore and Gupta (no_answer) as "saved", and Shree Balaji linked as the regular dealer (ARCHITECTURE §10);
   - priceBands rows for Jaipur from the config seeds, with updatedAt = now.

   Also admin.resetDemo (requireAdmin; touches demo rows only).
8. A golden-number test that runs the demo order end to end through lib/ only (quote round → lib/haggle plan → haggle quotes → match → rank → savings) and lands on: winner ₹1,98,830, "₹5,470 कम · आपके dealer के पहले रेट से", regular dealer ₹2,04,300 → ₹2,00,100 (₹4,200 drop, ₹1,270 more).

Done when: all tests pass and `npx convex run seed:reset` populates the dev deployment (Claude runs it).
```

---

## Phase 4: Voice order (mic to Confirm)

**Before this phase (you):**
- Give Claude a Sarvam API key, a free Gemini API key (Google AI Studio) and a billed Gemini key (a Google Cloud project with billing, a budget alert and a daily quota). Claude puts them in `.env.local` and Vercel, picks the current model ids and a Hindi speaker from the vendors' docs, and generates `HASH_SECRET`.
- Record the demo line in Voice Memos and drop it in `~/Downloads/demo.m4a`; Claude converts it to `e2e/demo.wav` (16 kHz mono).
- Have a real phone ready for the HTTPS test (Claude starts the tunnel).

```
Phase 4 of Molbhav. Read docs/DESIGN.md §12.1–§12.3, §13, §20; docs/ARCHITECTURE.md §6.1, §7 (Sarvam, Gemini), §8.1; DECISIONS.md V1–V5, V7, F3, F4, F9, S3, S4, R7, R8, R10. Use the Sarvam speech-to-text skill and the sarvam-docs MCP server to confirm the current endpoint, headers, model ids and limits before writing the integration.

Build:
1. The real recorder (lib/client/recorder.ts):
   - MIME probe webm/opus → webm → mp4, 24 kbps mono, a level meter;
   - 25 s cap; tracks stopped after every take; clips with under 0.6 s of speech discarded;
   - silence rules per V1 (3 s auto-send in locked mode, 5 s with no speech);
   - the earcon and the red ring start on MediaRecorder start (V2).

   Plug it into MicButton and ListeningSheet.
2. A mic permission primer card that asks from its own button, never cold, with specific errors per V5.
3. /api/voice/order (F3):
   - Node runtime, preferredRegion bom1;
   - Vercel BotID: `pnpm i botid`; initBotId in instrumentation-client.ts protecting POST /api/voice/order and POST /api/tts; checkBotId() first in both routes (403 when isBot; no keys needed; always passes in local dev);
   - checks the Convex Auth token, a per-user and per-IP-hash rate limit, and a global daily ₹ cap (VOICE_DAILY_INR_CAP, shared with /api/tts);
   - Sarvam STT (mode codemix), streaming the transcript to the client first;
   - Gemini parse with the §8.1 schema (nullable, never null in type or enum), lowest thinking level, zod validation, null → undefined;
   - then orders.createDraft as the user.

   Key choice: in production use GEMINI_API_KEY_BILLED only; in development fall back to the free GEMINI_API_KEY (team test speech only). Audio is never stored. Log the timing of each step.
4. Onboarding (§12.1, max 3 steps, with a consent notice), Home (§12.2) and Confirm (§12.3):
   - the site area picked from CITY_AREAS (speech matched in code, confirmed with a chip; R7);
   - editable chips and TierChips (remembered per contractor): steel asked if unspoken, cement pre-selected (R8), "दोनों" asks which tier (R10);
   - the delivery time as a deliverBy chip (R7);
   - missing fields asked one at a time with 2–4 chips;
   - suta always asked with mm chips (P7);
   - a typed fallback that skips STT.
5. The read-back (V3):
   - POST /api/tts with { draftId } (bom1): calls checkBotId(), checks auth and ownership, rate-limits, builds the text ON THE SERVER from the draft (at most 3 sentences, ending "सही हो तो शुरू कीजिए।"), calls Bulbul v4 Flash (confirm the model id and a Hindi speaker in the docs) and returns audio.
   - No endpoint accepts arbitrary text.
   - Falls back to browser speechSynthesis hi-IN. Interruptible. Mute persists (V7).
6. Voice "हाँ, शुरू कीजिए" goes through lib/commands.ts (negation-safe).
7. evals/parse.golden.json with 20 utterances (Hinglish, Devanagari, English, suta, dedh/dhai/saade/sava, brands and tiers, a missing grade, a negation), and `pnpm eval:parse`.

Done when: on my phone over HTTPS (a tunnel or Vercel preview, never a LAN IP), I can hold or tap the mic, say the demo order from docs/DEMO.md, and see the transcript in about 1.5 s and the correct Confirm screen in about 2.5 s after release; eval:parse passes ≥ 18/20. Report per-step latency from 5 runs.
```

---

## Phase 5: Dealer pick and the sim sweep

**Before this phase:** nothing from you. Claude sets the dev Convex env itself: `GEMINI_API_KEY`, `GEMINI_MODEL`, `SIM_PACE=demo`, `SIM_EXTRACT=groundtruth` and `HASH_SECRET` (the same value as `.env.local`).

```
Phase 5 of Molbhav. Read docs/ARCHITECTURE.md §6.2, §6.3, §6.4, §6.5, §8.2, §9, §10; docs/DESIGN.md §12.4, §12.5, §19; DECISIONS.md P1, P4, B4, B5, D5, D7, C4, S5, R1, R2, R4.

Build:
1. Choose dealers (§12.4):
   - dealers in the site's city, same area first; the contractor's dealer book ("saved") on by default, 4–6 (R13);
   - the regular dealer pinned as "आख़िर में match का मौका", with the toggle "पहले भी पूछिए" (askFirst);
   - the footer disclosure line.
2. orders.startSweep (sim): checks ownership and that every item has a quantity, unit and tier; increments roundSeq; creates calls (not for the held regular dealer unless askFirst).
3. convex/pools.ts with three workpools:
   - dial: parallelism 1, 0 retries (claimDial's live-slot count is what limits concurrent calls, R2);
   - llm: 4, with 3 retries and backoff;
   - media: 2, with 3 retries.

   Every job carries (orderId, roundSeq) and exits if stale.
4. sim.runCall (internal):
   - a deterministic script per persona, seeded by hash(persona, items, round), written ONCE as callEvents with atMs;
   - the client reveals lines by server time; SIM_PACE is demo or realistic;
   - it writes the transcript in Bolna's "assistant: … / user: …" format, then enqueues the SAME extraction job live will use;
   - with SIM_EXTRACT=groundtruth, that job takes the persona's ground-truth quote instead of calling Gemini, but still runs every code check.
5. Extraction (§6.5):
   - Gemini with the §8.2 schema, through extractCache;
   - then the code checks: the disclosure ("AI" and "रिकॉर्ड") appears in the assistant turns before the dealer's first rate (S5); every rate and any stated all-in figure found in a dealer turn; a dealer "हाँ" after the read-back sets readBackConfirmed;
   - then lib/pricing.ts, calls.outcome (R4) and orders.advance;
   - if extraction fails after retries: "रेट समझ नहीं आया · रिकॉर्डिंग सुनिए".
6. Per-call deadlines and a watchdog (B5). The round advances when 3 citable quotes are in or every call has finished. "सब कॉल रोकिए" stops everything and shows what we have.
7. The sweep board (§12.5):
   - realtime rows with Ring, Talk and Stamp;
   - SlotChecklist and the elapsed timer in both modes; captions labelled DEMO, in sim only (D7);
   - BestSoFarRibbon;
   - non-comparable quotes shown as "जाँच बाकी" (they can never win);
   - earcons and haptics on stamp.

   It keeps running if I leave and recovers on return. On desktop it is the ledger table with the docked call panel (D5).
8. evals/extract.golden.json with 10 transcripts (8 generated from personas, plus one per-quintal quote with GST unclear, and a dealer who corrects his own number), and `pnpm eval:extract` (always uses Gemini, i.e. SIM_EXTRACT=llm).

Done when:
- With SIM_PACE=demo, from Confirm, the demo order's default selection rings 4 dealers in about 1 minute (2–4 minutes realistic): Agarwal ₹2,00,610 and Om Sai ₹2,00,750 stamp, Rathore shows "जाँच बाकी", Gupta doesn't answer, and Shree Balaji is held for the match call.
- With the other personas switched on, the cement_only, kachcha_lowball and callback_later personas behave correctly.
- eval:extract ≥ 9/10.
- A normal sim sweep makes zero LLM calls.
```

---

## Phase 6A: Haggle, match call and result

**Before this phase:** nothing from you. Claude sets `SARVAM_API_KEY`, `SARVAM_TTS_MODEL` and `SARVAM_TTS_SPEAKER` in the dev Convex env (for the spoken result).

```
Phase 6A of Molbhav. Read docs/ARCHITECTURE.md §6.6, §6.8, §9; docs/CALL_SCRIPT.md (Agents 2–3 and the dealer situations); docs/DESIGN.md §12.6, §12.7; DECISIONS.md P2, C3, D6, V7, R1, R5; design/reference/Result.html.

Build:
1. Haggle driven by lib/haggle.ts:
   - a haggle or match-final quote inherits the dealer's earlier quote and overrides only what changed (ARCHITECTURE.md §6.6 item 2a), with the golden test "Haggle inherit";
   - sim personas react to the exact cited total;
   - PriceStrike on drops;
   - the honesty line under the banner;
   - skipped with fewer than 2 citable quotes ("सिर्फ 1 रेट मिला").
2. The match call for the held regular dealer: his firstTotal is recorded before any number is cited, then the best citable total is cited. Uses the regular_match persona.
3. Result (§12.7):
   - the winner's Parchi;
   - Tally "₹X कम · आपके dealer के पहले रेट से", or "बीच वाले रेट से" (labelled);
   - the card "आपके dealer ने ₹Y कम किया" with an "उन्हीं से लीजिए" option;
   - "आपके dealer ही सबसे सस्ते" when true (no tally);
   - ComparisonTable for comparable quotes, and a separate list for non-comparable ones;
   - CallDetail per call;
   - the spoken summary (tts.summary, 2–3 sentences, muted if the user turned it off).

Done when: for each persona mix in §10, the result screen shows the right winner, saving basis and regular-dealer card in hi and en, on phone and desk; the totals match lib/pricing.ts.
```

---

## Phase 6B: Place, confirm and share

```
Phase 6B of Molbhav. Read docs/ARCHITECTURE.md §6.7, §6.10; docs/CALL_SCRIPT.md (Agent 4); docs/DESIGN.md §12.8, §21.3; DECISIONS.md C5, G4, F5, V4; design/reference/SharedParchi.html.

Build:
1. Place (§6.7):
   - orders.place with expectedQuoteId;
   - an undo window (UNDO_WINDOW_SEC; 5 s at demo pace) with "रद्द";
   - a confirm call (sim) that relays approved terms only;
   - reprice_at_confirm → terms_changed → back to Result with the runner-up highlighted;
   - voice confirm through lib/commands.ts.
2. Share (G4, F5):
   - share.create with mode full / savings / munshi, and a revocable publicId.
   - /p/[publicId]: noindex. It never shows the site, date, phone numbers, recordings or losing prices. It credits "रमेश जी ने ₹X बचाए", with a DEMO watermark when it comes from sim.
   - /p/[publicId]/opengraph-image with @vercel/og pinned to exactly 1.0.3, on Node, with the static TTFs. Check that Hindi conjuncts (e.g. "क्ष", "द्ध", "श्र") render correctly.
   - Prefetch the PNG when Result settles. Call navigator.share({ files }) inside the tap; fall back to a wa.me link.
   - Fire parchi_share, parchi_open and parchi_cta (build the /api/e route and events.track here: server secret, allow-listed names only, no personal data; G6).

Done when:
- The full sim flow from mic to Placed works in hi and en in under 3 minutes at demo pace, on phone and desk.
- The Playwright test passes: Pixel 7 profile, fake audio from e2e/demo.wav. Speak → the default demo dealers → expected winner (₹1,98,830) → place → the share link shows no site, date or phone.
```

---

## Phase 7: Sandbox, landing hero board and presenter

**Before this phase (you):**
- Give Claude a billed Gemini key from a second Google Cloud project, for the sandbox (its own budget alert and quota).
- Open `/app` on the presenter laptop once, so Claude can add that session's user id to `ADMIN_USER_IDS` (`START_HERE.md` C2).

```
Phase 7 of Molbhav. Read docs/ARCHITECTURE.md §6.9, §6.12; docs/DESIGN.md §12.9, §21; DECISIONS.md G1–G3, G7, B8; docs/DEMO.md; design/reference/Present.html and Landing.html.

Build:
1. /try sandbox (G3):
   - Sample-order chips come first; the mic sits behind a tap.
   - /api/voice/order?sandbox=1 calls checkBotId() (Vercel BotID, already set up in Phase 4) and refuses bots. The request is a fetch from the /try page.
   - 15 s cap. Limits: 3/h per device, 10/h per IP hash, 500/day globally.
   - The daily ₹ kill switch is SANDBOX_DAILY_INR_CAP. It uses GEMINI_API_KEY_SANDBOX. No audio is stored.
   - sandbox.createDraft (server secret) creates kind "sandbox", sim only, with expiresAt 24 h, plus a cron that deletes expired orders.
   - It never creates /p links or live sweeps.
   - The parchi is watermarked "DEMO · काल्पनिक dealers" with no savings tally, and ends with "अपने असली dealers का रेट चाहिए?" + WhatsApp join.
   - Fire try_start and try_voice.
2. Landing:
   - Replace the static hero with the live sweep board built from the real components on client-side fixtures (no Convex, no network), looping, paused when off-screen, reduced-motion safe.
   - Add the sandbox section, linking to /try (the landing page has no Convex client).
   - Add the proof band ONLY if I give you real spread-test figures and a consented recording; otherwise leave it out.
   - Keep Lighthouse mobile ≥ 90 on `/`.
3. /present (B8, §12.9):
   - An iframe of /app?embed=1 (allow="microphone; autoplay") signed in as the demo contractor via admin.claimDemoContractor (requireAdmin, only when DEMO_DEPLOYMENT=true, isDemo rows only; it re-points the seeded demo contractor to the caller's session; no public identity switch).
   - On the right: the pipeline lights (Mic → STT → Samjha → Calls → Rates → Molbhav → Match → Result) from that session's orders only, the event log (Plex Mono, newest first) and the stats.
   - Cost and readiness views need the admin role.
   - "Reset demo" (admin.resetDemo).
4. A canned parse for the exact demo line, used only when STT or Gemini fails during a demo (clearly logged).

Done when: the docs/DEMO.md script runs start to finish in /present in under 3 minutes in sim mode, and the sandbox works on a phone with all its limits enforced on the server (show me the tests).
```

---

## Phase 8A: Live-call guards and admin (no Bolna API calls yet)

```
Phase 8A of Molbhav. Read docs/DECISIONS.md §A, B2, B9, B10, S1, S2, S5, C1, R2, R3, R4; docs/ARCHITECTURE.md §5, §6.2, §6.3, §11; docs/CALL_SCRIPT.md (hard rules and welcomes).

Build (no network calls to Bolna in this phase):
1. internal.calls.claimDial (B2):
   - checks every guard in ARCHITECTURE.md §11 atomically, including trial mode (B9), the number and demo checks (B10) and the per-order dealer limits from callLog (R3); guard 10 is built now and fails closed: opted_in dealers are refused unless A2P_DECLARED=true and LIVE_STAGE allows;
   - returns ok, refuse (with a reason code the UI can show in hi and en) or wait (no free live slot, R2);
   - on ok: writes the callLog row (orderId, callId) and moves queued → dialing in the same transaction;
   - MAX_LIVE_SWEEPS_PER_HOUR is checked in orders.startSweep for live sweeps.

   Unit-test every guard, both with trial mode on and off, plus: a full slot waits and the call dials once a slot frees; the queue deadline cancels with queue_timeout; a placed order's confirm call passes the dealer limits; two parallel claimDial calls for the last slot let exactly one through. settings.liveAvailable returns only a boolean and a reason code.
2. Admin (S1, S2), using requireAdmin, with every change written to auditLog:
   - admin.verifyContractor, which locks name and phone at verification;
   - admin.addDealer (consent test_ok or opted_in; stores phoneE164 and the HMAC phoneHash; re-adding an opted_out number needs a fresh consent note and is logged);
   - admin.setRegularDealer(contractorId, dealerId): writes the contractorDealers relation "regular", one per contractor, logged;
   - admin.optOutDealer;
   - per-contractor daily caps;
   - a small /app/admin page for the founders, which also prints a phone's HMAC hash for TEST_PHONE_HASHES.
3. The LIVE toggle on Choose dealers, shown only when liveAvailable is true; only callable dealers can be selected.
4. A disclosure test: every welcome in CALL_SCRIPT.md has "AI" and "रिकॉर्ड" in its first sentence. S5 is enforced in extraction (assistant turns before the dealer's first rate).

Done when: all guard tests pass; with LIVE_CALLS_ENABLED=false nothing can reach a dial; the admin page works for admins only.
```

---

## Phase 8B: Bolna dial, webhooks and report_quote

**Before this phase (you):** a Bolna account on the trial (no business number needed; **don't buy a number**), its API key for Claude, and each teammate's phone verified in the Bolna dashboard. Claude does the rest of `START_HERE.md` C5 (admin entries, hashes, env vars, agents). `LIVE_CALLS_ENABLED=true` (dev only) comes after the agents are synced and you say go.

```
Phase 8B of Molbhav. Read docs/DECISIONS.md B2, B3, B5, B7, C1–C8, R1, R2, R4, R12; docs/ARCHITECTURE.md §6.2, §6.3, §7 (Bolna), §11, §13; docs/CALL_SCRIPT.md fully. Use the installed Bolna skills and Bolna's docs (https://www.bolna.ai/docs/AGENTS.md) to confirm the request, webhook, agent and custom-function shapes before coding.

Build:
1. convex/bolna.ts (internal):
   - dial: POST /call with the agent for the round, the from number (omitted in trial mode), and user_data built in code (molbhav_call_id, no free text, S3);
   - fetchExecution and stopCall;
   - a lookup in GET /v2/agent/{id}/executions before ANY retry;
   - the watchdog per call deadline (B5).
2. The webhook (B3):
   - POST /bolna/webhook checks the x-molbhav-secret header.
   - ingest dedupes on executionId + status, maps by providerExecutionId or recipient_data.molbhav_call_id, and returns 200 in under 1 s.
   - process re-fetches, then maps and applies the status per the ARCHITECTURE §6.3 table only if its rank is higher. "completed" is the done signal. Any final status kicks the waiting dial jobs (R2).
   - It stores the transcript, duration, costUsdCents (total_cost is US cents) and the termination reason, then enqueues the media and llm jobs.
   - "rescheduled" should never arrive (Bolna-side retries are off): mark cancelled, stop it, alert. statusRank never decreases. Late webhooks after "ready" never change the ranking.
   - Retries (no_answer after 3 minutes; callback_requested at the time the dealer gave, if within 30 minutes and the round is open, P8) are new call rows through claimDial, within the per-order limit (R3).
3. POST /bolna/report-quote (C8): verify the secret, update calls.slots and calls.provisionalTotal, reply in under 100 ms. For the Match agent's "first" stage, compute his first total from the rates he said in lib/pricing.ts and reply cite: true|false (his first total vs the best citable total; false if it can't be computed, R1).
4. `pnpm bolna:check`: verifies the key, prints the wallet and concurrency from GET /user/me, lists the four agents and their webhook URLs and headers. Read-only.
5. `pnpm bolna:sync` (R12): bolna/agents/{quote,haggle,match,confirm}.json built from CALL_SCRIPT.md (welcomes, prompts, settings, report_quote pointing at https://<deployment>.convex.site/bolna/report-quote, the webhook https://<deployment>.convex.site/bolna/webhook with the x-molbhav-secret header, retries off, no other tools). It creates or updates the four agents through Bolna's agent API, prints their ids, and never dials. Then set the four agent-id env vars yourself. Also write docs/BOLNA_SETUP.md: what bolna:sync does, how to check the agents in the dashboard, and the manual fallback if the API refuses something.
6. Set the dev Convex env yourself: BOLNA_API_KEY, BOLNA_WEBHOOK_SECRET (generate it), BOLNA_TRIAL=true, TEST_PHONE_HASHES (from the admin page), GEMINI_API_KEY_BILLED, REC_TOKEN_SECRET (generate it). Show me the names you set, never the values.

Do not place any real call yourself. When the code is ready, ask me before setting LIVE_CALLS_ENABLED=true on dev, then tell me exactly how to start the first test sweep to two verified teammate phones from the app, watch the Convex logs while it runs, and know how to roll back (LIVE_CALLS_ENABLED=false).

Done when:
- A live sweep to 2 verified teammate phones completes (docs/TEAM_TEST.md Run 1), and webhooks update the board in real time.
- The quote is extracted from the real transcript with the billed Gemini key.
- A duplicated and an out-of-order webhook change nothing.
- Killing the dial job mid-way does not double-dial.
```

---

## Phase 8C: Recordings and retention

```
Phase 8C of Molbhav. Read docs/DECISIONS.md B6, S4; docs/ARCHITECTURE.md §6.11 and the crons.

Build:
- media.copyRecording into Convex storage;
- media.recToken (ownership-checked) issues a 10-minute HMAC token;
- GET /rec/:callId?t= streams with Range/206;
- a 30-day deletion cron for recordings;
- recordings of opted-out dealers are deleted at once;
- callLog is kept for 1 year with HMAC hashes only.

Done when: the recording of a live test call plays with seeking in CallDetail on a phone, an expired token is refused, and the crons are verified with a test.
```

After the first real calls:

```
Copy the transcripts of our live calls into evals/extract.golden.json after replacing dealer names, numbers and personal details with placeholders. I will check the expected outputs. Run eval:extract with the billed Gemini key only. Then suggest changes to the agent prompts in docs/CALL_SCRIPT.md based on where dealers were confused, and report the go/no-go numbers from DECISIONS.md §D so far. Show me the diff before applying.
```

---

## Phase 9: Hardening, demo deployment and rehearsal

```
Phase 9 of Molbhav. Read docs/ARCHITECTURE.md §13–§15, docs/DEMO.md, DECISIONS.md G7, S4, B8.

1. Set up the deployments yourself (R12) and write docs/DEPLOYMENTS.md describing them:
   - Convex dev and prod.
   - A separate demo setup: a second Convex project "molbhav-demo" plus a second Vercel project on the same repo with its own CONVEX_DEPLOY_KEY. Run the Convex Auth setup there, seed it, set ADMIN_USER_IDS and tell me when to run admin.claimDemoContractor from the presenter laptop.
   - Clones of the four Bolna agents pointing at the demo webhook (`pnpm bolna:sync --target demo`), if the demo includes an AI call (each agent has one webhook).

   Live calls stay off in production until ARCHITECTURE.md §11 can pass for real. List every env var per deployment.
2. Failure drills, each with a test or a written manual check:
   - Sarvam down (typed fallback, browser TTS);
   - Gemini 429 (workpool backoff, a friendly message);
   - a webhook twice and out of order;
   - a call stuck in ringing (the watchdog closes it);
   - the phone network drops mid-sweep (state recovers);
   - the venue Wi-Fi dies (phone hotspot);
   - STT fails on the demo line (canned parse).
3. Rate limits on voice, startSweep and place per contractor; daily spend caps; the kill switches documented.
4. DPDP: erasure on request (an admin action that deletes a contractor's orders, calls, quotes and recordings), retention crons verified, privacy page accurate.
5. docs/RUNBOOK.md:
   - how to start, reset and switch between sim and live;
   - how to check the Bolna wallet;
   - what to do when each service fails;
   - where the backup video is.
6. Run the full test suite, both evals, Playwright and size-limit, and report the results.

Done when: the production URL runs the full sim flow on my phone, the demo deployment is seeded and isolated, RUNBOOK.md and DEPLOYMENTS.md exist, and every drill passed or has a documented workaround.
```

---

## Phase 10: Go-live for real dealers (Milestone 2)

**Before this phase (you):** `START_HERE.md` Part M2, steps M2.1–M2.5:
- the business registered;
- a Plivo or Exotel number connected in Bolna;
- written confirmation of the A2P declaration and the call category;
- the lawyer's review of `/privacy`;
- the Bolna plan upgraded from trial.

```
Phase 10 of Molbhav: go-live for real dealers. Read docs/DECISIONS.md §A, §D, G8, S1, S2, S4, B9; docs/ARCHITECTURE.md §5, §11, §13; docs/CALL_SCRIPT.md; docs/TEAM_TEST.md (what already passed).

The call code does not change. Build only what real dealers and real contractors need:
1. Telephony:
   - BOLNA_FROM_NUMBER (our Plivo/Exotel number connected in Bolna) is used for all agents when BOLNA_TRIAL=false.
   - `pnpm bolna:check` also shows the connected provider and number, and fails if the agents' from-number differs.
   - Extend guard 10 (built in 8A): dealers with consent opted_in need A2P_DECLARED=true (set by hand only after written confirmation from the provider).
2. Live stages (DECISIONS §D):
   - LIVE_STAGE=1: only admins can start live sweeps, and at most STAGE1_MAX_DEALERS (5) opted-in dealers marked stage1 can be dialled.
   - LIVE_STAGE=2: every opted-in dealer, for verified contractors.
3. Consent evidence: admin.addDealer with consent opted_in requires a consentRef: the dealer's /dealer form row (digital consent with timestamp) or the recording id of the admin's confirmation call. It is shown in /app/admin. Opt-out works from every channel at once: on a call, on the inbound line, and in admin (from a WhatsApp "STOP").
4. Inbound line: a fifth Bolna agent, "Inbound", on our number. Draft its prompt in docs/CALL_SCRIPT.md first and show me before building. It:
   - discloses AI and recording;
   - looks up the caller by phone hash;
   - offers: stop all calls (opt out at once); leave a rate for an open order (stored as a callback quote, needing the read-back, P8); or leave a message for the team (sent to the team by webhook).
5. Metrics: admin.metrics shows the §D bars by stage, with pass or fail:
   - stay-on rate after the disclosure;
   - valid comparable quotes per dial;
   - the share of haggles that lowered the price, and the median drop;
   - cost per order (costUsdCents).
6. Durable sign-in: real contractors and founders sign in with Google through Convex Auth (so ADMIN_USER_IDS stays stable). Anonymous sign-in stays for /try. Phone OTP comes later, once SMS DLT registration is done.
7. `pnpm golive:check`: prints every production guard and setting with OK/FAIL:
   - LIVE_CALLS_ENABLED, BOLNA_TRIAL=false, BOLNA_FROM_NUMBER, A2P_DECLARED, LIVE_STAGE;
   - webhooks reachable;
   - retention crons scheduled;
   - admins set;
   - the privacy page version.

Done when:
- golive:check is all OK in production.
- With LIVE_STAGE=1 a live sweep to one opted-in dealer completes from our own number.
- A call to our number reaches the Inbound agent, and its opt-out works.
- /app/admin shows the metrics.
```

---

## Utility prompts (use anytime)

**Panel review: run at the end of every phase, before your own check.**
- After 1A, 3, 2B, 5, 6B and 8B: the full panel.
- After the other phases: reviewers 4 and 5 only.
```
Review this phase's work: `git diff <previous phase tag>..HEAD` (the first phase: everything). Use 5 subagents in parallel. Each is an independent expert who has not seen the others' notes:
1. Voice UX: mic, read-back, Hindi naturalness, errors, commands.
2. Visual and interaction: tokens, type, motion, layout at 360/1280/1536, against design/reference.
3. Frontend: Next.js, performance budgets, accessibility, PWA, i18n.
4. Backend and security: Convex auth/ownership, internal functions, idempotency, guards, secrets.
5. Red team: abuse, privacy, compliance, demo failure, any claim that isn't true.
Each reviews the diff against CLAUDE.md, docs/DECISIONS.md and the phase's "Done when", and lists problems by severity with file and line.
Then have them cross-examine each other's top 3 findings. Where they disagree, decide using DECISIONS.md and say why.
Fix every blocker and high item, re-run typecheck, lint, tests and size, and give me a short report: fixed, deferred (with reason), disagreements and how they were resolved.
```
For the light version, replace "5 subagents" with "2 subagents (reviewers 4 and 5 below)".

**Design review**
```
Review the screen at <route> against docs/DESIGN.md and design/reference/<file>.html: tokens, type scale, target sizes, contrast, motion meaning, copy keys, both languages, reduced motion, the anti-patterns list. Take screenshots at 360 px and 1440 px in hi and en. List problems by severity and fix the top 5. Do not introduce new tokens.
```

**Hindi copy review**
```
List every Hindi string in lib/i18n/hi.ts with its key. Flag anything that reads machine-translated, too formal, too long for its UI slot, gendered in the first person, or unclear to a contractor in Rajasthan. Suggest a natural alternative for each. Do not change files until I approve.
```

**Bug fix**
```
Bug: <what happened, what I expected, steps>. First reproduce it (write a failing test if it is in lib/ or convex/), explain the root cause in 3 lines, then fix it with the smallest change. Run typecheck and tests after.
```

**Cost check before live testing**
```
Estimate the cost of one live order (4 quote calls, 2 haggles, 1 match, 1 confirm) using docs/ARCHITECTURE.md §13 and the call limits in docs/CALL_SCRIPT.md, then compare with the costUsdCents of our real calls so far. Read the Bolna wallet via `pnpm bolna:check` and tell me how many live test orders it covers.
```

**End-of-day handover**
```
Summarise what changed today in 10 lines, what is half-done, and the single next step. Update CLAUDE.md only if a convention or command changed.
```
