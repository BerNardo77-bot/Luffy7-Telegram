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
  downloadYoutubeWithYtDlp,
  compressForTelegram,
  ensureMaxHeight,
  isDirectMediaUrl,
  tmpPath,
  safeUnlink,
  mb,
  MAX_DOWNLOAD,
  argText,
  errText,
  isNsfwEnabled
} from './api.js'
import { handleSticker, handlePhotoCaption } from './commands/stickers.js'
import { handleHelp, handlePing } from './commands/info.js'
import { handleTranslate } from './commands/translate.js'
import { createDownloadHandlers } from './commands/downloads.js'
import {
  handleDanbooru,
  handleGelbooru,
  handleR34,
  handleNsfwInteraction,
  NSFW_INTERACTION_COMMANDS,
  createXnxxHandler
} from './commands/nsfw.js'
import { bumpCount } from './store.js'
import {
  handleBalance, handleDaily, handleDeposit, handleWithdraw, handleWork, handleCrime,
  handleSlut, handleFish, handleHunt, handleMine, handleRitual, handleDungeon,
  handleSteal, handleGiveCoins, handleFlip, handleSlot, handleRoulette, handlePpt,
  handleMath, handleResponder, handleBoard, handleCount, handleTopCount, handleWait,
  handleRoll, handleClaim, handleHarem, handleWinfo, handleSerieInfo, handleSerieList,
  handleGinfo, handleSell, handleBuyChar, handleGiveChar, handleDelChar, handleWaifuBoard,
  handleVote, handleTrade, handleProfile, handleLevel, handleSetDesc, handleDelDesc,
  handleSetBirth, handleDelBirth, handleSetGenre, handleDelGenre, handleSetHobby,
  handleDelHobby, handleMarry, handleDivorce, handleIa, handleWiki, handleImagen,
  handlePin, handleYtSearch, handleTtSearch, handleApk, handleAms, handleAnime,
  ANIME_COMMANDS, handleStatus, handleInfobot, handleInvite, handleSuggest,
  handleRpg, handleGachaToggle, handleWelcomeToggle, handleByeToggle, handleSetWelcome,
  handleSetBye, handleKick, handlePromote, handleDemote, handleLink, handleGp,
  handleWarn, handleWarns, handleDelWarn, handleSetWarnLimit, handleSetGpName,
  handleSetGpDesc, handleOpen, handleCloset, handleHidetag, handleClear, handlePfp,
  waOnly, onNewMember, onLeftMember
} from './commands/world.js'

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  console.error('Falta TELEGRAM_BOT_TOKEN en .env')
  process.exit(1)
}

const useLocalApi = Boolean(process.env.TELEGRAM_API_ROOT)
const MAX_SEND = Number(
  process.env.MAX_SEND_BYTES || (useLocalApi ? 1900 * 1024 * 1024 : 49 * 1024 * 1024)
)

const botOpts = useLocalApi
  ? { client: { apiRoot: process.env.TELEGRAM_API_ROOT.replace(/\/$/, '') } }
  : undefined

const bot = new Bot(token, botOpts)

bot.use(async (ctx, next) => {
  try {
    const text = ctx.message?.text || ctx.message?.caption || ''
    if (text || ctx.update?.update_id) {
      console.log(
        '[msg]',
        ctx.update?.update_id,
        ctx.chat?.type,
        ctx.from?.id,
        String(text).slice(0, 80)
      )
    }
  } catch {}
  try {
    if (ctx.message && ctx.from && !ctx.from.is_bot) bumpCount(ctx)
  } catch (e) {
    console.error('[count]', e?.message || e)
  }
  try {
    await next()
  } catch (e) {
    console.error('[handler]', e)
    throw e
  }
})

// Respuestas basicas forzadas (no depender del router de command)
bot.on('message:text', async (ctx, next) => {
  const raw = String(ctx.message?.text || '')
  const cmd = raw.split(/\s+/)[0].split('@')[0].toLowerCase()
  console.log('[cmd]', cmd)
  if (cmd === '/ping' || cmd === '/p') {
    return handlePing(ctx)
  }
  if (cmd === '/start' || cmd === '/help' || cmd === '/menu') {
    return handleHelp(ctx)
  }
  await next()
})


