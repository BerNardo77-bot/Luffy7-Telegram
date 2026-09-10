import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'
import { InputFile } from 'grammy'
import { argText, getConfig, errText } from '../api.js'
import {
  userOf,
  chatOf,
  allUsers,
  persist,
  fmt,
  remain,
  cooldownLeft,
  setCooldown,
  displayName
} from '../store.js'

const CURRENCY = '¥'
const DAY = 24 * 60 * 60 * 1000

function text(ctx) {
  return argText(ctx)
}

function targetFrom(ctx) {
  const r = ctx.message?.reply_to_message?.from
  if (r && !r.is_bot) return r
  const ent = (ctx.message?.entities || []).find((e) => e.type === 'text_mention' && e.user)
  if (ent?.user && !ent.user.is_bot) return ent.user
  return null
}

function targetName(user) {
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'alguien'
}

function otherUser(tgUser) {
  const fake = { from: tgUser }
  return userOf(fake)
}

function rpgOn(ctx) {
  return chatOf(ctx).rpg !== false
}

function gachaOn(ctx) {
  return chatOf(ctx).gacha !== false
}

function jobs() {
  return [
    'Trabajas en el barco y ganas',
    'Ayudas en cocina y ganas',
    'Reparas velas y ganas',
    'Cazas un pez raro y ganas',
    'Encuentras un cofre y ganas'
  ]
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
}

async function needWait(ctx, user, key, label) {
  const left = cooldownLeft(user, key)
  if (left > 0) {
    await ctx.reply(`Espera ${remain(left)} para ${label}.`)
    return true
  }
  return false
}

export async function handleBalance(ctx) {
  const u = userOf(ctx)
  persist()
  await ctx.reply(
    `Balance de ${u.name}\nMano: ${fmt(u.coins)} ${CURRENCY}\nBanco: ${fmt(u.bank)} ${CURRENCY}\nTotal: ${fmt(u.coins + u.bank)} ${CURRENCY}`
  )
}

export async function handleDaily(ctx) {
  if (!rpgOn(ctx)) return ctx.reply('Economia apagada en este chat. Un admin: /rpg enable')
  const u = userOf(ctx)
  const now = Date.now()
  const since = now - (u.lastDaily || 0)
  if (u.lastDaily && since < DAY) {
    persist()
    return ctx.reply(`Ya reclamaste el daily. Vuelve en ${remain(DAY - since)}.`)
  }
  if (!u.lastDaily || since > DAY * 2) u.dailyStreak = 1
  else u.dailyStreak = (u.dailyStreak || 0) + 1
  u.lastDaily = now
  const pay = Math.min(10000 + (u.dailyStreak - 1) * 5000, 100000)
  u.coins += pay
  persist()
  await ctx.reply(
    `Daily: ${fmt(pay)} ${CURRENCY} (dia ${u.dailyStreak}).\nManana: ${fmt(Math.min(10000 + u.dailyStreak * 5000, 100000))} ${CURRENCY}`
  )
}

export async function handleDeposit(ctx) {
  const u = userOf(ctx)
  const n = text(ctx).toLowerCase()
  const amount = n === 'all' || n === 'todo' ? u.coins : Number(n)
  if (!amount || amount < 1 || amount > u.coins) {
    return ctx.reply('Uso: /dep cantidad o /dep all')
  }
  u.coins -= amount
  u.bank += amount
  persist()
  await ctx.reply(`Depositaste ${fmt(amount)} ${CURRENCY}. Banco: ${fmt(u.bank)}`)
}

export async function handleWithdraw(ctx) {
  const u = userOf(ctx)
  const n = text(ctx).toLowerCase()
  const amount = n === 'all' || n === 'todo' ? u.bank : Number(n)
  if (!amount || amount < 1 || amount > u.bank) {
    return ctx.reply('Uso: /withdraw cantidad o /withdraw all')
  }
  u.bank -= amount
  u.coins += amount
  persist()
  await ctx.reply(`Retiraste ${fmt(amount)} ${CURRENCY}. Mano: ${fmt(u.coins)}`)
}

async function earn(ctx, key, ms, min, max, label) {
  if (!rpgOn(ctx)) return ctx.reply('Economia apagada. Un admin: /rpg enable')
  const u = userOf(ctx)
  if (await needWait(ctx, u, key, label)) return
  const pay = min + Math.floor(Math.random() * (max - min + 1))
  u.coins += pay
  u.xp = (u.xp || 0) + 5
  setCooldown(u, key, ms)
  persist()
  await ctx.reply(`${pick(jobs())} ${fmt(pay)} ${CURRENCY}.`)
}

export async function handleWork(ctx) {
  return earn(ctx, 'work', 10 * 60 * 1000, 500, 5000, 'trabajar')
}
export async function handleCrime(ctx) {
  if (!rpgOn(ctx)) return ctx.reply('Economia apagada. Un admin: /rpg enable')
  const u = userOf(ctx)
  if (await needWait(ctx, u, 'crime', 'otro crimen')) return
  setCooldown(u, 'crime', 15 * 60 * 1000)
  if (Math.random() < 0.35) {
    const loss = Math.min(u.coins, 1000 + Math.floor(Math.random() * 4000))
    u.coins -= loss
    persist()
    return ctx.reply(`Te atraparon. Perdiste ${fmt(loss)} ${CURRENCY}.`)
  }
  const pay = 1500 + Math.floor(Math.random() * 7000)
  u.coins += pay
  persist()
  await ctx.reply(`Crimen exitoso. ${fmt(pay)} ${CURRENCY}.`)
}
export async function handleSlut(ctx) {
  return earn(ctx, 'slut', 12 * 60 * 1000, 400, 4500, 'repetir')
}
export async function handleFish(ctx) {
  return earn(ctx, 'fish', 8 * 60 * 1000, 300, 3500, 'pescar')
}
export async function handleHunt(ctx) {
  return earn(ctx, 'hunt', 8 * 60 * 1000, 300, 3500, 'cazar')
}
export async function handleMine(ctx) {
  return earn(ctx, 'mine', 10 * 60 * 1000, 400, 4000, 'minar')
}
export async function handleRitual(ctx) {
  return earn(ctx, 'ritual', 20 * 60 * 1000, 1000, 8000, 'otro ritual')
}
export async function handleDungeon(ctx) {
  return earn(ctx, 'dungeon', 30 * 60 * 1000, 2000, 12000, 'otra mazmorra')
}

