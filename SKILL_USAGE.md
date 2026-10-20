# Skill & Tooling Usage Log

This file records which Claude Code skills, agents, and MCP integrations exist in the
development environment, which were picked for AFTER HOURS, and where each was **actually**
used. A skill appears under "Actual usage" only once it has really been invoked.

_Last updated: 2026-10-13 (visual and functional overhaul)_

---

## 1. How the inspection was done

| Location checked | Result |
|---|---|
| `~/.claude/skills/` | `impeccable/` (v4.5.0, with `reference/` and `scripts/`), `synced/` (Anthropic-provided skills) |
| `.claude/skills/` (project) | Did not exist: the project directory was empty |
| `~/.claude/CLAUDE.md`, `./CLAUDE.md` | Neither exists |
| `~/.claude/agents/` | 4 custom agents (impeccable-*) |
| `~/.claude/plugins/installed_plugins.json` | `remotion@remotion` 4.0.534 |
| `~/.claude.json` → `mcpServers` | `playwright` |
| `.mcp.json` (project) | Did not exist |
| `~/.claude/settings.json` | Only plugin enablement and theme; no hooks or permission rules |

## 2. Discovered skills

| Skill | Source | Relevant to AFTER HOURS? |
|---|---|---|
| `impeccable` | user (`~/.claude/skills`) | **Yes.** Frontend design, dashboards, accessibility, motion, and polish |
| `dataviz` | built-in | **Yes.** Charts, KPI tiles, sparklines, and dashboard palettes |
| `code-review` | built-in | **Yes.** Correctness review at milestones |
| `security-review` | built-in | **Yes.** Auth, RBAC, and WebSocket review before Phase 10 |
| `simplify` | built-in | **Yes.** Cleanup pass after major features |
| `run` | built-in | **Yes.** Launch the app and verify features in a real browser |
| `init` | built-in | **Yes.** Generate the project `CLAUDE.md` once the foundation exists |
| `fewer-permission-prompts` | built-in | Optional (developer ergonomics) |
| `mcpmarket-me:emilkowalski-motion` | plugin | **Yes, for Phase 10.** Restrained micro-interactions |
| `anthropic-skills:built-in-browser` | synced | **Yes.** Visual checks in the app's browser pane |
| `artifact-design`, `artifact-diagramming` | built-in | Optional (shareable case-study page) |
| `anthropic-skills:deep-research` | synced | Not planned. Requirements are already specified |
| `remotion:*` (12 skills) | plugin | Possible stretch goal: a demo video for the portfolio |
| `mcpmarket-me:liquid-glass-design`, `mcpmarket-me:wpds` | plugin | **No.** Their aesthetics conflict with the brief (WordPress, glassmorphism) |
| `docx`, `pptx`, `xlsx`, `pdf`, `docs`, `google-workspace` | synced | No. Documentation lives in Markdown in the repo |
| `claude-api`, `schedule`, `loop`, `morning`, `import-memory`, `consolidate-memory`, `skill-creator`, `setup-claude`, `computer-use`, `chrome-browser`, `explain-usage`, `update-config`, `keybindings-help`, `plugin-authoring` | built-in/synced | Not relevant to the build |

## 3. Available agents

| Agent | Planned use |
|---|---|
| `Explore` | Codebase sweeps once the repo grows (e.g. checking that docs match code in Phase 11) |
| `Plan` | Second opinion on complex designs such as the event-replay protocol |
| `general-purpose` | Parallel independent work, only if it clearly pays off |
| `impeccable-finish-reviewer` | Review the finished UI against the design direction (Phase 10) |
| `impeccable-documenter` | Record `DESIGN.md` from the shipped UI (Phase 10) |
| `impeccable-asset-producer` | Only if raster assets are needed. The park map is planned as hand-authored SVG |
| `impeccable-manual-edit-applier` | Only used through impeccable's live-edit mode |
| `claude-code-guide`, `statusline-setup` | Not relevant |

## 4. MCP integrations

| Server | Use |
|---|---|
| `playwright` (user-configured) | Interactive UI verification and screenshots for the README |
| Claude Browser (built-in pane) | Preview the dev servers during development |
| Figma | Not planned. No Figma source of truth exists for this project |
| Claude in Chrome | Not planned. Would only be used if the user asks for it |
| Claude Docs connector | Not used. Docs must live in the repo |
| `mcpmarket-me` | Plugin server (was still connecting during inspection); provides the motion skill |

## 5. Development toolchain (as found)

| Tool | Status | Impact |
|---|---|---|
| Node | v26.10.0 ✅ | |
| npm | 11.19.1 ✅ | |
| git | 2.55.0 ✅ | |
| Homebrew | 7.0.8 ✅ | Can install the missing tools (with approval) |
| Python | System 3.9.6 → **3.12.15 installed via uv** (project-local) ✅ | |
| Docker / Compose | **Not installed** | Owner chose Supabase plus native services instead (ADR-0004). CI uses service containers |
| PostgreSQL | **17.11 via Homebrew** (installed Phase 3) ✅ | Local dev and test DBs. Supabase for hosted |
| Redis | **via Homebrew** (installed Phase 3) ✅ | |
| k6 | **2.3.0 via Homebrew** (installed Phase 3) ✅ | |
| uv | **0.13.0 via Homebrew** (installed Phase 3) ✅ | |
| gh CLI | Not installed | Not needed until publishing, which requires approval |

## 6. Skill-to-phase plan

