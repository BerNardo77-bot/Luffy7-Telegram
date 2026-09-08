import 'dotenv/config'
import fs from 'fs'
import { Bot, InputFile } from 'grammy'
import {
  resolveYoutube,
  getAudioLink,
  getVideoLink,
  getXvideosDownload,
  searchXvideos,
  downloadToFile,
  downloadYoutubeWithYtDlp,
  compressForTelegram,
  isDirectMediaUrl,
  tmpPath,
  safeUnlink,
  mb,
  MAX_DOWNLOAD,
  argText,
  errText,
  isNsfwEnabled
} from './api.js'
import { handleSticker, handlePhotoCaption } from './commands/stickers.js'
import { handleHelp, handlePing } from './commands/info.js'
import { handleTranslate } from './commands/translate.js'
import { createDownloadHandlers } from './commands/downloads.js'
import {
  handleDanbooru,
  handleGelbooru,
  handleR34,
  handleNsfwInteraction,
  NSFW_INTERACTION_COMMANDS,
  createXnxxHandler
} from './commands/nsfw.js'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  console.error('Falta TELEGRAM_BOT_TOKEN en .env')
  process.exit(1)
}

const useLocalApi = Boolean(process.env.TELEGRAM_API_ROOT)
const MAX_SEND = Number(
  process.env.MAX_SEND_BYTES || (useLocalApi ? 1900 * 1024 * 1024 : 49 * 1024 * 1024)
)

const botOpts = useLocalApi
  ? { client: { apiRoot: process.env.TELEGRAM_API_ROOT.replace(/\/$/, '') } }
  : undefined

const bot = new Bot(token, botOpts)

async function sendOrCompress(ctx, filePath, { kind, fileName, caption, statusId, fallbackLink }) {
  let pathToSend = filePath
  let size = fs.statSync(pathToSend).size
  let compressedPath = null

  if (size > MAX_SEND) {
    if (statusId) {
      await ctx.api
        .editMessageText(
          ctx.chat.id,
          statusId,
          `Pesa ${mb(size)} MB. Telegram cloud max ~50 MB. Comprimiendo...`
        )
        .catch(() => {})
    }
    compressedPath = await compressForTelegram(pathToSend, MAX_SEND)
    if (compressedPath && fs.existsSync(compressedPath)) {
      pathToSend = compressedPath
      size = fs.statSync(pathToSend).size
    }
  }

  if (size > MAX_SEND) {
    const msg =
      `Archivo ${mb(fs.statSync(filePath).size)} MB` +
      (compressedPath ? ` (comprimido ${mb(size)} MB)` : '') +
      `.\nTelegram cloud solo envia ~50 MB.\n` +
      (fallbackLink ? `\nEnlace directo:\n${fallbackLink}` : '')
    if (statusId) {
      await ctx.api.editMessageText(ctx.chat.id, statusId, msg).catch(() => ctx.reply(msg))
    } else {
      await ctx.reply(msg)
    }
    safeUnlink(compressedPath)
    return false
  }

  const input = new InputFile(pathToSend, fileName)
  if (kind === 'audio') {
    await ctx.replyWithAudio(input, { title: caption })
  } else if (kind === 'video') {
    try {
      await ctx.replyWithVideo(input, { caption })
    } catch {
      await ctx.replyWithDocument(input, { caption })
    }
  } else {
    await ctx.replyWithDocument(input, { caption })
  }
  safeUnlink(compressedPath)
  if (statusId) await ctx.api.deleteMessage(ctx.chat.id, statusId).catch(() => {})
  return true
}

