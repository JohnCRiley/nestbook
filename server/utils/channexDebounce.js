// server/utils/channexDebounce.js
//
// Short-window debounce/coalescing layer for outbound Channex rate and
// availability pushes. Sits IN FRONT of pushRateUpdate()/pushAvailabilityUpdate()
// (channexPushInventory.js), which itself sits in front of channexQueue.js —
// this module only changes WHEN and HOW MANY of those calls get made, never
// channexQueue.js's own per-minute sliding window or retry/backoff logic
// (both untouched).
//
// Why it exists: Channex certification feedback (a human reviewer, not the
// automated checker) — real production limits are 10 requests/minute for
// BOTH Update Restrictions and Update Availability. Every call site (a
// rate_periods save, a booking create/cancel/edit, a direct room-price edit,
// an inbound webhook's loop-prevention push) already pushed fire-and-forget,
// one HTTP request per NestBook change. Two rate periods saved seconds apart
// (the reviewer's own example — Tests #3/#4/#9/#10) used to mean two separate
// API calls; this collapses bursts like that into one.
//
// Design: pending changes are merged per (propertyId, pushType) — pushType is
// 'rates' or 'availability' — into ONE batch in an in-memory Map. Each new
// change for the same key resets a short timer (cfg.debounceMs); when it
// finally elapses with no new arrivals, the batch flushes as exactly one call
// to pushRateUpdate()/pushAvailabilityUpdate(), which still recomputes fresh
// state from the DB at execution time and still submits through
// channexQueue.js exactly as before — correctness is unchanged, only that
// several NestBook-side changes can now collapse into one outbound call. A
// hard cfg.maxDebounceMs cap forces a flush even if changes keep arriving, so
// a very busy property is never starved indefinitely.
//
// Scope merging: as long as every pending change in a batch targets the SAME
// (refType, refId) — e.g. two edits to the same room's price, or two
// bookings for the same room — the flush keeps that exact scope, so an
// isolated single-scope burst still only touches the mapping(s) it always
// would have (matches the existing narrow-scope design from
// docs/completed/channex-rate-scoping-112.md). The moment a SECOND, different
// scope lands in the same window (e.g. a rate-period save — always
// property-wide by the data model — arriving next to a same-second
// room-price edit), the batch widens to refType:'property' (the universal
// safe superset — already the pattern pushRateUpdateForRanges() and a CSV
// bulk-import's availability refresh use) so one call still covers
// everything pending. Date ranges merge as a plain min/max union; null on
// either side ("full window") always dominates, matching the clamp semantics
// already in runRateSync()/runAvailabilitySync(). A broader-than-strictly-
// necessary range is always safe — the underlying push recomputes the
// correct current value for every date it covers, never a stale one.
//
// Ephemeral, like channexQueue.js: an in-memory Map only, nothing durable. A
// pending batch lost to a process restart is not specially re-sent — same
// acceptable tradeoff the queue itself already documents, since the next
// real NestBook change re-pushes fresh state from the DB regardless.

import { pushRateUpdate, pushAvailabilityUpdate, isChannexConnected } from './channexPushInventory.js';

// Provisional — confirm the final value once Channex has replied to the
// certification follow-up. Kept as named constants (not inlined) so there is
// exactly one place to tune them.
const DEBOUNCE_MS = 2_500;      // wait this long after the LAST change before flushing
const MAX_DEBOUNCE_MS = 10_000; // ...but never let one batch wait longer than this in total

let cfg = { debounceMs: DEBOUNCE_MS, maxDebounceMs: MAX_DEBOUNCE_MS };

/** TEST HOOK — production always runs the defaults above. */
export function __setChannexDebounceConfig(overrides = {}) {
  cfg = { ...cfg, ...overrides };
}
/** TEST HOOK — drop every pending batch/timer without flushing. Tests only. */
export function __resetChannexDebounce() {
  for (const batch of pending.values()) clearTimeout(batch.timer);
  pending.clear();
  cfg = { debounceMs: DEBOUNCE_MS, maxDebounceMs: MAX_DEBOUNCE_MS };
}

/** `${propertyId}:${pushType}` -> pending batch */
const pending = new Map();

