## Personal Soundboard Player v0.6.0

### Volume controls

- **Per-clip volume** on the dashboard — adjust each card without opening the full editor; saves automatically.
- **Global volume** on the dashboard — scales all playback in OBS on top of each clip's volume.
- **Video clip volume** in the clip editor (0–100; browser source maximum).
- **Audio clip volume** unchanged in the editor (0–300 with boost above 100).

### Playback

- Browser overlay applies **clip volume × global volume** for both audio and video.
- Video play events now include the clip's stored volume (previously ignored).

### API

- `PATCH /api/clips/:id/volume` — update a clip's volume from the dashboard.
- Play SSE events include `playbackVolume` (global setting) alongside `volume` (clip).

### Upgrade

Install over v0.5.0. Refresh browser sources in OBS/Streamlabs after updating. Existing clips keep their stored volume; global playback volume defaults to 75% until changed on the dashboard.
