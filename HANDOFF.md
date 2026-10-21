# ServerMon: handoff for a Claude Code agent

You are picking up a project built in a cloud chat session that could not do the last three steps
(GitHub repo creation, deploy to the user's server, Expo upload). The code is written; your job is to
ship it. Work in this directory. The user (Boaz, GitHub `BoazCohenJ`) is on his phone, so keep
questions short and batch them.

## What this is

A phone app plus a small server container for checking server health.

- `server/collect.py`: stdlib-only Python collector, run every `SERVERMON_INTERVAL` seconds (default 300)
  by `server/entrypoint.sh`. Writes `latest.json`, `history.jsonl` (SMART trend data) and `state.json`
  to `/data`. Collects SMART (via `smartctl -j`), CPU/mem/load/net from `/proc`, filesystems, systemd
  units (via `nsenter` into host), and Docker containers (Engine API over the unix socket).
  Optional ntfy push when an item newly turns warn/crit, and on recovery.
- `server/server.py`: stdlib HTTP API on port 8787. `GET /health` (no auth), `GET /api/status`,
  `GET /api/history?days=N`. Bearer token from `SERVERMON_TOKEN` (min 16 chars, enforced at startup).
- `docker-compose.yml`: one service, `privileged`, `pid: host`, `network_mode: host`, mounts `/` read-only
  at `/host`, the Docker socket read-only, a data volume, and `./config:/config:ro`.
  Env: `SERVERMON_TOKEN` (required), `SERVERMON_PORT`, `SERVERMON_INTERVAL`, `SERVERMON_MOCK`.
- `app/`: Expo SDK 53 / React Native / TypeScript. Tabs: Overview, Disks (tap for trend bars), Services,
  Settings (server URL + token; token in expo-secure-store). Polls every 60s.

Disk grading: SMART FAILED, pending sectors, or uncorrectable sectors = critical. Reallocated sectors
= warning, or critical if the count grew since the last history entry. Temperature thresholds and
filesystem fill thresholds come from `config.json`.

## Verification state (be honest about this)

Verified: `collect.py --mock` and `server.py` run; 401 without token, correct JSON with it, history
endpoint works; non-mock collector degrades gracefully when `smartctl` is missing.

NOT verified: the Docker image has never been built; the app has never been installed or run (the
sandbox could not reach the npm registry). A partial `tsc` pass with missing type packages showed no
syntax errors, but expect small fixes on first `npm install` / `npx expo start`. SMART collection has
never run against real hardware. Pin versions in `app/package.json` may need `npx expo install --fix`.

## Tasks

### 1. Put it on GitHub
- A local git repo exists on branch `main` with one commit, plus MIT `LICENSE` and `.gitignore`.
  If you are in a fresh copy without `.git`, run `git init -b main` and commit.
- Create a **private** repo `BoazCohenJ/servermon` (the user said "make it official" but did not say
  public; confirm before making it public). Use `gh repo create servermon --private --source . --push`.
- Do not commit `.env`, `config/`, tokens, or `node_modules` (all are in `.gitignore`).
- Optional polish once pushed: repo description, topics (`homelab`, `smart`, `monitoring`, `expo`),
  a basic CI workflow that runs `python -m py_compile server/*.py` and `tsc --noEmit` in `app/`.

### 2. Get the app running and fix what breaks
- `cd app && npm install && npx expo install --fix && npx tsc --noEmit`, fix real errors.
- `npx expo start`, open in Expo Go on the user's phone, test against a mock server first
  (`SERVERMON_MOCK=1`). Android allows cleartext http (set in `app.json`); iOS will need HTTPS or an
  ATS exception for plain-http addresses.

### 3. Expo / EAS upload
- The user believes he is logged in to Expo on his PC. Check with `npx eas-cli whoami`.
- `npx eas-cli init` (creates the project and writes `extra.eas.projectId` into `app.json`), then either
  `eas update` for an OTA update or `eas build -p android --profile preview` for an installable APK.
  Ask before starting paid or long-queue builds.
- Don't print or commit Expo tokens.

### 4. Deploy the container to the user's server
- Not yet known: SSH address and user, whether Docker and Compose are installed, and how the phone will
  reach it (Tailscale, domain with HTTPS, or LAN only). Ask once, in one message.
- On the server: `cp .env.example .env`, set `SERVERMON_TOKEN` (`openssl rand -hex 24`), create `config/`
  from `server/config.example.json` (add real systemd unit names and an ntfy topic if wanted), then
  `docker compose up -d --build`.
- Smoke test: `curl -H "Authorization: Bearer $TOKEN" localhost:8787/api/status`. Check `warnings` in
  the JSON: if it says smartctl is missing or no disks are readable, SMART is not working.
- Likely trouble spots: drives behind a RAID controller or USB bridge (try `-d sat`, `-d megaraid,N` in
  the smartctl call), systemd checks via `nsenter` inside the container, hosts without `/proc/1/mounts`
  access. If `privileged` is unwanted, see the tighter `cap_add`/`devices` note in `docker-compose.yml`.
- Do not expose port 8787 as plain http to the internet. Recommend Tailscale or a TLS reverse proxy.
- Give the user the final server URL and token to type into the app's Settings tab. Show the token
  once in chat; never write it into the repo.

## Constraints and preferences

- Don't make the repo public, open ports on the user's router, or install system packages on the
  server without saying so first.
- Keep the server dependency-free (stdlib only) unless there is a strong reason.
- User preference from the project so far: React Native / Expo, a small API on the server, v1 scope =
  disk SMART health, system stats, services and containers. The Hermes AI summary was explicitly
  left out of v1 (a possible later addition: Hermes reads `/api/status` and writes commentary).

## Report back

When done, tell the user in a few lines: repo URL, Expo project/build link, server URL, anything that
did not work. Keep it short; he's reading on a phone.
