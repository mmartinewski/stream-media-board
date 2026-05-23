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
}

export type ClipsSection =
  | { type: 'favorites'; title: 'Favorites'; clips: ClipDto[] }
  | { type: 'category'; category: { id: number | null; name: string }; clips: ClipDto[] };

export interface ClipsResponse {
  sections: ClipsSection[];
  playback_volume: number;
}

export type VideoOrientation = 'landscape' | 'portrait';

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
    request<{ status: 'stopped' }>('/api/clips/stop', { method: 'POST' }),
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
  testPlayStaging: (body: {
    process_id: string;
    start_time: string;
    end_time: string;
    volume?: number;
    audio_normalize?: boolean;
  }) =>
    request<{ status: string }>('/api/clips/test-play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
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
  playClip: (id: number) =>
    request<{ status: string }>(`/api/clips/${id}/play`, { method: 'POST' }),
  getClipAudioDownloadUrl: (id: number) => `/api/clips/${id}/audio`,
  renameCategory: (id: number, name: string) =>
    request<{ id: number; name: string; message: string }>(`/api/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  updateClipMetadata: (
    id: number,
    body: { title: string; category: string; tags: string },
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
  deleteClip: (id: number) =>
    request<{ status: 'deleted'; id: number }>(`/api/clips/${id}`, {
      method: 'DELETE',
    }),
};
