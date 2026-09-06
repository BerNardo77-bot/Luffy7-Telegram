# Termux — Luffy7 Telegram

Paso 1 — Paquetes: nodejs-lts, git, ffmpeg

Paso 2 — Clonar repo BerNardo77-bot/Luffy7-Telegram

Paso 3 — Token en BotFather (API Token)

Paso 4 — Crear .env desde .env.example con TELEGRAM_BOT_TOKEN

Paso 5 — Instalar dependencias y arrancar el bot

  npm install
  # Stickers (sharp). Si falla el binario nativo en Termux:
  npm install @img/sharp-wasm32
  # o: npm install --cpu=wasm32 sharp
  npm start

Paso 6 — Abrir el bot en Telegram, Start, probar /help y /sticker

Actualizar: git pull y reiniciar el proceso

Error 401: token invalido, regenerar en BotFather

Notas:
- downloadToFile usa streams .pipe (PassThrough) para no romper en Termux
- Compresion ffmpeg: preset ultrafast, escala 360p
- Documentado en README: dependencia opcional @img/sharp-wasm32
