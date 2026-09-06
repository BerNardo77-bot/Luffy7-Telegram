import fetch from 'node-fetch'
import yts from 'yt-search'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { Readable } from 'stream'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const FALLBACK_KEY = 'LUFFY-FIX67'
export const MAX_DOWNLOAD = Number(process.env.MAX_DOWNLOAD_BYTES || 2 * 1024 * 1024 * 1024) // 2GB
export const TMP_DIR = path.join(process.cwd(), 'tmp-dl')

export function getConfig() {
  return {
    apiUrl: (process.env.ALYACORE_API_URL || 'https://api.alyacore.xyz').replace(/\/$/, ''),
    apiKey: (process.env.ALYACORE_API_KEY || FALLBACK_KEY).trim() || FALLBACK_KEY
  }
}

export function mb(n) {
  return (Number(n) / 1024 / 1024).toFixed(1)
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      Accept: 'application/json'
    },
    timeout: 60000
  })
  const text = await res.text()
  let json = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { message: text?.slice(0, 200) || `HTTP ${res.status}` }
  }
  if (!res.ok) {
    const msg = json?.message || json?.error || `HTTP ${res.status}`
    const err = new Error(String(msg))
    err.status = res.status
    err.json = json
    throw err
  }
  return json
}

/** Extrae ID de YouTube limpio (ignora ?si= y texto pegado dos veces). */
export function extractYoutubeId(text) {
  const s = String(text || '')
  const m = s.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/)|[?&]v=)([a-zA-Z0-9_-]{11})/
  )
  return m ? m[1] : null
}

export function normalizeYoutubeUrls(text) {
  const id = extractYoutubeId(text)
  if (!id) {
    // primer http link si hay
    const link = String(text || '').match(/https?:\/\/[^\s]+/i)
    return link ? [link[0].replace(/[),.;]+$/, '')] : [String(text || '').trim()].filter(Boolean)
  }
  return [
    `https://youtu.be/${id}`,
    `https://www.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/shorts/${id}`
  ]
}

/** Fallback Termux: yt-dlp baja MP4 a disco. */
export async function downloadYoutubeWithYtDlp(videoUrlOrId, destPath) {
  const id = extractYoutubeId(videoUrlOrId) || String(videoUrlOrId).trim()
  const url = id.length === 11 && !id.includes('/') ? `https://www.youtube.com/watch?v=${id}` : videoUrlOrId
  const args = [
    '-f',
    'bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[height<=480]/b',
    '--merge-output-format',
    'mp4',
    '--no-playlist',
    '-o',
    destPath,
    '--no-warnings',
    url
  ]
  try {
    await execFileAsync('yt-dlp', args, { timeout: 1_200_000 })
  } catch (e1) {
    // binario alternativo
    try {
      await execFileAsync('yt-dlp', ['-f', 'best[height<=360]/b', '--no-playlist', '-o', destPath, url], {
        timeout: 1_200_000
      })
    } catch (e2) {
      throw new Error(
        `yt-dlp fallo: ${(e2?.stderr || e2?.message || e1?.message || e1).toString().slice(0, 200)}. Instala: pkg install yt-dlp`
      )
    }
  }
  if (!fs.existsSync(destPath) || !fs.statSync(destPath).size) {
    // yt-dlp a veces agrega extension
    const alt = destPath + '.mp4'
    if (fs.existsSync(alt) && fs.statSync(alt).size) {
      fs.renameSync(alt, destPath)
    }
  }
  if (!fs.existsSync(destPath) || !fs.statSync(destPath).size) {
    throw new Error('yt-dlp no genero el archivo')
  }
  return fs.statSync(destPath).size
}

function defaultDlHeaders(url) {
  const u = String(url)
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    Accept: '*/*'
  }
  if (u.includes('xvideos') || u.includes('xvideos-cdn')) {
    headers.Referer = 'https://www.xvideos.com/'
    headers.Origin = 'https://www.xvideos.com'
  }
  return headers
}

function apiKeys() {
  const { apiKey } = getConfig()
  const keys = [apiKey]
  if (apiKey !== FALLBACK_KEY) keys.push(FALLBACK_KEY)
  return keys
}

