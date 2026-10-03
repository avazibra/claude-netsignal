# claude-netsignal

Internet signal bars for Claude Code: latency to `api.anthropic.com` and your download speed,
always in view while you work.

```
▂▄▆ 48ms ↓19M
```

- **Latency**: time to `api.anthropic.com`, sampled every 30 s. That is the network Claude Code
  actually feels, not a generic ping.
- **Bandwidth**: a 3 MB download every 5 min (Cloudflare's speed endpoint by default;
  Anthropic serves no large static body).
- **Levels**: good under 300 ms, OK under 700 ms, poor under 1500 ms, bad above; `✕ offline`
  when unreachable; `▂▄▆ ?` before the first sample.

netsignal is a Claude Code mod: it samples through Claude Code's own network on a timer while a
session is open and stops with it. Nothing is written to `settings.json` and nothing runs in the
background.

## Also in this marketplace: usagebar

[`usagebar`](plugins/usagebar) shows your plan usage (5-hour and weekly limits), context fill
and session cost in the status line and as pills above the prompt, and works in cloud
sessions too. `claude plugin install usagebar@claude-netsignal`; see its README for cloud setup.

## Install

In a terminal:

```
claude plugin marketplace add avazibra/claude-netsignal
claude plugin install netsignal@claude-netsignal
```

or the same as `/plugin marketplace add …` and `/plugin install …` at the Claude Code prompt.
Then start a new session.

To get a newer version later:

```
claude plugin marketplace update claude-netsignal
claude plugin update netsignal@claude-netsignal
```

`install` may note that the `userConfig` options are not set yet. That is fine: every option has
a default (see [Configure](#configure)).

### Local sessions only

The plugin loads in sessions that run on your machine: the `claude` CLI in a terminal, or a
desktop Code-tab session whose environment is a local folder. A cloud session (the cloud icon
next to the session name, an environment such as `Default · <repo>`) runs on a remote machine and
does not see plugins installed on yours, and its network is not yours anyway.

## Use

- **Terminal**: the signal is pinned as a status line under the prompt, as plain text, with the
  level shown by filled bars: `▂▄▆`, `▂▄·`, `▂··`, `···`, `✕ offline`.
- **Desktop app (Code tab)**: a green, yellow or red pill in the band above the prompt, beside any
  pills other plugins draw there. The desktop app would also repeat a plugin's status line in its
  footer, next to the model name; netsignal leaves that off unless you set `desktopPlacement` to
  `footer` (status line only) or `both`.
- **`/signal`** prints the latest sample in full (latency, target, bandwidth, age).
  **`/signal now`** takes a fresh sample first.

## Configure

Open `/config` and find the netsignal rows, or set them under `pluginConfigs.netsignal` in
settings:

| Option | Default | Meaning |
|---|---|---|
| `style` | `full` | `bars` (▂▄▆), `short` (+ ms), `full` (+ Mbps) |
| `goodMs` / `okMs` / `badMs` | 300 / 700 / 1500 | latency thresholds, ms |
| `intervalSec` | 30 | seconds between latency samples |
| `bandwidthIntervalSec` | 300 | seconds between bandwidth samples; `0` disables |
| `latencyUrl` | `https://api.anthropic.com/` | latency target |
| `bandwidthUrl` | `https://speed.cloudflare.com/__down?bytes=3000000` | bandwidth target |
| `desktopPlacement` | `pill` | desktop app: `pill` above the prompt, `footer` beside the model, or `both` |
| `pillStyle` | `soft` | desktop pill look: `soft` (pastel), `outline`, `solid` or `dark` |

## Upgrading from 0.1.x

0.1.x drew the signal through your `statusLine` setting, installed by `/netsignal`. If you ran
it, remove that so the signal does not show twice:

```
~/.claude/netsignal uninstall
```

This restores the status line you had before. `/netsignal` (shown as `/netsignal:netsignal`) is
only for that classic setup; the mod's command is `/signal`.

## Develop

Load a checkout for one session with `claude --plugin-dir /path/to/claude-netsignal`. For the
desktop app, add `"env": { "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/claude-netsignal" }` to
`~/.claude/settings.json` and start a new local session. Check changes with
`claude plugin validate .claude-plugin/plugin.json` and `claude plugin test .`.
That run also finds `plugins/usagebar`'s tests, which only pass from their own folder:
check usagebar with `claude plugin test plugins/usagebar`.

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
hooks/register.tsx              the mod: timer, probes, status line, desktop pill, /signal
hooks/register.test.tsx         `claude plugin test .`
types/index.d.ts                the mod's $.state contract
skills/netsignal/SKILL.md       /netsignal: classic status line install, remove, tune, diagnose
bin/netsignal                   classic sampler + renderer + installer (one bash script)
plugins/usagebar/               the usagebar mod (its own plugin in this marketplace)
```

## License

MIT
