# minecraft-notes

**Rebadam Coords**: a phone-friendly web app where two players save Minecraft (Bedrock) coordinates, statuses, notes, links and photos, all shared live.

- **Places**: X / Y / Z with a ± button per axis (the iPhone number pad has no minus key), dimension, type, status, notes, photos, and places nested inside places (e.g. a portal inside a cave). Tap a row to expand it; tap the status chip to change it. Shows the matching Nether/Overworld coordinates, can copy coordinates for `/tp`, and can sort by distance from where you are.
- **Notes & links**: to-dos, links (YouTube thumbnails included), notes, and photo sets (house inspiration).
- **More**: switch worlds/realms (the last one you used is remembered), edit statuses and place types, Trash with restore, download/restore a backup, and import from the old Apple Note.

## Why your data won't get lost

| Risk | What protects against it |
|---|---|
| Closing the app or the phone clearing website data | Data lives in Firebase Firestore (Google's database), not just on the phone. |
| No signal while playing | Firestore keeps an offline copy on the phone. Saves made offline upload automatically when you're back online. The header shows **Offline · saved on phone** / **✓ Synced**. |
| Inactivity | Firestore's free plan never pauses or deletes inactive projects (unlike Supabase's free tier). |
| Accidental delete | Deletes go to **Trash** (More tab) and there's an **Undo** button right after. |
| Something worse | A GitHub Action exports everything every night to the `backups` branch (JSON + JPEG files with full history). You can also download a backup file any time. |

It all runs on free tiers: Firestore's Spark plan (1 GB storage, 50k reads / 20k writes per day) and GitHub Pages. Photos are compressed and stored in Firestore itself, so no paid Cloud Storage plan is needed.

## One-time setup (about 10 minutes)

### 1. Create the Firebase project
1. Go to <https://console.firebase.google.com>, sign in with your Google account, and click **Create a project**. Name it e.g. `rebadam-coords`. You can turn Google Analytics off.
2. **Sign-in**: in the left menu go to **Build → Authentication → Get started**, then **Sign-in method → Google → Enable**. Pick your email as the support email and click **Save**.
   Then open **Authentication → Settings → Authorized domains → Add domain** and add `adambabin.github.io`.
3. **Database**: go to **Build → Firestore Database → Create database**. Pick a location near you (e.g. `nam5 (United States)`), choose **Start in production mode**, and click **Create**.
4. **Who's allowed in**: open the **Rules** tab, paste in the contents of [`firestore.rules`](firestore.rules) with the placeholder addresses replaced by your real Gmail addresses, and click **Publish**. Keep the real addresses only in the console, not in this public repo.
5. **Web app config**: click the gear icon → **Project settings → General**. Under "Your apps", click the **`</>`** (Web) icon, give it a nickname, leave Hosting unchecked, and click **Register app**. Copy the `firebaseConfig = { ... }` values into [`src/firebaseConfig.ts`](src/firebaseConfig.ts), or send them to Claude to add. These values are safe to commit; the rules above are what keep everyone else out.

### 2. Turn on GitHub Pages
In the GitHub repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. Every push to `main` then deploys to <https://adambabin.github.io/minecraft-notes/>.
(GitHub Pages from a *private* repo needs a paid GitHub plan. On a free plan the repo has to be public, which is fine for the code. See the note on backups below.)

### 3. Nightly backups
1. In Firebase: gear icon → **Project settings → Service accounts → Generate new private key**. This downloads a JSON file.
2. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Name it `FIREBASE_SERVICE_ACCOUNT` and paste in the *entire* JSON file as the value. Then delete the downloaded file.
3. Go to **Actions → Nightly backup → Run workflow** to test it. A `backups` branch should appear.

> If the repo is public, the `backups` branch is public too: coordinates, notes, photos and your first names. If you'd rather keep that private, either make the repo private (needs GitHub Pro for Pages), or skip step 3 and use **More → Download backup** now and then.

### 4. On each phone
1. Open <https://adambabin.github.io/minecraft-notes/> in **Safari**.
2. Tap **Share → Add to Home Screen**. The app then opens full screen like a normal app.
3. Open it from the Home Screen and **Sign in with Google**. You stay signed in until you tap Sign out.
4. First time only: **More → Import from a note** is pre-filled with the old Apple Note. Check the preview and tap **Import**.

## Adding someone later
In the Firebase console, go to **Firestore → Rules**, add their Gmail address (lowercase) to the list, and tap **Publish**.

## Development

```sh
npm install
npm test          # unit tests (coordinate parsing, note import)
npm run dev       # needs src/firebaseConfig.ts filled in, or:

# fully local, with the Firebase emulators (needs Java):
npx firebase-tools emulators:start --only auth,firestore --project demo-minecraft-notes
VITE_USE_EMULATOR=true npm run dev
```

Stack: Vite, React, TypeScript, Firebase Auth (Google) and Firestore with an offline cache, plus an installable PWA.
Data layout: `worlds/{worldId}` holds the world's statuses and place types, with `places`, `items` and `images` subcollections under it.
