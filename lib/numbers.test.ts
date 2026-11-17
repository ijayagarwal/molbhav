import { describe, expect, test } from "vitest";
import type { OrderItem } from "./domain";
import {
  amountSaid,
  candidateAmounts,
  formatINR,
  formatPaise,
  HI_WORDS_0_99,
  hiKey,
  hindiNumberWords,
  hindiQuantity,
  hindiRupees,
  parseNumbers,
  spokenOrder,
} from "./numbers";

const values = (text: string) => parseNumbers(text).map((n) => n.value);

describe("formatINR (hard rule 9)", () => {
  test("Indian grouping, ₹, no decimals for whole rupees", () => {
    expect(formatINR(200610)).toBe("₹2,00,610");
    expect(formatINR(1240500)).toBe("₹12,40,500");
    expect(formatINR(370)).toBe("₹370");
    expect(formatINR(56.5)).toBe("₹56.50");
    expect(formatPaise(19883000)).toBe("₹1,98,830");
  });
});

describe("Hindi number words, number → words", () => {
  test("the 0–99 table is complete", () => {
    expect(HI_WORDS_0_99).toHaveLength(100);
    expect(new Set(HI_WORDS_0_99).size).toBe(100);
  });

  test("exact Indian-scale words for the golden totals", () => {
    expect(hindiNumberWords(200610)).toBe("दो लाख छह सौ दस");
    expect(hindiNumberWords(198830)).toBe("एक लाख अट्ठानवे हज़ार आठ सौ तीस");
    expect(hindiNumberWords(204300)).toBe("दो लाख चार हज़ार तीन सौ");
    expect(hindiNumberWords(66700)).toBe("छियासठ हज़ार सात सौ");
    expect(hindiNumberWords(12400500)).toBe("एक करोड़ चौबीस लाख पाँच सौ");
    expect(hindiNumberWords(0)).toBe("शून्य");
  });

  test("spoken money, exact, with paise (C3)", () => {
    expect(hindiRupees(200610)).toBe("दो लाख छह सौ दस रुपये");
    expect(hindiRupees(56.5)).toBe("छप्पन रुपये पचास पैसे");
    expect(hindiRupees(1)).toBe("एक रुपया");
  });
});

describe("Hindi number words, words → number", () => {
  test("round-trips every number up to 2,10,000 that the golden tests use, and a sweep", () => {
    for (const n of [200610, 200750, 202960, 202735, 198830, 199400, 204300, 200100, 3690, 5470, 4200, 1270, 1780, 140]) {
      expect(values(hindiNumberWords(n))).toEqual([n]);
    }
    for (let n = 0; n <= 100000; n += 997) expect(values(hindiNumberWords(n))).toEqual([n]);
    for (let n = 0; n < 1000; n++) expect(values(hindiNumberWords(n))).toEqual([n]);
  });

  test("the Team test cards' phrases", () => {
    expect(values("सत्तावन रुपये किलो, GST अलग")).toEqual([57]);
    expect(values("तीन सौ सत्तर रुपये बोरी")).toEqual([370]);
    expect(values("सड़सठ हज़ार रुपये टन, GST मिलाके")).toEqual([67000]);
    expect(values("चार सौ पैंतीस रुपये बोरी")).toEqual([435]);
    expect(values("भाड़ा पंद्रह सौ, उतराई शामिल")).toEqual([1500]);
    expect(values("सरिया सत्तावन सौ पचास क्विंटल")).toEqual([5750]);
    expect(values("अड़सठ हज़ार पाँच सौ टन")).toEqual([68500]);
    expect(values("सरिया छप्पन रुपये पचास पैसे कर देंगे")).toEqual([56.5]);
    expect(values("एक लाख निन्यानवे हज़ार चार सौ, सब मिलाके")).toEqual([199400]);
    expect(values("उतराई पाँच सौ पचास")).toEqual([550]);
    expect(values("छियासठ हज़ार सात सौ टन, सीमेंट चार सौ तीस")).toEqual([66700, 430]);
  });

  test("two number words in a row are two numbers; a scale between joins them", () => {
    expect(values("सत्तावन पचास लगेगा")).toEqual([57, 50]);
    expect(values("सत्तावन सौ पचास")).toEqual([5750]);
    expect(values("बीस पच्चीस बोरी")).toEqual([20, 25]);
  });

  test("sava, dedh, dhai, saade, paune", () => {
    expect(values("डेढ़ सौ बोरी")).toEqual([150]);
    expect(values("ढाई सौ कट्टा")).toEqual([250]);
    expect(values("साढ़े पाँच हज़ार")).toEqual([5500]);
    expect(values("सवा दो टन")).toEqual([2.25]);
    expect(values("पौने दो टन")).toEqual([1.75]);
    expect(values("डेढ़ टन")).toEqual([1.5]);
    expect(values("साढ़े छप्पन रुपये")).toEqual([56.5]);
  });

  test("digits, ₹, Indian commas and Devanagari digits", () => {
    expect(values("₹2,00,610 सब मिलाके")).toEqual([200610]);
    expect(values("रेट 57.50 है")).toEqual([57.5]);
    expect(values("५७ रुपये")).toEqual([57]);
    expect(values("370/bag")).toEqual([370]);
  });

  test("Roman Hindi", () => {
    expect(values("do lakh chhe sau das")).toEqual([200610]);
    expect(values("sattavan rupaye kilo")).toEqual([57]);
    expect(values("dedh sau bori")).toEqual([150]);
    expect(values("saadhe paanch hazaar")).toEqual([5500]);
    expect(values("chhiyasath hazar saat sau")).toEqual([66700]);
    expect(values("ek lakh ninyanve hazaar chaar sau")).toEqual([199400]);
  });

  test("spelling variants seen in transcripts", () => {
    expect(values("छः सौ")).toEqual([600]);
    expect(values("पांच सौ")).toEqual([500]);
    expect(values("अडसठ हजार")).toEqual([68000]);
    expect(values("निन्यानबे")).toEqual([99]);
  });
});

