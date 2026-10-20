---
name: AFTER HOURS
description: Operations console for the fictional Lanternfall Park. Dense, ruled, typographic; every operational number is simulated.
colors:
  canvas: "#07111f"
  surface: "#0d1b2a"
  surface-raised: "#13243a"
  surface-hover: "#182d47"
  line: "#1d3150"
  line-strong: "#2b4569"
  ink: "#e8eef7"
  ink-muted: "#9db0ca"
  ink-faint: "#7a8eab"
  primary: "#367bff"
  primary-fill: "#2559d9"
  primary-fill-hover: "#2f66ea"
  cyan: "#38d9ff"
  purple: "#9b6dff"
  ok: "#35d49a"
  warn: "#ffb84d"
  crit: "#ff5964"
  closed: "#8a9bb5"
  refurb: "#b3a4d6"
  series-1: "#10a3c9"
  series-2: "#9b6dff"
  series-3: "#db5e9a"
  series-4: "#4f7ff0"
  land-tidewater: "#0f2e45"
  land-clockwork: "#2a2316"
  land-aurora: "#1a1d45"
  land-emberwood: "#122d1f"
  land-starlight: "#251a3c"
  water: "#050d19"
typography:
  display:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.025em"
  display-detail:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.025em"
  wordmark:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.12em"
  title:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.43
  body:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.43
  body-sm:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "0.06em"
  tag:
    fontFamily: "Barlow Condensed, Barlow, ui-sans-serif, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.05em"
  numeral-lg:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "\"tnum\""
  numeral:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1
    fontFeature: "\"tnum\""
rounded:
  xs: "2px"
  sm: "3px"
  md: "4px"
  xl: "6px"
  full: "9999px"
spacing:
  hairline: "1px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary-fill}"
    textColor: "#ffffff"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.primary-fill-hover}"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-hover}"
  button-ghost:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
  text-field:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  nav-item:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  nav-item-active:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.ink}"
  filter-chip:
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  status-tag:
    typography: "{typography.tag}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  ride-code-tag:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.numeral}"
    rounded: "{rounded.xs}"
    padding: "4px 6px"
  ride-code-tag-down:
    textColor: "{colors.crit}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "16px"
  sheet:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.xl}"
  status-board-cell:
    backgroundColor: "{colors.surface}"
    padding: "12px 16px"
---

> **Out of date (2026-10-20).** This file records the v2 "operations console" system. The app
> now ships v3, which follows the reference mockup: glass panels, Inter, rounded chips, an
> illustrated map, and ride art. The direction is in `.impeccable/surfaces/apps-web-src-app.md`
> and the tokens in `apps/web/src/app/globals.css`. Regenerate this file from the shipped build.


# Design System: AFTER HOURS

## Overview

**Creative North Star: "The Shift Console"**

AFTER HOURS is an operations console an operator could run a night shift on. It is dense, ruled and typographic: flat navy grounds divided by hairline rules, signage-derived lettering, and every measured number set in a monospace so digits never jump as values tick. The park is drawn as an operations plan, not an illustration: straight-edged zones on a survey grid, transit-diagram paths, and three-letter ride codes like a departures board.

The system refuses the AI-dashboard default it replaced: glowing frosted cards, ring and gauge KPI tiles, illustrated maps and hero art. Depth is earned only by things that actually float (map overlays, sheets, toasts, dialogs), and they float as solid ruled sheets with an offset shadow, never as glass. Color does jobs only: cyan means live or selected, purple means simulation, and the five status colors mean state and nothing else.

Austerity is the risk of this world; it is offset by precision rather than decoration: consistent hairlines, a strict type split, and real data density.

**Key Characteristics:**
- Flat navy grounds; hairline rules drawn as 1px gaps over the line color.
- Barlow for UI, Barlow Condensed caps for headings and column labels, JetBrains Mono for every measured number.
- Square, instrument-like corners (2px tags, 3-4px controls, 6px panels).
- Solid raised sheets with an offset shadow for anything floating; translucency only on modal backdrops.
- Schematic park plan with ride-code tags that spell out stopped states (DOWN / CLSD / RFB).
- One SIMULATION · FICTIONAL PARK indicator in the top bar, not a pill per panel.

