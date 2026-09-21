'use client';

import { useMemo, useState } from 'react';
import type { RevenuePoint } from '@/server/admin/dashboard';
import { formatMinor } from '@/server/money';
import { formatDate } from '@/lib/utils';

/**
 * Daily revenue.
 *
 * A column chart rather than a line because the buckets are discrete days and
 * a young shop has many zero days — a line through mostly-zero data draws a
 * flatline with spikes, which reads as "broken" rather than as "quiet".
 *
 * Single series, so there is no legend: the section heading names it. Colour is
 * one hue; the chroma and contrast were validated against the white card
 * surface rather than chosen by eye (the brand's display gold reads as grey at
 * chart scale and falls under 3:1).
 *
 * Inline SVG, no charting library: one series of thirty bars does not justify
 * shipping a plotting runtime to every admin page load.
 */

const BAR_COLOR = '#a97421';
const GRID_COLOR = '#e9e3d9';
const AXIS_TEXT = '#867f78';

const HEIGHT = 180;
const MAX_BAR_WIDTH = 24;
/** Surface-coloured gap between adjacent bars, per the mark spec. */
const BAR_GAP = 2;

export function RevenueChart({ points }: { points: RevenuePoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const { max, niceMax } = useMemo(() => {
    const highest = Math.max(0, ...points.map((point) => point.revenueMinor));
    // Round the axis up to something a person would choose, so the top
    // gridline is a readable number rather than the largest sample.
    if (highest === 0) return { max: 0, niceMax: 1 };
    const magnitude = 10 ** Math.floor(Math.log10(highest));
    return { max: highest, niceMax: Math.ceil(highest / magnitude) * magnitude };
  }, [points]);

  if (points.length === 0) {
    return <p className="py-10 text-center text-sm text-stone-500">No revenue data yet.</p>;
  }

  const slot = 100 / points.length;
  const barWidthPercent = Math.min(slot - (BAR_GAP / 600) * 100, (MAX_BAR_WIDTH / 600) * 100);
  const active = hovered != null ? points[hovered] : null;

  return (
    <figure className="m-0">
      <div className="relative">
        {/* Described with aria-label rather than an SVG <title> child: React 19
            treats <title> as document metadata and hoists it out of the SVG,
            which both breaks the accessible name and fails hydration. */}
        <svg
          viewBox={`0 0 100 ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Daily revenue over the last ${points.length} days. Highest day ${formatMinor(max)}.`}
          className="h-[180px] w-full"
          onMouseLeave={() => setHovered(null)}
        >
          {/* Recessive hairline grid: three steps, solid, one step off surface. */}
          {[0, 0.5, 1].map((fraction) => (
            <line
              key={fraction}
              x1={0}
              x2={100}
              y1={HEIGHT - fraction * HEIGHT}
              y2={HEIGHT - fraction * HEIGHT}
              stroke={GRID_COLOR}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {points.map((point, index) => {
            const ratio = niceMax > 0 ? point.revenueMinor / niceMax : 0;
            // Keep a visible stub for non-zero days so a small sale is not
            // rendered as nothing at all.
            const barHeight = point.revenueMinor > 0 ? Math.max(ratio * HEIGHT, 3) : 0;
            const x = index * slot + (slot - barWidthPercent) / 2;

            return (
              <g key={point.day}>
                {/* Full-height hit target: a 3px bar is impossible to hover. */}
                <rect
                  x={index * slot}
                  y={0}
                  width={slot}
                  height={HEIGHT}
                  fill="transparent"
                  onMouseEnter={() => setHovered(index)}
                />
                {barHeight > 0 ? (
                  <rect
                    x={x}
                    y={HEIGHT - barHeight}
                    width={barWidthPercent}
                    height={barHeight}
                    fill={BAR_COLOR}
                    opacity={hovered == null || hovered === index ? 1 : 0.45}
                    // Rounded data-end, square at the baseline: the radius is
                    // clipped by the axis so only the top corners round.
                    rx={1.5}
                    className="pointer-events-none transition-opacity duration-150"
                  />
                ) : null}
              </g>
            );
          })}
        </svg>

        {active ? (
          <div
            role="status"
            className="border-ivory-300 pointer-events-none absolute top-0 border bg-white px-3 py-2 text-xs shadow-sm"
            style={{
              left: `${Math.min(Math.max((hovered! + 0.5) * slot, 12), 88)}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <p className="font-medium tabular-nums">{formatMinor(active.revenueMinor)}</p>
            <p className="mt-0.5 text-stone-500">
              {formatDate(active.day)} · {active.orderCount}{' '}
              {active.orderCount === 1 ? 'order' : 'orders'}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex justify-between text-[0.6875rem]" style={{ color: AXIS_TEXT }}>
        <span>{formatDate(points[0]!.day)}</span>
        <span className="tabular-nums">Peak {formatMinor(niceMax)}</span>
        <span>{formatDate(points[points.length - 1]!.day)}</span>
      </div>

      {/* Table view: the chart's values, reachable without colour or hover. */}
      <details className="mt-4">
        <summary className="hover:text-ink-900 cursor-pointer text-xs text-stone-600">
          View as table
        </summary>
        <div className="border-ivory-300 mt-2 max-h-56 overflow-y-auto border">
          <table className="w-full text-xs">
            <caption className="sr-only">Daily revenue and order count</caption>
            <thead className="bg-ivory-100 sticky top-0">
              <tr>
                <th scope="col" className="p-2 text-left font-medium">
                  Day
                </th>
                <th scope="col" className="p-2 text-right font-medium">
                  Revenue
                </th>
                <th scope="col" className="p-2 text-right font-medium">
                  Orders
                </th>
              </tr>
            </thead>
            <tbody className="divide-ivory-200 divide-y">
              {points.map((point) => (
                <tr key={point.day}>
                  <td className="p-2">{formatDate(point.day)}</td>
                  <td className="p-2 text-right tabular-nums">{formatMinor(point.revenueMinor)}</td>
                  <td className="p-2 text-right tabular-nums">{point.orderCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
