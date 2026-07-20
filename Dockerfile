# Base image with Node 20 and a Debian bookworm core for Puppeteer/Chromium compatibility
FROM node:20-bookworm-slim

# Set environment variables for Puppeteer and Chromium headless execution
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV REMOTION_CHROMIUM_PATH=/usr/bin/chromium
ENV CHROMIUM_FLAGS="--no-sandbox --disable-setuid-sandbox"
ENV CHROMEDRIVER_PATH=/usr/bin/chromedriver
ENV PORT=3000

# Install Chromium, FFmpeg, native fonts, Python and pip (required for Edge-TTS and Python scrapers)
# Also installs X11/rendering libs required by Remotion's headless Chromium renderer
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    ffmpeg \
    fonts-freefont-ttf \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    fonts-liberation \
    libgbm-dev \
    libasound2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    libx11-xcb1 \
    libdrm2 \
    libglib2.0-0 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libpango-1.0-0 \
    libcairo2 \
    libatspi2.0-0 \
    python3 \
    python3-pip \
    python-is-python3 \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies for Edge-TTS and scrapers globally
RUN pip3 install --break-system-packages edge-tts selenium webdriver-manager beautifulsoup4

# Install pnpm and PM2 globally
RUN npm install -g pnpm@9.0.0 pm2

# Create work directory
WORKDIR /app

# Copy dependency definition files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy package package.jsons
COPY packages/events/package.json ./packages/events/
COPY packages/knowledge/package.json ./packages/knowledge/
COPY packages/knowledge/cgl-writer/package.json ./packages/knowledge/cgl-writer/
COPY packages/llm/package.json ./packages/llm/
COPY packages/notifications/package.json ./packages/notifications/
COPY packages/state-machine/package.json ./packages/state-machine/
COPY packages/types/package.json ./packages/types/

# Copy app package.jsons
COPY apps/supervisor/package.json ./apps/supervisor/
COPY apps/registry/package.json ./apps/registry/
COPY apps/mission-control/package.json ./apps/mission-control/
COPY apps/agents/world-observer/package.json ./apps/agents/world-observer/
COPY apps/agents/signal-normalizer/package.json ./apps/agents/signal-normalizer/
COPY apps/agents/script/package.json ./apps/agents/script/
COPY apps/agents/research/package.json ./apps/agents/research/
COPY apps/agents/render/package.json ./apps/agents/render/
COPY apps/agents/scheduler/package.json ./apps/agents/scheduler/
COPY apps/agents/publisher/package.json ./apps/agents/publisher/
COPY apps/agents/quality/package.json ./apps/agents/quality/
COPY apps/agents/observer/package.json ./apps/agents/observer/
COPY apps/agents/media/package.json ./apps/agents/media/
COPY apps/agents/cycle-clock/package.json ./apps/agents/cycle-clock/
COPY apps/agents/editorial/package.json ./apps/agents/editorial/
COPY apps/agents/learning/package.json ./apps/agents/learning/
COPY apps/agents/cinematic-review/package.json ./apps/agents/cinematic-review/
COPY apps/agents/analytics/package.json ./apps/agents/analytics/
COPY apps/agents/critic/package.json ./apps/agents/critic/
COPY apps/agents/deep-research/package.json ./apps/agents/deep-research/

# Install dependencies (frozen lockfile to match developer environment)
RUN pnpm install --frozen-lockfile

# Copy the rest of the application files
COPY . .

# Run global monorepo build (transpiles TypeScript, prepares Next.js)
RUN pnpm build

# Expose port for Next.js Mission Control
EXPOSE 3000

# Start up command: run database migrations and start PM2 processes
CMD pnpm db:migrate && pm2-runtime start ecosystem.config.cjs
