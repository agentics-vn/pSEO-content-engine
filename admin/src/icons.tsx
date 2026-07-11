/** Inline icon set (24px grid, stroke-based) matching the reference's weight. */

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const Svg = ({ children, size = 20 }: { children: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S}>{children}</svg>
);

export const IconHome = () => (
  <Svg><path d="M4 11.5 12 4l8 7.5" /><path d="M6.5 10.5V20h11v-9.5" /></Svg>
);
export const IconGauge = () => (
  <Svg><circle cx="12" cy="12" r="8.5" /><path d="M12 12l3.5-3.5" /><path d="M12 3.5v2M20.5 12h-2M3.5 12h2" /></Svg>
);
export const IconFlag = () => (
  <Svg><path d="M6 21V4" /><path d="M6 4h11l-2.5 4L17 12H6" /></Svg>
);
export const IconCalendar = () => (
  <Svg><rect x="4" y="5.5" width="16" height="15" rx="3" /><path d="M8 3.5v4M16 3.5v4M4 10.5h16" /></Svg>
);
export const IconDoc = () => (
  <Svg><path d="M6.5 3.5h7l4 4V20.5h-11z" /><path d="M13 3.5V8h4.5" /><path d="M9 13h6M9 16.5h6" /></Svg>
);
export const IconBell = () => (
  <Svg><path d="M12 4a5.5 5.5 0 0 1 5.5 5.5c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5A5.5 5.5 0 0 1 12 4Z" /><path d="M10.3 18.5a2 2 0 0 0 3.4 0" /></Svg>
);
export const IconGear = () => (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" />
  </Svg>
);
export const IconLogout = () => (
  <Svg><path d="M14 4.5H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7" /><path d="M11 12h9.5m0 0-3-3m3 3-3 3" /></Svg>
);
export const IconSearch = () => (
  <Svg size={18}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></Svg>
);
export const IconPlus = () => (
  <Svg size={16}><path d="M12 5v14M5 12h14" /></Svg>
);
export const IconPencil = () => (
  <Svg size={14}><path d="M14.5 5 19 9.5 8.5 20H4v-4.5z" /><path d="m12.5 7 4.5 4.5" /></Svg>
);
export const IconDots = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
  </svg>
);
export const IconChevron = () => (
  <Svg size={14}><path d="m6 9 6 6 6-6" /></Svg>
);
export const IconSpark = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2c.6 3.8 1.6 5.6 3 7 1.4 1.4 3.2 2.4 7 3-3.8.6-5.6 1.6-7 3-1.4 1.4-2.4 3.2-3 7-.6-3.8-1.6-5.6-3-7-1.4-1.4-3.2-2.4-7-3 3.8-.6 5.6-1.6 7-3 1.4-1.4 2.4-3.2 3-7Z" />
  </svg>
);
export const IconArchive = () => (
  <Svg size={18}><rect x="4" y="4" width="16" height="5" rx="1.5" /><path d="M5.5 9v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V9" /><path d="M10 13h4" /></Svg>
);
