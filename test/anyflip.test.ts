import { describe, expect, it } from 'vitest'
import { anyflipAdapter, adapterFor, sanitizeFileName } from '@/adapters/anyflip'
import type { RawPublication } from '@/adapters/types'

const raw: RawPublication = {
  title: 'Minha Revista | AnyFlip',
  baseUrl: 'https://online.anyflip.com/dbeui/umjy/',
  pageFiles: ['aaa.webp', 'bbb.webp'],
  thumbFiles: ['../files/thumb/t1.webp', '../files/thumb/t2.webp'],
}

describe('anyflip adapter', () => {
  it('reconhece urls do anyflip e recusa o resto', () => {
    expect(anyflipAdapter.matches('https://anyflip.com/dbeui/umjy/')).toBe(true)
    expect(anyflipAdapter.matches('https://online.anyflip.com/dbeui/umjy/')).toBe(true)
    expect(anyflipAdapter.matches('https://example.com/anyflip.com/x')).toBe(false)
    expect(adapterFor('https://fliphtml5.com/a/b/')).toBeNull()
  })

  it('monta as urls de pagina a partir da base da publicacao', () => {
    const publication = anyflipAdapter.toPublication(raw)
    expect(publication.pageUrls).toEqual([
      'https://online.anyflip.com/dbeui/umjy/files/large/aaa.webp',
      'https://online.anyflip.com/dbeui/umjy/files/large/bbb.webp',
    ])
  })

  it('resolve miniaturas ignorando os segmentos relativos do config', () => {
    const publication = anyflipAdapter.toPublication(raw)
    expect(publication.thumbUrls).toEqual([
      'https://online.anyflip.com/dbeui/umjy/files/thumb/t1.webp',
      'https://online.anyflip.com/dbeui/umjy/files/thumb/t2.webp',
    ])
  })

  it('limpa o titulo para virar nome de arquivo', () => {
    expect(sanitizeFileName('Minha Revista | AnyFlip')).toBe('Minha Revista')
    expect(sanitizeFileName('a/b:c*d?')).toBe('abcd')
    expect(sanitizeFileName('   ')).toBe('publicacao')
  })

  it('preserva a ordem das paginas', () => {
    const many = { ...raw, pageFiles: ['1.webp', '2.webp', '3.webp'], thumbFiles: ['', '', ''] }
    const publication = anyflipAdapter.toPublication(many)
    expect(publication.pageUrls.map((url) => url.split('/').pop())).toEqual(['1.webp', '2.webp', '3.webp'])
  })
})