export async function handleSteal(ctx) {
  if (!rpgOn(ctx)) return ctx.reply('Economia apagada. Un admin: /rpg enable')
  const u = userOf(ctx)
  if (await needWait(ctx, u, 'steal', 'robar')) return
  const t = targetFrom(ctx)
  if (!t) return ctx.reply('Responde al mensaje de quien quieres robar.')
  if (String(t.id) === String(ctx.from.id)) return ctx.reply('No puedes robarte a ti.')
  const victim = otherUser(t)
  if (victim.coins < 100) {
    persist()
    return ctx.reply(`${targetName(t)} no tiene monedas suficientes.`)
  }
  setCooldown(u, 'steal', 15 * 60 * 1000)
  if (Math.random() < 0.4) {
    persist()
    return ctx.reply('Fallaste el robo.')
  }
  const take = Math.min(victim.coins, 200 + Math.floor(Math.random() * 2500))
  victim.coins -= take
  u.coins += take
  persist()
  await ctx.reply(`Robaste ${fmt(take)} ${CURRENCY} a ${targetName(t)}.`)
}

export async function handleGiveCoins(ctx) {
  const u = userOf(ctx)
  const parts = text(ctx).split(/\s+/).filter(Boolean)
  const amount = Number(parts[0])
  const t = targetFrom(ctx)
  if (!t || !amount || amount < 1) return ctx.reply('Responde a alguien y usa /pay cantidad')
  if (amount > u.coins) return ctx.reply('No tienes tantas monedas.')
  u.coins -= amount
  otherUser(t).coins += amount
  persist()
  await ctx.reply(`Enviaste ${fmt(amount)} ${CURRENCY} a ${targetName(t)}.`)
}

function bet(ctx, user) {
  const n = text(ctx)
  const amount = n.toLowerCase() === 'all' || n.toLowerCase() === 'todo' ? user.coins : Number(n)
  if (!amount || amount < 1) return null
  if (amount > user.coins) return 0
  return amount
}

export async function handleFlip(ctx) {
  const u = userOf(ctx)
  const parts = text(ctx).split(/\s+/)
  const side = (parts[1] || 'cara').toLowerCase()
  const amount = parts[0] && !Number.isNaN(Number(parts[0])) ? Number(parts[0]) : null
  if (!amount || amount < 1 || amount > u.coins) return ctx.reply('Uso: /flip cantidad cara|cruz')
  const win = Math.random() < 0.5
  const landed = win ? (side.startsWith('cr') ? 'cruz' : 'cara') : (side.startsWith('cr') ? 'cara' : 'cruz')
  const hit = landed === (side.startsWith('cr') ? 'cruz' : 'cara')
  if (hit) u.coins += amount
  else u.coins -= amount
  persist()
  await ctx.reply(`${landed}. ${hit ? 'Ganaste' : 'Perdiste'} ${fmt(amount)} ${CURRENCY}.`)
}

export async function handleSlot(ctx) {
  const u = userOf(ctx)
  const amount = bet(ctx, u)
  if (amount == null) return ctx.reply('Uso: /slot cantidad')
  if (amount === 0) return ctx.reply('No tienes tantas monedas.')
  const icons = ['🍒', '🍋', '🔔', '⭐', '7️⃣']
  const a = pick(icons)
  const b = pick(icons)
  const c = pick(icons)
  let mul = 0
  if (a === b && b === c) mul = 3
  else if (a === b || b === c || a === c) mul = 1.5
  const delta = mul ? Math.floor(amount * mul) - amount : -amount
  u.coins += delta
  persist()
  await ctx.reply(`${a} ${b} ${c}\n${delta >= 0 ? 'Ganaste' : 'Perdiste'} ${fmt(Math.abs(delta))} ${CURRENCY}.`)
}

export async function handleRoulette(ctx) {
  const u = userOf(ctx)
  const amount = bet(ctx, u)
  if (amount == null) return ctx.reply('Uso: /rt cantidad')
  if (amount === 0) return ctx.reply('No tienes tantas monedas.')
  const n = 1 + Math.floor(Math.random() * 36)
  const win = n % 2 === 0
  u.coins += win ? amount : -amount
  persist()
  await ctx.reply(`Cayo ${n}. ${win ? 'Ganaste' : 'Perdiste'} ${fmt(amount)} ${CURRENCY}.`)
}

export async function handlePpt(ctx) {
  const u = userOf(ctx)
  const choice = text(ctx).toLowerCase()
  const map = { piedra: 'piedra', papel: 'papel', tijera: 'tijera', tijeras: 'tijera' }
  const mine = map[choice]
  if (!mine) return ctx.reply('Uso: /ppt piedra|papel|tijera')
  const bot = pick(['piedra', 'papel', 'tijera'])
  const win =
    (mine === 'piedra' && bot === 'tijera') ||
    (mine === 'papel' && bot === 'piedra') ||
    (mine === 'tijera' && bot === 'papel')
  const draw = mine === bot
  if (!draw) u.xp += win ? 3 : 0
  persist()
  await ctx.reply(`Tu ${mine} vs ${bot}. ${draw ? 'Empate' : win ? 'Ganaste' : 'Perdiste'}.`)
}

