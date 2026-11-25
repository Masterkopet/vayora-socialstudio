# Setting up the Instagram connection

Team login for Social Studio works without a Meta Developer account. The steps below are only needed to connect to, and publish on, a real Instagram account.

## Account preparation

Convert the Vayora account to a professional account of type Business or Creator. For this version, the integration uses the Instagram API with Instagram Login. A Business Portfolio is not required by that login flow and a Facebook Page does not have to be linked. The Meta app's settings and eligibility requirements still need to be met.

## Quick method: paste a token (recommended)

No App ID, App Secret, or redirect URI is needed. The Studio only needs an access token from the Meta dashboard.

1. Log in at https://developers.facebook.com/ (register as a developer if asked; Meta asks for a phone number added through Accounts Center). Open **My Apps → Create App**: use case **Other**, type **Business**, fill in the name and email, then **connect Vayora's Business portfolio** (required for Instagram API setup) and add the **Instagram** product. The page `https://developers.facebook.com/apps/` only shows "Page Not Found"/the home page if the account is not registered as a developer.
2. Open **Instagram → API setup**. New apps use **API setup with Unified login** (the *Instagram login* path is no longer available for new apps); older apps still use **API setup with Instagram login**. Both are supported.
3. Give the Vayora account the **Instagram Tester** role in the **Roles** tab (App roles → Roles → Add People), then accept the invitation in Instagram: Settings → Apps and websites → Tester invitations.
4. In the **Generate access tokens** section press **Add account**, log in with the Vayora Instagram account (Business/Creator and public), then press **Generate token** and copy the token. The prefix `EAA…` means a Unified login (Facebook) token; `IGAA…` means an Instagram login token.
5. In Social Studio open **Settings → Connections & publishing**, paste the token into **Connect with token**, then press the button. The Studio checks the token with Meta and shows the connected username.

Notes:

- The Unified login token (`EAA…`) is used through `graph.facebook.com`. The Studio looks for the Instagram account that the token can access: from the assets the token allows (`debug_token`), or through the linked Facebook Page/Business portfolio. Meta only exposes that asset list to an *app access token*, so if the Instagram account is not linked to a Page, fill in the **App ID** and **App Secret** under "Advanced method" (the App ID and App secret are in **App settings → Basic** in the Meta dashboard; these are the app's ID/secret, not the "Instagram app secret"), save, then paste the token again. The Studio uses them only to read the token's assets and does not store them with the connection. Without the App Secret, Meta does not give an expiry date, so the token is trusted until Meta rejects it; at that point the Studio asks you to reconnect. If the token can access more than one account, the Studio refuses and names the accounts: create a token specifically for the Vayora account. If no account is found, the error message includes the reason from Meta.
- The Instagram login token (`IGAA…`) from the dashboard is valid for 60 days. The Studio stores it encrypted and renews it automatically without the App Secret: the first time after 24 hours (to learn the exact expiry), then within the last 7 days before it expires. Renewal still runs even while the queue is paused.
- A wrong or expired token is rejected with the message from Meta and does not disconnect a connection that is already working.
- Replacing the token with a different Instagram account turns off live publishing and pauses the queue until the owner reviews it again. Renewing the token for the same account does not change the publishing status.
- Scopes used: `instagram_business_basic` and `instagram_business_content_publish`. Standard Access is enough for accounts you own/manage that have been added to the app; Advanced Access and App Review are needed to serve other parties' accounts.
- API (owner only, using the session and the `x-csrf-token` header): `POST /api/instagram/token` with body `{"token":"IGAA..."}` → connection status (`connected`, `username`, `method: "token"`, `expiresAt`, `expiresKnown`).

## Advanced method: Meta login with App ID and App Secret

Use this method if you want to connect through the Instagram login page (OAuth). In the Studio, open the **Advanced method** section on the Connections & publishing page.

1. Create the app as in step 1 above.
2. Open **Instagram → API setup with Instagram login → 3. Set up Instagram business login → Business login settings**. Copy the **Instagram App ID** and **Instagram app secret** (different from the Facebook App ID in App settings).
3. In **Business login settings**, add `https://your-domain/auth/instagram/callback` to **OAuth redirect URIs** exactly as written, without a trailing slash, then save. If the **Deauthorize callback URL** and **Data deletion request URL** are required, use the Studio's HTTPS address; the Studio does not yet process those requests automatically.
4. In section **1. Generate access tokens**, press **Add account** for the account to be published.
5. Enter the App ID and App Secret in the Advanced method form, save, then press **Connect with Meta login** and approve the permissions on the official Instagram/Meta page. Meta sends the browser back to the callback; the server exchanges the code for an access token and stores it encrypted.

Server configuration alternative: set `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `PUBLIC_BASE_URL`, and `INSTAGRAM_API_VERSION` in the environment; environment values take priority over the UI configuration. Also set `APP_ORIGIN` to the HTTPS origin when running through a public domain.

The token is not stored in the browser. The Instagram password never reaches the Social Studio server. OAuth requests are bound to the owner's session, expire after 10 minutes, and can only be used once.

Meta dashboard menu names can change and may appear in your Facebook account's language. Match them against the official documentation: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started and https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login.

## Before live publishing

Meta must be able to fetch the media over public HTTPS. The app generates signed media URLs that are valid for three hours. Try one image, one Reel, and one carousel to verify permissions, format, and how the result looks. Check carousel ratio/cropping in particular, because Instagram's output may follow the platform's cropping rules.

The owner turns on Live publishing in **Connections & publishing** once the connection is ready. The queue can stay paused until test content is scheduled. Resuming the queue and placing schedules are live publishing actions; do not use test material that has not been approved.

## When something goes wrong

- Permission expired/revoked: reconnect the account.
- Media failed to process before publish was sent: check the media and set a new schedule.
- Publish response was interrupted: the result gets the status Check outcome. Use Check outcome against Meta. The app does not send a second publish automatically.
- Container confirmed PUBLISHED: mark as published and block retries; the link may not be available if the original response was interrupted.
- Schedule overdue by more than five minutes: set a new schedule; there is no mass catch-up.

App Review and Advanced Access are needed when the app serves external accounts under Meta's terms; do not assume tester mode is enough for all customers.

## Official references

- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login
- https://developers.facebook.com/documentation/instagram-platform/overview
- https://developers.facebook.com/documentation/instagram-platform/content-publishing
- https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media
