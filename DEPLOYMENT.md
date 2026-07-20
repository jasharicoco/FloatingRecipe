# Deploy to a VPS

The [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) workflow tests every push to `main`, then deploys that exact commit to `/var/www/floating-recipe`.

## 1. Prepare the VPS

This example assumes Ubuntu or Debian with system-wide installations of Node.js 22, Git, curl, Nginx, and systemd. The `node` and `npm` commands must also be available in a non-interactive SSH session.

After cloning the repository, run the included idempotent script to complete the initial setup:

```bash
sudo env APP_DOMAIN=recipes.example.com DEPLOY_USER=deploy \
  /var/www/floating-recipe/deploy/bootstrap-vps.sh
```

The script creates the service user, database directory, environment file, systemd service, restricted sudo rule, and Nginx configuration. The following manual steps document the equivalent setup.

Create a service user and database directory:

```bash
sudo useradd --system --home /var/lib/floating-recipe --shell /usr/sbin/nologin floating-recipe
sudo install -d -o floating-recipe -g floating-recipe -m 700 /var/lib/floating-recipe
```

Clone the public repository as the SSH user that GitHub Actions will use:

```bash
git clone https://github.com/YOUR_GITHUB_USER/FloatingRecipe.git /var/www/floating-recipe
cd /var/www/floating-recipe
npm ci
npm run build
npm prune --omit=dev
```

Create `/etc/floating-recipe.env`, owned by `root:root` with mode `600`:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=5171
RECIPE_DB_PATH=/var/lib/floating-recipe/recipes.sqlite
SESSION_DAYS=400
MAX_ACCOUNTS=250
MAX_RECIPES_PER_ACCOUNT=500
```

Install and start the systemd service:

```bash
sudo cp /var/www/floating-recipe/deploy/floating-recipe.service /etc/systemd/system/floating-recipe.service
sudo systemctl daemon-reload
sudo systemctl enable --now floating-recipe.service
curl --fail http://127.0.0.1:5171/api/health
```

Allow the deployment user to restart only this service. Create `/etc/sudoers.d/floating-recipe-deploy` containing:

```sudoers
YOUR_DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart floating-recipe.service
```

Validate the file with `sudo visudo -cf /etc/sudoers.d/floating-recipe-deploy`.

Install the restricted deployment command outside the repository:

```bash
install -d -m 700 "$HOME/bin"
install -m 700 /var/www/floating-recipe/deploy/deploy-on-vps.sh "$HOME/bin/deploy-floating-recipe"
```

## 2. HTTPS and domain

Copy [`deploy/nginx.conf.example`](deploy/nginx.conf.example) into the Nginx configuration and enable it for `recipes.example.com`. Then obtain a TLS certificate with:

```bash
sudo certbot --nginx -d recipes.example.com
```

Keep the app bound to `127.0.0.1`; only Nginx should be publicly accessible.

## 3. GitHub environment and secrets

Create a `production` environment under **Settings → Environments** and restrict it to the `main` branch. Add the following environment secrets:

| Secret | Value |
| --- | --- |
| `VPS_HOST` | The VPS IP address or DNS name |
| `VPS_USER` | The dedicated deployment user |
| `VPS_PORT` | The SSH port, usually `22` |
| `VPS_SSH_PRIVATE_KEY` | A private Ed25519 key used only for deployment |
| `VPS_KNOWN_HOSTS` | The trusted VPS SSH host key in `known_hosts` format |

Add the matching public deployment key to `~/.ssh/authorized_keys` with a forced command:

```text
restrict,command="/home/YOUR_DEPLOY_USER/bin/deploy-floating-recipe" ssh-ed25519 PUBLIC_KEY github-actions-floating-recipe
```

The key can then neither open a regular shell nor execute arbitrary commands. The deployment script accepts only a 40-character commit SHA and verifies that the commit exists on `origin/main`.

Verify the VPS Ed25519 fingerprint directly on the server before storing `VPS_KNOWN_HOSTS`. The workflow uses strict host-key checking and does not blindly run `ssh-keyscan`.

Once configured, every push to `main` triggers the **Deploy production** workflow. You can also run it manually from the Actions tab.