async function handlePlay(ctx) {
  const q = argText(ctx)
  if (!q) return ctx.reply('Uso: /play nombre o link de YouTube')
  const status = await ctx.reply('Buscando audio...')
  const out = tmpPath(`${Date.now()}-audio.mp3`)
  try {
    const video = await resolveYoutube(q)
    if (!video) {
      return ctx.api.editMessageText(ctx.chat.id, status.message_id, 'No encontre el video.')
    }
    await ctx.api.editMessageText(
      ctx.chat.id,
      status.message_id,
      'Audio: ' + video.title + '\nObteniendo enlace...'
    )
    const got = await getAudioLink(video.url, video.title)
    if (got.error || !got.dl) {
      return ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        'No pude bajar el audio.\n' + (got.error || '')
      )
    }
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Descargando audio a disco...')
    const size = await downloadToFile(got.dl, out)
    if (size < 50 * 1024) {
      return ctx.api.editMessageText(ctx.chat.id, status.message_id, 'El audio vino incompleto.')
    }
    const name = ((got.title || video.title).slice(0, 40) || 'audio') + '.mp3'
    await sendOrCompress(ctx, out, {
      kind: 'audio',
      fileName: name,
      caption: got.title || video.title,
      statusId: status.message_id,
      fallbackLink: got.dl
    })
  } catch (e) {
    console.error(e)
    await ctx.api
      .editMessageText(ctx.chat.id, status.message_id, 'Error: ' + errText(e))
      .catch(() => ctx.reply(errText(e)))
  } finally {
    safeUnlink(out)
  }
}

async function handleVideo(ctx) {
  const q = argText(ctx)
  if (!q) return ctx.reply('Uso: /ytvideo nombre o link de YouTube')
  const status = await ctx.reply('Buscando video...')
  const out = tmpPath(`${Date.now()}-video.mp4`)
  try {
    const video = await resolveYoutube(q)
    if (!video) {
      return ctx.api.editMessageText(ctx.chat.id, status.message_id, 'No encontre el video.')
    }
    const expected = Number(video.seconds) || 0
    await ctx.api.editMessageText(
      ctx.chat.id,
      status.message_id,
      'Video: ' + video.title + '\nObteniendo enlace...'
    )
    // 1) yt-dlp primero (mas fiable que URLs Alyacore que dan 302)
    let usedLink = video.url
    let got = { title: video.title }
    let usedYtdlp = false
    try {
      await ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        'Bajando con yt-dlp (puede tardar)...'
      )
      await downloadYoutubeWithYtDlp(video.url || q, out)
      usedYtdlp = true
    } catch (yterr) {
      console.error('[ytvideo] yt-dlp', yterr)
      await ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        'yt-dlp fallo. Probando API Alyacore...'
      ).catch(() => {})
      got = await getVideoLink(video.url, video.title)
      if (got.error || !got.dl) {
        return ctx.api.editMessageText(
          ctx.chat.id,
          status.message_id,
          'No pude bajar el video.\n' +
            errText(yterr) +
            '\n' +
            (got.error || 'API sin link') +
            '\n\nTip Termux:\npkg install python\npip install -U yt-dlp\n\nLink limpio:\n/ytvideo https://youtu.be/' +
            (String(video.videoId || ''))
        )
      }
      usedLink = got.dl
      await ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        `Descargando API (tope ${mb(MAX_DOWNLOAD)} MB)...`
      )
      try {
        await downloadToFile(got.dl, out, { timeout: 1_800_000 })
      } catch (e) {
        return ctx.api.editMessageText(
          ctx.chat.id,
          status.message_id,
          'Descarga fallo (¿302?).\n' + errText(e) + '\nInstala/actualiza yt-dlp.'
        )
      }
    }
    const size = fs.statSync(out).size
    const fd = fs.openSync(out, 'r')
    const head = Buffer.alloc(8)
    fs.readSync(fd, head, 0, 8, 0)
    fs.closeSync(fd)
    const brand = head.slice(4, 8).toString()
    if (brand !== 'ftyp' && !usedYtdlp) {
      return ctx.api.editMessageText(ctx.chat.id, status.message_id, 'La API no devolvio un MP4 valido.')
    }
    if (brand !== 'ftyp' && usedYtdlp) {
      try {
        const remuxed = out.replace(/\.mp4$/i, '') + '-remux.mp4'
        const { execFile } = await import('child_process')
        const { promisify } = await import('util')
        const execFileAsync = promisify(execFile)
        await execFileAsync(
          'ffmpeg',
          ['-y', '-i', out, '-c', 'copy', '-movflags', '+faststart', remuxed],
          { timeout: 300000 }
        )
        if (fs.existsSync(remuxed) && fs.statSync(remuxed).size) {
          fs.renameSync(remuxed, out)
        }
      } catch (re) {
        console.error('[ytvideo] remux', re)
      }
    }
    if (expected >= 600 && size < 5 * 1024 * 1024) {
      return ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        `No envie el archivo: parece un clip incompleto (${mb(size)} MB).`
      )
    }
    const name =
      ((got.title || video.title).replace(/[^\w\s.-]/g, '').slice(0, 40) || 'video') + '.mp4'
    await sendOrCompress(ctx, out, {
      kind: 'video',
      fileName: name,
      caption: got.title || video.title,
      statusId: status.message_id,
      fallbackLink: usedLink || video.url
    })
  } catch (e) {
    console.error(e)
    await ctx.api
      .editMessageText(ctx.chat.id, status.message_id, 'Error: ' + errText(e))
      .catch(() => ctx.reply(errText(e)))
  } finally {
    safeUnlink(out)
  }
}