/** Descarga a archivo en disco (no a RAM). Tope 2GB. */
export async function downloadToFile(url, destPath, {
  timeout = 1_800_000,
  headers = {},
  maxBytes = MAX_DOWNLOAD
} = {}) {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })
  const res = await fetch(url, {
    headers: { ...defaultDlHeaders(url), ...headers },
    timeout
  })
  if (!res.ok) throw new Error(`Descarga HTTP ${res.status}`)
  const len = Number(res.headers.get('content-length') || 0)
  if (len && len > maxBytes) {
    throw new Error(`Archivo ~${mb(len)} MB supera el tope de descarga (${mb(maxBytes)} MB)`)
  }
  const body = res.body
  if (!body) throw new Error('Sin body en la descarga')

  // Preferir siempre stream Node (.pipe). node-fetch da PassThrough;
  // en Termux a veces tiene getReader y Readable.fromWeb explota.
  let nodeStream
  if (typeof body.pipe === 'function') {
    nodeStream = body
  } else if (typeof body.getReader === 'function') {
    nodeStream = Readable.fromWeb(body)
  } else if (typeof body[Symbol.asyncIterator] === 'function') {
    nodeStream = Readable.from(body)
  } else {
    throw new Error('Body de descarga no reconocido')
  }

  let written = 0
  const out = createWriteStream(destPath)
  nodeStream.on('data', (chunk) => {
    written += chunk.length
    if (written > maxBytes) {
      nodeStream.destroy(new Error(`Descarga cortada: supera ${mb(maxBytes)} MB`))
    }
  })
  await pipeline(nodeStream, out)
  const st = fs.statSync(destPath)
  if (!st.size) throw new Error('Archivo vacío')
  return st.size
}