export async function handleMath(ctx) {
  const u = userOf(ctx)
  const a = 2 + Math.floor(Math.random() * 20)
  const b = 2 + Math.floor(Math.random() * 20)
  u.pendingMath = { answer: a + b, exp: Date.now() + 60 * 1000 }
  persist()
  await ctx.reply(`Cuanto es ${a} + ${b}? Responde con /responder numero (60s).`)
}

export async function handleResponder(ctx) {
  const u = userOf(ctx)
  const n = Number(text(ctx))
  if (!u.pendingMath) return ctx.reply('No hay pregunta. Usa /math')
  if (Date.now() > u.pendingMath.exp) {
    u.pendingMath = null
    persist()
    return ctx.reply('Se acabo el tiempo.')
  }
  if (n !== u.pendingMath.answer) return ctx.reply('Incorrecto.')
  u.pendingMath = null
  u.coins += 500
  u.xp += 8
  persist()
  await ctx.reply(`Correcto. +500 ${CURRENCY}.`)
}

export async function handleBoard(ctx) {
  const top = allUsers()
    .slice()
    .sort((a, b) => b.coins + b.bank - (a.coins + a.bank))
    .slice(0, 10)
  if (!top.length) return ctx.reply('Aun no hay piratas.')
  const lines = top.map((u, i) => `${i + 1}. ${u.name || u.id} — ${fmt(u.coins + u.bank)} ${CURRENCY}`)
  persist()
  await ctx.reply('Top economia\n' + lines.join('\n'))
}

export async function handleCount(ctx) {
  const chat = chatOf(ctx)
  const id = String(ctx.from.id)
  await ctx.reply(`Mensajes tuyos en este chat: ${chat.counts[id] || 0}`)
}

export async function handleTopCount(ctx) {
  const chat = chatOf(ctx)
  const rows = Object.entries(chat.counts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
  if (!rows.length) return ctx.reply('Aun no cuento mensajes. Habla un poco y reinicia el bot.')
  const lines = rows.map(([id, n], i) => {
    const u = allUsers().find((x) => x.id === id)
    return `${i + 1}. ${u?.name || id} — ${n}`
  })
  await ctx.reply('Top mensajes\n' + lines.join('\n'))
}

export async function handleWait(ctx) {
  const u = userOf(ctx)
  const keys = Object.keys(u.cooldowns || {})
  const lines = keys
    .map((k) => [k, cooldownLeft(u, k)])
    .filter(([, left]) => left > 0)
    .map(([k, left]) => `${k}: ${remain(left)}`)
  const daily = u.lastDaily ? DAY - (Date.now() - u.lastDaily) : 0
  if (daily > 0) lines.unshift(`daily: ${remain(daily)}`)
  await ctx.reply(lines.length ? lines.join('\n') : 'Sin esperas. Puedes usar todo.')
}

let characters = null
function loadChars() {
  if (characters) return characters
  try {
    characters = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'data', 'characters.json'), 'utf8')
    )
  } catch {
    characters = []
  }
  return characters
}

export async function handleRoll(ctx) {
  if (!gachaOn(ctx)) return ctx.reply('Gacha apagado. Un admin: /gacha enable')
  const u = userOf(ctx)
  if (await needWait(ctx, u, 'rw', 'otro roll')) return
  const list = loadChars()
  if (!list.length) return ctx.reply('No hay lista de personajes.')
  const owned = new Set(u.harem.map((c) => c.name))
  const pool = list.filter((c) => !owned.has(c.name))
  const char = pick(pool.length ? pool : list)
  u.pendingRoll = { ...char, at: Date.now() }
  setCooldown(u, 'rw', 15 * 60 * 1000)
  persist()
  await ctx.reply(
    `Roll: ${char.name}\nSerie: ${char.source}\nValor: ${fmt(char.value)} ${CURRENCY}\nGenero: ${char.gender}\nReclama con /claim (o /c)`
  )
}

export async function handleClaim(ctx) {
  const u = userOf(ctx)
  if (!u.pendingRoll) return ctx.reply('No hay roll pendiente. Usa /rw')
  if (Date.now() - u.pendingRoll.at > 2 * 60 * 1000) {
    u.pendingRoll = null
    persist()
    return ctx.reply('El roll expiro. Usa /rw de nuevo.')
  }
  const char = u.pendingRoll
  if (u.harem.some((c) => c.name === char.name)) {
    u.pendingRoll = null
    persist()
    return ctx.reply('Ya lo tienes.')
  }
  u.harem.push({
    name: char.name,
    value: char.value,
    source: char.source,
    keyword: char.keyword,
    gender: char.gender
  })
  u.pendingRoll = null
  persist()
  await ctx.reply(`Reclamaste a ${char.name} (${char.source}). Harem: ${u.harem.length}`)
}

export async function handleHarem(ctx) {
  const t = targetFrom(ctx)
  const u = t ? otherUser(t) : userOf(ctx)
  persist()
  if (!u.harem.length) return ctx.reply('Harem vacio. Usa /rw y /claim')
  const lines = u.harem.slice(0, 30).map((c, i) => `${i + 1}. ${c.name} — ${c.source}`)
  const extra = u.harem.length > 30 ? `\n... y ${u.harem.length - 30} mas` : ''
  await ctx.reply(`Harem de ${u.name || 'alguien'} (${u.harem.length})\n` + lines.join('\n') + extra)
}

