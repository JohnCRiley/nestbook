/**
 * NestBook email service — powered by Resend.
 *
 * Gracefully no-ops if RESEND_API_KEY is not set so the app never crashes
 * in environments where email isn't configured.
 */

import { Resend } from 'resend';

// ── Initialise ────────────────────────────────────────────────────────────────

const apiKey = (process.env.RESEND_API_KEY ?? '').trim();
const resend  = apiKey && apiKey !== 'your_key_here' ? new Resend(apiKey) : null;

if (!resend) {
  console.warn('[email] RESEND_API_KEY not configured — emails will be skipped.');
}

const FROM = 'NestBook <hello@nestbook.io>';

// ── Translations ──────────────────────────────────────────────────────────────

const T = {
  en: {
    bookingConfirmed:  'Booking Confirmed',
    dear:              'Dear',
    yourBookingAt:     'Your booking at',
    isConfirmed:       'is confirmed.',
    room:              'Room',
    checkIn:           'Check-in',
    checkOut:          'Check-out',
    from:              'from',
    by:                'by',
    guests:            'Guests',
    bookingRef:        'Booking reference',
    address:           'Address',
    questions:         'Questions? Reply to this email and we\'ll get back to you.',
    poweredBy:         'Powered by NestBook',
    welcomeSubject:    'Welcome to NestBook — your account is ready',
    welcomeHeading:    'Welcome to NestBook!',
    welcomeIntro:      'Your property management account is set up and ready to go.',
    step1Title:        'Add your rooms',
    step1Desc:         'Head to Settings to add your rooms, set prices and configure check-in times.',
    step2Title:        'Create your first booking',
    step2Desc:         'Go to the Bookings page and click + New Booking to add your first reservation.',
    step3Title:        'Share your booking widget',
    step3Desc:         'Embed the booking widget on your website so guests can book directly.',
    goToDashboard:     'Go to your dashboard',
    welcomeFooter:     'You\'re on the free Starter plan. Upgrade any time to unlock more rooms and features.',
  },
  fr: {
    bookingConfirmed:  'Réservation confirmée',
    dear:              'Cher/Chère',
    yourBookingAt:     'Votre réservation chez',
    isConfirmed:       'est confirmée.',
    room:              'Chambre',
    checkIn:           'Arrivée',
    checkOut:          'Départ',
    from:              'à partir de',
    by:                'avant',
    guests:            'Voyageurs',
    bookingRef:        'Référence de réservation',
    address:           'Adresse',
    questions:         'Des questions ? Répondez à cet e-mail, nous vous répondrons rapidement.',
    poweredBy:         'Propulsé par NestBook',
    welcomeSubject:    'Bienvenue sur NestBook — votre compte est prêt',
    welcomeHeading:    'Bienvenue sur NestBook !',
    welcomeIntro:      'Votre compte de gestion de propriété est configuré et prêt à l\'emploi.',
    step1Title:        'Ajoutez vos chambres',
    step1Desc:         'Rendez-vous dans Paramètres pour ajouter vos chambres, définir les tarifs et les horaires d\'arrivée.',
    step2Title:        'Créez votre première réservation',
    step2Desc:         'Allez sur la page Réservations et cliquez sur + Nouvelle réservation.',
    step3Title:        'Partagez votre widget de réservation',
    step3Desc:         'Intégrez le widget de réservation sur votre site pour que les clients puissent réserver directement.',
    goToDashboard:     'Accéder à votre tableau de bord',
    welcomeFooter:     'Vous êtes sur le plan Starter gratuit. Passez à un plan supérieur à tout moment.',
  },
  es: {
    bookingConfirmed:  'Reserva Confirmada',
    dear:              'Estimado/a',
    yourBookingAt:     'Su reserva en',
    isConfirmed:       'está confirmada.',
    room:              'Habitación',
    checkIn:           'Llegada',
    checkOut:          'Salida',
    from:              'desde las',
    by:                'antes de las',
    guests:            'Huéspedes',
    bookingRef:        'Referencia de reserva',
    address:           'Dirección',
    questions:         '¿Preguntas? Responda a este correo y le contestaremos pronto.',
    poweredBy:         'Con tecnología de NestBook',
    welcomeSubject:    'Bienvenido a NestBook — su cuenta está lista',
    welcomeHeading:    '¡Bienvenido a NestBook!',
    welcomeIntro:      'Su cuenta de gestión de alojamiento está configurada y lista para usar.',
    step1Title:        'Añada sus habitaciones',
    step1Desc:         'Vaya a Configuración para añadir habitaciones, precios y horarios de entrada.',
    step2Title:        'Cree su primera reserva',
    step2Desc:         'Vaya a la página de Reservas y haga clic en + Nueva reserva.',
    step3Title:        'Comparta su widget de reservas',
    step3Desc:         'Integre el widget en su web para que los huéspedes puedan reservar directamente.',
    goToDashboard:     'Ir a su panel de control',
    welcomeFooter:     'Está en el plan Starter gratuito. Actualice en cualquier momento.',
  },
  de: {
    bookingConfirmed:  'Buchung bestätigt',
    dear:              'Sehr geehrte/r',
    yourBookingAt:     'Ihre Buchung bei',
    isConfirmed:       'ist bestätigt.',
    room:              'Zimmer',
    checkIn:           'Anreise',
    checkOut:          'Abreise',
    from:              'ab',
    by:                'bis',
    guests:            'Gäste',
    bookingRef:        'Buchungsreferenz',
    address:           'Adresse',
    questions:         'Fragen? Antworten Sie auf diese E-Mail, wir helfen Ihnen gerne.',
    poweredBy:         'Bereitgestellt von NestBook',
    welcomeSubject:    'Willkommen bei NestBook — Ihr Konto ist bereit',
    welcomeHeading:    'Willkommen bei NestBook!',
    welcomeIntro:      'Ihr Unterkunftsverwaltungskonto ist eingerichtet und einsatzbereit.',
    step1Title:        'Zimmer hinzufügen',
    step1Desc:         'Gehen Sie zu Einstellungen, um Zimmer, Preise und Check-in-Zeiten anzulegen.',
    step2Title:        'Erste Buchung erstellen',
    step2Desc:         'Gehen Sie zur Buchungsseite und klicken Sie auf + Neue Buchung.',
    step3Title:        'Buchungs-Widget teilen',
    step3Desc:         'Betten Sie das Widget in Ihre Website ein, damit Gäste direkt buchen können.',
    goToDashboard:     'Zum Dashboard',
    welcomeFooter:     'Sie nutzen den kostenlosen Starter-Plan. Jederzeit upgraden.',
  },
  nl: {
    bookingConfirmed:  'Boeking bevestigd',
    dear:              'Beste',
    yourBookingAt:     'Uw boeking bij',
    isConfirmed:       'is bevestigd.',
    room:              'Kamer',
    checkIn:           'Aankomst',
    checkOut:          'Vertrek',
    from:              'vanaf',
    by:                'voor',
    guests:            'Gasten',
    bookingRef:        'Boekingsreferentie',
    address:           'Adres',
    questions:         'Vragen? Beantwoord deze e-mail en we helpen u graag.',
    poweredBy:         'Aangedreven door NestBook',
    welcomeSubject:    'Welkom bij NestBook — uw account is klaar',
    welcomeHeading:    'Welkom bij NestBook!',
    welcomeIntro:      'Uw accommodatiebeheeraccount is ingesteld en klaar voor gebruik.',
    step1Title:        'Voeg uw kamers toe',
    step1Desc:         'Ga naar Instellingen om kamers, prijzen en check-intijden in te stellen.',
    step2Title:        'Maak uw eerste boeking',
    step2Desc:         'Ga naar de pagina Boekingen en klik op + Nieuwe boeking.',
    step3Title:        'Deel uw boekingswidget',
    step3Desc:         'Integreer de widget in uw website zodat gasten direct kunnen boeken.',
    goToDashboard:     'Ga naar uw dashboard',
    welcomeFooter:     'U gebruikt het gratis Starter-abonnement. Upgrade op elk moment.',
  },
};

