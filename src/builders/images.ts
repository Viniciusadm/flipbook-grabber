import type { EpubPageImage } from './epub'
import type { PdfPageImage } from './pdf'

const JPEG_QUALITY = 0.92

export async function toJpegPage(blob: Blob): Promise<PdfPageImage> {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível preparar o canvas de conversão.')
  context.drawImage(bitmap, 0, 0)
  bitmap.close()

  const jpegBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  )
  if (!jpegBlob) throw new Error('Falha ao converter a página para JPEG.')

  return {
    jpeg: new Uint8Array(await jpegBlob.arrayBuffer()),
    width: canvas.width,
    height: canvas.height,
  }
}

export async function toEpubPage(blob: Blob): Promise<EpubPageImage> {
  const bitmap = await createImageBitmap(blob)
  const width = bitmap.width
  const height = bitmap.height
  bitmap.close()

  const mimeType = blob.type || 'image/webp'
  const extension = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'webp'
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    mimeType,
    extension,
    width,
    height,
  }
}
