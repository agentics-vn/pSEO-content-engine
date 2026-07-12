import { assertEquals } from './_assert.ts';
import { hmacSha256Hex, sha256Hex } from '../_shared/hash.ts';

Deno.test('hmacSha256Hex matches the RFC test vector', async () => {
  // Standard HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog").
  assertEquals(
    await hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog'),
    'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
  );
});

Deno.test('hmacSha256Hex is deterministic and distinct from a plain hash', async () => {
  const a = await hmacSha256Hex('whsec_x', '{"item_key":"a"}');
  const b = await hmacSha256Hex('whsec_x', '{"item_key":"a"}');
  const c = await hmacSha256Hex('whsec_y', '{"item_key":"a"}');
  assertEquals(a, b);
  assertEquals(a === c, false);
  assertEquals(a === await sha256Hex('{"item_key":"a"}'), false);
});
