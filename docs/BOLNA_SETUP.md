# Bolna setup (Phase 8B)

How the four phone agents get into Bolna, what the founders do in Bolna's dashboard, which settings go where, and how to check it all before the first test call. Decisions: `docs/DECISIONS.md` B2, B3, B5, B9, C1–C8, R2, R12, R18, R20. Agent texts: `docs/CALL_SCRIPT.md`. Code: `convex/bolna.ts`, `convex/bolnaHttp.ts`, `lib/bolna/`, `scripts/bolna-*.ts`, `bolna/agents/`.

**Nothing in this setup places a call.** The sync and check scripts can't reach Bolna's `/call` or `/batches` (their client refuses those endpoints before any request). The only dial path is `internal.calls.claimDial`, and only when `LIVE_CALLS_ENABLED=true`, which is set on dev only after a founder says "go".

---

## 1. What the founders do in the Bolna dashboard (once)

1. **Account.** Sign up at [platform.bolna.ai](https://platform.bolna.ai) on the trial. **Don't buy a number.** The trial dials **verified numbers only, 2 at a time** ([concurrency](https://www.bolna.ai/docs/pricing/outbound-calling-concurrency)), from Bolna's own caller ID.
2. **API key.** Create one in the dashboard and hand it to Claude Code (put it in `.env.local` as `BOLNA_API_KEY=…`, or type it into the macOS dialog Claude Code opens). Claude Code sets it on Convex without printing it.
3. **Verify each teammate's phone** in the dashboard (the trial refuses unverified numbers). These are the same phones Claude Code adds as `test_ok` dealers (`docs/TEAM_TEST.md`, `START_HERE.md` C5).
4. **After `pnpm bolna:sync` (step 4 below): the webhook header, once per agent.** Bolna's agent API has a field for the webhook URL but **not for webhook headers**; those are set only in the dashboard. For each of the four agents (`Molbhav Quote [dev]`, `… Haggle …`, `… Match …`, `… Confirm …`): open the agent → **Extractions** tab → **Webhook Configuration** → check the URL is `https://<dev>.convex.site/bolna/webhook` → **Add headers** → name `x-molbhav-secret`, value: paste (Claude Code runs `pnpm bolna:sync --from-convex --copy-webhook-secret`, which puts the secret on the clipboard without printing it) → leave **Trigger on statuses** at all statuses → **Save agent**. Re-check after every later sync (a full update replaces the agent's config).
   Until the header is there, webhooks are refused (401). Calls still finish: the watchdog polls Bolna at every deadline. But the board updates late, so do this before the first test call.