| Phase | Skills / agents planned |
|---|---|
| 1. Environment inspection | (manual inspection; produced this file) |
| 2. Architecture | `Plan` agent (optional second opinion) |
| 3. Foundation | `init` was planned for CLAUDE.md; CLAUDE.md was written by hand instead (see log) |
| 4. Dashboard + attraction mgmt | `impeccable` (shape → build), `dataviz` |
| 5. Park map | `impeccable`, `artifact-diagramming` principles only if useful |
| 6. Event engine + simulation | `code-review` |
| 7. Maintenance + RBAC | `security-review`, `code-review` |
| 8. Analytics + observability | `dataviz` |
| 9. Testing + load testing | `run`, Playwright MCP |
| 10. Polish + deployment prep | `impeccable` (audit/polish), `mcpmarket-me:emilkowalski-motion`, `impeccable-finish-reviewer`, `impeccable-documenter`, `security-review`, `simplify` |
| 11. Docs + interview prep | `Explore` (docs-vs-code consistency check) |

## 7. Actual usage log

| Date | Phase | Skill / agent / tool | What it did |
|---|---|---|---|
| 2026-10-13 | 1 | _(none: manual shell inspection)_ | Inventoried skills, agents, plugins, MCP servers, and the toolchain |
| 2026-10-13 | 2 | _(none)_ | Architecture and ADRs written directly. The optional `Plan` agent was not used |
| 2026-10-13 | 3 | `anthropic-skills:built-in-browser` | Loaded before driving the browser pane. Used it to sign in, verify session restore, and read console errors (which surfaced the Next 16 `instant` validation issue) |
| 2026-10-13 | 3 | Claude Browser MCP (`preview_start`, `find`, `form_input`, `get_page_text`, `read_console_messages`) | Manual E2E verification of the login → command-center flow |
| 2026-10-13 | 3 | _(not used)_ `init` | CLAUDE.md was written by hand, because the planned contents (environment quirks, rules) were already known |
| 2026-10-13 | Overhaul | `mcpmarket-me:emilkowalski-motion` | Invoked and read. Its rules were applied: 140/180/220 ms tokens, one ease-out curve, transform/opacity only, one-shot pulses (no decorative loops), short staggers, and a global `prefers-reduced-motion` fallback (`globals.css`) |
| 2026-10-13 | Overhaul | `mcpmarket-me:liquid-glass-design` | Invoked. **The installed file is an empty stub**: a Japanese "translation in progress" placeholder pointing at a Windows path (`D:/tmp/...`) that doesn't exist. No guidance could be applied. Glass was implemented from the user's brief instead |
| 2026-10-13 | Overhaul | `mcpmarket-me:wpds` | Invoked. It's a catalogue entry for the WordPress Design System that defers to an upstream bundle. Not used: off-brief, and installing it would modify skills (needs approval) |
| 2026-10-13 | Overhaul | `dataviz` | Followed its procedure. Ran `validate_palette.js` (dark mode, surface #0D1B2A): the first palette FAILED the lightness band; the re-stepped `#10A3C9 #9B6DFF #DB5E9A #4F7FF0` PASSED every check. Applied single-series titling, legend plus direct labels for 4 series, crosshair tooltips, no dual axes, status colors reserved |
| 2026-10-13 | Overhaul | `impeccable` | Ran `impeccable context`. Did `init`: one interview round with 3 questions answered by the user, then wrote `PRODUCT.md`. Recorded the direction contract via `surface-brief write` (code-led, since the brief pinned the direction). Read `craft-floor.md` and `mode-operate.md`. Ran `impeccable detect --json apps/web/src`: 0 findings |
| 2026-10-13 | Overhaul | `impeccable-finish-reviewer` agent | Spawned with the direction contract and desktop/mobile captures. **Disposition: fix.** Eight material findings were all applied and re-verified in the browser: chart above the fold (885 px < 900), map overlays moved off the park, label anchors moved, status control unclipped (5 × 105 px), pulse/flash back to 220 ms, marker size floor and visible "Live" label, honest scales (min..max wait bars, 90–100% uptime domain, de-overlapped end labels, park-time MTTR), and glyph arrows replaced with icons. Its "ceiling" notes (richer land art, idle map motion) are recorded as follow-ups, not done |
| 2026-10-13 | Overhaul | Claude Browser MCP | End-to-end verification of every screen and flow at 1440×900 and 390×844 |
| 2026-10-14 | Redesign v2 | `impeccable` | After the user's "feels clearly made by AI" feedback, the v1 world was replaced. Recorded a new direction contract (`surface-brief write`); `impeccable detect --json apps/web/src` returned 0 findings on v2 |
| 2026-10-14 | Redesign v2 | `impeccable-documenter` agent | Re-run to replace DESIGN.md / design.json, which described the discarded v1 world |
| 2026-10-14 | Redesign v2 | Claude Browser MCP | Verified every v2 screen at 1440×900 and 390×844 (no horizontal overflow) |
| 2026-10-20 | Testing | Playwright (npm `@playwright/test` 1.63.0, not the MCP) | Automated E2E suite. The Playwright MCP still can't start (it needs Google Chrome); the test runner uses its own cached Chromium build |
| 2026-10-13 | Overhaul | `playwright` MCP | Attempted for reduced-motion emulation. **Failed to start**: it requires Google Chrome, which isn't installed. Not used |

## 8. Limitations

- Docker, PostgreSQL, Redis, and k6 are absent, so infrastructure-dependent work cannot be
  **run** until the user approves installing them. Code and configuration can still be written,
  and this file will say plainly what has and has not been executed.
- The desktop app's `preview_start` launcher could not read this iCloud-synced folder
  ("Operation not permitted"), so dev servers are started from the shell and the browser pane
  opens their URLs.
- No existing skill, agent, or configuration was modified.
