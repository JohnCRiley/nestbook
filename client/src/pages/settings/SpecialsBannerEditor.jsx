import { useEffect, useRef, useState } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import IconPicker from '../../admin/IconPicker.jsx';

const SIZE_WHITELIST = ['12px', '16px', '20px', '28px'];
const SIZE_LABELS = { '12px': 'Small', '16px': 'Normal', '20px': 'Large', '28px': 'Huge' };
const SizeStyle = Quill.import('attributors/style/size');
SizeStyle.whitelist = SIZE_WHITELIST;
Quill.register(SizeStyle, true);

const TOOLBAR = [
  ['bold', 'italic'],
  [{ list: 'bullet' }],
  [{ size: SIZE_WHITELIST }],
];

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement('style');
  // Quill's snow theme only ships ::before label overrides for its default
  // size whitelist (small/large/huge) — our custom px values all fall through
  // to the base "Normal" rule, so every option shows the same label. Add
  // matching overrides for our own whitelist here.
  const sizeLabelRules = Object.entries(SIZE_LABELS).map(([value, label]) => `
    .specials-banner-editor .ql-picker.ql-size .ql-picker-label[data-value="${value}"]::before,
    .specials-banner-editor .ql-picker.ql-size .ql-picker-item[data-value="${value}"]::before {
      content: '${label}';
    }`).join('\n');
  s.textContent = `
    .specials-banner-editor .ql-toolbar.ql-snow{border:1px solid #d1d5db!important;border-bottom:none!important;border-radius:8px 8px 0 0!important;background:#f8fafc!important;padding:6px 8px!important;}
    .specials-banner-editor .ql-container.ql-snow{border:1px solid #d1d5db!important;border-radius:0 0 8px 8px!important;font-family:inherit!important;font-size:0.9rem!important;}
    .specials-banner-editor .ql-editor{min-height:120px;color:#1e293b!important;line-height:1.6!important;}
    .specials-banner-editor .ql-editor.ql-blank::before{color:#94a3b8!important;font-style:normal!important;}
    ${sizeLabelRules}
  `;
  document.head.appendChild(s);
}

// Quill's getText() always ends the document with a trailing "\n" — subtract
// it so the counter reflects only the visible characters a guest would read.
function visibleLength(quill) {
  return Math.max(0, quill.getText().length - 1);
}

// Restricted rich-text editor for the Specials Banner body: bold, italic,
// bullet list, and font size only — mirrors client/src/admin/QuillEditor.jsx's
// import/setup pattern but with a narrower toolbar and a visible-text cap.
//
// `iconPicker` is opt-in (default off) rather than always-on: this component
// is shared verbatim by the actual Specials Banner and the Custom Section, and
// the icon library is guest-facing property content — wanted for Custom
// Section, not silently added to the Specials Banner's own editor too.
export default function SpecialsBannerEditor({ value, onChange, placeholder, maxLength = 300, iconPicker = false }) {
  const containerRef = useRef(null);
  const quillRef      = useRef(null);
  const onChangeRef   = useRef(onChange);
  const [count, setCount] = useState(0);
  const [showIconPicker, setShowIconPicker] = useState(false);

  useEffect(() => { onChangeRef.current = onChange; });

  useEffect(() => {
    injectStyles();
    if (!containerRef.current || quillRef.current) return;
    const container = containerRef.current;
    quillRef.current = new Quill(container, {
      theme: 'snow',
      placeholder,
      modules: { toolbar: TOOLBAR },
    });
    const toolbar = container.previousElementSibling;
    // Set initial content through Quill's clipboard API, not a raw innerHTML
    // write — a raw write is picked up asynchronously by Quill's own
    // MutationObserver and reconciled as a "user" edit, which can race a
    // near-immediate follow-up update (e.g. the draft-restore effect) and
    // corrupt the content to empty. dangerouslyPasteHTML goes through Quill's
    // synchronous setContents path instead, so there's no external mutation
    // left for the observer to race against.
    if (value) quillRef.current.clipboard.dangerouslyPasteHTML(value, 'silent');
    setCount(visibleLength(quillRef.current));
    quillRef.current.on('text-change', () => {
      const quill = quillRef.current;
      if (!quill) return;
      if (visibleLength(quill) > maxLength) {
        quill.history.undo();
        return;
      }
      setCount(visibleLength(quill));
      onChangeRef.current(quill.root.innerHTML);
    });
    return () => {
      quillRef.current?.off('text-change');
      toolbar?.remove();
      quillRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const quill = quillRef.current;
    if (!quill || value === quill.root.innerHTML) return;
    // Go through Quill's own clipboard pipeline rather than mutating
    // root.innerHTML directly — on an already-mounted instance, a raw DOM
    // replacement invalidates Quill's saved selection/Delta state behind its
    // back, which can make its MutationObserver reconcile the change as an
    // empty edit. dangerouslyPasteHTML(html) replaces the whole content
    // through Quill's normal setContents path instead, keeping state consistent.
    quill.clipboard.dangerouslyPasteHTML(value || '', 'silent');
    setCount(visibleLength(quill));
  }, [value]);

  // Insert icon HTML at the current cursor position via Quill's clipboard
  // pipeline — same dangerouslyPasteHTML approach used for the initial
  // content/value-sync above, and for the same reason: a raw DOM write here
  // would leave Quill's own state out of sync with what's on screen.
  function handleInsertIcon(html) {
    const quill = quillRef.current;
    if (!quill) return;
    const sel = quill.getSelection(true);
    const index = sel ? sel.index : quill.getLength();
    quill.clipboard.dangerouslyPasteHTML(index, html, 'user');
    quill.setSelection(index + 1, 0, 'silent');
  }

  return (
    <div className="specials-banner-editor">
      {iconPicker && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          <button
            type="button"
            onClick={() => setShowIconPicker(true)}
            title="Insert icon"
            style={{
              fontSize: '0.75rem', padding: '3px 9px', borderRadius: 5, cursor: 'pointer',
              border: '1px solid #d1d5db', background: '#f8fafc', color: '#64748b', fontWeight: 600,
            }}
          >
            Insert icon
          </button>
        </div>
      )}
      <div ref={containerRef} />
      <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
        {count}/{maxLength}
      </div>
      {showIconPicker && (
        <IconPicker
          defaultMode="guest"
          onInsert={handleInsertIcon}
          onClose={() => setShowIconPicker(false)}
        />
      )}
    </div>
  );
}
