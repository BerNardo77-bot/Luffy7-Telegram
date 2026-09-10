import fetch from 'node-fetch'
import { InputFile } from 'grammy'
import { argText, getConfig, errText, isNsfwEnabled } from '../api.js'
import { chatOf } from '../store.js'

const FALLBACK_KEY = 'LUFFY-FIX67'

function text(ctx) {
  return argText(ctx)
}

function apiKeys() {
  const { apiKey } = getConfig()
  let key = (apiKey || '').trim()
  if (!key || key === 'TU-API-KEY' || key === 'undefined') key = FALLBACK_KEY
  const keys = [key]
  if (key !== FALLBACK_KEY) keys.push(FALLBACK_KEY)
  return keys
}

function apiBase() {
  return getConfig().apiUrl
}

export async function handleWiki(ctx) {
  const q = text(ctx)
  if (!q) return ctx.reply('Uso: /wiki <tema>\nEjemplo: /wiki Anubis')
  const status = await ctx.reply('Buscando en Wikipedia...')
  try {
    const searchUrl =
      `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=` +
      `${encodeURIComponent(q)}&format=json&utf8=1`
    const res = await fetch(searchUrl, { headers: { 'User-Agent': 'Luffy7-Telegram' } })
    const json = await res.json().catch(() => ({}))
    const results = json?.query?.search || []
    if (!results.length) {
      return ctx.api.editMessageText(ctx.chat.id, status.message_id, `Sin resultados en Wikipedia para ${q}`)
    }
    let replyText = `Wikipedia\n> ${q}\n\n`
    for (const r of results.slice(0, 5)) {
      const snippet = String(r.snippet || '').replace(/<[^>]+>/g, '')
      replyText += `• ${r.title}\n${snippet}\n\n`
    }
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, replyText.trim().slice(0, 3500))
  } catch (e) {
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Error: ' + errText(e)).catch(() => {})
  }
}

export async function handleImagen(ctx) {
  const q = text(ctx)
  if (!q) return ctx.reply('Uso: /imagen <tema>\nEjemplo: /imagen gato')

  const banned = ['xxx', 'porn', 'porno', 'xnxx', 'xvideos', 'onlyfans', 'hentai']
  const chat = chatOf(ctx)
  const nsfwOn = isNsfwEnabled() && (chat?.nsfw === 1 || chat?.nsfw === true || chat?.nsfw === 'enable')
  if (!nsfwOn && banned.some((w) => q.toLowerCase().includes(w))) {
    return ctx.reply('Este comando no permite busquedas NSFW (activa /rpg nsfw o NSFW_ENABLED).')
  }

  const status = await ctx.reply('Buscando imagen...')
  const base = apiBase()
  try {
    for (const key of apiKeys()) {
      try {
        const url = `${base}/search/googleimagen?query=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`
        const res = await fetch(url)
        const ctype = (res.headers.get('content-type') || '').toLowerCase()
        if (res.ok && ctype.includes('image')) {
          const buffer = Buffer.from(await res.arrayBuffer())
          if (buffer.length > 256) {
            await ctx.replyWithPhoto(new InputFile(buffer, 'img.jpg'), { caption: q })
            await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {})
            return
          }
        }
      } catch {}
    }

    for (const key of apiKeys()) {
      try {
        const url = `${base}/search/pinterest?query=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`
        const res = await fetch(url)
        const json = await res.json().catch(() => ({}))
        const item = (json?.data || [])[0]
        const img = item?.hd || item?.url || item?.mini
        if (json?.status && img) {
          await ctx.replyWithPhoto(String(img), { caption: q }).catch(async () => {
            const imgRes = await fetch(img)
            const buf = Buffer.from(await imgRes.arrayBuffer())
            await ctx.replyWithPhoto(new InputFile(buf, 'pin.jpg'), { caption: q })
          })
          await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {})
          return
        }
      } catch {}
    }

    await ctx.api.editMessageText(ctx.chat.id, status.message_id, `No encontre imagen para ${q}`)
  } catch (e) {
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Error: ' + errText(e)).catch(() => {})
  }
}

