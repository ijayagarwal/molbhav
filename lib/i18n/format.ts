/** Fills {name} placeholders: format("₹{x} कम", { x: "5,470" }) → "₹5,470 कम". Unknown placeholders stay visible. */
export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}
