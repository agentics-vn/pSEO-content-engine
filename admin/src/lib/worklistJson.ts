import type { CreateJobInput } from '../types';

const STORAGE_JSON_PREFIX = 'pseo-worklist-json:';
const STORAGE_NAME_PREFIX = 'pseo-worklist-name:';

const JOB_BODY_KEYS = [
  'template_key',
  'template_version',
  'items',
  'item_keys',
  'mode',
  'priorities',
  'review_sample_pct',
] as const;

export interface WorklistFormPatch {
  templateKey?: string;
  jobMode?: 'generate' | 'regenerate';
  samplePct?: number;
}

export interface IngestedWorklist {
  jsonText: string;
  itemCount: number;
  formPatch: WorklistFormPatch;
  isFullBody: boolean;
}

export interface RestoredWorklist {
  itemsJson: string;
  worklistName: string;
  useRaw: boolean;
  formPatch: WorklistFormPatch;
  itemCount: number;
}

export type SaveWorklistResult = 'ok' | 'quota' | 'unavailable';

function storageKeys(siteSlug: string): { json: string; name: string } {
  return {
    json: `${STORAGE_JSON_PREFIX}${siteSlug}`,
    name: `${STORAGE_NAME_PREFIX}${siteSlug}`,
  };
}

export function loadSavedWorklist(siteSlug: string): { json: string; name: string } | null {
  try {
    const keys = storageKeys(siteSlug);
    const json = localStorage.getItem(keys.json);
    if (!json) return null;
    return { json, name: localStorage.getItem(keys.name) ?? 'saved worklist' };
  } catch {
    return null;
  }
}

export function saveWorklist(siteSlug: string, json: string, name: string): SaveWorklistResult {
  try {
    const keys = storageKeys(siteSlug);
    localStorage.setItem(keys.json, json);
    localStorage.setItem(keys.name, name);
    return 'ok';
  } catch (err) {
    if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
      return 'quota';
    }
    return 'unavailable';
  }
}

export function clearSavedWorklist(siteSlug: string): void {
  try {
    const keys = storageKeys(siteSlug);
    localStorage.removeItem(keys.json);
    localStorage.removeItem(keys.name);
  } catch {
    // ignore
  }
}

/** Restore per-site worklist from localStorage; invalid saved JSON is cleared. */
export function restoreWorklistState(siteSlug: string, defaultJson: string): RestoredWorklist {
  const empty: RestoredWorklist = {
    itemsJson: defaultJson,
    worklistName: '',
    useRaw: false,
    formPatch: {},
    itemCount: 0,
  };
  const saved = loadSavedWorklist(siteSlug);
  if (!saved) return empty;
  try {
    const ingested = ingestWorklistText(saved.json);
    return {
      itemsJson: ingested.jsonText,
      worklistName: saved.name,
      useRaw: true,
      formPatch: ingested.formPatch,
      itemCount: ingested.itemCount,
    };
  } catch {
    clearSavedWorklist(siteSlug);
    return empty;
  }
}

/** Parse a worklist file or pasted JSON; throws on invalid shape. */
export function ingestWorklistText(text: string): IngestedWorklist {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('empty file');

  const parsed: unknown = JSON.parse(trimmed);
  const formPatch: WorklistFormPatch = {};
  let itemCount = 0;
  let isFullBody = false;

  if (Array.isArray(parsed)) {
    itemCount = parsed.length;
  } else if (parsed && typeof parsed === 'object') {
    isFullBody = true;
    const body = parsed as Record<string, unknown>;
    if (typeof body.template_key === 'string') formPatch.templateKey = body.template_key;
    if (body.mode === 'generate' || body.mode === 'regenerate') formPatch.jobMode = body.mode;
    if (typeof body.review_sample_pct === 'number') formPatch.samplePct = body.review_sample_pct;

    if (Array.isArray(body.items)) itemCount = body.items.length;
    else if (Array.isArray(body.item_keys)) itemCount = body.item_keys.length;
    else throw new Error('no items/item_keys');
  } else {
    throw new Error('not an array or object');
  }

  return {
    jsonText: JSON.stringify(parsed, null, 2),
    itemCount,
    formPatch,
    isFullBody,
  };
}

export async function readWorklistFile(file: File): Promise<{ text: string; name: string }> {
  const text = await file.text();
  return { text, name: file.name };
}

/** Build create-job payload from raw JSON textarea (array or full worklist body). */
export function buildCreateJobFromRawJson(
  itemsJson: string,
  defaults: CreateJobInput,
): CreateJobInput {
  const parsed: unknown = JSON.parse(itemsJson);
  if (Array.isArray(parsed)) {
    return { ...defaults, items: parsed as CreateJobInput['items'] };
  }
  if (parsed && typeof parsed === 'object') {
    const body = Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([k]) => (JOB_BODY_KEYS as readonly string[]).includes(k)),
    );
    if (!body.items && !body.item_keys) throw new Error('no items/item_keys');
    return { ...defaults, ...body } as CreateJobInput;
  }
  throw new Error('not an array or object');
}
