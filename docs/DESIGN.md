# Molbhav — Design system and UX spec

> **Visual reference:** the "Molbhav UI design" canvas (shared by the founders) and its exported mockups in `design/reference/*.html`: phone screens, the desktop Munshi desk, the presenter, the landing page (desktop and phone) and the system tile. When this spec and a mockup disagree, this spec wins. Decisions are traced in `docs/DECISIONS.md`.

## 1. North star

**"Bahi-khata meets the trading floor."**

The feel of a trusted red ledger (bahi-khata) and a paper receipt (parchi), brought to life like a live trading screen where dealers compete for your order. Rooted in Indian street signage and truck-art lettering, but disciplined, quiet and fast, so it works in direct sunlight on a ₹12,000 Android phone.

Three words for every review: **Bharosa** (trust) · **Tez** (fast) · **Thaath** (pride, a little swagger).

The one moment people should remember: **watching dealers' prices get struck through and rewritten lower, live, while the app bargains for you.**

## 2. What the research says, and what we do about it

| Finding | Design decision |
|---|---|
| For new and low-literacy internet users, voice is often critical, not a convenience. When recognition fails, people tend to blame themselves, and some feel self-conscious speaking in public. (Google Next Billion Users voice playbook) | Voice is the main path, but every voice step has a tap fallback. Error copy never blames the user. Typed and chip input always exist for quiet moments. |
| Voice should be one tap away with a simple, large icon, and spoken output should be split into short sentences. (same playbook) | One big mic, same place on every screen. Read-backs are at most 3 short sentences (V3). |
| Code-switching and pauses are normal in speech. (same playbook) | Expect Hinglish. STT in code-mix mode; parser has Hindi number words; allow pauses (no auto-stop under 1.5 s of silence). |
| Khatabook and Vyapar won Bharat's small businesses by digitising a habit people already trusted (the khata), with minimal entries and vernacular-first design. | We digitise the phone round of bargaining, and the output looks like a familiar parchi. Minimal input: one spoken sentence. |
| Vernacular ads with English-only apps drop users after install. (BlackBuck engineering blog) | Hindi is a first-class UI language written by a native speaker, not machine-translated English. |
| Voice agent UIs live or die on always-visible state (listening, thinking, speaking) and a live transcript so users can verify what was heard. | Mic state machine with visible and audible states; transcript always shown before acting. |
| Outdoor field apps need dark text on light backgrounds at 7:1 or better; bright blues and greens wash out in sun; shadows and gradients reduce contrast; gloves cause missed taps. | Light "paper" theme by default, ink text, 7:1 for prices and primary text, no gradients or soft shadows, 56 px minimum targets, 88 px mic. |
| WhatsApp's hold-to-record, slide-to-cancel and slide-up-to-lock is the voice-note pattern Indian users already know. | Our mic copies that gesture model exactly, plus tap-to-toggle. |
| Indian street lettering and truck art are a living, bold visual language that modern Indian brands are reinterpreting rather than copying. | Truck-art echoes only in signature moments: Devanagari wordmark, hard offset "painted" shadow, haldi yellow. Everything else stays calm. |

## 3. Principles
1. **Voice first, screen confirms.** The screen exists so a busy person can check in 2 seconds.
2. **One thumb, one glance.** Primary actions sit in the bottom 40% of the screen. Nothing needs two hands.
3. **Daylight-proof.** If it is not readable at noon on site, it is not done.
4. **Show the work.** Every price links to its call. Calls show their state honestly, including failures.
5. **Honest numbers.** Savings are measured against the regular dealer or the median, never against an outlier.
6. **Speak their language.** Respectful "aap" and "ji", short sentences, material terms the way contractors say them.
7. **Never blame the user.** The app misheard; the user did not mumble.
8. **Delight with meaning.** Every animation tells you something happened (rang, quoted, dropped, won).

## 4. Brand

- **Name:** Molbhav (मोलभाव), meaning bargaining.
- **Tagline:** हिंदी: "आप बोलिए। मोलभाव हम करेंगे।" · English: "You say it. We bargain."
- **Wordmark:** "मोलभाव" drawn from Anek Devanagari, Expanded width, ExtraBold, ink colour, **delivered as an SVG**, with a hard 0.08em down-right offset shadow in haldi (a nod to painted 3D truck lettering). Latin lockup "MOLBHAV" in Anek Latin Expanded Bold is allowed only beside it, never alone in Hindi mode.
- **App icon:** haldi square, rounded 22%, ink "मो" in Anek Devanagari ExtraBold, a small red strike line across the top right (the bargaining strike).
- **Voice and tone:** like a sharp, respectful munshi who is on your side. Warm, brief, never salesy, never cute in serious moments (money, failures).
- **Grammar of address:** always the respectful form next to "aap" (kijiye, suniye, boliye), never "karo/suno" in app copy. The app speaks as "hum" (the Molbhav team), and neither the app nor the phone agent uses gendered first-person verbs, so any TTS voice fits.

## 5. Colour

### Light theme "Din" (default)
| Token | Hex | Use |
|---|---|---|
| `--paper` | `#F6F2E9` | App background (ledger paper) |
| `--card` | `#FFFFFF` | Cards, sheets |
| `--cement` | `#E9E3D7` | Subtle fills, chips, ruled-line areas |
| `--rule` | `#D8D0C2` | 1 px ledger rules and borders |
| `--ink` | `#15120E` | Primary text, prices, icons |
| `--ink-2` | `#45403A` | Secondary text |
| `--ink-3` | `#6B6358` | Hints and meta only (never prices or instructions) |
| `--haldi` | `#FFC61A` | Mic, primary button fill, best-price highlight, wordmark shadow. **Fill only; never text on paper.** |
| `--lal` | `#93180F` | Brand red, strike-through line, destructive and warning text |
| `--hara` | `#115533` | Savings, best price label, success |
| `--neel` | `#1E3A8A` | On-call state, links, info |

### Dark theme "Raat ki shift" (P1; tokens ready now)
| Token | Hex |
|---|---|
| `--paper` | `#14110D` |
| `--card` | `#1F1B16` |
| `--ink` | `#F6F2E9` |
| `--ink-2` | `#CFC6B8` |
| `--ink-3` | `#A39A8C` |
| `--haldi` | `#FFC61A` |
| `--lal` | `#FF8A7A` |
| `--hara` | `#6FD39B` |
| `--neel` | `#9DB4FF` |

