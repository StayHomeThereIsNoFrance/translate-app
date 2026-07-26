FROM node:24-alpine AS builder

RUN npm install --global pnpm@10.19.0
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/client/package.json apps/client/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
RUN pnpm --filter @thai-translate/api deploy --prod /opt/api

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV PROMPTS_DIR=/app/config/prompts
ENV STATIC_DIR=/app/web

WORKDIR /app
COPY --from=builder /opt/api /app/api
COPY --from=builder /app/apps/client/dist /app/web
COPY config/prompts /app/config/prompts

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "/app/api/dist/server.js"]
