# Molbhav — Expert panel decisions (14 Nov 2026)

Seven specialist reviewers examined the whole plan independently, then cross-examined each other on the points where they disagreed. The chair decided every contested point below. **Where any other doc disagrees with this file, this file wins**; the other docs have been updated to match.

| Panel seat | Lens |
|---|---|
| Voice UX | Mic, read-back, Hindi naturalness, errors, voice commands |
| Visual & interaction | Brand, type, colour, layout, motion, desktop |
| Frontend | Next.js 16, fonts, gestures, performance, OG images, PWA |
| Backend & realtime | Convex, Bolna integration, failure handling, cost |
| Calls & negotiation | Dealer behaviour, scripts, haggle ethics, trade practice, TRAI |
| Growth & showcase | Landing, sandbox, viral loop, first customers, pricing |
| Red team | Security, privacy, abuse, compliance, demo failure |

---

## A. Three things that change what happens first

1. **Real AI calls to real dealers have legal and account prerequisites.**
   - **Indian calling number:** a number *bought from Bolna* needs a CIN + GST certificate (a company). But Bolna also runs on **your own Plivo or Exotel account** (bring your own telephony), and those accept a **sole proprietorship**: Plivo takes a GST certificate *or* a free Udyam certificate; Exotel takes a GST certificate *or* a Shop & Establishment licence, plus PAN and ID. Calls must stay inside India (media anchoring); Plivo's landline numbers (080/022) are for service and transactional calls only, never promotional.
   - **Bolna trial:** allows only 2 calls at once, to verified numbers only.
   - **TRAI:** the 18 Sep 2026 amendment treats automated and AI-voice calls as A2P. You must declare them and the calling numbers in advance. Repeated complaints plus an AI-spam flag can get the number barred.
   - **So:** live AI calls to real dealers wait for a registered business (a proprietorship is enough via Plivo or Exotel), the A2P declaration through that provider, and dealers who opted in. Until then, the AI is tested only on teammates' verified phones. A Pvt Ltd comes later, for fundraising and Startup India recognition, not for calling.
   - **Never** run AI calls from personal SIMs, GSM gateways, phone-automation apps or foreign/VoIP numbers: undeclared A2P counts as spam, and TRAI can disconnect *all* of the sender's telecom resources and blacklist it for up to two years.
2. **Concierge first.** The team calls dealers by hand to get the spread test, the first real recordings (with consent) and the first 10 customers. The software is built in parallel, simulator first.
3. **Security before anything public.** Every public Convex function is locked down from Phase 1A: auth, ownership checks, and internal-only functions for anything that costs money or dials. That one flaw would have let anyone read transcripts, wipe data or burn API quota.

---

## B. Decisions

### Product
| # | Decision | Debate | Why |
|---|---|---|---|
| P1 | **Regular dealer gets a "match" call at the end by default**, not a cold quote call. His row shows "आख़िर में match का मौका" with a per-dealer toggle "पहले भी पूछिए". | Calls proposed. Voice and growth agreed in round 2 ("we never take your dealer away; we make him sharpen his rate"). | A cold AI call to someone's own dealer embarrasses the contractor. The match call also yields an honest baseline. |
| P2 | **Savings headline = "₹ below your dealer's own first rate"**, with that rate asked for **before** any number is cited, and backed by the recording. His first rate is `firstTotal` from the match call, or his quote-round total when `askFirst` (if comparable). With no regular dealer quote: "vs the middle quote", labelled. Also show "आपके dealer ने ₹Y कम किया". | Growth and voice. | Honest, recorded, and it shows the relationship effect. |
| P3 | **Compare like with like.** Steel tiers: "ब्रांडेड" (Tata, JSW, SAIL, Jindal; city config) or "लोकल ISI" ("दोनों" is P1, R10). Cement: "नामी कंपनी" or "कोई भी", or a named brand. Ranking happens only within a tier. Non-ISI and no-bill (kachcha) rates are never accepted. | Calls and red team. Voice designed the one-tap chip. | With "any brand", secondary steel always wins. A no-bill rate looks 18% cheaper. |
| P4 | **A quote can win only if it is comparable**: tier matches, `billType: pakka`, brand named, weight basis known (kanta vs standard), delivery stated, GST mode stated, full stock confirmed, not an outlier. Others are shown separately and never win. | Red team and calls. | Stops lowball winners who re-price at confirm. |
| P5 | **North star = second order within 30 days.** Proof metrics: the spread %, the share of dealers who stay on after the disclosure, and time to result. | Growth. | "₹ saved" has no honest sample yet; repeat use proves value. |
| P6 | **Pricing hypothesis:** 10% of the measured saving, capped at ₹499, ₹0 if nothing was saved. A live order costs about ₹65–80. | Growth and backend. | Aligned with value, and covers cost. |
| P7 | **Suta is never mapped automatically.** If said, ask with a 12 mm / 16 mm chip; always say mm to dealers. | Calls (sources conflict: 4 suta = 12 or 16 mm). | A wrong size means a wrong order. |
| P8 | **Inbound callbacks, WhatsApp rate photos and late quotes:** Phase 10 (an inbound Bolna agent mapped to open orders, plus a 30 min callback window). MVP: one outbound retry at the time the dealer gave. | Calls. | Real but not first. |

