# Photo EXIF orientation on upload

**Trigger:** a user's two room photos display rotated 90° on the live booking
page — portrait phone photos baked sideways during server-side resize.

## Root cause (confirmed)

`sharp` does **not** auto-orient from EXIF Orientation by default. `.rotate()`
with **no arguments** must be called explicitly, and **before** `.resize()`
(the resize bakes pixels and drops the EXIF tag, so a later rotate is too late).
None of the upload pipelines called it.

Reproduced in a harness: a 900×600 JPEG with `orientation: 6` (phone "portrait")
→ old pipeline `.resize(1200,…)` → **900×600 baked sideways**; with `.rotate()`
first → **600×900 upright**. A normal no-EXIF 900×600 photo is **900×600 either
way** (no regression).

## Fix — `.rotate()` added before `.resize()` in every upload pipeline

| File | Path | Sizes |
|---|---|---|
| [server/utils/processRoomPhoto.js](server/utils/processRoomPhoto.js) | room photos + property media-library pool uploads + room-import URL photos (shared helper; **2** sharp calls: full 1200 + thumb 400) | covers `roomPhotos.js`, `properties.js:948`, `attachRoomPhotoFromUrl.js` |
| [server/routes/properties.js](server/routes/properties.js) | hero photo (1920), property access photo (1200), logo (300×300 PNG) | 3 sites |
| [server/routes/rooms.js](server/routes/rooms.js) | room access photo (1200) | 1 site |
| [server/utils/mediaPool.js](server/utils/mediaPool.js) | pool thumb from an adopted (already-processed) file — `.rotate()` is a no-op here, added for defense-in-depth | 1 site |
| [server/routes/admin.js](server/routes/admin.js) | blog post image (1200×630 cover), landing-slot image (1600) — admin-only, but admins upload phone photos too | 2 sites |
| [server/routes/partnershipLinks.js](server/routes/partnershipLinks.js) | partnership link icon (80×80 cover) — owner-uploaded | 2 sites |

**Deliberately NOT changed** (not upload paths, operate on already-processed
EXIF-free stored files — `.rotate()` would be a pure no-op):
- `server/db/schema.js:1391` — one-time thumbnail backfill for legacy `room_photos`.
- `server/utils/seedSampleData.js` — curated sample images shipped with the app.

No client changes (server-side only, as expected).

## Verified locally (2026-09-08, harness, now deleted)

- Direct pipeline: portrait-EXIF `orientation:6` → **600×900 upright** (was
  900×600 sideways); normal photo → **900×600 unchanged** (no regression).
- Real `processRoomPhoto()` end-to-end (BEGIN/ROLLBACK, temp files cleaned):
  stored full **600×900**, stored thumb **400×600** — both portrait, upright. PASS.
- All 6 files `node --check` clean.
- Every other pipeline uses the identical `sharp(src).rotate().resize(…)` call
  proven above (same sharp version/semantics).

## Existing already-sideways photos — DECISION NEEDED (John)

**Not reliably detectable after the fact.** The buggy resize stripped the EXIF
Orientation tag, so stored files carry no metadata saying they're wrong. The
affected population is "anything uploaded through these paths before this fix"
but only *phone-portrait* uploads actually manifest — can't be counted from the
DB (`room_photos` stores no width/height; local dev DB has only sample data).

Recommended: **option (a)** — ask the specific user to re-upload / replace her
two room photos. Simplest, and correct now that the pipeline is fixed. The
originals' EXIF is very likely gone from the stored copies, so a bulk reprocess
of storage would not fix them anyway.

If John wants a best-effort sweep instead, a read-only diagnostic he can run on
prod (lists each stored room photo's on-disk dimensions + any residual EXIF
orientation, so landscape-from-portrait candidates can be eyeballed per
property) — say the word and I'll write it. **No bulk-fix tooling built** per
the task.

Delete this file once John has chosen a remediation and (if option a) the user
has re-uploaded.
