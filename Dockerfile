FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    ca-certificates \
    && pip3 install --break-system-packages -U yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --omit=optional

COPY src ./src
COPY data ./data
COPY README.md TERMUX.md ./

ENV NODE_ENV=production
CMD ["node", "src/index.js"]