/** Comprime MP4 rapido para Telegram cloud (~50MB). Un pase agresivo primero. */
export async function compressForTelegram(inputPath, maxSendBytes) {
  const outFile = path.join(TMP_DIR, `${Date.now()}-tg-out.mp4`)
  // ultrafast + 360p primero = mucho mas rapido en Termux/celular
  const attempts = [
    ['-y', '-i', inputPath, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-vf', "scale='min(360,iw)':-2", '-c:a', 'aac', '-b:a', '64k', '-ac', '1', '-movflags', '+faststart', '-threads', '0', outFile],
    ['-y', '-i', inputPath, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '34', '-vf', "scale='min(360,iw)':-2", '-c:a', 'aac', '-b:a', '48k', '-ac', '1', '-movflags', '+faststart', '-threads', '0', outFile]
  ]

  let bestPath = null
  let bestSize = Infinity

  for (const args of attempts) {
    try {
      await execFileAsync('ffmpeg', args, { timeout: 900000 })
      if (!fs.existsSync(outFile)) continue
      const size = fs.statSync(outFile).size
      if (!size) continue
      if (size < bestSize) {
        bestSize = size
        if (bestPath) safeUnlink(bestPath)
        const keep = path.join(TMP_DIR, `${Date.now()}-best.mp4`)
        fs.copyFileSync(outFile, keep)
        bestPath = keep
      }
      if (size <= maxSendBytes) {
        safeUnlink(outFile)
        return bestPath
      }
    } catch (e) {
      console.error('[ffmpeg]', e?.message || e)
    }
  }
  safeUnlink(outFile)
  return bestPath
}

export async function downloadBuffer(url, timeout = 180000) {
  const res = await fetch(url, {
    headers: defaultDlHeaders(url),
    timeout
  })
  if (!res.ok) throw new Error(`Descarga HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function resolveYoutube(text) {
  const id = extractYoutubeId(text)
  const query = id ? `https://youtu.be/${id}` : String(text).trim()
  const search = await yts(query)
  if (!search.videos?.length) return null
  const video = id
    ? (search.videos.find((v) => v.videoId === id) || search.videos[0])
    : search.videos[0]
  return video
}

export async function getAudioLink(videoUrl, title) {
  const { apiUrl } = getConfig()
  const keys = apiKeys()
  const urls = [videoUrl]
  const idMatch = String(videoUrl).match(/(?:youtu\.be\/|v=|shorts\/)([a-zA-Z0-9_-]{11})/)
  if (idMatch) {
    urls.push(`https://youtu.be/${idMatch[1]}`, `https://www.youtube.com/watch?v=${idMatch[1]}`)
  }
  let last = 'Sin resultado'
  for (const key of keys) {
    for (const u of urls) {
      for (const ep of ['ytmp3v2', 'ytmp3']) {
        try {
          const res = await fetchJson(`${apiUrl}/dl/${ep}?url=${encodeURIComponent(u)}&key=${key}`)
          const dl = res?.data?.dl || res?.result?.dl || res?.dl
          if (res?.status && dl) return { dl, title: res.data?.title || title }
          last = res?.message || last
        } catch (e) {
          last = e.message || last
        }
      }
    }
  }
  return { error: last }
}

export async function getVideoLink(videoUrl, title) {
  const { apiUrl } = getConfig()
  const keys = apiKeys()
  const urls = normalizeYoutubeUrls(videoUrl)
  let last = 'Sin resultado'
  const endpoints = []
  for (const u of urls) {
    for (const quality of ['360', '480', '240', '720', 'auto']) {
      endpoints.push((key) =>
        `${apiUrl}/dl/youtubeplayv2?query=${encodeURIComponent(u)}&type=mp4&quality=${quality}&key=${key}`
      )
    }
    endpoints.push((key) => `${apiUrl}/dl/ytmp4?url=${encodeURIComponent(u)}&key=${key}`)
    endpoints.push((key) => `${apiUrl}/dl/ytmp4v2?url=${encodeURIComponent(u)}&key=${key}`)
  }
  for (const key of keys) {
    for (const make of endpoints) {
      try {
        const res = await fetchJson(make(key))
        const dl = res?.data?.dl || res?.result?.dl || res?.dl
        if (res?.status && dl) {
          return { dl, title: res.data?.title || res.result?.title || title, size: res.data?.size }
        }
        last = res?.message || last
      } catch (e) {
        last = e.message || last
      }
    }
  }
  return { error: last, urlsTried: urls }
}

function pickXvideosCandidates(resultado) {
  const videos = resultado?.videos || resultado?.result?.videos || {}
  const list = []
  // Preferir low/360 primero para Telegram cloud
  if (videos.low) list.push({ quality: 'low', url: videos.low })
  if (videos.high) list.push({ quality: 'high', url: videos.high })
  const legacy = resultado?.result?.url || resultado?.url || resultado?.dl
  if (legacy) list.push({ quality: 'legacy', url: legacy })
  return list
}

export async function getXvideosDownload(videoUrl) {
  const { apiUrl } = getConfig()
  const keys = apiKeys()
  let last = 'Sin resultado'
  for (const key of keys) {
    try {
      const res = await fetchJson(
        `${apiUrl}/nsfw/dl/xvideos?url=${encodeURIComponent(videoUrl)}&key=${key}`
      )
      const candidates = pickXvideosCandidates(res?.resultado)
      if (res?.status && candidates.length) return { candidates, message: res.message }
      last = res?.message || last
    } catch (e) {
      last = e.message || last
    }
  }
  return { error: last }
}

export async function searchXvideos(query) {
  const { apiUrl } = getConfig()
  const keys = apiKeys()
  let last = 'Sin resultado'
  for (const key of keys) {
    try {
      const res = await fetchJson(
        `${apiUrl}/nsfw/search/xvideos?query=${encodeURIComponent(query)}&key=${key}`
      )
      if (res?.status && res?.resultados?.length) return { results: res.resultados }
      last = res?.message || last
    } catch (e) {
      last = e.message || last
    }
  }
  return { error: last }
}

/** TikTok video o audio (mp3=true). */
export async function getTiktok(url, { mp3 = false } = {}) {
  const { apiUrl } = getConfig()
  const keys = apiKeys()
  const ep = mp3 ? 'tiktokmp3' : 'tiktok'
  let last = 'Sin resultado'
  for (const key of keys) {
    try {
      const res = await fetchJson(
        `${apiUrl}/dl/${ep}?url=${encodeURIComponent(url)}&key=${key}`
      )
      const data = res?.data
      const dl = data?.dl
      if (res?.status && dl) {
        return {
          dl,
          title: data.title || 'TikTok',
          author: data.author?.nickname || data.author?.unique_id || '',
          thumbnail: data.thumbnail,
          type: data.type || (mp3 ? 'audio' : 'video'),
          duration: data.duration || data.music_info?.duration
        }
      }
      last = res?.message || last
    } catch (e) {
      last = e.message || last
    }
  }
  return { error: last }
}

/** Instagram: data.download[] con {type, url} */
export async function getInstagram(url) {
  const { apiUrl } = getConfig()
  const keys = apiKeys()
  let last = 'Sin resultado'
  for (const key of keys) {
    try {
      const res = await fetchJson(
        `${apiUrl}/dl/instagram?url=${encodeURIComponent(url)}&key=${key}`
      )
      const downloads = res?.data?.download
      if (res?.status && Array.isArray(downloads) && downloads.length) {
        return { downloads }
      }
      last = res?.message || last
    } catch (e) {
      last = e.message || last
    }
  }
  return { error: last }
}

/**
 * Facebook v2: la API suele devolver el binario del video (no JSON).
 * Devolvemos la URL lista para downloadToFile.
 */
export async function getFacebookDownloadUrl(pageUrl) {
  const { apiUrl } = getConfig()
  const keys = apiKeys()
  let last = 'Sin resultado'
  for (const key of keys) {
    const endpoint = `${apiUrl}/dl/facebookv2?url=${encodeURIComponent(pageUrl)}&key=${key}`
    try {
      // Probar HEAD/GET corto: si content-type es video, usar endpoint directo
      const res = await fetch(endpoint, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' },
        timeout: 30000
      })
      if (!res.ok) {
        last = `HTTP ${res.status}`
        continue
      }
      const ct = (res.headers.get('content-type') || '').toLowerCase()
      if (ct.includes('application/json') || ct.includes('text/')) {
        const text = await res.text()
        let json
        try {
          json = JSON.parse(text)
        } catch {
          last = 'Respuesta no JSON'
          continue
        }
        const dl =
          json?.data?.dl ||
          json?.data?.url ||
          json?.result?.dl ||
          json?.result?.url ||
          json?.dl ||
          json?.url
        if (json?.status && dl) return { dl, title: json.data?.title || 'facebook' }
        last = json?.message || last
      } else {
        // Binario: cancelar body y devolver la URL del endpoint
        try {
          res.body?.destroy?.()
        } catch {}
        return { dl: endpoint, title: 'facebook', binaryEndpoint: true }
      }
    } catch (e) {
      last = e.message || last
    }
  }
  return { error: last }
}

export async function getSpotify(query) {
  const { apiUrl } = getConfig()
  const keys = apiKeys()
  let last = 'Sin resultado'
  const isUrl = /open\.spotify\.com\/track\//i.test(query)

  for (const key of keys) {
    try {
      let url = query
      let meta = null
      if (!isUrl) {
        const search = await fetchJson(
          `${apiUrl}/search/spotify?query=${encodeURIComponent(query)}&key=${key}`
        )
        if (!search?.status || !search?.data?.length) {
          last = search?.message || 'Sin resultados Spotify'
          continue
        }
        meta = search.data[0]
        url = meta.url
      }
      const res = await fetchJson(
        `${apiUrl}/dl/spotify?url=${encodeURIComponent(url)}&key=${key}`
      )
      if (res?.status && res?.data?.dl) {
        return {
          dl: res.data.dl,
          title: res.data.title || meta?.title || meta?.name || 'spotify',
          artist: res.data.artist || meta?.artist || '',
          album: res.data.album || meta?.album || '',
          cover: res.data.image || res.data.cover || meta?.image || meta?.cover,
          url
        }
      }
      last = res?.message || last
    } catch (e) {
      last = e.message || last
    }
  }
  return { error: last }
}

export async function getMediafire(pageUrl) {
  const { apiUrl } = getConfig()
  const keys = apiKeys()
  let last = 'Sin resultado'
  for (const key of keys) {
    try {
      const res = await fetchJson(
        `${apiUrl}/dl/mediafire?url=${encodeURIComponent(pageUrl)}&key=${key}`
      )
      if (res?.status && res?.result?.download) {
        return {
          download: res.result.download,
          filename: res.result.filename || 'mediafire.bin',
          filetype: res.result.filetype,
          filesize: res.result.filesize,
          uploaded: res.result.uploaded
        }
      }
      last = res?.message || last
    } catch (e) {
      last = e.message || last
    }
  }
  return { error: last }
}

/** Danbooru/Gelbooru Alyacore: la API suele devolver imagen binaria. */
export async function getBooruImageUrl(kind, keyword) {
  const { apiUrl } = getConfig()
  const keys = apiKeys()
  const ep = kind === 'gelbooru' ? 'gelbooru' : 'danbooru'
  let last = 'Sin resultado'
  for (const key of keys) {
    const endpoint = `${apiUrl}/nsfw/${ep}?keyword=${encodeURIComponent(keyword)}&key=${key}`
    try {
      const res = await fetch(endpoint, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: '*/*' },
        timeout: 60000
      })
      if (!res.ok) {
        last = `HTTP ${res.status}`
        continue
      }
      const ct = (res.headers.get('content-type') || '').toLowerCase()
      if (ct.includes('application/json')) {
        const json = await res.json()
        const img =
          json?.data?.url ||
          json?.data?.image ||
          json?.result?.url ||
          json?.url ||
          json?.image
        if (img) return { url: img }
        last = json?.message || last
      } else if (ct.startsWith('image/') || ct.includes('octet-stream')) {
        try {
          res.body?.destroy?.()
        } catch {}
        return { url: endpoint, binaryEndpoint: true }
      } else {
        // asumir imagen
        try {
          res.body?.destroy?.()
        } catch {}
        return { url: endpoint, binaryEndpoint: true }
      }
    } catch (e) {
      last = e.message || last
    }
  }
  return { error: last }
}

