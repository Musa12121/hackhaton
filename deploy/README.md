# HesabCheck frontend — production

- **URL:** https://hesabcheckfrontend.testgrelo.online
- **Host:** `178.105.97.126`, root: `/root/hesabcheck-frontend`
- **Releases:** `/root/hesabcheck-frontend/releases/<commit SHA>`, `current` → active release, `current-sha` / `previous-sha`
- **Runtime config:** `/root/hesabcheck-frontend/.env` (root-only, never committed) — `BACKEND_TOKEN=<token of the backend demo user>`
- **Container:** Docker Compose project `hesabcheck-frontend`, service `web` (nginx, port 8080), alias `hesabcheck-frontend` on the shared `hospital-appointment-demo_default` network

## How a request flows

```
Browser ──HTTPS──▶ shared nginx (hospital-appointment-demo-nginx-1, Let's Encrypt)
                     └─▶ hesabcheck-frontend:8080 (this image)
                           ├─ /            → built React app (dist/)
                           └─ /api/…       → hesabcheck-web:8000 (backend) + Authorization: Token $BACKEND_TOKEN
```

The browser never receives the token. `/api/auth/token/` is not exposed through the frontend. `/api` is rate-limited (5 req/s per IP; AI endpoints `extract`, `bundle`, `suggestions` 6 req/min per IP).

## Continuous deployment (pull-based)

1. Push to `main` → GitHub Actions **CI** (`.github/workflows/ci.yml`): `npm ci`, lint, 111 tests, production build, Docker image build.
2. On the server, `hesabcheck-frontend-deploy.timer` runs `/root/hesabcheck-frontend/bin/deploy` every 2 minutes.
3. The script asks the public GitHub API for the newest **successful** CI run on `main`. If its commit differs from `current-sha`, it downloads that commit, builds `hesabcheck-frontend:<sha>`, starts it and waits for the health check.
4. On success it configures the domain in the shared nginx (idempotent; issues the certificate on first run) and switches `current`. On failure the previous release is started again.
5. The latest five releases and images are kept.

No GitHub secrets or SSH keys are needed: the repository is public and the server pulls.

## Operations

```bash
systemctl list-timers hesabcheck-frontend-deploy.timer   # next check
journalctl -u hesabcheck-frontend-deploy -n 100           # deploy log
/root/hesabcheck-frontend/bin/deploy                      # deploy the latest successful commit now
FORCE=1 /root/hesabcheck-frontend/bin/deploy <sha>        # (re)deploy a specific commit
docker compose --project-name hesabcheck-frontend -f /root/hesabcheck-frontend/current/deploy/compose.yaml logs --tail=100 web
```

Rotate the backend token: issue a new token for the backend user (admin panel → Tokens), update `.env`, then `FORCE=1 /root/hesabcheck-frontend/bin/deploy $(cat /root/hesabcheck-frontend/current-sha)`.

## One-time server setup (already done)

```bash
mkdir -p /root/hesabcheck-frontend/{bin,releases,backups} && chmod 700 /root/hesabcheck-frontend
echo "BACKEND_TOKEN=…" > /root/hesabcheck-frontend/.env && chmod 600 /root/hesabcheck-frontend/.env
install -m 700 deploy/deploy.sh /root/hesabcheck-frontend/bin/deploy
install -m 644 deploy/hesabcheck-frontend-deploy.{service,timer} /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now hesabcheck-frontend-deploy.timer
```

DNS: `hesabcheckfrontend.testgrelo.online` A record → `178.105.97.126`.

## Security note

This is a demo deployment without a login screen: anyone who opens the URL works as the backend demo user and can see, create and delete that user's cases and trigger AI requests (rate-limited). Use synthetic documents only. For real company data, put authentication in front of the site and enable the encryption described in the backend README.
