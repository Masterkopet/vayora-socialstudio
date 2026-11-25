# Next.js migration and project location

Active project: `E:\Work\VAYORA\Vayora-SocialStudio`.

## Version 2 stack

- Next.js 16.4.6 App Router, React/React DOM 19.3.1, Node.js 24+.
- Native Next.js Route Handlers for the API, sessions, OAuth, tracking, and private media.
- SQLite, scrypt, HttpOnly session cookies, CSRF, origin/host checks, credential encryption, and publishing approval are retained.
- Busboy handles multipart streaming into temporary files. Private media supports HEAD and HTTP byte ranges so video can be played/seeked without reading the whole file into memory.
- Sharp, FFmpeg/FFprobe, Lucide, and Docker Compose/Caddy are still used.
- Express and Multer have been removed from the dependencies.

## Structure

`src/app/layout.jsx` provides the document, metadata, CSS, CSP nonce, and icon assets. The `(studio)` layout keeps the `StudioClient` React component alive across page transitions. Pages have addresses such as `/library`, `/calendar`, `/designer`, `/knowledge`, `/marketing`, and `/ai-settings`.

`src/client/` contains the mature editor controller, assistant, marketing, navigation, and translations. React manages the persistent workspace host; the controllers manage its interactive subtree, native dialogs, and media players. This keeps the editor's behavior without rewriting every interaction during the migration. Controllers are mounted/unmounted through the React lifecycle, including cleanup of event listeners, observers, initial requests, and timers. Client code is bundled by Next.js and is no longer loaded as a separate static HTML app.

`src/server.mjs` holds the business rules. `src/http.mjs` adapts the service to the Web Request/Response used by the Route Handlers; the Node listener is only used in separate unit tests. There is no second Express server or internal proxy to the old process. `src/runtime.mjs` keeps a single runtime/scheduler per process, including when Route Handler modules share state.

`src/styles/` holds the brand styles and the five-column menu popup that appears above the bottom navigation. `public/` holds the logo, icon vendor files, and the website tracker. Native Route Handlers serve all private data. Old hash links such as `/#designer` are still accepted and redirected to the Next.js page address once the workspace opens.

## Data and the old folder

The database, encryption key, media, accounts, captions, and metadata are moved through a consistent snapshot. Login sessions are kept when moving computers/local folders on the same localhost address. Snapshots for deployment to a new domain still remove sessions by default. The old app is stopped before the port is switched, so only one scheduler is active.

The previous folder is kept as a pre-migration copy. Use the new folder for changes and for running the app. Documents/video projects that really live in `E:\Work\VIDEO_EDITING` remain the source of brand reference; that historical address is not turned into a fake location inside the app folder.

## Running

```powershell
npm ci
npm run build
npm run start:local
```

The `Mulai-Vayora.cmd` launcher uses the prepared standalone build and opens http://localhost:3210. `Hentikan-Vayora.cmd` only stops processes that match the new project's runner. To edit with hot reload, stop the launcher and use `npm run dev`.

Docker production uses `node server.js` from the standalone output, a persistent data folder, an HTTPS origin, and the internal account that has been migrated. `start:local` explicitly allows localhost HTTP for local testing only; the production configuration still requires HTTPS. The data folder, `.env` files, test artifacts, and private packages are excluded from standalone tracing and the Docker image.

## Verification

- Unit tests for business rules, auth, revisions, caption versions, publishing lock, and the migration snapshot.
- Browser tests run on the real Next.js server with a separate simulated database/provider: login, team, media/video/cover, captions, design, knowledge, schedule, marketing, ID/EN, and responsiveness.
- Menu tests measure the five-column grid, its position above the navigation, auto height, keyboard focus, and reduced motion.
- The container smoke test covers Linux, logging in with an existing account, the Secure cookie, fonts/design, FFmpeg upload/poster, and data that survives a restart.

References: [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route), [CSP and nonce](https://nextjs.org/docs/app/guides/content-security-policy), [self-hosting Next.js](https://nextjs.org/docs/app/guides/self-hosting).
