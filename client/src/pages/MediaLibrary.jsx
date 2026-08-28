import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { useT, useLocale } from '../i18n/LocaleContext.jsx';
import { CameraPlusIcon } from '../components/TablerIcons.jsx';

// ── Media Library ────────────────────────────────────────────────────────────
// A property-wide view onto every photo: the unassigned pool, the single-slot
// hero / access photos, and each room's / unit's own photos. Click a photo to
// select it, then click an empty slot to move it there (PATCH). This is an
// additional view onto the same data — the per-room upload UI in Settings is
// unchanged and still the place to add photos to a specific room.

export default function MediaLibrary() {
  const t = useT();
  const { property } = useLocale();

  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [selected, setSelected] = useState(null);   // { id, url, roomId }
  const [toast,    setToast]    = useState(null);    // { kind, text }
  const [busy,     setBusy]     = useState(false);

  const isUnits      = property?.rental_type === 'units';
  const isWholeProp  = property?.rental_type === 'whole_property';
  const isCategories = property?.rental_type === 'rooms' && property?.ir_room_mode === 'categories';

  const load = useCallback((keepSelection = false) => {
    if (!property?.id) return;
    if (!keepSelection) setSelected(null);
    apiFetch(`/api/properties/${property.id}/media`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(t('ml.loadError')))))
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message || t('ml.loadError')))
      .finally(() => setLoading(false));
  }, [property?.id, t]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(id);
  }, [toast]);

  const flash = (kind, text) => setToast({ kind, text });

  // ── mutations ─────────────────────────────────────────────────────────────
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
      load();
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
      load(true);
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
      load(true);
      return true;
    } catch (e) {
      flash('error', e.message || t('ml.uploadFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  // ── slot interactions ─────────────────────────────────────────────────────
  function onPhotoClick(photo, roomId) {
    setSelected((cur) => (cur && cur.id === photo.id ? null : { id: photo.id, url: photo.url, roomId: roomId ?? null }));
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

      {loading && <div className="ml-muted">{t('ml.loading')}</div>}
      {error && !loading && (
        <div className="form-error" style={{ marginBottom: 16 }}>
          {error} <button className="ml-btn" onClick={() => { setLoading(true); load(); }}>{t('ml.retry')}</button>
        </div>
      )}

      {data && !loading && (
        <div className="ml-page">
          {/* 1 ── Unassigned pool ───────────────────────────────────────── */}
          <PoolSection
            pool={data.pool}
            selected={selected}
            busy={busy}
            onPhotoClick={onPhotoClick}
            onUploadFile={uploadFile}
            onUploadUrl={uploadUrl}
            t={t}
          />

          {/* 2 ── Property (hero + access) ─────────────────────────────── */}
          <section className="ml-section">
            <h2 className="ml-section-title">{t('ml.propertySection')}</h2>
            <div className="ml-single-row">
              <SingleSlot
                label={t('ml.heroPhoto')}
                photo={data.hero}
                selected={selected}
                onSelect={() => data.hero && setSelected((c) => (c && c.url === data.hero.url ? null : { id: null, url: data.hero.url, roomId: null }))}
                onCopy={copyUrl}
                t={t}
              />
              <SingleSlot
                label={t('ml.accessPhoto')}
                photo={data.propertyAccessPhoto}
                selected={selected}
                onSelect={() => data.propertyAccessPhoto && setSelected((c) => (c && c.url === data.propertyAccessPhoto.url ? null : { id: null, url: data.propertyAccessPhoto.url, roomId: null }))}
                onCopy={copyUrl}
                t={t}
              />
            </div>
          </section>

          {/* 3 ── Utility (unit access photos) — units mode only ───────── */}
          {isUnits && data.unitAccessPhotos.length > 0 && (
            <section className="ml-section">
              <h2 className="ml-section-title">{t('ml.utilitySection')}</h2>
              <div className="ml-single-row">
                {data.unitAccessPhotos.map((ua) => (
                  <SingleSlot
                    key={ua.roomId}
                    label={ua.roomName}
                    photo={ua}
                    selected={selected}
                    onSelect={() => setSelected((c) => (c && c.url === ua.url ? null : { id: null, url: ua.url, roomId: null }))}
                    onCopy={copyUrl}
                    t={t}
                  />
                ))}
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
    </>
  );
}

// ── Pool section (with add-photo controls) ───────────────────────────────────
function PoolSection({ pool, selected, busy, onPhotoClick, onUploadFile, onUploadUrl, t }) {
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

// ── Single-slot photo (hero / access / unit access) — display + copy only ────
function SingleSlot({ label, photo, selected, onSelect, onCopy, t }) {
  const isSel = photo && selected && selected.url === photo.url;
  return (
    <div className="ml-single">
      <div className="ml-single-label">{label}</div>
      {photo ? (
        <>
          <button
            type="button"
            className={`ml-single-img${isSel ? ' is-selected' : ''}`}
            onClick={onSelect}
          >
            <img src={photo.url} alt="" loading="lazy" />
          </button>
          <button type="button" className="ml-linklike" onClick={() => onCopy(photo.url)}>{t('ml.copyUrl')}</button>
        </>
      ) : (
        <div className="ml-single-img ml-single-img--empty">{t('ml.notSet')}</div>
      )}
      <div className="ml-single-hint">{t('ml.manageInSettings')}</div>
    </div>
  );
}
