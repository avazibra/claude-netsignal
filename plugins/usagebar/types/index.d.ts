export type UsageWindow = { kind: string; percent: number; resetsAt?: string }

export type UsageSnapshot = {
  windows: UsageWindow[]
  contextPercent?: number
  contextTokens?: number
  usd?: number
}

export type PillStyle = 'soft' | 'outline' | 'solid' | 'dark'

export type UsageTokens = { input: number; output: number }

declare module 'claude-code' {
  interface PluginState {
    usagebar: { last: UsageSnapshot | null; tokens: UsageTokens; style: PillStyle | null }
  }
}
