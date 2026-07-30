// Inline SVG icons, not the "ti ti-*" webfont classes — that font is never
// actually loaded anywhere in this app (no @tabler/icons-react or lucide
// dependency, no font <link>/@font-face in index.html or any stylesheet),
// so every `<i className="ti ...">` in Super Admin renders empty.
// Shared here because several admin pages reference the same icon names.

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

export function SendIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </Svg>
  );
}

export function AlertTriangleIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M10.24 3.96 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.76 3.96a2 2 0 0 0-3.52 0Z" />
      <path d="M12 9v4" />
      <path d="M12 16h.01" />
    </Svg>
  );
}

export function CheckIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M5 12l5 5l10-10" />
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

export function LockOpenIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <circle cx="12" cy="16" r="1" />
      <path d="M8 11v-5a4 4 0 0 1 8 0" />
    </Svg>
  );
}

export function MailIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6l9-6" />
    </Svg>
  );
}

export function PhoneIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5l1.5-2.5l5 2v4a2 2 0 0 1-2 2a16 16 0 0 1-15-15a2 2 0 0 1 2-2Z" />
    </Svg>
  );
}

export function PhoneOffIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5l1.5-2.5l5 2v4a2 2 0 0 1-2 2a16 16 0 0 1-15-15a2 2 0 0 1 2-2Z" />
      <path d="M3 3l18 18" />
    </Svg>
  );
}

export function MapPinIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <circle cx="12" cy="11" r="3" />
      <path d="M17.66 16.66 13.41 20.9a2 2 0 0 1-2.82 0l-4.25-4.24a8 8 0 1 1 11.32 0Z" />
    </Svg>
  );
}

export function MessageCircleIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M3 20l1.3-3.9a9 8 0 1 1 3.4 2.9L3 20Z" />
    </Svg>
  );
}

export function ChevronUpIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M6 15l6-6l6 6" />
    </Svg>
  );
}

export function ChevronDownIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M6 9l6 6l6-6" />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M9 6l6 6l-6 6" />
    </Svg>
  );
}

export function ThumbUpIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M7 11v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3Z" />
      <path d="M7 12l4.5-8a2 2 0 0 1 3.5 1.5V9h4a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.6 20H10a3 3 0 0 1-3-3" />
    </Svg>
  );
}

export function ShieldIcon({ size = 16, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M12 3l8 4v5c0 5-3.5 7.5-8 9c-4.5-1.5-8-4-8-9V7l8-4Z" />
    </Svg>
  );
}

export function SpeakerphoneIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M3 11c0-1.5 1.3-2.5 3-2.5h1l9-4.5v14.5l-9-4.5H6c-1.7 0-3-1-3-2.5Z" />
      <path d="M8 15.5v3a2 2 0 0 1-4 0v-3" />
    </Svg>
  );
}

export function StarIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21L12 17.77L5.82 21L7 14.14L2 9.27l6.91-1.01L12 2Z" />
    </Svg>
  );
}

export function XIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M18 6l-12 12" />
      <path d="M6 6l12 12" />
    </Svg>
  );
}

export function CircleCheckIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12l2 2l4-4" />
    </Svg>
  );
}

export function BanIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.7 5.7l12.6 12.6" />
    </Svg>
  );
}

export function ClockIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </Svg>
  );
}

export function EditIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M4 20h4l10.5-10.5a2.83 2.83 0 1 0-4-4L4 16v4Z" />
      <path d="M13.5 6.5l4 4" />
    </Svg>
  );
}

export function PlusIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  );
}

export function NotesIcon({ size = 14, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </Svg>
  );
}

export function FileTextIcon({ size = 15, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </Svg>
  );
}

export function ClipboardIcon({ size = 15, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
    </Svg>
  );
}

export function LayoutBoardIcon({ size = 15, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 10h16" />
      <path d="M10 10v10" />
    </Svg>
  );
}

export function FlagIcon({ size = 15, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M5 3v18" />
      <path d="M5 4h13l-2 4l2 4H5" />
    </Svg>
  );
}

export function IdBadgeIcon({ size = 15, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <circle cx="12" cy="10" r="2" />
      <path d="M9 16h6" />
    </Svg>
  );
}

export function CarIcon({ size = 15, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M5 17H3v-6l2-4h11l3 4h1a1 1 0 0 1 1 1v5h-2" />
      <circle cx="7.5" cy="17" r="2" />
      <circle cx="17.5" cy="17" r="2" />
      <path d="M9.5 17h6" />
    </Svg>
  );
}

export function TableIcon({ size = 15, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M10 4v16" />
    </Svg>
  );
}

export function BookIcon({ size = 15, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </Svg>
  );
}

export function ChecklistIcon({ size = 15, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <path d="M9.5 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4" />
      <path d="M9 8h4" />
      <path d="M9 12h2" />
      <path d="M14.5 17.5l1.5 1.5l3-3" />
    </Svg>
  );
}

export function CalculatorIcon({ size = 15, color = 'currentColor', style }) {
  return (
    <Svg size={size} color={color} style={style}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <rect x="8" y="6" width="8" height="3" />
      <path d="M8 13h.01" />
      <path d="M12 13h.01" />
      <path d="M16 13h.01" />
      <path d="M8 17h.01" />
      <path d="M12 17h.01" />
      <path d="M16 17h.01" />
    </Svg>
  );
}

export function BugIcon({ size = 15, color = 'currentColor', style }) {
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

// Lookup for icon names driven by data (e.g. `icon: 'ti-phone'` fields) —
// pass the name without the "ti-" prefix.
const ICONS = {
  send: SendIcon,
  'alert-triangle': AlertTriangleIcon,
  check: CheckIcon,
  lock: LockIcon,
  'lock-open': LockOpenIcon,
  mail: MailIcon,
  phone: PhoneIcon,
  'phone-off': PhoneOffIcon,
  'map-pin': MapPinIcon,
  'message-circle': MessageCircleIcon,
  'chevron-up': ChevronUpIcon,
  'chevron-down': ChevronDownIcon,
  'chevron-right': ChevronRightIcon,
  'thumb-up': ThumbUpIcon,
  shield: ShieldIcon,
  speakerphone: SpeakerphoneIcon,
  star: StarIcon,
  x: XIcon,
  'circle-check': CircleCheckIcon,
  ban: BanIcon,
  clock: ClockIcon,
  edit: EditIcon,
  plus: PlusIcon,
  notes: NotesIcon,
  'file-text': FileTextIcon,
  clipboard: ClipboardIcon,
  'layout-board': LayoutBoardIcon,
  flag: FlagIcon,
  'id-badge': IdBadgeIcon,
  car: CarIcon,
  table: TableIcon,
  book: BookIcon,
  checklist: ChecklistIcon,
  calculator: CalculatorIcon,
  bug: BugIcon,
};

// Renders an icon by name (e.g. "ti-phone" or "phone") — for data-driven
// icon fields where the name isn't known until render time.
export function Icon({ name, size, color, style }) {
  const key = (name || '').replace(/^ti-/, '');
  const Component = ICONS[key];
  if (!Component) return null;
  return <Component size={size} color={color} style={style} />;
}
