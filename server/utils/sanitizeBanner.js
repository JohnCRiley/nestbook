import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = ['b', 'strong', 'em', 'i', 'ul', 'li', 'br', 'span'];

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
    },
    allowedStyles: {
      span: {
        'font-size': [/^\d+(\.\d+)?(px|em|rem|%)$/],
      },
    },
    // Quill's toolbar only produces bullet lists, rendered as <ol><li data-list="bullet">
    // and styled as bullets via Quill's own CSS — which bookingPage.js never loads.
    // Convert to a genuine <ul><li> so it renders as bullets anywhere, no CSS required.
    transformTags: {
      ol: () => ({ tagName: 'ul', attribs: {} }),
      li: () => ({ tagName: 'li', attribs: {} }),
    },
    disallowedTagsMode: 'discard',
  });
}
