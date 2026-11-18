// convex/schema.ts — kept identical to docs/ARCHITECTURE.md §4 (DECISIONS §R applied).
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
  v.literal("bolna_rescheduled"), v.literal("dealer_restricted"),
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
    sharePhoneWithDealers: v.optional(v.boolean()),  // R21: agents may give his verified number when a dealer asks; absent = yes
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
    bolnaVerifiedAt: v.optional(v.number()),   // on Bolna's trial "Verified numbers" list (our code step, or found there by a sync)
    // /dealer's code step (R25), server-only: the one-time ticket the form got back (SHA-256 hex; 30 minutes) and
    // the pending Bolna request. Never returned to any client.
    otpTicket: v.optional(v.object({ hash: v.string(), exp: v.number() })),
    bolnaOtp: v.optional(v.object({ requestId: v.string(), sentAt: v.number(), tries: v.number() })),
    google: v.optional(v.object({ subHash: v.string(), email: v.string(), at: v.number() })),  // signed in with Google (R25, optional)
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
    recordingStorageId: v.optional(v.id("_storage")),   // live only: copied from Bolna by media.copyRecording (B6); served only via /rec
    transcript: v.optional(v.string()),
    purgeAt: v.optional(v.number()),     // live only: when the recording and transcript are deleted (30 days after the call, B6, §6.11)
    lastCaption: v.optional(v.string()), // sim only; denormalised for cheap rendering
    provisionalTotal: v.optional(v.number()), // paise, from report_quote; display only, never cited
    slots: v.optional(v.object({ rate: v.boolean(), gst: v.boolean(), delivery: v.boolean(), credit: v.boolean() })),
    callbackWhenText: v.optional(v.string()),
    retryAt: v.optional(v.number()),     // live only: this call's one retry is scheduled then (no answer: +3 min; callback: the dealer's time, ≤ 30 min; P8, R15); the round waits for it
    citedQuoteId: v.optional(v.id("quotes")),    // haggle and match calls: the citable quote whose exact total was cited (C3)
    confirmQuoteId: v.optional(v.id("quotes")),  // confirm calls: the approved quote being relayed (C5)
    extract: v.union(v.literal("pending"), v.literal("running"), v.literal("done"), v.literal("failed")),
    extractAttempts: v.number(),
    terminationReason: v.optional(v.string()),   // Bolna's, kept server-side
    cancelReason: v.optional(cancelReason),      // set with status "cancelled" (R18); safe to show
  }).index("by_order", ["orderId"]).index("by_execution", ["providerExecutionId"]).index("by_deadline", ["deadlineAt"])
    .index("by_mode_status", ["mode", "status"])    // claimDial counts active live calls (R2)
    .index("by_dealer_status", ["dealerId", "status"])    // opt-outs cancel a dealer's queued calls and recordings (R15)
    .index("by_purgeAt", ["purgeAt"]),                     // the 30-day recording and transcript cron (§6.11)

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
  }).index("by_order", ["orderId"]).index("by_call", ["callId"]),

  providerEvents: defineTable({
    executionId: v.string(), status: v.string(), receivedAt: v.number(), processed: v.boolean(),
  }).index("by_exec_status", ["executionId", "status"]),

  waitlist: defineTable({
    name: v.string(), phoneE164: v.string(), city: v.string(),  // city defaults to "Jaipur" on /dealer
    area: v.optional(v.string()), materials: v.optional(v.array(v.string())),
    // munshi and other: the landing form's roles (Phase 1C); dealer: /dealer; home_builder: kept for old rows.
    role: v.union(v.literal("contractor"), v.literal("munshi"), v.literal("other"), v.literal("dealer"), v.literal("home_builder")),
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
    .index("by_contractor_at", ["contractorId", "at"])
    .index("by_at", ["at"]),                          // the 1-year retention cron (§6.11)

  priceBands: defineTable({              // dated sanity bands for citing (C4); seeded from lib/config.ts, set with admin:setPriceBand (R13, R18)
    city: v.string(), material,
    unit,                                // kg for steel, bag for cement
    minPaise: v.number(), maxPaise: v.number(),
    updatedAt: v.number(), updatedBy: v.string(),
  }).index("by_city_material", ["city", "material"]),
});
