import { useState } from 'react';
import { useLocale } from '../i18n/LocaleContext.jsx';
import { apiFetch } from '../utils/apiFetch.js';

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
    proFeatures: [
      { icon: '🗓️', name: 'Booking Widget for Your Website',
        desc: 'Add a "Book Now" button to your own website and let guests book directly — no Airbnb commission, no Booking.com fees. Zero commission means payments go straight to you.' },
      { icon: '🌤️', name: 'Seasonal Pricing',
        desc: 'Set different rates for peak season, low season or special events. Define date ranges and NestBook prices each night automatically — no spreadsheets, no manual overrides.' },
      { icon: '📧', name: 'Automated Guest Emails',
        desc: 'Booking confirmations sent to guests the moment you confirm. They arrive with all the details — property address, arrival time, and what to expect — reducing last-minute questions.' },
      { icon: '📊', name: 'Revenue Reports & P&L Summary',
        desc: 'See exactly what your property earned, what you spent, and what\'s left as profit — all in one click. Generate a monthly report your accountant can use directly. No more spreadsheets.' },
      { icon: '📋', name: 'Activity Log',
        desc: 'A complete record of everything that happens in your account — every booking, every change, every checkout. Full audit trail, useful for staff management and resolving any disputes with guests.' },
      { icon: '👥', name: 'Staff Accounts',
        desc: 'Give your receptionist their own login so they can check guests in and out without sharing your owner account. Choose from receptionist and staff roles — full control over who sees what.' },
      { icon: '🌍', name: '5 Languages',
        desc: 'The full NestBook interface in English, French, Spanish, German and Dutch. Perfect for international guests and multilingual teams — switch language per property with one click.' },
      { icon: '💳', name: 'Deposit Management',
        desc: 'Request and track deposits from guests before they arrive. Automatically deducted from the final bill at checkout. No more chasing payments or doing the maths manually.' },
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
    proFeatures: [
      { icon: '🗓️', name: 'Widget de réservation pour votre site',
        desc: 'Ajoutez un bouton « Réserver » sur votre site et laissez vos voyageurs réserver directement — sans commission Airbnb, sans frais Booking.com. Zéro commission signifie que les paiements vont directement chez vous.' },
      { icon: '🌤️', name: 'Tarification saisonnière',
        desc: 'Définissez des tarifs différents pour la haute saison, la basse saison ou les événements spéciaux. Configurez des plages de dates et NestBook ajuste chaque nuit automatiquement — fini les tableurs et les ajustements manuels.' },
      { icon: '📧', name: 'E-mails automatiques aux voyageurs',
        desc: 'Les confirmations de réservation sont envoyées aux voyageurs dès que vous confirmez. Ils reçoivent tous les détails — adresse, heure d\'arrivée et ce qui les attend — réduisant les questions de dernière minute.' },
      { icon: '📊', name: 'Rapports de revenus et bilan financier',
        desc: 'Visualisez exactement ce que votre gîte a généré, vos dépenses et ce qui reste en bénéfice — en un clic. Créez un rapport mensuel que votre comptable peut utiliser directement. Fini les tableurs.' },
      { icon: '📋', name: 'Journal d\'activité',
        desc: 'Un historique complet de tout ce qui se passe dans votre compte — chaque réservation, chaque modification, chaque départ. Traçabilité complète, utile pour gérer votre personnel et résoudre tout litige.' },
      { icon: '👥', name: 'Comptes du personnel',
        desc: 'Donnez à votre réceptionniste son propre accès pour accueillir et faire partir les voyageurs sans partager votre compte propriétaire. Choisissez parmi les rôles réceptionniste et personnel — contrôle total sur qui voit quoi.' },
      { icon: '🌍', name: '5 langues',
        desc: 'L\'interface complète de NestBook en anglais, français, espagnol, allemand et néerlandais. Parfait pour les voyageurs internationaux et les équipes multilingues — changez de langue par hébergement en un clic.' },
      { icon: '💳', name: 'Gestion des acomptes',
        desc: 'Demandez et suivez les acomptes avant l\'arrivée. Automatiquement déduit de la facture finale au départ. Plus besoin de relancer vos voyageurs ou de faire les calculs manuellement.' },
    ],
    multiFeatures: [
      { icon: '🏠', name: 'Hébergements illimités',
        desc: 'Gérez autant de chambres d\'hôtes, gîtes ou maisons de vacances que vous en possédez — depuis un seul identifiant, un seul tableau de bord, un seul abonnement. Passez d\'un hébergement à l\'autre en un clic.' },
      { icon: '🍷', name: 'Extras en chambre',
        desc: 'Laissez vos voyageurs commander boissons, repas ou autres extras à leur chambre pendant leur séjour. Ajoutez-les à tout moment — ils apparaîtront automatiquement sur la note de départ et le reçu imprimé. Idéal pour les hébergements avec un bar ou un restaurant.' },
      { icon: '📅', name: 'Périodes de tarification saisonnière illimitées',
        desc: 'Définissez autant de périodes tarifaires que nécessaire — haute saison, saison de ski, vacances scolaires, jours fériés. Chaque période peut avoir des tarifs différents par chambre dans tous vos hébergements.' },
      { icon: '🏷️', name: 'Catégories de services avec taux de TVA',
        desc: 'Organisez les extras en chambre par catégories comme Bar, Restaurant ou Activités, chacune avec son propre taux de TVA. Les rapports appliquent automatiquement la TVA correcte — ce qui simplifie grandement la comptabilité.' },
      { icon: '📈', name: 'Rapports multi-hébergements',
        desc: 'Générez des rapports de revenus et des bilans pour chaque hébergement séparément, ou consolidés pour tous vos biens. Un seul rapport pour votre comptable qui couvre tout.' },
      { icon: '👤', name: 'Rôle personnel de facturation',
        desc: 'Donnez à votre personnel de bar ou de restaurant leur propre accès pour ajouter des extras en chambre — sans accès aux réservations, données clients ou rapports financiers. Ils voient uniquement ce dont ils ont besoin.' },
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
    proFeatures: [
      { icon: '🗓️', name: 'Widget de reservas para su web',
        desc: 'Añada un botón «Reservar ahora» a su propia web y deje que sus huéspedes reserven directamente — sin comisiones de Airbnb ni cargos de Booking.com. Cero comisión significa que los pagos van directamente a usted.' },
      { icon: '🌤️', name: 'Tarificación estacional',
        desc: 'Establezca tarifas diferentes para temporada alta, temporada baja o eventos especiales. Defina rangos de fechas y NestBook ajusta cada noche automáticamente — sin hojas de cálculo ni modificaciones manuales.' },
      { icon: '📧', name: 'Correos automáticos a huéspedes',
        desc: 'Las confirmaciones de reserva se envían a los huéspedes en el momento en que usted confirma. Reciben todos los detalles — dirección, hora de llegada y qué esperar — reduciendo las preguntas de última hora.' },
      { icon: '📊', name: 'Informes de ingresos y cuenta de resultados',
        desc: 'Vea exactamente lo que ha generado su propiedad, sus gastos y lo que queda como beneficio — con un solo clic. Genere un informe mensual que su asesor pueda utilizar directamente. Se acabó trabajar con hojas de cálculo.' },
      { icon: '📋', name: 'Registro de actividad',
        desc: 'Un historial completo de todo lo que ocurre en su cuenta — cada reserva, cada cambio, cada salida. Trazabilidad completa, útil para la gestión del personal y para resolver cualquier disputa con los huéspedes.' },
      { icon: '👥', name: 'Cuentas de personal',
        desc: 'Dé a su recepcionista su propio acceso para registrar entradas y salidas sin compartir su cuenta de propietario. Elija entre roles de recepcionista y personal — control total sobre quién ve qué.' },
      { icon: '🌍', name: '5 idiomas',
        desc: 'La interfaz completa de NestBook en inglés, francés, español, alemán y neerlandés. Perfecto para huéspedes internacionales y equipos multilingües — cambie el idioma por propiedad con un clic.' },
      { icon: '💳', name: 'Gestión de depósitos',
        desc: 'Solicite y haga seguimiento de los depósitos antes de la llegada. Se descuenta automáticamente de la factura final al salir. No más perseguir pagos ni hacer cálculos a mano.' },
    ],
    multiFeatures: [
      { icon: '🏠', name: 'Propiedades ilimitadas',
        desc: '¿Tiene una casa rural y un apartamento? Gestínelos desde un solo acceso, un solo panel, una sola suscripción. Cambie entre propiedades con un clic — sin cerrar sesión.' },
      { icon: '🍷', name: 'Cargos a habitación',
        desc: 'Permita que sus huéspedes carguen bebidas, comidas u otros extras a su habitación durante la estancia. Añádalos en cualquier momento y aparecerán automáticamente en la factura de salida y el recibo impreso. Perfecto para alojamientos con bar o restaurante.' },
      { icon: '📅', name: 'Períodos de precios estacionales ilimitados',
        desc: 'Defina tantos períodos tarifarios como necesiten sus propiedades — temporada alta, temporada de esquí, puentes, festivos. Cada período puede tener tarifas diferentes por habitación en todas sus propiedades.' },
      { icon: '🏷️', name: 'Categorías de servicios con tipos impositivos',
        desc: 'Organice los cargos a habitación en categorías como Bar, Restaurante o Actividades, cada una con su propio tipo impositivo. Los informes aplican automáticamente el impuesto correcto — facilitando enormemente la contabilidad.' },
      { icon: '📈', name: 'Informes multi-alojamiento',
        desc: 'Genere informes de ingresos y cuentas de resultados para cada propiedad por separado, o consolidados para todas sus propiedades. Un solo informe para su asesor que lo abarca todo.' },
      { icon: '👤', name: 'Rol de personal de cargos',
        desc: 'Dé a su personal de bar o restaurante su propio acceso para añadir cargos a la habitación — sin acceso a reservas, datos de huéspedes ni informes financieros. Verán únicamente lo que necesitan.' },
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
    proFeatures: [
      { icon: '🗓️', name: 'Buchungs-Widget für Ihre Website',
        desc: 'Fügen Sie Ihrer eigenen Website einen „Jetzt buchen"-Button hinzu und lassen Sie Gäste direkt buchen — ohne Airbnb-Provision, ohne Booking.com-Gebühren. Null Provision bedeutet, dass Zahlungen direkt an Sie gehen.' },
      { icon: '🌤️', name: 'Saisonale Preisgestaltung',
        desc: 'Legen Sie verschiedene Tarife für Hochsaison, Nebensaison oder besondere Ereignisse fest. Definieren Sie Datumsbereiche und NestBook passt jede Nacht automatisch an — keine Tabellen, keine manuellen Überarbeitungen.' },
      { icon: '📧', name: 'Automatische Gäste-E-Mails',
        desc: 'Buchungsbestätigungen werden an Gäste gesendet, sobald Sie bestätigen. Sie erhalten alle Einzelheiten — Adresse, Ankunftszeit und was sie erwartet — das reduziert kurzfristige Rückfragen.' },
      { icon: '📊', name: 'Umsätze & Gewinn-und-Verlust-Übersicht',
        desc: 'Sehen Sie auf einen Blick, was Ihre Unterkunft eingenommen hat, was Sie ausgegeben haben und was als Gewinn bleibt — mit einem Klick. Erstellen Sie einen Monatsbericht, den Ihr Steuerberater direkt verwenden kann.' },
      { icon: '📋', name: 'Aktivitätsprotokoll',
        desc: 'Eine vollständige Aufzeichnung von allem, was in Ihrem Konto passiert — jede Buchung, jede Änderung, jeder Check-out. Vollständige Nachverfolgbarkeit, nützlich für die Personalverwaltung und zur Klärung von Streitigkeiten.' },
      { icon: '👥', name: 'Mitarbeiterkonten',
        desc: 'Geben Sie Ihrer Rezeptionistin einen eigenen Zugang, um Gäste ein- und auszuchecken, ohne Ihr Eigentümer-Konto zu teilen. Wählen Sie aus Rezeptionisten- und Mitarbeiterrollen — volle Kontrolle über den Zugriff.' },
      { icon: '🌍', name: '5 Sprachen',
        desc: 'Die vollständige NestBook-Oberfläche auf Englisch, Französisch, Spanisch, Deutsch und Niederländisch. Ideal für internationale Gäste und mehrsprachige Teams — Sprache pro Unterkunft mit einem Klick wechseln.' },
      { icon: '💳', name: 'Kautionsverwaltung',
        desc: 'Fordern Sie Kautionen vor der Anreise an und behalten Sie den Überblick. Die Kaution wird beim Check-out automatisch von der Endrechnung abgezogen. Kein Hinterherlaufen von Zahlungen, kein manuelles Rechnen.' },
    ],
    multiFeatures: [
      { icon: '🏠', name: 'Unbegrenzte Unterkünfte',
        desc: 'Verwalten Sie so viele B&Bs, Ferienwohnungen oder Gästehäuser, wie Sie besitzen — alle über einen Login, ein Dashboard, ein Abonnement. Mit einem Klick zwischen Unterkünften wechseln, kein An- und Abmelden.' },
      { icon: '🍷', name: 'Extras auf Zimmerkonto',
        desc: 'Lassen Sie Gäste Getränke, Mahlzeiten oder Extras während ihres Aufenthalts auf ihr Zimmer buchen. Jederzeit hinzufügbar — sie erscheinen automatisch auf der Checkout-Rechnung und dem gedruckten Beleg. Ideal für Unterkünfte mit Bar oder Restaurant.' },
      { icon: '📅', name: 'Unbegrenzte saisonale Preiszeiträume',
        desc: 'Legen Sie so viele Preiszeiträume fest, wie Ihre Unterkünfte benötigen — Hochsommer, Skisaison, Schulferien, Feiertage. Jeder Zeitraum kann unterschiedliche Zimmerpreise für alle Ihre Objekte haben.' },
      { icon: '🏷️', name: 'Servicekategorien mit Steuersätzen',
        desc: 'Ordnen Sie Zimmerzusatzleistungen in Kategorien wie Bar, Restaurant oder Aktivitäten ein, jede mit eigenem Steuersatz. Berichte wenden automatisch die korrekte Steuer an — das erleichtert Ihrem Steuerberater die Arbeit erheblich.' },
      { icon: '📈', name: 'Berichte für mehrere Unterkünfte',
        desc: 'Erstellen Sie Umsatzberichte und GuV-Übersichten für jede Unterkunft einzeln oder zusammengefasst für alle Ihre Objekte. Ein einziger Bericht für Ihren Steuerberater, der alles abdeckt.' },
      { icon: '👤', name: 'Rolle für Servicepersonal',
        desc: 'Geben Sie Ihrem Bar- oder Restaurantpersonal eigene Zugangsdaten zum Erfassen von Extras — ohne Zugriff auf Buchungen, Gästedaten oder Finanzberichte. Sie sehen nur, was sie brauchen.' },
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
    proFeatures: [
      { icon: '🗓️', name: 'Boekingswidget voor uw website',
        desc: 'Voeg een „Nu boeken"-knop toe aan uw eigen website en laat gasten rechtstreeks boeken — zonder Airbnb-commissie, zonder Booking.com-kosten. Nul commissie betekent dat betalingen direct naar u gaan.' },
      { icon: '🌤️', name: 'Seizoensprijzen',
        desc: 'Stel verschillende tarieven in voor hoogseizoen, laagseizoen of speciale evenementen. Definieer datumperiodes en NestBook past elke nacht automatisch aan — geen spreadsheets, geen handmatige aanpassingen.' },
      { icon: '📧', name: 'Automatische e-mails aan gasten',
        desc: 'Boekingsbevestigingen worden naar gasten verstuurd op het moment dat u bevestigt. Ze ontvangen alle details — adres, aankomsttijd en wat ze kunnen verwachten — wat last-minute vragen vermindert.' },
      { icon: '📊', name: 'Omzetrapportages en winst-en-verliesoverzicht',
        desc: 'Zie precies wat uw accommodatie heeft verdiend, wat u heeft uitgegeven en wat er als winst overblijft — met één klik. Maak een maandrapport dat uw boekhouder direct kan gebruiken. Nooit meer spreadsheets.' },
      { icon: '📋', name: 'Activiteitenlogboek',
        desc: 'Een volledig overzicht van alles wat er in uw account gebeurt — elke boeking, elke wijziging, elke uitcheck. Volledige audittrail, handig voor personeelsbeheer en het oplossen van eventuele geschillen.' },
      { icon: '👥', name: 'Personeelsaccounts',
        desc: 'Geef uw receptionist een eigen login om gasten in- en uit te checken zonder uw eigenaaraccount te delen. Kies uit receptionist- en personeelsrollen — volledige controle over wie wat ziet.' },
      { icon: '🌍', name: '5 talen',
        desc: 'De volledige NestBook-interface in het Engels, Frans, Spaans, Duits en Nederlands. Perfect voor internationale gasten en meertalige teams — wissel van taal per accommodatie met één klik.' },
      { icon: '💳', name: 'Aanbetaling beheren',
        desc: 'Vraag aanbetalingen op bij gasten voordat ze arriveren en houd ze bij. Automatisch afgetrokken van de eindfactuur bij uitchecken. Geen betalingen meer achternalopen of handmatig rekenen.' },
    ],
    multiFeatures: [
      { icon: '🏠', name: 'Onbeperkte accommodaties',
        desc: 'Beheer zoveel B&Bs, vakantiewoningen of gîtes als u bezit — allemaal via één login, één dashboard, één abonnement. Wissel tussen accommodaties met één klik, niet steeds opnieuw inloggen.' },
      { icon: '🍷', name: 'Kamerrekening',
        desc: 'Laat gasten drankjes, maaltijden of extra\'s op hun kamer zetten tijdens hun verblijf. Voeg ze op elk moment toe en ze verschijnen automatisch op de uitcheckrekening en het gedrukte bonnetje. Perfect voor accommodaties met een bar of restaurant.' },
      { icon: '📅', name: 'Onbeperkte seizoensprijsperiodes',
        desc: 'Definieer zoveel prijsperiodes als uw accommodaties nodig hebben — hoogzomer, skiseizoen, schoolvakanties, feestdagen. Elke periode kan verschillende kamertarieven hebben voor al uw accommodaties.' },
      { icon: '🏷️', name: 'Servicecategorieën met belastingtarieven',
        desc: 'Organiseer kamerrekeningen in categorieën zoals Bar, Restaurant of Activiteiten, elk met een eigen belastingtarief. Rapporten passen automatisch het juiste belastingtarief toe — wat uw accountant veel werk bespaart.' },
      { icon: '📈', name: 'Rapporten voor meerdere accommodaties',
        desc: 'Genereer omzetrapportages en winst-en-verliesoverzichten voor elke accommodatie afzonderlijk, of gecombineerd voor al uw accommodaties. Één rapport voor uw boekhouder dat alles dekt.' },
      { icon: '👤', name: 'Rol voor kamerrekening-personeel',
        desc: 'Geef uw bar- of restaurantpersoneel hun eigen login om kamerrekeningen toe te voegen — zonder toegang tot boekingen, gastgegevens of financiële rapporten. Ze zien alleen wat ze nodig hebben.' },
    ],
  }
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
                <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1, marginTop: 1 }}>{f.icon}</span>
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
