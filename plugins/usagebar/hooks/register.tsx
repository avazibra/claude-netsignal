import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, PluginOptions, Register, SessionMeasureInput } from 'claude-code'

import type { UsageSnapshot as Snapshot, UsageTokens as Tokens } from '../types'
import { type Run, STYLES, type Style, TONES, pill, styleFrom, tokens } from './pills'

// The latest reading, held by the host so the band redraws on each measurement.
const lastReading = atom({ plugin: 'usagebar', key: 'last' } as const, null)
// Tokens the session's own turns sent and received, summed turn by turn.
const tokenTotals = atom({ plugin: 'usagebar', key: 'tokens' } as const, { input: 0, output: 0 })
// The pill style picked with the switch or /pillstyle, kept across sessions in
// $.store; null until one is picked, then it wins over the pillStyle option.
// netsignal reads it too, so one switch restyles both mods.
const pickedStyle = atom({ plugin: 'usagebar', key: 'style' } as const, null)

type Config = {
  style: string
  warnAt: number
  alertAt: number
  showContext: boolean
  showCost: boolean
  showTokens: boolean
  desktopPlacement: string
  pillStyle: Style
}

export const configFrom = (options: PluginOptions): Config => ({
  style: String(options.style ?? 'full'),
  warnAt: Number(options.warnAt ?? 70),
  alertAt: Number(options.alertAt ?? 90),
  showContext: options.showContext !== false,
  showCost: options.showCost !== false,
  showTokens: options.showTokens !== false,
  desktopPlacement: String(options.desktopPlacement ?? 'pill'),
  pillStyle: styleFrom(options.pillStyle),
})

type Figures = Pick<SessionMeasureInput, 'context' | 'rateLimits' | 'cost'>

export const snapshotFrom = (f: Figures): Snapshot => ({
  windows: f.rateLimits.map(w => ({ kind: w.kind, percent: w.percentUsed, resetsAt: w.resetsAt })),
  contextPercent: f.context.percent,
  contextTokens: f.context.tokens,
  usd: f.cost?.usd,
})

const LABEL: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: '$' }
export const label = (kind: string) => LABEL[kind] ?? kind.replace(/_/g, ' ')

export type Level = 'good' | 'warn' | 'alert'
export const level = (percent: number, c: Config): Level =>
  percent >= c.alertAt ? 'alert' : percent >= c.warnAt ? 'warn' : 'good'

// "2h10m", "3d4h", "12m" (or "2h 10m" spaced): how long until a window resets.
export const until = (resetsAt: string | undefined, now: number, sep = '') => {
  const at = resetsAt ? Date.parse(resetsAt) : NaN
  if (Number.isNaN(at)) return ''
  const min = Math.max(0, Math.round((at - now) / 60_000))
  if (min >= 24 * 60) return `${Math.floor(min / 1440)}d${sep}${Math.floor((min % 1440) / 60)}h`
  if (min >= 60) return `${Math.floor(min / 60)}h${sep}${min % 60}m`
  return `${min}m`
}

const WINDOW_MS: Record<string, number> = { five_hour: 5 * 3_600_000, seven_day: 7 * 86_400_000 }

// How far through its window the clock is, 0 to 1; undefined when unknown.
export const pace = (kind: string, resetsAt: string | undefined, now: number) => {
  const length = WINDOW_MS[kind]
  const at = resetsAt ? Date.parse(resetsAt) : NaN
  if (!length || Number.isNaN(at)) return undefined
  return Math.max(0, Math.min(1, 1 - (at - now) / length))
}

