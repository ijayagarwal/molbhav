# START HERE: the Molbhav guide, step by step

You're building **Molbhav**:
1. A contractor speaks one order.
2. AI agents phone nearby dealers for landed prices.
3. They bargain using only real quotes.
4. His regular dealer gets a chance to match.
5. He gets back the cheapest comparable option, with recordings as proof.

**Three tracks run at the same time.** Don't wait for one to finish before starting the next.

| Track | Owner | Why it can't wait |
|---|---|---|
| **1. Build (Claude Code)** | Builder | The product, simulator first, so nothing waits on tracks 2 and 3 |
| **2. Business registration and compliance** | Founder or ops | AI calls to real dealers need a registered business (a sole proprietorship is enough), a provider account and a TRAI declaration. |
| **3. Field (by hand)** | Field lead | Real numbers, real recordings and real customers. Without them the pitch is a guess. |

Also pick one person, ideally a native Hindi speaker, to review designs and copy.

**Day one, by owner**
- **Builder:** Part A, then Phase 0 and Phase 1A.
- **Founder:**
  - B1: email the organisers;
  - B2: register a sole proprietorship on Udyam;
  - A4: set up Google billing and Bolna.
- **Field lead:** D2, the first contractor interviews, then start D1, the spread test.

## The plan: two milestones, one codebase

