# Vayora content assistant

Available through **Caption assistant**, **Content design**, **Brand knowledge**, **AI settings**, and the editor in the **Library**. Existing account, media, and schedule data continue to be used.

Generated captions, titles, and hashtags are written in Indonesian, following the Vayora brand voice. Example wording in this document is therefore kept in Indonesian where it illustrates brand copy.

## Brand knowledge used

The knowledge base version `2026-11-16.1` contains 57 curated notes, 14 sources, and 24 campaign references. Sources include the Vayora home/About/blog pages, two articles, the template proposal and brand design version, product/landing page design notes, campaign briefs and manifests, active SVG assets, and the owner's creative direction.

Notes can be searched and filtered in **Brand knowledge**, by status: available, add-on service, coming soon, brand identity, guideline, or needs confirmation. A JSON export is available after login. A readable summary is in [PENGETAHUAN-BRAND-VAYORA.md](PENGETAHUAN-BRAND-VAYORA.md) (written in Indonesian on purpose).

When a caption is requested, the app selects notes by title, category, goal, visual context, and keywords. The AI receives the brand identity, claim rules, sources, status, the prioritized relevant notes, and the full catalog of 57 notes, so it can match features visible in an image even when the title is not yet specific. The result shows **Knowledge given to the assistant** so the context can be inspected. This list shows the context that was provided; it is not a certification of every claim in the output, nor proof that the AI actually followed every note.

Local assistance uses topic mapping for laundry, housekeeping, invoices, breakfast, meeting rooms, promos/deposits, whole-villa/per-room rentals, booking websites, owner reports, and roadmap status. Local mode still does not read media pixels. The AI background generator also receives the visual context and brand limits; the logo and text are still composed from the original assets.

Source differences are stored explicitly: proposal prices are still simulated; team/founder placeholders are not treated as fact; payments/OTA/POS are not promoted as already active; the housekeeping video from old notes is not used; demo/pilot data is not a testimonial; the Key Fob Board variant does not override the approved campaign palette. Guest data, tokens, passwords, and confidential documents are not imported.

Raw sources are in `knowledge/sources`, separate from the model context. The curated JSON is in `knowledge/vayora-brand.json`. There is no automatic crawling or model retraining. Updating facts requires review, updating the curation in `scripts/build-brand-knowledge.mjs`, then `npm run knowledge:build`, tests, and a server restart. A changed website is not automatically treated as a new fact.

## What can be used right away

- Three hook/caption variations, relevant hashtags, and a CTA based on the content's category, title, and goal. The **Local mode** label means the image has not been read. The result is not pixel analysis or a reach prediction.
- Editorial check: brand context, CTA, caption length, hashtags, accessibility description, duplicate captions, and words that need verification. This rule-based check does not guarantee that every error is found.
- Three test time options in WIB. The default 08:30, 12:15, and 19:30 on weekdays are hypotheses to test, not Instagram Insights results. Slots are at least one hour ahead, at least two hours away from any recorded schedule/published result, and use the chosen date as the search start. The suggestions do not control paid ad delivery.
- Image post builder, 1080 × 1350: the original SVG logo, navy/cream/amber palette, title/explanation/CTA, and a choice of mascot crops or a companion media file. The JPG file can be downloaded or added as a new draft.
- UTM links for the bio or a landing page, plus a summary of topic distribution. Website analytics is still needed to count visits and demo requests.

## Enabling image reading and AI backgrounds

