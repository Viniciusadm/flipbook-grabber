import { adapterFor } from '@/adapters/anyflip'
import type { RawPublication } from '@/adapters/types'
import type { AnyMessage } from '@/shared/messages'
import { initialAppState, type AppState, type Detection, type OutputFormat } from '@/shared/types'
import { activeJob, createJob, isDuplicate, nextQueued, patchJob, removeJob } from './queue'

const OFFSCREEN_PATH = 'offscreen.html'
const INSPECT_DEBOUNCE_MS = 300
const STATE_KEY = 'appState'

let state: AppState = { ...initialAppState, jobs: [] }
let lastInspectedUrl: string | null = null
let inspectTimer: ReturnType<typeof setTimeout> | null = null

const restored = chrome.storage.session
  .get(STATE_KEY)
  .then((stored) => {
    const saved = stored[STATE_KEY] as AppState | undefined
    if (saved) state = saved
  })
  .catch(() => undefined)

function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch }
  chrome.storage.session.set({ [STATE_KEY]: state }).catch(() => undefined)
  chrome.runtime.sendMessage({ type: 'bg/state', state }).catch(() => undefined)
}

function setDetection(detection: Detection): void {
  setState({ detection })
}

async function hasOffscreen(): Promise<boolean> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  })
  return existing.length > 0
}

async function ensureOffscreen(): Promise<void> {
  if (await hasOffscreen()) return
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
  const active = activeJob(state.jobs)
  if (active && !(await hasOffscreen())) {
    setState({ jobs: patchJob(state.jobs, active.id, { phase: 'queued', downloaded: 0 }) })
  }

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

function handle(message: AnyMessage): void {
  switch (message.type) {
    case 'panel/inspect':
      void inspectIfChanged(true)
      return
    case 'panel/start':
      enqueue(message.format)
      return
    case 'panel/cancel':
      cancel(message.jobId)
      return
    case 'worker/progress':
      setState({
        jobs: patchJob(state.jobs, message.jobId, {
          phase: 'downloading',
          downloaded: message.downloaded,
          total: message.total,
        }),
      })
      return
    case 'worker/building':
      setState({ jobs: patchJob(state.jobs, message.jobId, { phase: 'building' }) })
      return
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
      return
    case 'worker/done':
      setState({ jobs: patchJob(state.jobs, message.jobId, { phase: 'done', fileName: message.fileName }) })
      void pump()
      return
    case 'worker/error':
      setState({ jobs: patchJob(state.jobs, message.jobId, { phase: 'error', error: message.message }) })
      void pump()
      return
    default:
      return
  }
}

chrome.runtime.onMessage.addListener((message: AnyMessage, _sender, sendResponse) => {
  if (message.type === 'panel/getState') {
    restored.then(() => sendResponse({ type: 'bg/state', state }))
    return true
  }
  restored.then(() => handle(message))
  return false
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

