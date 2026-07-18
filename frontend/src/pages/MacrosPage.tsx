import { useCallback, useEffect, useState } from 'react';
import MacroEditModal from '../components/MacroEditModal';
import { useTopCenterToast } from '../components/TopCenterToast';
import { api, type MacroDto } from '../lib/api';

export default function MacrosPage() {
  const [macros, setMacros] = useState<MacroDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showConnection, setShowConnection] = useState(false);
  const [connectedClients, setConnectedClients] = useState<number | null>(null);
  const [wsPath, setWsPath] = useState('/ws/advss');
  const [statusError, setStatusError] = useState<string | null>(null);
  const { showToast, toastPortal } = useTopCenterToast();

  const [modal, setModal] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; macro: MacroDto }
    | null
  >(null);

  const loadMacros = useCallback(async () => {
    try {
      const res = await api.getMacros();
      setMacros(res.macros);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }, [showToast]);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await api.getAdvssStatus();
      setConnectedClients(status.connected_clients);
      setWsPath(status.path);
      setStatusError(null);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadMacros().finally(() => setLoading(false));
  }, [loadMacros]);

  useEffect(() => {
    if (!showConnection) return;
    void refreshStatus();
    const id = window.setInterval(() => {
      void refreshStatus();
    }, 3000);
    return () => window.clearInterval(id);
  }, [refreshStatus, showConnection]);

  const send = async (macro: MacroDto) => {
    if (busyId != null) return;
    setBusyId(macro.id);
    try {
      const res = await api.sendAdvssMessage(macro.event_message);
      if (showConnection) {
        setConnectedClients(res.connected_clients);
      }
      if (res.sent === 0) {
        showToast(
          'Nenhum cliente AdvSS conectado. Confira ws://127.0.0.1:3847/ws/advss (OBS protocol = No).',
          'error',
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const connected = (connectedClients ?? 0) > 0;

  return (
    <div className="w-full space-y-4">
      {toastPortal}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Macros OBS</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowConnection((open) => !open)}
            aria-expanded={showConnection}
            className="rounded-md border border-surface px-3 py-2 text-sm text-text-muted hover:border-accent hover:text-text"
          >
            {showConnection ? 'Ocultar conexão' : 'Conexão AdvSS'}
          </button>
          <button
            type="button"
            onClick={() => setModal({ mode: 'create' })}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
          >
            Nova macro
          </button>
        </div>
      </div>

      {showConnection ? (
        <div
          className={
            'rounded-lg border px-4 py-3 text-sm ' +
            (connected
              ? 'border-emerald-500/40 bg-emerald-500/10 text-text'
              : 'border-surface bg-surface-soft text-text-muted')
          }
        >
          {statusError ? (
            <p className="text-red-400">Status: {statusError}</p>
          ) : (
            <p>
              AdvSS:{' '}
              <span className="font-medium text-text">
                {connectedClients == null
                  ? '…'
                  : connected
                    ? `${connectedClients} conectado(s)`
                    : 'desconectado'}
              </span>
              <span className="mt-1 block font-mono text-xs text-text-muted">
                ws://127.0.0.1:3847{wsPath}
              </span>
              <span className="mt-1 block text-xs text-text-muted">
                OBS protocol = No · trigger Websocket com o event de cada macro
              </span>
            </p>
          )}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-text-muted">Carregando…</p> : null}

      {!loading && macros.length === 0 ? (
        <p className="text-sm text-text-muted">
          Nenhuma macro ainda. Crie uma com “Nova macro”.
        </p>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
        {macros.map((macro) => {
          const initial = macro.name.trim().charAt(0).toUpperCase() || '?';
          const thumb = macro.thumbnail_cropped_url;
          const busy = busyId != null;
          return (
            <li key={macro.id} className="group relative">
              <button
                type="button"
                aria-label={`Editar ${macro.name}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setModal({ mode: 'edit', macro });
                }}
                className="absolute right-1 top-1 z-10 rounded-md border border-surface/80 bg-bg/90 p-1.5 text-xs opacity-0 shadow-md transition-opacity hover:border-accent group-hover:opacity-100 focus:opacity-100"
              >
                <span aria-hidden="true">✎</span>
              </button>
              {/* Avoid <img> inside <button>: iOS Safari often fails to paint it. */}
              <div
                role="button"
                tabIndex={busy ? -1 : 0}
                aria-label={`Disparar ${macro.name}`}
                aria-disabled={busy}
                onClick={() => {
                  if (!busy) void send(macro);
                }}
                onKeyDown={(e) => {
                  if (busy) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void send(macro);
                  }
                }}
                className={
                  'flex w-full cursor-pointer flex-col overflow-hidden rounded-md border border-surface/70 bg-bg-soft text-left transition-colors hover:border-accent ' +
                  (busy ? 'pointer-events-none opacity-60' : '')
                }
              >
                <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-surface-soft">
                  {thumb ? (
                    <>
                      <img
                        src={thumb}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        draggable={false}
                        decoding="async"
                      />
                      <div className="absolute inset-0 bg-black/25" aria-hidden="true" />
                    </>
                  ) : (
                    <span
                      className="select-none text-3xl font-semibold text-text-muted/50 transition-colors group-hover:text-accent/60 sm:text-4xl"
                      aria-hidden="true"
                    >
                      {initial}
                    </span>
                  )}
                </div>
                <div className="px-2.5 py-2">
                  <p className="line-clamp-2 text-sm font-medium leading-snug sm:text-base">
                    {macro.name}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-text-muted">
                    {macro.event_message}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {modal?.mode === 'create' ? (
        <MacroEditModal
          mode="create"
          onClose={() => setModal(null)}
          onSaved={(saved) => {
            setMacros((prev) => [...prev, saved]);
          }}
        />
      ) : null}

      {modal?.mode === 'edit' ? (
        <MacroEditModal
          mode="edit"
          macroId={modal.macro.id}
          initial={modal.macro}
          onClose={() => setModal(null)}
          onSaved={(saved) => {
            setMacros((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
          }}
          onDeleted={(id) => {
            setMacros((prev) => prev.filter((m) => m.id !== id));
          }}
        />
      ) : null}
    </div>
  );
}
