# `menachem_changes` Branch — Change Analysis

**Base:** `main` (commit `d343330c`)
**Branch:** `menachem_changes` (4 commits, 58 files changed, +2,426 / -2,883 lines)
**Date of analysis:** 2026-03-01

This document describes what changed and what was preserved on the `menachem_changes` branch, to serve as a reference when incorporating future upstream changes from `main`.

---

## Summary of Intent

The branch makes four categories of changes:

1. **Local development setup documentation** — New `LOCAL_SETUP.md` with complete instructions
2. **Enhanced file/folder viewing** — Full directory browsing, image preview, encryption removal for performance
3. **AI input from phone** — File upload from phone into active session
4. **Inbox + push notifications overhaul** — Replaces the friends/feed system with Firebase-based notifications; removes the entire social layer

---

## Commit-by-Commit Breakdown

### Commit 1: `bf7eea13` — "local setup documentation"
**1 file added** — `LOCAL_SETUP.md`

A 150-line guide for running the full Happy stack locally (server, daemon, CLI, phone app via Tailscale). Purely additive; no code changes.

### Commit 2: `783778d7` — "Added full folder and file viewing support. removed any encryption for performance purposes etc"
**28 files changed** (+835 / -618)

This is the largest functional commit. Key changes:

| Area | What Changed |
|------|-------------|
| **Path picker** (`new/pick/path.tsx`) | Added a live directory browser that shells `ls -1pa` on the remote machine, with navigate-into-folder and go-up navigation |
| **File viewer** (`session/[id]/file.tsx`) | Removed git diff view (DiffDisplay component deleted). Added image file preview via base64 data URIs. Switched path encoding from base64 to URI-encoding. Added large-file protection (skip syntax highlighting >10K chars). Accepts `encoding: 'utf8'` directly from CLI (no base64 round-trip) |
| **Files browser** (`session/[id]/files.tsx`) | Replaced git-status-only file list with a full directory listing. Added breadcrumb navigation, folder traversal, back-button handling. Falls back to git-changed-files search. Removed encryption-dependent code |
| **Session view** (`SessionView.tsx`) | File viewer button now always shown (was gated behind `experiments` setting) |
| **Agent input** (`AgentInput.tsx`) | Minor: adjusted layout spacing |
| **Tool view** (`ToolView.tsx`) | Minor adjustments |
| **Sync layer** (`apiSocket.ts`, `ops.ts`, `gitStatusFiles.ts`) | Added `sessionListDirectory` RPC. Added `machineBash` RPC. Updated file-path encoding from base64 to URI-encoding. Added `encoding` field support in read responses |
| **CLI: RPC handlers** (`RpcHandlerManager.ts`, `types.ts`, `registerCommonHandlers.ts`) | Added `listDirectory` handler returning `DirectoryEntry[]`. Removed encryption from `readFile` responses (sends raw utf8). Expanded `machineBash` to be callable from app. Removed or simplified hash-based encryption checks |
| **CLI: SDK query** (`query.ts`) | Minor adjustments to Claude SDK interaction |
| **Server** (`socket.ts`, `rpcHandler.ts`) | Added passthrough for new `listDirectory` and `machineBash` RPC types |
| **Translations** | Added `files.folder`, `files.parentFolder`, `files.searchFiles`, `files.browseFiles` to all 10 language files |
| **LOCAL_SETUP.md** | Expanded with auth ordering, full reset instructions, troubleshooting |
| **Server `.env.dev`** | Updated environment variables |

### Commit 3: `038097f2` — "Input into the ai"
**3 files changed** (+94 / -3)

| Area | What Changed |
|------|-------------|
| **Agent input** (`AgentInput.tsx`) | Added file upload button (attach icon). Uses `expo-document-picker` and `expo-file-system` to pick a file, read it as base64, and write it to the session's working directory via `sessionWriteFile`. Inserts the file path into the text input |
| **Sync ops** (`ops.ts`) | Added `overwrite` flag to `sessionWriteFile` request — skips hash verification for phone uploads |
| **CLI handlers** (`registerCommonHandlers.ts`) | Added `overwrite` mode to `writeFile` handler — bypasses hash check, writes directly |

