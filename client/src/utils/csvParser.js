// Shared CSV parser — a character-scanner state machine that correctly handles
// quoted fields, escaped quotes and newlines inside quoted fields. Comma-delimited.
// Returns an array of string arrays (one per row).
//
// Extracted verbatim from the Outreach CRM importer so other CSV import flows
// (e.g. the Room Import Wizard) reuse one implementation instead of a private copy.
export function parseCsv(text) {
  const cleaned = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"' && cleaned[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if      (ch === '"')  { inQuotes = true; }
      else if (ch === ',')  { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else                  { field += ch; }
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || r[0]?.trim() !== '');
}