async function sendOrCompress(ctx, filePath, { kind, fileName, caption, statusId, fallbackLink }) {
  let pathToSend = filePath
  let size = fs.statSync(pathToSend).size
  let compressedPath = null

  if (size > MAX_SEND) {
    if (statusId) {
      await ctx.api
        .editMessageText(
          ctx.chat.id,
          statusId,
          `Pesa ${mb(size)} MB. Telegram cloud max ~50 MB. Comprimiendo...`
        )
        .catch(() => {})
    }
    compressedPath = await compressForTelegram(pathToSend, MAX_SEND)
    if (compressedPath && fs.existsSync(compressedPath)) {
      pathToSend = compressedPath
      size = fs.statSync(pathToSend).size
    }
  }

  if (size > MAX_SEND) {
    const msg =
      `Archivo ${mb(fs.statSync(filePath).size)} MB` +
      (compressedPath ? ` (comprimido ${mb(size)} MB)` : '') +
      `.\nTelegram cloud solo envia ~50 MB.\n` +
      `Si es muy largo, prueba /play (audio) o abre el link.\n` +
      (fallbackLink ? `\nEnlace directo:\n${fallbackLink}` : '')
    if (statusId) {
      await ctx.api.editMessageText(ctx.chat.id, statusId, msg).catch(() => ctx.reply(msg))
    } else {
      await ctx.reply(msg)
    }
    safeUnlink(compressedPath)
    return false
  }

  const input = new InputFile(pathToSend, fileName)
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
  safeUnlink(compressedPath)
  if (statusId) await ctx.api.deleteMessage(ctx.chat.id, statusId).catch(() => {})
  return true
}

async function handlePlay(ctx) {
  const q = argText(ctx)
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
    await sendOrCompress(ctx, out, {
      kind: 'audio',
      fileName: name,
      caption: got.title || video.title,
      statusId: status.message_id,
      fallbackLink: got.dl
    })
  } catch (e) {
    console.error(e)
    await ctx.api
      .editMessageText(ctx.chat.id, status.message_id, 'Error: ' + errText(e))
      .catch(() => ctx.reply(errText(e)))
  } finally {
    safeUnlink(out)
  }
}

