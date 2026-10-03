import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, PluginOptions, Register, SessionMeasureInput } from 'claude-code'

import type { UsageSnapshot as Snapshot, UsageWindow as Window } from '../types'

// The latest reading, held by the host so the band redraws on each measurement.
const lastReading = atom({ plugin: 'usagebar', key: 'last' } as const, null)

type Config = {
  style: string
  warnAt: number
  alertAt: number
  showContext: boolean
  showCost: boolean
  desktopPlacement: string
}

export const configFrom = (options: PluginOptions): Config => ({
  style: String(options.style ?? 'full'),
  warnAt: Number(options.warnAt ?? 70),
  alertAt: Number(options.alertAt ?? 90),
  showContext: options.showContext !== false,
  showCost: options.showCost === true,
  desktopPlacement: String(options.desktopPlacement ?? 'pill'),
})

type Figures = Pick<SessionMeasureInput, 'context' | 'rateLimits' | 'cost'>

export const snapshotFrom = (f: Figures): Snapshot => ({
  windows: f.rateLimits.map(w => ({ kind: w.kind, percent: w.percentUsed, resetsAt: w.resetsAt })),
  contextPercent: f.context.percent,
  usd: f.cost?.usd,
})

const LABEL: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: '$' }
export const label = (kind: string) => LABEL[kind] ?? kind.replace(/_/g, ' ')

export type Level = 'good' | 'warn' | 'alert'
export const level = (percent: number, c: Config): Level =>
  percent >= c.alertAt ? 'alert' : percent >= c.warnAt ? 'warn' : 'good'

// "2h10m", "3d4h", "12m": how long until a window resets.
export const until = (resetsAt: string | undefined, now: number) => {
  const at = resetsAt ? Date.parse(resetsAt) : NaN
  if (Number.isNaN(at)) return ''
  const min = Math.max(0, Math.round((at - now) / 60_000))
  if (min >= 24 * 60) return `${Math.floor(min / 1440)}d${Math.floor((min % 1440) / 60)}h`
  if (min >= 60) return `${Math.floor(min / 60)}h${min % 60}m`
  return `${min}m`
}

const pct = (n: number) => `${Math.round(n)}%`

// One entry per figure, in the order they are shown.
export const parts = (s: Snapshot, c: Config, now: number) => {
  const out: { key: string; text: string; level: Level | 'neutral' }[] = []
  for (const w of s.windows) {
    const reset = c.style === 'full' ? until(w.resetsAt, now) : ''
    out.push({ key: w.kind, text: `${label(w.kind)} ${pct(w.percent)}${reset ? ` ↻${reset}` : ''}`, level: level(w.percent, c) })
  }
  if (c.showContext && s.contextPercent !== undefined) {
    out.push({ key: 'context', text: `ctx ${pct(s.contextPercent)}`, level: level(s.contextPercent, c) })
  }
  if (c.showCost && s.usd !== undefined) out.push({ key: 'cost', text: `$${s.usd.toFixed(2)}`, level: 'neutral' })
  return out
}

export const render = (s: Snapshot | null, c: Config, now: number) => {
  if (s === null) return undefined
  const p = parts(s, c, now)
  return p.length ? p.map(x => x.text).join(' · ') : undefined
}

// Text and background per level for the pills, matching netsignal's.
const PILL: Record<Level | 'neutral', { color: string; backgroundColor: string }> = {
  good: { color: '#2f6b3a', backgroundColor: '#dcebdc' },
  warn: { color: '#8a6100', backgroundColor: '#f3e8c8' },
  alert: { color: '#a8412e', backgroundColor: '#f2dcd5' },
  neutral: { color: '#6f6e69', backgroundColor: '#e6e4d9' },
}

// Whether an app (desktop, web, phone) has drawn the band: the desktop app is
// not always in the surface roster, but it always asks for the band.
type View = { isApp: boolean }

// The apps draw a plugin's status line in their footer as well as the band
// pills, so there the status line shows only when asked for.
async function showStatus($: Engine, s: Snapshot, c: Config, view: View) {
  let isApp = view.isApp
  try {
    isApp ||= (await $.session.surfaces()).some(x => x !== 'terminal')
  } catch {
    // No surface roster (a headless run): treat it as the terminal.
  }
  const wantsStatus = !isApp || c.desktopPlacement !== 'pill'
  $.ui.status(wantsStatus ? render(s, c, await $.clock.now()) : undefined)
}

async function show($: Engine, s: Snapshot, c: Config, view: View, alerted: Set<string>) {
  await showStatus($, s, c, view)
  await update($, lastReading, () => s)
  for (const w of s.windows) {
    const id = `${w.kind}@${w.resetsAt ?? ''}`
    if (w.percent >= c.alertAt && !alerted.has(id)) {
      alerted.add(id)
      const reset = until(w.resetsAt, await $.clock.now())
      $.ui.toast(`${label(w.kind)} usage at ${pct(w.percent)}${reset ? `, resets in ${reset}` : ''}`)
    }
  }
}

export const register: Register = (on, options) => {
  const c = configFrom(options)
  // Windows already toasted about, so each crossing toasts once per reset.
  const alerted = new Set<string>()
  const view: View = { isApp: false }

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'usagebar', description: 'Show your plan usage, context fill and session cost' })
    await show($, snapshotFrom(await $.session.usage()), c, view, alerted)
    // Reset countdowns move without a new measurement: redraw them each minute.
    $.clock.every(60_000, async () => {
      const s = await read($, lastReading)
      if (s) await showStatus($, s, c, view)
    })
    return result
  })

  on('session.measure', async ($, e, next) => {
    await show($, snapshotFrom(e), c, view, alerted)
    return next(e)
  })

  // The desktop and web apps show plugin pills in the band above the prompt:
  // add ours beside whatever the plugins beneath draw there, unless the
  // footer was chosen instead. The terminal keeps the status line alone.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' && !view.isApp) {
      view.isApp = true
      const seen = await read($, lastReading)
      if (seen) await showStatus($, seen, c, view)
    }
    const isPill = c.desktopPlacement !== 'footer'
    if (e.surface === 'terminal' || !isPill || e.props.hasSurvey) return next(e)
    const s = await read($, lastReading)
    if (s === null) return next(e)
    const items = parts(s, c, await $.clock.now())
    if (!items.length) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const below = await next(e)
    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        {items.map(p => (
          <Box key={`usagebar-${p.key}`} paddingX={1} backgroundColor={PILL[p.level].backgroundColor}>
            <Text color={PILL[p.level].color} bold>
              {p.text}
            </Text>
          </Box>
        ))}
        {below}
      </Box>
    )
  })

  on('command.run', { command: 'usagebar' }, async $ => {
    const u = await $.session.usage()
    const now = await $.clock.now()
    const lines = u.rateLimits.map(w => {
      const reset = until(w.resetsAt, now)
      return `${label(w.kind)} limit: ${pct(w.percentUsed)} used${reset ? `, resets in ${reset}` : ''}`
    })
    if (!lines.length) lines.push('Plan limits: no reading yet (they arrive with the first reply, and only on a Claude subscription)')
    if (u.context.percent !== undefined) lines.push(`Context: ${pct(u.context.percent)} of ${u.context.window.toLocaleString('en-US')} tokens`)
    if (u.cost) lines.push(`Session cost: $${u.cost.usd.toFixed(2)}`)
    return { text: lines.join('\n') }
  })
}
