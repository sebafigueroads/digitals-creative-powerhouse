FROM ghcr.io/remotion-dev/base:4

# Install ffmpeg and Node 20
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN node --max-old-space-size=4096 $(which npm) ci

COPY . .

RUN mkdir -p public/renders public/clients public/assets public/graphics clients .tmp

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV DISPLAY=:99

EXPOSE 4000

CMD ["node", "--max-old-space-size=4096", "studio-server.mjs"]
