from flask import Flask, jsonify, render_template
import psutil
import socket
import time

app = Flask(__name__)

BOOT_TIME = psutil.boot_time()


def format_uptime(seconds):
    seconds = int(seconds)
    days, rem = divmod(seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, secs = divmod(rem, 60)
    if days:
        return f"{days}d {hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def gb(value_bytes):
    return round(value_bytes / (1024 ** 3), 2)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/stats")
def stats():
    """Return a snapshot of CPU, memory, disk, process and network stats."""
    cpu_percent = psutil.cpu_percent(interval=0.4)
    cpu_per_core = psutil.cpu_percent(interval=0, percpu=True)
    cpu_freq = psutil.cpu_freq()

    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    disk = psutil.disk_usage("/")
    net = psutil.net_io_counters()

    worst_usage = max(cpu_percent, mem.percent, disk.percent)
    if worst_usage >= 90:
        status = "critical"
    elif worst_usage >= 70:
        status = "warning"
    else:
        status = "good"

    return jsonify({
        "timestamp": time.time(),
        "host": {
            "name": socket.gethostname(),
            "uptime": format_uptime(time.time() - BOOT_TIME),
            "status": status,
        },
        "cpu": {
            "percent": round(cpu_percent, 1),
            "cores": psutil.cpu_count(logical=True),
            "per_core": [round(c, 1) for c in cpu_per_core],
            "freq_current_ghz": round(cpu_freq.current / 1000, 2) if cpu_freq else None,
            "freq_max_ghz": round(cpu_freq.max / 1000, 2) if cpu_freq and cpu_freq.max else None,
        },
        "memory": {
            "percent": round(mem.percent, 1),
            "used_gb": gb(mem.used),
            "total_gb": gb(mem.total),
            "available_gb": gb(mem.available),
            "swap_used_gb": gb(swap.used),
            "swap_total_gb": gb(swap.total),
        },
        "disk": {
            "percent": round(disk.percent, 1),
            "used_gb": gb(disk.used),
            "total_gb": gb(disk.total),
        },
        "processes": {
            "count": len(psutil.pids()),
        },
        "network": {
            "bytes_sent": net.bytes_sent,
            "bytes_recv": net.bytes_recv,
            "packets_sent": net.packets_sent,
            "packets_recv": net.packets_recv,
        },
    })


@app.route("/healthz")
def healthz():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)