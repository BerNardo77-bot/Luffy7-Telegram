# Luffy7 Telegram

Bot hermano WhatsApp: https://github.com/BerNardo77-bot/Luffy7

Version **1.3.0** — descargas a disco hasta 2GB. Envio Telegram cloud ~50MB con compresion ffmpeg (ultrafast 360p). Stickers con **sharp** (webp 512x512).

## Comandos

### Descargas
| Comando | Alias | Descripcion |
|--------|-------|-----------|
| `/play` | `/mp3` | Audio YouTube |
| `/ytvideo` | `/mp4` | Video YouTube |
| `/tiktok` | `/tt` | Video TikTok |
| `/tiktokmp3` | `/ttmp3` | Audio TikTok |
| `/ig` | `/instagram` | Instagram |
| `/fb` | `/facebook` | Facebook |
| `/spotify` | `/sp` | Spotify |
| `/mediafire` | `/mf` | MediaFire |
| `/dl` | `/get` | Link directo |
| `/xvideos` | `/xv` | XVideos |

### Stickers
- `/sticker` o `/s` — responde a una foto, **o** envia una foto con caption `/sticker`
- Fotos sin ese caption se ignoran

### Utilidades
- `/traducir  /translate` — idioma + texto (API Delirius)
- `/ping` — latencia
- `/menu` `/help` `/start` — menu en espanol

### NSFW
- `/danbooru` `/gelbooru` — tag (Alyacore + key fallback)
- `/r3l` — tag (rule34.xxx)

## Env

Ver `.env.example`: `TELEGRAM_BOT_TOKEN`, `ALYACORE_API_URL`, `ALYACORE_API_KEY` (fallback `LUFF-FIX67`).

## Termux / sharp

Guia general: [TERMUX.md](TERMUX.md)

Para stickers en Termux, si el binario nativo de `sharp` falla:

    npm install sharp
    # Si falla la build nativa:
    npm install @img/sharp-wasm32

OF fuerza wasm:

    npm install --cpu=wasm32 sharp

Tambien necesitas `ffmpeg` para la compresion >50MB.

## Estructura

    src/
      api.js            # descarga PassThrough + Alyacore helpers
      index.js           # bot Grammy + comandos legacy YT/XV
      commands/
        stickers.js
        downloads.js     # tiktok ig fb spotify mf
        info.js          # ping menu help
        translate.js
        nsfw.js

`downloadToFile` **siempre** prefiere `body.pipe` (fix Termux PassThrough / `Readable.fromWeb`).

---

## Estado guardado (v1.4.1)

Incluye en main:

- NSFW completo: danbooru, gelbooru, r34, xvideos, xnxx, interacciones (cum, anal, fuck, etc.)
- Stickers, TikTok, IG, FB, Spotify, MediaFire, YouTube
- Descarga a disco hasta ~2GB; envio cloud ~50MB con compresion
- Sigue redirects HTTP 302 en descargas
- Limpieza de links YouTube (?si=) y fallback yt-dlp
- NSFW_ENABLED (default true)

Bot: https://t.me/LuffyYampiBot
WhatsApp hermano: https://github.com/BerNardo77-bot/Luffy7
