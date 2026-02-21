# Signal Scheduler

A web-based scheduler for posting messages to Signal groups automatically.

## Architecture

- **Frontend:** Next.js 16 with TypeScript and Tailwind CSS
- **Backend:** Next.js API routes
- **Database:** SQLite (`better-sqlite3`)
- **Scheduler:** `node-cron` running as a systemd service
- **Signal API:** `signal-cli-rest-api` (Docker, port 8080)

## Running Services

Two systemd services manage the app:

1. **signal-scheduler-web.service** - Web UI (Next.js app on port 3000)
2. **signal-scheduler.service** - Background scheduler (checks every minute)

## Environment Variables

Required in `/opt/signal-scheduler/.env`:

```bash
DB_PATH=/opt/signal-scheduler/data/scheduler.db
SIGNAL_API_URL=http://localhost:8080
SIGNAL_NUMBER=+17025768110
```

## Complete Rebuild Guide

If the entire container (Proxmox LXC) is deleted, follow these steps to rebuild everything:

### 1. Create Proxmox LXC Container

```bash
# On Proxmox host (192.168.100.23)
pct create 200 local:vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst \
  --hostname signal-scheduler \
  --cores 2 \
  --memory 2048 \
  --net0 name=eth0,bridge=vmbr0,ip=192.168.100.47/24,gw=192.168.100.1 \
  --storage local-zfs:20 \
  --rootfs local-zfs:20 \
  --features nesting=1 \
  --onboot 1

pct start 200
```

### 2. Install Dependencies

```bash
# Inside container
pct exec 200 -- bash

apt update && apt install -y \
  nodejs \
  npm \
  git \
  sqlite3 \
  curl

# Node 22 is recommended
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
```

### 3. Clone and Setup Signal-Scheduler

```bash
cd /opt
git clone https://github.com/jarvis4openclaw/signal-scheduler.git
cd signal-scheduler

# Install dependencies
npm install

# Create data directory
mkdir -p /opt/signal-scheduler/data
```

### 4. Setup Database

```bash
# Create schema
cat > /opt/signal-scheduler/data/schema.sql << 'EOF'
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  group_id TEXT NOT NULL,
  group_name TEXT,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP
);
EOF

# Initialize database
sqlite3 /opt/signal-scheduler/data/scheduler.db < /opt/signal-scheduler/data/schema.sql
```

### 5. Setup Environment Variables

```bash
cat > /opt/signal-scheduler/.env << 'EOF'
DB_PATH=/opt/signal-scheduler/data/scheduler.db
SIGNAL_API_URL=http://localhost:8080
SIGNAL_NUMBER=+17025768110
EOF
```

### 6. Install and Configure Signal CLI (Docker)

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# Run signal-cli-rest-api
docker run -d \
  --name signal-cli-rest-api \
  --restart unless-stopped \
  -p 8080:8080 \
  -v /opt/signal-data:/home/signal/.local/share/signal-cli \
  -e MODE=json-rpc \
  bbernhard/signal-cli-rest-api:latest

# Wait for service to start (about 30 seconds)
sleep 30
```

### 7. Link Signal Number

```bash
# Check status (shows if linked)
curl http://localhost:8080/v1/about

# If not linked, follow these steps:
# 1. Get the linking URI
curl http://localhost:8080/v1/link/new-device
# 2. Scan QR code with Signal app on your phone
# 3. Verify with this command
curl http://localhost:8080/v1/about
```

### 8. Create Systemd Services

**Web UI Service:**

```bash
cat > /etc/systemd/system/signal-scheduler-web.service << 'EOF'
[Unit]
Description=Signal Scheduler Web UI
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/signal-scheduler
Environment="NODE_ENV=production"
Environment="DB_PATH=/opt/signal-scheduler/data/scheduler.db"
Environment="SIGNAL_API_URL=http://localhost:8080"
Environment="SIGNAL_NUMBER=+17025768110"
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
```

**Scheduler Service:**

```bash
cat > /etc/systemd/system/signal-scheduler.service << 'EOF'
[Unit]
Description=Signal Scheduler Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/signal-scheduler
Environment="NODE_ENV=production"
Environment="DB_PATH=/opt/signal-scheduler/data/scheduler.db"
Environment="SIGNAL_API_URL=http://localhost:8080"
Environment="SIGNAL_NUMBER=+17025768110"
ExecStart=/usr/bin/npm run scheduler
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
```

### 9. Build and Start Services

```bash
# Build Next.js app
cd /opt/signal-scheduler
npm run build

# Enable and start services
systemctl enable signal-scheduler-web
systemctl enable signal-scheduler
systemctl start signal-scheduler-web
systemctl start signal-scheduler

# Check status
systemctl status signal-scheduler-web
systemctl status signal-scheduler
```

### 10. Verify Setup

```bash
# Check web UI
curl http://localhost:3000/

# Check scheduler logs
journalctl -u signal-scheduler -f

# Check Signal API
curl http://localhost:8080/v1/groups
```

## API Endpoints

- `GET /api/groups` - List all Signal groups
- `GET /api/posts` - List all scheduled posts
- `POST /api/posts` - Create a new scheduled post
- `DELETE /api/posts/:id` - Delete a scheduled post

## Troubleshooting

### Posts not sending

1. Check Signal API status: `curl http://localhost:8080/v1/about`
2. Check scheduler logs: `journalctl -u signal-scheduler -n 50`
3. Verify database has scheduled posts: `sqlite3 /opt/signal-scheduler/data/scheduler.db "SELECT * FROM posts"`
4. Check timezone alignment - `scheduled_at` should be in ISO format

### Web UI not loading

1. Check web service: `systemctl status signal-scheduler-web`
2. Check port 3000: `ss -tlnp | grep 3000`
3. Check logs: `journalctl -u signal-scheduler-web -n 50`

### Duplicate posts being sent

Possible causes:
1. Multiple scheduler instances running - check: `systemctl status signal-scheduler`
2. Timezone mismatch between scheduled time and server time
3. Database not updating status properly - check: `sqlite3 scheduler.db "SELECT * FROM posts WHERE status = 'sent'"`

## Database Schema

```sql
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  group_id TEXT NOT NULL,
  group_name TEXT,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP
);

CREATE INDEX idx_posts_scheduled_at ON posts(scheduled_at);
CREATE INDEX idx_posts_status ON posts(status);
```

## License

MIT
