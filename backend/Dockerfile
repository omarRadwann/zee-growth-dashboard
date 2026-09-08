FROM node:22-alpine
WORKDIR /service
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.mjs google-reporting.mjs http-api.mjs ./
ENV HOST=0.0.0.0
USER node
CMD ["node", "server.mjs"]
