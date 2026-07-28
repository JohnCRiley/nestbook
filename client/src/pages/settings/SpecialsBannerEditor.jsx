import { useEffect, useRef, useState } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

const SIZE_WHITELIST = ['12px', '16px', '20px', '28px'];
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
  s.textContent = `
    .specials-banner-editor .ql-toolbar.ql-snow{border:1px solid #d1d5db!important;border-bottom:none!important;border-radius:8px 8px 0 0!important;background:#f8fafc!important;padding:6px 8px!important;}
    .specials-banner-editor .ql-container.ql-snow{border:1px solid #d1d5db!important;border-radius:0 0 8px 8px!important;font-family:inherit!important;font-size:0.9rem!important;}
    .specials-banner-editor .ql-editor{min-height:120px;color:#1e293b!important;line-height:1.6!important;}
    .specials-banner-editor .ql-editor.ql-blank::before{color:#94a3b8!important;font-style:normal!important;}
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
export default function SpecialsBannerEditor({ value, onChange, placeholder, maxLength = 300 }) {
  const containerRef = useRef(null);
  const quillRef      = useRef(null);
  const onChangeRef   = useRef(onChange);
  const [count, setCount] = useState(0);

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
    if (value) quillRef.current.root.innerHTML = value;
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
    if (quillRef.current && value !== quillRef.current.root.innerHTML) {
      quillRef.current.root.innerHTML = value || '';
      setCount(visibleLength(quillRef.current));
    }
  }, [value]);

  return (
    <div className="specials-banner-editor">
      <div ref={containerRef} />
      <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
        {count}/{maxLength}
      </div>
    </div>
  );
}