export async function handlePin(ctx) {
  const q = text(ctx)
  if (!q) return ctx.reply('Uso: /pin <tema> o /pin <link de Pinterest>')

  const base = apiBase()
  const isUrl = /^https?:\/\//i.test(q)
  const status = await ctx.reply(isUrl ? 'Descargando Pinterest...' : 'Buscando en Pinterest...')

  try {
    for (const key of apiKeys()) {
      try {
        if (isUrl) {
          const url = `${base}/dl/pinterest?url=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`
          const res = await fetch(url)
          const json = await res.json().catch(() => ({}))
          const result = json?.data || json?.result
          const dl = result?.dl || result?.url
          if (!dl) continue
          const mediaType = result?.type === 'video' ? 'video' : 'image'
          if (mediaType === 'video') {
            await ctx.replyWithVideo(String(dl)).catch(async () => {
              await ctx.reply(String(dl))
            })
          } else {
            await ctx.replyWithPhoto(String(dl)).catch(async () => {
              const imgRes = await fetch(dl)
              const buf = Buffer.from(await imgRes.arrayBuffer())
              await ctx.replyWithPhoto(new InputFile(buf, 'pin.jpg'))
            })
          }
          await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {})
          return
        }

        const url = `${base}/search/pinterest?query=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`
        const res = await fetch(url)
        const json = await res.json().catch(() => ({}))
        const results = json?.data || []
        if (!json?.status || !results.length) continue

        const top = results.slice(0, 5)
        for (const result of top) {
          const img = result.hd || result.url || result.mini
          if (!img) continue
          const caption =
            `Pinterest` +
            (result.title ? `\nTitulo: ${result.title}` : '') +
            (result.full_name ? `\nAutor: ${result.full_name}` : '') +
            (result.likes != null ? `\nLikes: ${result.likes}` : '')
          try {
            await ctx.replyWithPhoto(String(img), { caption })
          } catch {
            try {
              const imgRes = await fetch(img)
              const buf = Buffer.from(await imgRes.arrayBuffer())
              await ctx.replyWithPhoto(new InputFile(buf, 'pin.jpg'), { caption })
            } catch {}
          }
        }
        await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {})
        return
      } catch (e) {
        console.error('[pin]', e?.message || e)
      }
    }
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, `No encontre resultados para ${q}`)
  } catch (e) {
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Error: ' + errText(e)).catch(() => {})
  }
}

export async function handleYtSearch(ctx) {
  const q = text(ctx)
  if (!q) return ctx.reply('Uso: /ytsearch <texto>\nEjemplo: /ytsearch quien es Anubis')

  const status = await ctx.reply('Buscando en YouTube...')
  const base = apiBase()
  let last = 'Sin resultados'

  try {
    for (const key of apiKeys()) {
      try {
        const url = `${base}/search/yt?query=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`
        const res = await fetch(url)
        const json = await res.json().catch(() => ({}))
        const list = json?.result || json?.data || []
        if (!json?.status || !Array.isArray(list) || !list.length) {
          last = json?.message || last
          continue
        }

        const top = list.slice(0, 8)
        const caption =
          `YouTube Search\n> ${q}\n\n` +
          top
            .map((v, i) => {
              const title = v.title || '?'
              const author = v.autor || v.author || v.channel || ''
              const dur = v.duration || v.timestamp || '?'
              const views = v.views || '?'
              const up = v.uploaded || v.ago || ''
              const link = v.url || ''
              return (
                `${i + 1}. ${title}\n` +
                `Duracion: ${dur}\n` +
                (up ? `Subido: ${up}\n` : '') +
                `Vistas: ${views}\n` +
                (author ? `Autor: ${author}\n` : '') +
                `Url: ${link}`
              )
            })
            .join('\n\n---\n\n')

        const thumb = top[0]?.banner || top[0]?.thumbnail || top[0]?.image
        if (thumb) {
          await ctx.replyWithPhoto(String(thumb), { caption: caption.slice(0, 1024) }).catch(async () => {
            await ctx.reply(caption.slice(0, 3500))
          })
          if (caption.length > 1024) {
            await ctx.reply(caption.slice(1024, 3500)).catch(() => {})
          }
        } else {
          await ctx.reply(caption.slice(0, 3500))
        }
        await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {})
        return
      } catch (e) {
        last = e.message || last
      }
    }
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, `No encontre videos para ${q}.\n${last}`)
  } catch (e) {
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Error: ' + errText(e)).catch(() => {})
  }
}