### Measured contrast (WCAG ratio)
| Pair | Ratio |
|---|---|
| ink on paper / card | 16.7 / 18.7 |
| ink-2 on paper | 9.2 |
| ink-3 on paper | 5.3 (hints only) |
| lal on paper / card | 7.9 / 8.8 |
| hara on paper / card | 7.9 / 8.9 (6.9 on cement: never put hara text on cement) |
| lal on cement / ink-3 on cement | 6.9 / 4.6 (never put lal or ink-3 text on cement; unanswered chips sit on card, R13) |
| neel on paper | 9.3 |
| ink on haldi (button text) | 11.9 |
| white on lal | 8.8 |
| haldi on paper | 1.4 (**never use haldi as text on light**) |
| dark: chalk / haldi / hara on night | 16.9 / 12.0 / 10.3 |

### Rules
- Meaning is never carried by colour alone: every state has an icon and a word.
- Green means money saved. Red means attention or the strike. Yellow means "your action" or "the winner".
- No gradients, no glass, no purple, no neon, no soft drop shadows.
- Painted shadows on paper are **ink**. Haldi shadows appear only on ink or night surfaces; the wordmark is the one exception (its ink letters carry legibility).

### Dark theme additions (P1)
`--cement #2A251E` · `--rule #3A332A` · `--paint-shadow #7A5A00` (light: `#15120E`) · `--on-lal #14110D` (light: `#FFFFFF`). Dark follows the OS inside `/app` only; the landing page stays paper with ink "night bands".

## 6. Typography

| Role | Family | Notes |
|---|---|---|
| Display (wordmark, hero prices, screen titles) | **Anek Devanagari** (variable: weight and width) | Covers Devanagari and Latin. Hero numbers use the digits-only Anek 800 files at width 125, 112 and 100 (D3, D4); everything else uses Anek 700 at normal width. No other widths are generated. |
| UI and body | **Mukta** | Same foundry family feel (Ek Type), Devanagari plus Latin, sturdy at small sizes. |
| Ledger numerals (tables, parchi lines, timers) | **IBM Plex Mono** | Tabular by design, gives the ledger look. |

**Loading (D3): static subset files via `next/font/local`, never the full variable font.** Anek's variable Devanagari file alone is about 726 KB.
- `scripts/fonts.py` (run once, commit the output to `app/fonts/`):
  1. `fonttools varLib.instancer` on the variable font from the google/fonts repo.
  2. `pyftsubset --unicodes=U+0900-097F,U+0020-007E,U+00A0,U+00B7,U+00D7,U+200C-200D,U+2013-2014,U+2018-201D,U+2026,U+2190-2193,U+2212,U+20B9,U+25CC --layout-features='*' --no-hinting --flavor=woff2` (the extra ranges cover · × – — quotes … arrows −, used by the copy deck; R13). Check marks and crosses are Phosphor icons, not glyphs.
