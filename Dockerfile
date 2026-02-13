FROM oven/bun:1.3.5-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY tsconfig.json bunfig.toml ./

RUN apk add --no-cache sqlite
RUN mkdir -p /app/data /app/uploads /backups && chown -R bun:bun /app/data /app/uploads /backups

USER bun

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD bun -e 'fetch("http://localhost:3000/health").then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'

CMD ["bun", "run", "src/index.ts"]
