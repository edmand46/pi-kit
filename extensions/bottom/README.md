# bottom

Unified bottom chrome for pi: a dashboard, a framed editor, and a one-line
status footer that all share the same data and theme.

```
▏ ⠋ working · bash npm test 3.2s · edit server.go 1.1s                 queued
▏ main* ↑1 ↓2 · 3 changed · +142 −38                            last turn 1.2s
╭─ ⠋ working · deepseek-flash · high ──────────────────────── bash npm test 3.2s ─╮
│ hello world                                                                      │
╰─ ~/project · main* ↑1 ↓2 · ±3 · +142 −38 ──────────────── my session · 12m 04s ─╯
ctx 34% ███░░░░░ · ↑12.3k ↓4.1k · 34 t/s · avg 28 · ⟳ 82% · $0.042           10:42
```

The dashboard hides automatically on short or narrow terminals. Its exact
thresholds are `rows >= 30` and `columns >= 80`.

## Install

It ships in this package, so `pi install` loads it on startup. After changing
the files, run `/reload` (or restart pi); the chrome is installed on
`session_start`. If the extension was already loaded while disabled,
`/bottom on` enables it without a restart.

The extension is TUI-only. It does nothing in JSON, print, or RPC modes.

## Layout

Order from top to bottom:

1. **Dashboard** (`/bottom dashboard`, `f2`) — active tools with live timers,
   last tool result, turn count, git branch/dirty/diff/ahead-behind, last turn
   duration.
2. **Framed editor** — rounded border with state, model, thinking level, active
   tools and timers on top; cwd, branch, git summary, session name and elapsed
   time below. The side borders keep one column of padding around the text.
3. **Footer** — context gauge, token totals, generation speed, cache hit rate,
   cost, extension statuses from other extensions (`ctx.ui.setStatus`), and a
   clock with the DeepSeek peak-price state: `11:43 ☀ peak · ⏱ 04–07,
   09–13`, `11:43 ☾ off-peak · weekend`. Peak is 01:00–04:00 and
   06:00–10:00 UTC on UTC weekdays; the windows are shown in the local zone.
   The icons follow `/bottom icons` (`☀ ☾ ⏱` on unicode and nerd, none on
   ascii).

The generation speed is the last answer's `output ÷ durationMs` and, after the
separator, `Σoutput ÷ ΣdurationMs` over every answer in the session branch.
Reasoning tokens and the reasoning time are both included. While an answer is
still streaming, and when the last answer has no timing (aborted, an error, or
a message written before timings existed), the last value is `—`. A rate below
1 token per second also renders as `—`.

The footer is exactly one line, so the chrome never costs more than the framed
editor's two border rows plus the optional two dashboard rows.

## Commands

| Command | Meaning |
|---|---|
| `/bottom` | Show the current state |
| `/bottom on` / `off` | Enable or disable all bottom chrome |
| `/bottom dashboard` | Toggle the dashboard |
| `/bottom icons unicode\|ascii\|nerd` | Choose the glyph set |
| `/bottom frame [on\|off]` | Toggle the framed editor |
| `/bottom spinner [on\|off]` | Toggle the animated spinner |
| `/bottom placement above\|below` | Put the dashboard above or below the editor |
| `/bottom show <segment> [on\|off]` | Toggle one footer/model segment |
| `/bottom reset` | Restore defaults |
| `/bottom config` | Save and print the config path |

`f2` toggles the dashboard without leaving the editor.

Segments for `/bottom show`: `ctx`, `tokens`, `tps`, `cost`, `cache`, `model`,
`thinking`, `cwd`, `git`, `session`, `clock`, `tool`, `statuses`.

## Config

The config is stored at `<agent-dir>/bottom.json` (default
`~/.pi/agent/bottom.json`):

```json
{
  "enabled": true,
  "dashboard": "auto",
  "dashboardPlacement": "aboveEditor",
  "icons": "unicode",
  "frameEditor": true,
  "spinner": true,
  "show": {
    "ctx": true,
    "tokens": true,
    "tps": true,
    "cost": true,
    "cache": true,
    "model": true,
    "thinking": true,
    "cwd": true,
    "git": true,
    "session": true,
    "clock": true,
    "tool": true,
    "statuses": true
  }
}
```

`dashboard` accepts `"auto"`, `"on"`, or `"off"`. `auto` shows the dashboard
only when the terminal is at least 30 rows and 80 columns.

## Notes

- Everything uses theme tokens (`accent`, `success`, `warning`, `error`,
  `muted`, `dim`, `borderMuted`, `thinking*`), so it follows `system`, `dark`,
  `light`, and custom themes.
- `icons: "unicode"` uses braille spinners, block gauges, and box-drawing
  characters that work in most terminals. Use `"ascii"` when a font lacks
  them, or `"nerd"` for Nerd Font glyphs.
- The extension hides pi's built-in working row and draws its own spinner in
  the editor border. Retry, compaction, and branch-summary indicators from pi
  still appear normally.
- Git stats are collected with debounced `git status --porcelain=v2` and
  `git diff HEAD --numstat` calls after tools settle, plus `HEAD` watcher
  events from pi.
- Other extensions' `setStatus()` texts stay visible in the footer.
- The editor keeps pi's keybindings by extending `CustomEditor`; only the
  rendering and the minimum padding are changed.

## Development

Use `/reload` for code changes. Smoke-test in both fullscreen and regular
mode: type, open `/` autocomplete, resize through 120 → 80 → 40 columns, try
CJK/emoji text, switch theme (dark/light/system), and run a tool so the
dashboard gets timers and git stats.

For type-checking, point a `tsconfig.json` at the installed pi package's
`@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` declarations and
run `tsc --noEmit`.

For raw ANSI debugging set `PI_TUI_WRITE_LOG=<file>` before starting pi.
