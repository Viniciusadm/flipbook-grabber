import { describe, expect, it } from 'vitest'
import { activeJob, createJob, isDuplicate, nextQueued, patchJob, removeJob } from '@/background/queue'
import type { Publication } from '@/shared/types'

function publication(baseUrl: string, pages = 3): Publication {
  return {
    title: `book-${baseUrl}`,
    baseUrl,
    pageUrls: Array.from({ length: pages }, (_, index) => `${baseUrl}page-${index}.jpg`),
    thumbUrls: [],
  }
}

describe('queue', () => {
  it('cria job na fila com o total de páginas', () => {
    const job = createJob(publication('https://a/'), 'pdf', 'id-1')
    expect(job.phase).toBe('queued')
    expect(job.total).toBe(3)
  })

  it('só libera o próximo da fila quando nenhum job está ativo', () => {
    const jobs = [createJob(publication('https://a/'), 'pdf', 'a'), createJob(publication('https://b/'), 'pdf', 'b')]
    expect(nextQueued(jobs)?.id).toBe('a')

    const running = patchJob(jobs, 'a', { phase: 'downloading' })
    expect(nextQueued(running)).toBeNull()
    expect(activeJob(running)?.id).toBe('a')

    expect(nextQueued(patchJob(running, 'a', { phase: 'done' }))?.id).toBe('b')
  })

  it('reconhece publicação já enfileirada no mesmo formato', () => {
    const pub = publication('https://a/')
    const jobs = [createJob(pub, 'pdf', 'a')]
    expect(isDuplicate(jobs, pub, 'pdf')).toBe(true)
    expect(isDuplicate(jobs, pub, 'epub')).toBe(false)
    expect(isDuplicate(patchJob(jobs, 'a', { phase: 'done' }), pub, 'pdf')).toBe(false)
    expect(isDuplicate(removeJob(jobs, 'a'), pub, 'pdf')).toBe(false)
  })
})
