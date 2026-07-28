import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = ['b', 'strong', 'em', 'i', 'ul', 'ol', 'li', 'br', 'span'];

/**
 * Sanitises the specials banner rich-text body before it is written to the DB.
 * Only formatting the Quill toolbar exposes (bold, italic, bullet list,
 * font-size) is allowed through — no links, scripts, or other attrs.
 */
export function sanitizeBanner(html) {
  if (!html) return html;
  // Quill wraps each line in its own <p>. <p> isn't in ALLOWED_TAGS, so without
  // this the tag is dropped but adjacent lines run together with no separator —
  // turn line boundaries into <br> first so paragraph breaks survive sanitising.
  const withLineBreaks = html.replace(/<\/p>\s*<p[^>]*>/gi, '<br>');
  return sanitizeHtml(withLineBreaks, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      span: ['style'],
      li: ['data-list'],
    },
    allowedStyles: {
      span: {
        'font-size': [/^\d+(\.\d+)?(px|em|rem|%)$/],
      },
    },
    // Quill's toolbar only ever produces bullet lists (<ol><li data-list="bullet">,
    // styled as bullets via CSS) — force the attribute so it can't be spoofed
    // into rendering as a numbered list, regardless of what was submitted.
    transformTags: {
      li: () => ({ tagName: 'li', attribs: { 'data-list': 'bullet' } }),
    },
    disallowedTagsMode: 'discard',
  });
}
