import { Router } from 'express';
import { sendContactEmail } from '../email/emailService.js';

export const contactRouter = Router();

// ── POST /api/contact ─────────────────────────────────────────────────────────
contactRouter.post('/', async (req, res) => {
  const { name, email, message } = req.body ?? {};

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ error: 'Name, email and message are required.' });
  }
  if (!email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (message.trim().length < 10) {
    return res.status(400).json({ error: 'Message must be at least 10 characters.' });
  }

  try {
    await sendContactEmail({
      name:    name.trim(),
      email:   email.trim(),
      message: message.trim(),
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[contact]', err.message);
    // Don't expose the real error — give a friendly fallback
    res.status(500).json({
      error: 'Could not send your message right now. Please email us directly at hello@nestbook.io.',
    });
  }
});
