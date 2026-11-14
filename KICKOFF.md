# KICKOFF: instructions for Claude Code (the human only says "Read KICKOFF.md and do it")

You are Claude Code, running in VS Code on the team's **MacBook** (macOS, zsh, Apple Silicon), inside the project folder. Your job is to set up this Mac and this project, then do Phase 0. **Do as much as you can yourself.** Hand a step to the human only when it truly needs them: their password, a browser sign-in, an account sign-up, or approving something in the Claude panel.

## Rules for this session
- Work through the steps in order. Before each step, say in one line what you're about to do. After each step, check that it worked.
- **Stay inside this project folder.** The only exceptions are:
  - installing the tools listed below with Homebrew;
  - adding one PATH line to `~/.zshrc`.
- **Never use `sudo`.** If something needs the Mac password, an interactive prompt or a browser login, stop. Give the human the exact command to paste into the VS Code terminal (menu Terminal → New Terminal), wait until they say "done", then check it worked and carry on.
- **Don't repeat finished work.** If a tool or step is already done, say so and skip it.
- **Don't touch the docs.** No edits to `docs/`, `design/`, `CLAUDE.md`, `PROMPTS.md`, `START_HERE.md` or `README.md` unless the human agrees.
- **Never start `npx convex dev`, and never deploy anything.** That comes in later phases.

## Step 1: Check the Mac
Run checks and show one table with what's installed and what's missing:
- `sw_vers -productVersion`, `uname -m`
- `brew --version`, `git --version`
- `node -v`, `pnpm -v`, `python3 --version`
- `gh --version`, `cloudflared --version`

The Mac needs macOS 15 or newer on Apple Silicon (`arm64`). If it's older, or an Intel Mac, warn the human that Homebrew support is limited, and continue.

## Step 2: Homebrew (human, only if missing)
If `brew` is missing, ask the human to paste this into the VS Code terminal and follow its prompts (it asks for the Mac password):
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
At the end it prints **"Next steps"** with lines starting `echo` and `eval`; ask them to run those too. Afterwards, find brew at `/opt/homebrew/bin/brew` and use `eval "$(/opt/homebrew/bin/brew shellenv)"` in your own commands.

## Step 3: Tools (you)
1. Install only what's missing: `brew install node@24 python gh cloudflared`.
2. node@24 is keg-only. Add `export PATH="$(brew --prefix node@24)/bin:$PATH"` to `~/.zshrc` with the prefix expanded, only if that line isn't already there. In your own shell, prepend the same path for the rest of this session.
3. Run `corepack enable pnpm`.
4. Check that `node -v` shows `v24.x` and that `pnpm -v` works. If corepack asks to download pnpm, use `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`.

## Step 4: The project (you)
1. Python for the font script: `python3 -m venv .venv && .venv/bin/pip install fonttools brotli`.
2. Create `.gitignore` with these lines:
   ```
   .venv/
   node_modules/
   .next/
   .env*.local
   .DS_Store
   ```
3. Git:
   - If `git config --global user.name` or `user.email` is empty, **ask the human** for their name and their GitHub email, and set them.
   - Then: `git init -b main`, `git add .`, `git commit -m "Docs pack"`.
   - Skip anything already done.

## Step 5: GitHub (human signs in once, then you)
1. Run `gh auth status`. If it isn't logged in, ask the human to run `gh auth login` in the terminal (choose GitHub.com → HTTPS → Login with a web browser) and say "done".
2. Then run `gh repo create molbhav --private --source=. --push`. Use their **personal** account, not an organisation: Vercel's free plan can't deploy an organisation's private repo. If the name is taken, ask for another.

