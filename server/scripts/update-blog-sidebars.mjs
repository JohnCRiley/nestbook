/**
 * Regenerates the "All Posts" sidebar block in every blog post file from a
 * single canonical data source, so adding, removing, or reordering a post is
 * a one-file edit instead of a hand-edit across every existing post.
 *
 * Run from the server/ directory (or anywhere — paths are resolved relative
 * to this script's own location, not the cwd):
 *   node scripts/update-blog-sidebars.mjs
 *
 * Workflow for a new post going forward:
 *   1. Create the post's .html file as normal, with a
 *      <!-- BLOG_SIDEBAR_START --> ... <!-- BLOG_SIDEBAR_END --> marker pair
 *      wrapping a placeholder <aside class="article-sidebar"> block (copy
 *      one from any existing post — the exact contents between the markers
 *      don't matter, since this script fully replaces them).
 *   2. Add the post's { title, url, date } entry to posts-data.json, in the
 *      position it should appear (the array's order IS the display order —
 *      newest-first, matching the rest of the site).
 *   3. Run this script.
 *   4. Commit the new post file together with every changed sidebar and the
 *      updated posts-data.json, in one commit.
 *
 * What this script does:
 *   - Reads posts-data.json — an ordered array of { title, url, date }. This
 *     is the single source of truth for the sidebar; nothing else generates
 *     or reads it.
 *   - For every *.html file in this directory except index.html (which has
 *     its own separate, hand-written post grid and sidebar — not templated
 *     by this script), finds the block between the
 *     <!-- BLOG_SIDEBAR_START --> / <!-- BLOG_SIDEBAR_END --> marker
 *     comments and replaces it with a freshly generated <aside> block built
 *     from posts-data.json.
 *   - In the generated block, the entry whose `url` matches the file being
 *     processed renders as a non-link "is-current" div (matching the
 *     existing hand-written convention) instead of an <a> — a post's own
 *     sidebar links to every OTHER post, not itself.
 *   - A file with no marker comments is SKIPPED with a warning, not silently
 *     ignored and not crashed on. Add the markers to that file first (see
 *     step 1 above), then re-run.
 *
 * What this script deliberately does NOT do:
 *   - It does not touch server/public/blog/index.html.
 *   - It makes no network calls and touches no files outside this directory.
 *   - It is not wired into update.sh or any deploy step. Run it locally (or
 *     in a session) before committing, review the diff like any other code
 *     change, then commit and push and deploy normally — mirroring it into
 *     a build/sync step that mutates files on the live server directly is
 *     exactly the pattern that caused the nginx.conf sync-direction bug and
 *     the client/public vs server/public asset-sync bug, and this script
 *     must not become a third instance of it.
 *
 * posts-data.json is plain JSON (no comment syntax available there), so the
 * full workflow lives here instead — see the numbered steps above.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = path.resolve(__dirname, '../public/blog');
const DATA_FILE = path.join(BLOG_DIR, 'posts-data.json');

const START_MARKER = '<!-- BLOG_SIDEBAR_START -->';
const END_MARKER = '<!-- BLOG_SIDEBAR_END -->';

function loadPosts() {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  let posts;
  try {
    posts = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Could not parse ${DATA_FILE} as JSON: ${e.message}`);
  }
  if (!Array.isArray(posts) || posts.length === 0) {
    throw new Error(`${DATA_FILE} must contain a non-empty JSON array of posts.`);
  }
  for (const [i, p] of posts.entries()) {
    for (const field of ['title', 'url', 'date']) {
      if (!p || typeof p[field] !== 'string' || !p[field].trim()) {
        throw new Error(`posts-data.json entry #${i} is missing a valid "${field}": ${JSON.stringify(p)}`);
      }
    }
  }
  return posts;
}

// Builds the full <aside>...</aside> block for one specific post file.
// `currentUrl` is the /blog/xxx.html URL of the file being generated for —
// that entry renders as a non-link is-current div; every other entry is a
// normal <a> link, matching the existing hand-written convention exactly.
function buildSidebar(posts, currentUrl) {
  const items = posts
    .map((post) => {
      if (post.url === currentUrl) {
        return `        <div class="article-sidebar-item is-current" aria-current="page">
          <span class="article-sidebar-title">${post.title}</span>
          <span class="article-sidebar-date">${post.date}</span>
        </div>`;
      }
      return `        <a class="article-sidebar-item" href="${post.url}">
          <span class="article-sidebar-title">${post.title}</span>
          <span class="article-sidebar-date">${post.date}</span>
        </a>`;
    })
    .join('\n');

  return `      <aside class="article-sidebar" aria-label="All blog posts">
        <h3>All Posts</h3>
        <div class="article-sidebar-list">
${items}
        </div>
      </aside>`;
}

function main() {
  const posts = loadPosts();
  const knownUrls = new Set(posts.map((p) => p.url));

  const files = fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.html') && f !== 'index.html')
    .sort();

  let updatedCount = 0;
  let unchangedCount = 0;
  let skippedCount = 0;
  const notInData = [];

  for (const file of files) {
    const fp = path.join(BLOG_DIR, file);
    const content = fs.readFileSync(fp, 'utf8');

    const startIdx = content.indexOf(START_MARKER);
    const endIdx = content.indexOf(END_MARKER);

    if (startIdx === -1 || endIdx === -1) {
      console.warn(
        `⚠️  SKIPPED ${file} — missing ${startIdx === -1 ? START_MARKER : END_MARKER}. ` +
          `Add the marker comments around its sidebar block, then re-run.`
      );
      skippedCount++;
      continue;
    }
    if (endIdx < startIdx) {
      console.warn(`⚠️  SKIPPED ${file} — ${END_MARKER} appears before ${START_MARKER}. File may be malformed.`);
      skippedCount++;
      continue;
    }

    const currentUrl = `/blog/${file}`;
    if (!knownUrls.has(currentUrl)) {
      notInData.push(file);
    }

    const newBlock = `${START_MARKER}\n${buildSidebar(posts, currentUrl)}\n      ${END_MARKER}`;
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + END_MARKER.length);
    const newContent = before + newBlock + after;

    if (newContent === content) {
      unchangedCount++;
      continue;
    }

    fs.writeFileSync(fp, newContent, 'utf8');
    console.log(`✓ updated ${file}`);
    updatedCount++;
  }

  console.log(
    `\nDone. ${updatedCount} file(s) updated, ${unchangedCount} already up to date, ${skippedCount} skipped (missing markers).`
  );

  if (notInData.length) {
    console.log(
      `\nWarning: the following file(s) have sidebar markers but no matching entry in posts-data.json ` +
        `(their own sidebar was still regenerated, but no OTHER post links to them, and they never render ` +
        `as "is-current" anywhere). Add them to posts-data.json:`
    );
    notInData.forEach((f) => console.log(`  - ${f}`));
  }
}

main();
