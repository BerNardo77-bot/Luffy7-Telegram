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
  tmpPath,
  safeUnlink,
  mb,
  MAX_DOWNLOAD
} from './api.js'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  console.error('Falta TELEGRAM_BOT_TOKEN en .env')
  process.exit(1)
}

// Cloud Bot API = 50MB. Con Bot API local (TELEGRAM_API_ROOT) Telegram permite hasta 2GB.
const useLocalApi = Boolean(process.env.TELEGRAM_API_ROOT)
const MAX_SEND = Number(
  process.env.MAX_SEND_BYTES || (useLocalApi ? 1900 * 1024 * 1024 : 49 * 1024 * 1024)
)

const botOpts = useLocalApi
  ? { client: { apiRoot: process.env.TELEGRAM_API_ROOT.replace(/\/$/, '') } }
  : undefined

const bot = new Bot(token, botOpts)

const helpText = `Luffy7 Telegram

Descargas hasta ~2GB a disco.
Envío: hasta ~50MB (Telegram cloud) o hasta ~2GB si usas Bot API local.

Comandos:
/play /mp3 — audio YouTube
/ytvideo /mp4 — video YouTube
/xvideos — video XVideos (nombre o URL)
/help — ayuda

Ejemplos:
/play never gonna give you up
/ytvideo https://youtu.be/dQw4w9WgXcQ
/xvideos https://www.xvideos.com/video....`

bot.command(['start', 'help'], async (ctx) => {
  await ctx.reply(helpText)
})

async function sendBigFile(ctx, filePath, { kind, fileName, caption }) {
  const size = fs.statSync(filePath).size
  if (size > MAX_SEND) {
    return {
      tooBig: true,
      size,
      msg:
        `Archivo listo en el bot: ${mb(size)} MB.\n` +
        `Telegram cloud solo envía ~50 MB (tope actual del bot: ${mb(MAX_SEND)} MB).\n` +
        `Para mandar hasta 2GB hace falta Bot API local (TELEGRAM_API_ROOT).\n` +
        (caption ? `Info: ${caption}` : '')
    }
  }
  const input = new InputFile(filePath, fileName)
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
  return { tooBig: false, size }
}

async function handlePlay(ctx) {
  const q =
    (ctx.match || '').toString().trim() ||
    (ctx.message?.text || '').split(/\s+/).slice(1).join(' ').trim()
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
    const sent = await sendBigFile(ctx, out, {
      kind: 'audio',
      fileName: name,
      caption: got.title || video.title
    })
    if (sent.tooBig) {
      await ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        sent.msg + `\n\nEnlace directo:\n${got.dl}`
      )
    } else {
      await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {})
    }
  } catch (e) {
    console.error(e)
    await ctx.api
      .editMessageText(ctx.chat.id, status.message_id, 'Error: ' + e.message)
      .catch(() => ctx.reply(String(e.message)))
  } finally {
    safeUnlink(out)
  }
}

async function handleVideo(ctx) {
  const q =
    (ctx.match || '').toString().trim() ||
    (ctx.message?.text || '').split(/\s+/).slice(1).join(' ').trim()
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
    const got = await getVideoLink(video.url, video.title)
    if (got.error || !got.dl) {
      return ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        'No pude bajar el video.\n' + (got.error || '')
      )
    }
    await ctx.api.editMessageText(
      ctx.chat.id,
      status.message_id,
      `Descargando a disco (tope ${mb(MAX_DOWNLOAD)} MB)...`
    )
    const size = await downloadToFile(got.dl, out, { timeout: 1_800_000 })
    const fd = fs.openSync(out, 'r')
    const head = Buffer.alloc(8)
    fs.readSync(fd, head, 0, 8, 0)
    fs.closeSync(fd)
    if (head.slice(4, 8).toString() !== 'ftyp') {
      return ctx.api.editMessageText(ctx.chat.id, status.message_id, 'La API no devolvio un MP4 valido.')
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
    const sent = await sendBigFile(ctx, out, {
      kind: 'video',
      fileName: name,
      caption: got.title || video.title
    })
    if (sent.tooBig) {
      await ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        sent.msg + `\n\nEnlace directo:\n${got.dl}`
      )
    } else {
      await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {})
    }
  } catch (e) {
    console.error(e)
    await ctx.api
      .editMessageText(ctx.chat.id, status.message_id, 'Error: ' + e.message)
      .catch(() => ctx.reply(String(e.message)))
  } finally {
    safeUnlink(out)
  }
}

async function handleXvideos(ctx) {
  const q =
    (ctx.match || '').toString().trim() ||
    (ctx.message?.text || '').split(/\s+/).slice(1).join(' ').trim()
  if (!q) return ctx.reply('Uso: /xvideos nombre o URL de XVideos')
  const status = await ctx.reply('Buscando en XVideos...')
  const out = tmpPath(`${Date.now()}-xvideos.mp4`)
  try {
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
        `*${title}*\n${pick.duration || ''}\n${videoUrl}`.replace(/\*/g, '')
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

    let usedLink = null
    let lastErr = ''
    for (const c of got.candidates) {
      try {
        await ctx.api.editMessageText(
          ctx.chat.id,
          status.message_id,
          `Bajando calidad ${c.quality} (hasta ${mb(MAX_DOWNLOAD)} MB a disco)...`
        )
        await downloadToFile(c.url, out, {
          timeout: 1_800_000,
          headers: { Referer: 'https://www.xvideos.com/' }
        })
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
      `Descargado ${mb(size)} MB. Enviando...`
    )

    const sent = await sendBigFile(ctx, out, {
      kind: 'video',
      fileName: 'xvideos.mp4',
      caption: title
    })
    if (sent.tooBig) {
      await ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        sent.msg + `\n\nEnlace directo:\n${usedLink}`
      )
    } else {
      await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {})
    }
  } catch (e) {
    console.error(e)
    await ctx.api
      .editMessageText(ctx.chat.id, status.message_id, 'Error: ' + e.message)
      .catch(() => ctx.reply(String(e.message)))
  } finally {
    safeUnlink(out)
  }
}

bot.command(['play', 'mp3'], handlePlay)
bot.command(['ytvideo', 'mp4', 'playvideo'], handleVideo)
bot.command(['xvideos', 'xv'], handleXvideos)
bot.catch((err) => console.error('Bot error', err))
bot.start()
console.log(
  'Luffy7 Telegram online | download<=',
  mb(MAX_DOWNLOAD),
  'MB | send<=',
  mb(MAX_SEND),
  'MB | localApi=',
  useLocalApi
)
