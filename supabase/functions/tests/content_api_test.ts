/**
 * content-api handler tests: cross-site isolation and revoked keys are the
 * WP5 acceptance cases.
 */

import { assert, assertEquals } from './_assert.ts';
import { isPublicWebhookUrl, makeContentApiHandler, type ContentApiDeps, type PublishedRow } from '../content-api/lib.ts';
import { sha256Hex } from '../_shared/hash.ts';

const RAW_KEY_SOCHUMENH = 'key-sochumenh-raw-secret';
const RAW_KEY_SCOPED = 'key-sochumenh-combo-only';
const RAW_KEY_OTHER = 'key-othersite-raw-secret';
const RAW_KEY_REVOKED = 'key-sochumenh-revoked';

async function makeWorld() {
  const sites = [
    { id: 'site-1', slug: 'sochumenh' },
    { id: 'site-2', slug: 'othersite' },
  ];
  const keys = [
    { site_id: 'site-1', key_hash: await sha256Hex(RAW_KEY_SOCHUMENH), template_key: null, scope: 'read', revoked: false },
    { site_id: 'site-1', key_hash: await sha256Hex(RAW_KEY_SCOPED), template_key: 'combo-so-chu-dao-su-menh', scope: 'read', revoked: false },
    { site_id: 'site-1', key_hash: await sha256Hex(RAW_KEY_REVOKED), template_key: null, scope: 'read', revoked: true },
    { site_id: 'site-2', key_hash: await sha256Hex(RAW_KEY_OTHER), template_key: null, scope: 'read', revoked: false },
  ];
  const published: Array<PublishedRow & { site_id: string }> = [
    { site_id: 'site-1', item_key: 'so-chu-dao-7-su-menh-3', template_key: 'combo-so-chu-dao-su-menh', template_version: 2, output: { intro: 'a' }, updated_at: '2026-07-01T00:00:00Z' },
    { site_id: 'site-1', item_key: 'so-chu-dao-1-su-menh-5', template_key: 'combo-so-chu-dao-su-menh', template_version: 1, output: { intro: 'b' }, updated_at: '2026-06-01T00:00:00Z' },
    { site_id: 'site-1', item_key: 'trang-khac', template_key: 'other-template', template_version: 1, output: { intro: 'c' }, updated_at: '2026-06-15T00:00:00Z' },
    { site_id: 'site-2', item_key: 'secret-item', template_key: 'combo-so-chu-dao-su-menh', template_version: 1, output: { intro: 'SECRET' }, updated_at: '2026-06-01T00:00:00Z' },
  ];
  const webhooks: Array<{ site_id: string; url: string }> = [];

  const deps: ContentApiDeps = {
    getSiteBySlug: (slug) => Promise.resolve(sites.find((s) => s.slug === slug) ?? null),
    findKey: (siteId, keyHash) => {
      const k = keys.find((k) => k.site_id === siteId && k.key_hash === keyHash && !k.revoked);
      return Promise.resolve(k ? { template_key: k.template_key, scope: k.scope } : null);
    },
    listPublished: (siteId, filter) =>
      Promise.resolve(published.filter((r) =>
        r.site_id === siteId &&
        (!filter.template || r.template_key === filter.template) &&
        (filter.sinceVersion === undefined || r.template_version > filter.sinceVersion) &&
        (filter.sinceUpdatedAt === undefined || r.updated_at > filter.sinceUpdatedAt))),
    registerWebhook: (siteId, url) => {
      webhooks.push({ site_id: siteId, url });
      return Promise.resolve({ id: `wh-${webhooks.length}` });
    },
  };
  return { deps, webhooks };
}

const get = (deps: ContentApiDeps, path: string, bearer?: string) =>
  makeContentApiHandler(deps)(new Request(`http://local/content-api${path}`, {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  }));

Deno.test('published returns only published rows for the resolved site + template', async () => {
  const { deps } = await makeWorld();
  const res = await get(deps, '/v1/sites/sochumenh/published?template=combo-so-chu-dao-su-menh', RAW_KEY_SOCHUMENH);
  assertEquals(res.status, 200);
  const rows = await res.json();
  assertEquals(rows.length, 2);
  assert(rows.every((r: PublishedRow) => r.template_key === 'combo-so-chu-dao-su-menh'));
});

Deno.test('WP5 acceptance: a sochumenh key cannot read another site\'s published rows', async () => {
  const { deps } = await makeWorld();
  // sochumenh key against othersite → 401, never data.
  const cross = await get(deps, '/v1/sites/othersite/published', RAW_KEY_SOCHUMENH);
  assertEquals(cross.status, 401);
  // and the other direction too.
  const cross2 = await get(deps, '/v1/sites/sochumenh/published', RAW_KEY_OTHER);
  assertEquals(cross2.status, 401);
});

