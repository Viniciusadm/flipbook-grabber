import { zipSync, type Zippable } from 'fflate'

export interface EpubPageImage {
  bytes: Uint8Array
  mimeType: string
  extension: string
  width: number
  height: number
}

const encoder = new TextEncoder()

function randomId(): string {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function pageDocument(title: string, imageHref: string, width: number, height: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
<title>${escapeXml(title)}</title>
<meta name="viewport" content="width=${width}, height=${height}"/>
<style>html,body{margin:0;padding:0;height:100%}svg{width:100%;height:100%}</style>
</head>
<body>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
<image width="${width}" height="${height}" xlink:href="${imageHref}"/>
</svg>
</body>
</html>`
}

export function buildEpub(title: string, pages: EpubPageImage[]): Blob {
  if (pages.length === 0) throw new Error('Nenhuma página para gerar o EPUB.')

  const bookId = `urn:uuid:${randomId()}`
  const safeTitle = escapeXml(title)
  const files: Zippable = {}

  files['mimetype'] = [encoder.encode('application/epub+zip'), { level: 0 }]

  files['META-INF/container.xml'] = encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`)

  const manifest: string[] = []
  const spine: string[] = []

  pages.forEach((page, index) => {
    const number = String(index + 1).padStart(4, '0')
    const imageName = `images/page-${number}.${page.extension}`
    const pageName = `page-${number}.xhtml`

    files[`OEBPS/${imageName}`] = page.bytes
    files[`OEBPS/${pageName}`] = encoder.encode(
      pageDocument(`${title} - ${index + 1}`, imageName, page.width, page.height),
    )

    const properties = index === 0 ? ' properties="cover-image"' : ''
    manifest.push(`<item id="img-${number}" href="${imageName}" media-type="${page.mimeType}"${properties}/>`)
    manifest.push(`<item id="pg-${number}" href="${pageName}" media-type="application/xhtml+xml"/>`)
    spine.push(`<itemref idref="pg-${number}"/>`)
  })

  const navItems = pages
    .map((_, index) => {
      const number = String(index + 1).padStart(4, '0')
      return `<li><a href="page-${number}.xhtml">Página ${index + 1}</a></li>`
    })
    .join('\n')

  files['OEBPS/nav.xhtml'] = encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${safeTitle}</title></head>
<body><nav epub:type="toc" id="toc"><h1>${safeTitle}</h1><ol>
${navItems}
</ol></nav></body>
</html>`)

  files['OEBPS/content.opf'] = encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${bookId}</dc:identifier>
<dc:title>${safeTitle}</dc:title>
<dc:language>pt-BR</dc:language>
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
<meta name="cover" content="img-0001"/>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifest.join('\n')}
</manifest>
<spine>
${spine.join('\n')}
</spine>
</package>`)

  const zipped = zipSync(files, { level: 6 })
  return new Blob([zipped as BlobPart], { type: 'application/epub+zip' })
}