async function downloadAndSendMedia(ctx, mediaUrl, { title = 'video', status }) {
  const out = tmpPath(`${Date.now()}-media.mp4`)
  try {
    await ctx.api.editMessageText(
      ctx.chat.id,
      status.message_id,
      `Bajando a disco (tope ${mb(MAX_DOWNLOAD)} MB)...`
    )
    const size = await downloadToFile(mediaUrl, out, { timeout: 1_800_000 })
    await ctx.api.editMessageText(
      ctx.chat.id,
      status.message_id,
      `Descargado ${mb(size)} MB. Preparando envio...`
    )
    await sendOrCompress(ctx, out, {
      kind: 'video',
      fileName: 'video.mp4',
      caption: title,
      statusId: status.message_id,
      fallbackLink: mediaUrl
    })
  } finally {
    safeUnlink(out)
  }
}

async function handleXvideos(ctx) {
  if (!isNsfwEnabled()) return ctx.reply('🔞 NSFW desactivado (NSFW_ENABLED=false).')
  const q = argText(ctx)
  if (!q) return ctx.reply('Uso: /xvideos nombre, URL de XVideos, o link .mp4 CDN')
  const status = await ctx.reply('Procesando XVideos...')

  try {
    if (isDirectMediaUrl(q)) {
      await downloadAndSendMedia(ctx, q, { title: 'xvideos', status })
      return
    }

    let videoUrl = q
    let title = 'xvideos'

    if (!(q.startsWith('http') && q.includes('xvideos.com'))) {
      const found = await searchXvideos(q)
      if (found.error || !found.results?.length) {
        return ctx.api.editMessageText(
          ctx.chat.id,
          status.message_id,
          'No se encontro el video.\n' + (found.error || '')
        )
      }
      const pick = found.results[Math.floor(Math.random() * found.results.length)]
      videoUrl = pick.url
      title = pick.title || title
      await ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        `${title}\n${pick.duration || ''}\n${videoUrl}`
      )
    }

    await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Obteniendo enlace de descarga...')
    const got = await getXvideosDownload(videoUrl)
    if (got.error || !got.candidates?.length) {
      return ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        'No se pudo obtener el video.\n' + (got.error || '')
      )
    }

    const out = tmpPath(`${Date.now()}-xvideos.mp4`)
    let usedLink = null
    let lastErr = ''
    try {
      for (const c of got.candidates) {
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            status.message_id,
            `Bajando calidad ${c.quality}...`
          )
          await downloadToFile(c.url, out, { timeout: 1_800_000 })
          usedLink = c.url
          break
        } catch (e) {
          lastErr = e.message || String(e)
          safeUnlink(out)
          console.error('[xvideos]', c.quality, lastErr)
        }
      }

      if (!usedLink || !fs.existsSync(out)) {
        return ctx.api.editMessageText(
          ctx.chat.id,
          status.message_id,
          'Fallo la descarga.\n' + lastErr
        )
      }

      const size = fs.statSync(out).size
      await ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        `Descargado ${mb(size)} MB. Preparando envio...`
      )

      await sendOrCompress(ctx, out, {
        kind: 'video',
        fileName: 'xvideos.mp4',
        caption: title,
        statusId: status.message_id,
        fallbackLink: usedLink
      })
    } finally {
      safeUnlink(out)
    }
  } catch (e) {
    console.error(e)
    await ctx.api
      .editMessageText(ctx.chat.id, status.message_id, 'Error: ' + errText(e))
      .catch(() => ctx.reply(errText(e)))
  }
}