/** Merge a new [dateFrom, dateTo] into the batch's running range. null on
 *  either side means "full window" and always wins — matches the
 *  runRateSync()/runAvailabilitySync() clamp, which only narrows the push
 *  when BOTH a real dateFrom and dateTo are given. */
function mergeRange(batch, dateFrom, dateTo) {
  if (batch.dateFrom === null || batch.dateTo === null || dateFrom == null || dateTo == null) {
    batch.dateFrom = null;
    batch.dateTo = null;
    return;
  }
  if (dateFrom < batch.dateFrom) batch.dateFrom = dateFrom;
  if (dateTo > batch.dateTo) batch.dateTo = dateTo;
}

/** Widen the batch to property-wide the moment a second, different
 *  (refType, refId) shows up in the same window — the only way one flush can
 *  still cover everything pending with exactly one call. No-op when the new
 *  arrival matches the batch's current scope (including when both are
 *  already 'property'). */
function mergeScope(batch, refType, refId) {
  if (batch.refType === 'property') return;
  if (batch.refType === refType && String(batch.refId ?? '') === String(refId ?? '')) return;
  batch.refType = 'property';
  batch.refId = null;
}

async function flush(key, pushFn) {
  const batch = pending.get(key);
  if (!batch) return;
  pending.delete(key);
  clearTimeout(batch.timer);
  // pushFn (pushRateUpdate / pushAvailabilityUpdate) already never throws /
  // never rejects — this await is just so a caller awaiting the flush chain
  // (e.g. a test) sees the real push complete, not just the enqueue.
  await pushFn(batch.propertyId, batch.refType, batch.refId, batch.dateFrom, batch.dateTo);
}

function schedule(pushType, pushFn, propertyId, refType, refId, dateFrom, dateTo) {
  // Same cheap check pushRateUpdate()/pushAvailabilityUpdate() already do —
  // duplicated here so an unconnected property never starts a batch/timer at
  // all, not even a short-lived one. No behavior change for the ~99% case.
  if (!propertyId || !isChannexConnected(propertyId)) return;

  const key = `${propertyId}:${pushType}`;
  let batch = pending.get(key);

  if (!batch) {
    batch = { propertyId, refType, refId, dateFrom, dateTo, startedAt: Date.now(), timer: null };
    pending.set(key, batch);
  } else {
    mergeScope(batch, refType, refId);
    mergeRange(batch, dateFrom, dateTo);
  }

  if (batch.timer) clearTimeout(batch.timer);
  // Reset to a fresh debounceMs on every arrival, but never push the total
  // wait past maxDebounceMs from the batch's first change.
  const remaining = Math.max(0, cfg.maxDebounceMs - (Date.now() - batch.startedAt));
  const delay = Math.min(cfg.debounceMs, remaining);
  batch.timer = setTimeout(() => { flush(key, pushFn).catch(() => {}); }, delay);
}

/**
 * Enqueue a rate change for `propertyId` into the short-window debounce
 * batch instead of pushing immediately. Same contract as pushRateUpdate() —
 * never throws, never returns a rejected promise, silent no-op for an
 * unconnected property — just delayed by up to cfg.debounceMs (reset on
 * every new arrival for the same property), hard-capped at
 * cfg.maxDebounceMs measured from the batch's first change.
 *
 * @param {number} propertyId
 * @param {'room'|'category'|'whole_property'|'property'} refType
 * @param {number|null} refId
 * @param {string|null} dateFrom
 * @param {string|null} dateTo
 * @returns {Promise<void>}
 */
export function scheduleRatePush(propertyId, refType, refId, dateFrom, dateTo) {
  try {
    schedule('rates', pushRateUpdate, propertyId, refType, refId, dateFrom, dateTo);
  } catch (err) {
    console.error(`[channex-debounce] property #${propertyId} rate schedule failed (non-fatal): ${err.message}`);
  }
  return Promise.resolve();
}

/** Availability twin of scheduleRatePush() — same contract, see there. */
export function scheduleAvailabilityPush(propertyId, refType, refId, dateFrom, dateTo) {
  try {
    schedule('availability', pushAvailabilityUpdate, propertyId, refType, refId, dateFrom, dateTo);
  } catch (err) {
    console.error(`[channex-debounce] property #${propertyId} availability schedule failed (non-fatal): ${err.message}`);
  }
  return Promise.resolve();
}
