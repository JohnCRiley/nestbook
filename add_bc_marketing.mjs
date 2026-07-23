// add_bc_marketing.mjs — adds Bar & Charges marketing i18n keys to index.html and compare.html
import { readFileSync, writeFileSync } from 'fs';

function updateBlob(file, newKeys) {
  const html = readFileSync(file, 'utf8');
  const match = html.match(/atob\('([^']+)'\)/);
  if (!match) { console.log(`No blob found in ${file}`); return; }
  const data = JSON.parse(decodeURIComponent(escape(atob(match[1]))));
  for (const lang of ['en', 'fr', 'de', 'es', 'nl']) {
    Object.assign(data[lang], newKeys[lang]);
  }
  const newBlob = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  const newHtml = html.replace(match[1], newBlob);
  writeFileSync(file, newHtml);
  console.log(`Updated: ${file}`);
}

// Keys for index.html
updateBlob('server/public/index.html', {
  en: {
    'bc.title': 'Inn owners — want more than Pro, without paying for Multi?',
    'bc.body':  "You've got bedrooms and a bar tab. Bar & Charges adds room-charge tracking to your Pro plan for £6/month — no need to pay for multi-property tools you'll never use.",
    'bc.cta':   'See what\'s included →',
    'pricing.pro.addon': '+ Bar & Charges add-on available (£6/mo)',
  },
  fr: {
    'bc.title': 'Propriétaires d\'auberges — envie de plus que Pro, sans payer Multi ?',
    'bc.body':  'Vous avez des chambres et une note de bar. Bar & Charges ajoute le suivi des charges à votre offre Pro pour 6 €/mois — sans payer pour des outils multi-établissements dont vous n\'avez pas besoin.',
    'bc.cta':   'Voir ce qui est inclus →',
    'pricing.pro.addon': '+ Option Bar & Charges disponible (6 €/mois)',
  },
  de: {
    'bc.title': 'Gasthausbesitzer — mehr als Pro, ohne für Multi zu zahlen?',
    'bc.body':  'Sie haben Zimmer und eine Bar-Rechnung. Bar & Charges fügt Ihrem Pro-Plan die Verfolgung von Zimmergebühren hinzu — für 6 €/Monat, ohne für Multi-Objekt-Tools zu zahlen, die Sie nie brauchen werden.',
    'bc.cta':   'Ansehen, was enthalten ist →',
    'pricing.pro.addon': '+ Bar & Charges Add-on verfügbar (6 €/Monat)',
  },
  es: {
    'bc.title': 'Propietarios de posadas — ¿quieren más que Pro sin pagar Multi?',
    'bc.body':  'Tienen habitaciones y una cuenta de bar. Bar & Charges añade el seguimiento de cargos a su plan Pro por 6 €/mes, sin pagar por herramientas multipropiedad que nunca necesitarán.',
    'bc.cta':   'Ver qué incluye →',
    'pricing.pro.addon': '+ Complemento Bar & Charges disponible (6 €/mes)',
  },
  nl: {
    'bc.title': 'Herbergeigenaren — meer dan Pro, zonder voor Multi te betalen?',
    'bc.body':  "Je hebt kamers én een bar-rekening. Bar & Charges voegt het bijhouden van kosten toe aan je Pro-abonnement voor €6/maand — zonder te betalen voor multi-pand-tools die je nooit nodig hebt.",
    'bc.cta':   'Bekijk wat inbegrepen is →',
    'pricing.pro.addon': '+ Bar & Charges-add-on beschikbaar (€6/maand)',
  },
});

// Keys for compare.html
updateBlob('server/public/compare.html', {
  en: { 'compare.pro.addon': 'Bar & Charges add-on: +£6/mo' },
  fr: { 'compare.pro.addon': 'Option Bar & Charges : +6 €/mois' },
  de: { 'compare.pro.addon': 'Bar & Charges Add-on: +6 €/Monat' },
  es: { 'compare.pro.addon': 'Complemento Bar & Charges: +6 €/mes' },
  nl: { 'compare.pro.addon': 'Bar & Charges-add-on: +€6/maand' },
});

console.log('All done.');