### Phone calls
| # | Decision | Debate | Why |
|---|---|---|---|
| C1 | **Welcome:** "नमस्ते जी, ये मोलभाव से AI कॉल है, {name} जी की तरफ़ से, और कॉल रिकॉर्ड हो रही है।", then the order, then the stock question. No gendered verbs anywhere. | Voice found "मोलभाव की असिस्टेंट" genders the agent. Calls refined the order. | Disclosure first; leading with a real order keeps dealers on. |
| C2 | **Quote flow, in this order:** stock + brand → rate and unit per item (confirm each rate immediately) → "पक्के बिल पे, GST मिलाके, साइट पे उतार के, सब मिलाके?" → delivery time → cash vs udhaar rate → one final read-back including the GST mode, repeating only the dealer's own figures (R1). Target 75 s; cut off at 150 s. | Voice: per-slot confirmation broke the 120 s cap. Calls set the order. | Fast, and the numbers that matter are confirmed. |
| C3 | **Haggle cites the exact landed total** (spoken in full Hindi words, no rounding), with its terms ready. If asked for a per-item rate, the agent reads it from **the same cited quote**, never mixing dealers. | Rounding: down (growth, visual) vs up to ₹10 (voice, red, calls) vs up to ₹100 (backend). Chair: exact. | Rounding down cites an offer nobody made; exact is honest and still short. |
| C4 | **What can be cited is decided in code, not by the LLM.** A quote is citable only if every extracted rate appears in a dealer turn (as digits or Hindi words), the dealer said "haan" right after the read-back, confidence ≥ 0.8, there are no flags, the tier matches, and it falls inside a dated price band (citing is off if the band is older than 14 days). Otherwise ask for "best price" with no number. | Red team, backend, calls. | Stops "rate ek rupaya" and speech-recognition slips from becoming leverage. |
| C5 | **Confirm call relays, never commits new terms.** It reads back brand, bill type, weight basis, rate, payment, site area, delivery time and site contact, all approved by the contractor in the app (R9). Any difference means no deal: the agent says "{name} जी अभी कॉल करेंगे", and the app offers the runner-up. | Calls (IT Act s.10A unverified) and red team. | The contract is between contractor and dealer. |
| C6 | **Bolna settings:** welcome delay 700 ms; interruption threshold 3 words; online check at 8 s ("जी, आप लाइन पे हैं?"); silence hangup 20 s; on "रुकिए" say "जी, आराम से।". If the dealer cuts off the welcome, repeat the disclosure. If "आगे कॉल मत करना": "जी, आगे कॉल नहीं आएगी", end, set `opted_out`. | Voice and calls. Bolna has no welcome-only lock. | Doesn't drop "रुकिए, देखके बताता हूँ"; respects opt-outs. |
| C7 | **Language:** open in Hindi (the fixed disclosure), turn on Bolna's Hindi+English auto-switch, store each dealer's language, and stay in simple Hindi with Marwari speakers. | All agreed. | Disclosure understood; dealer comfort. |
| C8 | **`report_quote` custom function (live):** fired after the dealer confirms the read-back. It fills the row's checklist mid-call as a provisional hint; post-call extraction decides. | Voice proposed; backend confirmed a 50–500 ms pause, covered by a filler line. | Gives live mode something honest to show. |

### Voice UX
| # | Decision | Debate | Why |
|---|---|---|---|
| V1 | **Mic: both gestures always work.** One label, "दबाइए और बोलिए". A tap (<300 ms) starts and auto-locks, with a visible send and a 56 px "रद्द". A hold (≥300 ms) is push-to-talk: slide left 80 px cancels, slide up locks. In locked mode, auto-send after 3 s of silence once speech started, stop after 5 s if no speech, and release the mic when the app goes to the background. 25 s cap. Discard clips with under 0.6 s of speech silently. | Voice wanted tap first; visual, growth and red team wanted hold first; frontend said hold is fragile. Chair: hybrid plus voice's silence rule. | Works for the WhatsApp habit, gloves, and no stuck-open mic. |
| V2 | **Earcon "tik" and the red ring start on MediaRecorder `start`**, not on touch. The AudioContext is resumed on onboarding taps. | Voice and frontend. | Otherwise the first words are clipped or the sound is silent on touch devices. |
| V3 | **Read-back: at most 3 sentences or 10 s.** Site and deadline are spoken only if they differ from the defaults. It ends with a statement: "सही हो तो शुरू कीजिए।" | Voice. | Short, and the mic is closed. |
| V4 | **Voice commands use a local grammar, not the LLM.** Any negation (मत, नहीं, रुकिए, बाद में) means no action and buttons are shown instead. "रद्द" cancels during the undo window. | Voice called this a blocker. | "अभी confirm मत करो" must never place an order. |
| V5 | **Errors say what went wrong:** "Mic से आवाज़ नहीं आ रही। फिर से बोलिए, या लिख दीजिए।", "यहाँ शोर ज़्यादा है। फ़ोन मुँह के पास लाइए।"; after two failures, chips first. | Voice. | Specific beats generic. |
| V6 | **Desktop push-to-talk:** hold Space (150 ms) only when focus is on the page body or the dock; ignore it in text fields and on buttons, and ignore `e.repeat` and `isComposing`. Disabled on screens with a confirm or place action. Stop on blur or `visibilitychange`. A setting turns single-key shortcuts off (WCAG 2.1.4). ⌘K opens the typed composer. | Most for; red team warned that releasing Space can click a focused "Confirm". | Fast for power users, safe. |
| V7 | **Mute persists**, and the spoken result can be off by default in public. | Voice. | Saying savings aloud on site is a privacy issue. |

