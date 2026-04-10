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
  const SCRIPT      = document.currentScript;
  const PROPERTY_ID = SCRIPT.getAttribute('data-property-id') || '1';
  const LANG        = SCRIPT.getAttribute('data-lang')        || 'en';
  const CURRENCY    = SCRIPT.getAttribute('data-currency')    || 'EUR';
  // Derive API base from wherever the script itself is served from
  const API_BASE    = SCRIPT.src.replace(/\/widget\.js(\?.*)?$/, '');
  const CUR_SYMBOL  = ({ EUR: '€', GBP: '£', USD: '$', CHF: 'CHF ' })[CURRENCY] || '€';
  const BRAND       = SCRIPT.getAttribute('data-color') || '#2f771b';
  const BRAND_DARK  = '#1a4710';
  const BRAND_LIGHT = '#d9f0cc';

  // ── i18n ───────────────────────────────────────────────────────────────────
  const STRINGS = {
    en: {
      bookNow: 'Book Now', close: '✕', back: '← Back',
      step1Title: 'Choose Your Dates',
      step2Title: 'Select a Room',
      step3Title: 'Your Details',
      step4Title: 'Confirm Booking',
      checkIn: 'Check-in', checkOut: 'Check-out', guests: 'Guests',
      checkAvailability: 'Check Availability',
      noRooms: 'No rooms are available for those dates. Please try different dates.',
      capacity: 'Up to', perNight: '/night',
      firstName: 'First Name *', lastName: 'Last Name *',
      email: 'Email Address *', phone: 'Phone Number',
      notes: 'Special Requests', optional: '(optional)',
      summaryRoom: 'Room', summaryDates: 'Dates', summaryGuests: 'Guests',
      summaryNights: 'Duration', summaryTotal: 'Total',
      nights: (n) => `${n} ${n === 1 ? 'night' : 'nights'}`,
      confirmBtn: 'Confirm Booking', confirming: 'Confirming…',
      successTitle: 'Booking Confirmed!',
      successMsg: 'Thank you! Your booking reference is:',
      successClose: 'Close',
      errRequired: 'Please fill in all required fields.',
      errDates: 'Check-out must be after check-in.',
      errServer: 'Something went wrong. Please try again.',
      checking: 'Checking availability…',
    },
    fr: {
      bookNow: 'Réserver', close: '✕', back: '← Retour',
      step1Title: 'Choisissez vos dates',
      step2Title: 'Choisir une chambre',
      step3Title: 'Vos coordonnées',
      step4Title: 'Confirmer la réservation',
      checkIn: 'Arrivée', checkOut: 'Départ', guests: 'Voyageurs',
      checkAvailability: 'Vérifier la disponibilité',
      noRooms: 'Aucune chambre disponible pour ces dates. Veuillez essayer d\'autres dates.',
      capacity: "Jusqu'à", perNight: '/nuit',
      firstName: 'Prénom *', lastName: 'Nom *',
      email: 'Adresse e-mail *', phone: 'Téléphone',
      notes: 'Demandes spéciales', optional: '(facultatif)',
      summaryRoom: 'Chambre', summaryDates: 'Dates', summaryGuests: 'Voyageurs',
      summaryNights: 'Durée', summaryTotal: 'Total',
      nights: (n) => `${n} ${n === 1 ? 'nuit' : 'nuits'}`,
      confirmBtn: 'Confirmer la réservation', confirming: 'Confirmation…',
      successTitle: 'Réservation confirmée !',
      successMsg: 'Merci ! Votre numéro de référence est :',
      successClose: 'Fermer',
      errRequired: 'Veuillez remplir tous les champs obligatoires.',
      errDates: 'La date de départ doit être postérieure à l\'arrivée.',
      errServer: 'Une erreur est survenue. Veuillez réessayer.',
      checking: 'Vérification de la disponibilité…',
    },
    es: {
      bookNow: 'Reservar', close: '✕', back: '← Volver',
      step1Title: 'Elija sus fechas',
      step2Title: 'Seleccione una habitación',
      step3Title: 'Sus datos',
      step4Title: 'Confirmar reserva',
      checkIn: 'Llegada', checkOut: 'Salida', guests: 'Huéspedes',
      checkAvailability: 'Comprobar disponibilidad',
      noRooms: 'No hay habitaciones disponibles para esas fechas. Pruebe otras fechas.',
      capacity: 'Hasta', perNight: '/noche',
      firstName: 'Nombre *', lastName: 'Apellido *',
      email: 'Correo electrónico *', phone: 'Teléfono',
      notes: 'Peticiones especiales', optional: '(opcional)',
      summaryRoom: 'Habitación', summaryDates: 'Fechas', summaryGuests: 'Huéspedes',
      summaryNights: 'Duración', summaryTotal: 'Total',
      nights: (n) => `${n} ${n === 1 ? 'noche' : 'noches'}`,
      confirmBtn: 'Confirmar reserva', confirming: 'Confirmando…',
      successTitle: '¡Reserva confirmada!',
      successMsg: '¡Gracias! Su número de referencia es:',
      successClose: 'Cerrar',
      errRequired: 'Por favor, complete todos los campos obligatorios.',
      errDates: 'La fecha de salida debe ser posterior a la llegada.',
      errServer: 'Algo salió mal. Por favor, inténtelo de nuevo.',
      checking: 'Comprobando disponibilidad…',
    },
    nl: {
      bookNow: 'Boek nu', close: '✕', back: '← Terug',
      step1Title: 'Kies uw datums',
      step2Title: 'Kamer kiezen',
      step3Title: 'Uw gegevens',
      step4Title: 'Reservering bevestigen',
      checkIn: 'Aankomst', checkOut: 'Vertrek', guests: 'Personen',
      checkAvailability: 'Beschikbaarheid controleren',
      noRooms: 'Geen kamers beschikbaar voor deze datums. Kies andere datums.',
      capacity: 'Maximaal', perNight: '/nacht',
      firstName: 'Voornaam *', lastName: 'Achternaam *',
      email: 'E-mailadres *', phone: 'Telefoonnummer',
      notes: 'Speciale verzoeken', optional: '(optioneel)',
      summaryRoom: 'Kamer', summaryDates: 'Datums', summaryGuests: 'Personen',
      summaryNights: 'Verblijfsduur', summaryTotal: 'Totaal',
      nights: (n) => `${n} nacht${n !== 1 ? 'en' : ''}`,
      confirmBtn: 'Reservering bevestigen', confirming: 'Bezig met bevestigen…',
      successTitle: 'Reservering bevestigd!',
      successMsg: 'Bedankt! Uw referentienummer is:',
      successClose: 'Sluiten',
      errRequired: 'Vul alle verplichte velden in.',
      errDates: 'Vertrekdatum moet na aankomstdatum liggen.',
      errServer: 'Er is iets misgegaan. Probeer het opnieuw.',
      checking: 'Beschikbaarheid controleren…',
    },
    de: {
      bookNow: 'Buchen', close: '✕', back: '← Zurück',
      step1Title: 'Ihre Reisedaten',
      step2Title: 'Zimmer wählen',
      step3Title: 'Ihre Daten',
      step4Title: 'Buchung bestätigen',
      checkIn: 'Anreise', checkOut: 'Abreise', guests: 'Gäste',
      checkAvailability: 'Verfügbarkeit prüfen',
      noRooms: 'Keine Zimmer verfügbar für diese Daten. Bitte andere Daten wählen.',
      capacity: 'Bis zu', perNight: '/Nacht',
      firstName: 'Vorname *', lastName: 'Nachname *',
      email: 'E-Mail-Adresse *', phone: 'Telefon',
      notes: 'Besondere Wünsche', optional: '(optional)',
      summaryRoom: 'Zimmer', summaryDates: 'Daten', summaryGuests: 'Gäste',
      summaryNights: 'Dauer', summaryTotal: 'Gesamt',
      nights: (n) => `${n} ${n === 1 ? 'Nacht' : 'Nächte'}`,
      confirmBtn: 'Buchung bestätigen', confirming: 'Wird bestätigt…',
      successTitle: 'Buchung bestätigt!',
      successMsg: 'Vielen Dank! Ihre Referenznummer lautet:',
      successClose: 'Schließen',
      errRequired: 'Bitte füllen Sie alle Pflichtfelder aus.',
      errDates: 'Abreise muss nach Anreise liegen.',
      errServer: 'Etwas ist schiefgelaufen. Bitte erneut versuchen.',
      checking: 'Verfügbarkeit wird geprüft…',
    },
  };
  const T = STRINGS[LANG] || STRINGS.en;

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
    bookingRef:     null,
    loading:        false,
    error:          null,
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
      throw new Error('API error ' + res.status);
    }
    return res.json();
  }

  async function loadAvailability() {
    S.loading = true;
    S.error   = null;
    render();
    try {
      const [rooms, bookings] = await Promise.all([
        apiFetch('/api/widget/rooms?property_id=' + PROPERTY_ID),
        apiFetch('/api/widget/bookings?property_id=' + PROPERTY_ID),
      ]);
      S.allRooms       = rooms;
      S.allBookings    = bookings;
      S.availableRooms = getRoomsAvailable(rooms, bookings, S.checkIn, S.checkOut, S.numGuests);
      S.step           = 2;
    } catch (err) {
      console.error('[NestBook widget] loadAvailability failed:', err);
      S.error = T.errServer;
    }
    S.loading = false;
    render();
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
      const nights    = nightsBetween(S.checkIn, S.checkOut);
      const totalPrice = S.selectedRoom.price_per_night * nights;
      const booking = await apiFetch('/api/widget/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id:    Number(PROPERTY_ID),
          room_id:        S.selectedRoom.id,
          guest_id:       guest.id,
          check_in_date:  S.checkIn,
          check_out_date: S.checkOut,
          num_guests:     S.numGuests,
          status:         'confirmed',
          source:         'direct',
          notes:          S.guest.notes.trim() || null,
          total_price:    totalPrice,
        }),
      });
      S.bookingRef = booking.id;
      S.step       = 5;
    } catch (err) {
      console.error('[NestBook widget] confirmBooking failed:', err);
      S.error = T.errServer;
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
  color: #1a2e14;
}

