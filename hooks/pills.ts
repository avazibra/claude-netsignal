// The pills the apps show above the prompt, drawn as SVG so they can carry
// rounded corners, icons and progress bars the band's own elements lack.
//
// netsignal keeps an identical copy at hooks/pills.ts (a plugin can only load
// files inside its own folder): change both together.

// A pill's colours: a pastel background, a saturated ink for its icon, a
// bar fill, and a bright icon colour for dark pills. Each style below derives its look from these.
export type Tone = { bg: string; ink: string; fill: string; glow: string }

export const TONES = {
  fiveHour: { bg: '#d9eae2', ink: '#3f7d68', fill: '#8fb47d', glow: '#6fcfa8' },
  sevenDay: { bg: '#e5def3', ink: '#7a5fc0', fill: '#8fb47d', glow: '#b39cf0' },
  input: { bg: '#f1ddd6', ink: '#c0583f', fill: '', glow: '#f08a6e' },
  output: { bg: '#d9eadb', ink: '#4f8a55', fill: '', glow: '#7fcf86' },
  context: { bg: '#dde2f6', ink: '#4f5fc9', fill: '', glow: '#8a9cf5' },
  cost: { bg: '#f1e6cc', ink: '#a8812a', fill: '', glow: '#e2b24f' },
  good: { bg: '#d9eadb', ink: '#4f8a55', fill: '', glow: '#7fcf86' },
  ok: { bg: '#f3e8c8', ink: '#a07a17', fill: '', glow: '#e2b24f' },
  bad: { bg: '#f2dcd5', ink: '#c0583f', fill: '', glow: '#f08a6e' },
  unknown: { bg: '#e6e4d9', ink: '#878580', fill: '', glow: '#b7b5ac' },
} satisfies Record<string, Tone>

// How pills are painted:
// soft: pastel fill, dark text (the reference look);
// outline: no fill, a thin coloured ring;
// solid: the ink as fill, white text;
// dark: near-black fill with light text, coloured icons.
export const STYLES = ['soft', 'outline', 'solid', 'dark'] as const
export type Style = (typeof STYLES)[number]
export const styleFrom = (v: unknown): Style => (STYLES.includes(v as Style) ? (v as Style) : 'soft')

type Paint = { bg: string; ring?: string; icon: string; text: string; muted: string; track: string; tick: string; rule: string }

const paint = (style: Style, t: Tone): Paint => {
  if (style === 'outline')
    return { bg: '#ffffff', ring: t.ink, icon: t.ink, text: '#1c1b1a', muted: '#6f6e69', track: 'rgba(0,0,0,0.1)', tick: '#1c1b1a', rule: 'rgba(0,0,0,0.15)' }
  if (style === 'solid')
    return { bg: t.ink, icon: '#ffffff', text: '#ffffff', muted: 'rgba(255,255,255,0.78)', track: 'rgba(255,255,255,0.3)', tick: '#ffffff', rule: 'rgba(255,255,255,0.35)' }
  if (style === 'dark')
    return { bg: '#33322f', icon: t.glow, text: '#f2f0e5', muted: '#a8a69c', track: 'rgba(255,255,255,0.15)', tick: '#f2f0e5', rule: 'rgba(255,255,255,0.2)' }
  return { bg: t.bg, icon: t.ink, text: '#1c1b1a', muted: '#6f6e69', track: 'rgba(0,0,0,0.1)', tick: '#1c1b1a', rule: 'rgba(0,0,0,0.15)' }
}

const WARN = '#d6a33a'
const ALERT = '#cf5f45'

// Sized so a full set (signal, both limits, session, cost) fits one row of
// the desktop band at a common window width.
const FONT = 11.5
const CHAR = FONT * 0.62
const H = 24
const PAD = 7
const GAP = 4
const ICON = 15
const BAR = 28
const FAMILY = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace"

type Icon = (x: number, color: string, n?: number) => string

const stroke = (color: string) => `fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`

// Each icon draws in a 15 px square whose left edge is x, centred on the pill.
const at = (x: number, body: string) => `<g transform="translate(${x} ${(H - ICON) / 2})">${body}</g>`

