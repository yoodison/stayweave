# Production image: builds the React client and serves it with the Express API on one port.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY public ./public
RUN mkdir -p .stayweave && chown -R node:node /app
USER node
EXPOSE 8080
CMD ["node", "server/index.js"]
