# Hugging Face Docker Space: builds StayWeave from a pinned commit of the public repository.
FROM node:22-slim AS build
ARG REF=d7ab1c9b8770d03c4df350683a2289e7ee2d6462
ADD https://codeload.github.com/yoodison/stayweave/tar.gz/${REF} /tmp/src.tar.gz
RUN mkdir /app && tar -xzf /tmp/src.tar.gz -C /app --strip-components=1
WORKDIR /app
RUN npm ci --no-audit --no-fund && npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=7860 \
    NEBIUS_INFERENCE_ENABLED=true STAYWEAVE_INFERENCE_BUDGET_USD=5 \
    STAYWEAVE_PUBLIC_HOST_SUFFIX=.hf.space
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/public ./public
RUN mkdir -p .stayweave && chown -R node:node /app
USER node
EXPOSE 7860
CMD ["node", "server/index.js"]