## Colors

A night palette of layered navies with a single signal blue, one live cyan, one simulation violet, and a reserved status set; the palette is user-pinned and tuned for AA on the navy surfaces.

### Primary
- **Signal Blue** (primary): focus outlines, the browser accent color, selected-state borders and graphics. It fails AA as a fill under white text (3.8:1), so it never fills a control.
- **Deep Signal Fill** (primary-fill) and **Deep Signal Fill Hover** (primary-fill-hover): the only fills for primary buttons and the skip link; white text on them measures 6.0:1 and 5.0:1.

### Secondary
- **Lantern Cyan** (cyan): live and selected. The active nav bar and icon, the selected ride-code tag border, active filter chips, the gate-count meter, the one-shot state-change flash, the text caret and selection tint.

### Tertiary
- **Simulation Violet** (purple): simulation only. The top-bar SIMULATION · FICTIONAL PARK indicator, the demo-mode simulation control, SIM rows in the event log.

### Status
- **Running Green** (ok), **Delay Amber** (warn), **Downtime Red** (crit), **Closed Slate** (closed), **Refurb Lilac** (refurb): attraction state, work-order severity and connection state. Always paired with an icon or a spelled-out word.

### Neutral
- **Lanternfall Night** (canvas): page ground, top bar, map ground, text-field fill, stopped-ride tag fill.
- **Deep Harbor Navy** (surface): rail, panels, status-board cells, running-ride tag fill.
- **Raised Dusk** (surface-raised): floating sheets, secondary buttons, row hover.
- **Hover Dusk** (surface-hover): active nav item, selected map tag, control hover.
- **Hairline Navy** (line) and **Strong Hairline** (line-strong): rules, panel borders, the survey grid; strong for sheet borders, inputs and map paths.
- **Moonlit Ink** (ink, 14.9:1 on surface), **Fog Blue** (ink-muted, 7.9:1), **Faint Fog** (ink-faint, 5.2:1 on surface, 4.7:1 on raised): primary text, secondary text and labels, tertiary text and event ages.

### Chart and map
- **Series Teal / Violet / Rose / Blue** (series-1..4): chart series only, validated for dark mode on the surface navy.
- **Land tints** (land-tidewater, land-clockwork, land-aurora, land-emberwood, land-starlight) and **Lagoon Water** (water): zone fills on the park plan, drawn at 70% opacity (95% when highlighted).

### Named Rules
**The Color-Has-A-Job Rule.** Cyan is live or selected, purple is simulation, status colors are state. No accent appears for decoration.

**The Never-Color-Alone Rule.** Every status carries an icon or a word (WCAG 1.4.1); stopped rides on the map spell out DOWN, CLSD or RFB.

**The Fill-Not-Signal Rule.** Filled controls use primary-fill; Signal Blue is for focus, borders and graphics.

## Typography

**Display Font:** Barlow Condensed (with Barlow, ui-sans-serif)
**Body Font:** Barlow (with ui-sans-serif, system-ui)
**Label/Mono Font:** JetBrains Mono (with ui-monospace) for measured numbers

**Character:** Barlow descends from highway and transit signage: legible at a glance under pressure. The condensed cut, set in caps, is the instrument-panel lettering; the monospace makes numbers read as readings.

### Hierarchy
- **Display** (700, 26px, line-height 1, caps, 0.025em): page titles such as PARK OPERATIONS; the attraction detail title steps up to 30px.
- **Wordmark** (700, 18px, 0.12em, caps): AFTER HOURS in the rail; 30px on the sign-on page.
- **Title** (Barlow 600, 14px): panel and section headings ("Park map", "Event log"), sentence case.
- **Body** (Barlow 400, 14px; 13px for secondary lines): all running UI text; nav items at 15px.
- **Label** (Barlow Condensed 600, 12px, 0.06em, caps, ink-muted): status-board labels, column headers, form labels.
- **Tag** (Barlow Condensed 600-700, 11px, 0.05em, caps): status tags, event-log categories, stopped-state words, the simulation indicator.
- **Numeral** (JetBrains Mono 600, 24px on the status board; 11-12px in tags, log ages and clocks; tabular figures): every measured value.

