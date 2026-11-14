# Molbhav (मोलभाव): project memory for Claude Code

Molbhav is a voice-first buying agent for small building contractors (thekedars) in India.

1. The contractor speaks one order in Hindi or Hinglish ("Kal subah tak 2 ton 12mm sariya Fe500D aur 150 bori PPC cement…").
2. Molbhav calls nearby dealers and collects landed prices.
3. It bargains with the best two using only real, read-back-confirmed quotes.
4. It gives the contractor's regular dealer a chance to match.
5. It hands back the cheapest comparable option, with call recordings as proof.
6. The contractor confirms by voice.

## Read before any substantial work, in this order
1. `docs/DECISIONS.md`: the expert panel's decisions (codes like P1, V1, B2) and §R, the Phase 0 review changes (R1–R15), which override older rows. **If any doc disagrees with it, DECISIONS.md wins.**
2. `docs/PRODUCT.md`: users, scope, flows, edge cases, domain, metrics.
3. `docs/DESIGN.md`: design system, screens, voice UX, copy deck. **Design decisions live here; do not invent new ones.**
4. `design/reference/*.html`: the approved mockups (open them in a browser). Match their look, spacing and copy.
5. `docs/ARCHITECTURE.md`: stack, schema, auth, flows, API details, pricing rules, guards.
6. `docs/CALL_SCRIPT.md`: the four phone agents (Quote, Haggle, Match, Confirm) and call rules.
7. `docs/TEAM_TEST.md`: the teammate live-call test that closes Milestone 1.
8. `docs/DEMO.md`: the judge demo we are building toward.

## Stack (do not swap without asking)
- **Web:** Next.js **≥ 16.3.6** (App Router, TypeScript strict) on Vercel. Route groups `app/(marketing)` (server components, no Convex client) and `app/(product)` (Convex provider).
- **Backend:** Convex for the database, realtime queries, actions, HTTP actions, scheduler and storage. Vercel builds with `npx convex deploy --cmd 'pnpm build'`.
  - **Convex Auth** (Anonymous provider).
  - `@convex-dev/workpool`, `@convex-dev/rate-limiter`.
- **UI:**
  - Tailwind CSS v4 (`@theme` tokens) and shadcn/ui primitives, restyled to our tokens.
  - Motion (`LazyMotion` + `m`) and React `<ViewTransition>`.
  - Phosphor icons, Bold weight (`/ssr` in server components).
  - Fonts via `next/font/local` from `scripts/fonts.py`.
- **Voice:** Sarvam Saaras STT (`mode: codemix`) and Bulbul v4 Flash TTS. The voice route (`/api/voice/order`) and the read-back route (`POST /api/tts` with `{ draftId }`, text built on the server) run on Vercel, pinned to `bom1`.
- **LLM:** Gemini Flash via `@google/genai`, JSON-schema output, lowest thinking level.
  - Free-tier key: fixtures and demo data only.
  - Billed key: anything real.
- **Calls:** Bolna (outbound agents, webhooks to Convex HTTP actions, the `report_quote` custom function).
- **Other services:** `@vercel/og` **1.0.3** for share images; **Vercel BotID** (free Basic level, no keys) on the voice, read-back and sandbox routes.
- **Tooling:**
  - Package manager: pnpm.
  - Tests: Vitest (+ `convex-test`), Playwright (Pixel 7 profile, fake audio).
  - CI gate: `size-limit`.

## Working model (DECISIONS R12)
Claude Code does the work: installs, CLI sign-ins (device flows: show the human the code and URL, they approve in the browser), env vars, generated secrets, deploys, seeding and the Bolna agent setup through `pnpm bolna:sync`. Ask the human only for what they alone can give: accounts, API keys, phone verification, money, legal steps, physical-world tests and design-taste calls. When a step needs a password, use a macOS dialog (`SUDO_ASKPASS` with `osascript`) so the human types it; never ask for it in chat. Never print secret values; show env var names only.

Still off-limits without the human's explicit go-ahead in that moment: placing or starting any live call, turning on `LIVE_CALLS_ENABLED`, changing production live-call settings (`BOLNA_TRIAL`, `A2P_DECLARED`, `LIVE_STAGE`), spending money, buying a number, and anything legally binding.

## Commands
- Convex: run `npx convex dev --once` to push functions and regenerate `convex/_generated` after any change in `convex/` and before a typecheck. You may run the `npx convex dev` watcher in the background when it helps; if the human says they run one in their own terminal, don't start a second. `npx convex run`, `npx convex env`, `npx convex logs` and `npx convex data` are fine on dev. CI uses the committed `convex/_generated` and needs no deploy key.
- `pnpm dev` (Next.js): start it in the background when you need the app; same rule if the human runs their own.
- `pnpm test`, `pnpm typecheck`, and `pnpm lint` (= `eslint .`; `next lint` no longer exists).
- `pnpm eval:parse`, `pnpm eval:extract` (golden sets in `evals/`). They need the billed Gemini key once real transcripts are in them.
- `pnpm size` (size-limit) and `pnpm e2e` (Playwright).
- Convex secrets: `npx convex env set NAME value` (add `--prod` for production). Next.js server secrets go in Vercel project env for deployed builds; for local dev they go in `.env.local` (gitignored) or come from `vercel env pull .env.local`. Never commit them, never prefix them `NEXT_PUBLIC_`, and start every module that reads them with `import "server-only"`.
- Test on a real phone **only over HTTPS** (a tunnel or a Vercel preview). A LAN `http://` URL blocks the mic. The tunnel is `cloudflared` (a free tool, no account needed); `next.config.ts` sets `allowedDevOrigins: ['*.trycloudflare.com']` so the dev server accepts it.

