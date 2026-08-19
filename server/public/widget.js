/**
 * NestBook Booking Widget — v1.0
 * Self-contained, no external dependencies, no build step required.
 *
 * Usage:
 *   <script src="https://your-nestbook-server.com/widget.js"
 *           data-property-id="1"
 *           data-lang="en"
 *           data-currency="EUR"
 *           async>
 *   </script>
 *   <div id="nestbook-widget"></div>
 */
(function () {
  'use strict';

  // ── Config: read from the script tag immediately (before async callbacks) ──
  const SCRIPT      = document.currentScript || document.querySelector('script[src*="widget.js"]');
  const PROPERTY_ID = SCRIPT.getAttribute('data-property-id') || '1';
  const LANG        = SCRIPT.getAttribute('data-lang') ||
                      (function () { try { return localStorage.getItem('nestbook_lang') || 'en'; } catch (_) { return 'en'; } })();
  const CURRENCY    = SCRIPT.getAttribute('data-currency')    || 'EUR';
  // Derive API base from wherever the script itself is served from
  const API_BASE    = SCRIPT.src.replace(/\/widget\.js(\?.*)?$/, '');
  const CUR_SYMBOL  = ({ EUR: '€', GBP: '£', USD: '$', CHF: 'CHF ' })[CURRENCY] || '€';
  const DEMO_MODE   = SCRIPT.getAttribute('data-demo') === 'true';

  const BRAND_OVERRIDE = SCRIPT.getAttribute('data-color') || null;

  // Colour palettes for each theme — must stay in sync with client/src/index.css
  // panelHdrBg/panelHdrText match the app's --header-bg/--header-text per theme exactly.
  const THEME_COLOURS = {
    forest:   { brand: '#405440', dark: '#405440', light: '#F4F3F0', panelHdrBg: '#F0EDE8', panelHdrText: '#405440' },
    royal:    { brand: '#70879E', dark: '#1F3A55', light: '#F6F4EE', panelHdrBg: '#F6F4EE', panelHdrText: '#1F3A55' },
    ember:    { brand: '#E8A838', dark: '#1A2535', light: '#E9E7E2', panelHdrBg: '#E9E7E2', panelHdrText: '#1A2535' },
    ruby:     { brand: '#CF514F', dark: '#490403', light: '#E9E7E7', panelHdrBg: '#E9E7E7', panelHdrText: '#CF514F' },
    sky:      { brand: '#878A8C', dark: '#4B779B', light: '#F4F5F6', panelHdrBg: '#F4F5F6', panelHdrText: '#878A8C' },
    lavender: { brand: '#928CB1', dark: '#62598F', light: '#E7E7E9', panelHdrBg: '#E7E7E9', panelHdrText: '#4F4582' },
    aero:     { brand: '#5395B2', dark: '#3E7A9E', light: '#E5F0F8', panelHdrBg: '#F4F5F6', panelHdrText: '#1C1C1E' },
    charcoal: { brand: '#8A0505', dark: '#292929', light: '#F4F5F6', panelHdrBg: '#F4F5F6', panelHdrText: '#68696A' },
    slate:    { brand: '#95A397', dark: '#25503E', light: '#EFF0F0', panelHdrBg: '#F5F5F5', panelHdrText: '#1C1C1E' },
    storm:    { brand: '#A4B1B7', dark: '#546369', light: '#F5F2EC', panelHdrBg: '#FFFFFF',  panelHdrText: '#3B454E' },
    hessian:  { brand: '#CCCFBB', dark: '#425B3D', light: '#F5F2EC', panelHdrBg: '#F6F3EC', panelHdrText: '#0C310F' },
  };

  let BRAND          = '#405440';
  let BRAND_DARK     = '#405440';
  let BRAND_LIGHT    = '#F4F3F0';
  let PANEL_HDR_BG   = '#F0EDE8';  // matches --header-bg; resolved from palette on init
  let PANEL_HDR_TEXT = '#405440';  // matches --header-text

  // ── i18n ───────────────────────────────────────────────────────────────────
  const STRINGS = {
    en: {
      bookNow: 'Book Now', close: '✕', back: '← Back',
      step1Title: 'Choose Your Dates',
      step2Title: 'Select a Room',
      step3Title: 'Your Details',
      step4Title: 'Confirm Booking',
      wpStep4Title: 'Review your request',
      checkIn: 'Check-in', checkOut: 'Check-out', guests: 'Guests',
      checkAvailability: 'Check Availability',
      noRooms: 'No rooms are available for those dates. Please try different dates.',
      noRoomsCapacity: (n) => `No rooms available for ${n} guests. Please try fewer guests or a different room.`,
      capacity: 'Up to', perNight: '/night',
      firstName: 'First Name *', lastName: 'Last Name *',
      email: 'Email Address *', phone: 'Phone Number',
      notes: 'Special Requests', optional: '(optional)',
      summaryRoom: 'Room', summaryDates: 'Dates', summaryGuests: 'Guests',
      summaryNights: 'Duration', summaryTotal: 'Total',
      nights: (n) => `${n} ${n === 1 ? 'night' : 'nights'}`,
      confirmBtn: 'Confirm Booking', confirming: 'Confirming…',
      wpConfirmBtn: 'Send Booking Request', wpConfirming: 'Sending…',
      successTitle: 'Booking Confirmed!',
      wpSuccessTitle: 'Request Submitted!',
      successMsg: 'Thank you! Your booking reference is:',
      wpSuccessMsg: 'Your request has been received. The owner will review it and confirm within 24 hours.',
      successClose: 'Close',
      errRequired: 'Please fill in all required fields.',
      errDates: 'Check-out must be after check-in.',
      errServer: 'Something went wrong. Please try again.',
      checking: 'Checking availability…',
      demoNote: 'Demo mode — no real booking was made',
      breakfastIncluded: 'Breakfast included',
      checkAvailabilityBook: 'Check Availability & Book',
      payNow:           'Pay Now',
      payNowConfirming: 'Processing…',
      redirecting:      'Redirecting to secure checkout…',
      addBreakfast:     (p) => `Add breakfast (${p} per person per morning)`,
      breakfastLine:    'Breakfast',
      propertyNotAvailable: 'The property is not available for those dates. Please try different dates.',
      wpStep2Title:  'Your Booking',
      wpAvailBadge:  'Available for your dates!',
      wpRequestBtn:  'Request this booking →',
      wpChangeDates: '← Change dates',
      wpWhatNext:    'What happens next?',
      wpNextStep1:   'Fill in your details and send your request',
      wpNextStep2:   'The owner reviews and confirms within 24 hours',
      wpNextStep3:   "You'll receive a confirmation email with payment details",
      wpNextStep4:   'Access details sent before your arrival',
      steppedBack:     'Looks like you stepped back — still want to complete your booking?',
      steppedBackBtn:  'Continue →',
      pendingBanner:    'You have an unfinished booking — continue where you left off?',
      pendingBannerBtn: 'Continue →',
      pendingEmailNote: "You'll receive an email as soon as the owner confirms your booking.",
      bookRoom: 'Book this room →',
      clearDates: 'Clear', today: 'Today',
      roomFallbackNotice: "Your selected room isn't available for these dates — here are the other options:",
      bedTypeSingle: 'Single Bed', bedTypeDouble: 'Double Bed', bedTypeQueen: 'Queen Bed',
      bedTypeKing: 'King Bed', bedTypeSofaBed: 'Sofa Bed', bedTypeBunkBed: 'Bunk Bed',
      bookCategory: (name) => `Book a ${name} Room →`,
      categoryFallbackNotice: "Your selected category isn't available for these dates — here are the other options:",
      categoryJustTaken: 'That room has just been taken — please choose another option.',
      categoryUnavailableNote: 'Not available for these dates',
      summaryCategory: 'Category',
      chooseYourRoom: 'Choose Your Room',
      bedConfigUnspecified: 'Configuration not specified',
    },
    fr: {
      bookNow: 'Réserver', close: '✕', back: '← Retour',
      step1Title: 'Choisissez vos dates',
      step2Title: 'Choisir une chambre',
      step3Title: 'Vos coordonnées',
      step4Title: 'Confirmer la réservation',
      wpStep4Title: 'Votre demande',
      checkIn: 'Arrivée', checkOut: 'Départ', guests: 'Voyageurs',
      checkAvailability: 'Vérifier la disponibilité',
      noRooms: 'Aucune chambre disponible pour ces dates. Veuillez essayer d\'autres dates.',
      noRoomsCapacity: (n) => `Aucune chambre disponible pour ${n} personnes. Essayez avec moins de personnes ou une autre chambre.`,
      capacity: "Jusqu'à", perNight: '/nuit',
      firstName: 'Prénom *', lastName: 'Nom *',
      email: 'Adresse e-mail *', phone: 'Téléphone',
      notes: 'Demandes spéciales', optional: '(facultatif)',
      summaryRoom: 'Chambre', summaryDates: 'Dates', summaryGuests: 'Voyageurs',
      summaryNights: 'Durée', summaryTotal: 'Total',
      nights: (n) => `${n} ${n === 1 ? 'nuit' : 'nuits'}`,
      confirmBtn: 'Confirmer la réservation', confirming: 'Confirmation…',
      wpConfirmBtn: 'Envoyer la demande', wpConfirming: 'Envoi…',
      successTitle: 'Réservation confirmée !',
      wpSuccessTitle: 'Demande envoyée !',
      successMsg: 'Merci ! Votre numéro de référence est :',
      wpSuccessMsg: 'Votre demande a été reçue. Le propriétaire la confirmera dans les 24 heures.',
      successClose: 'Fermer',
      errRequired: 'Veuillez remplir tous les champs obligatoires.',
      errDates: 'La date de départ doit être postérieure à l\'arrivée.',
      errServer: 'Une erreur est survenue. Veuillez réessayer.',
      checking: 'Vérification de la disponibilité…',
      demoNote: 'Mode démo — aucune vraie réservation n\'a été effectuée',
      breakfastIncluded: 'Petit-déjeuner inclus',
      checkAvailabilityBook: 'Vérifier et réserver',
      payNow:           'Payer maintenant',
      payNowConfirming: 'Traitement…',
      redirecting:      'Redirection vers le paiement sécurisé…',
      addBreakfast:     (p) => `Ajouter le petit-déjeuner (${p} par personne par matin)`,
      breakfastLine:    'Petit-déjeuner',
      propertyNotAvailable: 'La propriété n\'est pas disponible pour ces dates. Veuillez essayer d\'autres dates.',
      wpStep2Title:  'Votre réservation',
      wpAvailBadge:  'Disponible pour vos dates !',
      wpRequestBtn:  'Demander cette réservation →',
      wpChangeDates: '← Modifier les dates',
      wpWhatNext:    'Que se passe-t-il ensuite ?',
      wpNextStep1:   'Remplissez vos coordonnées et envoyez votre demande',
      wpNextStep2:   'Le propriétaire examine et confirme dans les 24 heures',
      wpNextStep3:   'Vous recevrez un e-mail de confirmation avec les modalités de paiement',
      wpNextStep4:   'Les informations d\'accès seront envoyées avant votre arrivée',
      steppedBack:     'Vous êtes revenu en arrière — souhaitez-vous finaliser votre réservation ?',
      steppedBackBtn:  'Continuer →',
      pendingBanner:    'Vous avez une réservation en cours — reprendre là où vous en étiez ?',
      pendingBannerBtn: 'Continuer →',
      pendingEmailNote: 'Vous recevrez un e-mail dès que le propriétaire aura confirmé votre réservation.',
      bookRoom: 'Réserver cette chambre →',
      clearDates: 'Effacer', today: "Aujourd'hui",
      roomFallbackNotice: "La chambre sélectionnée n'est pas disponible à ces dates — voici les autres options :",
      bedTypeSingle: 'Lit simple', bedTypeDouble: 'Lit double', bedTypeQueen: 'Lit Queen',
      bedTypeKing: 'Lit King', bedTypeSofaBed: 'Canapé-lit', bedTypeBunkBed: 'Lit superposé',
      bookCategory: (name) => `Réserver une chambre ${name} →`,
      categoryFallbackNotice: "La catégorie sélectionnée n'est pas disponible à ces dates — voici les autres options :",
      categoryJustTaken: "Cette chambre vient d'être prise — veuillez choisir une autre option.",
      categoryUnavailableNote: 'Non disponible pour ces dates',
      summaryCategory: 'Catégorie',
      chooseYourRoom: 'Choisissez votre chambre',
      bedConfigUnspecified: 'Configuration non précisée',
    },
    es: {
      bookNow: 'Reservar', close: '✕', back: '← Volver',
      step1Title: 'Elija sus fechas',
      step2Title: 'Seleccione una habitación',
      step3Title: 'Sus datos',
      step4Title: 'Confirmar reserva',
      wpStep4Title: 'Su solicitud',
      checkIn: 'Llegada', checkOut: 'Salida', guests: 'Huéspedes',
      checkAvailability: 'Comprobar disponibilidad',
      noRooms: 'No hay habitaciones disponibles para esas fechas. Pruebe otras fechas.',
      noRoomsCapacity: (n) => `No hay habitaciones disponibles para ${n} huéspedes. Pruebe con menos huéspedes o con otra habitación.`,
      capacity: 'Hasta', perNight: '/noche',
      firstName: 'Nombre *', lastName: 'Apellido *',
      email: 'Correo electrónico *', phone: 'Teléfono',
      notes: 'Peticiones especiales', optional: '(opcional)',
      summaryRoom: 'Habitación', summaryDates: 'Fechas', summaryGuests: 'Huéspedes',
      summaryNights: 'Duración', summaryTotal: 'Total',
      nights: (n) => `${n} ${n === 1 ? 'noche' : 'noches'}`,
      confirmBtn: 'Confirmar reserva', confirming: 'Confirmando…',
      wpConfirmBtn: 'Enviar solicitud', wpConfirming: 'Enviando…',
      successTitle: '¡Reserva confirmada!',
      wpSuccessTitle: '¡Solicitud enviada!',
      successMsg: '¡Gracias! Su número de referencia es:',
      wpSuccessMsg: 'Su solicitud ha sido recibida. El propietario la confirmará en 24 horas.',
      successClose: 'Cerrar',
      errRequired: 'Por favor, complete todos los campos obligatorios.',
      errDates: 'La fecha de salida debe ser posterior a la llegada.',
      errServer: 'Algo salió mal. Por favor, inténtelo de nuevo.',
      checking: 'Comprobando disponibilidad…',
      demoNote: 'Modo demo — no se ha realizado ninguna reserva real',
      breakfastIncluded: 'Desayuno incluido',
      checkAvailabilityBook: 'Comprobar y reservar',
      payNow:           'Pagar ahora',
      payNowConfirming: 'Procesando…',
      redirecting:      'Redirigiendo al pago seguro…',
      addBreakfast:     (p) => `Añadir desayuno (${p} por persona por mañana)`,
      breakfastLine:    'Desayuno',
      propertyNotAvailable: 'La propiedad no está disponible para esas fechas. Pruebe otras fechas.',
      wpStep2Title:  'Su reserva',
      wpAvailBadge:  '¡Disponible para sus fechas!',
      wpRequestBtn:  'Solicitar esta reserva →',
      wpChangeDates: '← Cambiar fechas',
      wpWhatNext:    '¿Qué ocurre después?',
      wpNextStep1:   'Rellene sus datos y envíe su solicitud',
      wpNextStep2:   'El propietario revisa y confirma en 24 horas',
      wpNextStep3:   'Recibirá un correo de confirmación con los detalles de pago',
      wpNextStep4:   'Datos de acceso enviados antes de su llegada',
      steppedBack:     'Parece que ha vuelto atrás — ¿desea completar su reserva?',
      steppedBackBtn:  'Continuar →',
      pendingBanner:    'Tiene una reserva sin terminar — ¿continuar donde lo dejó?',
      pendingBannerBtn: 'Continuar →',
      pendingEmailNote: 'Recibirá un correo en cuanto el propietario confirme su reserva.',
      bookRoom: 'Reservar esta habitación →',
      clearDates: 'Limpiar', today: 'Hoy',
      roomFallbackNotice: 'La habitación seleccionada no está disponible para estas fechas — aquí tienes otras opciones:',
      bedTypeSingle: 'Cama individual', bedTypeDouble: 'Cama doble', bedTypeQueen: 'Cama Queen',
      bedTypeKing: 'Cama King', bedTypeSofaBed: 'Sofá cama', bedTypeBunkBed: 'Litera',
      bookCategory: (name) => `Reservar habitación ${name} →`,
      categoryFallbackNotice: 'La categoría seleccionada no está disponible para estas fechas — aquí tienes otras opciones:',
      categoryJustTaken: 'Esa habitación acaba de ser reservada — elija otra opción.',
      categoryUnavailableNote: 'No disponible para estas fechas',
      summaryCategory: 'Categoría',
      chooseYourRoom: 'Elija su habitación',
      bedConfigUnspecified: 'Configuración no especificada',
    },
    nl: {
      bookNow: 'Boek nu', close: '✕', back: '← Terug',
      step1Title: 'Kies uw datums',
      step2Title: 'Kamer kiezen',
      step3Title: 'Uw gegevens',
      step4Title: 'Reservering bevestigen',
      wpStep4Title: 'Uw aanvraag',
      checkIn: 'Aankomst', checkOut: 'Vertrek', guests: 'Personen',
      checkAvailability: 'Beschikbaarheid controleren',
      noRooms: 'Geen kamers beschikbaar voor deze datums. Kies andere datums.',
      noRoomsCapacity: (n) => `Geen kamers beschikbaar voor ${n} gasten. Probeer minder gasten of een andere kamer.`,
      capacity: 'Maximaal', perNight: '/nacht',
      firstName: 'Voornaam *', lastName: 'Achternaam *',
      email: 'E-mailadres *', phone: 'Telefoonnummer',
      notes: 'Speciale verzoeken', optional: '(optioneel)',
      summaryRoom: 'Kamer', summaryDates: 'Datums', summaryGuests: 'Personen',
      summaryNights: 'Verblijfsduur', summaryTotal: 'Totaal',
      nights: (n) => `${n} nacht${n !== 1 ? 'en' : ''}`,
      confirmBtn: 'Reservering bevestigen', confirming: 'Bezig met bevestigen…',
      wpConfirmBtn: 'Aanvraag verzenden', wpConfirming: 'Verzenden…',
      successTitle: 'Reservering bevestigd!',
      wpSuccessTitle: 'Aanvraag verzonden!',
      successMsg: 'Bedankt! Uw referentienummer is:',
      wpSuccessMsg: 'Uw aanvraag is ontvangen. De eigenaar bevestigt binnen 24 uur.',
      successClose: 'Sluiten',
      errRequired: 'Vul alle verplichte velden in.',
      errDates: 'Vertrekdatum moet na aankomstdatum liggen.',
      errServer: 'Er is iets misgegaan. Probeer het opnieuw.',
      checking: 'Beschikbaarheid controleren…',
      demoNote: 'Demo modus — er is geen echte reservering gemaakt',
      breakfastIncluded: 'Ontbijt inbegrepen',
      checkAvailabilityBook: 'Beschikbaarheid & boeken',
      payNow:           'Nu betalen',
      payNowConfirming: 'Verwerken…',
      redirecting:      'Doorsturen naar beveiligde betaling…',
      addBreakfast:     (p) => `Ontbijt toevoegen (${p} per persoon per ochtend)`,
      breakfastLine:    'Ontbijt',
      propertyNotAvailable: 'Het verblijf is niet beschikbaar voor deze datums. Kies andere datums.',
      wpStep2Title:  'Uw boeking',
      wpAvailBadge:  'Beschikbaar voor uw datums!',
      wpRequestBtn:  'Boekingsverzoek indienen →',
      wpChangeDates: '← Datums wijzigen',
      wpWhatNext:    'Wat gebeurt er daarna?',
      wpNextStep1:   'Vul uw gegevens in en stuur uw verzoek',
      wpNextStep2:   'De eigenaar beoordeelt en bevestigt binnen 24 uur',
      wpNextStep3:   'U ontvangt een bevestigingsmail met betalingsgegevens',
      wpNextStep4:   'Toegangsgegevens worden voor aankomst gestuurd',
      steppedBack:     'U bent teruggegaan — wilt u uw boeking nog afronden?',
      steppedBackBtn:  'Doorgaan →',
      pendingBanner:    'U heeft een onvoltooide boeking — verder gaan waar u gebleven was?',
      pendingBannerBtn: 'Doorgaan →',
      pendingEmailNote: 'U ontvangt een e-mail zodra de eigenaar uw boeking heeft bevestigd.',
      bookRoom: 'Kamer boeken →',
      clearDates: 'Wissen', today: 'Vandaag',
      roomFallbackNotice: 'De geselecteerde kamer is niet beschikbaar voor deze data — hier zijn de andere opties:',
      bedTypeSingle: 'Eenpersoonsbed', bedTypeDouble: 'Tweepersoonsbed', bedTypeQueen: 'Queen-size bed',
      bedTypeKing: 'King-size bed', bedTypeSofaBed: 'Slaapbank', bedTypeBunkBed: 'Stapelbed',
      bookCategory: (name) => `${name}kamer boeken →`,
      categoryFallbackNotice: 'De geselecteerde categorie is niet beschikbaar voor deze data — hier zijn de andere opties:',
      categoryJustTaken: 'Die kamer is zojuist geboekt — kies een andere optie.',
      categoryUnavailableNote: 'Niet beschikbaar voor deze data',
      summaryCategory: 'Categorie',
      chooseYourRoom: 'Kies uw kamer',
      bedConfigUnspecified: 'Bedconfiguratie niet opgegeven',
    },
    de: {
      bookNow: 'Buchen', close: '✕', back: '← Zurück',
      step1Title: 'Ihre Reisedaten',
      step2Title: 'Zimmer wählen',
      step3Title: 'Ihre Daten',
      step4Title: 'Buchung bestätigen',
      wpStep4Title: 'Ihre Anfrage',
      checkIn: 'Anreise', checkOut: 'Abreise', guests: 'Gäste',
      checkAvailability: 'Verfügbarkeit prüfen',
      noRooms: 'Keine Zimmer verfügbar für diese Daten. Bitte andere Daten wählen.',
      noRoomsCapacity: (n) => `Keine Zimmer für ${n} Gäste verfügbar. Bitte versuchen Sie es mit weniger Gästen oder einem anderen Zimmer.`,
      capacity: 'Bis zu', perNight: '/Nacht',
      firstName: 'Vorname *', lastName: 'Nachname *',
      email: 'E-Mail-Adresse *', phone: 'Telefon',
      notes: 'Besondere Wünsche', optional: '(optional)',
      summaryRoom: 'Zimmer', summaryDates: 'Daten', summaryGuests: 'Gäste',
      summaryNights: 'Dauer', summaryTotal: 'Gesamt',
      nights: (n) => `${n} ${n === 1 ? 'Nacht' : 'Nächte'}`,
      confirmBtn: 'Buchung bestätigen', confirming: 'Wird bestätigt…',
      wpConfirmBtn: 'Anfrage senden', wpConfirming: 'Senden…',
      successTitle: 'Buchung bestätigt!',
      wpSuccessTitle: 'Anfrage gesendet!',
      successMsg: 'Vielen Dank! Ihre Referenznummer lautet:',
      wpSuccessMsg: 'Ihre Anfrage wurde empfangen. Der Gastgeber bestätigt innerhalb von 24 Stunden.',
      successClose: 'Schließen',
      errRequired: 'Bitte füllen Sie alle Pflichtfelder aus.',
      errDates: 'Abreise muss nach Anreise liegen.',
      errServer: 'Etwas ist schiefgelaufen. Bitte erneut versuchen.',
      checking: 'Verfügbarkeit wird geprüft…',
      demoNote: 'Demo-Modus — keine echte Buchung wurde vorgenommen',
      breakfastIncluded: 'Frühstück inbegriffen',
      checkAvailabilityBook: 'Verfügbarkeit prüfen & buchen',
      payNow:           'Jetzt bezahlen',
      payNowConfirming: 'Verarbeitung…',
      redirecting:      'Weiterleitung zur sicheren Kasse…',
      addBreakfast:     (p) => `Frühstück hinzufügen (${p} pro Person pro Morgen)`,
      breakfastLine:    'Frühstück',
      propertyNotAvailable: 'Das Objekt ist für diese Daten nicht verfügbar. Bitte andere Daten wählen.',
      wpStep2Title:  'Ihre Buchung',
      wpAvailBadge:  'Verfügbar für Ihre Daten!',
      wpRequestBtn:  'Diese Buchung anfragen →',
      wpChangeDates: '← Daten ändern',
      wpWhatNext:    'Was passiert als nächstes?',
      wpNextStep1:   'Geben Sie Ihre Daten ein und senden Sie Ihre Anfrage',
      wpNextStep2:   'Der Gastgeber prüft und bestätigt innerhalb von 24 Stunden',
      wpNextStep3:   'Sie erhalten eine Bestätigungs-E-Mail mit Zahlungsdetails',
      wpNextStep4:   'Zugangsdetails werden vor Ihrer Ankunft gesendet',
      steppedBack:     'Sie sind zurückgegangen — möchten Sie Ihre Buchung noch abschließen?',
      steppedBackBtn:  'Weiter →',
      pendingBanner:    'Sie haben eine unvollständige Buchung — dort weitermachen, wo Sie aufgehört haben?',
      pendingBannerBtn: 'Weiter →',
      pendingEmailNote: 'Sie erhalten eine E-Mail, sobald der Gastgeber Ihre Buchung bestätigt hat.',
      bookRoom: 'Zimmer buchen →',
      clearDates: 'Löschen', today: 'Heute',
      roomFallbackNotice: 'Das ausgewählte Zimmer ist für diese Daten nicht verfügbar — hier sind die anderen Optionen:',
      bedTypeSingle: 'Einzelbett', bedTypeDouble: 'Doppelbett', bedTypeQueen: 'Queen-Size-Bett',
      bedTypeKing: 'King-Size-Bett', bedTypeSofaBed: 'Schlafsofa', bedTypeBunkBed: 'Etagenbett',
      bookCategory: (name) => `${name}-Zimmer buchen →`,
      categoryFallbackNotice: 'Die ausgewählte Kategorie ist für diese Daten nicht verfügbar — hier sind die anderen Optionen:',
      categoryJustTaken: 'Dieses Zimmer wurde soeben vergeben — bitte wählen Sie eine andere Option.',
      categoryUnavailableNote: 'Für diese Daten nicht verfügbar',
      summaryCategory: 'Kategorie',
      chooseYourRoom: 'Wählen Sie Ihr Zimmer',
      bedConfigUnspecified: 'Bettenkonfiguration nicht angegeben',
    },
  };
  const T = STRINGS[LANG] || STRINGS.en;

  // ── Bed-type icons (Room Categories mode) ───────────────────────────────────
  // Same six shapes as the dashboard's BedIcons.jsx (Phase 7a) and
  // bookingPage.js's own ported copy (Phase 7b) — ported here too since this
  // file has no shared-component access. Not a redefinition — these paths
  // must stay identical to the other two copies.
  const BED_TYPE_ICON_SVG = {
    single:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="6" width="10" height="4" rx="1"/><rect x="7" y="10" width="10" height="7" rx="1.5"/><path d="M8 17v2M16 17v2"/></svg>',
    double:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="7" rx="1.5"/><path d="M4 17v2M20 17v2"/></svg>',
    sofa_bed: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="7" width="4" height="10" rx="1"/><rect x="7" y="9" width="13" height="4" rx="1"/><rect x="4" y="13" width="16" height="4" rx="1"/><path d="M3 17v2M21 17v2"/></svg>',
    bunk_bed: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="5" rx="1"/><rect x="4" y="13" width="16" height="5" rx="1"/><path d="M4 4v15M20 4v15"/></svg>',
  };
  // double/queen/king share the same wide silhouette.
  BED_TYPE_ICON_SVG.queen = BED_TYPE_ICON_SVG.double;
  BED_TYPE_ICON_SVG.king  = BED_TYPE_ICON_SVG.double;

  function bedTypeLabel(type) {
    const map = {
      single: T.bedTypeSingle, double: T.bedTypeDouble, queen: T.bedTypeQueen,
      king: T.bedTypeKing, sofa_bed: T.bedTypeSofaBed, bunk_bed: T.bedTypeBunkBed,
    };
    return map[type] || type;
  }

  // Occupancy icon — used on the room-picker step (renderStep2CategoryRooms),
  // same feather-style stroke convention as the bed-type icons above.
  const OCCUPANCY_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

  // ── State ──────────────────────────────────────────────────────────────────
  const S = {
    step:           1,
    checkIn:        '',
    checkOut:       '',
    numGuests:      2,
    allRooms:       [],
    allBookings:    [],
    availableRooms: [],
    selectedRoom:   null,
    guest:          { firstName: '', lastName: '', email: '', phone: '', notes: '' },
    bookingRef:          null,
    loading:             false,
    error:               null,
    wholeProperty:       false,
    unitsMode:           false,
    categoriesMode:      false,
    wholePropertyRate:   0,
    totalCapacity:       10,
    stripeConnectActive: false,
    breakfastEnabled:    false,
    breakfastPrice:      0,
    breakfastAdded:      false,
    redirecting:         false,
    steppedBack:         false,
    bookingPending:      false,
    // Room Categories mode
    availableCategories:      [],
    selectedCategory:         null,
    preselectedCategoryId:    null,
    categoryFallbackNotice:   null,
    // Room picker sub-step (multi-room categories) — categoryForRoomPicker
    // holds the category object being drilled into, null = plain category
    // list. A sub-mode flag within step 2, not a new numbered S.step.
    categoryForRoomPicker:    null,
    categoryRoomPickerRooms:  [],
  };

  // ── Calendar interaction state (persists across step-1 re-renders) ─────────
  const CAL = {
    viewYear:     new Date().getFullYear(),
    viewMonth:    new Date().getMonth(),
    hoverDate:    null,
    picking:      null,   // null | 'out' — which date we're waiting for next
    initialized:  false,  // set to true on first renderStep1 call
    checkInValEl:  null,
    checkOutValEl: null,
  };

  // ── Date helpers ───────────────────────────────────────────────────────────
  function todayISO() {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
  }

  function nightsBetween(a, b) {
    const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    return Math.round((parse(b) - parse(a)) / 86400000);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(LANG, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function calISODate(y, m, d) {
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  // ── Amenity formatter ──────────────────────────────────────────────────────
  const AMENITY_MAP = {
    wifi: 'WiFi', ensuite: 'En-suite', balcony: 'Balcony', terrace: 'Terrace',
    parking: 'Parking', minibar: 'Minibar', kitchenette: 'Kitchenette',
    aircon: 'Air Con', tv: 'TV', safe: 'Safe', bathtub: 'Bathtub',
  };
  function fmtAmenity(s) {
    return AMENITY_MAP[s.toLowerCase()] || (s.charAt(0).toUpperCase() + s.slice(1));
  }

  // ── Availability check ─────────────────────────────────────────────────────
  function getRoomsAvailable(rooms, bookings, checkIn, checkOut, numGuests) {
    return rooms.filter((room) => {
      if (room.status === 'maintenance') return false;
      if (room.capacity < numGuests) return false;
      // Overlap: booking covers any part of [checkIn, checkOut)
      const blocked = bookings.some((b) =>
        b.room_id === room.id &&
        b.status !== 'cancelled' &&
        b.status !== 'checked_out' &&
        b.status !== 'declined' &&
        b.check_in_date < checkOut &&
        b.check_out_date > checkIn
      );
      return !blocked;
    });
  }

  // True when at least one non-maintenance room would be free for the
  // requested dates but was excluded purely because its capacity is below
  // numGuests — lets the empty-results message distinguish "too many guests"
  // from "genuinely fully booked".
  function hasCapacityRejectedRoom(rooms, bookings, checkIn, checkOut, numGuests) {
    return rooms.some((room) => {
      if (room.status === 'maintenance') return false;
      if (room.capacity >= numGuests) return false;
      const blocked = bookings.some((b) =>
        b.room_id === room.id &&
        b.status !== 'cancelled' &&
        b.status !== 'checked_out' &&
        b.status !== 'declined' &&
        b.check_in_date < checkOut &&
        b.check_out_date > checkIn
      );
      return !blocked;
    });
  }

  // ── API calls ──────────────────────────────────────────────────────────────
  // All widget API calls use /api/widget/* — public endpoints that require no
  // authentication, so the widget works from any external website.
  async function apiFetch(path, opts) {
    const res = await fetch(API_BASE + path, opts);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[NestBook widget] API error', res.status, path, body);
      // .status lets callers distinguish e.g. a 409 "just taken" race from a
      // generic server error, without parsing the message string.
      const err = new Error('API error ' + res.status);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async function loadAvailability() {
    S.loading = true;
    S.error   = null;
    render();
    try {
      console.log('[NestBook widget] Fetching rooms for property', PROPERTY_ID);
      // Unit mode is already known from init()'s property fetch by the time the
      // guest reaches this step, so the rooms URL can be scoped up front —
      // excludes a unit's internal rooms, which are never independently
      // bookable. No-op query param for IR/WP, which never send it.
      const roomsPath = '/api/widget/rooms?property_id=' + PROPERTY_ID +
        (S.unitsMode ? '&parent_unit_id=null' : '');
      const [rooms, bookings, freshProp] = await Promise.all([
        apiFetch(roomsPath),
        apiFetch('/api/widget/bookings?property_id=' + PROPERTY_ID),
        apiFetch('/api/widget/property?property_id=' + PROPERTY_ID).catch(() => null),
      ]);
      // Re-confirm WP/units status from a fresh property fetch — makes the
      // check authoritative at availability time and not dependent on
      // init() succeeding.
      if (freshProp) {
        S.wholeProperty         = freshProp.rental_type === 'whole_property';
        S.unitsMode             = freshProp.rental_type === 'units';
        S.categoriesMode        = freshProp.rental_type === 'rooms' && freshProp.ir_room_mode === 'categories';
        S.wholePropertyRate     = freshProp.whole_property_rate || 0;
        S.totalCapacity         = freshProp.total_capacity || 10;
        S.stripeConnectActive   = freshProp.stripe_connect_active === true;
        S.breakfastEnabled      = !S.wholeProperty && freshProp.breakfast_widget_enabled === true;
        S.breakfastPrice        = freshProp.breakfast_price ?? 0;
      }
      console.log('[NestBook widget] Rooms received:', rooms.length, '| Active bookings:', bookings.length, '| WP mode:', S.wholeProperty);
      S.allRooms    = rooms;
      S.allBookings = bookings;
      if (S.wholeProperty) {
        const propertyBooked = bookings.some((b) =>
          b.status !== 'cancelled' &&
          b.status !== 'checked_out' &&
          b.status !== 'declined' &&
          b.check_in_date < S.checkOut &&
          b.check_out_date > S.checkIn
        );
        if (propertyBooked) {
          S.error = T.propertyNotAvailable;
          S.step  = 1;
        } else {
          S.selectedRoom = {
            id:              rooms[0]?.id ?? null,
            name:            'Whole property',
            price_per_night: S.wholePropertyRate,
            capacity:        S.totalCapacity,
          };
          // Fetch seasonal rate for the selected dates
          try {
            const rateData = await apiFetch(
              `/api/widget/rate-range?propertyId=${PROPERTY_ID}&checkIn=${S.checkIn}&checkOut=${S.checkOut}`
            );
            S.wpTotal     = rateData.total;
            S.wpBreakdown = rateData.breakdown;
          } catch {
            S.wpTotal     = null;
            S.wpBreakdown = null;
          }
          S.step = 2;
        }
      } else if (S.categoriesMode) {
        // Room Categories mode — server does all the filtering (capacity,
        // buffer, overlap) via GET /api/widget/categories, so the client-side
        // getRoomsAvailable() filter below is bypassed entirely for this
        // branch; allRooms/allBookings are still populated above but unused
        // here.
        await loadCategoriesAvailability();
      } else {
        S.availableRooms = getRoomsAvailable(rooms, bookings, S.checkIn, S.checkOut, S.numGuests);
        console.log('[NestBook widget] Available rooms:', S.availableRooms.length);

        if (S.preselectedRoomId) {
          const match = S.availableRooms.find((r) => r.id === S.preselectedRoomId);
          if (match) {
            S.selectedRoom = match;
            S.step = 3; // room is free for these dates — skip straight to guest details
          } else {
            // Not free — fall back to the room list with a note. Distinguish
            // "too many guests for this room" from a genuine date clash by
            // running the same single-room check used for the browse-flow
            // empty-results message.
            const preselectedRoom = rooms.find((r) => r.id === S.preselectedRoomId);
            const capacityIssue = preselectedRoom &&
              hasCapacityRejectedRoom([preselectedRoom], bookings, S.checkIn, S.checkOut, S.numGuests);
            S.roomFallbackNotice = capacityIssue ? T.noRoomsCapacity(S.numGuests) : T.roomFallbackNotice;
            S.step = 2;
          }
          S.preselectedRoomId = null; // consumed — don't re-check on step-back
        } else {
          S.step = 2;
        }
      }
    } catch (err) {
      console.error('[NestBook widget] loadAvailability failed:', err);
      S.error = T.errServer;
    }
    S.loading = false;
    render();
  }

  // ── Room Categories mode ──────────────────────────────────────────────────
  function categoriesPath() {
    return '/api/widget/categories?property_id=' + PROPERTY_ID +
      '&check_in=' + S.checkIn + '&check_out=' + S.checkOut + '&guests=' + S.numGuests;
  }

  function categoryPreviewPath(categoryId) {
    return '/api/widget/category-preview?category_id=' + categoryId +
      '&check_in=' + S.checkIn + '&check_out=' + S.checkOut;
  }

  function categoryRoomsPath(categoryId) {
    return '/api/widget/category-rooms?category_id=' + categoryId +
      '&check_in=' + S.checkIn + '&check_out=' + S.checkOut;
  }

  // Turns a GET /api/widget/category-preview response into the same shape
  // renderStep3()/renderStep4() already expect from S.selectedRoom (they
  // only ever read .id/.name/.price_per_night, so no changes are needed
  // there at all).
  function selectedRoomFromPreview(preview) {
    return {
      id:              preview.room_id,
      name:            preview.name,
      type:            preview.type,
      capacity:        preview.capacity,
      amenities:       preview.amenities,
      first_photo:     preview.photo,
      price_per_night: preview.price_per_night,
    };
  }

  // Called from loadAvailability() when S.categoriesMode is true — mirrors
  // that function's own preselection-handling shape (see
  // S.preselectedRoomId above) but for a category id, calling
  // category-preview instead of filtering the (never-fetched, for this mode)
  // room list client-side.
  async function loadCategoriesAvailability() {
    const categories = await apiFetch(categoriesPath());
    S.availableCategories = categories;
    console.log('[NestBook widget] Available categories:', categories.length);

    if (S.preselectedCategoryId) {
      const catId = S.preselectedCategoryId;
      S.preselectedCategoryId = null; // consumed — don't re-check on step-back
      const cat = categories.find((c) => c.id === catId);
      try {
        // Same room-count check as the normal browse-and-click path — a
        // multi-room category still needs the guest to pick a specific
        // room, even when arriving via a direct preselect link.
        const roomsData = await apiFetch(categoryRoomsPath(catId));
        const rooms = roomsData.rooms || [];
        if (rooms.length > 1) {
          S.categoryForRoomPicker   = cat || { id: catId, name: '' };
          S.categoryRoomPickerRooms = rooms;
          S.step = 2;
          return;
        }
        const preview = await apiFetch(categoryPreviewPath(catId));
        S.selectedRoom     = selectedRoomFromPreview(preview);
        S.selectedCategory = { id: catId, name: cat ? cat.name : '' };
        S.step = 3; // category still has a room free for these dates — skip straight to guest details
        return;
      } catch (_) {
        // Not free — fall back to the category list with a note, same
        // pattern as the room-preselection fallback above.
        S.categoryFallbackNotice = T.categoryFallbackNotice;
        S.step = 2;
        return;
      }
    }
    S.step = 2;
  }

  async function confirmBooking() {
    S.loading = true;
    S.error   = null;
    render();
    try {
      // 1. Create (or register) the guest
      const guest = await apiFetch('/api/widget/guests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: S.guest.firstName.trim(),
            last_name:  S.guest.lastName.trim(),
            email:      S.guest.email.trim()  || null,
            phone:      S.guest.phone.trim()  || null,
            notes:      S.guest.notes.trim()  || null,
          }),
        });
        // 2. Create the booking
        const nights     = nightsBetween(S.checkIn, S.checkOut);
        const totalPrice = S.wholeProperty
          ? (S.wpTotal ?? (S.wholePropertyRate * nights))
          : S.selectedRoom.price_per_night * nights;
        const bookingStatus = S.wholeProperty ? 'pending_owner_approval' : 'confirmed';
        const booking = await apiFetch('/api/widget/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            property_id:              Number(PROPERTY_ID),
            // Room Categories mode sends category_id instead of room_id —
            // the server resolves the actual room (same
            // assignRoomForCategoryBooking call category-preview already
            // dry-ran). JSON.stringify drops undefined keys, so exactly one
            // of the two is ever sent.
            room_id:                  S.selectedCategory ? undefined : S.selectedRoom.id,
            category_id:              S.selectedCategory ? S.selectedCategory.id : undefined,
            guest_id:                 guest.id,
            check_in_date:            S.checkIn,
            check_out_date:           S.checkOut,
            num_guests:               S.numGuests,
            status:                   bookingStatus,
            source:                   'direct',
            notes:                    S.guest.notes.trim() || null,
            total_price:              totalPrice,
            breakfast_added:          S.breakfastAdded ? 1 : 0,
            breakfast_guests:         S.breakfastAdded ? S.numGuests : 0,
            breakfast_price_per_person: S.breakfastAdded ? S.breakfastPrice : 0,
            breakfast_start_date:     S.breakfastAdded ? S.checkIn : null,
          }),
        });
        if (booking.checkoutUrl) {
          // Persist recovery token to localStorage so the guest can resume
          // if they close the tab, or be shown the stepped-back state if
          // they use browser-back from Stripe Checkout.
          try {
            if (booking.bookingId && booking.exp && booking.t) {
              localStorage.setItem(
                'nestbook_pending_' + PROPERTY_ID,
                JSON.stringify({ bookingId: booking.bookingId, exp: String(booking.exp), t: booking.t, createdAt: Date.now() }),
              );
            }
          } catch (_) {}
          S.loading    = false;
          S.redirecting = true;
          render();
          await new Promise((r) => setTimeout(r, 700));
          window.location.href = booking.checkoutUrl;
          return;
        }
        S.bookingRef     = booking.id;
        S.bookingPending = booking.status === 'pending_owner_approval';
        S.step           = 5;
    } catch (err) {
      console.error('[NestBook widget] confirmBooking failed:', err);
      if (S.selectedCategory && err.status === 409) {
        // Rare race: someone else booked the previewed room between
        // category-preview and this submission. Distinct message (not the
        // generic errServer) via categoryFallbackNotice — the same notice
        // box renderStep2Categories() already displays, since S.error itself
        // is never rendered on step 2 (renderStep2Categories(), like the
        // existing renderStep2(), doesn't check it). Return to step 2 with a
        // refreshed list rather than leaving the guest stuck on step 4 with
        // a stale selection.
        S.categoryFallbackNotice = T.categoryJustTaken;
        S.step               = 2;
        S.selectedRoom       = null;
        S.selectedCategory   = null;
        try {
          S.availableCategories = await apiFetch(categoriesPath());
        } catch (_) { /* keep the stale list rather than crash */ }
      } else {
        S.error = T.errServer;
      }
    }
    S.loading = false;
    render();
  }

  // ── CSS ────────────────────────────────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement('style');
    style.id    = 'nb-styles';
    style.textContent = `
/* ── NestBook Widget — all selectors namespaced with nb- ── */
#nb-root *, #nb-root *::before, #nb-root *::after { box-sizing: border-box; }
#nb-root {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  font-size: 15px;
  line-height: 1.5;
  color: #1C1C1E;
}

/* Floating trigger button */
.nb-trigger {
  position: fixed;
  bottom: 24px; right: 24px;
  z-index: 999990;
  background: ${BRAND};
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 13px 22px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 18px rgba(0,0,0,0.22);
  font-family: inherit;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
  text-decoration: none;
  user-select: none;
}
.nb-trigger:hover {
  background: ${BRAND_DARK};
  transform: translateY(-2px);
  box-shadow: 0 7px 22px rgba(0,0,0,0.27);
}
.nb-trigger-icon { font-size: 17px; }

/* Overlay (backdrop) */
.nb-overlay {
  position: fixed;
  inset: 0;
  background: rgba(10,20,8,0.45);
  z-index: 999991;
  animation: nb-fade-in 0.15s ease;
}
@keyframes nb-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes nb-slide-in-right {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
@keyframes nb-slide-out-right {
  from { transform: translateX(0); }
  to   { transform: translateX(100%); }
}
.nb-panel.nb-panel-closing {
  animation: nb-slide-out-right 0.22s ease forwards;
}

/* Side panel */
.nb-panel {
  position: fixed;
  top: 0; right: 0; bottom: 0;
  width: 420px;
  background: #fff;
  z-index: 999992;
  box-shadow: -8px 0 40px rgba(10,20,8,0.22);
  display: flex;
  flex-direction: column;
  animation: nb-slide-in-right 0.22s ease;
  overflow: hidden;
}

/* Panel header — dates+guests on left, close on right */
.nb-panel-hd {
  background: ${PANEL_HDR_BG};
  color: ${PANEL_HDR_TEXT};
  padding: 18px 20px 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.nb-panel-hd-summary {
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.35;
  flex: 1;
  min-width: 0;
}
.nb-panel-close {
  background: rgba(128,128,128,0.15);
  border: none;
  color: ${PANEL_HDR_TEXT};
  border-radius: 6px;
  width: 32px; height: 32px;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.12s;
  font-family: inherit;
}
.nb-panel-close:hover { background: rgba(128,128,128,0.28); }

/* Body */
.nb-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 24px 16px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: ${BRAND_LIGHT} transparent;
}
.nb-body::-webkit-scrollbar { width: 4px; }
.nb-body::-webkit-scrollbar-track { background: transparent; }
.nb-body::-webkit-scrollbar-thumb { background: ${BRAND_LIGHT}; border-radius: 4px; }

/* Footer */
.nb-ft {
  padding: 14px 24px;
  border-top: 1px solid #D8D3CB;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  background: #F4F3F0;
}

/* Buttons */
.nb-btn-main {
  background: ${BRAND};
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 22px;
  min-height: 44px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
  white-space: nowrap;
}
.nb-btn-main:hover    { background: ${BRAND_DARK}; }
.nb-btn-main:disabled { background: #9B9A96; cursor: not-allowed; }
.nb-btn-back {
  background: none;
  border: 1.5px solid #d1d5db;
  border-radius: 8px;
  padding: 9px 16px;
  min-height: 44px;
  font-size: 0.875rem;
  color: #6B6A66;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.12s;
}
.nb-btn-back:hover { border-color: ${BRAND}; color: ${BRAND_DARK}; }

/* Form fields */
.nb-field { margin-bottom: 14px; }
.nb-field:last-child { margin-bottom: 0; }
.nb-field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 14px;
}
.nb-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: #6B6A66;
  margin-bottom: 5px;
}
.nb-input, .nb-select, .nb-textarea {
  width: 100%;
  padding: 9px 11px;
  border: 1.5px solid #D8D3CB;
  border-radius: 8px;
  font-size: 0.875rem;
  color: #1C1C1E;
  background: #fff;
  outline: none;
  font-family: inherit;
  transition: border-color 0.12s;
  appearance: none;
}
.nb-input:focus, .nb-select:focus, .nb-textarea:focus {
  border-color: ${BRAND};
}
.nb-select { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23557a4a' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 30px; }
.nb-textarea { resize: vertical; min-height: 72px; }

/* Step 1 — date display row */
.nb-date-display {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
}
.nb-date-field {
  border: 1.5px solid #D8D3CB;
  border-radius: 8px;
  padding: 9px 12px;
  background: #fff;
  min-height: 52px;
}
.nb-date-field.nb-date-active {
  border-color: ${BRAND};
  box-shadow: 0 0 0 3px ${BRAND_LIGHT};
}
.nb-date-field-lbl {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: #9B9A96;
  margin-bottom: 3px;
}
.nb-date-field-val { font-size: 0.875rem; font-weight: 600; color: #1C1C1E; }
.nb-date-placeholder { color: #9B9A96; font-weight: 400; }

/* Calendar */
.nb-cal {
  background: #fff;
  border: 1.5px solid #D8D3CB;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 14px;
  user-select: none;
  -webkit-user-select: none;
  box-shadow: 0 2px 10px rgba(0,0,0,0.08);
}
.nb-cal-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: ${BRAND_LIGHT};
  border-bottom: 1px solid #D8D3CB;
}
.nb-cal-nav-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: ${BRAND_DARK};
  width: 34px; height: 34px;
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; line-height: 1;
  transition: background 0.12s;
  font-family: inherit;
  flex-shrink: 0;
}
.nb-cal-nav-btn:hover { background: rgba(0,0,0,0.09); }
.nb-cal-nav-title {
  font-size: 0.875rem;
  font-weight: 700;
  color: ${BRAND_DARK};
  text-align: center;
  flex: 1;
}
.nb-cal-dow-row,
.nb-cal-days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}
.nb-cal-dow {
  text-align: center;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: #9B9A96;
  padding: 8px 0 4px;
}
.nb-cal-day {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.82rem;
  cursor: pointer;
  position: relative;
  color: #1C1C1E;
  transition: background 0.08s, color 0.08s;
  -webkit-tap-highlight-color: transparent;
}
.nb-cal-day:hover:not(.nb-cal-past):not(.nb-cal-empty) {
  background: ${BRAND_LIGHT};
  color: ${BRAND_DARK};
}
.nb-cal-day.nb-cal-empty { cursor: default; pointer-events: none; }
.nb-cal-day.nb-cal-past  { color: #d1d5db; cursor: default; pointer-events: none; }
.nb-cal-day.nb-cal-today { font-weight: 700; }
.nb-cal-day.nb-cal-today::after {
  content: '';
  position: absolute;
  bottom: 4px; left: 50%;
  transform: translateX(-50%);
  width: 4px; height: 4px;
  border-radius: 50%;
  background: ${BRAND};
}
/* Range — in-range band */
.nb-cal-day.nb-cal-in-range {
  background: ${BRAND_LIGHT};
  color: ${BRAND_DARK};
  border-radius: 0;
}
/* Range endpoints — pill ends */
.nb-cal-day.nb-cal-start {
  background: ${BRAND};
  color: #fff;
  font-weight: 700;
  border-radius: 6px 0 0 6px;
}
.nb-cal-day.nb-cal-end {
  background: ${BRAND};
  color: #fff;
  font-weight: 700;
  border-radius: 0 6px 6px 0;
}
/* Single-day selection (no checkout yet) */
.nb-cal-day.nb-cal-start.nb-cal-end { border-radius: 6px; }
.nb-cal-day.nb-cal-start::after,
.nb-cal-day.nb-cal-end::after { display: none; }
/* Hover preview while picking check-out */
.nb-cal-day.nb-cal-hover-range {
  background: ${BRAND_LIGHT};
  color: ${BRAND_DARK};
  border-radius: 0;
  opacity: 0.75;
}
.nb-cal-day.nb-cal-hover-end {
  background: ${BRAND};
  color: #fff;
  border-radius: 0 6px 6px 0;
  opacity: 0.75;
}
/* Calendar footer links */
.nb-cal-links {
  display: flex;
  justify-content: flex-end;
  gap: 14px;
  padding: 7px 12px;
  border-top: 1px solid #F4F3F0;
}
.nb-cal-link {
  font-size: 0.78rem;
  color: ${BRAND_DARK};
  cursor: pointer;
  background: none;
  border: none;
  padding: 3px 0;
  font-family: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-color: transparent;
  transition: text-decoration-color 0.12s;
}
.nb-cal-link:hover { text-decoration-color: ${BRAND_DARK}; }

.nb-guests-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}
.nb-guests-ctrl {
  display: flex;
  align-items: center;
  gap: 0;
  border: 1.5px solid #D8D3CB;
  border-radius: 8px;
  overflow: hidden;
}
.nb-guests-btn {
  background: #F4F3F0;
  border: none;
  width: 36px; height: 38px;
  font-size: 1.1rem;
  cursor: pointer;
  color: #6B6A66;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s;
  font-family: inherit;
}
.nb-guests-btn:hover { background: ${BRAND_LIGHT}; color: ${BRAND_DARK}; }
.nb-guests-num {
  width: 44px;
  text-align: center;
  font-weight: 700;
  font-size: 0.95rem;
  color: #1C1C1E;
  border-left: 1px solid #D8D3CB;
  border-right: 1px solid #D8D3CB;
  line-height: 38px;
}

/* Step 2 room cards */
.nb-room {
  border: 1.5px solid #D8D3CB;
  border-radius: 12px;
  margin-bottom: 16px;
  overflow: hidden;
  background: #fff;
}
.nb-room:last-child { margin-bottom: 0; }
.nb-room-photo {
  width: 100%;
  height: 180px;
  object-fit: cover;
  display: block;
}
.nb-room-photo-placeholder {
  width: 100%;
  height: 180px;
  background: #F4F3F0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9B9A96;
}
.nb-room-info {
  padding: 14px 16px 16px;
}
.nb-room-hd {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 4px;
}
.nb-room-name  { font-weight: 700; font-size: 0.95rem; color: #1C1C1E; }
.nb-room-type  { font-size: 0.72rem; color: #9B9A96; text-transform: capitalize; margin-top: 2px; }
.nb-room-price { font-size: 1rem; font-weight: 700; color: ${BRAND_DARK}; white-space: nowrap; }
.nb-room-price span { font-size: 0.72rem; font-weight: 400; color: #9B9A96; }
.nb-room-caps  { font-size: 0.75rem; color: #6B6A66; margin-bottom: 8px; }
.nb-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
.nb-tag {
  font-size: 0.65rem;
  padding: 2px 7px;
  border-radius: 4px;
  background: #F4F3F0;
  border: 1px solid #D8D3CB;
  color: #6B6A66;
}
.nb-breakfast {
  display: inline-flex; align-items: center;
  font-size: 0.65rem; font-weight: 700;
  padding: 2px 8px; border-radius: 4px;
  background: #F4F3F0; border: 1px solid #405440; color: #405440;
  margin-bottom: 10px;
}

/* Room Categories mode — bed-config icon row on category cards */
.nb-bed-icons { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.nb-bed-icon {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 0.75rem; color: #6B6A66;
}
.nb-bed-icon-svg { display: inline-flex; color: ${BRAND_DARK}; flex-shrink: 0; }
.nb-bed-unspecified { color: #9B9A96; font-style: italic; }

/* Room Categories mode — unavailable (buffer-exhausted) category card */
.nb-room-unavailable { opacity: 0.55; }
.nb-room-unavailable .nb-btn-book-room { background: #9B9A96; cursor: not-allowed; }
.nb-room-unavailable .nb-btn-book-room:hover { background: #9B9A96; }
.nb-category-unavailable-note {
  font-size: 0.75rem; color: #b45309; font-weight: 600;
  margin-bottom: 8px;
}
.nb-btn-book-room {
  display: block;
  width: 100%;
  background: ${BRAND};
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 11px 16px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  text-align: center;
  transition: background 0.15s;
  margin-top: 12px;
}
.nb-btn-book-room:hover { background: ${BRAND_DARK}; }

/* Summary (step 4) */
.nb-summary {
  background: #F4F3F0;
  border-radius: 10px;
  padding: 16px 18px;
  margin-bottom: 16px;
}
.nb-summary-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid #D8D3CB;
  font-size: 0.875rem;
}
.nb-summary-row:last-child { border-bottom: none; }
.nb-summary-lbl { color: #6B6A66; font-weight: 500; flex-shrink: 0; }
.nb-summary-val { color: #1C1C1E; font-weight: 600; text-align: right; }
.nb-price-callout {
  background: ${BRAND_DARK};
  color: #fff;
  border-radius: 10px;
  padding: 16px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.nb-price-big  { font-size: 1.5rem; font-weight: 700; color: ${BRAND_LIGHT}; }
.nb-price-desc { font-size: 0.78rem; color: rgba(255,255,255,0.6); margin-top: 3px; }

/* No rooms message */
.nb-no-rooms {
  text-align: center;
  padding: 32px 16px;
  color: #6B6A66;
  font-size: 0.875rem;
}
.nb-no-rooms-icon { font-size: 2.5rem; margin-bottom: 10px; }

/* Fallback notice when preselected room isn't available for chosen dates */
.nb-fallback-notice {
  background: #fefce8;
  border: 1px solid #fde047;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.83rem;
  color: #854d0e;
  margin-bottom: 14px;
  line-height: 1.45;
}

/* Error message */
.nb-error {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.83rem;
  color: #dc2626;
  margin-bottom: 16px;
}

/* Loading spinner */
.nb-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 14px;
  color: #6B6A66;
  font-size: 0.875rem;
}
.nb-spinner {
  width: 30px; height: 30px;
  border: 3px solid ${BRAND_LIGHT};
  border-top-color: ${BRAND};
  border-radius: 50%;
  animation: nb-spin 0.7s linear infinite;
}
@keyframes nb-spin { to { transform: rotate(360deg); } }

/* WP step 2 — availability confirmed */
.nb-avail-badge {
  display: flex; align-items: center; gap: 8px;
  background: #F4F3F0; color: #405440;
  border: 1px solid #405440;
  border-radius: 8px; padding: 10px 14px;
  font-weight: 600; font-size: 0.88rem;
  margin-bottom: 14px;
}
.nb-avail-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border-radius: 50%;
  background: #405440; color: #fff;
  font-size: 0.72rem; font-weight: 700; flex-shrink: 0;
}
.nb-wp-summary {
  background: ${BRAND_LIGHT};
  border: 1px solid ${BRAND};
  border-radius: 10px; padding: 14px 16px;
  margin-bottom: 14px;
}
.nb-wp-dates {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 12px;
}
.nb-wp-date-col { flex: 1; }
.nb-wp-date-lbl {
  font-size: 0.7rem; color: #94a3b8;
  text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;
}
.nb-wp-date-val { font-weight: 600; font-size: 0.88rem; color: ${BRAND_DARK}; }
.nb-wp-date-arr { color: #94a3b8; font-size: 1.1rem; flex-shrink: 0; }
.nb-wp-price-row {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 0.88rem; color: #1e293b;
  padding-top: 10px; border-top: 1px solid #e2e8f0;
}
.nb-wp-capacity {
  font-size: 0.75rem; color: #94a3b8; margin-top: 6px;
}
.nb-wp-what { margin-bottom: 14px; }
.nb-wp-what-title {
  font-size: 0.85rem; font-weight: 600; color: #1e293b;
  margin-bottom: 10px;
}
.nb-wp-what-item {
  display: flex; align-items: flex-start; gap: 10px;
  font-size: 0.82rem; color: #475569; line-height: 1.5;
  margin-bottom: 8px;
}
.nb-wp-what-num {
  background: ${BRAND_DARK}; color: #fff;
  width: 20px; height: 20px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; font-weight: 700; flex-shrink: 0; margin-top: 1px;
}

/* Success screen */
.nb-success {
  text-align: center;
  padding: 32px 20px;
}
.nb-success-icon {
  width: 64px; height: 64px;
  background: ${BRAND_LIGHT};
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  font-size: 1.8rem;
}
.nb-success-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: ${BRAND_DARK};
  margin-bottom: 8px;
}
.nb-success-msg {
  color: #6B6A66;
  font-size: 0.875rem;
  margin-bottom: 18px;
}
.nb-ref {
  display: inline-block;
  background: ${BRAND_DARK};
  color: ${BRAND_LIGHT};
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 1px;
  padding: 10px 28px;
  border-radius: 10px;
  margin-bottom: 20px;
}
.nb-success-sub {
  font-size: 0.78rem;
  color: #9B9A96;
  margin-top: 8px;
}
/* Section heading inside body */
.nb-section-title {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #9B9A96;
  margin-bottom: 12px;
}

/* Breakfast add-on toggle row (step 4) */
.nb-bf-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding: 12px 14px;
  background: #F4F3F0;
  border: 1.5px solid #D8D3CB;
  border-radius: 10px;
  cursor: pointer;
}
.nb-bf-check {
  width: 18px; height: 18px;
  accent-color: ${BRAND};
  cursor: pointer;
  flex-shrink: 0;
}
.nb-bf-label {
  font-size: 0.875rem;
  color: #1C1C1E;
  cursor: pointer;
  line-height: 1.4;
}

/* ── Mobile responsive ── */
@media (max-width: 480px) {
  .nb-panel {
    width: 100vw;
    left: 0;
  }
  .nb-field-row {
    grid-template-columns: 1fr;
  }
  .nb-body {
    padding: 16px 16px 12px;
  }
  .nb-ft {
    padding: 12px 16px;
  }
}

/* ── Recovery banner — floating pill shown outside the modal ── */
.nb-recovery-banner {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 50px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.13);
  padding: 10px 10px 10px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 440px;
  width: calc(100% - 48px);
  z-index: 999989;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  font-size: 0.85rem;
  color: #475569;
  animation: nb-banner-in 0.3s ease;
}
@keyframes nb-banner-in {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
.nb-banner-msg { flex: 1; line-height: 1.4; }
.nb-banner-btn {
  background: ${BRAND};
  color: #fff;
  border: none;
  border-radius: 50px;
  padding: 7px 15px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: background 0.15s;
}
.nb-banner-btn:hover { background: ${BRAND_DARK}; }
.nb-banner-dismiss {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 1rem;
  padding: 4px 8px;
  line-height: 1;
  font-family: inherit;
}
.nb-banner-dismiss:hover { color: #475569; }
`;
    document.head.appendChild(style);
  }

  // ── DOM helpers ────────────────────────────────────────────────────────────
  function el(tag, cls, attrs) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) Object.assign(e, attrs);
    return e;
  }

  function txt(str) { return document.createTextNode(String(str || '')); }

  // ── Main DOM nodes ─────────────────────────────────────────────────────────
  let root, overlay, panel, body, footer;

  // ── Step indicator ─────────────────────────────────────────────────────────
  const STEP_LABELS = [T.step1Title, T.step2Title, T.step3Title, T.step4Title];

  function renderStepIndicator() {
    const wrap = el('div', 'nb-steps');
    for (let i = 1; i <= 4; i++) {
      const item = el('div', 'nb-step-item' +
        (S.step === i ? ' nb-active' : S.step > i ? ' nb-done' : ''));
      const dot   = el('div', 'nb-step-dot');
      dot.appendChild(S.step > i ? txt('✓') : txt(i));
      const label = el('div', 'nb-step-label');
      label.appendChild(txt(STEP_LABELS[i - 1]));
      item.appendChild(dot);
      item.appendChild(label);
      wrap.appendChild(item);
    }
    return wrap;
  }

  // ── Calendar helpers ───────────────────────────────────────────────────────
  function updateCalHover(gridEl) {
    gridEl.querySelectorAll('[data-date]').forEach((dayEl) => {
      dayEl.classList.remove('nb-cal-hover-range', 'nb-cal-hover-end');
      if (CAL.picking === 'out' && S.checkIn && CAL.hoverDate && CAL.hoverDate > S.checkIn) {
        const d = dayEl.dataset.date;
        if (d > S.checkIn && d < CAL.hoverDate) dayEl.classList.add('nb-cal-hover-range');
        if (d === CAL.hoverDate)                dayEl.classList.add('nb-cal-hover-end');
      }
    });
  }

  function updateDateDisplay() {
    if (!CAL.checkInValEl || !CAL.checkOutValEl) return;
    if (S.checkIn) {
      CAL.checkInValEl.textContent = fmtDate(S.checkIn);
      CAL.checkInValEl.classList.remove('nb-date-placeholder');
    } else {
      CAL.checkInValEl.textContent = '—';
      CAL.checkInValEl.classList.add('nb-date-placeholder');
    }
    if (S.checkOut) {
      CAL.checkOutValEl.textContent = fmtDate(S.checkOut);
      CAL.checkOutValEl.classList.remove('nb-date-placeholder');
    } else {
      CAL.checkOutValEl.textContent = CAL.picking === 'out' ? '…' : '—';
      CAL.checkOutValEl.classList.add('nb-date-placeholder');
    }
  }

  function renderCalendar(container) {
    container.innerHTML = '';
    const today = todayISO();

    // Month navigation bar
    const nav = el('div', 'nb-cal-nav');

    const prevBtn = el('button', 'nb-cal-nav-btn');
    prevBtn.innerHTML = '&#8592;';
    prevBtn.setAttribute('aria-label', 'Previous month');
    prevBtn.addEventListener('click', () => {
      CAL.viewMonth--;
      if (CAL.viewMonth < 0) { CAL.viewMonth = 11; CAL.viewYear--; }
      CAL.hoverDate = null;
      renderCalendar(container);
    });

    const monthTitle = el('div', 'nb-cal-nav-title');
    monthTitle.appendChild(txt(
      new Date(CAL.viewYear, CAL.viewMonth, 1)
        .toLocaleDateString(LANG, { month: 'long', year: 'numeric' })
    ));

    const nextBtn = el('button', 'nb-cal-nav-btn');
    nextBtn.innerHTML = '&#8594;';
    nextBtn.setAttribute('aria-label', 'Next month');
    nextBtn.addEventListener('click', () => {
      CAL.viewMonth++;
      if (CAL.viewMonth > 11) { CAL.viewMonth = 0; CAL.viewYear++; }
      CAL.hoverDate = null;
      renderCalendar(container);
    });

    nav.appendChild(prevBtn); nav.appendChild(monthTitle); nav.appendChild(nextBtn);
    container.appendChild(nav);

    // Day-of-week headers Mon → Sun (Jan 6 2025 = Monday)
    const dowRow = el('div', 'nb-cal-dow-row');
    for (let i = 0; i < 7; i++) {
      const cell = el('div', 'nb-cal-dow');
      const label = new Date(2025, 0, 6 + i).toLocaleDateString(LANG, { weekday: 'short' }).slice(0, 2);
      cell.appendChild(txt(label));
      dowRow.appendChild(cell);
    }
    container.appendChild(dowRow);

    // Day grid
    const firstDay    = new Date(CAL.viewYear, CAL.viewMonth, 1);
    const daysInMonth = new Date(CAL.viewYear, CAL.viewMonth + 1, 0).getDate();
    // Monday-first offset: JS getDay() → Sun=0,Mon=1…Sat=6 → Mon-offset: Sun=6,Mon=0…
    const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    const grid = el('div', 'nb-cal-days-grid');

    for (let i = 0; i < startOffset; i++) {
      grid.appendChild(el('div', 'nb-cal-day nb-cal-empty'));
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const iso     = calISODate(CAL.viewYear, CAL.viewMonth + 1, d);
      const isPast  = iso < today;
      const isStart = iso === S.checkIn;
      const isEnd   = iso === S.checkOut;
      const inRange = !!(S.checkIn && S.checkOut && iso > S.checkIn && iso < S.checkOut);
      const isToday = iso === today;

      let cls = 'nb-cal-day';
      if (isPast)   cls += ' nb-cal-past';
      if (isToday)  cls += ' nb-cal-today';
      if (isStart)  cls += ' nb-cal-start';
      if (isEnd)    cls += ' nb-cal-end';
      if (inRange)  cls += ' nb-cal-in-range';

      const cell = el('div', cls);
      cell.appendChild(txt(d));
      cell.dataset.date = iso;

      if (!isPast) {
        cell.addEventListener('click', () => {
          if (CAL.picking === 'out' && S.checkIn) {
            if (iso > S.checkIn) {
              S.checkOut  = iso;
              CAL.picking = null;
            } else {
              // Clicked on or before check-in — restart range
              S.checkIn  = iso;
              S.checkOut = '';
            }
          } else {
            S.checkIn   = iso;
            S.checkOut  = '';
            CAL.picking = 'out';
          }
          S.error       = null;
          CAL.hoverDate = null;
          renderCalendar(container);
          updateDateDisplay();
        });

        cell.addEventListener('mouseenter', () => {
          if (CAL.picking === 'out') {
            CAL.hoverDate = iso;
            updateCalHover(grid);
          }
        });
      }

      grid.appendChild(cell);
    }

    grid.addEventListener('mouseleave', () => {
      if (CAL.picking === 'out') {
        CAL.hoverDate = null;
        updateCalHover(grid);
      }
    });

    container.appendChild(grid);

    // Footer: Clear + Today links
    const links = el('div', 'nb-cal-links');
    if (S.checkIn || S.checkOut) {
      const clearBtn = el('button', 'nb-cal-link');
      clearBtn.appendChild(txt(T.clearDates));
      clearBtn.addEventListener('click', () => {
        S.checkIn     = '';
        S.checkOut    = '';
        CAL.picking   = null;
        CAL.hoverDate = null;
        renderCalendar(container);
        updateDateDisplay();
      });
      links.appendChild(clearBtn);
    }
    const todayBtn = el('button', 'nb-cal-link');
    todayBtn.appendChild(txt(T.today));
    todayBtn.addEventListener('click', () => {
      const now = new Date();
      CAL.viewYear  = now.getFullYear();
      CAL.viewMonth = now.getMonth();
      S.checkIn     = today;
      S.checkOut    = '';
      CAL.picking   = 'out';
      CAL.hoverDate = null;
      renderCalendar(container);
      updateDateDisplay();
    });
    links.appendChild(todayBtn);
    container.appendChild(links);
  }

  // ── Step 1: Dates ──────────────────────────────────────────────────────────
  function renderStep1() {
    // First entry: align calendar view to check-in month if dates already set
    if (!CAL.initialized) {
      CAL.initialized = true;
      if (S.checkIn) {
        const [y, m] = S.checkIn.split('-').map(Number);
        CAL.viewYear = y; CAL.viewMonth = m - 1;
      }
    }
    // Keep picking in sync with current S state
    if (!S.checkIn)       CAL.picking = null;
    else if (!S.checkOut) CAL.picking = 'out';
    else                  CAL.picking = null;

    if (S.error) {
      const err = el('div', 'nb-error');
      err.appendChild(txt(S.error));
      body.appendChild(err);
    }

    // Date display row (read-only, updated without full re-render)
    const displayRow = el('div', 'nb-date-display');

    function makeDateField(labelStr, iso, active) {
      const field = el('div', 'nb-date-field' + (active ? ' nb-date-active' : ''));
      const lbl   = el('div', 'nb-date-field-lbl'); lbl.appendChild(txt(labelStr));
      const val   = el('div', iso ? 'nb-date-field-val' : 'nb-date-field-val nb-date-placeholder');
      val.appendChild(txt(iso ? fmtDate(iso) : '—'));
      field.appendChild(lbl); field.appendChild(val);
      return { field, val };
    }

    const { field: inField,  val: inVal  } = makeDateField(T.checkIn,  S.checkIn,  CAL.picking === null && !!S.checkIn);
    const { field: outField, val: outVal } = makeDateField(T.checkOut, S.checkOut, CAL.picking === 'out');
    CAL.checkInValEl  = inVal;
    CAL.checkOutValEl = outVal;
    displayRow.appendChild(inField); displayRow.appendChild(outField);
    body.appendChild(displayRow);

    // Inline calendar
    const calContainer = el('div', 'nb-cal');
    body.appendChild(calContainer);
    renderCalendar(calContainer);

    // Guests
    const guestRow = el('div', 'nb-guests-row');
    const gLabel = el('div', 'nb-label'); gLabel.appendChild(txt(T.guests));
    const ctrl = el('div', 'nb-guests-ctrl');
    const minusBtn = el('button', 'nb-guests-btn');
    minusBtn.appendChild(txt('−'));
    minusBtn.addEventListener('click', () => {
      if (S.numGuests > 1) { S.numGuests--; numEl.textContent = S.numGuests; }
    });
    const numEl = el('div', 'nb-guests-num'); numEl.textContent = S.numGuests;
    const plusBtn = el('button', 'nb-guests-btn');
    plusBtn.appendChild(txt('+'));
    plusBtn.addEventListener('click', () => {
      const max = S.wholeProperty ? S.totalCapacity : 10;
      if (S.numGuests < max) { S.numGuests++; numEl.textContent = S.numGuests; }
    });
    ctrl.appendChild(minusBtn); ctrl.appendChild(numEl); ctrl.appendChild(plusBtn);
    guestRow.appendChild(gLabel); guestRow.appendChild(ctrl);
    body.appendChild(guestRow);

    if (S.wholeProperty && S.totalCapacity > 0) {
      const capHint = el('div', 'nb-field-hint');
      capHint.style.cssText = 'font-size:0.8rem;color:#64748b;margin-top:-4px;margin-bottom:4px;';
      capHint.appendChild(txt(T.capacity + ' ' + S.totalCapacity + ' ' + (S.totalCapacity === 1 ? 'guest' : 'guests')));
      body.appendChild(capHint);
    }

    // Footer: Check Availability
    const checkBtn = el('button', 'nb-btn-main');
    checkBtn.appendChild(txt(T.checkAvailability));
    checkBtn.addEventListener('click', () => {
      if (!S.checkIn || !S.checkOut) { S.error = T.errRequired; render(); return; }
      if (S.checkOut <= S.checkIn)   { S.error = T.errDates;    render(); return; }
      loadAvailability();
    });

    const spacer = el('div', '');
    footer.appendChild(spacer);
    footer.appendChild(checkBtn);
  }

  // ── Step 2 (WP): Availability confirmed + summary ─────────────────────────
  function renderStep2WP() {
    const nights    = nightsBetween(S.checkIn, S.checkOut);
    const total     = S.wpTotal ?? (S.wholePropertyRate * nights);
    const segments  = S.wpBreakdown && S.wpBreakdown.length > 1 ? S.wpBreakdown : null;

    // Available badge
    const badge = el('div', 'nb-avail-badge');
    const badgeIcon = el('span', 'nb-avail-icon'); badgeIcon.textContent = '✓';
    badge.appendChild(badgeIcon);
    badge.appendChild(txt(' ' + T.wpAvailBadge));
    body.appendChild(badge);

    // Summary card
    const card = el('div', 'nb-wp-summary');

    const datesRow = el('div', 'nb-wp-dates');
    function dateCol(labelTxt, valTxt) {
      const col = el('div', 'nb-wp-date-col');
      const lbl = el('div', 'nb-wp-date-lbl'); lbl.appendChild(txt(labelTxt));
      const val = el('div', 'nb-wp-date-val'); val.appendChild(txt(valTxt));
      col.appendChild(lbl); col.appendChild(val);
      return col;
    }
    datesRow.appendChild(dateCol(T.checkIn,  fmtDate(S.checkIn)));
    const arr = el('div', 'nb-wp-date-arr'); arr.appendChild(txt('→'));
    datesRow.appendChild(arr);
    datesRow.appendChild(dateCol(T.checkOut, fmtDate(S.checkOut)));
    card.appendChild(datesRow);

    if (total > 0) {
      if (segments) {
        // Multiple rate segments — show each line
        segments.forEach((seg) => {
          const segRow = el('div', 'nb-wp-price-row');
          const segLeft = el('span', '');
          segLeft.appendChild(txt(T.nights(seg.nights) + ' × ' + CUR_SYMBOL + seg.rate.toFixed(2)));
          if (seg.periodName) {
            const tag = el('span', 'nb-rate-tag');
            tag.appendChild(txt(seg.periodName));
            segLeft.appendChild(tag);
          }
          const segRight = el('strong', '');
          segRight.appendChild(txt(CUR_SYMBOL + (seg.rate * seg.nights).toLocaleString()));
          segRow.appendChild(segLeft);
          segRow.appendChild(segRight);
          card.appendChild(segRow);
        });
        const totalRow = el('div', 'nb-wp-price-row nb-wp-price-total');
        const totalLeft = el('span', ''); totalLeft.appendChild(txt('Total'));
        const totalRight = el('strong', ''); totalRight.appendChild(txt(CUR_SYMBOL + total.toLocaleString()));
        totalRow.appendChild(totalLeft);
        totalRow.appendChild(totalRight);
        card.appendChild(totalRow);
      } else {
        // Single rate
        const priceRow = el('div', 'nb-wp-price-row');
        const priceLeft = el('span', '');
        const displayRate = S.wpBreakdown?.[0]?.rate ?? S.wholePropertyRate;
        priceLeft.appendChild(txt(T.nights(nights) + ' × ' + CUR_SYMBOL + displayRate));
        if (S.wpBreakdown?.[0]?.periodName) {
          const tag = el('span', 'nb-rate-tag');
          tag.appendChild(txt(S.wpBreakdown[0].periodName));
          priceLeft.appendChild(tag);
        }
        const priceRight = el('strong', '');
        priceRight.appendChild(txt(CUR_SYMBOL + total.toLocaleString()));
        priceRow.appendChild(priceLeft);
        priceRow.appendChild(priceRight);
        card.appendChild(priceRow);
      }
    }

    if (S.totalCapacity > 0) {
      const cap = el('div', 'nb-wp-capacity');
      cap.appendChild(txt('Sleeps up to ' + S.totalCapacity + ' guests'));
      card.appendChild(cap);
    }
    body.appendChild(card);

    // "What happens next?" section
    const whatWrap = el('div', 'nb-wp-what');
    const whatTitle = el('h4', 'nb-wp-what-title'); whatTitle.appendChild(txt(T.wpWhatNext));
    whatWrap.appendChild(whatTitle);
    [T.wpNextStep1, T.wpNextStep2, T.wpNextStep3, T.wpNextStep4].forEach((text, i) => {
      const item = el('div', 'nb-wp-what-item');
      const num  = el('span', 'nb-wp-what-num'); num.appendChild(txt(String(i + 1)));
      const lbl  = el('span', ''); lbl.appendChild(txt(text));
      item.appendChild(num); item.appendChild(lbl);
      whatWrap.appendChild(item);
    });
    body.appendChild(whatWrap);

    // Footer buttons
    const backBtn = el('button', 'nb-btn-back');
    backBtn.appendChild(txt(T.wpChangeDates));
    backBtn.addEventListener('click', () => { S.step = 1; S.error = null; render(); });

    const nextBtn = el('button', 'nb-btn-main');
    nextBtn.appendChild(txt(T.wpRequestBtn));
    nextBtn.addEventListener('click', () => { S.step = 3; render(); });

    footer.appendChild(backBtn);
    footer.appendChild(nextBtn);
  }

  // ── Step 2: Room selection ─────────────────────────────────────────────────
  function makePlaceholder() {
    const ph = el('div', 'nb-room-photo-placeholder');
    ph.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v11M21 7v11M3 12h18M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2M7 12V7M17 12V7"/></svg>';
    return ph;
  }

  function renderStep2() {
    if (S.roomFallbackNotice) {
      const notice = el('div', 'nb-fallback-notice');
      notice.appendChild(txt(S.roomFallbackNotice));
      body.appendChild(notice);
      S.roomFallbackNotice = null;
    }

    if (S.availableRooms.length === 0) {
      const capacityIssue = hasCapacityRejectedRoom(S.allRooms, S.allBookings, S.checkIn, S.checkOut, S.numGuests);
      const wrap = el('div', 'nb-no-rooms');
      const icon = el('div', 'nb-no-rooms-icon'); icon.appendChild(txt('🛏️'));
      const msg  = el('div', ''); msg.appendChild(txt(capacityIssue ? T.noRoomsCapacity(S.numGuests) : T.noRooms));
      wrap.appendChild(icon); wrap.appendChild(msg);
      body.appendChild(wrap);
    } else {
      const title = el('div', 'nb-section-title');
      // Unit mode label is hardcoded (not yet in the STRINGS catalogue —
      // matches the plain-English precedent set elsewhere for Unit mode).
      const noun = S.unitsMode
        ? (S.availableRooms.length === 1 ? 'unit' : 'units')
        : (S.availableRooms.length === 1 ? 'room' : 'rooms');
      title.appendChild(txt(S.availableRooms.length + ' ' + noun + ' available'));
      body.appendChild(title);

      S.availableRooms.forEach((room) => {
        const card = el('div', 'nb-room');

        // Photo or placeholder
        if (room.first_photo) {
          const img = el('img', 'nb-room-photo');
          img.src     = API_BASE + '/uploads/rooms/' + room.first_photo;
          img.alt     = room.name;
          img.loading = 'lazy';
          card.appendChild(img);
        } else {
          card.appendChild(makePlaceholder());
        }

        // Info section
        const info = el('div', 'nb-room-info');

        const hd = el('div', 'nb-room-hd');
        const nameBlock = el('div', '');
        const name = el('div', 'nb-room-name'); name.appendChild(txt(room.name));
        const type = el('div', 'nb-room-type'); type.appendChild(txt(room.type));
        nameBlock.appendChild(name); nameBlock.appendChild(type);
        const priceEl = el('div', 'nb-room-price');
        priceEl.appendChild(txt(CUR_SYMBOL + room.price_per_night));
        const perN = el('span', ''); perN.appendChild(txt(T.perNight));
        priceEl.appendChild(perN);
        hd.appendChild(nameBlock); hd.appendChild(priceEl);
        info.appendChild(hd);

        const caps = el('div', 'nb-room-caps');
        caps.appendChild(txt(T.capacity + ' ' + room.capacity + ' ' + (room.capacity === 1 ? 'guest' : 'guests')));
        info.appendChild(caps);

        // Breakfast badge
        if (room.breakfast_included || room.property_breakfast_included) {
          const bfBadge = el('div', 'nb-breakfast');
          bfBadge.appendChild(txt(T.breakfastIncluded));
          info.appendChild(bfBadge);
        }

        // Amenity tags
        const amenities = (room.amenities || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (amenities.length > 0) {
          const tags = el('div', 'nb-tags');
          amenities.slice(0, 5).forEach((a) => {
            const tag = el('span', 'nb-tag'); tag.appendChild(txt(fmtAmenity(a)));
            tags.appendChild(tag);
          });
          info.appendChild(tags);
        }

        // Per-card book button — directly advances to step 3
        const bookBtn = el('button', 'nb-btn-book-room');
        bookBtn.appendChild(txt(S.unitsMode ? 'Book this unit →' : T.bookRoom));
        bookBtn.addEventListener('click', () => {
          S.selectedRoom = room;
          S.step = 3;
          render();
        });
        info.appendChild(bookBtn);

        card.appendChild(info);
        body.appendChild(card);
      });
    }

    // Footer — back only; booking is triggered per-card
    const backBtn = el('button', 'nb-btn-back');
    backBtn.appendChild(txt(T.back));
    backBtn.addEventListener('click', () => { S.step = 1; S.error = null; render(); });

    footer.appendChild(backBtn);
    footer.appendChild(el('div', ''));
  }

  // ── Step 2 (Room Categories mode): Category selection ─────────────────────
  // Parallel to renderStep2() above, not a modification of it — one card per
  // category instead of per room. Unavailable categories (available: false,
  // e.g. only buffered rooms remain) render greyed-out with a note rather
  // than being hidden, per spec.
  function renderStep2Categories() {
    if (S.categoryFallbackNotice) {
      const notice = el('div', 'nb-fallback-notice');
      notice.appendChild(txt(S.categoryFallbackNotice));
      body.appendChild(notice);
      S.categoryFallbackNotice = null;
    }

    const categories = S.availableCategories || [];
    if (categories.length === 0) {
      const wrap = el('div', 'nb-no-rooms');
      const icon = el('div', 'nb-no-rooms-icon'); icon.appendChild(txt('🛏️'));
      const msg  = el('div', ''); msg.appendChild(txt(T.noRooms));
      wrap.appendChild(icon); wrap.appendChild(msg);
      body.appendChild(wrap);
    } else {
      const title = el('div', 'nb-section-title');
      const noun = categories.length === 1 ? 'category' : 'categories';
      title.appendChild(txt(categories.length + ' ' + noun + ' available'));
      body.appendChild(title);

      categories.forEach((category) => {
        const card = el('div', 'nb-room' + (category.available ? '' : ' nb-room-unavailable'));

        if (category.photo) {
          const img = el('img', 'nb-room-photo');
          img.src     = API_BASE + '/uploads/rooms/' + category.photo;
          img.alt     = category.name;
          img.loading = 'lazy';
          card.appendChild(img);
        } else {
          card.appendChild(makePlaceholder());
        }

        const info = el('div', 'nb-room-info');

        const hd = el('div', 'nb-room-hd');
        const nameBlock = el('div', '');
        const name = el('div', 'nb-room-name'); name.appendChild(txt(category.name));
        nameBlock.appendChild(name);
        const priceEl = el('div', 'nb-room-price');
        priceEl.appendChild(txt(category.price_min === category.price_max
          ? CUR_SYMBOL + category.price_min
          : CUR_SYMBOL + category.price_min + '–' + CUR_SYMBOL + category.price_max));
        const perN = el('span', ''); perN.appendChild(txt(T.perNight));
        priceEl.appendChild(perN);
        hd.appendChild(nameBlock); hd.appendChild(priceEl);
        info.appendChild(hd);

        const caps = el('div', 'nb-room-caps');
        caps.appendChild(txt(T.capacity + ' ' + category.capacity + ' ' + (category.capacity === 1 ? 'guest' : 'guests')));
        info.appendChild(caps);

        // Bed-config icons — the server already only sends this when every
        // guest-eligible room in the category shares an identical config
        // (GET /api/widget/categories), so no uniformity check is needed
        // here — just render whatever came back, or nothing.
        if (category.bed_config && category.bed_config.length > 0) {
          const bedRow = el('div', 'nb-bed-icons');
          category.bed_config.forEach((entry) => {
            const chip = el('span', 'nb-bed-icon');
            const iconSpan = el('span', 'nb-bed-icon-svg');
            iconSpan.innerHTML = BED_TYPE_ICON_SVG[entry.type] || BED_TYPE_ICON_SVG.double;
            chip.appendChild(iconSpan);
            const qtyPrefix = entry.qty > 1 ? (entry.qty + '× ') : '';
            chip.appendChild(txt(qtyPrefix + bedTypeLabel(entry.type)));
            bedRow.appendChild(chip);
          });
          info.appendChild(bedRow);
        }

        if (!category.available) {
          const noteEl = el('div', 'nb-category-unavailable-note');
          noteEl.appendChild(txt(T.categoryUnavailableNote));
          info.appendChild(noteEl);
        }

        const bookBtn = el('button', 'nb-btn-book-room');
        bookBtn.appendChild(txt(T.bookCategory(category.name)));
        if (!category.available) {
          bookBtn.disabled = true;
        } else {
          bookBtn.addEventListener('click', async () => {
            S.loading = true;
            render();
            try {
              // Quick lookup — the category's TOTAL room count (unfiltered
              // by capacity, unlike the category-list response this card
              // came from), which is what actually decides whether a
              // picker is needed. A capacity-filtered count could
              // under-count rooms the picker still needs to show.
              const roomsData = await apiFetch(categoryRoomsPath(category.id));
              const rooms = roomsData.rooms || [];
              if (rooms.length > 1) {
                S.categoryForRoomPicker   = category;
                S.categoryRoomPickerRooms = rooms;
                S.loading = false;
                render();
                return;
              }
              // 0 or 1 room — keep the existing behaviour: category-preview
              // does the real buffer-respecting assignment, same as a real
              // booking would use.
              const preview = await apiFetch(categoryPreviewPath(category.id));
              S.selectedRoom     = selectedRoomFromPreview(preview);
              S.selectedCategory = { id: category.id, name: category.name };
              S.step = 3;
            } catch (_) {
              // Race: category filled between browsing and clicking — show a
              // note and refresh the list rather than a generic error.
              S.categoryFallbackNotice = T.categoryFallbackNotice;
              try {
                S.availableCategories = await apiFetch(categoriesPath());
              } catch (_) { /* keep the stale list rather than crash */ }
            }
            S.loading = false;
            render();
          });
        }
        info.appendChild(bookBtn);

        card.appendChild(info);
        body.appendChild(card);
      });
    }

    // Footer — back only; booking is triggered per-card
    const backBtn = el('button', 'nb-btn-back');
    backBtn.appendChild(txt(T.back));
    backBtn.addEventListener('click', () => { S.step = 1; S.error = null; render(); });

    footer.appendChild(backBtn);
    footer.appendChild(el('div', ''));
  }

  // ── Step 2 (Room Categories mode): Room picker within a category ──────────
  // Sub-mode within step 2 — S.categoryForRoomPicker holds the category
  // being drilled into; S.step itself never changes for this. Shown only
  // when the category has more than one room (renderStep2Categories()'s
  // book button decides that before setting this state). Every room in the
  // category is shown, no capacity filtering — booked/buffered rooms are
  // disabled, never hidden.
  function renderStep2CategoryRooms() {
    const category = S.categoryForRoomPicker;
    const rooms = S.categoryRoomPickerRooms || [];

    const title = el('div', 'nb-section-title');
    title.appendChild(txt(T.chooseYourRoom));
    body.appendChild(title);

    rooms.forEach((room) => {
      const card = el('div', 'nb-room' + (room.available ? '' : ' nb-room-unavailable'));
      const info = el('div', 'nb-room-info');

      const hd = el('div', 'nb-room-hd');
      const nameBlock = el('div', '');
      const name = el('div', 'nb-room-name'); name.appendChild(txt(room.name));
      nameBlock.appendChild(name);
      const priceEl = el('div', 'nb-room-price');
      priceEl.appendChild(txt(CUR_SYMBOL + room.price_per_night));
      const perN = el('span', ''); perN.appendChild(txt(T.perNight));
      priceEl.appendChild(perN);
      hd.appendChild(nameBlock); hd.appendChild(priceEl);
      info.appendChild(hd);

      // Occupancy + bed-config chips together in one row, same "icon +
      // label" treatment as bookingPage.js's category cards.
      const infoRow = el('div', 'nb-bed-icons');

      const occChip = el('span', 'nb-bed-icon');
      const occIcon = el('span', 'nb-bed-icon-svg');
      occIcon.innerHTML = OCCUPANCY_ICON_SVG;
      occChip.appendChild(occIcon);
      occChip.appendChild(txt(T.capacity + ' ' + room.capacity + ' ' + (room.capacity === 1 ? 'guest' : 'guests')));
      infoRow.appendChild(occChip);

      if (room.bed_config && room.bed_config.length > 0) {
        room.bed_config.forEach((entry) => {
          const chip = el('span', 'nb-bed-icon');
          const iconSpan = el('span', 'nb-bed-icon-svg');
          iconSpan.innerHTML = BED_TYPE_ICON_SVG[entry.type] || BED_TYPE_ICON_SVG.double;
          chip.appendChild(iconSpan);
          const qtyPrefix = entry.qty > 1 ? (entry.qty + '× ') : '';
          chip.appendChild(txt(qtyPrefix + bedTypeLabel(entry.type)));
          infoRow.appendChild(chip);
        });
      } else {
        const noBedChip = el('span', 'nb-bed-icon nb-bed-unspecified');
        noBedChip.appendChild(txt(T.bedConfigUnspecified));
        infoRow.appendChild(noBedChip);
      }
      info.appendChild(infoRow);

      if (!room.available) {
        const noteEl = el('div', 'nb-category-unavailable-note');
        noteEl.appendChild(txt(T.categoryUnavailableNote));
        info.appendChild(noteEl);
      }

      const selectBtn = el('button', 'nb-btn-book-room');
      selectBtn.appendChild(txt(T.bookRoom));
      if (!room.available) {
        selectBtn.disabled = true;
      } else {
        selectBtn.addEventListener('click', () => {
          // A specific physical room, picked directly by the guest — this
          // bypasses the category-assignment engine entirely (no
          // category-preview call), same as the plain per-room booking
          // flow (renderStep2()'s own book button) already does.
          S.selectedRoom = {
            id:              room.room_id,
            name:            room.name,
            price_per_night: room.price_per_night,
            capacity:        room.capacity,
          };
          S.selectedCategory       = category ? { id: category.id, name: category.name } : null;
          S.categoryForRoomPicker   = null;
          S.categoryRoomPickerRooms = [];
          S.step = 3;
          render();
        });
      }
      info.appendChild(selectBtn);

      card.appendChild(info);
      body.appendChild(card);
    });

    // Footer — back returns to the plain category list, staying on step 2.
    const backBtn = el('button', 'nb-btn-back');
    backBtn.appendChild(txt(T.back));
    backBtn.addEventListener('click', () => {
      S.categoryForRoomPicker   = null;
      S.categoryRoomPickerRooms = [];
      S.error = null;
      render();
    });

    footer.appendChild(backBtn);
    footer.appendChild(el('div', ''));
  }

  // ── Step 3: Guest details ─────────────────────────────────────────────────
  function renderStep3() {
    if (S.error) {
      const err = el('div', 'nb-error'); err.appendChild(txt(S.error));
      body.appendChild(err);
    }

    function field(labelTxt, name, type, required, placeholder) {
      const wrap  = el('div', 'nb-field');
      const label = el('label', 'nb-label'); label.appendChild(txt(labelTxt));
      const input = el('input', 'nb-input');
      Object.assign(input, { type: type || 'text', value: S.guest[name] || '', placeholder: placeholder || '' });
      if (required) input.required = true;
      input.addEventListener('input', () => { S.guest[name] = input.value; S.error = null; });
      wrap.appendChild(label); wrap.appendChild(input);
      return wrap;
    }

    const nameRow = el('div', 'nb-field-row');
    nameRow.appendChild(field(T.firstName, 'firstName', 'text', true));
    nameRow.appendChild(field(T.lastName,  'lastName',  'text', true));
    body.appendChild(nameRow);
    body.appendChild(field(T.email, 'email', 'email', true));
    body.appendChild(field(T.phone, 'phone', 'tel',   false));

    // Notes textarea
    const notesWrap  = el('div', 'nb-field');
    const notesLabel = el('label', 'nb-label');
    notesLabel.appendChild(txt(T.notes + ' '));
    const optSpan = el('span', '');
    optSpan.style.fontWeight = '400';
    optSpan.style.textTransform = 'none';
    optSpan.appendChild(txt(T.optional));
    notesLabel.appendChild(optSpan);
    const notesArea = el('textarea', 'nb-textarea');
    notesArea.value = S.guest.notes || '';
    notesArea.placeholder = '';
    notesArea.rows = 3;
    notesArea.addEventListener('input', () => { S.guest.notes = notesArea.value; });
    notesWrap.appendChild(notesLabel); notesWrap.appendChild(notesArea);
    body.appendChild(notesWrap);

    // Footer
    const backBtn = el('button', 'nb-btn-back');
    backBtn.appendChild(txt(T.back));
    backBtn.addEventListener('click', () => { S.step = S.wholeProperty ? 1 : 2; S.error = null; render(); });

    const nextBtn = el('button', 'nb-btn-main');
    nextBtn.appendChild(txt(T.step4Title + ' →'));
    nextBtn.addEventListener('click', () => {
      if (!S.guest.firstName.trim() || !S.guest.lastName.trim() || !S.guest.email.trim()) {
        S.error = T.errRequired; render(); return;
      }
      S.step = 4; render();
    });

    footer.appendChild(backBtn);
    footer.appendChild(nextBtn);
  }

  // ── Step 4: Confirm ────────────────────────────────────────────────────────
  function renderStep4() {
    if (S.error) {
      const err = el('div', 'nb-error'); err.appendChild(txt(S.error));
      body.appendChild(err);
    }

    const nights     = nightsBetween(S.checkIn, S.checkOut);
    const basePrice  = S.wholeProperty
      ? (S.wpTotal ?? (S.wholePropertyRate * nights))
      : S.selectedRoom.price_per_night * nights;
    const bfTotal    = S.breakfastAdded ? S.breakfastPrice * S.numGuests * nights : 0;
    const totalPrice = basePrice + bfTotal;

    // Summary card
    const summary = el('div', 'nb-summary');

    function row(label, value) {
      const r   = el('div', 'nb-summary-row');
      const lbl = el('div', 'nb-summary-lbl'); lbl.appendChild(txt(label));
      const val = el('div', 'nb-summary-val'); val.appendChild(txt(value));
      r.appendChild(lbl); r.appendChild(val);
      return r;
    }

    if (!S.wholeProperty) summary.appendChild(row(T.summaryRoom, S.selectedRoom.name));
    // Room Categories mode — extra context row; the room row above already
    // shows the specific resolved room (e.g. "Lavender Room"), this adds
    // which category it came from (e.g. "Double").
    if (S.selectedCategory) summary.appendChild(row(T.summaryCategory, S.selectedCategory.name));
    summary.appendChild(row(T.summaryDates,  fmtDate(S.checkIn) + ' → ' + fmtDate(S.checkOut)));
    summary.appendChild(row(T.summaryNights, T.nights(nights)));
    summary.appendChild(row(T.summaryGuests, S.numGuests + ' ' + (S.numGuests === 1 ? 'guest' : 'guests')));
    summary.appendChild(row(T.step3Title,    S.guest.firstName + ' ' + S.guest.lastName));
    if (S.guest.email) summary.appendChild(row(T.email.replace(' *', ''), S.guest.email));
    if (S.guest.notes) summary.appendChild(row(T.notes, S.guest.notes));
    body.appendChild(summary);

    // Breakfast add-on toggle (only if property has it enabled)
    if (S.breakfastEnabled && !S.wholeProperty && S.breakfastPrice > 0) {
      const bfRow = el('div', 'nb-bf-row');
      const bfCb  = el('input', 'nb-bf-check');
      bfCb.type    = 'checkbox';
      bfCb.id      = 'nb-bf-cb';
      bfCb.checked = S.breakfastAdded;
      const bfLabel = el('label', 'nb-bf-label');
      bfLabel.htmlFor = 'nb-bf-cb';
      bfLabel.appendChild(txt(T.addBreakfast(CUR_SYMBOL + S.breakfastPrice.toFixed(2))));
      bfCb.addEventListener('change', () => { S.breakfastAdded = bfCb.checked; render(); });
      bfRow.appendChild(bfCb);
      bfRow.appendChild(bfLabel);
      body.appendChild(bfRow);
    }

    // Price callout
    const pc    = el('div', 'nb-price-callout');
    const pcL   = el('div', '');
    const pcBig = el('div', 'nb-price-big');
    pcBig.appendChild(txt(CUR_SYMBOL + totalPrice.toLocaleString()));
    const pcDesc = el('div', 'nb-price-desc');
    const ratePerNight = S.wholeProperty
      ? (S.wpBreakdown?.length === 1 ? S.wpBreakdown[0].ratePerNight : 0)
      : S.selectedRoom.price_per_night;
    const priceDescTxt = ratePerNight > 0
      ? CUR_SYMBOL + ratePerNight + T.perNight + ' × ' + T.nights(nights)
      : T.nights(nights);
    pcDesc.appendChild(txt(priceDescTxt));
    pcL.appendChild(pcBig); pcL.appendChild(pcDesc);

    const pcR = el('div', '');
    pcR.style.textAlign = 'right';
    const pcLabel = el('div', '');
    pcLabel.style.cssText = 'font-size:0.72rem;color:rgba(255,255,255,0.55);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;';
    pcLabel.appendChild(txt(T.summaryTotal));
    pcR.appendChild(pcLabel);
    pc.appendChild(pcL); pc.appendChild(pcR);
    body.appendChild(pc);

    // Footer
    const backBtn = el('button', 'nb-btn-back');
    backBtn.appendChild(txt(T.back));
    backBtn.addEventListener('click', () => { S.step = 3; S.error = null; render(); });

    const confirmBtn = el('button', 'nb-btn-main');
    const btnLabel = S.wholeProperty
      ? (S.loading ? T.wpConfirming    : T.wpConfirmBtn)
      : S.stripeConnectActive
        ? (S.loading ? T.payNowConfirming : T.payNow)
        : (S.loading ? T.confirming       : T.confirmBtn);
    confirmBtn.appendChild(txt(btnLabel));
    confirmBtn.disabled = S.loading;
    confirmBtn.addEventListener('click', () => { confirmBooking(); });

    footer.appendChild(backBtn);
    footer.appendChild(confirmBtn);
  }

  // ── Step 5: Success ────────────────────────────────────────────────────────
  function renderSuccess() {
    const wrap = el('div', 'nb-success');
    // isPending: rooms-mode booking routed to pending_owner_approval (block-booking protection)
    const isPending = S.bookingPending && !S.wholeProperty;
    const isRequest = S.wholeProperty || isPending;

    const icon = el('div', 'nb-success-icon'); icon.appendChild(txt(isRequest ? '⏳' : '✓'));
    const title = el('h2', 'nb-success-title'); title.appendChild(txt(isRequest ? T.wpSuccessTitle : T.successTitle));
    const msg   = el('p', 'nb-success-msg'); msg.appendChild(txt(isRequest ? T.wpSuccessMsg : T.successMsg));

    if (!isRequest) {
      const ref = el('div', 'nb-ref'); ref.appendChild(txt('#' + String(S.bookingRef).padStart(4, '0')));
      wrap.appendChild(ref);
    }

    const sub = el('p', 'nb-success-sub');
    if (isPending) {
      sub.appendChild(txt(T.pendingEmailNote));
    } else {
      sub.appendChild(txt(S.guest.email
        ? (LANG === 'fr' ? 'Un récapitulatif sera envoyé à ' : LANG === 'de' ? 'Eine Bestätigung wird gesendet an ' : LANG === 'es' ? 'Se enviará una confirmación a ' : LANG === 'nl' ? 'Een bevestiging wordt verstuurd naar ' : 'A confirmation will be sent to ') + S.guest.email
        : ''));
    }

    wrap.appendChild(icon); wrap.appendChild(title); wrap.appendChild(msg);
    if (S.guest.email) wrap.appendChild(sub);

    body.appendChild(wrap);

    // Footer: close
    const spacer = el('div', '');
    const closeBtn = el('button', 'nb-btn-main');
    closeBtn.appendChild(txt(T.successClose));
    closeBtn.addEventListener('click', closeModal);
    footer.appendChild(spacer);
    footer.appendChild(closeBtn);
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  function renderLoading(msg) {
    const wrap    = el('div', 'nb-loading');
    const spinner = el('div', 'nb-spinner');
    const label   = el('div', ''); label.appendChild(txt(msg || T.checking));
    wrap.appendChild(spinner); wrap.appendChild(label);
    body.appendChild(wrap);
    footer.appendChild(el('div', ''));  // keep footer height
  }

  // ── Stepped-back state (shown after bfcache restore from Stripe) ──────────
  function renderSteppedBack() {
    let pending = null;
    try {
      const raw = localStorage.getItem('nestbook_pending_' + PROPERTY_ID);
      if (raw) pending = JSON.parse(raw);
    } catch (_) {}

    const wrap = el('div', 'nb-loading');
    const msgEl = el('p', '');
    msgEl.textContent = T.steppedBack;
    msgEl.style.cssText = 'margin:0;text-align:center;color:#475569;font-size:0.9rem;line-height:1.5;';
    wrap.appendChild(msgEl);
    body.appendChild(wrap);

    if (pending?.bookingId) {
      const continueBtn = el('button', 'nb-btn-main');
      continueBtn.textContent = T.steppedBackBtn;
      continueBtn.addEventListener('click', async () => {
        S.steppedBack = false;
        S.redirecting = true;
        render();
        try {
          const r = await fetch(API_BASE + '/api/widget/retry-payment', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ booking_id: String(pending.bookingId), exp: String(pending.exp || ''), token: String(pending.t || '') }),
          });
          const data = await r.json();
          if (data.checkoutUrl) {
            window.location.href = data.checkoutUrl;
          } else {
            window.location.href = API_BASE + '/pay/recover?b=' + pending.bookingId + '&exp=' + (pending.exp || '') + '&t=' + (pending.t || '');
          }
        } catch (_) {
          window.location.href = API_BASE + '/pay/recover?b=' + (pending.bookingId || '') + '&exp=' + (pending.exp || '') + '&t=' + (pending.t || '');
        }
      });
      footer.appendChild(continueBtn);
    }
  }

  // ── Main render ────────────────────────────────────────────────────────────
  function render() {
    if (!body) return;

    // Clear body and footer
    body.innerHTML   = '';
    footer.innerHTML = '';

    // Update the panel header summary (dates+guests once known; step title otherwise)
    const hdSummary = panel.querySelector('.nb-panel-hd-summary');
    if (hdSummary) {
      if (S.step === 5) {
        hdSummary.textContent = (S.wholeProperty || S.bookingPending) ? T.wpSuccessTitle : T.successTitle;
      } else if (S.step > 1 && S.checkIn && S.checkOut) {
        hdSummary.textContent = fmtDate(S.checkIn) + ' → ' + fmtDate(S.checkOut) + '  ·  ' + S.numGuests + ' ' + T.guests.toLowerCase();
      } else {
        hdSummary.textContent = T.checkAvailability;
      }
    }

    if (S.steppedBack) {
      renderSteppedBack();
      return;
    }
    if (S.redirecting) {
      renderLoading(T.redirecting);
      return;
    }
    if (S.loading) {
      renderLoading(S.step === 1 ? T.checking : T.confirming);
      return;
    }

    switch (S.step) {
      case 1: renderStep1(); break;
      case 2: S.wholeProperty ? renderStep2WP() : (S.categoriesMode ? (S.categoryForRoomPicker ? renderStep2CategoryRooms() : renderStep2Categories()) : renderStep2()); break;
      case 3: renderStep3(); break;
      case 4: renderStep4(); break;
      case 5: renderSuccess(); break;
    }
  }

  // ── Modal open / close ─────────────────────────────────────────────────────
  function _bgScrollBlock(e) {
    if (panel && panel.contains(e.target)) return;
    e.preventDefault();
  }

  function openModal() {
    // Consume the preselected room id set by the booking page's openWidget(roomId) call.
    // Must be read before Object.assign so it isn't wiped by the state reset.
    const preselected = window.NB_PRESELECTED_ROOM_ID ? Number(window.NB_PRESELECTED_ROOM_ID) : null;
    window.NB_PRESELECTED_ROOM_ID = null; // clear immediately — floating trigger must not inherit a stale id

    // Parallel path for Room Categories mode — set by openWidget(categoryId, true)
    // (bookingPage.js's "Book a {category} Room" button). Never both set at
    // once in practice (a property is either Named/Units or Categories mode),
    // but each is consumed independently regardless.
    const preselectedCategory = window.NB_PRESELECTED_CATEGORY_ID ? Number(window.NB_PRESELECTED_CATEGORY_ID) : null;
    window.NB_PRESELECTED_CATEGORY_ID = null;

    Object.assign(S, {
      step: 1, availableRooms: [], selectedRoom: null, allRooms: [], allBookings: [],
      availableCategories: [], selectedCategory: null,
      categoryForRoomPicker: null, categoryRoomPickerRooms: [],
      guest: { firstName: '', lastName: '', email: '', phone: '', notes: '' },
      bookingRef: null, loading: false, error: null,
      breakfastAdded: false, redirecting: false, steppedBack: false, bookingPending: false,
      preselectedRoomId: preselected,
      preselectedCategoryId: preselectedCategory,
      roomFallbackNotice: null,
      categoryFallbackNotice: null,
    });
    overlay.style.display = 'block';
    window.addEventListener('wheel', _bgScrollBlock, { passive: false });
    window.addEventListener('touchmove', _bgScrollBlock, { passive: false });
    render();
  }

  function closeModal() {
    panel.classList.add('nb-panel-closing');
    panel.addEventListener('animationend', function() {
      panel.classList.remove('nb-panel-closing');
      overlay.style.display = 'none';
      window.removeEventListener('wheel', _bgScrollBlock);
      window.removeEventListener('touchmove', _bgScrollBlock);
    }, { once: true });
  }

  // ── Recovery banner (shown on fresh page load if pending booking exists) ──
  function showRecoveryBanner(pending, storageKey) {
    if (document.getElementById('nb-recovery-banner')) return;

    const banner = document.createElement('div');
    banner.className = 'nb-recovery-banner';
    banner.id        = 'nb-recovery-banner';

    const msg = document.createElement('span');
    msg.className   = 'nb-banner-msg';
    msg.textContent = T.pendingBanner;

    const continueBtn = document.createElement('button');
    continueBtn.className   = 'nb-banner-btn';
    continueBtn.textContent = T.pendingBannerBtn;
    continueBtn.addEventListener('click', () => {
      banner.remove();
      window.location.href = API_BASE + '/pay/recover?b=' + pending.bookingId
        + '&exp=' + (pending.exp || '') + '&t=' + (pending.t || '');
    });

    const dismissBtn = document.createElement('button');
    dismissBtn.className   = 'nb-banner-dismiss';
    dismissBtn.textContent = '✕';
    dismissBtn.setAttribute('aria-label', T.close);
    dismissBtn.addEventListener('click', () => {
      try { localStorage.removeItem(storageKey); } catch (_) {}
      banner.remove();
    });

    banner.appendChild(msg);
    banner.appendChild(continueBtn);
    banner.appendChild(dismissBtn);
    document.body.appendChild(banner);
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  async function init() {
    if (document.getElementById('nb-styles')) return;   // already initialised

    // Resolve brand colours: manual override wins, otherwise fetch from server.
    if (BRAND_OVERRIDE) {
      BRAND = BRAND_OVERRIDE;
      // BRAND_DARK, BRAND_LIGHT, PANEL_HDR_* stay at forest defaults when manually overridden.
    } else if (!DEMO_MODE) {
      try {
        const r = await fetch(API_BASE + '/api/widget/property?property_id=' + PROPERTY_ID);
        if (r.ok) {
          const data = await r.json();
          const palette  = THEME_COLOURS[data.theme] ?? THEME_COLOURS.forest;
          BRAND          = palette.brand;
          BRAND_DARK     = palette.dark;
          BRAND_LIGHT    = palette.light;
          PANEL_HDR_BG   = palette.panelHdrBg;
          PANEL_HDR_TEXT = palette.panelHdrText;
          S.wholeProperty       = data.rental_type === 'whole_property';
          S.unitsMode           = data.rental_type === 'units';
          S.categoriesMode      = data.rental_type === 'rooms' && data.ir_room_mode === 'categories';
          S.wholePropertyRate   = data.whole_property_rate || 0;
          S.totalCapacity       = data.total_capacity || 10;
          S.stripeConnectActive = data.stripe_connect_active === true;
          S.breakfastEnabled    = !S.wholeProperty && data.breakfast_widget_enabled === true;
          S.breakfastPrice      = data.breakfast_price ?? 0;
        }
      } catch (_) { /* network error — fall back to forest colours */ }
    }

    injectStyles();

    // Root wrapper (outside normal document flow)
    root = el('div', ''); root.id = 'nb-root';

    // ── Floating trigger button ──────────────────────────────────────────────
    const trigger = el('button', 'nb-trigger');
    trigger.setAttribute('aria-label', T.bookNow);
    const icon = el('span', 'nb-trigger-icon');
    const houseSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    houseSvg.setAttribute('width', '16'); houseSvg.setAttribute('height', '16');
    houseSvg.setAttribute('viewBox', '0 0 24 24'); houseSvg.setAttribute('fill', 'none');
    houseSvg.setAttribute('stroke', 'currentColor'); houseSvg.setAttribute('stroke-width', '2');
    houseSvg.setAttribute('stroke-linecap', 'round'); houseSvg.setAttribute('stroke-linejoin', 'round');
    const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p1.setAttribute('d', 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'); houseSvg.appendChild(p1);
    const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline'); p2.setAttribute('points', '9 22 9 12 15 12 15 22'); houseSvg.appendChild(p2);
    icon.appendChild(houseSvg);
    trigger.appendChild(icon);
    trigger.appendChild(txt(' ' + (S.wholeProperty ? T.checkAvailabilityBook : T.bookNow)));

    // ── Demo mode: redirect to real demo page instead of running fake widget flow ──
    if (DEMO_MODE) {
      trigger.addEventListener('click', () => {
        window.open('https://nestbook.io/book/domaine-des-lavandes', '_blank');
      });
      root.appendChild(trigger);
      document.body.appendChild(root);
      return;
    }

    trigger.addEventListener('click', openModal);
    root.appendChild(trigger);

    // ── Overlay (backdrop) ────────────────────────────────────────────────────
    overlay = el('div', 'nb-overlay');
    overlay.style.display = 'none';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // ── Panel shell ───────────────────────────────────────────────────────────
    panel = el('div', 'nb-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');

    // Header: dates+guests summary on left, close on right
    const hd = el('div', 'nb-panel-hd');
    const hdSummary = el('div', 'nb-panel-hd-summary');
    // text set by render()
    const closeBtn = el('button', 'nb-panel-close');
    closeBtn.setAttribute('aria-label', T.close);
    closeBtn.appendChild(txt('✕'));
    closeBtn.addEventListener('click', closeModal);
    hd.appendChild(hdSummary);
    hd.appendChild(closeBtn);

    body   = el('div', 'nb-body');
    footer = el('div', 'nb-ft');

    panel.appendChild(hd);
    panel.appendChild(body);
    panel.appendChild(footer);

    overlay.appendChild(panel);
    root.appendChild(overlay);
    document.body.appendChild(root);

    // Keyboard: Esc closes the panel
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.style.display !== 'none') closeModal();
    });

    // ── bfcache: handle browser-back from Stripe Checkout ─────────────────
    // When the browser restores this page from its back-forward cache (the
    // guest pressed back from Stripe), event.persisted is true. The panel
    // will still show the frozen redirect spinner — replace it with a clear
    // "stepped back" state so the guest knows what to do next.
    window.addEventListener('pageshow', (e) => {
      if (e.persisted && S.redirecting && overlay.style.display !== 'none') {
        S.redirecting = false;
        S.steppedBack = true;
        render();
      }
    });

    // ── localStorage: floating banner for returning guests ────────────────
    // If the guest closed the tab while a payment was pending, check for a
    // stored recovery token and show a non-intrusive banner offering to
    // resume. Validate with /recovery-info before showing so we never prompt
    // for a booking that's already been paid or cleaned up.
    try {
      const pendingKey = 'nestbook_pending_' + PROPERTY_ID;
      const raw = localStorage.getItem(pendingKey);
      if (raw) {
        const pending = JSON.parse(raw);
        const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
        if (pending?.bookingId && pending.createdAt && Date.now() - pending.createdAt < TWO_HOURS_MS) {
          const q = '?b=' + encodeURIComponent(pending.bookingId)
            + '&exp=' + encodeURIComponent(pending.exp || '')
            + '&t=' + encodeURIComponent(pending.t || '');
          fetch(API_BASE + '/api/widget/recovery-info' + q)
            .then(r => {
              if (!r.ok) { try { localStorage.removeItem(pendingKey); } catch (_) {} return; }
              showRecoveryBanner(pending, pendingKey);
            })
            .catch(() => {});
        } else {
          try { localStorage.removeItem(pendingKey); } catch (_) {}
        }
      }
    } catch (_) {}
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
