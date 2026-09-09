---
name: netsignal
description: Set up, tune, or remove the netsignal internet-speed indicator in the Claude Code status line. Use for "/netsignal", "show internet speed in the status line", "network signal bars", "why is the signal grey/red", "turn off the bandwidth check".
---

# netsignal

A background sampler measures time-to-first-byte to `api.anthropic.com` every 30 s and
download speed every 5 min, and the status line shows `▂▄▆ 48ms ↓19M` in green / yellow / red.
The sampler exits on its own after 15 min without a status-line render, and is restarted by
the SessionStart hook or the next render.

The script is `${CLAUDE_PLUGIN_ROOT}/bin/netsignal`. Run it with Bash; never edit
`settings.json` by hand for this — `install` and `uninstall` do it safely with jq and
preserve the user's existing status line by wrapping it.

## Tasks

- **Install / enable**: `"${CLAUDE_PLUGIN_ROOT}/bin/netsignal" install`. Tell the user the
  signal appears after their next prompt. If they use ccstatusline instead of a plain
  status line, do NOT run install; tell them to add a Custom Command widget with command
  `"${CLAUDE_PLUGIN_ROOT}/bin/netsignal" render`.
- **Remove**: `"${CLAUDE_PLUGIN_ROOT}/bin/netsignal" uninstall` restores the previous status line.
- **Diagnose**: `"${CLAUDE_PLUGIN_ROOT}/bin/netsignal" status` prints the last sample
  (`latency_ms` 0 = unreachable; a stale `ts` means the sampler is not running — run `start`).
  Grey `▂▄▆ ?` = no fresh sample; `✕ offline` = api.anthropic.com unreachable.
- **Tune**: thresholds and intervals are env vars read by the status-line command. To make
  them persistent, prefix them in the `statusLine.command` string in settings.json, e.g.
  `NETSIGNAL_STYLE=short NETSIGNAL_GOOD=200 "/path/bin/netsignal" statusline`.
  Variables: `NETSIGNAL_STYLE` (bars|short|full), `NETSIGNAL_GOOD/OK/BAD` (ms),
  `NETSIGNAL_INTERVAL`, `NETSIGNAL_BW_INTERVAL` (0 disables bandwidth), `NETSIGNAL_LATENCY_URL`,
  `NETSIGNAL_BW_URL`.

Ask before changing thresholds the user did not mention; report the exact command you ran.