export async function getRule34Image(tag) {
  const clean = String(tag).replace(/\s+/g, '_')
  const apiKey = process.env.RULE34_API_KEY || ''
  const userId = process.env.RULE34_USER_ID || ''
  let url =
    `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&tags=${encodeURIComponent(clean)}`
  if (apiKey) url += `&api_key=${encodeURIComponent(apiKey)}`
  if (userId) url += `&user_id=${encodeURIComponent(userId)}`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    timeout: 60000
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  let json = []
  try {
    json = JSON.parse(text)
  } catch {
    json = []
  }
  const data = Array.isArray(json) ? json : json?.post || json?.data || []
  const images = data
    .map((i) => i?.file_url || i?.sample_url || i?.preview_url)
    .filter((u) => typeof u === 'string' && /\.(jpe?g|png|gif)$/i.test(u))
  if (!images.length) return { error: `Sin resultados para ${clean}` }
  const pick = images[Math.floor(Math.random() * images.length)]
  return { url: pick }
}

export async function translateText(text, language = 'es') {
  const url = `https://api.delirius.store/tools/translate?text=${encodeURIComponent(text)}&language=${encodeURIComponent(language)}`
  try {
    const res = await fetchJson(url)
    if (res?.data) return { text: res.data }
    return { error: res?.message || 'No se pudo traducir' }
  } catch (e) {
    return { error: e.message || 'Error de traduccion' }
  }
}

export function isDirectMediaUrl(text) {
  const u = String(text || '').trim()
  if (!/^https?:\/\//i.test(u)) return false
  if (/\.(mp4|m4v|webm|mkv|mp3|m4a|ogg)(\?|#|$)/i.test(u)) return true
  if (u.includes('xvideos-cdn.com') || u.includes('xhcdn.com')) return true
  return false
}

export function tmpPath(name) {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })
  return path.join(TMP_DIR, name)
}

export function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p)
  } catch {}
}

export function argText(ctx) {
  const raw =
    (ctx.match || '').toString().trim() ||
    (ctx.message?.text || ctx.message?.caption || '')
      .split(/\s+/)
      .slice(1)
      .join(' ')
      .trim()
  if (!raw) return ''
  // si pegaron el comando dos veces, quedarse con el primer link/ID
  const id = extractYoutubeId(raw)
  if (id) return `https://youtu.be/${id}`
  const link = raw.match(/https?:\/\/[^\s]+/i)
  if (link) return link[0].replace(/[),.;]+$/, '')
  // cortar si aparece otro /comando en el medio
  const cut = raw.split(/\s+\//)[0].trim()
  return cut || raw
}
