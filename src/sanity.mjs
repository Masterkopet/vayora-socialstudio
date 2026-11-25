import { readFile } from 'node:fs/promises';
import { mediaPath } from './media.mjs';
import { markdownToPortableText } from './client/portable-text.js';

// Sanity.io connection for blog articles: stores the (encrypted) token, reads the real document shape, uploads the
// hero image and writes the article with createOrReplace under a stable _id, so a retry never creates a duplicate.
const fail = (message, status = 400, code = '') => Object.assign(new Error(message), { status, code });
const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';

export const SANITY_DEFAULTS = {
  projectId: '5ugtuy3w', dataset: 'production', apiVersion: '2025-02-19', docType: 'post', publishMode: 'published',
  siteUrl: 'https://vayora.id', blogPath: '/blog/', categoryType: 'category', authorId: '', extraFields: {},
  fields: { title: 'title', slug: 'slug', excerpt: 'excerpt', body: 'body', mainImage: 'mainImage', publishedAt: 'publishedAt', seoTitle: 'seoTitle', seoDescription: 'seoDescription', categories: 'categories', author: 'author' },
};
const FIELD_KEYS = Object.keys(SANITY_DEFAULTS.fields);
const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/, FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

export function createSanity(store, options = {}) {
  const transport = options.fetch || fetch;
  const saved = () => store.secret('sanity.config', {});
  const config = () => {
    const c = saved();
    return { ...SANITY_DEFAULTS, ...c, fields: { ...SANITY_DEFAULTS.fields, ...(c.fields || {}) }, token: process.env.SANITY_API_TOKEN || c.token || '' };
  };

  function status() {
    const c = config(), check = store.setting('sanity.check', null);
    return {
      configured: !!(c.projectId && c.dataset && c.token), tokenSet: !!c.token, environmentToken: !!process.env.SANITY_API_TOKEN,
      projectId: c.projectId, dataset: c.dataset, apiVersion: c.apiVersion, docType: c.docType, publishMode: c.publishMode, siteUrl: c.siteUrl, blogPath: c.blogPath,
      categoryType: c.categoryType, authorId: c.authorId, fields: c.fields, extraFields: c.extraFields, check,
    };
  }

  function configure(body) {
    const c = saved(), next = { ...c, fields: { ...(c.fields || {}) } };
    if (body.projectId !== undefined) { next.projectId = str(body.projectId, 30).toLowerCase(); if (next.projectId && !/^[a-z0-9]{6,20}$/.test(next.projectId)) throw fail('Invalid Sanity Project ID. Copy it from sanity.io/manage (lowercase letters and numbers).'); }
    if (body.dataset !== undefined) { next.dataset = str(body.dataset, 64) || 'production'; if (!/^[a-z0-9_-]{1,64}$/.test(next.dataset)) throw fail('Invalid dataset name, for example: production.'); }
    if (body.removeToken) next.token = ''; else if (body.token) { next.token = str(body.token, 300); if (!/^sk[A-Za-z0-9]{20,}$/.test(next.token)) throw fail('Invalid Sanity token. Create a token (Editor permission) at sanity.io/manage → API → Tokens; it starts with "sk".'); }
    if (body.docType !== undefined) { next.docType = str(body.docType, 64) || 'post'; if (!NAME.test(next.docType)) throw fail('Invalid document type, for example: post.'); }
    if (body.publishMode !== undefined) { if (!['published', 'draft'].includes(body.publishMode)) throw fail('The publish mode must be published or draft.'); next.publishMode = body.publishMode; }
    if (body.siteUrl !== undefined) { next.siteUrl = str(body.siteUrl, 200).replace(/\/+$/, ''); if (next.siteUrl && !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(next.siteUrl)) throw fail('The site address must start with https://, for example: https://vayora.id'); }
    if (body.blogPath !== undefined) { next.blogPath = '/' + str(body.blogPath, 80).replace(/^\/+|\/+$/g, '') + '/'; if (!/^\/[A-Za-z0-9/_-]*\/$/.test(next.blogPath) || next.blogPath === '//') next.blogPath = '/'; }
    if (body.categoryType !== undefined) { next.categoryType = str(body.categoryType, 64); if (next.categoryType && !NAME.test(next.categoryType)) throw fail('Invalid category document type.'); }
    if (body.authorId !== undefined) { next.authorId = str(body.authorId, 80); if (next.authorId && !/^[A-Za-z0-9._-]+$/.test(next.authorId)) throw fail('Invalid author ID. Choose from the list after Check connection.'); }
    if (body.fields && typeof body.fields === 'object') for (const k of FIELD_KEYS) if (body.fields[k] !== undefined) { const v = str(String(body.fields[k]), 64); if (v && !FIELD.test(v)) throw fail(`Invalid field name ${k}.`); next.fields[k] = v; }
    if (body.extraFields !== undefined) {
      let extra = body.extraFields; if (typeof extra === 'string') { try { extra = extra.trim() ? JSON.parse(extra) : {}; } catch { throw fail('Extra fields must be valid JSON, for example: {"featured": false}.'); } }
      if (!extra || typeof extra !== 'object' || Array.isArray(extra) || JSON.stringify(extra).length > 4000) throw fail('Extra fields must be a JSON object of at most 4,000 characters.');
      if (Object.keys(extra).some(k => /^_(id|type|rev|createdAt|updatedAt)$/.test(k))) throw fail('Extra fields must not change _id, _type, or Sanity metadata.');
      next.extraFields = extra;
    }
    store.setSecret('sanity.config', next);
    store.set('sanity.check', null);
    return status();
  }

  function url(c, path, query = '') { return `https://${c.projectId}.api.sanity.io/v${c.apiVersion}${path}${query}`; }
  // Reads of a public dataset work without a token (anonymous: true); writes always need one.
  async function call(c, path, { method = 'GET', query = '', headers = {}, body, timeout = 30000, anonymous = false } = {}) {
    if (!c.projectId || (!c.token && !anonymous)) throw fail('Connect Sanity in AI settings & connections first.', 422, 'NOT_CONNECTED');
    let response;
    try { response = await transport(url(c, path, query), { method, headers: { ...(c.token ? { Authorization: 'Bearer ' + c.token } : {}), ...headers }, body, signal: AbortSignal.timeout(timeout) }); }
    catch { throw fail('Cannot reach Sanity. Check your internet connection and try again.', 502, 'NETWORK'); }
    if (response.ok) return response.json();
    let detail = ''; try { const j = await response.json(); detail = String(j.error?.description || j.message || j.error || '').slice(0, 200); } catch { /* no body */ }
    if (response.status === 401) throw fail('The Sanity token was rejected. Create a new token and save it again.', 502, 'AUTH');
    if (response.status === 403) throw fail('The Sanity token does not have permission for this. Use a token with the Editor role.', 502, 'FORBIDDEN');
    if (response.status === 404) throw fail('Sanity project or dataset not found. Check the Project ID and dataset name.', 502, 'NOT_FOUND');
    if (response.status === 429) throw fail('Sanity is limiting requests. Try again in a moment.', 502, 'RATE');
    throw fail('Sanity menolak permintaan' + (detail ? ': ' + detail : '.'), 502, 'REJECTED');
  }
  const query = (c, groq, params = {}, extra = {}) => call(c, `/data/query/${c.dataset}`, { ...extra, query: '?' + new URLSearchParams({ query: groq, ...Object.fromEntries(Object.entries(params).map(([k, v]) => ['$' + k, JSON.stringify(v)])) }) });

  // Reads the dataset: how many articles, the field names of a real article, authors and categories to choose from.
  async function check() {
    const c = config();
    if (!c.projectId || !c.token) throw fail('Enter the Sanity Project ID and token first.', 422, 'NOT_CONNECTED');
    try {
      const count = (await query(c, 'count(*[_type==$t])', { t: c.docType })).result;
      const sampleRaw = (await query(c, '*[_type==$t] | order(_createdAt desc)[0]{..., "body": null}', { t: c.docType })).result, sample = sampleRaw && typeof sampleRaw === 'object' && !Array.isArray(sampleRaw) ? sampleRaw : null;
      const list = v => Array.isArray(v) ? v : [];
      const authors = list((await query(c, '*[_type=="author"]{_id, name}[0...30]')).result);
      const categories = c.categoryType ? list((await query(c, '*[_type==$ct]{_id, title}[0...50]', { ct: c.categoryType })).result) : [];
      const fields = sample ? Object.entries(sample).filter(([k]) => !k.startsWith('_')).map(([name, value]) => ({ name, type: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value === 'object' ? (value._type || 'object') : typeof value })) : [];
      const result = { ok: true, checkedAt: new Date().toISOString(), count, fields, authors: authors.map(a => ({ id: a._id, name: a.name })), categories: categories.map(x => ({ id: x._id, title: x.title })), missing: sample ? Object.entries(c.fields).filter(([, name]) => name && !(name in sample)).map(([key, name]) => name).filter((n, i, a) => a.indexOf(n) === i) : [] };
      store.set('sanity.check', result); return result;
    } catch (error) {
      store.set('sanity.check', { ok: false, checkedAt: new Date().toISOString(), error: error.message });
      throw error;
    }
  }

  // Reads the articles already published in Sanity (without drafts), using the configured field names.
  async function listPosts() {
    const c = config(), f = c.fields, pick = key => f[key] ? `"${key}": ${f[key]}` : '';
    const projection = ['"_id": _id', pick('title'), f.slug ? `"slug": ${f.slug}.current` : '', pick('excerpt'), pick('body'), pick('publishedAt'), pick('seoTitle'), pick('seoDescription'), f.mainImage ? `"imageRef": ${f.mainImage}.asset._ref, "imageAlt": ${f.mainImage}.alt` : '', f.categories ? `"categoryTitles": ${f.categories}[]->title` : ''].filter(Boolean).join(', ');
    const data = await query(c, `*[_type==$t && !(_id in path("drafts.**"))] | order(${f.publishedAt || '_createdAt'} desc)[0...200]{ ${projection} }`, { t: c.docType }, { anonymous: true });
    return (Array.isArray(data.result) ? data.result : []).map(p => ({
      id: String(p._id), title: str(p.title, 200), slug: str(p.slug, 96), excerpt: str(p.excerpt, 400), body: Array.isArray(p.body) ? p.body : [], publishedAt: p.publishedAt || null,
      seoTitle: str(p.seoTitle, 140), seoDescription: str(p.seoDescription, 300), imageRef: typeof p.imageRef === 'string' ? p.imageRef : '', imageAlt: str(p.imageAlt, 400), category: str((p.categoryTitles || [])[0], 80),
    })).filter(p => p.title && p.slug);
  }
  // image-<hash>-<w>x<h>-<ext> → public CDN URL.
  function imageUrl(ref) {
    const c = config(), m = /^image-([a-f0-9]+)-(\d+x\d+)-([a-z0-9]+)$/i.exec(ref || '');
    return m ? `https://cdn.sanity.io/images/${c.projectId}/${c.dataset}/${m[1]}-${m[2]}.${m[3]}` : '';
  }

  async function uploadImage(row) {
    const c = config(), bytes = await readFile(mediaPath(store, row));
    const data = await call(c, `/assets/images/${c.dataset}`, { method: 'POST', query: '?' + new URLSearchParams({ filename: String(row.name || 'gambar.jpg').slice(0, 120) }), headers: { 'Content-Type': row.mime || 'image/jpeg' }, body: bytes, timeout: 120000 });
    const id = data.document?._id; if (!id) throw fail('Sanity did not return an image ID.', 502, 'REJECTED'); return id;
  }

  // category: "Operasional" → [{_type:'reference',_ref,_key}] when a category document with that title exists.
  async function categoryRefs(c, title) {
    if (!title || !c.categoryType || !c.fields.categories) return [];
    const found = (await query(c, '*[_type==$ct && lower(title)==$t][0]._id', { ct: c.categoryType, t: title.toLowerCase() })).result;
    return found ? [{ _key: 'c' + String(found).slice(0, 10), _type: 'reference', _ref: found }] : [];
  }

  // Builds the document for an article ({title, slug, excerpt, body (markdown), seoTitle, seoDescription, category,
  // heroAlt, publishedAt}) and writes it. `imageAssetId` is the uploaded hero image (null when none).
  async function publish(article, { imageAssetId, publishedAt }) {
    const c = config(), f = c.fields, blocks = markdownToPortableText(article.body, { keyPrefix: 'b' }).blocks;
    const doc = { _id: (c.publishMode === 'draft' ? 'drafts.' : '') + 'vayora-' + String(article.id).toLowerCase(), _type: c.docType };
    const put = (key, value) => { if (f[key] && value !== undefined && value !== '' && value !== null) doc[f[key]] = value; };
    put('title', article.title); put('slug', { _type: 'slug', current: article.slug }); put('excerpt', article.excerpt); put('body', blocks); put('publishedAt', publishedAt);
    put('seoTitle', article.seoTitle || undefined); put('seoDescription', article.seoDescription || article.excerpt);
    if (imageAssetId) put('mainImage', { _type: 'image', ...(article.heroAlt ? { alt: article.heroAlt } : {}), asset: { _type: 'reference', _ref: imageAssetId } });
    const refs = await categoryRefs(c, article.category); if (refs.length) put('categories', refs);
    if (c.authorId) put('author', { _type: 'reference', _ref: c.authorId });
    Object.assign(doc, c.extraFields || {});
    const inPlace = article.source === 'sanity' && article.sanityId;
    let mutation;
    if (inPlace) { const { _id, _type, ...fields } = doc; mutation = { patch: { id: article.sanityId, set: fields } }; } else mutation = { createOrReplace: doc };
    const result = await call(c, `/data/mutate/${c.dataset}`, { method: 'POST', query: '?returnIds=true', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mutations: [mutation] }) });
    const id = result.results?.[0]?.id || doc._id;
    return { sanityId: id, url: c.siteUrl + c.blogPath + article.slug, draft: c.publishMode === 'draft', categoryMissing: !!article.category && !refs.length && !!c.categoryType && !!f.categories, blocks: blocks.length };
  }

  return { status, configure, check, uploadImage, publish, config, listPosts, imageUrl };
}
