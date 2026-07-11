/**
 * prose-admin — CRUD for templates, jobs, review, and publish (doc §5).
 * Human admin auth via site_admins (one site at a time per login). Drives
 * prose-generate in a loop until no items are pending.
 *
 * HARD RULE (doc §7, non-negotiable): the APPROVE handler must refuse when any
 * fail-severity gate on the item is still red. In the reference project the
 * review endpoint only blocked edits to already-published items, not the approve
 * step itself — two structurally broken items reached production before this was
 * caught. The block belongs on approve, here.
 *
 * Publishing is one-way (§5): a published item is never mutated in place; a
 * refresh creates a new template version and republishes. prose_published always
 * serves the newest published row per item key.
 */

// import { hasFailingGate } from '../_shared/gates/index.ts'

// Endpoints (all site-scoped by the caller's site_admins membership):
//   POST /templates                 create/version a template
//   POST /jobs                      create a job over a work-list of item_keys
//   POST /jobs/{id}/run             loop prose-generate until no pending items
//   GET  /items?status=flagged      review queue
//   POST /items/{id}/approve        → REFUSE if hasFailingGate(item.validation)
//   POST /items/{id}/reject
//   POST /items/{id}/publish        one-way snapshot

Deno.serve(async (_req: Request) => {
  return new Response(JSON.stringify({ ok: false, todo: 'prose-admin not yet implemented' }), {
    status: 501, headers: { 'content-type': 'application/json' },
  });
});
