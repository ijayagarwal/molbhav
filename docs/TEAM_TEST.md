# Teammate verification: proving live AI calls for the hackathon

Milestone 1 (G8) proves the real call loop works:
- Bolna dials real phones.
- The AI discloses, asks for the landed price, reads it back, bargains and confirms.
- The webhooks update the board and the code picks the winner.

Teammates **role-play dealers** on their own Bolna-verified phones in **trial mode** (B9).

The code doesn't change for real dealers in Milestone 2. Only the numbers, the consent type and the settings change. The sim personas for the demo order use the same numbers as these cards, so the simulator and the live runs show the same totals.

## Rules
- **Only teammates' phones**, each verified in Bolna and added in `/app/admin` as a `test_ok` dealer. Never dial anyone else.
- **Consent:** each teammate agrees to be recorded, and to the clips being shown to judges.
- **Labels:** dealer names carry a "TEST ·" prefix. Every price on the cards below is fictional test data, never presented as a market price.
- **Speech:** speak naturally in Hindi, answer only what the agent asks, and use the card's numbers exactly. The test checks what the system heard against the card.
- **On haggle and match calls,** say only what changes. The rest carries over from your first quote (ARCHITECTURE.md §6.6), and the read-back states the full terms. Say "हाँ" only if they are right.

## Setup (once)
Do `START_HERE.md` C5 first. Then:

1. **Check the dealers** added in C5, all in Jaipur with consent `test_ok`:
   - **P1:** TEST · Agarwal Steels
   - **P2:** TEST · Om Sai Traders
   - **P3:** TEST · Rathore Building Material
   - **P4:** TEST · Shree Balaji. Don't link him as your regular dealer yet; that happens just before Run 2.
2. **The contractor** is your admin session from C2, verified, with site Mansarovar (default).
3. **Check the settings:**
   - `LIVE_CONCURRENCY=2` (the trial dials 2 at a time; the rest queue);
   - `TEST_DAILY_CALLS=15` and `MAX_LIVE_SWEEPS_PER_HOUR=6` on test days (Claude Code sets and resets them);
   - the wallet: `pnpm bolna:check`. Milestone 1 needs about 10 live orders and the $5 trial covers about 5, so top up before the Team test (first check that a top-up keeps trial mode);
   - the Jaipur `priceBands` rows (in `/app/admin`, R13) updated within the last 14 days and covering the card prices (steel ₹55–70/kg, cement ₹360–450/bag). Otherwise every live quote is "out of band", none is citable, and the haggle is skipped.
4. **Before Run 6:** download the Run 2 clips. Run 6 opts out P2, and opting out deletes **all** of that dealer's recordings.

## The order (said in the app, every run)
> "Kal subah tak 2 ton 12mm sariya Fe500D aur 150 bori PPC cement, Mansarovar wali site pe, 15 din ka udhaar chahiye."

On Confirm, choose **लोकल ISI** for steel; cement is already **कोई भी** (R8). Turn on **LIVE** on Choose dealers.

## Role cards (keep yours in front of you)
**Card A · Agarwal Steels: the best rate, comes down when pushed**
- **Quote call:**
  - "हाँ जी, पूरा माल है।"
  - Steel: "सरिया शक्ति TMT, ISI वाला, सत्तावन रुपये किलो, GST अलग।"
  - Cement: "सीमेंट PPC, जयपुर गोल्ड, तीन सौ सत्तर रुपये बोरी, GST अलग।"
  - Terms: "डिलीवरी फ्री, उतराई छह सौ रुपये, पक्का बिल, कांटे पे तौल, सात दिन उधार, कल सुबह नौ बजे तक।"
  - At the read-back: "हाँ, सही है।"
  - **Expected:** ₹2,00,610, comparable and citable.
