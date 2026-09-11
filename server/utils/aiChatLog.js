// Fire-and-forget usage logger for the two AI assistants (in-app help chat +
// public landing chat). Purely additive — never changes either assistant's
// behaviour. Logs the question text only; the bot's ANSWER is deliberately
// never logged. help_chat also logs plan/mode (context for reading a question
// later, e.g. "a Free user asking about a Pro feature") — never user_id,
// email, or property name. landing_chat logs nothing identifying beyond the
// question/language (no IP, no session id).
//
// A logging failure must never affect the chat response — caught here and
// only warned about, same non-blocking contract as server/utils/auditLog.js.
export function logAiChatQuestion(db, { source, question, language, plan, mode }) {
  try {
    db.prepare(`
      INSERT INTO ai_chat_logs (source, question, language, plan, mode)
      VALUES (?, ?, ?, ?, ?)
    `).run(source, question, language ?? null, plan ?? null, mode ?? null);
  } catch (err) {
    console.warn(`[ai-chat-log] failed to log ${source} question (non-fatal): ${err.message}`);
  }
}
