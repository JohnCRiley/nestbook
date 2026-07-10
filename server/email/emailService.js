/**
 * NestBook email service — powered by Resend.
 *
 * Gracefully no-ops if RESEND_API_KEY is not set so the app never crashes
 * in environments where email isn't configured.
 */

import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    verifySubject:     'Please verify your email address — NestBook',
    verifyHeading:     'Almost there!',
    verifyBody:        'Thank you for joining NestBook. Please verify your email address by clicking the button below.',
    verifyButton:      'Verify my email address',
    verifyExpiry:      'This link expires in 24 hours.',
    proWelcomeSubject:  'Welcome to NestBook Pro! 🌿',
    proWelcomeHeading:  'You\'re on NestBook Pro!',
    proWelcomeBody:     'Your promotional code has been applied — here\'s everything that\'s now unlocked:',
    onboardSubject:     "Welcome to NestBook! Here's how to get started 🌿",
    onboardHeroTag:     'Welcome aboard 🌿',
    onboardHeading:     "It's great to have you, there!",
    onboardIntro:       "Your NestBook account is ready. You've taken the first step toward taking more direct bookings — and keeping more of what you earn. Let's get your property set up.",
    onboardPlanTitle:   "✦ What's included in your Free plan",
    onboardStepsTitle:  'So, what do you do now?',
    onboardStepsSub:    'Follow these steps and your property page will be live in about 20 minutes.',
    onboardStep1Title:  'Complete your property details',
    onboardStep1Body:   'Click Settings in the left sidebar and fill in your property name, location, property type and a short description. This information appears on your public booking page — so take a moment to make it shine.',
    onboardStep2Title:  'Create your booking page link',
    onboardStep2Body:   'Still in Settings, scroll down to find your property slug — this is the web address for your booking page. Choose something memorable that reflects your property name.',
    onboardStep2Hint:   'For example: my-cotswold-cottage becomes nestbook.io/book/my-cotswold-cottage. Copy that link and paste it into your browser to see exactly what your guests will see!',
    onboardStep3Title:  'Add a cover photo',
    onboardStep3Body:   'Upload a cover photo for your property — this is the first image guests see when they visit your booking page. Use your best exterior shot, garden photo or the image that shows your property at its most beautiful.',
    onboardStep4Title:  'Add your rooms',
    onboardStep4Body:   'Click Rooms in the left sidebar (or Property if you\'re in whole property mode) and add each of your rooms or spaces. Give each one a name, a description and set the nightly rate.',
    onboardStep4Hint:   'On the Free plan you get 1 photo per room. Make it count — choose the photo that best shows the room at its most welcoming. Click on a room to upload its photo.',
    onboardStep5Title:  'Add a Book Now button to your Facebook page',
    onboardStep5Body:   'This is the step most owners love. In Settings, scroll to Facebook Booking Button — you\'ll find a 5-step guide showing exactly how to add a Book Now button to your Facebook business page.',
    onboardStep5Tip:    'Every person who visits your Facebook page can now book directly with you — without going through Booking.com or Airbnb. Zero commission.',
    onboardStep6Title:  'Sync your calendar with Booking.com and Airbnb',
    onboardStep6Body:   'In Settings, find Calendar Sync — copy your iCal URL and add it to your Booking.com and Airbnb accounts. This keeps all your calendars in sync automatically so you never get a double booking.',
    onboardStep7Title:  'Share your booking page link everywhere',
    onboardStep7Body:   'Copy your nestbook.io/book/your-property link and add it to your Instagram bio, your email signature, your WhatsApp status, your TripAdvisor replies — anywhere your guests might find you. Every link is a direct booking opportunity.',
    onboardCTA:         'Go to my NestBook dashboard →',
    onboardPrintBtn:    '💡 Want to keep this as a reference? Most email apps let you print via File → Print or your browser\'s print option.',
    onboardProTitle:    'Thinking about more?',
    onboardProBody:     'When you\'re ready — NestBook Pro is £19/month and unlocks unlimited rooms, 5 photos per room, a direct booking widget for your own website, seasonal pricing, revenue reports and a 30-day free trial. No pressure — your Free plan is yours to keep for as long as you like.',
    onboardProCTA:      'See what Pro includes →',
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
    verifySubject:     'Veuillez vérifier votre adresse e-mail — NestBook',
    verifyHeading:     'Presque terminé !',
    verifyBody:        'Merci de rejoindre NestBook. Veuillez vérifier votre adresse e-mail en cliquant sur le bouton ci-dessous.',
    verifyButton:      'Vérifier mon adresse e-mail',
    verifyExpiry:      'Ce lien expire dans 24 heures.',
    proWelcomeSubject:  'Bienvenue sur NestBook Pro ! 🌿',
    proWelcomeHeading:  'Vous êtes sur NestBook Pro !',
    proWelcomeBody:     'Votre code promotionnel a été appliqué — voici tout ce qui est maintenant disponible :',
    onboardSubject:     'Bienvenue sur NestBook ! Voici comment commencer 🌿',
    onboardHeroTag:     'Bienvenue à bord 🌿',
    onboardHeading:     'Ravi de vous accueillir, there !',
    onboardIntro:       "Votre compte NestBook est prêt. Vous avez fait le premier pas vers plus de réservations directes — et garder davantage de ce que vous gagnez. Configurons votre propriété.",
    onboardPlanTitle:   '✦ Ce qui est inclus dans votre plan Gratuit',
    onboardStepsTitle:  'Alors, que faire maintenant ?',
    onboardStepsSub:    'Suivez ces étapes et votre page de réservation sera en ligne en environ 20 minutes.',
    onboardStep1Title:  'Complétez les détails de votre propriété',
    onboardStep1Body:   "Cliquez sur Paramètres dans la barre latérale et renseignez le nom, l'emplacement, le type de propriété et une courte description. Ces informations apparaissent sur votre page de réservation publique.",
    onboardStep2Title:  'Créez le lien de votre page de réservation',
    onboardStep2Body:   "Toujours dans Paramètres, faites défiler pour trouver votre slug — c'est l'adresse web de votre page de réservation. Choisissez quelque chose de mémorable.",
    onboardStep2Hint:   "Par exemple : mon-gite-en-provence devient nestbook.io/book/mon-gite-en-provence. Copiez ce lien et collez-le dans votre navigateur pour voir exactement ce que verront vos clients !",
    onboardStep3Title:  'Ajoutez une photo de couverture',
    onboardStep3Body:   "Téléchargez une photo de couverture — c'est la première image que voient les clients sur votre page de réservation. Utilisez votre meilleure photo extérieure ou de jardin.",
    onboardStep4Title:  'Ajoutez vos chambres',
    onboardStep4Body:   "Cliquez sur Chambres dans la barre latérale et ajoutez chaque chambre avec un nom, une description et un tarif.",
    onboardStep4Hint:   "En plan Gratuit vous avez 1 photo par chambre. Faites-la compter — cliquez sur une chambre pour télécharger sa photo.",
    onboardStep5Title:  'Ajoutez un bouton Réserver sur votre page Facebook',
    onboardStep5Body:   "Dans Paramètres, trouvez Bouton de réservation Facebook — vous trouverez un guide en 5 étapes vous montrant exactement comment ajouter un bouton Réserver maintenant à votre page Facebook.",
    onboardStep5Tip:    "Chaque personne qui visite votre page Facebook peut maintenant réserver directement avec vous — sans passer par Booking.com ou Airbnb. Zéro commission.",
    onboardStep6Title:  'Synchronisez votre calendrier avec Booking.com et Airbnb',
    onboardStep6Body:   "Dans Paramètres, trouvez Synchronisation calendrier — copiez votre URL iCal et ajoutez-la à vos comptes Booking.com et Airbnb.",
    onboardStep7Title:  'Partagez votre lien de réservation partout',
    onboardStep7Body:   "Copiez votre lien nestbook.io/book/votre-propriété et ajoutez-le à votre bio Instagram, signature e-mail, statut WhatsApp, réponses TripAdvisor — partout où vos clients peuvent vous trouver.",
    onboardCTA:         'Accéder à mon tableau de bord →',
    onboardPrintBtn:    '💡 Vous voulez le conserver ? La plupart des applications e-mail permettent d\'imprimer via Fichier → Imprimer.',
    onboardProTitle:    'Vous voulez aller plus loin ?',
    onboardProBody:     "Quand vous êtes prêt — NestBook Pro est à 19£/mois et débloque des chambres illimitées, 5 photos par chambre, un widget de réservation pour votre site, la tarification saisonnière et des rapports de revenus. Sans pression — votre plan Gratuit est le vôtre pour aussi longtemps que vous le souhaitez.",
    onboardProCTA:      'Voir ce qu\'inclut Pro →',
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
    verifySubject:     'Por favor, verifique su dirección de correo electrónico — NestBook',
    verifyHeading:     '¡Casi listo!',
    verifyBody:        'Gracias por unirse a NestBook. Por favor, verifique su dirección de correo electrónico haciendo clic en el botón de abajo.',
    verifyButton:      'Verificar mi dirección de correo',
    verifyExpiry:      'Este enlace caduca en 24 horas.',
    proWelcomeSubject:  '¡Bienvenido a NestBook Pro! 🌿',
    proWelcomeHeading:  '¡Está en NestBook Pro!',
    proWelcomeBody:     'Su código promocional ha sido aplicado — esto es lo que está ahora disponible:',
    onboardSubject:     '¡Bienvenido a NestBook! Cómo empezar 🌿',
    onboardHeroTag:     'Bienvenido a bordo 🌿',
    onboardHeading:     '¡Nos alegra tenerle con nosotros, there!',
    onboardIntro:       'Su cuenta NestBook está lista. Ha dado el primer paso hacia más reservas directas — y quedarse con más de lo que gana. Vamos a configurar su propiedad.',
    onboardPlanTitle:   '✦ Qué incluye su plan Gratuito',
    onboardStepsTitle:  '¿Y ahora qué?',
    onboardStepsSub:    'Siga estos pasos y su página de reservas estará en línea en unos 20 minutos.',
    onboardStep1Title:  'Complete los detalles de su propiedad',
    onboardStep1Body:   'Haga clic en Configuración en la barra lateral e introduzca el nombre, ubicación, tipo de propiedad y una breve descripción. Esta información aparece en su página de reservas pública.',
    onboardStep2Title:  'Cree el enlace de su página de reservas',
    onboardStep2Body:   'En Configuración, desplácese hacia abajo para encontrar su slug — es la dirección web de su página de reservas. Elija algo memorable que refleje el nombre de su propiedad.',
    onboardStep2Hint:   '¡Por ejemplo: mi-casa-rural se convierte en nestbook.io/book/mi-casa-rural. Copie ese enlace y péguelo en su navegador para ver exactamente lo que verán sus huéspedes!',
    onboardStep3Title:  'Añada una foto de portada',
    onboardStep3Body:   'Suba una foto de portada — es la primera imagen que ven los huéspedes en su página de reservas. Use su mejor foto exterior o de jardín.',
    onboardStep4Title:  'Añada sus habitaciones',
    onboardStep4Body:   'Haga clic en Habitaciones en la barra lateral y añada cada habitación con nombre, descripción y tarifa.',
    onboardStep4Hint:   'En el plan Gratuito tiene 1 foto por habitación. Haga clic en una habitación para subir su foto.',
    onboardStep5Title:  'Añada un botón Reservar ahora a su página de Facebook',
    onboardStep5Body:   'En Configuración, encuentre Botón de reserva de Facebook — encontrará una guía de 5 pasos que muestra exactamente cómo añadir un botón Reservar ahora a su página de Facebook.',
    onboardStep5Tip:    'Cada persona que visita su página de Facebook ahora puede reservar directamente con usted — sin pasar por Booking.com o Airbnb. Cero comisión.',
    onboardStep6Title:  'Sincronice su calendario con Booking.com y Airbnb',
    onboardStep6Body:   'En Configuración, encuentre Sincronización de calendario — copie su URL iCal y añádala a sus cuentas de Booking.com y Airbnb.',
    onboardStep7Title:  'Comparta su enlace de reservas en todas partes',
    onboardStep7Body:   'Copie su enlace nestbook.io/book/su-propiedad y añádalo a su bio de Instagram, firma de correo, estado de WhatsApp, respuestas de TripAdvisor — donde sus huéspedes puedan encontrarle.',
    onboardCTA:         'Ir a mi panel →',
    onboardPrintBtn:    '💡 ¿Quiere conservarlo? La mayoría de aplicaciones de correo permiten imprimir mediante Archivo → Imprimir.',
    onboardProTitle:    '¿Quiere ir más lejos?',
    onboardProBody:     'NestBook Pro es £19/mes y desbloquea habitaciones ilimitadas, 5 fotos por habitación, un widget de reservas para su web, precios de temporada e informes de ingresos. Sin presión — su plan Gratuito es suyo el tiempo que quiera.',
    onboardProCTA:      'Ver qué incluye Pro →',
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
    verifySubject:     'Bitte bestätigen Sie Ihre E-Mail-Adresse — NestBook',
    verifyHeading:     'Fast geschafft!',
    verifyBody:        'Vielen Dank, dass Sie sich bei NestBook angemeldet haben. Bitte bestätigen Sie Ihre E-Mail-Adresse durch Klicken auf den Button unten.',
    verifyButton:      'E-Mail-Adresse bestätigen',
    verifyExpiry:      'Dieser Link läuft in 24 Stunden ab.',
    proWelcomeSubject:  'Willkommen bei NestBook Pro! 🌿',
    proWelcomeHeading:  'Sie nutzen NestBook Pro!',
    proWelcomeBody:     'Ihr Aktionscode wurde angewendet — folgendes ist jetzt freigeschaltet:',
    onboardSubject:     'Willkommen bei NestBook! So fangen Sie an 🌿',
    onboardHeroTag:     'Herzlich willkommen 🌿',
    onboardHeading:     'Schön, dass Sie dabei sind, there!',
    onboardIntro:       'Ihr NestBook-Konto ist bereit. Sie haben den ersten Schritt zu mehr Direktbuchungen gemacht — und behalten mehr von dem, was Sie verdienen. Lassen Sie uns Ihre Unterkunft einrichten.',
    onboardPlanTitle:   '✦ Was in Ihrem Free-Plan enthalten ist',
    onboardStepsTitle:  'Was tun Sie jetzt?',
    onboardStepsSub:    'Folgen Sie diesen Schritten — Ihre Buchungsseite ist in etwa 20 Minuten live.',
    onboardStep1Title:  'Unterkunftsdetails vervollständigen',
    onboardStep1Body:   'Klicken Sie auf Einstellungen in der Seitenleiste und geben Sie Name, Standort, Unterkunftstyp und eine kurze Beschreibung ein. Diese Informationen erscheinen auf Ihrer öffentlichen Buchungsseite.',
    onboardStep2Title:  'Buchungsseiten-Link erstellen',
    onboardStep2Body:   'Scrollen Sie in den Einstellungen nach unten, um Ihren Slug zu finden — das ist die Webadresse Ihrer Buchungsseite. Wählen Sie etwas Einprägsames, das Ihren Unterkunftsnamen widerspiegelt.',
    onboardStep2Hint:   'Zum Beispiel: mein-ferienhaus wird zu nestbook.io/book/mein-ferienhaus. Kopieren Sie diesen Link und fügen Sie ihn in Ihren Browser ein, um genau zu sehen, was Ihre Gäste sehen werden!',
    onboardStep3Title:  'Titelbild hinzufügen',
    onboardStep3Body:   'Laden Sie ein Titelbild hoch — das ist das erste Bild, das Gäste auf Ihrer Buchungsseite sehen. Verwenden Sie Ihr bestes Außen- oder Gartenfoto.',
    onboardStep4Title:  'Zimmer hinzufügen',
    onboardStep4Body:   'Klicken Sie auf Zimmer in der Seitenleiste und fügen Sie jedes Zimmer mit Name, Beschreibung und Preis hinzu.',
    onboardStep4Hint:   'Im Free-Plan erhalten Sie 1 Foto pro Zimmer. Klicken Sie auf ein Zimmer, um sein Foto hochzuladen.',
    onboardStep5Title:  'Jetzt-buchen-Button zu Ihrer Facebook-Seite hinzufügen',
    onboardStep5Body:   'Finden Sie in den Einstellungen Facebook-Buchungsbutton — mit einer 5-Schritte-Anleitung, die genau zeigt, wie Sie einen Jetzt-buchen-Button zu Ihrer Facebook-Seite hinzufügen.',
    onboardStep5Tip:    'Jeder, der Ihre Facebook-Seite besucht, kann jetzt direkt bei Ihnen buchen — ohne Booking.com oder Airbnb. Null Provision.',
    onboardStep6Title:  'Kalender mit Booking.com und Airbnb synchronisieren',
    onboardStep6Body:   'Finden Sie in den Einstellungen Kalender-Sync — kopieren Sie Ihre iCal-URL und fügen Sie sie zu Ihren Booking.com- und Airbnb-Konten hinzu.',
    onboardStep7Title:  'Buchungsseiten-Link überall teilen',
    onboardStep7Body:   'Kopieren Sie Ihren nestbook.io/book/ihre-unterkunft Link und fügen Sie ihn zu Ihrer Instagram-Bio, E-Mail-Signatur, WhatsApp-Status und TripAdvisor-Antworten hinzu.',
    onboardCTA:         'Zum Dashboard →',
    onboardPrintBtn:    '💡 Behalten möchten? Die meisten E-Mail-Apps ermöglichen das Drucken über Datei → Drucken.',
    onboardProTitle:    'Möchten Sie mehr?',
    onboardProBody:     'NestBook Pro ist für 19£/Monat verfügbar und schaltet unbegrenzte Zimmer, 5 Fotos pro Zimmer, ein Buchungs-Widget für Ihre Website, saisonale Preisgestaltung und Umsatzberichte frei. Kein Druck — Ihr Free-Plan gehört Ihnen, so lange Sie möchten.',
    onboardProCTA:      'Sehen, was Pro beinhaltet →',
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
    verifySubject:     'Bevestig uw e-mailadres — NestBook',
    verifyHeading:     'Bijna klaar!',
    verifyBody:        'Bedankt voor uw aanmelding bij NestBook. Bevestig uw e-mailadres door op de knop hieronder te klikken.',
    verifyButton:      'Mijn e-mailadres bevestigen',
    verifyExpiry:      'Deze link verloopt over 24 uur.',
    proWelcomeSubject:  'Welkom bij NestBook Pro! 🌿',
    proWelcomeHeading:  'U gebruikt NestBook Pro!',
    proWelcomeBody:     'Uw actiecode is toegepast — dit is nu beschikbaar:',
    onboardSubject:     'Welkom bij NestBook! Zo begint u 🌿',
    onboardHeroTag:     'Welkom aan boord 🌿',
    onboardHeading:     'Fijn dat u erbij bent, there!',
    onboardIntro:       'Uw NestBook-account is klaar. U heeft de eerste stap gezet naar meer directe boekingen — en meer houden van wat u verdient. Laten we uw accommodatie instellen.',
    onboardPlanTitle:   '✦ Wat inbegrepen is in uw Gratis plan',
    onboardStepsTitle:  'Wat doet u nu?',
    onboardStepsSub:    'Volg deze stappen en uw boekingspagina staat in ongeveer 20 minuten live.',
    onboardStep1Title:  'Vul uw accommodatiegegevens in',
    onboardStep1Body:   'Klik op Instellingen in de zijbalk en vul naam, locatie, type accommodatie en een korte beschrijving in. Deze informatie verschijnt op uw openbare boekingspagina.',
    onboardStep2Title:  'Maak uw boekingspaginalink aan',
    onboardStep2Body:   'Scroll in Instellingen omlaag om uw slug te vinden — dit is het webadres van uw boekingspagina. Kies iets memorabels dat de naam van uw accommodatie weerspiegelt.',
    onboardStep2Hint:   'Bijvoorbeeld: mijn-vakantiewoning wordt nestbook.io/book/mijn-vakantiewoning. Kopieer die link en plak hem in uw browser om precies te zien wat uw gasten zien!',
    onboardStep3Title:  'Voeg een omslagfoto toe',
    onboardStep3Body:   'Upload een omslagfoto — dit is de eerste afbeelding die gasten zien op uw boekingspagina. Gebruik uw beste buitenfoto of tuinfoto.',
    onboardStep4Title:  'Voeg uw kamers toe',
    onboardStep4Body:   'Klik op Kamers in de zijbalk en voeg elke kamer toe met naam, beschrijving en nachtprijs.',
    onboardStep4Hint:   'In het Gratis plan krijgt u 1 foto per kamer. Klik op een kamer om zijn foto te uploaden.',
    onboardStep5Title:  'Voeg een Nu boeken-knop toe aan uw Facebook-pagina',
    onboardStep5Body:   'Vind in Instellingen Facebook-boekingsknop — u vindt een stapsgewijze handleiding die precies laat zien hoe u een Nu boeken-knop aan uw Facebook-pagina toevoegt.',
    onboardStep5Tip:    'Iedereen die uw Facebook-pagina bezoekt kan nu rechtstreeks bij u boeken — zonder Booking.com of Airbnb. Nul commissie.',
    onboardStep6Title:  'Synchroniseer uw kalender met Booking.com en Airbnb',
    onboardStep6Body:   'Vind in Instellingen Kalendersynchronisatie — kopieer uw iCal-URL en voeg deze toe aan uw Booking.com- en Airbnb-accounts.',
    onboardStep7Title:  'Deel uw boekingspaginalink overal',
    onboardStep7Body:   'Kopieer uw nestbook.io/book/uw-accommodatie link en voeg hem toe aan uw Instagram-bio, e-mailhandtekening, WhatsApp-status en TripAdvisor-reacties.',
    onboardCTA:         'Naar mijn dashboard →',
    onboardPrintBtn:    '💡 Bewaren? De meeste e-mailapps laten u afdrukken via Bestand → Afdrukken.',
    onboardProTitle:    'Wilt u meer?',
    onboardProBody:     "NestBook Pro is £19/maand en ontgrendelt onbeperkte kamers, 5 foto's per kamer, een boekingswidget voor uw website, seizoensprijzen en omzetrapporten. Geen druk — uw Gratis plan is van u zolang u wilt.",
    onboardProCTA:      'Zie wat Pro inhoudt →',
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
          <table cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle;margin-right:10px;">
            <tr>
              <td style="background:#1a4710;border-radius:9px;width:40px;height:40px;text-align:center;">
                <img src="https://nestbook.io/icon-192.png" width="40" height="40"
                     style="display:block;border-radius:9px;" alt="NestBook">
              </td>
            </tr>
          </table>
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
  const isWP   = property?.rental_type === 'whole_property';

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
        ${!isWP ? row(t(locale, 'room'), booking.room_name ?? '—') : ''}
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
  const lang = user.language || 'en';

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
      ${t(lang, 'welcomeHeading')}
    </h1>
    <p style="margin:0 0 6px;font-size:1rem;color:#374151;">
      Hi ${user.name},
    </p>
    <p style="margin:0 0 28px;font-size:0.95rem;color:#374151;">
      <strong>${property.name || ''}</strong>${property.name ? ' is live on NestBook. ' : ''}${t(lang, 'welcomeIntro')}
    </p>

    <p style="margin:0 0 12px;font-size:0.82rem;font-weight:700;text-transform:uppercase;
              letter-spacing:0.5px;color:#1a4710;">${lang === 'en' ? 'Get started in 3 steps' : ''}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      ${step(1, t(lang, 'step1Title'), t(lang, 'step1Desc'))}
      ${step(2, t(lang, 'step2Title'), t(lang, 'step2Desc'))}
      ${step(3, t(lang, 'step3Title'), t(lang, 'step3Desc'))}
    </table>

    <div style="text-align:center;margin-bottom:28px;">
      <a href="https://nestbook.io/app/login"
         style="display:inline-block;background:#1a4710;color:#fff;text-decoration:none;
                padding:13px 32px;border-radius:8px;font-size:0.9rem;font-weight:600;">
        ${t(lang, 'goToDashboard')} →
      </a>
    </div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;">
    <p style="margin:0;font-size:0.78rem;color:#9ca3af;text-align:center;line-height:1.5;">
      ${t(lang, 'welcomeFooter')}
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
  const isWP    = property?.rental_type === 'whole_property';
  const subject = isWP
    ? `${t(locale, 'bookingConfirmed')} — ${property?.name ?? 'NestBook'}`
    : `${t(locale, 'bookingConfirmed')} — ${booking.room_name ?? ''} · ${property?.name ?? 'NestBook'}`;

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
  const isWP    = property?.rental_type === 'whole_property';
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
        ${!isWP ? row(t(locale, 'room'), booking.room_name ?? '—') : ''}
        ${row(t(locale, 'checkIn'),    fmtDate(booking.check_in_date,  locale))}
        ${row(t(locale, 'checkOut'),   fmtDate(booking.check_out_date, locale))}
        ${row(t(locale, 'bookingRef'), `#${booking.id}`)}
        ${(booking.deposit_amount ?? property?.deposit_amount) ? row(t(locale, 'depositConfirmDetails'), `<span style="color:#92400e;font-weight:700;">${fmtDepositAmount(booking.deposit_amount ?? property.deposit_amount, property.currency)}</span>`) : ''}
        ${booking.balance_amount > 0 ? row('Balance due', `<span style="color:#374151;">${fmtDepositAmount(booking.balance_amount, property.currency)}</span>`) : ''}
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
  const isWP    = property?.rental_type === 'whole_property';
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
        ${!isWP ? row(t(locale, 'room'), booking.room_name ?? '—') : ''}
        ${row(t(locale, 'checkIn'),    fmtDate(booking.check_in_date,  locale))}
        ${row(t(locale, 'checkOut'),   fmtDate(booking.check_out_date, locale))}
        ${row(t(locale, 'bookingRef'), `#${booking.id}`)}
        ${(booking.deposit_amount ?? property?.deposit_amount) ? row(t(locale, 'depositConfirmDetails'), `<span style="color:#166534;font-weight:700;">${fmtDepositAmount(booking.deposit_amount ?? property.deposit_amount, property.currency)}</span>`) : ''}
        ${booking.balance_amount > 0 ? row('Balance remaining', `<span style="color:#374151;">${fmtDepositAmount(booking.balance_amount, property.currency)}</span>`) : ''}
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
 * Send a balance due reminder to the guest.
 */
