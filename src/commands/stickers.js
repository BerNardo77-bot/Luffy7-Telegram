import fs from 'fs'
import sharp from 'sharp'
import { InputFile } from 'grammy'
import { downloadBuffer, tmpPath, safeUnlink } from '../api.js'

const STICKER_SIZE = 512

async function imageToWebpSticker(inputBuffer) {
  return sharp(inputBuffer)
    .rotate()
    .resize(STICKER_SIZE, STICKER_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .webp({ quality: 90 })
    .toBuffer()
}

async function getPhotoFileId(ctx) {
  // Reply to a photo
  const reply = ctx.message?.reply_to_message
  if (reply?.photo?.length) {
    return reply.photo[reply.photo.length - 1].file_id
  }
  // Photo with caption /sticker
  if (ctx.message?.photo?.length) {
    return ctx.message.photo[ctx.message.photo.length - 1].file_id
  }
  return null
}

export async function handleSticker(ctx) {
  const fileId = await getPhotoFileId(ctx)
  if (!fileId) {
    return ctx.reply(
      'Uso: responde a una foto con /sticker, o envía una foto con caption /sticker'
    )
  }

  const status = await ctx.reply('Creando sticker...')
  const out = tmpPath(`${Date.now()}-sticker.webp`)
  try {
    const file = await ctx.api.getFile(fileId)
    if (!file.file_path) throw new Error('No se pudo obtener la foto')

    const root = (process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org').replace(/\/$/, '')
    const token = process.env.TELEGRAM_BOT_TOKEN
    // Local Bot API uses /file/<token>/... or custom; cloud uses /file/bot<token>/
    let fileUrl
    if (process.env.TELEGRAM_API_ROOT) {
      fileUrl = `${root}/file/bot${token}/${file.file_path}`
    } else {
      fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`
    }

    const buf = await downloadBuffer(fileUrl, 120000)
    const webp = await imageToWebpSticker(buf)
    fs.writeFileSync(out, webp)
    await ctx.replyWithSticker(new InputFile(out, 'sticker.webp'))
    await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {})
  } catch (e) {
    console.error('[sticker]', e)
    await ctx.api
      .editMessageText(ctx.chat.id, status.message_id, 'Error sticker: ' + (e.message || e))
      .catch(() => ctx.reply(String(e.message || e)))
  } finally {
    safeUnlink(out)
  }
}

/** Solo procesa fotos cuyo caption empiece con /sticker */
export async function handlePhotoCaption(ctx, next) {
  const caption = (ctx.message?.caption || '').trim()
  if (!caption.toLowerCase().startsWith('/sticker') && !caption.toLowerCase().startsWith('/s ')) {
    return next()
  }
  // /s solo como comando completo
  const cmd = caption.split(/\s+/)[0].toLowerCase().replace(/@\w+$/, '')
  if (cmd !== '/sticker' && cmd !== '/s') return next()
  return handleSticker(ctx)
}
