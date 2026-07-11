/** Minimal assertions — local so the test suite needs zero network access. */

export function assert(cond: unknown, msg = 'assertion failed'): asserts cond {
  if (!cond) throw new Error(msg);
}

export function assertEquals(actual: unknown, expected: unknown, msg?: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(msg ?? `assertEquals failed:\n  actual:   ${a}\n  expected: ${e}`);
}

export function assertMatch(actual: string, re: RegExp, msg?: string): void {
  if (!re.test(actual)) throw new Error(msg ?? `assertMatch failed: ${re} not found in:\n${actual.slice(0, 400)}`);
}

export function assertThrows(fn: () => unknown, msg?: string): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(msg ?? 'assertThrows: function did not throw');
}

export async function assertRejects(fn: () => Promise<unknown>, msg?: string): Promise<void> {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error(msg ?? 'assertRejects: promise did not reject');
}
