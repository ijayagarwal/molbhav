# Molbhav — Architecture

Every decision here is traced in `docs/DECISIONS.md` (codes like B3, F3). Re-check vendor docs before coding an integration; details below were verified in November 2026.

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Web | **Next.js 16 (≥ 16.3.6)**, App Router, TypeScript strict, on Vercel | 16.3.6 fixes CVE-2026-94545 in ImageResponse (F6) |
| Backend | Convex: DB, realtime queries, actions, HTTP actions, scheduler, storage | No India region: production runs in EU (Ireland), the closest (R16); latency-critical voice work runs on Vercel `bom1` (F3) |
| Auth | **Convex Auth** (`@convex-dev/auth` 0.0.98) with **Google sign-in** for everyone (R26); the founders approve each person (`users.access`) and verify live users after a callback | B1, S1, G8, R26 |
| Durable jobs | `@convex-dev/workpool` (retries, parallelism), `@convex-dev/rate-limiter` | Convex scheduled actions run at most once (B4) |
| UI | Tailwind CSS v4 (`@theme` tokens), shadcn/ui primitives restyled, Motion (`LazyMotion` + `m`), React `<ViewTransition>`, Phosphor icons (Bold; `/ssr` in server components) | F7 |
| Fonts | `next/font/local` with static subset files from `scripts/fonts.py` | D3 |
| STT | Sarvam Saaras (`/speech-to-text`, `mode: codemix`) | |
| TTS | Sarvam Bulbul v4 Flash (fallback: browser `speechSynthesis` `hi-IN`) | |
| LLM | OpenAI `gpt-5.4-mini` via `lib/llm/openai.ts` (Chat Completions, strict JSON-schema output, lowest reasoning effort) | One key, `OPENAI_API_KEY` (§7, R19) |
| Calls | Bolna: outbound agents, webhooks, `report_quote` custom function | |
| Share images | `@vercel/og` **1.0.3** (pinned exactly, installed as the npm alias `vercel-og` and loaded as a server-external package), Node runtime, static TTFs | The Satori bundled in Next 16.4 breaks Hindi conjuncts (F5), and Next aliases the import `@vercel/og` to that bundled copy in production builds, hence the alias name. 1.0.3 ships Satori 0.33.5, the version patched for the September 2026 RCE advisory (GHSA-wx4j-mvgx-mqwp). Never use an older `@vercel/og`. |
| Bot check | **Vercel BotID**, Basic level (free on every plan, no keys, no extra account) on `POST /api/voice/order`, `POST /api/tts` and the sandbox | G3, T6 |
| Tests | Vitest (`node` + `edge-runtime` with `convex-test`), Playwright (fake audio, Pixel 7), `size-limit` | F9 |

## 2. System diagram

```
Contractor phone/desktop (PWA, /app)
  │ audio (webm/opus or mp4, 24 kbps mono, ≤25 s; ≤15 s in sandbox)
  ▼
Vercel route /api/voice/order  (runtime nodejs, preferredRegion bom1)
  ├─ checkBotId(), then the Convex Auth token, the rate limits and the daily ₹ cap
  ├─ Sarvam STT ──► streams transcript to the client first
  ├─ OpenAI parse (order schema)
  └─ Convex mutation orders.createDraft (as the user) ──► realtime ──► Confirm screen
                                 │ confirm
                                 ▼
               orders.startSweep (mutation) ── creates calls ── enqueues dial jobs
                                 │
            ┌────────────────────┴────────────────────┐
     mode=sim: sim.runCall (internal)         mode=live: internal.calls.claimDial (mutation, all guards, atomic)
     writes callEvents with atMs                       └─► dial workpool ─► Bolna POST /call
            │                                     Bolna ─► /bolna/webhook (HTTP action) ─► ingest ─► process
            │                                     Bolna ─► /bolna/report-quote (custom function, provisional)
            └──────────────► calls completed (transcript) ◄─────┘
                                 │ llm workpool (3 retries)
                                 ▼
                    quotes.extract ─► lib/pricing.ts (landed, comparable, citable)
                                 │
                    orders.advance ─► haggle ─► match call ─► ready (ranking frozen)
                                 │
                    Result ─► place (undo window) ─► confirm call (relay)
                    Share ─► /p/[publicId] + /p/[publicId]/opengraph-image
```

## 3. Folder structure

```
app/
  (marketing)/                 server components; no Convex client on the page
    page.tsx                   landing (/)
    dealer/page.tsx            Hindi dealer opt-in (/dealer)
    privacy/page.tsx           privacy notice (/privacy)
    p/[publicId]/page.tsx      shared parchi (fetchQuery)
    p/[publicId]/opengraph-image.tsx   PNG via @vercel/og 1.0.3 (Node); the URL is hashed in production
    p/[publicId]/parchi.png/route.ts   the same PNG at a fixed URL, for navigator.share
  (product)/
    layout.tsx                 ConvexAuthNextjsProvider + ConvexClientProvider
    app/page.tsx               home (/app)
    app/onboarding/page.tsx
    app/order/[id]/{confirm,dealers,sweep,result,placed}/page.tsx
    app/admin/page.tsx         founders only (requireAdmin); read-only, writes run from the Convex CLI (R18)
    app/admin/dealers/page.tsx founders only: dealer applications; approve, restrict, re-allow (R24, the one panel write)
    try/page.tsx               sandbox (/try); Google sign-in (pending people too), sim only
    present/page.tsx           presenter: <iframe src="/app?embed=1" allow="microphone; autoplay">
    styleguide/page.tsx
  api/voice/order/route.ts     STT + parse fast path (bom1)
  api/tts/route.ts             read-back audio for a draft (bom1)
  api/e/route.ts               analytics events (G6)
  manifest.ts                  scope and start_url /app
proxy.ts                       / → /app when a session cookie exists; sets the lang cookie
public/sw.js                   minimal offline fallback
app/fonts/                     committed static font files (from scripts/fonts.py)
assets/og/                     static TTFs for OG images
components/mb/                 presentational components (props only)
features/                      hooks and containers that call useQuery/useMutation
lib/
  pricing.ts haggle.ts numbers.ts commands.ts (+ .test.ts)
  liveGuards.ts ist.ts         the §11 guards as pure functions; IST day and call hours
  transcript.ts                transcript turns and the S5 disclosure check
  i18n/reasons.ts              cancelReason → dictionary key
  i18n/{hi,en}.ts getDict.ts useT.ts
  config.ts                    GST, call hours, limits, price-band seeds, brand tiers and CITY_AREAS per city, DELIVER_BY
  client/{recorder,ptt,earcons,haptics}.ts
convex/
  schema.ts auth.ts auth.config.ts http.ts crons.ts
  contractors.ts sites.ts dealers.ts orders.ts calls.ts quotes.ts share.ts waitlist.ts events.ts admin.ts
  sandbox.ts settings.ts limits.ts tts.ts
  lib/access.ts                requireContractor, requireOwner, requireAdmin
  lib/functions.ts             the guarded builders for every public function (serverMutation: CONVEX_SERVER_SECRET, no session)
  lib/projections.ts lib/hash.ts  publicDealer/publicCall; HMAC phone and IP hashes
  lib/live.ts lib/optOut.ts    callLog counts for claimDial; the opt-out that acts at once
  lib/liveCalls.ts             live-call bookkeeping in one mutation: apply an execution by rank, finish, kick, retry
  pools.ts                     workpool definitions (dial, llm, media)
  bolna.ts                     internal: dialJob, prepareDial, fetchExecution, stopCall, ingest, processEvent, watchdog, reportQuote, startRetry
  bolnaHttp.ts                 HTTP: /bolna/webhook, /bolna/report-quote, /bolna/web-call-session (admin web calls)
  llm.ts                       internal: extractQuote (and parse helpers shared with the route)
  media.ts                     copyRecording (internal); recToken (public, ownership-checked); /rec HTTP route
  sim/{personas,runCall}.ts    internal
  seed.ts                      internal (CLI only); admin.resetDemo for the presenter
scripts/fonts.py               generates app/fonts/*
scripts/bolna-check.ts         pnpm bolna:check (wallet, concurrency, agents, webhooks; read-only)
scripts/bolna-sync.ts          pnpm bolna:build (offline) and pnpm bolna:sync: creates or updates the four agents from bolna/agents/ (never dials, R12)
bolna/agents/                  versioned agent configs built from docs/CALL_SCRIPT.md (quote, haggle, match, confirm); placeholders for URL, secret, target
lib/bolna/                     pure: status map and deadlines, execution parser, allow-listed API client, user_data, report_quote, agent builder, web-call demo
features/admin/AgentsPanel.tsx /app/admin/agents: founders' browser web calls with the four agents (tap to start; no phone call)
features/admin/DealerAppsPanel.tsx /app/admin/dealers: dealer applications, confirmation sheets with a note (R24)
convex/dealerSignup.ts         /dealer's serverMutation: apply (R24, R25: one-time ticket, optional Google)
convex/dealerOtp.ts            /dealer's number check through Bolna's code: send, check (serverActions); syncFromBolna (admin) (R25)
convex/dealerApps.ts           the panel's admin-only list and writes; CLI: revealPhone, importLegacyWaitlist (R24)
lib/server/googleToken.ts      /dealer's optional Google sign-in: tokeninfo check against GOOGLE_CLIENT_ID (R25)
lib/bolna/verifiedNumbers.ts   parsing Bolna's verified-numbers answers and errors (R25)
evals/                         parse.golden.json, extract.golden.json, runners
e2e/                           Playwright tests, demo.wav
docs/                          this pack
design/reference/              HTML mockups from the design canvas
```

## 4. Convex schema (starting point)

