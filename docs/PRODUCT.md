# Molbhav — Product spec

> आप बोलिए। मोलभाव हम करेंगे।
> You say it. We bargain.

## 1. One-liner

Molbhav is a voice-first buying agent for small building contractors. Speak one order; it phones the dealers near your site, gets landed prices, bargains with the best two using real quotes, and gives you the cheapest option with proof. You confirm by voice.

## 2. Why this, why now

- Material rates for steel and cement move week to week and differ dealer to dealer, and most local dealers do not publish rates. The price lives inside a phone call.
- Contractors already solve this by phoning several dealers before each order, usually while managing labour on site. Many stop after a few calls and pay their usual dealer's rate.
- Indian-language speech recognition, natural Hindi voices and phone-calling agent platforms became good and cheap enough in 2026 to automate the whole loop.
- Marketplaces that earn from sellers cannot fully fight for the buyer. Molbhav is on the buyer's side.

## 3. Users

### Primary: Ramesh Yadav, small contractor (thekedar)
- 42, runs 2 to 4 residential sites in Jaipur. Mid-range Android phone, WhatsApp all day.
- Reads Hindi comfortably, some English. Speaks Hindi with English material terms ("12mm", "PPC", "Fe500D").
- Orders steel and cement for every slab, then bricks, sand, tiles and pipes through the build.
- On site in full sun, hands busy, often one-handed. Hates typing long things.
- Fears: losing his regular dealer's credit, being quoted a fake "best price", wasting time.
- Wants: the real lowest landed price, delivery on time, credit days, and proof he can show the site owner.

### Secondary: Sunita Sharma, family building its own house
- First build, does not know fair rates, fears being cheated. Same flow, more reassurance.

### Other side of the call: dealers
- Steel and cement traders and agencies. Busy at the counter, answer the phone, speak Hindi.
- Respond to real buyers with real quantities. Dislike time-wasters and fake bargaining.
- Molbhav must be respectful and quick (target 75 s, never over 2.5 minutes) so dealers keep picking up.

## 4. Jobs to be done
1. "When I need material for tomorrow's slab, get me the best landed rate without spending my morning on calls."
2. "Show me proof, so I trust the price and can show the owner."
3. "Keep my regular dealer in the loop, so I don't lose my credit relationship."
4. "Let me do it by speaking, from the site, in my language."

## 5. Product principles
1. **Buyer-side, always.** No dealer pays to rank higher. Ever.
2. **Honest bargaining.** Only real quotes are cited, never another dealer's name, never a made-up number.
3. **Relationship-safe.** The contractor's regular dealer is never cold-called: he gets a match call at the end and can keep the order.
4. **Proof over promises.** Every number links to the call recording and transcript.
5. **Voice in, glance out.** Speaking is the input; the screen is for a 2-second confirmation.
6. **Landed price is the only price.** Compare rate plus GST plus delivery plus unloading, with credit days and delivery time beside it.

## 6. Scope

### P0: first release (must ship)
| # | Feature | Notes |
|---|---|---|
| 1 | Voice order capture | One mic, both gestures: tap auto-locks, hold is push-to-talk (slide to cancel or lock). Silence auto-send in locked mode. Max 25 s. Typed fallback. Hold Space on desktop. |
| 2 | Order understanding | Hinglish transcript to structured order (materials, size, grade, qty, unit, brand, site, deadline, credit). Missing fields asked as quick chips. |
| 3 | Confirm screen with spoken read-back | Editable chips, **brand-tier chips** (steel: ब्रांडेड / लोकल ISI; cement defaults to the last choice or कोई भी, R8), a read-back of at most 3 sentences, "हाँ, शुरू कीजिए" by button or voice (negation-safe grammar). |
| 4 | Dealer selection | Dealers in the site's city; the contractor's dealer book is on by default (4 to 6), same area first (R13). **Regular dealer pinned and held for a match call at the end** (toggle "पहले भी पूछिए"). |
| 5 | Live sweep board | Parallel calls, per-dealer states, timers, **slot checklist** (रेट · GST · भाड़ा · उधार), captions in sim only, best-so-far ribbon, stop-all button. |
| 6 | Quote extraction and landed price | Transcript to quote JSON (LLM), then code: landed total, comparability (tier, pakka bill, brand, weighing, delivery stated) and citability (read-back confirmed, rates found in the transcript). |
| 7 | Haggle round and match call | Call back the top two citing the exact best citable total; then the regular dealer's match call (his own rate first). Strike-through on drops. |
| 8 | Result | Winner parchi, saving vs the regular dealer's first rate (or vs the middle quote), "your dealer also came down" card, comparable table, non-comparable list, recordings, spoken summary. |
| 9 | Place and confirm | Undo window, then a confirm call that relays approved terms only; terms changed means the runner-up is offered. Share as a parchi image or `/p` link with three share modes. |
| 10 | Sim mode and live mode | Sim is the default, zero spend, deterministic. Live: Bolna, server-side guards, verified contractors and opted-in dealers only. |
| 11 | Presenter view | The real app in an iframe (demo account) plus pipeline, event log and stats. |
| 12 | Hindi and English UI | Language picked at onboarding, switchable anytime. (cookie, server-rendered). |
| 13 | Desktop Munshi desk | Icon rail, ledger sweep table, docked call panel, voice dock. |
| 14 | Landing, waitlist, sandbox, shared parchi, dealer opt-in | `/`, `/try`, `/p/[id]`, `/dealer`. The landing page and waitlist ship first. |
| 15 | Auth and safety | Anonymous Convex Auth, ownership checks, admin verification for live, consent notices, retention crons. |

