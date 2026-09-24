"use client";

// Last 30 days of collections: one series, one hue (--credit), a 2px line over a flat tint (no
// gradient), recessive grid, crosshair tooltip. A table view sits under the chart.

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";

type Point = { date: string; paise: number; count: number };

const CREDIT = "#0F7B5F";
const LINE = "#E3E6EC";
const MUTED = "#5B6478";

/** ₹1.2L, ₹45K style for axis ticks only (tooltips and tables use exact figures). */
function compactINR(paise: number): string {
  const r = paise / 100;
  if (r >= 1_00_00_000) return `₹${(r / 1_00_00_000).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (r >= 1_00_000) return `₹${(r / 1_00_000).toFixed(1).replace(/\.0$/, "")}L`;
  if (r >= 1000) return `₹${Math.round(r / 1000)}K`;
  return `₹${r}`;
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded border border-line bg-surface px-3 py-2 text-sm shadow-overlay">
      <p className="text-muted">{formatDate(p.date)}</p>
      <p className="figure font-medium text-ink">{formatINR(p.paise, { paise: "auto" })}</p>
      <p className="text-xs text-muted">{p.count === 0 ? "No payments" : `${p.count} ${p.count === 1 ? "payment" : "payments"}`}</p>
    </div>
  );
}

export function CollectionsTrend({ data }: { data: Point[] }) {
  const total = data.reduce((s, d) => s + d.paise, 0);
  const days = data.filter((d) => d.count > 0).length;
  return (
    <div>
      <div className="h-[240px] w-full" role="img" aria-label={`Collections over the last 30 days: ${formatINR(total, { paise: "auto" })} on ${days} days. A table follows.`}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 240 }}>
          <AreaChart data={data} margin={{ top: 8, right: 20, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={LINE} strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => formatDate(d).replace(/ \d{4}$/, "")}
              tick={{ fill: MUTED, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: LINE }}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis tickFormatter={compactINR} tick={{ fill: MUTED, fontSize: 12 }} tickLine={false} axisLine={false} width={56} />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: MUTED, strokeWidth: 1, strokeDasharray: "3 3" }} />
            <Area
              type="linear" /* daily totals: straight segments, no invented curves between days */
              dataKey="paise"
              stroke={CREDIT}
              strokeWidth={2}
              fill={CREDIT}
              fillOpacity={0.08}
              dot={false}
              activeDot={{ r: 4, fill: CREDIT, stroke: "#fff", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted hover:text-ink">Show as a table</summary>
        <div className="mt-2 max-h-56 overflow-auto rounded border border-line">
          <table className="ledger-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" className="num">
                  Payments
                </th>
                <th scope="col" className="num">
                  Collected
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date}>
                  <td>{formatDate(d.date)}</td>
                  <td className="num">{d.count}</td>
                  <td className="num">{formatINR(d.paise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
