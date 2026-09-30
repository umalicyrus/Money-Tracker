# Vercel frontend + Oracle Laravel/MariaDB deployment

This replaces the previous all-in-one frontend hosting recommendation. Nothing is deployed, migrated or reset by these changes. Local `.env`, IndexedDB, outbox entries, frozen sync envelopes and operation IDs are untouched.

## Architecture and authentication

- Frontend: Vercel Hobby, stable production alias such as `https://money-tracker.vercel.app`. The example is not reserved; use the actual available project alias assigned to you.
- Backend: existing OCI Always Free VM, PHP 8.4/Laravel 13 behind Caddy HTTPS at `https://your-unique-moneytracker.duckdns.org` (claim an available DuckDNS label).
- Database: MariaDB 11.4 on the same VM, private `db:3306`, external persistent volume `moneytracker_mariadb`.
- Profile photos: existing private filesystem on `moneytracker_uploads`, served through authenticated `/api/v1/profile/photo`.
- Category images: existing database `icon_image` data URLs, also retained in local records and sync operations. No Vercel upload filesystem or new object-storage dependency.

The browser must call the **Vercel origin**, not the unrelated DuckDNS origin directly. `frontend/vercel.json` externally rewrites `/api/*`, `/sanctum/*`, `/login`, `/logout` and `/up` to the Oracle backend. The backend remains separately hosted; Vercel acts as an HTTPS reverse proxy. This keeps XSRF/session cookies first-party at the Vercel domain. Relative profile-image URLs therefore continue to work without component changes.

