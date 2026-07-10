import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  api,
  type StreamerBotWebhookEventDetail,
  type StreamerBotWebhookEventListItem,
} from '../lib/api';

const PAGE_SIZE = 50;

function todayLocalDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatReceivedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function StreamerBotEventsPage() {
  const [fromDate, setFromDate] = useState(todayLocalDate);
  const [toDate, setToDate] = useState(todayLocalDate);
  const [eventType, setEventType] = useState('');
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [items, setItems] = useState<StreamerBotWebhookEventListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StreamerBotWebhookEventDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadEventTypes = useCallback(async () => {
    const res = await api.getStreamerBotWebhookEventTypes();
    setEventTypes(res.eventTypes);
  }, []);

  const loadEvents = useCallback(
    async (nextOffset = 0) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getStreamerBotWebhookEvents({
          eventType: eventType || undefined,
          from: fromDate || undefined,
          to: toDate || undefined,
          limit: PAGE_SIZE,
          offset: nextOffset,
        });
        setItems(res.items);
        setTotal(res.total);
        setOffset(res.offset);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [eventType, fromDate, toDate],
  );

  useEffect(() => {
    void loadEventTypes().catch(() => {
      /* types are optional for first load */
    });
  }, [loadEventTypes]);

  useEffect(() => {
    void loadEvents(0);
  }, [loadEvents]);

  const openDetail = useCallback(async (id: number) => {
    setSelectedId(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const res = await api.getStreamerBotWebhookEvent(id);
      setDetail(res);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
  }, []);

  useEffect(() => {
    if (selectedId == null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetail();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, closeDetail]);

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + items.length, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Eventos Streamer.bot</h1>
        <p className="text-sm text-text-muted">
          Histórico dos webhooks recebidos. Filtre por data e tipo de evento.
        </p>
      </header>

      <form
        className="flex flex-col gap-3 rounded-lg border border-surface bg-bg-soft p-4 sm:flex-row sm:flex-wrap sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void loadEvents(0);
          void loadEventTypes().catch(() => undefined);
        }}
      >
        <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-text-muted">De</span>
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className="rounded-md border border-surface bg-bg px-3 py-2 text-sm"
          />
        </label>
        <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-text-muted">Até</span>
          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className="rounded-md border border-surface bg-bg px-3 py-2 text-sm"
          />
        </label>
        <label className="flex min-w-[12rem] flex-[1.4] flex-col gap-1 text-sm">
          <span className="text-text-muted">Tipo</span>
          <select
            value={eventType}
            onChange={(event) => setEventType(event.target.value)}
            className="rounded-md border border-surface bg-bg px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {eventTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Consultar
        </button>
      </form>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 text-sm text-text-muted">
        <span>
          {loading
            ? 'Carregando…'
            : total === 0
              ? 'Nenhum evento encontrado.'
              : `Mostrando ${pageStart}–${pageEnd} de ${total}`}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!canPrev || loading}
            onClick={() => void loadEvents(Math.max(0, offset - PAGE_SIZE))}
            className="rounded-md border border-surface px-3 py-1.5 disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={!canNext || loading}
            onClick={() => void loadEvents(offset + PAGE_SIZE)}
            className="rounded-md border border-surface px-3 py-1.5 disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-surface">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead className="border-b border-surface bg-bg-soft text-text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Recebido</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Alerta</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                className="cursor-pointer border-b border-surface/60 hover:bg-surface-soft/60"
                onClick={() => void openDetail(item.id)}
              >
                <td className="whitespace-nowrap px-3 py-2.5">
                  {formatReceivedAt(item.received_at)}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs">
                  {item.event_type ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-text-muted">
                  {item.alert_kind ?? '—'}
                </td>
                <td className="px-3 py-2.5">
                  {item.error ? (
                    <span className="text-red-300" title={item.error}>
                      Erro
                    </span>
                  ) : (
                    <span className="text-emerald-300">OK</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-text-muted">
                  Ajuste os filtros ou aguarde novos webhooks.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedId != null
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Fechar"
                onClick={closeDetail}
                className="fixed inset-0 z-[70] cursor-default bg-black/60"
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Detalhe do evento"
                className="fixed left-1/2 top-1/2 z-[71] flex max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-surface bg-bg shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-surface/50 px-4 py-3">
                  <h3 className="text-sm font-semibold">
                    Evento #{selectedId}
                    {detail?.event_type ? ` · ${detail.event_type}` : ''}
                  </h3>
                  <button
                    type="button"
                    onClick={closeDetail}
                    aria-label="Fechar"
                    className="rounded-md px-2 py-1 text-xl leading-none text-text-muted hover:bg-surface-soft hover:text-text"
                  >
                    ×
                  </button>
                </div>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                  {detailLoading ? (
                    <p className="text-sm text-text-muted">Carregando…</p>
                  ) : null}
                  {detailError ? (
                    <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                      {detailError}
                    </div>
                  ) : null}
                  {detail ? (
                    <>
                      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-text-muted">Recebido</dt>
                          <dd>{formatReceivedAt(detail.received_at)}</dd>
                        </div>
                        <div>
                          <dt className="text-text-muted">Tipo</dt>
                          <dd className="font-mono text-xs">{detail.event_type ?? '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-text-muted">Alerta</dt>
                          <dd>{detail.alert_kind ?? '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-text-muted">Status</dt>
                          <dd>
                            {detail.error ? (
                              <span className="text-red-300">{detail.error}</span>
                            ) : (
                              <span className="text-emerald-300">OK</span>
                            )}
                          </dd>
                        </div>
                      </dl>
                      <div>
                        <h4 className="mb-2 text-sm font-medium">Payload JSON</h4>
                        <pre className="overflow-x-auto rounded-md border border-surface bg-bg-soft p-3 text-xs leading-relaxed">
                          {formatJson(detail.payload)}
                        </pre>
                      </div>
                      {detail.alert != null ? (
                        <div>
                          <h4 className="mb-2 text-sm font-medium">Alerta gerado</h4>
                          <pre className="overflow-x-auto rounded-md border border-surface bg-bg-soft p-3 text-xs leading-relaxed">
                            {formatJson(detail.alert)}
                          </pre>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
