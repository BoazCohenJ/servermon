#!/usr/bin/env python3
"""ServerMon collector.

Run from cron (or a Hermes cron job) every few minutes:

    */5 * * * * /usr/bin/python3 /opt/servermon/collect.py

It writes:
    <data_dir>/latest.json    newest snapshot (served by server.py)
    <data_dir>/history.jsonl  one SMART record per disk per run (for trends)
    <data_dir>/state.json     previous status per item, used to avoid repeat alerts

Needs only the standard library. smartctl (smartmontools) is needed for disk
health; run as root or give the user access to the disks.
"""
import argparse
import http.client
import json
import os
import random
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))

DEFAULT_CONFIG = {
    "data_dir": os.environ.get("SERVERMON_DATA", os.path.join(HERE, "data")),
    "services": [],            # systemd unit names, e.g. ["nginx", "ssh"]
    "docker": True,            # list containers if docker is available
    "history_days": 180,
    # When running in a container: host's root mounted here (e.g. "/host") and
    # pid: host + privileged so we can see the host's mounts and systemd.
    "host_root": os.environ.get("SERVERMON_HOST_ROOT", ""),
    "docker_socket": "/var/run/docker.sock",
    "thresholds": {
        "fs_warn_pct": 85,
        "fs_crit_pct": 95,
        "temp_warn_c": 50,     # disks
        "temp_crit_c": 60,
        "load_warn_per_core": 1.5,
        "mem_warn_pct": 90,
    },
    "ntfy": {"url": "", "topic": "", "token": ""},   # e.g. https://ntfy.sh + topic
}

LEVEL = {"ok": 0, "warn": 1, "crit": 2}


def load_config(path):
    cfg = json.loads(json.dumps(DEFAULT_CONFIG))
    if path and os.path.exists(path):
        with open(path) as f:
            user = json.load(f)
        for k, v in user.items():
            if isinstance(v, dict) and isinstance(cfg.get(k), dict):
                cfg[k].update(v)
            else:
                cfg[k] = v
    return cfg


def run(cmd, timeout=30):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, p.stdout
    except (OSError, subprocess.TimeoutExpired):
        return 127, ""


def worst(*levels):
    return max(levels, key=lambda l: LEVEL[l], default="ok")


# ---------------------------------------------------------------- system

def read_cpu_times():
    with open("/proc/stat") as f:
        parts = f.readline().split()[1:]
    vals = list(map(int, parts))
    idle = vals[3] + (vals[4] if len(vals) > 4 else 0)
    return idle, sum(vals)


def system_stats(cfg, prev):
    th = cfg["thresholds"]
    i1, t1 = read_cpu_times()
    time.sleep(0.5)
    i2, t2 = read_cpu_times()
    cpu_pct = round(100 * (1 - (i2 - i1) / max(t2 - t1, 1)), 1)

    mem = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, v = line.split(":")
            mem[k] = int(v.split()[0]) * 1024
    total = mem.get("MemTotal", 0)
    avail = mem.get("MemAvailable", 0)
    swap_total = mem.get("SwapTotal", 0)
    swap_used = swap_total - mem.get("SwapFree", 0)

    cores = os.cpu_count() or 1
    load = os.getloadavg()
    with open("/proc/uptime") as f:
        uptime = float(f.read().split()[0])

    rx = tx = 0
    with open("/proc/net/dev") as f:
        for line in list(f)[2:]:
            name, data = line.split(":")
            if name.strip() == "lo":
                continue
            cols = data.split()
            rx += int(cols[0])
            tx += int(cols[8])
    now = time.time()
    rx_rate = tx_rate = None
    if prev and prev.get("net") and now > prev["net"]["t"]:
        dt = now - prev["net"]["t"]
        if rx >= prev["net"]["rx"] and tx >= prev["net"]["tx"]:
            rx_rate = int((rx - prev["net"]["rx"]) / dt)
            tx_rate = int((tx - prev["net"]["tx"]) / dt)

    mem_pct = round(100 * (total - avail) / total, 1) if total else 0
    status = "ok"
    if mem_pct >= th["mem_warn_pct"] or load[0] / cores >= th["load_warn_per_core"]:
        status = "warn"
    return {
        "status": status,
        "cpu_pct": cpu_pct,
        "cores": cores,
        "load": [round(x, 2) for x in load],
        "mem_total": total,
        "mem_used": total - avail,
        "mem_pct": mem_pct,
        "swap_total": swap_total,
        "swap_used": swap_used,
        "uptime_s": int(uptime),
        "net_rx_rate": rx_rate,
        "net_tx_rate": tx_rate,
        "_net_raw": {"t": now, "rx": rx, "tx": tx},
    }


