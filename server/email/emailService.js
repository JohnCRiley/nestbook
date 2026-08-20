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
import { wrapGuestMailerEmail } from '../utils/emailWrapper.js';

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
    enquiryReceived:      'Enquiry received',
    yourEnquiryFor:       'Your enquiry for',
    hasBeenReceived:      'has been received.',
    enquiryNextSteps:     'The property owner will review your request and get back to you shortly.',
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
    onboardHeading:     "Welcome, it's great to have you onboard, {name}!",
    onboardIntro:       "{property} is live on NestBook. Here's how to get your app up and running.",
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
    onboardStep5Title:  'Add a booking button to your Facebook page',
    onboardStep5Body:   'This is the step most owners love. In Settings, scroll to Facebook Booking Button — you\'ll find a step-by-step guide showing exactly how to add a button to your Facebook business page that links straight to your booking page.',
    onboardStep5Tip:    'Every person who visits your Facebook page can now book directly with you — without going through Booking.com or Airbnb. Zero commission.',
    onboardStep6Title:  'Sync your calendar with Booking.com and Airbnb',
    onboardStep6Body:   'In Settings, find Calendar Sync — copy your iCal URL and add it to your Booking.com and Airbnb accounts. This keeps all your calendars in sync automatically so you never get a double booking.',
    onboardStep7Title:  'Share your booking page link everywhere',
    onboardStep7Body:   'Copy your nestbook.io/book/your-property link and add it to your Instagram bio, your email signature, your WhatsApp status, your TripAdvisor replies — anywhere your guests might find you. Every link is a direct booking opportunity.',
    onboardSectionAppTitle:  'Get your app ready and your booking page live',
    onboardStepRoomsTitle:   '1. Add your rooms.',
    onboardStepRoomsBody:    'Depending on your rental type, these might be called Rooms, Property, or Units — different names for the same thing: where your guests stay. Open [Rooms/Units/Property] in the sidebar, click + Add, fill in the form, save.',
    onboardStepPhotosTitle:  '2. Add photos.',
    onboardStepPhotosBody:   "Click any room tile, then Edit — you'll find the photo upload there. These are the images guests see on your booking page.",
    onboardStepCalendarTitle: '3. Check your calendar.',
    onboardStepCalendarBody:  'Once your rooms are added, open Calendar to see them all laid out and ready.',
    onboardShineTitle:       'Make it shine',
    onboardShinePhotoTitle:  'Add a property photo.',
    onboardShinePhotoBody:   "In Settings — this is the hero image at the top of your booking page, and it's the first thing a guest sees.",
    onboardShineAboutTitle:  'Write your About text and At a Glance details.',
    onboardShineAboutBody:   'Also in Settings — this is what tells a visitor who you are and what you offer, at a glance, before they even scroll.',
    onboardShineThemeTitle:  'Choose your theme.',
    onboardShineThemeBody:   'Pick a colour scheme in Settings — it carries through to your booking page and widget too, so it genuinely feels like yours.',
    onboardShineOutro:       "These aren't optional extras — they're what turns your booking page from bare into genuinely inviting.",
    onboardGuestsTitle:      'Already have guests?',
    onboardGuestsBody:       'Guests → Import guests will bring your existing list in. No existing list? No problem — every new booking saves the guest automatically.',
    onboardCTA:         'Go to my NestBook dashboard →',
    onboardPrintBtn:    '💡 Want to keep this as a reference? Most email apps let you print via File → Print or your browser\'s print option.',
    onboardGuideIntro:  'Want the full picture? Our Getting Started Guide covers everything from seasonal pricing to your booking widget. (EN version only for now — more languages coming soon.)',
    onboardGuideLink:   'Read the Getting Started Guide →',
    // ── Shared (booking-lifecycle emails) ─────────────────────────────────
    property:              'Property',
    duration:               'Duration',
    night:                  'night',
    nights:                 'nights',
    guestLabel:             'Guest',
    paymentMethodLabel:     'Payment method',
    tableCategory:          'Category',
    tableDescription:       'Description',
    tableAmount:            'Amount',
    // ── Booking approved ───────────────────────────────────────────────────
    bookingApprovedSubject:   'Booking confirmed',
    bookingApprovedHeading:   'Your booking is confirmed!',
    greatNews:                'Great news,',
    hasBeenApproved:          'has been approved.',
    // ── Booking declined ───────────────────────────────────────────────────
    bookingDeclinedSubject:   'Booking request update',
    bookingDeclinedHeading:   'Booking request update',
    bookingDeclinedBody1:     'unfortunately your booking request at',
    bookingDeclinedBody2:     'for',
    bookingDeclinedBody3:     'could not be accommodated at this time.',
    bookingDeclinedFooter:    "We're sorry for any inconvenience. If you'd like to try alternative dates, please visit our booking page or contact us directly.",
    // ── Access details ──────────────────────────────────────────────────────
    accessSubjectPrefix:      'Your access details for',
    accessHeading:             'Your access details are ready',
    accessIntro1:              'your stay at',
    accessIntro2:              'starts on',
    accessIntro3:              'Here is everything you need to access the property.',
    accessMethodCode:          'Keypad / door code',
    accessMethodKeybox:        'Key lockbox',
    accessMethodKeyed:         'Physical key',
    accessMethodApp:           'Smart lock app',
    accessMethodOther:         'Access details',
    checkInFromLabel:          'Check-in from',
    arrivalInstructionsTitle:  'Arrival Instructions',
    keyLocationPhotoTitle:     '📍 Key location photo',
    keyLocationPhotoCaption:   'Photo of the key location provided by',
    accessCheckInDateLabel:    'Check-in date',
    accessCheckOutDateLabel:   'Check-out date',
    accessFooter:              'If you have any questions, please reply to this email to contact the owner directly.',
    // ── Charges summary ─────────────────────────────────────────────────────
    chargesSummarySubjectSuffix: 'charges summary',
    chargesSummaryThanksFor:   'Thank you for staying at',
    chargesSummaryIntro:       'we hope you had a wonderful stay. Here is a summary of your booking and any additional charges incurred during your visit.',
    bookingTotalLabel:         'Booking total',
    additionalChargesTitle:    'Additional charges',
    chargesTotalLabel:         'Charges total',
    grandTotalLabel:           'Grand total',
    paymentRequestLabel:       'Payment request:',
    paymentRequestBody1:       'Please arrange payment of',
    paymentRequestBody2:       'directly with',
    paymentRequestBody3:       'If you have any questions about these charges, please reply to this email.',
    chargesSummaryFooter1:     'Once payment is confirmed you will receive a full receipt by email.',
    chargesSummaryFooter2:     'Thank you for choosing',
    chargesSummaryFooter3:     '— we hope to welcome you back soon.',
    // ── Receipt ──────────────────────────────────────────────────────────────
    receiptSubjectPrefix:      'Receipt',
    receiptHeading:            'Payment receipt',
    receiptRefLabel:           'Ref:',
    datePaidLabel:             'Date paid',
    paymentConfirmedTitle:     'Payment confirmed',
    paymentConfirmedBody:      'Thank you — your payment has been received',
    pmCash:                    'Cash',
    pmCard:                    'Card (in person)',
    pmBankTransfer:            'Bank transfer',
    pmOther:                   'Other',
    pmOnline:                  'Online payment',
    itemisedBreakdownTitle:    'Itemised breakdown',
    accommodationLabel:        'Accommodation',
    noAdditionalCharges:       'No additional charges',
    totalPaidLabel:            'Total paid',
    receiptIssuedBy:           'This receipt was issued by',
    receiptIssuedSuffix:       'via NestBook.',
    receiptIssuedDateLabel:    'Issued:',
    // ── Stay extended ────────────────────────────────────────────────────────
    stayExtendedSubjectPrefix: 'Stay extended',
    stayExtendedSubjectMid:    'now until',
    stayExtendedHeading:       'Great news — your stay has been extended!',
    stayExtendedIntro1:        'Your booking at',
    stayExtendedIntro2:        'has been updated with new dates.',
    unchangedLabel:            '(unchanged)',
    previousCheckOutLabel:     'Previous check-out',
    newCheckOutLabel:          'New check-out',
    newTotalLabel:             'New total',
    paymentNoteLabel:          'Payment note:',
    stayExtendedPaymentNote1:  'Please arrange the additional payment for the extended nights directly with',
    stayExtendedPaymentNote2:  'Reply to this email if you have any questions.',
    // ── Stay shortened ───────────────────────────────────────────────────────
    stayShortenedSubjectPrefix: 'Booking updated',
    stayShortenedSubjectMid:    'check-out now',
    stayShortenedHeading:       'Your booking has been updated',
    stayShortenedIntro1:        'Your stay at',
    stayShortenedIntro2:        'has been shortened.',
    updatedTotalLabel:          'Updated total',
    stayShortenedFooter:        'If you have any questions about your updated booking, please reply to this email to contact the property directly.',
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
    enquiryReceived:      'Demande reçue',
    yourEnquiryFor:       'Votre demande pour',
    hasBeenReceived:      'a été reçue.',
    enquiryNextSteps:     'Le propriétaire va examiner votre demande et vous répondra bientôt.',
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
    onboardHeading:     'Bienvenue, ravis de vous compter parmi nous, {name} !',
    onboardIntro:       '{property} est maintenant en ligne sur NestBook. Voici comment configurer votre application.',
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
    onboardStep5Title:  'Ajoutez un bouton de réservation à votre page Facebook',
    onboardStep5Body:   "Dans Paramètres, trouvez Bouton de réservation Facebook — vous trouverez un guide détaillé, étape par étape, vous montrant exactement comment ajouter un bouton à votre page Facebook qui renvoie directement vers votre page de réservation.",
    onboardStep5Tip:    "Chaque personne qui visite votre page Facebook peut maintenant réserver directement avec vous — sans passer par Booking.com ou Airbnb. Zéro commission.",
    onboardStep6Title:  'Synchronisez votre calendrier avec Booking.com et Airbnb',
    onboardStep6Body:   "Dans Paramètres, trouvez Synchronisation calendrier — copiez votre URL iCal et ajoutez-la à vos comptes Booking.com et Airbnb.",
    onboardStep7Title:  'Partagez votre lien de réservation partout',
    onboardStep7Body:   "Copiez votre lien nestbook.io/book/votre-propriété et ajoutez-le à votre bio Instagram, signature e-mail, statut WhatsApp, réponses TripAdvisor — partout où vos clients peuvent vous trouver.",
    onboardSectionAppTitle:  'Préparez votre application et mettez votre page de réservation en ligne',
    onboardStepRoomsTitle:   '1. Ajoutez vos chambres.',
    onboardStepRoomsBody:    "Selon votre type de location, celles-ci peuvent s'appeler Chambres, Propriété ou Unités — différents noms pour la même chose : l'endroit où logent vos clients. Ouvrez [Chambres/Unités/Propriété] dans le menu, cliquez sur + Ajouter, remplissez le formulaire, enregistrez.",
    onboardStepPhotosTitle:  '2. Ajoutez des photos.',
    onboardStepPhotosBody:   "Cliquez sur une chambre, puis sur Modifier — vous y trouverez l'ajout de photos. Ce sont les images que les clients voient sur votre page de réservation.",
    onboardStepCalendarTitle: '3. Vérifiez votre calendrier.',
    onboardStepCalendarBody:  'Une fois vos chambres ajoutées, ouvrez Calendrier pour les voir toutes organisées et prêtes.',
    onboardShineTitle:       'Sublimez votre page',
    onboardShinePhotoTitle:  'Ajoutez une photo de votre propriété.',
    onboardShinePhotoBody:   "Dans Paramètres — c'est l'image principale en haut de votre page de réservation, la première chose qu'un client voit.",
    onboardShineAboutTitle:  "Rédigez votre texte « À propos » et vos informations « En un coup d'œil ».",
    onboardShineAboutBody:   "Toujours dans Paramètres — cela indique à un visiteur qui vous êtes et ce que vous proposez, en un coup d'œil, avant même qu'il ne fasse défiler la page.",
    onboardShineThemeTitle:  'Choisissez votre thème.',
    onboardShineThemeBody:   "Sélectionnez une palette de couleurs dans Paramètres — elle s'applique aussi à votre page de réservation et à votre widget, pour que tout vous ressemble vraiment.",
    onboardShineOutro:       "Ce ne sont pas de simples options facultatives — elles transforment votre page de réservation, d'une page vide à une page réellement accueillante.",
    onboardGuestsTitle:      'Vous avez déjà des clients ?',
    onboardGuestsBody:       'Rendez-vous dans Clients → Importer des clients pour intégrer votre liste existante. Pas encore de liste ? Aucun souci — chaque nouvelle réservation enregistre automatiquement le client.',
    onboardCTA:         'Accéder à mon tableau de bord NestBook →',
    onboardPrintBtn:    "💡 Envie de conserver cet e-mail comme référence ? La plupart des messageries permettent d'imprimer via Fichier → Imprimer, ou l'option d'impression de votre navigateur.",
    onboardGuideIntro:  "Envie d'en savoir plus ? Notre guide de démarrage couvre tout, de la tarification saisonnière à votre widget de réservation. (Version anglaise uniquement pour le moment — d'autres langues arrivent bientôt.)",
    onboardGuideLink:   'Lire le guide de démarrage →',
    // ── Shared (booking-lifecycle emails) ─────────────────────────────────
    property:              'Propriété',
    duration:               'Durée',
    night:                  'nuit',
    nights:                 'nuits',
    guestLabel:             'Client',
    paymentMethodLabel:     'Mode de paiement',
    tableCategory:          'Catégorie',
    tableDescription:       'Description',
    tableAmount:            'Montant',
    // ── Booking approved ───────────────────────────────────────────────────
    bookingApprovedSubject:   'Réservation confirmée',
    bookingApprovedHeading:   'Votre réservation est confirmée !',
    greatNews:                'Bonne nouvelle,',
    hasBeenApproved:          'a été approuvée.',
    // ── Booking declined ───────────────────────────────────────────────────
    bookingDeclinedSubject:   'Mise à jour de votre demande de réservation',
    bookingDeclinedHeading:   'Mise à jour de votre demande de réservation',
    bookingDeclinedBody1:     'malheureusement, votre demande de réservation chez',
    bookingDeclinedBody2:     'pour',
    bookingDeclinedBody3:     "n'a pas pu être satisfaite pour le moment.",
    bookingDeclinedFooter:    "Nous sommes désolés pour la gêne occasionnée. Si vous souhaitez essayer d'autres dates, veuillez consulter notre page de réservation ou nous contacter directement.",
    // ── Access details ──────────────────────────────────────────────────────
    accessSubjectPrefix:      "Vos informations d'accès pour",
    accessHeading:             "Vos informations d'accès sont prêtes",
    accessIntro1:              'votre séjour chez',
    accessIntro2:              'commence le',
    accessIntro3:              'Voici tout ce dont vous avez besoin pour accéder au logement.',
    accessMethodCode:          'Code / clavier à code',
    accessMethodKeybox:        'Boîte à clés',
    accessMethodKeyed:         'Clé physique',
    accessMethodApp:           'Application de serrure connectée',
    accessMethodOther:         "Informations d'accès",
    checkInFromLabel:          "Arrivée possible à partir de",
    arrivalInstructionsTitle:  "Instructions d'arrivée",
    keyLocationPhotoTitle:     "📍 Photo de l'emplacement des clés",
    keyLocationPhotoCaption:   "Photo de l'emplacement des clés fournie par",
    accessCheckInDateLabel:    "Date d'arrivée",
    accessCheckOutDateLabel:   'Date de départ',
    accessFooter:              'Pour toute question, répondez à cet e-mail pour contacter directement le propriétaire.',
    // ── Charges summary ─────────────────────────────────────────────────────
    chargesSummarySubjectSuffix: 'récapitulatif des frais',
    chargesSummaryThanksFor:   'Merci pour votre séjour chez',
    chargesSummaryIntro:       'nous espérons que vous avez passé un excellent séjour. Voici un récapitulatif de votre réservation et des frais supplémentaires engagés durant votre visite.',
    bookingTotalLabel:         'Total de la réservation',
    additionalChargesTitle:    'Frais supplémentaires',
    chargesTotalLabel:         'Total des frais',
    grandTotalLabel:           'Total général',
    paymentRequestLabel:       'Demande de paiement :',
    paymentRequestBody1:       'Veuillez régler',
    paymentRequestBody2:       'directement auprès de',
    paymentRequestBody3:       'Pour toute question concernant ces frais, veuillez répondre à cet e-mail.',
    chargesSummaryFooter1:     'Une fois le paiement confirmé, vous recevrez un reçu complet par e-mail.',
    chargesSummaryFooter2:     "Merci d'avoir choisi",
    chargesSummaryFooter3:     '— nous espérons vous accueillir de nouveau bientôt.',
    // ── Receipt ──────────────────────────────────────────────────────────────
    receiptSubjectPrefix:      'Reçu',
    receiptHeading:            'Reçu de paiement',
    receiptRefLabel:           'Réf :',
    datePaidLabel:             'Date de paiement',
    paymentConfirmedTitle:     'Paiement confirmé',
    paymentConfirmedBody:      'Merci — votre paiement a bien été reçu',
    pmCash:                    'Espèces',
    pmCard:                    'Carte (sur place)',
    pmBankTransfer:            'Virement bancaire',
    pmOther:                   'Autre',
    pmOnline:                  'Paiement en ligne',
    itemisedBreakdownTitle:    'Détail des frais',
    accommodationLabel:        'Hébergement',
    noAdditionalCharges:       'Aucun frais supplémentaire',
    totalPaidLabel:            'Total payé',
    receiptIssuedBy:           'Ce reçu a été émis par',
    receiptIssuedSuffix:       'via NestBook.',
    receiptIssuedDateLabel:    'Émis le :',
    // ── Stay extended ────────────────────────────────────────────────────────
    stayExtendedSubjectPrefix: 'Séjour prolongé',
    stayExtendedSubjectMid:    "jusqu'au",
    stayExtendedHeading:       'Bonne nouvelle — votre séjour a été prolongé !',
    stayExtendedIntro1:        'Votre réservation chez',
    stayExtendedIntro2:        'a été mise à jour avec de nouvelles dates.',
    unchangedLabel:            '(inchangé)',
    previousCheckOutLabel:     'Départ précédent',
    newCheckOutLabel:          'Nouveau départ',
    newTotalLabel:             'Nouveau total',
    paymentNoteLabel:          'Note de paiement :',
    stayExtendedPaymentNote1:  'Veuillez régler le paiement supplémentaire pour les nuits ajoutées directement auprès de',
    stayExtendedPaymentNote2:  'Répondez à cet e-mail si vous avez des questions.',
    // ── Stay shortened ───────────────────────────────────────────────────────
    stayShortenedSubjectPrefix: 'Réservation mise à jour',
    stayShortenedSubjectMid:    'départ désormais le',
    stayShortenedHeading:       'Votre réservation a été mise à jour',
    stayShortenedIntro1:        'Votre séjour chez',
    stayShortenedIntro2:        'a été raccourci.',
    updatedTotalLabel:          'Total mis à jour',
    stayShortenedFooter:        'Pour toute question concernant votre réservation mise à jour, veuillez répondre à cet e-mail pour contacter directement le logement.',
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
    enquiryReceived:      'Solicitud recibida',
    yourEnquiryFor:       'Su solicitud para',
    hasBeenReceived:      'ha sido recibida.',
    enquiryNextSteps:     'El propietario revisará su solicitud y le responderá en breve.',
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
    onboardHeading:     '¡Bienvenido, nos alegra tenerte con nosotros, {name}!',
    onboardIntro:       '{property} ya está activo en NestBook. Así puedes poner en marcha tu aplicación.',
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
    onboardStep5Title:  'Añada un botón de reserva a su página de Facebook',
    onboardStep5Body:   'En Configuración, encuentre Botón de reserva de Facebook — encontrará una guía paso a paso que muestra exactamente cómo añadir un botón a su página de Facebook que enlace directamente con su página de reservas.',
    onboardStep5Tip:    'Cada persona que visita su página de Facebook ahora puede reservar directamente con usted — sin pasar por Booking.com o Airbnb. Cero comisión.',
    onboardStep6Title:  'Sincronice su calendario con Booking.com y Airbnb',
    onboardStep6Body:   'En Configuración, encuentre Sincronización de calendario — copie su URL iCal y añádala a sus cuentas de Booking.com y Airbnb.',
    onboardStep7Title:  'Comparta su enlace de reservas en todas partes',
    onboardStep7Body:   'Copie su enlace nestbook.io/book/su-propiedad y añádalo a su bio de Instagram, firma de correo, estado de WhatsApp, respuestas de TripAdvisor — donde sus huéspedes puedan encontrarle.',
    onboardSectionAppTitle:  'Prepara tu aplicación y publica tu página de reservas',
    onboardStepRoomsTitle:   '1. Añade tus habitaciones.',
    onboardStepRoomsBody:    'Según tu tipo de alquiler, pueden llamarse Habitaciones, Propiedad o Unidades — distintos nombres para lo mismo: el lugar donde se alojan tus huéspedes. Abre [Habitaciones/Unidades/Propiedad] en el menú lateral, haz clic en + Añadir, completa el formulario y guarda.',
    onboardStepPhotosTitle:  '2. Añade fotos.',
    onboardStepPhotosBody:   'Haz clic en cualquier habitación y luego en Editar — ahí encontrarás la opción para subir fotos. Estas son las imágenes que los huéspedes ven en tu página de reservas.',
    onboardStepCalendarTitle: '3. Revisa tu calendario.',
    onboardStepCalendarBody:  'Una vez añadidas tus habitaciones, abre Calendario para verlas todas organizadas y listas.',
    onboardShineTitle:       'Haz que brille',
    onboardShinePhotoTitle:  'Añade una foto de tu propiedad.',
    onboardShinePhotoBody:   'En Ajustes — es la imagen principal en la parte superior de tu página de reservas, lo primero que ve un huésped.',
    onboardShineAboutTitle:  'Escribe tu texto "Sobre nosotros" y los datos "De un vistazo".',
    onboardShineAboutBody:   'También en Ajustes — esto le muestra a un visitante quién eres y qué ofreces, de un vistazo, antes incluso de desplazarse por la página.',
    onboardShineThemeTitle:  'Elige tu tema.',
    onboardShineThemeBody:   'Selecciona una combinación de colores en Ajustes — se aplica también a tu página de reservas y a tu widget, para que todo tenga realmente tu sello.',
    onboardShineOutro:       'No son extras opcionales — son lo que convierte tu página de reservas de algo vacío en algo verdaderamente atractivo.',
    onboardGuestsTitle:      '¿Ya tienes huéspedes?',
    onboardGuestsBody:       'En Huéspedes → Importar huéspedes puedes traer tu lista existente. ¿No tienes ninguna lista todavía? No te preocupes — cada nueva reserva guarda al huésped automáticamente.',
    onboardCTA:         'Ir a mi panel de NestBook →',
    onboardPrintBtn:    '💡 ¿Quieres guardar este correo como referencia? La mayoría de las aplicaciones de correo permiten imprimir desde Archivo → Imprimir, o mediante la opción de impresión de tu navegador.',
    onboardGuideIntro:  '¿Quieres ver el panorama completo? Nuestra guía de primeros pasos cubre todo, desde precios estacionales hasta tu widget de reservas. (Solo disponible en inglés por ahora — próximamente en más idiomas.)',
    onboardGuideLink:   'Leer la guía de primeros pasos →',
    // ── Shared (booking-lifecycle emails) ─────────────────────────────────
    property:              'Alojamiento',
    duration:               'Duración',
    night:                  'noche',
    nights:                 'noches',
    guestLabel:             'Huésped',
    paymentMethodLabel:     'Método de pago',
    tableCategory:          'Categoría',
    tableDescription:       'Descripción',
    tableAmount:            'Importe',
    // ── Booking approved ───────────────────────────────────────────────────
    bookingApprovedSubject:   'Reserva confirmada',
    bookingApprovedHeading:   '¡Su reserva está confirmada!',
    greatNews:                '¡Buenas noticias,',
    hasBeenApproved:          'ha sido aprobada.',
    // ── Booking declined ───────────────────────────────────────────────────
    bookingDeclinedSubject:   'Actualización de su solicitud de reserva',
    bookingDeclinedHeading:   'Actualización de su solicitud de reserva',
    bookingDeclinedBody1:     'lamentablemente, su solicitud de reserva en',
    bookingDeclinedBody2:     'para',
    bookingDeclinedBody3:     'no ha podido ser confirmada en este momento.',
    bookingDeclinedFooter:    'Lamentamos las molestias. Si desea probar con otras fechas, visite nuestra página de reservas o contáctenos directamente.',
    // ── Access details ──────────────────────────────────────────────────────
    accessSubjectPrefix:      'Sus datos de acceso para',
    accessHeading:             'Sus datos de acceso ya están listos',
    accessIntro1:              'su estancia en',
    accessIntro2:              'comienza el',
    accessIntro3:              'Aquí tiene todo lo que necesita para acceder al alojamiento.',
    accessMethodCode:          'Teclado / código de puerta',
    accessMethodKeybox:        'Caja de seguridad para llaves',
    accessMethodKeyed:         'Llave física',
    accessMethodApp:           'Aplicación de cerradura inteligente',
    accessMethodOther:         'Datos de acceso',
    checkInFromLabel:          'Llegada a partir de las',
    arrivalInstructionsTitle:  'Instrucciones de llegada',
    keyLocationPhotoTitle:     '📍 Foto de la ubicación de las llaves',
    keyLocationPhotoCaption:   'Foto de la ubicación de las llaves proporcionada por',
    accessCheckInDateLabel:    'Fecha de llegada',
    accessCheckOutDateLabel:   'Fecha de salida',
    accessFooter:              'Si tiene alguna pregunta, responda a este correo para contactar directamente con el propietario.',
    // ── Charges summary ─────────────────────────────────────────────────────
    chargesSummarySubjectSuffix: 'resumen de cargos',
    chargesSummaryThanksFor:   'Gracias por alojarse en',
    chargesSummaryIntro:       'esperamos que haya disfrutado de una estancia maravillosa. A continuación encontrará un resumen de su reserva y de los cargos adicionales generados durante su visita.',
    bookingTotalLabel:         'Total de la reserva',
    additionalChargesTitle:    'Cargos adicionales',
    chargesTotalLabel:         'Total de cargos',
    grandTotalLabel:           'Total general',
    paymentRequestLabel:       'Solicitud de pago:',
    paymentRequestBody1:       'Por favor, abone',
    paymentRequestBody2:       'directamente a',
    paymentRequestBody3:       'Si tiene alguna pregunta sobre estos cargos, responda a este correo.',
    chargesSummaryFooter1:     'Una vez confirmado el pago, recibirá un recibo completo por correo electrónico.',
    chargesSummaryFooter2:     'Gracias por elegir',
    chargesSummaryFooter3:     '— esperamos darle la bienvenida de nuevo pronto.',
    // ── Receipt ──────────────────────────────────────────────────────────────
    receiptSubjectPrefix:      'Recibo',
    receiptHeading:            'Recibo de pago',
    receiptRefLabel:           'Ref.:',
    datePaidLabel:             'Fecha de pago',
    paymentConfirmedTitle:     'Pago confirmado',
    paymentConfirmedBody:      'Gracias — su pago ha sido recibido',
    pmCash:                    'Efectivo',
    pmCard:                    'Tarjeta (en persona)',
    pmBankTransfer:            'Transferencia bancaria',
    pmOther:                   'Otro',
    pmOnline:                  'Pago en línea',
    itemisedBreakdownTitle:    'Desglose detallado',
    accommodationLabel:        'Alojamiento',
    noAdditionalCharges:       'Sin cargos adicionales',
    totalPaidLabel:            'Total pagado',
    receiptIssuedBy:           'Este recibo fue emitido por',
    receiptIssuedSuffix:       'a través de NestBook.',
    receiptIssuedDateLabel:    'Emitido:',
    // ── Stay extended ────────────────────────────────────────────────────────
    stayExtendedSubjectPrefix: 'Estancia ampliada',
    stayExtendedSubjectMid:    'ahora hasta',
    stayExtendedHeading:       '¡Buenas noticias — su estancia ha sido ampliada!',
    stayExtendedIntro1:        'Su reserva en',
    stayExtendedIntro2:        'se ha actualizado con nuevas fechas.',
    unchangedLabel:            '(sin cambios)',
    previousCheckOutLabel:     'Salida anterior',
    newCheckOutLabel:          'Nueva salida',
    newTotalLabel:             'Nuevo total',
    paymentNoteLabel:          'Nota de pago:',
    stayExtendedPaymentNote1:  'Por favor, abone el pago adicional por las noches ampliadas directamente a',
    stayExtendedPaymentNote2:  'Responda a este correo si tiene alguna pregunta.',
    // ── Stay shortened ───────────────────────────────────────────────────────
    stayShortenedSubjectPrefix: 'Reserva actualizada',
    stayShortenedSubjectMid:    'salida ahora el',
    stayShortenedHeading:       'Su reserva ha sido actualizada',
    stayShortenedIntro1:        'Su estancia en',
    stayShortenedIntro2:        'se ha acortado.',
    updatedTotalLabel:          'Total actualizado',
    stayShortenedFooter:        'Si tiene alguna pregunta sobre su reserva actualizada, responda a este correo para contactar directamente con el alojamiento.',
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
    enquiryReceived:      'Anfrage erhalten',
    yourEnquiryFor:       'Ihre Anfrage für',
    hasBeenReceived:      'wurde erhalten.',
    enquiryNextSteps:     'Der Gastgeber wird Ihre Anfrage prüfen und sich in Kürze bei Ihnen melden.',
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
    onboardHeading:     'Willkommen, wir freuen uns, dass Sie dabei sind, {name}!',
    onboardIntro:       '{property} ist jetzt live auf NestBook. So richten Sie Ihre App ein.',
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
    onboardStep5Title:  'Buchungsbutton zu Ihrer Facebook-Seite hinzufügen',
    onboardStep5Body:   'Finden Sie in den Einstellungen Facebook-Buchungsbutton — mit einer Schritt-für-Schritt-Anleitung, die genau zeigt, wie Sie einen Button zu Ihrer Facebook-Seite hinzufügen, der direkt auf Ihre Buchungsseite verlinkt.',
    onboardStep5Tip:    'Jeder, der Ihre Facebook-Seite besucht, kann jetzt direkt bei Ihnen buchen — ohne Booking.com oder Airbnb. Null Provision.',
    onboardStep6Title:  'Kalender mit Booking.com und Airbnb synchronisieren',
    onboardStep6Body:   'Finden Sie in den Einstellungen Kalender-Sync — kopieren Sie Ihre iCal-URL und fügen Sie sie zu Ihren Booking.com- und Airbnb-Konten hinzu.',
    onboardStep7Title:  'Buchungsseiten-Link überall teilen',
    onboardStep7Body:   'Kopieren Sie Ihren nestbook.io/book/ihre-unterkunft Link und fügen Sie ihn zu Ihrer Instagram-Bio, E-Mail-Signatur, WhatsApp-Status und TripAdvisor-Antworten hinzu.',
    onboardSectionAppTitle:  'Bereiten Sie Ihre App vor und bringen Sie Ihre Buchungsseite online',
    onboardStepRoomsTitle:   '1. Fügen Sie Ihre Zimmer hinzu.',
    onboardStepRoomsBody:    'Je nach Vermietungsart heißen diese Zimmer, Unterkunft oder Einheiten — unterschiedliche Namen für dasselbe: den Ort, an dem Ihre Gäste übernachten. Öffnen Sie [Zimmer/Einheiten/Unterkunft] in der Seitenleiste, klicken Sie auf + Hinzufügen, füllen Sie das Formular aus und speichern Sie.',
    onboardStepPhotosTitle:  '2. Fotos hinzufügen.',
    onboardStepPhotosBody:   'Klicken Sie auf eine Zimmerkachel, dann auf Bearbeiten — dort finden Sie den Foto-Upload. Diese Bilder sehen Gäste auf Ihrer Buchungsseite.',
    onboardStepCalendarTitle: '3. Prüfen Sie Ihren Kalender.',
    onboardStepCalendarBody:  'Sobald Ihre Zimmer hinzugefügt sind, öffnen Sie den Kalender, um sie übersichtlich dargestellt zu sehen.',
    onboardShineTitle:       'Machen Sie sie richtig ansprechend',
    onboardShinePhotoTitle:  'Fügen Sie ein Unterkunftsfoto hinzu.',
    onboardShinePhotoBody:   'In den Einstellungen — dies ist das Titelbild oben auf Ihrer Buchungsseite und das Erste, was ein Gast sieht.',
    onboardShineAboutTitle:  'Schreiben Sie Ihren „Über uns"-Text und die „Auf einen Blick"-Angaben.',
    onboardShineAboutBody:   'Ebenfalls in den Einstellungen — das zeigt Besuchern auf einen Blick, wer Sie sind und was Sie bieten, noch bevor sie scrollen.',
    onboardShineThemeTitle:  'Wählen Sie Ihr Design.',
    onboardShineThemeBody:   'Wählen Sie ein Farbschema in den Einstellungen — es überträgt sich auch auf Ihre Buchungsseite und Ihr Widget, damit alles wirklich zu Ihnen passt.',
    onboardShineOutro:       'Das sind keine optionalen Extras — sie machen den Unterschied zwischen einer kargen und einer wirklich einladenden Buchungsseite.',
    onboardGuestsTitle:      'Haben Sie bereits Gäste?',
    onboardGuestsBody:       'Unter Gäste → Gäste importieren können Sie Ihre bestehende Liste übernehmen. Noch keine Liste? Kein Problem — jede neue Buchung speichert den Gast automatisch.',
    onboardCTA:         'Zu meinem NestBook-Dashboard →',
    onboardPrintBtn:    '💡 Möchten Sie diese E-Mail als Referenz aufbewahren? Die meisten E-Mail-Programme ermöglichen den Druck über Datei → Drucken oder die Druckfunktion Ihres Browsers.',
    onboardGuideIntro:  'Möchten Sie mehr erfahren? Unser Erste-Schritte-Leitfaden deckt alles ab, von saisonalen Preisen bis zu Ihrem Buchungs-Widget. (Vorerst nur auf Englisch — weitere Sprachen folgen in Kürze.)',
    onboardGuideLink:   'Erste-Schritte-Leitfaden lesen →',
    // ── Shared (booking-lifecycle emails) ─────────────────────────────────
    property:              'Unterkunft',
    duration:               'Dauer',
    night:                  'Nacht',
    nights:                 'Nächte',
    guestLabel:             'Gast',
    paymentMethodLabel:     'Zahlungsart',
    tableCategory:          'Kategorie',
    tableDescription:       'Beschreibung',
    tableAmount:            'Betrag',
    // ── Booking approved ───────────────────────────────────────────────────
    bookingApprovedSubject:   'Buchung bestätigt',
    bookingApprovedHeading:   'Ihre Buchung ist bestätigt!',
    greatNews:                'Gute Nachrichten,',
    hasBeenApproved:          'wurde genehmigt.',
    // ── Booking declined ───────────────────────────────────────────────────
    bookingDeclinedSubject:   'Aktualisierung Ihrer Buchungsanfrage',
    bookingDeclinedHeading:   'Aktualisierung Ihrer Buchungsanfrage',
    bookingDeclinedBody1:     'leider konnte Ihre Buchungsanfrage bei',
    bookingDeclinedBody2:     'für',
    bookingDeclinedBody3:     'derzeit nicht berücksichtigt werden.',
    bookingDeclinedFooter:    'Es tut uns leid für die Unannehmlichkeiten. Wenn Sie andere Termine ausprobieren möchten, besuchen Sie bitte unsere Buchungsseite oder kontaktieren Sie uns direkt.',
    // ── Access details ──────────────────────────────────────────────────────
    accessSubjectPrefix:      'Ihre Zugangsdaten für',
    accessHeading:             'Ihre Zugangsdaten sind bereit',
    accessIntro1:              'Ihr Aufenthalt bei',
    accessIntro2:              'beginnt am',
    accessIntro3:              'Hier finden Sie alles, was Sie für den Zugang zur Unterkunft benötigen.',
    accessMethodCode:          'Zahlenschloss / Türcode',
    accessMethodKeybox:        'Schlüsselbox',
    accessMethodKeyed:         'Physischer Schlüssel',
    accessMethodApp:           'Smart-Lock-App',
    accessMethodOther:         'Zugangsdaten',
    checkInFromLabel:          'Anreise ab',
    arrivalInstructionsTitle:  'Ankunftshinweise',
    keyLocationPhotoTitle:     '📍 Foto des Schlüsselstandorts',
    keyLocationPhotoCaption:   'Foto des Schlüsselstandorts bereitgestellt von',
    accessCheckInDateLabel:    'Anreisedatum',
    accessCheckOutDateLabel:   'Abreisedatum',
    accessFooter:              'Bei Fragen antworten Sie bitte auf diese E-Mail, um den Gastgeber direkt zu kontaktieren.',
    // ── Charges summary ─────────────────────────────────────────────────────
    chargesSummarySubjectSuffix: 'Kostenübersicht',
    chargesSummaryThanksFor:   'Vielen Dank für Ihren Aufenthalt bei',
    chargesSummaryIntro:       'wir hoffen, Sie hatten einen wunderbaren Aufenthalt. Hier finden Sie eine Übersicht Ihrer Buchung sowie etwaiger zusätzlicher Kosten während Ihres Aufenthalts.',
    bookingTotalLabel:         'Buchungssumme',
    additionalChargesTitle:    'Zusätzliche Kosten',
    chargesTotalLabel:         'Summe der Zusatzkosten',
    grandTotalLabel:           'Gesamtsumme',
    paymentRequestLabel:       'Zahlungsaufforderung:',
    paymentRequestBody1:       'Bitte begleichen Sie',
    paymentRequestBody2:       'direkt bei',
    paymentRequestBody3:       'Bei Fragen zu diesen Kosten antworten Sie bitte auf diese E-Mail.',
    chargesSummaryFooter1:     'Sobald die Zahlung bestätigt ist, erhalten Sie eine vollständige Quittung per E-Mail.',
    chargesSummaryFooter2:     'Vielen Dank, dass Sie sich für',
    chargesSummaryFooter3:     'entschieden haben — wir hoffen, Sie bald wieder begrüßen zu dürfen.',
    // ── Receipt ──────────────────────────────────────────────────────────────
    receiptSubjectPrefix:      'Quittung',
    receiptHeading:            'Zahlungsquittung',
    receiptRefLabel:           'Ref.:',
    datePaidLabel:             'Zahlungsdatum',
    paymentConfirmedTitle:     'Zahlung bestätigt',
    paymentConfirmedBody:      'Vielen Dank — Ihre Zahlung ist eingegangen',
    pmCash:                    'Bargeld',
    pmCard:                    'Karte (vor Ort)',
    pmBankTransfer:            'Banküberweisung',
    pmOther:                   'Sonstiges',
    pmOnline:                  'Online-Zahlung',
    itemisedBreakdownTitle:    'Detaillierte Aufstellung',
    accommodationLabel:        'Unterkunft',
    noAdditionalCharges:       'Keine zusätzlichen Kosten',
    totalPaidLabel:            'Gesamtbetrag bezahlt',
    receiptIssuedBy:           'Diese Quittung wurde ausgestellt von',
    receiptIssuedSuffix:       'über NestBook.',
    receiptIssuedDateLabel:    'Ausgestellt am:',
    // ── Stay extended ────────────────────────────────────────────────────────
    stayExtendedSubjectPrefix: 'Aufenthalt verlängert',
    stayExtendedSubjectMid:    'jetzt bis',
    stayExtendedHeading:       'Gute Nachrichten — Ihr Aufenthalt wurde verlängert!',
    stayExtendedIntro1:        'Ihre Buchung bei',
    stayExtendedIntro2:        'wurde mit neuen Terminen aktualisiert.',
    unchangedLabel:            '(unverändert)',
    previousCheckOutLabel:     'Bisherige Abreise',
    newCheckOutLabel:          'Neue Abreise',
    newTotalLabel:             'Neuer Gesamtbetrag',
    paymentNoteLabel:          'Zahlungshinweis:',
    stayExtendedPaymentNote1:  'Bitte begleichen Sie die zusätzliche Zahlung für die verlängerten Nächte direkt bei',
    stayExtendedPaymentNote2:  'Antworten Sie auf diese E-Mail, falls Sie Fragen haben.',
    // ── Stay shortened ───────────────────────────────────────────────────────
    stayShortenedSubjectPrefix: 'Buchung aktualisiert',
    stayShortenedSubjectMid:    'Abreise nun am',
    stayShortenedHeading:       'Ihre Buchung wurde aktualisiert',
    stayShortenedIntro1:        'Ihr Aufenthalt bei',
    stayShortenedIntro2:        'wurde verkürzt.',
    updatedTotalLabel:          'Aktualisierter Gesamtbetrag',
    stayShortenedFooter:        'Bei Fragen zu Ihrer aktualisierten Buchung antworten Sie bitte auf diese E-Mail, um die Unterkunft direkt zu kontaktieren.',
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
    enquiryReceived:      'Aanvraag ontvangen',
    yourEnquiryFor:       'Uw aanvraag voor',
    hasBeenReceived:      'is ontvangen.',
    enquiryNextSteps:     'De eigenaar bekijkt uw aanvraag en neemt binnenkort contact met u op.',
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
    onboardHeading:     'Welkom, wat fijn dat je erbij bent, {name}!',
    onboardIntro:       '{property} staat nu live op NestBook. Zo richt je je app in.',
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
    onboardStep5Title:  'Voeg een boekingsknop toe aan uw Facebook-pagina',
    onboardStep5Body:   'Vind in Instellingen Facebook-boekingsknop — u vindt een stapsgewijze handleiding die precies laat zien hoe u een knop aan uw Facebook-pagina toevoegt die rechtstreeks naar uw boekingspagina linkt.',
    onboardStep5Tip:    'Iedereen die uw Facebook-pagina bezoekt kan nu rechtstreeks bij u boeken — zonder Booking.com of Airbnb. Nul commissie.',
    onboardStep6Title:  'Synchroniseer uw kalender met Booking.com en Airbnb',
    onboardStep6Body:   'Vind in Instellingen Kalendersynchronisatie — kopieer uw iCal-URL en voeg deze toe aan uw Booking.com- en Airbnb-accounts.',
    onboardStep7Title:  'Deel uw boekingspaginalink overal',
    onboardStep7Body:   'Kopieer uw nestbook.io/book/uw-accommodatie link en voeg hem toe aan uw Instagram-bio, e-mailhandtekening, WhatsApp-status en TripAdvisor-reacties.',
    onboardSectionAppTitle:  'Maak je app klaar en zet je boekingspagina live',
    onboardStepRoomsTitle:   '1. Voeg je kamers toe.',
    onboardStepRoomsBody:    'Afhankelijk van je type verhuur kunnen deze Kamers, Accommodatie of Units heten — verschillende namen voor hetzelfde: de plek waar je gasten verblijven. Open [Kamers/Units/Accommodatie] in het menu, klik op + Toevoegen, vul het formulier in en sla op.',
    onboardStepPhotosTitle:  "2. Voeg foto's toe.",
    onboardStepPhotosBody:   "Klik op een kamertegel en daarna op Bewerken — daar vind je de foto-upload. Dit zijn de afbeeldingen die gasten op je boekingspagina zien.",
    onboardStepCalendarTitle: '3. Bekijk je kalender.',
    onboardStepCalendarBody:  'Zodra je kamers zijn toegevoegd, open je de Kalender om ze overzichtelijk en klaar te zien staan.',
    onboardShineTitle:       'Laat het stralen',
    onboardShinePhotoTitle:  'Voeg een foto van je accommodatie toe.',
    onboardShinePhotoBody:   'In Instellingen — dit is de hoofdafbeelding bovenaan je boekingspagina, het eerste wat een gast ziet.',
    onboardShineAboutTitle:  'Schrijf je "Over ons"-tekst en "In één oogopslag"-gegevens.',
    onboardShineAboutBody:   'Ook in Instellingen — dit laat een bezoeker in één oogopslag zien wie je bent en wat je te bieden hebt, nog voordat er wordt gescrold.',
    onboardShineThemeTitle:  'Kies je thema.',
    onboardShineThemeBody:   'Kies een kleurenschema in Instellingen — dit werkt ook door op je boekingspagina en widget, zodat alles echt van jou voelt.',
    onboardShineOutro:       "Dit zijn geen optionele extra's — ze maken het verschil tussen een kale boekingspagina en een echt uitnodigende.",
    onboardGuestsTitle:      'Heb je al gasten?',
    onboardGuestsBody:       'Ga naar Gasten → Gasten importeren om je bestaande lijst toe te voegen. Nog geen lijst? Geen probleem — elke nieuwe boeking slaat de gast automatisch op.',
    onboardCTA:         'Ga naar mijn NestBook-dashboard →',
    onboardPrintBtn:    "💡 Wil je deze e-mail als naslagwerk bewaren? De meeste e-mailprogramma's laten je afdrukken via Bestand → Afdrukken, of via de afdrukoptie van je browser.",
    onboardGuideIntro:  'Wil je het hele plaatje zien? Onze Aan de slag-gids behandelt alles, van seizoensprijzen tot je boekingswidget. (Voorlopig alleen in het Engels — meer talen volgen binnenkort.)',
    onboardGuideLink:   'Lees de Aan de slag-gids →',
    // ── Shared (booking-lifecycle emails) ─────────────────────────────────
    property:              'Accommodatie',
    duration:               'Duur',
    night:                  'nacht',
    nights:                 'nachten',
    guestLabel:             'Gast',
    paymentMethodLabel:     'Betaalmethode',
    tableCategory:          'Categorie',
    tableDescription:       'Omschrijving',
    tableAmount:            'Bedrag',
    // ── Booking approved ───────────────────────────────────────────────────
    bookingApprovedSubject:   'Boeking bevestigd',
    bookingApprovedHeading:   'Uw boeking is bevestigd!',
    greatNews:                'Goed nieuws,',
    hasBeenApproved:          'is goedgekeurd.',
    // ── Booking declined ───────────────────────────────────────────────────
    bookingDeclinedSubject:   'Update over uw boekingsaanvraag',
    bookingDeclinedHeading:   'Update over uw boekingsaanvraag',
    bookingDeclinedBody1:     'helaas kon uw boekingsaanvraag bij',
    bookingDeclinedBody2:     'voor',
    bookingDeclinedBody3:     'op dit moment niet worden gehonoreerd.',
    bookingDeclinedFooter:    'Onze excuses voor het ongemak. Wilt u andere data proberen, bezoek dan onze boekingspagina of neem rechtstreeks contact met ons op.',
    // ── Access details ──────────────────────────────────────────────────────
    accessSubjectPrefix:      'Uw toegangsgegevens voor',
    accessHeading:             'Uw toegangsgegevens zijn klaar',
    accessIntro1:              'uw verblijf bij',
    accessIntro2:              'begint op',
    accessIntro3:              'Hier vindt u alles wat u nodig heeft om toegang te krijgen tot de accommodatie.',
    accessMethodCode:          'Codeslot / deurcode',
    accessMethodKeybox:        'Sleutelkluisje',
    accessMethodKeyed:         'Fysieke sleutel',
    accessMethodApp:           'Slim-slot-app',
    accessMethodOther:         'Toegangsgegevens',
    checkInFromLabel:          'Inchecken vanaf',
    arrivalInstructionsTitle:  'Aankomstinstructies',
    keyLocationPhotoTitle:     '📍 Foto van de sleutellocatie',
    keyLocationPhotoCaption:   'Foto van de sleutellocatie, aangeleverd door',
    accessCheckInDateLabel:    'Aankomstdatum',
    accessCheckOutDateLabel:   'Vertrekdatum',
    accessFooter:              'Heeft u vragen? Beantwoord deze e-mail om rechtstreeks contact op te nemen met de eigenaar.',
    // ── Charges summary ─────────────────────────────────────────────────────
    chargesSummarySubjectSuffix: 'overzicht van kosten',
    chargesSummaryThanksFor:   'Bedankt voor uw verblijf bij',
    chargesSummaryIntro:       'we hopen dat u een fantastisch verblijf heeft gehad. Hieronder vindt u een overzicht van uw boeking en eventuele extra kosten tijdens uw verblijf.',
    bookingTotalLabel:         'Totaal boeking',
    additionalChargesTitle:    'Extra kosten',
    chargesTotalLabel:         'Totaal extra kosten',
    grandTotalLabel:           'Eindtotaal',
    paymentRequestLabel:       'Betalingsverzoek:',
    paymentRequestBody1:       'Wilt u een bedrag van',
    paymentRequestBody2:       'rechtstreeks voldoen aan',
    paymentRequestBody3:       'Heeft u vragen over deze kosten? Beantwoord dan deze e-mail.',
    chargesSummaryFooter1:     'Zodra de betaling is bevestigd, ontvangt u een volledige kwitantie per e-mail.',
    chargesSummaryFooter2:     'Bedankt dat u voor',
    chargesSummaryFooter3:     'heeft gekozen — we hopen u snel weer te mogen verwelkomen.',
    // ── Receipt ──────────────────────────────────────────────────────────────
    receiptSubjectPrefix:      'Kwitantie',
    receiptHeading:            'Betalingskwitantie',
    receiptRefLabel:           'Ref.:',
    datePaidLabel:             'Betaaldatum',
    paymentConfirmedTitle:     'Betaling bevestigd',
    paymentConfirmedBody:      'Bedankt — uw betaling is ontvangen',
    pmCash:                    'Contant',
    pmCard:                    'Kaart (ter plaatse)',
    pmBankTransfer:            'Bankoverschrijving',
    pmOther:                   'Overig',
    pmOnline:                  'Online betaling',
    itemisedBreakdownTitle:    'Gespecificeerd overzicht',
    accommodationLabel:        'Accommodatie',
    noAdditionalCharges:       'Geen extra kosten',
    totalPaidLabel:            'Totaal betaald',
    receiptIssuedBy:           'Deze kwitantie is uitgegeven door',
    receiptIssuedSuffix:       'via NestBook.',
    receiptIssuedDateLabel:    'Uitgegeven op:',
    // ── Stay extended ────────────────────────────────────────────────────────
    stayExtendedSubjectPrefix: 'Verblijf verlengd',
    stayExtendedSubjectMid:    'nu tot',
    stayExtendedHeading:       'Goed nieuws — uw verblijf is verlengd!',
    stayExtendedIntro1:        'Uw boeking bij',
    stayExtendedIntro2:        'is bijgewerkt met nieuwe data.',
    unchangedLabel:            '(ongewijzigd)',
    previousCheckOutLabel:     'Vorige vertrekdatum',
    newCheckOutLabel:          'Nieuwe vertrekdatum',
    newTotalLabel:             'Nieuw totaal',
    paymentNoteLabel:          'Betalingsopmerking:',
    stayExtendedPaymentNote1:  'Wilt u de extra betaling voor de verlengde nachten rechtstreeks voldoen aan',
    stayExtendedPaymentNote2:  'Beantwoord deze e-mail als u vragen heeft.',
    // ── Stay shortened ───────────────────────────────────────────────────────
    stayShortenedSubjectPrefix: 'Boeking bijgewerkt',
    stayShortenedSubjectMid:    'vertrek nu op',
    stayShortenedHeading:       'Uw boeking is bijgewerkt',
    stayShortenedIntro1:        'Uw verblijf bij',
    stayShortenedIntro2:        'is ingekort.',
    updatedTotalLabel:          'Bijgewerkt totaal',
    stayShortenedFooter:        'Heeft u vragen over uw bijgewerkte boeking? Beantwoord dan deze e-mail om rechtstreeks contact op te nemen met de accommodatie.',
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
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr>
        <td style="background:#405440;border-radius:12px 12px 0 0;padding:24px 32px;text-align:center;">
          <table cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle;margin-right:10px;">
            <tr>
              <td style="background:#405440;border-radius:9px;width:40px;height:40px;text-align:center;">
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
        <td style="background:#fff;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e0ddd6;border-top:none;">
          ${bodyHtml}
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:0.75rem;color:#405440;">nestbook.io · hello@nestbook.io</p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// Property-branded wrapper helper — used by all guest-facing transactional emails.
// Falls back to a property-initial avatar when no logo has been uploaded.
function guestMailerHtml(bodyHtml, property) {
  const logoAbsUrl = property?.logo_url
    ? `${process.env.APP_BASE_URL || 'https://nestbook.io'}/uploads/logos/${property.logo_url}`
    : null;
  return wrapGuestMailerEmail(bodyHtml, {
    propertyName:    property?.name || '',
    logoAbsUrl,
    ctaEnabled:      false,
    mailerSignature: property?.mailer_signature || null,
  });
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
                 color:#405440;width:40%;vertical-align:top;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;
                 color:#405440;font-weight:600;vertical-align:top;">${value}</td>
    </tr>`;

  const body = `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#405440;">
      ${t(locale, 'bookingConfirmed')} ✓
    </h1>
    <p style="margin:0 0 24px;font-size:0.95rem;color:#405440;">
      ${t(locale, 'dear')} ${booking.guest_first_name},<br>
      ${t(locale, 'yourBookingAt')} <strong>${property.name}</strong> ${t(locale, 'isConfirmed')}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0ede8;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
      <tr>
        ${!isWP ? row(t(locale, 'room'), booking.room_name ?? '—') : ''}
        ${row(t(locale, 'checkIn'),   `${checkInDate}${property.check_in_time  ? ' &mdash; ' + t(locale, 'from') + ' ' + property.check_in_time  : ''}`)}
        ${row(t(locale, 'checkOut'),  `${checkOutDate}${property.check_out_time ? ' &mdash; ' + t(locale, 'by')   + ' ' + property.check_out_time : ''}`)}
        ${row(t(locale, 'guests'),    String(booking.num_guests ?? 1))}
        ${row(t(locale, 'bookingRef'), `#${booking.id}`)}
        ${addressParts ? row(t(locale, 'address'), addressParts) : ''}
        ${property.breakfast_included ? row('', `<span style="color:#405440;font-weight:700;">🍳 ${t(locale,'breakfastIncluded')}</span>`) : ''}
        ${property.require_deposit && property.deposit_amount ? row(t(locale,'depositRequired'), `<span style="color:#92400e;font-weight:700;">${fmtDepositAmount(property.deposit_amount, property.currency)}</span>`) : ''}
      </tr>
    </table>

    <p style="margin:0 0 24px;font-size:0.875rem;color:#405440;line-height:1.6;">
      ${t(locale, 'questions')}
    </p>`;

  return body;
}

// ── Pro upgrade email HTML ────────────────────────────────────────────────────

function proUpgradeHtml(user, property, periodEnd) {
  const locale = user?.language ?? 'en';

  const featureItem = (text) => `
    <tr>
      <td style="padding:6px 0;font-size:0.875rem;color:#405440;border-bottom:1px solid #e5e7eb;">
        <span style="color:#405440;font-weight:700;margin-right:8px;">✓</span>${text}
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
    <h1 style="margin:0 0 8px;font-size:1.4rem;font-weight:700;color:#405440;">
      ${t(locale, 'proUpgradeHeading')}
    </h1>
    <p style="margin:0 0 6px;font-size:1rem;color:#405440;">Hi ${user.name},</p>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#405440;">${t(locale, 'proUpgradeIntro')}</p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0ede8;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      ${featureItem(t(locale, 'proFeature1'))}
      ${featureItem(t(locale, 'proFeature2'))}
      ${featureItem(t(locale, 'proFeature3'))}
      ${featureItem(t(locale, 'proFeature4'))}
      ${featureItem(t(locale, 'proFeature5'))}
      ${featureItem(t(locale, 'proFeature6'))}
    </table>

    ${trialHtml}

    <p style="margin:0 0 8px;font-size:0.82rem;font-weight:700;text-transform:uppercase;
              letter-spacing:0.5px;color:#405440;">${t(locale, 'proWidgetTitle')}</p>
    <p style="margin:0 0 8px;font-size:0.82rem;color:#405440;">${t(locale, 'proWidgetDesc')}</p>
    <div style="background:#1e293b;border-radius:6px;padding:12px 16px;margin-bottom:24px;overflow-x:auto;">
      <code style="color:#86efac;font-family:monospace;font-size:0.78rem;word-break:break-all;">${widgetCode}</code>
    </div>

    <div style="text-align:center;margin-bottom:20px;">
      <a href="https://nestbook.io/app/dashboard"
         style="display:inline-block;background:#405440;color:#fff;text-decoration:none;
                padding:13px 28px;border-radius:8px;font-size:0.9rem;font-weight:600;margin-right:8px;">
        ${t(locale, 'upgradeDashboard')} →
      </a>
      <a href="https://nestbook.io/help"
         style="display:inline-block;background:#f0ede8;color:#405440;text-decoration:none;
                padding:13px 28px;border-radius:8px;font-size:0.9rem;font-weight:600;">
        ${t(locale, 'proHelpLink')}
      </a>
    </div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;">
    <p style="margin:0;font-size:0.78rem;color:#405440;text-align:center;line-height:1.5;">
      ${t(locale, 'upgradeSupport')}
    </p>`;

  return shell(body);
}

// ── Multi upgrade email HTML ──────────────────────────────────────────────────

function multiUpgradeHtml(user, property) {
  const locale = user?.language ?? 'en';

  const featureItem = (text) => `
    <tr>
      <td style="padding:6px 0;font-size:0.875rem;color:#405440;border-bottom:1px solid #e5e7eb;">
        <span style="color:#405440;font-weight:700;margin-right:8px;">✓</span>${text}
      </td>
    </tr>`;

  const body = `
    <h1 style="margin:0 0 8px;font-size:1.4rem;font-weight:700;color:#405440;">
      ${t(locale, 'multiUpgradeHeading')}
    </h1>
    <p style="margin:0 0 6px;font-size:1rem;color:#405440;">Hi ${user.name},</p>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#405440;">${t(locale, 'multiUpgradeIntro')}</p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0ede8;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      ${featureItem(t(locale, 'multiFeature1'))}
      ${featureItem(t(locale, 'multiFeature2'))}
      ${featureItem(t(locale, 'multiFeature3'))}
      ${featureItem(t(locale, 'multiFeature4'))}
      ${featureItem(t(locale, 'multiFeature5'))}
      ${featureItem(t(locale, 'multiFeature6'))}
    </table>

    <div style="background:#f0ede8;border-radius:8px;padding:14px 18px;margin-bottom:24px;
                border-left:3px solid #405440;">
      <p style="margin:0 0 6px;font-size:0.83rem;color:#405440;">💡 ${t(locale, 'multiAddPropHint')}</p>
      <p style="margin:0;font-size:0.83rem;color:#405440;">💡 ${t(locale, 'multiChargesHint')}</p>
    </div>

    <div style="text-align:center;margin-bottom:20px;">
      <a href="https://nestbook.io/app/dashboard"
         style="display:inline-block;background:#405440;color:#fff;text-decoration:none;
                padding:13px 28px;border-radius:8px;font-size:0.9rem;font-weight:600;margin-right:8px;">
        ${t(locale, 'upgradeDashboard')} →
      </a>
      <a href="https://nestbook.io/help"
         style="display:inline-block;background:#f0ede8;color:#405440;text-decoration:none;
                padding:13px 28px;border-radius:8px;font-size:0.9rem;font-weight:600;">
        ${t(locale, 'upgradeHelp')}
      </a>
    </div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;">
    <p style="margin:0;font-size:0.78rem;color:#405440;text-align:center;line-height:1.5;">
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
      html:    guestMailerHtml(bookingConfirmationHtml(booking, property ?? {}), property ?? {}),
    });
    console.log(`[email] Booking confirmation sent → ${booking.guest_email}`);
  } catch (err) {
    console.error('[email] Failed to send booking confirmation:', err.message);
  }
}

