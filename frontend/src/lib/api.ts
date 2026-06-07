export interface HealthResponse {
  status: 'ok';
  version: string;
  appData: string;
}

export interface SettingsResponse {
  playback_volume: number;
}

export type ClipType = 'audio' | 'video';

export interface ClipDto {
  id: number;
  title: string;
  clip_type: ClipType;
  category: { id: number | null; name: string | null };
  tags: string;
  thumbnail_cropped_url: string;
  volume: number;
  audio_normalize: number;
  is_favorite: number;
  created_at: string;
  video_orientation?: VideoOrientation | null;
  default_layout_area_id?: number | null;
}

export type ClipsSection =
  | { type: 'favorites'; title: 'Favorites'; clips: ClipDto[] }
  | { type: 'category'; category: { id: number | null; name: string }; clips: ClipDto[] };

export interface ClipsResponse {
  sections: ClipsSection[];
  playback_volume: number;
}

export type VideoOrientation = 'landscape' | 'portrait';

export interface PlayClipResponse {
  status: string;
  playback: 'browser_source' | 'local';
  connected_clients?: number;
  warnings?: string[];
}

export interface LayoutAreaDto {
  id: number;
  name: string;
  sort_order: number;
  anchor_vertical: 'top' | 'middle' | 'bottom';
  anchor_horizontal: 'left' | 'center' | 'right';
  margin_top: number;
  margin_right: number;
  margin_bottom: number;
  margin_left: number;
  max_width_percent: number;
  max_height_percent: number;
  is_fullscreen: number;
  created_at?: string;
}

export interface LayoutSettingsResponse {
  layout_area_id_landscape: number | null;
  layout_area_id_portrait: number | null;
  areas: { id: number; name: string }[];
}

export interface BrowserSourceStatusResponse {
  connected_clients: number;
  clients_by_mode: Record<string, number>;
  overlay_paths: Record<string, string>;
  active_todo_list_id?: number | null;
}

export interface PrefetchResponse {
  process_id: string;
  duration_seconds: number;
  audio_url: string;
  video_url?: string;
  thumbnail_url: string;
  source_format: string;
  title?: string;
  media_kind?: ClipType;
  video_width?: number;
  video_height?: number;
  suggested_orientation?: VideoOrientation;
}

export interface ClipDetail {
  id: number;
  title: string;
  clip_type: ClipType;
  youtube_url: string;
  start_time: string;
  end_time: string;
  category: { id: number | null; name: string | null };
  tags: string;
  thumbnail_crop_meta: string | null;
  thumbnail_original_url: string;
  thumbnail_cropped_url: string;
  volume: number;
  audio_normalize: number;
  is_favorite: number;
  created_at: string;
  video_width?: number | null;
  video_height?: number | null;
  video_orientation?: VideoOrientation | null;
  default_layout_area_id?: number | null;
}

export interface CategorySuggestion {
  id: number;
  name: string;
}

export interface YoutubeSessionResponse {
  connected: boolean;
  cookies_file: string;
  updated_at: string | null;
  login_hint: string;
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { message?: string };
      detail = body.message ?? '';
    } catch {
      /* noop */
    }
    throw new Error(
      detail || `Request failed (${res.status} ${res.statusText})`,
    );
  }
  return (await res.json()) as T;
}

async function requestBlob(input: RequestInfo, init?: RequestInit): Promise<Blob> {
  const res = await fetch(input, init);
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { message?: string };
      detail = body.message ?? '';
    } catch {
      /* noop */
    }
    throw new Error(
      detail || `Request failed (${res.status} ${res.statusText})`,
    );
  }
  return await res.blob();
}