```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

const material = v.union(v.literal("tmt_steel"), v.literal("cement"));
const unit = v.union(v.literal("kg"), v.literal("ton"), v.literal("quintal"), v.literal("bag"));
const mode = v.union(v.literal("sim"), v.literal("live"));
const round = v.union(v.literal("quote"), v.literal("haggle"), v.literal("match"), v.literal("confirm"));
// "both" may come from the parse, but Confirm requires one tier per item ("दोनों" is P1, R10)
const tier = v.union(v.literal("branded"), v.literal("local_isi"), v.literal("any"), v.literal("both"));
const gstMode = v.union(v.literal("included"), v.literal("extra"), v.literal("unknown"));
// fixed delivery-time set (R7); the dictionary holds the spoken phrase for each
const deliverBy = v.union(
  v.literal("today"), v.literal("tomorrow_morning"), v.literal("tomorrow"),
  v.literal("day_after"), v.literal("this_week"), v.literal("flexible"),
);
const flag = v.union(
  v.literal("gst_unclear"), v.literal("delivery_unknown"), v.literal("unloading_unknown"),
  v.literal("outlier"), v.literal("low_confidence"), v.literal("partial_stock"),
  v.literal("missing_item"), v.literal("unit_mismatch"), v.literal("tier_mismatch"),
  v.literal("no_bill"), v.literal("weight_unknown"), v.literal("brand_unknown"),
  v.literal("not_read_back"), v.literal("rate_not_in_transcript"), v.literal("out_of_band"),
  v.literal("stock_unknown"), v.literal("lump_sum_mismatch"),
);
// telephony lifecycle only (R4); rank table in §6.3
const callStatus = v.union(
  v.literal("queued"), v.literal("dialing"), v.literal("ringing"), v.literal("in_progress"),
  v.literal("disconnected"), v.literal("completed"), v.literal("no_answer"), v.literal("busy"),
  v.literal("failed"), v.literal("cancelled"),
);
// what the call achieved, set by extraction or the confirm flow (R4)
const callOutcome = v.union(
  v.literal("quoted"), v.literal("declined"), v.literal("callback_requested"), v.literal("no_quote"),
  v.literal("opted_out"), v.literal("disclosure_failed"), v.literal("terms_changed"), v.literal("confirmed"),
);
// why a call ended "cancelled" (R18): a refused dial (the claimDial guard codes, §11) or the queue,
// round, opt-out or stop button ending it; the app shows each code in hi and en (dial.*)
const cancelReason = v.union(
  v.literal("config"), v.literal("live_off"), v.literal("not_verified"), v.literal("contractor_daily_cap"),
  v.literal("no_consent"), v.literal("dealer_daily_orders"), v.literal("dealer_order_calls"),
  v.literal("test_daily_calls"), v.literal("call_hours"), v.literal("order_call_cap"), v.literal("no_from_number"),
  v.literal("trial_test_phones_only"), v.literal("test_phone_unlisted"), v.literal("no_billed_key"), v.literal("invalid_number"),
  v.literal("demo_dealer"), v.literal("phone_hash_mismatch"), v.literal("a2p_not_declared"), v.literal("live_stage"),
  v.literal("queue_timeout"), v.literal("round_closed"), v.literal("opted_out"), v.literal("stopped"),
  v.literal("bolna_rescheduled"), v.literal("dealer_restricted"),  // dealer_restricted: R24
);
export const consent = v.union(v.literal("test_ok"), v.literal("opted_in"), v.literal("unknown"), v.literal("opted_out"));

export const orderItem = v.object({
  id: v.string(),
  material,
  diameterMm: v.optional(v.number()),
  grade: v.optional(v.string()),        // Fe500 | Fe500D | Fe550D
  cementType: v.optional(v.string()),   // OPC43 | OPC53 | PPC | PSC
  tier: v.optional(tier),               // steel: branded | local_isi; cement: branded | any (default: last choice, else any, R8)
  brand: v.optional(v.string()),        // only from the config brand list
  quantity: v.optional(v.number()),     // optional while draft; required at confirm
  unit: v.optional(unit),
});

export const quoteLine = v.object({
  orderItemId: v.string(),
  rate: v.number(), rateUnit: unit,     // as spoken
  gstMode,                              // per line (B7)
  brandOffered: v.optional(v.string()),
  tierOffered: v.optional(tier),
  inStock: v.union(v.literal("yes"), v.literal("partial"), v.literal("no"), v.literal("unknown")),
  creditRate: v.optional(v.number()),   // if the credit rate differs from cash
});

export default defineSchema({
  ...authTables,

  contractors: defineTable({
    userId: v.id("users"),
    name: v.string(),                    // /^[\p{L}\p{M} ]+$/u, at most 24 graphemes (R13)
    phoneE164: v.optional(v.string()),
    language: v.union(v.literal("hi"), v.literal("en")),
    verified: v.boolean(),               // set only by admin.verifyContractor (logged)
    liveDailyCap: v.number(),
    consentAt: v.number(),               // privacy notice accepted
    tierPrefs: v.optional(v.object({ tmt_steel: v.optional(tier), cement: v.optional(tier) })),
    isDemo: v.optional(v.boolean()),     // the seeded demo contractor (B8); admin.claimDemoContractor touches only these
  }).index("by_user", ["userId"]).index("by_phone", ["phoneE164"]),   // one verified contractor per phone (R18)

  sites: defineTable({
    contractorId: v.id("contractors"),
    name: v.string(), city: v.string(),
    area: v.string(),                    // one of CITY_AREAS[city] in lib/config.ts, never free text (R7)
    lat: v.optional(v.number()), lng: v.optional(v.number()),
    isDefault: v.boolean(),
  }).index("by_contractor", ["contractorId"]),

  dealers: defineTable({
    name: v.string(), area: v.string(), city: v.string(),
    nameHi: v.optional(v.string()),     // Devanagari display name; also matched by voice commands (lib/commands.ts)
    phoneE164: v.string(),               // never returned to clients
    phoneHash: v.string(),
    materials: v.array(material),
    source: v.union(v.literal("seed"), v.literal("admin"), v.literal("optin")),
    consent,
    language: v.optional(v.string()),
    isDemo: v.boolean(),
    simPersona: v.optional(v.string()),
    restricted: v.optional(v.boolean()),  // set in the founders' panel (R24): never listed, never dialled (claimDial guard)
  }).index("by_city", ["city"]).index("by_phoneHash", ["phoneHash"]),

  dealerApplications: defineTable({      // /dealer self-onboarding (R24); never makes a number callable by itself (S2)
    shopName: v.string(), area: v.string(), city: v.string(),
    materials: v.array(material),
    phoneE164: v.string(),               // server-only: never returned to any client; the panel shows it masked
    phoneHash: v.string(),
    phoneVerifiedAt: v.optional(v.number()),   // the dealer typed the code Bolna sent to this number (R25)
    verifyMethod: v.union(v.literal("bolna_otp"), v.literal("none")),  // none: the founders verify by calling back
    bolnaVerifiedAt: v.optional(v.number()),   // on Bolna's trial "Verified numbers" list (our code step, or found by a sync)
    otpTicket: v.optional(v.object({ hash: v.string(), exp: v.number() })),   // server-only: the form's one-time ticket (SHA-256, 30 min)
    bolnaOtp: v.optional(v.object({ requestId: v.string(), sentAt: v.number(), tries: v.number() })),  // server-only: the pending code
    google: v.optional(v.object({ subHash: v.string(), email: v.string(), at: v.number() })),  // optional Google sign-in (R25)
    geo: v.optional(v.object({ lat: v.number(), lng: v.number() })),     // rounded to 3 decimals (~100 m), optional
    consentAiCalls: v.boolean(), consentAt: v.number(),
    status: v.union(v.literal("pending"), v.literal("approved_test"), v.literal("approved_live"), v.literal("restricted")),
    dealerId: v.optional(v.id("dealers")),     // set on approval (created, or linked by phone hash)
    ipHash: v.string(), createdAt: v.number(),
    reviewedAt: v.optional(v.number()), reviewedBy: v.optional(v.string()),  // reviewedBy: "admin:<userId>"
    fromWaitlist: v.optional(v.boolean()),     // imported from an old /dealer waitlist row (dealerApps:importLegacyWaitlist)
  }).index("by_status_createdAt", ["status", "createdAt"]).index("by_phoneHash", ["phoneHash"]),

  testPhones: defineTable({              // the panel's trial test list (R24), alongside TEST_PHONE_HASHES; counts only with BOLNA_TRIAL=true
    phoneHash: v.string(), dealerId: v.id("dealers"),
    addedBy: v.string(), at: v.number(),
  }).index("by_phoneHash", ["phoneHash"]),

  contractorDealers: defineTable({
    contractorId: v.id("contractors"),
    dealerId: v.id("dealers"),
    relation: v.union(v.literal("regular"), v.literal("saved"), v.literal("blocked")), // saved = dealer book, on by default (R13)
    askFirst: v.boolean(),               // "पहले भी पूछिए": quote call instead of match call
  }).index("by_contractor", ["contractorId"]),

  orders: defineTable({
    ownerUserId: v.id("users"),          // every order, including sandbox ones
    contractorId: v.optional(v.id("contractors")),  // absent for sandbox orders
    kind: v.union(v.literal("app"), v.literal("sandbox")),
    siteId: v.optional(v.id("sites")),
    mode,
    roundSeq: v.number(),                // stale jobs check this
    transcript: v.string(),
    siteText: v.optional(v.string()),    // display only; never sent to agents (R7)
    items: v.array(orderItem),
    deliverBy: v.optional(deliverBy),    // what agents hear (R7); Confirm sets flexible when it wasn't said (R15)
    deliverByText: v.optional(v.string()), // display only
    creditDaysWanted: v.optional(v.number()),
    missing: v.array(v.string()),
    notes: v.optional(v.array(v.string())),
    status: v.union(
      v.literal("draft"), v.literal("confirmed"), v.literal("sweeping"), v.literal("haggling"),
      v.literal("matching"), v.literal("ready"), v.literal("placing"), v.literal("placed"),
      v.literal("cancelled"), v.literal("failed"),
    ),
    selectedDealerIds: v.array(v.id("dealers")),
    ranking: v.optional(v.array(v.id("quotes"))),   // frozen at "ready"
    winningQuoteId: v.optional(v.id("quotes")),
    placeJobId: v.optional(v.string()),
    undoUntil: v.optional(v.number()),   // end of the undo window after place (ms), so a reload can show the countdown
    matchDealerId: v.optional(v.id("dealers")),  // the regular dealer held for the match call at sweep start (P1); absent when askFirst
    haggleSkipped: v.optional(v.boolean()),       // fewer than 2 citable quotes: no haggle round (haggle.skipped, R15)
    termsChangedQuoteIds: v.optional(v.array(v.id("quotes"))),  // placed offers set aside after the confirm call (terms changed, declined, not reached; C5); never offered again
    setAsideReason: v.optional(v.union(v.literal("terms_changed"), v.literal("declined"), v.literal("not_reached"))),  // why the latest one was set aside (Result's notice)
    placedQuoteId: v.optional(v.id("quotes")),   // the offer being placed (placing → placed); cleared on undo or set-aside
    followUpsRunning: v.optional(v.array(v.object({ callId: v.id("calls"), dealerId: v.id("dealers"), quoteId: v.id("quotes") }))),  // R28: follow-ups on now (§6.14)
    publicId: v.optional(v.string()),    // legacy (before the shares table); no longer written or read
    shareMode: v.optional(v.union(v.literal("full"), v.literal("savings"), v.literal("munshi"))),  // legacy, as above
    expiresAt: v.optional(v.number()),   // sandbox: 24 h
  }).index("by_owner", ["ownerUserId"]).index("by_contractor", ["contractorId"]).index("by_publicId", ["publicId"]).index("by_expiresAt", ["expiresAt"]),

  calls: defineTable({
    orderId: v.id("orders"), dealerId: v.id("dealers"),
    round, mode, attempt: v.number(), roundSeq: v.number(), // every retry is a new row, attempt + 1 (R4)
    status: callStatus,
    statusRank: v.number(),              // only increases; final states never change (§6.3)
    outcome: v.optional(callOutcome),    // set by extraction or the confirm flow, never by webhooks (R4)
    deadlineAt: v.number(),              // queued: 10-minute queue deadline (R2); then per §6.2
    providerExecutionId: v.optional(v.string()),
    startedAt: v.optional(v.number()), endedAt: v.optional(v.number()),
    durationSec: v.optional(v.number()),
    costUsdCents: v.optional(v.number()),// Bolna total_cost is in US cents
    recordingStorageId: v.optional(v.id("_storage")),
    transcript: v.optional(v.string()),
    lastCaption: v.optional(v.string()), // sim only; denormalised for cheap rendering
    provisionalTotal: v.optional(v.number()), // paise, from report_quote; display only, never cited
    slots: v.optional(v.object({ rate: v.boolean(), gst: v.boolean(), delivery: v.boolean(), credit: v.boolean() })),
    callbackWhenText: v.optional(v.string()),
    retryAt: v.optional(v.number()),     // live only: this call's one retry is scheduled then (no answer: +3 min; callback: the dealer's time, ≤ 30 min; P8, R15); the round waits for it
    citedQuoteId: v.optional(v.id("quotes")),    // haggle and match calls: the citable quote whose exact total was cited (C3)
    confirmQuoteId: v.optional(v.id("quotes")),  // confirm calls: the approved quote being relayed (C5)
    followUpOf: v.optional(v.id("quotes")),      // R28: a quote-round follow-up of this quote, while the order is ready (§6.14)
    followUpAsk: v.optional(v.array(v.string())), // R28: the gap keys it asks (lib/followUp.ts)
    extract: v.union(v.literal("pending"), v.literal("running"), v.literal("done"), v.literal("failed")),
    extractAttempts: v.number(),
    terminationReason: v.optional(v.string()),   // Bolna's, kept server-side
    cancelReason: v.optional(cancelReason),      // set with status "cancelled" (R18); safe to show
  }).index("by_order", ["orderId"]).index("by_execution", ["providerExecutionId"]).index("by_deadline", ["deadlineAt"])
    .index("by_mode_status", ["mode", "status"])    // claimDial counts active live calls (R2)
    .index("by_dealer_status", ["dealerId", "status"]),   // opt-outs cancel a dealer's queued calls and recordings (R15)

  callEvents: defineTable({
    callId: v.id("calls"), orderId: v.id("orders"),
    kind: v.union(v.literal("status"), v.literal("caption"), v.literal("note")),
    speaker: v.optional(v.union(v.literal("agent"), v.literal("dealer"))),
    text: v.string(),
    atMs: v.number(),                    // sim writes the script once; the client reveals by server time
  }).index("by_call", ["callId"]).index("by_order", ["orderId"]),

  quotes: defineTable({
    orderId: v.id("orders"), dealerId: v.id("dealers"), callId: v.id("calls"),
    round,
    lines: v.array(quoteLine),
    lumpSumTotal: v.optional(v.number()),
    lumpSumIncludes: v.optional(v.array(v.string())),   // gst, delivery, unloading
    deliveryCharge: v.optional(v.number()),             // undefined = unknown (never "free")
    unloadingCharge: v.optional(v.number()),
    deliveryEtaText: v.optional(v.string()),
    deliveryBy: v.optional(deliverBy),   // normalised, for the "earlier delivery" tie-break (L1)
    creditDays: v.optional(v.number()),
    billType: v.union(v.literal("pakka"), v.literal("kachcha"), v.literal("unknown")),
    weightBasis: v.union(v.literal("kanta"), v.literal("standard"), v.literal("unknown")),
    validityText: v.optional(v.string()),
    firstTotal: v.optional(v.number()),  // match call: computed in code from what he said before any number was cited (R1)
    firstComparable: v.optional(v.boolean()), // whether that first-rate quote was comparable; only then is it the savings basis (R17)
    saidFinal: v.boolean(),
    confidence: v.number(),
    readBackConfirmed: v.boolean(),      // computed in code from the transcript, not by the LLM
    totalSource: v.union(v.literal("computed"), v.literal("stated")), // stated = his own all-in figure (R1)
    landed: v.object({ subtotal: v.number(), gst: v.number(), delivery: v.number(), unloading: v.number(), total: v.number() }), // integer paise; total is a whole rupee (R5)
    flags: v.array(flag),
    comparable: v.boolean(),             // may win
    citable: v.boolean(),                // may be cited in haggle/match
    followUpOf: v.optional(v.id("quotes")),   // R28: that quote with a follow-up's answers merged in (callId = the follow-up call)
    supersededBy: v.optional(v.id("quotes")), // R28: replaced by a follow-up; kept for history and proof, never ranked
  }).index("by_order", ["orderId"]).index("by_call", ["callId"]),

  providerEvents: defineTable({
    executionId: v.string(), status: v.string(), receivedAt: v.number(), processed: v.boolean(),
  }).index("by_exec_status", ["executionId", "status"]),

  waitlist: defineTable({
    name: v.string(), phoneE164: v.string(), city: v.string(),  // city defaults to "Jaipur" on /dealer
    area: v.optional(v.string()), materials: v.optional(v.array(v.string())),
    role: v.union(v.literal("contractor"), v.literal("munshi"), v.literal("other"), v.literal("dealer"), v.literal("home_builder")), // home_builder: old rows only
    nextOrder: v.optional(v.string()), ref: v.optional(v.string()),  // nextOrder: this_week | this_month | later
    consentContact: v.boolean(),
    consentAiCalls: v.optional(v.boolean()),  // dealers from /dealer: agrees to AI quote calls
    ipHash: v.string(), createdAt: v.number(),
  }).index("by_phone", ["phoneE164"]),

  shares: defineTable({                  // shared parchi links (G4): one per order and mode, so a sent link never changes
    orderId: v.id("orders"),
    mode: v.union(v.literal("full"), v.literal("savings"), v.literal("munshi")),
    publicId: v.string(),                // 16 random bytes as 22 base64url characters (128 bits), revocable
    createdAt: v.number(),
  }).index("by_publicId", ["publicId"]).index("by_order_mode", ["orderId", "mode"]),

  events: defineTable({                  // funnel analytics (G6); no personal data
    name: v.string(), props: v.optional(v.string()), path: v.string(), at: v.number(),
  }).index("by_name_at", ["name", "at"]),

  extractCache: defineTable({ hash: v.string(), model: v.string(), result: v.string() }).index("by_hash", ["hash"]),

  ttsCache: defineTable({                // spoken result audio, deleted after 24 h
    hash: v.string(), storageId: v.id("_storage"), createdAt: v.number(),
  }).index("by_hash", ["hash"]).index("by_createdAt", ["createdAt"]),

  auditLog: defineTable({
    actor: v.string(), action: v.string(), target: v.string(), at: v.number(), detail: v.optional(v.string()),
  }).index("by_target", ["target"]),

  callLog: defineTable({                 // kept 1 year: number hash, time, consent (no audio, no text)
    phoneHash: v.string(), at: v.number(), consent: v.string(), round,
    outcome: v.optional(v.string()),     // filled in when the call ends
    orderId: v.id("orders"), callId: v.id("calls"),   // written by claimDial at reservation (R3)
    contractorId: v.id("contractors"),                // per-contractor daily cap (guard 2, R18)
    opensSlot: v.boolean(),                           // this call used a daily order slot (opening, or no earlier opening, R18)
  }).index("by_phoneHash_at", ["phoneHash", "at"]).index("by_order", ["orderId"])
    .index("by_contractor_at", ["contractorId", "at"]),

  priceBands: defineTable({              // dated sanity bands for citing (C4); seeded from lib/config.ts, set with admin:setPriceBand (R13, R18)
    city: v.string(), material,
    unit,                                // kg for steel, bag for cement
    minPaise: v.number(), maxPaise: v.number(),
    updatedAt: v.number(), updatedBy: v.string(),
  }).index("by_city_material", ["city", "material"]),
});
```

