import type { Register } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { bars, configFrom, signalPill } from './register'

const start = { cwd: '/', surface: 'terminal', isInteractive: true } as const

test('bars step down with latency', () => {
  const c = configFrom({})
  expect(bars(0, c)).toBe('✕')
  expect(bars(50, c)).toBe('▂▄▆')
  expect(bars(500, c)).toBe('▂▄·')
  expect(bars(1000, c)).toBe('▂··')
  expect(bars(5000, c)).toBe('···')
})

test('samples on start and shows the signal in the status line', async ($, on) => {
  const clock = mock.clock(on)
  const statuses: (string | undefined)[] = []
  const fetched: string[] = []

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: ['terminal'] as const }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('http.fetch', async ($, e) => {
    fetched.push(e.url)
    const isBandwidth = e.url.includes('speed')
    await clock.sleep(isBandwidth ? 1000 : 48)
    return { value: { status: 200, ok: true, headers: {}, text: isBandwidth ? 'x'.repeat(2_500_000) : '' } }
  })

  await $.session.start(start)
  await clock.advance(2000)

  expect(fetched).toEqual(['https://api.anthropic.com/', 'https://speed.cloudflare.com/__down?bytes=3000000'])
  expect(statuses.at(-1)).toBe('▂▄▆ 48ms ↓20M')

  // The next latency sample comes 30 s later, without a bandwidth probe.
  await clock.advance(30_000)
  expect(fetched.length).toBe(3)

  const ran = await $.command.run({
    command: 'signal',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  expect(ran.text).toContain('48 ms to https://api.anthropic.com/')
})

test('shows offline when the latency probe fails', async ($, on) => {
  const clock = mock.clock(on)
  const statuses: (string | undefined)[] = []

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: ['terminal'] as const }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('http.fetch', () => {
    throw new Error('ENOTFOUND')
  })

  await $.session.start(start)
  await clock.settle()

  expect(statuses.at(-1)).toBe('✕ offline')
})

test('bars style shows only the glyph', { options: { style: 'bars' } }, async ($, on) => {
  const clock = mock.clock(on)
  const statuses: (string | undefined)[] = []

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: ['terminal'] as const }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('http.fetch', async () => {
    await clock.sleep(900)
    return { value: { status: 200, ok: true, headers: {}, text: '' } }
  })

  await $.session.start(start)
  await clock.advance(5000)

  expect(statuses.at(-1)).toBe('▂··')
})

const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
} as const