### Named Rules
**The Measured-In-Mono Rule.** Any number that is a measurement (wait, count, percent, clock, age) is JetBrains Mono with tabular figures; its unit drops back to Barlow at a smaller, muted size.

**The Caps-Are-Condensed Rule.** Uppercase lettering is always Barlow Condensed with positive tracking; Barlow regular is never set in caps.

## Layout

A left rail (224px from 1024px up; a horizontal scrolling strip above that on small screens) and a sticky top bar frame a main column capped at 1600px with 16px gutters (24px from 1024px). Vertical rhythm is 16px between blocks. The Command Center stacks a title row (title left, mono park clock right, baseline-aligned), the status board, then a two-column grid from 1280px: map left, a 380px column of event log and gate-count chart right. Detail pages use a 360px side column from 1024px.

The status board is one ruled strip of four readings (two columns below 1024px), read left to right like a departures board. Tables and lists use 1px dividers rather than cards.

**The Hairline-Grid Rule.** Rules between adjacent cells are drawn as a 1px gap over the line color, so they stay exact at every width; never as stacked borders.

## Elevation & Depth

Flat by default. Grounds are separated tonally (canvas, surface, raised) and by hairlines. Only elements that float above content cast a shadow, and that shadow is neutral, offset downward, with negative spread, so it reads as a sheet lifted off a desk rather than a glow.

### Shadow Vocabulary
- **Sheet** (`box-shadow: 0 8px 20px -10px rgb(0 0 0 / 0.7)`): the raised-sheet treatment for map controls, filter bar, legend, attraction side sheet, toasts, dialogs and the command palette; always with a raised fill and a strong-hairline border.
- **Tag lift** (`box-shadow: 0 3px 8px -4px rgb(0 0 0 / 0.9)`): ride-code tags on the park plan.

### Named Rules
**The Solid-Sheet Rule.** Floating surfaces are opaque raised sheets with a hairline and an offset shadow. No backdrop blur on any sheet.

**The One-Translucency Rule.** Translucency is reserved for modal backdrops (the dialog and the command palette dim the console; the dialog adds a 2px blur). Nothing else is see-through.

## Shapes

Square, instrument-like corners: 2px on ride-code tags, tooltips and the map's ticket badge; 3px on status and state tags, filter chips and the simulation indicator; 4px on buttons, inputs, nav items, segmented controls and the status board; 6px on panels, the map frame and floating sheets. Full rounding is reserved for indicator dots (status dots, the live lamp) and the nav rail's active bar. The park plan is drawn in straight segments: polygonal zones, an octagonal promenade ring with 45-degree spurs, a dashed centerline, on a 25-unit survey grid with a 125-unit major grid.

**The Straight-Edge Rule.** Map geometry is polygons and straight segments only; no organic coastlines or curves.

## Components

### Buttons
Compact and quiet; weight comes from fill, not size.
- **Shape:** 4px corners; 36px tall (32px small) with 14px (12px small) side padding; Barlow 500.
- **Primary:** Deep Signal Fill with white text; hover to the hover fill.
- **Secondary:** Raised Dusk fill, ink text, hairline border that strengthens on hover.
- **Ghost:** muted text, raised fill on hover. **Danger:** a 14% red wash with red text and a 40% red border.
- **Motion:** background, border and color transition over 140ms ease-out; press scales to 0.98. Disabled is 50% opacity.

### Chips
- **Style:** map filter chips are 3px-cornered outlines with 13px Barlow 500; unselected muted text on a faint border.
- **State:** selected chips take a 70% cyan border and a 14% cyan wash with ink text. Status filters carry the status icon.

