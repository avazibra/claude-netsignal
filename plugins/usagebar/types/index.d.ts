export type UsageWindow = { kind: string; percent: number; resetsAt?: string }

export type UsageSnapshot = {
  windows: UsageWindow[]
  contextPercent?: number
  usd?: number
}

declare module 'claude-code' {
  interface PluginState {
    usagebar: { last: UsageSnapshot | null }
  }
}
