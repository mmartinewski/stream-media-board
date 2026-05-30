import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type LayoutAreaDto, type LayoutSettingsResponse } from '../lib/api';
import { getBrowserOverlayUrl } from '../lib/overlay';

const EMPTY_FORM: Omit<LayoutAreaDto, 'id' | 'created_at'> = {
  name: '',
  sort_order: 0,
  anchor_vertical: 'top',
  anchor_horizontal: 'right',
  margin_top: 5,
  margin_right: 5,
  margin_bottom: 0,
  margin_left: 0,
  max_width_percent: 35,
  max_height_percent: 45,
  is_fullscreen: 0,
};

export default function LayoutAreasPage() {
  const [areas, setAreas] = useState<LayoutAreaDto[]>([]);
  const [settings, setSettings] = useState<LayoutSettingsResponse | null>(null);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const [areasRes, settingsRes] = await Promise.all([
      api.getLayoutAreas(),
      api.getLayoutSettings(),
    ]);
    setAreas(areasRes.areas);
    setSettings(settingsRes);
  }, []);

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [reload]);

  const startNew = () => {
    setEditingId('new');
    setForm({ ...EMPTY_FORM, name: 'New area' });
    setError(null);
  };

  const startEdit = (area: LayoutAreaDto) => {
    setEditingId(area.id);
    setForm({
      name: area.name,
      sort_order: area.sort_order,
      anchor_vertical: area.anchor_vertical,
      anchor_horizontal: area.anchor_horizontal,
      margin_top: area.margin_top,
      margin_right: area.margin_right,
      margin_bottom: area.margin_bottom,
      margin_left: area.margin_left,
      max_width_percent: area.max_width_percent,
      max_height_percent: area.max_height_percent,
      is_fullscreen: area.is_fullscreen,
    });
    setError(null);
  };

  const saveArea = async () => {
    setSaving(true);
    setError(null);
    try {
      if (editingId === 'new') {
        await api.createLayoutArea(form);
      } else if (typeof editingId === 'number') {
        await api.updateLayoutArea(editingId, form);
      }
      setEditingId(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const removeArea = async (id: number) => {
    if (!window.confirm('Delete this layout area?')) return;
    setError(null);
    try {
      await api.deleteLayoutArea(id);
      if (editingId === id) setEditingId(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateLayoutSettings({
        layout_area_id_landscape: settings.layout_area_id_landscape,
        layout_area_id_portrait: settings.layout_area_id_portrait,
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const stageUrl = getBrowserOverlayUrl('stage');

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Layout areas</h1>
        <p className="mt-1 text-sm text-text-muted">
          Configure where video clips appear on the OBS stage overlay. Use{' '}
          <code className="rounded bg-surface px-1">?mode=stage</code> in OBS.
        </p>
        <p className="mt-2 break-all text-xs text-text-muted">{stageUrl}</p>
      </div>

      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {settings ? (
        <div className="rounded-md border border-surface bg-surface-soft p-4">
          <h2 className="text-base font-semibold">Display defaults by orientation</h2>
          <p className="mt-1 text-xs text-text-muted">
            Used when playing a clip unless you pick another area on the dashboard.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">Landscape clips</span>
              <select
                className="mt-1 w-full rounded-md border border-surface bg-bg px-2 py-2 text-sm"
                value={settings.layout_area_id_landscape ?? ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    layout_area_id_landscape: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              >
                <option value="">—</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Portrait clips</span>
              <select
                className="mt-1 w-full rounded-md border border-surface bg-bg px-2 py-2 text-sm"
                value={settings.layout_area_id_portrait ?? ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    layout_area_id_portrait: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              >
                <option value="">—</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveSettings()}
            className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
          >
            Save display defaults
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={startNew}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg"
        >
          New area
        </button>
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-md border border-surface px-4 py-2 text-sm"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() =>
            void api
              .restoreLayoutAreaDefaults()
              .then(() => reload())
              .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : String(err));
              })
          }
          className="rounded-md border border-surface px-4 py-2 text-sm"
        >
          Restore defaults
        </button>
        <Link to="/" className="rounded-md border border-surface px-4 py-2 text-sm">
          Back to dashboard
        </Link>
      </div>

      <ul className="space-y-2">
        {areas.map((area) => (
          <li
            key={area.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-surface bg-bg-soft px-3 py-2 text-sm"
          >
            <span>
              <span className="font-medium">{area.name}</span>
              <span className="ml-2 text-xs text-text-muted">
                {area.anchor_vertical}-{area.anchor_horizontal} · max {area.max_width_percent}×
                {area.max_height_percent}%
                {area.is_fullscreen ? ' · fullscreen' : ''}
              </span>
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => startEdit(area)}
                className="text-accent hover:underline"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void removeArea(area.id)}
                className="text-red-200 hover:underline"
              >
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>

      {editingId !== null ? (
        <form
          className="rounded-md border border-surface bg-surface-soft p-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void saveArea();
          }}
        >
          <h2 className="text-base font-semibold">
            {editingId === 'new' ? 'New area' : 'Edit area'}
          </h2>
          <label className="block text-sm">
            Name
            <input
              className="mt-1 w-full rounded-md border border-surface bg-bg px-2 py-2"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Anchor vertical
              <select
                className="mt-1 w-full rounded-md border border-surface bg-bg px-2 py-2"
                value={form.anchor_vertical}
                onChange={(e) =>
                  setForm({
                    ...form,
                    anchor_vertical: e.target.value as LayoutAreaDto['anchor_vertical'],
                  })
                }
              >
                <option value="top">top</option>
                <option value="middle">middle</option>
                <option value="bottom">bottom</option>
              </select>
            </label>
            <label className="block text-sm">
              Anchor horizontal
              <select
                className="mt-1 w-full rounded-md border border-surface bg-bg px-2 py-2"
                value={form.anchor_horizontal}
                onChange={(e) =>
                  setForm({
                    ...form,
                    anchor_horizontal: e.target.value as LayoutAreaDto['anchor_horizontal'],
                  })
                }
              >
                <option value="left">left</option>
                <option value="center">center</option>
                <option value="right">right</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(['margin_top', 'margin_right', 'margin_bottom', 'margin_left'] as const).map(
              (key) => (
                <label key={key} className="block text-xs">
                  {key.replace('margin_', '')} %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="mt-1 w-full rounded-md border border-surface bg-bg px-2 py-1"
                    value={form[key]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: Number(e.target.value) })
                    }
                  />
                </label>
              ),
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Max width %
              <input
                type="number"
                min={0}
                max={100}
                disabled={form.is_fullscreen === 1}
                className="mt-1 w-full rounded-md border border-surface bg-bg px-2 py-2 disabled:opacity-50"
                value={form.max_width_percent}
                onChange={(e) =>
                  setForm({ ...form, max_width_percent: Number(e.target.value) })
                }
              />
            </label>
            <label className="block text-sm">
              Max height %
              <input
                type="number"
                min={0}
                max={100}
                disabled={form.is_fullscreen === 1}
                className="mt-1 w-full rounded-md border border-surface bg-bg px-2 py-2 disabled:opacity-50"
                value={form.max_height_percent}
                onChange={(e) =>
                  setForm({ ...form, max_height_percent: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_fullscreen === 1}
              onChange={(e) =>
                setForm({
                  ...form,
                  is_fullscreen: e.target.checked ? 1 : 0,
                  max_width_percent: e.target.checked ? 100 : form.max_width_percent,
                  max_height_percent: e.target.checked ? 100 : form.max_height_percent,
                })
              }
            />
            Fullscreen area
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save area'}
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="rounded-md border border-surface px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
