# YouTube Adapter

This removable adapter handles platform-specific metadata lookup and media download with `yt-dlp`.

Install its optional Python dependency only when this adapter is selected:

```sh
python3 -m pip install --user -r scripts/media/adapters/youtube/requirements.txt
```

The public CLI is generic:

```sh
node scripts/transcribe-media.mjs <remote-media-source> --language ru
```

If this directory is removed, local files and direct media URLs still use the generic media pipeline. Platform URLs fail with the generic error from the adapter registry.