/* Floating trigger button */
.nb-trigger {
  position: fixed;
  bottom: 24px; right: 24px;
  z-index: 999990;
  background: ${BRAND};
  color: #fff;
  border: none;
  border-radius: 50px;
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

/* Backdrop */
.nb-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(10,20,8,0.5);
  z-index: 999991;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: nb-fade-in 0.15s ease;
}
@keyframes nb-fade-in { from { opacity: 0; } to { opacity: 1; } }

/* Modal */
.nb-modal {
  background: #fff;
  border-radius: 14px;
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(10,20,8,0.25);
  animation: nb-slide-up 0.2s ease;
  overflow: hidden;
}
@keyframes nb-slide-up {
  from { opacity: 0; transform: translateY(12px) scale(0.97); }
  to   { opacity: 1; transform: none; }
}

/* Modal header */
.nb-hd {
  background: ${BRAND_DARK};
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}
.nb-hd-title {
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: -0.2px;
}
.nb-hd-brand {
  color: ${BRAND_LIGHT};
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-top: 2px;
}
.nb-close {
  background: rgba(255,255,255,0.12);
  border: none;
  color: #fff;
  border-radius: 7px;
  width: 30px; height: 30px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.12s;
}
.nb-close:hover { background: rgba(255,255,255,0.22); }

