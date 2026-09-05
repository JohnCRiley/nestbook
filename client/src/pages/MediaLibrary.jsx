import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useT, useLocale } from '../i18n/LocaleContext.jsx';
import { CameraPlusIcon } from '../components/TablerIcons.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';

// ── Media Library ────────────────────────────────────────────────────────────
// A property-wide view onto every photo: the unassigned pool, the single-slot
// hero / access photos, and each room's / unit's own photos. Click a photo to
// select it, then click an empty slot to move it there (PATCH). This is an
// additional view onto the same data — the per-room upload UI in Settings is
// unchanged and still the place to add photos to a specific room.

export default function MediaLibrary() {
  const t = useT();
  const { property, setProperty } = useLocale();
  const propId = property?.id ?? null;

  const [data,     setData]     = useState(null);
  const [error,    setError]    = useState(false);
  const [selected, setSelected] = useState(null);   // { id, url, roomId }
  const [toast,    setToast]    = useState(null);    // { kind, text }
  const [busy,     setBusy]     = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);   // pool photo awaiting confirmation
  const [reloadTick, setReloadTick] = useState(0);

  const isUnits      = property?.rental_type === 'units';
  const isWholeProp  = property?.rental_type === 'whole_property';
  const isCategories = property?.rental_type === 'rooms' && property?.ir_room_mode === 'categories';

  // Which fetch is current — a slow/failed straggler from an earlier request (or
  // a different property) must never overwrite a newer result.
  const reqIdRef  = useRef(0);
  const keepSelRef = useRef(false);

  // Refetch without changing property. `keepSelection` lets a post-mutation
  // refresh keep the user's current selection.
  const reload = useCallback((keepSelection = false) => {
    keepSelRef.current = keepSelection;
    setReloadTick((n) => n + 1);
  }, []);

  // Property switch: drop the previous property's payload so we don't render it
  // against the new context (and so the spinner logic treats this as a fresh load).
  useEffect(() => {
    setData(null);
    setError(false);
    setSelected(null);
  }, [propId]);

  // The one and only fetch. Keyed on the primitive propId (+ an explicit reload
  // counter) so it fires exactly once per navigation / reload — no t-driven
  // re-creation, no burst.
  useEffect(() => {
    if (!propId) return;
    const myReq = ++reqIdRef.current;
    const ac = new AbortController();

    apiFetch(`/api/properties/${propId}/media`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load-failed'))))
      .then((d) => {
        if (reqIdRef.current !== myReq) return;   // superseded
        if (!keepSelRef.current) setSelected(null);
        keepSelRef.current = false;
        setData(d);
        setError(false);
      })
      .catch(() => {
        if (ac.signal.aborted || reqIdRef.current !== myReq) return;
        setError(true);
      });

    return () => ac.abort();
  }, [propId, reloadTick]);

  // Spinner only for a genuinely slow first load — never flashes on the common
  // fast path or on post-mutation refreshes (which keep the existing data on screen).
  const [showSpinner, setShowSpinner] = useState(false);
  useEffect(() => {
    if (data || error || !propId) { setShowSpinner(false); return; }
    const id = setTimeout(() => setShowSpinner(true), 400);
    return () => clearTimeout(id);
  }, [data, error, propId]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(id);
  }, [toast]);

  const flash = (kind, text) => setToast({ kind, text });

  // ── mutations ─────────────────────────────────────────────────────────────
  const [logoBgSaving, setLogoBgSaving] = useState(false);
  async function toggleLogoBackground(nextValue) {
    if (!property?.id || logoBgSaving) return;
    setLogoBgSaving(true);
    try {
      const res = await apiFetch(`/api/properties/${property.id}/logo-background`, {
        method: 'PATCH',
        body: JSON.stringify({ logo_has_background: nextValue }),
      });
      if (!res.ok) { flash('error', t('ml.logoBackgroundFailed')); return; }
      const updated = await res.json();
      setProperty(updated);
    } catch (e) {
      flash('error', e.message || t('ml.logoBackgroundFailed'));
    } finally {
      setLogoBgSaving(false);
    }
  }

  async function movePhoto(photoId, roomId) {
    if (busy) return;
    setBusy(true);
    try {
      const res  = await apiFetch(`/api/rooms/photos/${photoId}`, {
        method: 'PATCH',
        body: JSON.stringify({ roomId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { flash('error', body.error || t('ml.moveFailed')); return; }
      flash('success', roomId === null ? t('ml.movedToPool') : t('ml.moved'));
      reload();
    } catch (e) {
      flash('error', e.message || t('ml.moveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file) {
    if (!file || busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('photo', file);
    try {
      const res  = await apiFetch(`/api/properties/${property.id}/media/upload`, { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { flash('error', body.error || t('ml.uploadFailed')); return; }
      flash('success', t('ml.uploaded'));
      reload(true);
    } catch (e) {
      flash('error', e.message || t('ml.uploadFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function uploadUrl(url) {
    if (!url || busy) return false;
    setBusy(true);
    try {
      const res  = await apiFetch(`/api/properties/${property.id}/media/upload-url`, {
        method: 'POST',
        body: JSON.stringify({ url }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { flash('error', body.error || t('ml.uploadFailed')); return false; }
      flash('success', t('ml.uploaded'));
      reload(true);
      return true;
    } catch (e) {
      flash('error', e.message || t('ml.uploadFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function deletePoolPhoto(photoId) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/properties/${property.id}/media/${photoId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        flash('error', body.error || t('ml.deleteFailed'));
        return;
      }
      if (selected?.id === photoId) setSelected(null);
      flash('success', t('ml.deleted'));
      reload(true);
    } catch (e) {
      flash('error', e.message || t('ml.deleteFailed'));
    } finally {
      setBusy(false);
      setPendingDelete(null);
    }
  }

  // ── single-slot manage (hero / logo / property access / unit access) ──────
  // Each calls its own existing endpoint directly — an additional entry point
  // alongside Settings / Guest Mailer / Units, not a replacement. Field name
  // and validation are the server's; we only pass the file through.
  async function uploadSingle(cfg, file) {
    if (!file || busy) return;
    setBusy(true);
    const fd = new FormData();
    fd.append(cfg.field, file);
    try {
      const res  = await apiFetch(cfg.url, { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { flash('error', body.error || t('ml.uploadFailed')); return; }
      flash('success', t('ml.singleUpdated'));
      reload(true);
    } catch (e) {
      flash('error', e.message || t('ml.uploadFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function removeSingle(cfg) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch(cfg.url, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        flash('error', body.error || t('ml.deleteFailed'));
        return;
      }
      flash('success', t('ml.singleRemoved'));
      reload(true);
    } catch (e) {
      flash('error', e.message || t('ml.deleteFailed'));
    } finally {
      setBusy(false);
    }
  }

  // ── slot interactions ─────────────────────────────────────────────────────
  function onPhotoClick(photo, roomId) {
    setSelected((cur) => (cur && cur.id === photo.id ? null : { id: photo.id, url: photo.url, roomId: roomId ?? null }));
  }

  // Single-slot photos (hero / logo / access) are identified by URL — they have
  // no room_photos id and aren't reassignable, just selectable for copy-URL.
  function selectSingle(url) {
    setSelected((cur) => (cur && cur.url === url ? null : { id: null, url, roomId: null }));
  }

  function onEmptySlotClick(room) {
    if (!selected) { flash('info', t('ml.selectFirst')); return; }
    if (selected.roomId === room.id) { setSelected(null); return; }
    movePhoto(selected.id, room.id);
  }

  function onFullSlotBlocked(roomName) {
    flash('info', t('ml.destinationFull')(roomName));
  }

  async function copyUrl(url) {
    const abs = window.location.origin + url;
    try {
      await navigator.clipboard.writeText(abs);
      flash('success', t('ml.copied'));
    } catch {
      // Clipboard API unavailable (insecure context / old browser) — fall back.
      window.prompt(t('ml.copyManual'), abs);
    }
  }

  // ── grouped rooms ─────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    if (!data) return [];
    const rooms = data.rooms || [];

    if (isUnits) {
      const units = rooms.filter((r) => r.parentUnitId == null);
      return units.map((u) => ({
        key: `unit-${u.id}`,
        label: u.name,
        unit: u,
        children: rooms.filter((r) => r.parentUnitId === u.id),
      }));
    }

    if (isCategories) {
      const cats = data.categories || [];
      const out  = cats.map((c) => ({
        key: `cat-${c.id}`,
        label: c.name,
        rooms: rooms.filter((r) => r.categoryId === c.id),
      }));
      const orphan = rooms.filter((r) => r.categoryId == null);
      if (orphan.length) out.push({ key: 'cat-none', label: t('ml.uncategorised'), rooms: orphan });
      return out.filter((g) => g.rooms.length);
    }

    // IR named / WP — one flat group
    return [{ key: 'all', label: null, rooms }];
  }, [data, isUnits, isCategories, t]);

  // ── render ────────────────────────────────────────────────────────────────
  if (!property) return null;

  return (
    <>
      <div className="page-header">
        <h1>{t('ml.title')}</h1>
        <div className="page-date">{t('ml.subtitle')}</div>
      </div>

      {toast && (
        <div className={`ml-toast ml-toast--${toast.kind}`} role="status">{toast.text}</div>
      )}

      {selected && (
        <div className="ml-selbar">
          <img src={selected.url} alt="" className="ml-selbar-thumb" />
          <span className="ml-selbar-text">{t('ml.selectedHint')}</span>
          <button className="ml-btn" onClick={() => copyUrl(selected.url)}>{t('ml.copyUrl')}</button>
          {selected.roomId != null && (
            <button className="ml-btn" disabled={busy} onClick={() => movePhoto(selected.id, null)}>
              {t('ml.moveToPool')}
            </button>
          )}
          <button className="ml-btn ml-btn--ghost" onClick={() => setSelected(null)}>{t('ml.deselect')}</button>
        </div>
      )}

      {error && !data && (
        <div className="form-error" style={{ marginBottom: 16 }}>
          {t('ml.loadError')}{' '}
          <button className="ml-btn" onClick={() => reload()}>{t('ml.retry')}</button>
        </div>
      )}
      {showSpinner && !data && !error && <div className="ml-muted">{t('ml.loading')}</div>}

      {data && (
        <div className="ml-page">
          {/* 1 ── Unassigned pool ───────────────────────────────────────── */}
          <PoolSection
            pool={data.pool}
            selected={selected}
            busy={busy}
            onPhotoClick={onPhotoClick}
            onUploadFile={uploadFile}
            onUploadUrl={uploadUrl}
            onDeleteRequest={(photo) => setPendingDelete(photo)}
            t={t}
          />

          {/* 2 ── Property (hero + logo + access) ──────────────────────── */}
          <section className="ml-section">
            <h2 className="ml-section-title">{t('ml.propertySection')}</h2>
            <div className="ml-single-row">
              <SingleSlot
                label={t('ml.heroPhoto')}
                hint={t('ml.manageInSettings')}
                photo={data.hero}
                selected={selected}
                busy={busy}
                accept="image/*"
                onSelect={() => data.hero && selectSingle(data.hero.url)}
                onCopy={copyUrl}
                onUpload={(f) => uploadSingle({ url: `/api/properties/${property.id}/hero-photo`, field: 'photo' }, f)}
                onRemove={() => removeSingle({ url: `/api/properties/${property.id}/hero-photo` })}
                t={t}
              />
              <SingleSlot
                label={t('ml.logoPhoto')}
                hint={t('ml.manageInGuestMailer')}
                photo={data.logo}
                selected={selected}
                busy={busy}
                accept="image/*"
                onSelect={() => data.logo && selectSingle(data.logo.url)}
                onCopy={copyUrl}
                onUpload={(f) => uploadSingle({ url: `/api/properties/${property.id}/logo`, field: 'logo' }, f)}
                onRemove={() => removeSingle({ url: `/api/properties/${property.id}/logo` })}
                t={t}
              />
              {isWholeProp && (
                <SingleSlot
                  label={t('ml.accessPhoto')}
                  hint={t('ml.manageInSettings')}
                  photo={data.propertyAccessPhoto}
                  selected={selected}
                  busy={busy}
                  accept="image/jpeg,image/png,image/webp"
                  onSelect={() => data.propertyAccessPhoto && selectSingle(data.propertyAccessPhoto.url)}
                  onCopy={copyUrl}
                  onUpload={(f) => uploadSingle({ url: `/api/properties/${property.id}/access-photo`, field: 'photo' }, f)}
                  onRemove={() => removeSingle({ url: `/api/properties/${property.id}/access-photo` })}
                  t={t}
                />
              )}
            </div>
            {data.logo && (
              <div className="toggle-row" style={{ marginTop: 12 }}>
                <div className="toggle-info">
                  <div className="toggle-label">{t('ml.logoBackground')}</div>
                  <div className="toggle-desc">{t('ml.logoBackgroundDesc')}</div>
                </div>
                <label className="toggle-switch" aria-label={t('ml.logoBackground')}>
                  <input
                    type="checkbox"
                    checked={property?.logo_has_background !== 0}
                    onChange={(e) => toggleLogoBackground(e.target.checked)}
                    disabled={logoBgSaving}
                  />
                  <span className="toggle-track" />
                </label>
              </div>
            )}
          </section>

          {/* 3 ── Utility (per-unit access photos) — Glamping / Serviced   */}
          {/* Apartment only, matching the per-unit Access & Arrival gate;   */}
          {/* hidden entirely for Aparthotel (staffed reception).            */}
          {(property?.un_sub_type === 'glamping' || property?.un_sub_type === 'serviced_apartment') &&
           (data.rooms || []).some((r) => r.parentUnitId == null) && (
            <section className="ml-section">
              <h2 className="ml-section-title">{t('ml.utilitySection')}</h2>
              <div className="ml-single-row">
                {(data.rooms || []).filter((r) => r.parentUnitId == null).map((u) => {
                  const photo = (data.unitAccessPhotos || []).find((ua) => ua.roomId === u.id) || null;
                  return (
                    <SingleSlot
                      key={u.id}
                      label={u.name}
                      hint={t('ml.manageUnitAccess')}
                      photo={photo}
                      selected={selected}
                      busy={busy}
                      accept="image/jpeg,image/png,image/webp"
                      onSelect={() => photo && selectSingle(photo.url)}
                      onCopy={copyUrl}
                      onUpload={(f) => uploadSingle({ url: `/api/rooms/${u.id}/access-photo`, field: 'photo' }, f)}
                      onRemove={() => removeSingle({ url: `/api/rooms/${u.id}/access-photo` })}
                      t={t}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* 4 ── Rooms / Units ────────────────────────────────────────── */}
          <section className="ml-section">
            <h2 className="ml-section-title">
              {isUnits ? t('ml.unitsSection') : isWholeProp ? t('ml.sectionsSection') : t('ml.roomsSection')}
            </h2>

            {(data.rooms || []).length === 0 && (
              <div className="ml-muted">{t('ml.noRooms')}</div>
            )}

            {groups.map((g) => (
              <div key={g.key} className="ml-group">
                {g.label && <div className="ml-group-label">{g.label}</div>}

                {/* units mode: the unit itself is a row, then its internal rooms nested */}
                {g.unit && (
                  <RoomRow
                    room={g.unit}
                    isUnitParent
                    selected={selected}
                    busy={busy}
                    onPhotoClick={onPhotoClick}
                    onEmptySlotClick={onEmptySlotClick}
                    onFullSlotBlocked={onFullSlotBlocked}
                    onRemove={(pid) => movePhoto(pid, null)}
                    t={t}
                  />
                )}

                {g.unit
                  ? (g.children.length
                      ? <div className="ml-nested">
                          <div className="ml-nested-label">{t('ml.internalRooms')}</div>
                          {g.children.map((r) => (
                            <RoomRow
                              key={r.id} room={r}
                              selected={selected} busy={busy}
                              onPhotoClick={onPhotoClick}
                              onEmptySlotClick={onEmptySlotClick}
                              onFullSlotBlocked={onFullSlotBlocked}
                              onRemove={(pid) => movePhoto(pid, null)}
                              t={t}
                            />
                          ))}
                        </div>
                      : <div className="ml-nested ml-muted">{t('ml.noInternalRooms')}</div>)
                  : (g.rooms || []).map((r) => (
                      <RoomRow
                        key={r.id} room={r}
                        selected={selected} busy={busy}
                        onPhotoClick={onPhotoClick}
                        onEmptySlotClick={onEmptySlotClick}
                        onFullSlotBlocked={onFullSlotBlocked}
                        onRemove={(pid) => movePhoto(pid, null)}
                        t={t}
                      />
                    ))}
              </div>
            ))}
          </section>
        </div>
      )}

      <ConfirmModal
        isOpen={!!pendingDelete}
        variant="danger"
        title={t('ml.deleteConfirmTitle')}
        message={t('ml.deleteConfirmBody')}
        confirmLabel={t('ml.deletePhoto')}
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deletePoolPhoto(pendingDelete.id)}
      />
    </>
  );
}

// ── Pool section (with add-photo controls) ───────────────────────────────────
function PoolSection({ pool, selected, busy, onPhotoClick, onUploadFile, onUploadUrl, onDeleteRequest, t }) {
  const [mode, setMode] = useState(null);   // null | 'url'
  const [url,  setUrl]  = useState('');
  const fileRef = useRef(null);
  const full = pool.count >= pool.cap;

  return (
    <section className="ml-section">
      <div className="ml-section-head">
        <h2 className="ml-section-title">{t('ml.poolTitle')}</h2>
        <span className={`ml-usage${full ? ' ml-usage--full' : ''}`}>
          {t('ml.usage')(pool.count, pool.cap)}
        </span>
      </div>
      <p className="ml-section-hint">{t('ml.poolHint')}</p>

      <div className="ml-grid">
        {pool.photos.map((p) => (
          <PhotoTile
            key={p.id}
            photo={p}
            selectedId={selected?.id}
            onClick={() => onPhotoClick(p, null)}
            onRemove={() => onDeleteRequest(p)}
            removeTitle={t('ml.deletePhoto')}
          />
        ))}

        {!full && (
          <>
            <label className={`ml-slot ml-slot--add${busy ? ' is-busy' : ''}`}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                disabled={busy}
                onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; onUploadFile(f); }}
              />
              <CameraPlusIcon size={20} />
              <span>{t('ml.uploadFile')}</span>
            </label>
            <button
              type="button"
              className="ml-slot ml-slot--add"
              disabled={busy}
              onClick={() => setMode((m) => (m === 'url' ? null : 'url'))}
            >
              <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>🔗</span>
              <span>{t('ml.pasteUrl')}</span>
            </button>
          </>
        )}
      </div>

      {full && <div className="ml-note ml-note--warn">{t('ml.poolFull')}</div>}

      {mode === 'url' && !full && (
        <form
          className="ml-urlform"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await onUploadUrl(url.trim());
            if (ok) { setUrl(''); setMode(null); }
          }}
        >
          <input
            className="ml-input"
            type="url"
            placeholder={t('ml.urlPlaceholder')}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
          />
          <button className="ml-btn" type="submit" disabled={busy || !url.trim()}>{t('ml.add')}</button>
          <button className="ml-btn ml-btn--ghost" type="button" onClick={() => { setMode(null); setUrl(''); }}>
            {t('ml.cancel')}
          </button>
        </form>
      )}
    </section>
  );
}

// ── One room / unit row ──────────────────────────────────────────────────────
function RoomRow({ room, isUnitParent = false, selected, busy, onPhotoClick, onEmptySlotClick, onFullSlotBlocked, onRemove, t }) {
  const photos    = room.photos || [];
  const limit     = room.limit || 1;
  const emptyN    = Math.max(0, limit - photos.length);
  const canAccept = !!selected && selected.roomId !== room.id && photos.length < limit;

  return (
    <div className={`ml-room${isUnitParent ? ' ml-room--unit' : ''}`}>
      <div className="ml-room-head">
        <span className="ml-room-name">{room.name}</span>
        <span className="ml-room-count">{photos.length}/{limit}</span>
      </div>
      <div className="ml-grid ml-grid--room">
        {photos.map((p) => (
          <PhotoTile
            key={p.id}
            photo={p}
            selectedId={selected?.id}
            onClick={() => onPhotoClick(p, room.id)}
            onRemove={() => onRemove(p.id)}
            removeTitle={t('ml.moveToPool')}
          />
        ))}

        {Array.from({ length: emptyN }).map((_, i) => (
          <button
            key={`e${i}`}
            type="button"
            className={`ml-slot ml-slot--empty${canAccept ? ' ml-slot--target' : ''}`}
            disabled={busy}
            onClick={() => onEmptySlotClick(room)}
            title={canAccept ? t('ml.moveHere') : t('ml.emptySlot')}
          >
            {canAccept ? <span className="ml-slot-plus">＋</span> : <span className="ml-slot-dot" />}
          </button>
        ))}

        {emptyN === 0 && selected && selected.roomId !== room.id && (
          <button
            type="button"
            className="ml-slot ml-slot--blocked"
            onClick={() => onFullSlotBlocked(room.name)}
            title={t('ml.destinationFull')(room.name)}
          >
            <span className="ml-slot-dot" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── A filled photo square ────────────────────────────────────────────────────
function PhotoTile({ photo, selectedId, onClick, onRemove, removeTitle }) {
  const isSel = selectedId != null && selectedId === photo.id;
  return (
    <div className={`ml-tile${isSel ? ' is-selected' : ''}`}>
      <button type="button" className="ml-tile-btn" onClick={onClick}>
        <img src={photo.thumbUrl || photo.url} alt="" loading="lazy" />
      </button>
      {onRemove && (
        <button type="button" className="ml-tile-x" title={removeTitle} onClick={onRemove}>✕</button>
      )}
    </div>
  );
}

// ── Single-slot photo (hero / logo / property + unit access) ─────────────────
// A second, equally valid entry point for these fields — it manages them via
// their own existing endpoints (`onUpload` / `onRemove`), and the `hint` still
// points at the primary editing home (Settings / Guest Mailer / Units).
function SingleSlot({ label, hint, photo, selected, busy, accept = 'image/*', onSelect, onCopy, onUpload, onRemove, t }) {
  const isSel = photo && selected && selected.url === photo.url;
  const fileRef = useRef(null);
  const pick = () => fileRef.current?.click();

  return (
    <div className="ml-single">
      <div className="ml-single-label">{label}</div>

      {photo ? (
        <button
          type="button"
          className={`ml-single-img${isSel ? ' is-selected' : ''}`}
          onClick={onSelect}
        >
          <img src={photo.url} alt="" loading="lazy" />
        </button>
      ) : onUpload ? (
        <button
          type="button"
          className="ml-single-img ml-single-img--empty ml-single-img--add"
          disabled={busy}
          onClick={pick}
        >
          <CameraPlusIcon size={18} />
          <span>{t('ml.addPhoto')}</span>
        </button>
      ) : (
        <div className="ml-single-img ml-single-img--empty">{t('ml.notSet')}</div>
      )}

      {onUpload && (
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          style={{ display: 'none' }}
          disabled={busy}
          onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onUpload(f); }}
        />
      )}

      {photo && (
        <div className="ml-single-actions">
          <button type="button" className="ml-linklike" onClick={() => onCopy(photo.url)}>{t('ml.copyUrl')}</button>
          {onUpload && (
            <button type="button" className="ml-linklike" disabled={busy} onClick={pick}>{t('ml.change')}</button>
          )}
          {onRemove && (
            <button type="button" className="ml-linklike ml-linklike--danger" disabled={busy} onClick={onRemove}>{t('ml.remove')}</button>
          )}
        </div>
      )}

      {hint && <div className="ml-single-hint">{hint}</div>}
    </div>
  );
}
