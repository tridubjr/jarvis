import { BACKEND } from '../config'
import * as direct from './anthropic'
import * as bridge from './bridge'
import * as cloud from './cloud'
import type { AskHandlers, Msg } from './anthropic'
import type { Blade, Panel } from '../store'

export type { AskHandlers, Msg }
export type { ConnectionState } from './bridge'

export const usingBridge = BACKEND === 'bridge'

export async function ask(
  prompt: string,
  history: Msg[],
  handlers: AskHandlers,
): Promise<{ text: string; tools: string[] }> {
  if (BACKEND === 'bridge') return bridge.ask(prompt, handlers)
  if (BACKEND === 'cloud') return cloud.ask(prompt, history, handlers)
  return direct.ask([...history, { role: 'user', content: prompt }], handlers)
}

export async function warm(): Promise<void> {
  if (BACKEND === 'bridge') await bridge.warmBridge()
  else if (BACKEND === 'cloud') await cloud.warm()
}

export function watchServers(fn: (servers: string[]) => void): void {
  if (BACKEND === 'bridge') bridge.watchServers(fn)
  else if (BACKEND === 'cloud') fn(['Gemini cloud'])
}

export function watchPanels(fn: (panel: Panel) => void): void {
  if (BACKEND === 'bridge') bridge.watchPanels(fn)
}

export function watchBlades(fn: (blade: Blade) => void): void {
  if (BACKEND === 'bridge') bridge.watchBlades(fn)
}

export function watchUi(fn: (op: string, args: any) => void): void {
  if (BACKEND === 'bridge') bridge.watchUi(fn)
}

export function watchCapture(
  fn: (req: bridge.CaptureRequest) => Promise<bridge.CaptureResult>,
): void {
  if (BACKEND === 'bridge') bridge.watchCapture(fn)
}

export function cancel(): void {
  if (BACKEND === 'bridge') bridge.cancel()
  else if (BACKEND === 'cloud') cloud.cancel()
  else direct.cancel()
}

export function interrupt(): void {
  cancel()
}

export function isConnected(): boolean {
  return BACKEND === 'bridge' ? bridge.isConnected() : true
}

export function watchConnection(
  fn: (state: bridge.ConnectionState) => void,
): void {
  if (BACKEND === 'bridge') bridge.watchConnection(fn)
}

export function connectedLabels(): string[] {
  if (BACKEND === 'bridge') return bridge.bridgeServers()
  if (BACKEND === 'cloud') return ['Gemini cloud']
  return direct.connectedLabels()
}
