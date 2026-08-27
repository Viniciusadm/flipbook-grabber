import { useEffect, useState } from 'react'
import { activeJob, isDuplicate } from '@/background/queue'
import type { AnyMessage } from '@/shared/messages'
import { initialAppState, type AppState, type Job, type OutputFormat, type Publication } from '@/shared/types'

const FORMATS: { id: OutputFormat; label: string; hint: string }[] = [
  { id: 'pdf', label: 'PDF', hint: 'Uma página por folha. Abre em qualquer lugar.' },
  { id: 'epub', label: 'EPUB', hint: 'Para leitores de e-book. Imagens, sem texto selecionável.' },
]

function send(message: AnyMessage): void {
  chrome.runtime.sendMessage(message).catch(() => undefined)
}

function Header({ publication, subtitle }: { publication: Publication | null; subtitle: string }) {
  const cover = publication?.thumbUrls.find(Boolean)
  return (
    <header className="flex items-start gap-3 px-4 pt-4 pb-3">
      <div className="h-20 w-15 shrink-0 overflow-hidden rounded-lg border border-border-subtle bg-accent-soft">
        {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold" title={publication?.title}>
          {publication?.title ?? 'Flipbook Grabber'}
        </h1>
        <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>
      </div>
    </header>
  )
}

function FormatPicker({
  value,
  onChange,
}: {
  value: OutputFormat
  onChange: (format: OutputFormat) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {FORMATS.map((format) => {
        const selected = value === format.id
        return (
          <button
            key={format.id}
            type="button"
            onClick={() => onChange(format.id)}
            aria-pressed={selected}
            className={`rounded-xl border p-3 text-left transition ${
              selected
                ? 'border-accent bg-accent-soft'
                : 'border-border-subtle bg-surface-raised hover:border-accent'
            }`}
          >
            <span className="block text-sm font-semibold">{format.label}</span>
            <span className="mt-1 block text-xs leading-snug text-ink-muted">{format.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

function PageGrid({ publication }: { publication: Publication | null }) {
  const thumbs = publication?.thumbUrls ?? []
  if (thumbs.length === 0) return null

  return (
    <div className="grid grid-cols-6 gap-1">
      {thumbs.map((thumb, index) => (
        <div
          key={index}
          className="aspect-3/4 overflow-hidden rounded border border-border-subtle"
        >
          {thumb ? <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
        </div>
      ))}
    </div>
  )
}

function Meter({ job }: { job: Job }) {
  const percent = job.total > 0 ? Math.round((job.downloaded / job.total) * 100) : 0
  const building = job.phase === 'building'
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">
          {building ? 'Montando o arquivo…' : `Página ${job.downloaded} de ${job.total}`}
        </span>
        <span className="tabular-nums text-ink-muted">{building ? '' : `${percent}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border-subtle">
        <div
          className={`h-full rounded-full bg-accent transition-[width] duration-300 ${
            building ? 'animate-pulse' : ''
          }`}
          style={{ width: `${building ? 100 : percent}%` }}
        />
      </div>
    </div>
  )
}

function JobCard({ job }: { job: Job }) {
  const busy = job.phase === 'downloading' || job.phase === 'building'
  return (
    <li className="space-y-2 rounded-xl border border-border-subtle bg-surface-raised p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium" title={job.publication.title}>
          {job.publication.title}
        </span>
        <span className="shrink-0 text-[11px] uppercase text-ink-muted">{job.format}</span>
      </div>

      {job.phase === 'queued' ? <p className="text-xs text-ink-muted">Na fila</p> : null}
      {busy ? <Meter job={job} /> : null}
      {job.phase === 'done' ? (
        <p className="truncate text-xs text-ink-muted" title={job.fileName ?? ''}>
          Pronto: {job.fileName}
        </p>
      ) : null}
      {job.phase === 'error' ? <p className="text-xs leading-relaxed text-danger">{job.error}</p> : null}

      {job.phase === 'queued' || busy ? (
        <button
          type="button"
          onClick={() => send({ type: 'panel/cancel', jobId: job.id })}
          className="w-full rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-ink-muted transition hover:border-danger hover:text-danger"
        >
          {job.phase === 'queued' ? 'Remover da fila' : 'Cancelar'}
        </button>
      ) : null}

      {job.phase === 'done' ? (
        <button
          type="button"
          onClick={() => chrome.downloads.showDefaultFolder()}
          className="w-full rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium transition hover:border-accent"
        >
          Abrir downloads
        </button>
      ) : null}
    </li>
  )
}

function detectionSubtitle(state: AppState): string {
  const { detection } = state
  switch (detection.phase) {
    case 'discovering':
      return 'Procurando as páginas da publicação…'
    case 'ready':
      return `${detection.publication?.pageUrls.length ?? 0} páginas encontradas`
    default:
      return 'Abra uma publicação do AnyFlip'
  }
}

export function App() {
  const [state, setState] = useState<AppState>(initialAppState)
  const [format, setFormat] = useState<OutputFormat>('pdf')

  useEffect(() => {
    const listener = (message: AnyMessage) => {
      if (message.type === 'bg/state') setState(message.state)
    }
    chrome.runtime.onMessage.addListener(listener)
    chrome.runtime
      .sendMessage({ type: 'panel/getState' })
      .then((response: AnyMessage | undefined) => {
        if (response?.type === 'bg/state') setState(response.state)
        send({ type: 'panel/inspect' })
      })
      .catch(() => send({ type: 'panel/inspect' }))
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  const publication = state.detection.publication
  const ready = state.detection.phase === 'ready' && Boolean(publication)
  const queued = publication ? isDuplicate(state.jobs, publication, format) : false
  const running = Boolean(activeJob(state.jobs))
  const jobs = [...state.jobs].reverse()

  return (
    <div className="flex h-full flex-col">
      <Header publication={publication} subtitle={detectionSubtitle(state)} />

      <main className="flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        {state.detection.error ? (
          <div className="rounded-xl border border-border-subtle bg-surface-raised p-3">
            <p className="text-xs leading-relaxed text-ink-muted">{state.detection.error}</p>
          </div>
        ) : null}

        {ready ? <FormatPicker value={format} onChange={setFormat} /> : null}
        {ready ? <PageGrid publication={publication} /> : null}

        {jobs.length > 0 ? (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Downloads</h2>
            <ul className="space-y-2">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <div className="space-y-2 border-t border-border-subtle bg-surface-raised px-4 pt-3 pb-4">
        {ready ? (
          <button
            type="button"
            disabled={queued}
            onClick={() => send({ type: 'panel/start', format })}
            className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {queued ? 'Já está na fila' : running ? 'Adicionar à fila' : 'Baixar publicação'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => send({ type: 'panel/inspect' })}
            className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90"
          >
            Verificar esta página
          </button>
        )}

        <p className="pt-1 text-[11px] leading-snug text-ink-muted">
          Baixe apenas publicações que você tem direito de salvar.
        </p>
      </div>
    </div>
  )
}
