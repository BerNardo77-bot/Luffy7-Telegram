const startedAt = Date.now()

function uptimeStr() {
  const ms = Date.now() - startedAt
  const h = Math.floor(ms / 3600000)
  const m = Math.floor(ms / 60000) % 60
  const s = Math.floor(ms / 1000) % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

export const helpText = `⚓ Luffy7 Telegram v1.4

Descargas a disco hasta ~2GB.
Si pesa >50MB, comprime (ffmpeg ultrafast 360p) y lo envía.

📥 Descargas
/play /mp3 — audio YouTube
/ytvideo /mp4 — video YouTube
/tiktok /tt — TikTok video
/tiktokmp3 /ttmp3 — TikTok audio
/ig /instagram — Instagram
/fb /facebook — Facebook
/spotify /sp — Spotify
/mediafire /mf — MediaFire
/dl /get — link directo .mp4/.mp3
/xvideos /xv — XVideos

🎨 Stickers
/sticker /s — responde a una foto, o envía foto con caption /sticker

🔍 Utilidades
/traducir /translate — idioma + texto (ej: /traducir en Hola)
/ping — latencia
/menu /help /start — este menú

🔞 NSFW
/danbooru /dbooru — tag
/gelbooru /gbooru — tag
/r34 /rule34 /rule — tag
/xnxx — XNXX search o URL
/anal /violar — interaction
/cum /eyacular — interaction
/undress /encuerar — interaction
/fuck /coger — interaction
/spank /nalgada — interaction
/lickpussy /lameruncoño — interaction
/fap /paja — interaction
/grope — interaction
/sixnine /69 — interaction
/suckboobs /chupartetas — interaction
/grabboobs — interaction
/blowjob /mamar /bj — interaction
/boobjob /rusa — interaction
/yuri /tijeras — interaction
/footjob — interaction
/cummouth — interaction
/cumshot — interaction
/handjob — interaction
/lickass /lamercullo — interaction
/lickdick /lamerpolla — interaction
(responde a un mensaje para apuntar a alguien)

Uptime: ${'{uptime}'}
`

export async function handleHelp(ctx) {
  await ctx.reply(helpText.replace('{uptime}', uptimeStr()))
}

export async function handlePing(ctx) {
  const start = Date.now()
  const sent = await ctx.reply('❏ Pong...')
  const latency = Date.now() - start
  await ctx.api
    .editMessageText(
      ctx.chat.id,
      sent.message_id,
      `✿ Pong!\n> Tiempo ⴵ ${latency}ms\n> Uptime ${uptimeStr()}`
    )
    .catch(() => {})
}
