import { expect, mock, test } from 'claude-code/testing'

import { bars, configFrom } from './register'

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
  expect((await before.find({ key: 'netsignal' }))?.text).toBe('▂▄▆ ?')

  await $.session.start(start)
  await clock.advance(2000)

  const band = await $.ui.mount({ plugin: 'netsignal', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect((await band.find({ key: 'netsignal' }))?.text).toBe('▂▄▆ 48ms')
  expect(await band.find({ text: '5h 20%' })).not.toBe(undefined)
})

test('terminal band is left to the plugins beneath', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text key="other">x</Text>
  })

  const band = await $.ui.mount({ plugin: 'netsignal', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await band.find({ key: 'netsignal' })).toBe(undefined)
})