async function handleVideo(ctx, quality = 'fit') {
  const q = argText(ctx)
  if (!q) return ctx.reply(quality === 'hd' ? 'Uso: /ytvideohd nombre o link de YouTube' : 'Uso: /ytvideo nombre o link de YouTube')
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
    // 1) yt-dlp primero (mas fiable que URLs Alyacore que dan 302)
    let usedLink = video.url
    let got = { title: video.title }
    let usedYtdlp = false
    try {
      await ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        quality === 'hd' ? 'Alta calidad (1080p). Bajando con yt-dlp...' : 'Bajando con yt-dlp (puede tardar)...'
      )
      await downloadYoutubeWithYtDlp(video.url || q, out, quality)
      usedYtdlp = true
    } catch (yterr) {
      console.error('[ytvideo] yt-dlp', yterr)
      await ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        'yt-dlp fallo. Probando API Alyacore...'
      ).catch(() => {})
      got = await getVideoLink(video.url, video.title)
      if (got.error || !got.dl) {
        return ctx.api.editMessageText(
          ctx.chat.id,
          status.message_id,
          'No pude bajar el video.\n' +
            errText(yterr) +
            '\n' +
            (got.error || 'API sin link') +
            '\n\nTip Termux:\npkg install python\npip install -U yt-dlp\n\nLink limpio:\n/ytvideo https://youtu.be/' +
            (String(video.videoId || ''))
        )
      }
      usedLink = got.dl
      await ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        `Descargando API (tope ${mb(MAX_DOWNLOAD)} MB)...`
      )
      try {
        await downloadToFile(got.dl, out, { timeout: 1_800_000 })
      } catch (e) {
        return ctx.api.editMessageText(
          ctx.chat.id,
          status.message_id,
          'Descarga fallo (¿302?).\n' + errText(e) + '\nInstala/actualiza yt-dlp.'
        )
      }
    }
    const size = fs.statSync(out).size
    const fd = fs.openSync(out, 'r')
    const head = Buffer.alloc(8)
    fs.readSync(fd, head, 0, 8, 0)
    fs.closeSync(fd)
    const brand = head.slice(4, 8).toString()
    if (brand !== 'ftyp' && !usedYtdlp) {
      return ctx.api.editMessageText(ctx.chat.id, status.message_id, 'La API no devolvio un MP4 valido.')
    }
    if (brand !== 'ftyp' && usedYtdlp) {
      try {
        const remuxed = out.replace(/\.mp4$/i, '') + '-remux.mp4'
        const { execFile } = await import('child_process')
        const { promisify } = await import('util')
        const execFileAsync = promisify(execFile)
        await execFileAsync(
          'ffmpeg',
          ['-y', '-i', out, '-c', 'copy', '-movflags', '+faststart', remuxed],
          { timeout: 300000 }
        )
        if (fs.existsSync(remuxed) && fs.statSync(remuxed).size) {
          fs.renameSync(remuxed, out)
        }
      } catch (re) {
        console.error('[ytvideo] remux', re)
      }
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
    await sendOrCompress(ctx, out, {
      kind: 'video',
      fileName: name,
      caption: (got.title || video.title) + (quality === 'hd' ? ' (HD)' : ''),
      statusId: status.message_id,
      fallbackLink: usedLink || video.url
    })
  } catch (e) {
    console.error(e)
    await ctx.api
      .editMessageText(ctx.chat.id, status.message_id, 'Error: ' + errText(e))
      .catch(() => ctx.reply(errText(e)))
  } finally {
    safeUnlink(out)
  }
}

async function downloadAndSendMedia(ctx, mediaUrl, { title = 'video', status }) {
  const out = tmpPath(`${Date.now()}-media.mp4`)
  try {
    await ctx.api.editMessageText(
      ctx.chat.id,
      status.message_id,
      `Bajando a disco (tope ${mb(MAX_DOWNLOAD)} MB)...`
    )
    const size = await downloadToFile(mediaUrl, out, { timeout: 1_800_000 })
    await ctx.api.editMessageText(
      ctx.chat.id,
      status.message_id,
      `Descargado ${mb(size)} MB. Preparando envio...`
    )
    await sendOrCompress(ctx, out, {
      kind: 'video',
      fileName: 'video.mp4',
      caption: title,
      statusId: status.message_id,
      fallbackLink: mediaUrl
    })
  } finally {
    safeUnlink(out)
  }
}

