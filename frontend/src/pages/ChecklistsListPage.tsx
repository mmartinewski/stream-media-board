import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTopCenterToast } from '../components/TopCenterToast';
import { api } from '../lib/api';
import type { TodoListSummaryDto } from '../lib/todoOverlay';

export default function ChecklistsListPage() {
  const navigate = useNavigate();
  const [lists, setLists] = useState<TodoListSummaryDto[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const overlayActionRef = useRef(false);
  const { showToast, toastPortal } = useTopCenterToast();

  const showError = useCallback(
    (err: unknown) => {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    },
    [showToast],
  );

  const reload = useCallback(async () => {
    const res = await api.getTodoLists();
    setLists(res.lists);
    setActiveId(res.active_todo_list_id);
  }, []);

  useEffect(() => {
    void reload().catch(showError);
  }, [reload, showError]);

  const handleShow = async (id: number) => {
    if (overlayActionRef.current) return;
    overlayActionRef.current = true;
    try {
      await api.showTodoList(id);
      setActiveId(id);
    } catch (err: unknown) {
      showError(err);
    } finally {
      overlayActionRef.current = false;
    }
  };

  const handleHide = async () => {
    if (overlayActionRef.current) return;
    overlayActionRef.current = true;
    try {
      await api.hideTodoList();
      setActiveId(null);
    } catch (err: unknown) {
      showError(err);
    } finally {
      overlayActionRef.current = false;
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Delete checklist "${name}"?`)) return;
    setDeletingId(id);
    try {
      await api.deleteTodoList(id);
      if (activeId === id) setActiveId(null);
      setLists((prev) => prev.filter((list) => list.id !== id));
    } catch (err: unknown) {
      showError(err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreate = async () => {
    try {
      const created = await api.createTodoList({
        name: 'New checklist',
        title: 'New checklist',
      });
      navigate(`/checklists/${created.id}`);
    } catch (err: unknown) {
      showError(err);
    }
  };

  const filteredLists = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return lists;
    return lists.filter((list) => list.name.toLowerCase().includes(query));
  }, [lists, search]);

  return (
    <>
      {toastPortal}
      <div className="w-full max-w-3xl pb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Checklists</h1>
        <button
          type="button"
          onClick={() => void handleCreate()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg"
        >
          New checklist
        </button>
      </div>

      {lists.length > 0 ? (
        <div className="relative mb-4">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search checklists"
            aria-label="Search checklists"
            className="w-full rounded-md border border-surface bg-bg-soft py-2 pl-9 pr-3 text-sm outline-none focus:border-accent"
          />
        </div>
      ) : null}

      {lists.length === 0 ? (
        <p className="text-sm text-text-muted">No checklists yet. Create one to show on the overlay.</p>
      ) : filteredLists.length === 0 ? (
        <p className="text-sm text-text-muted">{`No checklists match "${search.trim()}".`}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filteredLists.map((list) => {
            const onAir = activeId === list.id;
            return (
              <li
                key={list.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface bg-surface-soft/40 px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/checklists/${list.id}`}
                    className="font-medium text-text hover:text-accent"
                  >
                    {list.name}
                  </Link>
                  {onAir ? (
                    <span className="ml-2 text-xs font-medium uppercase tracking-wide text-accent">
                      on air
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleShow(list.id)}
                    className="rounded-md border border-surface px-3 py-1.5 text-sm hover:border-accent"
                  >
                    Show
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleHide()}
                    className="rounded-md border border-surface px-3 py-1.5 text-sm hover:border-accent"
                  >
                    Hide
                  </button>
                  <Link
                    to={`/checklists/${list.id}`}
                    className="rounded-md border border-surface px-3 py-1.5 text-sm hover:border-accent"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    disabled={deletingId === list.id}
                    onClick={() => void handleDelete(list.id, list.name)}
                    className="rounded-md border border-red-500/40 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </>
  );
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