### Commit 4: `3c2f0ff3` — "added message to inbox and push notifications"
**31 files changed** (+1,371 / -2,286) — Net deletion of ~915 lines

This is the most destructive commit. It removes the entire social/friends system and replaces the inbox with Firebase notifications.

#### REMOVED (entire features deleted):
| File | What Was Removed |
|------|-----------------|
| `friends/index.tsx` | Friends list screen (pending requests, accepted friends, sent requests) |
| `friends/search.tsx` | Friend search screen (username search, add friend) |
| `user/[id].tsx` | User profile screen (avatar, bio, friend actions, GitHub link) |
| `FeedItemCard.tsx` | Feed item component (friend request/accepted notifications) |
| `UserCard.tsx` | User card component (avatar + name + username) |
| `UserSearchResult.tsx` | Search result component with add-friend button |
| `apiFriends.ts` | All friends API calls (search, get profile, send request, remove friend, get list) |
| `apiFeed.ts` | Feed API (fetch paginated feed items) |
| `feedTypes.ts` | Zod schemas for feed items (friend_request, friend_accepted, text) |
| `friendTypes.ts` | Zod schemas for UserProfile, RelationshipStatus, and utility functions |
| **In `_layout.tsx`** | Removed Stack.Screen entries for `friends/index`, `friends/search`, `user/[id]` |
| **In `storage.ts`** | Removed all friends/feed state: `friends`, `users`, `feedItems`, `feedHead`, `feedTail`, `feedHasMore`, `feedLoaded`, `friendsLoaded`. Removed all related methods and hooks: `applyFriends`, `applyRelationshipUpdate`, `applyFeedItems`, `clearFeed`, `useFriends`, `useFriendRequests`, `useAcceptedFriends`, `useFeedItems`, `useUser`, etc. |
| **In `sync.ts`** | Removed `friendsSync`, `friendRequestsSync`, `feedSync` InvalidateSync instances. Removed `fetchFriends`, `fetchFriendRequests`, `fetchFeed`, `assumeUsers` methods. Removed all related invalidation calls |
| **In `apiTypes.ts`** | Replaced `RelationshipStatusSchema`/`UserProfileSchema`/`FeedBodySchema` imports with inline passthrough schemas (`z.string()` / `z.any()`) |
| **In `track/index.ts`** | Removed tracking functions (trackFriendsConnect, trackFriendsSearch, trackFriendsProfileView) |

#### ADDED (new notification system):
| File | What Was Added |
|------|---------------|
| `firebase/config.ts` | Firebase app initialization + Firestore instance (project `happy-22511`) |
| `firebase/notifications.ts` | `useNotifications()` hook — subscribes to Firestore `notifications` collection via `onSnapshot`, returns `{notifications, loading, unreadCount}`. `markNotificationRead()` — updates Firestore doc. `Notification` type: `{id, title, body, source, timestamp, read}` |
| `happy-cli/src/firebase/fcm.ts` | FCM V1 push notification sender using service account auth |
| `happy-cli/src/firebase/firestore.ts` | Firestore writer — writes notification documents from CLI |
| `happy-cli/scripts/link.cjs` | Script to globally symlink the `happy` CLI command |

#### MODIFIED (migrated to new system):
| File | What Changed |
|------|-------------|
| `InboxView.tsx` | Completely rewritten. Was: friends list + feed items via zustand storage. Now: `NotificationCard` components rendering Firestore notifications. Cards show title, body (expandable), timestamp, unread indicator. Removed `HeaderRightTablet` (friend search button). Removed all friend/feed imports |
| `MainView.tsx` | Badge count changed from `friendRequests.length` to `unreadCount` from `useNotifications()`. Removed inbox "add friend" header button |
| `SidebarView.tsx` | Badge count changed from `friendRequests.length` to `unreadCount`. Same migration pattern |
| `useInboxHasContent.ts` | Simplified: was checking friends + feed + updates. Now checks `unreadCount > 0` from Firebase |
| `google-services.json` | Switched Firebase project from `happy-coder-9fe36` to `happy-22511`. Removed entries for `com.ex3ndr.happy` and `com.slopus.happy.preview` package names |
| `package.json` | Added `firebase` dependency |
| `sync.ts` | Push token registration changed from `getExpoPushTokenAsync` to `getDevicePushTokenAsync` (raw FCM/APNs token instead of Expo relay) |
| `happy-cli/src/index.ts` | Added `happy notify` command with `-p` (body) and `-t` (title) flags. Writes to Firestore + sends FCM push |
| `happy-cli/src/api/pushNotifications.ts` | Simplified — removed most Expo push notification logic |
| `happy-cli/package.json` | Added firebase-admin and google-auth-library dependencies |
| `LOCAL_SETUP.md` | Added Firestore setup, FCM service account, `happy notify` usage, CLI global linking |