async function handleDl(ctx) {
  const q = argText(ctx)
  if (!q || !/^https?:\/\//i.test(q)) {
    return ctx.reply('Uso: /dl https://....mp4')
  }
  const status = await ctx.reply('Descargando link directo...')
  try {
    await downloadAndSendMedia(ctx, q, { title: 'archivo', status })
  } catch (e) {
    console.error(e)
    await ctx.api
      .editMessageText(ctx.chat.id, status.message_id, 'Error: ' + errText(e))
      .catch(() => ctx.reply(errText(e)))
  }
}

const {
  handleTiktok,
  handleTiktokMp3,
  handleInstagram,
  handleFacebook,
  handleSpotify,
  handleMediafire
} = createDownloadHandlers(sendOrCompress)

const handleXnxx = createXnxxHandler(sendOrCompress)

bot.command(['start', 'help', 'menu'], handleHelp)
bot.command(['ping', 'p'], handlePing)
bot.command(['traducir', 'translate'], handleTranslate)
bot.command(['sticker', 's'], handleSticker)
bot.on('message:photo', handlePhotoCaption)

bot.command(['play', 'mp3'], handlePlay)
bot.command(['ytvideo', 'mp4', 'playvideo'], handleVideo)
bot.command(['xvideos', 'xv'], handleXvideos)
bot.command(['dl', 'get'], handleDl)

bot.command(['tiktok', 'tt'], handleTiktok)
bot.command(['tiktokmp3', 'ttmp3', 'ttaudio', 'tiktokaudio'], handleTiktokMp3)
bot.command(['ig', 'instagram', 'reel'], handleInstagram)
bot.command(['fb', 'facebook'], handleFacebook)
bot.command(['spotify', 'sp'], handleSpotify)
bot.command(['mediafire', 'mf'], handleMediafire)

bot.command(['danbooru', 'dbooru'], handleDanbooru)
bot.command(['gelbooru', 'gbooru'], handleGelbooru)
bot.command(['r34', 'rule34', 'rule'], handleR34)
bot.command(['xnxx'], handleXnxx)
bot.command(NSFW_INTERACTION_COMMANDS, handleNsfwInteraction)

bot.catch((err) => console.error('Bot error', err))

console.log('Luffy7 Telegram v1.4.5 arrancando...')

async function goOnline() {
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: false })
  } catch (e) {
    console.error('No se pudo borrar webhook:', e?.description || e?.message || e)
  }
  const me = await bot.api.getMe()
  console.log('Luffy7 Telegram online como @' + me.username)
  console.log(
    'download<=',
    mb(MAX_DOWNLOAD),
    'MB | send<=',
    mb(MAX_SEND),
    'MB | localApi=',
    useLocalApi
  )
  console.log('Comandos: /menu /sticker /play /tiktok /ig /fb /spotify ...')
  console.log('Si mandas /start y no responde, otro proceso usa el mismo token.')
  await bot.start({
    onStart: (info) => console.log('Polling activo:', info.username)
  })
}

goOnline().catch((e) => {
  const code = e?.error_code || e?.error?.error_code
  console.error('No arranco el bot:', e?.description || e?.message || e)
  if (code === 409) {
    console.error('409: otro Termux o Railway ya esta usando este token. Cerra ese y reintenta.')
  }
  process.exit(1)
})
