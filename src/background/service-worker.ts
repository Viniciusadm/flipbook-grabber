import { adapterFor } from '@/adapters/anyflip'
import type { RawPublication } from '@/adapters/types'
import type { AnyMessage } from '@/shared/messages'
import { initialAppState, type AppState, type Detection, type OutputFormat } from '@/shared/types'
import { createJob, isDuplicate, nextQueued, patchJob, removeJob } from './queue'

const OFFSCREEN_PATH = 'offscreen.html'
const INSPECT_DEBOUNCE_MS = 300

let state: AppState = { ...initialAppState, jobs: [] }
let lastInspectedUrl: string | null = null
let inspectTimer: ReturnType<typeof setTimeout> | null = null

function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch }
  chrome.runtime.sendMessage({ type: 'bg/state', state }).catch(() => undefined)
}

function setDetection(detection: Detection): void {
  setState({ detection })
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
  const tab = await activeTab()
  if (!tab?.id || !tab.url) {
    lastInspectedUrl = null
    setDetection({ phase: 'error', publication: null, error: 'Não consegui identificar a aba ativa.' })
    return
  }

  const adapter = adapterFor(tab.url)
  if (!adapter) {
    lastInspectedUrl = tab.url
    setDetection({
      phase: 'unsupported',
      publication: null,
      error: 'Abra uma publicação do AnyFlip nesta aba.',
    })
    return
  }

  lastInspectedUrl = tab.url
  setDetection({ phase: 'discovering', publication: null, error: null })

  let results: chrome.scripting.InjectionResult<RawPublication | null>[]
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      world: 'MAIN',
      func: adapter.reader,
    })
  } catch (error) {
    setDetection({
      phase: 'error',
      publication: null,
      error: `Não consegui ler a página: ${String((error as Error).message)}`,
    })
    return
  }

  const raw = results.map((result) => result.result).find((value): value is RawPublication => Boolean(value))
  if (!raw) {
    setDetection({
      phase: 'error',
      publication: null,
      error: 'Não encontrei as páginas desta publicação. Espere o livro carregar por completo e tente de novo.',
    })
    return
  }

  setDetection({ phase: 'ready', publication: adapter.toPublication(raw), error: null })
}

function scheduleInspect(force: boolean): void {
  if (inspectTimer) clearTimeout(inspectTimer)
  inspectTimer = setTimeout(() => {
    inspectTimer = null
    if (force) lastInspectedUrl = null
    void inspectIfChanged(force)
  }, INSPECT_DEBOUNCE_MS)
}

async function inspectIfChanged(force: boolean): Promise<void> {
  if (!force) {
    const tab = await activeTab()
    if (tab?.url && tab.url === lastInspectedUrl && state.detection.phase === 'ready') return
  }
  await inspect()
}

async function pump(): Promise<void> {
  const job = nextQueued(state.jobs)
  if (!job) return
  setState({ jobs: patchJob(state.jobs, job.id, { phase: 'downloading', downloaded: 0 }) })
  await ensureOffscreen()
  await chrome.runtime
    .sendMessage({ type: 'bg/run', jobId: job.id, publication: job.publication, format: job.format })
    .catch(() => undefined)
}

function enqueue(format: OutputFormat): void {
  const publication = state.detection.publication
  if (!publication) return
  if (isDuplicate(state.jobs, publication, format)) return
  const job = createJob(publication, format, crypto.randomUUID())
  setState({ jobs: [...state.jobs, job] })
  void pump()
}

function cancel(jobId: string): void {
  const job = state.jobs.find((candidate) => candidate.id === jobId)
  if (!job) return
  if (job.phase === 'downloading' || job.phase === 'building') {
    chrome.runtime.sendMessage({ type: 'panel/cancel', jobId }).catch(() => undefined)
  }
  setState({ jobs: removeJob(state.jobs, jobId) })
  void pump()
}

chrome.runtime.onMessage.addListener((message: AnyMessage, _sender, sendResponse) => {
  switch (message.type) {
    case 'panel/getState':
      sendResponse({ type: 'bg/state', state })
      return false
    case 'panel/inspect':
      void inspectIfChanged(true)
      return false
    case 'panel/start':
      enqueue(message.format)
      return false
    case 'panel/cancel':
      cancel(message.jobId)
      return false
    case 'worker/progress':
      setState({
        jobs: patchJob(state.jobs, message.jobId, {
          phase: 'downloading',
          downloaded: message.downloaded,
          total: message.total,
        }),
      })
      return false
    case 'worker/building':
      setState({ jobs: patchJob(state.jobs, message.jobId, { phase: 'building' }) })
      return false
    case 'worker/saveFile':
      chrome.downloads
        .download({ url: message.url, filename: message.fileName, saveAs: false })
        .catch((error: unknown) =>
          setState({
            jobs: patchJob(state.jobs, message.jobId, {
              phase: 'error',
              error: `Falha ao salvar o arquivo: ${String(error)}`,
            }),
          }),
        )
      return false
    case 'worker/done':
      setState({ jobs: patchJob(state.jobs, message.jobId, { phase: 'done', fileName: message.fileName }) })
      void pump()
      return false
    case 'worker/error':
      setState({ jobs: patchJob(state.jobs, message.jobId, { phase: 'error', error: message.message }) })
      void pump()
      return false
    default:
      return false
  }
})

chrome.tabs.onActivated.addListener(() => scheduleInspect(true))

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (!tab.active) return
  if (changeInfo.url) {
    scheduleInspect(true)
    return
  }
  if (changeInfo.status === 'complete') scheduleInspect(false)
})

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) scheduleInspect(true)
})

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined) chrome.sidePanel.open({ windowId: tab.windowId })
})

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined)

