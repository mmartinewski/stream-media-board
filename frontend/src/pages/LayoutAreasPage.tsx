import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AnchorPicker from '../components/layout/AnchorPicker';
import LayoutStagePreview, {
  type LayoutPreviewSlot,
} from '../components/layout/LayoutStagePreview';
import MarginSliders from '../components/layout/MarginSliders';
import { api, type LayoutAreaDto, type LayoutSettingsResponse } from '../lib/api';
import {
  LAYOUT_PREVIEW_ASPECTS,
  toPreviewLayoutArea,
} from '../lib/layoutSlot';
import { getBrowserOverlayUrl } from '../lib/overlay';

type AreaForm = Omit<LayoutAreaDto, 'id' | 'created_at'>;

const EMPTY_FORM: AreaForm = {
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

function findArea(areas: LayoutAreaDto[], id: number | null | undefined): LayoutAreaDto | null {
  if (id == null) return null;
  return areas.find((a) => a.id === id) ?? null;
}

export default function LayoutAreasPage() {
  const [areas, setAreas] = useState<LayoutAreaDto[]>([]);
  const [settings, setSettings] = useState<LayoutSettingsResponse | null>(null);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<AreaForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reorderingId, setReorderingId] = useState<number | null>(null);

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

  const previewArea = useMemo(
    () => toPreviewLayoutArea({ ...form, id: typeof editingId === 'number' ? editingId : 0 }),
    [form, editingId],
  );

  const editPreviewSlots: LayoutPreviewSlot[] = useMemo(
    () => [
      {
        area: previewArea,
        ...LAYOUT_PREVIEW_ASPECTS.landscape,
        variant: 'edit-landscape',
        label: `16:9 · ${form.name || 'Area'}`,
      },
      {
        area: previewArea,
        ...LAYOUT_PREVIEW_ASPECTS.portrait,
        variant: 'edit-portrait',
        label: `9:16 · ${form.name || 'Area'}`,
      },
    ],
    [previewArea, form.name],
  );

  const mappingPreviewSlots: LayoutPreviewSlot[] = useMemo(() => {
    if (!settings) return [];
    const landscapeArea = findArea(areas, settings.layout_area_id_landscape);
    const portraitArea = findArea(areas, settings.layout_area_id_portrait);
    const slots: LayoutPreviewSlot[] = [];
    if (landscapeArea) {
      slots.push({
        area: landscapeArea,
        ...LAYOUT_PREVIEW_ASPECTS.landscape,
        variant: 'map-landscape',
        label: `Landscape → ${landscapeArea.name}`,
      });
    }
    if (portraitArea) {
      slots.push({
        area: portraitArea,
        ...LAYOUT_PREVIEW_ASPECTS.portrait,
        variant: 'map-portrait',
        label: `Portrait → ${portraitArea.name}`,
      });
    }
    return slots;
  }, [areas, settings]);

  const startNew = () => {
    const maxOrder = areas.reduce((m, a) => Math.max(m, a.sort_order), 0);
    setEditingId('new');
    setForm({ ...EMPTY_FORM, name: 'New area', sort_order: maxOrder + 10 });
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

  const moveArea = async (id: number, direction: 'up' | 'down') => {
    const index = areas.findIndex((a) => a.id === id);
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= areas.length) return;

    const current = areas[index];
    const other = areas[swapIndex];
    if (!current || !other) return;

    const toPayload = (area: LayoutAreaDto, sort_order: number) => ({
      name: area.name,
      sort_order,
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

    setReorderingId(id);
    setError(null);
    try {
      await Promise.all([
        api.updateLayoutArea(current.id, toPayload(current, other.sort_order)),
        api.updateLayoutArea(other.id, toPayload(other, current.sort_order)),
      ]);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReorderingId(null);
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
  const formDisabled = form.is_fullscreen === 1;

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Layout areas</h1>
        <p className="mt-1 text-sm text-text-muted">
          Position video clips on the OBS stage overlay. Use a single browser source with{' '}
          <code className="rounded bg-surface px-1">?mode=stage</code> at your stream resolution.
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
            Default layout area when you play a clip from the dashboard (unless you override per
            card).
          </p>

          <div className="mt-4 grid gap-6 lg:grid-cols-2 lg:items-start">
            <div className="space-y-4">
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
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveSettings()}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
              >
                Save display defaults
              </button>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                Mapping preview
              </p>
              {mappingPreviewSlots.length > 0 ? (
                <LayoutStagePreview slots={mappingPreviewSlots} />
              ) : (
                <p className="text-sm text-text-muted">
                  Select landscape and portrait areas to preview both slots on the stage.
                </p>
              )}
              <p className="mt-2 text-xs text-text-muted">
                <span className="text-sky-300">Blue</span> = 16:9 landscape clip ·{' '}
                <span className="text-violet-300">Purple</span> = 9:16 portrait clip
              </p>
            </div>
          </div>
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

      <div>
        <h2 className="mb-2 text-base font-semibold">Areas</h2>
        <ul className="space-y-2">
          {areas.map((area, index) => (
            <li
              key={area.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-surface bg-bg-soft px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium">{area.name}</span>
                <span className="ml-2 text-xs text-text-muted">
                  {area.anchor_vertical}-{area.anchor_horizontal} · max {area.max_width_percent}×
                  {area.max_height_percent}%
                  {area.is_fullscreen ? ' · fullscreen' : ''}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  title="Move up"
                  disabled={index === 0 || reorderingId !== null}
                  onClick={() => void moveArea(area.id, 'up')}
                  className="rounded border border-surface px-2 py-0.5 text-xs disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  title="Move down"
                  disabled={index === areas.length - 1 || reorderingId !== null}
                  onClick={() => void moveArea(area.id, 'down')}
                  className="rounded border border-surface px-2 py-0.5 text-xs disabled:opacity-40"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(area)}
                  className="px-2 text-accent hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void removeArea(area.id)}
                  className="px-2 text-red-200 hover:underline"
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {editingId !== null ? (
        <form
          className="rounded-md border border-surface bg-surface-soft p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void saveArea();
          }}
        >
          <h2 className="text-base font-semibold">
            {editingId === 'new' ? 'New area' : 'Edit area'}
          </h2>

          <div className="mt-4 grid gap-6 xl:grid-cols-2 xl:items-start">
            <div className="space-y-4">
              <label className="block text-sm">
                Name
                <input
                  className="mt-1 w-full rounded-md border border-surface bg-bg px-2 py-2"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </label>

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
                      margin_top: e.target.checked ? 0 : form.margin_top,
                      margin_right: e.target.checked ? 0 : form.margin_right,
                      margin_bottom: e.target.checked ? 0 : form.margin_bottom,
                      margin_left: e.target.checked ? 0 : form.margin_left,
                    })
                  }
                />
                Fullscreen area (fills entire stage)
              </label>

              <AnchorPicker
                vertical={form.anchor_vertical}
                horizontal={form.anchor_horizontal}
                disabled={formDisabled}
                onChange={(anchor_vertical, anchor_horizontal) =>
                  setForm({ ...form, anchor_vertical, anchor_horizontal })
                }
              />

              <MarginSliders
                key={String(editingId ?? 'none')}
                marginTop={form.margin_top}
                marginRight={form.margin_right}
                marginBottom={form.margin_bottom}
                marginLeft={form.margin_left}
                disabled={formDisabled}
                onChange={(margins) => setForm({ ...form, ...margins })}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="flex justify-between text-xs text-text-muted">
                    <span>Max width</span>
                    <span>{form.max_width_percent}%</span>
                  </span>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    disabled={formDisabled}
                    value={form.max_width_percent}
                    onChange={(e) =>
                      setForm({ ...form, max_width_percent: Number(e.target.value) })
                    }
                    className="mt-1 w-full accent-accent"
                  />
                </label>
                <label className="block text-sm">
                  <span className="flex justify-between text-xs text-text-muted">
                    <span>Max height</span>
                    <span>{form.max_height_percent}%</span>
                  </span>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    disabled={formDisabled}
                    value={form.max_height_percent}
                    onChange={(e) =>
                      setForm({ ...form, max_height_percent: Number(e.target.value) })
                    }
                    className="mt-1 w-full accent-accent"
                  />
                </label>
              </div>
            </div>

            <div className="xl:sticky xl:top-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                Live preview
              </p>
              <LayoutStagePreview
                slots={editPreviewSlots}
                marginGuideArea={formDisabled ? null : previewArea}
              />
              <p className="mt-2 text-xs text-text-muted">
                Dashed box = margin bounds. Uses the same sizing as the OBS stage overlay.
              </p>
            </div>
          </div>

          <div className="mt-6 flex gap-2">
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