1. The owner opens **AI settings**.
2. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey) and paste it in **AI settings → Gemini API key**. Gemini writes all text: the automatic title and caption in **Create post**, and the caption options in the Caption assistant. The default model `gemini-flash-latest` can be changed in the same form. An OpenAI key ([OpenAI dashboard](https://platform.openai.com/api-keys)) is only required for creating AI image backgrounds; if there is no Gemini key, text falls back to OpenAI.
3. Enter the key directly in the app. Do not send keys or passwords through chat.
4. Set the daily request limit. Default: 20 captions and 3 backgrounds per day, reset by WIB date. The limit counts attempts, including failures; it is not a monetary cost cap. Also set a spending limit in the provider's dashboard.
5. In the editor, choose **AI · read image / poster**, add context if needed, then **Generate caption options**. Pick a result before applying it.
6. For images, open **Image post builder → Create an AI background**, fill in the brief and press **Generate one AI background**. Check the background, then **Create brand design** to compose the real logo and text on top of it. The result is not a post until **Create draft** is chosen.

The API key is stored encrypted on the server using the same local key as the Meta connection. The key is never sent back to the browser. The owner can delete the key through the app; a key set through `GEMINI_API_KEY` or `OPENAI_API_KEY` must be removed from the server configuration. Editors can request captions if a key is available; only the owner can change the AI configuration and brand direction, and create paid AI backgrounds. The local design builder can be used by editors.

Providers are called from the server to the official endpoints. Text: Gemini `generateContent` with structured JSON output (the key is sent in a header, not the URL), with OpenAI `gpt-5.4-mini` via the Responses API as a fallback; background model: `gpt-image-2.5-flare` via the Images API, one medium-quality image per request. There are no automatic AI requests on login, opening the editor, saving, or scheduling.

## Analysis and review limits

- AI mode sends the draft text and the selected images to OpenAI. A carousel sends all slides in order; the suggested alt text applies only to the first image, because there is currently one description field. Avoid private guest data in the material that is sent.
- A Reel is analyzed from the selected cover or poster, not its motion, the whole video, or its audio.
- Caption responses are requested with `store:false`. This does not promise that the provider has no other retention; follow the API project's settings and policies.
- Text inside images and old captions is treated as untrusted data, not as instructions to the assistant.
- Results still need human review. Pressing **Compare caption** shows a comparison; **Apply suggestion** is what replaces the draft text and clears the previous approval. There is no automatic saving or publishing.
- A generated background is an illustration, not a photo of a villa/customer or proof of Vayora's results. The logo and copy are created separately so the brand identity is not redrawn by AI.
- Provider failures are not retried automatically, so paid requests are not added without user action. No success is claimed when the key or balance is unavailable.

## Brand foundation and discovery strategy

Product facts were checked against the [Vayora website](https://vayora.id/) on 16 November 2026. The booking engine is treated as an add-on service. OTA integrations and all payment methods are not promoted as active features. Villa names, demo numbers, and transactions are not proof of customer results. The owner can adjust the audience and tone of voice; changes to product facts require updating the fact list in the app.

Social focus: topics villa operators search for, specific hooks, benefits that match the visual, natural keywords, and a single call to action. Alt text for accessibility. There is no guarantee of Instagram, TikTok, or Google ranking from captions/hashtags.

Next development priorities:

1. Recording results per campaign: reach, saves, shares, profile visits, website clicks, and demo requests. Keep organic separate from paid ads.
2. Official Insights sync once the required account and permissions are available; store the retrieval date and the limits of data coverage. Do not fill the dashboard with sample numbers.
3. Compare hooks and times against similar formats/topics, using the same measurement window. Use the results for the next recommendation, not a single post that happened to do well.
4. Connect campaigns to the landing page that matches the problem, set up analytics/conversion events, and improve website SEO separately: page content, titles/meta, internal links, indexing, and page speed.

Implementation references: [vision](https://developers.openai.com/api/docs/guides/images-vision), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Images API](https://developers.openai.com/api/reference/resources/images/methods/generate).

## Verification

`npm test` covers local mode without a network, real media sent in vision mode, encrypted key storage, daily limits, error sanitization, the ban on automatic retries, test times, claim checks, and real design output. Browser tests use a separate database and a simulated provider, with no API credit or changes to user accounts. Calling OpenAI with a real key needs user testing after configuration.

## Workflow and marketing updates

Captions can be compared, applied, undone before saving, and restored through saved versions. A readiness checklist is available in the detail/editor. Marketing now provides per-content/opener UTM campaigns, visit/CTA tracking with consent, manually or backend-confirmed demos, separate production/test reports, and manual/CSV performance observations. The priority list above remains the direction for platform sync and website SEO; setup and the actual limits of the feature are now described in [MARKETING.md](MARKETING.md).

## Feature navigation

The old Assistant page has been split: `#assistant` (captions), `#designer` (design), `#knowledge` (knowledge base with pages and source details), `#ai-settings` (connections and brand direction), and `#strategy` (strategy guide). Open them from the desktop sidebar or the Menu group on phones. UI labels and help are available in ID/EN; the content of source notes is not translated automatically.