/* Step progress */
.nb-steps {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  justify-content: center;
}
.nb-step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  position: relative;
}
.nb-step-item + .nb-step-item::before {
  content: '';
  position: absolute;
  right: 100%;
  top: 10px;
  width: 8px;
  height: 1px;
  background: rgba(255,255,255,0.25);
}
.nb-step-dot {
  width: 22px; height: 22px;
  border-radius: 50%;
  background: rgba(255,255,255,0.2);
  color: rgba(255,255,255,0.6);
  font-size: 0.68rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.nb-step-label {
  font-size: 0.58rem;
  color: rgba(255,255,255,0.45);
  white-space: nowrap;
  font-weight: 500;
  letter-spacing: 0.2px;
}
.nb-step-item.nb-active .nb-step-dot {
  background: ${BRAND_LIGHT};
  color: ${BRAND_DARK};
}
.nb-step-item.nb-active .nb-step-label { color: rgba(255,255,255,0.85); }
.nb-step-item.nb-done .nb-step-dot {
  background: rgba(255,255,255,0.35);
  color: #fff;
}

/* Body */
.nb-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 24px 16px;
}

/* Footer */
.nb-ft {
  padding: 14px 24px;
  border-top: 1px solid #e4ede2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  background: #f9fbf8;
}

/* Buttons */
.nb-btn-main {
  background: ${BRAND};
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 22px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
  white-space: nowrap;
}
.nb-btn-main:hover    { background: ${BRAND_DARK}; }
.nb-btn-main:disabled { background: #9ec99a; cursor: not-allowed; }
.nb-btn-back {
  background: none;
  border: 1.5px solid #d1d5db;
  border-radius: 8px;
  padding: 9px 16px;
  font-size: 0.875rem;
  color: #557a4a;
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
  color: #557a4a;
  margin-bottom: 5px;
}
.nb-input, .nb-select, .nb-textarea {
  width: 100%;
  padding: 9px 11px;
  border: 1.5px solid #e4ede2;
  border-radius: 8px;
  font-size: 0.875rem;
  color: #1a2e14;
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

/* Step 1 date/guests */
.nb-date-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 14px;
}
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
  border: 1.5px solid #e4ede2;
  border-radius: 8px;
  overflow: hidden;
}
.nb-guests-btn {
  background: #f3f7f2;
  border: none;
  width: 36px; height: 38px;
  font-size: 1.1rem;
  cursor: pointer;
  color: #557a4a;
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
  color: #1a2e14;
  border-left: 1px solid #e4ede2;
  border-right: 1px solid #e4ede2;
  line-height: 38px;
}