export async function handleWinfo(ctx) {
  const q = text(ctx).toLowerCase()
  if (!q) return ctx.reply('Uso: /winfo nombre')
  const hit = loadChars().find((c) => c.name.toLowerCase().includes(q) || (c.source || '').toLowerCase().includes(q))
  if (!hit) return ctx.reply('No encontre ese personaje.')
  await ctx.reply(`${hit.name}\nSerie: ${hit.source}\nValor: ${fmt(hit.value)} ${CURRENCY}\nGenero: ${hit.gender}`)
}

export async function handleSerieInfo(ctx) {
  const q = text(ctx).toLowerCase()
  if (!q) return ctx.reply('Uso: /serieinfo nombre de serie')
  const hits = loadChars().filter((c) => (c.source || '').toLowerCase().includes(q)).slice(0, 15)
  if (!hits.length) return ctx.reply('Sin serie.')
  await ctx.reply(
    `${hits[0].source} (${hits.length} mostrados)\n` + hits.map((c) => `• ${c.name}`).join('\n')
  )
}

export async function handleSerieList(ctx) {
  const sources = [...new Set(loadChars().map((c) => c.source).filter(Boolean))].sort()
  const page = Math.max(1, Number(text(ctx)) || 1)
  const size = 25
  const slice = sources.slice((page - 1) * size, page * size)
  await ctx.reply(
    `Series ${page}/${Math.ceil(sources.length / size)}\n` + slice.map((s) => `• ${s}`).join('\n')
  )
}

export async function handleGinfo(ctx) {
  await ctx.reply(
    'Gacha\n/rw roll (15 min)\n/claim reclama el roll (2 min)\n/harem tu lista\n/winfo nombre\n/sell nombre\n/givechar responde a alguien + nombre'
  )
}

export async function handleSell(ctx) {
  const u = userOf(ctx)
  const q = text(ctx).toLowerCase()
  if (!q) return ctx.reply('Uso: /sell nombre')
  const i = u.harem.findIndex((c) => c.name.toLowerCase().includes(q))
  if (i < 0) return ctx.reply('No esta en tu harem.')
  const char = u.harem.splice(i, 1)[0]
  const pay = Math.floor((char.value || 1000) * 0.4)
  u.coins += pay
  persist()
  await ctx.reply(`Vendiste ${char.name} por ${fmt(pay)} ${CURRENCY}.`)
}

export async function handleBuyChar(ctx) {
  return ctx.reply('En Telegram reclama con /rw y /claim. /buychar no usa tienda global.')
}

export async function handleGiveChar(ctx) {
  const u = userOf(ctx)
  const t = targetFrom(ctx)
  const q = text(ctx).toLowerCase()
  if (!t || !q) return ctx.reply('Responde a alguien y usa /givechar nombre')
  const i = u.harem.findIndex((c) => c.name.toLowerCase().includes(q))
  if (i < 0) return ctx.reply('No esta en tu harem.')
  const char = u.harem.splice(i, 1)[0]
  otherUser(t).harem.push(char)
  persist()
  await ctx.reply(`Regalaste ${char.name} a ${targetName(t)}.`)
}

export async function handleDelChar(ctx) {
  const u = userOf(ctx)
  const q = text(ctx).toLowerCase()
  if (!q) return ctx.reply('Uso: /delchar nombre')
  const i = u.harem.findIndex((c) => c.name.toLowerCase().includes(q))
  if (i < 0) return ctx.reply('No esta en tu harem.')
  const char = u.harem.splice(i, 1)[0]
  persist()
  await ctx.reply(`Borraste ${char.name}.`)
}

export async function handleWaifuBoard(ctx) {
  const top = allUsers()
    .slice()
    .sort((a, b) => (b.harem?.length || 0) - (a.harem?.length || 0))
    .slice(0, 10)
  await ctx.reply(
    'Top harem\n' +
      top.map((u, i) => `${i + 1}. ${u.name || u.id} — ${u.harem?.length || 0}`).join('\n')
  )
}

export async function handleVote(ctx) {
  const u = userOf(ctx)
  if (await needWait(ctx, u, 'vote', 'votar')) return
  setCooldown(u, 'vote', DAY)
  u.coins += 3000
  persist()
  await ctx.reply(`Voto registrado. +3000 ${CURRENCY}.`)
}

export async function handleTrade(ctx) {
  return ctx.reply('Trade en Telegram: responde a alguien y usa /givechar nombre.')
}

export async function handleProfile(ctx) {
  const t = targetFrom(ctx)
  const u = t ? otherUser(t) : userOf(ctx)
  persist()
  const p = u.profile || {}
  await ctx.reply(
    `Perfil de ${u.name || 'alguien'}\nNivel ${u.level || 1} · XP ${u.xp || 0}\n` +
      `Monedas: ${fmt(u.coins)} ${CURRENCY}\n` +
      `Genero: ${p.genre || '—'}\n` +
      `Nacimiento: ${p.birth || '—'}\n` +
      `Pasatiempos: ${(p.hobbies || []).join(', ') || '—'}\n` +
      `Pareja: ${u.marriedTo || '—'}\n` +
      `${p.desc || 'Sin descripcion.'}`
  )
}

export async function handleLevel(ctx) {
  const u = userOf(ctx)
  const need = (u.level || 1) * 50
  if ((u.xp || 0) < need) return ctx.reply(`XP ${u.xp || 0}/${need} para nivel ${(u.level || 1) + 1}.`)
  u.xp -= need
  u.level = (u.level || 1) + 1
  persist()
  await ctx.reply(`Subiste a nivel ${u.level}.`)
}

function setField(ctx, key, label) {
  const u = userOf(ctx)
  const v = text(ctx)
  if (!v) return ctx.reply(`Uso: /${label} texto`)
  u.profile[key] = v.slice(0, 200)
  persist()
  return ctx.reply('Listo.')
}

