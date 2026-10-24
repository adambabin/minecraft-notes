# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A phone-first PWA ("Minecraft Coords") for saving Minecraft **Bedrock** coordinates, statuses, notes, links and photos, shared live between the members of a world. The main users are the owner and a friend playing on the "Rebadam" realm. Vite + React + TypeScript, with Firebase Auth (Google) and Firestore. There is no backend server. It is deployed to GitHub Pages at `https://adambabin.github.io/minecraft-notes/`.

## Commands

```sh
npm test                       # vitest: unit tests for coords.ts / importNote.ts
npx vitest run src/coords.test.ts      # one test file
npx vitest run -t "parseCoords"        # tests matching a name
npm run typecheck              # tsc --noEmit
npm run build                  # typecheck + vite build (also generates the service worker)
npm run dev                    # uses the real Firebase project in src/firebaseConfig.ts
```

To run fully locally against the Firebase emulators (needs Java; the emulators load `firestore.rules` from `firebase.json`):

```sh
npx firebase-tools emulators:start --only auth,firestore --project demo-minecraft-notes
VITE_USE_EMULATOR=true npm run dev
```

In emulator mode `window.__emulatorSignIn(email)` signs in without the Google popup. Use it for browser automation; Playwright is preinstalled in cloud sessions. There are no automated rules tests in the repo. When you change `firestore.rules`, verify it against the emulator with the Firebase JS SDK, signing in as a member, an invitee and a stranger.

## Architecture

**Data model** (Firestore):
- `worlds/{worldId}` holds `name`, the editable `statuses[]`/`categories[]` for that world, `members` (uid array) and `memberInfo` (uid → {name, joinedAt}).
- `worlds/{worldId}/places|items|images/{id}` are subcollections.
- `invites/{token}` holds `{worldId, worldName, active, ...}`.
- Types live in `src/types.ts`.

**Access control lives in `firestore.rules`**, not in the app:
- Only members can read or write a world and its subcollections.
- A non-member may update a world only to add *themselves*, and only by setting `joinedWith` to an active invite token for that world.
- New worlds must be created with `members == [creator]`.
- The app's `useWorlds` query must keep `where('members','array-contains', uid)`, or the rules reject it.
- The rules are deployed by hand: the owner pastes the file into Firebase console → Firestore → Rules. A push does **not** deploy them, so any rules change needs that manual step called out to the user. Keep account emails out of the repo; it's public.

**Writes never block on the network** (`src/data.ts`):
- Firestore runs with `persistentLocalCache`, so the UI fires writes and wraps them in `track()`. The header sync badge counts pending and failed writes from it.
- Don't `await` normal writes in UI code: offline they only resolve once back online. The exception is `joinWorld`, which needs the server's answer.
- Live data comes from `useLiveQuery`. On `permission-denied` it re-subscribes with backoff, because a just-created or just-joined world isn't visible to rules until the server has it.

**Deletion is soft.** Places and items get `deleted: true` and show up in Trash (More tab), with Undo toasts. Only `purge()` hard-deletes, and it also deletes the entry's images. Lists must filter out `deleted` entries.

**Images** are compressed client-side (`src/images.ts`) into JPEG data URLs under about 900 KB and stored as their own docs in `images/`. Entries reference them by `imageIds`. This avoids Cloud Storage, which would need the paid Blaze plan; the project stays on the free Spark plan. Forms call `settleImages()` on close to delete photos that were added and then cancelled, or removed.

**Coordinates** (`src/coords.ts`):
- Values are stored as signed integers; `y` is nullable.
- Entry uses an abs-value field plus a ± toggle per axis, because the iOS number pad has no minus key.
- `parseCoords` reads Bedrock "Position: x, y, z", Java F3 text, or two numbers (x z).
- Nether ↔ Overworld conversion is ÷8 / ×8.

**Places nest** through `parentId` (e.g. a portal inside a cave). `PlacesView` renders a tree when no filter or search is active, and a flat list otherwise.

**`src/importNote.ts`** parses the owner's original Apple Notes checklist (`src/seedNote.ts`) into places and items:
- indentation → `parentId`
- coordinate lines → places
- URLs → links
- other lines → to-dos
- category and Nether-portal guesses are heuristics

The seed is only pre-filled in a world named "Rebadam".

**Startup**: `App.tsx` lazy-loads `Root.tsx` only when `src/firebaseConfig.ts` has a config. `Root.tsx` then goes through sign-in, the `?join=<token>` invite screen (the token is stashed in sessionStorage across sign-in), the first-world screen, and finally the tabbed UI (Places / Notes & links / More).

**Base path**: the app is served from `/minecraft-notes/` (`vite.config.ts` `base`). Use `import.meta.env.BASE_URL` when building in-app URLs, as `inviteUrl()` does.

## Deployment and ops

- `.github/workflows/deploy.yml`: every push to `main` runs tests and the build, then deploys Pages.
- `.github/workflows/backup.yml`: nightly `scripts/backup.mjs` (firebase-admin, `FIREBASE_SERVICE_ACCOUNT` secret) exports every world as JSON + JPEG to the `backups` branch. The repo is public, so workflow logs and the backups branch are public; scripts log counts only, never emails.
- `.github/workflows/migrate-members.yml`: a one-off, idempotent `scripts/migrate-members.mjs` that gave pre-membership worlds a member list. It has already been run in production.
- The Firebase web config in `src/firebaseConfig.ts` is public by design.

The product backlog is the Notion database "Minecraft Notes App Backlog" (statuses: Backlog → In progress → Pending testing → Closed).
