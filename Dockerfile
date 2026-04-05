FROM node:20-bullseye-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgl1-mesa-glx \
    libgles2 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    xdg-utils \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN node --max-old-space-size=4096 $(which npm) ci

# Pre-install Remotion's Chrome Headless Shell during build so it never
# downloads at container start-up (which blocks the render at 0%).
RUN npx remotion browser install || true

COPY . .

RUN mkdir -p public/renders public/clients public/assets public/graphics clients .tmp && \
    chmod -R 777 public clients .tmp

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0
ENV FFMPEG_PATH=/usr/bin/ffmpeg

EXPOSE 4000

CMD ["node", "--max-old-space-size=4096", "studio-server.mjs"]
