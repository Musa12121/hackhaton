#!/usr/bin/env bash
# Pull-based continuous deployment, run by a systemd timer on the server.
# Deploys the newest commit on `main` whose GitHub Actions CI run succeeded.
set -Eeuo pipefail
umask 077
REPO=Musa12121/hackhaton
WORKFLOW=ci.yml
ROOT=/root/hesabcheck-frontend
exec 9>"$ROOT/deploy.lock"
flock -n 9 || exit 0

SHA=${1:-$(python3 - "$REPO" "$WORKFLOW" <<'PY'
import json, sys, urllib.request
repo, workflow = sys.argv[1:]
url = f'https://api.github.com/repos/{repo}/actions/workflows/{workflow}/runs?branch=main&status=success&event=push&per_page=1'
request = urllib.request.Request(url, headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'hesabcheck-frontend-deploy'})
runs = json.load(urllib.request.urlopen(request, timeout=20))['workflow_runs']
print(runs[0]['head_sha'] if runs else '')
PY
)}
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || { echo 'No successful CI run found.' >&2; exit 0; }
CURRENT=$(cat "$ROOT/current-sha" 2>/dev/null || true)
[[ "$SHA" == "$CURRENT" && "${FORCE:-0}" != 1 ]] && exit 0

echo "Deploying $SHA (current: ${CURRENT:-none})"
RELEASE="$ROOT/releases/$SHA"
rm -rf "$RELEASE.tmp" && mkdir -p "$RELEASE.tmp"
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$SHA" | tar -xz -C "$RELEASE.tmp" --strip-components=1
rm -rf "$RELEASE" && mv "$RELEASE.tmp" "$RELEASE"

docker build --pull -t "hesabcheck-frontend:$SHA" --label "org.opencontainers.image.revision=$SHA" "$RELEASE"
COMPOSE=(docker compose --project-name hesabcheck-frontend -f "$RELEASE/deploy/compose.yaml")
if ! RELEASE_SHA=$SHA "${COMPOSE[@]}" up -d --wait --wait-timeout 90 web; then
  echo 'New release failed health check.' >&2
  if [[ -n "$CURRENT" ]]; then
    RELEASE_SHA=$CURRENT docker compose --project-name hesabcheck-frontend -f "$ROOT/releases/$CURRENT/deploy/compose.yaml" \
      up -d --wait --wait-timeout 90 web
  fi
  exit 1
fi

python3 "$RELEASE/deploy/configure_proxy.py"
ln -sfn "$RELEASE" "$ROOT/current"
printf '%s\n' "$CURRENT" > "$ROOT/previous-sha"
printf '%s\n' "$SHA" > "$ROOT/current-sha"

# Keep the latest five releases and their images; never touch other projects.
python3 - "$ROOT" "$SHA" "$CURRENT" <<'PY'
import pathlib, re, shutil, subprocess, sys
root = pathlib.Path(sys.argv[1])
releases = sorted((p for p in (root / 'releases').iterdir() if p.is_dir() and re.fullmatch('[a-f0-9]{40}', p.name)),
                  key=lambda p: p.stat().st_mtime, reverse=True)
keep = {p.name for p in releases[:5]} | set(filter(None, sys.argv[2:]))
for path in releases:
    if path.name not in keep:
        subprocess.run(['docker', 'image', 'rm', 'hesabcheck-frontend:' + path.name], check=False)
        shutil.rmtree(path)
PY
echo "Deployed $SHA successfully."