### P1: next
- **Milestone 2 (Phase 10):** our own number, live stages, consent evidence, an inbound line (opt-out, callback rates, messages), go/no-go metrics, Google sign-in for real contractors
- WhatsApp rate photos mapped to open orders
- "दोनों" (compare both steel tiers in one order, R10); scheduling live calls for the next call window
- Delivery address, GSTIN and advance relayed on the confirm call (validated fields, R9)
- Dealer discovery by distance (sites and dealers with coordinates)
- Phone OTP sign-in (needs SMS DLT registration)
- Order history and reorder by voice ("pichhla wala order phir se")
- Sites and dealer book management, block a dealer
- WhatsApp voice-note intake (contractor sends a voice note, gets the parchi back)
- Dark mode ("Raat ki shift") and installable PWA with push notifications
- More materials: bricks, sand, aggregate, tiles, pipes
- Google Places dealer discovery for new areas (store only dealers the user confirms)

### Later: the startup
- Rate memory: one sweep prices a spec for every contractor nearby, so the cost per order falls with scale
- Local price index by city and spec (from our own calls and opted-in dealers)
- Dealer side: confirmed ready-to-deliver orders (dealers pay per fulfilled order, never for ranking)
- Credit and delivery partners; pooled orders for small buyers

## 7. Core flow (happy path)
1. Ramesh opens Molbhav (`/app`). Home says "आज क्या मंगवाना है?" with a big yellow mic.
2. He presses the mic: "Kal subah tak 2 ton 12mm sariya Fe500D aur 150 bori PPC cement, Mansarovar wali site pe, 15 din ka udhaar chahiye."
3. The transcript appears in about 1.5 s and the Confirm screen in about 2.5 s, with two item cards and one question, "कौन सा सरिया?". He taps "लोकल ISI". The read-back plays: "दो टन बारह mm लोकल ISI सरिया Fe500D, और डेढ़ सौ बोरी PPC। पंद्रह दिन उधार। सही हो तो शुरू कीजिए।"
4. He taps or says "हाँ, शुरू कीजिए". The dealer list shows 4 dealers on, plus his regular dealer pinned as "आख़िर में match का मौका".
5. Sweep: rows ring, show timers and the slot checklist, then stamp in totals (about 1 minute at sim demo pace, several minutes live). One dealer doesn't answer; one is flagged "GST चेक कीजिए" and can't win.
6. Haggle: the second-best hears the exact best total and drops; the best then drops too. Prices strike through.
7. Match call: his regular dealer gives his own rate first (₹2,04,300), hears the best real total, and comes down to ₹2,00,100.
8. Result: the winner's parchi at ₹1,98,830; "₹5,470 कम · आपके dealer के पहले रेट से"; a card "your dealer also came down ₹4,200 · 15 days credit · ₹1,270 more" with "उन्हीं से लीजिए". He plays a recording.
9. He says "अग्रवाल को confirm करो". After the undo window a relay confirm call runs and the order shows placed. He shares the parchi ("सिर्फ बचत") with the site owner on WhatsApp.

