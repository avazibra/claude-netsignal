import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, PluginOptions, Register } from 'claude-code'

import type { NetSample as Sample } from '../types'

// The latest sample, held by the host so the desktop band redraws on each probe.
const lastSample = atom({ plugin: 'netsignal', key: 'last' } as const, null)

type Config = {
  style: string
  good: number
  ok: number
  bad: number
  intervalMs: number
  bwIntervalMs: number
  latencyUrl: string
  bwUrl: string
}

type Meter = { config: Config; last: Sample | null; bwAt: number; inFlight: Promise<void> | null }

export const configFrom = (options: PluginOptions): Config => ({
  style: String(options.style ?? 'full'),
  good: Number(options.goodMs ?? 300),
  ok: Number(options.okMs ?? 700),
  bad: Number(options.badMs ?? 1500),
  intervalMs: Math.max(5, Number(options.intervalSec ?? 30)) * 1000,
  bwIntervalMs: Math.max(0, Number(options.bandwidthIntervalSec ?? 300)) * 1000,
  latencyUrl: String(options.latencyUrl ?? 'https://api.anthropic.com/'),
  bwUrl: String(options.bandwidthUrl ?? 'https://speed.cloudflare.com/__down?bytes=3000000'),
})

export const bars = (latencyMs: number, c: Config) => {
  if (latencyMs <= 0) return '✕'
  if (latencyMs < c.good) return '▂▄▆'
  if (latencyMs < c.ok) return '▂▄·'
  if (latencyMs < c.bad) return '▂··'
  return '···'
}

export type Level = 'good' | 'ok' | 'poor' | 'bad' | 'offline' | 'unknown'

export const level = (last: Sample | null, c: Config): Level => {
  if (last === null) return 'unknown'
  if (last.latencyMs <= 0) return 'offline'
  if (last.latencyMs < c.good) return 'good'
  if (last.latencyMs < c.ok) return 'ok'
  if (last.latencyMs < c.bad) return 'poor'
  return 'bad'
}

// Text and background per level for the desktop pill.
const PILL: Record<Level, { color: string; backgroundColor: string }> = {
  good: { color: '#2f6b3a', backgroundColor: '#dcebdc' },
  ok: { color: '#8a6100', backgroundColor: '#f3e8c8' },
  poor: { color: '#a8412e', backgroundColor: '#f2dcd5' },
  bad: { color: '#a8412e', backgroundColor: '#f2dcd5' },
  offline: { color: '#a8412e', backgroundColor: '#f2dcd5' },
  unknown: { color: '#6f6e69', backgroundColor: '#e6e4d9' },
}

export const render = (last: Sample | null, c: Config) => {
  if (last === null) return '▂▄▆ ?'
  const glyph = bars(last.latencyMs, c)
  if (c.style === 'bars') return glyph
  let text = `${glyph} ${last.latencyMs > 0 ? `${last.latencyMs}ms` : 'offline'}`
  if (c.style === 'full' && c.bwIntervalMs > 0 && last.mbps > 0) text += ` ↓${last.mbps}M`
  return text
}

// Time one GET through the host's network; null when it fails.
async function timed($: Engine, url: string) {
  const started = await $.clock.now()
  try {
    const res = await $.http.fetch(url)
    return { ms: (await $.clock.now()) - started, bytes: res.text.length }
  } catch {
    return null
  }
}

// One probe at a time: a caller arriving mid-probe waits for that one.
function sample($: Engine, m: Meter) {
  m.inFlight ??= probe($, m).finally(() => {
    m.inFlight = null
  })
  return m.inFlight
}

async function probe($: Engine, m: Meter) {
  const c = m.config
  const lat = await timed($, c.latencyUrl)
  const at = await $.clock.now()
  let mbps = m.last?.mbps ?? 0
  if (lat && c.bwIntervalMs > 0 && at - m.bwAt >= c.bwIntervalMs) {
    const bw = await timed($, c.bwUrl)
    if (bw && bw.ms > 0) mbps = Math.round(((bw.bytes * 8) / (bw.ms / 1000) / 1e6) * 10) / 10
    m.bwAt = at
  }
  const latest: Sample = { at, latencyMs: lat ? Math.max(1, Math.round(lat.ms)) : 0, mbps }
  m.last = latest
  $.ui.status(render(latest, c))
  await update($, lastSample, () => latest)
}

export const register: Register = (on, options) => {
  const m: Meter = { config: configFrom(options), last: null, bwAt: -Infinity, inFlight: null }

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    $.ui.status(render(m.last, m.config))
    await $.command.register({
      name: 'signal',
      description: 'Show the latest network signal sample; "now" re-samples first',
      argumentHint: '[now]',
    })
    void sample($, m)
    $.clock.every(m.config.intervalMs, () => void sample($, m))
    return result
  })

  // The desktop app shows plugin pills in the band above the prompt: add ours
  // beside whatever the plugins beneath draw there. The terminal keeps the
  // status line alone.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.hasSurvey) return next(e)
    const last = await read($, lastSample)
    const { Box, Text } = $.ui.resolve(e)
    const below = await next(e)
    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        <Box key="netsignal" paddingX={1} backgroundColor={PILL[level(last, m.config)].backgroundColor}>
          <Text color={PILL[level(last, m.config)].color} bold>
            {render(last, m.config)}
          </Text>
        </Box>
        {below}
      </Box>
    )
  })

  on('command.run', { command: 'signal' }, async ($, e) => {
    if (e.args.trim() === 'now') await sample($, m)
    const c = m.config
    if (m.last === null) return { text: 'netsignal: no sample yet' }
    const age = Math.round(((await $.clock.now()) - m.last.at) / 1000)
    const latency = m.last.latencyMs > 0 ? `${m.last.latencyMs} ms to ${c.latencyUrl}` : `${c.latencyUrl} unreachable`
    const bw = m.last.mbps > 0 ? `, ${m.last.mbps} Mbit/s down` : ''
    return { text: `netsignal: ${render(m.last, c)} (${latency}${bw}, ${age}s ago)` }
  })
}
