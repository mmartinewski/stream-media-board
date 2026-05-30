## Personal Soundboard Player v0.7.0

### Video clip download

- **Download** in the clip card menu (⋮) now works for **video** clips as well as audio.
- Video files download as `.mp4` with the clip title as the filename.

### API

- `GET /api/clips/:id/video?download=1` — force download of the trimmed MP4 (inline streaming unchanged without the query param).

### Upgrade

Install over v0.6.0. No OBS or browser source changes required.
