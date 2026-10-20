---
version: 1
slug: "apps-web-src-app"
primary_target: "apps/web/src/app"
related_targets: []
---

# Surface: AFTER HOURS operations app (apps/web)

Scope: Command Center (/), Park Map (/map), Attractions, Attraction Details (/attractions/[slug]), Maintenance (/maintenance), Analytics, Sign-on. Mode: **Operate**.
Audience/job: hiring reviewers who must see a live, credible system in under 60s; simulated park operators who monitor and act.
Constraints: user-pinned palette (navy grounds, #367BFF primary, cyan live accent, purple = simulation, status green/amber/red) refined for AA; all IP original; simulated data labeled.
History: v1 followed the user's reference mockup. The user judged it "clearly made by AI", so v2 became a ruled "operations console". On 2026-10-20 the user asked to "match that mockup photo i gave you as close as i can" and declined paid image generation. v3 (below) returns to the mockup's world, with every illustration hand-built in SVG.

## Direction contract (v3, 2026-10-20)

FORM: The user's reference mockup is the comp. Code-led: no raster art, because the user declined paid image generation. The mockup's castle centerpiece is replaced by the original lighthouse beacon. No Disney IP.

THESIS: A night-time park operations app that looks like the mockup (glass panels, KPI cards with ring, bars, gauge and alert visuals, an illustrated park map with pill markers) while every visual plots real simulated values.

OWN-WORLD: Navy grounds with soft radial glows. Glass panels (82% surface, 20px blur, white/8% border, 16px radius) with reduced-transparency fallbacks. Inter for UI and JetBrains Mono only for IDs. Rounded-full chips and badges. Per-ride-type gradient icon circles (lib/ride-type.ts). Status colors stay reserved for state.

SIGNATURE: The illustrated night park (park-art.tsx): lands with landmarks (aurora peaks, canyon gear tower, harbor, lantern tree, pier Ferris wheel), lit promenade paths, a lagoon lighthouse, and pill markers showing icon, wait and name. Plus procedural ride scenes (ride-art.tsx) for cards, the map panel and the detail hero. State changes pulse once on the marker, card and feed row.

SCREENS: Command Center (greeting, 4 KPI cards, map, Live Activity, Guest Flow); Park Map; Attractions card grid; Attraction Details (hero, Open attraction, tabs Overview / Live Data / Maintenance / History, stat cards); Create maintenance ticket modal (segmented issue type, Low/Medium/High/Critical, assign-to chips); Maintenance; Analytics; Sign-on (glass role card beside the park art).

RISK: This look is generic by default. Mitigated by the original illustrated park and ride art, factual copy, and data-bearing visuals only.
