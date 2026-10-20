import { memo, useId } from "react";

import type { AttractionType } from "@/lib/api/types";

/**
 * Original procedural night-scene art for each attraction (no third-party imagery):
 * land-tinted sky, layered hills, a land accent, the ride's structure studded with lights,
 * and a reflective foreground. Deterministic per slug, so a ride always looks the same.
 */

const LAND: Record<string, { sky: [string, string, string]; hill: string; glow: string; accent: Accent }> = {
  "tidewater-quay": {
    sky: ["#040d1d", "#0c2c4f", "#1d5c86"],
    hill: "#0a2236",
    glow: "#5fd4ff",
    accent: "sea",
  },
  "clockwork-canyon": {
    sky: ["#0d0812", "#3a1f22", "#a2552d"],
    hill: "#2a160e",
    glow: "#ffb066",
    accent: "gears",
  },
  "aurora-heights": {
    sky: ["#030819", "#0f1d52", "#2b4a8a"],
    hill: "#0c1640",
    glow: "#7cf0d0",
    accent: "aurora",
  },
  emberwood: { sky: ["#040d0a", "#0f2a22", "#2d5a3a"], hill: "#0a1d14", glow: "#ffd28a", accent: "flies" },
  "starlight-pier": {
    sky: ["#0b0620", "#2b1658", "#7a3b8f"],
    hill: "#160c2e",
    glow: "#ff8fd0",
    accent: "neon",
  },
};
type Accent = "sea" | "gears" | "aurora" | "flies" | "neon";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100_000) / 100_000;
  };
}

const W = 800;
const H = 400;
const GROUND = 318;

export const RideArt = memo(function RideArt({
  slug,
  land,
  type,
  className,
  anchor = "center",
}: {
  slug: string;
  land: string;
  type: AttractionType;
  className?: string;
  /** Wide frames crop the scene; "bottom" keeps the ride's base and the ground in view. */
  anchor?: "center" | "bottom";
}) {
  const uid = useId().replace(/:/g, "");
  const pal = LAND[land] ?? LAND["tidewater-quay"]!;
  const r = rng(hash(slug));
  const stars = Array.from({ length: 70 }, () => [r() * W, r() * H * 0.5, 0.4 + r() * 1.1] as const);
  const moon = { x: 120 + r() * 560, y: 50 + r() * 40 };
  const id = (n: string) => `${uid}-${n}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio={anchor === "bottom" ? "xMidYMax slice" : "xMidYMid slice"}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={id("sky")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={pal.sky[0]} />
          <stop offset="0.6" stopColor={pal.sky[1]} />
          <stop offset="1" stopColor={pal.sky[2]} />
        </linearGradient>
        <radialGradient id={id("moon")} r="50%">
          <stop offset="0" stopColor="#fff8e6" stopOpacity="0.9" />
          <stop offset="0.3" stopColor="#fff8e6" stopOpacity="0.25" />
          <stop offset="1" stopColor="#fff8e6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("halo")} cx="50%" cy="100%" r="70%">
          <stop offset="0" stopColor={pal.glow} stopOpacity="0.45" />
          <stop offset="1" stopColor={pal.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("water")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={pal.sky[2]} stopOpacity="0.5" />
          <stop offset="1" stopColor="#02060d" />
        </linearGradient>
        <linearGradient id={id("aurora")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#35d49a" stopOpacity="0" />
          <stop offset="0.35" stopColor="#35d49a" stopOpacity="0.7" />
          <stop offset="0.7" stopColor="#38d9ff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#9b6dff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id("fall")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9fbff" />
          <stop offset="1" stopColor="#5fd4ff" stopOpacity="0.4" />
        </linearGradient>
        <filter id={id("glow")} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={id("blur")}>
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>

      <rect width={W} height={H} fill={`url(#${id("sky")})`} />
      {stars.map(([x, y, s], i) => (
        <circle key={i} cx={x} cy={y} r={s} fill="#fff" opacity={0.2 + (i % 5) * 0.12} />
      ))}
      <circle cx={moon.x} cy={moon.y} r="60" fill={`url(#${id("moon")})`} />
      <circle cx={moon.x} cy={moon.y} r="14" fill="#fff6dd" />

      <AccentLayer accent={pal.accent} id={id} glow={pal.glow} r={r} />

      {/* Three ridge lines, fading into the haze */}
      {[0.35, 0.6, 1].map((o, i) => {
        const base = GROUND - 70 + i * 26;
        return (
          <path
            key={i}
            d={`M0 ${base} C ${120 + i * 40} ${base - 50 + r() * 30}, ${260 + i * 30} ${base - 10}, ${400} ${base - 30 + r() * 20} S ${680} ${base - 50 + r() * 30}, ${W} ${base - 10} L ${W} ${H} L 0 ${H} Z`}
            fill={pal.hill}
            opacity={o}
          />
        );
      })}

      <rect y={GROUND - 120} width={W} height="160" fill={`url(#${id("halo")})`} />
      <g filter={`url(#${id("glow")})`}>
        <Structure type={type} slug={slug} glow={pal.glow} id={id} r={r} />
      </g>

      {/* Foreground: path, queue lights and a reflective wet surface */}
      <rect y={GROUND} width={W} height={H - GROUND} fill={`url(#${id("water")})`} />
      <path d={`M0 ${GROUND} L ${W} ${GROUND}`} stroke={pal.glow} strokeOpacity="0.35" />
      {Array.from({ length: 18 }, (_, i) => (
        <g key={i}>
          <circle
            cx={20 + i * 45 + r() * 8}
            cy={GROUND + 10}
            r="2.2"
            fill="#ffe2a8"
            filter={`url(#${id("glow")})`}
          />
          <rect
            x={18 + i * 45}
            y={GROUND + 16}
            width="4"
            height={18 + r() * 14}
            fill="#ffe2a8"
            opacity="0.12"
          />
        </g>
      ))}
    </svg>
  );
});