export async function handleSetDesc(ctx) { return setField(ctx, 'desc', 'setdesc') }
export async function handleDelDesc(ctx) { userOf(ctx).profile.desc = ''; persist(); return ctx.reply('Descripcion borrada.') }
export async function handleSetBirth(ctx) { return setField(ctx, 'birth', 'setbirth') }
export async function handleDelBirth(ctx) { userOf(ctx).profile.birth = ''; persist(); return ctx.reply('Nacimiento borrado.') }
export async function handleSetGenre(ctx) { return setField(ctx, 'genre', 'setgenre') }
export async function handleDelGenre(ctx) { userOf(ctx).profile.genre = ''; persist(); return ctx.reply('Genero borrado.') }
export async function handleSetHobby(ctx) {
  const v = text(ctx)
  if (!v) return ctx.reply('Uso: /sethobby texto')
  const u = userOf(ctx)
  u.profile.hobbies = u.profile.hobbies || []
  if (u.profile.hobbies.length >= 8) return ctx.reply('Maximo 8.')
  u.profile.hobbies.push(v.slice(0, 40))
  persist()
  return ctx.reply('Pasatiempo agregado.')
}
export async function handleDelHobby(ctx) {
  const u = userOf(ctx)
  const q = text(ctx).toLowerCase()
  u.profile.hobbies = (u.profile.hobbies || []).filter((h) => !h.toLowerCase().includes(q))
  persist()
  return ctx.reply('Listo.')
}
export async function handleMarry(ctx) {
  const t = targetFrom(ctx)
  if (!t) return ctx.reply('Responde al mensaje de quien quieres.')
  const u = userOf(ctx)
  if (u.marriedTo) return ctx.reply('Ya tienes pareja. /divorce primero.')
  const other = otherUser(t)
  if (other.marriedTo) return ctx.reply('Esa persona ya tiene pareja.')
  const name = targetName(t)
  u.marriedTo = name
  other.marriedTo = u.name
  persist()
  await ctx.reply(`Ahora ${u.name} y ${name} son pareja.`)
}
export async function handleDivorce(ctx) {
  const u = userOf(ctx)
  if (!u.marriedTo) return ctx.reply('No tienes pareja.')
  const partnerName = u.marriedTo
  const partner = allUsers().find((x) => x.name === partnerName || x.marriedTo === u.name)
  if (partner) partner.marriedTo = null
  u.marriedTo = null
  persist()
  await ctx.reply('Listo. Ya no hay pareja.')
}

async function apiGet(pathAndQuery) {
  const { apiUrl, apiKey } = getConfig()
  const url = `${apiUrl}${pathAndQuery}${pathAndQuery.includes('?') ? '&' : '?'}key=${apiKey}`
  const res = await fetch(url)
  return res
}

export { handleIa } from './ai.js'

export async function handleWiki(ctx) {
  const q = text(ctx)
  if (!q) return ctx.reply('Uso: /wiki tema')
  try {
    const res = await fetch(
      `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json`,
      { headers: { 'User-Agent': 'Luffy7-Telegram' } }
    )
    const json = await res.json()
    const results = json?.query?.search || []
    if (!results.length) return ctx.reply('Sin resultados.')
    const lines = results.slice(0, 4).map((r) => {
      const snip = String(r.snippet || '').replace(/<[^>]+>/g, '')
      return `• ${r.title}\n${snip}`
    })
    await ctx.reply(`Wikipedia: ${q}\n\n` + lines.join('\n\n'))
  } catch (e) {
    await ctx.reply('Error: ' + errText(e))
  }
}

export async function handleImagen(ctx) {
  const q = text(ctx)
  if (!q) return ctx.reply('Uso: /imagen tema')
  const status = await ctx.reply('Buscando imagen...')
  try {
    const { apiUrl, apiKey } = getConfig()
    const res = await fetch(`${apiUrl}/search/googleimagen?query=${encodeURIComponent(q)}&key=${apiKey}`)
    const ctype = (res.headers.get('content-type') || '').toLowerCase()
    if (!res.ok || !ctype.includes('image')) {
      return ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Sin imagen para eso.')
    }
    const buf = Buffer.from(await res.arrayBuffer())
    await ctx.replyWithPhoto(new InputFile(buf, 'img.jpg'), { caption: q })
    await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {})
  } catch (e) {
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Error: ' + errText(e)).catch(() => {})
  }
}

export async function handlePin(ctx) {
  const q = text(ctx)
  if (!q) return ctx.reply('Uso: /pin tema o link')
  const status = await ctx.reply('Buscando...')
  try {
    const { apiUrl, apiKey } = getConfig()
    const isUrl = /^https?:\/\//i.test(q)
    const url = isUrl
      ? `${apiUrl}/dl/pinterest?url=${encodeURIComponent(q)}&key=${apiKey}`
      : `${apiUrl}/search/pinterest?query=${encodeURIComponent(q)}&key=${apiKey}`
    const res = await fetch(url)
    const ctype = (res.headers.get('content-type') || '').toLowerCase()
    if (ctype.includes('image')) {
      const buf = Buffer.from(await res.arrayBuffer())
      await ctx.replyWithPhoto(new InputFile(buf, 'pin.jpg'), { caption: q })
      await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {})
      return
    }
    const json = await res.json().catch(() => ({}))
    const link = json.result || json.url || json.data?.url
    if (link) {
      await ctx.replyWithPhoto(String(link), { caption: q }).catch(async () => {
        await ctx.reply(String(link))
      })
      await ctx.api.deleteMessage(ctx.chat.id, status.message_id).catch(() => {})
      return
    }
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Sin resultado.')
  } catch (e) {
    await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Error: ' + errText(e)).catch(() => {})
  }
}

