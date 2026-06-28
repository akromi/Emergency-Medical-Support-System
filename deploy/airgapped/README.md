# Air-gapped install — TRIAGE-LINK on a field laptop

Run the **entire** TRIAGE-LINK stack — the offline PWA *and* the optional
cross-team sync backend — on a single laptop with **no internet at runtime**.
Useful where a deployment wants several field devices to aggregate casualty
records to one local server (a tent, a vehicle, a clinic) without any cloud.

> The PWA alone is already fully offline (install it from a browser and it works
> with no server). You only need this bundle when you want **multi-device sync**
> on a local network without reaching the hosted backend.

## What you get

One container (`app`) serves both:

- the **web app** at `http://<laptop>:8080/` (same bundle as the hosted PWA), and
- the **sync + admin API** at `/sync`, `/admin/*`, `/health`, … on the same origin

backed by a second container (`db`, Postgres) whose data lives in a persistent
`pgdata` volume, so records survive restarts and power cycles.

```
 field devices ──HTTP(LAN)──▶  app  (PWA + sync API, one Node process)
                                │
                                ▼
                              db  (Postgres, pgdata volume)
```

Because the app and API share an origin, the PWA talks to `/sync` same-origin —
no CORS, no per-device URL config.

## Build & bundle (on a connected machine, once)

Requires Docker. From this directory:

```bash
./pack.sh                 # builds the image, pulls Postgres, writes triage-link-airgapped.tar
# or to a USB stick directly:
./pack.sh /media/usb/triage-link-airgapped.tar
```

This produces a single tarball containing both images (the app — which already
embeds the built PWA — and Postgres). Nothing else needs to be fetched later.

## Install & run (on the offline laptop)

Docker installed, no internet needed:

```bash
docker load -i triage-link-airgapped.tar   # load both images
cp .env.example .env                        # set DB credentials + API tokens
docker compose up -d                        # start the stack
```

Open `http://localhost:8080/` (or `http://<laptop-ip>:8080/` from other devices
on the same LAN). The app installs as a PWA; field devices point their sync URL
at the same address.

## Configuration (`.env`)

| Variable | Purpose | Default |
|---|---|---|
| `APP_PORT` | Host port for the PWA + API | `8080` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Local DB credentials | `triagelink` / `change-me` / `triagelink` |
| `SYNC_API_TOKEN` | Bearer token required on `/sync` and `/ehr/*` | *(unset = open)* |
| `SYNC_ADMIN_TOKEN` | Bearer token for `/admin/*` | *(unset = admin API off)* |
| `ENABLE_ADMIN_CONSOLE` | Serve the graphical admin console at `/console` | `false` |
| `CORS_ORIGINS` | Extra allowed browser origins | *(empty = same-origin only)* |

**Security note.** On a single trusted device you can leave the tokens unset. The
moment several devices share a LAN, set `SYNC_API_TOKEN` (and `SYNC_ADMIN_TOKEN`
if you use the admin API) so only provisioned devices can read/write. The
at-rest **encryption vault** still lives in each device's browser; this server
stores the synced op-log.

## Operate

```bash
docker compose ps           # health
docker compose logs -f app  # app logs
docker compose down         # stop (keeps data)
docker compose down -v      # stop AND erase the pgdata volume (destroys records)
```

**Backups.** The casualty data lives in the `pgdata` volume. Snapshot it with a
standard Postgres dump:

```bash
docker compose exec db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql
```

## Updating

Rebuild the bundle on a connected machine (`./pack.sh`), carry the new tarball
over, `docker load -i …`, then `docker compose up -d` — Postgres data in the
volume is preserved across image updates.
