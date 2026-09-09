# Luffy7 Telegram — arranque desde cero en Termux

Bot: @LuffyYampiBot
Repo: https://github.com/BerNardo77-bot/Luffy7-Telegram
Version: 1.5.1

Usa Termux de F-Droid, no el de Play Store.

## 1. Actualiza paquetes

```
pkg update
```

```
pkg upgrade -y
```

Si node, ffmpeg o yt-dlp dicen cannot locate symbol:

```
pkg install libc++ openssl
```

```
pkg reinstall nodejs-lts ffmpeg
```

## 2. Instala lo necesario

```
pkg install git
```

```
pkg install nodejs-lts
```

```
pkg install ffmpeg
```

```
pkg install python
```

```
pkg install yt-dlp
```

## 3. Clona el repo

```
cd ~
```

```
git clone https://github.com/BerNardo77-bot/Luffy7-Telegram.git
```

```
cd ~/Luffy7-Telegram
```

## 4. Token

En Telegram abre @BotFather, no el chat del bot.
Copia el API Token. Sin comillas ni espacios.

```
cp .env.example .env
```

Edita .env y deja:

TELEGRAM_BOT_TOKEN=tu_token
ALYACORE_API_URL=https://api.alyacore.xyz
ALYACORE_API_KEY=LUFFY-FIX67
NSFW_ENABLED=true

## 5. Instala y arranca

Si ya habia un proceso con el mismo token, cierralo. Solo uno a la vez.
```

npm install --omit=optional
```

```
node src/index.js
```

En el log debe salir Luffy7 Telegram v1.5.0 y online como @usuario.

## 6. Prueba

Abre el chat privado con @LuffyYampiBot (no BotFather).
Envia /start y luego /menu.

## Si algo falla

401 en getMe: token mal escrito. Regenera en BotFather y pegalo de nuevo en .env. Sin comillas.

409: otro Termux o celular ya usa el mismo token. Cierra ese proceso y vuelve a arrancar.

No borres la carpeta. Economia y gacha se guardan en data/store.json.