export const ICONS = {
  gauge: (x, c) => at(x, `<path d="M2 10.5a5.5 5.5 0 1 1 11 0" ${stroke(c)}/><path d="M7.5 10.5 10 6" ${stroke(c)}/>`),
  calendar: (x, c) =>
    at(
      x,
      `<rect x="1.5" y="2.5" width="12" height="11" rx="2" ${stroke(c)}/><path d="M1.5 6h12M4.5 1v3M10.5 1v3" ${stroke(c)}/>` +
        `<text x="7.5" y="12.2" text-anchor="middle" font-family="${FAMILY}" font-size="6.5" font-weight="700" fill="${c}">7</text>`,
    ),
  clock: (x, c) => at(x, `<circle cx="7.5" cy="7.5" r="5.5" ${stroke(c)}/><path d="M7.5 4.5v3l2 1.5" ${stroke(c)}/>`),
  upload: (x, c) => at(x, `<path d="M2 9.5v3.5h11V9.5" ${stroke(c)}/><path d="M7.5 10V2M4.5 5l3-3 3 3" ${stroke(c)}/>`),
  download: (x, c) => at(x, `<path d="M2 9.5v3.5h11V9.5" ${stroke(c)}/><path d="M7.5 2v8M4.5 7l3 3 3-3" ${stroke(c)}/>`),
  layers: (x, c) =>
    at(x, `<path d="M7.5 1.5 13.5 4.5 7.5 7.5 1.5 4.5Z" ${stroke(c)}/><path d="M1.5 7.5l6 3 6-3M1.5 10.5l6 3 6-3" ${stroke(c)}/>`),
  coin: (x, c) =>
    at(
      x,
      `<circle cx="7.5" cy="7.5" r="6" ${stroke(c)}/>` +
        `<text x="7.5" y="10.8" text-anchor="middle" font-family="${FAMILY}" font-size="9" font-weight="700" fill="${c}">$</text>`,
    ),
  // Signal strength: n of three bars lit, the rest faint; none lit draws a cross.
  signal: (x, c, n = 3) =>
    at(
      x,
      n === 0
        ? `<path d="M3.5 3.5l8 8M11.5 3.5l-8 8" ${stroke(c)}/>`
        : [0, 1, 2]
            .map(i => {
              const h = 4 + i * 3.5
              return `<rect x="${1.5 + i * 4.5}" y="${13.5 - h}" width="3" height="${h}" rx="1" fill="${c}"${i < n ? '' : ' fill-opacity="0.25"'}/>`
            })
            .join(''),
    ),
} satisfies Record<string, Icon>

// One run of a pill: an icon, a word, a bar or a divider, laid left to right.
// An icon can carry its own tone, for a pill that holds several figures.
export type Run =
  | { kind: 'icon'; icon: keyof typeof ICONS; n?: number; tone?: Tone }
  | { kind: 'text'; text: string; bold?: boolean; muted?: boolean }
  | { kind: 'bar'; percent: number; pace?: number; level: 'good' | 'warn' | 'alert' }
  | { kind: 'divider' }

const runWidth = (r: Run) =>
  r.kind === 'icon' ? ICON : r.kind === 'text' ? Math.ceil(r.text.length * CHAR) : r.kind === 'bar' ? BAR : 1

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The pill as an SVG document and the width it takes, in CSS pixels.
export function pill(runs: Run[], tone: Tone, style: Style = 'soft') {
  const p = paint(style, tone)
  const width = PAD * 2 + runs.reduce((w, r) => w + runWidth(r), 0) + GAP * Math.max(0, runs.length - 1)
  const mid = H / 2
  let x = PAD
  const body: string[] = []
  for (const r of runs) {
    if (r.kind === 'icon') body.push(ICONS[r.icon](x, r.tone ? paint(style, r.tone).icon : p.icon, r.n))
    if (r.kind === 'text') {
      body.push(
        `<text x="${x}" y="${mid + FONT * 0.36}" font-family="${FAMILY}" font-size="${FONT}"` +
          `${r.bold ? ' font-weight="700"' : ''} fill="${r.muted ? p.muted : p.text}">${esc(r.text)}</text>`,
      )
    }
    if (r.kind === 'bar') {
      const fill = r.level === 'alert' ? ALERT : r.level === 'warn' ? WARN : style === 'solid' ? '#ffffff' : tone.fill
      const used = Math.max(0, Math.min(1, r.percent / 100)) * BAR
      body.push(`<rect x="${x}" y="${mid - 3}" width="${BAR}" height="6" rx="3" fill="${p.track}"/>`)
      if (used > 0) body.push(`<rect x="${x}" y="${mid - 3}" width="${used.toFixed(1)}" height="6" rx="3" fill="${fill}"/>`)
      // The pace tick: how far through the window the clock is. Usage past it
      // is ahead of an even pace.
      if (r.pace !== undefined) {
        const px = x + Math.max(0, Math.min(1, r.pace)) * BAR
        body.push(`<rect x="${(px - 1).toFixed(1)}" y="${mid - 6}" width="2" height="12" rx="1" fill="${p.tick}" fill-opacity="0.8"/>`)
      }
    }
    if (r.kind === 'divider') body.push(`<rect x="${x}" y="${mid - 7}" width="1" height="14" fill="${p.rule}"/>`)
    x += runWidth(r) + GAP
  }
  const ring = p.ring ? ` stroke="${p.ring}" stroke-opacity="0.55" stroke-width="1"` : ''
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}">` +
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${H - 1}" rx="${(H - 1) / 2}" fill="${p.bg}"${ring}/>${body.join('')}</svg>`
  return { source, width, height: H }
}

// "15.6k", "954.2k", "1.2M", "850".
export const tokens = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n))
