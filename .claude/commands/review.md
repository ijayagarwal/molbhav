---
description: Panel review of the current phase (full, or "light")
argument-hint: [light]
---
Take the "Panel review" prompt from the Utility prompts section of PROMPTS.md and run it.
- The diff base is the latest git tag (`git describe --tags --abbrev=0`), or the first commit if there is no tag.
- If the argument is "light", use only reviewers 4 and 5.

When I confirm the "Done when" items, commit, then create and push the tag `phase-<phase id>`.
