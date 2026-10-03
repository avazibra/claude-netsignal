// latencyMs: 0 when the probe failed; timedOut: no answer within the timeout.
export type NetSample = { at: number; latencyMs: number; mbps: number; timedOut?: boolean }

declare module 'claude-code' {
  interface PluginState {
    netsignal: { last: NetSample | null; style: 'soft' | 'outline' | 'solid' | 'dark' | null }
  }
}