## 8. Edge cases that must be handled

| Situation | Behaviour |
|---|---|
| Speech not understood | Show what was heard, never blame the user: "पूरा समझ नहीं आया। जो समझा वो नीचे है, ठीक कर दीजिए।" After two failures, show chips first. |
| Missing field (grade, qty) | Ask one question at a time with 2 to 4 chips (e.g. Fe500 / Fe500D / Fe550D) |
| Ambiguous unit ("do gaadi") | Ask for tons or bags; never guess quantity |
| Dealer does not answer | Mark no answer; in live mode one retry after 3 min if the round is still open |
| "Rate WhatsApp kar deta hoon" | Agent asks for a rough verbal rate; if refused, mark callback requested |
| "Seth ji se poochke batata hoon" | Mark callback requested with time if given |
| Dealer lacks stock or spec | Mark declined with the reason; exclude from ranking |
| GST inclusion unclear | Assume GST extra for display and flag "GST चेक कीजिए"; the quote can't win or be cited |
| Quote far from others (over 15% from median) | Flag "जाँच कीजिए" with the recording; it can't win (shown separately) |
| Fewer than 2 citable quotes | Skip the haggle; show what we have honestly ("सिर्फ 1 रेट मिला") |
| Delivery not stated | Unknown, never assumed free; the quote can't win |
| Unloading not stated | Unknown, never assumed free; the quote can't win or be cited (B7, R6), and the agent asks for it |
| No-bill (kachcha) rate offered | The agent asks for the pakka-bill rate; a no-bill rate never wins |
| Dealer re-prices at confirm | No deal; the contractor is brought back with the runner-up highlighted |
| Dealer says "आगे कॉल मत करना" | Opted out immediately; all of that dealer's recordings deleted |
| Voice command with negation ("confirm मत करो") | No action; buttons shown |
| Contractor leaves the app | Sweep continues server-side; returning shows current state |
| Outside call hours | Live mode refuses to dial and says when calls are possible (10:00–19:00 IST); scheduling for later is P1 |
| Live calls disabled, contractor not verified or dealer not opted in | Live dial refused server-side; sim still works |

## 9. Domain model

### Materials (MVP)
**TMT steel (sariya)**
- Diameters: 8, 10, 12, 16, 20, 25, 32 mm
- Grades: Fe500, Fe500D, Fe550D (Fe500D default only if the user confirms)
- Tier (compared only within a tier): ब्रांडेड (Tata Tiscon, JSW Neosteel, SAIL, Jindal; list kept in per-city config) or लोकल ISI. "दोनों" (cheapest in each tier) is P1 (R10). Non-ISI steel is never included.
- Bill and weighing: pakka (GST) bill only; actual weighed (kanta) or standard section weight is recorded, because it changes the real kg delivered.
- Order units: ton (metric tonne, 1000 kg) or kg. Dealers quote per kg, per ton or per quintal (100 kg).
- Colloquial size in "suta": sources disagree (4 suta is given as 12 mm in some places and 16 mm in others), so it is **never mapped automatically**. The app asks with mm chips and always speaks mm to dealers.

**Cement**
- Types: OPC 43, OPC 53, PPC, PSC
- Unit: bag (bori / katta) of 50 kg
- Brand: नामी कंपनी (UltraTech, ACC, Ambuja, Shree, JK; per-city config), कोई भी, or a named brand

### GST (as of November 2026)
- TMT steel: 18%. Cement: 18% (cut from 28% effective 22 September 2025 under GST 2.0).
- Keep rates in config (`lib/config.ts`), not hard-coded in logic. Delivery and unloading charges are taken as spoken; if not stated they are unknown (never assumed free) and the quote can't win. Have a CA confirm the GST treatment of freight before launch.

### Hindi quantity words the parser must handle
sava = n + 0.25 (sava do = 2.25) · dedh = 1.5 · dhai = 2.5 · saade = n + 0.5 (saade teen = 3.5) · paune = n − 0.25 (paune do = 1.75) · sau = 100 · hazaar = 1,000 · lakh = 1,00,000 · "dedh sau bori" = 150 bags

