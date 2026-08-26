import type { Publication } from '@/shared/types'
import type { FlipbookAdapter, RawPublication } from './types'

export function readAnyflipConfig(): RawPublication | null {
  const w = window as unknown as Record<string, any>
  const htmlConfig = w.htmlConfig
  if (!htmlConfig) return null

  let bookConfig = w.bookConfig
  if (!bookConfig && typeof htmlConfig.bookConfig === 'string' && typeof w.getDeString === 'function') {
    try {
      bookConfig = JSON.parse(w.getDeString(htmlConfig.bookConfig))
    } catch {
      bookConfig = null
    }
  }

  let pages = htmlConfig.fliphtml5_pages
  if (typeof pages === 'string' && typeof w.getDeString === 'function') {
    try {
      pages = JSON.parse(w.getDeString(pages))
    } catch {
      pages = null
    }
  }
  if (!Array.isArray(pages) || pages.length === 0) return null

  const pageFiles: string[] = []
  const thumbFiles: string[] = []
  for (const entry of pages) {
    const large = Array.isArray(entry?.n) ? entry.n[0] : entry?.n
    if (typeof large !== 'string' || large.length === 0) return null
    pageFiles.push(large)
    thumbFiles.push(typeof entry?.t === 'string' ? entry.t : '')
  }

  const segments = location.pathname.split('/').filter(Boolean)
  const baseUrl = `${location.origin}/${segments.slice(0, 2).join('/')}/`

  const title =
    (typeof bookConfig?.title === 'string' && bookConfig.title) ||
    (typeof htmlConfig?.meta?.title === 'string' && htmlConfig.meta.title) ||
    document.title ||
    'publicacao'

  return { title, baseUrl, pageFiles, thumbFiles }
}

export function sanitizeFileName(title: string): string {
  const cleaned = title
    .replace(/\s*\|\s*AnyFlip\s*$/i, '')
    .replace(/\s*Flip\s*PDF\s*$/i, '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.slice(0, 120) || 'publicacao'
}

function resolveFolder(path: string, baseUrl: string): string {
  const relative = path.replace(/^(\.\.?\/)+/, '').replace(/^\/+/, '')
  return new URL(relative, baseUrl).toString()
}

function fileNameOf(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? ''
}

export const anyflipAdapter: FlipbookAdapter = {
  id: 'anyflip',

  matches(url: string): boolean {
    try {
      return /(^|\.)anyflip\.com$/.test(new URL(url).hostname)
    } catch {
      return false
    }
  },

  reader: readAnyflipConfig,

  toPublication(raw: RawPublication): Publication {
    const largeFolder = resolveFolder('files/large/', raw.baseUrl)
    const thumbFolder = resolveFolder('files/thumb/', raw.baseUrl)
    return {
      title: sanitizeFileName(raw.title),
      baseUrl: raw.baseUrl,
      pageUrls: raw.pageFiles.map((file) => new URL(fileNameOf(file), largeFolder).toString()),
      thumbUrls: raw.thumbFiles.map((file) =>
        file ? new URL(fileNameOf(file), thumbFolder).toString() : '',
      ),
    }
  },
}

export const adapters: FlipbookAdapter[] = [anyflipAdapter]

export function adapterFor(url: string): FlipbookAdapter | null {
  return adapters.find((adapter) => adapter.matches(url)) ?? null
}
