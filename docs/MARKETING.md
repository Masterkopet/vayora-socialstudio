# Vayora campaigns, measurement, and learning

## Getting started on this computer

Open http://localhost:3210/#marketing after logging in. On phones, Marketing is in the Menu so the bottom navigation stays on a single row.

1. Create a campaign with a name, content, channel, distribution, opener, and a destination path on vayora.id. The destination cannot point to another domain.
2. Use **Test tracking** to test visits, CTA buttons, and demo recording. The test page does not send customer messages or forms. A test demo requires a logged-in Studio session.
3. Turn on **Test data** in the report. Test results are not included in production numbers and do not change the production website connection status.
4. For a public campaign before the tracker is installed, copy the website link + UTM. A localhost link can only be reached from this computer and is not suitable for a public bio.

The campaign name and content/opener go into `utm_campaign` and `utm_content`; the channel and distribution go into `utm_source` and `utm_medium`. The `vsc` ID links website visits to a Studio campaign. On Instagram, use a link through the bio/available link feature; URL text in a caption is not the main click path.

## What the numbers mean

- **Link clicks**: `/go/<id>` redirect requests while measurement is on. Recognized bots/previews are ignored, but this filter is not perfect and repeat visits can add to the count.
- **Campaign visits**: distinct browser sessions per campaign in the report period. Sessions come from sessionStorage, not a person's identity. The total adds up the campaigns, so someone who visits several campaigns can be counted several times.
- **CTA clicks**: click events on marked buttons or WhatsApp links, including repeated clicks. Not a conversation or a demo that has been received.
- **Demo requests**: a manual confirmation after a real request is received, or a backend confirmation after the form has been validated and saved. Not a browser submit/click.

The report is not a funnel of one and the same cohort of visitors. Analytics consent, Do Not Track, browser blockers, attribution within a single tab for at most 24 hours, different devices, and lost parameters can make measurement incomplete. This is not a financial record or customer identity system.

Manual recording requires an internal ID and confirmation. Names, emails, and phone numbers do not need to be entered. The same reference ID in the same campaign and the same data mode is not counted twice. Use the same ID when resending the same request; do not record it manually again if it already came in through the backend. The manual source is available separately in the report data/API. The CSV download contains the campaign, content, channel, distribution, opener, metrics, and data mode.

## Connecting the production website

The local features can already be tested. Receiving events from vayora.id requires a Studio server with always-on public HTTPS, then installing the tracker on the website. Entering a URL in the panel does not publish the server automatically.

1. Install the Studio on a Node 24+ server with persistent `data/` storage, HTTPS, a process manager, and backups. Set `APP_ORIGIN` to the HTTPS domain and restart before logging in through that domain, so the session cookie uses the HTTPS settings.
2. The owner enters the **Public HTTPS address of Social Studio** in Marketing and turns on event reception.
3. On the website, load the tracker **after analytics consent** has been given. Copy the code from the panel because it already contains the domain and the workspace `data-site`. The site ID is public and is not a secret key.

```html
<!-- Run through the website's analytics consent mechanism. -->
<script>window.vayoraAnalyticsConsent = true;</script>
<script async src="https://studio.yourdomain.id/tracker.js"
  data-site="COPY_SITE_ID_FROM_PANEL"></script>
```

The code above is an installation example; do not set consent automatically for all visitors. The tracker does not run if consent is not true or Do Not Track is 1. If consent is withdrawn, set the variable to false. The tracker does not send form contents, names, emails, phone numbers, or URL queries other than the campaign ID; paths other than the allowed public pages are normalized to `/`. The server stores a session hash, not the raw IP/browser session. Browsers that do not allow sessionStorage are not measured.

Allow the Studio domain in the website's CSP `script-src` and `connect-src` if needed. The browser endpoint only accepts the origins vayora.id/www.vayora.id and the app origin. No Instagram password or API secret is needed in the website code.