## 10. Metrics
- **North star:** contractors who place a **second order within 30 days**.
- **Proof metrics:**
  - ₹ below the regular dealer's own first rate (recorded);
  - the share of orders where the regular dealer lowered his rate;
  - the share won by a new dealer;
  - spread % on identical orders.
- **Call health (go/no-go bars in `DECISIONS.md` §D):**
  - stay-on rate after the AI disclosure (≥ 70%);
  - valid comparable quotes per dial (≥ 50%);
  - haggle calls that lower the price (≥ 40%, median drop ≥ 0.5%).
- **Speed:** transcript ≤ 1.5 s and Confirm ≤ 2.5 s after release; time from order to result.
- **Quality:** parse eval ≥ 18/20; extraction eval ≥ 9/10.
- **Cost per live order:** sum of `costUsdCents` converted to ₹ (target under ₹80).
- **Funnel events:** `try_start`, `try_voice`, `waitlist_submit`, `parchi_share(mode)`, `parchi_open`, `parchi_cta`, `dealer_optin`.

## 11. Business model (hypotheses to test)
1. **The contractor pays per win:** 10% of the measured saving, capped at ₹499, and ₹0 when nothing was saved. A live order costs us about ₹65–80.
2. **Dealers pay per confirmed, delivered order**, never for ranking.
3. Later: take the order ourselves with delivery and credit partners.

Positioning, if asked:
- **IndiaMART:** its revenue comes from paying suppliers.
- **Google's "Let Google Call":** US-only; it checks stock and price with stores and doesn't bargain.
- **Boomerang (Hyderabad):** enquiry calls, no bargaining.
- **Infra.Market and OfBusiness:** sell their own supply at ex-works prices behind a login.
- **Molbhav:** "Your agent, your dealers, landed price, not ex-works."

## 12. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Dealers hang up on AI calls | Disclose, target 75 s (never over 2.5 minutes), real quantities, Hindi voice; measure stay-on rate |
| Telecom rules on automated calls | A number registered to the business (Bolna, or our own Plivo/Exotel account), A2P declaration under TRAI's September 2026 amendment, disclosure in the first sentence, call hours, opted-in dealers only, AI calls from at most 2 orders a day per dealer number (ARCHITECTURE.md §11) |
| No registered business yet | Concierge first (humans call); AI tested only on verified team phones; register a sole proprietorship (Udyam is free and online) and open a Plivo or Exotel account connected to Bolna; a Pvt Ltd later for fundraising |
| Lowball winner re-prices | Comparability gate (tier, pakka bill, brand, weighing) and a relay confirm that rejects any change |
| Open API abuse and spend | Convex Auth, ownership checks, internal functions, Vercel BotID, rate limits, daily spend caps and kill switches |
| Price spread too small to matter | Run the spread test now; landed price and credit often differ even when list rates don't |
| Contractor loyalty to credit dealer | Regular dealer never cold-called; a match call at the end; an "उन्हीं से लीजिए" option on the result |
| Wrong number extracted | Agent repeats numbers back; LLM extraction plus code math; outlier and GST flags; recording links |
| Demo-day failure | Separate demo deployment, sim mode, canned parse for the scripted line, persona fallback, phone hotspot, recorded backup run (DEMO.md) |

## 13. Validation and first customers (by hand, starting now)
1. **Spread test (concierge):** teammates call 15–20 Jaipur dealers by hand with the same order (2 t 12 mm Fe500D local ISI + 150 bags PPC, one pin code). Say the call is recorded and record only with consent. Note the first all-in quote, then the price after one callback citing the best real total.
2. **Five contractor interviews:**
   - How many dealers do you call per order, and how often do you order?
   - Would you let an agent call your regular dealer, or only give him a match chance?
   - What would you pay?
   - Which words do you use for brand tiers ("branded", "local", "ISI") and sizes ("suta", mm)?
3. **AI disclosure test:** once AI calls are allowed, measure the share of dealers who stay on after the AI introduction.
4. **First 10 customers (Jaipur):**
   - Week 1 by hand: a contractor sends a WhatsApp voice note; the team calls dealers and replies with a parchi within 60 minutes.
   - Recruit at material markets and active sites; the first 3 orders are free.
   - Done when there are 10 real orders, 5 repeat orders and 10 dealers opted in.
5. **Go/no-go for live AI calls:** `DECISIONS.md` §D.
