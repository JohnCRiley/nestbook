import { useEffect, useRef } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

const QUILL_TOOLBAR = [
  ['bold', 'italic', 'underline'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['link'],
  ['clean'],
];

let quillStylesInjected = false;
function injectQuillStyles() {
  if (quillStylesInjected) return;
  quillStylesInjected = true;
  const s = document.createElement('style');
  s.textContent = `
    .ql-toolbar.ql-snow{border:1px solid #d1d5db!important;border-bottom:none!important;border-radius:8px 8px 0 0!important;background:#f8fafc!important;padding:6px 8px!important;}
    .ql-container.ql-snow{border:1px solid #d1d5db!important;border-radius:0 0 8px 8px!important;font-family:inherit!important;font-size:0.9rem!important;}
    .ql-editor{min-height:180px;color:#1e293b!important;line-height:1.6!important;}
    .ql-editor.ql-blank::before{color:#94a3b8!important;font-style:normal!important;}
    .ql-toolbar.ql-snow .ql-stroke{stroke:#475569!important;}
    .ql-toolbar.ql-snow .ql-fill{fill:#475569!important;}
    .ql-toolbar.ql-snow button:hover .ql-stroke,.ql-toolbar.ql-snow button.ql-active .ql-stroke{stroke:#1a4710!important;}
    .ql-toolbar.ql-snow button:hover .ql-fill,.ql-toolbar.ql-snow button.ql-active .ql-fill{fill:#1a4710!important;}
    .ql-toolbar.ql-snow .ql-picker-label:hover,.ql-toolbar.ql-snow .ql-picker-item:hover{color:#1a4710!important;}
  `;
  document.head.appendChild(s);
}

export default function QuillEditor({ value, onChange, placeholder = 'Write your email here…', minHeight = 180, style: styleProp = {} }) {
  const containerRef = useRef(null);
  const quillRef     = useRef(null);
  const onChangeRef  = useRef(onChange);

  useEffect(() => { onChangeRef.current = onChange; });

  useEffect(() => {
    injectQuillStyles();
    if (!containerRef.current || quillRef.current) return;
    const container = containerRef.current;
    quillRef.current = new Quill(container, {
      theme: 'snow',
      placeholder,
      modules: { toolbar: QUILL_TOOLBAR },
    });
    // Quill inserts its toolbar as a sibling before the container, outside React's
    // render tree. Capture it now so we can remove it on unmount.
    const toolbar = container.previousElementSibling;
    if (value) quillRef.current.root.innerHTML = value;
    quillRef.current.on('text-change', () => {
      onChangeRef.current(quillRef.current.root.innerHTML);
    });
    return () => {
      quillRef.current?.off('text-change');
      toolbar?.remove();
      quillRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value into editor (e.g. template loaded)
  useEffect(() => {
    if (quillRef.current && value !== quillRef.current.root.innerHTML) {
      quillRef.current.root.innerHTML = value || '';
    }
  }, [value]);

  return <div ref={containerRef} style={{ minHeight, ...styleProp }} />;
}