async function handleXvideos(ctx) {
  if (!isNsfwEnabled()) return ctx.reply('🔞 NSFW desactivado (NSFW_ENABLED=false).')
  const q = argText(ctx)
  if (!q) return ctx.reply('Uso: /xvideos nombre, URL de XVideos, o link .mp4 CDN\nBaja a 720p. Si no cabe, comprime a ~50 MB.')
  const status = await ctx.reply('Procesando XVideos (720p)...')

  try {
    if (isDirectMediaUrl(q)) {
      const out = tmpPath(`${Date.now()}-xvideos-cdn.mp4`)
      try {
        await ctx.api.editMessageText(
          ctx.chat.id,
          status.message_id,
          `Bajando a disco (tope ${mb(MAX_DOWNLOAD)} MB)...`
        )
        await downloadToFile(q, out, { timeout: 1_800_000 })
        await ctx.api.editMessageText(ctx.chat.id, status.message_id, 'Ajustando a 720p...')
        await ensureMaxHeight(out, 720)
        const size = fs.statSync(out).size
        await ctx.api.editMessageText(
          ctx.chat.id,
          status.message_id,
          `${mb(size)} MB en 720p. Preparando envio...`
        )
        await sendOrCompress(ctx, out, {
          kind: 'video',
          fileName: 'xvideos.mp4',
          caption: 'xvideos (720p)',
          statusId: status.message_id,
          fallbackLink: q
        })
      } finally {
        safeUnlink(out)
      }
      return
    }

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
        `${title}\n${pick.duration || ''}\n${videoUrl}`
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

    const out = tmpPath(`${Date.now()}-xvideos.mp4`)
    let usedLink = null
    let usedQuality = ''
    let lastErr = ''
    try {
      for (const c of got.candidates) {
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            status.message_id,
            `Bajando calidad ${c.quality} (objetivo 720p)...`
          )
          await downloadToFile(c.url, out, { timeout: 1_800_000 })
          usedLink = c.url
          usedQuality = c.quality
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

      let size = fs.statSync(out).size
      await ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        `Descargado ${mb(size)} MB. Ajustando a 720p...`
      )
      await ensureMaxHeight(out, 720)
      size = fs.statSync(out).size
      await ctx.api.editMessageText(
        ctx.chat.id,
        status.message_id,
        `${mb(size)} MB en 720p. Preparando envio...`
      )

      await sendOrCompress(ctx, out, {
        kind: 'video',
        fileName: 'xvideos.mp4',
        caption: title + ' (720p)',
        statusId: status.message_id,
        fallbackLink: usedLink
      })
    } finally {
      safeUnlink(out)
    }
  } catch (e) {
    console.error(e)
    await ctx.api
      .editMessageText(ctx.chat.id, status.message_id, 'Error: ' + errText(e))
      .catch(() => ctx.reply(errText(e)))
  }
}

async function handleDl(ctx) {
  const q = argText(ctx)
  if (!q || !/^https?:\/\//i.test(q)) {
    return ctx.reply('Uso: /dl https://....mp4')
  }
  const status = await ctx.reply('Descargando link directo...')
  try {
    await downloadAndSendMedia(ctx, q, { title: 'archivo', status })
  } catch (e) {
    console.error(e)
    await ctx.api
      .editMessageText(ctx.chat.id, status.message_id, 'Error: ' + errText(e))
      .catch(() => ctx.reply(errText(e)))
  }
}

const {
  handleTiktok,
  handleTiktokMp3,
  handleInstagram,
  handleFacebook,
  handleSpotify,
  handleMediafire
} = createDownloadHandlers(sendOrCompress)

async function handleVideoHd(ctx) {
  return handleVideo(ctx, 'hd')
}

const handleXnxx = createXnxxHandler(sendOrCompress)

bot.command(['start', 'help', 'menu'], handleHelp)
bot.command(['ping', 'p'], handlePing)
bot.command(['traducir', 'translate'], handleTranslate)
bot.command(['sticker', 's'], handleSticker)
bot.on('message:photo', handlePhotoCaption)

bot.command(['play', 'mp3', 'ytmp3', 'ytaudio', 'playaudio'], handlePlay)
bot.command(['ytvideo', 'mp4', 'playvideo', 'play2', 'ytmp4'], handleVideo)
bot.command(['ytvideohd', 'mp4hd', 'hdvideo', 'playvideohd'], handleVideoHd)
bot.command(['xvideos', 'xv'], handleXvideos)
bot.command(['dl', 'get'], handleDl)

bot.command(['tiktok', 'tt', 'tk', 'tiktokdl'], handleTiktok)
bot.command(['tiktokmp3', 'ttmp3', 'ttaudio', 'tiktokaudio', 'playtt'], handleTiktokMp3)
bot.command(['ig', 'instagram', 'reel'], handleInstagram)
bot.command(['fb', 'facebook'], handleFacebook)
bot.command(['spotify', 'sp'], handleSpotify)
bot.command(['mediafire', 'mf'], handleMediafire)

bot.command(['danbooru', 'dbooru'], handleDanbooru)
bot.command(['gelbooru', 'gbooru'], handleGelbooru)
bot.command(['r34', 'rule34', 'rule'], handleR34)
bot.command(['xnxx'], handleXnxx)
bot.command(NSFW_INTERACTION_COMMANDS, handleNsfwInteraction)

