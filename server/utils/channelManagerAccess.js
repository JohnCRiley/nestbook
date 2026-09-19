// Who may use Channel Manager: Multi gets it automatically (included in the
// plan); Pro needs the paid add-on (has_channel_manager_addon); Free never.
// Mirrored client-side in client/src/utils/currency.js (hasChannelManagerAccess).
export function hasChannelManagerAccess(plan, hasAddonFlag) {
  if (plan === 'multi') return true;
  return plan === 'pro' && !!hasAddonFlag;
}
