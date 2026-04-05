FROM node:20-bookworm-slim

# Install system dependencies for Remotion (Chromium headless) + ffmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
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
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install ALL dependencies (including devDeps needed by Remotion bundler at runtime)
RUN npm ci

# Copy source
COPY . .

# Create required runtime directories
RUN mkdir -p public/renders public/clients public/assets public/graphics clients .tmp

# Tell Remotion where Chromium is
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium

# Server config
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0
ENV FFMPEG_PATH=/usr/bin/ffmpeg

EXPOSE 4000

CMD ["node", "studio-server.mjs"]