export async function handleYtSearch(ctx) {
  const q = text(ctx)
  if (!q) return ctx.reply('Uso: /ytsearch tema')
  try {
    const yts = (await import('yt-search')).default
    const r = await yts(q)
    const vids = (r.videos || []).slice(0, 5)
    if (!vids.length) return ctx.reply('Sin videos.')
    await ctx.reply(
      vids.map((v, i) => `${i + 1}. ${v.title}\n${v.url}`).join('\n\n')
    )
  } catch (e) {
    await ctx.reply('Error: ' + errText(e))
  }
}

export async function handleTtSearch(ctx) {
  const q = text(ctx)
  if (!q) return ctx.reply('Uso: /ttsearch tema')
  try {
    const { apiUrl, apiKey } = getConfig()
    const res = await fetch(`${apiUrl}/search/tiktok?query=${encodeURIComponent(q)}&key=${apiKey}`)
    const json = await res.json()
    const list = json.result || json.results || json.data || []
    const arr = Array.isArray(list) ? list.slice(0, 5) : []
    if (!arr.length) return ctx.reply('Sin resultados.')
    const lines = arr.map((r, i) => {
      const id = r.id
      const author = r.author?.unique_id || r.author || ''
      const url = r.url || (author && id ? `https://www.tiktok.com/@${author}/video/${id}` : '')
      return `${i + 1}. ${r.title || r.desc || 'video'}\n${url}`
    })
    await ctx.reply(lines.join('\n\n'))
  } catch (e) {
    await ctx.reply('Error: ' + errText(e))
  }
}

export async function handleApk(ctx) {
  const q = text(ctx)
  if (!q) return ctx.reply('Uso: /apk nombre')
  try {
    const { apiUrl, apiKey } = getConfig()
    const res = await fetch(`${apiUrl}/search/apk?query=${encodeURIComponent(q)}&key=${apiKey}`)
    const json = await res.json()
    const item = json.result || json.data || json
    const name = item.name || item.title || q
    const url = item.url || item.link || item.download
    await ctx.reply(url ? `${name}\n${url}` : JSON.stringify(json).slice(0, 800))
  } catch (e) {
    await ctx.reply('Error: ' + errText(e))
  }
}

export async function handleAms(ctx) {
  const q = text(ctx)
  if (!q) return ctx.reply('Uso: /ams tema')
  try {
    const { apiUrl, apiKey } = getConfig()
    const res = await fetch(`${apiUrl}/search/applemusic?query=${encodeURIComponent(q)}&key=${apiKey}`)
    const json = await res.json()
    const item = json.result || json.data || {}
    const title = item.title || item.name || q
    const url = item.url || item.link || ''
    await ctx.reply(url ? `${title}\n${url}` : JSON.stringify(json).slice(0, 800))
  } catch (e) {
    await ctx.reply('Error: ' + errText(e))
  }
}

const ANIME = {
  angry: 'esta enojado/a',
  bleh: 'saca la lengua',
  bored: 'esta aburrido/a',
  kisscheek: 'da un beso en la mejilla',
  clap: 'aplaude',
  coffee: 'toma cafe',
  dramatic: 'hace un drama',
  drunk: 'esta mareado/a',
  impregnate: 'mira raro',
  kiss: 'besa',
  laugh: 'se rie',
  love: 'muestra amor',
  pout: 'hace pucheros',
  punch: 'golpea',
  run: 'corre',
  sad: 'esta triste',
  scared: 'tiene miedo',
  seduce: 'intenta seducir',
  shy: 'se pone timido/a',
  sleep: 'duerme',
  smoke: 'fuma',
  spit: 'escupe',
  step: 'pisa',
  think: 'piensa',
  walk: 'camina',
  hug: 'abraza',
  kill: 'ataca',
  eat: 'come',
  wink: 'guina el ojo',
  pat: 'palmea',
  happy: 'esta feliz',
  bully: 'molesta',
  bite: 'muerde',
  blush: 'se sonroja',
  wave: 'saluda',
  bath: 'se bana',
  smug: 'sonrie de lado',
  smile: 'sonrie',
  highfive: 'choca los cinco',
  handhold: 'toma la mano',
  cringe: 'se averguenza',
  bonk: 'da un bonk',
  cry: 'llora',
  lick: 'lame',
  slap: 'da una bofetada',
  dance: 'baila',
  cuddle: 'se acurruca',
  cold: 'tiene frio',
  sing: 'canta',
  tickle: 'hace cosquillas',
  scream: 'grita',
  push: 'empuja',
  nope: 'dice que no',
  jump: 'salta',
  heat: 'tiene calor',
  gaming: 'juega',
  draw: 'dibuja',
  call: 'llama',
  snuggle: 'se acurruca',
  blowkiss: 'lanza un beso',
  trip: 'tropieza',
  stare: 'mira fijo',
  sniff: 'olfatea',
  curious: 'esta curioso/a',
  thinkhard: 'piensa mucho',
  comfort: 'consuela',
  peek: 'espia'
}

const ANIME_ALIAS = {
  muak: 'kiss',
  beso: 'kisscheek',
  cafe: 'coffee',
  aburrido: 'bored',
  drama: 'dramatic',
  preg: 'impregnate',
  timido: 'shy',
  correr: 'run',
  triste: 'sad',
  amor: 'love',
  fumar: 'smoke',
  escupir: 'spit',
  pisar: 'step',
  comer: 'eat',
  nom: 'eat',
  feliz: 'happy',
  morder: 'bite'
}

export const ANIME_COMMANDS = [...new Set([...Object.keys(ANIME), ...Object.keys(ANIME_ALIAS)])]

