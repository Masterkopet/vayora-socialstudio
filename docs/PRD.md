# Vayora Social Studio

Version 1.0 — 16 November 2026

## Purpose

An internal Vayora web app for preparing, reviewing, scheduling, and publishing Instagram content from a single workspace. The first round of testing runs on the user's computer. The Meta app is not yet available, so team login must be testable on its own and the Instagram connection must honestly explain the configuration it needs.

## Users and access

- The owner creates the first account through the local initial setup page.
- Login uses email and password, server-side sessions, logout, password change, and team member invitations through single-use links.
- The owner can manage the Instagram connection, publishing, and team members. Editors manage content and schedules.
- There is no demo account with a default password. The Instagram form never asks for the Instagram password.

## Pages

1. Initial setup and team login
2. Weekly, monthly, and agenda calendar in WIB
3. Content library with format, goal, and status filters
4. Pre-publish check
5. Caption, alt text, Reel cover, and carousel order editor
6. Media and caption import through content IDs
7. Queue, global pause, cancellation, and rescheduling
8. History of changes and publishing results
9. Instagram settings and Meta instructions
10. Profile, password change, and team invitations

## Content flow

Draft → Needs review → Ready to publish → Scheduled → Processing → Published.

Failed results and results that cannot be confirmed are handled separately. A schedule that is overdue by more than five minutes is not published all at once when the app is turned back on. Every publication requires approval of the media and caption. Changing the material resets the approval and the active schedule; a schedule that is being processed is locked. Content that has been published can only be copied as a new draft.

## Initial library

Import the 24 original concepts from the previous production: 10 videos, 8 image posts, and 6 carousels with a total of 30 slides. Use the original-resolution media and the manifest captions. All initial content has the draft status with no active publish date. Images are prepared as JPEG for API publishing; the source files are kept in their original folder.

## Instagram connection

- Instagram API with Instagram Login path; Instagram Business or Creator account.
- OAuth state is single-use, expiring, and bound to the owner's session.
- The Authorization Code is exchanged on the server; the access token is encrypted and never sent to the browser.
- The App ID and App Secret are set through the server environment. The UI shows readiness without showing the secret.
- The callback and media need an internet-reachable HTTPS address when the integration is enabled.
- Provide a connection check, reconnect, and disconnect.
- An app that is not configured does not mean login succeeded. Show the setup steps that are needed.

## Publishing and resilience

- Live publishing is off by default. The owner turns it on once the connection and public URL are ready.
- The scheduler runs on the server while the app process is active.
- Save the container ID before publishing, mark the publish request before the network call, and save the resulting media ID.
- On a timeout or crash after publish was sent, check the container status; never blindly send a second publish.
- An uncertain result requires a check. Content recorded as published cannot be published again.
- The global pause preserves schedules. No content is published while the connection or permissions are invalid.
- Automated integration tests use a fake Meta transport isolated in the tests, not a fake connection in the user's app.

## Storage and security

SQLite for accounts, sessions, content, media, connections, OAuth state, invitations, and audit. Media is stored in the local data directory; data survives a refresh or restart. Passwords use scrypt with a unique salt. Session cookies are HttpOnly, SameSite, and expiring, with a CSRF token, login attempt limiting, Origin checks, and per-endpoint authorization. Media requires a session; the media URLs for Meta are signed with a limited validity. Reject invalid file types and content IDs. Never store passwords or tokens in logs.

## Acceptance criteria

- A user can create their own account, log out, log in again, change the password, and keep their data after a restart.
- Access to the dashboard/API/media without a session is rejected.
- All 24 concepts appear with their original media; videos can be played and carousels are in the correct order.
- Caption saves, reorder, approval, cross-month scheduling, pause, cancellation, import, and audit persist in the database.
- A single-use invitation can be accepted and does not give owner rights to an editor.
- With no Meta app: the connect button gives guidance and does not show a fake connected status.
- An invalid OAuth state is rejected. Tokens do not appear in browser responses.
- Tests prove that duplicate publishing is prevented on retry and on uncertain results.
- The layout is usable on desktop and phone.

## First-round testing limits

There is no real Instagram publishing until the user has prepared the Meta app, a professional account, and public HTTPS. There is no automatic email without an email provider; invitations are links that can be copied. Local publishing stops when the computer or server process stops. A standalone deployment guide is included for 24-hour use.

## Implementation references

### Content assistant additions — 16 November 2026

Implementation: [ASISTEN-KONTEN.md](ASISTEN-KONTEN.md).

- Captions: three options of hook, caption, hashtags, keywords, and CTA; local mode is labeled as context assistance, while vision mode reads real media through the API after owner configuration. For a Reel only the cover/poster; for a carousel all slides, with alt text for the first image.
- Rule-based editorial checks for claims, coming-soon features, duplicates, CTA, caption length, and accessibility descriptions. No SEO score or reach prediction is shown.
- Posting time: three WIB test slots within 14 days, in the future and not close to recorded scheduled/published content. No Insights personalization, and no control of paid ad delivery.
- Image post: local 1080 × 1350 composition using the real logo and palette, editable copy, preview, download, and explicit draft creation. AI background optional; the logo and copy are not redrawn by AI.
- Brand direction: the owner can change the target audience and tone; product facts and claim limits follow the reviewed Vayora sources.
- Brand knowledge: 57 curated notes from 14 sources and 24 creative references; search/status filter, JSON export, uncertainty status, and six recorded source differences. The AI receives the full catalog and the prioritized relevant notes; caption results show the context that was given. Raw sources are not turned into model instructions. Details: [PENGETAHUAN-BRAND-VAYORA.md](PENGETAHUAN-BRAND-VAYORA.md). Updating facts requires review, not automatic crawling.
- AI connection: encrypted API key, daily request limit, one AI process at a time, sanitized provider errors, no automatic retry. Only the owner changes the key/limit and creates paid AI backgrounds. Editors can use captions and local design.
- Results do not change the content until applied; applying cancels the old approval. No automatic publishing from the generator.
- Marketing evaluation foundation: topic distribution and a UTM link builder. Account performance measurement, website analytics, conversion events, data-based recommendations, and per-campaign analysis are next development; there are no fictional performance numbers.

### Library and bilingual mobile — 16 November 2026

- Library detail uses a native dialog over the list, without a route change. The schedule appears on the card; filters/list position and returning focus are preserved. A draft is not discarded without confirmation.
- Post now requires a check, explicit approval, an Instagram connection, HTTPS, and live publishing. The endpoint checks the revision and status, claims the record before the network process, returns 202, and the UI monitors the result. Published/processing/uncertain content cannot be posted again. Manual posting does not resume other paused queue items.
- Single-row bottom navigation at ≤800 px: Home, Library, Create, Calendar, Menu. The secondary menu contains review, history, settings, account, import, and language. On phones the dialog floats, with 24 px corners, a maximum height of 76dvh on mobile with 24 px side margins (88dvh on desktop), a 10 px backdrop blur, and a short transition with reduced motion support; safe area, touch targets, proportional media, and overflow are tested.
- English/Indonesian UI (English is the default) with the choice stored in the browser. Switching language does not overwrite captions/titles/media/source documents and does not break category/status values on the server.
- Details and verification: [PUSTAKA-DAN-MOBILE.md](PUSTAKA-DAN-MOBILE.md).

### Instagram references

- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login
- https://developers.facebook.com/documentation/instagram-platform/content-publishing
- https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media
