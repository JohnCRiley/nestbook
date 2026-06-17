const IP_CATEGORIES = [
  { name: 'Bar & drinks',     tax_rate: 20 },
  { name: 'Restaurant',       tax_rate: 20 },
  { name: 'Room service',     tax_rate: 20 },
  { name: 'Spa & treatments', tax_rate: 20 },
  { name: 'Laundry',          tax_rate: 20 },
  { name: 'Parking',          tax_rate: 20 },
  { name: 'Other',            tax_rate: 20 },
];

const WP_CATEGORIES = [
  { name: 'Equipment rental', tax_rate: 20 },
  { name: 'Activities',       tax_rate: 20 },
  { name: 'Firewood & logs',  tax_rate: 20 },
  { name: 'Linen & towels',   tax_rate: 20 },
  { name: 'Welcome hamper',   tax_rate: 20 },
  { name: 'Bike hire',        tax_rate: 20 },
  { name: 'Other',            tax_rate: 20 },
];

export function seedCategories(db, propertyId, rentalType) {
  const categories = rentalType === 'whole_property' ? WP_CATEGORIES : IP_CATEGORIES;
  db.prepare('DELETE FROM service_categories WHERE property_id = ?').run(propertyId);
  const insert = db.prepare(
    `INSERT INTO service_categories (property_id, name, tax_rate) VALUES (?, ?, ?)`
  );
  for (const cat of categories) {
    insert.run(propertyId, cat.name, cat.tax_rate);
  }
  console.log(`[categories] Seeded ${rentalType === 'whole_property' ? 'WP' : 'IP'} categories for property ${propertyId}`);
}
