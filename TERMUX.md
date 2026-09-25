# Luffy7 Telegram — arranque desde cero en Termux

Bot: @LuffyYampiBot
Repo: https://github.com/BerNardo77-bot/Luffy7-Telegram
Version: 1.5.22

Usa Termux de F-Droid, no el de Play Store.
Cada bloque es un comando. Copialo, pegalo y da Enter. Espera a que termine antes del siguiente.

---

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

---

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

---

## 3. Clona el repo

```
cd ~
```

```
rm -rf ~/Luffy7-Telegram
```

(Eso borra una carpeta vieja. Si ya tenias economia/gacha y quieres conservarlos, no corras el rm. En ese caso solo: cd ~/Luffy7-Telegram)

```
git clone https://github.com/BerNardo77-bot/Luffy7-Telegram.git
```

```
cd ~/Luffy7-Telegram
```

```
node -p "require('./package.json').version"
```

Debe salir: 1.5.22

---

## 4. Token

1. En Telegram abre @BotFather (no el chat del bot).
2. Manda /token o mira el token que te dio al crear el bot.
3. Copia el API Token. Sin comillas ni espacios.

```
cd ~/Luffy7-Telegram
```

```
cp .env.example .env
```

Edita el archivo:

```
nano .env
```

Debe quedar asi (cambia solo el token):

```
TELEGRAM_BOT_TOKEN=pega_aqui_el_token
ALYACORE_API_URL=https://api.alyacore.xyz
ALYACORE_API_KEY=LUFFY-FIX67
NSFW_ENABLED=true
```

Guarda: Ctrl+O, Enter, Ctrl+X.

---

## 5. Cierra otros procesos

Solo un Node con el mismo token. Si hay dos, cada comando sale 2 veces y Telegram da 409.

```
pkill -9 -f node || true
```

---

## 6. Instala y arranca

```
cd ~/Luffy7-Telegram
```

```
npm install --omit=optional
```

```
npm start
```

En el log debe salir:

Luffy7 Telegram v1.5.22 arrancando...
Polling activo
Luffy7 Telegram online como @LuffyYampiBot

Deja Termux abierto. No cierres la sesion.

---

## 7. Prueba

Abre el chat privado con @LuffyYampiBot (no BotFather).

1. /start
2. /ping
3. /menu
4. /hug
5. /rw

Si /rw responde con personaje, el gacha esta vivo. Reclama con /claim.

---

## Actualizar (si ya lo tenias instalado)

No borres la carpeta. Economia y gacha estan en data/store.json.

```
cd ~/Luffy7-Telegram
```

```
pkill -9 -f node || true
```

```
git fetch origin
```

```
git reset --hard origin/main
```

Instala las dependencias nuevas (desde 1.5.22 `/pdf` convierte páginas web a PDF con `@mozilla/readability`, `linkedom` y `pdfkit`, todas JS puro):

```
npm install --omit=optional
```

```
node -p "require('./package.json').version"
```

Debe salir 1.5.22

```
npm start
```

---

## Si algo falla

401 en getMe: token mal escrito. Regeneralo en @BotFather y pegalo otra vez en .env. Sin comillas.

409: otro Termux o celular ya usa el mismo token. Corre pkill -9 -f node || true y vuelve a npm start.

El prompt quedo en > : te metiste a Node. Escribe .exit y Enter.

Comando sale 2 veces: hay 2 procesos. Mata Node y arranca uno solo.

APKs grandes (GTA 206 MB): Telegram solo deja ~50 MB. El bot te da el link; abrilo en el navegador.

No borres data/store.json. Ahi estan monedas y harem.