### Milestone 1: the hackathon (live calls proven on teammates' phones)
1. **Setup:** Part A, plus Udyam and the organisers' email from Part B.
2. **Build:** Phases 1A → 6B in the order in `PROMPTS.md` (the negotiation brain, Phase 3, right after 1A; DECISIONS R11). That covers the whole product in sim: voice order, sweep, haggle, match, result, place, share.
3. **Live calls:** Phase 8A, then 8B (it includes the C5 trial-mode setup), then 8C.
4. **Team test:** `docs/TEAM_TEST.md` Runs 1–6. Teammates role-play dealers on their Bolna-verified phones, and every check must pass. Save the run log and the clips.
5. **Showcase:** Phase 1C (landing, waitlist, dealer opt-in), Phase 7 (`/present`, the landing hero; `/try` if there's time), then Phase 9 (demo deployment, drills, rehearsal).
6. **Field track in parallel:** Part D's spread test and interviews. These give the real numbers and real dealer recordings for the pitch.

**On stage you can truthfully say:** "The calls are real AI calls, verified on our teammates' phones. Real dealers start once our business number is declared."

### Milestone 2: real dealers (same code, more settings)
Follow Part M2 below; its step M2.6 is Phase 10 in `PROMPTS.md`. The code was built for real dealers from day one:
- every guard;
- consent and opt-out;
- call limits;
- recordings and retention.

Going live means registering, connecting your own number, getting consent, and changing settings. Nothing is rebuilt.

**Hackathon minimum, if time runs short:** see `PROMPTS.md`. It keeps the teammate-verified live calls.

**Ground rules**
- `docs/DECISIONS.md` wins over every other doc.
- Every price in the docs is fictional until your spread test replaces it.
- Never claim live AI calls before they exist.

---

## Part A: From the zip to the first prompt, on your MacBook (builder, about 1–2 hours)

Everything here is for an **Apple Silicon Mac on macOS 15 (Sequoia) or newer**. Homebrew doesn't support older macOS, and on Intel Macs it is best-effort only. Commands go in **Terminal** (⌘ Space → type "Terminal"), or later in VS Code's terminal (menu **Terminal → New Terminal**). Paste one block at a time.

### A1. Install the tools (once per Mac)
1. **Homebrew** (the Mac package manager):
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
   It asks for your Mac password and installs Apple's command-line tools (which include `git`). At the end it prints **"Next steps"** with two or three lines starting `echo` and `eval`. Run those lines, then check with `brew --version`.
2. **Node 24, Python, GitHub CLI, the tunnel tool and VS Code:**
   ```bash
   brew install node@24 python gh cloudflared
   brew install --cask visual-studio-code   # skip if you already have VS Code
   ```
3. **Put Node 24 on your PATH and turn on pnpm** (node@24 doesn't link itself):
   ```bash
   echo "export PATH=\"$(brew --prefix node@24)/bin:\$PATH\"" >> ~/.zshrc
   source ~/.zshrc
   corepack enable pnpm
   node -v && pnpm -v
   ```
   You should see `v24.x` and a pnpm version. If pnpm asks to download itself, answer `Y`. If `pnpm` disappears after a `brew upgrade`, run `corepack enable pnpm` again.
4. **Git identity and GitHub sign-in:**
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"   # the email on your GitHub account
   gh auth login                                       # GitHub.com → HTTPS → log in with a web browser
   ```

### A2. Unzip the pack and create the project
1. **Put the pack in `~/Projects/molbhav`:**
   ```bash
   mkdir -p ~/Projects
   unzip ~/Downloads/molbhav-build-pack.zip -d ~/Projects/molbhav
   cd ~/Projects/molbhav && ls -a
   ```
   You should see `START_HERE.md`, `CLAUDE.md`, `PROMPTS.md`, `README.md`, `.env.example`, `.mcp.json`, `docs` and `design`.

   If Safari already unzipped the download into a folder `~/Downloads/molbhav-build-pack`, run `mv ~/Downloads/molbhav-build-pack ~/Projects/molbhav` instead. Finder hides files starting with a dot; press ⌘⇧. to show them.
2. **Python environment for the font script:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install fonttools brotli
   printf ".venv/\nnode_modules/\n.next/\n.env*.local\n.DS_Store\n" > .gitignore
   ```
3. **A private GitHub repo under your personal account.** It must not be under an organisation: Vercel's free plan can't deploy an organisation's private repo.
   ```bash
   git init -b main
   git add . && git commit -m "Docs pack"
   gh repo create molbhav --private --source=. --push
   ```
4. **Open it in VS Code:** run `code .` (or open VS Code, then **File → Open Folder… → ~/Projects/molbhav**). Click **Trust** when asked.

### A3. Set up Claude Code in VS Code
1. **Install the extension:** press ⌘⇧X, search **Claude Code** (publisher: Anthropic), then **Install**.
2. **Open the Claude panel** (the Claude icon in the sidebar or the top-right of the editor; if you don't see it, open any file, or click **✻ Claude Code** in the status bar) and **sign in** with your paid Claude account. The free plan doesn't include Claude Code.
3. **Start every new conversation in Plan mode:**
   1. Open Settings (⌘,), stay on the **User** tab, and search **Claude Code initial permission mode**.
   2. Choose **plan**.

   The mode indicator at the bottom of the prompt box shows the current mode, and you can switch it there anytime. The other modes:
   - **Manual** asks before edits and commands;
   - **Edit automatically** and **Auto** run without asking.
4. **Add the vendors' helpers.** Skim each vendor's `SKILL.md` on GitHub first: they're third-party instructions. Then run in VS Code's terminal, inside `~/Projects/molbhav`:
   ```bash
   npx skills add bolna-ai/skills -a claude-code --skill setup-webhook
   npx skills add bolna-ai/skills -a claude-code --skill setup-tools
   npx skills add bolna-ai/skills -a claude-code --skill get-executions
   npx skills add sarvamai/skills -a claude-code --skill speech-to-text
   npx skills add sarvamai/skills -a claude-code --skill text-to-speech
   ```
   Install only these. Bolna's other skills can place calls or buy numbers, which must only ever happen through the app's guarded dial path. If a command fails, skip it: Claude Code can read Bolna's and Sarvam's docs on the web instead.
5. **Connect the Sarvam docs server.** It's already set up in `.mcp.json`. In the Claude panel, type `/mcp`, enable **sarvam-docs** if asked, and check that it shows as connected.
6. **Let your browser use the mic** for local testing: System Settings → Privacy & Security → Microphone → turn on Chrome (and Safari). On your Mac, `http://localhost:3000` is allowed to use the mic.

### A4. Accounts (sign up now; the keys go in later phases)
| Service | What to do now | Cost |
|---|---|---|
| **Claude** (for Claude Code) | A paid plan: **Pro at minimum, Max for the builder** if they build most days. Big phases and the panel reviews use a lot, and limits reset every few hours. | Paid |
| Convex | Sign up with GitHub | Free tier |
| Vercel | Sign up with the **same personal GitHub account**. Claude Code links the repo in Phase 1A. | Hobby is free but non-commercial; Pro ($20 per member per month) if teammates push code or before you charge anyone |
| Google AI Studio | 1. Create a **free** API key, for local development with your own test speech.<br>2. Create a Google Cloud project with **billing on**, and a key there, for real data.<br>3. Create a second billed project for the sandbox.<br>On each billed project, set a **budget alert** and a daily request quota: budgets warn you, they don't stop spending. | Free for dev; billed parsing costs paise. Needs a card that works with RBI auto-debit rules. |
| Sarvam AI | Sign up and create an API key | ₹100 free credit; STT ₹0.49/min |
| Bolna | Sign up. **Don't buy a number.** Add and **verify your teammates' phone numbers** in the dashboard: the trial only calls verified numbers, 2 at a time. | $5 trial credit (about 5 test orders); budget about $10 more for the Team test |
| WhatsApp | A team SIM with **WhatsApp Business**. Its number is your click-to-chat number (`NEXT_PUBLIC_WHATSAPP_NUMBER`). | SIM cost |

### A5. Your first prompt (Phase 0)
1. In the Claude panel, press **⌘⇧Esc** to open a new conversation tab, and check that the mode shows **Plan**.
2. Open `PROMPTS.md`, copy the **Phase 0** prompt (the grey block) and paste it into the Claude panel.
3. Claude Code reads every doc and replies with a summary, a list of unclear or risky points, and the keys you still need. It writes no code.
4. For Phase 0, click **No, keep planning** when it shows its plan, because Phase 0 writes no code. Fix any doc issues it finds, or ask it to fix them in the docs. Then run Phase 1A the same way (Part C).

### A6. Every work session
Claude Code does the running (DECISIONS R12):
1. Open VS Code on the project folder and the Claude panel. Type `/phase <id>` for the next phase in `PROMPTS.md`.
2. Claude Code pushes Convex changes with `npx convex dev --once`, and starts `pnpm dev` (http://localhost:3000) and, for phone tests, the `cloudflared` tunnel in the background when it needs them. It prints the `https://….trycloudflare.com` address for your phone; the address changes every run.
3. **Optional, for instant hot reload while you click around:** run `npx convex dev` and `pnpm dev` in your own VS Code terminals. If you do, tell Claude Code, so it doesn't start a second copy.
4. Nothing to activate: Claude Code runs the font script as `.venv/bin/python scripts/fonts.py` (Phase 1B).
5. Close the session with `/handover`; Claude Code commits and pushes.

---

## Part B: Business registration and compliance (start on day one)

**You don't need a company to build, demo or win the hackathon.** The simulator, trial-mode AI calls to your own verified phones, and the human spread test need no registration at all.

**To make AI calls to real dealers, you need a registered business, but a sole proprietorship is enough.** Only a number bought *from Bolna* needs a CIN (a company). Bolna can instead use **your own Plivo or Exotel account**, and both accept a proprietorship.

1. **Ask the hackathon organisers** what they provide. If it's a telephony number or credits, ask in writing:
   - Is the number registered to a business?
   - Is it declared for automated (A2P) calls?
   - May we use it for calls to dealers who opted in?
2. **Register a sole proprietorship (founder, this week).** It's in one person's name, usually the founder's: their PAN, Aadhaar and personal liability.
   - **Udyam registration:** free and online at udyamregistration.gov.in, with the proprietor's Aadhaar (OTP) and PAN. GST is needed only if your turnover requires it.
   - **GST registration (optional now):** needed for Exotel unless you have a Shop & Establishment licence, and useful anyway for invoices.
   - Write a short founders' agreement among teammates, since the proprietorship legally belongs to one person.
3. **Open a telephony account in the business's name:**
   - **Plivo (India region account):** accepts a GST certificate, a CIN *or* a Udyam certificate (a business PAN alone isn't enough). Rent an 080 or 022 landline number; these are for service and transactional calls only, never promotional. Calls must stay inside India.
   - **Exotel:** accepts a proprietorship with a GST certificate *or* a Shop & Establishment licence, plus PAN and the proprietor's ID.
   - Then in Bolna: **Settings → Integrations → Telephony → Connect** (Plivo or Exotel). Calls then go out from your own numbers.
4. **Get it in writing** from Plivo or Exotel, and from Bolna:
   - that AI quote-request calls to dealers who opted in may use that number (service vs promotional);
   - how they file the TRAI A2P declaration for the number;
   - that Bolna's bring-your-own route doesn't also need Bolna's CIN application.

   Keep the replies.
5. **TRAI A2P declaration.** Since the 18 September 2026 amendment, AI and automated voice calls must be declared, with their calling numbers, to the provider in advance. Undeclared calls count as spam, and there's a termination charge of up to 5 paise a minute. Commercial calls also need the dealer's explicit consent, which our opt-in already collects.
6. **Never** use these to make AI calls:
   - personal SIMs or GSM gateways;
   - phone-automation apps;
   - foreign or VoIP numbers.

   TRAI can disconnect **every** telecom connection of the sender and blacklist it for up to two years. Dialling Indian phones over the internet (domestic VoIP to the phone network) is restricted in India anyway.
7. **Pvt Ltd later, not now.** Convert when you raise money. Startup India (DPIIT) recognition is only for a Pvt Ltd, LLP or registered partnership. Ask a CA about the timing, and about the GST treatment of freight.
8. **Privacy (DPDP).** The privacy page and consent text are built in Phase 1C. **Have a lawyer read them before you share the landing link publicly.**
9. **Until steps 2–5 are done:**
   - AI calls go only to teammates' verified phones, in trial mode (`BOLNA_TRIAL=true`, decision B9).
   - Real dealers get human calls (Part D).

---

## Part C: The build loop (builder)

### C1. Every phase, the same steps
1. **New conversation:** ⌘⇧Esc in VS Code opens a fresh conversation tab. CLAUDE.md loads by itself.
2. **Type `/phase <id>`.** Claude Code posts a short plan, then builds. It checks itself that the plan names the right DECISIONS codes, invents no colours, fonts or copy, keeps anything that costs money or dials `internal`, and lists tests.
3. **While it builds:** give it what it asks for (an account, a key, a device-code approval in the browser, a phone test). Everything else it runs itself (A6).
4. **Panel review:** `/review` (the full panel after 1A, 3, 2B, 5, 6B and 8B; `/review light` otherwise).
5. **Check "Done when":** Claude Code verifies what it can and lists what needs you (a real phone over HTTPS, a laptop at full width, your eyes on the design).
6. **Commit, push and tag:** Claude Code does it (`git tag phase-1A && git push --tags`).
7. **At the end of the day,** run `/handover`.

### C2. Make yourself an admin (needed from Phase 3)
Sign-in is anonymous, so your admin identity is the browser session you use:
1. Open `/app` on the laptop you'll present from (the anonymous session is enough; onboarding arrives in Phase 4), and tell Claude Code.
2. Claude Code finds your user's `_id` (`npx convex data users`) and sets `ADMIN_USER_IDS` (with `--prod` for production; the demo project needs its own).
3. **Don't clear that browser's cookies.** If you do, you become a new user: repeat these steps. A separate browser profile just for admin work helps.

### C3. What you provide, per phase
Claude Code sets every env var itself (`.env.local`, Convex dev and prod, Vercel) and generates the random secrets (`openssl rand -hex 32`). You only provide what it can't make.

| Phase | What you provide | What Claude Code sets up |
|---|---|---|
| 1A | Approve the Convex and Vercel sign-ins (device codes in the browser) | The Convex project and auth, CI, the Vercel project, the production deploy key and the first deploy (C4) |
| 3 | Nothing | The golden tests; `seed:reset` on dev |
| 1B | Check the font sizes it reports | The fonts (≤ 250 KB on first render of `/app`) |
| 2A | **The design gate.** Take a ₹12k-class Android outside at noon, auto brightness on, and play the money shot; then watch it on a 1440 px laptop. If anything looks generic, cramped or hard to read, say so precisely. Claude carries on with non-UI work meanwhile. | — |
| 2B | Compare `/styleguide` with `design/reference` at 360, 1280 and 1536 px. Have the Hindi reviewer read every string. | — |
| C2 (from 3) | Open `/app` on the presenter laptop once | `ADMIN_USER_IDS` |
| 4 | A Sarvam API key; an OpenAI API key (a project with billing and a monthly budget limit; R19); the demo line recorded in Voice Memos as `~/Downloads/demo.m4a`; your phone for the HTTPS test; say the demo line 10 times in a noisy place | `.env.local` and Vercel: `SARVAM_API_KEY`, `SARVAM_STT_MODEL`, `SARVAM_TTS_MODEL`, `SARVAM_TTS_SPEAKER`, `SARVAM_TTS_SPEAKER_EN`, `OPENAI_API_KEY`, `OPENAI_MODEL` (optional), `HASH_SECRET`; Convex: `VOICE_DAILY_INR_CAP`; `e2e/demo.wav` (`afconvert -f WAVE -d LEI16@16000 -c 1 ~/Downloads/demo.m4a e2e/demo.wav`) |
| 5–6B | Run the whole flow on your phone and a laptop. Try to break it: leave mid-sweep, go offline, say "confirm मत करो". | Convex dev: `OPENAI_API_KEY`, `OPENAI_MODEL` (optional), `SIM_PACE=demo`, `SIM_EXTRACT=groundtruth`, `HASH_SECRET`; for 6A also `SARVAM_API_KEY`, `SARVAM_TTS_MODEL`, `SARVAM_TTS_SPEAKER` |
| 8A | Nothing external; read the guard tests if you like | — |
| 8B–8C | A Bolna account (trial; **don't buy a number**), its API key, and each teammate's phone verified in Bolna; say "go" before the first live sweep, then start it from the app yourself with the teammates ready | C5 |
| Team test | Run `docs/TEAM_TEST.md` Runs 1–6 with your teammates. Save the run log and the clips. | `LIVE_CONCURRENCY=2`, `TEST_DAILY_CALLS=15` and `MAX_LIVE_SWEEPS_PER_HOUR=6` on test days, reset afterwards |
| 1C | The team WhatsApp Business number; share the landing link only after the lawyer has read `/privacy` (Part B8) | `CONVEX_SERVER_SECRET`, `HASH_SECRET`, `NEXT_PUBLIC_WHATSAPP_NUMBER` in `.env.local`, Convex dev and prod, and Vercel |
| 7 | Nothing new for the sandbox: it uses the same `OPENAI_API_KEY`, bounded by its own daily ₹ cap (R19). Rehearse `docs/DEMO.md` in `/present`; try `/try` on someone else's phone. | Convex dev: `DEMO_DEPLOYMENT=true`, `SANDBOX_DAILY_INR_CAP` |
| 9 | Run the failure drills with Claude Code; record the backup video | The demo deployment, per `docs/DEPLOYMENTS.md` |

### C4. Deploying (set up in Phase 1A, then automatic)
Claude Code does this with the Vercel and Convex CLIs after you approve the two sign-ins:
1. It creates the Vercel project on your **personal** account, links the repo and sets the **Build Command** to `npx convex deploy --cmd 'pnpm build'`.
2. It creates the Convex production deployment and a **Production deploy key**, and sets it as `CONVEX_DEPLOY_KEY` for **Production** only. If the CLI can't create the key, it tells you the one dashboard button to press.
3. **Previews:** if your Convex plan has preview deploy keys, it adds one for **Preview**, plus default env vars for preview deployments (including `JWT_PRIVATE_KEY` and `JWKS`), and from Phase 3 on appends `--preview-run seed:reset`. Otherwise it turns Vercel previews off, and phone tests use the tunnel.
4. It runs `npx @convex-dev/auth --prod` and sets `SITE_URL` to your Vercel URL.
5. It never changes the production live-call settings (`LIVE_CALLS_ENABLED`, `BOLNA_TRIAL`, `A2P_DECLARED`, `LIVE_STAGE`) without your explicit go-ahead.

### C5. Trial-mode setup for Phase 8B (no company needed)
1. **You:** in Bolna, verify each teammate's phone (A4), and give Claude Code the Bolna API key.
2. **Claude Code**, with the internal admin functions from the Convex CLI (`npx convex run admin:…`, R18; `/app/admin` only shows the result):
   - verifies you as a contractor;
   - adds each teammate's phone as a dealer with consent `test_ok`, named as in `docs/TEAM_TEST.md` Setup;
   - copies each phone's hash (`addDealer` returns it);
   - sets the Jaipur price bands (`admin:setPriceBand`) to the Team test card ranges.
3. **Claude Code** sets the Convex dev env: `BOLNA_API_KEY`, `BOLNA_WEBHOOK_SECRET` (generated), `BOLNA_TRIAL=true`, `TEST_PHONE_HASHES`, `OPENAI_API_KEY`, `REC_TOKEN_SECRET` (generated).
4. **Claude Code** runs `pnpm bolna:sync` (written in 8B): it creates the four agents from `bolna/agents/` with the webhook `https://<your-dev>.convex.site/bolna/webhook`, the `x-molbhav-secret` header and `report_quote` pointing at `https://<your-dev>.convex.site/bolna/report-quote`. It then sets the four agent ids, and sets `LIVE_CALLS_ENABLED=true` (dev only) once you say go.
5. Trial mode skips the call-hours guard for listed test phones only, so you can test at any time. Real dealers are only ever called 10:00–19:00 IST.

---

## Part D: The field track (field lead, start this week)

### D1. Spread test: the single most important number
**Goal:** the same order to 15–20 Jaipur dealers. How much does the landed price differ, and does one callback lower it?

**Setup**
1. **Use a real order.** Ask a contractor you interview (D2) whether you may price his next real order for him. Then you're an honest buyer's agent, not a fake caller.
2. **The order:** something close to 2 t 12 mm Fe500D, plus 150 bags PPC, delivered to one pin code. Pick local ISI or branded and keep it the same for every dealer.
3. **Find dealers** on Google Maps, JustDial and IndiaMART: steel and cement traders near the site. Keep their numbers private.

**What to say** (in your natural speech):
> "नमस्ते जी, मैं {आपका नाम}, {ठेकेदार} जी की {इलाका} वाली साइट के लिए रेट पूछ रहा हूँ / रही हूँ। ये कॉल रिकॉर्ड कर सकते हैं? … कल तक 2 टन 12 mm Fe500D सरिया और 150 बोरी PPC चाहिए। पक्के बिल पे, GST मिलाके, साइट पे उतार के, सब मिलाके कितना पड़ेगा? डिलीवरी कब तक? उधार पे रेट अलग है?"

**Rules**
- Record **only if the dealer says yes**; otherwise take notes.
- Ask for the **all-in** price, and write down exactly what it includes.
- **The callback:** call the 2 cheapest back the same day and quote only the true best total you got: "एक जगह से सब मिलाके ₹… मिल रहा है, आप कुछ कर सकते हैं?" Never invent a number, and never say who quoted it.
- **End every call with:** "आगे से हमारा AI assistant आपको रेट पूछने कॉल करे, दिन में ज़्यादा से ज़्यादा 2 ऑर्डर के लिए, चलेगा?" If yes, send them the `/dealer` link once it's live, and note it.

**Track in a shared sheet:**
- dealer, area, time called, picked up (y/n), language;
- the first quote: rate and unit per item, GST included or extra, delivery ₹, unloading ₹, credit days, pakka or kachcha bill, brand, kanta or standard weight, delivery time;
- the landed total (computed);
- recording consent (y/n);
- after the callback: the new total, and whether he said "final";
- opted in to AI calls (y/n);
- the words he used for tiers and sizes.

**What you'll get:**
- the **spread %**: (max − min) ÷ min, over comparable quotes;
- the **callback drop %**;
- how many dealers stay on the line;
- real, consented recordings for the landing page and the demo.

### D2. Five contractor interviews (15 minutes each, at sites or material markets)
Ask:
- How many dealers do you call per order, and how often do you order?
- Would you let an agent call your regular dealer, or only give him a chance to match?
- What would you pay? Test "10% of the saving, max ₹499".
- Which words do you use: "branded / local / ISI", "suta" or mm?

Write down their exact words. If an answer contradicts `docs/DECISIONS.md` §E, update the docs.

### D3. First 10 customers (concierge, before the AI is live)
- A contractor sends a WhatsApp voice note with his order to the team number.
- Your team calls the dealers by hand and replies **within 60 minutes** with a parchi: the winner, the landed total, the terms, and the saving vs his dealer's first rate.
- The first 3 orders are free.
- **Done when** you have 10 real orders, 5 repeat orders and 10 dealers opted in.

The north-star metric is **a second order within 30 days**.

### D4. Feed it back
Give Claude Code the real spread figure (with its sample size) and one consented recording. It adds the proof band to the landing page (Phase 7) and updates `docs/DEMO.md`. Use the same numbers in the hackathon submission.

---

## Part E: Go / no-go for AI calls to real dealers

**Stage 1: measure.** Once Part M2 steps M2.1–M2.6 are done:
- turn on live calls for **at most 5 opted-in dealers** who agreed to test calls;
- admins start every call.

**Stage 2: open up.** Once the bars below hold over **at least 10 haggle calls**, turn on live calls for all opted-in dealers.

| Measure | Bar |
|---|---|
| Dealers who stay on past the AI disclosure | ≥ 70% |
| Dials that give a valid, comparable quote | ≥ 50% |
| Haggle calls that lower the price | ≥ 40%, with a median drop ≥ 0.5% |

**If a bar fails, change one lever and re-test:**
- **Stay-on is low:** shorten the welcome, reach the real order sooner, and check the voice and the language switch.
- **Valid quotes are low:** fix the question order and the read-back in `docs/CALL_SCRIPT.md` (use the "after the first real calls" prompt).
- **Haggles don't move:** check that the cited total is real and close enough to matter, or haggle only when the spread is above a threshold.
- **Stay-on stays under about 50%:** keep a hybrid for that city, where AI collects the quotes and a human haggles.

**To switch on:** Part M2, step M2.8.

---

## Part F: Showcase and demo
- **The landing page goes live in Phase 1C** and starts collecting sign-ups. The pilot line stays honest ("हमारी टीम आपके लिए dealers को कॉल करती है") until Part E passes. Its proof band appears only with real figures.
- **The sandbox (`/try`, Phase 7)** lets anyone hear their own Hinglish understood. It's simulator-only and watermarked.
- **Shared parchis (`/p/...`, Phase 6B)** are the viral loop. They never show the site, date, phone numbers or losing prices.
- **The judge demo** follows `docs/DEMO.md`:
  - sim, with a DEMO badge, for the reliable main path;
  - the **teammate-verified live calls** (a recording of Team test Run 2, plus the run log);
  - real human spread-test recordings;
  - optionally, one live trial call on stage.

  Say plainly that real dealers start in Milestone 2.
- **The demo video** (60–90 s): a screen recording of `/present` at 1440 × 900, plus a phone recording.

---

## Part M2: Going live with real dealers (Milestone 2)

Do these in order. Steps 1–5 can start during the hackathon.

1. **M2.1 Register the business:** a sole proprietorship on Udyam (Part B2). Add GST if you'll use Exotel.
2. **M2.2 Get your own number:** a Plivo India account (080/022 number) or Exotel, in the business's name (Part B3). Connect it in Bolna: Settings → Integrations → Telephony.
3. **M2.3 Get it in writing (Part B4):**
   - that AI quote-request calls to opted-in dealers are allowed on that number;
   - how the TRAI A2P declaration is filed.

   Once you have this, set `A2P_DECLARED=true` (prod).
4. **M2.4 Privacy review:** a lawyer reads `/privacy` and the consent text.
5. **M2.5 Upgrade Bolna** from trial, so it can call numbers that aren't verified (paid plans start at 10 calls at a time). Check the pricing first.
6. **M2.6 Build Phase 10** in `PROMPTS.md`: provider number, live stages, consent evidence, the inbound line, metrics, Google sign-in and `golive:check`.
7. **M2.7 Recruit dealers:**
   1. Ask the spread-test dealers who said yes (Part D1) to fill in `/dealer`.
   2. Call each one back to confirm.
   3. Claude Code adds them as `opted_in` with the consent reference (`admin:addDealer`); `/app/admin` lists them.
8. **M2.8 Stage 1:** set these with `--prod`: `BOLNA_TRIAL=false`, `BOLNA_FROM_NUMBER`, `A2P_DECLARED=true`, `LIVE_STAGE=1`, `LIVE_CALLS_ENABLED=true`. Run `pnpm golive:check`. Use at most 5 opted-in dealers; admins start every live sweep. Measure against the Part E bars.
9. **M2.9 Stage 2:** once the bars hold over at least 10 haggle calls, set `LIVE_STAGE=2`. Verified contractors can then run live sweeps to every opted-in dealer.
10. **M2.10 Customers:**
    - move the concierge customers (Part D3) onto the app, verified in person;
    - change the landing pilot line only when Stage 2 is live;
    - add the proof band with your real numbers.
11. **M2.11 A Pvt Ltd** when you raise money (Part B7).

---

## Part G: Design source of truth
- **The mockups** are the editable canvas "Molbhav UI design" in your Claude artifacts (https://claude.ai/artifact/XqNK4e8SsW1JNDMC92EdCW). It's private to you until you share it from its Share menu.
- **Copies** are in `design/reference/`.
- **To change the design:** update `docs/DESIGN.md` (and the canvas) first, then ask Claude Code to follow it. Never let the code drift on its own.

---

## Part H: Money
| Item | Cost |
|---|---|
| Claude plan for Claude Code | Pro or Max subscription |
| Building and sim testing | About ₹0 beyond that (free tiers; billed parsing costs paise) |
| One live AI order (4 quote calls, 2 haggles, 1 match, 1 confirm) | About ₹65–80 |
| Bolna | $5 trial covers about 5 test orders; Milestone 1 needs about 10, so top up before the Team test (check first that a top-up keeps trial mode) |
| Indian calling number | Monthly rental from Plivo, Exotel or Bolna plus per-minute charges (check their pricing pages) |
| TRAI A2P termination charge | Up to 5 paise a minute |
| Sarvam | ₹100 free credit, then pay as you go |
| Sole proprietorship | Udyam is free; GST registration has no government fee; a CA's help is optional |
| Pvt Ltd (later, for fundraising) | CA fees and government fees (get a quote) |
| Domain | Optional, about ₹1,000 a year |
| Vercel | Free on Hobby while non-commercial and single-committer; Pro otherwise |

Pricing hypothesis to test with the first customers: **10% of the measured saving, capped at ₹499, and ₹0 if nothing was saved.**

---

## Your first week, as a checklist
- [x] Part A done; Phase 0 run; doc issues fixed (DECISIONS §R)
- [ ] Organisers asked about a number; Udyam registered; Plivo or Exotel account opened (B1–B3)
- [ ] Phases 1A and 3 built (the scaffold, deploy pipeline and negotiation brain), then 1B
- [ ] 5 contractor interviews (D2)
- [ ] Spread test: 15–20 dealers called, with callbacks (D1)
- [ ] Phase 2A money shot reviewed at noon on a cheap Android
- [ ] First concierge orders over WhatsApp (D3)