bot.command(['balance', 'bal'], handleBalance)
bot.command(['daily'], handleDaily)
bot.command(['dep', 'deposit', 'd'], handleDeposit)
bot.command(['withdraw', 'with'], handleWithdraw)
bot.command(['w', 'work'], handleWork)
bot.command(['crime'], handleCrime)
bot.command(['slut'], handleSlut)
bot.command(['pescar', 'fish'], handleFish)
bot.command(['cazar', 'hunt'], handleHunt)
bot.command(['mine'], handleMine)
bot.command(['ritual'], handleRitual)
bot.command(['dungeon', 'mazmorra'], handleDungeon)
bot.command(['steal', 'rob', 'robar'], handleSteal)
bot.command(['givecoins', 'pay', 'coinsgive'], handleGiveCoins)
bot.command(['cf', 'flip', 'coinflip'], handleFlip)
bot.command(['slot'], handleSlot)
bot.command(['rt', 'roulette', 'ruleta'], handleRoulette)
bot.command(['ppt'], handlePpt)
bot.command(['math', 'matematicas'], handleMath)
bot.command(['responder'], handleResponder)
bot.command(['economyboard', 'eboard', 'baltop'], handleBoard)
bot.command(['count', 'mensajes', 'messages', 'msgcount'], handleCount)
bot.command(['topcount', 'topmensajes', 'topmsgcount', 'topmessages'], handleTopCount)
bot.command(['waittimes', 'cooldowns', 'economyinfo', 'einfo'], handleWait)

bot.command(['rollwaifu', 'roll', 'rw', 'rf'], handleRoll)
bot.command(['claim', 'c'], handleClaim)
bot.command(['harem', 'miswaifus', 'claims'], handleHarem)
bot.command(['winfo', 'charinfo', 'cinfo'], handleWinfo)
bot.command(['charimage', 'wimage', 'cimage'], handleWinfo)
bot.command(['serieinfo', 'animeinfo', 'ainfo'], handleSerieInfo)
bot.command(['slist', 'serielist', 'animelist'], handleSerieList)
bot.command(['gachainfo', 'ginfo', 'infogacha'], handleGinfo)
bot.command(['sell', 'vender'], handleSell)
bot.command(['buycharacter', 'buychar', 'buyc'], handleBuyChar)
bot.command(['givechar', 'givewaifu', 'regalar'], handleGiveChar)
bot.command(['delchar', 'delwaifu', 'deletechar'], handleDelChar)
bot.command(['waifusboard', 'waifustop', 'topwaifus'], handleWaifuBoard)
bot.command(['vote', 'votar'], handleVote)
bot.command(['trade', 'cambiar', 'accepttrade', 'aceptarintercambio', 'giveallharem', 'haremshop', 'tiendawaifus', 'wshop', 'removesale', 'removerventa'], handleTrade)

bot.command(['profile', 'perfil'], handleProfile)
bot.command(['levelup', 'level', 'lvl'], handleLevel)
bot.command(['setdescription', 'setdesc'], handleSetDesc)
bot.command(['deldescription', 'deldesc'], handleDelDesc)
bot.command(['setbirth'], handleSetBirth)
bot.command(['delbirth'], handleDelBirth)
bot.command(['setgenre'], handleSetGenre)
bot.command(['delgenre'], handleDelGenre)
bot.command(['setpasatiempo', 'sethobby'], handleSetHobby)
bot.command(['delpasatiempo', 'removehobby'], handleDelHobby)
bot.command(['marry'], handleMarry)
bot.command(['divorce'], handleDivorce)

bot.command(['ia', 'chatgpt'], handleIa)
bot.command(['wiki', 'wikipedia'], handleWiki)
bot.command(['imagen', 'img', 'image'], handleImagen)
bot.command(['pinterest', 'pin'], handlePin)
bot.command(['ytsearch', 'search'], handleYtSearch)
bot.command(['tiktoksearch', 'ttsearch', 'tts'], handleTtSearch)
bot.command(['aptoide', 'apk', 'apkdl'], handleApk)
bot.command(['ams', 'applemusicsearch'], handleAms)
bot.command(ANIME_COMMANDS, handleAnime)

