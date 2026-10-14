# Flipbook Grabber

Flipbook Grabber is a Chrome extension (Manifest V3) that saves AnyFlip publications as PDF or EPUB. It reads the publication's page list from the player, downloads every page image at its original size and builds the file in the browser. This repository holds the extension source, written in TypeScript with a React side panel.

## How it works

The page at `anyflip.com` is a showcase; the actual reader runs in a cross-origin iframe, page files are named by hash, and the page index is encoded and only decoded at runtime by the player. The extension therefore runs a reader inside the player's frame (`chrome.scripting`) and takes the decoded index and the image base path from there. One read returns the whole book.

Downloads run in the background through an offscreen document, with up to 4 concurrent requests and up to 3 retries with exponential backoff per image. The side panel shows progress per page and lets you cancel. Opening another publication while a download runs adds it to a queue; jobs run one at a time and each can be cancelled on its own.

The PDF is written by a small in-house generator that embeds each page as a JPEG, one page per sheet at the image's size. The EPUB is an EPUB 3 package with the original images, zipped with `fflate`.

| Path | What it is |
| --- | --- |
| [`src/adapters`](src/adapters) | Page discovery. `anyflip.ts` implements the `FlipbookAdapter` interface from `types.ts`. |
| [`src/background`](src/background) | Service worker with the job state, the job queue and the downloader with concurrency and retries. |
| [`src/offscreen`](src/offscreen) | Offscreen worker that downloads, converts and hands over the file. |
| [`src/builders`](src/builders) | Image conversion, PDF generator and EPUB 3 packager. |
| [`src/sidepanel`](src/sidepanel) | Side panel UI (React 19, Tailwind CSS 4). |

Supporting another flipbook site means implementing `FlipbookAdapter` and adding it to the `adapters` list in `src/adapters/anyflip.ts`.

## Requirements

- Node.js and npm (Vite 6, TypeScript 5.7)
- Chrome or Edge

## Build and install

The extension is not on the Chrome Web Store. Build it locally:

```bash
npm install
npm run build
```

`npm run dev` rebuilds on every change. To load the build in the browser, open `chrome://extensions`, turn on Developer mode and choose "Load unpacked" with the `dist` folder.

## Usage

Open a publication on AnyFlip, wait for it to load and click the extension icon. The side panel opens and finds the pages. Choose PDF or EPUB and start the download; the file lands in the browser's downloads when it finishes.

## Tests

```bash
npm test
npm run typecheck
```

The Vitest suite in [`test`](test) covers the AnyFlip URL building, the downloader under failures and cancellation, the job queue and the structure of the PDF and EPUB output.

## Responsible use

The tool cannot tell what you are allowed to keep from what you are not; that part is on you. Use it to archive your own material, public documents, catalogs and publications you have permission to save, and respect the rights of whoever published them.

## License

Released into the public domain under the [Unlicense](LICENSE).