export const api = {
  health: () => request<HealthResponse>('/api/health'),
  getClips: (search?: string) =>
    request<ClipsResponse>(
      '/api/clips' + (search ? `?search=${encodeURIComponent(search)}` : ''),
    ),
  getCategorySuggestions: (q: string) =>
    request<{ categories: CategorySuggestion[] }>(
      `/api/clips/suggestions/categories?q=${encodeURIComponent(q)}`,
    ),
  getTagSuggestions: (q: string) =>
    request<{ tags: string[] }>(
      `/api/clips/suggestions/tags?q=${encodeURIComponent(q)}`,
    ),
  fetchThumbnailFromUrl: (image_url: string) =>
    requestBlob('/api/thumbnails/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url }),
    }),
  getYoutubeSession: () => request<YoutubeSessionResponse>('/api/youtube/session'),
  getSettings: () => request<SettingsResponse>('/api/settings'),
  setVolume: (playback_volume: number) =>
    request<SettingsResponse>('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playback_volume }),
    }),
  stop: () =>
    request<{ status: string; playback?: string }>('/api/clips/stop', { method: 'POST' }),
  prefetchYoutube: (youtube_url: string) =>
    request<PrefetchResponse>('/api/clips/prefetch/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtube_url }),
    }),
  prefetchYoutubeVideo: (youtube_url: string) =>
    request<PrefetchResponse>('/api/clips/prefetch/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtube_url }),
    }),
  prefetchMp3Url: (audio_url: string) =>
    request<PrefetchResponse>('/api/clips/prefetch/mp3-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_url }),
    }),
  prefetchMp3File: (audio: File) => {
    const form = new FormData();
    form.append('audio', audio);
    return request<PrefetchResponse>('/api/clips/prefetch/mp3-file', {
      method: 'POST',
      body: form,
    });
  },
  prefetchVideoFile: (video: File) => {
    const form = new FormData();
    form.append('video', video);
    return request<PrefetchResponse>('/api/clips/prefetch/video-file', {
      method: 'POST',
      body: form,
    });
  },
  stageClipAudio: (id: number) =>
    request<PrefetchResponse>(`/api/clips/${id}/stage-audio`, { method: 'POST' }),
  stageClipVideo: (id: number) =>
    request<PrefetchResponse>(`/api/clips/${id}/stage-video`, { method: 'POST' }),
  getStagingPreviewUrl: (body: {
    process_id: string;
    start_time: string;
    end_time: string;
    audio_normalize?: boolean;
  }) => {
    const params = new URLSearchParams({
      start_time: body.start_time,
      end_time: body.end_time,
      audio_normalize: body.audio_normalize === false ? '0' : '1',
    });
    return `/api/staging/${encodeURIComponent(body.process_id)}/preview?${params.toString()}`;
  },
  getStagingVideoPreviewUrl: (body: {
    process_id: string;
    start_time: string;
    end_time: string;
  }) => {
    const params = new URLSearchParams({
      start_time: body.start_time,
      end_time: body.end_time,
    });
    return `/api/staging/${encodeURIComponent(body.process_id)}/preview?${params.toString()}`;
  },
  getClip: (id: number) => request<ClipDetail>(`/api/clips/${id}`),
  createClip: (form: FormData) =>
    request<{ id: number; message: string }>('/api/clips', {
      method: 'POST',
      body: form,
    }),
  updateClip: (id: number, form: FormData) =>
    request<{ id: number; message: string }>(`/api/clips/${id}`, {
      method: 'PUT',
      body: form,
    }),
  playClip: (id: number, body?: { layout_area_id?: number }) =>
    request<PlayClipResponse>(`/api/clips/${id}/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
  getLayoutAreas: () => request<{ areas: LayoutAreaDto[] }>('/api/layout-areas'),
  getLayoutSettings: () => request<LayoutSettingsResponse>('/api/layout-areas/settings'),
  updateLayoutSettings: (body: {
    layout_area_id_landscape?: number | null;
    layout_area_id_portrait?: number | null;
  }) =>
    request<LayoutSettingsResponse>('/api/layout-areas/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  createLayoutArea: (body: Omit<LayoutAreaDto, 'id' | 'created_at'>) =>
    request<LayoutAreaDto>('/api/layout-areas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  updateLayoutArea: (id: number, body: Omit<LayoutAreaDto, 'id' | 'created_at'>) =>
    request<LayoutAreaDto>(`/api/layout-areas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteLayoutArea: (id: number) =>
    request<{ status: string; id: number }>(`/api/layout-areas/${id}`, {
      method: 'DELETE',
    }),
  restoreLayoutAreaDefaults: () =>
    request<{ areas: LayoutAreaDto[] }>('/api/layout-areas/restore-defaults', {
      method: 'POST',
    }),
  getBrowserSourceStatus: () =>
    request<BrowserSourceStatusResponse>('/api/browser-source/status'),
  getClipAudioDownloadUrl: (id: number) => `/api/clips/${id}/audio?download=1`,
  getClipVideoDownloadUrl: (id: number) => `/api/clips/${id}/video?download=1`,
  renameCategory: (id: number, name: string) =>
    request<{ id: number; name: string; message: string }>(`/api/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  updateClipMetadata: (
    id: number,
    body: {
      title: string;
      category: string;
      tags: string;
      default_layout_area_id?: number | null;
    },
  ) =>
    request<{ id: number; message: string }>(`/api/clips/${id}/metadata`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  setFavorite: (id: number, is_favorite: boolean) =>
    request<{ id: number; is_favorite: number }>(`/api/clips/${id}/favorite`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_favorite }),
    }),
  updateClipVolume: (id: number, volume: number) =>
    request<{ id: number; volume: number }>(`/api/clips/${id}/volume`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volume }),
    }),
  deleteClip: (id: number) =>
    request<{ status: 'deleted'; id: number }>(`/api/clips/${id}`, {
      method: 'DELETE',
    }),
  getTodoLists: () =>
    request<import('./todoOverlay').TodoListsIndexResponse>('/api/todo-lists'),
  getTodoList: (id: number) =>
    request<import('./todoOverlay').TodoListDetailDto>(`/api/todo-lists/${id}`),
  createTodoList: (body: import('./todoOverlay').TodoListInput) =>
    request<import('./todoOverlay').TodoListDetailDto>('/api/todo-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  updateTodoList: (id: number, body: import('./todoOverlay').TodoListInput) =>
    request<import('./todoOverlay').TodoListDetailDto>(`/api/todo-lists/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteTodoList: (id: number) =>
    request<{ status: string; id: number }>(`/api/todo-lists/${id}`, {
      method: 'DELETE',
    }),
  showTodoList: (id: number) =>
    request<{ status: string; active_todo_list_id: number }>(
      `/api/todo-lists/${id}/show`,
      { method: 'POST' },
    ),
  hideTodoList: () =>
    request<{ status: string; active_todo_list_id: number | null }>(
      '/api/todo-lists/hide',
      { method: 'POST' },
    ),
  createTodoGroup: (
    listId: number,
    body: { title: string; sort_order?: number; column_id?: number },
  ) =>
    request<import('./todoOverlay').TodoGroupDto>(`/api/todo-lists/${listId}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  createTodoColumn: (listId: number, body?: { sort_order?: number }) =>
    request<import('./todoOverlay').TodoColumnDto>(`/api/todo-lists/${listId}/columns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }),
  updateTodoColumn: (
    listId: number,
    columnId: number,
    body: { sort_order?: number; visible?: boolean },
  ) =>
    request<import('./todoOverlay').TodoColumnDto>(
      `/api/todo-lists/${listId}/columns/${columnId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),
  deleteTodoColumn: (listId: number, columnId: number) =>
    request<{ status: string; id: number }>(
      `/api/todo-lists/${listId}/columns/${columnId}`,
      { method: 'DELETE' },
    ),
  updateTodoGroup: (
    listId: number,
    groupId: number,
    body: { title?: string; sort_order?: number; column_id?: number; visible?: boolean },
  ) =>
    request<import('./todoOverlay').TodoGroupDto>(
      `/api/todo-lists/${listId}/groups/${groupId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),
  deleteTodoGroup: (listId: number, groupId: number) =>
    request<{ status: string; id: number }>(
      `/api/todo-lists/${listId}/groups/${groupId}`,
      { method: 'DELETE' },
    ),
  createTodoItem: (
    listId: number,
    groupId: number,
    body: { title: string; sort_order?: number; completed?: boolean },
  ) =>
    request<import('./todoOverlay').TodoItemDto>(
      `/api/todo-lists/${listId}/groups/${groupId}/items`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),
  updateTodoItem: (
    listId: number,
    itemId: number,
    body: { title?: string; sort_order?: number; completed?: boolean; group_id?: number },
  ) =>
    request<import('./todoOverlay').TodoItemDto>(
      `/api/todo-lists/${listId}/items/${itemId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),
  deleteTodoItem: (listId: number, itemId: number) =>
    request<{ status: string; id: number }>(
      `/api/todo-lists/${listId}/items/${itemId}`,
      { method: 'DELETE' },
    ),
  uploadTodoBackground: (id: number, file: File) => {
    const form = new FormData();
    form.append('background', file);
    return request<import('./todoOverlay').TodoListDetailDto>(
      `/api/todo-lists/${id}/background`,
      { method: 'POST', body: form },
    );
  },
  deleteTodoBackground: (id: number) =>
    request<import('./todoOverlay').TodoListDetailDto>(`/api/todo-lists/${id}/background`, {
      method: 'DELETE',
    }),
  uploadTodoGroupThumbnail: (listId: number, groupId: number, file: File) => {
    const form = new FormData();
    form.append('thumbnail', file);
    return request<import('./todoOverlay').TodoGroupDto>(
      `/api/todo-lists/${listId}/groups/${groupId}/thumbnail`,
      { method: 'POST', body: form },
    );
  },
  deleteTodoGroupThumbnail: (listId: number, groupId: number) =>
    request<import('./todoOverlay').TodoGroupDto>(
      `/api/todo-lists/${listId}/groups/${groupId}/thumbnail`,
      { method: 'DELETE' },
    ),
  uploadTodoItemThumbnail: (listId: number, itemId: number, file: File) => {
    const form = new FormData();
    form.append('thumbnail', file);
    return request<import('./todoOverlay').TodoItemDto>(
      `/api/todo-lists/${listId}/items/${itemId}/thumbnail`,
      { method: 'POST', body: form },
    );
  },
  deleteTodoItemThumbnail: (listId: number, itemId: number) =>
    request<import('./todoOverlay').TodoItemDto>(
      `/api/todo-lists/${listId}/items/${itemId}/thumbnail`,
      { method: 'DELETE' },
    ),
};