- Files: Anek 700 at normal width (about 100 KB), Mukta 400 (about 64 KB) and 600 (about 68 KB), Plex Mono 500/600 Latin plus ₹. **Anek 800 Expanded digits-only** (`0-9 ₹ , .` with `tnum`, about 3 KB) is cut from the Latin or full font, because Google's Devanagari file has no `tnum`.
- The wordmark is an **SVG**, not live text.
- Preload only Mukta 400 and the digits file; everything else uses `display: swap`. **Budget: ≤ 250 KB of font files requested on the first render of `/app`** (measured in Playwright), with every generated file's size reported (R13). If it is over, drop Plex Mono 600 first.
- Verify with a Playwright screenshot of conjuncts (श्री, पक्का, क्ष, त्र, ज्ञ, र्क).
- Hindi titles (`:lang(hi)`) use line-height 1.4 at least (Anek's ascent plus descent is about 1.7 em).

### Scale (mobile; rem at 16 px)
| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `price-hero` | 44 / 48 | Anek 800, Expanded | Winner landed total |
| `title-1` | 28 / 36 | Anek 700 | Screen titles |
| `title-2` | 22 / 30 | Anek 700 | Card titles, dealer names |
| `body-lg` | 19 / 30 | Mukta 400 | Read-backs, key sentences |
| `body` | 17 / 27 | Mukta 400 | Default text (never smaller for instructions) |
| `label` | 15 / 22 | Mukta 600 | Chips, buttons, table headers |
| `meta` | 14 / 20 | Mukta 400 | Timestamps, hints (ink-2 or ink-3) |
| `ledger` | 16 / 24 | Plex Mono 500 | Rates, totals in tables |

Desktop (≥1024 px): `price-hero` 56/60, `title-1` 32/40, `title-2` 24/32; body stays 17.
**Money never wraps (D4):** `price-hero` steps width 125 → 112 → 100, then size 44 → 36 until it fits its box. Test with ₹12,40,500 at 360 px.

### Devanagari rules
- Line-height at least 1.5 for Devanagari body (matras need room). The values above already do this.
- No letter-spacing on Devanagari. No all-caps anywhere (Latin labels stay sentence case).
- Do not fake bold; load real weights.
- Numbers always in Western digits (0 to 9) with Indian grouping: `₹2,00,610`. Speech says "do lakh chhe sau das".

## 7. Space, shape and depth
- Spacing scale (px): 4, 8, 12, 16, 20, 24, 32, 40, 56, 72. Screen side padding 16 px (20 px at 400 px and up).
- **Radius (D2):** chips, buttons and cards 12 px; the parchi 4 px (with a perforated zig-zag bottom); sheets 20 px top corners; the mic is a circle.
- **Depth:** borders, not shadows. Cards get a 1 px `--rule` border. The only shadow is the **painted shadow**, a hard offset with 0 blur: `--paint-sm 2px 2px 0`, `--paint 3px 3px 0`, `--paint-lg 5px 5px 0`, in ink on paper. It is used on the mic, primary buttons, the best-price ribbon and the winner parchi. The wordmark uses a 0.08em haldi offset.
- Pressed: the painted shadow collapses and the element moves 2 px down-right ("presses into paper").
- Ledger texture: lists use 1 px `--rule` horizontal lines like a ruled notebook.
- Lint-ban shadcn defaults that fight this look: `shadow-sm/md/lg/xl/2xl`, `rounded-md`, `ring-offset-*` (our own painted-shadow tokens stay allowed). Focus rings use `outline` + `outline-offset`, not `ring-offset-*`.

## 8. Icons
Phosphor Icons, **Bold** weight (Fill for active states). Sizes 24 px standard, 28 px in primary buttons, 40 px in the mic. Never use the "AI sparkle" cliché. The mic is a simple modern capsule mic, not a 1950s studio mic.

## 9. Motion

### Tokens
| Token | Value |
|---|---|
| `fast` | 150 ms ease-out |
| `base` | 240 ms cubic-bezier(0.2, 0.8, 0.2, 1) |
| `stamp` | spring, stiffness 500, damping 28 |
| `slow` | 400 ms (sheets) |

### Signature motions (each must mean something)
1. **Ring** (dealer is being dialled): the phone icon wiggles at 2 Hz, in neel (icon only, D6).
2. **Talk** (call in progress): in sim only, a 5-bar waveform (CSS bars, no canvas) and captions sliding up line by line; in live, the status word, elapsed timer and `SlotChecklist` only (D7).
3. **Stamp** (quote received): the landed total drops in from 1.15× scale to 1× with the stamp spring, a faint ink ring "thappa" behind it, plus a soft thud sound and a short vibration.
4. **Strike** (price dropped in haggle): a lal hand-drawn line animates across the old number left to right over 300 ms (SVG path draw), then the new number writes in below with the stamp.
5. **Tally** (savings counter): a 600 ms per-digit odometer to the saving, in the price-hero digits.
6. **Ledger-in** (lists): rows enter top to bottom with a 40 ms stagger, 8 px rise.
7. **Winner**: the best row gets a haldi highlighter swipe behind its total (like a marker), once.

Rules (D6): stamps play at least 250 ms apart (so earcons never collide); Ring wiggles the icon only; Strike picks one of 3 seeded path variants; Tally is a 600 ms per-digit odometer. Route changes and the row → call-detail expansion use React `<ViewTransition>` (F7).

### Reduced motion
With `prefers-reduced-motion: reduce`, replace movement with instant state changes plus a 120 ms opacity fade. Keep the strike as a static line. No looping animation except the mic level meter.

## 10. Sound and haptics
- Generate earcons with Web Audio (no audio files): mic open "tik" (short high click), mic close "tok" (lower), quote stamped "thap" (soft low thud), winner "ching" (two quick bright notes). All under 200 ms, volume modest, a global sound toggle in settings.
- Haptics with `navigator.vibrate` on Android only: 15 ms on mic open and close, 30 ms on stamp, 15-40-15 pattern on winner. **iOS blocks the Vibration API in every browser**, so haptics are a bonus, never the only signal: every haptic event also has a visual change and an earcon.
- Browsers only allow audio after a user gesture. Create or resume the `AudioContext` inside the first tap (the first mic press), and auto-play the spoken summary only if the user has already tapped in this session; otherwise show a large play button.

- The "tik" earcon and the red ring start on MediaRecorder `start`, never on touch, so the first words aren't clipped (V2). Resume the AudioContext on onboarding taps.

## 11. Components

| Component | Key states and rules |
|---|---|
| `MicButton` | 88 px haldi circle, ink mic icon, painted ink shadow. **Both gestures always work (V1):** a tap (<300 ms) starts and auto-locks (visible send button and a 56 px "रद्द"); a hold (≥300 ms) is push-to-talk (slide left 80 px cancels, slide up 100 px locks). Locked mode auto-sends after 3 s of silence once speech started, and stops after 5 s with no speech. The mic is released when the app goes to the background. 25 s cap with a countdown from 20 s. Plumbing (F4): `touch-action: none`, `-webkit-touch-callout: none`, `setPointerCapture`, handle `pointercancel`. States: idle, pressed, recording, locked, processing, disabled. |
| `ListeningSheet` | Bottom sheet over the screen while recording: big timer, live level bars, "Sun rahe hain…", cancel hint, then transcript text appears when ready. |
| `TranscriptCard` | Shows exactly what was heard, with a "Theek kijiye" (fix) action that re-opens the mic or a text field. |
| `ItemCard` | One order line: material icon, label ("TMT 12mm Fe500D"), quantity in ledger font, chips for each attribute. Missing attribute shows a lal-outlined chip "Grade?" that opens a choice sheet. |
| `Chip` | 56 px tall minimum, 16 px horizontal padding, radius 12. Selected: ink fill, paper text, `aria-pressed`. Unanswered required choice: 2 px dashed lal border, lal text, ending in "?". |
| `PrimaryButton` | Full width, 64 px, haldi fill, ink label, painted ink shadow, Phosphor icon left. Pressed: shadow collapses (button "presses into paper"). |
| `SecondaryButton` | 56 px, card fill, 1.5 px ink border. |
| `DealerRow` | Avatar with initials, dealer name, area (no distance until P1, R13), regular-dealer badge ("आपके dealer"). Body shows the state: ringing (icon wiggle), talking (status word, elapsed timer in Plex Mono, `SlotChecklist`; plus a caption labelled DEMO **in sim only**), quoted (area line, total stamped), haggling, match call, final, no answer, busy, callback, declined, "आख़िर में match का मौका" (held regular dealer), not comparable ("जाँच बाकी"). Landed total on the right; dropped prices use `PriceStrike`. Tap to open `CallDetail`. 72 px rows on phone, 72 px on desk with the latest line as line 2. |
| `StatusPill` | Icon + word, never colour alone. Ringing (neel), talking (neel; waveform in sim only), quoted (ink), best (haldi fill, ink text), no answer (ink-3), declined (lal text). |
| `SlotChecklist` | Four small chips: रेट · GST · भाड़ा · उधार. ✓ when known. Live mode fills it from `report_quote` (provisional) and then from extraction. Both modes. |
| `StopAllButton` | "सब कॉल रोकिए", secondary with a lal border, on the sweep while calls run. Stops queued and in-progress calls and shows what we have. |
| `TierChips` | Steel, shown on Confirm when the tier wasn't spoken: "कौन सा सरिया?" [ब्रांडेड] [लोकल ISI] ("दोनों" is P1, R10). Cement: [नामी कंपनी] [कोई भी], pre-selected from the last choice or कोई भी (R8). Remembered per contractor, and included in the read-back. |
| `BestSoFarRibbon` | Sticky top strip on the sweep board: "Abhi tak sabse sasta: ₹2,00,610 · Agarwal Traders". Updates with a stamp. |
| `PriceStrike` | Old number with animated lal strike, new number stamped below, "₹1,350 कम हुआ" in hara. |
| `Parchi` | The result receipt. White card, 2 px ink border, radius 4, perforated bottom, painted ink shadow. Shows the dealer name, landed total (`price-hero`), item lines with tier and rate, GST, delivery, unloading, chips for delivery time, credit days, bill and weighing, and validity. In sim or sandbox: a "DEMO · काल्पनिक dealers" watermark. |
| `ComparisonTable` | Rows = dealers, columns = landed total, rate per unit, GST, delivery, credit, ETA. Winner row highlighted. On mobile, horizontally scrollable with the dealer name column frozen. |
| `CallDetail` | Recording player (big play button, scrubber), transcript with speaker labels, extracted fields with "check kijiye" flags. |
| `ModeBadge` | "DEMO" (cement fill) in sim mode on every screen and dealer; "LIVE" (lal outline) in live mode. |
| `PresenterConsole` | Desktop only: event log, pipeline lights (Mic → STT → Samjha → Calls → Rates → Molbhav → Match → Result), call cost meter in live mode. |

## 12. Screens

All screens are designed at 360 × 780 first, then checked at 412 px. Presenter view at 1280 px and up. Dealer names and amounts in these wireframes are placeholders, not market data.

### 12.1 Onboarding (max 3 steps)
1. Language: two huge buttons "हिंदी" and "English" (each 120 px tall).
2. Name (letters only) and phone, spoken or typed, plus a short privacy notice and consent checkbox (S4). Sim mode works at once; live mode needs in-person verification by the team (S1).
3. First site: "Site kahan hai?" Speak or pick an area; speech is matched to the city's area list and confirmed with a chip, never stored as free text (R7). Then a mic permission primer card before the browser prompt: "Bolke order dene ke liye mic chahiye. Hum sirf tab sunte hain jab aap button dabate hain."

### 12.2 Home
```
┌──────────────────────────────┐
│ मोलभाव            DEMO  ⚙︎     │
│ Namaste Ramesh ji            │
│                              │
│ Aaj kya mangwana hai?        │  title-1
│                              │
│ ┌ Try boliye ───────────────┐│
│ │ "2 ton 12mm sariya aur     ││  tap to hear an example
│ │  150 bori PPC, kal tak"    ││
│ └───────────────────────────┘│
│                              │
│ Pichhle order                │
│ ─────────────────────────────│
│ 12 Nov · Mansarovar  ₹1,96,200│
│ ─────────────────────────────│
│                              │
│            ( 🎙 )            │  88 px haldi mic, bottom centre
│ Dabaiye aur boliye · Likh ke ⌨│
└──────────────────────────────┘
```
An active sweep shows a banner above the mic: "Molbhav chal raha hai · 3/4 rate mile" (tap to open the board).

### 12.3 Confirm order ("Ye sahi hai?")
```
┌──────────────────────────────┐
│ ← Ye sahi hai?               │
│ "Kal subah tak 2 ton 12mm…"  │  transcript, Theek kijiye
│ ┌──────────────────────────┐ │
│ │ ▤ TMT sariya        2 ton│ │
│ │ [12mm] [Fe500D]          │ │
│ │ कौन सा सरिया?             │ │
│ │ [ब्रांडेड] [लोकल ISI]        │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ ▥ PPC cement     150 bori│ │
│ │ [PPC] [Koi bhi brand]    │ │
│ └──────────────────────────┘ │
│ 📍 Mansarovar site  ⏰ Kal subah│
│ 💳 15 din udhaar             │
│                              │
│ [▶ Suniye]  (spoken summary) │
│ ┌──────────────────────────┐ │
│ │ Haan, molbhav shuru kijiye│ │  PrimaryButton
│ └──────────────────────────┘ │
│        Badlav boliye 🎙       │
└──────────────────────────────┘
```

Tier: if the steel tier wasn't spoken, `TierChips` appear inside the item card (one tap or one spoken word: "ब्रांडेड", "लोकल"); if "दोनों" was said, the same chips ask which tier to bargain for (R10). Cement shows its tier pre-selected (R8); `design/reference/Confirm.html` still shows unanswered cement chips, and this spec wins. "Suta" sizes are never mapped: ask with [12mm] [16mm] chips (P7). Confirm is blocked until every item has quantity, unit and tier.

### 12.4 Choose dealers
Dealers in the site's city, same area first (no distances until P1). The contractor's dealer book (`saved`) is on by default, 4 to 6 (R13). The regular dealer is pinned at the top with the "आपके dealer" badge and the line **"आख़िर में match का मौका"**; a toggle "पहले भी पूछिए" switches him to a normal quote call (remembered per dealer, P1). Footer: "{n} dealers को call करेंगे · हर call में बताएँगे कि ये AI है". Primary: "Call शुरू कीजिए". Live mode shows a lal-outlined "LIVE" note ("असली calls जाएँगी") and lists only opted-in or test_ok dealers.

### 12.5 Sweep board (hero screen)
Shown in sim mode; see `design/reference/Sweep.html` for the animated version.
```
┌──────────────────────────────┐
│ मोलभाव चल रहा है  फिर से DEMO│
│ ███████░░░  3/4 रेट मिले     │
│ ┌ अभी तक सबसे सस्ता ────────┐│  BestSoFarRibbon (ink painted shadow)
│ │ अग्रवाल ट्रेडर्स  ₹2,00,610 ││
│ └───────────────────────────┘│
│ (अग) अग्रवाल ट्रेडर्स  ₹2,00,610│ quoted: area line, stamped total
│ (ओसा) ओम साई  ☎ बात · 0:38   │ talking: status + timer
│   [✓रेट][✓GST][✓भाड़ा][·उधार] │ SlotChecklist (both modes)
│   DEMO “सड़सठ हज़ार टन, GST…”  │ caption: sim only
│ (श्बा) श्री बालाजी [आपके dealer]│
│   आख़िर में match का मौका     │ held for the match call
│ (रा) राठौड़ ₹2,02,960 GST चेक │ not comparable, can't be cited
│ (गु) गुप्ता  ✕ उठाया नहीं      │ no answer
│ [सब कॉल रोकिए] [नतीजा आते ही…]│
└──────────────────────────────┘
```

**Live honesty (D7):** live mode never shows captions or fake waveforms; each row shows status, elapsed timer and `SlotChecklist`. After a call completes, 2–3 transcript lines type in over 1.5 s, then the total stamps. A time estimate and "नतीजा आते ही बताएँगे · फ़ोन रख सकते हैं" sit in the footer, next to `StopAllButton`.

### 12.6 Haggle round and match call
- **Haggle:** the banner swaps to "मोलभाव राउंड"; the two finalists lift to the top; drops play `PriceStrike`. A small line: "सिर्फ असली रेट बताया, नाम नहीं".
- **Match call:** then "आपके dealer को मौका": the regular dealer's row calls, and his first rate and any drop are shown.

### 12.7 Result
1. The winner's `Parchi`.
2. The saving: "₹X कम · आपके dealer के पहले रेट (₹Y) से", or "बीच वाले रेट से" when there is no regular dealer quote.
3. If the regular dealer dropped: a card "श्री बालाजी (आपके dealer) ने भी ₹Z कम किया · ₹T · 15 दिन उधार · ₹D ज़्यादा" with a secondary "उन्हीं से लीजिए".
4. The comparison table (comparable quotes only), then a line "जाँच बाकी, जीत नहीं सकता: …" for non-comparable quotes.
5. Recordings.

Special states: "आपके dealer ही सबसे सस्ते" (hara check, no tally) and "सिर्फ 1 रेट मिला" (honest, no comparison).

Primary "{dealer} को confirm कीजिए" (by tap or voice; see §13 voice commands). Secondary "WhatsApp पे भेजिए" opens the share-mode sheet (§21).

### 12.8 Placing and placed
Placing the order is the one irreversible action, so it has an undo window before the confirm call dials (`UNDO_WINDOW_SEC`: 120 s normally, 5 s in demo pace).
1. **Confirming:** "dealer से पक्का कर रहे हैं" with a countdown and a large "रद्द करना है?" (cancel) button. Then the confirm call runs, shown as a single DealerRow.
2. **Placed:** big hara check, "ऑर्डर पक्का", dealer confirmation recording link, delivery time, "Parchi share kijiye".

### 12.9 Presenter view (desktop, `/present`)
Left: the real app in an iframe (`/app?embed=1`, demo contractor, sim) inside a simple device frame. Right: the pipeline strip (Mic → STT → Samjha → Calls → Rates → Molbhav → Match → Result), lighting up from that session's order state; the event log (Plex Mono, newest first); stats (time to first quote, saving vs his dealer's first rate, live call cost for admins); and "Reset demo" (admin, demo rows only).

