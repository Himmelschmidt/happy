# Happy Local Development Setup

Run the Happy server locally on your Mac and control AI coding sessions from your phone via Tailscale. All commands use `HAPPY_SERVER_URL=http://localhost:3005` — this setup always runs against a local server.

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

### 3. Link the CLI Globally

This creates a `happy` command available from any directory:

```bash
cd packages/happy-cli
yarn link:stable
```

Verify it works:

```bash
happy --help
```

To remove the symlink later: `yarn unlink:stable`

### 4. Run Database Migrations

```bash
cd packages/happy-server
HANDY_MASTER_SECRET=some-local-secret yarn standalone migrate
```

### 5. Firestore (for Notifications)

The notification system uses a shared Firebase Firestore database (project `happy-22511`). The Firebase config is already hardcoded in the CLI and app source, so **no per-machine setup is needed** — any machine running the CLI will write to the same Firestore database, and any phone running the app will read from it.

Firestore and its security rules are already configured. Nothing to do here unless the project is reset, in which case:

1. Go to [Firebase Console](https://console.firebase.google.com/) → project `happy-22511`
2. Enable **Cloud Firestore** if not already enabled
3. Set **Firestore Security Rules** (Firebase Console → Firestore → Rules):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /notifications/{docId} {
      allow read, write: if true;
    }
  }
}
```

### 6. FCM Service Account (for Push Notifications)

Push notifications are sent directly from the CLI to devices via Google's FCM V1 API. This requires a Firebase service account key:

```bash
cp ~/Desktop/happy-22511-ec481c9cd0c5.json ~/.happy/fcm-service-account.json
```

If the file is missing, `happy notify` will still write to Firestore but will skip the push notification with a warning.

### 7. Build the Android APK

```bash
cd packages/happy-app
yarn prebuild                          # Generate native android/ directory
cd android
./gradlew assembleRelease              # Build release APK (~2-5 min first time)
```

The APK will be at: `android/app/build/outputs/apk/release/app-release.apk`

### 8. Install APK on Phone

Connect phone via USB with USB debugging enabled, then:

```bash
~/Library/Android/sdk/platform-tools/adb install app/build/outputs/apk/release/app-release.apk
```

### 9. Authenticate (Phone First, Then CLI)

Authentication order matters: the phone and CLI must end up as the **same user**. The CLI auth works by showing a QR code that the phone scans, linking them to one account.

**a) Phone — create account first:**
1. Open the Happy app
2. Set Custom Server URL to `http://<your-tailscale-ip>:3005` (find IP with `tailscale ip -4`)
3. Create a new account

**b) CLI — auth by scanning from the phone:**

Run this in an interactive terminal (not from a script):

```bash
HAPPY_SERVER_URL=http://localhost:3005 happy auth login --force
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
HAPPY_SERVER_URL=http://localhost:3005 happy daemon start
```

### Step 3: Start a Session

In a new terminal:

```bash
HAPPY_SERVER_URL=http://localhost:3005 happy
```

This shows a QR code you can scan from the phone app.

### Step 4: Connect from Phone

1. Open the Happy app
2. Set Custom Server URL to `http://<your-tailscale-ip>:3005`
3. Scan the QR code from Step 3

Find your Mac's Tailscale IP with: `tailscale ip -4`

## Sending Notifications

Send a notification from any terminal to the phone app:

```bash
HAPPY_SERVER_URL=http://localhost:3005 happy notify -p "Deployment complete!"
HAPPY_SERVER_URL=http://localhost:3005 happy notify -p "Build failed" -t "CI Alert"
```

This writes to Firestore (appears in the app's Inbox tab in real-time) and sends a push notification.

## Quick Start (Shell Aliases)

Add to your `~/.zshrc` so you don't have to type the env vars every time:

```bash
export HAPPY_SERVER_URL=http://localhost:3005
export HANDY_MASTER_SECRET=some-local-secret
alias happy-server='cd ~/Code\ Projects/Happy/happy/packages/happy-server && HANDY_MASTER_SECRET=some-local-secret yarn standalone serve'
alias happy-daemon='happy daemon start'
```

Then after reboot, just run in separate terminals:
1. `happy-server`
2. `happy-daemon`
3. `happy`

With `HAPPY_SERVER_URL` exported in your shell profile, all `happy` commands automatically use the local server.

## Rebuilding

### CLI (after code changes)

```bash
cd packages/happy-cli
yarn build
```

The global `happy` symlink points to `bin/happy.mjs` which loads `dist/`, so a rebuild is all you need — no re-linking required.

### APK (after app code changes)

Only needed if you change app code. Subsequent builds are much faster (~30s with cache):

```bash
cd happy/packages/happy-app/android
./gradlew assembleRelease
~/Library/Android/sdk/platform-tools/adb install -r app/build/outputs/apk/release/app-release.apk
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `happy: command not found` | Run `cd packages/happy-cli && yarn link:stable` (may need `sudo`) |
| Server won't start | Make sure port 3005 is free: `lsof -i :3005` |
| Daemon shows "not running" | Check logs in `~/.happy/logs/` for errors |
| CLI gives 401 Unauthorized | Re-authenticate: `HAPPY_SERVER_URL=http://localhost:3005 happy auth login --force` |
| Phone can't connect to server | Verify Tailscale is connected on both devices; test with `curl http://<tailscale-ip>:3005` from phone or another device |
| Phone sees machine but sessions won't connect | Phone and CLI are probably different users. Do a full reset (see below) |
| Daemon won't start (lock file) | Remove stale lock: `rm -f ~/.happy/daemon.state.json.lock ~/.happy/daemon.state.json` |
| `happy notify` fails with Firestore error | Check that Firestore is enabled and security rules are set (see step 5) |
| Gradle OutOfMemoryError | Already fixed in `gradle.properties` (4GB heap). If it recurs, increase `-Xmx4096m` |
| `adb` not found | Use full path: `~/Library/Android/sdk/platform-tools/adb` |
| Phone shows "unauthorized" in adb | Approve the USB debugging prompt on the phone |

### Full Reset (Nuclear Option)

If things are broken and you can't figure out why, do a complete reset. This wipes all local auth state and starts fresh.

```bash
# 1. Stop everything
happy daemon stop
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
HAPPY_SERVER_URL=http://localhost:3005 happy auth login --force

# 6. Start daemon
HAPPY_SERVER_URL=http://localhost:3005 happy daemon start
```

**Critical:** Step 4 (phone account) must happen BEFORE step 5 (CLI auth). The CLI auth QR code must be scanned from the phone so both end up as the same user.

## Architecture Notes

- **Server** uses standalone mode with embedded PGLite (no PostgreSQL/Redis/Docker needed)
- **Daemon** connects to the server via WebSocket and spawns Claude Code sessions on demand
- **Phone app** communicates with sessions through the server
- **Notifications** go through Firestore: `happy notify` writes to Firestore + sends FCM push directly; the app listens in real-time via `onSnapshot`
- All communication is: Phone -> Server (via Tailscale) <- Daemon (via localhost)
- Credentials are stored in `~/.happy/access.key` and are tied to a specific server
- **Auth model:** The phone and CLI must be the same user. The CLI's `auth login` generates a QR code; when the phone scans it, the CLI gets linked to the phone's user account. If they become different users (e.g., phone clears data after CLI auth), sessions won't work.