## Hard rules
1. **Sim mode is the default.** Every flow must work end to end with the simulator and zero call spend. Live calls are opt-in per order.
2. **Live dials happen only through `internal.calls.claimDial`**, which checks every guard in ARCHITECTURE.md §11 atomically:
   - `LIVE_CALLS_ENABLED`;
   - a verified contractor;
   - an opted-in dealer, with AI calls from at most 2 orders a day to that number and at most 4 per order (S2, R3);
   - IST call hours;
   - the caps, and a free live slot (a full slot means **wait**, not refuse, R2);
   - a registered `BOLNA_FROM_NUMBER` (or trial mode with listed test phones only, B9);
   - a valid Indian mobile number and a non-demo dealer (B10);
   - for opted-in (real) dealers: `A2P_DECLARED` and the live stage (Milestone 2, Phase 10);
   - `GEMINI_API_KEY_BILLED` set.

   A failed guard means no dial. Never bypass a guard, even "just to test". Never retry a dial with an unknown outcome. Never call Bolna's dialing endpoints directly (no make-call or batch skills, no curl to `/call` or batches, no `transfer_call` tool), and never buy or connect a number: the only dial path is claimDial. Agent configuration through `pnpm bolna:sync` and read-only checks (`pnpm bolna:check`, execution lookups) are allowed (R12).
3. **Every call discloses "AI" and "रिकॉर्ड" in its first sentence** (and repeats it if the dealer cuts in), and a code check enforces it (S5). Never let an agent claim to be human. Use the respectful "आप" form everywhere, with **no gendered first-person verbs** in agent or app copy.
4. **Never invent a price.**
   - Haggle and match calls cite only the exact landed total of a **citable** quote from this order, and never name the other dealer.
   - Code decides what is citable and comparable (`lib/pricing.ts`), never the LLM.
   - Agents never add up numbers: read-backs repeat only the dealer's own figures, and code computes every total after the call (R1).
   - Confirm calls relay approved terms only; they never commit new ones.
5. **All money math is plain TypeScript in `lib/pricing.ts`**, in integer paise, covered by the golden tests. The LLM extracts what was said; code does the arithmetic.
6. **Security from day one:**
   - Every public Convex function checks `ctx.auth` and ownership.
   - Anything that costs money, dials, seeds or reads media is `internal*`.
   - Dealer phone numbers never reach the client. IP and phone hashes are HMAC-SHA256 with `HASH_SECRET`.
   - Admin checks use `requireAdmin(ctx)` against `ADMIN_USER_IDS`. No public function can switch identity.
   - API keys live only in Convex env or Vercel server env, never in client bundles or git.
7. **Webhooks are untrusted:**
   1. verify the `x-molbhav-secret` header;
   2. dedupe;
   3. return 200 fast;
   4. re-fetch the execution from Bolna before writing;
   5. apply a status only if its rank is higher.
8. **Never claim what isn't live.** Until AI calls to real dealers are allowed (a registered business number + TRAI A2P declaration + opted-in dealers), public copy says the Jaipur pilot is run by our team (G2).
9. **Money format:** Western digits with Indian grouping, `₹1,28,400`, via `Intl.NumberFormat("en-IN")`. Money never wraps (D4).
10. **i18n:** every user-facing string goes through the dictionary (`hi`, `en`). The `lang` cookie is read on the server. No hard-coded copy in components.
11. **Design tokens only:** follow `docs/DESIGN.md` and `design/reference/`. No new colours, fonts, shadows or radii without updating DESIGN.md first. shadcn's default classes (`shadow-sm/md/lg/xl/2xl`, `rounded-md`, `ring-offset-*`) are lint-banned; our own painted-shadow tokens are allowed.
12. **Privacy (DPDP):**
    - consent notice at onboarding and on the waitlist;
    - contractor order audio is never stored;
    - recordings live only in Convex storage behind HMAC tokens and are deleted at 30 days;
    - opt-outs are honoured at once.

## Code conventions
- **Dev machine: macOS (zsh).** Scripts must run on a Mac: write them in TypeScript (`tsx`) or Python, not bash, and never use GNU-only flags (`sed -i`, `date -d`, `grep -P`). Python runs inside `.venv`.
- **Folders (ARCHITECTURE.md §3):**
  - `app/`: routes;
  - `components/mb/`: presentational, props only;
  - `features/`: data hooks and containers;
  - `lib/`: pure logic, no React;
  - `convex/`;
  - `evals/`, `e2e/`, `scripts/`, `docs/`, `design/reference/`.
- Pure functions in `lib/` get unit tests next to them (`*.test.ts`).
- **Convex:**
  - validate every argument with `v.*`;
  - queries are pure;
  - side effects run in actions or workpool jobs;
  - every job carries `(orderId, roundSeq)` and does nothing if stale;
  - webhook handling is idempotent.
- Prefer server-side state in Convex over client state; the UI subscribes with `useQuery`.
- Make small, reviewable commits. Run typecheck, lint and tests before saying a phase is done.

## Definition of done for any screen
- Works at 360 px and at 1440 px (Munshi desk).
- Tap targets at least 56 px.
- Prices and primary text contrast at least 7:1.
- Works in `hi` and `en`.
- Has loading, empty and error states.
- Respects `prefers-reduced-motion`.
- Runs fully in sim mode.
- Matches its `design/reference` mockup.

## Glossary
- **thekedar:** contractor
- **sariya:** TMT steel bar
- **bori / katta:** 50 kg cement bag
- **suta:** a colloquial bar size; never mapped automatically (P7)
- **hamali:** unloading labour charge
- **udhaar:** credit
- **pakka / kachcha bill:** GST invoice / no bill
- **kanta:** weighed on a scale
- **landed price:** rate + GST + delivery + unloading
- **munshi:** site clerk
- **parchi:** receipt slip
- **bahi-khata:** ledger book
