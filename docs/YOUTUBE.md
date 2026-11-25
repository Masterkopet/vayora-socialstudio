# Setting up YouTube Shorts

Social Studio can upload scheduled **YouTube Shorts** to a single channel through the YouTube Data API v3. A Short is its own content type (format `Short`), separate from an Instagram Reel.

## Google's limits

- **API audit:** videos uploaded through the API from a Google Cloud project that has not passed the *YouTube API Services audit* are locked as **private** by YouTube, whatever privacy is chosen. The Studio still uploads and records "locked private" in History. Apply for the audit through the *YouTube API Services – Audit and Quota Extension* form so Shorts can be public.
- **Consent screen:** while the OAuth app status is still *Testing*, Google refresh tokens expire after 7 days. Change the status to **In production** (an unverified app can still be used by its owner, with a Google warning screen) so the connection does not drop every week.
- **Quota:** every upload uses the project's daily quota (default 10,000 units). When the quota runs out, the Studio marks the content as failed with a quota message; reschedule for tomorrow.

## Set up Google Cloud

1. Open https://console.cloud.google.com/ with the Google account that owns the channel and create a project (for example "Vayora Social Studio").
2. **APIs & Services → Library**: enable **YouTube Data API v3**.
3. **Google Auth Platform / OAuth consent screen**: type *External*, fill in the app name and support email, add the scopes `youtube.upload` and `youtube.readonly`, then publish to **In production** (see the limits above).
4. **Credentials → Create credentials → OAuth client ID**: type **Web application**. Add the *Authorized redirect URI* exactly: `https://studio.vayora.id/auth/youtube/callback` (the address is also shown on the Connections & publishing page).
5. Copy the **Client ID** and **Client Secret**.

## Connect the channel

1. In the Studio open **Settings → Connections & publishing → YouTube Shorts → Google Cloud settings**.
2. Enter the Client ID and Client Secret, choose the video privacy (public, unlisted, or private), then **Save YouTube settings**. Saving new credentials turns off live publishing and pauses the queue.
3. Press **Connect YouTube channel**, choose the Google account that owns the channel, and approve the permissions. The Studio returns to the connections page and shows the channel name.

The refresh token is stored encrypted; the access token is renewed automatically. Server configuration alternative: `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` (these override the values from the UI).

## Creating and scheduling Shorts

- **Import:** choose the video, then in the matching step change **Video destination** to *YouTube Short*. File names starting with `S01-…` automatically become a Short with ID `S01`.
- **Short rules:** one vertical or square MP4 video, up to 3 minutes. The content's **Title** becomes the YouTube title (up to 100 characters; `<` and `>` are removed). The **Caption** becomes the description. Generated titles and captions are written in Indonesian.
- The Short readiness check uses YouTube's rules (video, title, description, approval, YouTube connection, publishing on).
- Scheduling and **Post now** work like Instagram content; the scheduler sends the Short to YouTube.
- If the connection drops after the video is sent, the status becomes **needs checking**; the check-outcome button looks for the video in the channel's 25 most recent uploads and never uploads again.
- After publishing, the **View on YouTube** link opens `https://www.youtube.com/shorts/<id>`.

## API

All endpoints use the session and the `x-csrf-token` header; configuration and connection are owner only.

- `GET /api/youtube/status` — connection status (without secrets).
- `POST /api/youtube/config` — `{"clientId","clientSecret","privacy":"public|unlisted|private"}`.
- `POST /api/youtube/connect` — returns `{url}` of the Google consent page.
- `GET /auth/youtube/callback` — return destination from Google.
- `POST /api/youtube/check`, `POST /api/youtube/disconnect`.
- Short content is created via `POST /api/posts` with `"format":"Short"`.