def filesystems(cfg):
    th = cfg["thresholds"]
    skip = {"tmpfs", "devtmpfs", "squashfs", "overlay", "proc", "sysfs", "cgroup",
            "cgroup2", "devpts", "securityfs", "pstore", "bpf", "tracefs", "debugfs",
            "mqueue", "hugetlbfs", "configfs", "fusectl", "autofs", "efivarfs", "ramfs"}
    out, seen = [], set()
    root = cfg.get("host_root", "")
    try:
        # PID 1's mount table is the host's when the container runs with pid: host
        with open("/proc/1/mounts" if root else "/proc/mounts") as f:
            mounts = [l.split() for l in f]
    except OSError:
        return out
    for dev, mnt, fst, *_ in mounts:
        if fst in skip or not dev.startswith("/") or dev in seen:
            continue
        if mnt.startswith(("/snap", "/var/lib/docker", "/boot/efi")):
            continue
        seen.add(dev)
        try:
            u = shutil.disk_usage(root + mnt)
        except OSError:
            continue
        pct = round(100 * u.used / u.total, 1) if u.total else 0
        st = "crit" if pct >= th["fs_crit_pct"] else "warn" if pct >= th["fs_warn_pct"] else "ok"
        out.append({"mount": mnt, "device": dev, "fstype": fst, "total": u.total,
                    "used": u.used, "pct": pct, "status": st})
    return out


# ------------------------------------------------------------------ SMART

ATA_IDS = {5: "realloc", 187: "reported_uncorrect", 197: "pending", 198: "offline_uncorrect",
           199: "crc_errors", 9: "power_on_hours", 194: "temp", 190: "temp"}


def parse_smart(data, cfg):
    th = cfg["thresholds"]
    dev = data.get("device", {}).get("name", "?")
    rec = {
        "id": data.get("serial_number") or dev,
        "device": dev,
        "model": data.get("model_name", "Unknown"),
        "serial": data.get("serial_number"),
        "type": "nvme" if data.get("device", {}).get("type") == "nvme" else
                ("ssd" if data.get("rotation_rate") == 0 else "hdd"),
        "capacity": (data.get("user_capacity") or {}).get("bytes"),
        "passed": (data.get("smart_status") or {}).get("passed"),
        "temp_c": (data.get("temperature") or {}).get("current"),
        "power_on_hours": (data.get("power_on_time") or {}).get("hours"),
        "realloc": 0, "pending": 0, "offline_uncorrect": 0, "crc_errors": 0,
        "wear_pct": None, "media_errors": None, "spare_pct": None,
    }
    for a in (data.get("ata_smart_attributes") or {}).get("table", []):
        key = ATA_IDS.get(a.get("id"))
        raw = (a.get("raw") or {}).get("value", 0)
        if key in ("realloc", "pending", "offline_uncorrect", "crc_errors"):
            rec[key] = raw
        elif key == "reported_uncorrect":
            rec["offline_uncorrect"] = max(rec["offline_uncorrect"], raw)
        elif key == "power_on_hours" and rec["power_on_hours"] is None:
            rec["power_on_hours"] = raw & 0xFFFFFFFF
        elif key == "temp" and rec["temp_c"] is None:
            rec["temp_c"] = raw & 0xFF
    nv = data.get("nvme_smart_health_information_log")
    if nv:
        rec["wear_pct"] = nv.get("percentage_used")
        rec["media_errors"] = nv.get("media_errors")
        rec["spare_pct"] = nv.get("available_spare")
        if rec["temp_c"] is None:
            rec["temp_c"] = nv.get("temperature")
        if rec["power_on_hours"] is None:
            rec["power_on_hours"] = nv.get("power_on_hours")
        if nv.get("critical_warning"):
            rec["passed"] = False
    return rec


