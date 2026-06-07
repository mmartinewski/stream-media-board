# bin/

This folder hosts the Windows executables the application invokes at runtime:

- `ffmpeg.exe`
- `ffprobe.exe`
- `yt-dlp.exe`
- the FFmpeg **shared DLLs** (`avcodec-*.dll`, `avformat-*.dll`, `avutil-*.dll`, `swscale-*.dll`, `swresample-*.dll`, `avfilter-*.dll`, `avdevice-*.dll`, `postproc-*.dll`)

> `ffplay.exe` is intentionally **not** used: audio/video preview runs in the browser
> (`GET /api/staging/:id/preview`), so the segment is cut with `ffmpeg` and streamed to the page.

These files are **not versioned** (see `.gitignore`). To get them, run this from the repository root:

```bash
npm run fetch:bin
```

By default, the script uses the **BtbN "shared" build on GitHub** (win64 GPL **shared** ZIP) and **`curl`** on Windows when available. The shared build keeps the codecs in DLLs shared by the three executables instead of statically linking ~200 MB into each `.exe`, cutting this folder from ~630 MB to ~150 MB.

> **Important:** the FFmpeg DLLs must stay in **this same folder**, next to the `.exe` files. If they are missing, `ffmpeg.exe` / `ffprobe.exe` will fail to start.

### If the automatic download fails

1. Open [**BtbN / FFmpeg-Builds - Latest**](https://github.com/BtbN/FFmpeg-Builds/releases/latest) and download the **win64 GPL shared** ZIP. A typical file name is `ffmpeg-master-latest-win64-gpl-shared.zip`.
2. Extract it and copy the contents of its `bin/` folder into **this folder**: `ffmpeg.exe`, `ffprobe.exe` **and all the `.dll` files**.
3. **yt-dlp:**  
   https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe  
   Copy `yt-dlp.exe` into **this folder**.

Alternatively, force a URL in PowerShell before running the script:

```powershell
$env:FFMPEG_ZIP_URL = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl-shared.zip"
npm run fetch:bin
```

> The backend resolves these paths through `backend/src/config/paths.ts`. Do not rely on the global `PATH`.
