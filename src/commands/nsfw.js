import { InputFile } from 'grammy'
import {
  argText,
  getBooruImageUrl,
  getRule34Image,
  downloadToFile,
  tmpPath,
  safeUnlink
} from '../api.js'

async function sendBooru(ctx, kind) {
  const tag = argText(ctx)
  if (!tag) return ctx.reply(`Uso: /${kind} <tag>`)
  const status = await ctx.reply(`Buscando ${kind}: ${tag}...`)
  const out = tmpPath(`${Date.now()}-${kind}.jpg`)
  try {
    const got = await getBooruImageUrl(kind, tag)
    if (got.error || !got.url) {
      return ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        'Sin resultado.\n' + (got.error || '')
      )
    }
    await downloadToFile(got.url, out, { timeout: 120000 })
    await ctx.replyWithPhoto(new InputFile(out), { caption: `${kind}: ${tag}` })
    await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {})
  } catch (e) {
    console.error(`[${kind}]`, e)
    await ctx.api
      .editMessageText(ctx.chat.id, status.message_id, 'Error: ' + e.message)
      .catch(() => ctx.reply(String(e.message)))
  } finally {
    safeUnlink(out)
  }
}

export async function handleDanbooru(ctx) {
  return sendBooru(ctx, 'danbooru')
}

export async function handleGelbooru(ctx) {
  return sendBooru(ctx, 'gelbooru')
}

export async function handleR34(ctx) {
  const tag = argText(ctx)
  if (!tag) return ctx.reply('Uso: /r34 <tag>')
  const status = await ctx.reply(`Buscando rule34: ${tag}...`)
  const out = tmpPath(`${Date.now()}-r34.jpg`)
  try {
    const got = await getRule34Image(tag)
    if (got.error || !got.url) {
      return ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        got.error || 'Sin resultado'
      )
    }
    await downloadToFile(got.url, out, { timeout: 120000 })
    await ctx.replyWithPhoto(new InputFile(out), { caption: `r34: ${tag}` })
    await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {})
  } catch (e) {
    console.error('[r34]', e)
    await ctx.api
      .editMessageText(ctx.chat.id, status.message_id, 'Error: ' + e.message)
      .catch(() => ctx.reply(String(e.message)))
  } finally {
    safeUnlink(out)
  }
}
