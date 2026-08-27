import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = ['b', 'strong', 'em', 'i', 'ul', 'li', 'br', 'span', 'img'];

// Icon images inserted via IconPicker only ever point at our own pre-rendered
// PNGs — restrict `img[src]` to those two directories so this allowance can't
// be abused to pull in arbitrary external images.
const ALLOWED_IMG_SRC = [/^\/images\/email-icons\//, /^\/images\/guest-icons\//];

/**
 * Sanitises rich-text bodies (Specials Banner, Custom Section) before they are
 * written to the DB. Only formatting the Quill toolbar exposes (bold, italic,
 * bullet list, font-size) plus icon <img>s from our own icon libraries are
 * allowed through — no links, scripts, or other attrs.
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
      img: ['src', 'width', 'height', 'style', 'alt'],
    },
    allowedStyles: {
      span: {
        'font-size': [/^\d+(\.\d+)?(px|em|rem|%)$/],
      },
      img: {
        'vertical-align': [/^middle$/],
        display: [/^inline-block$/],
      },
    },
    allowedSchemesByTag: { img: [] }, // src is path-only (see filterTag below), never a scheme like http:/data:
    exclusiveFilter(frame) {
      // Belt-and-braces: drop any <img> whose src doesn't match our own icon
      // directories, even if something upstream mangled the allowedAttributes
      // check. sanitize-html's allowedAttributes doesn't validate src by value,
      // only by attribute name, so this is the actual enforcement point.
      if (frame.tag !== 'img') return false;
      const src = frame.attribs?.src || '';
      return !ALLOWED_IMG_SRC.some(re => re.test(src));
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