describe("amountSaid (C4: rate_not_in_transcript)", () => {
  const card = ["हाँ जी, पूरा माल है।", "सरिया शक्ति TMT, ISI वाला, सत्तावन रुपये किलो, GST अलग।", "सीमेंट PPC, जयपुर गोल्ड, तीन सौ सत्तर रुपये बोरी।"];

  test("finds rates the dealer said, in words or digits", () => {
    expect(amountSaid(57, card)).toBe(true);
    expect(amountSaid(370, card)).toBe(true);
    expect(amountSaid(56.5, ["छप्पन रुपये पचास पैसे"])).toBe(true);
    expect(amountSaid(56.5, ["सरिया 56.50"])).toBe(true);
  });

  test("reads a colloquial rupees-paise pair", () => {
    expect(candidateAmounts("रेट बढ़ गया, सत्तावन पचास लगेगा")).toContain(57.5);
    expect(amountSaid(57.5, ["रेट बढ़ गया, सत्तावन पचास लगेगा"])).toBe(true);
  });

  test("a rate nobody said is not found", () => {
    expect(amountSaid(1, card)).toBe(false); // "rate ek rupaya" can't come from this transcript
    expect(amountSaid(55, card)).toBe(false);
    expect(amountSaid(67, card)).toBe(false);
  });
});

describe("quantities and the spoken order line", () => {
  test("quantities the way contractors say them", () => {
    expect(hindiQuantity(2)).toBe("दो");
    expect(hindiQuantity(150)).toBe("डेढ़ सौ");
    expect(hindiQuantity(1.5)).toBe("डेढ़");
    expect(hindiQuantity(2.5)).toBe("ढाई");
    expect(hindiQuantity(3.5)).toBe("साढ़े तीन");
    expect(hindiQuantity(2.25)).toBe("सवा दो");
    expect(hindiQuantity(1.75)).toBe("पौने दो");
    expect(values(hindiQuantity(2.25))).toEqual([2.25]);
  });

  test("the demo order, built in code (CALL_SCRIPT order_spoken)", () => {
    const items: OrderItem[] = [
      { id: "s", material: "tmt_steel", diameterMm: 12, grade: "Fe500D", tier: "local_isi", quantity: 2, unit: "ton" },
      { id: "c", material: "cement", cementType: "PPC", tier: "any", quantity: 150, unit: "bag" },
    ];
    expect(spokenOrder(items)).toBe("दो टन बारह mm लोकल ISI सरिया Fe500D, और डेढ़ सौ बोरी PPC सीमेंट");
  });

  test("brands and the cement tier", () => {
    const items: OrderItem[] = [
      { id: "s", material: "tmt_steel", diameterMm: 8, tier: "branded", quantity: 1.5, unit: "ton" },
      { id: "c", material: "cement", cementType: "OPC53", tier: "branded", brand: "UltraTech", quantity: 250, unit: "bag" },
      { id: "d", material: "cement", cementType: "PPC", tier: "branded", quantity: 50, unit: "bag" },
    ];
    expect(spokenOrder(items)).toBe(
      "डेढ़ टन आठ mm ब्रांडेड सरिया, ढाई सौ बोरी UltraTech OPC 53 सीमेंट, और पचास बोरी PPC सीमेंट, नामी कंपनी का",
    );
  });
});

