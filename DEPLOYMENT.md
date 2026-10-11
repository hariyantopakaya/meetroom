# Deploy production

This deployment runs one Express instance with SQLite on a persistent Docker volume. A new volume starts with zero users, zero bookings and zero rooms. No demo seed runs or ships in the image. Use the bootstrap command to create the real administrator and meeting room.

## 1. Configure the deployment host

Copy `.env.production.example` to `.env.production` and fill in the public HTTPS `APP_URL`, actual `ROOM_NAME`, capacity, real SMTP settings, and two different random secrets. Keep `.env.production` on the server only; it is ignored by Git and Docker.

PowerShell:

```powershell
Copy-Item .env.production.example .env.production
```

Linux:

```sh
cp .env.production.example .env.production
chmod 600 .env.production
```

Generate a value for each secret separately, then paste the values into `JWT_SECRET` and `COOKIE_SECRET`:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

`SMTP_FROM` must be an address/sender authorized by your email provider. `SMTP_SECURE=true` typically pairs with port 465; STARTTLS typically uses port 587 and `SMTP_SECURE=false`. Production requires SMTP configuration and reports delivery failure instead of simulating successful email.

Booking and reschedule emails are sent after the database transaction commits. If email delivery fails, the API and UI report a warning while preserving the successful reservation; retrying a reservation just to resend email is unnecessary. Password reset email failures return an error. SMTP acceptance is not a guarantee that the recipient's inbox received the email.

The container's database URL is fixed to `file:/app/data/prod.db` and backed by the `booking_meeting_app_data` volume. Your local `.env` and `prisma/dev.db` do not enter the image. Node 22 is used as a supported LTS base; [Node's release schedule](https://nodejs.org/en/about/previous-releases) lists the support status.

## 2. Build and bootstrap before opening the site

Run on the deployment host from this directory:

```sh
docker compose --env-file .env.production config --quiet
docker compose --env-file .env.production build app
docker compose --env-file .env.production run --rm -it app npm run bootstrap:admin
docker compose --env-file .env.production up -d app
docker compose --env-file .env.production logs --tail=100 app
```

Bootstrap asks for the actual admin email, full name, company and a password of at least 12 characters. Password input is hidden. It creates the admin and configured room, with no example accounts or bookings. Rerunning with the same admin email preserves the existing password and bookings. Bootstrap refuses to overwrite a normal user or create a second administrator; use authenticated user management for subsequent admins.

Every container start validates configuration, ensures database access, applies checked-in Prisma 5 migrations, then starts the server. It does not run `db push`, reset, or seed. The Prisma CLI remains in the production dependencies for migrations.

## 3. Serve through HTTPS

After logging in as the administrator, open **Wi-Fi Bulanan**, select the meeting month (for example October 2026), and save the actual SSID/password. Set the matching password on your router separately; this application does not configure the router. You may prepare future months ahead of time.

All bookings whose meeting date falls in that month use the same setting. Existing bookings read the latest monthly setting when their voucher is opened; moving a booking to another month uses the destination month's credentials. There are no per-booking password overrides and no automatic password generation. An unconfigured month still allows reservations, but its Wi-Fi voucher remains unavailable until the administrator fills the setting. Changing one month's setting does not change another month. Old per-booking fields are retained in the database for safe upgrades, but ignored by the application.

Set a TLS reverse proxy for your public domain to forward to `127.0.0.1:3000` on the Docker host. Supply `Host`, `X-Forwarded-Proto` and `X-Forwarded-For` headers. The app uses secure login cookies in production, so access the site through HTTPS.

The default published port binds to `127.0.0.1`. If your proxy is in another container, connect it to the application's Docker network and target `app:3000`; configure the network in your hosting platform. Set `TRUST_PROXY_HOPS` to the actual number of trusted proxy hops (usually 1); use 0 for direct access. The app only permits browser requests from `APP_URL` for authenticated mutations.

The `/api/health` endpoint checks access to all application tables. Review container health with `docker compose --env-file .env.production ps`. Missing tables/database errors return 503.

## 4. Updates and data persistence

```sh
docker compose --env-file .env.production up -d --build app
```

Use the same volume across updates. Back up the production database before applying new migrations. For a simple consistent backup, stop the app and copy `/app/data/prod.db` from `booking_meeting_app` to your private backup location, then start it again:

```sh
docker compose --env-file .env.production stop app
docker cp booking_meeting_app:/app/data/prod.db ./meetroom-backup.db
docker compose --env-file .env.production start app
```

Store backups off the server and verify restoration separately. Do not use `docker compose down -v` on a deployment whose data you want to keep. A volume that already contains records retains them; startup does not delete dummy or real data. For a clean first production deployment, use a new empty production volume instead of copying `prisma/dev.db`. If a populated database was created with `db push`, back it up and baseline its migration history before deploying; automatic startup will not reset it.

The database file has been removed from Git tracking while kept on the developer's disk. Historical Git commits still contain the old demo database, so deploy the current Docker build context, never an extracted historic database.

## Development and verification

Demo seeding is a destructive development-only tool. It requires both `NODE_ENV=development` and `ALLOW_DEMO_SEED=true`; use it only with a disposable development database. It is absent from the production image.

Production regression checks are available as `npm run test:production` and use disposable databases. Execution of these checks and Docker runtime tests was skipped at the user's request; do not interpret that as a passing test result.
