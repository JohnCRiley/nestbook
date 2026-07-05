// Returns a user-facing error message from a failed API response body.
// Uses the i18n t() function to show a translated message for known error codes.
export function apiError(body, t) {
  if (body?.code === 'EMAIL_NOT_VERIFIED') {
    return t('verify.blockedAction');
  }
  return body?.error ?? 'Something went wrong.';
}
