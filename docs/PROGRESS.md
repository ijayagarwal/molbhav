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
- OpenAI (gpt-5.4-mini, R19) for parsing and extraction;
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
| 5 / 6A / 6B engine | Sim sweep, extraction job, haggle, match, ranking, place + undo + confirm call | Done in sim (live dial waits for 8B; the extraction golden set is ready to run with the OpenAI key) | `f571ea4`, `b06d39a`, `10fb8c7`, `a701ce6` |
| App screens | Onboarding, Home, Settings (language switch), Confirm | Done (sim; voice and typed parsing come with Phase 4) | `6caaa21` |
| App screens 2 | Choose dealers, Sweep board, Result, Placed, Share, landing, PWA | Done in sim; reviewed (17 defects fixed); verified on production | `f32e70f` … `8781d88` |
| 4 | Real voice: recorder, Sarvam STT, OpenAI parse (R19), read-back TTS | Built; works end to end on local dev with real speech; deployed. Real-phone test pending | `5f8ba5a` … `286269e` |
| 8B | Bolna dial, webhooks, report_quote, agent sync, admin web calls | Built and deployed (inert); waits for the Bolna key, then a founder's "go" | `6b3dbdd` … `242e9d7` |
| 8C | Recordings and retention | Built and deployed (inert until live calls) | `54613db` … `f47cf1b` |
| Team test | Real AI calls to teammates' verified phones | Later | — |
| 1C | Landing, waitlist, /dealer opt-in, /privacy draft, analytics, robots | Done; deployed; indexing waits for the lawyer (`PUBLIC_LAUNCH`) | `2053ea7` … `9380285` |
| 7 | /try sandbox, live hero board, /present | Done; /try verified on production; /present needs an admin session | `b960acc` … `3e03782` |
| 9, 10 | Hardening and demo deployment; go-live for real dealers | Later | — |

## 3b. Road to a live showcase (17 Nov 2026, night)

**Works today (simulator, zero call cost):** onboarding, a spoken or typed order (real Sarvam speech-to-text and
OpenAI parse), Confirm with the read-back in a male voice, choosing dealers, the live board with DEMO dealers,
haggle and match, Result, placing with undo, the confirm call, the shared parchi. On phone and desk, in hi and en.

**Step 1: a live AI call we can watch (needs the founders: a Bolna account and its API key).**
1. Claude: `pnpm bolna:sync` creates the four phone agents (Quote, Haggle, Match, Confirm) from CALL_SCRIPT.md
   with the male voice (R20), the webhook and the `report_quote` tool; `pnpm bolna:check` shows them.
2. Fastest showcase, if Bolna offers browser web calls: a founder opens `/app/admin/agents` and talks to the
   Quote agent from the browser, playing a dealer. No phone number, no verification; the founder presses Start.
3. The Team test (docs/TEAM_TEST.md): two teammates' phones verified in the Bolna dashboard; Claude adds them
   as test dealers; a founder says "go"; Claude turns on `LIVE_CALLS_ENABLED` on the dev deployment only; a
   founder starts a live order from the app; the board fills from real calls; extraction reads the transcripts;
   Result and the parchi as usual. Rollback: `LIVE_CALLS_ENABLED=false`.
4. Recordings as proof (Phase 8C): stored in Convex behind signed links, deleted after 30 days.

**Step 2: real dealers (Milestone 2, Phase 10; legal and accounts).** A registered business number (our own
Plivo or Exotel account with KYC), the TRAI A2P declaration, dealers who opted in on /dealer and were called
back by the team, IST call hours, a lawyer's read of the privacy and consent text.

**Step 3: public launch.** The landing page with the waitlist, /dealer and /privacy (Phase 1C, being built), the
team's WhatsApp number, phone-number login (an SMS provider with DLT registration, so logging out doesn't lose
the account), the sandbox /try and the presenter view for demos (Phase 7), hardening and a demo deployment
(Phase 9).

## 4. Session log (what happened, newest first)