// ── Enquiry received (to guest) ──────────────────────────────────────────────
// Immediate receipt for the WP/Free-plan enquiry flow (enquiries.js) — sent
// on submission, separate from and in addition to the eventual approve/
// decline outcome email (sendBookingApprovedEmail/sendBookingDeclinedEmail
// below, which are English-only). Localized via property.locale using the
// same t()/T pattern as sendBookingConfirmation above, since that's the
// established convention for guest-facing transactional email in this file —
// the outcome emails not being localized looks like a pre-existing gap
// rather than something worth repeating in new code.
//
// Takes plain fields rather than a full booking row because the WP/free-plan
// fallback branch of enquiries.js never creates a bookings row at all — only
// the rooms-mode branch does.
function enquiryReceivedHtml({ guestFirstName, checkInDate, checkOutDate, numGuests }, property) {
  const locale = property.locale ?? 'en';
  const checkIn  = fmtDate(checkInDate,  locale);
  const checkOut = fmtDate(checkOutDate, locale);

  const row = (label, value) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;
                 color:#405440;width:40%;vertical-align:top;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;
                 color:#405440;font-weight:600;vertical-align:top;">${value}</td>
    </tr>`;

  return `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#405440;">
      ${t(locale, 'enquiryReceived')}
    </h1>
    <p style="margin:0 0 24px;font-size:0.95rem;color:#405440;">
      ${t(locale, 'dear')} ${guestFirstName},<br>
      ${t(locale, 'yourEnquiryFor')} <strong>${property.name}</strong> ${t(locale, 'hasBeenReceived')}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0ede8;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
      <tr>
        ${row(t(locale, 'checkIn'),  checkIn)}
        ${row(t(locale, 'checkOut'), checkOut)}
        ${numGuests ? row(t(locale, 'guests'), String(numGuests)) : ''}
      </tr>
    </table>

    <p style="margin:0 0 20px;font-size:0.875rem;color:#405440;line-height:1.6;">
      ${t(locale, 'enquiryNextSteps')}
    </p>
    <p style="margin:0 0 24px;font-size:0.875rem;color:#405440;line-height:1.6;">
      ${t(locale, 'questions')}
    </p>`;
}

/**
 * Send the guest an immediate receipt for their enquiry — confirms it was
 * received and sets the expectation the owner will respond. Separate from
 * the eventual approve/decline outcome email.
 * @param {object} params — { guestFirstName, guestEmail, checkInDate, checkOutDate, numGuests }
 * @param {object} property — property row from the DB
 */
export async function sendEnquiryReceivedEmail(params, property) {
  if (!resend) return;
  if (!params?.guestEmail) return;

  const locale  = property?.locale ?? 'en';
  const subject = `${t(locale, 'enquiryReceived')} — ${property?.name ?? 'NestBook'}`;

  try {
    await resend.emails.send({
      from:    FROM,
      to:      params.guestEmail,
      subject,
      html:    guestMailerHtml(enquiryReceivedHtml(params, property ?? {}), property ?? {}),
    });
    console.log(`[email] Enquiry received email sent → ${params.guestEmail}`);
  } catch (err) {
    console.error('[email] Failed to send enquiry received email:', err.message);
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
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#405440;width:40%;vertical-align:top;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#405440;font-weight:600;vertical-align:top;">${value}</td>
    </tr>`;

  const body = `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#405440;">
      ${t(locale, 'depositRequestHeading')}
    </h1>
    <p style="margin:0 0 24px;font-size:0.95rem;color:#405440;">
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
        ${booking.balance_amount > 0 ? row('Balance due', `<span style="color:#405440;">${fmtDepositAmount(booking.balance_amount, property.currency)}</span>`) : ''}
        ${addressParts ? row(t(locale, 'address'), addressParts) : ''}
      </tr>
    </table>

    <p style="margin:0 0 24px;font-size:0.875rem;color:#405440;line-height:1.6;">
      ${t(locale, 'depositPaymentInstr')}
    </p>`;

  try {
    await resend.emails.send({ from: FROM, to: booking.guest_email, subject, html: guestMailerHtml(body, property) });
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
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#405440;width:40%;vertical-align:top;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#405440;font-weight:600;vertical-align:top;">${value}</td>
    </tr>`;

  const body = `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#405440;">
      ${t(locale, 'depositConfirmHeading')} ✓
    </h1>
    <p style="margin:0 0 24px;font-size:0.95rem;color:#405440;">
      ${t(locale, 'dear')} ${booking.guest_first_name},<br>
      ${t(locale, 'depositConfirmBody')}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0ede8;border-radius:8px;padding:20px 24px;margin-bottom:24px;">
      <tr>
        ${!isWP ? row(t(locale, 'room'), booking.room_name ?? '—') : ''}
        ${row(t(locale, 'checkIn'),    fmtDate(booking.check_in_date,  locale))}
        ${row(t(locale, 'checkOut'),   fmtDate(booking.check_out_date, locale))}
        ${row(t(locale, 'bookingRef'), `#${booking.id}`)}
        ${(booking.deposit_amount ?? property?.deposit_amount) ? row(t(locale, 'depositConfirmDetails'), `<span style="color:#405440;font-weight:700;">${fmtDepositAmount(booking.deposit_amount ?? property.deposit_amount, property.currency)}</span>`) : ''}
        ${booking.balance_amount > 0 ? row('Balance remaining', `<span style="color:#405440;">${fmtDepositAmount(booking.balance_amount, property.currency)}</span>`) : ''}
      </tr>
    </table>`;

  try {
    await resend.emails.send({ from: FROM, to: booking.guest_email, subject, html: guestMailerHtml(body, property) });
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
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#405440;width:40%;vertical-align:top;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#405440;font-weight:600;vertical-align:top;">${value}</td>
    </tr>`;

  const body = `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#405440;">
      Balance due reminder
    </h1>
    <p style="margin:0 0 24px;font-size:0.95rem;color:#405440;">
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

    <p style="margin:0 0 24px;font-size:0.875rem;color:#405440;line-height:1.6;">
      Please arrange payment at your earliest convenience. Contact us if you have any questions.
    </p>`;

  try {
    await resend.emails.send({ from: FROM, to: booking.guest_email, subject, html: guestMailerHtml(body, property) });
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
    <h2 style="margin:0 0 16px;font-size:1.1rem;color:#405440;">New contact message</h2>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0ede8;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <tr><td style="padding:6px 0;font-size:0.82rem;color:#405440;width:30%;">Name</td>
          <td style="padding:6px 0;font-size:0.875rem;color:#405440;font-weight:600;">${name}</td></tr>
      <tr><td style="padding:6px 0;font-size:0.82rem;color:#405440;">Email</td>
          <td style="padding:6px 0;font-size:0.875rem;color:#405440;font-weight:600;">${email}</td></tr>
    </table>
    <p style="font-size:0.875rem;color:#405440;line-height:1.7;white-space:pre-wrap;">${message}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 12px;">
    <p style="font-size:0.75rem;color:#405440;">Reply directly to this email to respond to ${name}.</p>`);
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
    <h1 style="margin:0 0 8px;font-size:1.4rem;font-weight:700;color:#405440;">
      ${t(lang, 'verifyHeading')}
    </h1>
    <p style="margin:0 0 6px;font-size:1rem;color:#405440;">
      Hi ${user.name},
    </p>
    <p style="margin:0 0 28px;font-size:0.95rem;color:#405440;line-height:1.6;">
      ${t(lang, 'verifyBody')}
    </p>

    <div style="text-align:center;margin-bottom:28px;">
      <a href="${link}"
         style="display:inline-block;background:#405440;color:#fff;text-decoration:none;
                padding:13px 32px;border-radius:8px;font-size:0.9rem;font-weight:600;">
        ${t(lang, 'verifyButton')}
      </a>
    </div>

    <p style="margin:0 0 16px;font-size:0.82rem;color:#405440;line-height:1.6;">
      ${t(lang, 'verifyExpiry')}<br>
      <a href="${link}" style="color:#405440;word-break:break-all;">${link}</a>
    </p>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 16px;">
    <p style="margin:0;font-size:0.75rem;color:#405440;text-align:center;">
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
 * Send a Pro upgrade welcome email.
 * @param {object} user      — { name, email }
 * @param {object} property  — { id, name, locale, ... }
 * @param {string} periodEnd — ISO date string for the trial/billing period end
 */
export async function sendUpgradeWelcome(user, property, periodEnd) {
  console.log('[email] sendUpgradeWelcome called — user:', user?.email, '| property id:', property?.id, '| resend ready:', !!resend);
  if (!resend) { console.warn('[email] Skipping — resend not initialised'); return; }
  if (!user?.email) { console.warn('[email] Skipping — no user email'); return; }
  const locale = user?.language ?? 'en';
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
  const locale = user?.language ?? 'en';
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
        <div style="background:#405440;padding:24px;border-radius:8px 8px 0 0;">
          <img src="https://nestbook.io/icon-192.png" style="width:36px;height:36px;border-radius:8px;vertical-align:middle;" alt="">
          <span style="color:#fff;font-size:20px;font-weight:700;margin-left:12px;vertical-align:middle;">NestBook</span>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e0ddd6;border-top:none;border-radius:0 0 8px 8px;">
          <h2 style="color:#405440;margin:0 0 12px;">Reset your password</h2>
          <p style="color:#405440;margin:0 0 20px;">We received a request to reset your NestBook password. Click the button below to choose a new one.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#405440;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;margin-bottom:20px;">Reset my password</a>
          <p style="color:#405440;font-size:0.85rem;margin:0;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
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
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#405440;background:#fff;border:1px solid #e0ddd6;border-radius:8px;">
        <div style="margin-bottom:24px">
          <span style="background:#405440;color:#fff;padding:6px 14px;border-radius:6px;font-weight:700;font-size:1rem">NestBook</span>
        </div>
        <h2 style="font-size:1.4rem;font-weight:800;margin:0 0 12px">We couldn't process your payment</h2>
        <p style="color:#405440;line-height:1.6;margin:0 0 16px">Your recent NestBook subscription payment was unsuccessful.</p>
        <p style="color:#405440;line-height:1.6;margin:0 0 24px">To keep your Pro access, please update your payment details:</p>
        ${invoiceUrl ? `<a href="${invoiceUrl}" style="display:inline-block;background:#405440;color:#fff;padding:12px 24px;border-radius:7px;text-decoration:none;font-weight:700;margin-bottom:24px">Update payment details →</a>` : ''}
        <p style="color:#405440;line-height:1.6;margin:0 0 16px">If your payment isn't resolved within 7 days, your account will be moved to the Free plan. Your data will be kept safe.</p>
        <p style="color:#405440;font-size:0.875rem">Questions? Reply to this email or contact <a href="mailto:hello@nestbook.io" style="color:#405440">hello@nestbook.io</a></p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
        <p style="color:#405440;font-size:0.78rem;margin:0">NestBook — Property Management Software</p>
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
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#405440;background:#fff;border:1px solid #e0ddd6;border-radius:8px;">
        <div style="margin-bottom:24px">
          <span style="background:#405440;color:#fff;padding:6px 14px;border-radius:6px;font-weight:700;font-size:1rem">NestBook</span>
        </div>
        <h2 style="font-size:1.4rem;font-weight:800;margin:0 0 12px">Your account has been moved to the Free plan</h2>
        <p style="color:#405440;line-height:1.6;margin:0 0 16px">Because we were unable to process your payment, your NestBook account has been moved to the Free plan.</p>
        <p style="color:#405440;line-height:1.6;margin:0 0 16px">Your data is safe — all your bookings, guests and rooms are still there.</p>
        <p style="color:#405440;line-height:1.6;margin:0 0 24px">To restore Pro access, simply update your payment details and resubscribe:</p>
        <a href="https://nestbook.io/app/pricing" style="display:inline-block;background:#405440;color:#fff;padding:12px 24px;border-radius:7px;text-decoration:none;font-weight:700;margin-bottom:24px">Resubscribe to Pro →</a>
        <p style="color:#405440;font-size:0.875rem">Questions? We're here at <a href="mailto:hello@nestbook.io" style="color:#405440">hello@nestbook.io</a></p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
        <p style="color:#405440;font-size:0.78rem;margin:0">NestBook — Property Management Software</p>
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
        <blockquote style="border-left:3px solid #e2e8f0;margin:8px 0;padding:8px 16px;color:#405440">
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
  if (!resend) {
    console.log(`[email] Approval request email skipped (Resend not configured) — booking #${booking.id}`);
    return;
  }
  const ownerEmail = property?.owner_email;
  if (!ownerEmail) return;

  const guestName  = `${booking.guest_first_name} ${booking.guest_last_name}`;
  const subject    = `New booking request — ${guestName} · ${property?.name ?? 'NestBook'}`;

  const body = `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#405440;">New Booking Request</h1>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#405440;">
      A guest has submitted a booking request for <strong>${property?.name ?? ''}</strong>.
      Please review the details below and approve or decline.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0ede8;border-radius:8px;padding:20px 24px;margin-bottom:24px;border:1px solid #405440;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#405440;width:40%;vertical-align:top;">Guest</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#405440;font-weight:600;">${guestName}</td>
      </tr>
      ${booking.room_name ? `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#405440;vertical-align:top;">${property?.rental_type === 'units' ? 'Unit' : 'Room'}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#405440;font-weight:600;">${booking.room_name}</td>
      </tr>` : ''}
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#405440;vertical-align:top;">Email</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#405440;font-weight:600;">${booking.guest_email ?? '—'}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#405440;vertical-align:top;">Phone</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#405440;font-weight:600;">${booking.guest_phone ?? '—'}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#405440;vertical-align:top;">Check-in</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#405440;font-weight:600;">${booking.check_in_date}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#405440;vertical-align:top;">Check-out</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#405440;font-weight:600;">${booking.check_out_date}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#405440;vertical-align:top;">Guests</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#405440;font-weight:600;">${booking.num_guests ?? 1}</td>
      </tr>
      ${booking.notes ? `<tr><td style="padding:10px 0;font-size:0.82rem;color:#405440;vertical-align:top;">Notes</td><td style="padding:10px 0;font-size:0.875rem;color:#405440;">${booking.notes}</td></tr>` : ''}
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding-right:8px;">
          <a href="${approveUrl}" style="display:block;text-align:center;padding:14px 0;background:#405440;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:1rem;">
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
    <p style="margin:0;font-size:0.82rem;color:#405440;line-height:1.6;">
      You can also manage this booking from your <a href="https://nestbook.io/app" style="color:#405440;">NestBook dashboard</a>.
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
    <p style="margin:0;font-size:0.72rem;color:#405440;text-align:center;">Powered by NestBook</p>`;

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

  const locale  = property?.locale ?? 'en';
  const subject = `${t(locale, 'bookingApprovedSubject')} — ${property?.name ?? 'NestBook'}`;
  const nights  = Math.round((new Date(booking.check_out_date) - new Date(booking.check_in_date)) / 86400000);
  const checkInDate  = fmtDate(booking.check_in_date,  locale);
  const checkOutDate = fmtDate(booking.check_out_date, locale);

  const body = `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#405440;">${t(locale, 'bookingApprovedHeading')}</h1>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#405440;">
      ${t(locale, 'greatNews')} ${booking.guest_first_name}! ${t(locale, 'yourBookingAt')} <strong>${property?.name ?? ''}</strong> ${t(locale, 'hasBeenApproved')}
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0ede8;border-radius:8px;padding:20px 24px;margin-bottom:24px;border:1px solid #405440;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#405440;width:40%;vertical-align:top;">${t(locale, 'property')}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#405440;font-weight:600;">${property?.name ?? '—'}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#405440;vertical-align:top;">${t(locale, 'checkIn')}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#405440;font-weight:600;">${checkInDate}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#405440;vertical-align:top;">${t(locale, 'checkOut')}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#405440;font-weight:600;">${checkOutDate}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#405440;vertical-align:top;">${t(locale, 'duration')}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#405440;font-weight:600;">${nights} ${nights !== 1 ? t(locale, 'nights') : t(locale, 'night')}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#405440;vertical-align:top;">${t(locale, 'guests')}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.875rem;color:#405440;font-weight:600;">${booking.num_guests ?? 1}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;font-size:0.82rem;color:#405440;vertical-align:top;">${t(locale, 'bookingRef')}</td>
        <td style="padding:10px 0;font-size:0.875rem;color:#405440;font-weight:600;">#${booking.id}</td>
      </tr>
    </table>
    <p style="margin:0 0 24px;font-size:0.875rem;color:#405440;line-height:1.6;">
      ${t(locale, 'questions')}
    </p>`;

  try {
    await resend.emails.send({ from: FROM, to: booking.guest_email, subject, html: guestMailerHtml(body, property) });
    console.log(`[email] Booking approved email sent → ${booking.guest_email}`);
  } catch (err) {
    console.error('[email] Failed to send booking approved email:', err.message);
  }
}

// ── WP booking declined (to guest) ───────────────────────────────────────────
export async function sendBookingDeclinedEmail(booking, property) {
  if (!resend) return;
  if (!booking?.guest_email) return;

  const locale  = property?.locale ?? 'en';
  const subject = `${t(locale, 'bookingDeclinedSubject')} — ${property?.name ?? 'NestBook'}`;
  const checkInDate  = fmtDate(booking.check_in_date,  locale);
  const checkOutDate = fmtDate(booking.check_out_date, locale);

  const body = `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#405440;">${t(locale, 'bookingDeclinedHeading')}</h1>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#405440;">
      ${t(locale, 'dear')} ${booking.guest_first_name}, ${t(locale, 'bookingDeclinedBody1')} <strong>${property?.name ?? ''}</strong>
      ${t(locale, 'bookingDeclinedBody2')} ${checkInDate} – ${checkOutDate} ${t(locale, 'bookingDeclinedBody3')}
    </p>
    <p style="margin:0 0 24px;font-size:0.875rem;color:#405440;line-height:1.6;">
      ${t(locale, 'bookingDeclinedFooter')}
    </p>`;

  try {
    await resend.emails.send({ from: FROM, to: booking.guest_email, subject, html: guestMailerHtml(body, property) });
    console.log(`[email] Booking declined email sent → ${booking.guest_email}`);
  } catch (err) {
    console.error('[email] Failed to send booking declined email:', err.message);
  }
}

// ── WP access code / arrival instructions (to guest before check-in) ─────────
// accessInfo carries the access_method/access_code/arrival_instructions/access_photo
// fields to use — defaults to `property` so every existing WP call site (which
// passes just booking + property) behaves identically to before. Units-mode
// callers pass the booking's own unit (a rooms row) as accessInfo instead,
// since each unit carries its own access fields rather than the property's.
export async function sendAccessEmail(booking, property, accessInfo = property) {
  if (!resend) return;
  if (!booking?.guest_email) return;
  if (!accessInfo?.arrival_instructions && !accessInfo?.access_code) return;

  const locale = property?.locale ?? 'en';
  const ACCESS_METHOD_LABELS = {
    code:   t(locale, 'accessMethodCode'),
    keybox: t(locale, 'accessMethodKeybox'),
    keyed:  t(locale, 'accessMethodKeyed'),
    app:    t(locale, 'accessMethodApp'),
    other:  t(locale, 'accessMethodOther'),
  };
  const methodLabel = ACCESS_METHOD_LABELS[accessInfo.access_method] ?? t(locale, 'accessMethodOther');
  const guestName   = `${booking.guest_first_name} ${booking.guest_last_name}`;
  const checkInDate  = fmtDate(booking.check_in_date,  locale);
  const checkOutDate = fmtDate(booking.check_out_date, locale);
  const subject     = `${t(locale, 'accessSubjectPrefix')} ${property.name} — ${checkInDate}`;

  const accessBlock = accessInfo.access_code ? `
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0ede8;border-radius:8px;padding:20px 24px;margin-bottom:24px;border:1px solid #405440;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#405440;width:40%;">${methodLabel}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:1.1rem;color:#405440;font-weight:800;letter-spacing:2px;">${accessInfo.access_code}</td>
      </tr>
      ${property.check_in_time ? `<tr><td style="padding:10px 0;font-size:0.82rem;color:#405440;">${t(locale, 'checkInFromLabel')}</td><td style="padding:10px 0;font-size:0.875rem;color:#405440;font-weight:600;">${property.check_in_time}</td></tr>` : ''}
    </table>` : '';

  const instructionsBlock = accessInfo.arrival_instructions ? `
    <div style="background:#fffbf0;border:1px solid #fcd34d;border-radius:8px;padding:18px 20px;margin-bottom:24px;">
      <div style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#b45309;margin-bottom:8px;">${t(locale, 'arrivalInstructionsTitle')}</div>
      <div style="font-size:0.9rem;color:#405440;line-height:1.7;white-space:pre-line;">${accessInfo.arrival_instructions}</div>
    </div>` : '';

  const appBase = (process.env.APP_URL ?? 'https://nestbook.io').replace(/\/$/, '');
  const photoPath = accessInfo.access_photo
    ? path.join(__dirname, '../uploads/access', accessInfo.access_photo)
    : null;
  const photoBlock = photoPath && fs.existsSync(photoPath) ? `
    <div style="margin-bottom:24px;">
      <div style="font-size:0.78rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#405440;margin-bottom:10px;">${t(locale, 'keyLocationPhotoTitle')}</div>
      <img src="${appBase}/uploads/access/${accessInfo.access_photo}"
           alt="Key location"
           style="width:100%;max-width:500px;border-radius:8px;border:1px solid #e2e8f0;display:block;" />
      <p style="font-size:0.75rem;color:#405440;margin:6px 0 0;">${t(locale, 'keyLocationPhotoCaption')} ${property.name}</p>
    </div>` : '';

  const body = `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#405440;">${t(locale, 'accessHeading')}</h1>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#405440;">
      ${t(locale, 'dear')} ${guestName}, ${t(locale, 'accessIntro1')} <strong>${property.name}</strong> ${t(locale, 'accessIntro2')} <strong>${checkInDate}</strong>.
      ${t(locale, 'accessIntro3')}
    </p>
    ${accessBlock}
    ${instructionsBlock}
    ${photoBlock}
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#405440;width:40%;">${t(locale, 'accessCheckInDateLabel')}</td>
        <td style="padding:6px 0;font-size:0.875rem;color:#405440;font-weight:600;">${checkInDate}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#405440;">${t(locale, 'accessCheckOutDateLabel')}</td>
        <td style="padding:6px 0;font-size:0.875rem;color:#405440;font-weight:600;">${checkOutDate}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#405440;">${t(locale, 'guests')}</td>
        <td style="padding:6px 0;font-size:0.875rem;color:#405440;font-weight:600;">${booking.num_guests ?? 1}</td>
      </tr>
    </table>
    <p style="margin:0 0 24px;font-size:0.875rem;color:#405440;line-height:1.6;">
      ${t(locale, 'accessFooter')}
    </p>`;

  try {
    await resend.emails.send({ from: FROM, to: booking.guest_email, subject, html: guestMailerHtml(body, property) });
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

  const locale        = property?.locale ?? 'en';
  const currency      = property?.currency ?? 'GBP';
  const chargesTotal  = outstanding.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const bookingTotal  = parseFloat(booking.total_price) || 0;
  const grandTotal    = bookingTotal + chargesTotal;
  const guestName     = `${booking.guest_first_name} ${booking.guest_last_name}`;
  const checkInDate   = fmtDate(booking.check_in_date,  locale);
  const checkOutDate  = fmtDate(booking.check_out_date, locale);

  const chargeRows = outstanding.map((c) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#405440;">
        ${c.category_name ?? '—'}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:0.82rem;color:#405440;">
        ${c.description ?? '—'}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:0.875rem;
                 color:#405440;font-weight:600;text-align:right;">
        ${fmtDepositAmount(c.amount, currency)}
      </td>
    </tr>`).join('');

  const body = `
    <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#405440;">
      ${t(locale, 'chargesSummaryThanksFor')} ${property.name}
    </h1>
    <p style="margin:0 0 24px;font-size:0.875rem;color:#405440;line-height:1.6;">
      ${t(locale, 'dear')} ${guestName}, ${t(locale, 'chargesSummaryIntro')}
    </p>

    <!-- Booking summary -->
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0ede8;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#405440;width:140px;">${t(locale, 'property')}</td>
        <td style="padding:6px 0;font-size:0.875rem;font-weight:600;color:#405440;">${property.name}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#405440;">${t(locale, 'checkIn')}</td>
        <td style="padding:6px 0;font-size:0.875rem;color:#405440;">${checkInDate}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#405440;">${t(locale, 'checkOut')}</td>
        <td style="padding:6px 0;font-size:0.875rem;color:#405440;">${checkOutDate}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#405440;">${t(locale, 'bookingTotalLabel')}</td>
        <td style="padding:6px 0;font-size:0.875rem;font-weight:600;color:#405440;">
          ${fmtDepositAmount(bookingTotal, currency)}
        </td>
      </tr>
    </table>

    <!-- Additional charges -->
    <h3 style="margin:0 0 12px;font-size:0.95rem;font-weight:700;color:#405440;">${t(locale, 'additionalChargesTitle')}</h3>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      <thead>
        <tr style="background:#f0ede8;">
          <th style="padding:10px 12px;font-size:0.72rem;font-weight:700;text-transform:uppercase;
                     letter-spacing:0.05em;color:#405440;text-align:left;">${t(locale, 'tableCategory')}</th>
          <th style="padding:10px 12px;font-size:0.72rem;font-weight:700;text-transform:uppercase;
                     letter-spacing:0.05em;color:#405440;text-align:left;">${t(locale, 'tableDescription')}</th>
          <th style="padding:10px 12px;font-size:0.72rem;font-weight:700;text-transform:uppercase;
                     letter-spacing:0.05em;color:#405440;text-align:right;">${t(locale, 'tableAmount')}</th>
        </tr>
      </thead>
      <tbody>${chargeRows}</tbody>
      <tfoot>
        <tr style="background:#f0ede8;">
          <td colspan="2" style="padding:10px 12px;font-weight:700;font-size:0.875rem;color:#405440;">
            ${t(locale, 'chargesTotalLabel')}
          </td>
          <td style="padding:10px 12px;font-weight:700;font-size:0.875rem;
                     color:#405440;text-align:right;">
            ${fmtDepositAmount(chargesTotal, currency)}
          </td>
        </tr>
      </tfoot>
    </table>

    <!-- Grand total -->
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#405440;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <tr>
        <td style="color:white;font-weight:700;font-size:1rem;">${t(locale, 'grandTotalLabel')}</td>
        <td style="color:white;font-weight:800;font-size:1.25rem;text-align:right;">
          ${fmtDepositAmount(grandTotal, currency)}
        </td>
      </tr>
    </table>

    <!-- Payment request -->
    <div style="background:#fffbf0;border-left:4px solid #f59e0b;padding:14px 18px;
                border-radius:0 8px 8px 0;margin-bottom:24px;">
      <p style="margin:0;font-size:0.875rem;color:#78350f;line-height:1.6;">
        <strong>${t(locale, 'paymentRequestLabel')}</strong> ${t(locale, 'paymentRequestBody1')}
        <strong>${fmtDepositAmount(grandTotal, currency)}</strong>
        ${t(locale, 'paymentRequestBody2')} ${property.name}. ${t(locale, 'paymentRequestBody3')}
      </p>
    </div>

    <p style="margin:0 0 24px;font-size:0.82rem;color:#405440;line-height:1.6;">
      ${t(locale, 'chargesSummaryFooter1')}
      ${t(locale, 'chargesSummaryFooter2')} ${property.name} ${t(locale, 'chargesSummaryFooter3')}
    </p>`;

  try {
    await resend.emails.send({
      from:    FROM,
      to:      booking.guest_email,
      replyTo: ownerEmail || undefined,
      subject: `${property.name} — ${t(locale, 'chargesSummarySubjectSuffix')}`,
      html:    guestMailerHtml(body, property),
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

  const locale       = property?.locale ?? 'en';
  const currency     = property?.currency ?? 'GBP';
  const outstanding  = charges.filter((c) => !c.voided_at);
  const chargesTotal = outstanding.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const bookingTotal = parseFloat(booking.total_price) || 0;
  const grandTotal   = bookingTotal + chargesTotal;
  const receiptRef   = `NB-${booking.id}-${new Date().getFullYear()}`;
  const nights       = Math.round(
    (new Date(booking.check_out_date) - new Date(booking.check_in_date)) / 86400000
  );
  const todayStr     = new Date().toISOString().slice(0, 10);

  const PM_RECEIPT_LABELS = {
    cash:          t(locale, 'pmCash'),
    card:          t(locale, 'pmCard'),
    bank_transfer: t(locale, 'pmBankTransfer'),
    other:         t(locale, 'pmOther'),
  };
  const pmLabel = PM_RECEIPT_LABELS[booking.payment_method]
    ?? (booking.stripe_payment_status === 'paid' ? t(locale, 'pmOnline') : null);

  const chargeRows = outstanding.length > 0
    ? outstanding.map((c) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;
                     font-size:0.82rem;color:#405440;">${c.category_name ?? '—'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;
                     font-size:0.82rem;color:#405440;">${c.description ?? '—'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;
                     font-size:0.875rem;color:#405440;font-weight:600;text-align:right;">
            ${fmtDepositAmount(c.amount, currency)}
          </td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding:12px;font-size:0.82rem;color:#405440;
               text-align:center;">No additional charges</td></tr>`;

  const body = `
    <!-- Receipt header -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td>
          <h1 style="margin:0 0 4px;font-size:1.4rem;font-weight:700;color:#405440;">
            ${t(locale, 'receiptHeading')}
          </h1>
          <p style="margin:0;font-size:0.78rem;color:#405440;">${t(locale, 'receiptRefLabel')} ${receiptRef}</p>
        </td>
        <td style="text-align:right;vertical-align:top;">
          <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;
                      letter-spacing:0.05em;color:#405440;margin-bottom:3px;">${t(locale, 'datePaidLabel')}</div>
          <div style="font-size:0.875rem;font-weight:600;color:#405440;">
            ${fmtDate(todayStr, locale)}
          </div>
        </td>
      </tr>
    </table>

    <!-- Paid badge -->
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0ede8;border:1.5px solid #405440;border-radius:8px;
                  padding:12px 16px;margin-bottom:24px;">
      <tr>
        <td style="color:#405440;font-size:1.1rem;width:28px;">✓</td>
        <td>
          <div style="font-weight:700;color:#405440;font-size:0.875rem;">${t(locale, 'paymentConfirmedTitle')}</div>
          <div style="font-size:0.78rem;color:#405440;margin-top:2px;">
            ${t(locale, 'paymentConfirmedBody')}
          </div>
        </td>
      </tr>
    </table>

    <!-- Stay details -->
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#405440;width:140px;">${t(locale, 'property')}</td>
        <td style="padding:6px 0;font-size:0.875rem;font-weight:600;color:#405440;">${property.name}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#405440;">${t(locale, 'guestLabel')}</td>
        <td style="padding:6px 0;font-size:0.875rem;color:#405440;">
          ${booking.guest_first_name} ${booking.guest_last_name}
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#405440;">${t(locale, 'checkIn')}</td>
        <td style="padding:6px 0;font-size:0.875rem;color:#405440;">
          ${fmtDate(booking.check_in_date, locale)}
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#405440;">${t(locale, 'checkOut')}</td>
        <td style="padding:6px 0;font-size:0.875rem;color:#405440;">
          ${fmtDate(booking.check_out_date, locale)}
        </td>
      </tr>
      ${pmLabel ? `<tr>
        <td style="padding:6px 0;font-size:0.82rem;color:#405440;">${t(locale, 'paymentMethodLabel')}</td>
        <td style="padding:6px 0;font-size:0.875rem;color:#405440;">${pmLabel}</td>
      </tr>` : ''}
    </table>

    <!-- Itemised breakdown -->
    <h3 style="margin:0 0 12px;font-size:0.95rem;font-weight:700;color:#405440;">
      ${t(locale, 'itemisedBreakdownTitle')}
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <thead>
        <tr style="background:#f0ede8;">
          <th style="padding:10px 12px;font-size:0.72rem;font-weight:700;text-transform:uppercase;
                     letter-spacing:0.05em;color:#405440;text-align:left;">${t(locale, 'tableCategory')}</th>
          <th style="padding:10px 12px;font-size:0.72rem;font-weight:700;text-transform:uppercase;
                     letter-spacing:0.05em;color:#405440;text-align:left;">${t(locale, 'tableDescription')}</th>
          <th style="padding:10px 12px;font-size:0.72rem;font-weight:700;text-transform:uppercase;
                     letter-spacing:0.05em;color:#405440;text-align:right;">${t(locale, 'tableAmount')}</th>
        </tr>
      </thead>
      <tbody>
        <!-- Accommodation row -->
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;
                     font-size:0.82rem;color:#405440;">${t(locale, 'accommodationLabel')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;
                     font-size:0.82rem;color:#405440;">${nights} ${nights !== 1 ? t(locale, 'nights') : t(locale, 'night')}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;
                     font-size:0.875rem;color:#405440;font-weight:600;text-align:right;">
            ${fmtDepositAmount(bookingTotal, currency)}
          </td>
        </tr>
        ${chargeRows}
      </tbody>
      <tfoot>
        <tr style="background:#405440;">
          <td colspan="2" style="padding:14px 12px;font-weight:700;
                                  font-size:0.95rem;color:white;">${t(locale, 'totalPaidLabel')}</td>
          <td style="padding:14px 12px;font-weight:800;font-size:1.1rem;
                     color:white;text-align:right;">
            ${fmtDepositAmount(grandTotal, currency)}
          </td>
        </tr>
      </tfoot>
    </table>

    <p style="margin:0 0 24px;font-size:0.78rem;color:#405440;text-align:center;line-height:1.6;">
      ${t(locale, 'receiptIssuedBy')} ${property.name} ${t(locale, 'receiptIssuedSuffix')}<br>
      ${t(locale, 'receiptRefLabel')} ${receiptRef} · ${t(locale, 'receiptIssuedDateLabel')} ${fmtDate(todayStr, locale)}
    </p>`;

  try {
    await resend.emails.send({
      from:    FROM,
      to:      booking.guest_email,
      replyTo: ownerEmail || undefined,
      subject: `${t(locale, 'receiptSubjectPrefix')} — ${property.name} · ${fmtDate(booking.check_in_date, locale)}`,
      html:    guestMailerHtml(body, property),
    });
    console.log(`[receipt-email] Sent → ${booking.guest_email} (booking ${booking.id})`);
  } catch (err) {
    console.error('[receipt-email] Failed:', err.message);
  }
}

// ── Free-plan welcome email (sent after onboarding completes) ─────────────────

function welcomeEmailHTML(user, property) {
  const lang      = user.language || 'en';
  const rawFirst  = (user.name?.split(' ')[0] || '').replace(/[,;]+$/, '').trim();
  const firstName = rawFirst || 'there';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t(lang, 'onboardSubject')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: #ffffff; color: #405440; line-height: 1.6; }
    .wrapper { max-width: 620px; margin: 0 auto; background: white; border: 1px solid #e0ddd6; border-radius: 8px; overflow: hidden; }
    .header { background: #405440; padding: 28px 32px; text-align: left; }
    .header-logo { font-size: 22px; font-weight: 700; color: white; letter-spacing: -0.02em; }
    .header-logo span { color: #f0ede8; font-weight: 400; }
    .hero { background: #f0ede8; border-bottom: 3px solid #405440; padding: 36px 32px 28px; }
    .hero-tag { display: inline-block; background: #f0ede8; color: #405440; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 3px 10px; border-radius: 20px; margin-bottom: 14px; }
    .hero h1 { font-size: 26px; font-weight: 700; color: #405440; margin-bottom: 10px; line-height: 1.25; }
    .hero p { font-size: 15px; color: #405440; max-width: 480px; line-height: 1.7; }
    .body { padding: 32px 32px 0; }
    .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #405440; margin: 28px 0 16px; }
    .step { margin-bottom: 18px; }
    .step-title { font-size: 15px; font-weight: 700; color: #405440; margin-bottom: 4px; }
    .step-desc { font-size: 14px; color: #405440; line-height: 1.65; }
    .divider { height: 1px; background: #e2e8f0; margin: 28px 0; }
    .cta-wrap { text-align: center; padding: 28px 32px; }
    .cta-btn { display: inline-block; background: #405440; color: white !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
    .cta-sub { font-size: 12px; color: #405440; margin-top: 10px; }
    .footer { background: #ffffff; border-top: 1px solid #e2e8f0; padding: 24px 32px; text-align: center; }
    .footer p { font-size: 12px; color: #405440; line-height: 1.7; }
    .footer a { color: #405440; text-decoration: none; }
    @media print {
      body { background: white; }
      .header { background: #405440 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .print-wrap, .cta-wrap, .footer { display: none; }
    }
    @media (max-width: 480px) {
      .body { padding: 24px 20px 0; }
      .hero { padding: 24px 20px; }
      .hero h1 { font-size: 22px; }
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
    <h1>${t(lang, 'onboardHeading').replace('{name}', firstName)}</h1>
    <p>${t(lang, 'onboardIntro').replace('{property}', `<strong>${property?.name || 'Your property'}</strong>`)}</p>
  </div>

  <div class="body">

    <div class="section-title">${t(lang, 'onboardSectionAppTitle')}</div>

    <div class="step">
      <div class="step-title">${t(lang, 'onboardStepRoomsTitle')}</div>
      <div class="step-desc">${t(lang, 'onboardStepRoomsBody')}</div>
    </div>
    <div class="step">
      <div class="step-title">${t(lang, 'onboardStepPhotosTitle')}</div>
      <div class="step-desc">${t(lang, 'onboardStepPhotosBody')}</div>
    </div>
    <div class="step">
      <div class="step-title">${t(lang, 'onboardStepCalendarTitle')}</div>
      <div class="step-desc">${t(lang, 'onboardStepCalendarBody')}</div>
    </div>

    <div class="section-title">${t(lang, 'onboardShineTitle')}</div>

    <div class="step">
      <div class="step-title">${t(lang, 'onboardShinePhotoTitle')}</div>
      <div class="step-desc">${t(lang, 'onboardShinePhotoBody')}</div>
    </div>
    <div class="step">
      <div class="step-title">${t(lang, 'onboardShineAboutTitle')}</div>
      <div class="step-desc">${t(lang, 'onboardShineAboutBody')}</div>
    </div>
    <div class="step">
      <div class="step-title">${t(lang, 'onboardShineThemeTitle')}</div>
      <div class="step-desc">${t(lang, 'onboardShineThemeBody')}</div>
    </div>

    <p style="font-size:14px;color:#405440;line-height:1.7;margin-bottom:20px;">${t(lang, 'onboardShineOutro')}</p>

    <div class="step">
      <div class="step-title">${t(lang, 'onboardGuestsTitle')}</div>
      <div class="step-desc">${t(lang, 'onboardGuestsBody')}</div>
    </div>

    <p style="font-size:15px;color:#405440;line-height:1.7;margin-bottom:20px;">${t(lang, 'onboardGuideIntro')}</p>

    <div style="text-align:center;margin-bottom:28px;">
      <a href="https://nestbook.io/nestbook-getting-started-guide.pdf"
         style="display:inline-block;background:#f0ede8;color:#405440;text-decoration:none;padding:11px 24px;border-radius:8px;font-size:14px;font-weight:700;border:1.5px solid #405440;">
        ${t(lang, 'onboardGuideLink')}
      </a>
    </div>

    <div class="divider"></div>

  </div>

  <div class="cta-wrap">
    <a href="https://nestbook.io/app" class="cta-btn">${t(lang, 'onboardCTA')}</a>
    <p class="cta-sub">nestbook.io/app</p>
  </div>

  <p style="text-align:center;font-size:12px;color:#405440;margin:0 0 20px;line-height:1.6;">
    ${t(lang, 'onboardPrintBtn')}
  </p>

  <div class="footer">
    <p>
      You're receiving this because you signed up to NestBook.<br>
      <a href="https://nestbook.io">nestbook.io</a> &nbsp;·&nbsp;
      <a href="mailto:hello@nestbook.io">hello@nestbook.io</a> &nbsp;·&nbsp;
      <a href="https://nestbook.io/app/settings">Manage your account</a> &nbsp;·&nbsp;
      <a href="https://nestbook.io/help">Help centre</a>
    </p>
  </div>

</div>
</body>
</html>`;
}

/**
 * Send a welcome email to a newly-onboarded Free plan user.
 * @param {object} user     — { name, email, language }
 * @param {object} property — { name }
 */
export async function sendFreeWelcomeEmail(user, property) {
  if (!resend) return;
  if (!user?.email) return;
  const lang = user.language || 'en';
  try {
    await resend.emails.send({
      from:    'NestBook <hello@nestbook.io>',
      to:      user.email,
      subject: t(lang, 'onboardSubject'),
      html:    welcomeEmailHTML(user, property ?? {}),
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
    <h1 style="margin:0 0 4px;font-size:1.3rem;font-weight:700;color:#405440;">
      Action may be needed
    </h1>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#405440;">
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
       style="display:inline-block;background:#405440;color:white;padding:12px 24px;
              border-radius:8px;text-decoration:none;font-weight:700;font-size:0.875rem;">
      View booking →
    </a>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;">
    <p style="margin:0;font-size:0.72rem;color:#405440;text-align:center;">NestBook · Powered by nestbook.io</p>`;

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
    <h1 style="margin:0 0 4px;font-size:1.3rem;font-weight:700;color:#405440;">
      Departure day
    </h1>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#405440;">
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
       style="display:inline-block;background:#405440;color:white;padding:12px 24px;
              border-radius:8px;text-decoration:none;font-weight:700;font-size:0.875rem;">
      Confirm departure →
    </a>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;">
    <p style="margin:0;font-size:0.72rem;color:#405440;text-align:center;">NestBook · Powered by nestbook.io</p>`;

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
  const locale = property?.locale ?? 'en';
  const extraNights = Math.ceil(
    (new Date(newCheckOut) - new Date(booking.check_out_date)) / (1000 * 60 * 60 * 24)
  );
  const currency = property.currency || 'GBP';
  const newCheckOutDate = fmtDate(newCheckOut, locale);

  const body = `
    <h2 style="color:#405440;font-size:20px;margin:0 0 8px;">${t(locale, 'stayExtendedHeading')}</h2>
    <p style="color:#405440;font-size:14px;margin:0 0 24px;line-height:1.6;">
      ${t(locale, 'stayExtendedIntro1')} <strong>${property.name}</strong> ${t(locale, 'stayExtendedIntro2')}
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:8px 0;color:#405440;font-size:14px;width:160px;">${t(locale, 'property')}</td>
        <td style="padding:8px 0;font-weight:600;font-size:14px;">${property.name}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#405440;font-size:14px;">${t(locale, 'checkIn')}</td>
        <td style="padding:8px 0;font-size:14px;">${fmtDate(booking.check_in_date, locale)} <span style="color:#405440;">${t(locale, 'unchangedLabel')}</span></td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#405440;font-size:14px;">${t(locale, 'previousCheckOutLabel')}</td>
        <td style="padding:8px 0;font-size:14px;color:#405440;text-decoration:line-through;">${fmtDate(booking.check_out_date, locale)}</td>
      </tr>
      <tr style="background:#f0ede8;">
        <td style="padding:10px 12px;color:#405440;font-size:14px;font-weight:700;">${t(locale, 'newCheckOutLabel')}</td>
        <td style="padding:10px 12px;font-weight:700;font-size:14px;color:#405440;">
          ${newCheckOutDate}
          <span style="background:#f0ede8;color:#405440;font-size:11px;padding:2px 7px;border-radius:4px;margin-left:6px;">
            +${extraNights} ${extraNights !== 1 ? t(locale, 'nights') : t(locale, 'night')}
          </span>
        </td>
      </tr>
      <tr style="border-top:2px solid #e2e8f0;">
        <td style="padding:12px 0;color:#405440;font-size:14px;font-weight:700;">${t(locale, 'newTotalLabel')}</td>
        <td style="padding:12px 0;font-weight:800;font-size:18px;color:#405440;">${fmtDepositAmount(newTotal, currency)}</td>
      </tr>
    </table>
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:0 8px 8px 0;">
      <p style="color:#78350f;font-size:14px;margin:0;line-height:1.6;">
        <strong>${t(locale, 'paymentNoteLabel')}</strong> ${t(locale, 'stayExtendedPaymentNote1')} ${property.name}. ${t(locale, 'stayExtendedPaymentNote2')}
      </p>
    </div>`;

  try {
    await resend.emails.send({
      from: FROM,
      to: booking.guest_email,
      replyTo: ownerEmail || undefined,
      subject: `${t(locale, 'stayExtendedSubjectPrefix')} — ${property.name} · ${t(locale, 'stayExtendedSubjectMid')} ${newCheckOutDate}`,
      html: guestMailerHtml(body, property),
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
  const locale = property?.locale ?? 'en';
  const nightsRemoved = Math.ceil(
    (new Date(booking.check_out_date) - new Date(newCheckOut)) / (1000 * 60 * 60 * 24)
  );
  const currency = property.currency || 'GBP';
  const newCheckOutDate = fmtDate(newCheckOut, locale);

  const body = `
    <h2 style="color:#405440;font-size:20px;margin:0 0 8px;">${t(locale, 'stayShortenedHeading')}</h2>
    <p style="color:#405440;font-size:14px;margin:0 0 24px;line-height:1.6;">
      ${t(locale, 'stayShortenedIntro1')} <strong>${property.name}</strong> ${t(locale, 'stayShortenedIntro2')}
    </p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:8px 0;color:#405440;font-size:14px;width:160px;">${t(locale, 'property')}</td>
        <td style="padding:8px 0;font-weight:600;font-size:14px;">${property.name}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#405440;font-size:14px;">${t(locale, 'checkIn')}</td>
        <td style="padding:8px 0;font-size:14px;">${fmtDate(booking.check_in_date, locale)} <span style="color:#405440;">${t(locale, 'unchangedLabel')}</span></td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#405440;font-size:14px;">${t(locale, 'previousCheckOutLabel')}</td>
        <td style="padding:8px 0;font-size:14px;color:#405440;text-decoration:line-through;">${fmtDate(booking.check_out_date, locale)}</td>
      </tr>
      <tr style="background:#fef2f2;">
        <td style="padding:10px 12px;color:#dc2626;font-size:14px;font-weight:700;">${t(locale, 'newCheckOutLabel')}</td>
        <td style="padding:10px 12px;font-weight:700;font-size:14px;color:#dc2626;">
          ${newCheckOutDate}
          <span style="background:#fca5a5;color:#dc2626;font-size:11px;padding:2px 7px;border-radius:4px;margin-left:6px;">
            −${nightsRemoved} ${nightsRemoved !== 1 ? t(locale, 'nights') : t(locale, 'night')}
          </span>
        </td>
      </tr>
      <tr style="border-top:2px solid #e2e8f0;">
        <td style="padding:12px 0;color:#405440;font-size:14px;font-weight:700;">${t(locale, 'updatedTotalLabel')}</td>
        <td style="padding:12px 0;font-weight:800;font-size:18px;color:#405440;">${fmtDepositAmount(newTotal, currency)}</td>
      </tr>
    </table>
    <p style="color:#405440;font-size:14px;line-height:1.6;">
      ${t(locale, 'stayShortenedFooter')}
    </p>`;

  try {
    await resend.emails.send({
      from: FROM,
      to: booking.guest_email,
      replyTo: ownerEmail || undefined,
      subject: `${t(locale, 'stayShortenedSubjectPrefix')} — ${property.name} · ${t(locale, 'stayShortenedSubjectMid')} ${newCheckOutDate}`,
      html: guestMailerHtml(body, property),
    });
    console.log(`[stay-shortened] Email sent to ${booking.guest_email}`);
  } catch (err) {
    console.error('[stay-shortened] Email failed:', err.message);
  }
}

export async function sendProWelcomeEmail(user, discountCode, trialEnd, discountInfo = null) {
  if (!resend) return;
  if (!user?.email) return;
  const lang = user.language || 'en';
  const firstName = user.name?.split(' ')[0] || 'there';
  const isPartialDiscount = discountInfo?.isPartial === true;
  const hasDuration = trialEnd != null;
  const expiryStr = hasDuration
    ? trialEnd.toLocaleDateString(LOCALE_MAP[lang] ?? 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const featureItem = (title, desc) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
        <span style="color:#405440;font-weight:700;margin-right:8px;">✓</span>
        <strong style="font-size:0.875rem;color:#405440;">${title}</strong>
        <div style="font-size:0.8rem;color:#405440;margin-top:2px;padding-left:20px;">${desc}</div>
      </td>
    </tr>`;

  const pct   = discountInfo?.percent ?? 0;
  const months = discountInfo?.months  ?? null;
  const discountEndDate = discountInfo?.discountEnd ?? null;
  const discountEndStr = discountEndDate
    ? (discountEndDate instanceof Date ? discountEndDate : new Date(discountEndDate))
        .toLocaleDateString(LOCALE_MAP[lang] ?? 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const discountEndNote = {
    en: discountEndStr ? ` Your ${pct}% discount continues until ${discountEndStr}, after which standard pricing applies.` : '',
    fr: discountEndStr ? ` Votre réduction de ${pct}% est valable jusqu'au ${discountEndStr}, après quoi les tarifs standard s'appliquent.` : '',
    de: discountEndStr ? ` Ihr Rabatt von ${pct}% gilt bis zum ${discountEndStr}, danach gelten die Standardpreise.` : '',
    es: discountEndStr ? ` Su descuento del ${pct}% es válido hasta el ${discountEndStr}, tras lo cual se aplican las tarifas estándar.` : '',
    nl: discountEndStr ? ` Uw korting van ${pct}% geldt tot ${discountEndStr}, waarna de standaardtarieven van toepassing zijn.` : '',
  };

  const PARTIAL_BILLING_NOTE = {
    en: `Please add a payment method before ${expiryStr} — your first charge (at the ${pct}% discounted rate) will be on that date.${discountEndNote.en}`,
    fr: `Veuillez ajouter un moyen de paiement avant le ${expiryStr} — votre premier prélèvement (au tarif réduit de ${pct}%) aura lieu à cette date.${discountEndNote.fr}`,
    de: `Bitte fügen Sie vor dem ${expiryStr} eine Zahlungsmethode hinzu — Ihre erste Abbuchung (zum ermäßigten Preis von ${pct}%) erfolgt an diesem Datum.${discountEndNote.de}`,
    es: `Por favor, añada un método de pago antes del ${expiryStr} — su primer cargo (al precio reducido del ${pct}%) se realizará en esa fecha.${discountEndNote.es}`,
    nl: `Voeg vóór ${expiryStr} een betaalmethode toe — uw eerste betaling (tegen het verlaagde tarief van ${pct}%) vindt plaats op die datum.${discountEndNote.nl}`,
  };

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

  const activeNote = isPartialDiscount
    ? (PARTIAL_BILLING_NOTE[lang] ?? PARTIAL_BILLING_NOTE.en)
    : (BILLING_NOTE[lang] ?? BILLING_NOTE.en);

  const billingSection = (!isPartialDiscount && !hasDuration) ? `
    <div style="background:#f0ede8;border-left:4px solid #405440;
                padding:14px 18px;border-radius:0 8px 8px 0;margin:0 0 24px;">
      <p style="color:#405440;font-size:0.875rem;margin:0;line-height:1.6;">
        ${activeNote}
      </p>
    </div>` : `
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;
                padding:14px 18px;border-radius:0 8px 8px 0;margin:0 0 24px;">
      <p style="color:#78350f;font-size:0.875rem;margin:0;line-height:1.6;">
        ${activeNote}
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
    <h1 style="margin:0 0 8px;font-size:1.4rem;font-weight:700;color:#405440;">
      ${t(lang, 'proWelcomeHeading')}
    </h1>
    <p style="margin:0 0 6px;font-size:1rem;color:#405440;">Hi ${firstName},</p>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#405440;line-height:1.6;">
      ${t(lang, 'proWelcomeBody')}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0ede8;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      ${features.map(f => featureItem(f, '')).join('')}
    </table>

    ${billingSection}

    <a href="https://nestbook.io/app"
       style="display:inline-block;background:#405440;color:white;text-decoration:none;
              padding:13px 28px;border-radius:8px;font-size:0.9rem;font-weight:600;">
      ${CTА_LABEL[lang] ?? CTА_LABEL.en}
    </a>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;">
    <p style="margin:0;font-size:0.78rem;color:#405440;text-align:center;line-height:1.5;">
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
    <h1 style="margin:0 0 8px;font-size:1.4rem;font-weight:700;color:#405440;">
      ${isUrgent ? 'Action needed — Pro access expiring soon' : 'Your NestBook Pro promotional period is ending'}
    </h1>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#405440;line-height:1.6;">Hi ${firstName},</p>

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

    <p style="color:#405440;font-size:0.875rem;line-height:1.6;margin-bottom:20px;">
      Just a reminder that your promotional Pro access ends on <strong>${expiryDate}</strong>.
      ${isUrgent
        ? ' Please add your payment details today to avoid any interruption to your service.'
        : ' Add your payment details before that date to continue uninterrupted.'}
    </p>

    <p style="color:#405440;font-size:0.875rem;line-height:1.6;margin-bottom:24px;">
      Your card will <strong>not be charged</strong> until ${expiryDate}.
      Cancel anytime before ${expiryDate} to stay on the free plan — no questions asked.
    </p>

    <a href="https://nestbook.io/app/settings"
       style="display:inline-block;background:${isUrgent ? '#dc2626' : '#405440'};color:white;
              text-decoration:none;padding:13px 28px;border-radius:8px;font-size:0.9rem;font-weight:600;">
      Add payment details →
    </a>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;">
    <p style="margin:0;font-size:0.78rem;color:#405440;text-align:center;line-height:1.5;">
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
    <h1 style="margin:0 0 8px;font-size:1.4rem;font-weight:700;color:#405440;">
      Your promotional period has ended
    </h1>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#405440;line-height:1.6;">Hi ${firstName},</p>

    <p style="color:#405440;font-size:0.875rem;line-height:1.6;margin-bottom:16px;">
      Your NestBook Pro promotional access has now ended and your account has moved
      to the free plan.
    </p>

    <p style="color:#405440;font-size:0.875rem;line-height:1.6;margin-bottom:24px;">
      Your property page, bookings and all your data are safe —
      you just have access to the free plan features now.
    </p>

    <div style="background:#f0ede8;border:1.5px solid #405440;border-radius:8px;
                padding:16px 20px;margin-bottom:24px;">
      <div style="font-weight:700;color:#405440;font-size:0.9rem;margin-bottom:8px;">
        Want to continue with Pro?
      </div>
      <p style="color:#405440;font-size:0.875rem;margin:0;line-height:1.6;">
        NestBook Pro includes unlimited rooms, 5 photos per room,
        booking widget, seasonal pricing and revenue reports. No commission ever.
      </p>
    </div>

    <a href="https://nestbook.io/app/settings"
       style="display:inline-block;background:#405440;color:white;text-decoration:none;
              padding:13px 28px;border-radius:8px;font-size:0.9rem;font-weight:600;">
      Upgrade to Pro →
    </a>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;">
    <p style="margin:0;font-size:0.78rem;color:#405440;text-align:center;line-height:1.5;">
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
    <h1 style="margin:0 0 8px;font-size:1.4rem;font-weight:700;color:#405440;">
      Payment details saved! 🌿
    </h1>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#405440;line-height:1.6;">
      Hi ${firstName} — you're all set! Here's what happens next:
    </p>

    <div style="background:#f0ede8;border:1.5px solid #405440;border-radius:8px;
                padding:16px 20px;margin-bottom:24px;display:flex;align-items:flex-start;gap:12px;">
      <span style="font-size:22px;line-height:1;">✓</span>
      <div>
        <div style="font-weight:700;color:#405440;font-size:1rem;">Payment details saved successfully</div>
        <div style="font-size:0.85rem;color:#405440;margin-top:2px;">Your Pro subscription will continue automatically</div>
      </div>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:10px 0;color:#405440;font-size:0.875rem;
                   border-bottom:1px solid #e2e8f0;width:160px;">Until ${expiryDate}</td>
        <td style="padding:10px 0;font-size:0.875rem;border-bottom:1px solid #e2e8f0;
                   color:#405440;font-weight:600;">✓ NestBook Pro — no charge</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#405440;font-size:0.875rem;">From ${expiryDate}</td>
        <td style="padding:10px 0;font-size:0.875rem;color:#405440;font-weight:600;">
          NestBook Pro continues uninterrupted</td>
      </tr>
    </table>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;
                padding:14px 18px;margin-bottom:24px;">
      <p style="color:#405440;font-size:0.85rem;margin:0;line-height:1.6;">
        You can cancel anytime before ${expiryDate} from
        <strong>Settings → Billing</strong> in your NestBook dashboard,
        and your account will return to the free plan. No questions asked.
      </p>
    </div>

    <p style="color:#405440;font-size:0.875rem;line-height:1.6;margin-bottom:24px;">
      Thank you for being part of NestBook — if you ever need anything just reply to this email.
    </p>

    <a href="https://nestbook.io/app"
       style="display:inline-block;background:#405440;color:white;text-decoration:none;
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
    <p style="margin:0 0 16px;font-size:0.95rem;color:#405440;">${ct.greeting(name)}</p>
    <p style="margin:0 0 16px;font-size:0.95rem;color:#405440;line-height:1.6;">${ct.body(propertyName)}</p>
    ${reason ? `<p style="margin:0 0 16px;font-size:0.95rem;color:#405440;"><strong>${ct.reasonLabel}</strong> ${reason}</p>` : ''}
    <p style="margin:0;font-size:0.95rem;color:#405440;line-height:1.6;">${ct.closing}</p>
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
    <h1 style="margin:0 0 16px;font-size:1.3rem;font-weight:700;color:#405440;">${tr.heading}</h1>
    <p style="margin:0 0 16px;font-size:0.95rem;color:#405440;line-height:1.6;">${tr.body}</p>

    <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:14px 18px;
                border-radius:0 8px 8px 0;margin:0 0 24px;">
      <p style="margin:0;color:#991b1b;font-size:0.875rem;line-height:1.6;">${tr.warning}</p>
    </div>

    <a href="${verifyLink}"
       style="display:inline-block;background:#405440;color:#fff;text-decoration:none;
              padding:13px 28px;border-radius:8px;font-size:0.9rem;font-weight:600;">
      ${tr.cta}
    </a>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 16px;">
    <p style="margin:0;font-size:0.75rem;color:#405440;text-align:center;line-height:1.5;">
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
  if (!resend) {
    console.log(`[email] Payment assistance email skipped (Resend not configured) — booking #${booking.id}`);
    return;
  }
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
    <p style="margin:0 0 16px;font-size:1rem;font-weight:700;color:#405440;">${tr.heading}</p>
    <p style="margin:0 0 16px;color:#405440;">${tr.intro}</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-size:0.8rem;font-weight:600;color:#405440;text-transform:uppercase;letter-spacing:0.05em;">${tr.details}</p>
      <p style="margin:0 0 4px;color:#405440;"><strong>${tr.checkin}:</strong> ${fmtDate(booking.check_in_date)}</p>
      <p style="margin:0;color:#405440;"><strong>${tr.checkout}:</strong> ${fmtDate(booking.check_out_date)}</p>
    </div>

    <p style="margin:0 0 16px;color:#405440;">${tr.reassurance}</p>
    <p style="margin:0 0 24px;color:#405440;font-weight:600;">${tr.cta}</p>
    <p style="margin:0;color:#405440;">${tr.closing}</p>
  `;

  try {
    await resend.emails.send({
      from:    FROM,
      to:      guestEmail,
      replyTo: ownerEmail || undefined,
      subject: tr.subject,
      html:    guestMailerHtml(body, property),
    });
    console.log(`[assistance-email] Sent → ${guestEmail} (booking #${booking.id})`);
  } catch (err) {
    console.error('[assistance-email] Failed:', err.message);
  }
}

// ── Booking conflict alert (owner) ─────────────────────────────────────────────
// Sent when a Stripe-confirmed widget payment is found, at confirmation time, to
// clash with another already-confirmed booking for the same room/dates. This is
// a flag only — NestBook never auto-refunds, auto-cancels, or otherwise resolves
// the conflict; it's always the owner's decision.
export async function sendBookingConflictAlert(booking, property, clashingBookingId) {
  if (!resend) {
    console.log(`[email] Booking conflict alert skipped (Resend not configured) — booking #${booking.id} vs #${clashingBookingId}`);
    return;
  }
  const ownerEmail = property?.owner_email;
  if (!ownerEmail) return;

  const guestName = [booking.guest_first_name, booking.guest_last_name].filter(Boolean).join(' ') || 'Guest';
  const isWP       = property?.rental_type === 'whole_property';
  const isUnits    = property?.rental_type === 'units';
  const subject    = `Urgent: booking conflict needs your review — ${property?.name ?? 'NestBook'}`;
  const paidAmount = booking.stripe_payment_amount != null ? booking.stripe_payment_amount : (booking.total_price ?? '—');

  const body = `
    <p style="margin:0 0 4px;font-size:1.1rem;font-weight:700;color:#b91c1c;">⚠ Booking conflict — payment already taken</p>
    <p style="margin:0 0 20px;font-size:0.95rem;color:#405440;">
      A guest has paid for dates at <strong>${property?.name ?? ''}</strong> that clash with another booking.
      No automatic action has been taken — this needs your review.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#fef2f2;border-radius:8px;padding:20px 24px;margin-bottom:20px;border:1px solid #fecaca;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #fecaca;font-size:0.82rem;color:#7f1d1d;width:40%;vertical-align:top;">Guest</td>
        <td style="padding:10px 0;border-bottom:1px solid #fecaca;font-size:0.875rem;color:#405440;font-weight:600;">${guestName}</td>
      </tr>
      ${booking.room_name ? `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #fecaca;font-size:0.82rem;color:#7f1d1d;vertical-align:top;">${isUnits ? 'Unit' : 'Room'}</td>
        <td style="padding:10px 0;border-bottom:1px solid #fecaca;font-size:0.875rem;color:#405440;font-weight:600;">${booking.room_name}</td>
      </tr>` : ''}
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #fecaca;font-size:0.82rem;color:#7f1d1d;vertical-align:top;">Check-in</td>
        <td style="padding:10px 0;border-bottom:1px solid #fecaca;font-size:0.875rem;color:#405440;font-weight:600;">${booking.check_in_date}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #fecaca;font-size:0.82rem;color:#7f1d1d;vertical-align:top;">Check-out</td>
        <td style="padding:10px 0;border-bottom:1px solid #fecaca;font-size:0.875rem;color:#405440;font-weight:600;">${booking.check_out_date}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #fecaca;font-size:0.82rem;color:#7f1d1d;vertical-align:top;">Amount paid</td>
        <td style="padding:10px 0;border-bottom:1px solid #fecaca;font-size:0.875rem;color:#405440;font-weight:600;">${paidAmount}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;font-size:0.82rem;color:#7f1d1d;vertical-align:top;">Clashes with booking</td>
        <td style="padding:10px 0;font-size:0.875rem;color:#405440;font-weight:600;">#${clashingBookingId}</td>
      </tr>
    </table>
    <p style="margin:0 0 16px;font-size:0.9rem;color:#405440;line-height:1.6;">
      The guest's payment has gone through and is recorded, but this booking has been held back rather than
      confirmed automatically. Please review both bookings in your dashboard and decide how to proceed —
      for example, contact the guest directly, offer alternative dates${isWP ? '' : ' or a different room'} if available,
      or issue a refund yourself using your existing Stripe tools if the booking can't go ahead.
      NestBook will not refund, cancel, or otherwise resolve this automatically.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      <tr>
        <td>
          <a href="https://nestbook.io/app/bookings" style="display:block;text-align:center;padding:14px 0;background:#405440;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:1rem;">
            Review in dashboard →
          </a>
        </td>
      </tr>
    </table>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;">
    <p style="margin:0;font-size:0.72rem;color:#405440;text-align:center;">Powered by NestBook</p>`;

  try {
    await resend.emails.send({ from: FROM, to: ownerEmail, subject, html: shell(body) });
    console.log(`[email] Booking conflict alert sent → ${ownerEmail} (booking #${booking.id} vs #${clashingBookingId})`);
  } catch (err) {
    console.error('[email] Failed to send booking conflict alert:', err.message);
  }
}

// ── Booking conflict holding email (guest) ─────────────────────────────────────
// Sent instead of the normal confirmation when a payment is found, at
// confirmation time, to clash with another booking. Deliberately calm — no
// mention of a "clash" or "double-booking" to the guest.
export async function sendBookingConflictHoldingEmail(booking, property) {
  if (!resend) {
    console.log(`[email] Booking conflict holding email skipped (Resend not configured) — booking #${booking.id}`);
    return;
  }
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
      subject:     `Your booking at ${propertyName} — just confirming a few details`,
      heading:     `Thanks for your payment!`,
      intro:       `Hi ${guestName}, we've received your payment for your upcoming stay at ${propertyName}.`,
      details:     `Your booking details:`,
      checkin:     `Check-in`,
      checkout:    `Check-out`,
      reassurance: `Before we finalise everything, the team at ${propertyName} is just confirming a few details on their end. There's nothing you need to do — they'll be in touch shortly to confirm your stay.`,
      closing:     `Thank you for your patience — we look forward to welcoming you soon!`,
    },
    fr: {
      subject:     `Votre réservation à ${propertyName} — nous vérifions quelques détails`,
      heading:     `Merci pour votre paiement !`,
      intro:       `Bonjour ${guestName}, nous avons bien reçu votre paiement pour votre prochain séjour à ${propertyName}.`,
      details:     `Détails de votre réservation :`,
      checkin:     `Arrivée`,
      checkout:    `Départ`,
      reassurance: `Avant de finaliser, l'équipe de ${propertyName} vérifie simplement quelques détails de son côté. Vous n'avez rien à faire — elle vous contactera très prochainement pour confirmer votre séjour.`,
      closing:     `Merci de votre patience — nous avons hâte de vous accueillir !`,
    },
    de: {
      subject:     `Ihre Buchung bei ${propertyName} — wir prüfen noch ein paar Details`,
      heading:     `Danke für Ihre Zahlung!`,
      intro:       `Hallo ${guestName}, wir haben Ihre Zahlung für Ihren bevorstehenden Aufenthalt bei ${propertyName} erhalten.`,
      details:     `Ihre Buchungsdetails:`,
      checkin:     `Anreise`,
      checkout:    `Abreise`,
      reassurance: `Bevor wir alles abschließen, prüft das Team von ${propertyName} noch ein paar Details. Sie müssen nichts weiter unternehmen — man wird sich in Kürze bei Ihnen melden, um Ihren Aufenthalt zu bestätigen.`,
      closing:     `Vielen Dank für Ihre Geduld — wir freuen uns, Sie bald willkommen zu heißen!`,
    },
    es: {
      subject:     `Su reserva en ${propertyName} — estamos confirmando algunos detalles`,
      heading:     `¡Gracias por su pago!`,
      intro:       `Hola ${guestName}, hemos recibido su pago para su próxima estancia en ${propertyName}.`,
      details:     `Detalles de su reserva:`,
      checkin:     `Llegada`,
      checkout:    `Salida`,
      reassurance: `Antes de finalizarlo todo, el equipo de ${propertyName} está confirmando algunos detalles por su parte. No tiene que hacer nada — se pondrán en contacto con usted en breve para confirmar su estancia.`,
      closing:     `Gracias por su paciencia — ¡esperamos darle la bienvenida pronto!`,
    },
    nl: {
      subject:     `Uw boeking bij ${propertyName} — we controleren nog enkele details`,
      heading:     `Bedankt voor uw betaling!`,
      intro:       `Hallo ${guestName}, we hebben uw betaling ontvangen voor uw aankomende verblijf bij ${propertyName}.`,
      details:     `Uw boekingsgegevens:`,
      checkin:     `Inchecken`,
      checkout:    `Uitchecken`,
      reassurance: `Voordat alles wordt afgerond, controleert het team van ${propertyName} nog enkele details. U hoeft niets te doen — ze nemen binnenkort contact met u op om uw verblijf te bevestigen.`,
      closing:     `Bedankt voor uw geduld — we kijken ernaar uit u binnenkort te verwelkomen!`,
    },
  };

  const tr = T[lang] || T.en;

  const body = `
    <p style="margin:0 0 16px;font-size:1rem;font-weight:700;color:#405440;">${tr.heading}</p>
    <p style="margin:0 0 16px;color:#405440;">${tr.intro}</p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-size:0.8rem;font-weight:600;color:#405440;text-transform:uppercase;letter-spacing:0.05em;">${tr.details}</p>
      <p style="margin:0 0 4px;color:#405440;"><strong>${tr.checkin}:</strong> ${fmtDate(booking.check_in_date)}</p>
      <p style="margin:0;color:#405440;"><strong>${tr.checkout}:</strong> ${fmtDate(booking.check_out_date)}</p>
    </div>

    <p style="margin:0 0 16px;color:#405440;">${tr.reassurance}</p>
    <p style="margin:0;color:#405440;">${tr.closing}</p>
  `;

  try {
    await resend.emails.send({
      from:    FROM,
      to:      guestEmail,
      replyTo: ownerEmail || undefined,
      subject: tr.subject,
      html:    guestMailerHtml(body, property),
    });
    console.log(`[email] Booking conflict holding email sent → ${guestEmail} (booking #${booking.id})`);
  } catch (err) {
    console.error('[email] Failed to send booking conflict holding email:', err.message);
  }
}

export async function sendOutreachEmail({ to, subject, html, from: fromOverride }) {
  if (!resend) {
    console.log('[email] SKIPPED outreach email to', to, '(no Resend key)');
    return;
  }
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const result = await resend.emails.send({ from: fromOverride || FROM, to, subject, html, text });
  console.log('[email] Outreach email sent →', to, '| id:', result?.id ?? result?.data?.id);
}

// ── Review request emails ─────────────────────────────────────────────────────
// Sent automatically N days after checkout. Property-branded (not NestBook branded).
// All 5 supported locales; defaults to EN for unknown locales.

const REVIEW_TX = {
  en: {
    subject:      (name) => `How was your stay at ${name}?`,
    greeting:     (first) => `Hi ${first},`,
    p1:           (name) => `Thank you so much for staying with us at ${name} — we hope you had a wonderful time.`,
    p2:           `If you enjoyed your stay, we'd be so grateful if you could take a minute to share it with a quick review on Google or TripAdvisor. It genuinely makes a difference for a small, independent property like ours.`,
    p3:           `You're also welcome to leave a note directly on our own website, if you'd prefer.`,
    closing:      `Thank you again for choosing us — we hope to welcome you back soon.`,
    google:       'Leave a review on Google',
    tripadvisor:  'Leave a review on TripAdvisor',
    leaveNote:    'Leave us a note',
  },
  fr: {
    subject:      (name) => `Comment s'est passé votre séjour à ${name} ?`,
    greeting:     (first) => `Bonjour ${first},`,
    p1:           (name) => `Merci beaucoup d'avoir séjourné chez nous à ${name} — nous espérons que vous avez passé un excellent moment.`,
    p2:           `Si vous avez apprécié votre séjour, nous vous serions très reconnaissants de prendre un instant pour le partager avec un avis rapide sur Google ou TripAdvisor. Cela fait vraiment une différence pour un établissement indépendant comme le nôtre.`,
    p3:           `Vous pouvez également laisser un mot directement sur notre site, si vous préférez.`,
    closing:      `Merci encore de nous avoir choisis — nous espérons vous accueillir à nouveau bientôt.`,
    google:       'Laisser un avis sur Google',
    tripadvisor:  'Laisser un avis sur TripAdvisor',
    leaveNote:    'Laissez-nous un mot',
  },
  de: {
    subject:      (name) => `Wie war Ihr Aufenthalt in ${name}?`,
    greeting:     (first) => `Hallo ${first},`,
    p1:           (name) => `Vielen Dank, dass Sie bei uns in ${name} übernachtet haben — wir hoffen, Sie hatten eine wunderbare Zeit.`,
    p2:           `Wenn Ihnen Ihr Aufenthalt gefallen hat, würden wir uns sehr freuen, wenn Sie sich einen Moment Zeit nehmen könnten, um dies mit einer kurzen Bewertung bei Google oder TripAdvisor zu teilen. Für eine kleine, unabhängige Unterkunft wie unsere macht das wirklich einen Unterschied.`,
    p3:           `Sie können uns auch gerne direkt auf unserer eigenen Website eine Nachricht hinterlassen, falls Sie das bevorzugen.`,
    closing:      `Vielen Dank, dass Sie sich für uns entschieden haben — wir hoffen, Sie bald wieder bei uns begrüßen zu dürfen.`,
    google:       'Bewertung bei Google hinterlassen',
    tripadvisor:  'Bewertung bei TripAdvisor hinterlassen',
    leaveNote:    'Hinterlassen Sie uns eine Nachricht',
  },
  es: {
    subject:      (name) => `¿Cómo fue tu estancia en ${name}?`,
    greeting:     (first) => `Hola ${first},`,
    p1:           (name) => `Muchas gracias por alojarte con nosotros en ${name} — esperamos que hayas disfrutado de una estancia maravillosa.`,
    p2:           `Si disfrutaste tu estancia, te agradeceríamos muchísimo que dedicaras un momento a compartirlo con una breve reseña en Google o TripAdvisor. Realmente marca la diferencia para un alojamiento independiente como el nuestro.`,
    p3:           `También puedes dejarnos unas palabras directamente en nuestra web, si lo prefieres.`,
    closing:      `Gracias de nuevo por elegirnos — esperamos darte la bienvenida de nuevo pronto.`,
    google:       'Dejar una reseña en Google',
    tripadvisor:  'Dejar una reseña en TripAdvisor',
    leaveNote:    'Déjanos unas palabras',
  },
  nl: {
    subject:      (name) => `Hoe was je verblijf in ${name}?`,
    greeting:     (first) => `Hallo ${first},`,
    p1:           (name) => `Hartelijk dank dat je bij ons hebt verbleven in ${name} — we hopen dat je een fantastische tijd hebt gehad.`,
    p2:           `Als je van je verblijf hebt genoten, zouden we het enorm waarderen als je een moment de tijd neemt om dit te delen met een korte review op Google of TripAdvisor. Dat maakt echt een verschil voor een kleine, onafhankelijke accommodatie zoals de onze.`,
    p3:           `Je mag ons ook rechtstreeks op onze eigen website een berichtje achterlaten, als je dat liever hebt.`,
    closing:      `Nogmaals bedankt dat je voor ons hebt gekozen — we hopen je snel weer te mogen verwelkomen.`,
    google:       'Laat een review achter op Google',
    tripadvisor:  'Laat een review achter op TripAdvisor',
    leaveNote:    'Laat ons een berichtje achter',
  },
};

const BTN_STYLE = 'display:inline-block;padding:12px 22px;background:#405440;color:#ffffff;' +
  'border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px;margin:6px 4px;';
const BTN_SECONDARY = 'display:inline-block;padding:10px 20px;background:transparent;color:#405440;' +
  'border:2px solid #405440;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;margin:6px 4px;';

export async function sendReviewRequestEmail({ booking, property, noteUrl }) {
  if (!resend) return;

  const tx = REVIEW_TX[property.locale] || REVIEW_TX.en;
  const firstName = booking.first_name || 'there';
  const propName  = property.name || '';

  const googleBtn = property.google_review_url?.trim()
    ? `<a href="${property.google_review_url}" style="${BTN_STYLE}">${tx.google}</a>`
    : '';
  const taBtn = property.tripadvisor_review_url?.trim()
    ? `<a href="${property.tripadvisor_review_url}" style="${BTN_STYLE}">${tx.tripadvisor}</a>`
    : '';
  const noteBtn = noteUrl
    ? `<a href="${noteUrl}" style="${BTN_SECONDARY}">${tx.leaveNote}</a>`
    : '';

  const primaryBtns = (googleBtn || taBtn)
    ? `<div style="text-align:center;margin:28px 0 20px;">${googleBtn}${taBtn}</div>`
    : '';
  const secondaryBtns = noteBtn
    ? `<p style="margin:0 0 12px;line-height:1.7;color:#405440">${tx.p3}</p>` +
      `<div style="text-align:center;margin:0 0 28px;">${noteBtn}</div>`
    : '';

  const bodyHtml = `
<p style="margin:0 0 16px;line-height:1.7">${tx.greeting(firstName)}</p>
<p style="margin:0 0 16px;line-height:1.7">${tx.p1(propName)}</p>
<p style="margin:0 0 16px;line-height:1.7">${tx.p2}</p>
${primaryBtns}${secondaryBtns}
<p style="margin:0 0 16px;line-height:1.7">${tx.closing}</p>
`;

  const logoAbsUrl = property.logo_url
    ? `${process.env.APP_BASE_URL || 'https://nestbook.io'}/uploads/logos/${property.logo_url}`
    : null;

  const html = wrapGuestMailerEmail(bodyHtml, {
    propertyName:    propName,
    logoAbsUrl,
    ctaEnabled:      false,
    mailerSignature: property.mailer_signature || null,
  });

  const from = `"${propName}" <hello@nestbook.io>`;
  await resend.emails.send({
    from, to: booking.guest_email,
    subject: tx.subject(propName),
    html,
    text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  });
}
