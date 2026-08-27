import type { Job, OutputFormat, Publication } from '@/shared/types'

const ACTIVE_PHASES: Job['phase'][] = ['downloading', 'building']

export function createJob(publication: Publication, format: OutputFormat, id: string): Job {
  return {
    id,
    publication,
    format,
    phase: 'queued',
    downloaded: 0,
    total: publication.pageUrls.length,
    fileName: null,
    error: null,
  }
}

export function patchJob(jobs: Job[], jobId: string, patch: Partial<Job>): Job[] {
  return jobs.map((job) => (job.id === jobId ? { ...job, ...patch } : job))
}

export function removeJob(jobs: Job[], jobId: string): Job[] {
  return jobs.filter((job) => job.id !== jobId)
}

export function activeJob(jobs: Job[]): Job | null {
  return jobs.find((job) => ACTIVE_PHASES.includes(job.phase)) ?? null
}

export function nextQueued(jobs: Job[]): Job | null {
  if (activeJob(jobs)) return null
  return jobs.find((job) => job.phase === 'queued') ?? null
}

export function isDuplicate(jobs: Job[], publication: Publication, format: OutputFormat): boolean {
  return jobs.some(
    (job) =>
      job.publication.baseUrl === publication.baseUrl &&
      job.format === format &&
      (job.phase === 'queued' || ACTIVE_PHASES.includes(job.phase)),
  )
}
