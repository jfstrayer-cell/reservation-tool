# Production image for Cloud Run.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 TZ=America/Toronto
COPY --chown=node:node --from=build /app/package.json /app/next.config.mjs ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/.next ./.next
COPY --chown=node:node --from=build /app/public ./public
COPY --chown=node:node --from=build /app/config ./config
COPY --chown=node:node --from=build /app/db ./db
COPY --chown=node:node --from=build /app/scripts ./scripts
COPY --chown=node:node --from=build /app/src ./src
USER node
EXPOSE 8080
# Applies any new database migrations, loads the restaurant if missing, then starts the app.
CMD ["sh", "-c", "npx tsx scripts/seed.ts && npx next start -p ${PORT}"]