// The pills, in groups: the plan limits, the session's tokens, its cost.
export const pills = (s: Snapshot, t: Tokens, c: Config, now: number, style: Style = c.pillStyle) => {
  const groups: { key: string; runs: Run[]; tone: (typeof TONES)[keyof typeof TONES]; alt: string }[][] = []
  const limits = s.windows.map(w => {
    const runs: Run[] = [
      { kind: 'icon', icon: w.kind === 'seven_day' ? 'calendar' : 'gauge' },
      { kind: 'text', text: label(w.kind), muted: true },
      { kind: 'bar', percent: w.percent, pace: pace(w.kind, w.resetsAt, now), level: level(w.percent, c) },
      { kind: 'text', text: pct(w.percent), bold: true },
    ]
    const reset = until(w.resetsAt, now, ' ')
    if (reset) runs.push({ kind: 'icon', icon: 'clock' }, { kind: 'text', text: reset, muted: true })
    const tone = w.kind === 'seven_day' ? TONES.sevenDay : TONES.fiveHour
    return { key: w.kind, runs, tone, alt: `${label(w.kind)} limit ${pct(w.percent)} used${reset ? `, resets in ${reset}` : ''}` }
  })
  if (limits.length) groups.push(limits)
  // Sent, received and context share one pill, each figure behind its own
  // coloured icon, so the whole set fits one row.
  const runs: Run[] = []
  const said: string[] = []
  if (c.showTokens && (t.input > 0 || t.output > 0)) {
    runs.push(
      { kind: 'icon', icon: 'upload', tone: TONES.input },
      { kind: 'text', text: tokens(t.input) },
      { kind: 'icon', icon: 'download', tone: TONES.output },
      { kind: 'text', text: tokens(t.output) },
    )
    said.push(`${tokens(t.input)} tokens sent`, `${tokens(t.output)} received`)
  }
  if (c.showContext && s.contextTokens !== undefined) {
    runs.push({ kind: 'icon', icon: 'layers', tone: TONES.context }, { kind: 'text', text: tokens(s.contextTokens) })
    said.push(`${tokens(s.contextTokens)} in context`)
  }
  if (runs.length) groups.push([{ key: 'session', runs, tone: TONES.unknown, alt: said.join(', ') }])
  if (c.showCost && s.usd !== undefined) {
    const runs: Run[] = [{ kind: 'icon', icon: 'coin' }, { kind: 'text', text: `$${s.usd.toFixed(2)}` }]
    groups.push([{ key: 'cost', runs, tone: TONES.cost, alt: `$${s.usd.toFixed(2)} this session` }])
  }
  return groups.map(g => g.map(p => ({ key: p.key, alt: p.alt, ...pill(p.runs, p.tone, style) })))
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

// The style after `current`, round the list: what one press of the switch picks.
export const nextStyle = (current: Style): Style => STYLES[(STYLES.indexOf(current) + 1) % STYLES.length]!

async function pickStyle($: Engine, style: Style) {
  await update($, pickedStyle, () => style)
  await $.store.set('pillStyle', style)
}

export const register: Register = (on, options) => {
  const c = configFrom(options)
  // Windows already toasted about, so each crossing toasts once per reset.
  const alerted = new Set<string>()
  const view: View = { isApp: false }

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'usagebar', description: 'Show your plan usage, context fill and session cost' })
    await $.command.register({
      name: 'pillstyle',
      description: 'Switch the pill style of usagebar and netsignal; no name picks the next one',
      argumentHint: '[soft|outline|solid|dark]',
    })
    try {
      const stored = await $.store.get('pillStyle')
      if (STYLES.includes(stored as Style)) await update($, pickedStyle, () => stored as Style)
    } catch {
      // No store (a host without one): the pillStyle option stands.
    }
    await show($, snapshotFrom(await $.session.usage()), c, view, alerted)
    // Reset countdowns move without a new measurement: redraw them each minute.
    $.clock.every(60_000, async () => {
      const s = await read($, lastReading)
      if (s) await showStatus($, s, c, view)
    })
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const u = e.usage
    if (u && e.agentId === undefined) {
      await update($, tokenTotals, t => ({
        input: t.input + u.input_tokens + u.cache_creation_input_tokens,
        output: t.output + u.output_tokens,
      }))
    }
    return next(e)
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
    const style = (await read($, pickedStyle)) ?? c.pillStyle
    const groups = pills(s, await read($, tokenTotals), c, await $.clock.now(), style)
    if (!groups.length) return next(e)
    const { Box, Button, Svg } = $.ui.resolve(e)
    const below = await next(e)
    return (
      <Box flexDirection="row" alignItems="center" flexWrap="wrap" gap={1}>
        {groups.flat().map(p => (
          <Svg key={`usagebar-${p.key}`} source={p.source} alt={p.alt} width={p.width} height={p.height} />
        ))}
        <Button
          key="usagebar-style"
          label="◐"
          plain
          dimColor
          onPress={async () => {
            const picked = nextStyle(style)
            await pickStyle($, picked)
            $.ui.toast(`Pill style: ${picked}`)
          }}
        />
        {below}
      </Box>
    )
  })

  on('command.run', { command: 'pillstyle' }, async ($, e) => {
    const asked = e.args.trim().toLowerCase()
    if (asked && !STYLES.includes(asked as Style)) return { text: `Pill styles: ${STYLES.join(', ')}` }
    const current = (await read($, pickedStyle)) ?? c.pillStyle
    const picked = asked ? (asked as Style) : nextStyle(current)
    await pickStyle($, picked)
    return { text: `Pill style: ${picked}` }
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
    const t = await read($, tokenTotals)
    if (t.input > 0 || t.output > 0) lines.push(`Tokens: ${tokens(t.input)} sent, ${tokens(t.output)} received`)
    if (u.cost) lines.push(`Session cost: $${u.cost.usd.toFixed(2)}`)
    return { text: lines.join('\n') }
  })
}