function AccentLayer({
  accent,
  id,
  glow,
  r,
}: {
  accent: Accent;
  id: (n: string) => string;
  glow: string;
  r: () => number;
}) {
  switch (accent) {
    case "aurora":
      return (
        <g filter={`url(#${id("blur")})`}>
          <path
            d="M -20 90 C 180 20 380 140 560 60 S 760 40 820 80"
            stroke={`url(#${id("aurora")})`}
            strokeWidth="38"
            fill="none"
          />
          <path
            d="M -20 130 C 200 70 420 170 600 100 S 780 90 820 120"
            stroke={`url(#${id("aurora")})`}
            strokeWidth="18"
            fill="none"
            opacity="0.6"
          />
        </g>
      );
    case "gears":
      return (
        <g opacity="0.35" stroke="#ffb066" fill="none">
          <circle cx="680" cy="120" r="46" strokeWidth="10" strokeDasharray="10 7" />
          <circle cx="740" cy="190" r="26" strokeWidth="7" strokeDasharray="7 5" />
        </g>
      );
    case "sea":
      return (
        <g>
          {Array.from({ length: 5 }, (_, i) => (
            <path
              key={i}
              d={`M ${60 + i * 160} 210 q 12 -5 24 0 t 24 0`}
              stroke={glow}
              strokeOpacity="0.3"
              fill="none"
            />
          ))}
          <g transform="translate(700 205)">
            <rect x="-4" y="-60" width="8" height="60" fill="#d9e6f5" />
            <rect x="-6" y="-70" width="12" height="10" fill="#fff6dd" />
            <path d="M 0 -65 L 120 -95 L 120 -40 Z" fill="#fff6dd" opacity="0.18" />
          </g>
        </g>
      );
    case "flies":
      return (
        <g>
          {Array.from({ length: 40 }, (_, i) => (
            <circle
              key={i}
              cx={r() * 800}
              cy={140 + r() * 170}
              r="1.6"
              fill="#ffe08a"
              opacity={0.4 + r() * 0.6}
            />
          ))}
        </g>
      );
    case "neon":
      return (
        <g opacity="0.55" fill="none" strokeWidth="3">
          <path d="M 40 160 L 140 160" stroke="#ff8fd0" />
          <path d="M 640 150 L 760 150" stroke="#38d9ff" />
          <circle cx="90" cy="120" r="18" stroke="#9b6dff" />
        </g>
      );
  }
}

function Bulbs({ points, color }: { points: readonly (readonly [number, number])[]; color: string }) {
  return (
    <g fill={color}>
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.1" />
      ))}
    </g>
  );
}