export async function handleAnime(ctx) {
  const raw = (ctx.message?.text || '').split(/\s+/)[0].replace(/^\//, '').split('@')[0].toLowerCase()
  const cmd = ANIME_ALIAS[raw] || raw
  const verb = ANIME[cmd] || 'interactua'
  const me = displayName(ctx)
  const t = targetFrom(ctx)
  const caption = t ? `${me} ${verb} a ${targetName(t)}.` : `${me} ${verb}.`
  try {
    const { apiUrl, apiKey } = getConfig()
    const res = await fetch(`${apiUrl}/sfw/interaction?inter=${encodeURIComponent(cmd)}&key=${apiKey}`)
    const json = await res.json()
    const videoUrl = json.result
    if (!json.status || !videoUrl) throw new Error('sin gif')
    await ctx.replyWithAnimation(videoUrl, { caption }).catch(async () => {
      await ctx.replyWithVideo(videoUrl, { caption })
    })
  } catch (e) {
    console.error('[anime]', e)
    await ctx.reply(caption + '\nNo pude bajar el gif.')
  }
}

export async function handleStatus(ctx) {
  const chat = chatOf(ctx)
  await ctx.reply(
    `Chat ${ctx.chat.title || ctx.chat.type}\n` +
      `rpg ${chat.rpg ? 'on' : 'off'} · gacha ${chat.gacha ? 'on' : 'off'} · welcome ${chat.welcome ? 'on' : 'off'}`
  )
}

export async function handleInfobot(ctx) {
  await ctx.reply(
    'Luffy7 Telegram\nHermano del bot de WhatsApp.\n/menu para la lista.\nEconomia y gacha se guardan en data/store.json'
  )
}

export async function handleInvite(ctx) {
  const me = await ctx.api.getMe()
  await ctx.reply(`https://t.me/${me.username}?startgroup=true`)
}

export async function handleSuggest(ctx) {
  const q = text(ctx)
  if (!q) return ctx.reply('Uso: /suggest tu idea')
  console.log('[suggest]', ctx.from?.id, q)
  await ctx.reply('Sugerencia guardada en el log del bot.')
}

function flag(ctx, key) {
  const arg = text(ctx).toLowerCase()
  const chat = chatOf(ctx)
  if (arg === 'enable' || arg === 'on' || arg === '1') {
    chat[key] = true
    persist()
    return ctx.reply(`${key} activado.`)
  }
  if (arg === 'disable' || arg === 'off' || arg === '0') {
    chat[key] = false
    persist()
    return ctx.reply(`${key} desactivado.`)
  }
  return ctx.reply(`${key}: ${chat[key] ? 'on' : 'off'}\nUso: /${key} enable|disable`)
}

export async function handleRpg(ctx) { return flag(ctx, 'rpg') }
export async function handleGachaToggle(ctx) { return flag(ctx, 'gacha') }
export async function handleWelcomeToggle(ctx) {
  const arg = text(ctx).toLowerCase()
  if (!arg) return flag(ctx, 'welcome')
  if (arg === 'enable' || arg === 'disable' || arg === 'on' || arg === 'off') return flag(ctx, 'welcome')
  return ctx.reply('Uso: /welcome enable|disable')
}
export async function handleByeToggle(ctx) { return flag(ctx, 'bye') }

export async function handleSetWelcome(ctx) {
  const v = text(ctx)
  if (!v) return ctx.reply('Uso: /setwelcome texto ({name})')
  chatOf(ctx).welcomeText = v.slice(0, 300)
  persist()
  return ctx.reply('Bienvenida guardada.')
}
export async function handleSetBye(ctx) {
  const v = text(ctx)
  if (!v) return ctx.reply('Uso: /setbye texto ({name})')
  chatOf(ctx).byeText = v.slice(0, 300)
  persist()
  return ctx.reply('Despedida guardada.')
}

async function adminOrStop(ctx) {
  if (ctx.chat?.type === 'private') {
    await ctx.reply('Solo en grupos.')
    return false
  }
  try {
    const m = await ctx.getChatMember(ctx.from.id)
    if (!['creator', 'administrator'].includes(m.status)) {
      await ctx.reply('Solo admins del grupo.')
      return false
    }
  } catch {
    await ctx.reply('No pude ver tus permisos.')
    return false
  }
  return true
}

export async function handleKick(ctx) {
  if (!(await adminOrStop(ctx))) return
  const t = targetFrom(ctx)
  if (!t) return ctx.reply('Responde al mensaje de quien expulsar.')
  try {
    await ctx.banChatMember(t.id)
    await ctx.unbanChatMember(t.id).catch(() => {})
    await ctx.reply(`Expulse a ${targetName(t)}.`)
  } catch (e) {
    await ctx.reply('No pude expulsar. El bot necesita ser admin. ' + errText(e))
  }
}

export async function handlePromote(ctx) {
  if (!(await adminOrStop(ctx))) return
  const t = targetFrom(ctx)
  if (!t) return ctx.reply('Responde al mensaje de quien promover.')
  try {
    await ctx.promoteChatMember(t.id, { can_delete_messages: true, can_restrict_members: true, can_invite_users: true })
    await ctx.reply(`${targetName(t)} ahora es admin.`)
  } catch (e) {
    await ctx.reply('No pude promover. ' + errText(e))
  }
}

export async function handleDemote(ctx) {
  if (!(await adminOrStop(ctx))) return
  const t = targetFrom(ctx)
  if (!t) return ctx.reply('Responde al mensaje de quien degradar.')
  try {
    await ctx.promoteChatMember(t.id, {
      can_delete_messages: false,
      can_restrict_members: false,
      can_invite_users: false,
      can_pin_messages: false,
      can_manage_chat: false
    })
    await ctx.reply(`${targetName(t)} ya no es admin.`)
  } catch (e) {
    await ctx.reply('No pude degradar. ' + errText(e))
  }
}

export async function handleLink(ctx) {
  try {
    const link = await ctx.exportChatInviteLink()
    await ctx.reply(link)
  } catch (e) {
    await ctx.reply('No pude crear el link. El bot necesita poder invitar. ' + errText(e))
  }
}

export async function handleGp(ctx) {
  try {
    const chat = await ctx.getChat()
    const n = await ctx.getChatMemberCount().catch(() => '?')
    await ctx.reply(`${chat.title || 'chat'}\nTipo: ${chat.type}\nMiembros: ${n}\n${chat.description || ''}`)
  } catch (e) {
    await ctx.reply('Error: ' + errText(e))
  }
}

export async function handleWarn(ctx) {
  if (!(await adminOrStop(ctx))) return
  const t = targetFrom(ctx)
  if (!t) return ctx.reply('Responde al mensaje de quien advertir.')
  const chat = chatOf(ctx)
  const id = String(t.id)
  chat.warns[id] = (chat.warns[id] || 0) + 1
  persist()
  await ctx.reply(`${targetName(t)} tiene ${chat.warns[id]}/${chat.warnLimit} advertencias.`)
  if (chat.warns[id] >= chat.warnLimit) {
    try {
      await ctx.banChatMember(t.id)
      await ctx.unbanChatMember(t.id).catch(() => {})
      chat.warns[id] = 0
      persist()
      await ctx.reply('Llego al limite. Expulsado.')
    } catch {
      await ctx.reply('Llego al limite, pero no pude expulsar.')
    }
  }
}

export async function handleWarns(ctx) {
  const t = targetFrom(ctx)
  const chat = chatOf(ctx)
  const id = String((t || ctx.from).id)
  await ctx.reply(`Advertencias: ${chat.warns[id] || 0}/${chat.warnLimit}`)
}

export async function handleDelWarn(ctx) {
  if (!(await adminOrStop(ctx))) return
  const t = targetFrom(ctx)
  if (!t) return ctx.reply('Responde a alguien.')
  chatOf(ctx).warns[String(t.id)] = 0
  persist()
  await ctx.reply('Advertencias borradas.')
}

export async function handleSetWarnLimit(ctx) {
  if (!(await adminOrStop(ctx))) return
  const n = Number(text(ctx))
  if (!n || n < 1 || n > 20) return ctx.reply('Uso: /setwarnlimit 1-20')
  chatOf(ctx).warnLimit = n
  persist()
  await ctx.reply(`Limite: ${n}`)
}

export async function handleSetGpName(ctx) {
  if (!(await adminOrStop(ctx))) return
  const v = text(ctx)
  if (!v) return ctx.reply('Uso: /setgpname nombre')
  try {
    await ctx.setChatTitle(v.slice(0, 128))
    await ctx.reply('Nombre actualizado.')
  } catch (e) {
    await ctx.reply('No pude. ' + errText(e))
  }
}

export async function handleSetGpDesc(ctx) {
  if (!(await adminOrStop(ctx))) return
  const v = text(ctx)
  if (!v) return ctx.reply('Uso: /setgpdesc texto')
  try {
    await ctx.setChatDescription(v.slice(0, 255))
    await ctx.reply('Descripcion actualizada.')
  } catch (e) {
    await ctx.reply('No pude. ' + errText(e))
  }
}

export async function handleOpen(ctx) {
  if (!(await adminOrStop(ctx))) return
  try {
    await ctx.setChatPermissions({
      can_send_messages: true,
      can_send_photos: true,
      can_send_videos: true,
      can_send_other_messages: true
    })
    await ctx.reply('Grupo abierto.')
  } catch (e) {
    await ctx.reply('No pude. ' + errText(e))
  }
}

export async function handleCloset(ctx) {
  if (!(await adminOrStop(ctx))) return
  try {
    await ctx.setChatPermissions({ can_send_messages: false })
    await ctx.reply('Grupo cerrado.')
  } catch (e) {
    await ctx.reply('No pude. ' + errText(e))
  }
}

export async function handleHidetag(ctx) {
  const msg = text(ctx) || ctx.message?.reply_to_message?.text || 'aviso'
  await ctx.reply(msg)
}

export async function handleClear(ctx) {
  const reply = ctx.message?.reply_to_message
  if (!reply) return ctx.reply('Responde al mensaje que quieres borrar.')
  try {
    await ctx.api.deleteMessage(ctx.chat.id, reply.message_id)
    await ctx.deleteMessage().catch(() => {})
  } catch (e) {
    await ctx.reply('No pude borrar ese mensaje. ' + errText(e))
  }
}

export async function handlePfp(ctx) {
  const t = targetFrom(ctx) || ctx.from
  try {
    const photos = await ctx.api.getUserProfilePhotos(t.id, { limit: 1 })
    const fileId = photos.photos?.[0]?.[0]?.file_id
    if (!fileId) return ctx.reply('Sin foto de perfil visible.')
    await ctx.replyWithPhoto(fileId)
  } catch (e) {
    await ctx.reply('No pude. ' + errText(e))
  }
}

export async function waOnly(ctx) {
  await ctx.reply('Ese comando es de la sesion de WhatsApp. En Telegram no aplica.')
}

export function onNewMember(ctx) {
  const chat = chatOf(ctx)
  if (!chat.welcome) return
  const names = (ctx.message?.new_chat_members || []).map((u) => u.first_name).filter(Boolean)
  if (!names.length) return
  return ctx.reply(String(chat.welcomeText || 'Bienvenido/a {name}').replace('{name}', names.join(', ')))
}

export function onLeftMember(ctx) {
  const chat = chatOf(ctx)
  if (!chat.bye) return
  const name = ctx.message?.left_chat_member?.first_name
  if (!name) return
  return ctx.reply(String(chat.byeText || 'Se fue {name}').replace('{name}', name))
}
