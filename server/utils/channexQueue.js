// server/utils/channexQueue.js
//
// Channex integration — Phase 2, slice 9 (certification prep).
//
// A single in-process outbox for every OUTBOUND Channex write. This is real
// infrastructure in the main codebase — the certification guide explicitly
// rejects "integration logic in test files and not in the main PMS codebase"
// and requires a queue/limiter (test 12). Every write
// (pushAvailabilityUpdate / pushRateUpdate / pushRoomTypeReconcile, the Full
// Sync, room-type/rate-plan CRUD, booking acknowledgment) reaches Channex
// through submitChannexJob(); reads (GET booking_revisions) stay direct so a
// webhook pull never queues behind a backed-up ARI burst.
//
// Why it exists:
//   - Channex rate-limits ARI PER PROPERTY per minute: 10 availability, 10
//     restrictions, 20 ARI total (docs.channex.io "Rate Limits", 2026-09-08;
//     429 + {"errors":{"code":"http_too_many_requests"}} on breach). A burst of
//     NestBook changes (bulk import, a run of bookings) must be SPACED.
//   - A 429 / 5xx / network blip must RETRY with backoff, never silently drop
//     an update.
//
// What it is NOT: a durable job system. One array + one async worker. If the
// process restarts with jobs pending they are lost — the next real change event
// re-pushes fresh state from the DB, and an un-acked booking is re-reminded by
// Channex after 30 min. Acceptable for this scale.
//
// No nesting: a job's run() must never call submitChannexJob() (single worker
// would deadlock). Only leaf HTTP calls are queued; higher-level helpers build
// a run() closure that recomputes from the DB at execution time.

const MINUTE = 60_000;

// Real Channex per-property-per-minute ceilings, kept a hair under for safety.
const DEFAULTS = {
  minute: MINUTE,
  limitAvailability: 9,   // doc: 10
  limitRestrictions: 9,   // doc: 10
  limitAriTotal: 18,      // doc: 20
  minGapMs: 250,          // floor between any two dispatches
  maxAttempts: 5,         // initial + 4 retries
  backoffMs: [2_000, 8_000, 30_000, 60_000], // delay before attempt 2,3,4,5
};

let cfg = { ...DEFAULTS };

/** TEST HOOK — production always runs the DEFAULTS above. */
export function __setChannexQueueConfig(overrides = {}) {
  cfg = { ...cfg, ...overrides };
}
/** TEST HOOK — clear all state between test cases. */
export function __resetChannexQueue() {
  queue.length = 0;
  ariHits.clear();
  lastDispatchAt = 0;
  stats = { submitted: 0, deduped: 0, ok: 0, failed: 0, retries: 0 };
  cfg = { ...DEFAULTS };
}

const queue = [];            // pending jobs, FIFO
const ariHits = new Map();   // propKey -> { availability: number[], restrictions: number[] } dispatch timestamps
let lastDispatchAt = 0;
let running = false;
let stats = { submitted: 0, deduped: 0, ok: 0, failed: 0, retries: 0 };

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/** 429, any 5xx, or a network failure (ChannexError with status null). */
function isRetryable(err) {
  const s = err?.status;
  if (s === 429) return true;
  if (typeof s === 'number' && s >= 500 && s <= 599) return true;
  if (s == null) return true;
  return false;
}

function pruneAri(rec, now) {
  rec.availability = rec.availability.filter((t) => now - t < cfg.minute);
  rec.restrictions = rec.restrictions.filter((t) => now - t < cfg.minute);
}

/** Block (looping) until dispatching one more `ariType` call for `propKey` keeps
 *  every documented per-property limit satisfied. */