Add `data-vayora-cta="demo_button"` to the demo button. Links to wa.me/api.whatsapp.com are recognized as WhatsApp clicks. A page that has loaded the tracker can read `window.VayoraAnalytics?.campaignId` to fill in the campaign reference on a form, without treating it as proof of conversion. After installation, test with a real campaign URL and make sure **Website event received** appears in the production report.

## Demos from the form backend

The owner creates a backend key from the panel. The key is shown once, stored encrypted in the Studio, and may only be installed on the website's server. Rotation revokes the old key.

After the form has actually been validated and saved, the website backend sends:

```http
POST https://studio.yourdomain.id/tracking/webhook
Content-Type: application/json
x-vayora-event-key: BACKEND_KEY_STORED_ON_SERVER
```

```json
{
  "eventId": "demo_request_REF_20261116_001",
  "campaignId": "CAMPAIGN_ID_FROM_VSC",
  "type": "demo_request",
  "path": "/"
}
```

`eventId` must be 12–80 characters of letters/digits/underscore/hyphen. Use the same ID when retrying the same request, so it is idempotent. Do not include customer contact details. Use `"test": true` when testing the backend integration so reports are not mixed. Browser conversions are rejected; the page must not hold the backend key. Validate that the campaign really relates to a prospective customer's request.

If the website already uses GA4, the `generate_lead` event should also be triggered after a valid request has actually succeeded. This project does not install the GA4 integration automatically. Reference: [recommended event generate_lead](https://developers.google.com/analytics/devguides/collection/ga4/reference/events#generate_lead).

## Performance input and CSV

Instagram/TikTok numbers are currently **entered manually or imported from CSV**, not pulled automatically from Insights. Enter the actual observation time, not the import time. The available windows are 24, 48, 72, or 168 hours after publishing; an observation is accepted within six hours after the window ends, so comparisons do not mix data of different ages.

- Instagram content must have the published status in the Studio and a stored publish time. The publish time field in the form is disabled for Instagram.
- TikTok can use library assets that were uploaded separately on the platform. The actual publish time from TikTok is required; this does not change the Instagram publishing status.
- Reach, saves, and shares must be whole numbers, zero or more. Empty is different from zero. Profile visits are optional.
- The form input time is WIB. CSV must use ISO with a time zone, for example `2026-11-16T19:30:00+07:00`.
- The same observation by content/channel/distribution/window is updated, not added as a new sample.

CSV header:

```csv
postId,channel,distribution,windowHours,publishedAt,observedAt,reach,saves,shares,profileVisits
```

The channel value is `instagram` or `tiktok`; distribution is `organic` or `paid`. `publishedAt` is required for TikTok and ignored for Instagram, which uses the Studio's publish time. Maximum 100 rows/150 KB. The import is cancelled entirely if any row is wrong; the message shows which rows need fixing. The sources `manual_from_platform`/`csv_import` are visible on stored observations.

## When the app starts learning

Comparison waits for at least three organic content items with the same channel, format, and window; ranking uses `(saves + shares) / reach`. Paid data is stored separately and is not mixed with organic. These are observations based on user input, not a controlled experiment; topic and audience size can still affect the results. There are no retention/watch time metrics or automatic Insights sync yet.

Time suggestions from real data require at least two time groups, each with at least three organic Instagram content items of the same format, a 48-hour window, and a total reach of 100. If that is not enough, the app gives test-time hypotheses. A suggestion still does not guarantee results or prove cause and effect. Time learning focuses on Instagram; it does not predict TikTok hours from Instagram data.

## States to tell apart

Local Studio login can already be used. Instagram publishing still requires a professional account, a Meta app, permissions, public HTTPS, and activation by the owner. Vision captions/generative backgrounds require an OpenAI connection and credit; local mode/brand design remains available. No Meta account, Insights number, lead, or production conversion is created as sample data in the user's workspace.
