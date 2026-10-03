export type NetSample = { at: number; latencyMs: number; mbps: number }

declare module 'claude-code' {
  interface PluginState {
    netsignal: { last: NetSample | null }
  }
}
