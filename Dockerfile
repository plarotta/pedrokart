# Pedro Kart — hosted mode. The platform terminates TLS and forwards to $PORT.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY public ./public
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