test('desktop band shows a pill beside the pills beneath it', async ($, on) => {
  const clock = mock.clock(on)

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('http.fetch', async () => {
    await clock.sleep(48)
    return { value: { status: 200, ok: true, headers: {}, text: '' } }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text key="other">5h 20%</Text>
  })

  const before = await $.ui.mount({ plugin: 'netsignal', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect((await before.find({ type: 'Svg' }))?.props.alt).toBe('Network signal: ▂▄▆ ?')

  await $.session.start(start)
  await clock.advance(2000)

  const band = await $.ui.mount({ plugin: 'netsignal', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect((await band.find({ type: 'Svg' }))?.props.alt).toBe('Network signal: ▂▄▆ 48ms')
  expect(await band.find({ text: '5h 20%' })).not.toBe(undefined)
  // In line with the first row of the pills beneath, not centred on them.
  expect((await band.find({ type: 'Box' }))?.props.alignItems).toBe('flex-start')
})

test('desktop hides the footer status line by default', async ($, on) => {
  const clock = mock.clock(on)
  const statuses: (string | undefined)[] = []

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: ['desktop'] as const }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('http.fetch', async () => {
    await clock.sleep(48)
    return { value: { status: 200, ok: true, headers: {}, text: '' } }
  })

  await $.session.start(start)
  await clock.advance(2000)

  expect(statuses.length > 0).toBe(true)
  expect(statuses.every(text => text === undefined)).toBe(true)
})

test('desktop footer placement keeps the status line and drops the pill', { options: { desktopPlacement: 'footer' } }, async ($, on) => {
  const clock = mock.clock(on)
  const statuses: (string | undefined)[] = []

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: ['desktop'] as const }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('http.fetch', async () => {
    await clock.sleep(48)
    return { value: { status: 200, ok: true, headers: {}, text: '' } }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text key="other">x</Text>
  })

  await $.session.start(start)
  await clock.advance(2000)

  expect(statuses.at(-1)).toBe('▂▄▆ 48ms')
  const band = await $.ui.mount({ plugin: 'netsignal', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect(await band.find({ type: 'Svg' })).toBe(undefined)
})

test('terminal band is left to the plugins beneath', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text key="other">x</Text>
  })

  const band = await $.ui.mount({ plugin: 'netsignal', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await band.find({ type: 'Svg' })).toBe(undefined)
})

test('the desktop pill lights bars by level and shows bandwidth in full style', () => {
  const c = configFrom({})
  const good = signalPill({ at: 0, latencyMs: 48, mbps: 19.6 }, c)
  expect(good.source).toContain('>48ms<')
  expect(good.source).toContain('>19.6M<')
  expect(good.source.match(/fill-opacity="0.25"/g)).toBe(null)
  const slow = signalPill({ at: 0, latencyMs: 900, mbps: 0 }, c)
  expect(slow.source.match(/fill-opacity="0.25"/g)?.length).toBe(2)
  expect(signalPill({ at: 0, latencyMs: 0, mbps: 0 }, c).source).toContain('>offline<')
  expect(signalPill(null, configFrom({ pillStyle: 'dark' })).source).toContain('#33322f')
})

test('a desktop band clears the footer even when the roster lacks the app', async ($, on) => {
  const clock = mock.clock(on)
  const statuses: (string | undefined)[] = []

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: [] as const }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('http.fetch', async () => {
    await clock.sleep(48)
    return { value: { status: 200, ok: true, headers: {}, text: '' } }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="other" />
  })

  await $.session.start(start)
  await clock.advance(2000)
  expect(statuses.at(-1)).toBe('▂▄▆ 48ms')

  await $.ui.mount({ plugin: 'netsignal', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect(statuses.at(-1)).toBe(undefined)

  // The next sample keeps it clear.
  await clock.advance(30_000)
  expect(statuses.at(-1)).toBe(undefined)
})

// Stands in for usagebar: its switch writes usagebar.style.
const usagebar = {
  name: 'usagebar',
  register: ((on: Parameters<Register>[0]) => {
    on('command.run', { command: 'pick' }, async ($, e) => {
      await $.state.set({ plugin: 'usagebar', key: 'style' } as never, e.args as never)
      return { text: '' }
    })
  }) as Register,
}

test("follows the style usagebar's switch picks, and remembers it", { plugins: [usagebar] }, async ($, on) => {
  const clock = mock.clock(on)
  const stored: Record<string, unknown> = {}

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: ['desktop'] as const }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('store.get', ($, e) => ({ value: stored[e.key] }))
  on('store.set', ($, e) => {
    stored[e.key] = e.value
    return { value: undefined }
  })
  on('http.fetch', async () => {
    await clock.sleep(48)
    return { value: { status: 200, ok: true, headers: {}, text: '' } }
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="other" />
  })

  await $.session.start(start)
  await clock.advance(2000)
  const bg = async () => {
    const band = await $.ui.mount({ plugin: 'netsignal', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    return String((await band.find({ type: 'Svg' }))?.props.source).match(/fill="(#[0-9a-f]{6})"/)?.[1]
  }
  expect(await bg()).toBe('#d9eadb')

  await $.command.run({ command: 'pick', args: 'dark', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  expect(await bg()).toBe('#33322f')
  expect(stored.pillStyle).toBe('dark')
})
