# Molbhav — Architecture

Every decision here is traced in `docs/DECISIONS.md` (codes like B3, F3). Re-check vendor docs before coding an integration; details below were verified in November 2026.

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Web | **Next.js 16 (≥ 16.3.6)**, App Router, TypeScript strict, on Vercel | 16.3.6 fixes CVE-2026-94545 in ImageResponse (F6) |
| Backend | Convex: DB, realtime queries, actions, HTTP actions, scheduler, storage | No India region: production runs in EU (Ireland), the closest (R16); latency-critical voice work runs on Vercel `bom1` (F3) |
| Auth | **Convex Auth** (`@convex-dev/auth` 0.0.x; the 2.0 rewrite has no public Anonymous provider yet): Anonymous provider now; Google sign-in for real contractors and founders in Phase 10; admin verification for live users | B1, S1, G8 |
| Durable jobs | `@convex-dev/workpool` (retries, parallelism), `@convex-dev/rate-limiter` | Convex scheduled actions run at most once (B4) |
| UI | Tailwind CSS v4 (`@theme` tokens), shadcn/ui primitives restyled, Motion (`LazyMotion` + `m`), React `<ViewTransition>`, Phosphor icons (Bold; `/ssr` in server components) | F7 |
| Fonts | `next/font/local` with static subset files from `scripts/fonts.py` | D3 |
| STT | Sarvam Saaras (`/speech-to-text`, `mode: codemix`) | |
| TTS | Sarvam Bulbul v4 Flash (fallback: browser `speechSynthesis` `hi-IN`) | |
| LLM | Gemini Flash via `@google/genai`, JSON schema output, lowest thinking level | Billed key for anything real (§7) |
| Calls | Bolna: outbound agents, webhooks, `report_quote` custom function | |
| Share images | `@vercel/og` **1.0.3** (pinned exactly), Node runtime, static TTFs | The Satori bundled in Next 16.4 breaks Hindi conjuncts (F5). 1.0.3 ships Satori 0.33.5, the version patched for the September 2026 RCE advisory (GHSA-wx4j-mvgx-mqwp). Never use an older `@vercel/og`. |
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
  ├─ Gemini parse (order schema)
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
    p/[publicId]/opengraph-image.tsx   PNG via @vercel/og 1.0.3 (Node)
  (product)/
    layout.tsx                 ConvexAuthNextjsProvider + ConvexClientProvider
    app/page.tsx               home (/app)
    app/onboarding/page.tsx
    app/order/[id]/{confirm,dealers,sweep,result,placed}/page.tsx
    app/admin/page.tsx         founders only (requireAdmin)
    try/page.tsx               sandbox (/try); anonymous session, sim only
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
  i18n/{hi,en}.ts getDict.ts useT.ts
  config.ts                    GST, call hours, limits, price-band seeds, brand tiers and CITY_AREAS per city, DELIVER_BY
  client/{recorder,ptt,earcons,haptics}.ts
convex/
  schema.ts auth.ts auth.config.ts http.ts crons.ts
  contractors.ts sites.ts dealers.ts orders.ts calls.ts quotes.ts share.ts waitlist.ts events.ts admin.ts
  sandbox.ts settings.ts limits.ts tts.ts
  lib/access.ts                requireContractor, requireOwner, requireAdmin; HMAC hash helper
  pools.ts                     workpool definitions (dial, llm, media)
  bolna.ts                     internal: dial, fetchExecution, stopCall, ingest, process, watchdog
  llm.ts                       internal: extractQuote (and parse helpers shared with the route)
  media.ts                     copyRecording (internal); recToken (public, ownership-checked); /rec HTTP route
  sim/{personas,runCall}.ts    internal
  seed.ts                      internal (CLI only); admin.resetDemo for the presenter
