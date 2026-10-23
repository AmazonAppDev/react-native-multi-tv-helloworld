/**
 * Persistent app state.
 *
 * Vega deprecates React Native's bundled AsyncStorage; the supported module is
 * `@amazon-devices/react-native-async-storage__async-storage`, aliased to
 * `@react-native-async-storage/async-storage` in package.json.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'globie.deviceId';
const LAST_PLAYED_KEY = 'globie.lastPlayed';
const RESUME_PREFIX = 'globie.resume.';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The identity a TV falls back to when its store cannot be read.
 *
 * A Vega virtual device whose data root is not mounted rejects every
 * AsyncStorage call ("Application data root path is not set"), so minting a
 * random id there would hand the relay a different television on every launch
 * and silently orphan the pairing the viewer just made. One fixed id keeps one
 * demo TV one identity across restarts; the trade-off is that two such TVs
 * would collide, which no demo has.
 */
const FALLBACK_DEVICE_ID = '6f1c9a3e-7b2d-4c58-9a41-2d8e5f0b7c31';

export interface ResumePoint {
  feedId: number;
  /** 64-bit episode identifier — kept as a number, never narrowed. */
  episodeId: number;
  positionSec: number;
  updatedAt: string;
}

export type LastPlayed = ResumePoint;

let cachedDeviceId: string | null = null;

/**
 * How long a storage call may hold a caller.
 *
 * The Vega virtual device has no mounted data root, and its AsyncStorage does
 * not reject when that happens - it never settles at all. An un-deadlined
 * `await` on it silently freezes whatever awaited it, which killed the TV's
 * command poll before it ever opened a socket. Every storage call therefore
 * carries a deadline and falls back to "nothing stored".
 */
const STORAGE_TIMEOUT_MS = 750;

/**
 * Takes the call, not an already-started promise.
 *
 * `AsyncStorage.getItem(key)` on this device throws synchronously, before it
 * has a promise to wait on - so passing `getItem(...)` as an argument let the
 * exception escape past the deadline and reject the caller, which is what kept
 * the TV's poll from ever reaching the network. Calling it inside the guard is
 * what makes the fallback reachable at all.
 */
function withDeadline<T>(start: () => Promise<T>, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (value: T) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    timer = setTimeout(() => finish(fallback), STORAGE_TIMEOUT_MS);
    let work: Promise<T>;
    try {
      work = start();
    } catch {
      finish(fallback);
      return;
    }
    if (!work || typeof work.then !== 'function') {
      finish(fallback);
      return;
    }
    work.then(finish, () => finish(fallback));
  });
}

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await withDeadline(() => AsyncStorage.getItem(key), null);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeValue(key: string, value: string): Promise<void> {
  await withDeadline(() => AsyncStorage.setItem(key, value), undefined);
}

/**
 * Returns the stored device id, falling back to the fixed demo identity.
 *
 * Storage is best effort: a device whose data root is not mounted throws on
 * every read. The id must still be stable across launches, because the relay
 * keys the Alexa pairing to it - a random per-launch id would leave the TV
 * unpaired while the server still held a pairing for the previous one.
 *
 * It is also deliberately never rotated. A rotated id orphans a pairing the
 * viewer just made, and no HTTP refusal is worth that: the id names the
 * television, it does not authenticate it.
 */
export async function loadDeviceId(): Promise<string> {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  const stored = await withDeadline(
    () => AsyncStorage.getItem(DEVICE_ID_KEY),
    null,
  );

  const id = stored && UUID_V4.test(stored) ? stored : FALLBACK_DEVICE_ID;
  // Set before the write, so a store that hangs mid-write cannot delay the
  // relay's first request either.
  cachedDeviceId = id;

  if (id !== stored) {
    // Best effort: an unwritable store must not break the relay.
    void writeValue(DEVICE_ID_KEY, id);
  }

  return id;
}

export async function loadLastPlayed(): Promise<LastPlayed | null> {
  return readJson<LastPlayed>(LAST_PLAYED_KEY);
}

export async function saveLastPlayed(point: LastPlayed): Promise<void> {
  await writeValue(LAST_PLAYED_KEY, JSON.stringify(point));
}

export async function loadResumePoint(
  episodeId: number,
): Promise<ResumePoint | null> {
  return readJson<ResumePoint>(`${RESUME_PREFIX}${episodeId}`);
}

export async function saveResumePoint(point: ResumePoint): Promise<void> {
  await writeValue(
    `${RESUME_PREFIX}${point.episodeId}`,
    JSON.stringify(point),
  );
}

export async function clearResumePoint(episodeId: number): Promise<void> {
  await withDeadline(
    () => AsyncStorage.removeItem(`${RESUME_PREFIX}${episodeId}`),
    undefined,
  );
}
