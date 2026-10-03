import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, PluginOptions, Register } from 'claude-code'

import type { NetSample as Sample } from '../types'
import { type Run, STYLES, type Style, TONES, pill, styleFrom } from './pills'

// The latest sample, held by the host so the desktop band redraws on each probe.
const lastSample = atom({ plugin: 'netsignal', key: 'last' } as const, null)
// The pill style usagebar's switch or /pillstyle picked, followed here so one
// switch restyles both; null until one is picked, then it wins over the option.
const pickedStyle = atom({ plugin: 'netsignal', key: 'style' } as const, null)

type Config = {
  style: string
  good: number
  ok: number
  bad: number
  intervalMs: number
  timeoutMs: number
  bwIntervalMs: number
  latencyUrl: string
  bwUrl: string
  desktopPlacement: string
  pillStyle: Style
}

// isDesktop: the desktop app drew the band. It is not always in the surface
// roster, but it always asks for the band.
type Meter = { config: Config; last: Sample | null; bwAt: number; inFlight: Promise<void> | null; isDesktop: boolean }

export const configFrom = (options: PluginOptions): Config => ({
  style: String(options.style ?? 'full'),
  good: Number(options.goodMs ?? 300),
  ok: Number(options.okMs ?? 700),
  bad: Number(options.badMs ?? 1500),
  intervalMs: Math.max(5, Number(options.intervalSec ?? 30)) * 1000,
  timeoutMs: Math.max(1, Number(options.timeoutSec ?? 5)) * 1000,
  bwIntervalMs: Math.max(0, Number(options.bandwidthIntervalSec ?? 300)) * 1000,
  latencyUrl: String(options.latencyUrl ?? 'https://api.anthropic.com/'),
  bwUrl: String(options.bandwidthUrl ?? 'https://speed.cloudflare.com/__down?bytes=3000000'),
  desktopPlacement: String(options.desktopPlacement ?? 'pill'),
  pillStyle: styleFrom(options.pillStyle),
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
  if (last.timedOut) return 'bad'
  if (last.latencyMs <= 0) return 'offline'
  if (last.latencyMs < c.good) return 'good'
  if (last.latencyMs < c.ok) return 'ok'
  if (last.latencyMs < c.bad) return 'poor'
  return 'bad'
}

// The desktop pill: lit bars and colour by level, the latency, and the last
// bandwidth reading after a divider when the style shows it.
const TONE: Record<Level, keyof typeof TONES> = { good: 'good', ok: 'ok', poor: 'bad', bad: 'bad', offline: 'bad', unknown: 'unknown' }
const LIT: Record<Level, number> = { good: 3, ok: 2, poor: 1, bad: 1, offline: 0, unknown: 3 }

export const signalPill = (last: Sample | null, c: Config, style: Style = c.pillStyle) => {
  const lv = level(last, c)
  const runs: Run[] = [{ kind: 'icon', icon: 'signal', n: LIT[lv] }]
  if (last === null) runs.push({ kind: 'text', text: '?', muted: true })
  else if (last.timedOut) runs.push({ kind: 'text', text: 'timeout', bold: true })
  else if (last.latencyMs <= 0) runs.push({ kind: 'text', text: 'offline', bold: true })
  else if (c.style !== 'bars') {
    runs.push({ kind: 'text', text: `${last.latencyMs}ms`, bold: true })
    if (c.style === 'full' && c.bwIntervalMs > 0 && last.mbps > 0)
      runs.push({ kind: 'divider' }, { kind: 'icon', icon: 'download' }, { kind: 'text', text: `${last.mbps}M`, muted: true })
  }
  return { ...pill(runs, TONES[TONE[lv]], style), alt: `Network signal: ${render(last, c)}` }
}

export const render = (last: Sample | null, c: Config) => {
  if (last === null) return '▂▄▆ ?'
  const glyph = last.timedOut ? '···' : bars(last.latencyMs, c)
  if (c.style === 'bars') return glyph
  let text = `${glyph} ${last.timedOut ? 'timeout' : last.latencyMs > 0 ? `${last.latencyMs}ms` : 'offline'}`
  if (c.style === 'full' && c.bwIntervalMs > 0 && last.mbps > 0) text += ` ↓${last.mbps}M`
  return text
}

// Time one GET through the host's network; null when it fails, 'timeout' when
// no answer comes within timeoutMs (a stalled request is not a latency).
async function timed($: Engine, url: string, timeoutMs: number) {
  const started = await $.clock.now()
  const timer = new AbortController()
  const fetched = $.http.fetch(url).then(
    async res => ({ ms: (await $.clock.now()) - started, bytes: res.text.length }),
    () => null,
  )
  const timeout = $.clock.sleep(timeoutMs, { signal: timer.signal }).then(
    () => 'timeout' as const,
    () => 'timeout' as const,
  )
  const res = await Promise.race([fetched, timeout])
  timer.abort()
  return res
}

// One probe at a time: a caller arriving mid-probe waits for that one.
function sample($: Engine, m: Meter) {
  m.inFlight ??= probe($, m).finally(() => {
    m.inFlight = null
  })
  return m.inFlight
}

// The desktop app draws a plugin's status line in its footer as well as the
// band pill, so there the status line shows only when asked for.
async function showStatus($: Engine, m: Meter) {
  let isDesktop = m.isDesktop
  try {
    isDesktop ||= (await $.session.surfaces()).includes('desktop')
  } catch {
    // No surface roster (a headless run): treat it as the terminal.
  }
  const wantsStatus = !isDesktop || m.config.desktopPlacement !== 'pill'
  $.ui.status(wantsStatus ? render(m.last, m.config) : undefined)
}

async function probe($: Engine, m: Meter) {
  const c = m.config
  const lat = await timed($, c.latencyUrl, c.timeoutMs)
  const at = await $.clock.now()
  let mbps = m.last?.mbps ?? 0
  if (lat && lat !== 'timeout' && c.bwIntervalMs > 0 && at - m.bwAt >= c.bwIntervalMs) {
    // The download gets longer: it moves megabytes, not a header.
    const bw = await timed($, c.bwUrl, c.timeoutMs * 4)
    if (bw && bw !== 'timeout' && bw.ms > 0) mbps = Math.round(((bw.bytes * 8) / (bw.ms / 1000) / 1e6) * 10) / 10
    m.bwAt = at
  }
  const latest: Sample =
    lat === 'timeout'
      ? { at, latencyMs: 0, mbps, timedOut: true }
      : { at, latencyMs: lat ? Math.max(1, Math.round(lat.ms)) : 0, mbps }
  m.last = latest
  await showStatus($, m)
  await update($, lastSample, () => latest)
}

export const register: Register = (on, options) => {
  const m: Meter = { config: configFrom(options), last: null, bwAt: -Infinity, inFlight: null, isDesktop: false }

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await showStatus($, m)
    await $.command.register({
      name: 'signal',
      description: 'Show the latest network signal sample; "now" re-samples first',
      argumentHint: '[now]',
    })
    try {
      const stored = await $.store.get('pillStyle')
      if (STYLES.includes(stored as Style)) await update($, pickedStyle, () => stored as Style)
    } catch {
      // No store (a host without one): the pillStyle option stands.
    }
    void sample($, m)
    $.clock.every(m.config.intervalMs, () => void sample($, m))
    return result
  })

  // usagebar owns the style switch: follow each style it writes, and remember
  // it for sessions where usagebar is not loaded.
  on('state.set', async ($, e, next) => {
    const result = await next(e)
    const w = e as { plugin: string; key: string; value: unknown }
    if (w.plugin === 'usagebar' && w.key === 'style' && STYLES.includes(w.value as Style)) {
      await update($, pickedStyle, () => w.value as Style)
      await $.store.set('pillStyle', w.value)
    }
    return result
  })

  // The desktop app shows plugin pills in the band above the prompt: add ours
  // beside whatever the plugins beneath draw there, unless the footer was
  // chosen instead. The terminal keeps the status line alone.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface === 'desktop' && !m.isDesktop) {
      m.isDesktop = true
      await showStatus($, m)
    }
    const isPill = m.config.desktopPlacement !== 'footer'
    if (e.surface !== 'desktop' || !isPill || e.props.hasSurvey) return next(e)
    const p = signalPill(await read($, lastSample), m.config, (await read($, pickedStyle)) ?? m.config.pillStyle)
    const { Box, Svg } = $.ui.resolve(e)
    const below = await next(e)
    // Top-aligned, so when the plugins beneath wrap onto a second row the
    // pill sits in line with their first row rather than between the two.
    return (
      <Box flexDirection="row" alignItems="flex-start" gap={1}>
        <Svg key="netsignal" source={p.source} alt={p.alt} width={p.width} height={p.height} />
        {below}
      </Box>
    )
  })

  on('command.run', { command: 'signal' }, async ($, e) => {
    if (e.args.trim() === 'now') await sample($, m)
    const c = m.config
    if (m.last === null) return { text: 'netsignal: no sample yet' }
    const age = Math.round(((await $.clock.now()) - m.last.at) / 1000)
    const latency = m.last.timedOut
      ? `no answer from ${c.latencyUrl} within ${c.timeoutMs / 1000} s`
      : m.last.latencyMs > 0
        ? `${m.last.latencyMs} ms to ${c.latencyUrl}`
        : `${c.latencyUrl} unreachable`
    const bw = m.last.mbps > 0 ? `, ${m.last.mbps} Mbit/s down` : ''
    return { text: `netsignal: ${render(m.last, c)} (${latency}${bw}, ${age}s ago)` }
  })
}
