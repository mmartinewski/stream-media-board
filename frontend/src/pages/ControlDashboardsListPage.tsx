import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTopCenterToast } from '../components/TopCenterToast';
import { api, type ControlDashboardSummary } from '../lib/api';

export default function ControlDashboardsListPage() {
  const navigate = useNavigate();
  const { showToast, toastPortal } = useTopCenterToast();
  const [dashboards, setDashboards] = useState<ControlDashboardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  const showError = useCallback(
    (err: unknown) => {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    },
    [showToast],
  );

  const reload = useCallback(async () => {
    const res = await api.getControlDashboards();
    setDashboards(res.dashboards);
  }, []);

  useEffect(() => {
    setLoading(true);
    void reload()
      .catch(showError)
      .finally(() => setLoading(false));
  }, [reload, showError]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const created = await api.createControlDashboard({ name: 'Novo painel' });
      navigate(`/panel/${created.id}`);
    } catch (err) {
      showError(err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (dashboards.length <= 1) {
      showToast('É preciso manter pelo menos um painel.', 'error');
      return;
    }
    if (!window.confirm(`Excluir o painel "${name}"?`)) return;
    setDeletingId(id);
    try {
      await api.deleteControlDashboard(id);
      setDashboards((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      showError(err);
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return dashboards;
    return dashboards.filter((d) => d.name.toLowerCase().includes(query));
  }, [dashboards, search]);

  return (
    <>
      {toastPortal}
      <div className="w-full max-w-3xl pb-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Painéis</h1>
            <p className="mt-1 text-sm text-text-muted">
              Crie e abra dashboards com macros, clipes, GIFs e texto.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
          >
            {creating ? 'Criando…' : 'Novo painel'}
          </button>
        </div>

        {dashboards.length > 0 ? (
          <div className="relative mb-4">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
              <SearchIcon />
            </span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar painéis"
              aria-label="Buscar painéis"
              className="w-full rounded-md border border-surface bg-bg-soft py-2 pl-9 pr-3 text-sm outline-none focus:border-accent"
            />
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-text-muted">Carregando…</p>
        ) : dashboards.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhum painel ainda. Crie o primeiro.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-text-muted">{`Nenhum painel correspondente a "${search.trim()}".`}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((dashboard) => (
              <li
                key={dashboard.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface bg-surface-soft/40 px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/panel/${dashboard.id}`}
                    className="font-medium text-text hover:text-accent"
                  >
                    {dashboard.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-text-muted">
                    Atualizado {formatUpdatedAt(dashboard.updated_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    to={`/panel/${dashboard.id}`}
                    className="rounded-md border border-surface px-3 py-1.5 text-sm hover:border-accent"
                  >
                    Abrir
                  </Link>
                  <button
                    type="button"
                    disabled={deletingId === dashboard.id || dashboards.length <= 1}
                    onClick={() => void handleDelete(dashboard.id, dashboard.name)}
                    className="rounded-md border border-red-500/40 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
