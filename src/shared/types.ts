export type OutputFormat = 'pdf' | 'epub'

export interface Publication {
  title: string
  baseUrl: string
  pageUrls: string[]
  thumbUrls: string[]
}

export type JobPhase =
  | 'idle'
  | 'discovering'
  | 'downloading'
  | 'building'
  | 'done'
  | 'error'

export interface JobState {
  phase: JobPhase
  publication: Publication | null
  format: OutputFormat
  downloaded: number
  total: number
  fileName: string | null
  error: string | null
}

export const initialJobState: JobState = {
  phase: 'idle',
  publication: null,
  format: 'pdf',
  downloaded: 0,
  total: 0,
  fileName: null,
  error: null,
}