/* Step 2 room cards */
.nb-room {
  border: 2px solid #e4ede2;
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 10px;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}
.nb-room:last-child { margin-bottom: 0; }
.nb-room:hover      { border-color: ${BRAND}; background: #f7fbf6; }
.nb-room.nb-selected {
  border-color: ${BRAND};
  background: ${BRAND_LIGHT};
}
.nb-room-hd {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 6px;
}
.nb-room-name  { font-weight: 700; font-size: 0.95rem; color: #1a2e14; }
.nb-room-type  { font-size: 0.72rem; color: #8aab7f; text-transform: capitalize; margin-top: 2px; }
.nb-room-price { font-size: 1rem; font-weight: 700; color: ${BRAND_DARK}; white-space: nowrap; }
.nb-room-price span { font-size: 0.72rem; font-weight: 400; color: #8aab7f; }
.nb-room-caps  { font-size: 0.75rem; color: #557a4a; margin-bottom: 8px; }
.nb-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.nb-tag {
  font-size: 0.65rem;
  padding: 2px 7px;
  border-radius: 4px;
  background: #f3f7f2;
  border: 1px solid #d9ead3;
  color: #557a4a;
}
.nb-room.nb-selected .nb-tag { background: rgba(255,255,255,0.5); }

/* Summary (step 4) */
.nb-summary {
  background: #f7fbf6;
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
  border-bottom: 1px solid #e4ede2;
  font-size: 0.875rem;
}
.nb-summary-row:last-child { border-bottom: none; }
.nb-summary-lbl { color: #557a4a; font-weight: 500; flex-shrink: 0; }
.nb-summary-val { color: #1a2e14; font-weight: 600; text-align: right; }
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
  color: #557a4a;
  font-size: 0.875rem;
}
.nb-no-rooms-icon { font-size: 2.5rem; margin-bottom: 10px; }

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
  color: #557a4a;
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
  color: #557a4a;
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
  color: #8aab7f;
  margin-top: 8px;
}

/* Section heading inside body */
.nb-section-title {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #8aab7f;
  margin-bottom: 12px;
}
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
  let root, backdrop, modal, body, footer;

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

  // ── Step 1: Dates ──────────────────────────────────────────────────────────
  function renderStep1() {
    const today    = todayISO();

    if (S.error) {
      const err = el('div', 'nb-error');
      err.appendChild(txt(S.error));
      body.appendChild(err);
    }

    // Date grid
    const dateGrid = el('div', 'nb-date-grid');

    const inWrap = el('div', 'nb-field');
    const inLabel = el('label', 'nb-label'); inLabel.appendChild(txt(T.checkIn));
    const inInput = el('input', 'nb-input');
    Object.assign(inInput, { type: 'date', min: today, value: S.checkIn });
    inInput.addEventListener('input', () => { S.checkIn = inInput.value; S.error = null; });
    inWrap.appendChild(inLabel); inWrap.appendChild(inInput);

    const outWrap = el('div', 'nb-field');
    const outLabel = el('label', 'nb-label'); outLabel.appendChild(txt(T.checkOut));
    const outInput = el('input', 'nb-input');
    Object.assign(outInput, { type: 'date', min: S.checkIn || today, value: S.checkOut });
    outInput.addEventListener('input', () => { S.checkOut = outInput.value; S.error = null; });
    outWrap.appendChild(outLabel); outWrap.appendChild(outInput);

    dateGrid.appendChild(inWrap);
    dateGrid.appendChild(outWrap);
    body.appendChild(dateGrid);

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
      if (S.numGuests < 10) { S.numGuests++; numEl.textContent = S.numGuests; }
    });
    ctrl.appendChild(minusBtn); ctrl.appendChild(numEl); ctrl.appendChild(plusBtn);
    guestRow.appendChild(gLabel); guestRow.appendChild(ctrl);
    body.appendChild(guestRow);

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

  // ── Step 2: Room selection ─────────────────────────────────────────────────
  function renderStep2() {
    if (S.availableRooms.length === 0) {
      const wrap = el('div', 'nb-no-rooms');
      const icon = el('div', 'nb-no-rooms-icon'); icon.appendChild(txt('🛏️'));
      const msg  = el('div', ''); msg.appendChild(txt(T.noRooms));
      wrap.appendChild(icon); wrap.appendChild(msg);
      body.appendChild(wrap);
    } else {
      const title = el('div', 'nb-section-title');
      title.appendChild(txt(S.availableRooms.length + ' ' +
        (S.availableRooms.length === 1 ? 'room' : 'rooms') + ' available'));
      body.appendChild(title);

      S.availableRooms.forEach((room) => {
        const card = el('div', 'nb-room' + (S.selectedRoom?.id === room.id ? ' nb-selected' : ''));

        // Header: name + price
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

        // Capacity
        const caps = el('div', 'nb-room-caps');
        caps.appendChild(txt(T.capacity + ' ' + room.capacity + ' ' + (room.capacity === 1 ? 'guest' : 'guests')));

        // Amenities
        const tags = el('div', 'nb-tags');
        const amenities = (room.amenities || '').split(',').map((s) => s.trim()).filter(Boolean);
        amenities.slice(0, 5).forEach((a) => {
          const tag = el('span', 'nb-tag'); tag.appendChild(txt(fmtAmenity(a)));
          tags.appendChild(tag);
        });

        card.appendChild(hd);
        card.appendChild(caps);
        if (amenities.length > 0) card.appendChild(tags);

        card.addEventListener('click', () => {
          S.selectedRoom = room;
          // Refresh selected state on all cards without full re-render
          body.querySelectorAll('.nb-room').forEach((c) => c.classList.remove('nb-selected'));
          card.classList.add('nb-selected');
          nextBtn.disabled = false;
        });

        body.appendChild(card);
      });
    }

    // Footer
    const backBtn = el('button', 'nb-btn-back');
    backBtn.appendChild(txt(T.back));
    backBtn.addEventListener('click', () => { S.step = 1; S.error = null; render(); });

    const nextBtn = el('button', 'nb-btn-main');
    nextBtn.appendChild(txt(T.step3Title + ' →'));
    nextBtn.disabled = !S.selectedRoom;
    nextBtn.addEventListener('click', () => {
      if (!S.selectedRoom) return;
      S.step = 3; render();
    });

    footer.appendChild(backBtn);
    footer.appendChild(nextBtn);
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
    backBtn.addEventListener('click', () => { S.step = 2; S.error = null; render(); });

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

    const nights    = nightsBetween(S.checkIn, S.checkOut);
    const totalPrice = S.selectedRoom.price_per_night * nights;

    // Summary card
    const summary = el('div', 'nb-summary');

    function row(label, value) {
      const r   = el('div', 'nb-summary-row');
      const lbl = el('div', 'nb-summary-lbl'); lbl.appendChild(txt(label));
      const val = el('div', 'nb-summary-val'); val.appendChild(txt(value));
      r.appendChild(lbl); r.appendChild(val);
      return r;
    }

    summary.appendChild(row(T.summaryRoom,   S.selectedRoom.name));
    summary.appendChild(row(T.summaryDates,  fmtDate(S.checkIn) + ' → ' + fmtDate(S.checkOut)));
    summary.appendChild(row(T.summaryNights, T.nights(nights)));
    summary.appendChild(row(T.summaryGuests, S.numGuests + ' ' + (S.numGuests === 1 ? 'guest' : 'guests')));
    summary.appendChild(row(T.step3Title,    S.guest.firstName + ' ' + S.guest.lastName));
    if (S.guest.email) summary.appendChild(row(T.email.replace(' *', ''), S.guest.email));
    if (S.guest.notes) summary.appendChild(row(T.notes, S.guest.notes));
    body.appendChild(summary);

    // Price callout
    const pc    = el('div', 'nb-price-callout');
    const pcL   = el('div', '');
    const pcBig = el('div', 'nb-price-big');
    pcBig.appendChild(txt(CUR_SYMBOL + totalPrice.toLocaleString()));
    const pcDesc = el('div', 'nb-price-desc');
    pcDesc.appendChild(txt(CUR_SYMBOL + S.selectedRoom.price_per_night + T.perNight + ' × ' + T.nights(nights)));
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
    confirmBtn.appendChild(txt(S.loading ? T.confirming : T.confirmBtn));
    confirmBtn.disabled = S.loading;
    confirmBtn.addEventListener('click', () => { confirmBooking(); });

    footer.appendChild(backBtn);
    footer.appendChild(confirmBtn);
  }

  // ── Step 5: Success ────────────────────────────────────────────────────────
  function renderSuccess() {
    const wrap = el('div', 'nb-success');

    const icon = el('div', 'nb-success-icon'); icon.appendChild(txt('✓'));
    const title = el('h2', 'nb-success-title'); title.appendChild(txt(T.successTitle));
    const msg   = el('p', 'nb-success-msg'); msg.appendChild(txt(T.successMsg));
    const ref   = el('div', 'nb-ref'); ref.appendChild(txt('#' + String(S.bookingRef).padStart(4, '0')));
    const sub   = el('p', 'nb-success-sub');
    sub.appendChild(txt(S.guest.email
      ? (LANG === 'fr' ? 'Un récapitulatif sera envoyé à ' : LANG === 'de' ? 'Eine Bestätigung wird gesendet an ' : LANG === 'es' ? 'Se enviará una confirmación a ' : 'A confirmation will be sent to ') + S.guest.email
      : ''));

    wrap.appendChild(icon); wrap.appendChild(title); wrap.appendChild(msg);
    wrap.appendChild(ref); if (S.guest.email) wrap.appendChild(sub);
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

  // ── Main render ────────────────────────────────────────────────────────────
  function render() {
    if (!body) return;

    // Clear body and footer
    body.innerHTML   = '';
    footer.innerHTML = '';

    // Update the header: step indicator (hidden on success) and title
    const hd = modal.querySelector('.nb-hd');
    // Clear old step indicator and title (keep close button)
    const oldSteps = hd.querySelector('.nb-steps');
    if (oldSteps) oldSteps.remove();
    const oldTitle = hd.querySelector('.nb-hd-inner');
    if (oldTitle) oldTitle.remove();

    if (S.step < 5) {
      const inner = el('div', 'nb-hd-inner');
      inner.style.flex = '1';
      const titleEl = el('div', 'nb-hd-title');
      titleEl.appendChild(txt(STEP_LABELS[S.step - 1]));
      const brand = el('div', 'nb-hd-brand'); brand.appendChild(txt('NestBook'));
      inner.appendChild(titleEl); inner.appendChild(brand);
      hd.insertBefore(inner, hd.querySelector('.nb-close'));
      hd.insertBefore(renderStepIndicator(), inner);
    } else {
      const inner = el('div', 'nb-hd-inner');
      inner.style.flex = '1';
      const titleEl = el('div', 'nb-hd-title');
      titleEl.appendChild(txt(T.successTitle));
      inner.appendChild(titleEl);
      hd.insertBefore(inner, hd.querySelector('.nb-close'));
    }

    if (S.loading) {
      renderLoading(S.step === 1 ? T.checking : T.confirming);
      return;
    }

    switch (S.step) {
      case 1: renderStep1(); break;
      case 2: renderStep2(); break;
      case 3: renderStep3(); break;
      case 4: renderStep4(); break;
      case 5: renderSuccess(); break;
    }
  }

  // ── Modal open / close ─────────────────────────────────────────────────────
  function openModal() {
    // Reset state for a fresh flow
    Object.assign(S, {
      step: 1, availableRooms: [], selectedRoom: null, allRooms: [], allBookings: [],
      guest: { firstName: '', lastName: '', email: '', phone: '', notes: '' },
      bookingRef: null, loading: false, error: null,
    });
    backdrop.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    render();
  }

  function closeModal() {
    backdrop.style.display = 'none';
    document.body.style.overflow = '';
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    if (document.getElementById('nb-styles')) return;   // already initialised

    injectStyles();

    // Root wrapper (outside normal document flow)
    root = el('div', ''); root.id = 'nb-root';

    // ── Floating trigger button ──────────────────────────────────────────────
    const trigger = el('button', 'nb-trigger');
    trigger.setAttribute('aria-label', T.bookNow);
    const icon = el('span', 'nb-trigger-icon'); icon.appendChild(txt('🏡'));
    trigger.appendChild(icon);
    trigger.appendChild(txt(' ' + T.bookNow));
    trigger.addEventListener('click', openModal);
    root.appendChild(trigger);

    // ── Backdrop ─────────────────────────────────────────────────────────────
    backdrop = el('div', 'nb-backdrop');
    backdrop.style.display = 'none';
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    // ── Modal shell ───────────────────────────────────────────────────────────
    modal = el('div', 'nb-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    // Header (contents filled by render())
    const hd     = el('div', 'nb-hd');
    const closeBtn = el('button', 'nb-close');
    closeBtn.setAttribute('aria-label', T.close);
    closeBtn.appendChild(txt(T.close));
    closeBtn.addEventListener('click', closeModal);
    hd.appendChild(closeBtn);   // close is always last; render() inserts steps before it

    body   = el('div', 'nb-body');
    footer = el('div', 'nb-ft');

    modal.appendChild(hd);
    modal.appendChild(body);
    modal.appendChild(footer);

    backdrop.appendChild(modal);
    root.appendChild(backdrop);
    document.body.appendChild(root);

    // Keyboard: Esc closes the modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && backdrop.style.display !== 'none') closeModal();
    });
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