Deno.test('WP5 acceptance: a revoked key returns 401', async () => {
  const { deps } = await makeWorld();
  const res = await get(deps, '/v1/sites/sochumenh/published', RAW_KEY_REVOKED);
  assertEquals(res.status, 401);
});

Deno.test('missing bearer → 401; unknown site → 404; bad path → 404', async () => {
  const { deps } = await makeWorld();
  assertEquals((await get(deps, '/v1/sites/sochumenh/published')).status, 401);
  assertEquals((await get(deps, '/v1/sites/nope/published', RAW_KEY_SOCHUMENH)).status, 404);
  assertEquals((await get(deps, '/v2/whatever', RAW_KEY_SOCHUMENH)).status, 404);
});

Deno.test('template-scoped key: other template → 403, no template param → scope applied', async () => {
  const { deps } = await makeWorld();
  const forbidden = await get(deps, '/v1/sites/sochumenh/published?template=other-template', RAW_KEY_SCOPED);
  assertEquals(forbidden.status, 403);
  const implicit = await get(deps, '/v1/sites/sochumenh/published', RAW_KEY_SCOPED);
  const rows = await implicit.json();
  assertEquals(rows.length, 2);
  assert(rows.every((r: PublishedRow) => r.template_key === 'combo-so-chu-dao-su-menh'));
});

Deno.test('since filters: integer → newer template_version; ISO → newer updated_at', async () => {
  const { deps } = await makeWorld();
  const byVersion = await (await get(deps, '/v1/sites/sochumenh/published?template=combo-so-chu-dao-su-menh&since=1', RAW_KEY_SOCHUMENH)).json();
  assertEquals(byVersion.length, 1);
  assertEquals(byVersion[0].template_version, 2);
  const byDate = await (await get(deps, '/v1/sites/sochumenh/published?template=combo-so-chu-dao-su-menh&since=2026-06-15T00:00:00Z', RAW_KEY_SOCHUMENH)).json();
  assertEquals(byDate.length, 1);
  const garbage = await get(deps, '/v1/sites/sochumenh/published?since=lundi', RAW_KEY_SOCHUMENH);
  assertEquals(garbage.status, 400);
});

Deno.test('webhook registration requires https url and a valid key', async () => {
  const { deps, webhooks } = await makeWorld();
  const handler = makeContentApiHandler(deps);
  const post = (bearer: string, body: unknown) =>
    handler(new Request('http://local/content-api/v1/sites/sochumenh/webhooks', {
      method: 'POST',
      headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
  assertEquals((await post(RAW_KEY_SOCHUMENH, { url: 'http://insecure.example' })).status, 400);
  assertEquals((await post(RAW_KEY_REVOKED, { url: 'https://ok.example/hook' })).status, 401);
  const ok = await post(RAW_KEY_SOCHUMENH, { url: 'https://ok.example/hook' });
  assertEquals(ok.status, 201);
  assertEquals(webhooks, [{ site_id: 'site-1', url: 'https://ok.example/hook' }]);
});

Deno.test('webhook URLs: public https only — SSRF targets rejected', () => {
  for (const ok of ['https://ci.example.com/hook', 'https://api.app-a.vn/internal/updated', 'https://8.8.8.8/x']) {
    assert(isPublicWebhookUrl(ok), `should accept ${ok}`);
  }
  for (const bad of [
    'http://ci.example.com/hook',            // not https
    'https://localhost/hook', 'https://foo.localhost/x',
    'https://127.0.0.1/x', 'https://10.1.2.3/x', 'https://192.168.1.10/x',
    'https://172.16.0.9/x', 'https://169.254.169.254/latest/meta-data',
    'https://metadata.google.internal/computeMetadata',
    'https://100.100.1.1/x',                 // CGNAT
    'https://[::1]/x', 'https://engine.internal/x', 'https://printer.local/x',
    'https://user:pass@example.com/x',       // embedded credentials
    'https://intranethost/x',                // no dot — unresolvable publicly
    'not a url',
  ]) {
    assert(!isPublicWebhookUrl(bad), `should reject ${bad}`);
  }
});

Deno.test('read-only surface: non-GET on /published is rejected', async () => {
  const { deps } = await makeWorld();
  const res = await makeContentApiHandler(deps)(new Request('http://local/content-api/v1/sites/sochumenh/published', {
    method: 'POST',
    headers: { authorization: `Bearer ${RAW_KEY_SOCHUMENH}` },
  }));
  assertEquals(res.status, 405);
});
