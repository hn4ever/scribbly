import type { SummaryRecord } from '@common/messages';

interface SummaryViewerProps {
  summary: SummaryRecord | null;
}

export function SummaryViewer({ summary }: SummaryViewerProps) {
  if (!summary) {
    return (
      <section className="scribbly-section">
        <p className="text-sm text-slate-400">
          Select a summary to view details, export the text, or run a rewrite.
        </p>
      </section>
    );
  }

  return (
    <section className="scribbly-section space-y-2">
      <header className="space-y-2">
        <h2 className="text-base font-semibold text-slate-100">{summary.title}</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span>{new Date(summary.createdAt).toLocaleString()}</span>
          <span className="rounded bg-slate-800 px-2 py-1 font-medium uppercase">
            {summary.source}
          </span>
          <span className="rounded bg-slate-800 px-2 py-1 font-medium">
            {summary.mode === 'cloud' ? 'Cloud (opt-in)' : 'On-device'}
          </span>
        </div>
      </header>
      <article className="space-y-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
            Selection
          </h3>
          <p className="text-sm text-slate-300">{summary.text}</p>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
            Summary
          </h3>
          <p className="whitespace-pre-wrap text-sm text-slate-100">{summary.summary}</p>
        </div>
      </article>
    </section>
  );
}