function Structure({
  type,
  slug,
  glow,
  id,
  r,
}: {
  type: AttractionType;
  slug: string;
  glow: string;
  id: (n: string) => string;
  r: () => number;
}) {
  const g = GROUND;
  switch (type) {
    case "coaster": {
      const lift = 110 + r() * 40;
      const track = `M 40 ${g - 30} L 210 ${lift} C 240 ${lift - 20}, 260 ${lift - 10}, 290 ${g - 40} C 320 ${g - 10}, 360 ${g - 20}, 400 ${g - 80} C 430 ${g - 160}, 520 ${g - 160}, 540 ${g - 100} C 560 ${g - 40}, 470 ${g - 40}, 490 ${g - 110} C 510 ${g - 180}, 640 ${g - 90}, 700 ${g - 60} L 780 ${g - 50}`;
      return (
        <g>
          {Array.from({ length: 16 }, (_, i) => (
            <line
              key={i}
              x1={60 + i * 46}
              y1={g}
              x2={60 + i * 46}
              y2={g - 30 - ((i * 53) % 130)}
              stroke="#8aa0c0"
              strokeOpacity="0.35"
              strokeWidth="2"
            />
          ))}
          <path d={track} stroke={glow} strokeWidth="6" fill="none" strokeOpacity="0.4" />
          <path d={track} stroke="#e8eef7" strokeWidth="2.2" fill="none" />
          <g transform={`translate(160 ${lift + 26}) rotate(-38)`}>
            {[0, 18, 36].map((x) => (
              <rect key={x} x={x} y="-8" width="16" height="9" rx="3" fill="#ff5964" />
            ))}
          </g>
          {/* Lights exactly on the track: a round-capped, zero-length dash every 16 units */}
          <path
            d={track}
            stroke="#ffe2a8"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="0 16"
            fill="none"
          />
        </g>
      );
    }
    case "dark_ride": {
      const bulbs = Array.from({ length: 22 }, (_, i) => [250 + i * 14, g - 150] as const);
      return (
        <g>
          <path
            d={`M 200 ${g} L 200 ${g - 140} L 300 ${g - 190} L 400 ${g - 230} L 500 ${g - 190} L 600 ${g - 140} L 600 ${g} Z`}
            fill="#0b1426"
            stroke={glow}
            strokeOpacity="0.5"
          />
          <path
            d={`M 170 ${g} L 170 ${g - 200} L 200 ${g - 240} L 230 ${g - 200} L 230 ${g} Z M 570 ${g} L 570 ${g - 200} L 600 ${g - 240} L 630 ${g - 200} L 630 ${g} Z`}
            fill="#101c34"
          />
          <path
            d={`M 350 ${g} L 350 ${g - 80} Q 400 ${g - 130} 450 ${g - 80} L 450 ${g} Z`}
            fill={glow}
            opacity="0.75"
          />
          {[250, 300, 500, 550].map((x) => (
            <rect
              key={x}
              x={x - 12}
              y={g - 110}
              width="24"
              height="34"
              rx="12"
              fill="#ffd28a"
              opacity="0.65"
            />
          ))}
          <rect
            x="240"
            y={g - 162}
            width="320"
            height="24"
            rx="5"
            fill="#1a2440"
            stroke="#ffd28a"
            strokeOpacity="0.6"
          />
          <Bulbs points={bulbs} color="#ffe2a8" />
          <circle cx="400" cy={g - 230} r="8" fill={glow} />
        </g>
      );
    }
    case "water":
      return (
        <g>
          <path
            d={`M 360 ${g} L 420 ${g - 200} L 470 ${g - 230} L 560 ${g - 150} L 640 ${g} Z`}
            fill="#1d2b3a"
          />
          <path
            d={`M 470 ${g - 228} L 490 ${g - 228} L 520 ${g} L 455 ${g} Z`}
            fill={`url(#${id("fall")})`}
            opacity="0.85"
          />
          <ellipse
            cx="490"
            cy={g - 4}
            rx="70"
            ry="14"
            fill="#e9fbff"
            opacity="0.35"
            filter={`url(#${id("blur")})`}
          />
          <path
            d={`M 80 ${g - 60} C 200 ${g - 70}, 260 ${g - 30}, 360 ${g - 30} S 520 ${g - 10}, 760 ${g - 8}`}
            stroke="#5fd4ff"
            strokeWidth="10"
            fill="none"
            opacity="0.45"
          />
          <path d={`M 120 ${g - 66} l 34 0 l -6 10 l -24 0 Z`} fill="#c98a4a" />
          <Bulbs
            points={Array.from({ length: 12 }, (_, i) => [90 + i * 56, g - 62 + i * 4] as const)}
            color="#ffe2a8"
          />
        </g>
      );
    case "show": {
      return (
        <g>
          <path d={`M 120 ${g - 120} L 220 ${-40} L 260 ${-40} Z`} fill={glow} opacity="0.15" />
          <path d={`M 680 ${g - 120} L 560 ${-40} L 600 ${-40} Z`} fill={glow} opacity="0.15" />
          <path
            d={`M 220 ${g} L 220 ${g - 150} Q 400 ${g - 230} 580 ${g - 150} L 580 ${g} Z`}
            fill="#140f22"
            stroke={glow}
            strokeOpacity="0.45"
          />
          <rect x="300" y={g - 140} width="200" height="44" rx="8" fill="#2a1f3d" stroke="#ffd28a" />
          <Bulbs
            points={Array.from({ length: 14 }, (_, i) => [310 + i * 14, g - 134] as const)}
            color="#ffe2a8"
          />
          <Bulbs
            points={Array.from({ length: 14 }, (_, i) => [310 + i * 14, g - 102] as const)}
            color="#ffe2a8"
          />
          <path d={`M 330 ${g} L 330 ${g - 76} L 470 ${g - 76} L 470 ${g} Z`} fill="#ff5964" opacity="0.6" />
        </g>
      );
    }
    case "family": {
      return (
        <g>
          <path d={`M 260 ${g - 140} L 400 ${g - 220} L 540 ${g - 140} Z`} fill="#d94b62" />
          {[0, 1, 2, 3].map((i) => (
            <path
              key={i}
              d={`M ${400} ${g - 220} L ${300 + i * 70} ${g - 140} L ${335 + i * 70} ${g - 140} Z`}
              fill="#f5e6d0"
              opacity="0.85"
            />
          ))}
          <rect x="270" y={g - 140} width="260" height="14" fill="#ffd28a" opacity="0.6" />
          {Array.from({ length: 8 }, (_, i) => (
            <g key={i}>
              <line
                x1={290 + i * 32}
                y1={g - 126}
                x2={290 + i * 32}
                y2={g - 20}
                stroke="#ffd28a"
                strokeOpacity="0.7"
                strokeWidth="2"
              />
              <rect x={282 + i * 32} y={g - 60 - (i % 2) * 14} width="16" height="12" rx="4" fill="#f5e6d0" />
            </g>
          ))}
          <rect x="260" y={g - 20} width="280" height="20" fill="#2a1f3d" />
          <Bulbs
            points={Array.from({ length: 16 }, (_, i) => [272 + i * 17, g - 133] as const)}
            color="#ffe2a8"
          />
        </g>
      );
    }
    default: {
      // Flat rides: a wheel, a drop tower or a swing ride, chosen per attraction.
      const variant = hash(slug) % 3;
      if (variant === 0) {
        const cx = 400;
        const cy = g - 150;
        return (
          <g>
            <circle cx={cx} cy={cy} r="120" fill="none" stroke={glow} strokeWidth="3" />
            {Array.from({ length: 16 }, (_, i) => {
              const a = (i / 16) * Math.PI * 2;
              return (
                <g key={i}>
                  <line
                    x1={cx}
                    y1={cy}
                    x2={cx + Math.cos(a) * 120}
                    y2={cy + Math.sin(a) * 120}
                    stroke={glow}
                    strokeOpacity="0.4"
                  />
                  <rect
                    x={cx + Math.cos(a) * 120 - 7}
                    y={cy + Math.sin(a) * 120}
                    width="14"
                    height="10"
                    rx="3"
                    fill="#ffd1ea"
                  />
                </g>
              );
            })}
            <path
              d={`M ${cx - 70} ${g} L ${cx} ${cy} L ${cx + 70} ${g}`}
              stroke="#8a6aa8"
              strokeWidth="5"
              fill="none"
            />
            <circle cx={cx} cy={cy} r="12" fill="#fff" />
          </g>
        );
      }
      if (variant === 1) {
        return (
          <g>
            <rect
              x="380"
              y="40"
              width="40"
              height={g - 40}
              fill="#1a2440"
              stroke={glow}
              strokeOpacity="0.6"
            />
            <rect x="366" y="150" width="68" height="28" rx="4" fill="#ff5964" />
            <Bulbs
              points={Array.from({ length: 22 }, (_, i) => [376, 52 + i * 12] as const)}
              color="#ffe2a8"
            />
            <Bulbs
              points={Array.from({ length: 22 }, (_, i) => [424, 52 + i * 12] as const)}
              color="#ffe2a8"
            />
            <circle cx="400" cy="34" r="10" fill={glow} />
          </g>
        );
      }
      return (
        <g>
          <rect x="392" y={g - 220} width="16" height="220" fill="#1a2440" />
          <path
            d={`M 290 ${g - 200} Q 400 ${g - 250} 510 ${g - 200}`}
            stroke={glow}
            strokeWidth="6"
            fill="none"
          />
          {Array.from({ length: 10 }, (_, i) => {
            const x = 300 + i * 22;
            return (
              <g key={i}>
                <line x1={x} y1={g - 205} x2={x - 30} y2={g - 120} stroke="#cbd5e1" strokeOpacity="0.6" />
                <rect x={x - 36} y={g - 122} width="12" height="8" rx="2" fill="#38d9ff" />
              </g>
            );
          })}
          <Bulbs
            points={Array.from(
              { length: 12 },
              (_, i) => [295 + i * 19, g - 206 - Math.sin((i / 11) * Math.PI) * 22] as const,
            )}
            color="#ffe2a8"
          />
        </g>
      );
    }
  }
}
