import { useEffect, useState } from 'react'
import type { AnyMessage } from '@/shared/messages'
import { initialJobState, type JobState, type OutputFormat } from '@/shared/types'

const FORMATS: { id: OutputFormat; label: string; hint: string }[] = [
  { id: 'pdf', label: 'PDF', hint: 'Uma página por folha. Abre em qualquer lugar.' },
  { id: 'epub', label: 'EPUB', hint: 'Para leitores de e-book. Imagens, sem texto selecionável.' },
]

function send(message: AnyMessage): void {
  chrome.runtime.sendMessage(message).catch(() => undefined)
}

function Header({ state }: { state: JobState }) {
  const cover = state.publication?.thumbUrls.find(Boolean)
  return (
    <header className="flex items-start gap-3 px-4 pt-4 pb-3">
      <div className="h-20 w-15 shrink-0 overflow-hidden rounded-lg border border-border-subtle bg-accent-soft">
        {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold" title={state.publication?.title}>
          {state.publication?.title ?? 'Flipbook Grabber'}
        </h1>
        <p className="mt-0.5 text-xs text-ink-muted">
          {state.total > 0 ? `${state.total} páginas encontradas` : 'Abra uma publicação do AnyFlip'}
        </p>
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

function PageGrid({ state, busy }: { state: JobState; busy: boolean }) {
  const thumbs = state.publication?.thumbUrls ?? []
  if (thumbs.length === 0) return null

  return (
    <div className="grid grid-cols-6 gap-1">
      {thumbs.map((thumb, index) => {
        const pending = busy && index >= state.downloaded
        return (
          <div
            key={index}
            className={`aspect-3/4 overflow-hidden rounded border border-border-subtle transition-opacity duration-300 ${
              pending ? 'opacity-25' : 'opacity-100'
            }`}
          >
            {thumb ? <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
          </div>
        )
      })}
    </div>
  )
}

function Meter({ state }: { state: JobState }) {
  const percent = state.total > 0 ? Math.round((state.downloaded / state.total) * 100) : 0
  const building = state.phase === 'building'
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">
          {building ? 'Montando o arquivo…' : `Página ${state.downloaded} de ${state.total}`}
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

export function App() {
  const [state, setState] = useState<JobState>(initialJobState)
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

  const busy = state.phase === 'downloading' || state.phase === 'building'
  const ready = Boolean(state.publication) && state.total > 0
  const done = state.phase === 'done'

  return (
    <div className="flex h-full flex-col">
      <Header state={state} />

      <main className="flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        {state.phase === 'discovering' ? (
          <p className="text-xs text-ink-muted">Procurando as páginas da publicação…</p>
        ) : null}

        {state.phase === 'error' ? (
          <div className="rounded-xl border border-border-subtle bg-surface-raised p-3">
            <p className="text-xs leading-relaxed text-danger">{state.error}</p>
          </div>
        ) : null}

        {done ? (
          <div className="rounded-xl border border-accent bg-accent-soft p-3">
            <p className="text-sm font-medium">Pronto.</p>
            <p className="mt-1 truncate text-xs text-ink-muted" title={state.fileName ?? ''}>
              {state.fileName}
            </p>
          </div>
        ) : null}

        {ready && !busy && !done ? <FormatPicker value={format} onChange={setFormat} /> : null}

        <PageGrid state={state} busy={busy} />
      </main>

      <div className="space-y-2 border-t border-border-subtle bg-surface-raised px-4 pt-3 pb-4">
        {busy ? <Meter state={state} /> : null}

        {busy ? (
          <button
            type="button"
            onClick={() => send({ type: 'panel/cancel' })}
            className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm text-ink-muted transition hover:border-danger hover:text-danger"
          >
            Cancelar
          </button>
        ) : null}

        {ready && !busy && !done ? (
          <button
            type="button"
            onClick={() => send({ type: 'panel/start', format })}
            className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90"
          >
            Baixar publicação
          </button>
        ) : null}

        {done ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => chrome.downloads.showDefaultFolder()}
              className="rounded-lg border border-border-subtle px-3 py-2 text-sm font-medium transition hover:border-accent"
            >
              Abrir downloads
            </button>
            <button
              type="button"
              onClick={() => send({ type: 'panel/inspect' })}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink transition hover:opacity-90"
            >
              Baixar de novo
            </button>
          </div>
        ) : null}

        {state.phase === 'error' ? (
          <button
            type="button"
            onClick={() => send({ type: 'panel/inspect' })}
            className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:opacity-90"
          >
            Tentar de novo
          </button>
        ) : null}

        <p className="pt-1 text-[11px] leading-snug text-ink-muted">
          Baixe apenas publicações que você tem direito de salvar.
        </p>
      </div>
    </div>
  )
}