export async function sendBalanceDueEmail(booking, property) {
  if (!resend) return;
  if (!booking?.guest_email) return;

  const locale  = property?.locale ?? 'en';
  const subject = `Balance due reminder — ${property?.name ?? 'NestBook'}`;

  const row = (label, value) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#6b7280;width:40%;vertical-align:top;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#111827;font-weight:600;vertical-align:top;">${value}</td>
    </tr>`;

  const body = `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#1a4710;">
      Balance due reminder
    </h1>
    <p style="margin:0 0 24px;font-size:0.95rem;color:#374151;">
      ${t(locale, 'dear')} ${booking.guest_first_name},<br>
      This is a friendly reminder that the balance payment for your stay at <strong>${property?.name}</strong> is now due.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#fffbeb;border-radius:8px;padding:20px 24px;margin-bottom:24px;border:1px solid #fde68a;">
      <tr>
        ${row(t(locale, 'checkIn'),    fmtDate(booking.check_in_date,  locale))}
        ${row(t(locale, 'checkOut'),   fmtDate(booking.check_out_date, locale))}
        ${row(t(locale, 'bookingRef'), `#${booking.id}`)}
        ${booking.balance_amount > 0 ? row('Balance due', `<span style="color:#92400e;font-weight:700;">${fmtDepositAmount(booking.balance_amount, property.currency)}</span>`) : ''}
      </tr>
    </table>

    <p style="margin:0 0 24px;font-size:0.875rem;color:#6b7280;line-height:1.6;">
      Please arrange payment at your earliest convenience. Contact us if you have any questions.
    </p>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;">
    <p style="margin:0;font-size:0.72rem;color:#9ca3af;text-align:center;">${t(locale, 'poweredBy')}</p>`;

  try {
    await resend.emails.send({ from: FROM, to: booking.guest_email, subject, html: shell(body) });
    console.log(`[email] Balance due reminder sent → ${booking.guest_email}`);
  } catch (err) {
    console.error('[email] Failed to send balance due email:', err.message);
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

  const lang = user.language || 'en';
  const link = `https://nestbook.io/app/verify-email?token=${token}`;

  const html = shell(`
    <h1 style="margin:0 0 8px;font-size:1.4rem;font-weight:700;color:#1a4710;">
      ${t(lang, 'verifyHeading')}
    </h1>
    <p style="margin:0 0 6px;font-size:1rem;color:#374151;">
      Hi ${user.name},
    </p>
    <p style="margin:0 0 28px;font-size:0.95rem;color:#374151;line-height:1.6;">
      ${t(lang, 'verifyBody')}
    </p>

    <div style="text-align:center;margin-bottom:28px;">
      <a href="${link}"
         style="display:inline-block;background:#1a4710;color:#fff;text-decoration:none;
                padding:13px 32px;border-radius:8px;font-size:0.9rem;font-weight:600;">
        ${t(lang, 'verifyButton')}
      </a>
    </div>

    <p style="margin:0 0 16px;font-size:0.82rem;color:#6b7280;line-height:1.6;">
      ${t(lang, 'verifyExpiry')}<br>
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
      subject: t(lang, 'verifySubject'),
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

  const lang = user.language || 'en';
  try {
    await resend.emails.send({
      from:    FROM,
      to:      user.email,
      subject: t(lang, 'welcomeSubject'),
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
  console.log('[email] sendUpgradeWelcome called — user:', user?.email, '| property id:', property?.id, '| resend ready:', !!resend);
  if (!resend) { console.warn('[email] Skipping — resend not initialised'); return; }
  if (!user?.email) { console.warn('[email] Skipping — no user email'); return; }
  const locale = property?.locale ?? 'en';
  let html;
  try {
    html = proUpgradeHtml(user, property ?? {}, periodEnd);
  } catch (buildErr) {
    console.error('[email] proUpgradeHtml threw:', buildErr);
    return;
  }
  try {
    console.log('[email] Calling resend.emails.send for Pro upgrade →', user.email);
    const result = await resend.emails.send({
      from:    FROM,
      to:      user.email,
      subject: t(locale, 'proUpgradeSubject'),
      html,
    });
    console.log('[email] Pro upgrade email sent →', user.email, '| id:', result?.id ?? result?.data?.id);
  } catch (err) {
    console.error('[email] Failed to send Pro upgrade email:', err?.message ?? err, '| full:', JSON.stringify(err));
  }
}

/**
 * Send a Multi upgrade welcome email.
 * @param {object} user     — { name, email }
 * @param {object} property — { id, name, locale, ... }
 */
export async function sendMultiWelcome(user, property) {
  console.log('[email] sendMultiWelcome called — user:', user?.email, '| property id:', property?.id, '| resend ready:', !!resend);
  if (!resend) { console.warn('[email] Skipping — resend not initialised'); return; }
  if (!user?.email) { console.warn('[email] Skipping — no user email'); return; }
  const locale = property?.locale ?? 'en';
  let html;
  try {
    html = multiUpgradeHtml(user, property ?? {});
  } catch (buildErr) {
    console.error('[email] multiUpgradeHtml threw:', buildErr);
    return;
  }
  try {
    console.log('[email] Calling resend.emails.send for Multi upgrade →', user.email);
    const result = await resend.emails.send({
      from:    FROM,
      to:      user.email,
      subject: t(locale, 'multiUpgradeSubject'),
      html,
    });
    console.log('[email] Multi upgrade email sent →', user.email, '| id:', result?.id ?? result?.data?.id);
  } catch (err) {
    console.error('[email] Failed to send Multi upgrade email:', err?.message ?? err, '| full:', JSON.stringify(err));
  }
}

// ── Password reset ────────────────────────────────────────────────────────────
export async function sendPasswordResetEmail(email, token) {
  if (!resend) {
    console.log('[email] SKIPPED password reset email to', email, '(no Resend key)');
    return;
  }
  const resetUrl = `https://nestbook.io/app/reset-password?token=${token}`;
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Reset your NestBook password',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#1a4710;padding:24px;border-radius:8px 8px 0 0;">
          <img src="https://nestbook.io/icon-192.png" style="width:36px;height:36px;border-radius:8px;vertical-align:middle;" alt="">
          <span style="color:#fff;font-size:20px;font-weight:700;margin-left:12px;vertical-align:middle;">NestBook</span>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
          <h2 style="color:#1a4710;margin:0 0 12px;">Reset your password</h2>
          <p style="color:#374151;margin:0 0 20px;">We received a request to reset your NestBook password. Click the button below to choose a new one.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#1a4710;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;margin-bottom:20px;">Reset my password</a>
          <p style="color:#64748b;font-size:0.85rem;margin:0;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
        </div>
      </div>
    `,
  });
  console.log('[email] Password reset sent →', email);
}

// ── Payment failure / dunning emails ─────────────────────────────────────────

export async function sendPaymentFailedEmail(email, invoiceUrl) {
  if (!resend) {
    console.log('[email] SKIPPED payment-failed email to', email, '(no Resend key)');
    return;
  }
  await resend.emails.send({
    from: FROM,
    to:   email,
    subject: 'Action required — your NestBook payment failed',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a2e14">
        <div style="margin-bottom:24px">
          <span style="background:#1a4710;color:#fff;padding:6px 14px;border-radius:6px;font-weight:700;font-size:1rem">NestBook</span>
        </div>
        <h2 style="font-size:1.4rem;font-weight:800;margin:0 0 12px">We couldn't process your payment</h2>
        <p style="color:#374151;line-height:1.6;margin:0 0 16px">Your recent NestBook subscription payment was unsuccessful.</p>
        <p style="color:#374151;line-height:1.6;margin:0 0 24px">To keep your Pro access, please update your payment details:</p>
        ${invoiceUrl ? `<a href="${invoiceUrl}" style="display:inline-block;background:#1a4710;color:#fff;padding:12px 24px;border-radius:7px;text-decoration:none;font-weight:700;margin-bottom:24px">Update payment details →</a>` : ''}
        <p style="color:#374151;line-height:1.6;margin:0 0 16px">If your payment isn't resolved within 7 days, your account will be moved to the Free plan. Your data will be kept safe.</p>
        <p style="color:#6b7280;font-size:0.875rem">Questions? Reply to this email or contact <a href="mailto:hello@nestbook.io" style="color:#1a4710">hello@nestbook.io</a></p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
        <p style="color:#9ca3af;font-size:0.78rem;margin:0">NestBook — Property Management Software</p>
      </div>
    `,
  });
  console.log('[email] Payment-failed email sent →', email);
}

