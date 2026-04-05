FROM node:20-bookworm-slim

# System deps for Remotion (Chromium) + ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    chromium \
    fonts-liberation \
    libasound2t64 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    xdg-utils \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Increase Node memory for npm ci (Remotion webpack is heavy)
RUN node --max-old-space-size=4096 $(which npm) ci

COPY . .

# Runtime directories
RUN mkdir -p public/renders public/clients public/assets public/graphics clients .tmp

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0
ENV FFMPEG_PATH=/usr/bin/ffmpeg
# Remotion needs this on Linux headless
ENV DISPLAY=:99

EXPOSE 4000

CMD ["node", "--max-old-space-size=4096", "studio-server.mjs"]
