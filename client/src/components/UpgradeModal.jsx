import { useState } from 'react';
import { useLocale } from '../i18n/LocaleContext.jsx';
import { apiFetch } from '../utils/apiFetch.js';

const ICON_MAP = {
  '🚀': 'ti ti-rocket',
  '🌐': 'ti ti-world',
  '📧': 'ti ti-mail',
  '📅': 'ti ti-calendar',
  '📸': 'ti ti-camera',
  '📊': 'ti ti-chart-bar',
  '📋': 'ti ti-clipboard-list',
  '👥': 'ti ti-users',
  '💰': 'ti ti-cash',
  '🏠': 'ti ti-home',
  '🍷': 'ti ti-glass-full',
  '🏷️': 'ti ti-tag',
  '📈': 'ti ti-trending-up',
  '👤': 'ti ti-user',
};

// ── Translations (self-contained — feature descriptions are too long for i18n/index.js) ──

const MODAL_T = {
  en: {
    title:        'Unlock NestBook Pro',
    subtitle:     'Everything you need to run your property professionally',
    price:        'From £19/month — or €22/month',
    trial:        '30-day free trial included',
    tabPro:       'Pro',
    tabMulti:     'Multi-property',
    cta:          'Start my 30-day free trial →',
    later:        'Maybe later',
    multiDivider: 'Everything in Pro, plus these extras:',
    loading:      'Redirecting to checkout…',
    freeLabel:    'You currently have:',
    proAdds:      'With Pro you also get:',
    freeFeatures: [
      '1 property',
      'Up to 3 rooms',
      'Unlimited bookings (manual)',
      'Guest management',
      'Booking calendar & availability',
      'Your own property webpage — 1 photo per room + contact form',
      'Facebook Booking Button + slug editor',
      'Owner booking confirmation emails',
      'Room types & nightly pricing',
      'Deposit management',
      'Two-way calendar sync — Booking.com, Airbnb & more',
      'Booking migration wizard — import from any system',
      'CSV export',
      '5 languages',
      'Free forever — no credit card needed',
    ],
    proFeatures: [
      { icon: '🚀', name: 'Unlimited Rooms',
        desc: 'The Free plan allows up to 3 rooms. With Pro, add as many rooms as your property has — no arbitrary limits, no upgrades needed as you grow.' },
      { icon: '🌐', name: 'Booking Widget for Your Website',
        desc: 'Add a "Book Now" button to your own website and let guests book directly — without going through Airbnb or Booking.com. Payments go straight to you.' },
      { icon: '📧', name: 'Automated Guest Emails',
        desc: 'Booking confirmations sent to guests the moment you confirm. They arrive with all the details — address, arrival time, and what to expect — reducing last-minute questions.' },
      { icon: '📅', name: 'Seasonal Pricing — 5 Periods',
        desc: 'Set different rates for peak season, low season or special events. Define up to 5 date ranges and NestBook prices each night automatically — no spreadsheets, no manual overrides.' },
      { icon: '📸', name: 'Property Webpage — 5 Photos + Direct Booking',
        desc: 'Your property page upgrades to 5 photos per room and enables direct online booking — guests can book and pay without you needing to confirm manually. More photos, more trust, more direct bookings.' },
      { icon: '📊', name: 'Revenue Reports & CSV',
        desc: 'See exactly what your property earned, what you spent, and what\'s left as profit — all in one click. Export to CSV for your accountant. No more manual spreadsheets.' },
      { icon: '📋', name: 'Activity Log',
        desc: 'A complete record of everything that happens in your account — every booking, every change, every checkout. Full audit trail, useful for staff management and resolving any disputes with guests.' },
      { icon: '👥', name: 'Staff Accounts & Roles',
        desc: 'Give your receptionist their own login so they can check guests in and out without sharing your owner account. Choose from receptionist and staff roles — full control over who sees what.' },
      { icon: '💰', name: 'Zero Commission via Widget',
        desc: 'When guests book through your widget, you keep 100% of the payment. No Airbnb cut, no Booking.com fee — just direct income. On a typical booking, that\'s worth more than a month of Pro.' },
    ],
    multiFeatures: [
      { icon: '🏠', name: 'Unlimited Properties',
        desc: 'Manage as many B&Bs, gîtes or holiday cottages as you own — all from one login, one dashboard, one subscription. Switch between properties in one click, no logging in and out.' },
      { icon: '🍷', name: 'Room Charges',
        desc: 'Let guests charge drinks, meals or extras to their room during their stay. Add them at any time and they appear automatically on the checkout bill and printed receipt. Perfect for properties with a bar or restaurant.' },
      { icon: '📅', name: 'Unlimited Seasonal Pricing Periods',
        desc: 'Define as many pricing periods as your properties need — peak summer, ski season, half-term, bank holidays. Each period can have different rates per room across all your properties.' },
      { icon: '🏷️', name: 'Service Categories with Tax Rates',
        desc: 'Organise room charges into categories like Bar, Restaurant or Activities, each with its own tax rate. Reports automatically apply the correct tax — making your accountant\'s life much easier.' },
      { icon: '📈', name: 'Multi-Property Reports',
        desc: 'Generate revenue reports and P&L summaries for each property individually, or combined across all your properties. One report for your accountant covering everything.' },
      { icon: '👤', name: 'Charges Staff Role',
        desc: 'Give your bar or restaurant staff their own login to add room charges — without access to bookings, guest data or financial reports. They see only what they need.' },
      { icon: '📸', name: '10 Photos per Room',
        desc: 'Upload up to 10 photos per room across all your properties. The more visual your listing, the more confident guests feel — and the fewer questions you get before they book.' },
    ],
  },

  fr: {
    title:        'Passer à NestBook Pro',
    subtitle:     'Tout ce qu\'il faut pour gérer votre hébergement comme un pro',
    price:        'À partir de 22 €/mois — ou £19/mois',
    trial:        'Essai gratuit de 30 jours inclus',
    tabPro:       'Pro',
    tabMulti:     'Multi-hébergement',
    cta:          'Démarrer mon essai gratuit de 30 jours →',
    later:        'Peut-être plus tard',
    multiDivider: 'Tout ce qui est dans Pro, plus ces fonctionnalités :',
    loading:      'Redirection vers le paiement…',
    freeLabel:    'Vous bénéficiez déjà :',
    proAdds:      'Avec Pro, vous bénéficiez aussi de :',
    freeFeatures: [
      '1 hébergement',
      "Jusqu'à 3 chambres",
      'Réservations illimitées (manuelles)',
      'Gestion des voyageurs',
      'Calendrier et disponibilités',
      'Votre propre page web — 1 photo par chambre + formulaire de contact',
      'Bouton de réservation Facebook + slug',
      'E-mails de confirmation au propriétaire',
      'Types de chambres et tarification nocturne',
      'Gestion des acomptes',
      'Synchronisation calendrier bidirectionnelle — Booking.com, Airbnb & plus',
      'Assistant de migration — importez depuis n\'importe quel système',
      'Export CSV',
      '5 langues',
      'Gratuit pour toujours — sans carte bancaire',
    ],
    proFeatures: [
      { icon: '🚀', name: 'Chambres illimitées',
        desc: 'Le plan gratuit permet jusqu\'à 3 chambres. Avec Pro, ajoutez autant de chambres que votre hébergement en compte — sans limite, quelle que soit votre croissance.' },
      { icon: '🌐', name: 'Widget de réservation pour votre site',
        desc: 'Ajoutez un bouton « Réserver » sur votre site et laissez vos voyageurs réserver directement — sans commission Airbnb, sans frais Booking.com. Les paiements vont directement chez vous.' },
      { icon: '📧', name: 'E-mails automatiques aux voyageurs',
        desc: 'Les confirmations de réservation sont envoyées dès que vous confirmez. Ils reçoivent tous les détails — adresse, heure d\'arrivée et ce qui les attend — réduisant les questions de dernière minute.' },
      { icon: '📅', name: 'Tarification saisonnière — 5 périodes',
        desc: 'Définissez des tarifs pour la haute saison, la basse saison ou des événements spéciaux. Configurez jusqu\'à 5 plages de dates et NestBook ajuste chaque nuit automatiquement — fini les tableurs.' },
      { icon: '📸', name: 'Page web — 5 photos + réservation directe',
        desc: 'Votre page passe à 5 photos par chambre et active la réservation en ligne directe — les voyageurs réservent et paient sans que vous ayez besoin de confirmer manuellement.' },
      { icon: '📊', name: 'Rapports de revenus et export CSV',
        desc: 'Visualisez ce que votre gîte a généré, vos dépenses et ce qui reste en bénéfice — en un clic. Exportez en CSV pour votre comptable. Fini les tableurs manuels.' },
      { icon: '📋', name: 'Journal d\'activité',
        desc: 'Un historique complet de tout ce qui se passe — chaque réservation, chaque modification, chaque départ. Traçabilité complète, utile pour gérer votre personnel et résoudre les litiges.' },
      { icon: '👥', name: 'Comptes du personnel',
        desc: 'Donnez à votre réceptionniste son propre accès pour accueillir et faire partir les voyageurs sans partager votre compte propriétaire. Contrôle total sur qui voit quoi.' },
      { icon: '💰', name: 'Zéro commission via le widget',
        desc: 'Quand vos voyageurs réservent via votre widget, vous conservez 100 % du paiement. Aucune commission OTA — sur une réservation typique, c\'est plus qu\'un mois de Pro.' },
    ],
    multiFeatures: [
      { icon: '🏠', name: 'Hébergements illimités',
        desc: 'Gérez autant de chambres d\'hôtes, gîtes ou maisons de vacances que vous en possédez — depuis un seul identifiant, un seul tableau de bord, un seul abonnement. Passez d\'un hébergement à l\'autre en un clic.' },
      { icon: '🍷', name: 'Extras en chambre',
        desc: 'Laissez vos voyageurs commander boissons, repas ou autres extras à leur chambre pendant leur séjour. Ajoutez-les à tout moment — ils apparaîtront automatiquement sur la note de départ et le reçu imprimé.' },
      { icon: '📅', name: 'Périodes de tarification saisonnière illimitées',
        desc: 'Définissez autant de périodes tarifaires que nécessaire — haute saison, saison de ski, vacances scolaires, jours fériés. Chaque période peut avoir des tarifs différents par chambre dans tous vos hébergements.' },
      { icon: '🏷️', name: 'Catégories de services avec taux de TVA',
        desc: 'Organisez les extras en chambre par catégories comme Bar, Restaurant ou Activités, chacune avec son propre taux de TVA. Les rapports appliquent automatiquement la TVA correcte.' },
      { icon: '📈', name: 'Rapports multi-hébergements',
        desc: 'Générez des rapports de revenus et des bilans pour chaque hébergement séparément, ou consolidés pour tous vos biens. Un seul rapport pour votre comptable qui couvre tout.' },
      { icon: '👤', name: 'Rôle personnel de facturation',
        desc: 'Donnez à votre personnel de bar ou de restaurant leur propre accès pour ajouter des extras en chambre — sans accès aux réservations, données clients ou rapports financiers.' },
      { icon: '📸', name: '10 photos par chambre',
        desc: 'Téléchargez jusqu\'à 10 photos par chambre dans tous vos hébergements. Plus votre annonce est visuelle, plus les voyageurs se sentent en confiance — et moins vous recevez de questions.' },
    ],
  },

  es: {
    title:        'Activar NestBook Pro',
    subtitle:     'Todo lo que necesita para gestionar su alojamiento como un profesional',
    price:        'Desde 22 €/mes — o £19/mes',
    trial:        'Prueba gratuita de 30 días incluida',
    tabPro:       'Pro',
    tabMulti:     'Multi-alojamiento',
    cta:          'Comenzar mi prueba gratuita de 30 días →',
    later:        'Quizás más adelante',
    multiDivider: 'Todo lo que incluye Pro, más estas funciones adicionales:',
    loading:      'Redirigiendo al pago…',
    freeLabel:    'Ya tiene lo siguiente:',
    proAdds:      'Con Pro, además obtiene:',
    freeFeatures: [
      '1 alojamiento',
      'Hasta 3 habitaciones',
      'Reservas ilimitadas (manuales)',
      'Gestión de huéspedes',
      'Calendario de reservas y disponibilidad',
      'Su propia página web — 1 foto por habitación + formulario de contacto',
      'Botón de reserva de Facebook + slug',
      'Correos de confirmación al propietario',
      'Tipos de habitación y precios por noche',
      'Gestión de depósitos',
      'Sincronización de calendario bidireccional — Booking.com, Airbnb y más',
      'Asistente de migración — importe desde cualquier sistema',
      'Exportar CSV',
      '5 idiomas',
      'Gratis para siempre — sin tarjeta de crédito',
    ],
    proFeatures: [
      { icon: '🚀', name: 'Habitaciones ilimitadas',
        desc: 'El plan gratuito permite hasta 3 habitaciones. Con Pro, añada tantas habitaciones como tenga su propiedad — sin límites arbitrarios, sin necesidad de actualizaciones futuras.' },
      { icon: '🌐', name: 'Widget de reservas para su web',
        desc: 'Añada un botón «Reservar ahora» a su propia web y deje que sus huéspedes reserven directamente — sin comisiones de Airbnb ni cargos de Booking.com. Los pagos van directamente a usted.' },
      { icon: '📧', name: 'Correos automáticos a huéspedes',
        desc: 'Las confirmaciones de reserva se envían en el momento en que usted confirma. Reciben todos los detalles — dirección, hora de llegada y qué esperar — reduciendo las preguntas de última hora.' },
      { icon: '📅', name: 'Tarificación estacional — 5 períodos',
        desc: 'Establezca tarifas para temporada alta, baja o eventos especiales. Defina hasta 5 rangos de fechas y NestBook ajusta cada noche automáticamente — sin hojas de cálculo ni modificaciones manuales.' },
      { icon: '📸', name: 'Página web — 5 fotos + reserva directa',
        desc: 'Su página pasa a 5 fotos por habitación y activa la reserva directa en línea — los huéspedes reservan y pagan sin necesidad de confirmación manual.' },
      { icon: '📊', name: 'Informes de ingresos y CSV',
        desc: 'Vea exactamente lo que ha generado, sus gastos y lo que queda como beneficio — con un solo clic. Exporte a CSV para su asesor. Se acabó trabajar con hojas de cálculo.' },
      { icon: '📋', name: 'Registro de actividad',
        desc: 'Un historial completo de todo lo que ocurre — cada reserva, cada cambio, cada salida. Trazabilidad completa, útil para la gestión del personal y para resolver cualquier disputa.' },
      { icon: '👥', name: 'Cuentas de personal y roles',
        desc: 'Dé a su recepcionista su propio acceso para registrar entradas y salidas sin compartir su cuenta de propietario. Control total sobre quién ve qué.' },
      { icon: '💰', name: 'Cero comisión via widget',
        desc: 'Cuando los huéspedes reservan a través de su widget, usted se queda con el 100% del pago. Sin comisión de OTAs — en una reserva típica, eso vale más que un mes de Pro.' },
    ],
    multiFeatures: [
      { icon: '🏠', name: 'Propiedades ilimitadas',
        desc: '¿Tiene una casa rural y un apartamento? Gestiónelos desde un solo acceso, un solo panel, una sola suscripción. Cambie entre propiedades con un clic — sin cerrar sesión.' },
      { icon: '🍷', name: 'Cargos a habitación',
        desc: 'Permita que sus huéspedes carguen bebidas, comidas u otros extras a su habitación durante la estancia. Añádalos en cualquier momento y aparecerán en la factura de salida y el recibo impreso.' },
      { icon: '📅', name: 'Períodos de precios estacionales ilimitados',
        desc: 'Defina tantos períodos tarifarios como necesiten sus propiedades — temporada alta, esquí, puentes, festivos. Cada período puede tener tarifas diferentes por habitación en todas sus propiedades.' },
      { icon: '🏷️', name: 'Categorías de servicios con tipos impositivos',
        desc: 'Organice los cargos en categorías como Bar, Restaurante o Actividades, cada una con su propio tipo impositivo. Los informes aplican automáticamente el impuesto correcto.' },
      { icon: '📈', name: 'Informes multi-alojamiento',
        desc: 'Genere informes de ingresos y cuentas de resultados para cada propiedad por separado, o consolidados para todas sus propiedades. Un solo informe para su asesor que lo abarca todo.' },
      { icon: '👤', name: 'Rol de personal de cargos',
        desc: 'Dé a su personal de bar o restaurante su propio acceso para añadir cargos — sin acceso a reservas, datos de huéspedes ni informes financieros. Verán únicamente lo que necesitan.' },
      { icon: '📸', name: '10 fotos por habitación',
        desc: 'Suba hasta 10 fotos por habitación en todas sus propiedades. Cuanto más visual sea su anuncio, más seguros se sentirán los huéspedes antes de reservar — y menos preguntas recibirá.' },
    ],
  },

  de: {
    title:        'NestBook Pro freischalten',
    subtitle:     'Alles, was Sie brauchen, um Ihre Unterkunft professionell zu führen',
    price:        'Ab 22 €/Monat — oder £19/Monat',
    trial:        '30-tägige kostenlose Testphase inklusive',
    tabPro:       'Pro',
    tabMulti:     'Mehrere Unterkünfte',
    cta:          'Meine 30-tägige Testphase starten →',
    later:        'Vielleicht später',
    multiDivider: 'Alles aus Pro, plus diese zusätzlichen Funktionen:',
    loading:      'Weiterleitung zur Zahlung…',
    freeLabel:    'Sie haben bereits:',
    proAdds:      'Mit Pro erhalten Sie zusätzlich:',
    freeFeatures: [
      '1 Unterkunft',
      'Bis zu 3 Zimmer',
      'Unbegrenzte Buchungen (manuell)',
      'Gästeverwaltung',
      'Buchungskalender und Verfügbarkeit',
      'Eigene Webseite — 1 Foto pro Zimmer + Kontaktformular',
      'Facebook-Buchungsschaltfläche + Slug-Editor',
      'Buchungsbestätigungs-E-Mails an den Eigentümer',
      'Zimmertypen und Nachtpreise',
      'Kautionsverwaltung',
      'Zwei-Wege Kalendersync — Booking.com, Airbnb & mehr',
      'Buchungs-Migrationsassistent — Import aus jedem System',
      'CSV-Export',
      '5 Sprachen',
      'Dauerhaft kostenlos — keine Kreditkarte erforderlich',
    ],
    proFeatures: [
      { icon: '🚀', name: 'Unbegrenzte Zimmer',
        desc: 'Der kostenlose Plan erlaubt bis zu 3 Zimmer. Mit Pro fügen Sie so viele Zimmer hinzu, wie Ihre Unterkunft hat — ohne künstliche Beschränkungen.' },
      { icon: '🌐', name: 'Buchungs-Widget für Ihre Website',
        desc: 'Fügen Sie Ihrer Website einen „Jetzt buchen"-Button hinzu und lassen Sie Gäste direkt buchen — ohne Airbnb-Provision, ohne Booking.com-Gebühren. Zahlungen gehen direkt an Sie.' },
      { icon: '📧', name: 'Automatische Gäste-E-Mails',
        desc: 'Buchungsbestätigungen werden gesendet, sobald Sie bestätigen. Gäste erhalten alle Einzelheiten — Adresse, Ankunftszeit und was sie erwartet — das reduziert kurzfristige Rückfragen.' },
      { icon: '📅', name: 'Saisonale Preise — 5 Zeiträume',
        desc: 'Legen Sie verschiedene Tarife für Hochsaison, Nebensaison oder Ereignisse fest. Definieren Sie bis zu 5 Datumsbereiche und NestBook passt jede Nacht automatisch an — keine Tabellen mehr.' },
      { icon: '📸', name: 'Webseite — 5 Fotos + Direktbuchung',
        desc: 'Ihre Seite wird auf 5 Fotos pro Zimmer aufgewertet und ermöglicht die direkte Online-Buchung — Gäste buchen und zahlen ohne manuelle Bestätigung Ihrerseits.' },
      { icon: '📊', name: 'Umsatzberichte & CSV-Export',
        desc: 'Sehen Sie auf einen Blick, was Ihre Unterkunft eingenommen hat, was Sie ausgegeben haben und was als Gewinn bleibt. Exportieren Sie als CSV für Ihren Steuerberater.' },
      { icon: '📋', name: 'Aktivitätsprotokoll',
        desc: 'Eine vollständige Aufzeichnung von allem — jede Buchung, jede Änderung, jeder Check-out. Vollständige Nachverfolgbarkeit, nützlich für die Personalverwaltung und zur Klärung von Streitigkeiten.' },
      { icon: '👥', name: 'Mitarbeiterkonten & Rollen',
        desc: 'Geben Sie Ihrer Rezeptionistin einen eigenen Zugang, um Gäste ein- und auszuchecken, ohne Ihr Eigentümer-Konto zu teilen. Volle Kontrolle darüber, wer was sieht.' },
      { icon: '💰', name: 'Null Provision über das Widget',
        desc: 'Wenn Gäste über Ihr Widget buchen, behalten Sie 100 % der Zahlung. Keine OTA-Provision — bei einer typischen Buchung ist das mehr wert als ein Monat Pro.' },
    ],
    multiFeatures: [
      { icon: '🏠', name: 'Unbegrenzte Unterkünfte',
        desc: 'Verwalten Sie so viele B&Bs, Ferienwohnungen oder Gästehäuser, wie Sie besitzen — alle über einen Login, ein Dashboard, ein Abonnement. Mit einem Klick zwischen Unterkünften wechseln.' },
      { icon: '🍷', name: 'Extras auf Zimmerkonto',
        desc: 'Lassen Sie Gäste Getränke, Mahlzeiten oder Extras während ihres Aufenthalts auf ihr Zimmer buchen. Jederzeit hinzufügbar — sie erscheinen automatisch auf der Checkout-Rechnung und dem gedruckten Beleg.' },
      { icon: '📅', name: 'Unbegrenzte saisonale Preiszeiträume',
        desc: 'Legen Sie so viele Preiszeiträume fest, wie Ihre Unterkünfte benötigen — Hochsommer, Skisaison, Schulferien, Feiertage. Jeder Zeitraum kann unterschiedliche Zimmerpreise haben.' },
      { icon: '🏷️', name: 'Servicekategorien mit Steuersätzen',
        desc: 'Ordnen Sie Zimmerzusatzleistungen in Kategorien wie Bar, Restaurant oder Aktivitäten ein, jede mit eigenem Steuersatz. Berichte wenden automatisch die korrekte Steuer an.' },
      { icon: '📈', name: 'Berichte für mehrere Unterkünfte',
        desc: 'Erstellen Sie Umsatzberichte und GuV-Übersichten für jede Unterkunft einzeln oder zusammengefasst für alle Ihre Objekte. Ein einziger Bericht für Ihren Steuerberater.' },
      { icon: '👤', name: 'Rolle für Servicepersonal',
        desc: 'Geben Sie Ihrem Bar- oder Restaurantpersonal eigene Zugangsdaten zum Erfassen von Extras — ohne Zugriff auf Buchungen, Gästedaten oder Finanzberichte.' },
      { icon: '📸', name: '10 Fotos pro Zimmer',
        desc: 'Laden Sie bis zu 10 Fotos pro Zimmer für alle Ihre Unterkünfte hoch. Je visueller Ihr Angebot, desto mehr Vertrauen bei den Gästen — und desto weniger Rückfragen vor der Buchung.' },
    ],
  },

  nl: {
    title:        'NestBook Pro activeren',
    subtitle:     'Alles wat u nodig heeft om uw accommodatie professioneel te beheren',
    price:        'Vanaf 22 €/maand — of £19/maand',
    trial:        '30 dagen gratis proberen inbegrepen',
    tabPro:       'Pro',
    tabMulti:     'Meerdere accommodaties',
    cta:          'Mijn gratis proefperiode van 30 dagen starten →',
    later:        'Misschien later',
    multiDivider: 'Alles van Pro, plus deze extra functies:',
    loading:      'Doorsturen naar betaling…',
    freeLabel:    'U heeft al:',
    proAdds:      'Met Pro krijgt u ook:',
    freeFeatures: [
      '1 accommodatie',
      'Tot 3 kamers',
      'Onbeperkte boekingen (handmatig)',
      'Gastenbeheer',
      'Boekingskalender en beschikbaarheid',
      'Eigen webpagina — 1 foto per kamer + contactformulier',
      'Facebook-boekingsknop + slug-editor',
      'Boekingsbevestigingsmails aan eigenaar',
      'Kamertypen en nachttarieven',
      'Aanbetalingsbeheer',
      'Tweerichtings kalendersync — Booking.com, Airbnb & meer',
      'Boekingen migratiewizard — importeer vanuit elk systeem',
      'CSV-export',
      '5 talen',
      'Voor altijd gratis — geen creditcard nodig',
    ],
    proFeatures: [
      { icon: '🚀', name: 'Onbeperkte kamers',
        desc: 'Het gratis plan staat maximaal 3 kamers toe. Met Pro voegt u zoveel kamers toe als uw accommodatie heeft — geen kunstmatige limieten, geen upgrades nodig als u groeit.' },
      { icon: '🌐', name: 'Boekingswidget voor uw website',
        desc: 'Voeg een „Nu boeken"-knop toe aan uw eigen website en laat gasten rechtstreeks boeken — zonder Airbnb-commissie, zonder Booking.com-kosten. Betalingen gaan direct naar u.' },
      { icon: '📧', name: 'Automatische e-mails aan gasten',
        desc: 'Boekingsbevestigingen worden verstuurd op het moment dat u bevestigt. Ze ontvangen alle details — adres, aankomsttijd en wat ze kunnen verwachten — wat vragen op het laatste moment vermindert.' },
      { icon: '📅', name: 'Seizoensprijzen — 5 periodes',
        desc: 'Stel verschillende tarieven in voor hoogseizoen, laagseizoen of speciale evenementen. Definieer tot 5 datumperiodes en NestBook past elke nacht automatisch aan — geen spreadsheets meer.' },
      { icon: '📸', name: "Webpagina — 5 foto's + directe boeking",
        desc: "Uw pagina krijgt 5 foto's per kamer en directe online boeking — gasten boeken en betalen zonder handmatige bevestiging van uw kant." },
      { icon: '📊', name: 'Omzetrapportages en CSV',
        desc: 'Zie precies wat uw accommodatie heeft verdiend, wat u heeft uitgegeven en wat er als winst overblijft — met één klik. Exporteer naar CSV voor uw boekhouder. Nooit meer spreadsheets.' },
      { icon: '📋', name: 'Activiteitenlogboek',
        desc: 'Een volledig overzicht van alles wat er in uw account gebeurt — elke boeking, elke wijziging, elke uitcheck. Volledige audittrail, handig voor personeelsbeheer en het oplossen van eventuele geschillen.' },
      { icon: '👥', name: 'Personeelsaccounts en rollen',
        desc: 'Geef uw receptionist een eigen login om gasten in- en uit te checken zonder uw eigenaaraccount te delen. Kies uit receptionist- en personeelsrollen — volledige controle over wie wat ziet.' },
      { icon: '💰', name: 'Nul commissie via de widget',
        desc: 'Wanneer gasten via uw widget boeken, behoudt u 100% van de betaling. Geen OTA-commissie — bij een typische boeking is dat meer waard dan een maand Pro.' },
    ],
    multiFeatures: [
      { icon: '🏠', name: 'Onbeperkte accommodaties',
        desc: 'Beheer zoveel B&Bs, vakantiewoningen of gîtes als u bezit — allemaal via één login, één dashboard, één abonnement. Wissel tussen accommodaties met één klik, niet steeds opnieuw inloggen.' },
      { icon: '🍷', name: 'Kamerrekening',
        desc: 'Laat gasten drankjes, maaltijden of extra\'s op hun kamer zetten tijdens hun verblijf. Voeg ze op elk moment toe en ze verschijnen automatisch op de uitcheckrekening en het gedrukte bonnetje.' },
      { icon: '📅', name: 'Onbeperkte seizoensprijsperiodes',
        desc: 'Definieer zoveel prijsperiodes als uw accommodaties nodig hebben — hoogzomer, skiseizoen, schoolvakanties, feestdagen. Elke periode kan verschillende kamertarieven hebben voor al uw accommodaties.' },
      { icon: '🏷️', name: 'Servicecategorieën met belastingtarieven',
        desc: 'Organiseer kamerrekeningen in categorieën zoals Bar, Restaurant of Activiteiten, elk met een eigen belastingtarief. Rapporten passen automatisch het juiste belastingtarief toe.' },
      { icon: '📈', name: 'Rapporten voor meerdere accommodaties',
        desc: 'Genereer omzetrapportages en winst-en-verliesoverzichten voor elke accommodatie afzonderlijk, of gecombineerd voor al uw accommodaties. Één rapport voor uw boekhouder dat alles dekt.' },
      { icon: '👤', name: 'Rol voor kamerrekening-personeel',
        desc: 'Geef uw bar- of restaurantpersoneel hun eigen login om kamerrekeningen toe te voegen — zonder toegang tot boekingen, gastgegevens of financiële rapporten. Ze zien alleen wat ze nodig hebben.' },
      { icon: '📸', name: '10 foto\'s per kamer',
        desc: 'Upload maximaal 10 foto\'s per kamer voor al uw accommodaties. Hoe visueler uw aanbieding, hoe meer vertrouwen gasten hebben voor het boeken — en hoe minder vragen u ontvangt.' },
    ],
  },
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function UpgradeModal({ onClose, defaultTab = 'pro' }) {
  const { property } = useLocale();
  const locale = property?.locale || 'en';
  const tx = MODAL_T[locale] || MODAL_T.en;

  const [tab,     setTab]     = useState(defaultTab);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleUpgrade() {
    setError('');
    setLoading(true);
    try {
      const plan = tab === 'multi' ? 'multi' : 'pro';
      const res  = await apiFetch('/api/stripe/create-checkout-session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Checkout error'); setLoading(false); return; }
      window.location.href = data.url;
    } catch {
      setError('Could not connect. Please try again.');
      setLoading(false);
    }
  }

  const features = tab === 'pro' ? tx.proFeatures : tx.multiFeatures;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1001,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px', pointerEvents: 'none',
      }}>
        <div style={{
          background: '#0f172a', borderRadius: 16, width: '100%', maxWidth: 560,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)', border: '1px solid #1e3a5f',
          pointerEvents: 'all', overflow: 'hidden',
        }}>

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div style={{
            background: 'var(--accent-dark)',
            padding: '28px 28px 24px', flexShrink: 0, position: 'relative',
          }}>
            <button
              onClick={onClose}
              style={{
                position: 'absolute', top: 14, right: 14,
                background: 'rgba(255,255,255,0.15)', border: 'none',
                borderRadius: '50%', width: 28, height: 28, cursor: 'pointer',
                color: '#fff', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              aria-label="Close"
            >✕</button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <img src="/icon.svg" alt="NestBook" style={{ width: 40, height: 40, borderRadius: 8 }} />
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                {tx.title}
              </h2>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.4 }}>
              {tx.subtitle}
            </p>

            {/* Price badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{
                background: 'rgba(255,255,255,0.15)', borderRadius: 20,
                padding: '4px 12px', fontSize: 13, fontWeight: 700, color: '#fff',
              }}>{tx.price}</span>
              <span style={{
                background: '#b45309', borderRadius: 20,
                padding: '4px 12px', fontSize: 12, fontWeight: 600, color: '#fef3c7',
              }}>{tx.trial}</span>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
              {['pro', 'multi'].map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    background: tab === t ? '#fff' : 'rgba(255,255,255,0.15)',
                    border: 'none', borderRadius: 8, padding: '6px 16px',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    color: tab === t ? 'var(--accent-dark)' : 'rgba(255,255,255,0.85)',
                    transition: 'all 0.15s',
                  }}
                >{t === 'pro' ? tx.tabPro : tx.tabMulti}</button>
              ))}
            </div>
          </div>

          {/* ── Scrollable feature list ─────────────────────────────────────── */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px' }}>

            {tab === 'pro' && tx.freeFeatures && (
              <>
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
                  color: '#64748b', textTransform: 'uppercase', marginBottom: 10,
                }}>
                  {tx.freeLabel}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 16px', marginBottom: 16 }}>
                  {tx.freeFeatures.map((f, i) => (
                    <span key={i} style={{ fontSize: 12, color: '#64748b' }}>✓ {f}</span>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid #1e293b', margin: '0 0 14px' }} />
                {tx.proAdds && (
                  <div style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
                    color: '#94a3b8', textTransform: 'uppercase', marginBottom: 14,
                  }}>
                    {tx.proAdds}
                  </div>
                )}
              </>
            )}

            {tab === 'multi' && (
              <div style={{
                background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
                padding: '10px 14px', marginBottom: 16,
                fontSize: 12, color: '#94a3b8', fontWeight: 600, letterSpacing: 0.3,
              }}>
                {tx.multiDivider}
              </div>
            )}

            {features.map((f, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', gap: 14, marginBottom: 14,
                  background: '#1e293b', borderRadius: 10,
                  padding: '14px 16px', border: '1px solid #1e3a5f',
                  alignItems: 'flex-start',
                }}
              >
                <i className={ICON_MAP[f.icon] ?? 'ti ti-circle'} style={{ fontSize: 20, flexShrink: 0, lineHeight: 1, marginTop: 2, color: '#94a3b8' }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#f1f5f9', marginBottom: 5 }}>{f.name}</div>
                  <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Sticky footer ────────────────────────────────────────────────── */}
          <div style={{
            padding: '16px 24px 20px', borderTop: '1px solid #1e293b',
            background: '#0f172a', flexShrink: 0,
          }}>
            {error && (
              <div style={{ color: '#f87171', fontSize: 12, marginBottom: 10, textAlign: 'center' }}>{error}</div>
            )}
            <button
              onClick={handleUpgrade}
              disabled={loading}
              style={{
                width: '100%', background: loading ? 'var(--accent)' : 'var(--accent-dark)',
                color: '#fff', border: 'none', borderRadius: 10,
                padding: '13px 20px', fontSize: 15, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: '-0.01em',
                transition: 'background 0.15s',
              }}
            >
              {loading ? tx.loading : tx.cta}
            </button>
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <button
                onClick={onClose}
                style={{
                  background: 'none', border: 'none', color: '#475569',
                  fontSize: 13, cursor: 'pointer', padding: '4px 8px',
                }}
              >{tx.later}</button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
