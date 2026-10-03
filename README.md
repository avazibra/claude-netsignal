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

Since 0.2.0 netsignal is a Claude Code mod: a hooks module (`hooks/register.ts`) samples
through Claude Code's own network on a timer and pins the signal as the plugin's status line
under the prompt. Nothing to install into `settings.json`, no background process, and it stops
with the session.

## Install

```
/plugin marketplace add avazibra/claude-netsignal
/plugin install netsignal@claude-netsignal
```

The signal appears under the prompt as soon as the session starts. `/signal` prints the latest
sample in full; `/signal now` re-samples first.

### Configure the mod

Every option is a row in `/config` (or `pluginConfigs.netsignal` in settings): `style`
(`bars`, `short`, `full`), `goodMs` / `okMs` / `badMs` (300 / 700 / 1500), `intervalSec` (30),
`bandwidthIntervalSec` (300; `0` disables), `latencyUrl`, `bandwidthUrl`. The mod draws plain
text, so levels show as filled bars `▂▄▆`, `▂▄·`, `▂··`, `···` and `✕ offline` instead of colour.

## Classic status line (older Claude Code)

On a Claude Code without function hooks, or to put the signal inside your own `statusLine`,
use the bash script. A tiny background sampler writes one JSON file, the status line reads it,
and the sampler exits by itself 15 minutes after the last render.

```
/netsignal
```

`/netsignal` runs the install step, which writes a small shim at `~/.claude/netsignal` and points
`statusLine` in `~/.claude/settings.json` at it. The shim resolves the currently installed
plugin version on every run, so plugin updates never break the status line. If you already have a status line it is kept and the signal is appended to it.
`/netsignal` also removes it or tunes thresholds on request.

Manual equivalents: `bin/netsignal install`, `bin/netsignal uninstall`, `bin/netsignal status`.

### With ccstatusline

Skip `install` and add a **Custom Command** widget running `<plugin-dir>/bin/netsignal render`.

### Configure the classic status line

For the classic status line, environment variables, read by the status-line command (prefix them in the
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
hooks/hooks.json                names the hooks module
hooks/register.ts               the mod: timer, probes, status line, /signal
hooks/register.test.ts          `claude plugin test .`
skills/netsignal/SKILL.md       /netsignal: classic status line install, remove, tune, diagnose
bin/netsignal                   classic sampler + renderer + installer (one bash script)
```

Check the mod with `claude plugin validate .claude-plugin/plugin.json` and `claude plugin test .`.

## License

MIT
