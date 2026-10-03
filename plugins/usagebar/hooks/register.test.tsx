import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { configFrom, render, until } from './register'

const start = { cwd: '/', surface: 'terminal', isInteractive: true } as const
const NOW = Date.parse('2026-10-03T06:00:00Z')

const usage = {
  startedAt: NOW,
  context: { window: 200_000, tokens: 62_000, percent: 31 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-10-03T08:10:00Z' },
    { kind: 'seven_day', percentUsed: 18, resetsAt: '2026-10-06T10:00:00Z' },
  ],
  cost: { usd: 1.237 },
}

test('reset countdowns read as days, hours or minutes', () => {
  expect(until('2026-10-03T08:10:00Z', NOW)).toBe('2h10m')
  expect(until('2026-10-06T10:00:00Z', NOW)).toBe('3d4h')
  expect(until('2026-10-03T06:12:00Z', NOW)).toBe('12m')
  expect(until(undefined, NOW)).toBe('')
})

test('compact style drops reset times; cost only when asked', () => {
  const s = { windows: [{ kind: 'five_hour', percent: 42.4 }], contextPercent: 31, usd: 2 }
  expect(render(s, configFrom({ style: 'compact' }), NOW)).toBe('5h 42% · ctx 31%')
  expect(render(s, configFrom({ style: 'compact', showCost: true, showContext: false }), NOW)).toBe('5h 42% · $2.00')
  expect(render({ windows: [] }, configFrom({}), NOW)).toBe(undefined)
})

function wire(on: On, surfaces: ('terminal' | 'desktop')[] = ['terminal']) {
  const clock = mock.clock(on, { now: NOW })
  const statuses: (string | undefined)[] = []
  const toasts: string[] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.usage', () => ({ value: usage }))
  on('session.surfaces', () => ({ value: surfaces }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    toasts.push(String(e.text))
    return { value: undefined }
  })
  return { clock, statuses, toasts }
}

test('shows usage on start and follows each measurement', async ($, on) => {
  const { clock, statuses, toasts } = wire(on)

  await $.session.start(start)
  await clock.settle()
  expect(statuses.at(-1)).toBe('5h 42% ↻2h10m · 7d 18% ↻3d4h · ctx 31%')

  await $.session.measure({
    context: { window: 200_000, percent: 55 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 93, resetsAt: '2026-10-03T08:10:00Z' }],
    changed: ['rateLimits', 'context'],
  })
  expect(statuses.at(-1)).toBe('5h 93% ↻2h10m · ctx 55%')
  expect(toasts).toEqual(['5h usage at 93%, resets in 2h10m'])

  // The same window past the threshold again does not toast twice.
  await $.session.measure({
    context: { window: 200_000, percent: 56 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 95, resetsAt: '2026-10-03T08:10:00Z' }],
    changed: ['rateLimits'],
  })
  expect(toasts.length).toBe(1)

  const ran = await $.command.run({
    command: 'usagebar',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(ran.text).toContain('5h limit: 42% used, resets in 2h10m')
  expect(ran.text).toContain('Session cost: $1.24')
})

test('draws pills above the prompt in the apps, not the terminal', async ($, on) => {
  const { clock } = wire(on)
  await $.session.start(start)
  await clock.settle()

  const props = {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  }
  const desktop = await $.ui.mount({ plugin: 'usagebar', surface: 'desktop', component: 'AbovePrompt', props })
  expect((await desktop.findAll({ type: 'Text', text: /5h 42%/ })).length).toBe(1)
  expect((await desktop.findAll({ type: 'Text', text: /ctx 31%/ })).length).toBe(1)

  const terminal = await $.ui.mount({ plugin: 'usagebar', surface: 'terminal', component: 'AbovePrompt', props })
  expect((await terminal.findAll({ type: 'Text', text: /5h/ })).length).toBe(0)
})

test('desktop shows pills only, the footer stays empty', async ($, on) => {
  const { clock, statuses } = wire(on, ['desktop'])
  await $.session.start(start)
  await clock.settle()
  expect(statuses.length).toBeGreaterThan(0)
  expect(statuses.every(t => t === undefined)).toBe(true)
})

test('desktop footer placement keeps the status line', { options: { desktopPlacement: 'footer' } }, async ($, on) => {
  const { clock, statuses } = wire(on, ['desktop'])
  await $.session.start(start)
  await clock.settle()
  expect(statuses.at(-1)).toBe('5h 42% ↻2h10m · 7d 18% ↻3d4h · ctx 31%')
})