Sanctum SPA authentication requires a shared site for browser cookies. Setting `SameSite=None`, a CORS wildcard, or `SESSION_DOMAIN=.vercel.app` does not solve unrelated-domain cookie sharing and is not this plan. Keep host-only cookies: the proxied `Set-Cookie` response has no backend Domain attribute, so the browser associates it with its Vercel request origin. Axios reads the Vercel XSRF cookie and forwards `X-XSRF-TOKEN`. Vercel must preserve Cookie, Set-Cookie, Origin/Referer and sync headers; verify the real handshake after deployment. [Sanctum documentation](https://laravel.com/docs/13.x/sanctum), [Vercel external rewrites](https://vercel.com/docs/routing/rewrites).

The VM's existing Caddy frontend copy can remain as a recovery artifact; users should use only the stable Vercel alias. Do not split daily use between these origins because each has its own IndexedDB. No backend Docker/storage redesign is needed.

## Vercel setup

1. Create a Vercel Hobby account for eligible personal/non-commercial use. Create a reviewed private Git repository or use the official CLI from the frontend folder. This workspace currently has no Git metadata. Exclude `.env`, database dumps, runtime storage, `.chrome-check` and credentials before uploading source.
2. Create/import a Vercel project. **Root Directory: `frontend`**, Framework: Vite, Node: 24.x, Install: `npm ci`, Build: `npm run build`, Output: `dist`. `frontend/vercel.json` is relative to this root. No PHP, database or secret backend environment is uploaded to Vercel.
3. In `frontend/vercel.json`, replace **every** `https://replace-with-your-api.duckdns.org` destination with your actual HTTPS backend origin, retaining each path suffix. This is a literal placeholder; do not deploy it unchanged. A static JSON file does not interpolate arbitrary Vercel environment variables. Do not point a rewrite destination back at Vercel (loop).
4. Set the following variable in Vercel Project Settings -> Environment Variables, **Production**:

   | Variable | Value |
   | --- | --- |
   | `VITE_API_BASE_URL` | `/` |

   An absolute URL equal to the current frontend origin is also accepted, but `/` avoids hostname drift. This is the origin root, **not `/api`**: existing callers already include `/api` and auth uses `/login` and `/sanctum`. Direct cross-origin or prefixed bases are rejected rather than silently breaking auth/profile photos. `VITE_*` values are public build-time values, not secrets. Rebuild/redeploy after changing them. `frontend/.env.production.example` documents this setting; do not upload real backend secrets.
5. Set the stable production alias (for example `money-tracker.vercel.app` if available), then configure the backend with that exact origin/hostname as below. Deploy only when you are ready; no deploy command has been executed during preparation.
6. Preview deployment hostnames are not automatically trusted. Do not use `*.vercel.app` in CORS or Sanctum. Use a separate Vercel project/stable alias and separate backend/database for authenticated staging. A public preview pointing at production is not a safe test environment. Restrict untrusted repository contributors from deploying rewrites to a different upstream.

Optional future CLI workflow: install/use the official Vercel CLI, run `vercel link` from `frontend`, set the Production environment variable in the dashboard, then `vercel --prod` only after reviewing the hostname and rewrite destinations. The dashboard Git workflow needs no CLI install. [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json).

## Backend environment: exact examples

Replace BOTH example hostnames with ones you control. Retain your original APP_KEY, database credentials and all existing records.

```dotenv
APP_NAME="Money Tracker"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://your-unique-moneytracker.duckdns.org
FRONTEND_URL=https://money-tracker.vercel.app
SANCTUM_STATEFUL_DOMAINS=money-tracker.vercel.app
SESSION_DOMAIN=null
SESSION_DRIVER=database
SESSION_COOKIE=moneytracker_session
SESSION_PATH=/
SESSION_SECURE_COOKIE=true
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax
DB_CONNECTION=mariadb
DB_HOST=db
DB_PORT=3306
DB_DATABASE=moneytracker
DB_USERNAME=moneytracker
# Keep the existing secret values; never commit them:
APP_KEY=
DB_PASSWORD=
```

APP_URL remains the **backend** origin because Laravel's exact trusted-host check and Caddy receive the backend destination host. FRONTEND_URL is the **frontend** origin including `https://`, no trailing slash. SANCTUM_STATEFUL_DOMAINS contains its hostname only, no scheme/path. CORS now reads FRONTEND_URL, falling back to APP_URL for the existing single-origin setup; credentials are enabled, with no wildcard origin. There is no separate `CORS_ALLOWED_ORIGINS` variable in this implementation.

For the provided Compose deployment, edit the ignored server `.env.deploy` instead of a baked-in backend `.env`:

```dotenv
APP_HOST=your-unique-moneytracker.duckdns.org
FRONTEND_URL=https://money-tracker.vercel.app
SANCTUM_STATEFUL_DOMAINS=money-tracker.vercel.app
ACME_EMAIL=you@example.com
APP_KEY=
DB_PASSWORD=
DB_ROOT_PASSWORD=
RELEASE_TAG=vercel-frontend-1
```

Fill blank secrets privately with the retained real values; blank values intentionally fail Compose startup. The modified Compose file explicitly passes FRONTEND_URL and SANCTUM_STATEFUL_DOMAINS to PHP. Other cookie/database settings are already mapped there. Do not regenerate APP_KEY or change initialization passwords during a frontend move.

Caddy supplies HTTPS through private FastCGI. Do not add wildcard trusted proxies or trust arbitrary client-supplied forwarded hosts. If the real Vercel upstream Host differs from the destination hostname, inspect it in staging and adjust the proxy deliberately; do not bypass trusted-host checks.

Local development remains Vite's existing proxy to port 8000. The backend example lists `localhost:5173,127.0.0.1:5173` for Sanctum. Production must use only the explicitly approved production alias. [Laravel CORS/cookie setup](https://laravel.com/docs/13.x/sanctum#cors-and-cookies).

## Oracle backend, persistence and repeatable procedure

Keep the existing Oracle VM/Compose plan. If provisioning later: create an Always Free-eligible Ubuntu 24.04 A1 VM in your home region, within console limits; current checked documentation lists 2 OCPUs/12 GB equivalent, 200 GB combined boot/block storage, five volume backups and 10 TB monthly outbound. Capacity and idle-instance reclamation remain risks. Claim a free DuckDNS name, point it to the VM IP, and install Docker Engine/Compose from [Docker's Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/). Allow internet TCP 80/443, restrict SSH to your administrator IP, and do not publish 3306 or 9000. [OCI Always Free limits](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

MariaDB and uploads live on persistent external Docker volumes backed by the VM disk, not ephemeral container layers. Normal restarts/rebuilds retain them. Disk/account deletion or reclamation/recovery mistakes can still lose data. Retain volumes when replacing a VM and keep encrypted off-host DB plus uploads backups. Caddy certificates use `moneytracker_caddy`. No new migration is required for switching frontend hosting.

Commands below are for a **future approved server update**, not instructions to execute against live data now:

```sh
cd /opt/moneytracker
# Securely edit .env.deploy with the retained secrets and new frontend settings.
chmod 600 .env.deploy
dc() { sudo docker compose --env-file .env.deploy -f compose.production.yaml "$@"; }
dc config --quiet
# For an existing installation, use the existing external volumes unchanged.
# Only on a new isolated staging host:
# sudo docker volume create moneytracker_mariadb
# sudo docker volume create moneytracker_uploads
# sudo docker volume create moneytracker_caddy

dc build --pull app web
dc run --rm --no-deps --entrypoint caddy web validate --config /etc/caddy/Caddyfile --adapter caddyfile
dc up -d db app web
dc ps
```

The runtime entrypoint caches Laravel configuration/routes on container start. Recreate the app container after changing its Compose environment; restarting an old container alone does not update that environment. For a non-container Laravel install, securely edit its `.env`, run `php artisan config:cache --no-interaction`, and restart PHP-FPM as appropriate. Backend image build still uses Composer production dependencies; `web` retains the old frontend copy for recovery, while actual frontend releases happen on Vercel.

For separately approved schema updates, back up first, run `dc run --rm app php artisan migrate:status --no-interaction`, review pending migrations, then `dc run --rm app php artisan migrate --force --no-interaction`. No migration, seeder, `migrate:fresh`, restore or reset is part of this frontend switch. The legacy UUID migration is irreversible; never run it blindly against live data. Do not change the MariaDB version without a tested upgrade plan.

A consistent backend backup example for an already-running deployment, after coordinating a write pause:

```sh
umask 077
backup_dir="$HOME/moneytracker-backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
dc stop web app
dc exec -T db sh -c 'export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"; exec mariadb-dump -uroot --single-transaction --routines --events --triggers --databases "$MARIADB_DATABASE"' > "$backup_dir/database.sql"
# Stop if the dump failed; never treat a partial dump as a backup.
dc cp app:/var/www/html/storage/app "$backup_dir/uploads"
# Encrypt/copy off-host and verify a restore in isolated staging.
dc start app web
```

Keep users, UUIDs, migrations, device records, sync_operations and sync_changes together. Profile photos need the uploads backup as well as DB rows. Category image bytes are already in the DB. Never replace records by running demo seeders or factories. Keep APP_KEY securely with your recovery materials. External volumes are not removed by Compose down, but do not run volume prune/delete operations.

## Service worker, proxy caching and IndexedDB

The worker stays `/sw.js`, scope `/`, on the **Vercel** origin. The existing worker already excludes `/api`, `/sanctum`, `/login`, `/logout`, `/up`, `/storage`, all cross-origin requests and non-GET requests. No worker algorithm or database migration is needed for these same-origin proxy paths. Its build revision changes with the bundle/environment, and it only removes old `money-tracker-shell-*` caches. Vercel serves `/sw.js` with revalidation and root scope; static assets/manifest are not sent through the SPA fallback.

Vercel rewrites authenticated routes BEFORE the SPA fallback. Missing/unreachable APIs must fail as backend/proxy errors, never HTML. Both Vercel configuration and upstream Caddy disable browser/CDN caching for protected routes; explicit `x-vercel-enable-rewrite-caching: 0` also opts out of Vercel external rewrite caching. No cache rule may cache CSRF, login, sync or authenticated photo responses. [Vercel rewrite cache controls](https://vercel.com/docs/routing/rewrites#disabling-caching-for-rewrites-to-external-origins).

Moving from localhost or DuckDNS to Vercel creates a **new browser origin**, hence a different IndexedDB, cookies and service-worker registration. It does not move or erase the old storage. Continue to retain the original browser profile/site data. Before an approved cutover, sync every old-origin device to the original backend using its existing operation IDs. If a device cannot sync, stop that device's cutover and plan an explicit ID-preserving export/import; no such migration is implemented here. Do not manually re-enter its pending transactions at the Vercel origin. Use the stable production alias, not changing deployment/preview URLs, for daily use and PWA installation.

## Verification after an approved deployment

1. Confirm frontend and backend both have valid HTTPS. Via the Vercel alias, `/up` must reach Laravel; unknown `/api/...` must return backend JSON/error rather than SPA HTML. `/storage/...` must remain inaccessible. Inspect that requests do not redirect to the DuckDNS origin.
2. GET `/sanctum/csrf-cookie` through Vercel. Inspect both Set-Cookie headers: Domain absent, Secure, SameSite=Lax; session HttpOnly, XSRF-TOKEN JavaScript-readable. Confirm cookies are attached to the Vercel host. POST `/login`, then GET `/api/user`; the user UUID must match the existing backend. Check Origin/Referer, X-XSRF-TOKEN and all sync headers arrive intact. Do not disable CSRF to fix a failure.
3. On an authorized test account, save offline, record the pending operation ID, refresh offline, and verify the pending change survives. Reconnect once; confirm exactly one accepted record and unchanged operation ID. Refresh and retry sync: no duplicate record or balance effect.
4. Upload a category image and profile photo. Confirm `/api/v1/profile/photo` stays on the Vercel origin and is not cached by its CDN or service worker. Restart/recreate backend containers in a test window and verify both images on a second authenticated browser. Uploaded data must not depend on Vercel build output.
5. After the initial online load, inspect `/sw.js` MIME type, manifest and all precache URLs. Verify worker scope is the Vercel origin root, offline reload works, and a new frontend deployment updates the shell without resetting IndexedDB/outbox. Check API responses do not appear in Cache Storage. Verify client-route refresh works and missing assets are not HTML.
6. After pending changes are synced, log out and confirm `/api/user` is unauthorized. Log back in. Check the existing unsynced-change logout guard without discarding data. Test in a browser with third-party cookies blocked: this design should still use first-party cookies.
7. Verify CORS never reflects an unrelated preview origin or `*` with credentials. With a singleton allowlist the middleware can return the fixed approved origin even for another Origin; browsers reject that mismatch. Confirm private API/photo responses have no CDN cache hit or positive Age. Test on the actual Vercel production alias, not just localhost.

## Limits and remaining manual work

Vercel Hobby is for personal/non-commercial use and subject to quotas; it does not provide PHP or a MariaDB disk. Its API proxy requests and uploads consume applicable network/request limits. Exceeding free quotas can interrupt service. Commercial use may require a paid plan. [Hobby policy](https://vercel.com/docs/plans/hobby).

Oracle free availability and retention are conditional, not a production SLA. If unsuitable, run the unchanged backend/MariaDB Compose services on a paid persistent-disk VPS. No paid service, new database engine, token-auth architecture or custom domain is introduced here.

Manual prerequisites: claim the backend domain, obtain the Vercel production alias, replace rewrite placeholders, set environment values, rebuild/recreate the backend, deploy the frontend, then run the checks above on an isolated account. Docker is unavailable locally, and no Vercel deployment exists for end-to-end proxy/cookie verification. Local backend tests bypass normal CSRF verification as part of Laravel's test harness, so they cannot certify the real browser handshake. No actual hosting/subdomain availability has been reserved.