async function awaitAriSlot(propKey, ariType) {
  for (;;) {
    const now = Date.now();
    const rec = ariHits.get(propKey) ?? { availability: [], restrictions: [] };
    pruneAri(rec, now);
    ariHits.set(propKey, rec);

    const sameKindLimit = ariType === 'availability' ? cfg.limitAvailability : cfg.limitRestrictions;
    const sameKind = rec[ariType];
    const total = rec.availability.length + rec.restrictions.length;

    let waitMs = 0;
    if (sameKind.length >= sameKindLimit) {
      waitMs = Math.max(waitMs, sameKind[0] + cfg.minute - now);
    }
    if (total >= cfg.limitAriTotal) {
      const oldest = Math.min(
        ...(rec.availability.length ? rec.availability : [Infinity]),
        ...(rec.restrictions.length ? rec.restrictions : [Infinity]),
      );
      waitMs = Math.max(waitMs, oldest + cfg.minute - now);
    }
    if (waitMs <= 0) return;
    console.log(`[channex-queue] rate-limit hold ${Math.ceil(waitMs / 1000)}s — property ${propKey} (${ariType})`);
    await sleep(waitMs + 50);
  }
}

function recordAri(propKey, ariType) {
  const rec = ariHits.get(propKey) ?? { availability: [], restrictions: [] };
  rec[ariType].push(Date.now());
  ariHits.set(propKey, rec);
}

async function worker() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      job.startedAt = Date.now();

      const sinceLast = Date.now() - lastDispatchAt;
      if (sinceLast < cfg.minGapMs) await sleep(cfg.minGapMs - sinceLast);

      if (job.kind === 'ari') await awaitAriSlot(job.propKey, job.ariType);

      lastDispatchAt = Date.now();
      if (job.kind === 'ari') recordAri(job.propKey, job.ariType);

      try {
        const result = await job.run();
        stats.ok += 1;
        job.resolve(result);
      } catch (err) {
        if (isRetryable(err) && job.attempts < cfg.maxAttempts) {
          job.attempts += 1;
          stats.retries += 1;
          const retryAfterMs = Number(err?.retryAfter) > 0 ? Number(err.retryAfter) * 1000 : 0;
          const backoff = cfg.backoffMs[job.attempts - 2] ?? cfg.backoffMs[cfg.backoffMs.length - 1];
          const delay = Math.max(retryAfterMs, backoff);
          console.warn(
            `[channex-queue] ${job.label} — attempt ${job.attempts}/${cfg.maxAttempts} ` +
            `after "${err.message}"; retrying in ${Math.ceil(delay / 1000)}s`
          );
          job.startedAt = null;
          setTimeout(() => { queue.push(job); worker(); }, delay);
        } else {
          stats.failed += 1;
          console.error(`[channex-queue] ${job.label} — gave up after ${job.attempts} attempt(s): ${err.message}`);
          job.reject(err);
        }
      }
    }
  } finally {
    running = false;
  }
}

/**
 * Enqueue one outbound Channex call.
 *
 * @param {object}   o
 * @param {'ari'|'other'} o.kind
 * @param {'availability'|'restrictions'} [o.ariType]  required when kind === 'ari'
 * @param {string|number} [o.propertyId]  rate-limit bucket (a NestBook property id)
 * @param {string} [o.dedupeKey]  if a not-yet-started job with this key is queued,
 *                                its promise is returned instead of adding a duplicate
 * @param {string} [o.label]      for logs
 * @param {() => Promise<any>} o.run  the leaf channexRequest call — must NOT call
 *                                    submitChannexJob itself
 * @returns {Promise<any>} resolves with run()'s result, rejects only after every retry
 */
export function submitChannexJob({ kind, ariType, propertyId, dedupeKey, label, run }) {
  stats.submitted += 1;

  if (dedupeKey) {
    const existing = queue.find((j) => j.dedupeKey === dedupeKey && !j.startedAt);
    if (existing) {
      stats.deduped += 1;
      return existing.promise;
    }
  }

  const job = {
    kind,
    ariType,
    propKey: String(propertyId ?? 'default'),
    dedupeKey,
    label: label ?? kind,
    run,
    attempts: 1,
    startedAt: null,
  };
  job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
  queue.push(job);
  worker();
  return job.promise;
}

export function channexQueueStats() {
  return { ...stats, pending: queue.length, running };
}

/** Resolve once the queue is fully drained (or the timeout hits). Tests. */
export async function drainChannexQueue({ timeoutMs = 180_000 } = {}) {
  const start = Date.now();
  while ((queue.length || running) && Date.now() - start < timeoutMs) {
    await sleep(50);
  }
}
