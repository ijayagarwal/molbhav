---
description: Run one Molbhav build phase from PROMPTS.md
argument-hint: <phase, e.g. 1A>
---
Open PROMPTS.md and find the section "## Phase $ARGUMENTS". Rules: CLAUDE.md and docs/DECISIONS.md (including §R). Working model: DECISIONS R12 — you do the work; I provide accounts, keys, phones, money, legal steps and design calls.
1. If the section has "Before this phase (you)", list each item and check what you can yourself (accounts signed in, env vars set, files present). Ask me only for what is still missing, all in one message.
2. Post a short plan for the prompt in that section's code block, then build it. Stop for my answer only if the plan needs something only I can give, or a decision that changes the product, money or anything legal.
3. When building is finished, run typecheck, lint and tests. Then go through the phase's "Done when" items one by one, saying which ones you verified and which ones need me (phone, browser, accounts).
4. Suggest running /review. Do not start the next phase.