def grade_disk(rec, cfg, prev_realloc):
    th = cfg["thresholds"]
    reasons, level = [], "ok"
    if rec["passed"] is False:
        level, reasons = "crit", ["SMART overall health FAILED"]
    if rec["pending"]:
        level = worst(level, "crit")
        reasons.append(f"{rec['pending']} pending sectors")
    if rec["offline_uncorrect"]:
        level = worst(level, "crit")
        reasons.append(f"{rec['offline_uncorrect']} uncorrectable sectors")
    if rec["realloc"]:
        grew = prev_realloc is not None and rec["realloc"] > prev_realloc
        level = worst(level, "crit" if grew else "warn")
        reasons.append(f"{rec['realloc']} reallocated sectors" + (" (growing)" if grew else ""))
    if rec["media_errors"]:
        level = worst(level, "crit")
        reasons.append(f"{rec['media_errors']} media errors")
    if rec["wear_pct"] is not None and rec["wear_pct"] >= 90:
        level = worst(level, "warn")
        reasons.append(f"{rec['wear_pct']}% of rated endurance used")
    t = rec["temp_c"]
    if t is not None and t >= th["temp_crit_c"]:
        level = worst(level, "crit")
        reasons.append(f"temperature {t}°C")
    elif t is not None and t >= th["temp_warn_c"]:
        level = worst(level, "warn")
        reasons.append(f"temperature {t}°C")
    rec["status"] = level
    rec["reasons"] = reasons
    return rec


def smart_disks(cfg, last_realloc):
    rc, out = run(["smartctl", "--scan", "-j"])
    if rc == 127:
        return None, "smartctl not found (install smartmontools)"
    try:
        devices = json.loads(out).get("devices", [])
    except ValueError:
        return None, "could not parse smartctl --scan output"
    disks = []
    for d in devices:
        cmd = ["smartctl", "-a", "-j", d["name"]] + (["-d", d["type"]] if d.get("type") else [])
        _, o = run(cmd, timeout=60)
        try:
            data = json.loads(o)
        except ValueError:
            data = {}
        if not data.get("model_name") and d.get("type") == "scsi":
            # SATA drives behind a SAT layer are often scanned as plain scsi
            _, o = run(["smartctl", "-a", "-j", "-d", "sat", d["name"]], timeout=60)
            try:
                data = json.loads(o)
            except ValueError:
                data = {}
        if not data.get("model_name"):
            continue
        rec = parse_smart(data, cfg)
        disks.append(grade_disk(rec, cfg, last_realloc.get(rec["id"])))
    if not disks and os.geteuid() != 0:
        return [], "no disks readable; try running the collector as root"
    return disks, None


# --------------------------------------------------------------- services

def systemd_services(names, cfg):
    out = []
    # In a container, jump into the host's namespaces to ask the host's systemd.
    prefix = ["nsenter", "-t", "1", "-m", "-u", "-i", "-n", "--"] if cfg.get("host_root") and shutil.which("nsenter") else []
    for n in names:
        rc, o = run(prefix + ["systemctl", "is-active", n], timeout=10)
        state = o.strip() or "unknown"
        out.append({"name": n, "kind": "systemd", "state": state,
                    "status": "ok" if state == "active" else "crit"})
    return out


class _UnixHTTP(http.client.HTTPConnection):
    def __init__(self, path):
        super().__init__("localhost", timeout=10)
        self._path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(10)
        self.sock.connect(self._path)


def docker_containers(cfg):
    """Talk to the Docker Engine API over its unix socket (no docker CLI needed)."""
    sock = cfg.get("docker_socket", "/var/run/docker.sock")
    if not os.path.exists(sock):
        return []
    try:
        conn = _UnixHTTP(sock)
        conn.request("GET", "/containers/json?all=true")
        items = json.loads(conn.getresponse().read())
    except (OSError, ValueError):
        return []
    out = []
    for c in items:
        state = c.get("State", "")
        status_text = c.get("Status", "")
        unhealthy = "unhealthy" in status_text
        if state == "running" and not unhealthy:
            st = "ok"
        elif state in ("paused", "restarting", "created") or unhealthy:
            st = "warn"
        elif state == "exited" and "(0)" in status_text:
            st = "warn"
        else:
            st = "crit"
        out.append({"name": (c.get("Names") or ["/?"])[0].lstrip("/"), "kind": "docker", "state": state,
                    "detail": status_text, "image": c.get("Image", ""), "status": st})
    return out


# ----------------------------------------------------------------- mock

