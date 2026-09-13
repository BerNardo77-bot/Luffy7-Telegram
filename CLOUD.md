# Luffy7 Telegram en la nube (Railway o Render)

Version: 1.5.18
Repo: https://github.com/BerNardo77-bot/Luffy7-Telegram
Bot: @LuffyYampiBot

Esto NO es Termux. El bot usa polling (escucha Telegram). No necesita dominio ni webhook.

Antes de arrancar en la nube: apaga Termux. Un solo proceso con el mismo token.
Si Termux sigue con npm start, Telegram da 409 y la nube no responde.

```
# En Termux, solo esto:
cd ~/Luffy7-Telegram
pkill -9 -f node || true
```

No cierres el bot de WhatsApp si esta en el mismo celular; mata solo Node del de Telegram.

---

## Variables (las mismas en Railway o Render)

| Nombre | Valor |
|---|---|
| TELEGRAM_BOT_TOKEN | el token de @BotFather (sin comillas) |
| ALYACORE_API_URL | https://api.alyacore.xyz |
| ALYACORE_API_KEY | LUFFY-FIX67 |
| NSFW_ENABLED | true |

---

## A. Railway (recomendado)

1. Entra a https://railway.app e inicia sesion con GitHub.
2. New Project.
3. Deploy from GitHub repo.
4. Autoriza GitHub si lo pide y elige BerNardo77-bot/Luffy7-Telegram (rama main).
5. Railway detecta el Dockerfile y construye solo.
6. Abre el servicio. Ve a Variables.
7. Add las 4 variables de la tabla. Pega el token real.
8. Deploy / Redeploy si no arranco solo.
9. Abre Logs. Debe salir:

Luffy7 Telegram v1.5.18 arrancando...
Luffy7 Telegram online como @LuffyYampiBot
Polling activo

10. En Telegram, chat con @LuffyYampiBot: /ping y /menu.

No hace falta Public Networking. El bot no es una web.

Economia y gacha: el disco se borra al redesplegar. Para guardarlos, en el servicio agrega un Volume montado en /app/data.

---

## B. Render

El bot debe ser Background Worker (corre siempre, sin URL).
Un Web Service gratis se duerme y el bot deja de contestar.
Background Worker en Render es plan de pago (Starter).

1. Entra a https://dashboard.render.com e inicia sesion con GitHub.
2. New +.
3. Background Worker.
4. Connect BerNardo77-bot/Luffy7-Telegram, rama main.
5. Runtime: Docker (usa el Dockerfile del repo).
6. Start Command: dejalo vacio (el Dockerfile ya hace node src/index.js).
7. Environment: las 4 variables de la tabla.
8. Create Background Worker.
9. Logs: online como @LuffyYampiBot y Polling activo.
10. En Telegram: /ping.

Si por error creaste Web Service: funciona un rato (hay un HTTP health), pero se duerme en el plan gratis.

Disco persistente (opcional): Persistent Disk montado en /app/data.

---

## Si algo falla

409: Termux u otro celular todavia usa el token. pkill -9 -f node en Termux. Solo una nube a la vez (no Railway y Render juntos).

Falta TELEGRAM_BOT_TOKEN: no la pusiste en Variables, o hay un espacio/comilla.

401: token mal copiado. Regeneralo en @BotFather y pega el nuevo.

/play o /ytvideo fallan: espera a que el deploy use el Dockerfile (trae ffmpeg y yt-dlp). Mira Logs: si dice yt-dlp no encontrado, el build no uso Docker.

Comandos salen 2 veces: hay dos procesos. Apaga Termux o borra el otro servicio.

Gacha/economia se resetean: no hay Volume. Agrega /app/data.

---

## Actualizar la nube

Haz push a main. Railway y Render redespliegan solos.
O en el panel: Redeploy.

Sigue apagado Termux.
