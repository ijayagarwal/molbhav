---
description: Run one Molbhav build phase from PROMPTS.md
argument-hint: <phase, e.g. 1A>
---
Open PROMPTS.md and find the section "## Phase $ARGUMENTS". Rules: CLAUDE.md and docs/DECISIONS.md.
1. If the section has "Before this phase (you)", list each item and ask me to confirm it's done. Check what you can yourself, for example env vars that should be set.
2. Follow the prompt in that section's code block exactly. Plan first; build only after I approve the plan.
3. When building is finished, run typecheck, lint and tests. Then go through the phase's "Done when" items one by one, saying which ones you verified and which ones need me (phone, browser, accounts).
4. Suggest running /review. Do not start the next phase.
