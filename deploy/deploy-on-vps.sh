#!/usr/bin/env bash

set -euo pipefail

readonly app_path="/var/www/floating-recipe"
readonly service_name="floating-recipe.service"
readonly health_url="http://127.0.0.1:5171/api/health"
readonly requested_command="${SSH_ORIGINAL_COMMAND:-}"

if [[ ! "$requested_command" =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  echo "Only 'deploy <40-character commit SHA>' is allowed." >&2
  exit 64
fi

readonly deploy_sha="${BASH_REMATCH[1]}"

cd "$app_path"
git fetch --prune origin
git cat-file -e "${deploy_sha}^{commit}"

if ! git merge-base --is-ancestor "$deploy_sha" refs/remotes/origin/main; then
  echo "Commit $deploy_sha is not on origin/main." >&2
  exit 65
fi

git checkout --force main
git reset --hard "$deploy_sha"
npm ci
npm run build
npm prune --omit=dev

sudo -n /usr/bin/systemctl restart "$service_name"

for _ in {1..15}; do
  if curl --fail --silent --show-error "$health_url" >/dev/null; then
    echo "Deployment $deploy_sha is healthy."
    exit 0
  fi
  sleep 2
done

/usr/bin/systemctl --no-pager --full status "$service_name" || true
echo "Health check failed after deployment $deploy_sha." >&2
exit 1
