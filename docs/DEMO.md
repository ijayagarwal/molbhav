# Molbhav: judge demo (3 minutes)

The rule for this demo (G7): **show what is real, label what is simulated, and say plainly what isn't live yet and why.** Judges trust a team that is precise about this.

## Setup
- **Where:** run from `/present` on a laptop at 1440 × 900. The real app sits in an iframe on the left; the pipeline and event log are on the right. It runs on the **separate demo deployment** (Convex `demo`), signed in as the demo contractor.
- **Mode:** sim with `SIM_PACE=demo` (the sweep takes about 1 minute; undo 5 s). Every demo dealer carries the DEMO badge.
- **Network:** your own phone hotspot, not the venue Wi-Fi.
- **Real material to have ready:**
  - two or three short clips from your **human spread-test calls**, recorded with the dealers' consent;
  - your real spread figure, with its sample size ("we called N dealers; landed prices for the same order differed by X%").
- **Teammate-verified live calls (Milestone 1 proof):** the screen recording of `docs/TEAM_TEST.md` Run 2 with call audio, two or three 5–8 s clips, and the run log.
- **Optional live call on stage:** to a teammate's phone verified in Bolna, if the trial wallet and the room allow it.

## Script
| Time | On screen | Say |
|---|---|---|
| 0:00–0:20 | Landing hero, then `/present` | "Meet Ramesh, a composite of the contractors we interviewed. He runs three sites in Jaipur. Before every slab he phones dealers one by one, standing in the sun, and usually gives up after a few calls. The real price is never written down. It lives inside a phone call." |
| 0:20–0:40 | Hold the mic, speak the order | (Speak) "Kal subah tak 2 ton 12mm sariya Fe500D aur 150 bori PPC cement, Mansarovar wali site pe, 15 din ka udhaar chahiye." |
| 0:40–0:55 | Confirm: tier chip, read-back | "One sentence carries size, grade, quantity, site, deadline and credit. It asks one thing it can't guess, which kind of steel, so we compare like with like. It reads it back in Hindi; he says haan." |
| 0:55–1:45 | Sweep: rows ring, checklist fills, totals stamp | "This is the simulator, marked DEMO. Each call opens by saying it's an AI and that it's recorded, then asks for the landed price: rate, GST, delivery, unloading, credit. One dealer doesn't pick up. One won't say whether GST is included, so he's flagged and can't win. Notice his regular dealer isn't cold-called: he's kept for the end." |
| 1:45–2:15 | Haggle and match: strike-throughs | "Now the molbhav. The agent calls back the best two citing the exact best total, a real number, read back and confirmed, and never the other dealer's name. Then his own dealer gets a chance to match. He comes down ₹4,200." |
| 2:15–2:35 | Result parchi, tally, then two real clips | "Cheapest comparable landed price, credit days and delivery, measured against his own dealer's first rate, not an inflated list price. Everything you just saw also runs on real phone calls. Here is our AI on a live call with a teammate playing a dealer" (play the haggle clip from Team test Run 2, 5–8 s) "and here is a real dealer from our hand-made spread test." (Play 5 s.) |
| 2:35–2:50 | Says "अग्रवाल को confirm करो", undo, placed, share | "He confirms by voice. The confirm call only relays terms he approved. He shares a parchi with the site owner, which shows the saving but no site, date or phone numbers." |
| 2:50–3:00 | Close | "Take voice away and there's no product. The price lives in a conversation, and so does the bargain. The AI calls are real and verified on our teammates' phones. What isn't live yet: AI calls to real dealers. That needs our own registered number and TRAI's A2P declaration, which we're doing now. Until then our team runs the Jaipur pilot by hand." |

**If there's time and conditions allow:** in a second browser profile signed in to the demo deployment as a verified test contractor, start a live sweep to one teammate's `test_ok` phone, on speaker (trial mode, B9). Never from the `/present` iframe, which is sim only. Let the room hear the disclosure and the quote land. Never put it in the main path.

## If a judge asks
- **"Is the bargaining real?"** Show the Team test run log ("N live AI calls; totals right in X of Y") and play the match-call clip. Play a human spread-test recording. Show that the agent can only cite a quote that was read back and confirmed (`lib/pricing.ts`, "citable").
- **"What about telecom rules?"** Since TRAI's September 2026 amendment, AI-voice calls are A2P: they and their numbers must be declared in advance. Before any real dealer gets an AI call we'll have a declared number registered to our business; today AI calls go only to our own verified phones. The product enforces the rest: disclosure in the first sentence, call hours, opted-in dealers only, AI calls from at most 2 orders a day per dealer, and immediate opt-out.
- **"Won't dealers hate AI calls?"** "We're measuring it." Give the go/no-go bars: at least 70% stay on after the disclosure, at least 50% give a valid quote, and at least 40% of haggle calls lower the price.
- **"What about the contractor's own dealer?"** He is never cold-called. He gets a match call at the end, and the result has an "उन्हीं से लीजिए" option. We sharpen the relationship; we don't take it away.
- **"How do you make money?"** The hypothesis: 10% of the measured saving, capped at ₹499, and nothing if we saved nothing. Later, dealers pay per delivered order, never for ranking.
- **"Why won't IndiaMART or Google do this?"**
  - IndiaMART's revenue comes from suppliers.
  - Google's call feature checks price and stock and doesn't bargain.
  - Infra.Market and OfBusiness sell their own supply at ex-works prices.
  - We're paid to fight for the buyer on landed price.

## Fallbacks
1. **Hotspot.** If even Convex is unreachable, play the backup video.
2. **Mic or STT fails on the demo line:** the canned parse for that exact sentence takes over (logged), or type it in the composer.
3. **Gemini fails on extraction:** the personas' ground-truth quotes are used (demo deployment only).
4. **"Reset demo"** reseeds the demo rows and returns to Home in one tap.
5. **A full backup run** (screen plus audio, 1440 × 900), recorded the day before, sits on the laptop desktop and plays offline.

## Rehearsal checklist
- [ ] 10 clean runs in a row on the demo deployment, timed under 3:00
- [ ] Mic checked on the laptop in the venue, and on a phone
- [ ] Hindi copy reviewed by a native speaker; no gendered first-person verbs
- [ ] Sound on and volume tested; reduced motion off on the demo laptop
- [ ] Real spread-test number and its sample size in the script (replace every example figure)
- [ ] Consent confirmed for every real recording you play
- [ ] Backup video plays offline
- [ ] Phone hotspot tested with the laptop
- [ ] Live AI call to the teammate's verified phone tested that morning (optional)
