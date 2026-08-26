import type { JobState, OutputFormat, Publication } from './types'

export type PanelMessage =
  | { type: 'panel/inspect' }
  | { type: 'panel/start'; format: OutputFormat }
  | { type: 'panel/cancel' }
  | { type: 'panel/getState' }

export type WorkerMessage =
  | { type: 'worker/progress'; downloaded: number; total: number }
  | { type: 'worker/building' }
  | { type: 'worker/done'; fileName: string }
  | { type: 'worker/error'; message: string }
  | { type: 'worker/saveFile'; url: string; fileName: string }

export type BackgroundMessage =
  | { type: 'bg/state'; state: JobState }
  | { type: 'bg/run'; publication: Publication; format: OutputFormat }

export type AnyMessage = PanelMessage | WorkerMessage | BackgroundMessage

export function isWorkerMessage(m: AnyMessage): m is WorkerMessage {
  return m.type.startsWith('worker/')
}