5. **Optional: your own provider keys.** Bolna bills its own Sarvam and ElevenLabs usage to the wallet. To use the team's credits instead, connect the key under **Settings → Integrations** ([providers](https://www.bolna.ai/docs/providers)): ElevenLabs asks for `ELEVENLABS` (your ElevenLabs API key), Sarvam can also be connected at [platform.bolna.ai/auth/sarvam](https://platform.bolna.ai/auth/sarvam). Usage on a connected key isn't billed by Bolna. Note: with a connected key, calls are routed through Bolna's US servers ([Indian servers](https://www.bolna.ai/docs/enterprise/indian-server-configuration)), which doesn't matter on the trial (it runs in the US anyway).
6. **India data residency:** an **Enterprise** feature ([data residency](https://www.bolna.ai/docs/enterprise/data-residency); contact enterprise@bolna.ai). Not available on the trial. Indian-server routing also needs Plivo telephony, no connected provider keys and an Azure OpenAI or AWS Bedrock LLM. Until it is on, the privacy page must say call audio and transcripts are processed by Bolna in the US (R13). Revisit in Phase 10.
7. **Check the telephony provider** of the trial's default number (any agent → **Call** tab). `bolna:sync` sets the agents' telephony to `plivo` unless told otherwise (`--telephony exotel|vobiz|twilio`). If the trial number is on another provider, Claude Code re-syncs with that flag.

## 2. Env vars, by place (names only)

**Convex env, dev deployment** (`npx convex env set NAME value`; Claude Code sets them, values never shown):

| Name | Value | Set when |
|---|---|---|
| `BOLNA_API_KEY` | the founders' Bolna key | when they give it |
| `BOLNA_WEBHOOK_SECRET` | generated, 64 hex characters (`openssl rand -hex 32`, never echoed); at least 24 characters or every webhook and tool call is refused | with the key |
| `BOLNA_QUOTE_AGENT_ID`, `BOLNA_HAGGLE_AGENT_ID`, `BOLNA_MATCH_AGENT_ID`, `BOLNA_CONFIRM_AGENT_ID` | the ids `pnpm bolna:sync` prints (not secrets) | after the sync |
| `BOLNA_TRIAL` | `true` (no `BOLNA_FROM_NUMBER` on the trial) | with the key |
| `TEST_PHONE_HASHES` | comma-separated hashes from `admin:addDealer` (or `admin:phoneHash`) | after adding the teammates as `test_ok` dealers |
| `OPENAI_API_KEY` | already set (R19); guard 8 needs it | — |
| `REC_TOKEN_SECRET` | generated (used by Phase 8C's recording links) | with the key |
| `LIVE_CONCURRENCY` | `2` (the trial's limit) | with the key |
| `TEST_DAILY_CALLS`, `MAX_LIVE_SWEEPS_PER_HOUR` | `15` and `6` on Team test days, reset afterwards | test days |
| `SITE_URL` | already set by Convex Auth; the admin web-call page's origin must match it | — |
| `WEB_CALL_ORIGINS` | optional, comma-separated extra origins for the web-call page (e.g. a `https://….trycloudflare.com` tunnel) | if needed |
| `LIVE_CALLS_ENABLED` | `true` **only after a founder says "go"**, dev only; `false` (or unset) rolls back at once | the go |

`HASH_SECRET` and `ADMIN_USER_IDS` already exist. Production stays untouched (`LIVE_CALLS_ENABLED`, `BOLNA_TRIAL`, `A2P_DECLARED`, `LIVE_STAGE` change there only with an explicit go-ahead, CLAUDE.md).

**For the scripts on the laptop** (either way works): put `BOLNA_API_KEY`, `BOLNA_WEBHOOK_SECRET` and optionally `CONVEX_SITE_URL` in `.env.local` (gitignored), or run the scripts with `--from-convex` so they read the key and secret with `npx convex env get` (nothing is printed). Without `CONVEX_SITE_URL`, the site URL is derived from `NEXT_PUBLIC_CONVEX_URL` (`.convex.cloud` → `.convex.site`). Script-only settings: `BOLNA_VOICE` (`sarvam` | `elevenlabs`), `BOLNA_TELEPHONY`, `BOLNA_ELEVENLABS_VOICE_ID`, `BOLNA_ELEVENLABS_MODEL`.

**Vercel:** nothing. The Bolna key lives only in Convex.

## 3. The scripts

- **`pnpm bolna:build`** (offline): writes `bolna/agents/{quote,haggle,match,confirm}.json` from `docs/CALL_SCRIPT.md` (`lib/bolna/agents.ts`). Welcomes, system prompts, cut-offs (`call_terminate`: 150, 90, 90, 90 s) and the shared settings (welcome delay 700 ms, interruption after 3 words, online check after 8 s with "जी, आप लाइन पे हैं?", silence hangup 20 s) are read from the doc, so **edit CALL_SCRIPT.md first, then run this**. A test fails if the committed JSON drifts from the doc, and the disclosure test reads these files too (every welcome's first sentence has "AI" and "रिकॉर्ड"; no gendered first-person verb in any fixed line). The files hold placeholders (`@@CONVEX_SITE_URL@@`, `@@BOLNA_WEBHOOK_SECRET@@`, `@@MOLBHAV_TARGET@@`), never a secret.
- **`pnpm bolna:sync [--target dev] [--from-convex] [--voice sarvam|elevenlabs] [--telephony plivo] [--site-url https://….convex.site] [--dry-run] [--copy-webhook-secret]`**:
  1. rebuilds the JSON files;
  2. refuses to go on without `BOLNA_API_KEY`, `BOLNA_WEBHOOK_SECRET` and a `https://<deployment>.convex.site` URL;
  3. checks the voice against Bolna's catalogue and takes its exact display name (a Sarvam voice that isn't offered falls back, out loud, to the closest male conversational voice of the same language);
  4. fills the placeholders: the webhook `https://<deployment>.convex.site/bolna/webhook`, the `report_quote` tool `POST https://<deployment>.convex.site/bolna/report-quote` with the `x-molbhav-secret` header, the names `Molbhav Quote [dev]` and so on;
  5. refuses any agent with a `transfer_call`, `calling_guardrails` (Bolna would reschedule calls outside hours), a `retry_config`, `auto_reschedule` on, or any tool other than `report_quote`;
  6. creates the agents that don't exist (`POST /v2/agent`) and replaces the ones that do (`PUT /v2/agent/{id}`), found by name (two with the same name stop it);
  7. reads each back (`GET /v2/agent/{id}`) and warns if the tool or webhook URL isn't visible;
  8. prints the ids and the `npx convex env set BOLNA_…_AGENT_ID <id>` lines, and the reminder for the dashboard header (section 1, step 4).
  `--dry-run` sends nothing. It never dials.
- **`pnpm bolna:check [--target dev] [--from-convex]`** (read-only, GETs only): the key works; wallet and concurrency (`GET /user/me`); for each agent (by `BOLNA_*_AGENT_ID`, else by name): status, webhook URL, header **names** (never values), tools and their URLs, voice, transcriber, `call_terminate`, and a `PROBLEMS` line if anything that must stay off is on.

### Voice sets and `pnpm bolna:voice` (18 Nov 2026)
Each deployment can have two complete sets of the four agents, identical except for the voice (R20):
`[dev]` (Sarvam Ashutosh) and `[dev-elevenlabs]` (ElevenLabs "Abhay – Smart BFSI Customer Care Agent",
`E0XZpcnyzAqDnxXoA920`, `eleven_v4_turbo`, Hindi and English). The ids are in `bolna/voice-sets.json`.
`pnpm bolna:voice elevenlabs|sarvam` switches by changing only the four `BOLNA_*_AGENT_ID` env vars: nothing is
sent to Bolna, so the dashboard-only webhook header (set once on all eight agents) is never lost. `pnpm
bolna:voice` alone shows the active set. To spend the founders' own ElevenLabs credits instead of the Bolna
wallet, connect the ElevenLabs key under Bolna **Settings → Integrations**; disconnecting it (or switching to
the Sarvam set) changes nothing in our code.

## 4. What the agents are (and why)

| Part | Setting | Why |
|---|---|---|
| Welcome, prompt | word for word from CALL_SCRIPT.md, plus a short shared footer (the call reference `{molbhav_call_id}`, the item keys `{item_keys}`, and how to fill `report_quote`) | C1, R1, hard rule 3 |
| LLM | OpenAI `gpt-5.4-mini`, `reasoning_effort: none`, `temperature: 1` (required for GPT-5), `max_tokens: 250` | Bolna's recommended voice model; lowest latency |
| Transcriber | Sarvam `saaras:v4`, `language: hi`, endpointing 500 ms, keyterms (trade words and the city's brands), a one-line context | CALL_SCRIPT "Transcriber"; pass the number test before changing |
| Voice (R20) | Sarvam Bulbul v4 Flash `ashutosh_hi_conversational` ("Ashutosh (Conversational)"), English after an auto-switch `dev_en_conversational`; `--voice elevenlabs` swaps in "Raju - Natural Conversationalist" (`pzxut4zZz4GImZNlqQ3H`, Indian male) on `eleven_v4_turbo` | a calm male voice; ElevenLabs is the comparison on the same 5 test calls |
| Languages | `multilingual_config`: Hindi first, English on request or auto-detect; the welcome is always the Hindi one | C7 |
| Tools | `report_quote` only (custom function, POST, header secret) | C8; never `transfer_call` |
| Retries | `auto_reschedule: false`, no `calling_guardrails`; every POST /call sends `retry_config: { enabled: false }` | R2: every retry is our own call through claimDial |
| Hangup | `call_terminate` per agent; silence 20 s; "hangup using a prompt" ends the call after the agent's closing line | C6, B5 |
| Telephony | `plivo`, `wav` (flag to change) | the trial's numbers; Indian routing needs Plivo |

`user_data` for each call is built in code (`lib/bolna/userData.ts`): `molbhav_call_id`, `contractor_name`, `site_area`, `deliver_by`, `order_spoken`, `item_keys`, `credit_wanted`, `their_total_spoken`, `competing_total_spoken`, `competing_terms_spoken`, `competing_lines_spoken`, `final_summary_spoken`, `contractor_phone_spoken` (the CALL_SCRIPT table, plus `item_keys` for `report_quote`). Values that aren't letters, digits and a little punctuation are refused, and a call whose data can't be built is cancelled before dialing.

## 5. Checking the agents in the dashboard

Open each agent and check:
- **Agent** tab: the welcome's first sentence says "AI" and "रिकॉर्ड"; the prompt is CALL_SCRIPT's; "Hangup using a prompt" is on.
- **Languages** tab: Hindi (default) and English; voice Ashutosh (or Raju for the ElevenLabs comparison); transcriber Sarvam saaras:v4.
- **Engine** tab: interruption after 3 words; user online detection after 8 s with "जी, आप लाइन पे हैं?"; hangup on user silence 20 s; total call timeout 150 s (Quote) or 90 s.
- **Call** tab: telephony provider; **Auto Reschedule off**; **outbound call timing restrictions off** (our own call hours apply in `claimDial`).
- **Tools** tab: exactly one custom function, `report_quote`, `POST https://<dev>.convex.site/bolna/report-quote`, header `x-molbhav-secret`. No Transfer Call, no calendar, no web search.
- **Extractions** tab: the webhook URL and the `x-molbhav-secret` header (section 1, step 4).
Then run `pnpm bolna:check` and expect `checks: ok` for all four.

## 6. Manual fallback (if the API refuses something)

If `bolna:sync` fails on one agent (Bolna changes its validation from time to time), build that agent by hand in the dashboard from `bolna/agents/<round>.json`:
1. New agent → name `Molbhav <Round> [dev]` → paste `agent_welcome_message` and the system prompt (`agent_prompts.task_1.system_prompt`), with `@@…@@` replaced by hand.
2. Set the Languages, Engine and Call tabs as in section 5 (the values are in the JSON's `tools_config` and `task_config`).
3. Tools → Custom function → **Write manually**, and paste the dashboard form of the tool: the `tools[0]` object from the JSON, with a `value` object holding `tools_params.report_quote` (`method`, `url`, `api_token: null`, `headers`, `param`), the URL and secret filled in.
4. Extractions → the webhook URL and header.
5. Copy the agent id from the URL and set `BOLNA_<ROUND>_AGENT_ID` on Convex. `pnpm bolna:check` then shows what Bolna saved.

## 7. Talking to an agent in the browser (no phone)

Bolna's **Web Call SDK** ([docs](https://www.bolna.ai/docs/developer-resources/sdks/web-call), [API](https://www.bolna.ai/docs/developer-resources/sdks/web-call-api)) talks to an agent from a browser tab with no phone number: the browser gets a 2-minute, single-use session that a backend mints with the key (`POST https://api.bolna.ai/web-call/session`). That is testing ladder step 2 in CALL_SCRIPT.md.

**`/app/admin/agents`** (admins only) has one card per agent with **बात शुरू कीजिए**. A call starts only when a founder taps it. The page asks our Convex site (`POST /bolna/web-call-session`, `convex/bolnaHttp.ts`), which checks the Convex Auth session against `ADMIN_USER_IDS` on the server, mints the session with `BOLNA_API_KEY` (never sent to the browser) and the Team test demo `user_data` (the haggle cites ₹2,00,610, the match ₹1,98,830). A founder plays the dealer from the role cards in `docs/TEAM_TEST.md`; the Match agent's `report_quote` "first" stage is answered from the demo cards, so cite true/false can be tried too. Web calls cost wallet money like any execution, and their webhooks are recorded and ignored (they carry no call of ours). The SDK loads at runtime from jsDelivr, pinned to 3.0.1 with an integrity hash. The page's origin must equal `SITE_URL` (or be listed in `WEB_CALL_ORIGINS`).

## 8. Up to the first test call (the order Claude Code follows once the key arrives)

1. Founders: steps 1–3 of section 1 (account, key, verified phones).
2. `npx convex env set` on dev: `BOLNA_API_KEY`, `BOLNA_WEBHOOK_SECRET` (generated), `REC_TOKEN_SECRET` (generated), `BOLNA_TRIAL=true`, `LIVE_CONCURRENCY=2`.
3. `npx convex dev --once` (pushes Phase 8B, regenerates `convex/_generated`).
4. `START_HERE.md` C5: `admin:verifyContractor` (the founder's session), `admin:addDealer` for each teammate's phone with consent `test_ok` and the TEAM_TEST names, then `TEST_PHONE_HASHES` from the hashes it returns; `admin:setPriceBand` for Jaipur steel and cement covering the card prices (bands older than 14 days stop all citing).
5. `pnpm bolna:check --from-convex` (key, wallet, concurrency 2).
6. `pnpm bolna:sync --from-convex --target dev --copy-webhook-secret`, then `npx convex env set` the four `BOLNA_*_AGENT_ID`s it prints.
7. Founders: the webhook header on each agent (section 1, step 4). Then `pnpm bolna:check --from-convex` shows four `checks: ok`.
8. Optional: a founder tries each agent at `/app/admin/agents` (no phone).
9. **Stop and ask.** A founder says "go" → `npx convex env set LIVE_CALLS_ENABLED true` on dev only. The founder then starts the first live sweep from the app (the LIVE toggle on Choose dealers, which calls `sweep.start` with `mode: "live"`; the toggle itself is a `features/app` change that Phase 8B's backend is ready for) with the teammates ready, while Claude Code watches `npx convex logs`. Roll back at any time with `npx convex env set LIVE_CALLS_ENABLED false`; calls already placed finish, and the watchdog closes anything stuck.

## 9. What was confirmed in Bolna's docs (17 Nov 2026)

| Fact | Source |
|---|---|
| Base `https://api.bolna.ai`, Bearer key; `POST /v2/agent` returns 201 `{ agent_id, state }`; `pipelines` is an array of arrays; webhooks come from 3 source IPs; terminal statuses | https://www.bolna.ai/docs/AGENTS.md |
| `POST /call`: `agent_id`, `recipient_phone_number`, optional `from_phone_number` (account default), `user_data`, `agent_data`, `retry_config` (off by default), `bypass_call_guardrails`; 429 for a number still activating | https://www.bolna.ai/docs/api-reference/calls/make |
| `POST /call/{id}/stop` stops only queued or scheduled calls | https://www.bolna.ai/docs/api-reference/calls/stop_call |
| Execution payload: `termination_reason` is authoritative, `completed` can be a call that never connected, `total_cost` in cents, `context_details.recipient_data`, recording URL, list rows trimmed | https://www.bolna.ai/docs/post-call/execution-payload, https://www.bolna.ai/docs/post-call/termination-reasons |
| Status lifecycle; `completed` 2–3 minutes after disconnect | https://www.bolna.ai/docs/post-call/list-phone-call-status, https://www.bolna.ai/docs/api-reference/executions/get_execution |
| `GET /v2/agent/{id}/executions` needs `from`/`to` (≤ 7 days), pages of ≤ 50 | https://www.bolna.ai/docs/api-reference/executions/get_executions |
| `GET /user/me`: wallet, `concurrency.max/current` | https://www.bolna.ai/docs/api-reference/user/info |
| Webhook: same payload as get-execution, one POST per status, custom headers via the dashboard's "Add headers" only | https://www.bolna.ai/docs/post-call/polling-call-status-webhooks, https://www.bolna.ai/docs/agent-setup/analytics-tab, `setup-webhook` skill |
| No payload signature; source IPs are the trust mechanism | https://www.bolna.ai/docs/concepts/security |
| Agent create / full update (PUT) / patch (limited fields) shapes; `auto_reschedule`, `calling_guardrails`, `call_terminate`, `welcome_message_delay`, `number_of_words_for_interruption`, `check_if_user_online` | https://www.bolna.ai/docs/api-reference/agent/v2/create, …/update, …/patch_update |
| Custom functions: `key: "custom_task"`, `pre_call_message`, `%(name)s` params, headers, auto-filled prompt variables; in the API under `tools_config.api_tools.tools` and `tools_params` | https://www.bolna.ai/docs/tool-calling/custom-function-calls, …/custom-function-schema, …/custom-function-variables, `setup-tools` skill |
| `{variable}` (canonical) and `{{variable}}` both work in prompts and welcomes | https://www.bolna.ai/docs/prompting/using-context |
| Sarvam voice: Bulbul v4 Flash persona ids `<persona>_<lang>_<style>`, `voice` + `voice_id` + `model` + required `language`; the catalogue API | https://www.bolna.ai/docs/sarvam-voice, https://www.bolna.ai/docs/api-reference/voice/get_all, …/get_providers |
| Sarvam transcriber `saaras:v4`, `language: "hi"`, `keywords` ≤ 50, `context` | https://www.bolna.ai/docs/sarvam-transcriber, https://www.bolna.ai/docs/customizations/hindi-voice-agent |
| ElevenLabs: `eleven_v4_turbo` (74 languages incl. Hindi), example male Indian voice Raju; own key via Settings → Integrations | https://www.bolna.ai/docs/elevenlabs-voice, https://www.bolna.ai/docs/providers |
| Multilingual config (hi + en, auto-switch) and per-language system messages | https://www.bolna.ai/docs/customizations/multilingual-config-reference, https://www.bolna.ai/docs/customizations/auto-switch-multilingual-messages |
| Trial: 2 concurrent calls, verified numbers only | https://www.bolna.ai/docs/pricing/outbound-calling-concurrency |
| Web Call SDK and the session mint | https://www.bolna.ai/docs/developer-resources/sdks/web-call, …/web-call-api, …/web-call-templates |
| India data residency is Enterprise; Indian-server routing requirements | https://www.bolna.ai/docs/enterprise/data-residency, https://www.bolna.ai/docs/enterprise/indian-server-configuration |

## 10. Known gaps to watch on the first calls

- **The webhook header is a dashboard step** (section 1, step 4) and may need redoing after a sync. Without it, the board moves only at watchdog polls.
- **The custom-function shape in the agent API is only partly documented** (the API schema shows the Transfer Call tool; the custom-function fields come from the tool docs and the `setup-tools` skill). `bolna:sync` reads the agent back and warns if `report_quote` didn't stick; then use the manual fallback for the tool. The same goes for `check_user_online_message`, which the docs show for the dashboard but not in the API schema.
- **Bolna can't hang up a call in progress through the API**: "सब कॉल रोकिए" and an opt-out stop only calls Bolna still has queued; calls in progress end at their `call_terminate`.
- **The LLM fills `report_quote`'s fields**: it is a provisional hint; extraction from the transcript decides the quote, and the Match agent's cite is decided in code from the figures it sends (anything unclear is `cite: false`).
- **Number test**: run the 20-line number test (CALL_SCRIPT) on Sarvam first, then on the ElevenLabs voice, before trusting either with real dealers.