## 5. Identity, auth and access
- **Google sign-in** (R26): `convex/auth.ts` registers Convex Auth's Google provider (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`). The client calls `signIn("google", { redirectTo })`; Google returns to `<CONVEX_SITE_URL>/api/auth/callback/google`, Convex sends the browser back to `SITE_URL` with a one-time code, and the Next.js proxy (`proxy.ts`) swaps it for the session cookies. Only name, email (with Google's verified flag) and picture are stored on `users`. Anonymous sign-in is gone. The client asks to come back to its own origin (`${location.origin}/app`); `callbacks.redirect` allows only SITE_URL and AUTH_REDIRECT_ORIGINS. A one-off `freshStart:wipe` (CLI, confirmation phrase) deletes everything but the admins, DEMO dealers and price bands.
- **Access** (R26): `users.access` = `pending` (absent), `approved` or `blocked`, set by the founders in `/app/admin/users` (`adminUsers.setAccess`, audited). `accessOf()` (`convex/lib/access.ts`) treats admins (ADMIN_USER_IDS, or a Google-verified email in ADMIN_EMAILS) as approved. `/app` asks `account.me` and shows sign-in, onboarding (name, WhatsApp number, address, consent, site), the waiting screen, the blocked screen or Home.
- **Where it's enforced:** `userQuery`/`userMutation` refuse blocked people; `contractorQuery`/`contractorMutation` need approval; `limits.consumeVoice` and `sweep.start` for app orders need approval; `calls.claimDial` treats an unapproved owner as unverified. The sandbox (`/try`) is open to pending people with its own caps.
- **Every public query and mutation** is built with a guarded builder (`convex/lib/functions.ts`), loads the contractor from `ctx.auth` and checks ownership of every order, call and quote it touches. Results go through allowlist projections (`publicDealer`, `publicCall`). Clients never receive `dealers.phoneE164`, phone hashes, provider ids, storage ids or costs.
- **Sessions** last up to 90 days (30 days inactive) with persistent cookies. New accounts are rate-limited deployment-wide (`anonSignUp`, the old name kept).
- **Test sign-in** (`convex/e2eAuth.ts`): a credentials provider for Playwright, inert unless `E2E_LOGIN_SECRET` (48+ chars) is set and `SITE_URL` is `http://localhost`; addresses must be `@e2e.molbhav.test`; it never grants admin.
- **Internal only:** `sim.*`, `llm.*`, `bolna.*`, `media.copyRecording`, `seed.*`, `calls.claimDial`, the watchdog.
- **Live mode** requires `contractors.verified` (S1): set by `admin.verifyContractor`, an **internal** mutation run from the Convex CLI by someone with deploy access (R18), and logged in `auditLog`. Name and phone are locked at verification.
- **Dealers for live mode** are added only through `admin.addDealer` (internal, CLI) or a `/dealer` application that a founder approves in `/app/admin/dealers` (S2, R24). Every other admin write is internal; the `ADMIN_USER_IDS` role opens the read-only `/app/admin`, the dealer applications panel (approve, restrict, re-allow: admin-only mutations, each audit-logged, R24), "Reset demo" and the presenter tools.
- **Server-to-Convex calls** from Vercel routes run as the user (their auth token is forwarded). The sandbox route uses `sandbox.createDraft({ serverSecret })`, which checks `CONVEX_SERVER_SECRET`.
- **Prompt-injection hygiene** (S3, R7): names are letters and marks only (max 24 graphemes); site area from the city's area list; delivery time from `deliverBy`; brand from the config enum; free text never reaches agent prompts.

## 6. Flows

