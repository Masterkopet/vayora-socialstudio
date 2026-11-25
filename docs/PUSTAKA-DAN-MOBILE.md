# Library, manual publishing, and language

## Content library

Every card has **Post now** and **Detail** buttons. The schedule appears directly on the card as a date, time, and WIB; published cards show their publication time. Content without a schedule is labeled not scheduled. The publish button is locked for content that is being processed, has been published, or has an uncertain result.

Pressing a card opens a summary popup over the list: proportional media, title, expandable caption, status, and schedule. Choose **Edit content** to open the form in the same popup. Search by title/ID/caption/category, quick status chips, sorting, filters, and the list position are preserved. The editor, media/video preview, carousel order, approval, caption assistant, and schedule settings are available inside the popup. The Save draft and Save schedule buttons are in a footer that stays visible while the content scrolls. Saving from the popup closes the detail and returns the user to the page they came from. Unsaved changes require confirmation to leave, or a way back to the editor, before closing; Escape and the close button do not discard a draft without notice. Keyboard focus returns to the trigger after the popup closes.

## Post now

1. Press **Post now** on the card.
2. Check the media, caption, target account, and the schedule that will be replaced.
3. Tick that the material has been checked.
4. Press **Publish now** to send a single manual publish request.

Publishing uses the saved version of the content. Instagram must be connected, public HTTPS must be available, and live publishing must be turned on by the owner. If it is not ready, the popup explains the steps and the publish button stays disabled. There is no simulation of a connected account in the user's workspace.

Manual publishing may run while the queue is paused, but it does not resume other queue items. The content's previous schedule is replaced by the current time. The request uses a revision check to reject data that has changed; the content is moved to processing before the network call happens. The browser monitors the result status without asking for a second publish. An uncertain result is locked and must be reconciled; there is no automatic retry. Activity is recorded in History. Simulated success results exist only in separate tests, never as real publishing data.

## Mobile

At widths up to 800 px, the sidebar is replaced by a single-row bottom navigation with five destinations: **Home, Library, Create, Calendar, Menu**. The Menu shows a five-column icon launcher. Content design, Brand knowledge, Content strategy, AI settings, and other pages can be opened directly from it. Import and sign out are part of the grid; the language switch is on the bottom row. The main navigation stays on a single row at widths of 320–800 px, with a bottom safe area and content spacing so the last content is not covered.

Cards become one column on small phones and two columns on wider devices. Main buttons have a touch area of about 44 px. Media uses proportional sizes, not stretching. The detail popup is a floating panel with margins all around, 24 px corners, a maximum height of 76% of the viewport on mobile (88% on desktop), 24 px side margins, and a 10 px backdrop blur; the panel has a header/close button that stays visible, and puts the preview before the form. The assistant editor opens on demand so the form is not too long. Opening/closing uses an opacity transition and short motion; the reduced motion preference disables the transitions. The menu appears from the bottom and stops 10 px above the main navigation bar, with 15 icons in five columns/three rows. The height follows the content and leaves no long empty area; on short screens the content can scroll with a height limit of 80% of the viewport. The native dialog handles focus and prevents interaction with the page behind it.

## Language

The **ID / EN** switch is available in the header, the login page, the detail popup, and the mobile menu. The choice is stored in the browser being used. The interface, navigation, labels, main help text, statuses, and date format follow the chosen language. English is the default; Indonesian is available as a translation. Switching language does not delete the field being edited.

The interface language does not translate or overwrite captions, content titles, text in images/video, or the source documents of the knowledge base. Generated content (captions, titles, articles) stays in Indonesian. Category/status values sent to the server stay consistent even though their labels are displayed in English. The publishing time zone stays WIB in both languages.

## Verification

Tests cover manual publishing with approval and valid configuration, rejection of locked content/stale revisions, prevention of duplicate uploads, replacing a single schedule without resuming other queue items, the schedule on cards, the popup without a page change, drafts when switching language, Escape/keyboard focus, language persistence, and the single-row menu and overflow at 320, 375, 390, 736, and 800 px. All Meta/OpenAI requests in tests use a simulated transport and a separate database.

## Caption history and posting readiness

Compare the assistant's result with the current caption before **Apply suggestion**. **Undo AI change** restores the caption from before it was applied, for the duration of the edit session; approval must be given again. After saving, changes to the material are recorded in the version history. Choose Compare and then Restore this version to bring back that version's title, caption, alt, media/cover, category, and destination as a draft; the schedule and approval are cancelled. History starts from when the feature was enabled and does not reconstruct older changes that were not recorded. The popup shows the 50 most recent versions. Content that is published/processing/has an uncertain result cannot be restored directly.

Posting readiness separates media, caption, optional alt, approval, Instagram connection, public HTTPS, and active publishing. The checklist validates completeness and stored files; human review is still needed for the content of offers, media rights, and visual results. Connection settings that are not ready do not block saving drafts/planning schedules.

## Separate feature menus

- **Caption assistant**: choose content, then open the assistant in the editor. Captions/hashtags are checked and applied explicitly.
- **Content design**: the image post builder, color/visual options, preview, and AI background when available. Temporary design input is preserved when switching menus within the same page session; a refresh does not keep input that has not become a draft.
- **Brand knowledge**: 57 AI reference notes, sources, topic/status filters, and claim guidelines. Each note can be opened to read its full content and source. Six notes per page with a results range, Previous/Next, and Reset filter. Filters and the page are preserved when switching menus within the same page session.
- **AI settings**: connection, usage limits, audience, and tone of voice. Access to the configuration still follows the team role.
- **Content strategy**: guidance on social search, messaging, and campaign experiments. Running campaigns and their results stay in Marketing.

The desktop sidebar groups all pages and can scroll when the screen height is limited. The active menu item is marked. Each page has its own hash address, can be reloaded directly, and supports the browser back/forward buttons. Unsaved caption changes still require confirmation when leaving the editor. The phone bottom navigation stays at five buttons on a single row.