---

## What Was Preserved (Unchanged)

The following core systems remain intact and should be safe to merge changes from `main`:

- **Authentication flow** — QR code auth, AuthContext, token storage
- **Session management** — Session creation, session list, session messages, session view (except file viewer button gate removal)
- **Real-time sync engine** — WebSocket connection, SyncSocket, SyncSession, InvalidateSync pattern
- **Voice/Realtime** — LiveKit integration, VoiceAssistantStatusBar
- **Settings system** — Settings screens, persistence, sync
- **Encryption core** — libsodium encryption module files still exist (though encryption was removed from file read/write operations)
- **Styling/theming** — Unistyles setup, themes, breakpoints
- **Navigation structure** — Tab-based layout, Stack navigator (minus removed friend/user screens)
- **Component library** — Item, ItemList, ItemGroup, Avatar, Header, etc.
- **i18n system** — Translation infrastructure, all language files (though some friend-related keys may now be unused)
- **Purchases/RevenueCat** — Untouched
- **Artifacts** — Untouched
- **Changelog** — Untouched
- **Profile management** — Untouched
- **Machine management** — Untouched (enhanced with machineBash)
- **Project management** — Untouched

---

## Guide: Evaluating New Upstream Commits for Incorporation

When new commits land on `main`, use this section to decide **whether each change is relevant** to this branch and, if so, which parts to take.

### SKIP — Features That No Longer Exist Here

These features were fully removed. Any upstream changes to them should be **ignored** unless the decision is made to restore the feature entirely.

| Removed Feature | Files to Ignore |
|----------------|----------------|
| Friends / social layer | `apiFriends.ts`, `friendTypes.ts`, `friends/index.tsx`, `friends/search.tsx`, `user/[id].tsx`, `UserCard.tsx`, `UserSearchResult.tsx`, and any server/CLI endpoints for `/v1/friends/*` or `/v1/user/*` |
| Feed system | `apiFeed.ts`, `feedTypes.ts`, `FeedItemCard.tsx`, and any server endpoints for `/v1/feed` |
| Friends/feed state in storage | Any changes to `storage.ts` that touch `friends`, `users`, `feedItems`, `feedHead`, `feedTail`, `feedHasMore`, `feedLoaded`, `friendsLoaded`, or their associated methods (`applyFriends`, `applyRelationshipUpdate`, `applyFeedItems`, `clearFeed`, etc.) |
| Friends/feed sync logic | Any changes to `sync.ts` that touch `friendsSync`, `friendRequestsSync`, `feedSync`, `fetchFriends`, `fetchFeed`, `assumeUsers` |
| Friends-related tracking | Changes to `track/index.ts` for `trackFriendsConnect`, `trackFriendsSearch`, `trackFriendsProfileView` |
| Expo push token relay | Changes to push notification registration using `getExpoPushTokenAsync` — this branch uses raw device tokens via `getDevicePushTokenAsync` instead |

### TAKE WITH CARE — Areas That Were Significantly Rewritten

These areas still exist but work differently. Upstream changes need to be **evaluated individually** — take the intent but adapt to the new implementation.

