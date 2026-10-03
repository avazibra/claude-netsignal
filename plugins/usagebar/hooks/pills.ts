// The pills the apps show above the prompt, drawn as SVG so they can carry
// rounded corners, icons and progress bars the band's own elements lack.

export type Tone = { bg: string; ink: string; fill: string }

// Pastel backgrounds with a darker icon colour, one per kind of figure.
export const TONES = {
  fiveHour: { bg: '#d9eae2', ink: '#3f7d68', fill: '#8fb47d' },
  sevenDay: { bg: '#e5def3', ink: '#7a5fc0', fill: '#8fb47d' },
  input: { bg: '#f1ddd6', ink: '#c0583f', fill: '' },
  output: { bg: '#d9eadb', ink: '#4f8a55', fill: '' },
  context: { bg: '#dde2f6', ink: '#4f5fc9', fill: '' },
  cost: { bg: '#f1e6cc', ink: '#a8812a', fill: '' },
} satisfies Record<string, Tone>

const WARN = '#d6a33a'
const ALERT = '#cf5f45'

const FONT = 13
const CHAR = FONT * 0.62
const H = 26
const PAD = 10
const GAP = 7
const ICON = 15
const BAR = 46
const FAMILY = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace"
const MUTED = '#6f6e69'
const STRONG = '#1c1b1a'

type Icon = (x: number, color: string) => string

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
} satisfies Record<string, Icon>

// One run of a pill: an icon, a word, a bar or a divider, laid left to right.
export type Run =
  | { kind: 'icon'; icon: keyof typeof ICONS }
  | { kind: 'text'; text: string; bold?: boolean; muted?: boolean }
  | { kind: 'bar'; percent: number; pace?: number; level: 'good' | 'warn' | 'alert' }
  | { kind: 'divider' }

const runWidth = (r: Run) =>
  r.kind === 'icon' ? ICON : r.kind === 'text' ? Math.ceil(r.text.length * CHAR) : r.kind === 'bar' ? BAR : 1

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The pill as an SVG document and the width it takes, in CSS pixels.
export function pill(runs: Run[], tone: Tone) {
  const width = PAD * 2 + runs.reduce((w, r) => w + runWidth(r), 0) + GAP * Math.max(0, runs.length - 1)
  const mid = H / 2
  let x = PAD
  const body: string[] = []
  for (const r of runs) {
    if (r.kind === 'icon') body.push(ICONS[r.icon](x, tone.ink))
    if (r.kind === 'text') {
      const color = r.muted ? MUTED : STRONG
      body.push(
        `<text x="${x}" y="${mid + FONT * 0.36}" font-family="${FAMILY}" font-size="${FONT}"` +
          `${r.bold ? ' font-weight="700"' : ''} fill="${color}">${esc(r.text)}</text>`,
      )
    }
    if (r.kind === 'bar') {
      const fill = r.level === 'alert' ? ALERT : r.level === 'warn' ? WARN : tone.fill
      const used = Math.max(0, Math.min(1, r.percent / 100)) * BAR
      body.push(`<rect x="${x}" y="${mid - 3}" width="${BAR}" height="6" rx="3" fill="#000" fill-opacity="0.1"/>`)
      if (used > 0) body.push(`<rect x="${x}" y="${mid - 3}" width="${used.toFixed(1)}" height="6" rx="3" fill="${fill}"/>`)
      // The pace tick: how far through the window the clock is. Usage past it
      // is ahead of an even pace.
      if (r.pace !== undefined) {
        const px = x + Math.max(0, Math.min(1, r.pace)) * BAR
        body.push(`<rect x="${(px - 1).toFixed(1)}" y="${mid - 6}" width="2" height="12" rx="1" fill="${STRONG}" fill-opacity="0.75"/>`)
      }
    }
    if (r.kind === 'divider') body.push(`<rect x="${x}" y="${mid - 7}" width="1" height="14" fill="#000" fill-opacity="0.15"/>`)
    x += runWidth(r) + GAP
  }
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}">` +
    `<rect width="${width}" height="${H}" rx="${H / 2}" fill="${tone.bg}"/>${body.join('')}</svg>`
  return { source, width, height: H }
}

// "15.6k", "954.2k", "1.2M", "850".
export const tokens = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n))
