export interface PdfPageImage {
  jpeg: Uint8Array
  width: number
  height: number
}

const encoder = new TextEncoder()

class PdfWriter {
  private chunks: Uint8Array[] = []
  private length = 0
  private offsets: number[] = []

  push(data: string | Uint8Array): void {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data
    this.chunks.push(bytes)
    this.length += bytes.length
  }

  startObject(id: number, body: string): void {
    this.offsets[id] = this.length
    this.push(`${id} 0 obj\n${body}\n`)
  }

  endObject(): void {
    this.push('endobj\n')
  }

  get size(): number {
    return this.length
  }

  finish(rootId: number, objectCount: number): Blob {
    const xrefOffset = this.length
    let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`
    for (let id = 1; id <= objectCount; id += 1) {
      xref += `${String(this.offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`
    }
    this.push(xref)
    this.push(`trailer\n<< /Size ${objectCount + 1} /Root ${rootId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)
    return new Blob(this.chunks as BlobPart[], { type: 'application/pdf' })
  }
}

export function buildPdf(pages: PdfPageImage[]): Blob {
  if (pages.length === 0) throw new Error('Nenhuma página para gerar o PDF.')

  const writer = new PdfWriter()
  const pageIds = pages.map((_, index) => 3 + index * 3)
  const objectCount = 2 + pages.length * 3

  writer.push('%PDF-1.7\n')
  writer.push(new Uint8Array([0x25, 0xff, 0xff, 0xff, 0xff, 0x0a]))

  writer.startObject(1, '<< /Type /Catalog /Pages 2 0 R >>')
  writer.endObject()

  writer.startObject(
    2,
    `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`,
  )
  writer.endObject()

  pages.forEach((page, index) => {
    const pageId = pageIds[index]
    const contentsId = pageId + 1
    const imageId = pageId + 2
    const { width, height } = page

    writer.startObject(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentsId} 0 R >>`,
    )
    writer.endObject()

    const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`
    writer.startObject(contentsId, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    writer.endObject()

    writer.startObject(
      imageId,
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream`,
    )
    writer.push(page.jpeg)
    writer.push('\nendstream\n')
    writer.endObject()
  })

  return writer.finish(1, objectCount)
}