## 13. Voice interaction spec

### Mic state machine
`idle → arming (permission) → recording (hold | locked) → (cancelled) → sending → transcribing (transcript streams in) → parsing → ready | error`
- Every step has a visible state; earcons on open and close.
- The cap is 25 s (15 s in the sandbox); the countdown shows from 20 s.
- No auto-stop on short pauses while holding. Locked mode follows V1's silence rules.
- After release: "समझ रहे हैं…" within 100 ms; the transcript streams in at about 1.5 s; Confirm at about 2.5 s (F3).

### Read-back rules (V3)
- At most **3 sentences or 10 s**. Order: what, how much (with tier), then site and deadline **only if they differ from the defaults**, then credit.
- It ends with a statement, because the mic is closed: "सही हो तो शुरू कीजिए।"
- Example: "दो टन बारह mm लोकल ISI सरिया Fe500D, और डेढ़ सौ बोरी PPC। पंद्रह दिन उधार। सही हो तो शुरू कीजिए।"
- Money is spoken in lakh and hazaar, exactly, never digit by digit.
- Always interruptible. Mute persists; the spoken result can be off in public (V7).

### Voice commands (V4)
- A local grammar in `lib/commands.ts` matches confirm, cancel and edit. **The LLM is never used for commands.**
- **Any negation** (मत, नहीं, ना, रुकिए, बाद में, abhi nahi) means no action and shows buttons instead.
- "रद्द" or "cancel" during the undo window cancels.
- Examples:
  - "हाँ, शुरू कीजिए" starts.
  - "अग्रवाल को confirm करो" confirms Agarwal.
  - "अभी confirm मत करो" does nothing.
  - "हाँ… रुकिए" does nothing.

