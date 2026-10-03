import type { EngineInterface as Engine, PluginOptions, Register } from 'claude-code'

type Sample = { at: number; latencyMs: number; mbps: number }

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
  m.last = { at, latencyMs: lat ? Math.max(1, Math.round(lat.ms)) : 0, mbps }
  $.ui.status(render(m.last, c))
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