### Visual and interaction
| # | Decision | Debate | Why |
|---|---|---|---|
| D1 | **Paper (light) everywhere**, including desktop and landing; ink "night bands" on the landing page. Dark mode is P1, follows the OS in-app only, with a full dark token set (cement, rule, paint shadow, on-lal). | Unanimous where answered. | Stands out against dark AI sites, reads on projectors and in sun. |
| D2 | **Shape:** radius 12 for chips, buttons and cards; 4 for the parchi (with perforation); 20 for sheets. Painted shadows: 2 / 3 / 5 px offsets, **ink on paper**; haldi shadows only on ink or night surfaces. Wordmark shadow 0.08em haldi (the ink letters carry legibility). | Visual (a haldi shadow on paper is 1.41:1 and vanishes at noon; avoid stock neobrutalism). | Sharper, ledger-like, distinct from CRED NeoPOP. |
| D3 | **Fonts: static subset instances via `next/font/local`**, generated once by `scripts/fonts.py` and committed. They are Anek 700 at normal width (Devanagari + Latin), Mukta 400 and 600, and Plex Mono 500 and 600 Latin. Three digits-only Anek 800 files at width 125, 112 and 100 (`0-9 ₹ , .` with `tnum`, about 3 KB each) are used for hero prices, so D4's width steps work. The wordmark is an SVG. Preload only Mukta 400 and the width-125 digits file. Budget ≤ 250 KB of fonts on `/app`. | Visual measured Anek's variable Devanagari file at about 726 KB; frontend measured the instances and confirmed. | 1.4 MB of fonts kills the phone experience. |
| D4 | **Money never wraps.** `price-hero` steps width 125 → 112 → 100, then size 44 → 36 to fit. | Visual (₹12,40,500 overflowed at 360 px). | Real orders are bigger than the demo. |
| D5 | **Desktop "Munshi desk":** 72 px icon rail. At 1024–1279: main (max 760) plus a 400 px overlay drawer. At 1280–1535: main plus a docked 400 px call panel. At ≥1536: a 300 px "Bahi" order list, main (max 840) and a 420 px panel. Ledger columns: Dealer 1fr · Status 144 · Landed 140 · Credit 80 · Delivery 104; the latest line is the row's second line (72 px rows). | Visual (a 240 px rail was empty chrome). | Desktop as good as mobile, not a stretched phone. |
| D6 | **Motion:** stamps at least 250 ms apart; Ring wiggles the icon only; Strike has 3 seeded path variants; Tally is a 600 ms per-digit odometer. New states: "आपके dealer ही सबसे सस्ते" (no tally) and "सिर्फ 1 रेट मिला". | Visual. | Delight that stays legible. |
| D7 | **Live honesty:** both modes show a per-call checklist (रेट · GST · भाड़ा · उधार), a status and an elapsed timer. Sim adds captions labelled DEMO. Live never shows fake waveforms or captions; after `completed`, 2–3 transcript lines type in, then the stamp. There is a "सब कॉल रोकिए" button, and "नतीजा आते ही बताएँगे". | Captions in sim only (visual, red, backend, calls, frontend) vs the same in both (voice). Chair: checklist in both, captions sim-only. | Live can't stream transcripts; sim must not promise more than live delivers. |
| D8 | **Phase 2A quality gate:** build the 20 s "money shot" (stamp → strike → parchi → tally) with production fonts and sound. Review it on a ₹12k Android at noon and on a 1440 px screen before building screens. Lint-ban shadcn's default `shadow-*`, `rounded-md` and `ring-offset-*`. | Visual. | Prevents a generic shadcn look. |

### Frontend
| # | Decision | Debate | Why |
|---|---|---|---|
| F1 | **Routes:** landing `/`, app `/app/...`, sandbox `/try`, shared parchi `/p/[publicId]`, dealer opt-in `/dealer`, presenter `/present`, styleguide `/styleguide`. `proxy.ts` sends a returning device with a session cookie from `/` to `/app`; the header always shows "App खोलिए". PWA `start_url` and `scope` are `/app`. | All agreed on `/` + `/app`. Redirect: voice, growth and frontend for it; visual against; chair: redirect only with a session cookie. | Clean boundary for auth, robots and the PWA. |
| F2 | **Layouts per surface:** `app/(marketing)` uses server components (no Convex websocket); `app/(product)/layout.tsx` holds the Convex provider; components are presentational, and `features/*` own the data hooks. | Frontend. | The landing page stays fast. |
| F3 | **Voice order fast path:** one Vercel route pinned to Mumbai (`bom1`) does STT then parse, streams the transcript back first, then writes the draft through an authenticated Convex mutation. Use the lowest Gemini thinking setting and 24 kbps mono audio. Target: transcript in about 1.5 s, Confirm in about 2.5 s. | Frontend (Convex has no India region; about 4 round trips). Red team: STT and parse must not be public Convex functions. | Feel plus security. |
| F4 | **Mic gesture plumbing:** `touch-action: none`, `-webkit-touch-callout: none`, `setPointerCapture`, handle `pointercancel`; stop tracks after every take (iOS). | Frontend. | Otherwise slide-up becomes a scroll and kills the recording. |
| F5 | **Share image:** one PNG endpoint (`/p/[id]/opengraph-image`) rendered with `@vercel/og` **1.0.3** on Node using static TTFs. Prefetch it when the result settles; in the tap call `navigator.share({ files })`; fall back to a wa.me link to `/p`. No html-to-image. | Frontend tested it: the Satori bundled in Next 16.4 breaks Hindi conjuncts, and 1.0.3 renders them correctly. 1.0.3 also carries the patched Satori 0.33.5 (GHSA-wx4j-mvgx-mqwp); pin it exactly. | Correct Hindi, real image shares. |
| F6 | **Next.js ≥ 16.3.6** (CVE-2026-94545 in ImageResponse). | Frontend; verified. | Security. |
| F7 | **Motion:** `LazyMotion` + `m` with `domAnimation`; React `<ViewTransition>` for route changes and the row → detail shared element; `MotionConfig reducedMotion="user"`; memoised rows; a denormalised `calls.lastCaption`. | Frontend. | Smooth on a ₹12k Android. |
| F8 | **i18n:** a `lang` cookie, `getDict(lang)` on the server and `useT()` on the client; `<html lang>` set on the server. Phosphor `/ssr` imports in server components. | Frontend. | No flip of language after load. |
| F9 | **Dev testing on a phone over HTTPS** (a tunnel or a Vercel preview), never a LAN IP. Playwright uses a fake audio file and a Pixel 7 profile; a `size-limit` gate runs in CI. | Frontend. | The mic needs a secure context. |
| F10 | **Scaffold** in a temp folder and merge (create-next-app refuses a non-empty folder); `"lint": "eslint ."` (next lint was removed in Next 16); run `npx convex dev --once` before typecheck. | Frontend. | Avoids Phase 1 breakage. |