### Desktop push-to-talk (V6)
- Hold Space (150 ms threshold) only when focus is on the page body or the voice dock.
- Ignored in text fields and on buttons, and on `e.repeat` and `isComposing` (Hindi keyboards commit text on Space).
- Disabled on screens with a confirm or place action.
- Stops on blur or `visibilitychange`; calls `preventDefault` so the page doesn't scroll.
- ⌘K (Ctrl+K) opens the typed composer. A setting turns single-key shortcuts off (WCAG 2.1.4).

### Errors (never blame the user, V5)
| Case | Copy (hi) | Copy (en) |
|---|---|---|
| No input level | "Mic से आवाज़ नहीं आ रही। फिर से बोलिए, या लिख दीजिए।" | "No sound from the mic. Try again or type it." |
| Noise | "यहाँ शोर ज़्यादा है। फ़ोन मुँह के पास लाइए।" | "It's noisy here. Hold the phone closer." |
| Partly understood | "पूरा समझ नहीं आया। जो समझा वो नीचे है, ठीक कर दीजिए।" | "We didn't catch all of it. Here's what we got; fix anything that's off." |
| Second failure | "कोई बात नहीं, नीचे से चुन लीजिए।" (chips first) | "No problem, pick from below." |
| Network | "नेटवर्क कमज़ोर है। order save है, हम फिर कोशिश कर रहे हैं।" | "Weak network. Your order is saved; retrying." |
| Mic blocked | "Mic की permission बंद है। Settings में चालू कीजिए, या लिख के बताइए।" | "Mic permission is off. Turn it on in settings, or type instead." |

