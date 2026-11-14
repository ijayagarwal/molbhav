// Hindi dictionary (default language). Keys from docs/DESIGN.md §14 (copy deck) and §13 (errors, V5).
// Respectful आप form; no gendered first-person verbs; the app speaks as "हम". English material words
// (TMT, PPC, GST, ISI, mm, ton) stay in Latin script. A native speaker reviews this file before launch;
// keys marked R15 were added after the docs review and need that review most.
export const hi = {
  "brand.name": "मोलभाव",
  "brand.tagline": "आप बोलिए। मोलभाव हम करेंगे।",

  "home.title": "आज क्या मंगवाना है?",
  "home.micHint": "दबाइए और बोलिए",
  "home.typeInstead": "लिख के बताइए",

  "listen.listening": "सुन रहे हैं…",
  "listen.holdRelease": "छोड़िए तो भेज देंगे",
  "listen.lockedSend": "भेजने के लिए दबाइए",
  "listen.cancel": "रद्द",
  "listen.cancelHint": "रद्द करने के लिए खिसकाइए",
  "listen.processing": "समझ रहे हैं…",

  "confirm.title": "ये सही है?",
  "confirm.fix": "ठीक कीजिए",
  "confirm.tierSteel": "कौन सा सरिया?",
  "confirm.readbackEnd": "सही हो तो शुरू कीजिए।",
  "confirm.start": "हाँ, मोलभाव शुरू कीजिए",

  "tier.branded": "ब्रांडेड",
  "tier.localIsi": "लोकल ISI",
  "tier.both": "दोनों का रेट",
  "tier.cementBranded": "नामी कंपनी",
  "tier.any": "कोई भी",

  "dealers.footer": "{n} dealers को call करेंगे · हर call में बताएँगे कि ये AI है",
  "dealers.matchLater": "आख़िर में match का मौका",
  "dealers.askFirst": "पहले भी पूछिए",

  "sweep.title": "मोलभाव चल रहा है",
  "sweep.progress": "{done}/{total} रेट मिले",
  "sweep.best": "अभी तक सबसे सस्ता",
  "sweep.stopAll": "सब कॉल रोकिए",
  "sweep.notify": "नतीजा आते ही बताएँगे · फ़ोन रख सकते हैं",

  "slot.rate": "रेट",
  "slot.gst": "GST",
  "slot.delivery": "भाड़ा",
  "slot.credit": "उधार",

  "status.queued": "लाइन में",
  "status.ringing": "घंटी जा रही है",
  "status.talking": "बात चल रही है",
  "status.haggling": "मोलभाव",
  "status.matchCall": "match कॉल",
  "status.quoted": "रेट मिला",
  "status.final": "आखिरी रेट",
  "status.noAnswer": "उठाया नहीं",
  "status.busy": "लाइन व्यस्त",
  "status.callback": "बाद में",
  "status.declined": "माल नहीं है",
  "status.noQuote": "रेट नहीं मिला",
  "status.failed": "कॉल नहीं लगी",
  "status.notComparable": "जाँच बाकी",
  "status.cancelled": "रोक दी",
  "status.optedOut": "आगे कॉल नहीं",
  "status.disclosureFailed": "रेट नहीं गिना गया",

  "haggle.title": "मोलभाव राउंड",
  "haggle.honest": "सिर्फ असली रेट बताया, नाम नहीं",
  "haggle.skipped": "मोलभाव के लिए 2 पक्के रेट चाहिए",

  "match.title": "आपके dealer को मौका",

  "result.title": "सबसे सस्ता",
  "result.savedVsFirst": "₹{x} कम · आपके dealer के पहले रेट (₹{y}) से",
  "result.savedVsMedian": "₹{x} कम · बीच वाले रेट से",
  "result.regularDropped": "{dealer} (आपके dealer) ने भी ₹{z} कम किया",
  "result.chooseRegular": "उन्हीं से लीजिए",
  "result.regularCheapest": "आपके dealer ही सबसे सस्ते",
  "result.onlyOne": "सिर्फ 1 रेट मिला",
  "result.notComparable": "जाँच बाकी, जीत नहीं सकता",
  "result.confirm": "{dealer} को confirm कीजिए",
  "result.share": "WhatsApp पे भेजिए",
  "result.listen": "रिकॉर्डिंग सुनिए",

  "share.full": "पूरी पर्ची",
  "share.savings": "सिर्फ बचत",
  "share.munshi": "मुंशी के लिए",

  "placed.confirming": "dealer से पक्का कर रहे हैं",
  "placed.undo": "रद्द करना है?",
  "placed.title": "ऑर्डर पक्का",
  "placed.termsChanged": "dealer ने शर्तें बदलीं · अगला सबसे सस्ता देखिए",
  "placed.notReached": "dealer से बात नहीं हो पाई",

  "badge.regular": "आपके dealer",
  "badge.demo": "DEMO",
  "demo.watermark": "DEMO · काल्पनिक dealers",

  "flag.checkGst": "GST चेक कीजिए",
  "flag.check": "चेक कीजिए",

  "try.end": "अपने असली dealers का रेट चाहिए?",
  "landing.cta": "खुद बोलके देखिए",
  "landing.pilot": "जयपुर पायलट: हमारी टीम आपके लिए dealers को कॉल करती है",

  "error.noInput": "Mic से आवाज़ नहीं आ रही। फिर से बोलिए, या लिख दीजिए।",
  "error.noise": "यहाँ शोर ज़्यादा है। फ़ोन मुँह के पास लाइए।",
  "error.partial": "पूरा समझ नहीं आया। जो समझा वो नीचे है, ठीक कर दीजिए।",
  "error.second": "कोई बात नहीं, नीचे से चुन लीजिए।",
  "error.network": "नेटवर्क कमज़ोर है। order save है, हम फिर कोशिश कर रहे हैं।",
  "error.micBlocked": "Mic की permission बंद है। Settings में चालू कीजिए, या लिख के बताइए।",

  "placeholder.soon": "ये हिस्सा जल्द आ रहा है।",
  "session.connecting": "जुड़ रहे हैं…",
  "session.ready": "तैयार है।",
  "session.error": "जुड़ नहीं पाए। पेज फिर से खोलिए।",

  "styleguide.title": "स्टाइलगाइड",
  "styleguide.colours": "रंग",
  "styleguide.contrast": "कंट्रास्ट",
  "styleguide.type": "अक्षरों के साइज़",
  "styleguide.shape": "कोने और परछाई",
  "styleguide.wordmark": "नाम",
  "styleguide.money": "पैसे कभी टूटते नहीं",
  "styleguide.sampleHi": "दो टन बारह mm लोकल ISI सरिया, और डेढ़ सौ बोरी PPC",
  "styleguide.sampleEn": "Two ton 12 mm local ISI steel, and 150 bags of PPC",
  "styleguide.pass": "ठीक",
  "styleguide.minimum": "कम से कम {min}:1 · {use}",
} as const;

export type DictKey = keyof typeof hi;
