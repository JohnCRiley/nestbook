/**
 * Calculate the deposit and balance amounts for a WP booking.
 * Returns { depositAmount, balanceAmount } — both may be 0 if deposit disabled.
 */
export function calculateDeposit(property, bookingTotal) {
  if (!property?.deposit_enabled || !bookingTotal) {
    return { depositAmount: 0, balanceAmount: bookingTotal ?? 0 };
  }

  const type = property.deposit_type ?? 'fixed';
  let depositAmount = 0;

  if (type === 'full') {
    depositAmount = bookingTotal;
  } else if (type === 'percentage') {
    const pct = Math.max(0, Math.min(100, property.deposit_percentage ?? 30));
    depositAmount = Math.round((bookingTotal * pct / 100) * 100) / 100;
  } else {
    // fixed
    depositAmount = Math.min(property.deposit_fixed_amount ?? 0, bookingTotal);
  }

  const balanceAmount = Math.round((bookingTotal - depositAmount) * 100) / 100;
  return { depositAmount, balanceAmount };
}

/**
 * Returns true if the deposit should be considered forfeited.
 * Forfeit applies when it's past check-in and the deposit was never paid.
 */
export function isDepositForfeited(property, checkInDate, depositPaid) {
  if (depositPaid) return false;
  if (!property?.deposit_enabled) return false;
  const today = new Date().toISOString().slice(0, 10);
  return today > checkInDate;
}

/**
 * Returns the ISO date by which the balance is due.
 * balance_due: 'checkin' → check-in date; 'days_before' → N days before check-in.
 */
export function getBalanceDueDate(property, checkInDate) {
  if (!checkInDate) return null;
  if (property?.deposit_balance_due === 'days_before') {
    const days = Math.max(0, property.deposit_balance_days ?? 7);
    const d = new Date(checkInDate);
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }
  return checkInDate;
}
