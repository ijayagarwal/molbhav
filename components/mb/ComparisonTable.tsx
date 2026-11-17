import { formatPaise } from "@/lib/numbers";

// ComparisonTable (DESIGN §11): rows = dealers; columns = landed total, rate per unit, GST, delivery, credit,
// ETA. The winner row is highlighted. On a phone it scrolls sideways with the dealer column frozen.

export interface ComparisonRow {
  id: string;
  name: string;
  badge?: string;
  /** Landed total in paise; null when the quote can't be compared (shown with its flag). */
  totalPaise: number | null;
  flag?: string;
  rate: string;
  gst: string;
  delivery: string;
  credit: string;
  eta: string;
  winner?: boolean;
}

export interface ComparisonLabels {
  caption: string;
  /** The winner's word, so it isn't marked by colour alone ("सबसे सस्ता"). */
  best: string;
  dealer: string;
  total: string;
  rate: string;
  gst: string;
  delivery: string;
  credit: string;
  eta: string;
}

export function ComparisonTable({ rows, labels }: { rows: ComparisonRow[]; labels: ComparisonLabels }) {
  const head = "whitespace-nowrap px-3 py-2 text-left text-label text-ink-2";
  const cell = "whitespace-nowrap px-3 py-3 text-meta";
  return (
    <div className="overflow-x-auto rounded-card border border-rule bg-card [overscroll-behavior-x:contain]">
      <table className="w-full min-w-[640px] border-collapse">
        <caption className="sr-only">{labels.caption}</caption>
        <thead>
          <tr className="border-b border-rule">
            <th scope="col" className={`${head} sticky left-0 z-10 bg-card`}>
              {labels.dealer}
            </th>
            <th scope="col" className={`${head} text-right`}>
              {labels.total}
            </th>
            <th scope="col" className={head}>
              {labels.rate}
            </th>
            <th scope="col" className={head}>
              {labels.gst}
            </th>
            <th scope="col" className={head}>
              {labels.delivery}
            </th>
            <th scope="col" className={head}>
              {labels.credit}
            </th>
            <th scope="col" className={head}>
              {labels.eta}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const bg = r.winner ? "bg-haldi/30" : "bg-card";
            return (
              <tr key={r.id} className={`border-b border-rule last:border-b-0 ${bg}`} aria-current={r.winner ? "true" : undefined}>
                {/* The frozen cell must be opaque: card underneath, the winner's wash on top. */}
                <th scope="row" className="sticky left-0 z-10 max-w-[160px] bg-card px-3 py-3 text-left">
                  {r.winner ? <span aria-hidden="true" className="absolute inset-0 bg-haldi/30" /> : null}
                  <span className="relative block truncate text-label">{r.name}</span>
                  {r.winner ? <span className="relative inline-flex items-center gap-1 text-meta font-ui-semibold">{labels.best}</span> : null}
                  {r.badge ? <span className="relative text-meta text-ink-2">{r.badge}</span> : null}
                </th>
                <td className={`${cell} text-right`}>
                  {r.totalPaise === null ? (
                    <span className="text-label text-lal">{r.flag ?? "—"}</span>
                  ) : (
                    <span className="font-mono text-ledger font-semibold tabular-nums">{formatPaise(r.totalPaise).replace("₹", "")}</span>
                  )}
                </td>
                <td className={cell}>{r.rate}</td>
                <td className={cell}>{r.gst}</td>
                <td className={cell}>{r.delivery}</td>
                <td className={cell}>{r.credit}</td>
                <td className={cell}>{r.eta}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