## Step 6: Vendor helpers (you)
Install exactly these. **No other Bolna skills:** the others can place calls or buy numbers, which must only happen through the app's guarded dial path.
```bash
npx skills add bolna-ai/skills -a claude-code --skill setup-webhook
npx skills add bolna-ai/skills -a claude-code --skill setup-tools
npx skills add bolna-ai/skills -a claude-code --skill get-executions
npx skills add sarvamai/skills -a claude-code --skill speech-to-text
npx skills add sarvamai/skills -a claude-code --skill text-to-speech
```
- If a command asks questions, check `npx skills add --help` for non-interactive flags and choose **project scope, Claude Code only**.
- If one still fails, skip it and say so.
- Afterwards, read each installed `SKILL.md` and tell the human in one line each what it does. Flag anything that dials, sends messages or spends money.

## Step 7: Shortcuts for the build (you)
Create these three files.

`.claude/commands/phase.md`:
```markdown
---
description: Run one Molbhav build phase from PROMPTS.md
argument-hint: <phase, e.g. 1A>
---
Open PROMPTS.md and find the section "## Phase $ARGUMENTS". Rules: CLAUDE.md and docs/DECISIONS.md.
1. If the section has "Before this phase (you)", list each item and ask me to confirm it's done. Check what you can yourself, for example env vars that should be set.
2. Follow the prompt in that section's code block exactly. Plan first; build only after I approve the plan.
3. When building is finished, run typecheck, lint and tests. Then go through the phase's "Done when" items one by one, saying which ones you verified and which ones need me (phone, browser, accounts).
4. Suggest running /review. Do not start the next phase.
```

`.claude/commands/review.md`:
```markdown
---
description: Panel review of the current phase (full, or "light")
argument-hint: [light]
---
Take the "Panel review" prompt from the Utility prompts section of PROMPTS.md and run it.
- The diff base is the latest git tag (`git describe --tags --abbrev=0`), or the first commit if there is no tag.
- If the argument is "light", use only reviewers 4 and 5.

When I confirm the "Done when" items, commit, then create and push the tag `phase-<phase id>`.
```

`.claude/commands/handover.md`:
```markdown
---
description: End-of-day handover
---
Run the "End-of-day handover" prompt from PROMPTS.md. Then commit any finished work with a clear message and push.
```

Then commit with `git commit -m "Claude Code commands and vendor skills"` and push.

## Step 8: The Sarvam docs server (human, one click)
`.mcp.json` already defines `sarvam-docs`. You can't approve it yourself, so ask the human to type `/mcp` in the Claude panel, enable **sarvam-docs**, and say "done". If you can see the server afterwards, confirm it's connected.

## Step 9: Phase 0 (you; no code)
Run the Phase 0 prompt in `PROMPTS.md`:
1. Summarise the product, stack, hard rules and phase plan in 12 bullets.
2. List anything contradictory, unclear or risky (file and section), with a suggested fix. **Don't edit the docs; ask.**
3. List the accounts, keys, installs and env vars needed before Phase 1A, before Phase 4 and before Phase 8B.

## Step 10: Tell the human what's next
End with a short message:
1. **What you did,** with a ✓ list.
2. **Anything that failed or was skipped,** and why.
3. **Accounts to create now**, if they haven't already:
   - Convex (sign in with GitHub);
   - Vercel (the same personal GitHub account);
   - Google AI Studio (a free API key now; a billed project later);
   - Sarvam (API key);
   - Bolna: verify the teammates' phone numbers; don't buy a number.

   Say that no keys need pasting yet. Each phase asks for its keys when needed.
4. **How to build from now on:**
   1. Open a new conversation with ⌘⇧Esc.
   2. Set the mode indicator under the prompt box to **Plan**.
   3. Type `/phase 1A`. (If the command isn't recognised, type "Run Phase 1A from PROMPTS.md".)
   4. After approving a plan, click **Yes, manually approve edits**.
   5. At the end of a phase, run `/review`. At the end of the day, run `/handover`.
   6. Keep `npx convex dev` and `pnpm dev` running in your own terminals, starting from Phase 1A, when Claude Code asks.
