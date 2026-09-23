/**
 * AuroraState — the .aurora system state document (format v2).
 *
 * v1 carried only the filesystem. v2 captures the full system state:
 *   fs (v1 layout) + settings + checksum (SHA-256 over the canonical payload).
 * Reading v1 files keeps working (settings fall back to defaults).
 *
 * Document layout:
 * {
 *   magic: 'AURORA-STATE',
 *   version: 2,
 *   exported: ISO-8601,
 *   checksum: 'sha256:<hex>',   // over JSON of { version, exported, fs, settings }
 *   fs: { '/': {kind:'dir', children: {...}} },
 *   settings: { theme, wallpaper, sound, clock24 }
 * }
 */

export interface SettingsLike {
  theme: string;
  wallpaper: string;
  sound: boolean;
  clock24: boolean;
}

export const DEFAULT_SETTINGS: SettingsLike = {
  theme: 'aurora',
  wallpaper: 'aurora',
  sound: true,
  clock24: true,
};

/** Canonical JSON (sorted object keys) so the checksum is stable. */
export function canonicalJSON(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const entries = Object.entries(v as Record<string, unknown>)
        .filter(([, val]) => val !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, val]) => [k, walk(val)]);
      return Object.fromEntries(entries);
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

/** SHA-256 hex digest via WebCrypto (all modern browsers). */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback (deterministic FNV-1a 128-bit-ish) for non-secure contexts.
  // Clearly marked so callers can decide to refuse verification if they care.
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (const byte of data) {
    h1 = Math.imul(h1 ^ byte, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + byte, 0x85ebca6b) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  return `fnv:${hex(h1)}${hex(h2)}${hex(h1 ^ h2)}${hex(Math.imul(h1, h2) >>> 0)}`;
}

export interface StateInput {
  fsJson: string;                 // v1-style export of the filesystem (JSON string)
  settings?: SettingsLike | null; // current desktop settings (omit for v1-like file)
}

/** Build a v2 .aurora document (async: checksum needs WebCrypto). */
export async function buildStateDocument({ fsJson, settings }: StateInput): Promise<string> {
  const fs = JSON.parse(fsJson) as Record<string, unknown>;
  const exported = new Date().toISOString();
  const payload = {
    version: 2,
    exported,
    fs,
    settings: settings ?? DEFAULT_SETTINGS,
  };
  const checksum = 'sha256:' + (await sha256Hex(canonicalJSON(payload)));
  return JSON.stringify(
    { magic: 'AURORA-STATE', ...payload, checksum } as Record<string, unknown>,
    null,
    2,
  );
}

export type VerifyResult =
  | { ok: true; version: 1 | 2; fs: Record<string, unknown>; settings: SettingsLike | null }
  | { ok: false; reason: string };

/** Validate a .aurora document; verifies checksum on v2, accepts v1 gracefully. */
export async function verifyStateDocument(doc: string): Promise<VerifyResult> {
  let parsed: {
    magic?: string; version?: number; exported?: string; checksum?: string;
    fs?: Record<string, unknown>; settings?: Partial<SettingsLike>;
  };
  try {
    parsed = JSON.parse(doc);
  } catch {
    return { ok: false, reason: 'not valid JSON' };
  }
  if (parsed.magic !== 'AURORA-STATE') return { ok: false, reason: 'bad magic — not a .aurora file' };
  if (typeof parsed.fs !== 'object' || parsed.fs === null || !parsed.fs['/']) {
    return { ok: false, reason: 'missing filesystem payload' };
  }

  if (parsed.version === 1) {
    return { ok: true, version: 1, fs: parsed.fs, settings: null };
  }
  if (parsed.version !== 2) {
    return { ok: false, reason: `unsupported version ${String(parsed.version)}` };
  }

  const expected = parsed.checksum ?? '';
  const payload = {
    version: 2,
    exported: parsed.exported ?? '',
    fs: parsed.fs,
    settings: parsed.settings ?? DEFAULT_SETTINGS,
  };
  const actual = (await sha256Hex(canonicalJSON(payload))) as string;
  const actualTagged = actual.startsWith('fnv:') ? 'fnv:' + actual.slice(4) : 'sha256:' + actual;
  if (expected && expected !== actualTagged) {
    return { ok: false, reason: `checksum mismatch (expected ${expected.slice(0, 15)}…, got ${actualTagged.slice(0, 15)}…)` };
  }

  const s = parsed.settings as Partial<SettingsLike> | undefined;
  const settings: SettingsLike = s ? { ...DEFAULT_SETTINGS, ...s } : { ...DEFAULT_SETTINGS };
  return { ok: true, version: 2, fs: parsed.fs, settings };
}