scripts/fonts.py               generates app/fonts/*
scripts/bolna-check.ts         pnpm bolna:check (wallet, concurrency, agents, webhooks; read-only)
scripts/bolna-sync.ts          pnpm bolna:sync: creates or updates the four agents from bolna/agents/ (never dials, R12)
bolna/agents/                  versioned agent configs built from docs/CALL_SCRIPT.md (quote, haggle, match, confirm)
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
  }).index("by_user", ["userId"]),

  sites: defineTable({
    contractorId: v.id("contractors"),
    name: v.string(), city: v.string(),
    area: v.string(),                    // one of CITY_AREAS[city] in lib/config.ts, never free text (R7)
    lat: v.optional(v.number()), lng: v.optional(v.number()),
    isDefault: v.boolean(),
  }).index("by_contractor", ["contractorId"]),

  dealers: defineTable({
    name: v.string(), area: v.string(), city: v.string(),
    phoneE164: v.string(),               // never returned to clients
    phoneHash: v.string(),
    materials: v.array(material),
    source: v.union(v.literal("seed"), v.literal("admin"), v.literal("optin")),
    consent: v.union(v.literal("test_ok"), v.literal("opted_in"), v.literal("unknown"), v.literal("opted_out")),
    language: v.optional(v.string()),
    isDemo: v.boolean(),
    simPersona: v.optional(v.string()),
  }).index("by_city", ["city"]).index("by_phoneHash", ["phoneHash"]),

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
    publicId: v.optional(v.string()),    // 16 random bytes as 22 base64url characters (128 bits), revocable
    shareMode: v.optional(v.union(v.literal("full"), v.literal("savings"), v.literal("munshi"))),
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
    extract: v.union(v.literal("pending"), v.literal("running"), v.literal("done"), v.literal("failed")),
    extractAttempts: v.number(),
    terminationReason: v.optional(v.string()),
  }).index("by_order", ["orderId"]).index("by_execution", ["providerExecutionId"]).index("by_deadline", ["deadlineAt"])
    .index("by_mode_status", ["mode", "status"]),   // claimDial counts active live calls (R2)

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
    saidFinal: v.boolean(),
    confidence: v.number(),
    readBackConfirmed: v.boolean(),      // computed in code from the transcript, not by the LLM
    totalSource: v.union(v.literal("computed"), v.literal("stated")), // stated = his own all-in figure (R1)
    landed: v.object({ subtotal: v.number(), gst: v.number(), delivery: v.number(), unloading: v.number(), total: v.number() }), // integer paise; total is a whole rupee (R5)
    flags: v.array(flag),
    comparable: v.boolean(),             // may win
    citable: v.boolean(),                // may be cited in haggle/match
  }).index("by_order", ["orderId"]).index("by_call", ["callId"]),

  providerEvents: defineTable({
    executionId: v.string(), status: v.string(), receivedAt: v.number(), processed: v.boolean(),
  }).index("by_exec_status", ["executionId", "status"]),

  waitlist: defineTable({
    name: v.string(), phoneE164: v.string(), city: v.string(),  // city defaults to "Jaipur" on /dealer
    area: v.optional(v.string()), materials: v.optional(v.array(v.string())),
    role: v.union(v.literal("contractor"), v.literal("dealer"), v.literal("home_builder")),
    nextOrder: v.optional(v.string()), ref: v.optional(v.string()),
    consentContact: v.boolean(),
    consentAiCalls: v.optional(v.boolean()),  // dealers from /dealer: agrees to AI quote calls
    ipHash: v.string(), createdAt: v.number(),
  }).index("by_phone", ["phoneE164"]),

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
  }).index("by_phoneHash_at", ["phoneHash", "at"]),

  priceBands: defineTable({              // dated sanity bands for citing (C4); seeded from lib/config.ts, edited in /app/admin (R13)
    city: v.string(), material,
    unit,                                // kg for steel, bag for cement
    minPaise: v.number(), maxPaise: v.number(),
    updatedAt: v.number(), updatedBy: v.string(),
  }).index("by_city_material", ["city", "material"]),
});
```

## 5. Identity, auth and access
- **Anonymous Convex Auth session** at first open; the onboarding consent creates `contractors`.
- **Every public query and mutation** is built with a guarded builder (`convex/lib/functions.ts`), loads the contractor from `ctx.auth` and checks ownership of every order, call and quote it touches. Results go through allowlist projections (`publicDealer`, `publicCall`). Clients never receive `dealers.phoneE164`, phone hashes, provider ids, storage ids or costs.
- **Sessions** last up to a year (90 days inactive) with persistent cookies, because the anonymous identity is the browser session. New anonymous accounts are rate-limited deployment-wide (`anonSignUp`).
- **Internal only:** `sim.*`, `llm.*`, `bolna.*`, `media.copyRecording`, `seed.*`, `calls.claimDial`, the watchdog.
- **Live mode** requires `contractors.verified` (S1): set by `admin.verifyContractor`, behind an admin role checked against `ADMIN_USER_IDS`, and logged in `auditLog`. Name and phone are locked at verification.
- **Dealers for live mode** are added only through `admin.addDealer` or the `/dealer` opt-in (S2).
- **Server-to-Convex calls** from Vercel routes run as the user (their auth token is forwarded). The sandbox route uses `sandbox.createDraft({ serverSecret })`, which checks `CONVEX_SERVER_SECRET`.
- **Prompt-injection hygiene** (S3, R7): names are letters and marks only (max 24 graphemes); site area from the city's area list; delivery time from `deliverBy`; brand from the config enum; free text never reaches agent prompts.

## 6. Flows

### 6.1 Voice order (fast path, F3)
1. The client records with `lib/client/recorder.ts`. It probes MIME types in order: `audio/webm;codecs=opus` → `audio/webm` → `audio/mp4`, at 24 kbps mono. It stops the tracks after each take and discards clips with under 0.6 s of speech.
2. `POST /api/voice/order` with the audio and the auth token. The route calls `checkBotId()` (403 for bots), verifies identity and consumes the rate limit (`limits.consumeVoice`).
3. Sarvam STT (`mode: codemix`). The transcript is **streamed to the client immediately**.
4. Gemini parse with the order schema (§8.1), thinking level lowest. Validate with zod and convert null to undefined.
5. `orders.createDraft` (authenticated) writes the draft and returns its id. The client navigates to Confirm (prefetched).
6. Audio is never stored (B6). The typed fallback posts text and skips step 3.
7. Target: transcript in about 1.5 s, Confirm in about 2.5 s after release, on 4G. Log timings per step.
8. The read-back on Confirm (V3) comes from `POST /api/tts` with `{ draftId }` (Vercel, `bom1`; BotID-protected; the client plays the returned audio): it checks auth and ownership, applies a per-user rate limit, **builds the text on the server from the draft** (never from the request), calls Bulbul v4 Flash and returns audio. There is no endpoint that speaks arbitrary text.

### 6.2 Sweep start and dispatch
1. `orders.startSweep({ orderId, mode })` checks ownership and confirmation (every item has quantity, unit and a single tier: branded, local_isi or any). In live mode it also checks `MAX_LIVE_SWEEPS_PER_HOUR` (R2). It increments `roundSeq` and creates `calls` rows (`round: "quote"`) for the selected dealers, **except the regular dealer unless `askFirst`**; he is held for the match call (P1).
2. Sim: schedule `sim.runCall` per call with staggered starts.
3. Live: enqueue a `dial` workpool job per call. Each job runs `internal.calls.claimDial(callId)` (§11), which checks every guard, reserves a live slot and moves `queued → dialing` atomically. Only then does it call Bolna `POST /call`. `claimDial` returns `ok`, `refuse` (reason code; the call is `cancelled` with that reason) or `wait` (no free slot, R2): on `wait` the call stays `queued` and the job is enqueued again when any live call reaches a final status (plus a 15 s backstop), until its 10-minute queue deadline, then it is `cancelled` with `queue_timeout`. The live slot count, not the pool's parallelism, limits concurrent calls (dial pool parallelism 1). An unknown dial outcome is **not retried**: check `GET /v2/agent/{id}/executions` first.
4. Each call gets a **deadline** (`deadlineAt`), and a watchdog (`internal.bolna.watchdog`) runs at each deadline: queued 10 min; dialing 30 s (check `GET /v2/agent/{id}/executions` first, R15); ringing 45 s; in progress = `call_terminate` + 30 s; disconnected 90 s. It polls Bolna, then stops the call (`POST /call/{id}/stop`) or marks it failed. Every live call therefore reaches a final status, which frees its slot.
5. The round advances to haggle when **3 citable quotes are in** or **every call has finished**. Still-queued calls are stopped. Retries are new call rows (attempt + 1) through `claimDial`, within the per-order limit (R3): one live retry for `no_answer`, 3 minutes later, if the round is still open; or one for `callback_requested` at `callbackWhenText`, if that is within 30 minutes and the round is still open (P8). A retry row is created at its scheduled time, so its 10-minute queue deadline starts then (R15). A call with a retry scheduled counts as unfinished, so the round waits for it (at most 30 minutes).
6. "सब कॉल रोकिए" (stop all): cancels queued jobs, stops in-progress calls, and moves the order to `ready` with what we have.

### 6.3 Live call lifecycle (Bolna, B3)
- `POST https://api.bolna.ai/call` with `Authorization: Bearer`. The body has `agent_id`, `recipient_phone_number`, `from_phone_number` and `user_data` (including `molbhav_call_id`). The response gives `execution_id`.
- `POST /bolna/webhook` (Convex HTTP action): check the `x-molbhav-secret` header → `internal.bolna.ingest` (dedupe on executionId + status into `providerEvents`; map to our call by `providerExecutionId`, or by `context_details.recipient_data.molbhav_call_id` if the webhook beats our write) → return 200 in under 1 s.
- `internal.bolna.process` re-fetches `GET /executions/{id}` and applies a status only if `rank(new) > statusRank`; final statuses never change. **`completed` is the done signal** (not `call-disconnected`). On `completed`: store transcript, duration, `total_cost` (US cents) and termination reason; enqueue `media.copyRecording` and `llm` extraction. On any final status, kick the waiting dial jobs (R2).
- **Status map and ranks (R4).** Webhooks set only `status`; `outcome` comes from extraction.

  | Bolna status | Our `status` | Rank |
  |---|---|---|
  | `scheduled`, `queued` | `queued` | 0 |
  | `initiated` | `dialing` | 1 |
  | `ringing` | `ringing` | 2 |
  | `in-progress` | `in_progress` | 3 |
  | `call-disconnected` | `disconnected` | 4 |
  | `completed` | `completed` (final) | 10 |
  | `no-answer` | `no_answer` (final) | 10 |
  | `busy` | `busy` (final) | 10 |
  | `failed`, `error`, `balance-low` | `failed` (final, keep the reason) | 10 |
  | `canceled`, `stopped` | `cancelled` (final) | 10 |
  | `rescheduled` | not expected: Bolna-side retries are off (R2). Mark `cancelled` with reason `bolna_rescheduled`, stop the execution, and log an alert. | 10 |
  | anything unknown | no change; log it | — |

  `claimDial` sets `dialing` itself (rank 1) before `POST /call`. The watchdog may set `failed` or `cancelled` (rank 10).
- `POST /bolna/report-quote` (custom function endpoint): verify the secret, update `calls.slots` and `calls.provisionalTotal`, and reply in under 100 ms (C8). For the Match agent the reply carries `cite: true|false`, decided by `lib/pricing.ts` (his first total, computed from the rates he said, vs the best citable total), never by the LLM. With `outcome: opt_out` it applies the opt-out at once (R15): `dealers.consent = opted_out`, cancel that dealer's queued calls, and schedule deletion of all their recordings. With `outcome: confirmed` or `terms_changed` (Confirm agent) it records a provisional `calls.outcome`; extraction confirms it.
- After **ranking is frozen at `ready`**, late webhooks update only call records, never the ranking.

### 6.4 Sim call lifecycle
`sim.runCall` builds a deterministic dialogue from the persona (seed = `hash(persona, items, round)`, so identical sim calls hit `extractCache`) and **writes the whole script once** as `callEvents` with `atMs` offsets. The client reveals lines by server time, so there is no scheduler storm. `SIM_PACE` = `demo` (whole flow about 1 minute) or `realistic` (2–4 minutes, used in development so the team feels live timing). It writes `calls.transcript` in Bolna's `assistant: … / user: …` format, then enqueues the **same** extraction job as live. With `SIM_EXTRACT=groundtruth` (default in tests and demos) that job takes the persona's ground-truth quote instead of calling Gemini, but still runs every code check and the pricing; `SIM_EXTRACT=llm` exercises the real extractor.

### 6.5 Extraction
`llm` workpool job (parallelism 4, 3 retries with backoff; stale if `roundSeq` changed):
1. `llm.extractQuote` sends the transcript plus order items to Gemini (§8.2), checking `extractCache` first.
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
`orders.place({ orderId, expectedQuoteId })` checks that the winner hasn't changed and starts the undo window (`UNDO_WINDOW_SEC`: 120 s live, 5 s sim demo). The scheduled job id is stored in `placeJobId`, so "रद्द" cancels it. Then a Confirm agent call (relay only). `outcome: confirmed` moves the order to `placed`. `terms_changed` brings the contractor back to Result with the runner-up highlighted. A confirm call that doesn't connect (no answer, busy, failed) leaves the order in `placing` with "dealer से बात नहीं हो पाई" (`placed.notReached`) and a retry option (R15). Voice confirm goes through `lib/commands.ts` (V4).

### 6.8 Result summary
`tts.summary` builds 2–3 short sentences in code, speaking the site and deadline only if they are non-default, then calls Bulbul v4 Flash. Audio is cached in storage for 24 h. Muted by default when the user has turned the spoken result off (V7).

### 6.9 Sandbox `/try` (G3)
The route `POST /api/voice/order?sandbox=1` calls `checkBotId()` and refuses bots. The mic is behind a tap, and the request is made with `fetch` from the `/try` page, so BotID's challenge headers are attached. Limits: `sbx:device` 3/h, `sbx:ip` 10/h, `sbx:global` 500/day, plus a daily ₹ kill switch (`SANDBOX_DAILY_INR_CAP`), on a separate billed Gemini key. Then `sandbox.createDraft` (server secret) creates `kind: "sandbox"`, forced to sim mode, with `expiresAt` 24 h. Sandbox orders never get `publicId` and never go live. A cron deletes expired sandbox orders. The landing-page hero board runs on client-side fixtures only.

### 6.10 Shared parchi (G4)
`share.create({ orderId, mode })` makes a revocable 22-character (128-bit) `publicId`. `share.public({ publicId })` returns only: dealer name, items (no rates in `savings` mode), total, saving vs the first rate, delivery window, and a DEMO watermark flag. **Never** site, date, phone numbers, recordings or losing prices. The page is `noindex`. `opengraph-image.tsx` renders the same data with `@vercel/og` 1.0.3 and static TTFs. The client prefetches it when Result settles and calls `navigator.share({ files })` inside the tap, falling back to a wa.me link to `/p/...`.

### 6.11 Recordings and retention (B6, S4)
- `media.copyRecording` (media pool) follows Bolna's recording URL (a 24 h presigned redirect) and saves the file to Convex storage.
- Playback: `media.recToken({ callId })` (ownership-checked query) returns a 10-minute HMAC token, and the HTTP route `/rec/:callId?t=` streams the file with **Range/206** support (needed for Safari seeking).
- Crons:
  - delete recordings and transcripts at 30 days;
  - delete sandbox orders at `expiresAt`;
  - delete TTS cache after 24 h;
  - delete opted-out dealers' recordings immediately.
- `callLog` keeps the number hash, time, consent and outcome for 1 year.
- Bolna keeps its own copy and documents no delete API. Disclose this in the privacy notice, and turn on India data residency if available.

### 6.12 Presenter `/present` (B8)
`/present` embeds `/app?embed=1` in an iframe signed in as the **demo contractor** (sim only). Anonymous sign-in always makes a new user, so on the demo deployment an admin runs `admin.claimDemoContractor` once from the presenter laptop: it re-points the seeded demo contractor's `userId` to that session (admin only, demo deployment only, `isDemo` rows only). No public function can switch identity. The right-hand panel subscribes to that session's orders only. Cost and readiness views need the admin role. "Reset demo" calls `admin.resetDemo`, which touches demo rows only.

### 6.13 Waitlist, dealer opt-in and analytics (G5, G6, S2)
- The landing page and `/dealer` are server components. Their forms post to a **server action** that hashes the IP (HMAC-SHA256 with `HASH_SECRET`, B10) and calls `waitlist.join({ serverSecret, ipHash, ... })`. That mutation checks `CONVEX_SERVER_SECRET` and consumes a rate limit keyed by the IP hash (5 per hour). The consent checkbox is required.
- `/dealer` writes `role: "dealer"` with `consentAiCalls`. This never makes a number callable by itself: an admin calls the dealer back, confirms, and only then runs `admin.addDealer` with `consent: "opted_in"` (S2).
- Analytics: `POST /api/e` (Vercel route, rate-limited) → `events.track({ serverSecret, name, props, path })`. Only the event names in G6 are accepted. No phone numbers, names or free text go in `props`.
- WhatsApp click-to-chat (`wa.me/<team number>?text=…`) is the main call to action; the form is the fallback.

## 7. External APIs (verified November 2026)

**Sarvam**
- Base `https://api.sarvam.ai`, header `api-subscription-key`.
- STT: `POST /speech-to-text`, multipart `file`, `model` (`saaras:v4`), and `mode` (`transcribe | translate | verbatim | translit | codemix`). REST limit 30 s of audio.
- Pricing: STT ₹0.49/min; Bulbul v3 ₹3 and v4 Flash ₹1 per 1,000 characters. **New accounts get ₹100 of free credit.**

**Gemini**
- `@google/genai` `generateContent`, `responseMimeType: "application/json"`, `responseSchema` (OpenAPI subset: use `nullable`, never `null` in `type` or `enum`).
- The free tier may use prompts to improve Google's products: **only fixtures and demo data there** (your own team's test speech counts as demo data). Speech or transcripts from real contractors and dealers, and evals built from them, use a **billed** key (`GEMINI_API_KEY_BILLED`). In production the voice route uses only the billed key. The sandbox uses its own billed project.

**Bolna**
- Base `https://api.bolna.ai`, `Authorization: Bearer`.
- `GET /user/me` returns the wallet and concurrency.
- `POST /call` returns `execution_id`.
- `GET /executions/{id}` returns status, transcript, duration, `total_cost` (**US cents**), `cost_breakdown`, `telephony_data.recording_url`, `context_details.recipient_data` and `termination_reason`.
- Other endpoints: `POST /call/{id}/stop`; `GET /v2/agent/{id}/executions`.
- Trial: **2 concurrent calls, verified numbers only.** Paid plans start at 10 concurrent calls.
- A number **bought from Bolna** needs a compliance application with a CIN and GST certificate. Alternatively connect **your own Plivo or Exotel account** (Settings → Integrations → Telephony); calls then use that provider's numbers and KYC, which accepts a sole proprietorship. `bolna.dial` then passes the provider number as `from`.
- No mid-call transcript stream. Custom functions can run mid-call, with a 50–500 ms pause.
- Webhooks are retried, so be idempotent. Custom webhook headers are supported.
- Agents are created and updated through the agent API (`/v2/agent`; confirm the exact create/patch shape in Bolna's docs) by `pnpm bolna:sync`, from the configs in `bolna/agents/` (R12). It never dials. Agent-level retry and reschedule settings stay off (R2).
- Helpers: the `setup-webhook`, `setup-tools` and `get-executions` skills only (`START_HERE.md` A3), and the Web Call SDK for browser tests. Never the calling or number-buying skills, and never the `transfer_call` tool (it would bridge a live call to another number).

**Vercel BotID:**
- `pnpm i botid`.
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
After parsing, code (not the LLM) matches `siteText` to the contractor's sites and the city's `CITY_AREAS` list; the result is confirmed with a chip on Confirm (R7).
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
lumpSumTotal: an all-in total only if the dealer said one as a single figure, with what it includes (gst, delivery, unloading). Never add numbers up yourself.
deliveryCharge / unloadingCharge (bhada / utarai or hamali): a number (0 if they said free or included); null if not said.
deliveryEtaText, deliveryBy (today/tomorrow_morning/tomorrow/day_after/this_week/flexible, or null), creditDays, billType (pakka/kachcha/unknown), weightBasis (kanta/standard/unknown), validityText.
first: in a match call only, the same fields (lines, lumpSumTotal, charges, GST modes) as the dealer said them BEFORE the assistant cited any other number. Code computes his first total from it.
outcome: quoted | declined | callback | opt_out | terms_changed | confirmed (confirm calls: every term matched) | no_quote. callbackWhenText if given.
saidFinal: the dealer said this is final/last. confidence 0..1, lower if numbers were unclear or corrected.
Output only JSON.
```
Same `nullable` style. The LLM never returns a computed total; `lib/pricing.ts` computes every total, including `firstTotal` (R1). `evals/extract.golden.json`: 10 cases, including a per-quintal rate with unclear GST, a dealer who corrects his own number, a no-bill offer, a match call, and (once available) real call transcripts with names and numbers replaced.

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

statedAllIn = lumpSumTotal, only when lumpSumIncludes covers gst, delivery and unloading (R1)
total (R1, R5):
  - this call gave a rate for every item → computed; if statedAllIn was also said in this call and
    |statedAllIn − computed| / computed > 0.5% → flag lump_sum_mismatch            (totalSource: computed)
  - else, statedAllIn said in this call → statedAllIn; the quote's lines are not cited  (totalSource: stated)
  - else → computed from what exists (inherited lines for haggle/match-final), with flags  (totalSource: computed)
  then round the total to the nearest rupee ONCE (half up); that rupee figure is used everywhere

flags: gst_unclear, delivery_unknown, unloading_unknown, missing_item, partial_stock, stock_unknown, low_confidence (<0.8),
       tier_mismatch, no_bill (billType ≠ pakka), weight_unknown, brand_unknown, unit_mismatch,
       not_read_back, rate_not_in_transcript, out_of_band (outside priceBands[city][material]), lump_sum_mismatch,
       outlier (|total − median| / median > 0.15, the median of the order's quote totals in the same round and tier; needs 3+ quotes)
       (a stated all-in figure covers GST, delivery and unloading, so it clears gst_unclear, delivery_unknown and unloading_unknown)

comparable (may win) = no missing_item, no partial_stock, no stock_unknown, no tier_mismatch, no no_bill,
                       no brand_unknown, no weight_unknown, no delivery_unknown, no unloading_unknown (R6),
                       no gst_unclear, no outlier, no unit_mismatch, no rate_not_in_transcript, no lump_sum_mismatch
citable (may be cited) = comparable AND readBackConfirmed AND confidence ≥ 0.8 AND flags = []
                         AND the city's priceBands row updated within 14 days
                         (sim: the band check uses the persona's own band, always fresh; seed:reset and
                          admin.resetDemo write updatedAt = now, so the demo never goes stale)
rank: comparable quotes, same tier, by total ascending
winner: among comparable quotes within 0.5% of the cheapest, the most creditDays, then earlier deliveryBy, then lower total
savings: vs the regular dealer's first rate ("आपके dealer के पहले रेट से"): firstTotal from his match call, or his
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
2. The contractor is `verified`; per-contractor daily cap not exceeded.
3. Consent is `test_ok` or `opted_in`, and not `opted_out`.
4. Dealer limits (S2, R3), counted from `callLog` rows for this `phoneHash` since midnight IST: AI calls come from at most **2 distinct orders** across all contractors (a quote or match call opens an order's slot; that order's haggle and confirm calls ride on it), and at most **4 AI calls per order** to this number (one opening call, one retry if it didn't connect, one haggle, one confirm). `claimDial` writes the `callLog` row (with `orderId` and `callId`) when it reserves the dial. Trial mode (B9): instead, `TEST_DAILY_CALLS` (default 10) per day for `test_ok` dealers listed in `TEST_PHONE_HASHES`.
5. The current time in `Asia/Kolkata` is within `CALL_HOURS_START`–`CALL_HOURS_END` (default 10–19), and not Sunday unless `ALLOW_SUNDAY`. Skipped in trial mode for listed `test_ok` dealers (teammates).
6. Under `MAX_LIVE_CALLS_PER_ORDER` (12, refuse), and a live slot is free: fewer than `LIVE_CONCURRENCY` live calls in `dialing`, `ringing`, `in_progress` or `disconnected` (`calls.by_mode_status`, counted in this transaction). A full slot returns **wait** (R2). `MAX_LIVE_SWEEPS_PER_HOUR` is checked in `orders.startSweep`, not per dial.
7. `BOLNA_FROM_NUMBER` is set (a number registered to our business, from Bolna or our own Plivo/Exotel account, declared for A2P use under TRAI's 2026 rules). In trial mode (`BOLNA_TRIAL=true`) Bolna's trial caller ID is accepted, but only `test_ok` dealers whose phone hash is in `TEST_PHONE_HASHES` can be dialled; `opted_in` dealers always need trial mode off and a registered number.
8. `GEMINI_API_KEY_BILLED` is set (real transcripts never go to the free tier).
9. The number matches `^\+91[6-9]\d{9}$` and the dealer is not `isDemo` (B10).
10. For `opted_in` dealers (built in 8A, failing closed; extended in Phase 10): `A2P_DECLARED=true`, and the live stage allows it (`LIVE_STAGE=1`: admins only, at most `STAGE1_MAX_DEALERS` dealers marked `stage1`; `LIVE_STAGE=2`: verified contractors).

The client learns whether live mode is available only through `settings.liveAvailable` (a boolean plus a reason code). Not legal advice: confirm TRAI obligations with the telephony provider in writing.

## 12. Environment variables
See `.env.example`.
- **Client-visible:** `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_WHATSAPP_NUMBER`.
- **Next.js server** (Vercel env when deployed; `.env.local` in local dev, gitignored): Sarvam key and TTS settings, Gemini keys, `CONVEX_SERVER_SECRET`, `HASH_SECRET`. Every module that reads them starts with `import "server-only"`.
- **Vercel only:** `CONVEX_DEPLOY_KEY` (one for Production, one for Preview).
- **Everything else** lives in Convex env, set per deployment (`npx convex env set`, with `--prod` for production).

## 13. Cost
| Item | Estimate |
|---|---|
| Voice order (STT + parse) | about ₹0.3 |
| Live order (4 quotes of about 1.25 min, 2 haggles and 1 match of about 1 min, 1 confirm), with telephony billed per minute | **about ₹65–80** |
| Sim order | ₹0. With `SIM_EXTRACT=groundtruth` (the default in tests and demos) sim calls use the persona's ground-truth quote; `SIM_EXTRACT=llm` runs real extraction on the free key, cached by `hash(persona, items, round)`. |
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