### Status and state tags
- **Status tag:** Barlow Condensed caps on a 12-14% wash of the status color, status-color text, status icon first. Labels: OPERATING, DELAYED, DOWN, CLOSED, REFURBISHMENT.
- **Work-order state tag:** the same shape with a current-color dot.
- **Severity badge:** SEV1-SEV4 in JetBrains Mono on a wash with an inset ring of the same hue.

### Cards / Containers
- **Panel:** Deep Harbor Navy, hairline border, 6px corners, 16px padding (12px x 16px for compact stat panels). Panel headings are sentence-case titles.
- **Status board:** the hairline-grid strip; each cell is a label, a 24px mono reading and a 13px muted sub-line. A cell in alert takes a 6% red wash over the surface; the gate cell carries a 4px capacity meter (cyan, amber past 75%, red past 90%).
- **Sheet:** the solid raised sheet (see Elevation) at 6px corners.

### Inputs / Fields
- **Style:** canvas fill, strong-hairline border, 4px corners, 8px x 12px padding, faint placeholder.
- **Focus:** border shifts to Signal Blue; elsewhere the global focus ring is a 2px Signal Blue outline at 2px offset.
- **Labels:** the condensed caps label style above the field.

### Navigation
- **Rail:** surface fill with a right hairline; wordmark block on top, nav list, then the signed-on user with condensed initials in a 4px outlined square.
- **Items:** 15px Barlow, muted, with a 16px line icon; hover raises the fill and nudges the icon 2px right. Active takes the hover-navy fill, ink text, a cyan icon and a 2px cyan bar at the left edge.
- **Top bar:** canvas fill with a bottom hairline; command search left; simulation indicator, live link lamp and simulation controls right.

### Event Log
Rows are ordered newest first and divided by hairlines. Each row: a right-aligned mono age column (now, 12s, 4m, 2h) rather than a second clock, a condensed caps category in its tone (STATUS, CONFIG, WORK ORDER, SIM), a 13px ink title and a truncated muted detail line. New rows flash cyan once.

### Ride-Code Tag (signature)
The park plan's marker: a 2px-cornered two-cell tag. Left cell, the three-letter ride code in condensed caps; right cell, separated by a hairline, the posted wait in mono with a small muted "m", or the spelled-out stopped state (DOWN, CLSD, RFB) in condensed caps in its status color. Running rides sit on surface, stopped rides on canvas, down rides on a 20% red wash with a red border; selected tags take a cyan border, hover-navy fill and a cyan outline. An open work order adds a small amber wrench badge at the corner. A state change pulses a ring once (220ms) on the tag, the matching log row and the board cell.

### Simulation Indicator
One 3px-cornered violet outline in the top bar reading SIMULATION · FICTIONAL PARK in condensed caps, with a tooltip explaining what is generated. Charts and tooltips add "simulated" inline where a value is read out.

## Do's and Don'ts

### Do:
- **Do** set every measured number in JetBrains Mono with tabular figures, and its unit in smaller muted Barlow.
- **Do** draw cell rules as a 1px gap over the line color (the Hairline-Grid Rule).
- **Do** make anything floating an opaque raised sheet with a strong hairline and the sheet shadow.
- **Do** pair every status color with an icon or a spelled-out word, including DOWN / CLSD / RFB on the map.
- **Do** keep motion to 140-220ms ease-out on transform, opacity and color; state changes pulse once at 220ms; honor reduced motion.
- **Do** use semantic color tokens from globals.css in components.

### Don't:
- **Don't** use backdrop blur or translucent fills on panels or sheets; translucency belongs to modal backdrops only.
- **Don't** build KPI ring or gauge cards, illustrated map art or hero images; the board is typographic and the map is schematic.
- **Don't** add a "simulated" pill to each panel; the top-bar indicator carries it.
- **Don't** use Signal Blue as a fill under white text.
- **Don't** use cyan, violet or a status color decoratively.
- **Don't** round corners past 6px, or fully round anything other than an indicator dot.