def mock_snapshot(cfg, state):
    now = int(time.time())
    random.seed(now // 300)
    disks = [
        {"id": "WD-WX11", "device": "/dev/sda", "model": "WDC WD40EFRX-68N32N0", "serial": "WD-WX11",
         "type": "hdd", "capacity": 4000787030016, "passed": True, "temp_c": 36 + random.randint(0, 2),
         "power_on_hours": 31842, "realloc": 0, "pending": 0, "offline_uncorrect": 0, "crc_errors": 0,
         "wear_pct": None, "media_errors": None, "spare_pct": None},
        {"id": "ZA2-77", "device": "/dev/sdb", "model": "ST8000VN004-2M2101", "serial": "ZA2-77",
         "type": "hdd", "capacity": 8001563222016, "passed": True, "temp_c": 41 + random.randint(0, 3),
         "power_on_hours": 24113, "realloc": 24, "pending": 0, "offline_uncorrect": 0, "crc_errors": 0,
         "wear_pct": None, "media_errors": None, "spare_pct": None},
        {"id": "S5GX-NV", "device": "/dev/nvme0n1", "model": "Samsung SSD 980 PRO 1TB", "serial": "S5GX-NV",
         "type": "nvme", "capacity": 1000204886016, "passed": True, "temp_c": 44 + random.randint(0, 4),
         "power_on_hours": 9120, "realloc": 0, "pending": 0, "offline_uncorrect": 0, "crc_errors": 0,
         "wear_pct": 6, "media_errors": 0, "spare_pct": 100},
    ]
    disks = [grade_disk(d, cfg, 16 if d["id"] == "ZA2-77" else None) for d in disks]
    GB = 1024 ** 3
    return {
        "system": {"status": "ok", "cpu_pct": round(random.uniform(4, 35), 1), "cores": 8,
                   "load": [0.62, 0.55, 0.48], "mem_total": 32 * GB, "mem_used": int(11.4 * GB),
                   "mem_pct": 35.6, "swap_total": 8 * GB, "swap_used": 120 * 1024 ** 2,
                   "uptime_s": 86400 * 41 + 3600 * 5, "net_rx_rate": 183000, "net_tx_rate": 42000,
                   "_net_raw": {"t": now, "rx": 0, "tx": 0}},
        "filesystems": [
            {"mount": "/", "device": "/dev/nvme0n1p2", "fstype": "ext4", "total": 900 * GB,
             "used": 310 * GB, "pct": 34.4, "status": "ok"},
            {"mount": "/mnt/tank", "device": "/dev/sdb1", "fstype": "ext4", "total": 7300 * GB,
             "used": 6400 * GB, "pct": 87.7, "status": "warn"},
        ],
        "disks": disks,
        "services": [
            {"name": "nginx", "kind": "systemd", "state": "active", "status": "ok"},
            {"name": "ssh", "kind": "systemd", "state": "active", "status": "ok"},
            {"name": "plex", "kind": "docker", "state": "running", "detail": "Up 3 days", "image": "plexinc/pms-docker", "status": "ok"},
            {"name": "nextcloud", "kind": "docker", "state": "running", "detail": "Up 3 days (unhealthy)", "image": "nextcloud:29", "status": "warn"},
            {"name": "backup-job", "kind": "docker", "state": "exited", "detail": "Exited (1) 2 hours ago", "image": "restic/restic", "status": "crit"},
        ],
    }


def mock_history(path):
    """Seed a believable 60-day history so the trend charts have something to show."""
    now = int(time.time())
    rows = []
    for day in range(60, -1, -1):
        t = now - day * 86400
        realloc = 0 if day > 40 else 8 if day > 25 else 16 if day > 10 else 24
        rows.append({"t": t, "id": "WD-WX11", "realloc": 0, "pending": 0, "temp_c": 35 + day % 3, "power_on_hours": 31842 - day * 24})
        rows.append({"t": t, "id": "ZA2-77", "realloc": realloc, "pending": 0, "temp_c": 40 + day % 4, "power_on_hours": 24113 - day * 24})
        rows.append({"t": t, "id": "S5GX-NV", "realloc": 0, "pending": 0, "temp_c": 43 + day % 5, "power_on_hours": 9120 - day * 24})
    with open(path, "w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")


# ------------------------------------------------------------- plumbing

def load_json(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def last_history_realloc(path):
    last = {}
    try:
        with open(path) as f:
            for line in f:
                try:
                    r = json.loads(line)
                except ValueError:
                    continue
                last[r["id"]] = r.get("realloc")
    except OSError:
        pass
    return last


def trim_history(path, days):
    cutoff = time.time() - days * 86400
    try:
        with open(path) as f:
            lines = [l for l in f if l.strip()]
    except OSError:
        return
    keep = []
    for l in lines:
        try:
            if json.loads(l)["t"] >= cutoff:
                keep.append(l)
        except (ValueError, KeyError):
            pass
    if len(keep) != len(lines):
        with open(path, "w") as f:
            f.writelines(keep)


DEFAULT_ICON = "https://raw.githubusercontent.com/BoazCohenJ/servermon/main/assets/icon-256.png"


def notify(cfg, title, body, priority="default"):
    n = cfg["ntfy"]
    if not (n.get("url") and n.get("topic")):
        return
    req = urllib.request.Request(f"{n['url'].rstrip('/')}/{n['topic']}", data=body.encode(),
                                 headers={"Title": title, "Priority": priority, "Icon": n.get("icon") or DEFAULT_ICON})
    if n.get("token"):
        req.add_header("Authorization", f"Bearer {n['token']}")
    try:
        urllib.request.urlopen(req, timeout=10).read()
    except OSError as e:
        print(f"ntfy failed: {e}", file=sys.stderr)


def item_issues(snap):
    """Flat {key: (level, message)} of everything not ok."""
    issues = {}
    for d in snap["disks"] or []:
        if d["status"] != "ok":
            issues[f"disk:{d['id']}"] = (d["status"], f"{d['model']} ({d['device']}): " + "; ".join(d["reasons"]))
    for f in snap["filesystems"]:
        if f["status"] != "ok":
            issues[f"fs:{f['mount']}"] = (f["status"], f"{f['mount']} is {f['pct']}% full")
    for s in snap["services"]:
        if s["status"] != "ok":
            issues[f"svc:{s['name']}"] = (s["status"], f"{s['kind']} {s['name']}: {s['state']}")
    if snap["system"]["status"] != "ok":
        issues["system"] = (snap["system"]["status"], "high load or memory use")
    return issues


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=os.path.join(HERE, "config.json"))
    ap.add_argument("--mock", action="store_true", help="write fake data (for trying the app)")
    ap.add_argument("--print", action="store_true", help="print snapshot instead of saving")
    args = ap.parse_args()

    cfg = load_config(args.config)
    ddir = cfg["data_dir"]
    os.makedirs(ddir, exist_ok=True)
    hist_path = os.path.join(ddir, "history.jsonl")
    state_path = os.path.join(ddir, "state.json")
    state = load_json(state_path, {})

    if args.mock:
        snap = mock_snapshot(cfg, state)
        if not os.path.exists(hist_path):
            mock_history(hist_path)
        warnings = []
    else:
        warnings = []
        sysinfo = system_stats(cfg, state)
        disks, err = smart_disks(cfg, last_history_realloc(hist_path))
        if err:
            warnings.append(err)
        snap = {
            "system": sysinfo,
            "filesystems": filesystems(cfg),
            "disks": disks if disks is not None else [],
            "services": systemd_services(cfg["services"], cfg) + (docker_containers(cfg) if cfg["docker"] else []),
        }

    now = int(time.time())
    net_raw = snap["system"].pop("_net_raw", None)
    levels = [snap["system"]["status"]] + [d["status"] for d in snap["disks"]] + \
             [f["status"] for f in snap["filesystems"]] + [s["status"] for s in snap["services"]]
    snap.update({"hostname": socket.gethostname(), "collected_at": now,
                 "overall": worst(*levels), "warnings": warnings})

    if args.print:
        print(json.dumps(snap, indent=2))
        return

    tmp = os.path.join(ddir, "latest.json.tmp")
    with open(tmp, "w") as f:
        json.dump(snap, f)
    os.replace(tmp, os.path.join(ddir, "latest.json"))

    if not args.mock or not os.path.exists(hist_path):
        with open(hist_path, "a") as f:
            for d in snap["disks"]:
                f.write(json.dumps({"t": now, "id": d["id"], "realloc": d["realloc"], "pending": d["pending"],
                                    "temp_c": d["temp_c"], "power_on_hours": d["power_on_hours"],
                                    "wear_pct": d["wear_pct"]}) + "\n")
        trim_history(hist_path, cfg["history_days"])

    # alert only when an item newly appears or gets worse
    prev_levels = state.get("levels", {})
    issues = item_issues(snap)
    for key, (lvl, msg) in issues.items():
        if LEVEL[lvl] > LEVEL[prev_levels.get(key, "ok")]:
            notify(cfg, f"{snap['hostname']}: {'CRITICAL' if lvl == 'crit' else 'warning'}", msg,
                   "high" if lvl == "crit" else "default")
    for key in prev_levels:
        if key not in issues and prev_levels[key] != "ok":
            notify(cfg, f"{snap['hostname']}: recovered", key.split(":", 1)[-1] + " is back to normal", "low")

    state["levels"] = {k: v[0] for k, v in issues.items()}
    if net_raw:
        state["net"] = net_raw
    with open(state_path, "w") as f:
        json.dump(state, f)


if __name__ == "__main__":
    main()
