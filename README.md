# pi-kit

My [pi](https://github.com/earendil-works/pi-coding-agent) setup as one package: the bottom
chrome, compact tool rows, idle compaction and the skills I work with.

## Install

```bash
pi install git:github.com/edmand46/pi-kit
```

From a local checkout, so edits apply after `/reload`:

```bash
pi install ./pi-kit
```

`pi list` shows what is installed, `pi remove <source>` drops it, `pi update` reconciles a git
checkout. Restart pi or run `/reload` after installing.

The package declares its resources under `pi` in `package.json`, so nothing is discovered by
convention and nothing outside `extensions/` and `skills/` loads.

## Extensions

### `bottom`

Unified bottom chrome for pi: a dashboard, a framed editor and a one-line status footer that
share the same data and theme. Hides itself on terminals narrower than 80 columns or shorter
than 30 rows.

![bottom chrome in pi](assets/bottom.png)

`/bottom` toggles and configures the pieces, `f2` toggles the dashboard. The full command and
config reference is in [`extensions/bottom/README.md`](extensions/bottom/README.md).

### `log-style`

Replaces the built-in tool call rows for `read`, `bash`, `edit`, `write`, `grep`, `find` and `ls`
with one compact line each — label, target, the facts that matter (`+142 −38`, match counts, line
ranges, exit status) — and keeps the detail behind the usual expand.

![log-style tool rows](assets/log-style.png)

### `idle-compact`

Compacts the session when you leave it alone, so the prompt cache is still hot and you come back to
a small context instead of a long one. The timer starts when the agent settles, and any input
resets it.

It compacts once per idle stretch, and only when the context is at least `minTokens` and has grown
since the last idle compact — an empty or already small session is left alone. The summary is
written for continuation: what we are working on, the decisions and why, the files touched, the
next steps and the open questions. Successful compacts leave one dim `idle compact · 15 min idle ·
84k → 12k tokens` line in the transcript; a failed one leaves the error there and is not retried
until you are back. TUI only.

Config is optional and lives in `~/.pi/agent/idle-compact.json`:

```json
{ "idleMinutes": 15, "minTokens": 20000 }
```

## Skills

| Skill | What it does |
| --- | --- |
| `orchestrator` | Plans and verifies in the main session, delegates every change to worker subagents |
| `grilling` | Interviews you through `ask_user_question` in rounds until a plan has no assumptions left |
| `frontend-design` | Aesthetic direction, typography, palette, layout and motion for pages whose look matters |

`orchestrator` needs the `subagent` tool, `grilling` needs `ask_user_question`. `frontend-design`
is vendored from `anthropics/claude-plugins-official` and `anthropics/claude-cookbooks`; its
licenses sit next to the skill.

## Companion packages

These are separate pi packages, installed once into personal settings:

```bash
pi install npm:@juicesharp/rpiv-todo
pi install npm:@juicesharp/rpiv-ask-user-question
pi install npm:@juicesharp/rpiv-advisor
pi install npm:@dietrichgebert/ponytail
pi install npm:pi-memory
pi install npm:pi-subagents
pi install npm:pi-web-access
```

## Config the package does not carry

`pi install` only manages extensions, skills, prompts and themes. The rest of my setup is
`~/.pi/agent`, and this repo keeps a copy of it in [`config/`](config) so a new machine can be
rebuilt from here. Copy the files over by hand — nothing restores them automatically:

`settings.json` — theme, default model, tool defaults, compaction and the package list:

```json
{
  "theme": "dark",
  "defaultProvider": "deepseek",
  "defaultModel": "deepseek-flash",
  "defaultThinkingLevel": "max",
  "hideThinkingBlock": true,
  "enableInstallTelemetry": false,
  "collapseChangelog": false,
  "defaultProjectTrust": "always",
  "terminal": {
    "showTerminalProgress": true
  },
  "packages": [
    "git:github.com/edmand46/pi-kit",
    "npm:@dietrichgebert/ponytail",
    "npm:@juicesharp/rpiv-advisor",
    "npm:@juicesharp/rpiv-ask-user-question",
    "npm:@juicesharp/rpiv-todo",
    "npm:pi-memory",
    "npm:pi-subagents",
    "npm:pi-web-access"
  ],
  "defaultTools": [
    "+grep",
    "+find",
    "+ls"
  ],
  "compaction": {
    "reserveTokens": 120000,
    "keepRecentTokens": 1000
  },
  "subagents": {
    "defaultThinking": "high",
    "defaultModel": "deepseek/deepseek-flash",
    "agentOverrides": {
      "scout": {
        "thinking": "high"
      },
      "researcher": {
        "thinking": "high",
        "extensions": [
          "npm:pi-web-access"
        ]
      },
      "evidence-auditor": {
        "extensions": [
          "npm:pi-web-access"
        ]
      }
    }
  }
}
```

`mcp.json` — [Playwright MCP](https://github.com/microsoft/playwright-mcp) as a headless browser,
with the hot tools loaded directly and the rest of its 45 behind `tool_search`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "-y", "@playwright/mcp@0.0.84",
        "--headless", "--isolated", "--no-webmcp",
        "--caps", "vision,pdf,devtools",
        "--output-dir", "/tmp/playwright-mcp"
      ],
      "exposure": "deferred",
      "toolExposure": {
        "browser_navigate": "direct",
        "browser_snapshot": "direct",
        "browser_click": "direct",
        "browser_type": "direct",
        "browser_fill_form": "direct",
        "browser_take_screenshot": "direct",
        "browser_evaluate": "direct",
        "browser_press_key": "direct"
      },
      "description": "Headless Chromium (Playwright): navigate pages, click/fill, snapshots, screenshots, PDF and network/console inspection."
    }
  }
}
```

`--isolated` keeps the profile in memory, so logins do not survive a session; `--no-webmcp` stops
pages from registering their own tools; `--caps` adds PDF, vision and devtools tools; auto-named
screenshots and snapshots land in `/tmp/playwright-mcp`, which macOS clears on reboot. File access
stays restricted to the workspace root — no `--allow-unrestricted-file-access`. Against Cloudflare
and friends Playwright is detectable: prefer `web_search`/`fetch_content`, and treat a 403 as an
answer instead of fighting it.

`bottom.json` is written by the extension itself and every default lives in the code, so it only
needs to exist to override something:

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

`web-search.json` (the `pi-web-access` config) is not backed up with its keys: [`config/web-search.example.json`](config/web-search.example.json)
carries the routing and model with `<redacted>` in both key fields. Fill in your own keys after
copying it.

`auth.json`, `sessions/`, `models-store.json` and `memory/` stay on the machine: credentials, chat
history, the pi.dev model catalog cache (pi rebuilds it on its own) and long-term memory. Custom
providers or models, if I ever add any, would live in `models.json` — that file is not needed today.

## License

MIT. The `frontend-design` skill is third-party content under its own licenses, kept in
`skills/frontend-design/`.
