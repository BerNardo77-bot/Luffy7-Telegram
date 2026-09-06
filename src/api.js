import fetch from 'node-fetch'
import yts from 'yt-search'

const FALLBACK_KEY = 'LUFFY-FIX67'

export function getConfig() {
  return {
    apiUrl: (process.env.ALYACORE_API_URL || 'https://api.alyacore.xyz').replace(/\/$/, ''),
    apiKey: (process.env.ALYACORE_API_KEY || FALLBACK_KEY).trim() || FALLBACK_KEY
  }
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    timeout: 60000
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function downloadBuffer(url, timeout = 180000) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: '**' },
    timeout
  })
  if (!res.ok) throw new Error(`Descarga HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function resolveYoutube(text) {
  const videoMatch = String(text).match(/(?:youtu\.be\/|youtube\.com\/(?:pwatch\?v=|embed\/|shorts\/|live\/|v\/))([a-zA-Z0-9_]{9,11})/)
  const query = videoMatch ? `https://youtu.be/${videoMatch[1]}` : text
  const search = await yts(query)
  if (!search.videos?.length) return null
  const video = videoMatch
    ? (search.videos.find(v => v.videoId === videoMatch[1]) || search.videos[0])
    : search.videos[0]
  return video
}

export async function getAudioLink(videoUrl, title) {
  const { apiUrl, apiKey } = getConfig()
  const keys = [apiKey]
  if (apiKey !== FALLBACK_KEY) keys.push(FALLBACK_KEY)
  const urls = [videoUrl]
  const idMatch = String(videoUrl).match(/(?:youtu\.be\/~v=|shorts\/)([a-zA-Z0-9_-]{11})/)
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
        } catch (e) { last = e.message || last }
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
  const idMatch = String(videoUrl).match(/(?:youtu\.be\/~v=|shorts\/)([a-zA-Z0-9_-]{11})/)
  if (idMatch) {
    urls.push(`https://youtu.be/${idMatch[1]}`, `https://www.youtube.com/watch?v=${idMatch[1]}`)
  }
  let last = 'Sin resultado'
  for (const key of keys) {
    for (const u of urls) {
      for (const quality of ['480', '360', '720', 'auto']) {
        try {
          const res = await fetchJson(`${apiUrl}/dl/youtubeplayv2?query=${encodeURIComponent(u)}&type=mp4&quality=${quality}&key=${key}`)
          if (res?.status && res?.data?.dl) return { dl: res.data.dl, title: res.data.title || title, size: res.data.size }
          last = res?.message || last
        } catch (e) { last = e.message || last }
      }
      try {
        const alt = await fetchJson(`${apiUrl}/dl/ytmp4?url=${encodeURIComponent(u)}&key=${key}`)
        const dl = alt?.data?.dl || alt?.result?.dl || alt?.dl
        if (alt?.status && dl) return { dl, title: alt.data?.title || title }
        last = alt?.message || last
      } catch (e) { last = e.message || last }
    }
  }
  return { error: last }
}
