/**
 * Shared NestBook branded email wrapper.
 * Turns a raw HTML fragment (from Quill or a raw-HTML textarea) into a full
 * table-based email document with the dark-green header, signature, and footer.
 *
 * Options:
 *   footerNote  – override the footer paragraph text
 *   unsubUrl    – if provided, appends an Unsubscribe link in the footer
 */
export function wrapEmailBody(bodyHtml, { footerNote, unsubUrl } = {}) {
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

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">

  <!-- Header -->
  <tr><td style="background:#1a4710;padding:28px 32px;">
    <img src="https://nestbook.io/icon-192.png" width="36" height="36"
         style="border-radius:8px;vertical-align:middle;display:inline-block;">
    <span style="color:#ffffff;font-size:22px;font-weight:bold;margin-left:12px;vertical-align:middle;">NestBook</span>
    <div style="color:#a8d5a2;font-size:13px;margin-top:6px;">Management platform for independent holiday rentals</div>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:32px 32px 0px;color:#1a2e14;font-size:15px;line-height:1.6;">
    <div style="color:#1a2e14;">
      ${htmlContent}
    </div>

    <!-- Signature -->
    <div style="margin-top:32px;padding:24px;border-top:1px solid #d9f0cc;">
      <img src="https://nestbook.io/icon-192.png" width="28" height="28"
           style="border-radius:6px;vertical-align:middle;display:inline-block;">
      <strong style="color:#1a4710;margin-left:8px;vertical-align:middle;font-size:15px;">The NestBook Team</strong><br>
      <span style="color:#5a7a52;font-size:13px;line-height:1.8;">
        <a href="mailto:hello@nestbook.io" style="color:#1a4710;text-decoration:none;">hello@nestbook.io</a>
        &nbsp;&middot;&nbsp;
        <a href="https://nestbook.io" style="color:#1a4710;text-decoration:none;">nestbook.io</a>
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