bot.command(['status'], handleStatus)
bot.command(['infobot', 'infosocket', 'info'], handleInfobot)
bot.command(['invite', 'invitar'], handleInvite)
bot.command(['report', 'reporte', 'sug', 'suggest'], handleSuggest)
bot.command(['rpg', 'economy', 'economia'], handleRpg)
bot.command(['gacha'], handleGachaToggle)
bot.command(['welcome', 'bienvenidas'], handleWelcomeToggle)
bot.command(['bye', 'despedidas', 'goodbye'], handleByeToggle)
bot.command(['setwelcome'], handleSetWelcome)
bot.command(['setbye'], handleSetBye)
bot.command(['kick'], handleKick)
bot.command(['promote'], handlePromote)
bot.command(['demote'], handleDemote)
bot.command(['link'], handleLink)
bot.command(['gp', 'groupinfo'], handleGp)
bot.command(['warn'], handleWarn)
bot.command(['warns'], handleWarns)
bot.command(['delwarn'], handleDelWarn)
bot.command(['setwarnlimit'], handleSetWarnLimit)
bot.command(['setgpname'], handleSetGpName)
bot.command(['setgpdesc'], handleSetGpDesc)
bot.command(['open'], handleOpen)
bot.command(['closet'], handleCloset)
bot.command(['hidetag', 'tag'], handleHidetag)
bot.command(['clear'], handleClear)
bot.command(['pfp', 'getpic'], handlePfp)
bot.command(['bot'], handleStatus)

bot.on('message:new_chat_members', onNewMember)
bot.on('message:left_chat_member', onLeftMember)

bot.command(['eval', 'e', 'restart', 'fix', 'update', 'bots', 'sockets', 'leave', 'logout', 'reload', 'self', 'subbot', 'code', 'qr', 'antilink', 'antienlaces', 'antistatus', 'antiestados', 'adminonly', 'onlyadmin', 'reveal', 'viewonce', 'ver', 'newpack', 'delpack', 'getpack', 'pack', 'packlist', 'addsticker', 'delsticker', 'setbotname', 'setname', 'setbotprefix', 'setusername'], waOnly)

bot.catch((err) => console.error('Bot error', err?.error || err?.message || err, err?.ctx?.message?.text || ''))

console.log('Luffy7 Telegram v1.5.9 arrancando...')

async function goOnline() {
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: true })
  } catch (e) {
    console.error('No se pudo borrar webhook:', e?.description || e?.message || e)
  }
  const me = await bot.api.getMe()
  console.log('Luffy7 Telegram online como @' + me.username)
  console.log(
    'download<=',
    mb(MAX_DOWNLOAD),
    'MB | send<=',
    mb(MAX_SEND),
    'MB | localApi=',
    useLocalApi
  )
  console.log('Comandos: /menu /sticker /play /tiktok /ig /fb /spotify ...')
  console.log('Si mandas /start y no responde, otro proceso usa el mismo token.')
  const keepAlive = setInterval(() => {
    console.log('[vivo]', new Date().toISOString(), 'esperando mensajes...')
  }, 30000)

  await bot.start({
    drop_pending_updates: true,
    allowed_updates: ['message', 'callback_query', 'edited_message'],
    onStart: (info) => {
      console.log('Polling activo:', info.username)
      console.log('Deja esta ventana abierta. Si aparece $ el bot ya se cerro.')
    }
  })
  clearInterval(keepAlive)
  console.log('Polling terminado. El bot ya no escucha.')
}

goOnline().catch((e) => {
  const code = e?.error_code || e?.error?.error_code || e?.error?.error_code
  console.error('No arranco el bot:', e?.description || e?.message || e)
  if (code === 409 || String(e?.message || e).includes('409')) {
    console.error('409: otro Termux, celular o Railway ya usa este token. Cierra ese y reintenta.')
  }
  process.exit(1)
})

process.on('unhandledRejection', (e) => {
  console.error('unhandledRejection', e)
})
process.on('uncaughtException', (e) => {
  console.error('uncaughtException', e)
})
