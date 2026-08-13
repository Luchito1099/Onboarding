# Imagen mínima: Node 24 alpine, sin dependencias npm.
# SQLite viene incluido en Node (módulo nativo node:sqlite).
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    TZ_APP=America/Lima

WORKDIR /app
COPY package.json server.js seed.js ./
COPY public ./public

RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "server.js"]
