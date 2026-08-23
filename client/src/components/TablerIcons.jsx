// Inline SVG icons replacing the dead "ti ti-*" webfont classes used across
// the main app (Dashboard, Bookings, Settings, Billing, etc.) — that font is
// never actually loaded anywhere in this app (no @tabler/icons-react or
// lucide dependency, no font <link>/@font-face in index.html or any
// stylesheet), so every `<i className="ti ...">` outside Super Admin also
// rendered empty. Same pattern as client/src/admin/icons.jsx, which fixed
// the identical problem there — a shared Svg wrapper, size/color/style
// props, and a name-keyed lookup for data-driven icon fields.

function Svg({ size, color, style, children }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
    >
      {children}
    </svg>
  );
}

export function CheckIcon({ size = 16, color = 'currentColor', style }) {
  return <Svg size={size} color={color} style={style}><path d="M5 12l5 5l10-10" /></Svg>;
}

export function XIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M18 6l-12 12" />
      <path d="M6 6l12 12" />
    </Svg>
  );
}

export function CircleCheckIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12l2 2l4-4" />
    </Svg>
  );
}

export function AlertTriangleIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M10.24 3.96 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.76 3.96a2 2 0 0 0-3.52 0Z" />
      <path d="M12 9v4" />
      <path d="M12 16h.01" />
    </Svg>
  );
}

export function LockIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <circle cx="12" cy="16" r="1" />
      <path d="M8 11v-4a4 4 0 0 1 8 0v4" />
    </Svg>
  );
}

export function ClockIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </Svg>
  );
}

export function PlusIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  );
}

export function NotesIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </Svg>
  );
}

export function BugIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M9 9V8a3 3 0 0 1 6 0v1" />
      <path d="M8 9h8a6 6 0 0 1 1 3v3a5 5 0 0 1-10 0v-3a6 6 0 0 1 1-3Z" />
      <path d="M3 13h4" />
      <path d="M17 13h4" />
      <path d="M12 20v-7" />
      <path d="M4 19l3.35-2.5" />
      <path d="M20 19l-3.35-2.5" />
      <path d="M4 8l3.75 3" />
      <path d="M20 8l-3.75 3" />
    </Svg>
  );
}

export function MailIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6l9-6" />
    </Svg>
  );
}

export function StarIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21L12 17.77L5.82 21L7 14.14L2 9.27l6.91-1.01L12 2Z" />
    </Svg>
  );
}

export function ChevronUpIcon({ size = 16, color = 'currentColor', style }) {
  return <Svg size={size} color={color} style={style}><path d="M6 15l6-6l6 6" /></Svg>;
}

export function ChevronDownIcon({ size = 16, color = 'currentColor', style }) {
  return <Svg size={size} color={color} style={style}><path d="M6 9l6 6l6-6" /></Svg>;
}

export function HomeIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M3 12l9-9l9 9" />
      <path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10" />
      <path d="M9 21v-6h6v6" />
    </Svg>
  );
}

export function HomeCheckIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M3 12l9-9l9 9" />
      <path d="M5 10v10a1 1 0 0 0 1 1h4" />
      <path d="M19 10v3" />
      <path d="M15 19l2 2l4-4" />
    </Svg>
  );
}

export function BuildingIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M9 21v-4h6v4" />
      <path d="M8 7h.01" />
      <path d="M12 7h.01" />
      <path d="M16 7h.01" />
      <path d="M8 11h.01" />
      <path d="M12 11h.01" />
      <path d="M16 11h.01" />
    </Svg>
  );
}

export function BuildingBankIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M3 21h18" />
      <path d="M4 21v-10" />
      <path d="M20 21v-10" />
      <path d="M3 11l9-6l9 6" />
      <path d="M8 15v3" />
      <path d="M12 15v3" />
      <path d="M16 15v3" />
    </Svg>
  );
}

export function CameraIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M4 8a2 2 0 0 1 2-2h1l1.5-2h7l1.5 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="13" r="3.5" />
    </Svg>
  );
}

export function CameraPlusIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M4 8a2 2 0 0 1 2-2h1l1.5-2h7l1.5 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M12 11v4" />
      <path d="M10 13h4" />
    </Svg>
  );
}

export function BedIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6" />
      <path d="M3 18v2" />
      <path d="M21 18v2" />
      <path d="M3 14h18" />
      <path d="M7 14v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3" />
    </Svg>
  );
}

export function TrashIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M4 7h16" />
      <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
      <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Svg>
  );
}

export function CreditCardIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </Svg>
  );
}

export function CashIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9v.01" />
      <path d="M18 15v.01" />
    </Svg>
  );
}

export function WorldIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18" />
      <path d="M12 3a15 15 0 0 0 0 18" />
    </Svg>
  );
}

export function UsersIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M9 11a3 3 0 1 0 0-6a3 3 0 0 0 0 6Z" />
      <path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
      <path d="M17 11a3 3 0 1 0 0-6" />
      <path d="M22 20v-1a4.5 4.5 0 0 0-3-4.24" />
    </Svg>
  );
}

export function UserIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </Svg>
  );
}

export function TrendingUpIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M3 17l6-6l4 4l8-8" />
      <path d="M17 7h4v4" />
    </Svg>
  );
}

export function TagIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M4 12V6a2 2 0 0 1 2-2h6l9 9a2 2 0 0 1 0 2.8l-6.2 6.2a2 2 0 0 1-2.8 0l-9-9Z" />
      <circle cx="8.5" cy="8.5" r="1.25" />
    </Svg>
  );
}

export function SparklesIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M12 4l1.4 4.6L18 10l-4.6 1.4L12 16l-1.4-4.6L6 10l4.6-1.4Z" />
      <path d="M19 15l.6 2l2 1l-2 1l-.6 2l-.6-2l-2-1l2-1Z" />
    </Svg>
  );
}

