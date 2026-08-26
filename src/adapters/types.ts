import type { Publication } from '@/shared/types'

export interface RawPublication {
  title: string
  baseUrl: string
  pageFiles: string[]
  thumbFiles: string[]
}

export interface FlipbookAdapter {
  id: string
  matches(url: string): boolean
  reader: () => RawPublication | null
  toPublication(raw: RawPublication): Publication
}
