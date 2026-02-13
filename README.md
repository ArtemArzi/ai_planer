# planer

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.5. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Production deployment

- Docker Compose runbook: `docs/deploy-beget.md`
- Build frontend artifact: `./scripts/build-frontend-prod.sh`
- Rollout release: `./ops/deploy/rollout.sh <release-tag>`
- Rollback release: `./ops/deploy/rollback.sh`
