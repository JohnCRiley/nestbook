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
    // ── Pro upgrade ────────────────────────────────────────────────────────
    proUpgradeSubject:    "Welcome to NestBook Pro — you're all set!",
    proUpgradeHeading:    "You're now on Pro 🎉",
    proUpgradeIntro:      "Great news! Your NestBook account has been upgraded to Pro. Here's everything now unlocked:",
    proFeature1:          'Unlimited rooms',
    proFeature2:          'Booking widget for your website',
    proFeature3:          'Revenue reports & exports',
    proFeature4:          'Staff accounts',
    proFeature5:          'Guest CSV import',
    proFeature6:          'Activity log',
    proTrialNote:         "Your 30-day free trial has started — you won't be charged until",
    proWidgetTitle:       'Your booking widget embed code',
    proWidgetDesc:        'Add this snippet to your website so guests can book directly:',
    proHelpLink:          'Visit the help centre',
    // ── Multi upgrade ──────────────────────────────────────────────────────
    multiUpgradeSubject:  'Welcome to NestBook Multi — manage all your properties in one place',
    multiUpgradeHeading:  'You\'re now on Multi 🏨',
    multiUpgradeIntro:    'Your account has been upgraded to NestBook Multi — our most powerful plan. Here\'s everything now unlocked:',
    multiFeature1:        'Everything in Pro',
    multiFeature2:        'Up to 5 properties',
    multiFeature3:        'Room charges — bar, restaurant, shop and activities',
    multiFeature4:        'Dedicated charges staff portal',
    multiFeature5:        'Cross-property revenue reports',
    multiFeature6:        'Per-category tax reporting',
    multiAddPropHint:     'To add a second property: Settings → Add another property',
    multiChargesHint:     'To set up room charges: Settings → Service Categories',
    // ── Shared ────────────────────────────────────────────────────────────
    upgradeSupport:       'Questions? Email us at hello@nestbook.io — we\'re here to help.',
    upgradeDashboard:     'Go to your dashboard',
    upgradeHelp:          'Help centre',
    bookingConfirmed:     'Booking Confirmed',
    dear:                 'Dear',
    yourBookingAt:        'Your booking at',
    isConfirmed:          'is confirmed.',
    room:                 'Room',
    checkIn:              'Check-in',
    checkOut:             'Check-out',
    from:                 'from',
    by:                   'by',
    guests:               'Guests',
    bookingRef:           'Booking reference',
    address:              'Address',
    breakfastIncluded:    'Breakfast included',
    depositRequired:      'Deposit required',
    questions:            'Questions? Reply to this email and we\'ll get back to you.',
    poweredBy:            'Powered by NestBook',
    depositRequestSubject:    'Deposit request for your booking',
    depositRequestHeading:    'Deposit Request',
    depositRequestBody:       'To secure your booking, a deposit payment is required.',
    depositPaymentInstr:      'Please arrange payment at your earliest convenience. Contact us if you have any questions.',
    depositConfirmSubject:    'Your deposit has been received',
    depositConfirmHeading:    'Deposit Received',
    depositConfirmBody:       'We have received your deposit payment. Your booking is now fully secured.',
    depositConfirmDetails:    'Deposit amount',
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
    proUpgradeSubject:    'Bienvenue sur NestBook Pro — tout est prêt !',
    proUpgradeHeading:    'Vous êtes maintenant sur Pro 🎉',
    proUpgradeIntro:      'Bonne nouvelle ! Votre compte NestBook a été mis à niveau vers Pro. Voici tout ce qui est débloqué :',
    proFeature1:          'Chambres illimitées',
    proFeature2:          'Widget de réservation pour votre site web',
    proFeature3:          'Rapports de revenus et exports',
    proFeature4:          'Comptes du personnel',
    proFeature5:          'Import de clients en CSV',
    proFeature6:          "Journal d'activité",
    proTrialNote:         "Votre essai gratuit de 30 jours a commencé — vous ne serez pas facturé avant le",
    proWidgetTitle:       "Code d'intégration de votre widget de réservation",
    proWidgetDesc:        'Ajoutez ce code à votre site web pour que les clients puissent réserver directement :',
    proHelpLink:          "Visiter le centre d'aide",
    multiUpgradeSubject:  'Bienvenue sur NestBook Multi — gérez tous vos établissements en un seul endroit',
    multiUpgradeHeading:  'Vous êtes maintenant sur Multi 🏨',
    multiUpgradeIntro:    "Votre compte a été mis à niveau vers NestBook Multi — notre plan le plus puissant. Voici tout ce qui est débloqué :",
    multiFeature1:        'Tout ce qui est inclus dans Pro',
    multiFeature2:        "Jusqu'à 5 établissements",
    multiFeature3:        'Frais de chambre — bar, restaurant, boutique et activités',
    multiFeature4:        'Portail dédié au personnel pour les frais',
    multiFeature5:        'Rapports de revenus multi-établissements',
    multiFeature6:        'Déclaration fiscale par catégorie',
    multiAddPropHint:     'Pour ajouter un deuxième établissement : Paramètres → Ajouter un autre établissement',
    multiChargesHint:     'Pour configurer les frais de chambre : Paramètres → Catégories de services',
    upgradeSupport:       'Des questions ? Écrivez-nous à hello@nestbook.io — nous sommes là pour vous aider.',
    upgradeDashboard:     'Accéder à votre tableau de bord',
    upgradeHelp:          "Centre d'aide",
    bookingConfirmed:     'Réservation confirmée',
    dear:                 'Cher/Chère',
    yourBookingAt:        'Votre réservation chez',
    isConfirmed:          'est confirmée.',
    room:                 'Chambre',
    checkIn:              'Arrivée',
    checkOut:             'Départ',
    from:                 'à partir de',
    by:                   'avant',
    guests:               'Voyageurs',
    bookingRef:           'Référence de réservation',
    address:              'Adresse',
    breakfastIncluded:    'Petit-déjeuner inclus',
    depositRequired:      'Acompte requis',
    questions:            'Des questions ? Répondez à cet e-mail, nous vous répondrons rapidement.',
    poweredBy:            'Propulsé par NestBook',
    depositRequestSubject:    'Demande d\'acompte pour votre réservation',
    depositRequestHeading:    'Demande d\'acompte',
    depositRequestBody:       'Pour sécuriser votre réservation, un acompte est requis.',
    depositPaymentInstr:      'Veuillez procéder au règlement dès que possible. N\'hésitez pas à nous contacter pour toute question.',
    depositConfirmSubject:    'Votre acompte a bien été reçu',
    depositConfirmHeading:    'Acompte reçu',
    depositConfirmBody:       'Nous avons bien reçu votre acompte. Votre réservation est désormais entièrement sécurisée.',
    depositConfirmDetails:    'Montant de l\'acompte',
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
    proUpgradeSubject:    '¡Bienvenido a NestBook Pro — todo listo!',
    proUpgradeHeading:    'Ya estás en Pro 🎉',
    proUpgradeIntro:      '¡Buenas noticias! Tu cuenta de NestBook ha sido actualizada a Pro. Esto es todo lo que está desbloqueado:',
    proFeature1:          'Habitaciones ilimitadas',
    proFeature2:          'Widget de reservas para tu sitio web',
    proFeature3:          'Informes de ingresos y exportaciones',
    proFeature4:          'Cuentas de personal',
    proFeature5:          'Importación de huéspedes en CSV',
    proFeature6:          'Registro de actividad',
    proTrialNote:         'Tu prueba gratuita de 30 días ha comenzado — no se te cobrará hasta el',
    proWidgetTitle:       'Código de incrustación de tu widget de reservas',
    proWidgetDesc:        'Añade este fragmento a tu sitio web para que los huéspedes puedan reservar directamente:',
    proHelpLink:          'Visitar el centro de ayuda',
    multiUpgradeSubject:  'Bienvenido a NestBook Multi — gestiona todos tus alojamientos en un solo lugar',
    multiUpgradeHeading:  'Ya estás en Multi 🏨',
    multiUpgradeIntro:    'Tu cuenta ha sido actualizada a NestBook Multi — nuestro plan más potente. Esto es todo lo que está desbloqueado:',
    multiFeature1:        'Todo lo incluido en Pro',
    multiFeature2:        'Hasta 5 alojamientos',
    multiFeature3:        'Cargos de habitación — bar, restaurante, tienda y actividades',
    multiFeature4:        'Portal de personal dedicado para cargos',
    multiFeature5:        'Informes de ingresos entre alojamientos',
    multiFeature6:        'Declaración fiscal por categoría',
    multiAddPropHint:     'Para añadir un segundo alojamiento: Configuración → Añadir otro alojamiento',
    multiChargesHint:     'Para configurar los cargos de habitación: Configuración → Categorías de servicio',
    upgradeSupport:       'Preguntas? Escríbenos a hello@nestbook.io — estamos aquí para ayudarte.',
    upgradeDashboard:     'Ir a tu panel de control',
    upgradeHelp:          'Centro de ayuda',
    bookingConfirmed:     'Reserva Confirmada',
    dear:                 'Estimado/a',
    yourBookingAt:        'Su reserva en',
    isConfirmed:          'está confirmada.',
    room:                 'Habitación',
    checkIn:              'Llegada',
    checkOut:             'Salida',
    from:                 'desde las',
    by:                   'antes de las',
    guests:               'Huéspedes',
    bookingRef:           'Referencia de reserva',
    address:              'Dirección',
    breakfastIncluded:    'Desayuno incluido',
    depositRequired:      'Depósito requerido',
    questions:            '¿Preguntas? Responda a este correo y le contestaremos pronto.',
    poweredBy:            'Con tecnología de NestBook',
    depositRequestSubject:    'Solicitud de depósito para su reserva',
    depositRequestHeading:    'Solicitud de depósito',
    depositRequestBody:       'Para asegurar su reserva, es necesario un pago de depósito.',
    depositPaymentInstr:      'Por favor, realice el pago lo antes posible. Contáctenos si tiene alguna pregunta.',
    depositConfirmSubject:    'Su depósito ha sido recibido',
    depositConfirmHeading:    'Depósito recibido',
    depositConfirmBody:       'Hemos recibido su pago de depósito. Su reserva está ahora completamente asegurada.',
    depositConfirmDetails:    'Importe del depósito',
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
    proUpgradeSubject:    'Willkommen bei NestBook Pro — alles ist bereit!',
    proUpgradeHeading:    'Sie sind jetzt auf Pro 🎉',
    proUpgradeIntro:      'Gute Neuigkeiten! Ihr NestBook-Konto wurde auf Pro aktualisiert. Folgendes ist jetzt freigeschaltet:',
    proFeature1:          'Unbegrenzte Zimmer',
    proFeature2:          'Buchungs-Widget für Ihre Website',
    proFeature3:          'Umsatzberichte und Exporte',
    proFeature4:          'Mitarbeiterkonten',
    proFeature5:          'Gäste-CSV-Import',
    proFeature6:          'Aktivitätsprotokoll',
    proTrialNote:         'Ihre 30-tägige kostenlose Testphase hat begonnen — Ihnen wird erst ab dem abgerechnet',
    proWidgetTitle:       'Ihr Buchungs-Widget-Einbettungscode',
    proWidgetDesc:        'Fügen Sie diesen Code Ihrer Website hinzu, damit Gäste direkt buchen können:',
    proHelpLink:          'Hilfecenter besuchen',
    multiUpgradeSubject:  'Willkommen bei NestBook Multi — alle Unterkünfte an einem Ort verwalten',
    multiUpgradeHeading:  'Sie sind jetzt auf Multi 🏨',
    multiUpgradeIntro:    'Ihr Konto wurde auf NestBook Multi aktualisiert — unser leistungsstärkstes Paket. Folgendes ist jetzt freigeschaltet:',
    multiFeature1:        'Alles aus Pro',
    multiFeature2:        'Bis zu 5 Unterkünfte',
    multiFeature3:        'Zimmerzusatzleistungen — Bar, Restaurant, Shop und Aktivitäten',
    multiFeature4:        'Dediziertes Mitarbeiterportal für Zusatzleistungen',
    multiFeature5:        'Unterkunftsübergreifende Umsatzberichte',
    multiFeature6:        'Steuerberichte nach Kategorie',
    multiAddPropHint:     'Um eine zweite Unterkunft hinzuzufügen: Einstellungen → Weitere Unterkunft hinzufügen',
    multiChargesHint:     'Für die Einrichtung von Zimmergebühren: Einstellungen → Servicekategorien',
    upgradeSupport:       'Fragen? Schreiben Sie uns an hello@nestbook.io — wir sind gerne für Sie da.',
    upgradeDashboard:     'Zum Dashboard',
    upgradeHelp:          'Hilfecenter',
    bookingConfirmed:     'Buchung bestätigt',
    dear:                 'Sehr geehrte/r',
    yourBookingAt:        'Ihre Buchung bei',
    isConfirmed:          'ist bestätigt.',
    room:                 'Zimmer',
    checkIn:              'Anreise',
    checkOut:             'Abreise',
    from:                 'ab',
    by:                   'bis',
    guests:               'Gäste',
    bookingRef:           'Buchungsreferenz',
    address:              'Adresse',
    breakfastIncluded:    'Frühstück inklusive',
    depositRequired:      'Anzahlung erforderlich',
    questions:            'Fragen? Antworten Sie auf diese E-Mail, wir helfen Ihnen gerne.',
    poweredBy:            'Bereitgestellt von NestBook',
    depositRequestSubject:    'Anzahlungsanforderung für Ihre Buchung',
    depositRequestHeading:    'Anzahlungsanforderung',
    depositRequestBody:       'Um Ihre Buchung zu sichern, ist eine Anzahlung erforderlich.',
    depositPaymentInstr:      'Bitte überweisen Sie den Betrag so bald wie möglich. Bei Fragen stehen wir Ihnen gerne zur Verfügung.',
    depositConfirmSubject:    'Ihre Anzahlung ist eingegangen',
    depositConfirmHeading:    'Anzahlung erhalten',
    depositConfirmBody:       'Wir haben Ihre Anzahlung erhalten. Ihre Buchung ist nun vollständig gesichert.',
    depositConfirmDetails:    'Anzahlungsbetrag',
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
    proUpgradeSubject:    'Welkom bij NestBook Pro — alles is klaar!',
    proUpgradeHeading:    'U bent nu op Pro 🎉',
    proUpgradeIntro:      'Goed nieuws! Uw NestBook-account is geüpgraded naar Pro. Dit is alles wat nu ontgrendeld is:',
    proFeature1:          'Onbeperkte kamers',
    proFeature2:          'Boekingswidget voor uw website',
    proFeature3:          'Omzetrapporten en exports',
    proFeature4:          'Personeelsaccounts',
    proFeature5:          'Gasten CSV-import',
    proFeature6:          'Activiteitenlogboek',
    proTrialNote:         'Uw gratis proefperiode van 30 dagen is gestart — u wordt pas gefactureerd vanaf',
    proWidgetTitle:       'Uw boekingswidget-insluitcode',
    proWidgetDesc:        'Voeg dit fragment toe aan uw website zodat gasten direct kunnen boeken:',
    proHelpLink:          'Bezoek het helpcentrum',
    multiUpgradeSubject:  'Welkom bij NestBook Multi — beheer al uw accommodaties op één plek',
    multiUpgradeHeading:  'U bent nu op Multi 🏨',
    multiUpgradeIntro:    'Uw account is geüpgraded naar NestBook Multi — ons krachtigste abonnement. Dit is alles wat nu ontgrendeld is:',
    multiFeature1:        'Alles uit Pro',
    multiFeature2:        'Tot 5 accommodaties',
    multiFeature3:        'Kamerkosten — bar, restaurant, winkel en activiteiten',
    multiFeature4:        'Dedicated personeelsportaal voor kosten',
    multiFeature5:        'Cross-accommodatie omzetrapporten',
    multiFeature6:        'Belastingrapportage per categorie',
    multiAddPropHint:     'Om een tweede accommodatie toe te voegen: Instellingen → Nog een accommodatie toevoegen',
    multiChargesHint:     'Voor het instellen van kamerkosten: Instellingen → Servicecategorieën',
    upgradeSupport:       'Vragen? Stuur ons een e-mail op hello@nestbook.io — we helpen u graag.',
    upgradeDashboard:     'Ga naar uw dashboard',
    upgradeHelp:          'Helpcentrum',
    bookingConfirmed:     'Boeking bevestigd',
    dear:                 'Beste',
    yourBookingAt:        'Uw boeking bij',
    isConfirmed:          'is bevestigd.',
    room:                 'Kamer',
    checkIn:              'Aankomst',
    checkOut:             'Vertrek',
    from:                 'vanaf',
    by:                   'voor',
    guests:               'Gasten',
    bookingRef:           'Boekingsreferentie',
    address:              'Adres',
    breakfastIncluded:    'Ontbijt inbegrepen',
    depositRequired:      'Aanbetaling vereist',
    questions:            'Vragen? Beantwoord deze e-mail en we helpen u graag.',
    poweredBy:            'Aangedreven door NestBook',
    depositRequestSubject:    'Aanbetalingsverzoek voor uw boeking',
    depositRequestHeading:    'Aanbetalingsverzoek',
    depositRequestBody:       'Om uw boeking te bevestigen, is een aanbetaling vereist.',
    depositPaymentInstr:      'Wij verzoeken u vriendelijk de betaling zo spoedig mogelijk te voldoen. Neem contact met ons op als u vragen heeft.',
    depositConfirmSubject:    'Uw aanbetaling is ontvangen',
    depositConfirmHeading:    'Aanbetaling ontvangen',
    depositConfirmBody:       'We hebben uw aanbetaling ontvangen. Uw boeking is nu volledig bevestigd.',
    depositConfirmDetails:    'Aanbetalingsbedrag',
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

