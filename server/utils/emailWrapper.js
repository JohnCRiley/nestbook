/**
 * Property-branded guest mailer wrapper.
 * Uses the property's own logo/name instead of NestBook branding.
 * Supports an optional CTA button and owner signature.
 */
export function wrapGuestMailerEmail(bodyHtml, {
  propertyName = '',
  logoAbsUrl   = null,
  ctaLabel     = null,
  ctaUrl       = null,
  ctaEnabled   = false,
  mailerSignature = null,
} = {}) {
  const raw = (bodyHtml ?? '').trim();
  const htmlContent = raw.startsWith('<')
    ? raw
    : raw
        .split(/\n{2,}/)
        .map(p => `<p style="margin:0 0 16px 0;line-height:1.7">${p.replace(/\n/g, '<br>')}</p>`)
        .join('\n');

  const initial = (propertyName || '?').charAt(0).toUpperCase();
  const headerImg = logoAbsUrl
    ? `<img src="${logoAbsUrl}" width="52" height="52" alt="${propertyName}"
           style="border-radius:8px;display:block;margin:0 auto 10px;object-fit:contain;">`
    : `<div style="width:52px;height:52px;background:#1a4710;border-radius:8px;
           display:inline-block;line-height:52px;text-align:center;
           font-size:24px;color:#fff;font-weight:bold;margin:0 auto 10px;">${initial}</div>`;

  const ctaHtml = ctaEnabled && ctaLabel && ctaUrl
    ? `<div style="text-align:center;margin:28px 0;">
         <a href="${ctaUrl}"
            style="background:#1a4710;color:#ffffff;padding:12px 28px;border-radius:6px;
                   text-decoration:none;font-weight:bold;font-size:15px;display:inline-block;">
           ${ctaLabel}
         </a>
       </div>`
    : '';

  const sigHtml = mailerSignature
    ? `<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;
           font-size:14px;color:#374151;line-height:1.7;">${
             mailerSignature.replace(/\n/g, '<br>')
           }</div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

  <!-- Header -->
  <tr><td style="padding:28px 32px 18px;text-align:center;border-bottom:1px solid #e5e7eb;">
    <div style="display:inline-block;text-align:center;">
      ${headerImg}
      <div style="font-size:18px;font-weight:bold;color:#111827;">${propertyName}</div>
    </div>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:32px;color:#1f2937;font-size:15px;line-height:1.6;">
    <div style="color:#1f2937;">${htmlContent}</div>
    ${ctaHtml}
    ${sigHtml}
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;line-height:1.6;">
      Sent via <a href="https://nestbook.io" style="color:#6b7280;text-decoration:none;">NestBook</a>
    </p>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}

/**
 * Shared NestBook branded email wrapper.
 * Turns a raw HTML fragment (from Quill or a raw-HTML textarea) into a full
 * table-based email document with the dark-green header, signature, and footer.
 *
 * Options:
 *   footerNote  – override the footer paragraph text
 *   unsubUrl    – if provided, appends an Unsubscribe link in the footer
 */
export function wrapEmailBody(bodyHtml, { footerNote, unsubUrl, body_bg = 'white' } = {}) {
  const raw = (bodyHtml ?? '').trim();

  // Convert plain text to HTML paragraphs; leave real HTML as-is
  const htmlContent = raw.startsWith('<')
    ? raw
    : raw
        .split(/\n{2,}/)
        .map(p => `<p style="margin:0 0 16px 0;line-height:1.7">${p.replace(/\n/g, '<br>')}</p>`)
        .join('\n');

  const footer = footerNote ??
    'You received this email because you manage a hospitality property and we thought NestBook might be useful to you.';

  const unsubLine = unsubUrl
    ? `<br><a href="${unsubUrl}" style="color:#5a7a52;text-decoration:underline;">Unsubscribe</a>`
    : '';

  const isGreen    = body_bg === 'green';
  const outerBg    = isGreen ? '#1a4710' : '#ffffff';
  const bodyBorder = isGreen ? 'border-top:1px solid #d9f0cc;' : '';
  const sigColor   = isGreen ? '#ffffff' : '#1a4710';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:${outerBg};border-radius:8px;overflow:hidden;">

  <!-- Header -->
  <tr><td style="background:#1a4710;padding:28px 32px;">
    <img src="https://nestbook.io/icon-192.png" width="36" height="36"
         style="border-radius:8px;vertical-align:middle;display:inline-block;">
    <span style="color:#ffffff;font-size:22px;font-weight:bold;margin-left:12px;vertical-align:middle;">NestBook</span>
    <div style="color:#a8d5a2;font-size:13px;margin-top:6px;">Management platform for independent holiday rentals</div>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:32px 32px 0px;${bodyBorder}color:#1a2e14;font-size:15px;line-height:1.6;">
    <div style="color:#1a2e14;">
      ${htmlContent}
    </div>

    <!-- Signature -->
    <div style="margin-top:32px;padding:24px;border-top:1px solid #d9f0cc;">
      <img src="https://nestbook.io/icon-192.png" width="28" height="28"
           style="border-radius:6px;vertical-align:middle;display:inline-block;">
      <strong style="color:${sigColor};margin-left:8px;vertical-align:middle;font-size:15px;">The NestBook Team</strong><br>
      <span style="color:#5a7a52;font-size:13px;line-height:1.8;">
        <a href="mailto:hello@nestbook.io" style="color:${sigColor};text-decoration:none;">hello@nestbook.io</a>
        &nbsp;&middot;&nbsp;
        <a href="https://nestbook.io" style="color:${sigColor};text-decoration:none;">nestbook.io</a>
      </span>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f0f7ed;padding:20px 32px;border-top:1px solid #d9f0cc;">
    <p style="margin:0;font-size:12px;color:#5a7a52;text-align:center;line-height:1.6;">
      ${footer}${unsubLine}
    </p>
    <p style="margin:12px 0 0;font-size:11px;color:#8ab885;text-align:center;">
      Sent via <a href="https://nestbook.io" style="color:#5a7a52;text-decoration:none;">NestBook</a> — management platform for independent holiday rentals
    </p>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}