### 6.1 Voice order (fast path, F3)
1. The client records with `lib/client/recorder.ts`. It probes MIME types in order: `audio/webm;codecs=opus` → `audio/webm` → `audio/mp4`, at 24 kbps mono. It stops the tracks after each take and discards clips with under 0.6 s of speech.
2. `POST /api/voice/order` (`app/api/voice/order/route.ts` → `lib/server/voiceOrder.ts`; Node runtime, `bom1` through `vercel.json`'s `regions`, because Next.js 16.4 deprecates the route-level `preferredRegion`) with multipart `audio` (≤ 1 MiB; optional `durationMs` ≤ 30,000) and the session cookie. The route calls `checkBotId()` (403 for bots), needs the Convex Auth token (401), checks the input (400 `bad_request`, 413 `too_long`) and its config (503 `not_configured`: names of missing env vars are logged, never values), then calls `limits.consumeVoice` **as the user** with `CONVEX_SERVER_SECRET` (the §6.13 pattern, so a browser can't spend the shared budget): per-user `voiceUser` (8 in a burst, 30/h), per-IP-hash `voiceIp` (30 in a burst, 120/h; carriers share IPs behind CGNAT) and the daily ₹ cap `VOICE_DAILY_INR_CAP` (Convex env, default ₹500, shared with `/api/tts`; spend estimated up front by `lib/voiceCost.ts`: ₹0.40 a spoken order, ₹0.15 a typed one, ₹1 per 1,000 read-back characters; days start at midnight IST; a new cap applies at once). All checks pass or nothing is consumed (429 `rate_limited` / `cap_reached` with `Retry-After`).
3. Sarvam STT (`saaras:v4`, `mode: codemix`, `language_code` from the `lang` cookie, domain `keyterms`: brands, grades, cement types, trade words, the city's areas). The response is NDJSON: `{"type":"transcript","text":…}` is **streamed to the client immediately**, then `{"type":"draft","orderId":…}` or `{"type":"error","code":…}` (`stt_failed`, `no_speech`, `parse_failed`, `rate_limited`, `unauthenticated`, `server_error`).
4. OpenAI parse with the order schema (§8.1) in strict mode, at the lowest reasoning effort (`lib/llm/openai.ts`), one attempt, 8 s timeout (`lib/server/llm.ts`). `lib/parse.ts` validates with zod (a bad field becomes "not said") and converts null to undefined; then code maps it: stable ids (`steel`, `cement`, then `steel_2`…), brands only from `BRAND_TIERS` (their tier follows the list), sizes only from the TMT list, cement in bags, "both" kept (R10), suta never mapped even if the model did (P7), `siteText` matched to `CITY_AREAS` (R7).
5. `orders.createDraft` (contractor, as the user) re-checks every field (items must already be in `lib/parse.ts`'s sanitized form), resolves the site in code (nothing said → the default site; a listed area → the contractor's site there, or a new site for that area, at most 10; anything else → no site and `missing: ["site"]`), pre-selects cement's tier from the contractor's last choice else "any" (R8), computes `missing` itself (`<itemId>:<field>`, in asking order, plus `site`), writes a sim draft and returns its id. The client navigates to Confirm (prefetched).
6. Audio is never stored (B6). The typed fallback posts JSON `{ text }` (≤ 500 characters), skips step 3 and gets its text echoed as the transcript line.
7. Target: transcript in about 1.5 s, Confirm in about 2.5 s after release, on 4G. Each request logs one JSON line (`evt: "voice_order"`) with per-step milliseconds (bot, read, limits, stt, parse, draft, total), the outcome, sizes and the model: never the transcript.
8. The read-back on Confirm (V3) comes from `POST /api/tts` with exactly `{ draftId }` (`lib/server/readbackAudio.ts`; Node, `bom1`; BotID-protected; the client plays the returned `audio/mpeg`): it checks auth and ownership through `orders.readBack` (run as the user; 404 for someone else's draft, 409 `not_draft` / `incomplete`), **builds the text on the server from the draft** with `lib/readback.ts` (never from the request; any other key in the body is a 400), consumes `ttsUser` (10 in a burst, 60/h) and the shared cap, calls Bulbul v4 Flash and returns MP3 (502 `tts_failed` otherwise). There is no endpoint that speaks arbitrary text.

### 6.2 Sweep start and dispatch
1. `orders.startSweep({ orderId, mode })` checks ownership and confirmation (every item has quantity, unit and a single tier: branded, local_isi or any). In live mode it also checks `MAX_LIVE_SWEEPS_PER_HOUR` (R2). It increments `roundSeq` and creates `calls` rows (`round: "quote"`) for the selected dealers, **except the regular dealer unless `askFirst`**; he is held for the match call (P1).
2. Sim: schedule `sim.runCall` per call with staggered starts.
3. Live (Phase 8B): `orders.startSweep` (`sweep.start`) first checks that live mode is available to this contractor right now (the `settings.liveAvailable` answer; `live_unavailable` with its reason code otherwise), that the order has a site (agents say its area, R7; `no_site`) and takes one `MAX_LIVE_SWEEPS_PER_HOUR` token (`live_sweep_limit`). `createCall` then enqueues a `dial` workpool job per call (`bolna.dialJob`). Each job runs `internal.calls.claimDial(callId)` (§11), which checks every guard, reserves a live slot, moves `queued → dialing` and arms the 30 s dialing watchdog, all in one transaction. Only after `ok`: `bolna.prepareDial` re-reads the call (still `dialing`, no execution yet), the round and the dealer's consent (an opt-out may have landed after the claim, R18), checks the round's agent id and `BOLNA_API_KEY`, and builds `user_data` in code (`lib/bolna/userData.ts`, S3); anything wrong closes the call without dialing. Then exactly one `POST /call` (agent of the round, `from_phone_number` omitted on the trial, `retry_config: { enabled: false }`). `claimDial` returns `ok`, `refuse` (reason code; the call is `cancelled` with that `cancelReason`, R18, and the round moves on) or `wait` (no free slot, R2): on `wait` the call stays `queued`; its job chain re-checks every 15 s (`WAIT_BACKSTOP_MS`), and every live call that reaches a final status kicks all waiting calls at once; at the 10-minute queue deadline it is `cancelled` with `queue_timeout`. The live slot count, not the pool's parallelism, limits concurrent calls (dial pool parallelism 1). **A dial whose outcome is unknown (timeout, network, 5xx) is never retried**: a second job for the same call gets `skip` from `claimDial`, and the dialing watchdog looks the execution up (below). A 4xx from Bolna means no call was placed: the call fails at once.
4. Each call gets a **deadline** (`deadlineAt`), and at each deadline `engine.watchdog` hands a live call past `claimDial` to `bolna.watchdog`, which polls Bolna (`GET /executions/{id}`) and applies what it says before deciding (`lib/bolna/status.ts` `watchdogDecision`). Deadlines: queued 10 min; **dialing 30 s** (R15): with no execution id the watchdog looks the dial up in `GET /v2/agent/{id}/executions` (the round's agent, `from` = 2 minutes before the claim, candidates to the dealer's number, each re-fetched until one echoes our `molbhav_call_id`) and binds it if found, else marks the call `failed` (`dial_unconfirmed`), never redialling; if Bolna confirms it but still has it queued or initiated, it gets until 60 s after the claim. **Ringing 45 s**; if Bolna says it still rings, until 90 s after the claim (Indian networks ring up to about a minute, and Bolna can't stop a ringing call). **In progress = `call_terminate` + 30 s.** **Disconnected 90 s**, re-armed every 60 s while Bolna post-processes (its docs say `completed` can take 2–3 minutes), at most 5 minutes after the line dropped. A call past its limit is marked `failed` and, if Bolna has it, `POST /call/{id}/stop` is tried (it works only while Bolna still has the call queued). Every live call therefore reaches a final status, which frees its slot.
5. The round advances to haggle when **3 citable quotes are in** or **every call has finished**. Still-queued calls are stopped. Retries are new call rows (attempt + 1) through `claimDial`, within the per-order limit (R3): one live retry of the opening call (quote or match, attempt 1) for `no_answer`, 3 minutes later, if the round is still open; or one for `callback_requested` at the time the dealer gave (read in code from `callbackWhenText` by `lib/callback.ts`: "दस मिनट बाद", "आधे घंटे बाद"; a vague time gets none), if that is within 30 minutes and the round is still open (P8). The call carries `calls.retryAt` until the retry row is created at its scheduled time (`bolna.startRetry`), so its 10-minute queue deadline starts then (R15), and a call with a retry scheduled counts as unfinished, so the round waits for it (at most 30 minutes). Sim calls never retry.
6. "सब कॉल रोकिए" (stop all): cancels queued jobs, closes every unfinished call as `cancelled` (`stopped`), tries `POST /call/{id}/stop` for live calls Bolna has (a call in progress ends on its own at `call_terminate`), kicks other orders' waiting calls, and moves the order to `ready` with what we have.

### 6.3 Live call lifecycle (Bolna, B3)
- `POST https://api.bolna.ai/call` with `Authorization: Bearer`. The body has `agent_id`, `recipient_phone_number`, `from_phone_number` (omitted on the trial: Bolna then uses the account's default number), `user_data` (the CALL_SCRIPT variables, `molbhav_call_id` and `item_keys` included, all built in code) and `retry_config: { enabled: false }`. The response gives `execution_id`, stored as `providerExecutionId`.
- `POST /bolna/webhook` (Convex HTTP action, `convex/bolnaHttp.ts`): check the `x-molbhav-secret` header against `BOLNA_WEBHOOK_SECRET` (constant time; a secret shorter than 24 characters refuses everything, 503) → `internal.bolna.ingest` (dedupe on executionId + status into `providerEvents`; map to our call by `providerExecutionId`, or by `context_details.recipient_data.molbhav_call_id` if the webhook beats our write; an unmapped execution, such as a founder's browser web call, is recorded and ignored) → return 200 at once. Bolna has no payload signature (only its source IPs `13.203.39.153`, `13.126.9.249`, `13.202.133.53`, which Convex can't filter on), so the header secret and the re-fetch are the protection.
- `internal.bolna.processEvent` re-fetches `GET /executions/{id}` (up to 5 tries, 2–16 s apart; then the watchdog's next poll catches up) and applies **what Bolna returns, never the webhook body** (`lib/liveCalls.ts` `applyExecution`): it binds the execution to the call only when Bolna echoes our call id; applies a status only if `rank(new) > statusRank`; final statuses never change. **`completed` is the done signal** (not `call-disconnected`). On `completed`: store transcript, duration (`conversation_duration`), `total_cost` (US cents) as `costUsdCents` and `termination_reason`; enqueue the `llm` extraction (same job as sim) and the recording copy (`enqueueRecordingCopy`, the Phase 8C hook). On any final status: write the `callLog` outcome and kick the waiting dial jobs (R2).
- **Status map and ranks (R4).** Webhooks set only `status`; `outcome` comes from extraction (and provisionally from `report_quote`).

  | Bolna status | Our `status` | Rank |
  |---|---|---|
  | `scheduled`, `queued` | `queued` | 0 |
  | `initiated` | `dialing` | 1 |
  | `ringing` | `ringing` | 2 |
  | `in-progress` | `in_progress` | 3 |
  | `call-disconnected` | `disconnected` | 4 |
  | `completed` | `completed` (final), unless `termination_reason` says it never connected: `no_answer`, `dial_timeout`, `voicemail_reached`, `abandoned` → `no_answer`; `busy`, `declined` → `busy`; `invalid_number`, `number_unreachable`, `network_error`, `number_blocked`, `insufficient_balance`, `caller_id_rejected`, `provider_error`, `platform_error` and the like → `failed`; `canceled_via_api` → `cancelled` | 10 |
  | `no-answer` | `no_answer` (final) | 10 |
  | `busy` | `busy` (final) | 10 |
  | `failed`, `error`, `balance-low` | `failed` (final, keep the reason) | 10 |
  | `canceled`, `stopped` | `cancelled` (final) | 10 |
  | `rescheduled` | not expected: Bolna-side retries are off (R2). Mark `cancelled` with reason `bolna_rescheduled`, stop the execution, and log an alert. | 10 |
  | anything unknown | no change; log it | — |

  Bolna's docs (Nov 2026) are explicit that `status` is the telephony lifecycle and `termination_reason` says how the call really ended: a declined or unanswered call can arrive as `completed`. `claimDial` sets `dialing` itself (rank 1) before `POST /call`. The watchdog may set `failed` or `cancelled` (rank 10).
- `POST /bolna/report-quote` (custom function endpoint, C8): verify the same secret header (sent by the tool's `tools_params.headers`), then one mutation (`bolna.reportQuote`) and a JSON reply, well under 100 ms. The agent sends strings (Bolna fills `%(name)s`): `molbhav_call_id`, `stage` (`first` | `final` | `outcome`), `outcome`, `rates` (`<item key>:<rate digits>:<unit>:<gst mode>; …`), `brand`, `stock`, `delivery`, `unloading`, `credit_days`, `bill`, `weight_basis`, `all_in_said` (only a figure the dealer said himself) and `callback_when`; `lib/bolna/reportQuote.ts` parses them strictly. It updates `calls.slots` and `calls.provisionalTotal` (computed by `lib/pricing.ts`; display only, never cited) and records a provisional `calls.outcome`, all only while extraction hasn't decided the call. For the Match agent's `first` stage the reply is `{ "received": true, "cite": true|false }`: true only when his first total is computable (every item, GST mode, delivery and unloading known, pakka bill, like-for-like tier) and higher than the cited citable total (R1, never cite a higher number). With `outcome: opt_out` it applies the opt-out at once (R15): `dealers.consent = opted_out`, cancel that dealer's queued calls, try to stop his other live calls at Bolna, and schedule deletion of all their recordings. With `outcome: confirmed` or `terms_changed` (Confirm agent) it records a provisional `calls.outcome`; extraction confirms it, and if extraction fails the provisional outcome is cleared (an opt-out stands). A browser web call (`molbhav_call_id = webcall-demo`) is answered from the Team test cards without touching the database.
- After **ranking is frozen at `ready`**, late webhooks update only call records, never the ranking (a late `completed` is stored but never extracted).

### 6.4 Sim call lifecycle
`sim.runCall` builds a deterministic dialogue from the persona (seed = `hash(persona, items, round)`, so identical sim calls hit `extractCache`) and **writes the whole script once** as `callEvents` with `atMs` offsets. The client reveals lines by server time, so there is no scheduler storm. `SIM_PACE` = `demo` (whole flow about 1 minute) or `realistic` (2–4 minutes, used in development so the team feels live timing). It writes `calls.transcript` in Bolna's `assistant: … / user: …` format, then enqueues the **same** extraction job as live. With `SIM_EXTRACT=groundtruth` (default in tests and demos) that job takes the persona's ground-truth quote instead of calling OpenAI, but still runs every code check and the pricing; `SIM_EXTRACT=llm` exercises the real extractor.

### 6.5 Extraction
`llm` workpool job (parallelism 4, 3 retries with backoff; stale if `roundSeq` changed):
1. `llm.extractQuote` sends the transcript plus order items to OpenAI (§8.2), checking `extractCache` first (keyed by the prompt version, the model and the input). A missing `OPENAI_API_KEY` or a 4xx other than 429 fails at once (`NonRetryableError`); timeouts, 429, 5xx and empty or non-JSON answers are retried.
2. Outcomes `declined`, `callback`, `opt_out`, `terms_changed` or `confirmed` set `calls.outcome` (`declined`, `callback_requested`, `opted_out`, `terms_changed`, `confirmed`; R4). `opt_out` also applies the opt-out (as in §6.3) if `report_quote` hasn't already. Otherwise:
3. Code checks (C4, S5): the assistant turns before the dealer's first rate include both "AI" and "रिकॉर्ड" (the dealer may interrupt the welcome, so the agent repeats it), else `outcome: disclosure_failed` and the quote is dropped; each extracted rate and any stated all-in figure appears in a dealer turn as digits or Hindi words (`lib/numbers.ts` parser); a dealer "हाँ" follows the agent's read-back (sets `readBackConfirmed`).
4. `lib/pricing.ts` computes landed totals, flags, `comparable` and `citable` (§9), and `outcome: quoted` (or `no_quote`). Then `orders.advance`.
5. If extraction fails after retries, the row shows "रेट समझ नहीं आया · रिकॉर्डिंग सुनिए", and the quote is excluded.

### 6.6 Haggle (round 2) and match (round 3)
`lib/haggle.ts`, pure and tested:
1. Needs at least 2 citable, comparable quotes in the same tier; otherwise skip to match/result.
2. Call #2 citing #1's exact total and terms. If #2 beats #1, call #1 citing #2's new total. Never cite a higher number. At most 2 haggle calls.
2a. **A haggle or match-final quote starts from the same dealer's earlier quote in this order.** Extraction gets that quote as context and overrides only what the dealer changed in this call. Unchanged lines, GST mode, delivery, unloading, brand, bill, weight and credit carry over. The read-back repeats the changed figures and the full terms in the dealer's own words (never a computed total, R1), and the dealer's "हाँ" confirms them. If he gave a new all-in figure without a rate for every item, that figure is the landed total (`totalSource: stated`, §9), and the per-item lines of that quote are no longer cited.
3. **Match call** to the regular dealer (if held): Match agent with the best citable total. His first rate is captured before any number is cited, and `firstTotal` is computed in code from it (P2, R1). If no citable total exists, it is a normal Quote call.
4. Then rank by total within the tier (table order). The winner is the quote with the most credit days among those within 0.5% of the cheapest, then the earlier delivery, then the lower total. Freeze `ranking` and set `ready`.

### 6.7 Place and confirm (round 4, C5)
`placing.place({ orderId, expectedQuoteId })` accepts the frozen winner or another standing ranked offer ("उन्हीं से लीजिए"), never one set aside, and starts the undo window (`UNDO_WINDOW_SEC`: 120 s live, 5 s sim demo). The chosen offer is stored in `placedQuoteId` and the scheduled job id in `placeJobId`, so "रद्द" cancels it; the job dials only if `placedQuoteId` still matches (an undo and a new place make an older job stale). Then a Confirm agent call (relay only).
- `outcome: confirmed` moves the order to `placed`.
- `terms_changed`, `declined` or an opt-out set that offer aside (`termsChangedQuoteIds`, `setAsideReason`) and bring the contractor back to Result with the runner-up (pickWinner over the frozen ranking without it).
- A confirm call that doesn't connect (no answer, busy, failed) or settles nothing leaves the order in `placing` with "dealer से बात नहीं हो पाई" (`placed.notReached`), one retry (R15, never to a dealer who said no or opted out) and "अगला सबसे सस्ता देखिए" (`placing.chooseAnother`, which sets the offer aside as `not_reached`).

Voice confirm goes through `lib/commands.ts` (V4).

### 6.8 Result summary
`tts.summary` builds 2–3 short sentences in code, speaking the site and deadline only if they are non-default, then calls Bulbul v4 Flash. Audio is cached in storage for 24 h. Muted by default when the user has turned the spoken result off (V7).

### 6.9 Sandbox `/try` (G3)
- **Who:** a signed-in visitor (Google, R26; pending people included, blocked people refused). The page shows a sign-in card first; that session is the "device" for the limits below. Sandbox orders have `kind: "sandbox"`, `mode: "sim"`, no `contractorId` and no site, and `expiresAt` 24 h after creation (`lib/sandbox.ts` `SANDBOX`).
- **Sample chips first** (`features/try/TryHome.tsx`): three fixed orders (`SANDBOX_SAMPLES`, the DEMO.md line among them). `sandbox.createSample({ sample, lang })` writes the sample's draft without speech or the LLM, so chips cost nothing and work even without the vendor keys. Limits: `sbx:sample` (6 an hour per session) and `sbx:global`.
- **Typed or spoken** (the mic sits behind a tap, the permission is asked only from the primer's button, 15 s cap): `POST /api/voice/order?sandbox=1`, a `fetch` from the `/try` page, so BotID's challenge headers attach (its client matches on the path). The route calls `checkBotId()` (403 for bots) and needs the session token (401). A clip must send `durationMs` and stay within 16 s (the 15 s cap plus the encoder's flush) and 320 KB (413 `too_long`, 400 without a duration). Then `limits.consumeSandbox` as the visitor with `CONVEX_SERVER_SECRET`: `sbx:device` 3 an hour per session, `sbx:ip` 10 an hour per IP hash (`rate_limited`), `sbx:global` 500 sandbox orders a day across the deployment (fixed IST days, shared with the chips; `cap_reached`) and the daily ₹ kill switch `SANDBOX_DAILY_INR_CAP` (Convex env, whole rupees, unset = ₹100, `0` turns the typed and spoken path off, anything else fails closed as `not_configured`; costed like §6.1 with `lib/voiceCost.ts` and kept apart from `VOICE_DAILY_INR_CAP`). Every check passes or nothing is consumed. STT and the parse are the app's own, with the same `OPENAI_API_KEY` (R19): the kill switch, not a separate key, bounds the spend. No audio is stored. `sandbox.createDraft` (`serverMutation`, so it needs the server secret, AND the visitor's forwarded session) writes the draft with the same checks as `orders.createDraft`; a spoken site is dropped. The canned demo-line parse (§6.12) is never used here.
- **Then** (`/try/<id>`, `features/try/TryOrder.tsx`): what was understood, with chips for what wasn't said (`sandbox.answer`; a missing quantity or unit is said or typed again, never guessed), then `sandbox.start`, which confirms the draft and starts the quote round on the simulator with the fictional DEMO dealers (`SANDBOX.personas`: no regular dealer, so no match call) through the same `engine.createCall` → `sim.runCall` path as an app sim sweep. Sim extraction follows `SIM_EXTRACT`, so keep `groundtruth` on any deployment that serves `/try`. The result is the winner's parchi stamped "DEMO · काल्पनिक dealers", **no savings tally**, the other rates, and "अपने असली dealers का रेट चाहिए?" with the waitlist (`/?home#waitlist`) and, when `NEXT_PUBLIC_WHATSAPP_NUMBER` is set, WhatsApp.
- **Never live, never shared:** `sandbox.start` has no mode argument; `sweep.start` refuses `mode: "live"` for a sandbox order (`live_not_ready`), so none ever reaches `claimDial`; `share.create` refuses every order whose kind isn't `app` (no `/p` links).
- **Expiry:** the cron `sandbox: delete expired orders` (every 30 minutes, `convex/crons.ts`) runs `sandbox.deleteExpired`, which removes sandbox orders past `expiresAt` with their calls (and any recording), call events, quotes and share rows, 20 at a time, going on at once while a batch is full. App orders have no `expiresAt` and are never matched.
- **Analytics (G6):** the page's beacon sends `try_start` on a visit's first order (chip, typed or spoken) and `try_voice` on every spoken one.
- **Landing hero:** the board runs on fixtures the server computes (`features/marketing/heroData.ts`, from the personas and `lib/pricing.ts`), with no Convex and no network. The page paints a still frame (`HeroFrame.tsx`, no motion code) and loads the live board (`HeroBoard.tsx`, the real `DealerRow`, `BestSoFarRibbon`, `Parchi`, `Tally`, and the motion library) after the load event, into the same fixed-size frame. It loops, pauses off-screen (IntersectionObserver) or with its 56 px button, and shows the finished result, still, with reduced motion.

### 6.10 Shared parchi (G4)
`share.create({ orderId, mode })` returns the order's link for that mode (a row in `shares`), making a revocable 22-character (128-bit) `publicId` the first time; each mode has its own link, so a link already sent never changes what it shows. `share.revoke` deletes all of an order's links. `share.get({ publicId })` (named `get` because `public` is a reserved word in JS modules) returns only: dealer name, items (no rates in `savings` mode), total, saving vs the first rate, delivery window, and a DEMO watermark flag. It uses the same quote projection and frozen ranking as the owner's Result screen; while placing or placed it shows the offer being placed (`placedQuoteId`), and never an offer set aside. **Never** site, date, phone numbers, recordings or losing prices. The page is `noindex`. `opengraph-image.tsx` renders the same data with `@vercel/og` 1.0.3 and static TTFs; `parchi.png` serves that image at a fixed URL (the og:image URL is hashed in production). The client fetches `parchi.png` when a share mode is picked and calls `navigator.share({ files })` inside the tap, falling back to a wa.me link to `/p/...`.

### 6.11 Recordings and retention (B6, S4)
- **Copy** (`convex/media.ts`, built in Phase 8C). When a live call reaches `completed`, `finishLiveCall` sets `calls.purgeAt` (the call's end + 30 days) and enqueues `media.copyRecording({ callId })` on the media pool (10 s later).
  - The job re-fetches the execution with our key (`GET /executions/{id}`; a webhook body is never trusted) for `telephony_data.recording_url` (a 24 h presigned redirect).
  - It downloads the file with a plain fetch that carries no auth header (`lib/recording.ts`):
    - https DNS names only, no IP literals or local hosts;
    - read as a stream and cut off past 16 MiB (`MAX_RECORDING_BYTES`, which keeps every `/rec` reply under Convex's 20 MB);
    - the stored type is sniffed from the file's first bytes (MP3, WAV, Ogg, MP4, WebM), never taken from the header, so an HTML error page is never kept.
  - `media.saveRecording` re-checks everything before it sets `calls.recordingStorageId`, and deletes the file instead when the call already has one, the dealer opted out during the download, or the call is past `purgeAt`.
  - Never for sim calls, unfinished calls or opted-out dealers. Idempotent on the call row, so it carries no round: a late call's recording is still its proof.
  - Retries: a transient failure throws, and the pool retries it 5 times (30 s, 1, 2, 4 and 8 minutes apart, each with a freshly fetched link). Transient means: no link yet, network, timeout, 403/408/410/429/5xx, or Bolna 429/5xx. A permanent one (no key, a gone execution, not audio, too large, a bad link) is logged and dropped.
- **Playback.**
  - `media.recToken({ callId })` is a guarded mutation (`userMutation`), not a query, because a cached query could hand out an expired token.
  - Only the order's owner gets a link; an admin (`ADMIN_USER_IDS`) may too, and that is written to `auditLog` (`recording.listen`). A missing call, someone else's call and a call without a recording all fail as `not_found`.
  - It returns `{ url: <CONVEX_SITE_URL>/rec/<callId>?t=<token>, expiresAt }`. The token is `<expiry ms>.<HMAC-SHA256 hex>` over `rec:v1:<callId>:<expiry>` with `REC_TOKEN_SECRET` (`lib/recToken.ts`). An unset or short secret (under 32 characters) fails closed as `not_configured`.
- **`GET /rec/<callId>?t=`** (`convex/mediaHttp.ts`):
  - checks the token in constant time;
  - streams the stored file, answering `Range` with **206** and `Content-Range` (needed for Safari seeking), an unsatisfiable range with 416, and anything else with the whole file;
  - refuses a bad, expired or other call's token with 403, a missing secret with 503, and a deleted recording with 404;
  - sends `Cache-Control: no-store, private`, `nosniff`, `no-referrer` and `Content-Disposition: inline` with no file name, so nothing about the dealer is in the headers.
- **The player** (`components/mb/RecordingPlayer.tsx`, loaded lazily through `features/app/CallRecording.tsx`) appears in the sweep panel's CallDetail and in Result's "रिकॉर्डिंग" section (DESIGN §12.7 item 5) for live calls with a stored recording only.
  - It asks for the link on the first tap. In the same tap it plays 10 ms of silence, so iOS lets that element play when the link arrives.
  - One recording plays at a time. A link that expired while paused is fetched again, and a reload refused mid-play is retried once with a fresh link.
  - It draws a plain track, never a made-up waveform (D7).
- **Crons** (`convex/crons.ts` → `convex/retention.ts`; each job works in batches and schedules its own next batch until done):
  - hourly: `purgeRecordings` deletes the stored recording and clears the transcript of every live call past `purgeAt` (30 days; index `calls.by_purgeAt`);
  - daily at 03:10 IST: `purgeCallLog` deletes `callLog` rows older than a year (index `callLog.by_at`);
  - daily at 03:20 IST: `purgeAnonUsers` deletes anonymous users older than 7 days who never onboarded (no contractor row) with their `authSessions`, `authRefreshTokens`, `authAccounts` and `authVerificationCodes` (S4).
    - It keeps admins, non-anonymous users and anyone who still owns an order (a sandbox order goes first, at its own expiry).
    - `contractors.create` refuses a session whose user was deleted, while its JWT lasts.
  - Still to build with their features: delete sandbox orders at `expiresAt` (G3), and delete TTS cache after 24 h.
- **Opt-outs** delete the dealer's recordings at once (`applyOptOut` → `calls.deleteDealerRecordings`, R15, R18). A copy in flight when the opt-out lands keeps nothing (`saveRecording`).
- `callLog` keeps the number's HMAC hash, time, consent, round and outcome for 1 year, never a number, audio or text.
- Bolna keeps its own copy and documents no delete API. Disclose this in the privacy notice, and turn on India data residency if available.

### 6.12 Presenter `/present` (B8)
`/present` (`features/present/Presenter.tsx`) is for admins only (`admin.amIAdmin`; anyone else sees "for the team only"). It embeds `/app?embed=1` in an iframe (`allow="microphone; autoplay"`, same origin, so it shares the presenter's session) signed in as the **demo contractor** (sim only). Anonymous sign-in always makes a new user, so on the demo deployment an admin presses "link the demo contractor" once on the presenter laptop: `admin.claimDemoContractor` re-points the seeded demo contractor's `userId`, and the owner of his orders, to that session (admins only, `DEMO_DEPLOYMENT=true` only, `isDemo` rows only, refused if the session already has its own contractor, audit-logged, idempotent). No public function can switch identity. The right-hand panel reads that session's latest app order only, through the owner's own `orders.listMine` and `board.get` (no global feed): `lib/presenter.ts` turns it into the pipeline lights (Mic → STT → Samjha → Calls → Rates → Molbhav → Match → Result), the stats (order spoken to first quote; the saving vs his dealer's first rate) and the event log (Plex Mono, newest first), revealing sim lines by their scripted time like the board. Readiness (demo deployment, claimed, demo dealers seeded, `SIM_PACE`, `SIM_EXTRACT`, live calls off; booleans only) and the latest order's live call cost (Bolna `total_cost`, US cents) come from `presenter.status`, an admin query. "Reset demo" calls `admin.resetDemo` (admins only, `DEMO_DEPLOYMENT=true` only), which wipes and reseeds demo rows only (the claimed session stays linked) and reloads the iframe at Home.

**Canned demo-line parse (G7, DEMO.md fallback 2):** with `DEMO_DEPLOYMENT=true` in the **Next.js server** env (the demo Vercel project, or `.env.local` for a rehearsal), when STT fails or hears nothing on an app order, `POST /api/voice/order` stands in the demo line and its fixed draft (`lib/demoLine.ts`, the golden answer run through `validateParse` → `toDraft`, so the steel tier is still asked); when the parse fails on a transcript that is the demo line (`isDemoLine`: every number, both materials and the site, and no other number), the same draft is used with the real transcript. Each use logs `{"evt":"voice_order_fallback","fallback":"canned_demo_line","reason":…}` and marks the draft's log line. Never in the sandbox, never without the flag.

### 6.13 Waitlist, dealer self-onboarding and analytics (G5, G6, S2, R24, R25)
- The landing page and `/dealer` are server components; only their forms are small client components (`features/marketing/WaitlistForm.tsx`, `DealerForm.tsx`). The forms post to **server actions** (`features/marketing/actions.ts`) that check the fields (`lib/waitlist.ts`, the same check `waitlist.join` runs), hash the IP (HMAC-SHA256 with `HASH_SECRET`, B10) and call `waitlist.join({ serverSecret, ipHash, role, name, phone, city, nextOrder, ref, area, materials, consentContact, consentAiCalls })` (the landing page; `/dealer` writes a dealer application instead, below). The consent checkbox is required.
- `waitlist.join` and `events.track` are built with `serverMutation` (`convex/lib/functions.ts`): marketing visitors have no Convex session, so the builder checks `CONVEX_SERVER_SECRET` instead of `ctx.auth` before the handler (unset or short: `not_configured`; wrong: `forbidden`). `waitlist.join` consumes `waitlistIp` (5 an hour per IP hash) and a deployment-wide `waitlistAll`, stores the phone in E.164 (`lib/phone.ts`) with the IP hash, and keeps one row per number and role (joining again updates it). Roles: `contractor`, `munshi`, `other` (landing) and `dealer` (old `/dealer` rows, before R24; still accepted). `ref` is a short slug from the query string (`/p` sends `parchi_<mode>`).
- `/dealer` (R24) writes a **dealer application**, not a waitlist row: the server action `joinAsDealer` checks the fields (`lib/dealerApplication.ts`), hashes the IP and calls `dealerSignup.apply({ serverSecret, ipHash, shopName, phone, area, materials, consent, geo? })` (`serverMutation`; `dealerApplyIp`, 5 an hour per IP hash, plus `dealerApplyAll`). One row per number: a pending one is updated, an approved or restricted one is left alone, and the answer is the same either way. The optional shop location comes from a tap on "दुकान की जगह जोड़िए" (`navigator.geolocation`; `Permissions-Policy` allows it on `/dealer` only), rounded to 3 decimals (~100 m) in the browser and again on the server, and dropped outside India. **An application never makes a number callable by itself (S2).**
- **The number check through Bolna** (R25; replaces R24's Firebase SMS OTP). Bolna's trial "Verified numbers" list is filled by three calls on `api.bolna.ai` with our Bearer key, the ones Bolna's dashboard itself uses (`lib/bolna/api.ts`: `verified.add` `POST /phone-numbers/verified/add {phone_number}` texts a 6-digit code and answers `request_id`; `verified.check` `POST /phone-numbers/verify-otp {phone_number, otp, request_id}`; `verified.list` `GET /phone-numbers/verified/all`). Undocumented, so `lib/bolna/verifiedNumbers.ts` parses defensively and maps errors (`already_verified`, `rate_limited`, `bad_code`, `expired`, else `failed`); log lines mask digits.
  - `joinAsDealer` makes a one-time **ticket** (32 random bytes, `node:crypto`) and passes it to `dealerSignup.apply`, which stores its SHA-256 for 30 minutes; the form gets the application id and the ticket and shows `DealerOtpStep` (no third-party script).
  - "कोड भेजिए" → the `sendDealerOtp` server action (Vercel BotID: `instrumentation-client.ts` protects POSTs to `/dealer`) → `dealerOtp.send` (`serverAction`: `CONVEX_SERVER_SECRET`): `reserveSend` checks the ticket, that the application isn't restricted and the number isn't an opted-out, restricted or demo dealer, the 30 s resend gap, and the limits `dealerOtpSendIp`, `dealerOtpSendPhone`, `dealerOtpSendGoogle`, `dealerOtpSendAll`; then Bolna texts **the stored number** (never one from the request) and `recordSent` keeps the `request_id` (server-only).
  - "नंबर पक्का कीजिए" → `checkDealerOtp` → `dealerOtp.check`: `reserveCheck` (ticket, a code sent within 15 minutes, fewer than 5 tries, `dealerVerifyIp`) counts the try, Bolna checks the code, and `recordVerified` sets `phoneVerifiedAt`, `verifyMethod: "bolna_otp"` and `bolnaVerifiedAt`. The status never changes (S2).
  - Bolna says the number is already on its list: `bolnaVerifiedAt` only (callable on the trial, but nothing proved), and the dealer sees the call-back ending. Any failure the dealer can't fix, a skip, or no `BOLNA_API_KEY` ends the same way: `verifyMethod: "none"`, the founders call back.
  - The client is created with `VERIFY_ENDPOINTS` only, so this path can't dial (hard rule 2).
- **Google sign-in** (R25, optional), on only when the Next.js server has `GOOGLE_CLIENT_ID` (an OAuth web client id). The form then shows "Google से जोड़िए" (our 56 px button; Google Identity Services' token popup, scope `openid email`, script loaded only on `/dealer`); the access token goes in a hidden field, `joinAsDealer` asks `https://oauth2.googleapis.com/tokeninfo` (POST) and requires `aud`/`azp` = our client id, an unexpired token and a verified email (`lib/server/googleToken.ts`), and `apply` stores the email and an HMAC of the account id. Missing or invalid: the form error "भेजने से पहले Google खाता जोड़िए".
- **The founders' panel, `/app/admin/dealers`** (R24, the one exception to R18's CLI-only admin writes). The page asks `admin.amIAdmin` on the server first. `dealerApps.list` (`adminQuery`) returns the Pending / Approved / Restricted tabs with counts; numbers only as `••••••45`, the code-step badge, "Bolna की लिस्ट में" (`bolnaVerified`), the Google email masked, the rounded location (for a map link), the dates, the consent and the linked dealer's state. The writes are `adminMutation`s (`requireAdmin`), each with a required note behind a confirmation sheet, each written to `auditLog` as `admin:<userId>`:
  - `approveForTest`: creates (source `optin`) or links by phone hash the `dealers` row with consent `test_ok`, and adds it to `testPhones`. An unverified number needs `verifiedByCallback: true`. If the number isn't on Bolna's list yet, the panel says so (the trial dials only those) and schedules `dealerOtp.syncBolnaList`; the "Bolna की लिस्ट से मिलाइए" button runs `dealerOtp.syncFromBolna` (`adminAction`), which reads Bolna's list and marks matching applications by phone hash.
  - `approveLive`: consent `opted_in`; needs the dealer's own code step; leaves `testPhones`. Guards 7 and 10 still apply (trial off, A2P, live stage).
  - `restrict` / `unrestrict`: `dealers.restricted` and the application's status. Restricting also takes the number off `testPhones`; re-allowing restores what the consent says (`test_ok`: approved test, back on the list; `opted_in`: approved live; otherwise pending).
  - An opted-out dealer is never re-enabled from the panel (only `admin:addDealer` with `readdAfterOptOut` and a fresh consent note). An opt-out also takes the number off `testPhones`.
  - CLI only: `dealerApps:revealPhone` (the full number, logged) and `dealerApps:importLegacyWaitlist` (old `role: "dealer"` waitlist rows become unverified pending applications marked `fromWaitlist`; run once per deployment, idempotent).
- Analytics: `POST /api/e` (Vercel route; same-origin, at most 1 KB) → `events.track({ serverSecret, ipHash, name, props, path })`, rate-limited by the IP hash (`eventsIp`, plus `eventsAll`); the hash is not stored. Only the event names in G6 are accepted, and `props` only from each event's fixed value lists (`lib/analytics.ts`: `waitlist_submit {role, ref: none|parchi|other}`, `parchi_share|open|cta {mode}`, the rest none), so no phone numbers, names, link ids or free text can be stored. `path` is reduced to its route (`/p/[id]`). The browser sends `parchi_share` (share sheet) and `parchi_cta` (the `/p` CTA) with `navigator.sendBeacon` (`features/marketing/beacon.ts`); the server records `waitlist_submit`, `dealer_optin` and `parchi_open` itself, after the response (`after()`).
- WhatsApp click-to-chat (`wa.me/<team number>?text=…`) is the main call to action; the form is the fallback. With `NEXT_PUBLIC_WHATSAPP_NUMBER` unset, no WhatsApp link renders.
- SEO: `app/robots.ts` allows `/`, `/dealer`, `/privacy` and disallows `/app`, `/try`, `/p/`, `/present`, `/styleguide`, `/api/`. `/` has a static bilingual og:image (`app/(marketing)/opengraph-image.tsx`, rendered at build time with `vercel-og`), inherited by `/dealer` and `/privacy`.

### 6.14 Follow-up calls (R28)
`convex/followUp.ts` with the pure `lib/followUp.ts`:
1. `followUp.forOrder({ orderId })` lists, per standing quote of the current round, its gaps (`listGaps`: fixed order, stable keys; stated facts are never gaps), follow-ups used, whether one is on, and why a new one can't start (`not_ready`, `no_gaps`, `running`, `cap`, `dealer`, `set_aside`, `stale`, `live`).
2. `followUp.start({ orderId, quoteId })` (owner; approved for app orders) creates a quote-round call with `followUpOf` and `followUpAsk` in the order's mode, via `createCall`. The order stays `ready` and lists it in `followUpsRunning`. Sim: `sim.runCall` scripts it from the persona's follow-up answers. Live: the dial job goes through `claimDial`, which allows a follow-up only while the order is `ready` (`callFitsOrder`) and checks every other guard as usual; `prepareDial` adds `quote_opening`, `is_followup` and `followup_ask` to `user_data`.
3. Extraction runs the same job; the LLM gets the earlier quote and `followUpAsked`. `followUp.applyFollowUp` checks the disclosure (S5), checks only the new figures in the dealer's turns (`followUpFigures`), merges (`mergeFollowUp`), prices with `lib/pricing.ts` (carrying `outlier`/`lump_sum_mismatch` unless the rate was confirmed again), inserts a new quote row (`followUpOf`), sets `supersededBy` on the old one, and recomputes `ranking` and `winningQuoteId` with `engine.rankResult` (the same code as `freezeReady`). Any other outcome leaves the old quote. Every path ends in `afterCallSettled`, which takes the call off `followUpsRunning`.
4. Staleness: `engine.roundOpen` treats a follow-up as open only while the order is `ready` and in the same `roundSeq`. `placing.place` refuses (`follow_up_running`) while one is dialing or talking and cancels one still queued, so none is ever on after the order leaves `ready`. `roundQuotes`, `lib/result.ts` and `lib/board.ts` ignore superseded quotes.

## 7. External APIs (verified November 2026)

**Sarvam**
- Base `https://api.sarvam.ai`, header `api-subscription-key`.
- STT: `POST /speech-to-text`, multipart `file`, `model` (`saaras:v4`, the default and latest; `saaras:v3` also listed), `mode` (`transcribe | translate | verbatim | translit | codemix`; codemix writes English words in Latin and Hindi in Devanagari), `language_code` (`hi-IN`, `en-IN`, … or `unknown`; set it explicitly for clips under 3 s) and `keyterms` (a JSON-encoded array of at most 50 terms, 64 characters each; **saaras:v4 only**, v3 answers 400). Response `{ request_id, transcript, language_code }`. REST is for clips under 30 s (longer: the Batch API). Formats include WebM, OGG/Opus, MP4/M4A, AAC, WAV, MP3; 16 kHz works best. Errors: 400/403/422/429/500/503 with `error.code`. (The API reference says `mode` applies to v3 only while the model page and the keyterms guide use `saaras:v4` with `mode: "codemix"`; we send both. Check the transcript script on the first real call.)
- TTS: `POST /text-to-speech`, JSON `{ text (≤ 2,500 characters), language_code, model: "bulbul:v4-flash", speaker, output_audio_codec (wav | mp3 | aac | flac | linear16), speech_sample_rate }` → `{ request_id, audios: [base64] }`. Omitting `model` gives `bulbul:v3`. v4 Flash speakers are persona ids `name_lang_style` (v3 short names like `shubh` are rejected; an unknown id answers 400 with the live list). Hindi customer-care personas include `ashutosh_hi_conversational` (our default, `SARVAM_TTS_SPEAKER`), `ritu_hi_customer` and `shubh_hi_customer`; English `dev_en_conversational` (`SARVAM_TTS_SPEAKER_EN`). We ask for MP3 at 24 kHz. Sarvam renamed some voices in October 2026, so keep the speaker in env, not code.
- Pricing: STT ₹0.49/min billed per second; Bulbul v3 ₹3 and v4 Flash ₹1 per 1,000 characters. Pay-as-you-go limits: 60 requests a minute each for REST STT and TTS, per account. **New accounts get ₹100 of free credit.** (Sources: docs.sarvam.ai API reference, Voices page and pricing page, checked 17 Nov 2026 through the sarvam-docs MCP and the speech-to-text / text-to-speech skills.)

**OpenAI** (DECISIONS R19)
- `POST https://api.openai.com/v1/chat/completions` with `Authorization: Bearer` `OPENAI_API_KEY`, through `lib/llm/openai.ts`: plain `fetch`, no SDK, one request shape shared by the voice route (`lib/server/llm.ts`), the Convex extractor (`convex/llm.ts`) and the eval scripts. `chatBody()` sends a system and a user message; `chatJson()` returns the answer's JSON text or throws `LlmError` (`not_configured`, `timeout`, `api` with the HTTP status, `bad_response` for an empty answer, a `refusal` or non-JSON). The key never appears in an error or a log.
- Structured Outputs in strict mode: `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`. Strict mode wants every property listed in `required`, `additionalProperties: false` on every object, and optional or nullable values as `anyOf [T, null]`; `strictSchema()` converts our OpenAPI-subset schemas (§8) into that, and `lib/llm/openai.test.ts` checks that both schemas convert cleanly and stay inside strict mode's size limits. Answers carry every key, with `null` for "not said", which `lib/parse.ts` and `lib/extraction.ts` read as not said.
- Model: `gpt-5.4-mini` (`DEFAULT_OPENAI_MODEL`); `OPENAI_MODEL` overrides it for both jobs. The lowest reasoning effort the model accepts (`lowestReasoning`, F3): `reasoning_effort: "none"` for gpt-5.x and later (gpt-5.4-mini's default), `"minimal"` for the first `gpt-5`, `gpt-5-mini` and `gpt-5-nano`; GPT-4.x models don't reason and get `temperature: 0` instead. Chosen on the 20-case parse golden set (17 Nov 2026): gpt-5.4-mini 20/20 at a median of 1.5 s; gpt-4.1-mini, gpt-5.5, gpt-5.6-luna and gpt-6-luna also 20/20 but slower; gpt-5.4-nano 19/20. Sarvam STT then the parse took about 2.2 s end to end on the demo line.
- Pricing (developers.openai.com/api/docs/models/gpt-5.4-mini, 17 Nov 2026): $0.75 per 1M input tokens ($0.075 cached), $4.50 per 1M output tokens. A parse is about 820 tokens in and 100 out, about ₹0.10; `lib/voiceCost.ts` charges 15 paise to stay on the safe side.
- Data (developers.openai.com/api/docs/guides/your-data): API inputs and outputs are not used to train OpenAI's models unless we opt in, so one key serves fixtures, the team's test speech and real contractor and dealer speech alike; there is no free/billed split. Abuse-monitoring logs are kept for up to 30 days. The privacy page must name OpenAI among the services that see transcripts.

**Bolna** (checked 17 Nov 2026 against https://www.bolna.ai/docs/AGENTS.md, the API reference and the installed `setup-webhook`, `setup-tools` and `get-executions` skills; the list of pages is in `docs/BOLNA_SETUP.md`)
- Base `https://api.bolna.ai`, `Authorization: Bearer`. One client, `lib/bolna/api.ts`, with an allow-list per caller: the scripts can't reach `/call` or `/batches`; the Convex side can't create or change agents.
- `GET /user/me` returns `{ id, name, email, wallet, concurrency: { max, current } }`.
- `POST /call` returns `{ message, status: "queued", execution_id }`. Only `agent_id` and `recipient_phone_number` are required; `from_phone_number` is optional (the account's default number); `retry_config` defaults to off (we send `{ enabled: false }` anyway); `agent_data` takes `language` or `voice_id`; never `scheduled_at` or `bypass_call_guardrails`. A 429 means a newly bought number is still activating and no call was queued.
- `GET /executions/{id}` returns status, `termination_reason`, transcript (`assistant: … / user: …` lines), `conversation_duration`, `total_cost` (**US cents**), `cost_breakdown`, `telephony_data.recording_url` (`https://api.bolna.ai/recordings/call/{id}`), `context_details.recipient_data` (our `user_data` echoed back) and timestamps. Nothing is final before `completed`.
- `GET /v2/agent/{id}/executions?from&to&page_size&page_number`: `from` and `to` (UTC ISO) are required and at most 7 days apart; rows are trimmed (no `context_details`), so the lookup re-fetches candidates by id.
- `POST /call/{id}/stop` stops a call **only while it is queued or scheduled** at Bolna; there is no API to hang up a call in progress (its `call_terminate` ends it).
- Trial: **2 concurrent calls, verified numbers only.** Paid plans start at 10 concurrent calls; calls over the limit are queued at Bolna, not refused (we never send more than `LIVE_CONCURRENCY`).
- A number **bought from Bolna** needs a compliance application with a CIN and GST certificate. Alternatively connect **your own Plivo or Exotel account** (Settings → Integrations → Telephony); calls then use that provider's numbers and KYC, which accepts a sole proprietorship. `bolna.dialJob` then passes the provider number as `from`.
- No mid-call transcript stream. Custom functions can run mid-call, with a 50–500 ms pause covered by `pre_call_message`.
- Webhooks: one POST per status change, with the execution payload; retried, so be idempotent (dedupe on execution + status). The URL is `agent_config.webhook_url` (API); **custom webhook headers can be set only in the dashboard** (agent → Extractions tab → Webhook Configuration → Add headers): the agent API has no field for them, so the `x-molbhav-secret` header is a manual step after `pnpm bolna:sync` (`docs/BOLNA_SETUP.md`). Until it is set, webhooks are refused (401) and the watchdog's polls still move every call to a final status.
- Agents: `POST /v2/agent` (201 `{ agent_id, state }`), `PUT /v2/agent/{id}` (replaces the whole config), `PATCH /v2/agent/{id}` (name, welcome, webhook URL, synthesizer, prompts, guardrails only), `GET /v2/agent/{id}`, `GET /v2/agent/all`. `pnpm bolna:sync` creates or replaces the four agents by name from `bolna/agents/` (R12) and never dials. Agent-level `auto_reschedule` is off and no `calling_guardrails` are set (they would reschedule calls outside hours, R2). Custom functions go in `tools_config.api_tools`: `tools[]` (OpenAI function schema plus `key: "custom_task"` and `pre_call_message`) and `tools_params[name]` (`method`, `url`, `api_token`, `headers`, `param` with `%(name)s`); a parameter named like a `user_data` key is filled automatically.
- Voices: Bolna's Sarvam synthesizer takes Bulbul v4 Flash persona ids (`<persona>_<lang>_<style>`) with `voice` (display name), `voice_id`, `model: "bulbul:v4-flash"` and a required `language`; the sync checks the voice against `GET /api/v1/voice-config/tts` and `…/voices` and takes the exact display name. ElevenLabs takes `voice`, `voice_id`, `model` (no `language`); Bolna's own ElevenLabs is used unless the account connects its own key (Settings → Integrations; usage on a connected key isn't billed by Bolna). Transcriber: Sarvam `saaras:v4`, `language: "hi"` (not `hi-IN`), `keywords` (≤ 50) and `context`.
- Web calls: the Web Call SDK (`@bolna/web-call`) talks to an agent from a browser with no phone number. The browser asks our backend for a session; the backend calls `POST /web-call/session` `{ agent_id, user_data }` with the key and returns the short-lived (about 120 s), single-use credentials. Used only by `/app/admin/agents`.
- India data residency is an **Enterprise** feature, and Indian-server routing needs Plivo telephony, Bolna's own provider keys (no connected keys) and an Azure OpenAI or AWS Bedrock LLM. The trial runs in the US; the privacy page must say so until that changes (R13).
- Helpers: the `setup-webhook`, `setup-tools` and `get-executions` skills only (`START_HERE.md` A3), and the Web Call SDK for browser tests. Never the calling or number-buying skills, and never the `transfer_call` tool (it would bridge a live call to another number).

**Vercel BotID:**
- `pnpm i botid` (installed: 1.5.12).
- `initBotId({ protect: [{ path: '/api/voice/order', method: 'POST' }, { path: '/api/tts', method: 'POST' }] })` in `instrumentation-client.ts`.
- `checkBotId()` from `botid/server` in each route, refusing with 403 when `isBot`.
- No keys and no `next.config` wrapper on Vercel. A route missing from `protect` makes `checkBotId()` fail.
- In local dev it always returns `isBot: false`; use `developmentOptions.bypass: 'BAD-BOT'` to test the refusal.
- The Basic level is free on all plans. Deep Analysis is Pro only ($1 per 1,000 checks) and isn't needed now.

## 8. LLM schemas and prompts

### 8.1 Order parse (Vercel route)
System prompt (in `lib/llm/parsePrompt.ts`):
```
You convert an Indian building contractor's spoken order (Hindi, English or Hinglish; Devanagari or Roman) into JSON.
Materials: TMT steel ("sariya", "saria", "TMT", "rod") and cement ("cement", "bori", "katta", "bag").
Rules:
- Never guess a quantity, size, grade, unit or tier. If not said, leave null and add the field name to "missing".
- Hindi numbers: sava n = n+0.25, dedh = 1.5, dhai = 2.5, saade n = n+0.5, paune n = n-0.25, sau = 100, hazaar = 1000. "dedh sau bori" = 150 bag.
- "bori", "katta", "bag" = 50 kg cement bags (unit "bag"). Steel: "ton"/"tan" = ton, "kilo" = kg, "quintal"/"kuntal" = quintal.
- Bar size in mm only. If said in "suta"/"soot", leave diameterMm null, add "diameterMm" to missing and "size_said_in_suta" to notes.
- Steel tier: "branded" if Tata/JSW/SAIL/Jindal or "ब्रांडेड/बड़ी कंपनी" is said; "local_isi" if "लोकल/ISI" is said; "both" if "दोनों"; else null.
- Cement tier: "branded" if UltraTech/ACC/Ambuja/Shree/JK or "नामी कंपनी"; "any" if "कोई भी"; else null.
- brand: only if a brand is named. siteText: the site or area as spoken. deliverByText: delivery time as said. creditDaysWanted: days of udhaar.
- deliverBy: map the delivery time to one of today, tomorrow_morning, tomorrow, day_after, this_week, flexible; null if not said or unclear.
Output only JSON matching the schema.
```
After parsing, code (not the LLM) matches `siteText` to the contractor's sites and the city's `CITY_AREAS` list; the result is confirmed with a chip on Confirm (R7). The schema in code is written in the same OpenAPI subset with upper-case type names (`"OBJECT"`, `"STRING"`…), as `lib/llm/extractPrompt.ts` does, and is otherwise this schema; `strictSchema()` turns it into OpenAI's strict JSON Schema when the request is built (§7). Code also keeps only the notes `size_said_in_suta` and `brand_not_in_list`, and computes `missing` itself (§6.1 step 5).
Schema:
```json
{
  "type": "object",
  "properties": {
    "items": { "type": "array", "items": { "type": "object", "properties": {
      "material": { "type": "string", "enum": ["tmt_steel", "cement"] },
      "diameterMm": { "type": "number", "nullable": true },
      "grade": { "type": "string", "enum": ["Fe500", "Fe500D", "Fe550D"], "nullable": true },
      "cementType": { "type": "string", "enum": ["OPC43", "OPC53", "PPC", "PSC"], "nullable": true },
      "tier": { "type": "string", "enum": ["branded", "local_isi", "any", "both"], "nullable": true },
      "brand": { "type": "string", "nullable": true },
      "quantity": { "type": "number", "nullable": true },
      "unit": { "type": "string", "enum": ["kg", "ton", "quintal", "bag"], "nullable": true }
    }, "required": ["material", "quantity", "unit"] } },
    "siteText": { "type": "string", "nullable": true },
    "deliverByText": { "type": "string", "nullable": true },
    "deliverBy": { "type": "string", "enum": ["today", "tomorrow_morning", "tomorrow", "day_after", "this_week", "flexible"], "nullable": true },
    "creditDaysWanted": { "type": "number", "nullable": true },
    "missing": { "type": "array", "items": { "type": "string" } },
    "notes": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["items", "missing"]
}
```
`evals/parse.golden.json` (20 cases). The first three:

| Input | Expected |
|---|---|
| "Kal subah tak 2 ton 12mm sariya Fe500D aur 150 bori PPC cement, Mansarovar wali site pe, 15 din ka udhaar chahiye" | steel 12 mm Fe500D 2 ton, tier null (asked on Confirm); cement PPC 150 bag; site Mansarovar; "kal subah"; credit 15 |
| "dedh ton aath mm branded aur dhai sau katta OPC 53 UltraTech" | steel 8 mm 1.5 ton branded, grade missing; cement OPC53 branded UltraTech 250 bag |
| "sariya chahiye 4 suta wala, do ton" | steel diameter null (missing; note size_said_in_suta), 2 ton; grade and tier missing |

### 8.2 Quote extraction (Convex, llm pool)
```
You read a phone call transcript between Molbhav's AI assistant ("assistant") and a building-material dealer ("user"), plus the order items with ids.
Extract ONLY what the dealer said. Never compute totals. Never fill a value the dealer did not say.
Per item: rate as spoken and its unit; gstMode for that line ("included" if "GST milake/with GST", "extra" if "GST alag/plus GST", else "unknown"); brand and tier offered; stock (yes/partial/no/unknown); credit rate if different from cash.
lumpSumTotal: an all-in total only if the dealer said one as a single figure, with what it includes (gst, delivery, unloading) and lumpSumScope: "order" if it is for the whole order, "partial" if for part of it (e.g. only the steel). Never add numbers up yourself.
deliveryCharge / unloadingCharge (bhada / utarai or hamali): a number (0 if they said free or included); null if not said.
deliveryEtaText, deliveryBy (today/tomorrow_morning/tomorrow/day_after/this_week/flexible, or null), creditDays, billType (pakka/kachcha/unknown), weightBasis (kanta/standard/unknown), validityText.
first: in a match call only, the same fields (lines, lumpSumTotal, charges, GST modes) as the dealer said them BEFORE the assistant cited any other number. Code computes his first total from it.
outcome: quoted | declined | callback | opt_out | terms_changed | confirmed (confirm calls: every term matched) | no_quote. callbackWhenText if given.
saidFinal: the dealer said this is final/last. confidence 0..1, lower if numbers were unclear or corrected.
Output only JSON.
```
Same `nullable` style, converted the same way (`extractBody` in `lib/llm/extractPrompt.ts`). The LLM never returns a computed total; `lib/pricing.ts` computes every total, including `firstTotal` (R1). `evals/extract.golden.json`: 10 cases, including a per-quintal rate with unclear GST, a dealer who corrects his own number, a no-bill offer, a match call, and (once available) real call transcripts with names and numbers replaced.

## 9. Pricing, comparability and citing (`lib/pricing.ts`)

```
Money in integer paise. Spoken totals exact (lib/numbers.ts), in whole rupees.
toKg: kg ×1, quintal ×100, ton ×1000
normaliseRate(rate, rateUnit, orderUnit): steel via kg; cement bag↔bag only (else flag unit_mismatch)
lineSubtotal = normalisedRate × quantity, in paise    (use creditRate when the order wants credit and one was given)
subtotal = Σ lineSubtotal
gst      = Σ per line: gstMode ∈ {extra, unknown} ? round(lineSubtotal × GST_RATE[material]) to the paisa : 0
delivery = deliveryCharge ?? 0   (undefined → flag delivery_unknown)
unloading= unloadingCharge ?? 0  (undefined → flag unloading_unknown)
computed = subtotal + gst + delivery + unloading

statedAllIn = lumpSumTotal, only when lumpSumIncludes covers gst, delivery and unloading AND lumpSumScope = "order" (R1, R17);
              an all-in said this call that isn't usable → flag lump_sum_mismatch
total (R1, R5):
  - this call gave a rate for every item → computed; if statedAllIn was also said in this call and it is more than
    0.5% from both the computed and the cash-rate total → flag lump_sum_mismatch     (totalSource: computed)
  - else, statedAllIn said in this call → statedAllIn; the quote's lines are not cited  (totalSource: stated)
    it must sit inside the bands' GST-inclusive range (else out_of_band), and a drop of more than 5% below the
    same dealer's earlier total (previousTotal) flags outlier (R17)
  - else → computed from what exists (inherited lines for haggle/match-final), with flags  (totalSource: computed)
  then round the total to the nearest rupee ONCE (half up); that rupee figure is used everywhere

flags: gst_unclear, delivery_unknown, unloading_unknown, missing_item, partial_stock, stock_unknown, low_confidence (<0.8),
       tier_mismatch, no_bill (billType ≠ pakka), weight_unknown, brand_unknown, unit_mismatch,
       not_read_back, rate_not_in_transcript, out_of_band (a line's per-kg/per-bag rate before GST outside priceBands[city][material]), lump_sum_mismatch,
       outlier (|total − median| / median > 0.15, the median of the round's otherwise-comparable totals, so a no-bill lowball can't move it; needs 3+ of them)
       (a stated all-in figure covers GST, delivery and unloading, so it clears gst_unclear, delivery_unknown and unloading_unknown)

comparable (may win) = no missing_item, no partial_stock, no stock_unknown, no tier_mismatch, no no_bill,
                       no brand_unknown, no weight_unknown, no delivery_unknown, no unloading_unknown (R6),
                       no gst_unclear, no outlier, no unit_mismatch, no rate_not_in_transcript, no lump_sum_mismatch,
                       no out_of_band (R17)
       tier: a brand on the city's list decides it (an LLM tag that disagrees is tier_mismatch); steel must be ordered
             in exactly one tier and an item without quantity is missing_item (R17)
citable (may be cited) = comparable AND readBackConfirmed AND confidence ≥ 0.8 AND flags = []
                         AND the city's priceBands row updated within 14 days
                         (sim: the band check uses the persona's own band, always fresh; seed:reset and
                          admin.resetDemo write updatedAt = now, so the demo never goes stale)
rank: each dealer's standing offer (latest comparable quote), the outlier rule over all of them, comparable ones by total ascending
winner: among comparable quotes within 0.5% of the cheapest, the most creditDays (only if the contractor wants credit),
        then earlier deliveryBy, then lower total
savings: vs the regular dealer's first rate ("आपके dealer के पहले रेट से"): firstTotal from his match call (only if that
         first quote was comparable, R17), or his
         quote-round total when askFirst (only if that quote is comparable); else vs the median of the comparable
         QUOTE-ROUND totals ("बीच वाले रेट से"; even count → the lower of the two middle values, R5); never vs the
         maximum; with fewer than 2 comparable quotes and no regular-dealer rate, no saving is shown ("सिर्फ 1 रेट मिला");
         also report the regular dealer's own drop
```
`GST_RATE = { tmt_steel: 0.18, cement: 0.18 }` (cement fell from 28% to 18% on 22 Sep 2025). `BRAND_TIERS`, `CITY_AREAS` and the price-band seeds live in `lib/config.ts` per city; the live bands are the Convex `priceBands` table (dated, editable in `/app/admin`, R13).

### Golden tests (order: 2 ton TMT 12 mm local ISI + 150 bags PPC, any brand)
Unless a row says otherwise, every quote has a named brand, tier offered local ISI (steel) / any (cement), inStock yes for both items, and confidence 0.9.
| Case | Quote | Credit | Expected |
|---|---|---|---|
| A | ₹57/kg + ₹370/bag, GST extra, delivery free, unloading ₹600, pakka, kanta, read back | 7 d | subtotal 1,69,500 · GST 30,510 · total **2,00,610** · comparable, citable |
| B | ₹67,000/ton + ₹435/bag, GST included, delivery ₹1,500, unloading included, pakka, kanta, read back | 0 | subtotal 1,99,250 · total **2,00,750** · comparable, citable |
| C | ₹5,750/quintal + ₹380/bag; GST, delivery, unloading, brand, bill and weighing not said; no read-back | — | subtotal 1,72,000 · GST 30,960 · total **2,02,960** · flags gst_unclear, delivery_unknown, unloading_unknown, no_bill, weight_unknown, brand_unknown, not_read_back · **not comparable** |
| D | ₹58/kg + ₹365/bag, GST extra, delivery ₹800, unloading ₹450, pakka, kanta, read back | 15 d | subtotal 1,70,750 · GST 30,735 · total **2,02,735** · comparable, citable |
| Rank | A, B, D (C excluded) | | B is within 0.5% of A, but A has more credit, so A wins |
| Savings | regular dealer firstTotal 2,04,300 | | A saves ₹3,690 vs his first rate |
| Median fallback | no regular dealer | | median of A, B, D = 2,00,750; A saves ₹140 vs median |
| Tie flips | E 2,00,000 credit 0 · F 2,00,800 credit 15 (both comparable) | | F wins; table order stays E, F |
| Haggle inherit | A's haggle: steel ₹56.50/kg and unloading ₹0 said; everything else inherited from A's quote | | total **1,98,830** · comparable, citable |
| Haggle per item | B's haggle: steel ₹66,700/ton and cement ₹430/bag said; the rest inherited | | total **1,99,400** · totalSource computed |
| Haggle all-in only | B's haggle said only as "सब मिलाके एक लाख निन्यानवे हज़ार चार सौ", read back | | total **1,99,400** · totalSource stated · comparable, citable; its lines are not cited |
| All-in agrees | A's quote plus "सब मिलाके दो लाख" said (0.30% from 2,00,610) | | total **2,00,610** (computed) · no flag |
| All-in disagrees | A's quote plus "सब मिलाके दो लाख पाँच हज़ार" said (2.19% off) | | flag lump_sum_mismatch · **not comparable** |
| Unloading unknown | A with unloading not said | | total 2,00,010 · flag unloading_unknown · **not comparable** (R6) |
| Median, even count | comparable quote-round totals A 2,00,610 and B 2,00,750; winner A's haggle 1,98,830; no regular dealer | | median = **2,00,610** (lower middle) · saving **₹1,780** "बीच वाले रेट से" (TEAM_TEST Run 1) |
| Rounding | ₹57.35/kg × 2,000 kg + 150 × ₹371.15/bag, GST extra, delivery ₹0, unloading ₹0 | | subtotal 1,70,372.50 · GST per line to the paisa (20,646.00 + 10,021.05) · total ₹2,01,039.55 → **₹2,01,040** |
| Not citable | A without the dealer's "हाँ" after the read-back | | comparable, **not citable** (not_read_back) |
| Kachcha | A with billType kachcha | | flag no_bill, not comparable |

These numbers are test fixtures, not market prices.

## 10. Simulator personas (`convex/sim/personas.ts`)
All demo dealers are fictional, shown with a DEMO badge, and use made-up prices (base × seeded jitter). **For the demo order** (the TEAM_TEST line), Agarwal (`perkg_gst_extra`), Om Sai (`perton_gst_incl`), Rathore (`whatsapp_dodger`) and Shree Balaji (`regular_match`) use exactly the TEAM_TEST Card A–D numbers, with no jitter, including their haggle and match drops. The demo contractor's dealer book (`saved`) is Agarwal, Om Sai, Rathore and Gupta (`no_answer`), with Shree Balaji as the regular dealer, so the default Choose screen gives 4 calls (2 comparable stamps, 1 "जाँच बाकी", 1 no answer) plus the held match call. The other personas are seeded but off by default.

| Key | Behaviour |
|---|---|
| `regular_match` | The contractor's regular dealer. Held for the match call. First rate high; drops part of the way, or matches 30% of the time (seeded). 15 days credit. |
| `perkg_gst_extra` | Per kg, GST extra, free delivery, unloading ₹600, 7 days credit, pakka, kanta. Drops about 1% in haggle and says final. |
| `perton_gst_incl` | Per ton, GST included, delivery ₹1,500, unloading included, no credit. Drops about 0.7%. |
| `whatsapp_dodger` | "Rate WhatsApp कर दूँगा"; gives a rough rate once pushed; GST and charges unclear (not comparable). |
| `no_answer` | Never answers (the watchdog closes the call at 45 s). |
| `cement_only` | No steel today (missing_item). |
| `kachcha_lowball` | Offers a cheaper no-bill rate first, then a pakka rate when asked. |
| `callback_later` | "एक घंटे बाद कॉल कीजिए" (callback_requested). |
| `reprice_at_confirm` | Changes the rate in the confirm call (terms_changed). |

## 11. Live-call guards and compliance (`internal.calls.claimDial`)
A live dial happens only if **all** pass, checked atomically in one mutation. Every failure is a **refusal** (no dial, a reason code), except a full live slot in guard 6, which is a **wait** (R2):
1. `LIVE_CALLS_ENABLED === "true"`.
2. The contractor is `verified`; per-contractor daily cap not exceeded: `liveDailyCap` live **orders** a day (IST), where an order counts when its first quote or match call dials and its haggle and confirm calls ride on it (R18).
3. Consent is `test_ok` or `opted_in`, and not `opted_out`.
4. Dealer limits (S2, R3), counted from `callLog` rows for this `phoneHash` since midnight IST: AI calls come from at most **2 distinct orders** across all contractors (a quote or match call opens an order's slot; that order's haggle and confirm calls ride on it), and per order to this number at most **3 calls before placing** (one opening call, one retry if it didn't connect, one haggle) plus **the confirm call and one retry** (R18). A haggle or confirm call rides only if this order already opened a slot with this number (`callLog.opensSlot`); otherwise it opens one. `claimDial` writes the `callLog` row (with `orderId`, `callId`, `contractorId` and `opensSlot`) when it reserves the dial. Trial mode (B9): instead, `TEST_DAILY_CALLS` (default 10) per day for listed `test_ok` dealers (`TEST_PHONE_HASHES`, or the panel's test list, guard 7).
5. The current time in `Asia/Kolkata` is within `CALL_HOURS_START`–`CALL_HOURS_END` (default 10–19; both must stay within 9–21, R18), and not Sunday unless `ALLOW_SUNDAY`. Skipped in trial mode for listed `test_ok` dealers (teammates).
6. Under `MAX_LIVE_CALLS_PER_ORDER` (12, refuse; it counts the calls before placing, so confirm calls are never stopped by it, R18), and a live slot is free: fewer than `LIVE_CONCURRENCY` live calls in `dialing`, `ringing`, `in_progress` or `disconnected` (`calls.by_mode_status`, counted in this transaction). A full slot returns **wait** (R2). `MAX_LIVE_SWEEPS_PER_HOUR` is checked in `orders.startSweep`, not per dial.
7. `BOLNA_FROM_NUMBER` is set (a number registered to our business, from Bolna or our own Plivo/Exotel account, declared for A2P use under TRAI's 2026 rules). In trial mode (`BOLNA_TRIAL=true`) Bolna's trial caller ID is accepted, but only listed `test_ok` dealers can be dialled: listed means the phone hash is in `TEST_PHONE_HASHES` **or** the dealer is on the panel's test list (`testPhones`, R24: the row's `dealerId` is this dealer and its hash is the HMAC of the stored number); Bolna's trial itself also dials only numbers verified in its dashboard. `opted_in` dealers always need trial mode off and a registered number. A `test_ok` dealer must be listed in every mode (R18); with trial mode off only `TEST_PHONE_HASHES` counts (set from the CLI), never the panel's list.
8. `OPENAI_API_KEY` is set, so the call's transcript can be extracted (R19). (The guard keeps its old names: `billedKeySet`, reason `no_billed_key`.)
9. The number matches `^\+91[6-9]\d{9}$` and the dealer is not `isDemo` (B10).
10. For `opted_in` dealers (built in 8A, failing closed; extended in Phase 10): `A2P_DECLARED=true`, and the live stage allows it (`LIVE_STAGE=1`: admins only, at most `STAGE1_MAX_DEALERS` dealers marked `stage1`, which Phase 10 builds, so until then stage 1 refuses every opted-in dealer; `LIVE_STAGE=2`: verified contractors).
11. The dealer is not `restricted` (R24: set in the founders' panel, `/app/admin/dealers`). Checked first, in every mode, listed or not (`dealer_restricted`, shown to contractors as `dealer_unavailable`), and again by the dial job right before Bolna (`bolna.prepareDial`). Restricted dealers are also left out of `dealers.forOrder`, `dealers.listForCity` and `sweep.start`.

Also, failing closed (R18): any malformed guard env value refuses every dial (`config`), and a switch is only `true`, `false` or unset; the dealer's stored hash must equal the HMAC of its stored number; refusals are checked before the slot, so only a call that could dial ever waits. The decisions are pure functions in `lib/liveGuards.ts`; `claimDial` gathers the counts inside its transaction and applies the result.

Before the guards, `claimDial` checks that the call's round fits the order's status (quote: sweeping or matching; haggle: haggling; match: matching; confirm: placing) and that the order's contractor is its owner; otherwise the call is cancelled with `round_closed` or refused (R18). Clients see a cancelled call's reason only as its group (`lib/cancelReasons.ts`).

The client learns whether live mode is available only through `settings.liveAvailable` (a boolean plus a reason code; the client passes its current minute as `at` so the answer is recomputed each minute). Not legal advice: confirm TRAI obligations with the telephony provider in writing.

## 12. Environment variables
See `.env.example`.
- **Client-visible:** `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_WHATSAPP_NUMBER`.
- **Convex, for sign-in (R26):** `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (the OAuth web client; its authorized redirect URIs must include `<CONVEX_SITE_URL>/api/auth/callback/google` for each deployment), `SITE_URL` (the site's main origin, https://www.callagent.dev on production), `AUTH_REDIRECT_ORIGINS` (other origins the site runs on, comma-separated, e.g. https://molbhav-weld.vercel.app: sign-in returns to the origin it started on, and only to SITE_URL or these, `lib/authRedirect.ts`), `ADMIN_EMAILS` (comma-separated Google emails of the founders), `ADMIN_USER_IDS` (legacy ids). Dev only: `E2E_LOGIN_SECRET`.
- **Next.js server, for `/dealer`'s Google sign-in (R25, optional):** `GOOGLE_CLIENT_ID` (an OAuth web client id, public by nature; read on the server and passed to the form). The number check needs nothing new on Vercel: it runs in Convex with `BOLNA_API_KEY`.
- **Next.js server** (Vercel env when deployed; `.env.local` in local dev, gitignored): Sarvam key and TTS settings, the OpenAI key, `CONVEX_SERVER_SECRET`, `HASH_SECRET`. Every module that reads them starts with `import "server-only"`. The voice routes (§6.1) read:
  - `SARVAM_API_KEY` (required for audio and the read-back); `SARVAM_STT_MODEL` (default `saaras:v4`); `SARVAM_TTS_MODEL` (default `bulbul:v4-flash`); `SARVAM_TTS_SPEAKER` (Hindi, default `ashutosh_hi_conversational`); `SARVAM_TTS_SPEAKER_EN` (English, default `dev_en_conversational`);
  - `OPENAI_API_KEY` (required, every environment), `OPENAI_MODEL` (default `gpt-5.4-mini`);
  - `CONVEX_SERVER_SECRET` (at least 32 characters, the same value in Convex env) and `HASH_SECRET` (the IP hash); `NEXT_PUBLIC_CONVEX_URL`.
- **Convex env for the extractor:** `OPENAI_API_KEY` (the same key; needed for `SIM_EXTRACT=llm` and before any live dial, guard 8) and `OPENAI_MODEL` (optional; keep it equal to Vercel's).
- **Convex env for the voice routes:** `CONVEX_SERVER_SECRET` (same value as Vercel; unset or shorter than 32 characters answers `not_configured`) and `VOICE_DAILY_INR_CAP` (whole rupees; unset = 500; 0 turns both routes off; anything else fails closed).
- **Vercel only:** `CONVEX_DEPLOY_KEY` (one for Production, one for Preview).
- **Everything else** lives in Convex env, set per deployment (`npx convex env set`, with `--prod` for production).

## 13. Cost
| Item | Estimate |
|---|---|
| Voice order (STT + parse) | about ₹0.35 (charged ₹0.40 against the daily cap) |
| Live order (4 quotes of about 1.25 min, 2 haggles and 1 match of about 1 min, 1 confirm), with telephony billed per minute | **about ₹65–80** |
| Sim order | ₹0. With `SIM_EXTRACT=groundtruth` (the default in tests and demos) sim calls use the persona's ground-truth quote; `SIM_EXTRACT=llm` runs real extraction with `OPENAI_API_KEY`, cached by `hash(persona, items, round)` and the model. |
| Founders' browser web calls (`/app/admin/agents`) | billed to the Bolna wallet per minute like any execution (compare `pnpm bolna:check` before and after) |
| Free credits | Sarvam ₹100, Bolna $5 trial |

Store `costUsdCents` per call and show live cost to admins in the presenter.

## 14. Testing
- **Unit:** `lib/pricing.ts`, `lib/haggle.ts`, `lib/numbers.ts` (Hindi number words both ways), `lib/commands.ts` (negation grammar), the claimDial guard, and the disclosure check.
- **Convex:** `convex-test` for ownership checks, webhook idempotency and out-of-order statuses, the watchdog, and stale workpool jobs.
- **Evals:** `pnpm eval:parse` (target ≥ 18/20), `pnpm eval:extract` (target ≥ 9/10).
- **E2E:** Playwright Pixel 7 profile with `--use-file-for-fake-audio-capture=e2e/demo.wav`. Sim flow from mic to placed; the sandbox flow; and a check that `/p` shows no site, date or phone.
- **Budgets:** `size-limit` in CI (`/app` initial JS under 200 KB gzipped; fonts ≤ 250 KB).
- **Manual:** a ₹12k Android outdoors at noon each week; Safari on iPhone for the recorder and recording seek.

## 15. Deployment
- Claude Code runs the deploys and env changes through the Convex and Vercel CLIs (R12), after the human has signed in once (device flows). Production env changes for live calls (`LIVE_CALLS_ENABLED`, `BOLNA_TRIAL`, `A2P_DECLARED`, `LIVE_STAGE`) need the human's explicit go-ahead each time.
- Convex: `dev`, `prod` (EU Ireland, R16) and a separate **`demo`** deployment for judges. The live list is in `docs/DEPLOYMENTS.md`.
- Vercel: production plus previews. The voice route is pinned to `bom1`. If the Convex plan has no preview deploy keys, previews are turned off and phones test through the `cloudflared` tunnel instead.
- Bolna: agents' webhook URL points at the matching Convex site, with a header secret.
- Live calls stay off in production until §11 can pass for real.
