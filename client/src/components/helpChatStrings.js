// All user-facing copy for the Help Chat panel, in NestBook's 5 languages.
// Kept as a self-contained module (rather than folded into the very large
// src/i18n/index.js) since it's a single feature's strings.

export const HELP_CHAT_LANGS = ['en', 'fr', 'de', 'es', 'nl'];

export const HELP_CHAT_STRINGS = {
  en: {
    trigger: 'Help',
    newBadge: 'New',
    title: 'Help',
    subtitle: "Ask about anything in NestBook",
    greeting: "Hi — ask me anything about using NestBook and I'll help if I can. I answer from the Help Centre, so I won't guess.",
    suggestionsLabel: 'Try asking about',
    placeholder: 'Ask a question…',
    send: 'Send',
    close: 'Close',
    thinking: 'Thinking…',
    error: 'Something went wrong there. Give it a moment and try again.',
  },
  fr: {
    trigger: 'Aide',
    newBadge: 'Nouveau',
    title: 'Aide',
    subtitle: 'Posez une question sur NestBook',
    greeting: "Bonjour — posez-moi une question sur l'utilisation de NestBook et je vous aiderai si je peux. Je réponds à partir du centre d'aide, je ne devine pas.",
    suggestionsLabel: 'Exemples de questions',
    placeholder: 'Posez une question…',
    send: 'Envoyer',
    close: 'Fermer',
    thinking: 'Réflexion…',
    error: 'Un problème est survenu. Patientez un instant et réessayez.',
  },
  de: {
    trigger: 'Hilfe',
    newBadge: 'Neu',
    title: 'Hilfe',
    subtitle: 'Stellen Sie eine Frage zu NestBook',
    greeting: 'Hallo — fragen Sie mich alles zur Nutzung von NestBook, ich helfe, wenn ich kann. Ich antworte anhand des Hilfe-Centers und rate nicht.',
    suggestionsLabel: 'Zum Beispiel',
    placeholder: 'Frage stellen…',
    send: 'Senden',
    close: 'Schließen',
    thinking: 'Denkt nach…',
    error: 'Da ist etwas schiefgelaufen. Warten Sie kurz und versuchen Sie es erneut.',
  },
  es: {
    trigger: 'Ayuda',
    newBadge: 'Nuevo',
    title: 'Ayuda',
    subtitle: 'Pregunta lo que quieras sobre NestBook',
    greeting: 'Hola — pregúntame lo que quieras sobre el uso de NestBook y te ayudaré si puedo. Respondo con el Centro de ayuda, no adivino.',
    suggestionsLabel: 'Prueba a preguntar sobre',
    placeholder: 'Escribe una pregunta…',
    send: 'Enviar',
    close: 'Cerrar',
    thinking: 'Pensando…',
    error: 'Algo ha ido mal. Espera un momento e inténtalo de nuevo.',
  },
  nl: {
    trigger: 'Hulp',
    newBadge: 'Nieuw',
    title: 'Hulp',
    subtitle: 'Stel een vraag over NestBook',
    greeting: 'Hoi — vraag me alles over het gebruik van NestBook en ik help waar ik kan. Ik antwoord op basis van het Helpcentrum, ik gok niet.',
    suggestionsLabel: 'Vraag bijvoorbeeld naar',
    placeholder: 'Stel een vraag…',
    send: 'Versturen',
    close: 'Sluiten',
    thinking: 'Aan het denken…',
    error: 'Er ging iets mis. Wacht even en probeer het opnieuw.',
  },
};

