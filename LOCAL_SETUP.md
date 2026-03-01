# Happy Local Development Setup

Run the Happy server on your Mac and control AI coding sessions from your phone via Tailscale.

## Prerequisites

- **Node.js 20+** (`brew install node@20` or use nvm)
- **Yarn 1.22** (`corepack enable && corepack prepare yarn@1.22.22 --activate`)
- **Android Studio** (for building the Android APK and `adb`)
- **Tailscale** installed on both Mac and phone, with both devices on the same Tailnet

## Initial Setup (First Time Only)

### 1. Install Dependencies

```bash
cd happy/
yarn install
```

### 2. Build the CLI

```bash
cd packages/happy-cli
yarn build
```

### 3. Run Database Migrations

```bash
cd packages/happy-server
HANDY_MASTER_SECRET=some-local-secret yarn standalone migrate
```

### 4. Build the Android APK

```bash
cd packages/happy-app
yarn prebuild                          # Generate native android/ directory
cd android
./gradlew assembleRelease              # Build release APK (~2-5 min first time)
```

The APK will be at: `android/app/build/outputs/apk/release/app-release.apk`

### 5. Install APK on Phone

Connect phone via USB with USB debugging enabled, then:

```bash
~/Library/Android/sdk/platform-tools/adb install app/build/outputs/apk/release/app-release.apk
```

### 6. Authenticate (Phone First, Then CLI)

Authentication order matters: the phone and CLI must end up as the **same user**. The CLI auth works by showing a QR code that the phone scans, linking them to one account.

**a) Phone — create account first:**
1. Open the Happy app
2. Set Custom Server URL to `http://<your-tailscale-ip>:3005` (find IP with `tailscale ip -4`)
3. Create a new account

**b) CLI — auth by scanning from the phone:**

Run this in an interactive terminal (not from a script):

```bash
cd packages/happy-cli
HAPPY_SERVER_URL=http://localhost:3005 ./bin/happy.mjs auth login --force
```

This shows a QR code. Scan it **from the phone** (which is already logged into the new account). This links the CLI to the same user as the phone.

**c) Verify:** Both the phone and CLI are now the same user. Credentials are stored in `~/.happy/access.key`.

## Starting Everything (After Reboot)

Run these steps in order each time you want to use the system.

### Step 1: Start the Server

```bash
cd happy/packages/happy-server
HANDY_MASTER_SECRET=some-local-secret yarn standalone serve
```

Verify it's running: `curl http://localhost:3005` should return "Welcome to Happy Server!"

### Step 2: Start the Daemon

In a new terminal:

```bash
cd happy/packages/happy-cli
HAPPY_SERVER_URL=http://localhost:3005 ./bin/happy.mjs daemon start
```

### Step 3: Start a Session

In a new terminal:

```bash
cd happy/packages/happy-cli
HAPPY_SERVER_URL=http://localhost:3005 ./bin/happy.mjs
```

This shows a QR code you can scan from the phone app.

### Step 4: Connect from Phone

1. Open the Happy app
2. Set Custom Server URL to `http://<your-tailscale-ip>:3005`
3. Scan the QR code from Step 3

Find your Mac's Tailscale IP with: `tailscale ip -4`

## Quick Start (Shell Alias)

Add to your `~/.zshrc` for convenience:

```bash
export HAPPY_SERVER_URL=http://localhost:3005
alias happy-server='cd ~/Code\ Projects/Happy/happy/packages/happy-server && HANDY_MASTER_SECRET=some-local-secret yarn standalone serve'
alias happy-daemon='cd ~/Code\ Projects/Happy/happy/packages/happy-cli && ./bin/happy.mjs daemon start'
alias happy='cd ~/Code\ Projects/Happy/happy/packages/happy-cli && ./bin/happy.mjs'
```

Then after reboot, just run in separate terminals:
1. `happy-server`
2. `happy-daemon`
3. `happy`

## Rebuilding the APK

Only needed if you change app code. Subsequent builds are much faster (~30s with cache):

```bash
cd happy/packages/happy-app/android
./gradlew assembleRelease
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/release/app-release.apk
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Server won't start | Make sure port 3005 is free: `lsof -i :3005` |
| Daemon shows "not running" | Check logs in `~/.happy/logs/` for errors |
| CLI gives 401 Unauthorized | Re-authenticate: `HAPPY_SERVER_URL=http://localhost:3005 ./bin/happy.mjs auth login --force` |
| Phone can't connect to server | Verify Tailscale is connected on both devices; test with `curl http://<tailscale-ip>:3005` from phone or another device |
| Phone sees machine but sessions won't connect | Phone and CLI are probably different users. Do a full reset (see below) |
| Daemon won't start (lock file) | Remove stale lock: `rm -f ~/.happy/daemon.state.json.lock ~/.happy/daemon.state.json` |
| Gradle OutOfMemoryError | Already fixed in `gradle.properties` (4GB heap). If it recurs, increase `-Xmx4096m` |
| `adb` not found | Use full path: `~/Library/Android/sdk/platform-tools/adb` |
| Phone shows "unauthorized" in adb | Approve the USB debugging prompt on the phone |

### Full Reset (Nuclear Option)

If things are broken and you can't figure out why, do a complete reset. This wipes all local auth state and starts fresh.

```bash
# 1. Stop everything
cd happy/packages/happy-cli
HAPPY_SERVER_URL=http://localhost:3005 ./bin/happy.mjs daemon stop
pkill -f "happy-cli/dist/index.mjs"
kill $(lsof -ti tcp:3005) 2>/dev/null

# 2. Wipe CLI credentials and state
rm -f ~/.happy/access.key
rm -f ~/.happy/settings.json
rm -f ~/.happy/daemon.state.json
rm -f ~/.happy/daemon.state.json.lock

# 3. Start server
cd happy/packages/happy-server
HANDY_MASTER_SECRET=some-local-secret yarn standalone serve

# 4. On phone: Settings > Apps > Happy (dev) > Storage > Clear Storage
#    Then open app, set server URL to http://<tailscale-ip>:3005, create new account

# 5. Auth CLI (scan QR from phone's new account)
cd happy/packages/happy-cli
HAPPY_SERVER_URL=http://localhost:3005 ./bin/happy.mjs auth login --force

# 6. Start daemon
HAPPY_SERVER_URL=http://localhost:3005 ./bin/happy.mjs daemon start
```

**Critical:** Step 4 (phone account) must happen BEFORE step 5 (CLI auth). The CLI auth QR code must be scanned from the phone so both end up as the same user.

## Architecture Notes

- **Server** uses standalone mode with embedded PGLite (no PostgreSQL/Redis/Docker needed)
- **Daemon** connects to the server via WebSocket and spawns Claude Code sessions on demand
- **Phone app** communicates with sessions through the server
- All communication is: Phone -> Server (via Tailscale) <- Daemon (via localhost)
- Credentials are stored in `~/.happy/access.key` and are tied to a specific server
- **Auth model:** The phone and CLI must be the same user. The CLI's `auth login` generates a QR code; when the phone scans it, the CLI gets linked to the phone's user account. If they become different users (e.g., phone clears data after CLI auth), sessions won't work.