export async function sendDowngradeEmail(email) {
  if (!resend) {
    console.log('[email] SKIPPED downgrade email to', email, '(no Resend key)');
    return;
  }
  await resend.emails.send({
    from: FROM,
    to:   email,
    subject: 'Your NestBook account has been moved to the Free plan',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a2e14">
        <div style="margin-bottom:24px">
          <span style="background:#1a4710;color:#fff;padding:6px 14px;border-radius:6px;font-weight:700;font-size:1rem">NestBook</span>
        </div>
        <h2 style="font-size:1.4rem;font-weight:800;margin:0 0 12px">Your account has been moved to the Free plan</h2>
        <p style="color:#374151;line-height:1.6;margin:0 0 16px">Because we were unable to process your payment, your NestBook account has been moved to the Free plan.</p>
        <p style="color:#374151;line-height:1.6;margin:0 0 16px">Your data is safe — all your bookings, guests and rooms are still there.</p>
        <p style="color:#374151;line-height:1.6;margin:0 0 24px">To restore Pro access, simply update your payment details and resubscribe:</p>
        <a href="https://nestbook.io/app/pricing" style="display:inline-block;background:#1a4710;color:#fff;padding:12px 24px;border-radius:7px;text-decoration:none;font-weight:700;margin-bottom:24px">Resubscribe to Pro →</a>
        <p style="color:#6b7280;font-size:0.875rem">Questions? We're here at <a href="mailto:hello@nestbook.io" style="color:#1a4710">hello@nestbook.io</a></p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
        <p style="color:#9ca3af;font-size:0.78rem;margin:0">NestBook — Property Management Software</p>
      </div>
    `,
  });
  console.log('[email] Downgrade email sent →', email);
}

// ── Bug report alert ─────────────────────────────────────────────────────────
export async function sendBugReportAlert({ userName, userEmail, plan, category, description }) {
  if (!resend) return;
  try {
    await resend.emails.send({
      from:    FROM,
      to:      'hello@nestbook.io',
      subject: `🐛 New error report — ${category} from ${userEmail}`,
      html: `
        <h2 style="margin:0 0 16px">New error report received</h2>
        <p><strong>From:</strong> ${userName} (${userEmail})</p>
        <p><strong>Plan:</strong> ${plan}</p>
        <p><strong>Category:</strong> ${category}</p>
        <p><strong>Description:</strong></p>
        <blockquote style="border-left:3px solid #e2e8f0;margin:8px 0;padding:8px 16px;color:#475569">
          ${description.replace(/\n/g, '<br>')}
        </blockquote>
        <p><a href="https://nestbook.io/app/super-admin/error-reports">View in Super Admin →</a></p>
      `,
    });
    console.log(`[email] Bug report alert sent for ${userEmail}`);
  } catch (err) {
    console.error('[email] Failed to send bug report alert:', err.message);
  }
}

// ── WP booking approval request (to property owner) ─────────────────────────
export async function sendApprovalRequestEmail(booking, property, approveUrl, declineUrl) {
  if (!resend) return;
  const ownerEmail = property?.owner_email;
  if (!ownerEmail) return;

  const guestName  = `${booking.guest_first_name} ${booking.guest_last_name}`;
  const subject    = `New booking request — ${guestName} · ${property?.name ?? 'NestBook'}`;

  const body = `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#1a4710;">New Booking Request</h1>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#374151;">
      A guest has submitted a booking request for <strong>${property?.name ?? ''}</strong>.
      Please review the details below and approve or decline.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0faf0;border-radius:8px;padding:20px 24px;margin-bottom:24px;border:1px solid #d9f0cc;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#6b7280;width:40%;vertical-align:top;">Guest</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#111827;font-weight:600;">${guestName}</td>
      </tr>
      ${booking.room_name ? `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#6b7280;vertical-align:top;">Room</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#111827;font-weight:600;">${booking.room_name}</td>
      </tr>` : ''}
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#6b7280;vertical-align:top;">Email</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#111827;font-weight:600;">${booking.guest_email ?? '—'}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#6b7280;vertical-align:top;">Phone</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#111827;font-weight:600;">${booking.guest_phone ?? '—'}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#6b7280;vertical-align:top;">Check-in</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#111827;font-weight:600;">${booking.check_in_date}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#6b7280;vertical-align:top;">Check-out</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#111827;font-weight:600;">${booking.check_out_date}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#6b7280;vertical-align:top;">Guests</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#111827;font-weight:600;">${booking.num_guests ?? 1}</td>
      </tr>
      ${booking.notes ? `<tr><td style="padding:10px 0;font-size:0.82rem;color:#6b7280;vertical-align:top;">Notes</td><td style="padding:10px 0;font-size:0.875rem;color:#111827;">${booking.notes}</td></tr>` : ''}
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding-right:8px;">
          <a href="${approveUrl}" style="display:block;text-align:center;padding:14px 0;background:#1a4710;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:1rem;">
            ✓ Approve Booking
          </a>
        </td>
        <td style="padding-left:8px;">
          <a href="${declineUrl}" style="display:block;text-align:center;padding:14px 0;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:1rem;">
            ✕ Decline Booking
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:0.82rem;color:#6b7280;line-height:1.6;">
      You can also manage this booking from your <a href="https://nestbook.io/app" style="color:#1a4710;">NestBook dashboard</a>.
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
    <p style="margin:0;font-size:0.72rem;color:#9ca3af;text-align:center;">Powered by NestBook</p>`;

  try {
    await resend.emails.send({ from: FROM, to: ownerEmail, subject, html: shell(body) });
    console.log(`[email] Approval request sent → ${ownerEmail}`);
  } catch (err) {
    console.error('[email] Failed to send approval request:', err.message);
  }
}

// ── WP booking approved (to guest) ───────────────────────────────────────────
export async function sendBookingApprovedEmail(booking, property) {
  if (!resend) return;
  if (!booking?.guest_email) return;

  const subject = `Booking confirmed — ${property?.name ?? 'NestBook'}`;
  const nights  = Math.round((new Date(booking.check_out_date) - new Date(booking.check_in_date)) / 86400000);

  const body = `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#1a4710;">Your booking is confirmed!</h1>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#374151;">
      Great news, ${booking.guest_first_name}! Your booking at <strong>${property?.name ?? ''}</strong> has been approved.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0faf0;border-radius:8px;padding:20px 24px;margin-bottom:24px;border:1px solid #d9f0cc;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#6b7280;width:40%;vertical-align:top;">Property</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#111827;font-weight:600;">${property?.name ?? '—'}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#6b7280;vertical-align:top;">Check-in</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#111827;font-weight:600;">${booking.check_in_date}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#6b7280;vertical-align:top;">Check-out</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#111827;font-weight:600;">${booking.check_out_date}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#6b7280;vertical-align:top;">Duration</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#111827;font-weight:600;">${nights} night${nights !== 1 ? 's' : ''}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#6b7280;vertical-align:top;">Guests</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#111827;font-weight:600;">${booking.num_guests ?? 1}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;font-size:0.82rem;color:#6b7280;vertical-align:top;">Booking ref</td>
        <td style="padding:10px 0;font-size:0.875rem;color:#111827;font-weight:600;">#${booking.id}</td>
      </tr>
    </table>
    <p style="margin:0 0 24px;font-size:0.875rem;color:#374151;line-height:1.6;">
      Questions? Reply to this email and we'll get back to you.
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;">
    <p style="margin:0;font-size:0.72rem;color:#9ca3af;text-align:center;">Powered by NestBook</p>`;

  try {
    await resend.emails.send({ from: FROM, to: booking.guest_email, subject, html: shell(body) });
    console.log(`[email] Booking approved email sent → ${booking.guest_email}`);
  } catch (err) {
    console.error('[email] Failed to send booking approved email:', err.message);
  }
}

// ── WP booking declined (to guest) ───────────────────────────────────────────
export async function sendBookingDeclinedEmail(booking, property) {
  if (!resend) return;
  if (!booking?.guest_email) return;

  const subject = `Booking request update — ${property?.name ?? 'NestBook'}`;

  const body = `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#111827;">Booking request update</h1>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#374151;">
      Dear ${booking.guest_first_name}, unfortunately your booking request at <strong>${property?.name ?? ''}</strong>
      for ${booking.check_in_date} – ${booking.check_out_date} could not be accommodated at this time.
    </p>
    <p style="margin:0 0 24px;font-size:0.875rem;color:#374151;line-height:1.6;">
      We're sorry for any inconvenience. If you'd like to try alternative dates, please visit our booking page or contact us directly.
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;">
    <p style="margin:0;font-size:0.72rem;color:#9ca3af;text-align:center;">Powered by NestBook</p>`;

  try {
    await resend.emails.send({ from: FROM, to: booking.guest_email, subject, html: shell(body) });
    console.log(`[email] Booking declined email sent → ${booking.guest_email}`);
  } catch (err) {
    console.error('[email] Failed to send booking declined email:', err.message);
  }
}

// ── WP access code / arrival instructions (to guest before check-in) ─────────
export async function sendAccessEmail(booking, property) {
  if (!resend) return;
  if (!booking?.guest_email) return;
  if (!property?.arrival_instructions && !property?.access_code) return;

  const ACCESS_METHOD_LABELS = {
    code:   'Keypad / door code',
    keybox: 'Key lockbox',
    keyed:  'Physical key',
    app:    'Smart lock app',
    other:  'Access details',
  };
  const methodLabel = ACCESS_METHOD_LABELS[property.access_method] ?? 'Access details';
  const guestName   = `${booking.guest_first_name} ${booking.guest_last_name}`;
  const subject     = `Your access details for ${property.name} — ${booking.check_in_date}`;

  const accessBlock = property.access_code ? `
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0faf0;border-radius:8px;padding:20px 24px;margin-bottom:24px;border:1px solid #d9f0cc;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#6b7280;width:40%;">${methodLabel}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:1.1rem;color:#1a4710;font-weight:800;letter-spacing:2px;">${property.access_code}</td>
      </tr>
      ${property.check_in_time ? `<tr><td style="padding:10px 0;font-size:0.82rem;color:#6b7280;">Check-in from</td><td style="padding:10px 0;font-size:0.875rem;color:#111827;font-weight:600;">${property.check_in_time}</td></tr>` : ''}
    </table>` : '';

  const instructionsBlock = property.arrival_instructions ? `
    <div style="background:#fffbf0;border:1px solid #fcd34d;border-radius:8px;padding:18px 20px;margin-bottom:24px;">
      <div style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#b45309;margin-bottom:8px;">Arrival Instructions</div>
      <div style="font-size:0.9rem;color:#374151;line-height:1.7;white-space:pre-line;">${property.arrival_instructions}</div>
    </div>` : '';

  const appBase = (process.env.APP_URL ?? 'https://nestbook.io').replace(/\/$/, '');
  const photoPath = property.access_photo
    ? path.join(__dirname, '../uploads/access', property.access_photo)
    : null;
  const photoBlock = photoPath && fs.existsSync(photoPath) ? `
    <div style="margin-bottom:24px;">
      <div style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#374151;margin-bottom:10px;">📍 Key location photo</div>
      <img src="${appBase}/uploads/access/${property.access_photo}"
           alt="Key location"
           style="width:100%;max-width:500px;border-radius:8px;border:1px solid #e2e8f0;display:block;" />
      <p style="font-size:0.75rem;color:#9ca3af;margin:6px 0 0;">Photo of the key location provided by ${property.name}</p>
    </div>` : '';

  const body = `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#1a4710;">Your access details are ready</h1>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#374151;">
      Hi ${guestName}, your stay at <strong>${property.name}</strong> starts on <strong>${booking.check_in_date}</strong>.
      Here is everything you need to access the property.
    </p>
    ${accessBlock}
    ${instructionsBlock}
    ${photoBlock}
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#6b7280;width:40%;">Check-in date</td>
        <td style="padding:6px 0;font-size:0.875rem;color:#111827;font-weight:600;">${booking.check_in_date}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#6b7280;">Check-out date</td>
        <td style="padding:6px 0;font-size:0.875rem;color:#111827;font-weight:600;">${booking.check_out_date}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#6b7280;">Guests</td>
        <td style="padding:6px 0;font-size:0.875rem;color:#111827;font-weight:600;">${booking.num_guests ?? 1}</td>
      </tr>
    </table>
    <p style="margin:0 0 24px;font-size:0.875rem;color:#374151;line-height:1.6;">
      If you have any questions, please reply to this email to contact the owner directly.
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;">
    <p style="margin:0;font-size:0.72rem;color:#9ca3af;text-align:center;">Powered by NestBook</p>`;

  try {
    await resend.emails.send({ from: FROM, to: booking.guest_email, subject, html: shell(body) });
    console.log(`[email] Access details sent → ${booking.guest_email} (booking ${booking.id})`);
  } catch (err) {
    console.error('[email] Failed to send access email:', err.message);
  }
}

// ── WP charges summary email — sent automatically on guest departure ──────────
// Sent when guests depart if outstanding charges exist. Prompts the guest
// to settle the balance before a receipt is issued.
export async function sendChargesSummaryEmail(booking, property, charges, ownerEmail) {
  if (!resend) return;
  if (!booking?.guest_email) return;

  const outstanding = charges.filter((c) => !c.voided_at);
  if (outstanding.length === 0) return;

  const currency     = property?.currency ?? 'GBP';
  const chargesTotal = outstanding.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const bookingTotal = parseFloat(booking.total_price) || 0;
  const grandTotal   = bookingTotal + chargesTotal;
  const guestName    = `${booking.guest_first_name} ${booking.guest_last_name}`;

  const chargeRows = outstanding.map((c) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#6b7280;">
        ${c.category_name ?? '—'}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#374151;">
        ${c.description ?? '—'}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:0.875rem;
                 color:#111827;font-weight:600;text-align:right;">
        ${fmtDepositAmount(c.amount, currency)}
      </td>
    </tr>`).join('');

  const body = `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#1a4710;">
      Thank you for staying at ${property.name}
    </h1>
    <p style="margin:0 0 24px;font-size:0.875rem;color:#374151;line-height:1.6;">
      Dear ${guestName}, we hope you had a wonderful stay.
      Here is a summary of your booking and any additional charges incurred during your visit.
    </p>

    <!-- Booking summary -->
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0faf0;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#6b7280;width:140px;">Property</td>
        <td style="padding:6px 0;font-size:0.875rem;font-weight:600;color:#111827;">${property.name}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#6b7280;">Check-in</td>
        <td style="padding:6px 0;font-size:0.875rem;color:#374151;">${fmtDate(booking.check_in_date, 'en')}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#6b7280;">Check-out</td>
        <td style="padding:6px 0;font-size:0.875rem;color:#374151;">${fmtDate(booking.check_out_date, 'en')}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#6b7280;">Booking total</td>
        <td style="padding:6px 0;font-size:0.875rem;font-weight:600;color:#111827;">
          ${fmtDepositAmount(bookingTotal, currency)}
        </td>
      </tr>
    </table>

    <!-- Additional charges -->
    <h3 style="margin:0 0 12px;font-size:0.95rem;font-weight:700;color:#1a2e14;">Additional charges</h3>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      <thead>
        <tr style="background:#f0faf0;">
          <th style="padding:10px 12px;font-size:0.72rem;font-weight:700;text-transform:uppercase;
                     letter-spacing:0.05em;color:#1a4710;text-align:left;">Category</th>
          <th style="padding:10px 12px;font-size:0.72rem;font-weight:700;text-transform:uppercase;
                     letter-spacing:0.05em;color:#1a4710;text-align:left;">Description</th>
          <th style="padding:10px 12px;font-size:0.72rem;font-weight:700;text-transform:uppercase;
                     letter-spacing:0.05em;color:#1a4710;text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>${chargeRows}</tbody>
      <tfoot>
        <tr style="background:#f0faf0;">
          <td colspan="2" style="padding:10px 12px;font-weight:700;font-size:0.875rem;color:#1a2e14;">
            Charges total
          </td>
          <td style="padding:10px 12px;font-weight:700;font-size:0.875rem;
                     color:#1a4710;text-align:right;">
            ${fmtDepositAmount(chargesTotal, currency)}
          </td>
        </tr>
      </tfoot>
    </table>

    <!-- Grand total -->
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#1a4710;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <tr>
        <td style="color:white;font-weight:700;font-size:1rem;">Grand total</td>
        <td style="color:white;font-weight:800;font-size:1.25rem;text-align:right;">
          ${fmtDepositAmount(grandTotal, currency)}
        </td>
      </tr>
    </table>

    <!-- Payment request -->
    <div style="background:#fffbf0;border-left:4px solid #f59e0b;padding:14px 18px;
                border-radius:0 8px 8px 0;margin-bottom:24px;">
      <p style="margin:0;font-size:0.875rem;color:#78350f;line-height:1.6;">
        <strong>Payment request:</strong> Please arrange payment of
        <strong>${fmtDepositAmount(grandTotal, currency)}</strong>
        directly with ${property.name}. If you have any questions about these charges,
        please reply to this email.
      </p>
    </div>

    <p style="margin:0 0 24px;font-size:0.82rem;color:#9ca3af;line-height:1.6;">
      Once payment is confirmed you will receive a full receipt by email.
      Thank you for choosing ${property.name} — we hope to welcome you back soon.
    </p>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;">
    <p style="margin:0;font-size:0.72rem;color:#9ca3af;text-align:center;">Powered by NestBook</p>`;

  try {
    await resend.emails.send({
      from:    FROM,
      to:      booking.guest_email,
      replyTo: ownerEmail || undefined,
      subject: `Your stay at ${property.name} — charges summary`,
      html:    shell(body),
    });
    console.log(`[charges-email] Sent → ${booking.guest_email} (booking ${booking.id})`);
  } catch (err) {
    console.error('[charges-email] Failed:', err.message);
  }
}

// ── WP receipt email — sent when owner marks booking as paid ─────────────────
export async function sendReceiptEmail(booking, property, charges, ownerEmail) {
  if (!resend) return;
  if (!booking?.guest_email) return;

  const currency     = property?.currency ?? 'GBP';
  const outstanding  = charges.filter((c) => !c.voided_at);
  const chargesTotal = outstanding.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const bookingTotal = parseFloat(booking.total_price) || 0;
  const grandTotal   = bookingTotal + chargesTotal;
  const receiptRef   = `NB-${booking.id}-${new Date().getFullYear()}`;
  const nights       = Math.round(
    (new Date(booking.check_out_date) - new Date(booking.check_in_date)) / 86400000
  );

  const PM_RECEIPT_LABELS = {
    cash:          'Cash',
    card:          'Card (in person)',
    bank_transfer: 'Bank transfer',
    other:         'Other',
  };
  const pmLabel = PM_RECEIPT_LABELS[booking.payment_method]
    ?? (booking.stripe_payment_status === 'paid' ? 'Online payment' : null);

  const chargeRows = outstanding.length > 0
    ? outstanding.map((c) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;
                     font-size:0.82rem;color:#6b7280;">${c.category_name ?? '—'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;
                     font-size:0.82rem;color:#374151;">${c.description ?? '—'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;
                     font-size:0.875rem;color:#111827;font-weight:600;text-align:right;">
            ${fmtDepositAmount(c.amount, currency)}
          </td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding:12px;font-size:0.82rem;color:#9ca3af;
               text-align:center;">No additional charges</td></tr>`;

  const body = `
    <!-- Receipt header -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td>
          <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#1a4710;">
            Payment receipt
          </h1>
          <p style="margin:0;font-size:0.78rem;color:#9ca3af;">Ref: ${receiptRef}</p>
        </td>
        <td style="text-align:right;vertical-align:top;">
          <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;
                      letter-spacing:0.05em;color:#9ca3af;margin-bottom:3px;">Date paid</div>
          <div style="font-size:0.875rem;font-weight:600;color:#111827;">
            ${fmtDate(new Date().toISOString().slice(0, 10), 'en')}
          </div>
        </td>
      </tr>
    </table>

    <!-- Paid badge -->
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0faf0;border:1.5px solid #d1fae5;border-radius:8px;
                  padding:12px 16px;margin-bottom:24px;">
      <tr>
        <td style="color:#1a4710;font-size:1.1rem;width:28px;">✓</td>
        <td>
          <div style="font-weight:700;color:#166534;font-size:0.875rem;">Payment confirmed</div>
          <div style="font-size:0.78rem;color:#166534;margin-top:2px;">
            Thank you — your payment has been received
          </div>
        </td>
      </tr>
    </table>

    <!-- Stay details -->
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#6b7280;width:140px;">Property</td>
        <td style="padding:6px 0;font-size:0.875rem;font-weight:600;color:#111827;">${property.name}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#6b7280;">Guest</td>
        <td style="padding:6px 0;font-size:0.875rem;color:#374151;">
          ${booking.guest_first_name} ${booking.guest_last_name}
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#6b7280;">Check-in</td>
        <td style="padding:6px 0;font-size:0.875rem;color:#374151;">
          ${fmtDate(booking.check_in_date, 'en')}
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#6b7280;">Check-out</td>
        <td style="padding:6px 0;font-size:0.875rem;color:#374151;">
          ${fmtDate(booking.check_out_date, 'en')}
        </td>
      </tr>
      ${pmLabel ? `<tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#6b7280;">Payment method</td>
        <td style="padding:6px 0;font-size:0.875rem;color:#374151;">${pmLabel}</td>
      </tr>` : ''}
    </table>

    <!-- Itemised breakdown -->
    <h3 style="margin:0 0 12px;font-size:0.95rem;font-weight:700;color:#1a2e14;">
      Itemised breakdown
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <thead>
        <tr style="background:#f0faf0;">
          <th style="padding:10px 12px;font-size:0.72rem;font-weight:700;text-transform:uppercase;
                     letter-spacing:0.05em;color:#1a4710;text-align:left;">Category</th>
          <th style="padding:10px 12px;font-size:0.72rem;font-weight:700;text-transform:uppercase;
                     letter-spacing:0.05em;color:#1a4710;text-align:left;">Description</th>
          <th style="padding:10px 12px;font-size:0.72rem;font-weight:700;text-transform:uppercase;
                     letter-spacing:0.05em;color:#1a4710;text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        <!-- Accommodation row -->
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;
                     font-size:0.82rem;color:#6b7280;">Accommodation</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;
                     font-size:0.82rem;color:#374151;">${nights} night${nights !== 1 ? 's' : ''}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;
                     font-size:0.875rem;color:#111827;font-weight:600;text-align:right;">
            ${fmtDepositAmount(bookingTotal, currency)}
          </td>
        </tr>
        ${chargeRows}
      </tbody>
      <tfoot>
        <tr style="background:#1a4710;">
          <td colspan="2" style="padding:14px 12px;font-weight:700;
                                  font-size:0.95rem;color:white;">Total paid</td>
          <td style="padding:14px 12px;font-weight:800;font-size:1.1rem;
                     color:white;text-align:right;">
            ${fmtDepositAmount(grandTotal, currency)}
          </td>
        </tr>
      </tfoot>
    </table>

    <p style="margin:0 0 24px;font-size:0.78rem;color:#9ca3af;text-align:center;line-height:1.6;">
      This receipt was issued by ${property.name} via NestBook.<br>
      Ref: ${receiptRef} · Issued: ${fmtDate(new Date().toISOString().slice(0, 10), 'en')}
    </p>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;">
    <p style="margin:0;font-size:0.72rem;color:#9ca3af;text-align:center;">Powered by NestBook</p>`;

  try {
    await resend.emails.send({
      from:    FROM,
      to:      booking.guest_email,
      replyTo: ownerEmail || undefined,
      subject: `Receipt — ${property.name} · ${fmtDate(booking.check_in_date, 'en')}`,
      html:    shell(body),
    });
    console.log(`[receipt-email] Sent → ${booking.guest_email} (booking ${booking.id})`);
  } catch (err) {
    console.error('[receipt-email] Failed:', err.message);
  }
}

// ── Free-plan welcome email (sent on email verification) ─────────────────────

function welcomeEmailHTML(user) {
  const lang      = user.language || 'en';
  const firstName = user.name?.split(' ')[0] || 'there';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t(lang, 'onboardSubject')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: #f8fbf6; color: #1a2e14; line-height: 1.6; }
    .wrapper { max-width: 620px; margin: 0 auto; background: white; }
    .header { background: #1a4710; padding: 28px 32px; text-align: left; }
    .header-logo { font-size: 22px; font-weight: 700; color: white; letter-spacing: -0.02em; }
    .header-logo span { color: #d9f0cc; font-weight: 400; }
    .hero { background: #f0fdf4; border-bottom: 3px solid #d9f0cc; padding: 36px 32px 28px; }
    .hero-tag { display: inline-block; background: #d9f0cc; color: #1a4710; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 3px 10px; border-radius: 20px; margin-bottom: 14px; }
    .hero h1 { font-size: 26px; font-weight: 700; color: #1a2e14; margin-bottom: 10px; line-height: 1.25; }
    .hero p { font-size: 15px; color: #475569; max-width: 480px; line-height: 1.7; }
    .body { padding: 32px 32px 0; }
    .plan-box { background: #f0fdf4; border: 1.5px solid #d9f0cc; border-radius: 10px; padding: 20px 24px; margin-bottom: 28px; }
    .plan-box-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #1a4710; margin-bottom: 14px; }
    .plan-feature { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; font-size: 14px; color: #475569; }
    .plan-feature-tick { color: #1a4710; font-weight: 700; font-size: 14px; flex-shrink: 0; margin-top: 1px; }
    .plan-feature strong { color: #1a2e14; }
    .steps-title { font-size: 18px; font-weight: 700; color: #1a2e14; margin-bottom: 6px; }
    .steps-sub { font-size: 14px; color: #64748b; margin-bottom: 24px; }
    .step { display: flex; gap: 16px; margin-bottom: 20px; align-items: flex-start; }
    .step-num { width: 30px; height: 30px; background: #1a4710; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
    .step-title { font-size: 15px; font-weight: 700; color: #1a2e14; margin-bottom: 4px; }
    .step-desc { font-size: 14px; color: #475569; line-height: 1.65; }
    .step-hint { display: inline-block; background: #fef3c7; border-left: 3px solid #f59e0b; padding: 6px 10px; margin-top: 8px; font-size: 13px; color: #78350f; border-radius: 0 4px 4px 0; line-height: 1.5; }
    .step-tip { display: inline-block; background: #f0fdf4; border-left: 3px solid #1a4710; padding: 6px 10px; margin-top: 8px; font-size: 13px; color: #1a4710; border-radius: 0 4px 4px 0; line-height: 1.5; }
    .divider { height: 1px; background: #e2e8f0; margin: 28px 0; }
    .cta-wrap { text-align: center; padding: 28px 32px; }
    .cta-btn { display: inline-block; background: #1a4710; color: white !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
    .cta-sub { font-size: 12px; color: #94a3b8; margin-top: 10px; }

    .upgrade-box { background: #1a4710; margin: 0 32px 32px; border-radius: 10px; padding: 20px 24px; }
    .upgrade-box-title { font-size: 15px; font-weight: 700; color: white; margin-bottom: 6px; }
    .upgrade-box-body { font-size: 13px; color: #d9f0cc; margin-bottom: 14px; line-height: 1.6; }
    .upgrade-link { display: inline-block; background: white; color: #1a4710 !important; text-decoration: none; padding: 8px 18px; border-radius: 6px; font-size: 13px; font-weight: 700; }
    .footer { background: #f8fbf6; border-top: 1px solid #e2e8f0; padding: 24px 32px; text-align: center; }
    .footer p { font-size: 12px; color: #94a3b8; line-height: 1.7; }
    .footer a { color: #1a4710; text-decoration: none; }
    @media print {
      body { background: white; }
      .header { background: #1a4710 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .print-wrap, .cta-wrap, .footer { display: none; }
      .upgrade-box { background: #1a4710 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    @media (max-width: 480px) {
      .body { padding: 24px 20px 0; }
      .hero { padding: 24px 20px; }
      .hero h1 { font-size: 22px; }
      .upgrade-box { margin: 0 20px 24px; }
      .print-wrap { padding: 0 20px 16px; }
      .footer { padding: 20px; }
    }
  </style>
</head>
<body>
<div class="wrapper">

  <div class="header">
    <div class="header-logo">NestBook <span>— direct bookings for independent properties</span></div>
  </div>

  <div class="hero">
    <div class="hero-tag">${t(lang, 'onboardHeroTag')}</div>
    <h1>${t(lang, 'onboardHeading').replace('there', firstName)}</h1>
    <p>${t(lang, 'onboardIntro')}</p>
  </div>

  <div class="body">

    <div class="plan-box">
      <div class="plan-box-title">${t(lang, 'onboardPlanTitle')}</div>
      <div class="plan-feature"><span class="plan-feature-tick">✓</span><span><strong>Up to 3 rooms</strong> — add your rooms or spaces and manage availability</span></div>
      <div class="plan-feature"><span class="plan-feature-tick">✓</span><span><strong>Your own property webpage</strong> — a beautiful booking page at nestbook.io/book/your-property</span></div>
      <div class="plan-feature"><span class="plan-feature-tick">✓</span><span><strong>1 photo per room</strong> — shown on your booking page for guests to see</span></div>
      <div class="plan-feature"><span class="plan-feature-tick">✓</span><span><strong>Guest enquiry form</strong> — guests on your page can send you a direct enquiry</span></div>
      <div class="plan-feature"><span class="plan-feature-tick">✓</span><span><strong>Facebook Booking Button</strong> — link your Facebook page directly to your NestBook page</span></div>
      <div class="plan-feature"><span class="plan-feature-tick">✓</span><span><strong>iCal sync</strong> — keep your calendar synced with Booking.com and Airbnb</span></div>
      <div class="plan-feature"><span class="plan-feature-tick">✓</span><span><strong>5 languages</strong> — your dashboard works in English, French, German, Spanish and Dutch</span></div>
      <div class="plan-feature"><span class="plan-feature-tick">✓</span><span><strong>7 colour themes</strong> — make NestBook feel like yours</span></div>
    </div>

    <p class="steps-title">${t(lang, 'onboardStepsTitle')}</p>
    <p class="steps-sub">${t(lang, 'onboardStepsSub')}</p>

    <div class="step">
      <div class="step-num">1</div>
      <div>
        <div class="step-title">${t(lang, 'onboardStep1Title')}</div>
        <div class="step-desc">${t(lang, 'onboardStep1Body')}</div>
      </div>
    </div>

    <div class="step">
      <div class="step-num">2</div>
      <div>
        <div class="step-title">${t(lang, 'onboardStep2Title')}</div>
        <div class="step-desc">${t(lang, 'onboardStep2Body')}</div>
        <div class="step-hint">💡 ${t(lang, 'onboardStep2Hint')}</div>
      </div>
    </div>

    <div class="step">
      <div class="step-num">3</div>
      <div>
        <div class="step-title">${t(lang, 'onboardStep3Title')}</div>
        <div class="step-desc">${t(lang, 'onboardStep3Body')}</div>
      </div>
    </div>

    <div class="step">
      <div class="step-num">4</div>
      <div>
        <div class="step-title">${t(lang, 'onboardStep4Title')}</div>
        <div class="step-desc">${t(lang, 'onboardStep4Body')}</div>
        <div class="step-hint">📸 ${t(lang, 'onboardStep4Hint')}</div>
      </div>
    </div>

    <div class="step">
      <div class="step-num">5</div>
      <div>
        <div class="step-title">${t(lang, 'onboardStep5Title')}</div>
        <div class="step-desc">${t(lang, 'onboardStep5Body')}</div>
        <div class="step-tip">✓ ${t(lang, 'onboardStep5Tip')}</div>
      </div>
    </div>

    <div class="step">
      <div class="step-num">6</div>
      <div>
        <div class="step-title">${t(lang, 'onboardStep6Title')}</div>
        <div class="step-desc">${t(lang, 'onboardStep6Body')}</div>
      </div>
    </div>

    <div class="step">
      <div class="step-num">7</div>
      <div>
        <div class="step-title">${t(lang, 'onboardStep7Title')}</div>
        <div class="step-desc">${t(lang, 'onboardStep7Body')}</div>
      </div>
    </div>

    <div class="divider"></div>

  </div>

  <div class="cta-wrap">
    <a href="https://nestbook.io/app" class="cta-btn">${t(lang, 'onboardCTA')}</a>
    <p class="cta-sub">nestbook.io/app</p>
  </div>

  <p style="text-align:center;font-size:12px;color:#94a3b8;margin:0 0 20px;line-height:1.6;">
    ${t(lang, 'onboardPrintBtn')}
  </p>

  <div class="upgrade-box">
    <div class="upgrade-box-title">${t(lang, 'onboardProTitle')}</div>
    <div class="upgrade-box-body">${t(lang, 'onboardProBody')}</div>
    <a href="https://nestbook.io/app/settings/billing" class="upgrade-link">${t(lang, 'onboardProCTA')}</a>
  </div>

  <div class="footer">
    <p>
      You're receiving this because you signed up to NestBook.<br>
      <a href="https://nestbook.io">nestbook.io</a> &nbsp;·&nbsp;
      <a href="mailto:hello@nestbook.io">hello@nestbook.io</a> &nbsp;·&nbsp;
      NestBook.IO Ltd, 1 Hoburne Lane, Christchurch, Dorset BH23 4HP<br><br>
      <a href="https://nestbook.io/app/settings">Manage your account</a> &nbsp;·&nbsp;
      <a href="https://nestbook.io/help">Help centre</a>
    </p>
  </div>

</div>
</body>
</html>`;
}

/**
 * Send a rich onboarding welcome email to a newly-verified Free plan user.
 * @param {object} user — { name, email }
 */
export async function sendFreeWelcomeEmail(user) {
  if (!resend) return;
  if (!user?.email) return;
  const lang = user.language || 'en';
  try {
    await resend.emails.send({
      from:    'NestBook <hello@nestbook.io>',
      to:      user.email,
      subject: t(lang, 'onboardSubject'),
      html:    welcomeEmailHTML(user),
    });
    console.log(`[email] Free welcome email sent → ${user.email}`);
  } catch (err) {
    console.error('[email] Failed to send free welcome email:', err.message);
  }
}

// ── Outreach / prospect email ─────────────────────────────────────────────────
/**
 * Notify owner that a guest's arrival wasn't confirmed — auto-advanced to in_house.
 */
export async function sendMissedArrivalReminder(booking) {
  if (!resend) return;
  if (!booking?.owner_email) return;

  const subject = `Did ${booking.guest_first_name} arrive? — ${booking.property_name}`;
  const body = `
    <h1 style="margin:0 0 4px;font-size:1.3rem;font-weight:700;color:#1a4710;">
      Action may be needed
    </h1>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#374151;">
      <strong>${booking.guest_first_name} ${booking.guest_last_name}</strong> was due to check in
      on <strong>${fmtDate(booking.check_in_date, 'en')}</strong> at ${booking.property_name}.
    </p>

    <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px 18px;
                border-radius:0 8px 8px 0;margin-bottom:20px;">
      <p style="margin:0;font-size:0.875rem;color:#78350f;line-height:1.6;">
        We've automatically marked this booking as in progress, but please log in to
        confirm the arrival — or mark it as a no-show if they didn't turn up.
      </p>
    </div>

    <a href="https://nestbook.io/app/bookings"
       style="display:inline-block;background:#1a4710;color:white;padding:12px 24px;
              border-radius:8px;text-decoration:none;font-weight:700;font-size:0.875rem;">
      View booking →
    </a>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;">
    <p style="margin:0;font-size:0.72rem;color:#9ca3af;text-align:center;">NestBook · Powered by nestbook.io</p>`;

  try {
    await resend.emails.send({ from: FROM, to: booking.owner_email, subject, html: shell(body) });
  } catch (err) {
    console.error('[email] Failed to send missed arrival reminder:', err.message);
  }
}

/**
 * Remind owner that check-out is today and the booking is still in_house.
 */
export async function sendMissedDepartureReminder(booking) {
  if (!resend) return;
  if (!booking?.owner_email) return;

  const subject = `Have your guests departed? — ${booking.property_name}`;
  const body = `
    <h1 style="margin:0 0 4px;font-size:1.3rem;font-weight:700;color:#1a4710;">
      Departure day
    </h1>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#374151;">
      <strong>${booking.guest_first_name} ${booking.guest_last_name}</strong> is due to check out
      today (<strong>${fmtDate(booking.check_out_date, 'en')}</strong>) from ${booking.property_name}.
    </p>

    <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px 18px;
                border-radius:0 8px 8px 0;margin-bottom:20px;">
      <p style="margin:0;font-size:0.875rem;color:#78350f;line-height:1.6;">
        Please confirm in NestBook when your guests have departed and returned the key —
        this triggers the cleaning status and updates your calendar.
      </p>
    </div>

    <a href="https://nestbook.io/app/bookings"
       style="display:inline-block;background:#1a4710;color:white;padding:12px 24px;
              border-radius:8px;text-decoration:none;font-weight:700;font-size:0.875rem;">
      Confirm departure →
    </a>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;">
    <p style="margin:0;font-size:0.72rem;color:#9ca3af;text-align:center;">NestBook · Powered by nestbook.io</p>`;

  try {
    await resend.emails.send({ from: FROM, to: booking.owner_email, subject, html: shell(body) });
  } catch (err) {
    console.error('[email] Failed to send missed departure reminder:', err.message);
  }
}

// ── Stay extended email ───────────────────────────────────────────────────────
export async function sendStayExtendedEmail(booking, property, newCheckOut, newTotal, ownerEmail) {
  if (!resend) {
    console.log('[email] SKIPPED stay-extended email to', booking.guest_email);
    return;
  }
  const extraNights = Math.ceil(
    (new Date(newCheckOut) - new Date(booking.check_out_date)) / (1000 * 60 * 60 * 24)
  );
  const currency = property.currency || 'GBP';

  const body = `
    <h2 style="color:#1a4710;font-size:20px;margin:0 0 8px;">Great news — your stay has been extended!</h2>
    <p style="color:#475569;font-size:14px;margin:0 0 24px;line-height:1.6;">
      Your booking at <strong>${property.name}</strong> has been updated with new dates.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:8px 0;color:#64748b;font-size:14px;width:160px;">Property</td>
        <td style="padding:8px 0;font-weight:600;font-size:14px;">${property.name}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#64748b;font-size:14px;">Check-in</td>
        <td style="padding:8px 0;font-size:14px;">${fmtDate(booking.check_in_date, 'en')} <span style="color:#94a3b8;">(unchanged)</span></td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#64748b;font-size:14px;">Previous check-out</td>
        <td style="padding:8px 0;font-size:14px;color:#94a3b8;text-decoration:line-through;">${fmtDate(booking.check_out_date, 'en')}</td>
      </tr>
      <tr style="background:#f0fdf4;">
        <td style="padding:10px 12px;color:#1a4710;font-size:14px;font-weight:700;">New check-out</td>
        <td style="padding:10px 12px;font-weight:700;font-size:14px;color:#1a4710;">
          ${fmtDate(newCheckOut, 'en')}
          <span style="background:#d9f0cc;color:#1a4710;font-size:11px;padding:2px 7px;border-radius:4px;margin-left:6px;">
            +${extraNights} night${extraNights !== 1 ? 's' : ''}
          </span>
        </td>
      </tr>
      <tr style="border-top:2px solid #e2e8f0;">
        <td style="padding:12px 0;color:#64748b;font-size:14px;font-weight:700;">New total</td>
        <td style="padding:12px 0;font-weight:800;font-size:18px;color:#1a4710;">${fmtDepositAmount(newTotal, currency)}</td>
      </tr>
    </table>
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:0 8px 8px 0;">
      <p style="color:#78350f;font-size:14px;margin:0;line-height:1.6;">
        <strong>Payment note:</strong> Please arrange the additional payment for the extended nights
        directly with ${property.name}. Reply to this email if you have any questions.
      </p>
    </div>`;

  try {
    await resend.emails.send({
      from: FROM,
      to: booking.guest_email,
      replyTo: ownerEmail || undefined,
      subject: `Stay extended — ${property.name} · now until ${fmtDate(newCheckOut, 'en')}`,
      html: shell(body),
    });
    console.log(`[stay-extended] Email sent to ${booking.guest_email}`);
  } catch (err) {
    console.error('[stay-extended] Email failed:', err.message);
  }
}

// ── Stay shortened email ──────────────────────────────────────────────────────
export async function sendStayShortenedEmail(booking, property, newCheckOut, newTotal, ownerEmail) {
  if (!resend) {
    console.log('[email] SKIPPED stay-shortened email to', booking.guest_email);
    return;
  }
  const nightsRemoved = Math.ceil(
    (new Date(booking.check_out_date) - new Date(newCheckOut)) / (1000 * 60 * 60 * 24)
  );
  const currency = property.currency || 'GBP';

  const body = `
    <h2 style="color:#1a2e14;font-size:20px;margin:0 0 8px;">Your booking has been updated</h2>
    <p style="color:#475569;font-size:14px;margin:0 0 24px;line-height:1.6;">
      Your stay at <strong>${property.name}</strong> has been shortened.
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:8px 0;color:#64748b;font-size:14px;width:160px;">Property</td>
        <td style="padding:8px 0;font-weight:600;font-size:14px;">${property.name}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#64748b;font-size:14px;">Check-in</td>
        <td style="padding:8px 0;font-size:14px;">${fmtDate(booking.check_in_date, 'en')} <span style="color:#94a3b8;">(unchanged)</span></td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#64748b;font-size:14px;">Previous check-out</td>
        <td style="padding:8px 0;font-size:14px;color:#94a3b8;text-decoration:line-through;">${fmtDate(booking.check_out_date, 'en')}</td>
      </tr>
      <tr style="background:#fef2f2;">
        <td style="padding:10px 12px;color:#dc2626;font-size:14px;font-weight:700;">New check-out</td>
        <td style="padding:10px 12px;font-weight:700;font-size:14px;color:#dc2626;">
          ${fmtDate(newCheckOut, 'en')}
          <span style="background:#fca5a5;color:#dc2626;font-size:11px;padding:2px 7px;border-radius:4px;margin-left:6px;">
            −${nightsRemoved} night${nightsRemoved !== 1 ? 's' : ''}
          </span>
        </td>
      </tr>
      <tr style="border-top:2px solid #e2e8f0;">
        <td style="padding:12px 0;color:#64748b;font-size:14px;font-weight:700;">Updated total</td>
        <td style="padding:12px 0;font-weight:800;font-size:18px;color:#1a2e14;">${fmtDepositAmount(newTotal, currency)}</td>
      </tr>
    </table>
    <p style="color:#475569;font-size:14px;line-height:1.6;">
      If you have any questions about your updated booking, please reply to this email to contact
      the property directly.
    </p>`;

  try {
    await resend.emails.send({
      from: FROM,
      to: booking.guest_email,
      replyTo: ownerEmail || undefined,
      subject: `Booking updated — ${property.name} · check-out now ${fmtDate(newCheckOut, 'en')}`,
      html: shell(body),
    });
    console.log(`[stay-shortened] Email sent to ${booking.guest_email}`);
  } catch (err) {
    console.error('[stay-shortened] Email failed:', err.message);
  }
}

/**
 * Send a Pro upgrade confirmation to a user who registered with a 100% discount code.
 * @param {object} user         — { name, email }
 * @param {object} discountCode — { code, duration_months }
 * @param {Date}   trialEnd     — when the promotional Pro access expires
 */
export async function sendProWelcomeEmail(user, discountCode, trialEnd) {
  if (!resend) return;
  if (!user?.email) return;
  const lang = user.language || 'en';
  const firstName = user.name?.split(' ')[0] || 'there';
  const hasDuration = trialEnd != null;
  const expiryStr = hasDuration
    ? trialEnd.toLocaleDateString(LOCALE_MAP[lang] ?? 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const featureItem = (title, desc) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
        <span style="color:#1a4710;font-weight:700;margin-right:8px;">✓</span>
        <strong style="font-size:0.875rem;color:#1a2e14;">${title}</strong>
        <div style="font-size:0.8rem;color:#64748b;margin-top:2px;padding-left:20px;">${desc}</div>
      </td>
    </tr>`;

  const BILLING_NOTE = {
    en: hasDuration
      ? `Your promotional access ends on ${expiryStr}. Add payment details in Settings → Billing before that date to continue on Pro, or your account will return to the free plan.`
      : `Your Pro access is yours to keep — no expiry date. Enjoy NestBook Pro and we hope it helps you grow your direct bookings!`,
    fr: hasDuration
      ? `Votre accès promotionnel se termine le ${expiryStr}. Ajoutez vos coordonnées de paiement dans Paramètres → Facturation avant cette date pour continuer sur Pro, ou votre compte reviendra au plan gratuit.`
      : `Votre accès Pro est permanent — sans date d'expiration. Profitez de NestBook Pro et nous espérons que cela vous aidera à obtenir plus de réservations directes !`,
    de: hasDuration
      ? `Ihr Aktionszugang endet am ${expiryStr}. Fügen Sie vor diesem Datum Ihre Zahlungsdaten in Einstellungen → Abrechnung hinzu, um Pro fortzusetzen, oder Ihr Konto kehrt zum kostenlosen Plan zurück.`
      : `Ihr Pro-Zugang ist dauerhaft — kein Ablaufdatum. Genießen Sie NestBook Pro und wir hoffen, es hilft Ihnen, mehr Direktbuchungen zu erhalten!`,
    es: hasDuration
      ? `Su acceso promocional termina el ${expiryStr}. Añada sus datos de pago en Configuración → Facturación antes de esa fecha para continuar en Pro, o su cuenta volverá al plan gratuito.`
      : `Su acceso Pro es permanente — sin fecha de caducidad. ¡Disfrute de NestBook Pro y esperamos que le ayude a conseguir más reservas directas!`,
    nl: hasDuration
      ? `Uw promotionele toegang eindigt op ${expiryStr}. Voeg vóór die datum uw betalingsgegevens toe in Instellingen → Facturering om Pro te blijven gebruiken, of uw account keert terug naar het gratis plan.`
      : `Uw Pro-toegang is permanent — geen vervaldatum. Geniet van NestBook Pro en we hopen dat het u helpt meer directe boekingen te krijgen!`,
  };

  const billingSection = hasDuration ? `
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;
                padding:14px 18px;border-radius:0 8px 8px 0;margin:0 0 24px;">
      <p style="color:#78350f;font-size:0.875rem;margin:0;line-height:1.6;">
        ${BILLING_NOTE[lang] ?? BILLING_NOTE.en}
      </p>
    </div>` : `
    <div style="background:#f0fdf4;border-left:4px solid #1a4710;
                padding:14px 18px;border-radius:0 8px 8px 0;margin:0 0 24px;">
      <p style="color:#166534;font-size:0.875rem;margin:0;line-height:1.6;">
        ${BILLING_NOTE[lang] ?? BILLING_NOTE.en}
      </p>
    </div>`;

  const FEATURES = {
    en: ['Unlimited rooms', '5 photos per room', 'Booking widget for your website', 'Seasonal pricing', 'Revenue reports', 'iCal sync'],
    fr: ['Chambres illimitées', '5 photos par chambre', 'Widget de réservation pour votre site', 'Tarification saisonnière', 'Rapports de revenus', 'Sync iCal'],
    de: ['Unbegrenzte Zimmer', '5 Fotos pro Zimmer', 'Buchungs-Widget für Ihre Website', 'Saisonale Preisgestaltung', 'Umsatzberichte', 'iCal-Sync'],
    es: ['Habitaciones ilimitadas', '5 fotos por habitación', 'Widget de reservas para su web', 'Precios de temporada', 'Informes de ingresos', 'Sincronización iCal'],
    nl: ['Onbeperkte kamers', '5 foto\'s per kamer', 'Boekingswidget voor uw website', 'Seizoensprijzen', 'Omzetrapporten', 'iCal-sync'],
  };
  const features = FEATURES[lang] ?? FEATURES.en;

  const CTА_LABEL = { en: 'Go to my dashboard →', fr: 'Accéder à mon tableau de bord →', de: 'Zum Dashboard →', es: 'Ir a mi panel →', nl: 'Naar mijn dashboard →' };

  const body = `
    <h1 style="margin:0 0 8px;font-size:1.4rem;font-weight:700;color:#1a4710;">
      ${t(lang, 'proWelcomeHeading')}
    </h1>
    <p style="margin:0 0 6px;font-size:1rem;color:#374151;">Hi ${firstName},</p>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#374151;line-height:1.6;">
      ${t(lang, 'proWelcomeBody')}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0fdf4;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      ${features.map(f => featureItem(f, '')).join('')}
    </table>

    ${billingSection}

    <a href="https://nestbook.io/app"
       style="display:inline-block;background:#1a4710;color:white;text-decoration:none;
              padding:13px 28px;border-radius:8px;font-size:0.9rem;font-weight:600;">
      ${CTА_LABEL[lang] ?? CTА_LABEL.en}
    </a>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;">
    <p style="margin:0;font-size:0.78rem;color:#9ca3af;text-align:center;line-height:1.5;">
      Questions? Email us at hello@nestbook.io — we're here to help.
    </p>`;

  try {
    await resend.emails.send({
      from:    'NestBook <hello@nestbook.io>',
      to:      user.email,
      subject: t(lang, 'proWelcomeSubject'),
      html:    shell(body),
    });
    console.log(`[email] Pro welcome email sent → ${user.email}`);
  } catch (err) {
    console.error('[email] Failed to send Pro welcome email:', err.message);
  }
}

export async function sendPromoExpiryReminderEmail(user, daysLeft) {
  if (!resend) return;
  if (!user?.email) return;
  const firstName = user.name?.split(' ')[0] || 'there';
  const expiryDate = new Date(user.trial_ends_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const isUrgent = daysLeft <= 7;

  const body = `
    <h1 style="margin:0 0 8px;font-size:1.4rem;font-weight:700;color:#1a4710;">
      ${isUrgent ? 'Action needed — Pro access expiring soon' : 'Your NestBook Pro promotional period is ending'}
    </h1>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#374151;line-height:1.6;">Hi ${firstName},</p>

    <div style="background:${isUrgent ? '#fef2f2' : '#fef3c7'};
                border:1.5px solid ${isUrgent ? '#fca5a5' : '#f59e0b'};
                border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <div style="font-weight:700;color:${isUrgent ? '#7f1d1d' : '#92400e'};font-size:1rem;margin-bottom:4px;">
        ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining
      </div>
      <div style="font-size:0.875rem;color:${isUrgent ? '#7f1d1d' : '#78350f'};">
        Your NestBook Pro promotional access ends on ${expiryDate}
      </div>
    </div>

    <p style="color:#374151;font-size:0.875rem;line-height:1.6;margin-bottom:20px;">
      Just a reminder that your promotional Pro access ends on <strong>${expiryDate}</strong>.
      ${isUrgent
        ? ' Please add your payment details today to avoid any interruption to your service.'
        : ' Add your payment details before that date to continue uninterrupted.'}
    </p>

    <p style="color:#374151;font-size:0.875rem;line-height:1.6;margin-bottom:24px;">
      Your card will <strong>not be charged</strong> until ${expiryDate}.
      Cancel anytime before ${expiryDate} to stay on the free plan — no questions asked.
    </p>

    <a href="https://nestbook.io/app/settings"
       style="display:inline-block;background:${isUrgent ? '#dc2626' : '#1a4710'};color:white;
              text-decoration:none;padding:13px 28px;border-radius:8px;font-size:0.9rem;font-weight:600;">
      Add payment details →
    </a>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;">
    <p style="margin:0;font-size:0.78rem;color:#9ca3af;text-align:center;line-height:1.5;">
      Questions? Email us at hello@nestbook.io — we're here to help.
    </p>`;

  try {
    await resend.emails.send({
      from:    'NestBook <hello@nestbook.io>',
      to:      user.email,
      subject: isUrgent
        ? `Your NestBook Pro access expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
        : `Your NestBook Pro promotional period ends in ${daysLeft} days`,
      html: shell(body),
    });
    console.log(`[email] Promo ${daysLeft}-day reminder sent → ${user.email}`);
  } catch (err) {
    console.error('[email] Failed to send promo expiry reminder:', err.message);
  }
}

export async function sendPromoExpiredEmail(user) {
  if (!resend) return;
  if (!user?.email) return;
  const firstName = user.name?.split(' ')[0] || 'there';

  const body = `
    <h1 style="margin:0 0 8px;font-size:1.4rem;font-weight:700;color:#1a4710;">
      Your promotional period has ended
    </h1>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#374151;line-height:1.6;">Hi ${firstName},</p>

    <p style="color:#374151;font-size:0.875rem;line-height:1.6;margin-bottom:16px;">
      Your NestBook Pro promotional access has now ended and your account has moved
      to the free plan.
    </p>

    <p style="color:#374151;font-size:0.875rem;line-height:1.6;margin-bottom:24px;">
      Your property page, bookings and all your data are safe —
      you just have access to the free plan features now.
    </p>

    <div style="background:#f0fdf4;border:1.5px solid #d9f0cc;border-radius:8px;
                padding:16px 20px;margin-bottom:24px;">
      <div style="font-weight:700;color:#1a4710;font-size:0.9rem;margin-bottom:8px;">
        Want to continue with Pro?
      </div>
      <p style="color:#374151;font-size:0.875rem;margin:0;line-height:1.6;">
        NestBook Pro includes unlimited rooms, 5 photos per room,
        booking widget, seasonal pricing and revenue reports. No commission ever.
      </p>
    </div>

    <a href="https://nestbook.io/app/settings"
       style="display:inline-block;background:#1a4710;color:white;text-decoration:none;
              padding:13px 28px;border-radius:8px;font-size:0.9rem;font-weight:600;">
      Upgrade to Pro →
    </a>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;">
    <p style="margin:0;font-size:0.78rem;color:#9ca3af;text-align:center;line-height:1.5;">
      Thank you for trying NestBook Pro — any questions, just reply to this email.
    </p>`;

  try {
    await resend.emails.send({
      from:    'NestBook <hello@nestbook.io>',
      to:      user.email,
      subject: 'Your NestBook Pro promotional period has ended',
      html:    shell(body),
    });
    console.log(`[email] Promo expired email sent → ${user.email}`);
  } catch (err) {
    console.error('[email] Failed to send promo expired email:', err.message);
  }
}

export async function sendPromoPaymentConfirmedEmail(user) {
  if (!resend) return;
  if (!user?.email) return;
  const firstName = user.name?.split(' ')[0] || 'there';
  const expiryDate = new Date(user.trial_ends_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const body = `
    <h1 style="margin:0 0 8px;font-size:1.4rem;font-weight:700;color:#1a4710;">
      Payment details saved! 🌿
    </h1>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#374151;line-height:1.6;">
      Hi ${firstName} — you're all set! Here's what happens next:
    </p>

    <div style="background:#f0fdf4;border:1.5px solid #d9f0cc;border-radius:8px;
                padding:16px 20px;margin-bottom:24px;display:flex;align-items:flex-start;gap:12px;">
      <span style="font-size:22px;line-height:1;">✓</span>
      <div>
        <div style="font-weight:700;color:#166534;font-size:1rem;">Payment details saved successfully</div>
        <div style="font-size:0.85rem;color:#166534;margin-top:2px;">Your Pro subscription will continue automatically</div>
      </div>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:10px 0;color:#64748b;font-size:0.875rem;
                   border-bottom:1px solid #e2e8f0;width:160px;">Until ${expiryDate}</td>
        <td style="padding:10px 0;font-size:0.875rem;border-bottom:1px solid #e2e8f0;
                   color:#166534;font-weight:600;">✓ NestBook Pro — no charge</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#64748b;font-size:0.875rem;">From ${expiryDate}</td>
        <td style="padding:10px 0;font-size:0.875rem;color:#1a2e14;font-weight:600;">
          NestBook Pro continues uninterrupted</td>
      </tr>
    </table>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;
                padding:14px 18px;margin-bottom:24px;">
      <p style="color:#475569;font-size:0.85rem;margin:0;line-height:1.6;">
        You can cancel anytime before ${expiryDate} from
        <strong>Settings → Billing</strong> in your NestBook dashboard,
        and your account will return to the free plan. No questions asked.
      </p>
    </div>

    <p style="color:#374151;font-size:0.875rem;line-height:1.6;margin-bottom:24px;">
      Thank you for being part of NestBook — if you ever need anything just reply to this email.
    </p>

    <a href="https://nestbook.io/app"
       style="display:inline-block;background:#1a4710;color:white;text-decoration:none;
              padding:13px 28px;border-radius:8px;font-size:0.9rem;font-weight:600;">
      Go to my dashboard →
    </a>`;

  try {
    await resend.emails.send({
      from:    'NestBook <hello@nestbook.io>',
      to:      user.email,
      subject: `Payment details saved — you're all set! 🌿`,
      html:    shell(body),
    });
    console.log(`[email] Promo payment confirmed email sent → ${user.email}`);
  } catch (err) {
    console.error('[email] Failed to send promo payment confirmed email:', err.message);
  }
}

export async function sendContentRemovedEmail(ownerEmail, ownerName, propertyName, reason, language) {
  if (!resend) return;
  if (!ownerEmail) return;

  const CONTENT_T = {
    en: {
      subject:     'Content update — NestBook',
      greeting:    (name) => `Dear ${name},`,
      body:        (prop) => `We've removed some content from your property listing for <strong>${prop}</strong> as it did not meet NestBook's content guidelines.`,
      reasonLabel: 'Reason:',
      closing:     'Please review our content policy and feel free to upload replacement content at any time. If you believe this was a mistake, just reply to this email.',
    },
    fr: {
      subject:     'Mise à jour du contenu — NestBook',
      greeting:    (name) => `Bonjour ${name},`,
      body:        (prop) => `Nous avons retiré certains contenus de votre annonce pour <strong>${prop}</strong> car ils ne respectaient pas les règles de contenu de NestBook.`,
      reasonLabel: 'Motif :',
      closing:     `Merci de consulter notre politique de contenu. Vous pouvez ajouter un nouveau contenu à tout moment. Si vous pensez qu'il s'agit d'une erreur, répondez simplement à cet e-mail.`,
    },
    de: {
      subject:     'Inhaltsaktualisierung — NestBook',
      greeting:    (name) => `Hallo ${name},`,
      body:        (prop) => `Wir haben einige Inhalte aus Ihrem Eintrag für <strong>${prop}</strong> entfernt, da sie nicht den Inhaltsrichtlinien von NestBook entsprachen.`,
      reasonLabel: 'Grund:',
      closing:     'Bitte sehen Sie sich unsere Inhaltsrichtlinien an und laden Sie jederzeit gerne neue Inhalte hoch. Falls Sie glauben, dass dies ein Irrtum war, antworten Sie einfach auf diese E-Mail.',
    },
    es: {
      subject:     'Actualización de contenido — NestBook',
      greeting:    (name) => `Hola ${name},`,
      body:        (prop) => `Hemos eliminado parte del contenido de su anuncio de <strong>${prop}</strong> porque no cumplía con las normas de contenido de NestBook.`,
      reasonLabel: 'Motivo:',
      closing:     'Revise nuestra política de contenido y no dude en subir contenido nuevo cuando quiera. Si cree que se trata de un error, simplemente responda a este correo.',
    },
    nl: {
      subject:     'Content-update — NestBook',
      greeting:    (name) => `Beste ${name},`,
      body:        (prop) => `We hebben content van uw vermelding voor <strong>${prop}</strong> verwijderd omdat deze niet voldeed aan de inhoudsrichtlijnen van NestBook.`,
      reasonLabel: 'Reden:',
      closing:     'Bekijk ons contentbeleid en upload gerust op elk moment nieuwe content. Als u denkt dat dit een vergissing was, antwoord dan gewoon op deze e-mail.',
    },
  };

  const lang = CONTENT_T[language] ? language : 'en';
  const ct   = CONTENT_T[lang];
  const name = ownerName || ownerEmail;

  const html = shell(`
    <p style="margin:0 0 16px;font-size:0.95rem;color:#374151;">${ct.greeting(name)}</p>
    <p style="margin:0 0 16px;font-size:0.95rem;color:#374151;line-height:1.6;">${ct.body(propertyName)}</p>
    ${reason ? `<p style="margin:0 0 16px;font-size:0.95rem;color:#374151;"><strong>${ct.reasonLabel}</strong> ${reason}</p>` : ''}
    <p style="margin:0;font-size:0.95rem;color:#374151;line-height:1.6;">${ct.closing}</p>
  `);

  try {
    await resend.emails.send({ from: FROM, to: ownerEmail, subject: ct.subject, html });
    console.log(`[email] Content removed email sent → ${ownerEmail}`);
  } catch (err) {
    console.error('[email] Failed to send content removed email:', err.message);
  }
}

export async function sendVerificationReminderEmail(user) {
  if (!resend) return;
  if (!user?.email || !user?.email_verification_token) return;

  const verifyLink = `https://nestbook.io/app/verify-email?token=${user.email_verification_token}`;

  const VERIFY_REMINDER_T = {
    en: {
      subject:  'Please verify your email — your NestBook account will be removed soon',
      heading:  'Your account needs verifying',
      body:     "We noticed you haven't verified your email address yet. To keep your NestBook account, please click the button below.",
      warning:  "If your account isn't verified within the next few days, it will be automatically removed and this can't be undone.",
      cta:      'Verify my email address',
    },
    fr: {
      subject:  'Veuillez vérifier votre e-mail — votre compte NestBook sera bientôt supprimé',
      heading:  'Votre compte doit être vérifié',
      body:     "Nous avons remarqué que vous n'avez pas encore vérifié votre adresse e-mail. Pour conserver votre compte NestBook, cliquez sur le bouton ci-dessous.",
      warning:  "Si votre compte n'est pas vérifié dans les prochains jours, il sera automatiquement supprimé et cette action est irréversible.",
      cta:      'Vérifier mon adresse e-mail',
    },
    de: {
      subject:  'Bitte bestätigen Sie Ihre E-Mail — Ihr NestBook-Konto wird bald entfernt',
      heading:  'Ihr Konto muss bestätigt werden',
      body:     'Uns ist aufgefallen, dass Sie Ihre E-Mail-Adresse noch nicht bestätigt haben. Um Ihr NestBook-Konto zu behalten, klicken Sie bitte auf die Schaltfläche unten.',
      warning:  'Wird Ihr Konto nicht innerhalb der nächsten Tage bestätigt, wird es automatisch entfernt. Dies kann nicht rückgängig gemacht werden.',
      cta:      'E-Mail-Adresse bestätigen',
    },
    es: {
      subject:  'Verifique su correo electrónico — su cuenta de NestBook será eliminada pronto',
      heading:  'Su cuenta necesita verificación',
      body:     'Hemos notado que aún no ha verificado su dirección de correo electrónico. Para conservar su cuenta de NestBook, haga clic en el botón de abajo.',
      warning:  'Si su cuenta no se verifica en los próximos días, se eliminará automáticamente y esta acción no se puede deshacer.',
      cta:      'Verificar mi dirección de correo',
    },
    nl: {
      subject:  'Bevestig uw e-mail — uw NestBook-account wordt binnenkort verwijderd',
      heading:  'Uw account moet worden bevestigd',
      body:     'We hebben gemerkt dat u uw e-mailadres nog niet heeft bevestigd. Klik op de knop hieronder om uw NestBook-account te behouden.',
      warning:  'Als uw account niet binnen enkele dagen wordt bevestigd, wordt het automatisch verwijderd. Dit kan niet ongedaan worden gemaakt.',
      cta:      'E-mailadres bevestigen',
    },
  };

  const lang = VERIFY_REMINDER_T[user.language] ? user.language : 'en';
  const tr   = VERIFY_REMINDER_T[lang];

  const html = shell(`
    <h1 style="margin:0 0 16px;font-size:1.3rem;font-weight:700;color:#1a4710;">${tr.heading}</h1>
    <p style="margin:0 0 16px;font-size:0.95rem;color:#374151;line-height:1.6;">${tr.body}</p>

    <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:14px 18px;
                border-radius:0 8px 8px 0;margin:0 0 24px;">
      <p style="margin:0;color:#991b1b;font-size:0.875rem;line-height:1.6;">${tr.warning}</p>
    </div>

    <a href="${verifyLink}"
       style="display:inline-block;background:#1a4710;color:#fff;text-decoration:none;
              padding:13px 28px;border-radius:8px;font-size:0.9rem;font-weight:600;">
      ${tr.cta}
    </a>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 16px;">
    <p style="margin:0;font-size:0.75rem;color:#9ca3af;text-align:center;line-height:1.5;">
      If you didn't create a NestBook account, you can safely ignore this email.
    </p>
  `);

  try {
    await resend.emails.send({
      from:    FROM,
      to:      user.email,
      subject: tr.subject,
      html,
    });
    console.log(`[email] Verification reminder sent → ${user.email}`);
  } catch (err) {
    console.error('[email] Failed to send verification reminder:', err.message);
  }
}

// ── Payment assistance email ──────────────────────────────────────────────────
// Sent to the guest on their second consecutive failed/expired payment attempt
// for the same room + dates. reply-to = property owner so replies land with them.
export async function sendPaymentAssistanceEmail(booking, property) {
  if (!resend) return;
  const guestEmail = booking.guest_email;
  if (!guestEmail) return;

  const locale = property?.locale ?? 'en';
  const lang = ['en','fr','de','es','nl'].includes(locale) ? locale : 'en';
  const ownerEmail = property?.owner_email;
  const guestName = [booking.guest_first_name, booking.guest_last_name].filter(Boolean).join(' ') || 'Guest';
  const propertyName = property?.name ?? 'the property';

  const locales = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', nl: 'nl-NL' };
  const fmtDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(locales[lang] || 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const T = {
    en: {
      subject:      `Your booking at ${propertyName} — we're here to help`,
      heading:      `Having trouble completing your booking?`,
      intro:        `Hi ${guestName}, we noticed your payment didn't go through for your upcoming stay at ${propertyName}.`,
      details:      `Your booking details:`,
      checkin:      `Check-in`,
      checkout:     `Check-out`,
      reassurance:  `No worries — nothing has been charged and your details are safe. The team at ${propertyName} would love to help you complete your booking.`,
      cta:          `Simply reply to this email and the team will get back to you directly.`,
      closing:      `We hope to welcome you soon!`,
    },
    fr: {
      subject:      `Votre réservation à ${propertyName} — nous sommes là pour vous aider`,
      heading:      `Des difficultés à finaliser votre réservation ?`,
      intro:        `Bonjour ${guestName}, nous avons remarqué que votre paiement n'a pas abouti pour votre séjour à ${propertyName}.`,
      details:      `Détails de votre réservation :`,
      checkin:      `Arrivée`,
      checkout:     `Départ`,
      reassurance:  `Pas d'inquiétude — aucun montant n'a été débité et vos informations sont en sécurité. L'équipe de ${propertyName} serait ravie de vous aider à finaliser votre réservation.`,
      cta:          `Répondez simplement à cet e-mail et l'équipe vous contactera directement.`,
      closing:      `Nous espérons vous accueillir bientôt !`,
    },
    de: {
      subject:      `Ihre Buchung bei ${propertyName} — wir helfen Ihnen gerne`,
      heading:      `Probleme beim Abschluss Ihrer Buchung?`,
      intro:        `Hallo ${guestName}, wir haben bemerkt, dass Ihre Zahlung für Ihren geplanten Aufenthalt bei ${propertyName} nicht abgeschlossen werden konnte.`,
      details:      `Ihre Buchungsdetails:`,
      checkin:      `Anreise`,
      checkout:     `Abreise`,
      reassurance:  `Keine Sorge — es wurde nichts abgebucht und Ihre Daten sind sicher. Das Team von ${propertyName} hilft Ihnen gerne dabei, Ihre Buchung abzuschließen.`,
      cta:          `Antworten Sie einfach auf diese E-Mail und das Team wird sich direkt bei Ihnen melden.`,
      closing:      `Wir hoffen, Sie bald willkommen zu heißen!`,
    },
    es: {
      subject:      `Su reserva en ${propertyName} — estamos aquí para ayudarle`,
      heading:      `¿Tiene problemas para completar su reserva?`,
      intro:        `Hola ${guestName}, hemos notado que su pago no se ha completado para su próxima estancia en ${propertyName}.`,
      details:      `Detalles de su reserva:`,
      checkin:      `Llegada`,
      checkout:     `Salida`,
      reassurance:  `No se preocupe — no se ha realizado ningún cargo y sus datos están seguros. El equipo de ${propertyName} estará encantado de ayudarle a completar su reserva.`,
      cta:          `Simplemente responda a este correo y el equipo se pondrá en contacto con usted directamente.`,
      closing:      `¡Esperamos recibirle pronto!`,
    },
    nl: {
      subject:      `Uw boeking bij ${propertyName} — we helpen u graag`,
      heading:      `Heeft u moeite met het voltooien van uw boeking?`,
      intro:        `Hallo ${guestName}, we hebben gemerkt dat uw betaling voor uw aankomende verblijf bij ${propertyName} niet is geslaagd.`,
      details:      `Uw boekingsgegevens:`,
      checkin:      `Inchecken`,
      checkout:     `Uitchecken`,
      reassurance:  `Geen zorgen — er is niets in rekening gebracht en uw gegevens zijn veilig. Het team van ${propertyName} helpt u graag bij het voltooien van uw boeking.`,
      cta:          `Stuur gewoon een antwoord op deze e-mail en het team neemt direct contact met u op.`,
      closing:      `We hopen u snel te mogen verwelkomen!`,
    },
  };

  const tr = T[lang] || T.en;

  const body = `
    <p style="margin:0 0 16px;font-size:1rem;font-weight:700;color:#1a4710;">${tr.heading}</p>
    <p style="margin:0 0 16px;color:#374151;">${tr.intro}</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-size:0.8rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">${tr.details}</p>
      <p style="margin:0 0 4px;color:#1a2e14;"><strong>${tr.checkin}:</strong> ${fmtDate(booking.check_in_date)}</p>
      <p style="margin:0;color:#1a2e14;"><strong>${tr.checkout}:</strong> ${fmtDate(booking.check_out_date)}</p>
    </div>

    <p style="margin:0 0 16px;color:#374151;">${tr.reassurance}</p>
    <p style="margin:0 0 24px;color:#374151;font-weight:600;">${tr.cta}</p>
    <p style="margin:0;color:#6b7280;">${tr.closing}</p>
  `;

  try {
    await resend.emails.send({
      from:    FROM,
      to:      guestEmail,
      replyTo: ownerEmail || undefined,
      subject: tr.subject,
      html:    shell(body),
    });
    console.log(`[assistance-email] Sent → ${guestEmail} (booking #${booking.id})`);
  } catch (err) {
    console.error('[assistance-email] Failed:', err.message);
  }
}

export async function sendOutreachEmail({ to, subject, html }) {
  if (!resend) {
    console.log('[email] SKIPPED outreach email to', to, '(no Resend key)');
    return;
  }
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const result = await resend.emails.send({ from: FROM, to, subject, html, text });
  console.log('[email] Outreach email sent →', to, '| id:', result?.id ?? result?.data?.id);
}
