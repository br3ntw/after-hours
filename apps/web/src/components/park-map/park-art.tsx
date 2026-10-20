import { memo, useMemo } from "react";

import { LANDS, MAIN_GATE, type Point, smoothClosedPath, VIEW_H, VIEW_W } from "./geometry";

/**
 * Lanternfall Park at night: an original illustration (no third-party art). Five themed
 * lands around Lantern Lagoon, lit paths, and the lighthouse beacon at the centre.
 * Decorative only: every fact lives in the accessible marker layer above it.
 */

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100_000) / 100_000;
  };
}

/** Point-in-polygon (ray casting) for scattering scenery inside a land. */
function inside([x, y]: Point, poly: readonly Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const LAGOON_C: Point = [500, 370];
const inLagoonZone = ([x, y]: Point) => ((x - 500) / 200) ** 2 + ((y - 372) / 150) ** 2 < 1;

const PARK_GROUND: readonly Point[] = [
  [30, 280],
  [140, 240],
  [250, 140],
  [300, 40],
  [440, 18],
  [600, 30],
  [700, 12],
  [860, 14],
  [950, 90],
  [985, 280],
  [990, 430],
  [940, 510],
  [760, 540],
  [740, 640],
  [560, 700],
  [380, 700],
  [300, 690],
  [200, 640],
  [40, 620],
  [12, 450],
];

const PATHS = [
  "M 322 372 C 300 380 280 382 262 386",
  "M 430 252 C 420 230 405 205 392 180",
  "M 610 262 C 640 230 670 200 700 190",
  "M 676 400 C 705 392 725 378 742 366",
  "M 520 500 C 512 525 498 545 482 560",
  `M ${MAIN_GATE[0]} ${MAIN_GATE[1]} C 260 600 320 540 372 488`,
  "M 262 386 C 220 420 180 440 150 440",
  "M 392 180 C 430 150 455 120 462 100",
  "M 700 190 C 740 150 780 100 800 74",
  "M 742 366 C 790 360 840 345 898 338",
  "M 482 560 C 520 590 560 610 580 616",
];

export const ParkArt = memo(function ParkArt({
  highlightLand,
  spots = [],
}: {
  highlightLand?: string | null;
  /** Ride positions: scenery keeps clear of them and each gets a pool of light. */
  spots?: readonly Point[];
}) {
  const scenery = useMemo(() => {
    const r = rng(20261020);
    const clear = (p: Point, d: number) =>
      spots.every(([sx, sy]) => (sx - p[0]) ** 2 + (sy - p[1]) ** 2 > d * d);
    const trees: { x: number; y: number; s: number; tone: number }[] = [];
    const flies: Point[] = [];
    for (const land of LANDS) {
      const xs = land.outline.map((p) => p[0]);
      const ys = land.outline.map((p) => p[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const density = land.slug === "emberwood" ? 110 : land.slug === "aurora-heights" ? 45 : 40;
      let placed = 0;
      for (let i = 0; i < density * 6 && placed < density; i++) {
        const p: Point = [x0 + r() * (x1 - x0), y0 + r() * (y1 - y0)];
        if (!inside(p, land.outline) || inLagoonZone(p) || !clear(p, 26)) continue;
        if (land.slug === "aurora-heights" && p[1] < 115) continue; // the peaks
        if (land.slug === "clockwork-canyon" && p[1] < 120) continue; // the mesas
        trees.push({ x: p[0], y: p[1], s: 3.5 + r() * 4.5, tone: r() });
        placed += 1;
      }
      if (land.slug === "emberwood") {
        for (let i = 0; i < 70; i++) {
          const p: Point = [x0 + r() * (x1 - x0), y0 + r() * (y1 - y0)];
          if (inside(p, land.outline)) flies.push(p);
        }
      }
    }
    // Lamps along the promenade ring.
    const lamps: Point[] = Array.from({ length: 44 }, (_, i) => {
      const t = (i / 44) * Math.PI * 2;
      return [500 + Math.cos(t) * 178, 372 + Math.sin(t) * 128];
    });
    const stars: [number, number, number][] = Array.from({ length: 90 }, () => [
      r() * VIEW_W,
      r() * VIEW_H,
      r(),
    ]);
    return { trees, flies, lamps, stars };
  }, [spots]);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="absolute inset-0 size-full"
      aria-hidden
      focusable="false"
    >
      <defs>
        <radialGradient id="pa-sea" cx="50%" cy="52%" r="75%">
          <stop offset="0" stopColor="#0b2340" />
          <stop offset="1" stopColor="#030912" />
        </radialGradient>
        <linearGradient id="pa-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#13312f" />
          <stop offset="1" stopColor="#0a1f22" />
        </linearGradient>
        <radialGradient id="pa-lagoon" cx="50%" cy="40%" r="65%">
          <stop offset="0" stopColor="#1b5a86" />
          <stop offset="0.6" stopColor="#0c3255" />
          <stop offset="1" stopColor="#061a2e" />
        </radialGradient>
        <radialGradient id="pa-pool" r="50%">
          <stop offset="0" stopColor="#ffcf7a" stopOpacity="0.32" />
          <stop offset="1" stopColor="#ffcf7a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pa-beacon" r="50%">
          <stop offset="0" stopColor="#e9fbff" stopOpacity="0.95" />
          <stop offset="0.25" stopColor="#38d9ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#38d9ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="pa-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#bff3ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#bff3ff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pa-snow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8f1ff" />
          <stop offset="0.35" stopColor="#8ea6d6" />
          <stop offset="1" stopColor="#1b2350" />
        </linearGradient>
        <linearGradient id="pa-mesa" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9773d" />
          <stop offset="1" stopColor="#3b2414" />
        </linearGradient>
        <linearGradient id="pa-aurora" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#35d49a" stopOpacity="0" />
          <stop offset="0.3" stopColor="#35d49a" stopOpacity="0.55" />
          <stop offset="0.7" stopColor="#38d9ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#9b6dff" stopOpacity="0" />
        </linearGradient>
        <pattern id="pa-ripple" width="34" height="14" patternUnits="userSpaceOnUse">
          <path
            d="M0 7 Q 8.5 3 17 7 T 34 7"
            fill="none"
            stroke="#7fd8ff"
            strokeOpacity="0.07"
            strokeWidth="1"
          />
        </pattern>
        <filter id="pa-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="pa-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id="pa-haze" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>

      {/* Sea and night */}
      <rect width={VIEW_W} height={VIEW_H} fill="url(#pa-sea)" />
      <rect width={VIEW_W} height={VIEW_H} fill="url(#pa-ripple)" />
      {scenery.stars.map(([x, y, b], i) => (
        <circle key={i} cx={x} cy={y} r={0.6 + b * 0.8} fill="#cfe6ff" opacity={0.15 + b * 0.35} />
      ))}

      {/* Park ground, with a soft shoreline glow */}
      <path d={smoothClosedPath(PARK_GROUND)} fill="#38d9ff" opacity="0.08" filter="url(#pa-haze)" />
      <path d={smoothClosedPath(PARK_GROUND)} fill="url(#pa-ground)" stroke="#2c5a63" strokeWidth="1.5" />

      {/* Lands */}
      {LANDS.map((land) => {
        const active = highlightLand === land.slug;
        return (
          <path
            key={land.slug}
            d={smoothClosedPath(land.outline)}
            fill={land.fill}
            fillOpacity={active ? 1 : 0.85}
            stroke={land.edge}
            strokeOpacity={active ? 1 : 0.6}
            strokeWidth={active ? 2.5 : 1.2}
          />
        );
      })}

      {/* Aurora Heights: snowy peaks under the northern lights */}
      <g>
        <path
          d="M 610 60 C 700 20 820 30 930 70"
          stroke="url(#pa-aurora)"
          strokeWidth="26"
          fill="none"
          filter="url(#pa-soft)"
        />
        <path
          d="M 630 40 C 720 0 840 10 940 50"
          stroke="url(#pa-aurora)"
          strokeWidth="12"
          fill="none"
          opacity="0.7"
          filter="url(#pa-soft)"
        />
        {[
          [640, 118, 50, 70],
          [700, 112, 60, 92],
          [775, 115, 55, 82],
          [840, 110, 62, 96],
          [905, 120, 48, 72],
        ].map(([x, base, w, h], i) => (
          <g key={i}>
            <path
              d={`M ${x! - w!} ${base} L ${x} ${base! - h!} L ${x! + w!} ${base} Z`}
              fill="url(#pa-snow)"
            />
            <path
              d={`M ${x} ${base! - h!} L ${x! + w! * 0.55} ${base! - h! * 0.45} L ${x! + w!} ${base} L ${x} ${base} Z`}
              fill="#0d1338"
              opacity="0.45"
            />
          </g>
        ))}
      </g>

      {/* Clockwork Canyon: mesas, mine rail and the gear tower */}
      <g>
        <path
          d="M 250 120 L 270 70 L 330 62 L 350 92 L 400 88 L 420 48 L 500 40 L 520 80 L 590 84 L 600 120 Z"
          fill="url(#pa-mesa)"
        />
        <path
          d="M 270 70 L 330 62 L 350 92 L 400 88 L 420 48 L 500 40"
          stroke="#e0a565"
          strokeOpacity="0.5"
          fill="none"
        />
        <path
          d="M 262 182 C 330 160 400 190 470 168 S 560 150 600 170"
          stroke="#8a5a2c"
          strokeWidth="2.2"
          strokeDasharray="5 3"
          fill="none"
        />
        <g transform="translate(560 128)" filter="url(#pa-glow)">
          <rect x="-7" y="-2" width="14" height="40" fill="#5a3a1e" />
          <circle r="17" fill="none" stroke="#ffb84d" strokeWidth="5" strokeDasharray="5 3.4" />
          <circle r="8" fill="#ffb84d" opacity="0.85" />
        </g>
      </g>

      {/* Tidewater Quay: harbour, piers, boats and warehouses */}
      <g>
        <path
          d="M 30 470 C 60 440 100 450 110 480 C 120 520 80 560 40 560 Z"
          fill="#071a2e"
          stroke="#1f5576"
        />
        {[470, 500, 530].map((y) => (
          <rect key={y} x="60" y={y} width="44" height="4" fill="#6b4a2b" />
        ))}
        {[
          [70, 488],
          [86, 518],
          [58, 545],
        ].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <path d="M -9 0 L 9 0 L 6 5 L -6 5 Z" fill="#c9d6e8" />
            <path
              d="M 0 -14 L 0 0 M 0 -13 L 8 -2 L 0 -2"
              stroke="#e8eef7"
              strokeWidth="1"
              fill="#e8eef7"
              fillOpacity="0.8"
            />
            <circle cx="0" cy="-15" r="1.6" fill="#ffd28a" filter="url(#pa-glow)" />
          </g>
        ))}
        {[
          [100, 330],
          [126, 352],
          [92, 380],
        ].map(([x, y], i) => (
          <g key={i}>
            <rect x={x} y={y} width="24" height="16" fill="#1e3a4f" stroke="#2f5a76" />
            <path d={`M ${x! - 2} ${y} L ${x! + 12} ${y! - 8} L ${x! + 26} ${y} Z`} fill="#294b63" />
            <rect x={x! + 4} y={y! + 5} width="4" height="4" fill="#ffd28a" />
            <rect x={x! + 14} y={y! + 5} width="4" height="4" fill="#ffd28a" opacity="0.7" />
          </g>
        ))}
      </g>

      {/* Emberwood: the great lantern tree */}
      <g transform="translate(830 395)">
        <circle r="34" fill="#ffb84d" opacity="0.16" filter="url(#pa-soft)" />
        <rect x="-4" y="0" width="8" height="26" fill="#3a2414" />
        <circle r="22" fill="#1d4a2c" />
        <circle cx="-10" cy="-6" r="14" fill="#245c36" />
        <circle cx="10" cy="-8" r="13" fill="#2a6a3e" />
        {[
          [-12, -2],
          [6, -14],
          [14, 2],
          [-2, 8],
          [-16, -12],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2" fill="#ffd28a" filter="url(#pa-glow)" />
        ))}
      </g>

      {/* Starlight Pier: boardwalk, Ferris wheel and rocket tower */}
      <g>
        <path d="M 470 690 L 470 700 L 640 700 L 640 690 Z" fill="#6b4a2b" />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1={475 + i * 14} y1="690" x2={475 + i * 14} y2="700" stroke="#3b2414" />
        ))}
        <g transform="translate(700 585)" filter="url(#pa-glow)">
          <circle r="30" fill="none" stroke="#db5e9a" strokeWidth="2" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return (
              <g key={i}>
                <line x2={Math.cos(a) * 30} y2={Math.sin(a) * 30} stroke="#db5e9a" strokeOpacity="0.5" />
                <circle cx={Math.cos(a) * 30} cy={Math.sin(a) * 30} r="2.4" fill="#ffd1ea" />
              </g>
            );
          })}
          <path d="M -16 40 L 0 0 L 16 40" stroke="#8a6aa8" strokeWidth="2" fill="none" />
        </g>
        <g transform="translate(372 548)" filter="url(#pa-glow)">
          <path d="M 0 -34 C 8 -24 8 -6 6 8 L -6 8 C -8 -6 -8 -24 0 -34 Z" fill="#c9d6e8" />
          <path d="M -6 8 L -12 18 L -6 14 Z M 6 8 L 12 18 L 6 14 Z" fill="#9b6dff" />
          <circle cy="-16" r="3" fill="#38d9ff" />
          <path d="M -3 14 L 0 24 L 3 14 Z" fill="#ffb84d" />
        </g>
      </g>

      {/* Trees and fireflies */}
      {scenery.trees.map((t, i) => (
        <g key={i}>
          <circle cx={t.x + 1.5} cy={t.y + 2} r={t.s} fill="#04110d" opacity="0.6" />
          <circle cx={t.x} cy={t.y} r={t.s} fill={t.tone > 0.5 ? "#1c4a33" : "#173f2c"} />
          <circle cx={t.x - t.s * 0.3} cy={t.y - t.s * 0.35} r={t.s * 0.45} fill="#2a6b48" opacity="0.7" />
        </g>
      ))}
      {scenery.flies.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.2" fill="#ffe08a" opacity="0.85" filter="url(#pa-glow)" />
      ))}

      {/* Lit paths: a warm halo under a bright core, like lamp-lined walkways from above */}
      <g fill="none" strokeLinecap="round">
        <ellipse
          cx="500"
          cy="372"
          rx="178"
          ry="128"
          stroke="#ffcf7a"
          strokeOpacity="0.18"
          strokeWidth="16"
          filter="url(#pa-soft)"
        />
        <ellipse cx="500" cy="372" rx="178" ry="128" stroke="#3a3326" strokeWidth="8" />
        <ellipse
          cx="500"
          cy="372"
          rx="178"
          ry="128"
          stroke="#ffd79a"
          strokeOpacity="0.55"
          strokeWidth="1.4"
        />
        {PATHS.map((d) => (
          <g key={d}>
            <path d={d} stroke="#ffcf7a" strokeOpacity="0.15" strokeWidth="12" filter="url(#pa-soft)" />
            <path d={d} stroke="#3a3326" strokeWidth="5" />
            <path d={d} stroke="#ffd79a" strokeOpacity="0.5" strokeWidth="1" />
          </g>
        ))}
      </g>
      {scenery.lamps.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.8" fill="#ffe2a8" filter="url(#pa-glow)" />
      ))}

      {/* Warm pools of light where rides stand */}
      {spots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="30" fill="url(#pa-pool)" />
      ))}

      {/* Lantern Lagoon and the lighthouse beacon */}
      <ellipse
        cx="500"
        cy="370"
        rx="120"
        ry="80"
        fill="url(#pa-lagoon)"
        stroke="#2a6f99"
        strokeOpacity="0.8"
        strokeWidth="1.5"
      />
      <ellipse cx="500" cy="370" rx="120" ry="80" fill="url(#pa-ripple)" />
      <path
        d="M 494 386 L 506 386 L 512 440 L 488 440 Z"
        fill="#bff3ff"
        opacity="0.12"
        filter="url(#pa-soft)"
      />
      <g transform={`translate(${LAGOON_C[0]} ${LAGOON_C[1]})`}>
        <path d="M 0 -26 L 230 -70 L 230 -20 Z" fill="url(#pa-beam)" opacity="0.6" />
        <path
          d="M 0 -26 L -220 -60 L -220 -18 Z"
          fill="url(#pa-beam)"
          opacity="0.35"
          transform="scale(-1 1) rotate(180)"
        />
        <circle cy="-26" r="46" fill="url(#pa-beacon)" />
        <ellipse cy="12" rx="30" ry="12" fill="#163a52" stroke="#3d7ea6" />
        <path d="M -9 10 L -6 -20 L 6 -20 L 9 10 Z" fill="#e8eef7" />
        <path d="M -8.4 4 L 8.4 4 L 8 0 L -8 0 Z M -7.4 -8 L 7.4 -8 L 7.1 -12 L -7.1 -12 Z" fill="#ff5964" />
        <rect x="-7" y="-30" width="14" height="10" rx="2" fill="#bff3ff" />
        <path d="M -9 -30 L 0 -40 L 9 -30 Z" fill="#2b4569" />
        <circle cy="-25" r="4" fill="#ffffff" />
      </g>

      {/* Main gate */}
      <g transform={`translate(${MAIN_GATE[0]} ${MAIN_GATE[1]})`}>
        <ellipse rx="44" ry="10" fill="#ffcf7a" opacity="0.18" filter="url(#pa-soft)" />
        <path d="M -30 6 L -30 -16 Q 0 -34 30 -16 L 30 6" fill="none" stroke="#e8c27a" strokeWidth="3" />
        <circle cx="-30" cy="-18" r="2.5" fill="#ffe2a8" filter="url(#pa-glow)" />
        <circle cx="30" cy="-18" r="2.5" fill="#ffe2a8" filter="url(#pa-glow)" />
      </g>

      {/* Land names */}
      {LANDS.map((land) => (
        <text
          key={land.slug}
          x={land.label[0]}
          y={land.label[1]}
          textAnchor="middle"
          fill="#e8eef7"
          fillOpacity="0.62"
          fontFamily="var(--font-sans)"
          fontSize="12"
          fontWeight="600"
          letterSpacing="1.6"
          stroke="#04101c"
          strokeOpacity="0.8"
          strokeWidth="3"
          paintOrder="stroke"
        >
          {land.name.toUpperCase()}
        </text>
      ))}
    </svg>
  );
});