function t(locale, key) {
  const lang = T[locale] ? locale : 'en';
  return T[lang][key] ?? T.en[key] ?? key;
}

// ── Date formatting ───────────────────────────────────────────────────────────

const LOCALE_MAP = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', nl: 'nl-NL' };

function fmtDate(dateStr, locale) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE_MAP[locale] ?? 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ── Shared email shell ────────────────────────────────────────────────────────

function shell(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NestBook</title>
</head>
<body style="margin:0;padding:0;background:#f0faf0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf0;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr>
        <td style="background:#1a4710;border-radius:12px 12px 0 0;padding:24px 32px;text-align:center;">
          <img src="https://nestbook.io/icon.svg" width="40" height="40"
               style="border-radius:9px;vertical-align:middle;margin-right:10px;" alt="NestBook">
          <span style="color:#fff;font-size:1.3rem;font-weight:700;vertical-align:middle;letter-spacing:-0.3px;">NestBook</span>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="background:#fff;padding:32px;border-radius:0 0 12px 12px;">
          ${bodyHtml}
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:0.75rem;color:#6b7280;">nestbook.io · hello@nestbook.io</p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Booking confirmation HTML ─────────────────────────────────────────────────

function bookingConfirmationHtml(booking, property) {
  const locale = property.locale ?? 'en';
  const lang   = LOCALE_MAP[locale] ?? 'en-GB';

  const checkInDate  = fmtDate(booking.check_in_date,  locale);
  const checkOutDate = fmtDate(booking.check_out_date, locale);

  const addressParts = [
    property.address,
    property.city,
    property.country,
  ].filter(Boolean).join(', ');

  const row = (label, value) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;
                 color:#6b7280;width:40%;vertical-align:top;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;
                 color:#111827;font-weight:600;vertical-align:top;">${value}</td>
    </tr>`;

  const body = `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#1a4710;">
      ${t(locale, 'bookingConfirmed')} ✓
    </h1>
    <p style="margin:0 0 24px;font-size:0.95rem;color:#374151;">
      ${t(locale, 'dear')} ${booking.guest_first_name},<br>
      ${t(locale, 'yourBookingAt')} <strong>${property.name}</strong> ${t(locale, 'isConfirmed')}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0faf0;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
      <tr>
        ${row(t(locale, 'room'),      booking.room_name ?? '—')}
        ${row(t(locale, 'checkIn'),   `${checkInDate}${property.check_in_time  ? ' &mdash; ' + t(locale, 'from') + ' ' + property.check_in_time  : ''}`)}
        ${row(t(locale, 'checkOut'),  `${checkOutDate}${property.check_out_time ? ' &mdash; ' + t(locale, 'by')   + ' ' + property.check_out_time : ''}`)}
        ${row(t(locale, 'guests'),    String(booking.num_guests ?? 1))}
        ${row(t(locale, 'bookingRef'), `#${booking.id}`)}
        ${addressParts ? row(t(locale, 'address'), addressParts) : ''}
      </tr>
    </table>

    <p style="margin:0 0 24px;font-size:0.875rem;color:#6b7280;line-height:1.6;">
      ${t(locale, 'questions')}
    </p>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;">
    <p style="margin:0;font-size:0.72rem;color:#9ca3af;text-align:center;">
      ${t(locale, 'poweredBy')}
    </p>`;

  return shell(body);
}

// ── Welcome email HTML ────────────────────────────────────────────────────────

function welcomeHtml(user, property) {
  const step = (num, title, desc) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
        <div style="display:flex;align-items:flex-start;gap:14px;">
          <div style="min-width:28px;width:28px;height:28px;background:#1a4710;color:#fff;
                      border-radius:50%;font-size:0.8rem;font-weight:700;text-align:center;
                      line-height:28px;flex-shrink:0;">${num}</div>
          <div>
            <div style="font-size:0.875rem;font-weight:600;color:#111827;margin-bottom:3px;">${title}</div>
            <div style="font-size:0.82rem;color:#6b7280;line-height:1.5;">${desc}</div>
          </div>
        </div>
      </td>
    </tr>`;

  const body = `
    <h1 style="margin:0 0 8px;font-size:1.4rem;font-weight:700;color:#1a4710;">
      ${t('en', 'welcomeHeading')}
    </h1>
    <p style="margin:0 0 6px;font-size:1rem;color:#374151;">
      Hi ${user.name},
    </p>
    <p style="margin:0 0 28px;font-size:0.95rem;color:#374151;">
      <strong>${property.name}</strong> is live on NestBook. ${t('en', 'welcomeIntro')}
    </p>

    <p style="margin:0 0 12px;font-size:0.82rem;font-weight:700;text-transform:uppercase;
              letter-spacing:0.5px;color:#1a4710;">Get started in 3 steps</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      ${step(1, t('en', 'step1Title'), t('en', 'step1Desc'))}
      ${step(2, t('en', 'step2Title'), t('en', 'step2Desc'))}
      ${step(3, t('en', 'step3Title'), t('en', 'step3Desc'))}
    </table>

    <div style="text-align:center;margin-bottom:28px;">
      <a href="https://nestbook.io/app/login"
         style="display:inline-block;background:#1a4710;color:#fff;text-decoration:none;
                padding:13px 32px;border-radius:8px;font-size:0.9rem;font-weight:600;">
        ${t('en', 'goToDashboard')} →
      </a>
    </div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;">
    <p style="margin:0;font-size:0.78rem;color:#9ca3af;text-align:center;line-height:1.5;">
      ${t('en', 'welcomeFooter')}
    </p>`;

  return shell(body);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a booking confirmation to the guest.
 * @param {object} booking  — enriched booking row (includes guest_* and room_* fields)
 * @param {object} property — property row from the DB
 */
export async function sendBookingConfirmation(booking, property) {
  if (!resend) return;
  if (!booking?.guest_email) {
    console.warn('[email] Booking has no guest email — skipping confirmation');
    return;
  }

  const locale  = property?.locale ?? 'en';
  const subject = `${t(locale, 'bookingConfirmed')} — ${booking.room_name ?? ''} · ${property?.name ?? 'NestBook'}`;

  try {
    await resend.emails.send({
      from:    FROM,
      to:      booking.guest_email,
      subject,
      html:    bookingConfirmationHtml(booking, property ?? {}),
    });
    console.log(`[email] Booking confirmation sent → ${booking.guest_email}`);
  } catch (err) {
    console.error('[email] Failed to send booking confirmation:', err.message);
  }
}

/**
 * Forward a contact form submission to hello@nestbook.io.
 * @param {object} params — { name, email, message }
 */
export async function sendContactEmail({ name, email, message }) {
  if (!resend) return;
  const html = shell(`
    <h2 style="margin:0 0 16px;font-size:1.1rem;color:#1a4710;">New contact message</h2>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0faf0;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <tr><td style="padding:6px 0;font-size:0.82rem;color:#6b7280;width:30%;">Name</td>
          <td style="padding:6px 0;font-size:0.875rem;color:#111827;font-weight:600;">${name}</td></tr>
      <tr><td style="padding:6px 0;font-size:0.82rem;color:#6b7280;">Email</td>
          <td style="padding:6px 0;font-size:0.875rem;color:#111827;font-weight:600;">${email}</td></tr>
    </table>
    <p style="font-size:0.875rem;color:#374151;line-height:1.7;white-space:pre-wrap;">${message}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 12px;">
    <p style="font-size:0.75rem;color:#9ca3af;">Reply directly to this email to respond to ${name}.</p>`);
  await resend.emails.send({
    from:     FROM,
    to:       'hello@nestbook.io',
    replyTo:  email,
    subject:  `Contact: ${name} — nestbook.io`,
    html,
  });
}

/**
 * Send an email verification link to a newly-registered user.
 * @param {object} user  — { name, email }
 * @param {string} token — 64-char hex verification token
 */
export async function sendVerificationEmail(user, token) {
  if (!resend) return;
  if (!user?.email) return;

  const link = `https://nestbook.io/app/verify-email?token=${token}`;

  const html = shell(`
    <h1 style="margin:0 0 8px;font-size:1.4rem;font-weight:700;color:#1a4710;">
      Verify your email address
    </h1>
    <p style="margin:0 0 6px;font-size:1rem;color:#374151;">
      Hi ${user.name},
    </p>
    <p style="margin:0 0 28px;font-size:0.95rem;color:#374151;line-height:1.6;">
      Thanks for signing up for NestBook. Please verify your email address to confirm your account.
    </p>

    <div style="text-align:center;margin-bottom:28px;">
      <a href="${link}"
         style="display:inline-block;background:#1a4710;color:#fff;text-decoration:none;
                padding:13px 32px;border-radius:8px;font-size:0.9rem;font-weight:600;">
        Verify email address
      </a>
    </div>

    <p style="margin:0 0 16px;font-size:0.82rem;color:#6b7280;line-height:1.6;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${link}" style="color:#1a4710;word-break:break-all;">${link}</a>
    </p>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;">
    <p style="margin:0;font-size:0.75rem;color:#9ca3af;text-align:center;">
      If you didn't create a NestBook account, you can safely ignore this email.
    </p>`);

  try {
    await resend.emails.send({
      from:    FROM,
      to:      user.email,
      subject: 'Verify your NestBook email address',
      html,
    });
    console.log(`[email] Verification email sent → ${user.email}`);
  } catch (err) {
    console.error('[email] Failed to send verification email:', err.message);
  }
}

/**
 * Send a welcome email to a newly-registered owner.
 * @param {object} user     — { name, email }
 * @param {object} property — { name, type, ... }
 */
export async function sendWelcomeEmail(user, property) {
  if (!resend) return;
  if (!user?.email) return;

  try {
    await resend.emails.send({
      from:    FROM,
      to:      user.email,
      subject: t('en', 'welcomeSubject'),
      html:    welcomeHtml(user, property ?? {}),
    });
    console.log(`[email] Welcome email sent → ${user.email}`);
  } catch (err) {
    console.error('[email] Failed to send welcome email:', err.message);
  }
}
