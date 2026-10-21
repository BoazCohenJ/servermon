# ServerMon

Phone app + small server container for checking on your server's health: SMART disk health
(reallocated/pending sectors with history), CPU/RAM/load/network, filesystems, systemd services
and Docker containers. Optional push alerts through ntfy.

```
 server container                                  phone
 ┌──────────────────────────┐   HTTPS / VPN   ┌──────────────┐
 │ collect.py  (every 5 min)│ ──────────────► │ Expo / React │
 │ server.py   (token API)  │  GET /api/...   │ Native app   │
 └──────────────────────────┘                 └──────────────┘
        └── ntfy push on new warnings ───────────────►
```

## 1. Run the server container

```sh
cp .env.example .env                       # set SERVERMON_TOKEN (openssl rand -hex 24)
mkdir config && cp server/config.example.json config/config.json   # edit services / ntfy
docker compose up -d --build
curl -H "Authorization: Bearer $SERVERMON_TOKEN" localhost:8787/api/status
```

Try the app first with fake data: set `SERVERMON_MOCK=1` in `.env`.

The container runs `privileged` with `pid: host` and `network_mode: host` so it can read SMART data,
see the host's mounts/CPU/network, and ask the host's systemd about services. `/` is mounted
read-only at `/host` and the Docker socket read-only. See `docker-compose.yml` for a tighter
capability/device list if you prefer not to use `privileged`.

Reach it over Tailscale/WireGuard, or put it behind a TLS reverse proxy. Don't expose plain HTTP to
the internet.

Alerts: set `ntfy.url` and `ntfy.topic` in `config/config.json`; you get a push when something newly
turns warning/critical (and when it recovers), not on every run. A reallocated-sector count that has
grown since the last run is treated as critical; a stable non-zero count is a warning.

## 2. Run the app

```sh
cd app
npm install
npx expo start        # scan the QR code with Expo Go
```

Enter the server address (e.g. `http://100.x.y.z:8787`) and token in the Settings tab.
For a standalone build use EAS: `npx eas build -p android` / `-p ios`.

## Layout

- `server/collect.py`: gathers stats, writes `latest.json` + `history.jsonl`, sends alerts
- `server/server.py`: token-protected JSON API (`/api/status`, `/api/history`, `/health`)
- `server/Dockerfile`, `server/entrypoint.sh`, `docker-compose.yml`
- `app/`: Expo (React Native + TypeScript): Overview, Disks, Services, Settings
