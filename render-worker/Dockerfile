FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg fonts-dejavu-core ca-certificates \
    libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 \
    libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 \
    libpango-1.0-0 libcairo2 libcups2 libxshmfence1 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/aios
COPY render-worker/package.json render-worker/package.json
COPY render-worker/src render-worker/src
COPY workers/creative-video/remotion/package.json workers/creative-video/remotion/package.json
COPY workers/creative-video/remotion/render-job.mjs workers/creative-video/remotion/render-job.mjs
COPY workers/creative-video/remotion/src workers/creative-video/remotion/src
COPY workers/creative-video/remotion/public workers/creative-video/remotion/public
RUN chown -R node:node /opt/aios
USER node
RUN cd /opt/aios/workers/creative-video/remotion \
  && npm install --omit=dev --no-audit --no-fund \
  && npx remotion browser ensure
WORKDIR /opt/aios/render-worker
CMD ["node", "src/index.mjs"]
