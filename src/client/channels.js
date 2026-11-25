// Settings → Facebook and Settings → TikTok: connection status, setup steps and the forms admins use.
const VISIBILITY = { PUBLIC_TO_EVERYONE: 'Everyone', MUTUAL_FOLLOW_FRIENDS: 'Friends (followers you follow back)', FOLLOWER_OF_CREATOR: 'Followers', SELF_ONLY: 'Only me' };

export function createChannels(ctx) {
  const { api, esc, button, toast, ask, mutate, run } = ctx;
  const admin = () => ['owner', 'admin'].includes(ctx.getUser().role);
  const head = (title, sub, ok, error) => `<div class="vs-setting"><div><h2>${title}</h2><p class="vs-sub">${sub}</p></div><span class="vs-status ${ok ? 'scheduled' : 'review'}">${ok ? 'Connected' : error ? 'Reconnect required' : 'Not connected'}</span></div>`;

  function facebookPanel() {
    const f = ctx.getWorkspace().facebook || {};
    const body = admin() ? `${f.connected ? `<div class="vs-actions">${button('Check Page', 'fb-check', '', 'refresh-cw')}${button('Disconnect', 'fb-disconnect', 'vs-danger', 'unplug')}</div>` : ''}
<details class="vs-advanced-connect" ${f.connected ? '' : 'open'}><summary>${f.connected ? 'Connect another Page or a new token' : 'Connect the Facebook Page'}</summary><div class="vs-stack">
<ol class="vs-help-list"><li>Facebook only allows posting to a Page, not to a personal profile.</li><li>In Meta for Developers, open the same app as Instagram and add the permissions <b>pages_manage_posts</b>, <b>pages_read_engagement</b> and <b>pages_show_list</b>.</li><li>In Graph API Explorer choose the app and your account, add those permissions and press Generate Access Token. A user token works: Studio keeps the Page's own token. For a token that does not expire, use a system user in Business settings with the Page assigned.</li><li>Paste the token below. If it can manage several Pages, also enter the Page ID of the Vayora Page.</li></ol>
<form class="vs-stack" id="fb-token-form"><label class="vs-label">Access token<input class="vs-input" id="fb-token" type="password" autocomplete="new-password" placeholder="EAA…" maxlength="2048"><small>Stored encrypted on the server and never shown again.</small></label><label class="vs-label">Page ID <small>optional</small><input class="vs-input" id="fb-page-id" inputmode="numeric" maxlength="25" placeholder="1234567890"></label><div><button class="vs-button vs-primary" type="submit">Connect Page</button></div></form>
<p class="vs-mini">Photos are fetched by Facebook from Studio's public HTTPS address; videos are posted as Reels (3–90 seconds).</p></div></details>` : '<p class="vs-sub">The workspace owner manages the Facebook connection.</p>';
    return `<section class="vs-panel vs-pad vs-stack">${head('Facebook Page', f.pageName ? esc(f.pageName) : 'No Page connected yet.', f.connected, f.error)}${f.error ? `<p class="vs-inline-error">${esc(f.error)}</p>` : ''}${body}</section>`;
  }

  function tiktokPanel() {
    const t = ctx.getWorkspace().tiktok || {};
    const options = (t.privacyOptions?.length ? t.privacyOptions : Object.keys(VISIBILITY));
    const posting = `<form class="vs-stack" id="tt-post-form"><label class="vs-label">Who can see TikTok posts<select class="vs-input" id="tt-privacy"><option value="" ${t.privacy ? '' : 'selected'}>Choose…</option>${options.map(v => `<option value="${v}" ${t.privacy === v ? 'selected' : ''}>${VISIBILITY[v] || v}</option>`).join('')}</select><small>TikTok asks for this choice; nothing is preselected. Until TikTok audits the app, only "Only me" works.</small></label><label class="vs-check"><input type="checkbox" id="tt-brand" ${t.brandOrganic !== false ? 'checked' : ''}><span>Posts promote Vayora's own business (TikTok labels them as promotional content).</span></label><div><button class="vs-button" type="submit">Save TikTok posting settings</button></div></form>`;
    const body = admin() ? `${t.connected ? `<div class="vs-actions">${button('Check account', 'tt-check', '', 'refresh-cw')}${button('Disconnect', 'tt-disconnect', 'vs-danger', 'unplug')}</div>` : ''}${t.configured ? `<div>${button(t.connected ? 'Reconnect TikTok' : 'Connect TikTok', 'tt-connect', 'vs-primary', 'link-2')}</div>` : ''}${posting}
<details class="vs-advanced-connect" ${t.configured ? '' : 'open'}><summary>TikTok developer app</summary><div class="vs-stack"><ol class="vs-help-list"><li>At developers.tiktok.com, create an app and add <b>Login Kit</b> and <b>Content Posting API</b> with Direct Post turned on.</li><li>Register the redirect URI below in Login Kit.</li><li>For photo posts, verify this Studio domain under URL properties (TikTok fetches the photos from it).</li><li>Copy the Client Key and Client Secret here, save, then press Connect TikTok.</li><li>Until TikTok approves the app audit, every post is visible only to the account owner and the account may need to be private.</li></ol>
<form class="vs-stack" id="tt-config-form"><label class="vs-label">Client Key<input class="vs-input" id="tt-client-key" value="${esc(t.clientKey || '')}" autocomplete="off" spellcheck="false" maxlength="64"></label><label class="vs-label">Client Secret<input class="vs-input" id="tt-client-secret" type="password" autocomplete="new-password" placeholder="${t.configured ? 'Leave blank to keep the saved secret' : ''}" maxlength="200"><small>Stored encrypted on the server and never shown again.</small></label><div><button class="vs-button" type="submit">Save TikTok app</button></div>${t.callbackUrl ? `<p class="vs-mini">Redirect URI: <span class="vs-invite-link">${esc(t.callbackUrl)}</span></p>` : ''}</form></div></details>` : '<p class="vs-sub">The workspace owner manages the TikTok connection.</p>';
    const who = t.username ? '@' + esc(t.username) : t.displayName ? esc(t.displayName) : 'No account connected yet.';
    return `<section class="vs-panel vs-pad vs-stack">${head('TikTok', who, t.connected, t.error)}${t.error ? `<p class="vs-inline-error">${esc(t.error)}</p>` : ''}${body}</section>`;
  }

  const defs = () => { const w = ctx.getWorkspace(); return [{ id: 'facebook', label: 'Facebook', status: w.facebook?.connected ? 'ok' : 'warn' }, { id: 'tiktok', label: 'TikTok', status: w.tiktok?.connected && w.tiktok?.privacy ? 'ok' : 'warn' }]; };

  function bind(root) {
    const $ = sel => root.querySelector(sel);
    $('#fb-token-form')?.addEventListener('submit', e => { e.preventDefault(); void run(() => mutate('/api/facebook/connect-token', 'POST', { token: $('#fb-token').value, pageId: $('#fb-page-id').value || undefined }, 'settings', 'Facebook Page connected.'), e.submitter); });
    $('#tt-config-form')?.addEventListener('submit', e => { e.preventDefault(); void run(() => mutate('/api/tiktok/config', 'POST', { clientKey: $('#tt-client-key').value, clientSecret: $('#tt-client-secret').value }, 'settings', 'TikTok app saved.'), e.submitter); });
    $('#tt-post-form')?.addEventListener('submit', e => { e.preventDefault(); void run(() => mutate('/api/tiktok/config', 'POST', { privacy: $('#tt-privacy').value, brandOrganic: $('#tt-brand').checked }, 'settings', 'TikTok posting settings saved.'), e.submitter); });
  }

  async function action(name) {
    if (name === 'fb-check') { await mutate('/api/facebook/check', 'POST', {}, 'settings', 'The Facebook Page connection is active.'); return true; }
    if (name === 'fb-disconnect') { ask('Disconnect the Facebook Page? Scheduled Facebook posts are not published until it is connected again.', () => mutate('/api/facebook/disconnect', 'POST', {}, 'settings', 'Facebook disconnected.'), 'Disconnect'); return true; }
    if (name === 'tt-connect') { const data = await api('/api/tiktok/connect', 'POST', {}); const url = new URL(data.url); if (url.hostname !== 'www.tiktok.com' || url.protocol !== 'https:') throw new Error('Invalid TikTok login address.'); location.assign(url.href); return true; }
    if (name === 'tt-check') { await mutate('/api/tiktok/check', 'POST', {}, 'settings', 'The TikTok connection is active.'); return true; }
    if (name === 'tt-disconnect') { ask('Disconnect TikTok? Scheduled TikTok posts are not published until it is connected again.', () => mutate('/api/tiktok/disconnect', 'POST', {}, 'settings', 'TikTok disconnected.'), 'Disconnect'); return true; }
    return false;
  }
  return { facebookPanel, tiktokPanel, defs, bind, action, toast };
}