### Backend
| # | Decision | Debate | Why |
|---|---|---|---|
| B1 | **Convex Auth (Anonymous provider) from Phase 1A; Google sign-in for real contractors and founders in Phase 10.** Every public function checks ownership. Sim, extract, dial, media and seed are `internal*`. Never return dealer phone numbers to the client. | Red team (blocker); backend agreed. | Closes the open-API hole. |
| B2 | **`claimDial` internal mutation:** runs every live guard, reserves the concurrency slot (a full slot means wait, R2), and moves `queued→dialing` atomically. An unknown dial outcome is never retried; check `GET /v2/agent/{id}/executions` first. | Red team and backend. | Parallel actions can't beat the caps or double-dial. |
| B3 | **Webhooks:** a header secret (`x-molbhav-secret`); `ingest` dedupes on executionId + status and returns 200 in under 1 s; `process` re-fetches and applies a status only if its rank is higher; final statuses never change. Our `molbhav_call_id` goes in `user_data`, echoed back in `context_details.recipient_data`. | Backend. | Bolna retries, and events arrive out of order. |
| B4 | **Workpools** (`@convex-dev/workpool`): `dial` (parallelism 1, 0 retries; `claimDial`'s live-slot count limits concurrency, R2), `llm` (4, 3 retries with backoff), `media` (2, 3 retries). Every job carries `(orderId, roundSeq)` and does nothing if stale. | Backend (Convex scheduled actions run at most once). | One Gemini 429 must not leave a row stuck. |
| B5 | **Per-call deadlines and a watchdog** instead of one round timer: queued 10 min, dialing 30 s, ringing 45 s, in progress = call_terminate + 30 s, disconnected 90 s (R2, R15). The haggle starts once 3 citable quotes are in or every call has finished; still-queued calls are stopped via `POST /call/{id}/stop`. | Backend. | With 2 calls at once, a fixed 360 s round cut dealers off. |
| B6 | **Recordings:** copied from Bolna into Convex storage, served only through `/rec/:callId?t=<10-min HMAC token>` (issued by an ownership-checked query) with Range/206 support. Deleted at 30 days. A 1-year metadata log (number hash, time, consent) is kept. Contractor order audio is never stored (streamed to STT and dropped). Bolna's India data residency is turned on if the account offers it (R13). | Red team, backend. | Bolna's recording links are presigned for 24 h with no auth, and Bolna documents no delete API. |
| B7 | **Money and units:** `costUsdCents` (Bolna `total_cost` is in US cents); `gstMode` per quote line; an unstated delivery or unloading charge is **unknown, not free**, and makes the quote not comparable and not citable (R6). | Backend; verified. | Correct sums and honest citing. |
| B8 | **`/present` embeds `/app?embed=1` in an iframe** with the demo contractor's session. Anonymous sign-in always creates a new user, so an admin-only `admin.claimDemoContractor` (demo deployment only, `isDemo` rows only) re-points the seeded demo contractor to the presenter's session. No public function can switch identity. On the demo deployment the presenter laptop's session is both the admin and the demo contractor; never clear its cookies (a new anonymous user would need `ADMIN_USER_IDS` updated). There is no global event feed; cost and readiness views need an admin role. | Backend and red team. | It can never stream real users' calls. |
| B9 | **Trial mode for testing before the business number exists.** With `BOLNA_TRIAL=true`, dials go only to dealers with consent `test_ok` whose phone hash is listed in `TEST_PHONE_HASHES` (teammates' phones, also verified in Bolna). In trial mode guard 7 accepts Bolna's trial caller ID, guard 4 allows `TEST_DAILY_CALLS` (default 10) per number, and guard 5 (call hours) is skipped. `opted_in` dealers always need `BOLNA_TRIAL=false` and a registered `BOLNA_FROM_NUMBER`. | Builder walkthrough (cross-check). | Phase 8B can be tested honestly on the trial without bypassing a guard. |
| B10 | **Hashes are keyed:** IP and phone hashes are HMAC-SHA256 with `HASH_SECRET`. Demo dealers use invalid numbers (`+9100000000NN`), and `claimDial` refuses any number that doesn't match `^\+91[6-9]\d{9}$` and any `isDemo` dealer. | Builder walkthrough (cross-check). | A plain hash of a 10-digit mobile can be reversed in minutes; seed data must never ring a real person. |

### Security, privacy, compliance
| # | Decision | Debate | Why |
|---|---|---|---|
| S1 | **Live mode only for admin-verified contractors** for the first 10. Founders meet each one in person and confirm the number by calling it back. `verified` is set only by an admin-auth internal mutation, every change is logged, name and phone are locked at verification, a new device must be verified again, and per-contractor caps apply. OTP is required before public signups. | Growth and red team in round 2 (SMS OTP needs DLT registration, which takes days). | Safe and fast for the pilot. |
| S2 | **Dealers are added only by admins** for live mode; consent is recorded via `/dealer` or a call. AI calls to a dealer number come from **at most 2 orders a day** across all contractors: a quote or match call opens an order's slot, and that order's haggle and confirm calls ride on it (at most 4 AI calls per order per number, R3). Opt-out is honoured immediately. | Red team and calls. | Nobody can aim AI calls at a stranger; protects the number from spam flags. |
| S3 | **Prompt-injection hygiene:** contractor name letters-only, max 24 characters, verified; the site comes from the `sites` table; brand from an enum; free text never reaches agent prompts. | Red team. | Agents speak what we control. |
| S4 | **DPDP basics now:** notice and a consent checkbox at onboarding and on the waitlist; erasure on request; retention crons; a dealer recording notice in every call. | Red team (core duties apply from about May 2027; build them in now). | Cheap now, painful later. |
| S5 | **Disclosure check:** if the assistant turns before the dealer's first rate don't include both "AI" and "रिकॉर्ड", mark `disclosure_failed` and drop the quote. (The dealer may cut off the welcome; the agent repeats the disclosure, C6.) | Red team. | Enforces hard rule 3. |

### Showcase and growth
| # | Decision | Debate | Why |
|---|---|---|---|
| G1 | **Landing + waitlist** (Phase 1C; built after the Team test, R11). Page order: hero (live sweep board on fixtures) → proof (real spread figures with sample size + one real recording) → how it works → rules (your dealer is included) → sandbox → dealers → waitlist. **The proof band is not rendered until real figures exist** (no public placeholders). The CTAs open `/app` (complete in sim by then), with WhatsApp click-to-chat beside it. | Growth; builder walkthrough. | Learn from real visitors without showing anything unfinished or unproven. |
| G2 | **Hero copy:** "आप बोलिए। मोलभाव हम करेंगे।" / "You say it. We bargain." CTA "खुद बोलके देखिए". Until AI calls to real dealers are live: "Jaipur pilot: हमारी टीम आपके लिए dealers को कॉल करती है". Never claim live AI calls before they exist. | Growth (round 2). | Honest claims. |
| G3 | **Sandbox `/try`:** sample-order chips first. Real STT only after a tap, and only if **Vercel BotID's `checkBotId()` passes on the server** in the same Vercel route. 15 s cap; limits of 3/h per device, 10/h per IP, 500/day globally; a daily ₹ kill switch; a separate billed Gemini key; the sweep runs on the simulator only; no audio stored; sandbox orders deleted after 24 h; never creates `/p` links or live sweeps. The parchi is watermarked "DEMO · काल्पनिक dealers" with no savings tally; it ends with "अपने असली dealers का रेट चाहिए?" + WhatsApp join. | Red team accepted with server enforcement; everyone else for. | The hook is hearing your own Hinglish understood. |
| G4 | **Shared parchi `/p`:** three share modes (Full, "सिर्फ बचत", munshi-only). It credits the contractor ("रमेश जी ने ₹X बचाए"), shows no site, date, phone numbers, recordings or losing dealers' prices, uses a 128-bit revocable id, and is `noindex`. DEMO parchis are watermarked. It is built in Phase 6B, not later. | Growth and red team. | A viral loop that never leaks margins or locations. |
| G5 | **Waitlist fields:** name, WhatsApp number, city, role, "next order", `ref` (from `/p`), consent. Click-to-chat on WhatsApp is the main path. A Hindi `/dealer` opt-in page. | Growth. | Real leads and dealer consent. |
| G8 | **Two milestones, one codebase.** Milestone 1 (hackathon) ends with real AI calls proven on teammates' Bolna-verified phones in trial mode (`docs/TEAM_TEST.md`); Phases 8A–8C come before Phase 7. Milestone 2 (real dealers) adds only Phase 10: our own Plivo/Exotel number, `A2P_DECLARED`, live stages, consent evidence, an inbound line, metrics and Google sign-in. Nothing in the call path is rebuilt. | Team decision. | The hackathon proves the real loop honestly; going live is settings, numbers and consent. |
| G6 | **Analytics events** (the parchi events from Phase 6B, the waitlist events from Phase 1C, R11): `try_start`, `try_voice`, `waitlist_submit`, `parchi_share(mode)`, `parchi_open`, `parchi_cta`, `dealer_optin`. | Growth. | Measure the loop. |
| G7 | **Judge demo:** a sim run with the DEMO badge, real recordings from the human spread-test calls, and the Team test proof (a screen recording, clips and the run log of AI calls to teammates' verified phones); one live AI call on stage is optional (R14). Say plainly what is not live yet and why (a registered business number and the TRAI declaration). Run it from a separate demo deployment, on a phone hotspot; a canned parse for the scripted line and the personas' ground-truth quotes are fallbacks. | Growth and red team. | Credible and failure-proof. |

---

## R. Changes after the Phase 0 review (15 Nov 2026)
The Phase 0 read-through found conflicts and gaps. The founders gave Claude Code authority to fix the plan. These rows override any older text above or in other docs; the other docs have been updated to match.

| # | Decision | Fixes | Why |
|---|---|---|---|
| R1 | **The phone agent never adds up numbers.** Every read-back repeats only the dealer's own figures (rates with units, GST mode, delivery, unloading, bill, weighing, time), plus his all-in figure only if he said one. Code computes the landed total after the call. A stated all-in total (covering GST, delivery and unloading) is the landed total when the call didn't give a rate for every item, which is how haggle drops are usually said. If one call gives a rate for every item *and* an all-in figure, and they differ by more than 0.5%, the quote is flagged `lump_sum_mismatch` (needs checking). The Match agent's `report_quote` "first" stage sends his rates, and code computes his first total. | Phase 0 H1 | Otherwise the dealer's "हाँ" confirms a number that only the call LLM produced, which breaks hard rules 4 and 5. |
| R2 | **A full live slot means wait, not refuse.** `claimDial` counts live calls in `dialing`, `ringing`, `in_progress` or `disconnected` in the same transaction; at `LIVE_CONCURRENCY` it returns `wait`, the call stays `queued`, and its dial job runs again when a live call ends (plus a 15 s backstop) until a 10-minute queue deadline, after which the call is `cancelled` (`queue_timeout`). A call holds its slot until it reaches a final status, and the watchdog guarantees that, so nothing leaks. `MAX_LIVE_SWEEPS_PER_HOUR` is checked once, when a live sweep starts. Bolna's own retries and rescheduling stay off; every retry is our own new call row through `claimDial`. | H2 | With 4–6 dealers and 2 trial slots, calls 3+ were being refused, and no doc said when a slot frees. |
| R3 | **Dealer call limits are counted per order.** `callLog` stores `orderId` and `callId`, written by `claimDial` when it reserves the dial. A dealer number gets AI calls from at most **2 distinct orders a day** (IST), and at most **4 AI calls per order**: one opening call (quote or match), one retry (after no answer, or at the dealer's callback time), one haggle and one confirm. This replaces S2's flat cap of 4 a day, so a placed order's confirm call is never refused. | H3, M7 | The old cap could block the confirm call of an order the contractor had already placed, and without `orderId` the 2-orders rule couldn't be counted. |
| R4 | **Call status and outcome are separate fields.** `calls.status` is the telephony lifecycle with a fixed rank table (ARCHITECTURE §6.3); final statuses never change. `calls.outcome` (quoted, declined, callback_requested, no_quote, opted_out, disclosure_failed, terms_changed, confirmed) is set by extraction, and provisionally by `report_quote` (opt-outs act at once, R15). Webhooks touch only `status`; extraction touches only `outcome`. | M10 | One union for both made "final" ambiguous and the rank rule unworkable. |
| R5 | **Rounding and the savings basis.** Money is in integer paise; GST is rounded to the paisa per line; the landed total is rounded to the rupee **once**, and that rupee figure is used everywhere (ranking, citing, speech, display). "बीच वाले रेट से" means the median of the comparable **quote-round** totals; with an even count, the lower of the two middle values (the smaller claimed saving). | L1, M6 | Without one rounding point, spoken and shown totals can disagree; the median needed a definition. |
| R6 | **Unknown unloading is treated like unknown delivery: the quote can't win.** `unloading_unknown` makes a quote not comparable (and so not citable). | M13 | Otherwise a dealer who leaves out ₹600 of hamali outranks one who states it. |
| R7 | **No free text reaches an agent.** Site areas are picked from the city's area list (`CITY_AREAS` in `lib/config.ts`; speech is matched to it and confirmed with a chip). The delivery time is one of a fixed set (`deliverBy`: today, tomorrow_morning, tomorrow, day_after, this_week, flexible), spoken from the dictionary; `deliverByText` and `siteText` are for display only. | M8 | Closes the prompt-injection path through `site_area` and `deliver_by`. |
| R8 | **Confirm asks one thing.** The steel tier is asked when it wasn't spoken. Cement defaults to the contractor's last choice, else "कोई भी", shown pre-selected and included in the read-back. | M4 | The docs disagreed; one question keeps the 2-second Confirm. |
| R9 | **The Confirm call relays what we hold:** brand, bill, weighing, the all-in rate, payment (credit days or cash), site area, delivery time and the contractor's verified phone. Address, GSTIN and advance are P1 (they need validated fields first). | M9 | C5 asked for data the schema doesn't have, and S3 forbids free text. |
| R10 | **"दोनों" (both tiers) is P1.** If a contractor says it, Confirm asks which tier to bargain for. | M14 | One winner, one haggle and one tier per item keeps the negotiation honest and simple. |
| R11 | **Build order centres on the negotiation agent:** 1A → 3 → 1B → 2A → 2B → 4 → 5 → 6A → 6B → 8A → 8B → 8C → Team test → 1C → 7 → 9 → 10. The deploy pipeline is set up at the end of 1A. The landing page, waitlist and dealer opt-in (1C) ship after the Team test; G1's page order and honesty rules still apply. | Founders' direction | "We are building a negotiation agent": the brain and the call loop come first. |
| R12 | **Working model: Claude Code does the work.** It runs installs, CLI sign-ins (device flows the human approves in a browser), env vars, deploys and the Bolna agent setup through Bolna's API from versioned configs in `bolna/agents/`. The human provides accounts, keys, phones, money, legal and field work, and design-taste reviews. Claude still never places a live call itself, never bypasses a guard, never buys a number, and asks before anything that spends money or is legally binding. | Founders' direction | The team wants most tasks done by Claude Code. |
| R13 | **Smaller fixes:**<ul><li>The font budget is measured as fonts requested on the first render of `/app` (≤ 250 KB), and every generated file's size is reported. The subset adds `· × – — ‘ ’ “ ” … ← → −`.</li><li>Contractor names allow Devanagari marks: `/^[\p{L}\p{M} ]+$/u`, at most 24 graphemes.</li><li>Share ids are 22 base64url characters (128 bits).</li><li>`PRICE_BANDS` live in a Convex `priceBands` table, seeded from `lib/config.ts` and editable in `/app/admin`, so citing doesn't stop at a redeploy.</li><li>Bolna's India data residency is turned on only if the account offers it, and the privacy page states the real setting.</li><li>The contractor's dealer book (`contractorDealers.relation = "saved"`) decides which dealers are on by default; same area first, then the rest of the city (no distances until P1).</li><li>Lal and ink-3 text never sit on cement fills.</li></ul> | M2, M3, L2, L3, L7, L4, M5, L6 | Each was a small conflict that would surface mid-build. |
| R14 | **Demo proof:** the main path is sim; the live proof is the Team test recording, clips and run log; a live call on stage is optional. | L8 | Aligns G7 with DEMO.md. |
| R15 | **Follow-ups from the review of §R:**<ul><li>A call in `dialing` has a 30 s deadline (the watchdog checks `GET /v2/agent/{id}/executions`, then marks it `failed`), so a hung dial can't hold a slot.</li><li>An opt-out acts at once: `report_quote` with `opt_out` (or extraction, whichever comes first) sets `dealers.consent = opted_out`, cancels that dealer's queued calls and deletes all their recordings.</li><li>The Confirm call ends with `outcome: confirmed` (everything matched) or `terms_changed`; `confirmed` moves the order to `placed`; a confirm call that doesn't connect leaves it in `placing` with a retry option.</li><li>The Match agent collects his full quote (stock, brand, rates, all-in, delivery time, credit, weighing) before any number is cited, so his quote can be compared.</li><li>`deliverBy` defaults to `flexible` when it wasn't said; then the welcome leaves the delivery clause out and the agent asks when they can deliver.</li><li>A skipped haggle (fewer than 2 citable quotes) has its own copy (`haggle.skipped`); "सिर्फ 1 रेट मिला" means only one comparable quote came in.</li><li>Retry rows are created at their scheduled time, so their 10-minute queue deadline starts then.</li></ul> | Review of §R | Closes gaps that would have stalled the call loop or lost an opt-out. |
| R16 | **Production Convex runs in EU (Ireland)**, not US East. Convex still has no India region; from Mumbai, Ireland is roughly 120 ms per round trip against about 190 ms for N. Virginia, which every realtime update, the voice route's draft write and every Bolna webhook pays. The privacy page names the EU as the storage location. Chosen at the first deploy, before any data existed. | Phase 1A | Lower latency for Indian users at no cost; moving later would mean a data migration. |

---

## T. Tool choices (re-checked 15 Nov 2026)
Each tool was chosen for this product, not carried over from the earlier Molbhav page (which was a static page on Cloudflare Workers).

| # | Need | Choice | Why it is the simplest good option | Considered instead |
|---|---|---|---|---|
| T1 | Web app and hosting | **Next.js 16 on Vercel** | One deploy from GitHub, a Mumbai region (`bom1`) for the voice route, preview URLs for every push, and the best-known stack for Claude Code | Cloudflare Workers (more limits for Node libraries and server-side images), Netlify |
| T2 | Database, realtime, jobs, webhooks, files | **Convex** | One TypeScript service covers the live sweep board (realtime), timed call jobs with retries (scheduler and workpool), the Bolna webhooks (HTTP actions), the recordings (storage) and the atomic `claimDial` guard (transactions). No SQL migrations and no row-level security rules to get wrong. Its free tier covers the hackathon and the pilot. | **Supabase** (Postgres, with a Mumbai region): realtime and auth are good, but timed jobs and retries need extra pieces (Edge Functions, cron, queues) and security depends on RLS policies. Firebase: NoSQL plus Cloud Functions and Tasks, more setup. |
| T3 | Speech to text and Hindi voice | **Sarvam** (Saaras STT, Bulbul TTS) | Built for Indian languages and Hinglish, priced in ₹ | Google, Deepgram or ElevenLabs: weaker on code-mixed Hindi |
| T4 | Understanding orders and quotes | **Gemini Flash** | Reliable JSON-schema output, cheap, free tier for development | Sarvam's own LLM (check it for structured output later), other LLM APIs |
| T5 | Phone agents | **Bolna** | Indian voice-agent platform, Hindi agents, works with Plivo and Exotel Indian numbers, trial for verified phones | Vapi or Retell: US platforms that can't use Indian Plivo numbers, because calls must stay inside India |
| T6 | Bot protection on paid endpoints | **Vercel BotID** (Basic) | Free on every plan, already part of Vercel, with no keys and no extra account | Cloudflare Turnstile (was planned; dropped because it needs another account and keys) |
| T7 | Phone testing over HTTPS | **`cloudflared` quick tunnel** | One command, free, **no account**. The tool is from Cloudflare, but nothing else in the stack is. | ngrok (needs an account and token), or deploy a Vercel preview for every test (slower) |
| T8 | Share images | **`@vercel/og` 1.0.3** | Renders Hindi correctly and ships the patched Satori | The Next.js built-in (breaks Hindi conjuncts) |

**Trade-off we accept:** Convex has no India region (its regions in Nov 2026: US East, EU Ireland, Canada, Sydney). Production runs in **AWS EU (Ireland)**, the closest to India (R16); the dev deployment is in US East.
- **Latency:** each database round trip from India adds a fraction of a second. The latency-critical speech and parsing run on Vercel `bom1`.
- **DPDP:** the DPDP Act allows transfer abroad unless the government restricts the destination country. The privacy page must say where data is stored.
- **Reconsider:** if Convex opens a Mumbai region, or if the pilot shows the latency hurts.

## C. Facts the panel corrected (verified)
- Sarvam gives **₹100** of free credit, not ₹1,000. STT costs ₹0.49 per minute; Bulbul v3 ₹3 and v4 Flash ₹1 per 1,000 characters.
- Bolna `total_cost` is in **US cents**. The trial allows **2 calls at once, to verified numbers only**; paid plans start at 10. A number bought from Bolna needs a **CIN + GST certificate**; bring-your-own Plivo or Exotel accounts have their own KYC, which accepts a sole proprietorship.
- Bolna has **no mid-call transcript stream**; custom functions can run mid-call (with a short pause).
- The Bolna recording endpoint redirects to a 24-hour presigned link with no auth; no delete API is documented; processing is in the US unless India residency is enabled.
- The Satori bundled in Next 16.4.x breaks Devanagari conjuncts; `@vercel/og` 1.0.3 renders them correctly.
- Anek Devanagari's variable Devanagari file is about 709–726 KB.
- A phone opening a LAN `http://` URL is not a secure context, so the mic is blocked.
- Convex scheduled actions run at most once (no automatic retry); Convex has no India region.
- "Suta" to mm mappings conflict between sources.

## D. Go / no-go bars for live AI calls (after the spread test and the first agent tests)
Two stages:
1. **Stage 1 (measure):** a business number registered (Plivo/Exotel via Bolna, or Bolna's own) and A2P declared → live calls for at most 5 opted-in dealers who agreed to test calls, started by admins only.
2. **Stage 2 (open up):** the bars below pass over at least 10 haggle calls → live calls for all opted-in dealers.

The bars:
- At least **70%** of dealers stay on past the disclosure.
- At least **50%** of dials give a valid, comparable quote.
- At least **40%** of haggle calls lower the price, with a median drop of at least **0.5%**.
- Decide only after at least 10 haggle calls (at 20 calls the margin is about ±20 points).

## E. Still to verify in the field
- The words contractors use for brand tiers and bar sizes.
- Whether cement is usually quoted GST-inclusive.
- Whether DND rules apply to quote-request calls.
- IT Act s.10A and AI relaying confirms (the plan already avoids committing).
- Bolna call-transfer support, and the echo of `recipient_data` in webhooks.
- The GST treatment of freight and unloading (ask a CA).
- The exact current model ids for Sarvam STT/TTS and Gemini Flash (check the docs when building).

## F. Sources for the verified facts
- Bolna, compliance application (CIN + GST for a Bolna-bought number): https://www.bolna.ai/docs/compliance-application/introduction
- Bolna, supported telephony providers (bring your own Plivo, Exotel, Vobiz, Twilio or SIP): https://www.bolna.ai/docs/supported-telephony-providers
- Plivo, renting Indian numbers (GST, CIN or Udyam certificate): https://www.plivo.com/docs/numbers/rent-india-numbers
- Plivo, calling in India (media anchoring, number series, consent): https://www.plivo.com/docs/voice/concepts/india-calling
- Exotel, account setup and KYC (sole proprietorship accepted): https://developer.exotel.com/docs/faqs/account-setup
- TRAI direction of 13 Aug 2024 (disconnection and blacklisting of unregistered senders): https://trai.gov.in/sites/default/files/Direction_13082024.pdf
- Bolna, outbound calling concurrency (trial limits): https://www.bolna.ai/docs/pricing/outbound-calling-concurrency
- Bolna, execution payload (`total_cost`, recording URL, `recipient_data`): https://www.bolna.ai/docs/post-call/execution-payload
- Bolna, custom function calls (mid-call `report_quote`): https://www.bolna.ai/docs/tool-calling/custom-function-calls
- Sarvam pricing and free credit: https://docs.sarvam.ai/api-reference-docs/getting-started/pricing
- TRAI press release on the September 2026 amendment (AI and automated calls as A2P): https://www.trai.gov.in/sites/default/files/2026-09/PR_No119of2026.pdf
- Next.js security update (CVE-2026-94545, fixed in 16.3.6): https://nextjs.org/blog/nextjs-security-update-september-22-2026
- Coverage of the ImageResponse flaw: https://thehackernews.com/2026/09/critical-nextjs-imageresponse-flaw-can.html
- Satori advisory (patched in 0.33.5, which `@vercel/og` 1.0.3 ships): https://github.com/vercel/satori/security/advisories/GHSA-wx4j-mvgx-mqwp
