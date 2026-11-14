// Hindi dictionary. Phase 1B adds every key from docs/DESIGN.md §14.
// The respectful आप form, no gendered first-person verbs; reviewed by a native speaker before launch.
export const hi = {
  "brand.name": "मोलभाव",
  "brand.tagline": "आप बोलिए। मोलभाव हम करेंगे।",
  "placeholder.soon": "ये हिस्सा जल्द आ रहा है।",
  "session.connecting": "जुड़ रहे हैं…",
  "session.ready": "तैयार है।",
  "session.error": "जुड़ नहीं पाए। पेज फिर से खोलिए।",
} as const;

export type DictKey = keyof typeof hi;