export function RocketIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M5 17a2 2 0 0 0 2 2c1.5 0 2-1 2-2" />
      <path d="M12 3c3 0 6.5 3 6.5 8c0 3-1.5 5.5-3 7l-1 1h-5l-1-1c-1.5-1.5-3-4-3-7c0-5 3.5-8 6.5-8Z" />
      <circle cx="12" cy="9" r="2" />
      <path d="M8 15l-3 3" />
      <path d="M16 15l3 3" />
    </Svg>
  );
}

export function RefreshIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M4 12a8 8 0 0 1 14.5-4.5" />
      <path d="M20 4v5h-5" />
      <path d="M20 12a8 8 0 0 1-14.5 4.5" />
      <path d="M4 20v-5h5" />
    </Svg>
  );
}

export function ReceiptIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-3-2l-2 2l-2-2l-2 2l-2-2Z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
    </Svg>
  );
}

export function ReceiptOffIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-3-2l-2 2l-2-2l-2 2l-2-2Z" />
      <path d="M9 8h6" />
      <path d="M9 12h4" />
      <path d="M3 3l18 18" />
    </Svg>
  );
}

export function GlassFullIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M7 3h10l-1.2 15a2 2 0 0 1-2 1.8h-3.6a2 2 0 0 1-2-1.8L7 3Z" />
      <path d="M8 9h8" />
    </Svg>
  );
}

export function FileImportIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M3 12h8" />
      <path d="M8 9l3 3l-3 3" />
    </Svg>
  );
}

export function DownloadIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M12 3v12" />
      <path d="M7 10l5 5l5-5" />
      <path d="M5 21h14" />
    </Svg>
  );
}

export function DoorExitIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="4" y="3" width="10" height="18" rx="1" />
      <path d="M8 12h.01" />
      <path d="M17 8l4 4l-4 4" />
      <path d="M14 12h7" />
    </Svg>
  );
}

export function ClipboardListIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
    </Svg>
  );
}

export function CircleIcon({ size = 16, color = 'currentColor', style }) {
  return <Svg size={size} color={color} style={style}><circle cx="12" cy="12" r="9" /></Svg>;
}

export function ChartBarIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M4 20v-6" />
      <path d="M10 20V10" />
      <path d="M16 20V4" />
      <path d="M3 20h18" />
    </Svg>
  );
}

export function CalendarIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </Svg>
  );
}

export function CalendarCheckIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
      <path d="M9 16l2 2l4-4" />
    </Svg>
  );
}

export function CalendarMinusIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
      <path d="M9 17h6" />
    </Svg>
  );
}

export function ArchiveIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
      <path d="M10 13h4" />
    </Svg>
  );
}

export function BrushIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M9.5 14.5c-1.5 1.5-2.5 3-2.5 5c1.5 0 3.5-1 5-2.5" />
      <path d="M11 13l7-7a2.5 2.5 0 0 1 3.5 3.5l-7 7" />
    </Svg>
  );
}

export function LanguageIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M4 5h9" />
      <path d="M8 3v2c0 4-1.5 7-4 9" />
      <path d="M4 12c1.5 1.5 3.5 2.5 6 3" />
      <path d="M13 20l4-9l4 9" />
      <path d="M14.5 17h5" />
    </Svg>
  );
}

export function ExternalLinkIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M11 7h-5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-5" />
      <path d="M10 14l10-10" />
      <path d="M15 4h5v5" />
    </Svg>
  );
}

// Lookup for icon names driven by data (e.g. an emoji/name field mapped to
// an icon) — pass the name without the "ti-" prefix.
const ICONS = {
  check: CheckIcon,
  x: XIcon,
  'circle-check': CircleCheckIcon,
  'alert-triangle': AlertTriangleIcon,
  lock: LockIcon,
  clock: ClockIcon,
  plus: PlusIcon,
  notes: NotesIcon,
  bug: BugIcon,
  mail: MailIcon,
  star: StarIcon,
  'chevron-up': ChevronUpIcon,
  'chevron-down': ChevronDownIcon,
  home: HomeIcon,
  'home-check': HomeCheckIcon,
  building: BuildingIcon,
  'building-bank': BuildingBankIcon,
  camera: CameraIcon,
  'camera-plus': CameraPlusIcon,
  bed: BedIcon,
  trash: TrashIcon,
  'credit-card': CreditCardIcon,
  cash: CashIcon,
  world: WorldIcon,
  users: UsersIcon,
  user: UserIcon,
  'trending-up': TrendingUpIcon,
  tag: TagIcon,
  sparkles: SparklesIcon,
  rocket: RocketIcon,
  refresh: RefreshIcon,
  receipt: ReceiptIcon,
  'receipt-off': ReceiptOffIcon,
  'glass-full': GlassFullIcon,
  'file-import': FileImportIcon,
  download: DownloadIcon,
  'door-exit': DoorExitIcon,
  'clipboard-list': ClipboardListIcon,
  circle: CircleIcon,
  'chart-bar': ChartBarIcon,
  calendar: CalendarIcon,
  'calendar-check': CalendarCheckIcon,
  'calendar-minus': CalendarMinusIcon,
  archive: ArchiveIcon,
  brush: BrushIcon,
  language: LanguageIcon,
  'external-link': ExternalLinkIcon,
};

// Renders an icon by name (e.g. "ti-rocket" or "rocket") — for data-driven
// icon fields where the name isn't known until render time.
export function TiIcon({ name, size, color, style }) {
  const key = (name || '').replace(/^ti[ -]ti-/, '').replace(/^ti-/, '');
  const Component = ICONS[key];
  if (!Component) return null;
  return <Component size={size} color={color} style={style} />;
}