function fmtDepositAmount(amount, currency) {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency ?? 'EUR' })
      .format(Number(amount) || 0);
  } catch {
    return `${Number(amount).toFixed(2)} ${currency ?? ''}`;
  }
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
        ${property.breakfast_included ? row('', `<span style="color:#166534;font-weight:700;">🍳 ${t(locale,'breakfastIncluded')}</span>`) : ''}
        ${property.require_deposit && property.deposit_amount ? row(t(locale,'depositRequired'), `<span style="color:#92400e;font-weight:700;">${fmtDepositAmount(property.deposit_amount, property.currency)}</span>`) : ''}
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

// ── Pro upgrade email HTML ────────────────────────────────────────────────────

function proUpgradeHtml(user, property, periodEnd) {
  const locale = property?.locale ?? 'en';

  const featureItem = (text) => `
    <tr>
      <td style="padding:6px 0;font-size:0.875rem;color:#374151;border-bottom:1px solid #e5e7eb;">
        <span style="color:#1a4710;font-weight:700;margin-right:8px;">✓</span>${text}
      </td>
    </tr>`;

  const widgetCode = `&lt;script src="https://nestbook.io/widget.js" data-property="${property?.id}"&gt;&lt;/script&gt;`;

  let trialHtml = '';
  if (periodEnd) {
    const trialDate = new Date(periodEnd).toLocaleDateString(LOCALE_MAP[locale] ?? 'en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    trialHtml = `
      <p style="margin:0 0 24px;font-size:0.82rem;color:#92400e;background:#fffbeb;
                border:1px solid #fde68a;border-radius:6px;padding:10px 14px;line-height:1.5;">
        ${t(locale, 'proTrialNote')} <strong>${trialDate}</strong>.
      </p>`;
  }

  const body = `
    <h1 style="margin:0 0 8px;font-size:1.4rem;font-weight:700;color:#1a4710;">
      ${t(locale, 'proUpgradeHeading')}
    </h1>
    <p style="margin:0 0 6px;font-size:1rem;color:#374151;">Hi ${user.name},</p>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#374151;">${t(locale, 'proUpgradeIntro')}</p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0faf0;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      ${featureItem(t(locale, 'proFeature1'))}
      ${featureItem(t(locale, 'proFeature2'))}
      ${featureItem(t(locale, 'proFeature3'))}
      ${featureItem(t(locale, 'proFeature4'))}
      ${featureItem(t(locale, 'proFeature5'))}
      ${featureItem(t(locale, 'proFeature6'))}
    </table>

    ${trialHtml}

    <p style="margin:0 0 8px;font-size:0.82rem;font-weight:700;text-transform:uppercase;
              letter-spacing:0.5px;color:#1a4710;">${t(locale, 'proWidgetTitle')}</p>
    <p style="margin:0 0 8px;font-size:0.82rem;color:#6b7280;">${t(locale, 'proWidgetDesc')}</p>
    <div style="background:#1e293b;border-radius:6px;padding:12px 16px;margin-bottom:24px;overflow-x:auto;">
      <code style="color:#86efac;font-family:monospace;font-size:0.78rem;word-break:break-all;">${widgetCode}</code>
    </div>

    <div style="text-align:center;margin-bottom:20px;">
      <a href="https://nestbook.io/app/dashboard"
         style="display:inline-block;background:#1a4710;color:#fff;text-decoration:none;
                padding:13px 28px;border-radius:8px;font-size:0.9rem;font-weight:600;margin-right:8px;">
        ${t(locale, 'upgradeDashboard')} →
      </a>
      <a href="https://nestbook.io/help"
         style="display:inline-block;background:#f0faf0;color:#1a4710;text-decoration:none;
                padding:13px 28px;border-radius:8px;font-size:0.9rem;font-weight:600;">
        ${t(locale, 'proHelpLink')}
      </a>
    </div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;">
    <p style="margin:0;font-size:0.78rem;color:#9ca3af;text-align:center;line-height:1.5;">
      ${t(locale, 'upgradeSupport')}
    </p>`;

  return shell(body);
}

// ── Multi upgrade email HTML ──────────────────────────────────────────────────

function multiUpgradeHtml(user, property) {
  const locale = property?.locale ?? 'en';

  const featureItem = (text) => `
    <tr>
      <td style="padding:6px 0;font-size:0.875rem;color:#374151;border-bottom:1px solid #e5e7eb;">
        <span style="color:#1a4710;font-weight:700;margin-right:8px;">✓</span>${text}
      </td>
    </tr>`;

  const body = `
    <h1 style="margin:0 0 8px;font-size:1.4rem;font-weight:700;color:#1a4710;">
      ${t(locale, 'multiUpgradeHeading')}
    </h1>
    <p style="margin:0 0 6px;font-size:1rem;color:#374151;">Hi ${user.name},</p>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#374151;">${t(locale, 'multiUpgradeIntro')}</p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0faf0;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      ${featureItem(t(locale, 'multiFeature1'))}
      ${featureItem(t(locale, 'multiFeature2'))}
      ${featureItem(t(locale, 'multiFeature3'))}
      ${featureItem(t(locale, 'multiFeature4'))}
      ${featureItem(t(locale, 'multiFeature5'))}
      ${featureItem(t(locale, 'multiFeature6'))}
    </table>

    <div style="background:#f0faf0;border-radius:8px;padding:14px 18px;margin-bottom:24px;
                border-left:3px solid #1a4710;">
      <p style="margin:0 0 6px;font-size:0.83rem;color:#374151;">💡 ${t(locale, 'multiAddPropHint')}</p>
      <p style="margin:0;font-size:0.83rem;color:#374151;">💡 ${t(locale, 'multiChargesHint')}</p>
    </div>

    <div style="text-align:center;margin-bottom:20px;">
      <a href="https://nestbook.io/app/dashboard"
         style="display:inline-block;background:#1a4710;color:#fff;text-decoration:none;
                padding:13px 28px;border-radius:8px;font-size:0.9rem;font-weight:600;margin-right:8px;">
        ${t(locale, 'upgradeDashboard')} →
      </a>
      <a href="https://nestbook.io/help"
         style="display:inline-block;background:#f0faf0;color:#1a4710;text-decoration:none;
                padding:13px 28px;border-radius:8px;font-size:0.9rem;font-weight:600;">
        ${t(locale, 'upgradeHelp')}
      </a>
    </div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;">
    <p style="margin:0;font-size:0.78rem;color:#9ca3af;text-align:center;line-height:1.5;">
      ${t(locale, 'upgradeSupport')}
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
 * Send a deposit request email to the guest.
 */
export async function sendDepositRequest(booking, property) {
  if (!resend) return;
  if (!booking?.guest_email) return;

  const locale  = property?.locale ?? 'en';
  const subject = `${t(locale, 'depositRequestSubject')} — ${property?.name ?? 'NestBook'}`;

  const addressParts = [property?.address, property?.city, property?.country].filter(Boolean).join(', ');
  const row = (label, value) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#6b7280;width:40%;vertical-align:top;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#111827;font-weight:600;vertical-align:top;">${value}</td>
    </tr>`;

  const body = `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#1a4710;">
      ${t(locale, 'depositRequestHeading')}
    </h1>
    <p style="margin:0 0 24px;font-size:0.95rem;color:#374151;">
      ${t(locale, 'dear')} ${booking.guest_first_name},<br>
      ${t(locale, 'depositRequestBody')}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#fffbeb;border-radius:8px;padding:20px 24px;margin-bottom:24px;border:1px solid #fde68a;">
      <tr>
        ${row(t(locale, 'room'),       booking.room_name ?? '—')}
        ${row(t(locale, 'checkIn'),    fmtDate(booking.check_in_date,  locale))}
        ${row(t(locale, 'checkOut'),   fmtDate(booking.check_out_date, locale))}
        ${row(t(locale, 'bookingRef'), `#${booking.id}`)}
        ${property?.deposit_amount ? row(t(locale, 'depositConfirmDetails'), `<span style="color:#92400e;font-weight:700;">${fmtDepositAmount(property.deposit_amount, property.currency)}</span>`) : ''}
        ${addressParts ? row(t(locale, 'address'), addressParts) : ''}
      </tr>
    </table>

    <p style="margin:0 0 24px;font-size:0.875rem;color:#6b7280;line-height:1.6;">
      ${t(locale, 'depositPaymentInstr')}
    </p>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;">
    <p style="margin:0;font-size:0.72rem;color:#9ca3af;text-align:center;">${t(locale, 'poweredBy')}</p>`;

  try {
    await resend.emails.send({ from: FROM, to: booking.guest_email, subject, html: shell(body) });
    console.log(`[email] Deposit request sent → ${booking.guest_email}`);
  } catch (err) {
    console.error('[email] Failed to send deposit request:', err.message);
  }
}

/**
 * Send a deposit confirmation email to the guest.
 */
export async function sendDepositConfirmation(booking, property) {
  if (!resend) return;
  if (!booking?.guest_email) return;

  const locale  = property?.locale ?? 'en';
  const subject = `${t(locale, 'depositConfirmSubject')} — ${property?.name ?? 'NestBook'}`;

  const row = (label, value) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#6b7280;width:40%;vertical-align:top;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#111827;font-weight:600;vertical-align:top;">${value}</td>
    </tr>`;

  const body = `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#1a4710;">
      ${t(locale, 'depositConfirmHeading')} ✓
    </h1>
    <p style="margin:0 0 24px;font-size:0.95rem;color:#374151;">
      ${t(locale, 'dear')} ${booking.guest_first_name},<br>
      ${t(locale, 'depositConfirmBody')}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0faf0;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
      <tr>
        ${row(t(locale, 'room'),       booking.room_name ?? '—')}
        ${row(t(locale, 'checkIn'),    fmtDate(booking.check_in_date,  locale))}
        ${row(t(locale, 'checkOut'),   fmtDate(booking.check_out_date, locale))}
        ${row(t(locale, 'bookingRef'), `#${booking.id}`)}
        ${property?.deposit_amount ? row(t(locale, 'depositConfirmDetails'), `<span style="color:#166534;font-weight:700;">${fmtDepositAmount(property.deposit_amount, property.currency)}</span>`) : ''}
      </tr>
    </table>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;">
    <p style="margin:0;font-size:0.72rem;color:#9ca3af;text-align:center;">${t(locale, 'poweredBy')}</p>`;

  try {
    await resend.emails.send({ from: FROM, to: booking.guest_email, subject, html: shell(body) });
    console.log(`[email] Deposit confirmation sent → ${booking.guest_email}`);
  } catch (err) {
    console.error('[email] Failed to send deposit confirmation:', err.message);
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

/**
 * Send a Pro upgrade welcome email.
 * @param {object} user      — { name, email }
 * @param {object} property  — { id, name, locale, ... }
 * @param {string} periodEnd — ISO date string for the trial/billing period end
 */
export async function sendUpgradeWelcome(user, property, periodEnd) {
  if (!resend) return;
  if (!user?.email) return;
  const locale = property?.locale ?? 'en';
  try {
    await resend.emails.send({
      from:    FROM,
      to:      user.email,
      subject: t(locale, 'proUpgradeSubject'),
      html:    proUpgradeHtml(user, property ?? {}, periodEnd),
    });
    console.log(`[email] Pro upgrade email sent → ${user.email}`);
  } catch (err) {
    console.error('[email] Failed to send Pro upgrade email:', err.message);
  }
}

/**
 * Send a Multi upgrade welcome email.
 * @param {object} user     — { name, email }
 * @param {object} property — { id, name, locale, ... }
 */
export async function sendMultiWelcome(user, property) {
  if (!resend) return;
  if (!user?.email) return;
  const locale = property?.locale ?? 'en';
  try {
    await resend.emails.send({
      from:    FROM,
      to:      user.email,
      subject: t(locale, 'multiUpgradeSubject'),
      html:    multiUpgradeHtml(user, property ?? {}),
    });
    console.log(`[email] Multi upgrade email sent → ${user.email}`);
  } catch (err) {
    console.error('[email] Failed to send Multi upgrade email:', err.message);
  }
}
