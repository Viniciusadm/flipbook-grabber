export type OutputFormat = 'pdf' | 'epub'

export interface Publication {
  title: string
  baseUrl: string
  pageUrls: string[]
  thumbUrls: string[]
}

export type JobPhase = 'queued' | 'downloading' | 'building' | 'done' | 'error'

export interface Job {
  id: string
  publication: Publication
  format: OutputFormat
  phase: JobPhase
  downloaded: number
  total: number
  fileName: string | null
  error: string | null
}

export type DetectionPhase = 'idle' | 'discovering' | 'ready' | 'unsupported' | 'error'

export interface Detection {
  phase: DetectionPhase
  publication: Publication | null
  error: string | null
}

export interface AppState {
  detection: Detection
  jobs: Job[]
}

export const initialAppState: AppState = {
  detection: { phase: 'idle', publication: null, error: null },
  jobs: [],
}
