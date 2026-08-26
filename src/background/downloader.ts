export interface DownloadOptions {
  concurrency?: number
  retries?: number
  retryDelayMs?: number
  signal?: AbortSignal
  onProgress?: (completed: number, total: number) => void
  fetchImpl?: typeof fetch
  sleepImpl?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function fetchWithRetry(
  url: string,
  retries: number,
  retryDelayMs: number,
  fetchImpl: typeof fetch,
  sleepImpl: (ms: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<Blob> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError')
    try {
      const response = await fetchImpl(url, { signal, credentials: 'omit' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.blob()
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
      if (attempt < retries) await sleepImpl(retryDelayMs * 2 ** attempt)
    }
  }
  throw new Error(`Falha ao baixar ${url}: ${String(lastError)}`)
}

export async function downloadAll(urls: string[], options: DownloadOptions = {}): Promise<Blob[]> {
  const {
    concurrency = 4,
    retries = 3,
    retryDelayMs = 400,
    signal,
    onProgress,
    fetchImpl = fetch,
    sleepImpl = defaultSleep,
  } = options

  const results = new Array<Blob>(urls.length)
  let nextIndex = 0
  let completed = 0

  const runWorker = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex
      nextIndex += 1
      if (index >= urls.length) return
      if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError')
      results[index] = await fetchWithRetry(urls[index], retries, retryDelayMs, fetchImpl, sleepImpl, signal)
      completed += 1
      onProgress?.(completed, urls.length)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, runWorker)
  await Promise.all(workers)
  return results
}