## 14. Copy deck (key strings)

Always the respectful "aap" form; no gendered first-person verbs; the app speaks as "हम". The `status.*` keys cover both `calls.status` and `calls.outcome` (R4): a row shows its outcome when set, else its status. The keys added for R15 and R18 need the native speaker's review. A cancelled call shows its `dial.*` reason under the status (`lib/i18n/reasons.ts` maps each `cancelReason` code to one of these; setup and consent reasons share one message, R18). The founders-only `admin.*` keys are not listed here. English material words (TMT, PPC, GST, ISI, mm, ton) stay in Latin script inside Hindi text.

| Key | हिंदी | English |
|---|---|---|
| `brand.tagline` | आप बोलिए। मोलभाव हम करेंगे। | You say it. We bargain. |
| `home.title` | आज क्या मंगवाना है? | What do you need today? |
| `home.micHint` | दबाइए और बोलिए | Press and speak |
| `home.typeInstead` | लिख के बताइए | Type instead |
| `listen.listening` | सुन रहे हैं… | Listening… |
| `listen.holdRelease` | छोड़िए तो भेज देंगे | Release to send |
| `listen.lockedSend` | भेजने के लिए दबाइए | Tap to send |
| `listen.cancel` | रद्द | Cancel |
| `listen.cancelHint` | ← रद्द करने के लिए खिसकाइए | ← Slide to cancel |
| `listen.processing` | समझ रहे हैं… | Understanding… |
| `confirm.title` | ये सही है? | Is this right? |
| `confirm.fix` | ठीक कीजिए | Fix |
| `confirm.tierSteel` | कौन सा सरिया? | Which steel? |
| `tier.branded` | ब्रांडेड | Branded |
| `tier.localIsi` | लोकल ISI | Local ISI |
| `tier.both` | दोनों का रेट | Both (P1, R10) |
| `tier.cementBranded` | नामी कंपनी | Big brand |
| `tier.any` | कोई भी | Any |
| `confirm.readbackEnd` | सही हो तो शुरू कीजिए। | If that's right, start. |
| `confirm.start` | हाँ, मोलभाव शुरू कीजिए | Yes, start bargaining |
| `dealers.footer` | {n} dealers को call करेंगे · हर call में बताएँगे कि ये AI है | We'll call {n} dealers · every call says it's an AI |
| `dealers.matchLater` | आख़िर में match का मौका | Gets a chance to match at the end |
| `dealers.askFirst` | पहले भी पूछिए | Ask him first too |
| `sweep.title` | मोलभाव चल रहा है | Bargaining in progress |
| `sweep.progress` | {done}/{total} रेट मिले | {done}/{total} quotes in |
| `sweep.best` | अभी तक सबसे सस्ता | Cheapest so far |
| `sweep.stopAll` | सब कॉल रोकिए | Stop all calls |
| `sweep.notify` | नतीजा आते ही बताएँगे · फ़ोन रख सकते हैं | We'll tell you when it's ready · you can put the phone down |
| `slot.rate` / `slot.gst` / `slot.delivery` / `slot.credit` | रेट / GST / भाड़ा / उधार | Rate / GST / Delivery / Credit |
| `status.queued` | लाइन में | Waiting |
| `status.ringing` | घंटी जा रही है | Ringing |
| `status.talking` | बात चल रही है | Talking |
| `status.haggling` | मोलभाव | Bargaining |
| `status.matchCall` | match कॉल | Match call |
| `status.quoted` | रेट मिला | Quoted |
| `status.final` | आखिरी रेट | Final price |
| `status.noAnswer` | उठाया नहीं | No answer |
| `status.busy` | लाइन व्यस्त | Line busy |
| `status.callback` | बाद में | Call back later |
| `status.declined` | माल नहीं है | Can't supply |
| `status.noQuote` | रेट नहीं मिला | No quote |
| `status.failed` | कॉल नहीं लगी | Call failed |
| `status.notComparable` | जाँच बाकी | Needs checking |
| `status.cancelled` | रोक दी | Stopped |
| `status.optedOut` | आगे कॉल नहीं | No more calls |
| `status.disclosureFailed` | रेट नहीं गिना गया | Quote not counted |
| `dial.liveOff` | अभी असली कॉल बंद हैं | Live calls are off right now |
| `dial.notVerified` | असली कॉल के लिए टीम से मिलकर पहचान ज़रूरी है | Live calls need an in-person check by our team |
| `dial.dailyCap` | आज की असली कॉल पूरी हो गईं | Today's live calls are used up |
| `dial.dealerUnavailable` | इस dealer को अभी असली कॉल नहीं जा सकती | Live calls can't go to this dealer yet |
| `dial.dealerRested` | इस dealer को आज और कॉल नहीं करेंगे | No more calls to this dealer today |
| `dial.callHours` | अभी कॉल का समय नहीं है | Not calling hours right now |
| `dial.orderCap` | इस ऑर्डर की कॉल पूरी हो गईं | This order has used all its calls |
| `dial.queueTimeout` | समय पर लाइन नहीं मिली | No free line in time |
| `dial.roundClosed` | ज़रूरत नहीं पड़ी | Not needed any more |
| `haggle.skipped` | मोलभाव के लिए 2 पक्के रेट चाहिए | Bargaining needs 2 confirmed quotes |
| `placed.notReached` | dealer से बात नहीं हो पाई | Couldn't reach the dealer |
| `haggle.title` | मोलभाव राउंड | Bargaining round |
| `haggle.honest` | सिर्फ असली रेट बताया, नाम नहीं | Only real quotes shared, never names |
| `match.title` | आपके dealer को मौका | Your dealer's chance |
| `result.title` | सबसे सस्ता | Cheapest |
| `result.savedVsFirst` | ₹{x} कम · आपके dealer के पहले रेट (₹{y}) से | ₹{x} less than your dealer's first rate (₹{y}) |
| `result.savedVsMedian` | ₹{x} कम · बीच वाले रेट से | ₹{x} less than the middle quote |
| `result.regularDropped` | {dealer} (आपके dealer) ने भी ₹{z} कम किया | {dealer} (your dealer) also came down ₹{z} |
| `result.chooseRegular` | उन्हीं से लीजिए | Buy from him |
| `result.regularCheapest` | आपके dealer ही सबसे सस्ते | Your dealer is the cheapest |
| `result.onlyOne` | सिर्फ 1 रेट मिला | Only one quote came in |
| `result.notComparable` | जाँच बाकी, जीत नहीं सकता | Needs checking; can't win |
| `result.confirm` | {dealer} को confirm कीजिए | Confirm {dealer} |
| `result.share` | WhatsApp पे भेजिए | Send on WhatsApp |
| `result.listen` | रिकॉर्डिंग सुनिए | Play recording |
| `share.full` / `share.savings` / `share.munshi` | पूरी पर्ची / सिर्फ बचत / मुंशी के लिए | Full parchi / Savings only / For the munshi |
| `placed.confirming` | dealer से पक्का कर रहे हैं | Confirming with the dealer |
| `placed.undo` | रद्द करना है? | Cancel? |
| `placed.title` | ऑर्डर पक्का | Order confirmed |
| `placed.termsChanged` | dealer ने शर्तें बदलीं · अगला सबसे सस्ता देखिए | The dealer changed terms · see the next cheapest |
| `badge.regular` | आपके dealer | Your dealer |
| `badge.demo` | DEMO | DEMO |
| `demo.watermark` | DEMO · काल्पनिक dealers | DEMO · fictional dealers |
| `flag.checkGst` | GST चेक कीजिए | Check GST |
| `flag.check` | चेक कीजिए | Check this |
| `try.end` | अपने असली dealers का रेट चाहिए? | Want rates from your real dealers? |
| `landing.cta` | खुद बोलके देखिए | Try it with your voice |
| `landing.pilot` | जयपुर पायलट: हमारी टीम आपके लिए dealers को कॉल करती है | Jaipur pilot: our team calls dealers for you |

