/**
 * Bed-type icons for the Beds section (Phase 7a). No icon library exists in
 * this app (Tabler webfont classes are broken everywhere) — plain inline SVG
 * only, same feather-style outline convention as Icons.jsx (stroke="currentColor",
 * so they inherit text colour automatically).
 */

const icon = (paths) => (
  <svg
    width="18" height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {paths}
  </svg>
);

// Narrower than the double/queen/king silhouette below — same shape, less width.
const IconBedSingle = () => icon(<>
  <rect x="7" y="6" width="10" height="4" rx="1" />
  <rect x="7" y="10" width="10" height="7" rx="1.5" />
  <path d="M8 17v2M16 17v2" />
</>);

// Shared silhouette for double/queen/king — those three are distinguished by
// label, not shape, per the spec.
const IconBedWide = () => icon(<>
  <rect x="3" y="6" width="18" height="4" rx="1" />
  <rect x="3" y="10" width="18" height="7" rx="1.5" />
  <path d="M4 17v2M20 17v2" />
</>);

// Armrest/L-shape silhouette — the raised block on the left is the armrest.
const IconBedSofa = () => icon(<>
  <rect x="4" y="7" width="4" height="10" rx="1" />
  <rect x="7" y="9" width="13" height="4" rx="1" />
  <rect x="4" y="13" width="16" height="4" rx="1" />
  <path d="M3 17v2M21 17v2" />
</>);

// Two stacked rectangles.
const IconBedBunk = () => icon(<>
  <rect x="4" y="4" width="16" height="5" rx="1" />
  <rect x="4" y="13" width="16" height="5" rx="1" />
  <path d="M4 4v15M20 4v15" />
</>);

const BED_ICONS = {
  single:   IconBedSingle,
  double:   IconBedWide,
  queen:    IconBedWide,
  king:     IconBedWide,
  sofa_bed: IconBedSofa,
  bunk_bed: IconBedBunk,
};

export default function BedTypeIcon({ type }) {
  const Icon = BED_ICONS[type] ?? IconBedWide;
  return <Icon />;
}