- **Haggle call** (it comes second, after Om Sai's, and should cite ₹1,99,400 without naming Om Sai): "ठीक है, सरिया छप्पन रुपये पचास पैसे कर देंगे, और उतराई भी फ्री।" Confirm the read-back.
  - **Expected:** ₹1,98,830.
- **Confirm call:** "हाँ जी, पक्का, भेज देंगे।" In Run 4, change the price instead.

**Card B · Om Sai Traders: GST included, cash only**
- **Quote call:**
  - "हाँ जी, पूरा माल है।"
  - Steel: "सरिया शक्ति TMT ISI, सड़सठ हज़ार रुपये टन, GST मिलाके।"
  - Cement: "सीमेंट जयपुर गोल्ड, चार सौ पैंतीस रुपये बोरी, GST मिलाके।"
  - Terms: "भाड़ा पंद्रह सौ, उतराई शामिल, पक्का बिल, कांटा, उधार नहीं, कैश।"
  - Confirm the read-back.
  - **Expected:** ₹2,00,750.
- **Haggle call** (it comes first and should cite ₹2,00,610): "चलो, सरिया छियासठ हज़ार सात सौ टन, सीमेंट चार सौ तीस।" Confirm the read-back.
  - **Expected:** ₹1,99,400.

**Card C · Rathore Building Material: vague, can't win**
- **Quote call:**
  - "सरिया सत्तावन सौ पचास क्विंटल, सीमेंट तीन सौ अस्सी।"
  - On GST: "वो बाद में देख लेंगे।"
  - On delivery and unloading: "साइट देख के बताएँगे।"
  - On the bill: "बिल चाहिए तो रेट अलग है।"
  - Never confirm a full read-back.
- **Expected:** listed as "जाँच बाकी"; it can never win or be cited.

**Card D · Shree Balaji: the regular dealer, match call only**
- **Match call:**
  - First rate, steel: "पूरा माल है। सरिया शक्ति TMT ISI, अड़सठ हज़ार पाँच सौ टन, GST मिलाके।"
  - First rate, cement: "सीमेंट जयपुर गोल्ड, चार सौ पैंतालीस बोरी, GST मिलाके।"
  - Terms: "डिलीवरी फ्री, उतराई पाँच सौ पचास, पक्का बिल, कांटा, पंद्रह दिन उधार।"
  - **Expected first total:** ₹2,04,300.
  - After it cites the best total: "आप पुराने ग्राहक हो, सरिया सड़सठ हज़ार एक सौ पचास, सीमेंट चार सौ पैंतीस कर देते हैं।" Confirm the read-back.
  - **Expected:** ₹2,00,100. That's a ₹4,200 drop.

## Runs (in this order; Run 6 must be last)
| Run | Phones and cards | What it proves | Expected result |
|---|---|---|---|
| 1 | P1 = A, P2 = B (no regular dealer linked) | Dialling, disclosure, extraction, read-back, both haggles | A wins at ₹1,98,830; "₹1,780 कम · बीच वाले रेट से" (median of 2,00,610 and 2,00,750, lower middle, R5) |
| 2 | First link P4 as your regular dealer in `/app/admin`. Then P1 = A, P2 = B, P3 = C, P4 = D. | **The full demo flow:** a flagged quote, the match call, the confirm call | Winner A ₹1,98,830; "₹5,470 कम · आपके dealer के पहले रेट से"; Balaji card "₹4,200 कम · ₹1,270 ज़्यादा"; confirm → Placed |
| 3 | P1 = A; P3 doesn't pick up; P2 says "अभी busy हूँ, दस मिनट बाद कॉल करो" | No answer, and a callback request | P3: one retry after 3 minutes, then no answer. P2: called back about 10 minutes later (P8); the round waits for it |
| 4 | Run 2 again, but A says on the confirm call "रेट बढ़ गया, सत्तावन पचास लगेगा" | Re-pricing at confirm | No deal; Result shows the runner-up highlighted |
| 5 | P1 = A, P2 = B; on the quote call, P1 cuts in at once with "हाँ जी बोलिए" | Interrupted welcome | The agent repeats the disclosure; the S5 check passes |
| 6 | P1 = A, P2 = B. P2 first offers "बिना बिल पचपन में दे दूँगा"; when asked for the pakka rate, gives Card B; on the haggle call says "आगे से कॉल मत करना". | The kachcha rule and opt-out | The no-bill rate is never used; P2 is opted out at once and all its recordings are deleted. To re-add P2 in admin, write a fresh consent note (logged). |

**With only 2 phones (P1, P2):**
- Runs 1, 5 and 6 work as written.
- **Run 3:** P1 = A gives the callback line, and P2 doesn't pick up.
- **Run 2:** use P1 = A and P2 = D, with P2 linked as your regular dealer. There's no haggle ("सिर्फ 1 रेट मिला"). The match call cites ₹2,00,610, and D comes down to ₹2,00,100 with 15 days credit. Expected: **"आपके dealer ही सबसे सस्ते"**.
- Skip Run 4.

## Checks for every run
- [ ] "AI" and "रिकॉर्ड" are heard before any rate is asked
- [ ] Every read-back repeats only numbers the dealer said; the agent never states a total of its own (R1)
- [ ] Each line's rate, unit, GST mode, delivery, unloading, credit, bill and weight match the card (haggle and match quotes inherit what wasn't changed)
- [ ] The landed total equals the card's expected total (`lib/pricing.ts`)
- [ ] Haggle and match calls cite an exact, real total and never name another dealer
- [ ] No number appears that nobody said
- [ ] The confirm call relays only approved terms
- [ ] The board updates in real time; the recordings play with seeking
- [ ] The Convex logs show no double dial and no duplicate webhook write
- [ ] Cost per order (`costUsdCents`) is logged

## Run log (copy into a sheet)
| Run | Date | Phones | Calls | Totals right? | Haggle drop | Issues found | Cost |
|---|---|---|---|---|---|---|---|

## What to bring to the judges
- A screen recording of the live board during Run 2, with call audio, recorded with every teammate's consent.
- Two or three 5–8 s clips: the disclosure, a haggle drop and the match.
- The run log: "N live AI calls to teammates role-playing dealers; totals right in X of Y."
- A one-line truth: "These were our teammates on verified phones, in Bolna's trial mode. Calls to real dealers start once our business number is registered and declared."
