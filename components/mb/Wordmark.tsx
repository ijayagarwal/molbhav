import { WORDMARK_HI, WORDMARK_LATIN } from "./wordmarkPaths";

// The wordmark (docs/DESIGN.md §4, D2): "मोलभाव" in Anek Devanagari Expanded ExtraBold, drawn as SVG
// (scripts/fonts.py), ink letters with a hard 0.08em down-right haldi offset shadow. The Latin lockup
// "MOLBHAV" is allowed only beside it, never alone in Hindi mode.

interface Props {
  /** Cap height of the letters in px; the SVG scales to it. */
  height?: number;
  /** Show the Latin lockup beside the Devanagari mark. */
  withLatin?: boolean;
  /** Accessible name (the dictionary's brand.name). */
  label: string;
  className?: string;
}

function Mark({ data, height, shadow }: { data: typeof WORDMARK_HI | typeof WORDMARK_LATIN; height: number; shadow: boolean }) {
  const [x, y, w, h] = data.viewBox;
  const off = Math.round(data.unitsPerEm * 0.08);
  const pad = shadow ? off : 0;
  const vb = `${x} ${y} ${w + pad} ${h + pad}`;
  return (
    <svg
      viewBox={vb}
      height={height}
      width={(height * (w + pad)) / (h + pad)}
      className="h-auto min-w-0 max-w-full shrink"
      aria-hidden="true"
      focusable="false"
    >
      {shadow ? <path d={data.d} transform={`translate(${off} ${off})`} className="fill-haldi" /> : null}
      <path d={data.d} className="fill-ink" />
    </svg>
  );
}

export function Wordmark({ height = 32, withLatin = false, label, className }: Props) {
  return (
    <span role="img" aria-label={label} className={`inline-flex max-w-full min-w-0 items-end gap-3 ${className ?? ""}`}>
      <Mark data={WORDMARK_HI} height={height} shadow />
      {withLatin ? <Mark data={WORDMARK_LATIN} height={Math.round(height * 0.62)} shadow={false} /> : null}
    </span>
  );
}
