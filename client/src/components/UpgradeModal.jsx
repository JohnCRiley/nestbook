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
        desc: 'Add a "Book Now" button to your own website and let guests book directly — no Airbnb commission, no Booking.com fees. The widget works in 5 languages and confirms instantly.' },
      { icon: '📊', name: 'Revenue Reports & P&L Summary',
        desc: 'See exactly what your property earned, what you spent, and what\'s left as profit — all in one click. Generate a monthly report your accountant can use directly. No more spreadsheets.' },
      { icon: '🧾', name: 'Business Expenses Tracker',
        desc: 'Log your utilities, repairs, insurance and marketing costs against your income. When tax time comes, everything is already organised and ready to hand over.' },
      { icon: '📧', name: 'Guest Contact List',
        desc: 'Every guest who stayed with you, in one exportable list. Invite them back for next season, send a special offer, or simply say thank you — without going through a third-party platform.' },
      { icon: '💳', name: 'Deposit Management',
        desc: 'Request and track deposits from guests before they arrive. Automatically deducted from the final bill at checkout. No more chasing payments or doing the maths manually.' },
      { icon: '📋', name: 'Activity Log',
        desc: 'A complete record of everything that happens in your account — every booking, every change, every checkout. Useful for staff management and resolving any disputes with guests.' },
      { icon: '🎯', name: 'Priority Email Support',
        desc: 'Get help from a real person when you need it. Pro users go to the front of the queue.' },
    ],
    multiFeatures: [
      { icon: '🏠', name: 'Up to 5 Properties in One Account',
        desc: 'Own a gîte and a B&B? Manage both from one login, one dashboard, one subscription. Switch between properties with one click — no logging in and out.' },
      { icon: '🍷', name: 'Room Charges',
        desc: 'Let guests charge drinks, meals or extras to their room during their stay. Add them at any time and they appear automatically on the checkout bill and printed receipt. Perfect for properties with a bar or restaurant.' },
      { icon: '👥', name: 'Charges Staff Role',
        desc: 'Give your bar or restaurant staff their own login to add room charges — without access to bookings, guest data or financial reports. They see only what they need.' },
      { icon: '📈', name: 'Multi-Property Reports',
        desc: 'Generate revenue reports and P&L summaries for each property individually, or combined across all your properties. One report for your accountant covering everything.' },
    ],
  },

  fr: {
    title:        'Passer à NestBook Pro',
    subtitle:     'Tout ce qu\'il faut pour gérer votre hébergement comme un pro',
    price:        'À partir de 22 €/mois — ou £19/mois',
    trial:        'Essai gratuit de 30 jours inclus',
    tabPro:       'Pro',
    tabMulti:     'Multi-hébergement',
    cta:          'Démarrer mon essai gratuit de 30 jours →',
    later:        'Peut-être plus tard',
    multiDivider: 'Tout ce qui est dans Pro, plus ces fonctionnalités :',
    loading:      'Redirection vers le paiement…',
    proFeatures: [
      { icon: '🗓️', name: 'Widget de réservation pour votre site',
        desc: 'Ajoutez un bouton « Réserver » sur votre site et laissez vos voyageurs réserver directement — sans commission Airbnb, sans frais Booking.com. Le widget fonctionne dans 5 langues et confirme instantanément.' },
      { icon: '📊', name: 'Rapports de revenus et bilan financier',
        desc: 'Visualisez exactement ce que votre gîte a généré, vos dépenses et ce qui reste en bénéfice — en un clic. Créez un rapport mensuel que votre comptable peut utiliser directement. Fini les tableurs.' },
      { icon: '🧾', name: 'Suivi des charges d\'exploitation',
        desc: 'Enregistrez vos factures d\'électricité, réparations, assurances et marketing en regard de vos revenus. À la déclaration, tout est déjà classé et prêt à transmettre.' },
      { icon: '📧', name: 'Liste de contacts voyageurs',
        desc: 'Tous vos voyageurs passés, dans une liste exportable. Invitez-les pour la saison prochaine, envoyez une offre spéciale, ou remerciez-les simplement — sans passer par une plateforme tierce.' },
      { icon: '💳', name: 'Gestion des acomptes',
        desc: 'Demandez et suivez les acomptes avant l\'arrivée. Automatiquement déduit de la facture finale au départ. Plus besoin de relancer vos voyageurs ou de faire les calculs manuellement.' },
      { icon: '📋', name: 'Journal d\'activité',
        desc: 'Un historique complet de tout ce qui se passe dans votre compte — chaque réservation, chaque modification, chaque départ. Utile pour gérer votre personnel et résoudre tout litige avec vos voyageurs.' },
      { icon: '🎯', name: 'Assistance prioritaire par e-mail',
        desc: 'Obtenez l\'aide d\'une vraie personne quand vous en avez besoin. Les utilisateurs Pro passent en tête de file.' },
    ],
    multiFeatures: [
      { icon: '🏠', name: 'Jusqu\'à 5 hébergements en un seul compte',
        desc: 'Vous gérez un gîte et une chambre d\'hôtes ? Gérez les deux depuis un seul identifiant, un seul tableau de bord, un seul abonnement. Passez d\'un hébergement à l\'autre en un clic — sans vous déconnecter.' },
      { icon: '🍷', name: 'Extras en chambre',
        desc: 'Laissez vos voyageurs commander boissons, repas ou autres extras à leur chambre pendant leur séjour. Ajoutez-les à tout moment — ils apparaîtront automatiquement sur la note de départ et le reçu imprimé. Idéal pour les hébergements avec un bar ou un restaurant.' },
      { icon: '👥', name: 'Rôle personnel de facturation',
        desc: 'Donnez à votre personnel de bar ou de restaurant leur propre accès pour ajouter des extras en chambre — sans accès aux réservations, données clients ou rapports financiers. Ils voient uniquement ce dont ils ont besoin.' },
      { icon: '📈', name: 'Rapports multi-hébergements',
        desc: 'Générez des rapports de revenus et des bilans pour chaque hébergement séparément, ou consolidés pour tous vos biens. Un seul rapport pour votre comptable qui couvre tout.' },
    ],
  },

  es: {
    title:        'Activar NestBook Pro',
    subtitle:     'Todo lo que necesita para gestionar su alojamiento como un profesional',
    price:        'Desde 22 €/mes — o £19/mes',
    trial:        'Prueba gratuita de 30 días incluida',
    tabPro:       'Pro',
    tabMulti:     'Multi-alojamiento',
    cta:          'Comenzar mi prueba gratuita de 30 días →',
    later:        'Quizás más adelante',
    multiDivider: 'Todo lo que incluye Pro, más estas funciones adicionales:',
    loading:      'Redirigiendo al pago…',
    proFeatures: [
      { icon: '🗓️', name: 'Widget de reservas para su web',
        desc: 'Añada un botón «Reservar ahora» a su propia web y deje que sus huéspedes reserven directamente — sin comisiones de Airbnb ni cargos de Booking.com. El widget funciona en 5 idiomas y confirma al instante.' },
      { icon: '📊', name: 'Informes de ingresos y cuenta de resultados',
        desc: 'Vea exactamente lo que ha generado su propiedad, sus gastos y lo que queda como beneficio — con un solo clic. Genere un informe mensual que su asesor pueda utilizar directamente. Se acabó trabajar con hojas de cálculo.' },
      { icon: '🧾', name: 'Control de gastos de explotación',
        desc: 'Registre sus gastos de suministros, reparaciones, seguros y marketing frente a sus ingresos. Cuando llegue el momento de la declaración, todo estará ya organizado y listo para entregar.' },
      { icon: '📧', name: 'Lista de contactos de huéspedes',
        desc: 'Todos los huéspedes que han pasado por su alojamiento, en una lista exportable. Invítelos para la próxima temporada, envíe una oferta especial o simplemente déles las gracias — sin pasar por plataformas de terceros.' },
      { icon: '💳', name: 'Gestión de depósitos',
        desc: 'Solicite y haga seguimiento de los depósitos antes de la llegada. Se descuenta automáticamente de la factura final al salir. No más perseguir pagos ni hacer cálculos a mano.' },
      { icon: '📋', name: 'Registro de actividad',
        desc: 'Un historial completo de todo lo que ocurre en su cuenta — cada reserva, cada cambio, cada salida. Útil para la gestión del personal y para resolver cualquier disputa con los huéspedes.' },
      { icon: '🎯', name: 'Soporte prioritario por e-mail',
        desc: 'Reciba ayuda de una persona real cuando la necesite. Los usuarios Pro van siempre al frente de la cola.' },
    ],
    multiFeatures: [
      { icon: '🏠', name: 'Hasta 5 alojamientos en una sola cuenta',
        desc: '¿Tiene una casa rural y un apartamento? Gestínelos desde un solo acceso, un solo panel, una sola suscripción. Cambie entre propiedades con un clic — sin cerrar sesión.' },
      { icon: '🍷', name: 'Cargos a habitación',
        desc: 'Permita que sus huéspedes carguen bebidas, comidas u otros extras a su habitación durante la estancia. Añádalos en cualquier momento y aparecerán automáticamente en la factura de salida y el recibo impreso. Perfecto para alojamientos con bar o restaurante.' },
      { icon: '👥', name: 'Rol de personal de cargos',
        desc: 'Dé a su personal de bar o restaurante su propio acceso para añadir cargos a la habitación — sin acceso a reservas, datos de huéspedes ni informes financieros. Verán únicamente lo que necesitan.' },
      { icon: '📈', name: 'Informes multi-alojamiento',
        desc: 'Genere informes de ingresos y cuentas de resultados para cada propiedad por separado, o consolidados para todas sus propiedades. Un solo informe para su asesor que lo abarca todo.' },
    ],
  },

  de: {
    title:        'NestBook Pro freischalten',
    subtitle:     'Alles, was Sie brauchen, um Ihre Unterkunft professionell zu führen',
    price:        'Ab 22 €/Monat — oder £19/Monat',
    trial:        '30-tägige kostenlose Testphase inklusive',
    tabPro:       'Pro',
    tabMulti:     'Mehrere Unterkünfte',
    cta:          'Meine 30-tägige Testphase starten →',
    later:        'Vielleicht später',
    multiDivider: 'Alles aus Pro, plus diese zusätzlichen Funktionen:',
    loading:      'Weiterleitung zur Zahlung…',
    proFeatures: [
      { icon: '🗓️', name: 'Buchungs-Widget für Ihre Website',
        desc: 'Fügen Sie Ihrer eigenen Website einen „Jetzt buchen“-Button hinzu und lassen Sie Gäste direkt buchen — ohne Airbnb-Provision, ohne Booking.com-Gebühren. Das Widget funktioniert in 5 Sprachen und bestätigt sofort.' },
      { icon: '📊', name: 'Umsätze & Gewinn-und-Verlust-Übersicht',
        desc: 'Sehen Sie auf einen Blick, was Ihre Unterkunft eingenommen hat, was Sie ausgegeben haben und was als Gewinn bleibt — mit einem Klick. Erstellen Sie einen Monatsbericht, den Ihr Steuerberater direkt verwenden kann. Keine Tabellen mehr.' },
      { icon: '🧾', name: 'Betriebskosten-Tracker',
        desc: 'Erfassen Sie Ihre Strom-, Reparatur-, Versicherungs- und Marketingkosten gegenüber Ihren Einnahmen. Wenn die Steuererklärung ansteht, ist alles bereits geordnet und übergabebereit.' },
      { icon: '📧', name: 'Gästekontaktliste',
        desc: 'Alle Gäste, die bei Ihnen übernachtet haben, in einer exportierbaren Liste. Laden Sie sie für die nächste Saison ein, senden Sie ein Sonderangebot oder bedanken Sie sich einfach — ohne den Umweg über Buchungsportale.' },
      { icon: '💳', name: 'Kautionsverwaltung',
        desc: 'Fordern Sie Kautionen vor der Anreise an und behalten Sie den Überblick. Die Kaution wird beim Check-out automatisch von der Endrechnung abgezogen. Kein Hinterherlaufen von Zahlungen, kein manuelles Rechnen.' },
      { icon: '📋', name: 'Aktivitätsprotokoll',
        desc: 'Eine vollständige Aufzeichnung von allem, was in Ihrem Konto passiert — jede Buchung, jede Änderung, jeder Check-out. Nützlich für die Personalverwaltung und zur Klärung von Streitigkeiten mit Gästen.' },
      { icon: '🎯', name: 'Prioritäts-E-Mail-Support',
        desc: 'Erhalten Sie Hilfe von einem echten Menschen, wenn Sie sie brauchen. Pro-Nutzer kommen zuerst an die Reihe.' },
    ],
    multiFeatures: [
      { icon: '🏠', name: 'Bis zu 5 Unterkünfte in einem Konto',
        desc: 'Haben Sie eine Ferienwohnung und ein Gästehaus? Verwalten Sie beides mit einem Login, einem Dashboard, einem Abonnement. Wechseln Sie per Klick zwischen den Unterkünften — kein An- und Abmelden.' },
      { icon: '🍷', name: 'Extras auf Zimmerkonto',
        desc: 'Lassen Sie Gäste Getränke, Mahlzeiten oder Extras während ihres Aufenthalts auf ihr Zimmer buchen. Jederzeit hinzufügbar — sie erscheinen automatisch auf der Checkout-Rechnung und dem gedruckten Beleg. Ideal für Unterkünfte mit Bar oder Restaurant.' },
      { icon: '👥', name: 'Rolle für Servicepersonal',
        desc: 'Geben Sie Ihrem Bar- oder Restaurantpersonal eigene Zugangsdaten zum Erfassen von Extras — ohne Zugriff auf Buchungen, Gästedaten oder Finanzberichte. Sie sehen nur, was sie brauchen.' },
      { icon: '📈', name: 'Berichte für mehrere Unterkünfte',
        desc: 'Erstellen Sie Umsatzberichte und G&V-Übersichten für jede Unterkunft einzeln oder zusammengefasst für alle Ihre Objekte. Ein einziger Bericht für Ihren Steuerberater, der alles abdeckt.' },
    ],
  },

  nl: {
    title:        'NestBook Pro activeren',
    subtitle:     'Alles wat u nodig heeft om uw accommodatie professioneel te beheren',
    price:        'Vanaf 22 €/maand — of £19/maand',
    trial:        '30 dagen gratis proberen inbegrepen',
    tabPro:       'Pro',
    tabMulti:     'Meerdere accommodaties',
    cta:          'Mijn gratis proefperiode van 30 dagen starten →',
    later:        'Misschien later',
    multiDivider: 'Alles van Pro, plus deze extra functies:',
    loading:      'Doorsturen naar betaling…',
    proFeatures: [
      { icon: '🗓️', name: 'Boekingswidget voor uw website',
        desc: 'Voeg een „Nu boeken“-knop toe aan uw eigen website en laat gasten rechtstreeks boeken — zonder Airbnb-commissie, zonder Booking.com-kosten. De widget werkt in 5 talen en bevestigt direct.' },
      { icon: '📊', name: 'Omzetrapportages en winst-en-verliesoverzicht',
        desc: 'Zie precies wat uw accommodatie heeft verdiend, wat u heeft uitgegeven en wat er als winst overblijft — met één klik. Maak een maandrapport dat uw boekhouder direct kan gebruiken. Nooit meer spreadsheets.' },
      { icon: '🧾', name: 'Zakelijke kostenregistratie',
        desc: 'Leg uw nutskosten, reparaties, verzekeringen en marketinguitgaven vast naast uw inkomsten. Als het tijd is voor de belastingaangifte, is alles al geordend en klaar om in te leveren.' },
      { icon: '📧', name: 'Gastcontactlijst',
        desc: 'Elke gast die bij u heeft overnacht, in één exporteerbare lijst. Nodig ze uit voor het volgende seizoen, stuur een speciale aanbieding of zeg eenvoudig dank u — zonder tussenkomst van een platform.' },
      { icon: '💳', name: 'Aanbetaling beheren',
        desc: 'Vraag aanbetalingen op bij gasten voordat ze arriveren en houd ze bij. Automatisch afgetrokken van de eindfactuur bij uitchecken. Geen betalingen meer achternalopen of handmatig rekenen.' },
      { icon: '📋', name: 'Activiteitenlogboek',
        desc: 'Een volledig overzicht van alles wat er in uw account gebeurt — elke boeking, elke wijziging, elke uitcheck. Handig voor personeelsbeheer en het oplossen van eventuele geschillen met gasten.' },
      { icon: '🎯', name: 'Prioriteits e-mailondersteuning',
        desc: 'Krijg hulp van een echt persoon wanneer u dat nodig heeft. Pro-gebruikers gaan voor in de rij.' },
    ],
    multiFeatures: [
      { icon: '🏠', name: 'Tot 5 accommodaties in één account',
        desc: 'Heeft u een vakantiewoning én een B&B? Beheer beide vanuit één login, één dashboard, één abonnement. Wissel tussen accommodaties met één klik — niet steeds opnieuw inloggen.' },
      { icon: '🍷', name: 'Kamerrekening',
        desc: 'Laat gasten drankjes, maaltijden of extra\'s op hun kamer zetten tijdens hun verblijf. Voeg ze op elk moment toe en ze verschijnen automatisch op de uitcheckrekening en het gedrukte bonnetje. Perfect voor accommodaties met een bar of restaurant.' },
      { icon: '👥', name: 'Rol voor kamerrekening-personeel',
        desc: 'Geef uw bar- of restaurantpersoneel hun eigen login om kamerrekeningen toe te voegen — zonder toegang tot boekingen, gastgegevens of financiële rapporten. Ze zien alleen wat ze nodig hebben.' },
      { icon: '📈', name: 'Rapporten voor meerdere accommodaties',
        desc: 'Genereer omzetrapportages en winst-en-verliesoverzichten voor elke accommodatie afzonderlijk, of gecombineerd voor al uw accommodaties. Één rapport voor uw boekhouder dat alles dekt.' },
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
            background: '#1a4710',
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
                    color: tab === t ? '#1a4710' : 'rgba(255,255,255,0.85)',
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
                width: '100%', background: loading ? '#2f771b' : '#1a4710',
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
