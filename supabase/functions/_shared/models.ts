/**
 * The model ids the engine knows about. A template's `model` must be one of
 * these — an unknown id 404s at generation, and at 144-item batch scale that is
 * 144 failed rows + wasted spend. Shared by scripts/validate-seed.ts (author
 * time, warn) and prose-admin's job-create guard (run time, hard block).
 *
 * Keep in sync with the model ids the deployed Anthropic account can call.
 */
export const KNOWN_MODELS = [
  'claude-sonnet-5',
  'claude-haiku-4-5',
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-opus-4-5',
] as const;

export function isKnownModel(model: unknown): model is (typeof KNOWN_MODELS)[number] {
  return typeof model === 'string' && (KNOWN_MODELS as readonly string[]).includes(model);
}
