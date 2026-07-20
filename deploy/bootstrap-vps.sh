#!/usr/bin/env bash

set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Run this script with sudo." >&2
  exit 1
fi

readonly app_dir="${APP_DIR:-/var/www/floating-recipe}"
readonly app_user="${APP_USER:-floating-recipe}"
readonly deploy_user="${DEPLOY_USER:-${SUDO_USER:-}}"
readonly app_domain="${APP_DOMAIN:-}"
readonly app_port="${APP_PORT:-5171}"
readonly data_dir="${DATA_DIR:-/var/lib/floating-recipe}"
readonly service_name="floating-recipe.service"

if [[ -z "$deploy_user" ]] || ! id "$deploy_user" >/dev/null 2>&1; then
  echo "Set DEPLOY_USER to an existing SSH user." >&2
  exit 1
fi

if [[ -z "$app_domain" ]]; then
  echo "Set APP_DOMAIN to the public hostname, for example recipes.example.com." >&2
  exit 1
fi

if [[ ! "$app_domain" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "APP_DOMAIN contains unsupported characters." >&2
  exit 1
fi

if [[ ! "$app_port" =~ ^[0-9]+$ ]]; then
  echo "APP_PORT must be numeric." >&2
  exit 1
fi

if [[ ! -f "$app_dir/package.json" ]]; then
  echo "Clone the repository to $app_dir before running this script." >&2
  exit 1
fi

if ! id "$app_user" >/dev/null 2>&1; then
  useradd --system --home "$data_dir" --shell /usr/sbin/nologin "$app_user"
fi

install -d -o "$app_user" -g "$app_user" -m 700 "$data_dir"

env_file="$(mktemp)"
sudoers_file="$(mktemp)"
nginx_file="$(mktemp)"
cleanup() {
  rm -f "$env_file" "$sudoers_file" "$nginx_file"
}
trap cleanup EXIT

printf '%s\n' \
  'NODE_ENV=production' \
  'HOST=127.0.0.1' \
  "PORT=$app_port" \
  "RECIPE_DB_PATH=$data_dir/recipes.sqlite" \
  'SESSION_DAYS=400' \
  'MAX_ACCOUNTS=250' \
  'MAX_RECIPES_PER_ACCOUNT=500' >"$env_file"
install -o root -g root -m 600 "$env_file" /etc/floating-recipe.env

install -o root -g root -m 644 \
  "$app_dir/deploy/floating-recipe.service" \
  "/etc/systemd/system/$service_name"

printf '%s ALL=(root) NOPASSWD: /usr/bin/systemctl restart %s\n' \
  "$deploy_user" "$service_name" >"$sudoers_file"
install -o root -g root -m 440 \
  "$sudoers_file" /etc/sudoers.d/floating-recipe-deploy
visudo -cf /etc/sudoers.d/floating-recipe-deploy

sed "s/recipes\.example\.com/$app_domain/g" \
  "$app_dir/deploy/nginx.conf.example" >"$nginx_file"
install -o root -g root -m 644 \
  "$nginx_file" "/etc/nginx/sites-available/$app_domain"
ln -sfn "/etc/nginx/sites-available/$app_domain" \
  "/etc/nginx/sites-enabled/$app_domain"

systemctl daemon-reload
systemctl enable --now "$service_name"
nginx -t
systemctl reload nginx

curl --fail --silent --show-error "http://127.0.0.1:$app_port/api/health"
printf '\nFloatingRecipe is running behind Nginx at http://%s.\n' "$app_domain"
printf 'Add HTTPS with: sudo certbot --nginx -d %s\n' "$app_domain"
