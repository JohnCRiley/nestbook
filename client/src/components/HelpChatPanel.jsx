import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { apiFetch } from '../utils/apiFetch.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useLocale } from '../i18n/LocaleContext.jsx';
import { helpChatStrings, helpChatChips, HELP_CHAT_LANGS } from './helpChatStrings.js';

const SEEN_KEY = 'nb_helpchat_seen';

function readSeen() {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return true; }
}
function markSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* cosmetic only */ }
}

// ── Inline icons (the tabler webfont isn't loaded in this app) ────────────────
function HelpIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 9a3 3 0 1 1 5 2.5c-1 .8-1.5 1.3-1.5 2.5" />
      <circle cx="12" cy="17.5" r="0.6" fill="currentColor" stroke="none" />
      <path d="M3 12a9 9 0 1 1 4.5 7.8L3 21l1.2-4.5A8.96 8.96 0 0 1 3 12z" />
    </svg>
  );
}
function SendIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 14l11 -11" />
      <path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5" />
    </svg>
  );
}

export default function HelpChatPanel() {
  const location = useLocation();
  const { user } = useAuth();
  const { locale } = useLocale() ?? {};

  const lang = HELP_CHAT_LANGS.includes(user?.language)
    ? user.language
    : (HELP_CHAT_LANGS.includes(locale) ? locale : 'en');
  const s = helpChatStrings(lang);
  const chips = helpChatChips(location.pathname, lang);

  const [open, setOpen] = useState(false);
  const [showCue, setShowCue] = useState(() => !readSeen());
  const [messages, setMessages] = useState([]); // { role: 'user' | 'assistant', content }
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const inputRef = useRef(null);
  const threadRef = useRef(null);
  const sendingRef = useRef(false);

  // Scroll the thread to the newest message.
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, loading, open]);

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(id);
    }
  }, [open]);

  // Esc to close.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  function handleOpen() {
    setOpen(true);
    if (showCue) { markSeen(); setShowCue(false); }
  }

  const sendMessage = useCallback(async (text) => {
    const trimmed = (text ?? '').trim();
    if (!trimmed || sendingRef.current) return;
    sendingRef.current = true;

    // History we send is the real turns so far (before this new message).
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    setLoading(true);

    try {
      const res = await apiFetch('/api/help-chat', {
        method: 'POST',
        body: JSON.stringify({
          message: trimmed,
          conversation_history: history,
          route: location.pathname,
          language: lang,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const reply = (res.ok && typeof data.reply === 'string' && data.reply.trim())
        ? data.reply.trim()
        : s.error;
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: s.error }]);
    } finally {
      setLoading(false);
      sendingRef.current = false;
      inputRef.current?.focus();
    }
  }, [messages, location.pathname, lang, s.error]);

  function onInputKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          className={`help-chat-trigger${showCue ? ' help-chat-trigger-cue' : ''}`}
          onClick={handleOpen}
          aria-label={s.trigger}
          title={s.trigger}
        >
          <HelpIcon />
          {showCue && <span className="help-chat-trigger-badge">{s.newBadge}</span>}
        </button>
      )}

      {open && (
        <>
          <div className="panel-backdrop" onClick={() => setOpen(false)} />
          <aside className="detail-panel help-chat-panel" role="dialog" aria-label={s.title}>
            <div className="panel-header">
              <button className="panel-close" onClick={() => setOpen(false)} aria-label={s.close}>✕</button>
              <div className="panel-guest-name">{s.title}</div>
              <div className="help-chat-subtitle">{s.subtitle}</div>
            </div>

            <div className="help-chat-thread" ref={threadRef}>
              <div className="help-chat-msg help-chat-msg-assistant">
                <div className="help-chat-bubble">{s.greeting}</div>
              </div>

              {messages.length === 0 && chips.length > 0 && (
                <div className="help-chat-chips">
                  <div className="help-chat-chips-label">{s.suggestionsLabel}</div>
                  <div className="help-chat-chips-row">
                    {chips.map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        className="help-chat-chip"
                        onClick={() => sendMessage(chip.prompt)}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`help-chat-msg ${m.role === 'user' ? 'help-chat-msg-user' : 'help-chat-msg-assistant'}`}
                >
                  <div className="help-chat-bubble">{m.content}</div>
                </div>
              ))}

              {loading && (
                <div className="help-chat-msg help-chat-msg-assistant">
                  <div className="help-chat-bubble help-chat-typing" aria-label={s.thinking}>
                    <span /><span /><span />
                  </div>
                </div>
              )}
            </div>

            <div className="help-chat-input-bar">
              <textarea
                ref={inputRef}
                className="help-chat-input"
                rows={1}
                value={input}
                placeholder={s.placeholder}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onInputKeyDown}
              />
              <button
                type="button"
                className="help-chat-send"
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                aria-label={s.send}
              >
                <SendIcon />
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
