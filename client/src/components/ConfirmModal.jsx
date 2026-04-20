import { useEffect } from 'react';

/**
 * Branded confirmation modal — replaces window.confirm() throughout the app.
 *
 * Props:
 *   isOpen        boolean
 *   title         string
 *   message       string | ReactNode
 *   confirmLabel  string  (default 'Confirm')
 *   cancelLabel   string  (default 'Cancel')
 *   onConfirm     function
 *   onCancel      function
 *   variant       'success' | 'warning' | 'danger'  (default 'warning')
 *   busy          boolean — disables buttons while an async action is in-flight
 */
export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'warning',
  busy    = false,
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const cfg = {
    success: { icon: '✓',  headerBg: '#1a4710', confirmBg: '#1a4710' },
    warning: { icon: '⚠',  headerBg: '#92400e', confirmBg: '#d97706' },
    danger:  { icon: '🗑', headerBg: '#991b1b', confirmBg: '#dc2626' },
  }[variant] ?? { icon: '⚠', headerBg: '#92400e', confirmBg: '#d97706' };

  return (
    <div className="cm-backdrop" onClick={onCancel}>
      <div className="cm-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="cm-header" style={{ background: cfg.headerBg }}>
          <span className="cm-icon" aria-hidden="true">{cfg.icon}</span>
          <span className="cm-title">{title}</span>
        </div>
        <div className="cm-body">
          <p className="cm-message">{message}</p>
          <div className="cm-actions">
            <button className="cm-btn-cancel" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </button>
            <button
              className="cm-btn-confirm"
              style={{ background: cfg.confirmBg }}
              onClick={onConfirm}
              disabled={busy}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
