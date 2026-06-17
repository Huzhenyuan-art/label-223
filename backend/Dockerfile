FROM node:20-slim

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm config set registry https://registry.npmmirror.com \
    && if [ "$NODE_ENV" = "production" ]; then \
         npm ci --omit=dev; \
       else \
         npm ci; \
       fi \
    && npm cache clean --force

COPY . .

RUN mkdir -p /app/uploads /app/logs

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node scripts/healthcheck.js || exit 1

EXPOSE 8223

CMD ["npm", "start"]
