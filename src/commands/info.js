const startedAt = Date.now()

function uptimeStr() {
  const ms = Date.now() - startedAt
  const h = Math.floor(ms / 3600000)
  const m = Math.floor(ms / 60000) % 60
  const s = Math.floor(ms / 1000) % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

export const helpText = `⚓ Luffy7 Telegram v1.5.9

Descargas a disco hasta ~2GB.
Si pesa >50MB, comprime (ffmpeg ultrafast 360p) y lo envía.

📥 Descargas
/play /mp3 — audio YouTube
/ytvideo /mp4 — video YouTube (cabe en Telegram)
/ytvideohd /mp4hd — video YouTube en alta calidad (1080p)
/tiktok /tt — TikTok video
/tiktokmp3 /ttmp3 — TikTok audio
/ig /instagram — Instagram
/fb /facebook — Facebook
/spotify /sp — Spotify
/mediafire /mf — MediaFire
/dl /get — link directo .mp4/.mp3
/xvideos /xv — XVideos a 720p

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


🎮 Economia (on por defecto)
/daily /bal /work /crime /fish /hunt /mine /steal /pay
/dep /withdraw /flip /slot /rt /ppt /math /eboard /einfo

🃏 Gacha
/rw /claim /harem /winfo /sell /givechar /slist

👤 Perfil
/perfil /level /setdesc /setgenre /sethobby /marry /divorce

🔍 Busqueda
/ia /wiki /imagen /pin /ytsearch /ttsearch /apk /ams

🎭 Anime
/hug /kiss /pat /slap /dance /cry y alias (/abrazo no, usa /hug /beso /morder)

👥 Grupo (bot admin)
/kick /promote /demote /warn /link /gp /open /closet
/rpg /gacha /welcome enable|disable

Uptime: ${'{uptime}'}
`

export async function handleHelp(ctx) {
  try {
    await ctx.reply(helpText.replace('{uptime}', uptimeStr()))
  } catch (e) {
    console.error('[menu]', e)
    await ctx.reply('Menu listo. Prueba /ping. Si no responde, cierra otros procesos del bot.').catch(() => {})
  }
}

export async function handlePing(ctx) {
  console.log('[ping] enter')
  const start = Date.now()
  try {
    const sent = await ctx.reply('Pong...')
    const latency = Date.now() - start
    console.log('[ping] replied', latency, 'ms')
    await ctx.api
      .editMessageText(
        ctx.chat.id,
        sent.message_id,
        `Pong!\nTiempo: ${latency}ms\nUptime: ${uptimeStr()}`
      )
      .catch(() => {})
  } catch (e) {
    console.error('[ping] fail', e)
    try { await ctx.reply('Pong') } catch (e2) { console.error('[ping] fail2', e2) }
  }
}
