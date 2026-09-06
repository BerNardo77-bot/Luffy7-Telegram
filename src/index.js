import 'dotenv/config'
import { Bot, InputFile } from 'grammy'
import { resolveYoutube, getAudioLink, getVideoLink, downloadBuffer } from './api.js'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  console.error('Falta TELEGRAM_BOT_TOKEN en .env')
  process.exit(1)
}

const bot = new Bot(token)
const MAX_SEND = 49 * 1024 * 1024

const helpText = `Luffy7 Telegram

Comandos:
/play o /mp3 — audio de YouTube (link o nombre)
/ytvideo o /mp4 — video de YouTube (link o nombre)
/help — esta ayuda

Ejemplos:
/play never gonna give you up
/ytvideo https://youtu.be/dQw4w9WgXcQ

WhatsApp: github.com/BerNardo77-bot/Luffy7`

bot.command(['start', 'help'], async (ctx) => {
  await ctx.reply(helpText)
})

async function handlePlay(ctx) {
  const q = (ctx.match || '').toString().trim() || (ctx.message?.text || '').split(/\s+/).slice(1).join(' ').trim()
  if (!q) return ctx.reply('Uso: /play nombre o link de YouTube')
  const status = await ctx.reply('Buscando audio...')
  try {
    const video = await resolveYoutube(q)
    if (!video) return ctx.api.editMessageText(ctx.chat.id, status.message_id, 'No encontre el video.')
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Audio: ' + video.title + '\nObteniendo enlace...')
    const got = await getAudioLink(video.url, video.title)
    if (got.error || !got.dl) {
      return ctx.api.editMessageText(ctx.chat.id, status.message_id, 'No pude bajar el audio.\n' + (got.error || ''))
    }
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Descargando audio...')
    const buf = await downloadBuffer(got.dl)
    if (!buf?.length || buf.length < 50 * 1024) {
      return ctx.api.editMessageText(ctx.chat.id, status.message_id, 'El audio vino incompleto.')
    }
    if (buf.length > MAX_SEND) {
      return ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Audio demasiado grande para Telegram.')
    }
    await ctx.replyWithAudio(new InputFile(buf, ((got.title || video.title).slice(0, 40)) + '.mp3'), {
      title: got.title || video.title
    })
    await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {})
  } catch (e) {
    console.error(e)
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Error: ' + e.message).catch(() => ctx.reply(String(e.message)))
  }
}

async function handleVideo(ctx) {
  const q = (ctx.match || '').toString().trim() || (ctx.message?.text || '').split(/\s+/).slice(1).join(' ').trim()
  if (!q) return ctx.reply('Uso: /ytvideo nombre o link de YouTube')
  const status = await ctx.reply('Buscando video...')
  try {
    const video = await resolveYoutube(q)
    if (!video) return ctx.api.editMessageText(ctx.chat.id, status.message_id, 'No encontre el video.')
    const expected = Number(video.seconds) || 0
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Video: ' + video.title + '\nObteniendo enlace...')
    const got = await getVideoLink(video.url, video.title)
    if (got.error || !got.dl) {
      return ctx.api.editMessageText(ctx.chat.id, status.message_id, 'No pude bajar el video.\n' + (got.error || ''))
    }
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Descargando video...')
    const buf = await downloadBuffer(got.dl, 300000)
    if (!buf?.length || buf.slice(4, 8).toString() !== 'ftyp') {
      return ctx.api.editMessageText(ctx.chat.id, status.message_id, 'La API no devolvio un MP4 valido.')
    }
    if (expected >= 600 && buf.length < 5 * 1024 * 1024) {
      return ctx.api.editMessageText(ctx.chat.id, status.message_id, 'No envie el archivo: parece un clip incompleto (' + (buf.length / 1024 / 1024).toFixed(1) + ' MB).')
    }
    if (buf.length > MAX_SEND) {
      return ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Pesa ' + (buf.length / 1024 / 1024).toFixed(1) + ' MB; Telegram max ~50 MB. Usa /play.')
    }
    const name = ((got.title || video.title).replace(/[^\w\s.-]/g, '').slice(0, 40) || 'video') + '.mp4'
    try {
      await ctx.replyWithVideo(new InputFile(buf, name), { caption: got.title || video.title })
    } catch {
      await ctx.replyWithDocument(new InputFile(buf, name), { caption: got.title || video.title })
    }
    await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {})
  } catch (e) {
    console.error(e)
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Error: ' + e.message).catch(() => ctx.reply(String(e.message)))
  }
}

bot.command(['play', 'mp3'], handlePlay)
bot.command(['ytvideo', 'mp4', 'playvideo'], handleVideo)
bot.catch((err) => console.error('Bot error', err))
bot.start()
console.log('Luffy7 Telegram online')