### 17 Nov 2026 (night): keys in, OpenAI instead of Gemini, /app back under budget
- **Keys:** the founders sent the Sarvam and OpenAI keys. They are set in `.env.local`, Vercel production and
  both Convex deployments (never printed or committed). Also generated: `CONVEX_SERVER_SECRET` (dev and prod),
  and `HASH_SECRET` copied to Vercel. Production voice spend is capped at ₹200 a day (`VOICE_DAILY_INR_CAP`).
- **R19: OpenAI replaces Gemini** for the order parse and the call extraction, as the founders asked.
  `gpt-5.4-mini` with reasoning off parsed the 20-case golden set 20/20 at a median of 1.5 s (gpt-4.1-mini,
  gpt-5.5, gpt-5.6-luna and gpt-6-luna also 20/20 but slower; gpt-5.4-nano 19/20).
- **First real voice round trip:** Bulbul spoke the demo line, Saaras transcribed it in 0.5 s, and the parse
  got every field right in 1.7 s (about 2.2 s from end of speech to a draft; target 2.5 s). Note: Saaras v4
  writes English words in Devanagari ("एफ.ई.500डी") even in codemix mode; the parse copes.
- **Phase 4 server half merged** (keyless build, mocked tests): parse, Sarvam clients, `/api/voice/order`
  (NDJSON stream), `/api/tts`, rate limits and the daily ₹ cap, BotID, the parse golden set.
- **/app's first load was over budget** (260 KB of JS against 200 KB). Now 182 KB on production: icons ship
  one weight instead of six, motion code loads only on order screens, and Home and onboarding load on demand.
  CI now measures /app's real first render on a Pixel 7 profile.
- **OpenAI swap merged** (every call site, guard 8 reads `OPENAI_API_KEY`, `@google/genai` removed). With the
  real key: `pnpm eval:parse` 20/20 (p50 1.4 s); `pnpm eval:extract` 10/10 after a fix the first run exposed
  (a dealer agreeing with the read-back was read as "confirmed"; code now decides that only confirm calls
  can be confirmed).
- **The voice route works end to end on local dev with the real keys** (Pixel profile, signed-in contractor):
  10.8 s of spoken Hindi → transcript streamed at 1.2 s → draft at 3.1 s → Confirm shows 12mm Fe500D 2 ton
  (tier asked), PPC 150 bags ("कोई भी" pre-selected), Mansarovar, कल सुबह, 15 days. Typed fallback: draft at
  2.6 s. Server-built read-back from Sarvam: 3.5 s.
