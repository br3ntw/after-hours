/** Map space is a 1000×700 viewBox; attraction coordinates are stored as 0–100 %. */
export const VIEW_W = 1000;
export const VIEW_H = 700;

export type Point = readonly [number, number];

/** Straight-edged closed polygon: zones on an operations plan, not illustrated coastlines. */
export function polygonPath(points: readonly Point[]): string {
  return `M ${points.map(([x, y]) => `${x} ${y}`).join(" L ")} Z`;
}

/** Closed Catmull-Rom spline through the points, as an SVG path. */
export function smoothClosedPath(points: readonly Point[], tension = 0.5): string {
  const n = points.length;
  const at = (i: number) => points[((i % n) + n) % n] as Point;
  let d = `M ${at(0)[0]} ${at(0)[1]}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1: Point = [p1[0] + ((p2[0] - p0[0]) * tension) / 3, p1[1] + ((p2[1] - p0[1]) * tension) / 3];
    const c2: Point = [p2[0] - ((p3[0] - p1[0]) * tension) / 3, p2[1] - ((p3[1] - p1[1]) * tension) / 3];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0]} ${p2[1]}`;
  }
  return `${d} Z`;
}

export interface LandShape {
  slug: string;
  name: string;
  fill: string; // CSS var
  edge: string;
  outline: readonly Point[];
  label: Point;
}

export const LANDS: readonly LandShape[] = [
  {
    slug: "tidewater-quay",
    name: "Tidewater Quay",
    fill: "var(--color-land-tidewater)",
    edge: "#1f5576",
    outline: [
      [40, 300],
      [150, 268],
      [290, 296],
      [332, 380],
      [302, 470],
      [252, 560],
      [160, 612],
      [62, 598],
      [28, 470],
    ],
    label: [118, 300],
  },
  {
    slug: "clockwork-canyon",
    name: "Clockwork Canyon",
    fill: "var(--color-land-clockwork)",
    edge: "#5a4a2a",
    outline: [
      [240, 150],
      [300, 60],
      [430, 38],
      [562, 58],
      [604, 150],
      [562, 262],
      [440, 286],
      [318, 262],
    ],
    label: [300, 108],
  },
  {
    slug: "aurora-heights",
    name: "Aurora Heights",
    fill: "var(--color-land-aurora)",
    edge: "#3a3f8a",
    outline: [
      [608, 70],
      [700, 28],
      [842, 28],
      [922, 90],
      [902, 202],
      [800, 262],
      [680, 252],
      [620, 170],
    ],
    label: [850, 214],
  },
  {
    slug: "emberwood",
    name: "Emberwood",
    fill: "var(--color-land-emberwood)",
    edge: "#2b6046",
    outline: [
      [660, 300],
      [780, 268],
      [920, 280],
      [972, 360],
      [942, 462],
      [820, 502],
      [690, 492],
      [640, 400],
    ],
    label: [868, 486],
  },
  {
    slug: "starlight-pier",
    name: "Starlight Pier",
    fill: "var(--color-land-starlight)",
    edge: "#55407f",
    outline: [
      [360, 500],
      [470, 470],
      [600, 470],
      [722, 500],
      [732, 580],
      [682, 660],
      [540, 692],
      [400, 682],
      [340, 600],
    ],
    label: [700, 646],
  },
];

export const LAGOON = { cx: 500, cy: 370, rx: 120, ry: 80 };
export const PROMENADE = { cx: 500, cy: 372, rx: 178, ry: 128 };
export const MAIN_GATE: Point = [226, 668];

export const toView = (xPct: number, yPct: number): Point => [(xPct / 100) * VIEW_W, (yPct / 100) * VIEW_H];
