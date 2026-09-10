# Luffy7 Telegram

## v1.5.15
- /apk: mensaje formateado (no JSON crudo); si pesa >45 MB solo manda el link


## v1.5.14
- SEARCH al nivel WhatsApp: /ytsearch (Alyacore), /ttsearch, /wiki, /pin, /imagen (+Pinterest fallback), /apk, /ams (iTunes)


Version **1.5.13** — fix /nano (router forzado + fallback Pollinations). — IA completa como WhatsApp: /ia /gemini /deepseek /grok /nano.

Version **1.5.11** — todas las descargas en alta calidad (YouTube, TikTok, IG, FB, XVideos, XNXX). Si pesan >50MB, comprimen para Telegram.

Version **1.5.9** — bot respondiendo: /ping /menu; polling estable.

Version **1.5.5** — /xvideos y /xv a 720p.

Version **1.5.3** — /ytvideohd alta calidad.

Version **1.5.1** — /traducir sin api.delirius.store. Acepta es o espanol.

Version **1.5.0** — comandos de WhatsApp Luffy7 en Telegram: economia, gacha, perfil, busqueda, anime, admin de grupo. Economia y gacha van activos. Los de sesion WhatsApp (QR, eval, packs) responden que no aplican.

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

---

## Estado guardado (v1.4.3)

En main:

- Import de errText corregido (ya no ReferenceError)
- /ytvideo prioriza yt-dlp; fallback Alyacore
- Sigue redirects HTTP 302
- NSFW completo (xnxx + interacciones)
- Stickers, descargas sociales, menu
- Errores con mensaje claro (no Error: undefined)

Bot: https://t.me/LuffyYampiBot

Si el token se filtro en un log: Revoke en BotFather y actualiza TELEGRAM_BOT_TOKEN.

---

## Estado guardado (v1.4.4)

- Busca yt-dlp en PATH, ~/.local/bin y Termux prefix
- Fallback: python -m yt_dlp
- En Termux: pkg install yt-dlp ffmpeg -y
- Resto de v1.4.3 (NSFW, 302, errText, ytvideo)

---

## Estado guardado (v1.4.5)

En `main`, confirmado en Termux:

- Al arrancar borra webhook viejo y escribe `online como @usuario`
- Polling activo de @LuffyYampiBot
- El usuario confirmo que /start y el bot responden
- Si se queda solo en "arrancando..." sin "online", el proceso aun no conecto
