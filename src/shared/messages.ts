import type { AppState, OutputFormat, Publication } from './types'

export type PanelMessage =
  | { type: 'panel/inspect' }
  | { type: 'panel/start'; format: OutputFormat }
  | { type: 'panel/cancel'; jobId: string }
  | { type: 'panel/getState' }

export type WorkerMessage =
  | { type: 'worker/progress'; jobId: string; downloaded: number; total: number }
  | { type: 'worker/building'; jobId: string }
  | { type: 'worker/done'; jobId: string; fileName: string }
  | { type: 'worker/error'; jobId: string; message: string }
  | { type: 'worker/saveFile'; jobId: string; url: string; fileName: string }

export type BackgroundMessage =
  | { type: 'bg/state'; state: AppState }
  | { type: 'bg/run'; jobId: string; publication: Publication; format: OutputFormat }

export type AnyMessage = PanelMessage | WorkerMessage | BackgroundMessage

export function isWorkerMessage(m: AnyMessage): m is WorkerMessage {
  return m.type.startsWith('worker/')
}