Hindi copy must be reviewed by a native speaker on the team before any public launch.

## 15. Accessibility and performance checklist
- [ ] Targets: 56 px minimum, mic 88 px, primary button 64 px
- [ ] Prices and primary text 7:1 or better; no text under 14 px; instructions at 17 px or more
- [ ] Every state has icon plus word
- [ ] Works one-handed: primary actions in the bottom 40%
- [ ] Screen reader labels in the active language; live regions announce "rate mila" and the winner
- [ ] `prefers-reduced-motion` respected
- [ ] Landmarks and focus order sane; visible focus ring (2 px ink `outline`, `outline-offset: 2px`)
- [ ] Initial JS on home under 200 KB gzipped; Lighthouse mobile performance 90 or more on home
- [ ] Fonts subset to latin and devanagari; no layout shift on font swap
- [ ] Works on a mid-range Android in Chrome with network throttled to Fast 3G
- [ ] Test outdoors at noon with brightness on auto before calling the design done

## 16. Anti-patterns (do not ship)
- Purple or blue gradients, glassmorphism, neon, blurred blobs, 3D renders
- Grey-on-grey "aesthetic" text, thin font weights, all-caps labels
- A chat-bubble UI as the main surface (this is an agent that does work, not a chatbot)
- AI sparkle icons, robot mascots, emoji as UI
- Fake urgency or countdowns, dark patterns around confirming orders
- Truck-art pastiche everywhere (it is seasoning, not the meal)
- Machine-translated Hindi

## 17. Product surfaces and routes

| Surface | Route | Who | Primary device |
|---|---|---|---|
| Landing | `/` (a returning device with a session goes to `/app`; header shows "App खोलिए") | Visitors, dealers, judges, investors | Both |
| Try-it sandbox | `/try` (linked from the landing page) | Visitors | Both |
| Contractor app | `/app/...` | Contractors, munshis, site owners | Phone first, desktop fully supported |
| Shared parchi | `/p/[publicId]` (`noindex`) | Site owners and family, opened from WhatsApp | Phone |
| Dealer opt-in | `/dealer` (Hindi) | Dealers | Phone |
| Presenter | `/present` | Judges, live demos | Desktop |
| Styleguide | `/styleguide` | Team | Desktop |

## 18. Responsive system

Breakpoints: base under 640 (phone) · `sm` 640 · `md` 768 (tablet) · `lg` 1024 (desk) · `xl` 1280 (desk with side panel) · `2xl` 1536.

| Mode | Width | Layout |
|---|---|---|
| Phone | under 768 | Single column; 56 px top bar; bottom voice dock (mic) of about 120 px including the safe area; sheets come up from the bottom |
| Tablet | 768–1023 | Main column (max 640 px) centred; call detail opens as a right slide-over drawer; mic dock at the bottom |
| Desk | 1024 and up | "Munshi desk" (§19, D5): 72 px icon rail, main column, and a call panel for the selected dealer (an overlay drawer at 1024–1279, docked from 1280; a "Bahi" order list joins from 1536) |

- Desktop type bump (from 1024): `price-hero` 56/60, `title-1` 32/40, `title-2` 24/32. Body stays 17.
- Grid: 4 columns on phone (16 px gutter), 8 on tablet, 12 on desk (24 px gutter). Reading text max 68 characters. Landing content max 1200 px.

## 19. Desktop experience: "Munshi desk" (D5)
- **Layout:**
  - 72 px icon rail (logo mark, New order, Orders with a live dot, Sites, Dealers, Settings).
  - 1024–1279: main column (max 760) plus a 400 px overlay drawer for the selected call.
  - 1280–1535: main plus a **docked** 400 px call panel.
  - ≥1536: a 300 px "Bahi" order list, main (max 840) and a 420 px call panel.
