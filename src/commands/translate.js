import { translateText, argText } from '../api.js'

export async function handleTranslate(ctx) {
  const raw = argText(ctx)
  if (!raw) {
    return ctx.reply(
      'Uso: /traducir <idioma> <texto>\nEjemplo: /traducir en Hola mundo\nIdioma por defecto: es (si solo mandas texto con reply, usa es).'
    )
  }

  const parts = raw.split(/\s+/)
  // /traducir en Hello world  OR  /traducir Hello (default es)
  let language = 'es'
  let text = raw
  if (parts.length >= 2 && /^[a-z]{2}(-[a-z]{2})?$/i.test(parts[0])) {
    language = parts[0].toLowerCase()
    text = parts.slice(1).join(' ')
  }

  // Si respondió a un mensaje y no hay texto extra, traducir el reply
  if ((!text || text === language) && ctx.message?.reply_to_message?.text) {
    text = ctx.message.reply_to_message.text
    if (parts.length === 1 && /^[a-z]{2}/i.test(parts[0])) language = parts[0].toLowerCase()
  }

  if (!text?.trim()) return ctx.reply('Falta el texto a traducir.')

  const status = await ctx.reply('Traduciendo...')
  try {
    const got = await translateText(text.trim(), language)
    if (got.error || !got.text) {
      return ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        'No se pudo traducir.\n' + (got.error || '')
      )
    }
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, got.text)
  } catch (e) {
    console.error('[translate]', e)
    await ctx.api
      .editMessageText(ctx.chat.id, status.message_id, 'Error: ' + e.message)
      .catch(() => {})
  }
}
