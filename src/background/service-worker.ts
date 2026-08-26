import { adapterFor } from '@/adapters/anyflip'
import type { RawPublication } from '@/adapters/types'
import type { AnyMessage } from '@/shared/messages'
import { initialJobState, type JobState, type OutputFormat } from '@/shared/types'

const OFFSCREEN_PATH = 'offscreen.html'

let state: JobState = { ...initialJobState }

function setState(patch: Partial<JobState>): void {
  state = { ...state, ...patch }
  chrome.runtime.sendMessage({ type: 'bg/state', state }).catch(() => undefined)
}

async function ensureOffscreen(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  })
  if (existing.length > 0) return
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: 'Baixar as páginas e montar o arquivo PDF ou EPUB.',
  })
}

async function activeTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab ?? null
}

async function inspect(): Promise<void> {
  setState({ ...initialJobState, phase: 'discovering' })

  const tab = await activeTab()
  if (!tab?.id || !tab.url) {
    setState({ phase: 'error', error: 'Não consegui identificar a aba ativa.' })
    return
  }

  const adapter = adapterFor(tab.url)
  if (!adapter) {
    setState({
      phase: 'error',
      error: 'Esta aba não é uma publicação do AnyFlip. Abra a publicação e tente de novo.',
    })
    return
  }

  let results: chrome.scripting.InjectionResult<RawPublication | null>[]
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      world: 'MAIN',
      func: adapter.reader,
    })
  } catch (error) {
    setState({ phase: 'error', error: `Não consegui ler a página: ${String((error as Error).message)}` })
    return
  }

  const raw = results.map((result) => result.result).find((value): value is RawPublication => Boolean(value))
  if (!raw) {
    setState({
      phase: 'error',
      error: 'Não encontrei as páginas desta publicação. Espere o livro carregar por completo e tente de novo.',
    })
    return
  }

  const publication = adapter.toPublication(raw)
  setState({
    phase: 'idle',
    publication,
    total: publication.pageUrls.length,
    downloaded: 0,
    error: null,
  })
}

async function start(format: OutputFormat): Promise<void> {
  if (!state.publication) {
    setState({ phase: 'error', error: 'Nenhuma publicação carregada.' })
    return
  }
  setState({ phase: 'downloading', format, downloaded: 0, fileName: null, error: null })
  await ensureOffscreen()
  await chrome.runtime.sendMessage({ type: 'bg/run', publication: state.publication, format })
}

chrome.runtime.onMessage.addListener((message: AnyMessage, _sender, sendResponse) => {
  switch (message.type) {
    case 'panel/getState':
      sendResponse({ type: 'bg/state', state })
      return false
    case 'panel/inspect':
      inspect()
      return false
    case 'panel/start':
      start(message.format)
      return false
    case 'panel/cancel':
      setState({ phase: 'idle', downloaded: 0 })
      return false
    case 'worker/progress':
      setState({ phase: 'downloading', downloaded: message.downloaded, total: message.total })
      return false
    case 'worker/building':
      setState({ phase: 'building' })
      return false
    case 'worker/saveFile':
      chrome.downloads
        .download({ url: message.url, filename: message.fileName, saveAs: false })
        .catch((error: unknown) =>
          setState({ phase: 'error', error: `Falha ao salvar o arquivo: ${String(error)}` }),
        )
      return false
    case 'worker/done':
      setState({ phase: 'done', fileName: message.fileName })
      return false
    case 'worker/error':
      setState({ phase: 'error', error: message.message })
      return false
    default:
      return false
  }
})

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined) chrome.sidePanel.open({ windowId: tab.windowId })
})

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined)