- **Sweep on desktop:** a ledger table. Columns: Dealer (1fr, with the latest line as the row's second line) · Status 144 · Landed 140 (right-aligned, tabular) · Credit 80 · Delivery 104. Rows are 72 px. Clicking a row selects it; the panel shows the recording player, the transcript (after the call in live mode) and "What we understood", marked "read back and confirmed" when true.
- **Voice dock:** at the bottom of the main column, a 64 px mic plus a typed composer ("New order: speak or type"). Hold Space to talk and ⌘K to type (§13).
- **Hover and focus:** rows get a paper background on hover; nothing is hover-only. Focus ring: 2 px ink `outline` with `outline-offset: 2px`.
- **Keyboard:** ↑/↓ move between rows, P plays or pauses, Esc closes, ? lists shortcuts (all can be turned off).

## 20. Touch and feel
**Phone**
- Press feedback within one frame: scale 0.97, and painted shadows collapse. Hover styles only inside `@media (hover: hover)`. Use `touch-action: manipulation` on ordinary controls, and `none` on the mic (F4).
- Haptics on Android only (iOS blocks the Vibration API); every haptic has a visual change and an earcon.
- Recorder: probe `audio/webm;codecs=opus` → `audio/webm` → `audio/mp4` with `isTypeSupported`; label the Blob with the type actually used; 24 kbps mono; stop the tracks after each take.
- Ask for mic permission from the primer card's button, never cold.
- Inputs at 16 px or more (iOS zooms smaller inputs); `inputmode="decimal"` for quantities; viewport `interactiveWidget: "resizes-content"`, and sheets stay above the keyboard.
- `overscroll-behavior: contain` on sheets; sticky headers; no scroll-jacking. Safe areas: `viewportFit: "cover"` with `env(safe-area-inset-*)`.
- Transitions: React `<ViewTransition>` with a 16 px slide plus fade over 200 ms; reduced motion means fades only.
- Loading: ledger skeleton lines, never spinners for lists. Optimistic chip edits.
- Network: a "नेटवर्क कमज़ोर है" banner on reconnect; state lives on the server.
- **PWA:**
  - `app/manifest.ts`: name "Molbhav", short name "मोलभाव", `theme_color` and `background_color` `#F6F2E9`, `display: standalone`, `start_url` and `scope` `/app`, maskable icons at 192 and 512.
  - A minimal `public/sw.js` offline fallback.
  - Offer install only after the first completed order.
- **Dev testing on a real phone only over HTTPS** (a tunnel or a Vercel preview). A LAN `http://` URL blocks the mic.

**Desktop:** §19. **Both:** initial JS on `/app` under 200 KB gzipped; fonts ≤ 250 KB; a `size-limit` gate in CI.

## 21. Showcase built into the product
1. **Landing (`/`), section order (G1):**
   1. Hero: the SVG wordmark, "आप बोलिए। मोलभाव हम करेंगे।" / "You say it. We bargain.", a sub-line, the CTA "खुद बोलके देखिए", and a **live sweep board built from the real components on client-side fixtures**. Desktop: text left, board right. Phone: the board under the headline.
   2. Proof (ink night band): spread-test figures with sample size, plus one real recording made with the dealer's consent. Not rendered until real spread-test figures and a consented recording exist (G1).
   3. How it works: बोलिए → मोलभाव → पक्का.
   4. Honest-bargaining rules, including "your dealer always gets a chance to match".
   5. The sandbox.
   6. For dealers (link to `/dealer`).
   7. Waitlist.

   Until AI calls to real dealers are live, the page says "जयपुर पायलट: हमारी टीम आपके लिए dealers को कॉल करती है" and never claims live AI calls (G2). `design/reference/Landing.html` and `LandingPhone.html` word "How it works" as if AI calls were live ("Molbhav calls nearby dealers at once…"); until Stage 2, write it as what the team does in the pilot, with the AI calling shown as "जल्द" (coming soon).
2. **Sandbox (`/try`, G3):**
   - Sample-order chips first; the mic sits behind a tap, with Vercel BotID checking the request; 15 s cap; the sweep runs on the simulator only.
   - The parchi is watermarked "DEMO · काल्पनिक dealers", with **no savings tally**.
   - It ends with "अपने असली dealers का रेट चाहिए?" and a WhatsApp join.
3. **Shared parchi (`/p/[publicId]`, G4):**
   - Share modes: Full / सिर्फ बचत / मुंशी के लिए.
   - Credits the contractor: "रमेश जी ने ₹X बचाए".
   - Never shows the site, date, phone numbers, recordings or losing dealers' prices. `noindex`; DEMO watermark when from sim.
   - The OG image comes from `/p/[id]/opengraph-image` (`@vercel/og` 1.0.3, static TTFs), and the same PNG is shared via `navigator.share({ files })`.
4. **Waitlist (G5):** name, WhatsApp number, city, role, next order, `ref`, a consent checkbox; WhatsApp click-to-chat as the main path.
5. **Presenter (`/present`):** §12.9.
6. **Demo video:** a screen recording of `/present` at 1440 × 900 plus a phone recording, cut to 60–90 s.

## 22. Sources
- Google, "How to help people navigate the internet, voice-first" (Next Billion Users Voice Playbook): https://blog.google/technology/next-billion-users/voice-users-playbook/
- Designing for the Next Billion Users, Google I/O '17 (summary): https://echai.ventures/startingup/r/designing-for-the-next-billion-users-google-i-o-17--bc-r217
- Khatabook adoption strategy: https://www.markhub24.com/post/khatabook-s-digital-ledger-adoption-strategy-for-small-businesses
- Vyapar (LiveMint via IndiaMART): https://corporate.indiamart.com/2020/07/27/an-app-to-turn-the-khata-digital-for-small-businesses-livemint
- BlackBuck on localisation: https://eng.blackbuck.com/why-humanization-and-localization-of-product-is-critical-in-fueling-digital-inclusion/
- Designing apps for construction workers (contrast, gloves, sunlight): https://thisisglance.com/learning-centre/how-should-i-design-apps-for-construction-workers
- Voice UI status and transcript patterns: https://vp0.com/blogs/google-gemini-live-voice-assistant-ui-template
- WhatsApp-style recorder gestures: https://klibs.io/project/NadeemIqbal/voice-message
- Indian street lettering and truck art in modern design: https://www.brandinginasia.com/tradition-today-tomorrow-more-is-more-exploring-the-essence-of-indian-design/
- Devanagari font guide: https://hindifontstyle-58e.pages.dev/blog/devanagari-fonts-guide
- Devanagari and Latin typesetting: https://www.alphabettes.org/devanagari-typography-101-a-guide-for-typesetting-with-latin/
