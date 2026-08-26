import { downloadAll } from '@/background/downloader'
import { buildEpub, type EpubPageImage } from '@/builders/epub'
import { toEpubPage, toJpegPage } from '@/builders/images'
import { buildPdf, type PdfPageImage } from '@/builders/pdf'
import type { AnyMessage } from '@/shared/messages'
import type { OutputFormat, Publication } from '@/shared/types'

let currentAbort: AbortController | null = null

function send(message: AnyMessage): void {
  chrome.runtime.sendMessage(message).catch(() => undefined)
}

async function run(publication: Publication, format: OutputFormat): Promise<void> {
  currentAbort?.abort()
  const abort = new AbortController()
  currentAbort = abort

  const blobs = await downloadAll(publication.pageUrls, {
    concurrency: 4,
    signal: abort.signal,
    onProgress: (downloaded, total) => send({ type: 'worker/progress', downloaded, total }),
  })

  send({ type: 'worker/building' })

  let file: Blob
  let fileName: string
  if (format === 'pdf') {
    const pages: PdfPageImage[] = []
    for (const blob of blobs) pages.push(await toJpegPage(blob))
    file = buildPdf(pages)
    fileName = `${publication.title}.pdf`
  } else {
    const pages: EpubPageImage[] = []
    for (const blob of blobs) pages.push(await toEpubPage(blob))
    file = buildEpub(publication.title, pages)
    fileName = `${publication.title}.epub`
  }

  const url = URL.createObjectURL(file)
  try {
    await chrome.runtime.sendMessage({ type: 'worker/saveFile', url, fileName })
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  send({ type: 'worker/done', fileName })
}

chrome.runtime.onMessage.addListener((message: AnyMessage) => {
  if (message.type === 'bg/run') {
    run(message.publication, message.format).catch((error: unknown) => {
      const isAbort = error instanceof DOMException && error.name === 'AbortError'
      if (!isAbort) send({ type: 'worker/error', message: String((error as Error)?.message ?? error) })
    })
  }
  if (message.type === 'panel/cancel') currentAbort?.abort()
  return undefined
})
