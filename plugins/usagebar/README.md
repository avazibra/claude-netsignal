# usagebar

Your Claude plan usage in Claude Code: the 5-hour and weekly limits, how full the context
window is and, optionally, what the session has cost.

```
5h 42% ↻2h10m · 7d 18% ↻3d4h · ctx 31%
```

- **Terminal**: the line above sits in the status line under the prompt.
- **Desktop and web apps**: rounded pills in the band above the prompt. Each limit gets a
  progress bar with a tick at an even pace (how far through the window the clock is), the
  percentage and the time until it resets; the bar turns yellow from 70 % and red from 90 %.
  Beside them, the tokens this session sent and received, the tokens in context, and the cost. The footer status line stays empty there so the
  figures show once; set `desktopPlacement` to `footer` or `both` to change that.
- **Toast**: once per window when it crosses 90 %, with the time until it resets.
- **`/usagebar`**: the same figures written out in full.
- **Style switch**: press ◐ at the end of the pills, or type `/pillstyle` (or `/pillstyle dark`),
  to cycle soft, outline, solid and dark. The pick is remembered and netsignal follows it.

The figures are the ones Claude Code itself reads from each API reply, so nothing is polled
and nothing leaves the session. Plan limits only exist on a Claude subscription and appear
after the session's first reply; on an API key you see context (and cost) only.

## Install on your machine

```
claude plugin marketplace add avazibra/claude-netsignal
claude plugin install usagebar@claude-netsignal
```

(or the `/plugin …` forms inside Claude Code), then start a new session.

## Install in cloud sessions

A cloud session starts in a fresh container, so a plugin installed on your Mac is not there,
and Claude Code does not install marketplaces that a repository's own `.claude/settings.json`
declares. What works is installing it in the cloud environment's **setup script**
(claude.ai → your environment → Setup script), which runs before every session:

```
claude plugin marketplace add avazibra/claude-netsignal
claude plugin install usagebar@claude-netsignal
```

Every session on that environment then loads usagebar from its first turn, whatever
repository it works on. Run `/usagebar` in a cloud session to check it.

## Options

Every option is a row in `/config`: `style` (`full` adds reset countdowns, `compact` drops
them), `warnAt` (70), `alertAt` (90), `showContext` (on), `showTokens` (on), `showCost` (on), `desktopPlacement` (`pill`, `footer` or `both`), `pillStyle` (`soft`, `outline`, `solid` or `dark`).

## Develop

```
claude --plugin-dir plugins/usagebar
claude plugin validate plugins/usagebar
claude plugin test plugins/usagebar
```
