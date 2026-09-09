# claude-netsignal

Internet signal bars in the Claude Code status line.

```
Fable · code · 42k · ▂▄▆ 48ms ↓19M
```

- **Latency**: time-to-first-byte to `api.anthropic.com`, sampled every 30 s. That is the
  network Claude Code actually feels, not a generic ping.
- **Bandwidth**: a 3 MB download every 5 min (Cloudflare's speed endpoint by default —
  Anthropic serves no large static body, so a bandwidth probe against `api.anthropic.com`
  would only measure latency twice).
- **Colour**: green under 300 ms, yellow under 700 ms, red above; `✕ offline` when
  unreachable; grey `▂▄▆ ?` when there is no fresh sample.

The status line never touches the network itself. A tiny background sampler writes one JSON
file, the status line reads it, and the sampler exits by itself 15 minutes after the last
render, so nothing keeps running once you close Claude Code.

## Install

```
/plugin marketplace add avazibra/claude-netsignal
/plugin install netsignal@claude-netsignal
/netsignal
```

`/netsignal` runs the install step, which points `statusLine` in `~/.claude/settings.json` at
the plugin. If you already have a status line it is kept and the signal is appended to it.
`/netsignal` also removes it or tunes thresholds on request.

Manual equivalents: `bin/netsignal install`, `bin/netsignal uninstall`, `bin/netsignal status`.

### With ccstatusline

Skip `install` and add a **Custom Command** widget running `<plugin-dir>/bin/netsignal render`.

## Configure

Environment variables, read by the status-line command (prefix them in the
`statusLine.command` string to make them persistent):

| Variable | Default | Meaning |
|---|---|---|
| `NETSIGNAL_STYLE` | `full` | `bars` (▂▄▆), `short` (+ ms), `full` (+ Mbps) |
| `NETSIGNAL_GOOD` / `OK` / `BAD` | 300 / 700 / 1500 | latency thresholds, ms |
| `NETSIGNAL_INTERVAL` | 30 | seconds between latency samples |
| `NETSIGNAL_BW_INTERVAL` | 300 | seconds between bandwidth samples; `0` disables |
| `NETSIGNAL_IDLE` | 900 | sampler exits after this many seconds without a render |
| `NETSIGNAL_LATENCY_URL` | `https://api.anthropic.com/` | latency target |
| `NETSIGNAL_BW_URL` | `https://speed.cloudflare.com/__down?bytes=3000000` | bandwidth target |
| `NETSIGNAL_INNER` | | a status-line command to run first and prepend |

Requires `bash`, `curl`, `awk`; `jq` only for `install`/`uninstall`. macOS and Linux.

## Layout

```
.claude-plugin/plugin.json      plugin manifest
.claude-plugin/marketplace.json this repo doubles as its own marketplace
hooks/hooks.json                SessionStart → starts the sampler
skills/netsignal/SKILL.md       /netsignal: install, remove, tune, diagnose
bin/netsignal                   sampler + renderer + installer (one bash script)
```

Plugins cannot set `statusLine` themselves, which is why install is a skill step rather than
automatic.

## License

MIT
