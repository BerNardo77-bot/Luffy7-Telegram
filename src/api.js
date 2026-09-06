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
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    timeout: 60000
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
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

  // node-fetch en Termux da PassThrough (Node stream), no Web ReadableStream
  const nodeStream =
    typeof body.getReader === 'function' ? Readable.fromWeb(body) : body

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

/** Comprime MP4 para que Telegram cloud (~50MB) pueda enviarlo. */
export async function compressForTelegram(inputPath, maxSendBytes) {
  const outFile = path.join(TMP_DIR, `${Date.now()}-tg-out.mp4`)
  const attempts = [
    ['-y', '-i', inputPath, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-vf', "scale='min(720,iw)':-2", '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', outFile],
    ['-y', '-i', inputPath, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '32', '-vf', "scale='min(480,iw)':-2", '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', outFile],
    ['-y', '-i', inputPath, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '35', '-vf', "scale='min(360,iw)':-2", '-c:a', 'aac', '-b:a', '48k', '-movflags', '+faststart', outFile]
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
        if (bestPath && bestPath !== outFile) safeUnlink(bestPath)
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
  const videoMatch = String(text).match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/))([a-zA-Z0-9_-]{9,11})/
  )
  const query = videoMatch ? `https://youtu.be/${videoMatch[1]}` : text
  const search = await yts(query)
  if (!search.videos?.length) return null
  const video = videoMatch
    ? (search.videos.find((v) => v.videoId === videoMatch[1]) || search.videos[0])
    : search.videos[0]
  return video
}

export async function getAudioLink(videoUrl, title) {
  const { apiUrl, apiKey } = getConfig()
  const keys = [apiKey]
  if (apiKey !== FALLBACK_KEY) keys.push(FALLBACK_KEY)
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
  const { apiUrl, apiKey } = getConfig()
  const keys = [apiKey]
  if (apiKey !== FALLBACK_KEY) keys.push(FALLBACK_KEY)
  const urls = [videoUrl]
  const idMatch = String(videoUrl).match(/(?:youtu\.be\/|v=|shorts\/)([a-zA-Z0-9_-]{11})/)
  if (idMatch) {
    urls.push(`https://youtu.be/${idMatch[1]}`, `https://www.youtube.com/watch?v=${idMatch[1]}`)
  }
  let last = 'Sin resultado'
  for (const key of keys) {
    for (const u of urls) {
      for (const quality of ['480', '360', '720', 'auto']) {
        try {
          const res = await fetchJson(
            `${apiUrl}/dl/youtubeplayv2?query=${encodeURIComponent(u)}&type=mp4&quality=${quality}&key=${key}`
          )
          if (res?.status && res?.data?.dl) {
            return { dl: res.data.dl, title: res.data.title || title, size: res.data.size }
          }
          last = res?.message || last
        } catch (e) {
          last = e.message || last
        }
      }
      try {
        const alt = await fetchJson(`${apiUrl}/dl/ytmp4?url=${encodeURIComponent(u)}&key=${key}`)
        const dl = alt?.data?.dl || alt?.result?.dl || alt?.dl
        if (alt?.status && dl) return { dl, title: alt.data?.title || title }
        last = alt?.message || last
      } catch (e) {
        last = e.message || last
      }
    }
  }
  return { error: last }
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
  const { apiUrl, apiKey } = getConfig()
  const keys = [apiKey]
  if (apiKey !== FALLBACK_KEY) keys.push(FALLBACK_KEY)
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
  const { apiUrl, apiKey } = getConfig()
  const keys = [apiKey]
  if (apiKey !== FALLBACK_KEY) keys.push(FALLBACK_KEY)
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