export async function handleTtSearch(ctx) {
  const q = text(ctx)
  if (!q) return ctx.reply('Uso: /ttsearch <texto>\nEjemplo: /ttsearch baile')

  const status = await ctx.reply('Buscando en TikTok...')
  const base = apiBase()
  let last = 'Sin resultados'

  try {
    for (const key of apiKeys()) {
      try {
        const url = `${base}/search/tiktok?query=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`
        const res = await fetch(url)
        const json = await res.json().catch(() => ({}))
        const list = json?.data || json?.result || []
        if (!json?.status || !Array.isArray(list) || !list.length) {
          last = json?.message || last
          continue
        }

        const top = list.slice(0, 5)
        let message = `TikTok Search\n> ${q}\n\n`
        top.forEach((result, index) => {
          const author = result.author || {}
          const stats = result.stats || {}
          const nick = author.nickname || author.name || '?'
          const uid = author.unique_id || author.uniqueId || author.id || ''
          const id = result.id || ''
          message += `Titulo: ${result.title || '?'}\n`
          message += `Autor: ${nick}${uid ? ` (@${uid})` : ''}\n`
          message += `Views: ${stats.views ?? '?'}\n`
          message += `Likes: ${stats.likes ?? '?'}\n`
          message += `Duracion: ${result.duration ?? '?'}\n`
          if (uid && id) {
            message += `URL: https://www.tiktok.com/@${uid}/video/${id}\n`
          } else if (result.url) {
            message += `URL: ${result.url}\n`
          }
          if (index < top.length - 1) message += `\n---\n\n`
        })
        await ctx.api.editMessageText(ctx.chat.id, status.message_id, message.slice(0, 3500))
        return
      } catch (e) {
        last = e.message || last
      }
    }
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, `No encontre resultados para ${q}.\n${last}`)
  } catch (e) {
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Error: ' + errText(e)).catch(() => {})
  }
}

export async function handleApk(ctx) {
  const q = text(ctx)
  if (!q) return ctx.reply('Uso: /apk <nombre de la app>\nEjemplo: /apk WhatsApp')

  const status = await ctx.reply('Buscando APK...')
  const base = apiBase()
  let last = 'Sin resultados'

  try {
    for (const key of apiKeys()) {
      try {
        const url = `${base}/search/apk?query=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`
        const res = await fetch(url)
        const json = await res.json().catch(() => ({}))
        const data = json?.data
        if (!json?.status || !data?.name || !data?.dl) {
          last = json?.message || last
          continue
        }

        const info =
          `APK\n\n` +
          `Nombre: ${data.name}\n` +
          `Paquete: ${data.package || '?'}\n` +
          `Actualizacion: ${data.lastUpdated || '?'}\n` +
          `Tamano: ${data.size || '?'}\n` +
          `Link: ${data.dl}`

        await ctx.api.editMessageText(ctx.chat.id, status.message_id, info)

        // Telegram cloud ~50MB — manda documento si cabe; si no, solo el link
        try {
          await ctx.replyWithDocument(String(data.dl), {
            caption: `${data.name}.apk`,
            filename: `${String(data.name).replace(/[^\w.\- ]+/g, '')}.apk`
          })
        } catch (e) {
          console.error('[apk] document', e?.message || e)
          await ctx.reply(`No pude enviar el APK por Telegram (limite ~50 MB). Usa el link de arriba.`)
        }
        return
      } catch (e) {
        last = e.message || last
      }
    }
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, `No encontre la app ${q}.\n${last}`)
  } catch (e) {
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Error: ' + errText(e)).catch(() => {})
  }
}

export async function handleAms(ctx) {
  const q = text(ctx)
  if (!q) return ctx.reply('Uso: /ams <cancion o artista>\nEjemplo: /ams bad bunny')

  const status = await ctx.reply('Buscando en Apple Music / iTunes...')
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&limit=8`,
      { headers: { 'User-Agent': 'Luffy7-Telegram' } }
    )
    const json = await res.json().catch(() => ({}))
    const list = json?.results || []
    if (!list.length) {
      return ctx.api.editMessageText(ctx.chat.id, status.message_id, `No encontre resultados para ${q}`)
    }

    let texto = `Apple Music / iTunes: ${q}\n\n`
    list.forEach((song, i) => {
      texto += `${i + 1}. ${song.trackName || song.collectionName || '?'}\n`
      texto += `   Artista: ${song.artistName || '?'}\n`
      texto += `   Album: ${song.collectionName || '?'}\n`
      texto += `   Enlace: ${song.trackViewUrl || song.collectionViewUrl || '?'}`
      if (i !== list.length - 1) texto += `\n\n`
    })

    const first = list[0]
    const thumb = first.artworkUrl100?.replace('100x100bb', '600x600bb') || first.artworkUrl100
    if (thumb) {
      await ctx.replyWithPhoto(String(thumb), { caption: texto.slice(0, 1024) }).catch(async () => {
        await ctx.api.editMessageText(ctx.chat.id, status.message_id, texto.slice(0, 3500))
        return
      })
      if (texto.length > 1024) await ctx.reply(texto.slice(1024, 3500)).catch(() => {})
      await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {})
    } else {
      await ctx.api.editMessageText(ctx.chat.id, status.message_id, texto.slice(0, 3500))
    }
  } catch (e) {
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Error: ' + errText(e)).catch(() => {})
  }
}