| Area | What Changed Here | How to Evaluate Upstream Changes |
|------|------------------|--------------------------------|
| **`InboxView.tsx`** | Completely rewritten to show Firebase notifications instead of friends/feed. Uses `NotificationCard` components, `useNotifications()` hook | If upstream improves inbox UI/UX (layout, animations, empty states), adapt the improvements to the notification-based view. Skip anything friends/feed-specific |
| **`MainView.tsx`** | Badge count uses `useNotifications().unreadCount` instead of `useFriendRequests().length`. Removed inbox "add friend" header button | Take upstream changes to MainView that don't touch badge logic or the inbox tab's header actions. For badge changes, adapt to use `unreadCount` |
| **`SidebarView.tsx`** | Same badge count migration as MainView | Same guidance as MainView |
| **File viewer (`file.tsx`)** | Removed git diff view, added image preview, switched to URI encoding, handles `encoding: 'utf8'` from CLI | If upstream improves the diff view — decide if you want it back. If upstream adds other file type previews, those should incorporate cleanly. Watch for path encoding assumptions (this branch uses `encodeURIComponent`, `main` uses `btoa`) |
| **Files browser (`files.tsx`)** | Replaced git-status file list with full directory browsing + breadcrumb navigation | If upstream improves the git-status view, skip it. If upstream adds search improvements, those can likely be adapted. Take any general UX improvements |
| **Path picker (`new/pick/path.tsx`)** | Added live directory browser using `machineBash` | Upstream changes to this screen should be compatible — the directory browser was additive |
| **`apiTypes.ts`** | `RelationshipStatusSchema`, `UserProfileSchema`, `FeedBodySchema` replaced with passthrough `z.any()` stubs | If upstream adds validation logic using these schemas, skip it (the types they validate are gone). If upstream modifies other schemas in this file, those changes should be safe to take |
| **Push notifications (`sync.ts`)** | Changed from `getExpoPushTokenAsync` to `getDevicePushTokenAsync` for direct FCM | If upstream improves push notification handling, evaluate whether it assumes Expo relay or could work with raw tokens |
| **`google-services.json`** | Different Firebase project (`happy-22511` vs `happy-coder-9fe36`) | Always keep the `happy-22511` config. If upstream changes this file, ignore it |

### TAKE FREELY — Areas That Are Unchanged or Minimally Touched

Upstream changes to these areas can generally be incorporated directly:

- **Authentication** — QR code flow, AuthContext, token storage
- **Session management** — Session creation, list, messages, core session view
- **Real-time sync engine** — WebSocket, SyncSocket, SyncSession, InvalidateSync (except the removed friend/feed sync instances)
- **Voice / LiveKit** — Completely untouched
- **Settings** — All settings screens and persistence
- **Encryption modules** — The core libsodium files still exist (just not called from file read/write paths)
- **Component library** — Item, ItemList, ItemGroup, Avatar, Header, MultiTextInput, etc.
- **i18n infrastructure** — Translation system, language files (note: some friend-related translation keys are now unused but harmless)
- **Purchases / RevenueCat** — Untouched
- **Artifacts** — Untouched
- **Changelog** — Untouched
- **Profile management** — Untouched
- **Machine management** — Untouched (enhanced with `machineBash`)
- **New screens / features** — Anything that doesn't depend on the removed social layer
- **`_layout.tsx`** — Take changes **except** any that add back `friends/index`, `friends/search`, or `user/[id]` Stack.Screen entries
- **`storage.ts`** / **`sync.ts`** — Take changes to non-friends/feed sections (sessions, machines, settings, artifacts, etc.)

### Quick Decision Flowchart

When reviewing an upstream commit:

1. **Does it touch only files in the "TAKE FREELY" list?** → Incorporate it
2. **Does it only modify deleted files (friends, feed, UserCard, etc.)?** → Skip entirely
3. **Does it touch a "TAKE WITH CARE" file?**
   - Read the specific change
   - Is it improving something that still exists (UI polish, bug fix, performance)? → Adapt and incorporate
   - Is it improving the removed feature (friends UI, feed pagination, etc.)? → Skip
   - Is it a mixed commit touching both? → Cherry-pick the relevant parts
4. **Does it add a new feature that depends on friends/feed?** → Skip unless you want to restore that dependency
5. **Does it add a new feature unrelated to friends/feed?** → Incorporate it
