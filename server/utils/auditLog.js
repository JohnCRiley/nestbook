/**
 * Fire-and-forget audit logger.
 * All errors are silently swallowed so a logging failure never breaks the main operation.
 */
export function logAction(db, {
  propertyId,
  userId,
  userName,
  userEmail,
  userRole,
  action,
  category,
  targetType,
  targetId,
  targetName,
  detail,
  beforeValue,
  afterValue,
  ipAddress,
} = {}) {
  try {
    db.prepare(`
      INSERT INTO audit_log
        (property_id, user_id, user_name, user_email, user_role,
         action, category, target_type, target_id, target_name,
         detail, before_value, after_value, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      propertyId ?? null,
      userId     ?? null,
      userName   ?? null,
      userEmail  ?? null,
      userRole   ?? null,
      action,
      category,
      targetType  ?? null,
      targetId    ?? null,
      targetName  ?? null,
      detail      ?? null,
      beforeValue != null ? JSON.stringify(beforeValue) : null,
      afterValue  != null ? JSON.stringify(afterValue)  : null,
      ipAddress   ?? null,
    );
  } catch { /* fire-and-forget */ }
}

/** Extracts the real client IP from a request object. */
export function getIp(req) {
  return (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.ip || null;
}
