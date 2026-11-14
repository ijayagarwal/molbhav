// Avatar initials for dealer rows (DESIGN §11): "अग्रवाल स्टील्स" → "अग", "ओम साई" → "ओसा", "राठौड़" → "रा",
// "Agarwal Steels" → "AG", "Om Sai" → "OS". Generic shop words don't count as a second name.
const GENERIC = new Set(["स्टील्स", "स्टील", "ट्रेडर्स", "बिल्डिंग", "मटेरियल", "हार्डवेयर", "स्टोर", "सप्लाई", "सेंटर", "सीमेंट",
  "steels", "steel", "traders", "building", "material", "hardware", "store", "supply", "centre", "center", "cement"]);

function graphemes(s: string): string[] {
  return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s), (g) => g.segment);
}

export function initials(name: string): string {
  const words = name.normalize("NFC").trim().split(/\s+/).filter((w) => !GENERIC.has(w.toLowerCase()) && !/^test$|^·$/i.test(w));
  if (words.length === 0) return "?";
  const devanagari = /[ऀ-ॿ]/.test(words[0]);
  if (!devanagari) {
    const letters = words.length >= 2 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
    return letters.toUpperCase();
  }
  const first = graphemes(words[0]);
  if (words.length >= 2) return [...first[0]][0] + graphemes(words[1])[0];
  // One word: its first syllable, or the first consonant of each of the first two when the first is a bare letter.
  return first.length >= 2 && [...first[0]].length === 1 ? first[0] + [...first[1]][0] : first[0];
}
