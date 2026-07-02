import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  api,
  TWITCH_STREAM_LANGUAGES,
  type TwitchCategoryResult,
  type TwitchContentClassificationLabel,
  type TwitchIntegrationStatus,
  type TwitchStreamPreset,
  type TwitchStreamPresetInput,
} from '../lib/api';
import ContentClassificationDropdown from '../components/twitch/ContentClassificationDropdown';

type PresetForm = TwitchStreamPresetInput;

const EMPTY_FORM: PresetForm = {
  name: '',
  sort_order: 0,
  title: '',
  game_id: '',
  game_name: '',
  game_box_art_url: '',
  tags: [],
  broadcaster_language: 'pt',
  content_classification_labels: [],
  is_branded_content: false,
};

function presetToForm(preset: TwitchStreamPreset): PresetForm {
  return {
    name: preset.name,
    sort_order: preset.sort_order,
    title: preset.title,
    game_id: preset.game_id,
    game_name: preset.game_name,
    game_box_art_url: preset.game_box_art_url,
    tags: [...preset.tags],
    broadcaster_language: preset.broadcaster_language,
    content_classification_labels: [...preset.content_classification_labels],
    is_branded_content: preset.is_branded_content,
  };
}

export default function TwitchPresetsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<TwitchIntegrationStatus | null>(null);
  const [presets, setPresets] = useState<TwitchStreamPreset[]>([]);
  const [contentLabels, setContentLabels] = useState<TwitchContentClassificationLabel[]>([]);
  const [lockedContentLabels, setLockedContentLabels] = useState<string[]>([]);
  const [lockedLabelsLoading, setLockedLabelsLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<PresetForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [categoryResults, setCategoryResults] = useState<TwitchCategoryResult[]>([]);
  const [categorySearching, setCategorySearching] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [tagSearching, setTagSearching] = useState(false);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [deviceAuth, setDeviceAuth] = useState<{
    user_code: string;
    verification_uri: string;
    interval: number;
  } | null>(null);
  const categoryDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tagDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const devicePollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    const [statusRes, presetsRes] = await Promise.all([
      api.getTwitchStatus(),
      api.getTwitchPresets(),
    ]);
    setStatus(statusRes);
    setPresets(presetsRes.presets);
    if (statusRes.connected) {
      try {
        const labelsRes = await api.getTwitchContentLabels();
        setContentLabels(labelsRes.labels);
      } catch {
        /* labels require connection */
      }
    }
  }, []);

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [reload]);

  useEffect(() => {
    const oauth = searchParams.get('oauth');
    const oauthError = searchParams.get('oauth_error');
    if (oauth === 'success') {
      setSuccess('Conta Twitch conectada com sucesso.');
      setSearchParams({}, { replace: true });
      void reload();
    } else if (oauthError) {
      setError(`Falha ao conectar Twitch: ${oauthError}`);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, reload]);

  useEffect(() => {
    if (!status?.connected || !categoryMenuOpen) {
      setCategoryResults([]);
      return;
    }
    if (categoryDebounce.current) clearTimeout(categoryDebounce.current);
    if (!categoryInput.trim()) {
      setCategoryResults([]);
      return;
    }
    categoryDebounce.current = setTimeout(() => {
      setCategorySearching(true);
      void api
        .searchTwitchCategories(categoryInput)
        .then((res) => setCategoryResults(res.categories))
        .catch(() => setCategoryResults([]))
        .finally(() => setCategorySearching(false));
    }, 300);
    return () => {
      if (categoryDebounce.current) clearTimeout(categoryDebounce.current);
    };
  }, [categoryInput, categoryMenuOpen, status?.connected]);

  useEffect(() => {
    if (!status?.connected || !tagMenuOpen) {
      setTagSuggestions([]);
      return;
    }
    if (tagDebounce.current) clearTimeout(tagDebounce.current);
    if (!tagInput.trim()) {
      setTagSuggestions([]);
      return;
    }
    tagDebounce.current = setTimeout(() => {
      setTagSearching(true);
      void api
        .searchTwitchTags(tagInput, form.game_id || undefined)
        .then((res) => setTagSuggestions(res.tags))
        .catch(() => setTagSuggestions([]))
        .finally(() => setTagSearching(false));
    }, 250);
    return () => {
      if (tagDebounce.current) clearTimeout(tagDebounce.current);
    };
  }, [tagInput, tagMenuOpen, status?.connected, form.game_id]);

  const fetchLockedLabels = useCallback(
    async (gameId: string) => {
      if (!status?.connected || !gameId.trim()) {
        setLockedContentLabels([]);
        return;
      }
      setLockedLabelsLoading(true);
      try {
        const res = await api.getTwitchLockedContentLabels(gameId);
        setLockedContentLabels(res.locked);
      } catch {
        setLockedContentLabels([]);
      } finally {
        setLockedLabelsLoading(false);
      }
    },
    [status?.connected],
  );

  useEffect(() => {
    void fetchLockedLabels(form.game_id);
  }, [form.game_id, fetchLockedLabels]);

  const stopDevicePoll = useCallback(() => {
    if (devicePollTimer.current) {
      clearTimeout(devicePollTimer.current);
      devicePollTimer.current = null;
    }
  }, []);

  useEffect(() => () => stopDevicePoll(), [stopDevicePoll]);

  const scheduleDevicePoll = useCallback(
    (intervalSec: number) => {
      stopDevicePoll();
      devicePollTimer.current = setTimeout(() => {
        void (async () => {
          try {
            const result = await api.pollTwitchDeviceAuth();
            if (result.status === 'connected') {
              stopDevicePoll();
              setDeviceAuth(null);
              setStatus(result);
              setSuccess('Conta Twitch conectada com sucesso.');
              await reload();
              return;
            }
            if (result.status === 'error') {
              stopDevicePoll();
              setDeviceAuth(null);
              setError(result.message);
              return;
            }
            const nextInterval =
              result.status === 'slow_down' ? result.interval : intervalSec;
            scheduleDevicePoll(nextInterval);
          } catch (err: unknown) {
            stopDevicePoll();
            setDeviceAuth(null);
            setError(err instanceof Error ? err.message : String(err));
          }
        })();
      }, intervalSec * 1000);
    },
    [reload, stopDevicePoll],
  );

  const resetEditorFields = useCallback(() => {
    setCategoryInput('');
    setCategoryResults([]);
    setCategoryMenuOpen(false);
    setTagInput('');
    setTagSuggestions([]);
    setTagMenuOpen(false);
  }, []);

  const openEdit = useCallback(
    (preset: TwitchStreamPreset) => {
      setEditingId(preset.id);
      setForm(presetToForm(preset));
      resetEditorFields();
      setError(null);
      setSuccess(null);
    },
    [resetEditorFields],
  );

  const startNew = useCallback(() => {
    setEditingId('new');
    setForm({ ...EMPTY_FORM, sort_order: presets.length * 10 });
    resetEditorFields();
    setError(null);
    setSuccess(null);
  }, [presets.length, resetEditorFields]);

  const closeEditor = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    resetEditorFields();
  }, [resetEditorFields]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (editingId === 'new') {
        const created = await api.createTwitchPreset(form);
        setPresets((prev) => [...prev, created].sort(sortPresets));
        setEditingId(created.id);
        setSuccess('Preset criado.');
      } else if (typeof editingId === 'number') {
        const updated = await api.updateTwitchPreset(editingId, form);
        setPresets((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p)).sort(sortPresets),
        );
        setSuccess('Preset salvo.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleApply = async (id: number) => {
    setApplyingId(id);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.applyTwitchPreset(id);
      setSuccess(`"${result.preset.name}" aplicado na Twitch.`);
      if (result.preset.game_id && form.game_id === result.preset.game_id) {
        await fetchLockedLabels(result.preset.game_id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplyingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir este preset?')) return;
    setError(null);
    try {
      await api.deleteTwitchPreset(id);
      setPresets((prev) => prev.filter((p) => p.id !== id));
      if (editingId === id) closeEditor();
      setSuccess('Preset excluído.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDuplicate = async (id: number) => {
    setError(null);
    try {
      const copy = await api.duplicateTwitchPreset(id);
      setPresets((prev) => [...prev, copy].sort(sortPresets));
      openEdit(copy);
      setSuccess('Preset duplicado.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleConnect = async () => {
    setError(null);
    setSuccess(null);
    try {
      const started = await api.startTwitchDeviceAuth();
      setDeviceAuth({
        user_code: started.user_code,
        verification_uri: started.verification_uri,
        interval: started.interval,
      });
      scheduleDevicePoll(started.interval);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const cancelDeviceAuth = () => {
    stopDevicePoll();
    setDeviceAuth(null);
  };

  const handleSaveConfig = async () => {
    setError(null);
    try {
      const body: { client_id?: string; client_secret?: string } = {};
      if (clientId.trim()) body.client_id = clientId.trim();
      if (clientSecret.trim()) body.client_secret = clientSecret.trim();
      const saved = await api.updateTwitchConfig(body);
      setStatus(saved);
      setClientId('');
      setClientSecret('');
      setSuccess('Configuração Twitch salva.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLogout = async () => {
    await api.twitchLogout();
    setStatus((s) => (s ? { ...s, connected: false, broadcaster_login: null, broadcaster_display_name: null } : s));
    setContentLabels([]);
    setSuccess('Conta Twitch desconectada.');
  };

  const addTag = (raw?: string) => {
    const trimmed = (raw ?? tagInput).trim();
    if (!trimmed || form.tags.length >= 10) return;
    if (form.tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setTagInput('');
      setTagMenuOpen(false);
      setTagSuggestions([]);
      return;
    }
    setForm((f) => ({ ...f, tags: [...f.tags, trimmed] }));
    setTagInput('');
    setTagMenuOpen(false);
    setTagSuggestions([]);
  };

  const removeTag = (tag: string) => {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  };

  const toggleContentLabel = (labelId: string) => {
    if (lockedContentLabels.includes(labelId)) return;
    setForm((f) => {
      const has = f.content_classification_labels.includes(labelId);
      const optionalCount = f.content_classification_labels.filter(
        (id) => !lockedContentLabels.includes(id),
      ).length;
      if (!has && optionalCount >= 6) {
        setError('No máximo 6 classificações de conteúdo por preset.');
        return f;
      }
      setError(null);
      return {
        ...f,
        content_classification_labels: has
          ? f.content_classification_labels.filter((id) => id !== labelId)
          : [...f.content_classification_labels, labelId],
      };
    });
  };

  const selectCategory = (cat: TwitchCategoryResult) => {
    setForm((f) => ({
      ...f,
      game_id: cat.id,
      game_name: cat.name,
      game_box_art_url: cat.box_art_url,
    }));
    setCategoryInput('');
    setCategoryResults([]);
    setCategoryMenuOpen(false);
  };

  const titleChars = form.title.length;
  const canEdit = editingId !== null;

  const sortedPresets = useMemo(() => [...presets].sort(sortPresets), [presets]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Presets de transmissão na Twitch</h1>
          <p className="mt-1 text-sm text-text-muted">
            Cadastre presets e aplique título, categoria, tags, idioma e classificação na Twitch com um clique.
          </p>
        </div>
        {status?.connected ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-400">
              Conectado como {status.broadcaster_display_name ?? status.broadcaster_login}
            </span>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-md border border-surface px-3 py-1 text-text-muted hover:text-text"
            >
              Desconectar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {status?.client_id_configured ? (
              <button
                type="button"
                onClick={() => void handleConnect()}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
              >
                Conectar conta Twitch
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setShowConfig((v) => !v)}
              className="rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 text-sm text-accent hover:bg-accent/20"
            >
              {showConfig ? 'Ocultar configuração' : 'Configurar Twitch'}
            </button>
          </div>
        )}
      </div>

      {showConfig && !status?.connected ? (
        <section className="rounded-lg border border-surface bg-bg-soft p-4 space-y-3">
          <h2 className="text-sm font-semibold">Configuração da API Twitch</h2>
          <p className="text-xs text-text-muted">
            Crie um app em{' '}
            <a
              href="https://dev.twitch.tv/console"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline"
            >
              dev.twitch.tv
            </a>
            . Se o formulário exigir Redirect URI, use{' '}
            <code className="rounded bg-surface px-1">https://localhost</code> (não usamos redirect —
            a conexão é feita via código em twitch.tv/activate).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-text-muted">Client ID</span>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={status?.client_id_configured ? 'Deixe em branco para manter' : ''}
                className="mt-1 w-full rounded-md border border-surface bg-bg px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-muted">Client Secret</span>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Obrigatório para renovar token"
                className="mt-1 w-full rounded-md border border-surface bg-bg px-3 py-2"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSaveConfig()}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              Salvar configuração
            </button>
            {status?.client_id_configured ? (
              <button
                type="button"
                onClick={() => void handleConnect()}
                className="rounded-md border border-accent px-4 py-2 text-sm text-accent hover:bg-accent/10"
              >
                Conectar conta Twitch
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {deviceAuth ? (
        <section className="rounded-lg border border-accent/40 bg-accent/10 p-4 space-y-3">
          <h2 className="text-sm font-semibold">Ative o acesso na Twitch</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-text-muted">
            <li>
              Abra{' '}
              <a
                href={deviceAuth.verification_uri}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline"
              >
                twitch.tv/activate
              </a>
            </li>
            <li>
              Digite o código:{' '}
              <span className="font-mono text-lg font-bold tracking-widest text-text">
                {deviceAuth.user_code}
              </span>
            </li>
            <li>Autorize o app e aguarde — esta página detecta automaticamente.</li>
          </ol>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.open(deviceAuth.verification_uri, '_blank', 'noopener,noreferrer')}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              Abrir twitch.tv/activate
            </button>
            <button
              type="button"
              onClick={cancelDeviceAuth}
              className="rounded-md border border-surface px-4 py-2 text-sm text-text-muted hover:text-text"
            >
              Cancelar
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300">
          {success}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={startNew}
              className="flex-1 rounded-md border border-surface px-3 py-2 text-sm hover:border-accent hover:text-accent"
            >
              + Novo
            </button>
          </div>
          <ul className="space-y-1">
            {sortedPresets.map((preset) => (
              <li key={preset.id}>
                <div
                  className={
                    'rounded-md border transition-colors ' +
                    (editingId === preset.id
                      ? 'border-accent bg-accent/10'
                      : 'border-surface')
                  }
                >
                  <div className="px-3 py-2 text-sm font-medium">{preset.name}</div>
                  <div className="flex gap-1 px-2 pb-2">
                    <button
                      type="button"
                      disabled={!status?.connected || applyingId === preset.id}
                      onClick={() => void handleApply(preset.id)}
                      className="flex-1 rounded bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                    >
                      {applyingId === preset.id ? 'Aplicando…' : 'Aplicar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(preset)}
                      className="rounded border border-surface px-2 py-1 text-xs text-text-muted hover:border-accent hover:text-text"
                      title="Editar"
                      aria-label={`Editar ${preset.name}`}
                    >
                      <EditIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDuplicate(preset.id)}
                      className="rounded border border-surface px-2 py-1 text-xs text-text-muted hover:text-text"
                      title="Duplicar"
                    >
                      ⧉
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(preset.id)}
                      className="rounded border border-surface px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
                      title="Excluir"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </li>
            ))}
            {sortedPresets.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-text-muted">
                Nenhum preset ainda.
              </p>
            ) : null}
          </ul>
        </aside>

        <section className="rounded-lg border border-surface bg-bg-soft p-4">
          {!canEdit ? (
            <p className="py-12 text-center text-sm text-text-muted">
              Clique no ícone de lápis para editar um preset, ou crie um novo.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  {editingId === 'new' ? 'Novo preset' : 'Editar preset'}
                </h2>
                <button
                  type="button"
                  onClick={closeEditor}
                  className="rounded-md border border-surface px-2 py-1 text-xs text-text-muted hover:text-text"
                >
                  Fechar
                </button>
              </div>
              <label className="block text-sm">
                <span className="text-text-muted">Nome do preset</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-surface bg-bg px-3 py-2"
                  placeholder="Ex: Stellar Blade"
                />
              </label>

              <label className="block text-sm">
                <span className="text-text-muted">Título</span>
                <input
                  type="text"
                  value={form.title}
                  maxLength={140}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-surface bg-bg px-3 py-2"
                  placeholder="Título da live"
                />
                <span className="mt-0.5 block text-xs text-text-muted">{titleChars}/140</span>
              </label>

              <div className="text-sm">
                <span className="text-text-muted">Categoria</span>
                <div className="relative mt-1">
                  <input
                    type="text"
                    value={categoryInput}
                    onFocus={() => setCategoryMenuOpen(true)}
                    onChange={(e) => {
                      setCategoryMenuOpen(true);
                      setCategoryInput(e.target.value);
                      if (!e.target.value.trim()) {
                        setForm((f) => ({ ...f, game_id: '', game_name: '', game_box_art_url: '' }));
                      }
                    }}
                    onBlur={() => {
                      window.setTimeout(() => setCategoryMenuOpen(false), 150);
                    }}
                    disabled={!status?.connected}
                    className="w-full rounded-md border border-surface bg-bg px-3 py-2 disabled:opacity-50"
                    placeholder={
                      status?.connected
                        ? form.game_name
                          ? 'Buscar para trocar categoria…'
                          : 'Buscar jogo ou categoria…'
                        : 'Conecte a Twitch para buscar'
                    }
                  />
                  {categorySearching ? (
                    <span className="absolute right-3 top-2.5 text-xs text-text-muted">…</span>
                  ) : null}
                  {categoryMenuOpen && categoryResults.length > 0 ? (
                    <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-surface bg-bg shadow-lg">
                      {categoryResults.map((cat) => (
                        <li key={cat.id}>
                          <button
                            type="button"
                            onClick={() => selectCategory(cat)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-soft"
                          >
                            {cat.box_art_url ? (
                              <img src={cat.box_art_url} alt="" className="h-8 w-6 rounded object-cover" />
                            ) : null}
                            <span>{cat.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {form.game_name ? (
                  <div className="mt-2 flex items-center gap-2 rounded-md border border-surface bg-bg px-3 py-2">
                    {form.game_box_art_url ? (
                      <img
                        src={form.game_box_art_url.replace('{width}', '52').replace('{height}', '72')}
                        alt=""
                        className="h-12 w-9 rounded object-cover"
                      />
                    ) : null}
                    <span className="font-medium">{form.game_name}</span>
                  </div>
                ) : null}
              </div>

              <div className="text-sm">
                <span className="text-text-muted">Tags</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {form.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="text-text-muted hover:text-text"
                        aria-label={`Remover tag ${tag}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="relative mt-2 flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <input
                      type="text"
                      value={tagInput}
                      onFocus={() => setTagMenuOpen(true)}
                      onChange={(e) => {
                        setTagMenuOpen(true);
                        setTagInput(e.target.value);
                      }}
                      onBlur={() => {
                        window.setTimeout(() => setTagMenuOpen(false), 150);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTag();
                        }
                      }}
                      maxLength={25}
                      disabled={form.tags.length >= 10 || !status?.connected}
                      placeholder={
                        status?.connected
                          ? 'Buscar ou digitar tag…'
                          : 'Conecte a Twitch para buscar tags'
                      }
                      className="w-full rounded-md border border-surface bg-bg px-3 py-2 disabled:opacity-50"
                    />
                    {tagSearching ? (
                      <span className="absolute right-3 top-2.5 text-xs text-text-muted">…</span>
                    ) : null}
                    {tagMenuOpen && tagSuggestions.length > 0 ? (
                      <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-surface bg-bg shadow-lg">
                        {tagSuggestions.map((tag) => (
                          <li key={tag}>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => addTag(tag)}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-surface-soft"
                            >
                              {tag}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => addTag()}
                    disabled={form.tags.length >= 10 || !tagInput.trim()}
                    className="shrink-0 rounded-md border border-surface px-3 py-2 text-sm hover:border-accent disabled:opacity-50"
                  >
                    Adicionar tag
                  </button>
                </div>
                <span className="mt-0.5 block text-xs text-text-muted">
                  Busca tags usadas na Twitch (como no OBS). Até 10 tags, 25 caracteres, sem espaços.
                </span>
              </div>

              <label className="block text-sm">
                <span className="text-text-muted">Idioma da transmissão</span>
                <select
                  value={form.broadcaster_language}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, broadcaster_language: e.target.value }))
                  }
                  className="form-select mt-1 w-full rounded-md border border-surface bg-bg px-3 py-2 pr-9"
                >
                  {TWITCH_STREAM_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </label>

              {contentLabels.length > 0 ? (
                <ContentClassificationDropdown
                  labels={contentLabels}
                  selected={form.content_classification_labels}
                  lockedIds={lockedContentLabels}
                  onToggle={toggleContentLabel}
                />
              ) : status?.connected ? (
                <p className="text-xs text-text-muted">Carregando classificações de conteúdo…</p>
              ) : (
                <p className="text-xs text-text-muted">
                  Conecte a Twitch para configurar a classificação de conteúdo.
                </p>
              )}
              {lockedLabelsLoading && form.game_id ? (
                <p className="text-xs text-text-muted">Verificando labels obrigatórias da categoria…</p>
              ) : null}

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_branded_content}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, is_branded_content: e.target.checked }))
                  }
                />
                <span>Conteúdo patrocinado</span>
              </label>

              <div className="flex gap-2 border-t border-surface pt-4">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave()}
                  className="rounded-md bg-surface px-4 py-2 text-sm font-medium hover:bg-surface/80 disabled:opacity-50"
                >
                  {saving ? 'Salvando…' : 'Salvar preset'}
                </button>
                {typeof editingId === 'number' && status?.connected ? (
                  <button
                    type="button"
                    disabled={applyingId === editingId}
                    onClick={() => void handleApply(editingId)}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                  >
                    {applyingId === editingId ? 'Aplicando…' : 'Aplicar na Twitch'}
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function sortPresets(a: TwitchStreamPreset, b: TwitchStreamPreset): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M12.5 3.5 16.5 7.5 7 17H3v-4L12.5 3.5z" />
    </svg>
  );
}
