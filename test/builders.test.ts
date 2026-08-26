import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { buildEpub, type EpubPageImage } from '@/builders/epub'
import { buildPdf, type PdfPageImage } from '@/builders/pdf'

const decoder = new TextDecoder()

function epubPage(marker: number): EpubPageImage {
  return {
    bytes: new Uint8Array([marker, marker, marker]),
    mimeType: 'image/webp',
    extension: 'webp',
    width: 800,
    height: 1200,
  }
}

function pdfPage(size: number): PdfPageImage {
  return { jpeg: new Uint8Array(size).fill(0x41), width: 600, height: 900 }
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

describe('buildEpub', () => {
  it('recusa uma publicacao sem paginas', () => {
    expect(() => buildEpub('x', [])).toThrow(/Nenhuma página/)
  })

  it('grava mimetype como primeira entrada e sem compressao', async () => {
    const bytes = await bytesOf(buildEpub('Revista', [epubPage(1)]))
    expect(decoder.decode(bytes.slice(30, 38))).toBe('mimetype')
    expect(decoder.decode(bytes.slice(38, 58))).toBe('application/epub+zip')
  })

  it('inclui uma imagem e um xhtml por pagina, na ordem da spine', async () => {
    const epub = unzipSync(await bytesOf(buildEpub('Revista', [epubPage(1), epubPage(2), epubPage(3)])))
    expect(Object.keys(epub)).toEqual(
      expect.arrayContaining([
        'OEBPS/images/page-0001.webp',
        'OEBPS/images/page-0003.webp',
        'OEBPS/page-0002.xhtml',
        'OEBPS/content.opf',
        'OEBPS/nav.xhtml',
        'META-INF/container.xml',
      ]),
    )

    const opf = decoder.decode(epub['OEBPS/content.opf'])
    const spine = [...opf.matchAll(/<itemref idref="pg-(\d+)"\/>/g)].map((match) => match[1])
    expect(spine).toEqual(['0001', '0002', '0003'])
  })

  it('preserva os bytes originais da imagem', async () => {
    const epub = unzipSync(await bytesOf(buildEpub('Revista', [epubPage(7)])))
    expect(Array.from(epub['OEBPS/images/page-0001.webp'])).toEqual([7, 7, 7])
  })

  it('escapa caracteres xml no titulo', async () => {
    const epub = unzipSync(await bytesOf(buildEpub('Bar & Cia <teste>', [epubPage(1)])))
    const opf = decoder.decode(epub['OEBPS/content.opf'])
    expect(opf).toContain('Bar &amp; Cia &lt;teste&gt;')
    expect(opf).not.toContain('<teste>')
  })
})

describe('buildPdf', () => {
  it('recusa uma publicacao sem paginas', () => {
    expect(() => buildPdf([])).toThrow(/Nenhuma página/)
  })

  it('gera um pdf com um objeto de pagina por imagem', async () => {
    const text = decoder.decode(await bytesOf(buildPdf([pdfPage(10), pdfPage(10), pdfPage(10)])))
    expect(text.startsWith('%PDF-1.7')).toBe(true)
    expect(text).toContain('/Type /Pages /Count 3')
    expect(text.match(/\/Type \/Page\b/g) ?? []).toHaveLength(3)
    expect(text.match(/\/Subtype \/Image/g) ?? []).toHaveLength(3)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('usa o tamanho da imagem como MediaBox', async () => {
    const text = decoder.decode(await bytesOf(buildPdf([{ jpeg: new Uint8Array(4), width: 123, height: 456 }])))
    expect(text).toContain('/MediaBox [0 0 123 456]')
    expect(text).toContain('q 123 0 0 456 0 0 cm /Im0 Do Q')
  })

  it('declara o tamanho real do stream jpeg', async () => {
    const text = decoder.decode(await bytesOf(buildPdf([pdfPage(1234)])))
    expect(text).toContain('/Filter /DCTDecode /Length 1234')
  })

  it('escreve uma entrada de xref por objeto', async () => {
    const text = decoder.decode(await bytesOf(buildPdf([pdfPage(8), pdfPage(8)])))
    expect(text).toContain('xref\n0 9\n')
    expect(text).toContain('/Size 9')
    expect(text.match(/00000 n /g) ?? []).toHaveLength(8)
  })

  it('aponta startxref para o offset real da tabela', async () => {
    const bytes = await bytesOf(buildPdf([pdfPage(16)]))
    const text = decoder.decode(bytes)
    const offset = Number(text.match(/startxref\n(\d+)/)?.[1])
    expect(decoder.decode(bytes.slice(offset, offset + 4))).toBe('xref')
  })
})