- **Phase 4 client half merged; real voice works end to end on local dev.** Chrome's fake microphone plays the
  demo line (e2e/demo.wav, Bulbul's synthetic voice for now) into the real mic button: listening sheet with a
  live level meter → send → Sarvam STT → OpenAI parse → Confirm with 12mm Fe500D 2 ton, PPC 150 bags,
  Mansarovar, tomorrow morning, 15 days. Also: the mic permission primer, every route error in plain words,
  the typed fallback (phone sheet and desk composer), Confirm asking one thing at a time, the Sarvam read-back
  (auto-plays once, can be stopped and muted, falls back to the browser's voice).
  - Fixed on the way: Saaras spells areas in different ways ("Manasarovar", "Manas Sarovar"); the area match
    now compares consonants on whole words. Bar size is asked with mm chips (suta → 12 or 16 mm, P7), and the
    server refuses steel without a size.
  - `E2E_LIVE_VOICE=1 pnpm e2e` runs the spoken and typed order tests (real API calls; local dev only, because
    production's BotID correctly refuses automated browsers).
  - /app's first load on production: 195 KB of JS (budget 200 KB): watch it.
- **Male voice (R20):** the read-back now speaks with Sarvam's `ashutosh_hi_conversational` (Hindi) and
  `dev_en_conversational` (English); samples of five candidates are in `~/Downloads/molbhav-voice-samples`.
- **Log out** in Settings, with an honest warning: sessions are anonymous until phone-number login exists.
- **Phase 1C merged and deployed:** the landing page now has a "for dealers" section and the waitlist (consent
  required, rate-limited by IP hash); `/dealer` (Hindi first) records a dealer's opt-in without making the
  number callable (S2); `/privacy` is a plain hi/en draft for the lawyer; analytics events (G6, no personal
  data); a bilingual OG image. Search engines stay out until `PUBLIC_LAUNCH=true` (after the lawyer's review).
  Verified on dev: a dealer sign-up lands in the waitlist and creates no dealer.
- **Phase 8B merged (built without a Bolna key; nothing dialled).** Live calls go only through `claimDial`; the
  webhook (`/bolna/webhook`) and `report_quote` (`/bolna/report-quote`) check `x-molbhav-secret` and fail closed
  (503) until it is set: checked on dev and production. `pnpm bolna:build` builds the four agents from
  CALL_SCRIPT.md (male voice: Sarvam `ashutosh_hi_conversational`; `--voice elevenlabs` swaps in an ElevenLabs
  male Hindi voice); `pnpm bolna:sync` creates them in Bolna; `pnpm bolna:check` is read-only. Founders can talk
  to the agents from the browser at `/app/admin/agents` (Bolna web call; starts only on a founder's tap; the key
  stays on the server). Steps once the key arrives: `docs/BOLNA_SETUP.md` §8.
- **Choose dealers: Demo / Live** appears only when the server says live calls are possible for this contractor;
  live lists only test_ok or opted-in dealers; a live order's screens show LIVE, never DEMO.
- **Confirm** now asks an unsaid steel grade and cement type with chips (PRODUCT §4) and shows a named brand.
- **Bolna connected (18 Nov 2026, dev deployment):** the founders' key is set; eight agents exist in their Bolna
  account: the Sarvam set `[dev]` and the ElevenLabs set `[dev-elevenlabs]` (Abhay voice), all checks ok;
  `pnpm bolna:voice` switches between them without touching Bolna (dev is on ElevenLabs now). One teammate is
  a `test_ok` dealer ("Agarwal Steels", Card A) and on `TEST_PHONE_HASHES`; the founder's account "ramesh" is
  verified. `LIVE_CALLS_ENABLED` is NOT set: no live call until a founder says "go".
- **First tests (18 Nov, early morning):** browser calls with the ElevenLabs set were silent after the greeting:
  the founders' own ElevenLabs key (connected in Bolna) produced no audio (likely their ElevenLabs plan and the
  Voice Library voice); the Sarvam set worked on two dashboard phone calls. Dev is on Sarvam until that's fixed.
  A test call also slipped into "बोल रहा हूँ": the shared prompt now spells out हम / impersonal phrasing. The
  webhook secret now rides in the URL (`?token=`), so no manual dashboard step is ever needed. `pnpm team:setup`
  (or `--solo` when a founder plays the dealer on their own phone) sets the test numbers; solo is set now.
- **Live calls work (18 Nov, 02:45–04:10, dev, the founder's own phone as the test dealer):** four live calls
  through `claimDial` → Bolna → webhooks → extraction. Lessons, each fixed and re-synced: the Quote agent took
  too many turns and accepted a per-piece rate (R22: five combined questions and an honest best-price ask); it
  spoke a tool call aloud and switched to English (R23: gpt-4.1-mini, tools on Match only, Hindi only); a live
  order held the fictional regular dealer (live sweeps now use only callable dealers); the founder hit the
  3-live-orders-a-day cap (test account raised to 20; Choose dealers now says why Live is unavailable). The
  third call asked every step and produced a comparable quote (₹3,62,520 all-in, GST extra, 6 days' credit);
  the read-back still added an unsaid term and skipped re-confirming a correction (fixed in the prompt). Dealers
  who ask get the buyer's number (R21, Settings switch).
- **Phase 8C merged:** live calls' recordings are copied into Convex storage, played through 10-minute signed links
  (`/rec`, seekable) on the board and on Result; recordings and transcripts are deleted at 30 days, callLog after a
  year, never-onboarded anonymous users after 7 days. Inert until live calls exist.
- **Phase 7 merged and verified on production:** `/try` (no sign-up, sample orders first, typing, mic behind a tap,
  DEMO dealers only, limits enforced on the server, ends with "अपने असली dealers का रेट चाहिए?"): a sample order
  reaches the DEMO parchi in 56 s on production. The landing hero now shows the live sweep board (client-side
  fixtures). `/present` (admin-only presenter view with the pipeline lights, event log and "Reset demo") needs
  the presenter's session in `ADMIN_USER_IDS` and `DEMO_DEPLOYMENT=true` on a demo deployment.
- **Still to do in Phase 4:** a test on a real phone over HTTPS (production refuses automated browsers, so only
  a person can check it), the founders' own recording, voice "हाँ, शुरू कीजिए" on Confirm (needs a
  speech-only route), and the "change site" sheet listing more than the home site.

### 17 Nov 2026 (evening): the whole sim flow works end to end
- **What a contractor can do now (sim, DEMO dealers, zero call cost):** onboard → tap the example order →
  confirm it → choose dealers → watch the live sweep board (calls ring, captions, a stamp per rate, the
  haggle and the regular dealer's match) → Result (winner parchi, "₹5,470 कम" tally, the regular dealer's
  card, the comparison) → place with a 5 s undo → the confirm call → "ऑर्डर पक्का" → share the parchi.
- **Verified in a real browser:** 360 px in English (placed at 113 s) and 1440 px in Hindi, no console errors.
  Numbers match TEAM_TEST: winner अग्रवाल स्टील्स ₹1,98,830, ₹5,470 below the regular dealer's first rate
  ₹2,04,300; Balaji came down ₹4,200 and stays ₹1,270 dearer.
- **Engine (Phases 5, 6A, 6B backend), merged from the parallel agent:**
  - sweep with sim personas, the extraction job, advance and watchdog;
  - haggle the best two, give the regular dealer the match, freeze the ranking;
  - place with an undo window, the sim confirm call, "not reached" with one retry, terms changed → back to Result with the runner-up;
  - the extraction golden set and `pnpm eval:extract` (not run yet: needs a Gemini key).
- **Screens:** Choose dealers, the Sweep board, Result, Placed; the shared parchi at `/p/<id>` in three modes
  (full, savings only, munshi) with a Hindi-correct preview image; the landing page in pilot wording (G2);
  PWA icon, manifest and an offline page.
- **Fixes found while testing:** "उन्हीं से लीजिए" (choosing the own dealer on Result) was refused by the
  engine, which only accepted the cheapest; it now takes any standing ranked offer. The DEMO stamp no longer
  covers the parchi's status line.
- **Deployed and seeded production** (`HASH_SECRET` generated on prod; 9 DEMO dealers). The whole flow runs
  on https://molbhav-weld.vercel.app in 114 s, with the share page working.
- **Playwright e2e** (`pnpm e2e`): the whole order, with an undo, at 360 px in English and 1440 px in Hindi.
  It also checks that board prices are actually opaque, not just present in the page.
- **Two independent reviews (backend, screens) found 17 real defects. Fixed so far:**
  - Board prices, captions and price drops were invisible in the app: the motion provider was only mounted on
    the styleguide. It now wraps every product route.
  - The share preview image rendered broken Hindi in production ("अग्‌रवाल"): Next.js swaps `@vercel/og` for its
    own HarfBuzz-less copy. Fixed with an npm alias (`vercel-og`), a two-line patch to its wasm loader, and a
    fixed `/p/<id>/parchi.png` URL for the share sheet (the og:image URL is hashed in production).
  - Share links: one link per mode, so a link already sent never changes. The public saving uses the same
    rules as the owner's Result (a non-comparable first rate is never the basis). The parchi shows the offer
    actually being placed, never one set aside. A savings-only page now carries the DEMO stamp.
  - Placing always has a way out: a dealer who changes terms, says no or opts out on the confirm call is set
    aside and the next cheapest is offered. After a failed call: one retry, then "अगला सबसे सस्ता देखिए". A
    stale confirm job can't dial an earlier choice.
  - An opt-out mid-order no longer strands the order, no call is ever created for an opted-out dealer, and a
    scripted sim opt-out never opts out the shared DEMO dealers.
  - Result and share use the engine's frozen ranking (the outlier rule no longer runs twice). Placing errors
    are shown. Units come from the dictionary. "Buy from them", not "him".
  - Desk: the main action (confirm, start calling) stays in view at the bottom of the column.
  - Screens (a parallel agent, merged): app links opened without a session land on onboarding instead of
    crashing, and /app has a proper error page; the board shows the haggle and match phases and announces the
    first quote; the Dealers back link no longer loops; bottom sheets are real modals (focus in, Tab trapped,
    focus returned); nothing truncates at 360 px (buttons wrap); the desk ledger flag stays in its cell; the
    last hard-coded copy moved to the dictionary (Confirm no longer invents "PPC"); Home's running banner
    shows "· 3/4 रेट मिले". On phone the title and DEMO show once, in the top bar.
- **Production re-verified after the fixes** (1440 px, Hindi): board prices visible, placed at 113 s, the share
  link and its preview image (correct Hindi shaping) work, no console errors.
- **All review fixes deployed and re-verified on production** at 360 px (English) and 1440 px (Hindi).
- **Phase 4 started without keys:** an agent is building the server half (parse schema and prompt, Sarvam
  and Gemini clients, `/api/voice/order` and `/api/tts` with BotID, rate limits and a daily ₹ cap, the
  20-utterance golden set), tested with mocks so it works the moment the keys are set. The client half
  (real recorder, mic primer, wiring) follows.

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
| ~~Sarvam API key~~ | Received 17 Nov 2026; set in `.env.local` and Vercel production | Done. Rotate it once things run (it was pasted in chat). |
| ~~OpenAI API key~~ (replaces both Gemini keys, R19) | Received 17 Nov 2026; set in `.env.local`, Vercel production and both Convex deployments | Done. Rotate it once things run (it was pasted in chat). Set a monthly budget limit in the OpenAI dashboard. |
| `~/Downloads/demo.m4a` | A real human voice for the voice test (the automated test can use Bulbul's synthetic voice meanwhile) | Record the demo line from docs/DEMO.md in Voice Memos and save it to Downloads |
| A real phone for HTTPS tests | The last Phase 4 check: speak an order on https://molbhav-weld.vercel.app/app (automated browsers are refused there by design) | Any Android in Chrome: open the link, onboard, tap the mic, say the demo line, and tell Claude what Confirm showed |
| Later: Bolna account + teammates' phone numbers | The Team test (real AI calls to teammates only) | START_HERE.md Part C5 |
| Later: the team's WhatsApp Business number | The landing page's main call to action (Phase 1C; hidden until set) | WhatsApp Business app on a team phone; send the number |
| Later: a privacy contact (email or the WhatsApp number) and the legal entity name | /privacy says how to ask for erasure (DPDP) | Send them; Claude fills `features/marketing/contact.ts` |
| Later: phone-number login | So logging out doesn't lose the account | An SMS OTP provider (needs DLT registration in India) or WhatsApp OTP; founders choose and sign up |
| Later: a lawyer's read of /privacy and the consent text | Before the landing link is shared publicly (Phase 1C, DPDP) | Claude drafts both; the lawyer reviews |
| Anytime: 30 minutes of a native Hindi speaker's time | A pass over every Hindi string ("match" vs "मैच", tone) | Claude exports the copy deck as a list to read through |

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
- **Seed demo data:** `npx convex run seed:reset` (touches only DEMO rows; add `--prod` for production).
- **End-to-end test:** `pnpm e2e` runs the whole sim order (onboarding → placed, with an undo) at 360 px in English
  and 1440 px in Hindi against the dev deployment. It needs `.env.local` and seeded demo dealers; CI doesn't run it.
- **Deploy:** `npx vercel@65.16.0 deploy --prod --yes --scope ganges1`. Details are in `docs/DEPLOYMENTS.md`.