// Route (router pathname — no /app prefix) -> up to 3 suggestion chips per
// language. Each chip: { label } shown on the chip, { prompt } sent through the
// normal chat flow when clicked. Routes not listed here simply show no chips.
export const HELP_CHAT_CHIPS = {
  '/dashboard': {
    en: [
      { label: 'Booking statuses', prompt: 'What do the different booking statuses mean?' },
      { label: 'Missed check-ins', prompt: "What happens if I forget to check a guest in or out?" },
      { label: 'Getting started', prompt: 'I am new — what should I set up first?' },
    ],
    fr: [
      { label: 'Statuts de réservation', prompt: 'Que signifient les différents statuts de réservation ?' },
      { label: 'Arrivées oubliées', prompt: "Que se passe-t-il si j'oublie d'enregistrer l'arrivée ou le départ d'un client ?" },
      { label: 'Bien démarrer', prompt: 'Je débute — que dois-je configurer en premier ?' },
    ],
    de: [
      { label: 'Buchungsstatus', prompt: 'Was bedeuten die verschiedenen Buchungsstatus?' },
      { label: 'Verpasste Check-ins', prompt: 'Was passiert, wenn ich vergesse, einen Gast ein- oder auszuchecken?' },
      { label: 'Erste Schritte', prompt: 'Ich bin neu — was sollte ich zuerst einrichten?' },
    ],
    es: [
      { label: 'Estados de reserva', prompt: '¿Qué significan los distintos estados de una reserva?' },
      { label: 'Entradas olvidadas', prompt: '¿Qué pasa si olvido registrar la entrada o salida de un huésped?' },
      { label: 'Primeros pasos', prompt: 'Soy nuevo — ¿qué debería configurar primero?' },
    ],
    nl: [
      { label: 'Boekingsstatussen', prompt: 'Wat betekenen de verschillende boekingsstatussen?' },
      { label: 'Gemiste check-ins', prompt: 'Wat gebeurt er als ik vergeet een gast in of uit te checken?' },
      { label: 'Aan de slag', prompt: 'Ik ben nieuw — wat moet ik als eerste instellen?' },
    ],
  },
  '/calendar': {
    en: [
      { label: 'Calendar sync', prompt: 'How do I sync my calendar with Booking.com and Airbnb?' },
      { label: 'Blocked dates', prompt: 'Why are some dates showing as blocked or grey on my calendar?' },
      { label: 'Seasonal rate dots', prompt: 'What do the little dots on some calendar dates mean?' },
    ],
    fr: [
      { label: 'Synchro calendrier', prompt: 'Comment synchroniser mon calendrier avec Booking.com et Airbnb ?' },
      { label: 'Dates bloquées', prompt: 'Pourquoi certaines dates apparaissent-elles bloquées ou en gris sur mon calendrier ?' },
      { label: 'Points tarif saison', prompt: 'Que signifient les petits points sur certaines dates du calendrier ?' },
    ],
    de: [
      { label: 'Kalender-Sync', prompt: 'Wie synchronisiere ich meinen Kalender mit Booking.com und Airbnb?' },
      { label: 'Blockierte Daten', prompt: 'Warum sind manche Daten in meinem Kalender blockiert oder grau?' },
      { label: 'Saisonpreis-Punkte', prompt: 'Was bedeuten die kleinen Punkte auf manchen Kalendertagen?' },
    ],
    es: [
      { label: 'Sincronizar calendario', prompt: '¿Cómo sincronizo mi calendario con Booking.com y Airbnb?' },
      { label: 'Fechas bloqueadas', prompt: '¿Por qué algunas fechas aparecen bloqueadas o en gris en mi calendario?' },
      { label: 'Puntos de tarifa', prompt: '¿Qué significan los puntitos en algunas fechas del calendario?' },
    ],
    nl: [
      { label: 'Agenda synchroniseren', prompt: 'Hoe synchroniseer ik mijn agenda met Booking.com en Airbnb?' },
      { label: 'Geblokkeerde datums', prompt: 'Waarom staan sommige datums geblokkeerd of grijs in mijn agenda?' },
      { label: 'Seizoensprijs-stippen', prompt: 'Wat betekenen de kleine stippen op sommige agendadatums?' },
    ],
  },
  '/bookings': {
    en: [
      { label: 'Adding a booking', prompt: 'How do I add a booking manually?' },
      { label: 'Extending a stay', prompt: "How do I extend or shorten a guest's stay?" },
      { label: 'Importing bookings', prompt: 'How do I import my existing bookings from another system?' },
    ],
    fr: [
      { label: 'Ajouter une réservation', prompt: 'Comment ajouter une réservation manuellement ?' },
      { label: 'Prolonger un séjour', prompt: "Comment prolonger ou raccourcir le séjour d'un client ?" },
      { label: 'Importer des réservations', prompt: "Comment importer mes réservations existantes depuis un autre système ?" },
    ],
    de: [
      { label: 'Buchung hinzufügen', prompt: 'Wie füge ich eine Buchung manuell hinzu?' },
      { label: 'Aufenthalt verlängern', prompt: 'Wie verlängere oder verkürze ich den Aufenthalt eines Gastes?' },
      { label: 'Buchungen importieren', prompt: 'Wie importiere ich meine bestehenden Buchungen aus einem anderen System?' },
    ],
    es: [
      { label: 'Añadir una reserva', prompt: '¿Cómo añado una reserva manualmente?' },
      { label: 'Ampliar una estancia', prompt: '¿Cómo amplío o acorto la estancia de un huésped?' },
      { label: 'Importar reservas', prompt: '¿Cómo importo mis reservas existentes desde otro sistema?' },
    ],
    nl: [
      { label: 'Boeking toevoegen', prompt: 'Hoe voeg ik handmatig een boeking toe?' },
      { label: 'Verblijf verlengen', prompt: 'Hoe verleng of verkort ik het verblijf van een gast?' },
      { label: 'Boekingen importeren', prompt: 'Hoe importeer ik mijn bestaande boekingen uit een ander systeem?' },
    ],
  },
  '/rooms': {
    en: [
      { label: 'Photo limits', prompt: 'How many photos can I upload per room?' },
      { label: 'Room vs category', prompt: 'What is the difference between named rooms and room categories?' },
      { label: 'Base rate', prompt: 'What is the base rate and how does it work with seasonal pricing?' },
    ],
    fr: [
      { label: 'Limites de photos', prompt: 'Combien de photos puis-je téléverser par chambre ?' },
      { label: 'Chambre ou catégorie', prompt: 'Quelle est la différence entre les chambres nommées et les catégories de chambres ?' },
      { label: 'Tarif de base', prompt: 'Qu\'est-ce que le tarif de base et comment fonctionne-t-il avec la tarification saisonnière ?' },
    ],
    de: [
      { label: 'Foto-Limits', prompt: 'Wie viele Fotos kann ich pro Zimmer hochladen?' },
      { label: 'Zimmer oder Kategorie', prompt: 'Was ist der Unterschied zwischen benannten Zimmern und Zimmerkategorien?' },
      { label: 'Grundpreis', prompt: 'Was ist der Grundpreis und wie wirkt er mit der Saisonpreisgestaltung zusammen?' },
    ],
    es: [
      { label: 'Límite de fotos', prompt: '¿Cuántas fotos puedo subir por habitación?' },
      { label: 'Habitación o categoría', prompt: '¿Cuál es la diferencia entre habitaciones con nombre y categorías de habitación?' },
      { label: 'Tarifa base', prompt: '¿Qué es la tarifa base y cómo funciona con los precios de temporada?' },
    ],
    nl: [
      { label: 'Fotolimieten', prompt: 'Hoeveel foto\'s kan ik per kamer uploaden?' },
      { label: 'Kamer of categorie', prompt: 'Wat is het verschil tussen benoemde kamers en kamercategorieën?' },
      { label: 'Basistarief', prompt: 'Wat is het basistarief en hoe werkt het samen met seizoensprijzen?' },
    ],
  },
  '/settings': {
    en: [
      { label: 'Theme colours', prompt: 'How do I change the theme or colours of my booking page?' },
      { label: 'Calendar sync', prompt: 'Where do I set up calendar sync with Booking.com and Airbnb?' },
      { label: 'Staff access', prompt: 'How do I give staff access and what can each role do?' },
    ],
    fr: [
      { label: 'Couleurs du thème', prompt: 'Comment changer le thème ou les couleurs de ma page de réservation ?' },
      { label: 'Synchro calendrier', prompt: 'Où configurer la synchronisation du calendrier avec Booking.com et Airbnb ?' },
      { label: 'Accès du personnel', prompt: 'Comment donner un accès au personnel et que peut faire chaque rôle ?' },
    ],
    de: [
      { label: 'Design-Farben', prompt: 'Wie ändere ich das Design oder die Farben meiner Buchungsseite?' },
      { label: 'Kalender-Sync', prompt: 'Wo richte ich die Kalendersynchronisierung mit Booking.com und Airbnb ein?' },
      { label: 'Mitarbeiterzugang', prompt: 'Wie gebe ich Mitarbeitern Zugang und was darf jede Rolle?' },
    ],
    es: [
      { label: 'Colores del tema', prompt: '¿Cómo cambio el tema o los colores de mi página de reservas?' },
      { label: 'Sincronizar calendario', prompt: '¿Dónde configuro la sincronización del calendario con Booking.com y Airbnb?' },
      { label: 'Acceso del personal', prompt: '¿Cómo doy acceso al personal y qué puede hacer cada rol?' },
    ],
    nl: [
      { label: 'Themakleuren', prompt: 'Hoe wijzig ik het thema of de kleuren van mijn boekingspagina?' },
      { label: 'Agenda synchroniseren', prompt: 'Waar stel ik agendasynchronisatie met Booking.com en Airbnb in?' },
      { label: 'Personeelstoegang', prompt: 'Hoe geef ik personeel toegang en wat mag elke rol?' },
    ],
  },
  '/pricing': {
    en: [
      { label: 'Rate periods', prompt: 'How do seasonal rate periods work?' },
      { label: 'Overlapping rates', prompt: 'What happens when two rate periods overlap on the same date?' },
      { label: 'Per-room overrides', prompt: 'Can I set a different seasonal price for just one room?' },
    ],
    fr: [
      { label: 'Périodes tarifaires', prompt: 'Comment fonctionnent les périodes de tarification saisonnière ?' },
      { label: 'Tarifs qui se chevauchent', prompt: 'Que se passe-t-il quand deux périodes tarifaires se chevauchent à la même date ?' },
      { label: 'Ajustements par chambre', prompt: 'Puis-je définir un prix saisonnier différent pour une seule chambre ?' },
    ],
    de: [
      { label: 'Preiszeiträume', prompt: 'Wie funktionieren saisonale Preiszeiträume?' },
      { label: 'Überlappende Preise', prompt: 'Was passiert, wenn sich zwei Preiszeiträume am selben Datum überschneiden?' },
      { label: 'Pro-Zimmer-Anpassung', prompt: 'Kann ich einen anderen Saisonpreis für nur ein Zimmer festlegen?' },
    ],
    es: [
      { label: 'Periodos de tarifa', prompt: '¿Cómo funcionan los periodos de tarifa de temporada?' },
      { label: 'Tarifas solapadas', prompt: '¿Qué pasa cuando dos periodos de tarifa se solapan en la misma fecha?' },
      { label: 'Ajustes por habitación', prompt: '¿Puedo poner un precio de temporada distinto para una sola habitación?' },
    ],
    nl: [
      { label: 'Tariefperiodes', prompt: 'Hoe werken seizoensgebonden tariefperiodes?' },
      { label: 'Overlappende tarieven', prompt: 'Wat gebeurt er als twee tariefperiodes op dezelfde datum overlappen?' },
      { label: 'Aanpassing per kamer', prompt: 'Kan ik een andere seizoensprijs voor slechts één kamer instellen?' },
    ],
  },
  '/billing': {
    en: [
      { label: 'Card payments', prompt: 'How do I set up card payments with Stripe Connect?' },
      { label: 'Verification wait', prompt: 'Why is Stripe taking a while to verify my details?' },
      { label: 'Fees', prompt: 'Does NestBook take a cut of guest payments?' },
    ],
    fr: [
      { label: 'Paiements par carte', prompt: 'Comment configurer les paiements par carte avec Stripe Connect ?' },
      { label: 'Délai de vérification', prompt: 'Pourquoi Stripe met-il du temps à vérifier mes informations ?' },
      { label: 'Frais', prompt: 'NestBook prend-il une commission sur les paiements des clients ?' },
    ],
    de: [
      { label: 'Kartenzahlungen', prompt: 'Wie richte ich Kartenzahlungen mit Stripe Connect ein?' },
      { label: 'Wartezeit Prüfung', prompt: 'Warum dauert die Prüfung meiner Daten bei Stripe so lange?' },
      { label: 'Gebühren', prompt: 'Behält NestBook einen Anteil der Gästezahlungen ein?' },
    ],
    es: [
      { label: 'Pagos con tarjeta', prompt: '¿Cómo configuro los pagos con tarjeta con Stripe Connect?' },
      { label: 'Espera de verificación', prompt: '¿Por qué tarda Stripe en verificar mis datos?' },
      { label: 'Comisiones', prompt: '¿NestBook se queda con una parte de los pagos de los huéspedes?' },
    ],
    nl: [
      { label: 'Kaartbetalingen', prompt: 'Hoe stel ik kaartbetalingen in met Stripe Connect?' },
      { label: 'Wachttijd verificatie', prompt: 'Waarom doet Stripe er lang over om mijn gegevens te verifiëren?' },
      { label: 'Kosten', prompt: 'Houdt NestBook een deel van de gastbetalingen in?' },
    ],
  },
  '/reports': {
    en: [
      { label: 'Revenue reports', prompt: 'What is in the revenue report and how do I export it?' },
      { label: 'Business expenses', prompt: 'How do I log my business expenses?' },
      { label: 'Activity log', prompt: 'What does the activity log record?' },
    ],
    fr: [
      { label: 'Rapports de revenus', prompt: "Que contient le rapport de revenus et comment l'exporter ?" },
      { label: 'Dépenses', prompt: 'Comment enregistrer mes dépenses professionnelles ?' },
      { label: "Journal d'activité", prompt: "Qu'enregistre le journal d'activité ?" },
    ],
    de: [
      { label: 'Umsatzberichte', prompt: 'Was steht im Umsatzbericht und wie exportiere ich ihn?' },
      { label: 'Betriebsausgaben', prompt: 'Wie erfasse ich meine Betriebsausgaben?' },
      { label: 'Aktivitätsprotokoll', prompt: 'Was zeichnet das Aktivitätsprotokoll auf?' },
    ],
    es: [
      { label: 'Informes de ingresos', prompt: '¿Qué incluye el informe de ingresos y cómo lo exporto?' },
      { label: 'Gastos del negocio', prompt: '¿Cómo registro los gastos de mi negocio?' },
      { label: 'Registro de actividad', prompt: '¿Qué registra el registro de actividad?' },
    ],
    nl: [
      { label: 'Omzetrapporten', prompt: 'Wat staat er in het omzetrapport en hoe exporteer ik het?' },
      { label: 'Zakelijke kosten', prompt: 'Hoe leg ik mijn zakelijke kosten vast?' },
      { label: 'Activiteitenlogboek', prompt: 'Wat legt het activiteitenlogboek vast?' },
    ],
  },
};

export function helpChatStrings(lang) {
  return HELP_CHAT_STRINGS[lang] ?? HELP_CHAT_STRINGS.en;
}

export function helpChatChips(pathname, lang) {
  const forRoute = HELP_CHAT_CHIPS[pathname];
  if (!forRoute) return [];
  return forRoute[lang] ?? forRoute.en ?? [];
}
