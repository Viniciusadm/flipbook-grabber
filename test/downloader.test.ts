import { describe, expect, it, vi } from 'vitest'
import { downloadAll } from '@/background/downloader'

const noSleep = () => Promise.resolve()

function okFetch(record?: (url: string) => void): typeof fetch {
  return (async (url: string) => {
    record?.(url)
    return { ok: true, status: 200, blob: async () => new Blob([url]) } as unknown as Response
  }) as unknown as typeof fetch
}

describe('downloadAll', () => {
  it('devolve os blobs na ordem das urls, nao na ordem de chegada', async () => {
    const urls = ['a', 'b', 'c', 'd', 'e']
    const fetchImpl = (async (url: string) => {
      const delay = url === 'a' ? 20 : 1
      await new Promise((resolve) => setTimeout(resolve, delay))
      return { ok: true, status: 200, blob: async () => new Blob([url]) } as unknown as Response
    }) as unknown as typeof fetch

    const blobs = await downloadAll(urls, { concurrency: 3, fetchImpl, sleepImpl: noSleep })
    const texts = await Promise.all(blobs.map((blob) => blob.text()))
    expect(texts).toEqual(urls)
  })

  it('respeita o limite de concorrencia', async () => {
    let active = 0
    let peak = 0
    const fetchImpl = (async (url: string) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return { ok: true, status: 200, blob: async () => new Blob([url]) } as unknown as Response
    }) as unknown as typeof fetch

    await downloadAll(['1', '2', '3', '4', '5', '6', '7', '8'], {
      concurrency: 3,
      fetchImpl,
      sleepImpl: noSleep,
    })
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('tenta de novo depois de uma falha e entrega o resultado', async () => {
    let calls = 0
    const fetchImpl = (async (url: string) => {
      calls += 1
      if (calls < 3) throw new Error('rede caiu')
      return { ok: true, status: 200, blob: async () => new Blob([url]) } as unknown as Response
    }) as unknown as typeof fetch

    const blobs = await downloadAll(['x'], { retries: 3, fetchImpl, sleepImpl: noSleep })
    expect(calls).toBe(3)
    expect(await blobs[0].text()).toBe('x')
  })

  it('desiste depois de esgotar as tentativas', async () => {
    const fetchImpl = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch

    await expect(downloadAll(['x'], { retries: 2, fetchImpl, sleepImpl: noSleep })).rejects.toThrow(
      /Falha ao baixar/,
    )
  })

  it('trata status http de erro como falha', async () => {
    const fetchImpl = (async () =>
      ({ ok: false, status: 404, blob: async () => new Blob() }) as unknown as Response) as unknown as typeof fetch

    await expect(downloadAll(['x'], { retries: 0, fetchImpl, sleepImpl: noSleep })).rejects.toThrow(
      /HTTP 404/,
    )
  })

  it('relata progresso uma vez por pagina', async () => {
    const onProgress = vi.fn()
    await downloadAll(['a', 'b', 'c'], { fetchImpl: okFetch(), sleepImpl: noSleep, onProgress })
    expect(onProgress).toHaveBeenCalledTimes(3)
    expect(onProgress).toHaveBeenLastCalledWith(3, 3)
  })

  it('interrompe quando o sinal e abortado', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      downloadAll(['a', 'b'], { fetchImpl: okFetch(), sleepImpl: noSleep, signal: controller.signal }),
    ).rejects.toThrow()
  })
})
