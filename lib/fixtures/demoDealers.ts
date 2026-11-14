// The fictional DEMO cast (ARCHITECTURE §10): one dealer per simulator persona. The first five are the
// TEAM_TEST cast. Shared by convex/seed.ts, the sim and the styleguide's money shot. All fictional.
import type { PersonaKey } from "../../convex/sim/personas";

export interface DemoDealer {
  key: string;
  name: string;
  nameHi: string;
  area: string; // CITY_AREAS key
  persona: PersonaKey;
  relation?: "saved" | "regular";
}

export const DEMO_DEALERS: readonly DemoDealer[] = [
  { key: "agarwal", name: "Agarwal Steels", nameHi: "अग्रवाल स्टील्स", area: "mansarovar", persona: "perkg_gst_extra", relation: "saved" },
  { key: "omsai", name: "Om Sai Traders", nameHi: "ओम साई ट्रेडर्स", area: "sanganer", persona: "perton_gst_incl", relation: "saved" },
  { key: "rathore", name: "Rathore Building Material", nameHi: "राठौड़ बिल्डिंग मटेरियल", area: "jagatpura", persona: "whatsapp_dodger", relation: "saved" },
  { key: "gupta", name: "Gupta Hardware", nameHi: "गुप्ता हार्डवेयर", area: "mansarovar", persona: "no_answer", relation: "saved" },
  { key: "balaji", name: "Shree Balaji Traders", nameHi: "श्री बालाजी ट्रेडर्स", area: "mansarovar", persona: "regular_match", relation: "regular" },
  { key: "mahaveer", name: "Mahaveer Cement Store", nameHi: "महावीर सीमेंट स्टोर", area: "sanganer", persona: "cement_only" },
  { key: "bajrang", name: "Bajrang Traders", nameHi: "बजरंग ट्रेडर्स", area: "tonk_road", persona: "kachcha_lowball" },
  { key: "krishna", name: "Krishna Building Supply", nameHi: "कृष्णा बिल्डिंग सप्लाई", area: "malviya_nagar", persona: "callback_later" },
  { key: "jain", name: "Jain Steel Centre", nameHi: "जैन स्टील सेंटर", area: "vaishali_nagar", persona: "reprice_at_confirm" },
];
