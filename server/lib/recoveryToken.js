import crypto from 'crypto';

const SECRET = () => process.env.JWT_SECRET || 'nestbook-dev-secret-change-in-production';
const TTL_SECONDS = 2 * 60 * 60; // 2 hours

export function makeRecoveryToken(bookingId) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${bookingId}:${exp}`;
  const t = crypto.createHmac('sha256', SECRET()).update(payload).digest('hex').slice(0, 40);
  return { exp, t };
}

export function verifyRecoveryToken(bookingId, exp, t) {
  if (!bookingId || !exp || !t) return false;
  if (Date.now() / 1000 > Number(exp)) return false;
  const payload = `${bookingId}:${exp}`;
  const expected = crypto.createHmac('sha256', SECRET()).update(payload).digest('hex').slice(0, 40);
  try {
    return crypto.timingSafeEqual(Buffer.from(t, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export function recoveryUrl(base, bookingId) {
  const { exp, t } = makeRecoveryToken(bookingId);
  return `${base}/pay/recover?b=${bookingId}&exp=${exp}&t=${t}`;
}
