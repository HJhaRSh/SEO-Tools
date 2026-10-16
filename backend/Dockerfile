# Use official Playwright image with installed browsers and OS dependencies
FROM mcr.microsoft.com/playwright:v1.50.0-noble

# Set working directory
WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install Node dependencies (production + build tools)
RUN npm ci

# Copy TypeScript source and config
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to JavaScript (dist)
RUN npm run build

# Playwright browsers are pre-installed in the base image, but ensure Chromium is ready
RUN npx playwright install chromium

# Environment settings
ENV NODE_ENV=production
ENV PORT=5000

# Expose backend port
EXPOSE 5000

# Start Express server
CMD ["node", "dist/index.js"]
