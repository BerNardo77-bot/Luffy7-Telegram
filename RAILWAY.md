# Luffy7 Telegram en Railway (bot nuevo, sin Termux)

Repo: https://github.com/BerNardo77-bot/bbboy
Version del codigo: 1.5.18

Esto crea un bot de Telegram NUEVO y lo deja 24/7 en Railway.
@LuffyYampiBot en Termux puede seguir. Cada bot tiene su token.

No uses Cajas de arena / Sandboxes. No hace falta dominio.
Unexposed service esta bien.

---

## 1. Crear el bot en Telegram

1. Abre @BotFather (no el chat de Luffy).
2. Manda /newbot
3. Nombre visible: por ejemplo Luffy7 Cloud
4. Username (unico, termina en bot): por ejemplo Luffy7CloudBot
5. Si esta ocupado, prueba Luffy7NubeBot o Luffy7RailwayBot
6. BotFather te da el token (texto largo con :). Copialo.
   Sin comillas ni espacios. No lo pegues en chats.

---

## 2. Autorizar Railway en GitHub

1. Entra a https://railway.app e inicia sesion con GitHub (cuenta BerNardo77-bot).
2. Si GitHub pide instalar Railway App:
   - Elige Seleccione unicamente repositorios
   - Marca solo bbboy
   - Instalar y autorizar
3. No des Todos los repositorios.

---

## 3. Crear el proyecto

1. En Railway ve a Proyectos (no Cajas de arena).
2. Pulsa Nuevo / Crea un nuevo proyecto.
3. Elige Implemente un repositorio de GitHub.
   No elijas base de datos, proyecto vacio ni sandbox.
4. Repo: bbboy (rama main).
5. Espera a que aparezca el servicio bbboy.
   Unexposed service / US West / 1 Replica esta bien.

---

## 4. Variables

Name NO es el nombre del bot. Es el nombre de la variable, tal cual.

Pulsa New Variable (no Shared Variable) cuatro veces:

1. Name: TELEGRAM_BOT_TOKEN
   Value: el token del bot NUEVO (no el de @LuffyYampiBot)
   Add

2. Name: ALYACORE_API_URL
   Value: https://api.alyacore.xyz
   Add

3. Name: ALYACORE_API_KEY
   Value: LUFFY-FIX67
   Add

4. Name: NSFW_ENABLED
   Value: true
   Add

Si sale Variable overwrite detected: Cancel. Esa variable ya existe.

Deben verse 4 service variables (mas las que Railway pone solo).

---

## 5. Aplicar y arrancar

1. Si ves Apply 1 change, pulsalo.
2. Si no, Deployments → Deploy / Redeploy.
3. Espera a que el deploy quede en verde.
4. Deployments → ultimo deploy → Logs.
5. Debe decir:

Luffy7 Telegram v1.5.18 arrancando...
Luffy7 Telegram online como @TuBotNuevo
Polling activo

6. En Telegram abre el bot NUEVO (no Yampi).
7. Manda /start y /ping.

---

## Si algo falla

409: ese token ya lo usa otro proceso (Termux u otro Railway).
Regenera token en @BotFather (/revoke o /token) y pega el nuevo en TELEGRAM_BOT_TOKEN. Redeploy.

Falta TELEGRAM_BOT_TOKEN: no la pusiste o hay espacio/comilla. Edit Variable, no crees otra con el mismo Name.

401: token mal copiado. Copia de nuevo desde BotFather.

No ves bbboy en Railway: GitHub → Settings → Applications → Railway → Configure → agrega bbboy.

Cajas de arena: salte. Ve a Proyectos → Nuevo → repo GitHub.

Comandos 2 veces: dos procesos con el mismo token. Deja solo Railway o solo Termux para ESE token.

Gacha/economia se resetean al redesplegar: el disco es temporal. Volume en /app/data si quieres guardarlos.

Trial 30 dias / $5: el bot se apaga si no hay plan o credito.

---

## Actualizar el bot en la nube

1. Actualiza el codigo en BerNardo77-bot/bbboy (main).
2. Railway redespliega solo, o pulsa Redeploy.
3. Termux de Yampi no se toca.