describe("review fixes (Phase 3 panel)", () => {
  test("the folded 0–99 keys never collide", () => {
    const seen = new Map<string, number>();
    HI_WORDS_0_99.forEach((w, n) => {
      const k = hiKey(w);
      expect(seen.has(k), `${w} collides with ${seen.get(k)}`).toBe(false);
      seen.set(k, n);
    });
  });

  test("STT spellings and folding", () => {
    expect(values("चार सौ पैतीस")).toEqual([435]);
    expect(values("चार सौ पैतालीस")).toEqual([445]);
    expect(values("सरसठ हज़ार")).toEqual([67000]);
    expect(values("अरसठ हज़ार")).toEqual([68000]);
    expect(values("छियालिस बाइस पचीस")).toEqual([46, 22, 25]);
    expect(values("ग्यारा सौ, पंद्रा सौ")).toEqual([1100, 1500]);
  });

  test("sava/paune before a scale, paav and pauna", () => {
    expect(values("सवा सौ")).toEqual([125]);
    expect(values("सवा लाख")).toEqual([125000]);
    expect(values("पौने सौ")).toEqual([75]);
    expect(values("पाव किलो")).toEqual([0.25]);
    expect(values("पौना टन")).toEqual([0.75]);
  });

  test("a repeated amount stays two numbers", () => {
    expect(values("सत्तावन सौ, सत्तावन सौ")).toEqual([5700, 5700]);
    expect(values("छियासठ हज़ार, छियासठ हज़ार")).toEqual([66000, 66000]);
    expect(values("दो लाख छह सौ दस")).toEqual([200610]);
  });

  test("trade shorthand candidates", () => {
    expect(candidateAmounts("छियासठ सात सौ टन")).toContain(66700);
    expect(candidateAmounts("सत्तावन पचास क्विंटल")).toContain(5750);
    expect(candidateAmounts("सत्तावन पचास लगेगा")).toContain(57.5);
  });

  test("numbers that are not rates are never 'said' (C4)", () => {
    expect(values("पचास पैसे कम कर देंगे")).toEqual([0.5]);
    expect(amountSaid(50, ["पचास पैसे कम कर देंगे"])).toBe(false);
    expect(amountSaid(53, ["OPC 53 है"])).toBe(false);
    expect(amountSaid(53, ["53 ग्रेड वाला"])).toBe(false);
    expect(amountSaid(500, ["Fe 500 है"])).toBe(false);
    expect(amountSaid(12, ["12 mm"])).toBe(false);
    expect(amountSaid(60, ["GST ke saath"])).toBe(false);
    expect(amountSaid(1000, ["sixty seven thousand"])).toBe(false);
    expect(candidateAmounts("so 370 lagega")).toEqual([370]);
    expect(amountSaid(370, ["370 नहीं, 375"])).toBe(false);
    expect(amountSaid(375, ["370 नहीं, 375"])).toBe(true);
    expect(amountSaid(57, ["मेरा नंबर 98290 57 370"])).toBe(false);
    expect(amountSaid(370, ["मेरा नंबर 98290 57 370"])).toBe(false);
  });

  test("Rs. and rs-suffixed digits", () => {
    expect(values("Rs.57")).toEqual([57]);
    expect(values("57rs किलो")).toEqual([57]);
  });

  test("natural speech for small amounts and quantities", () => {
    expect(hindiRupees(0.5)).toBe("पचास पैसे");
    expect(hindiRupees(1.01)).toBe("एक रुपया एक पैसा");
    expect(hindiRupees(1500)).toBe("पंद्रह सौ रुपये");
    expect(hindiNumberWords(1270)).toBe("बारह सौ सत्तर");
    expect(hindiNumberWords(2000)).toBe("दो हज़ार");
    expect(hindiQuantity(1.25)).toBe("सवा");
    expect(hindiQuantity(0.75)).toBe("पौन");
    expect(hindiQuantity(0.25)).toBe("पाव");
  });
});

describe("formatRate (hard rule 9)", () => {
  test("two decimals only when there are paise, Indian grouping", async () => {
    const { formatRate } = await import("./numbers");
    expect(formatRate(56.5)).toBe("₹56.50");
    expect(formatRate(370)).toBe("₹370");
    expect(formatRate(66700)).toBe("₹66,700");
    expect(formatRate(5750.25)).toBe("₹5,750.25");
  });
});

