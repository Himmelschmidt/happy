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

### 6. Authenticate CLI Against Local Server

Run this in an interactive terminal (not from a script):

```bash
cd packages/happy-cli
HAPPY_SERVER_URL=http://localhost:3005 ./bin/happy.mjs auth login --force
```

Follow the prompts to create your account on the local server.

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
| Gradle OutOfMemoryError | Already fixed in `gradle.properties` (4GB heap). If it recurs, increase `-Xmx4096m` |
| `adb` not found | Use full path: `~/Library/Android/sdk/platform-tools/adb` |
| Phone shows "unauthorized" in adb | Approve the USB debugging prompt on the phone |

## Architecture Notes

- **Server** uses standalone mode with embedded PGLite (no PostgreSQL/Redis/Docker needed)
- **Daemon** connects to the server via WebSocket and spawns Claude Code sessions on demand
- **Phone app** communicates with sessions through the server
- All communication is: Phone -> Server (via Tailscale) <- Daemon (via localhost)
- Credentials are stored in `~/.happy/access.key` and are tied to a specific server
