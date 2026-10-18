import type { SVGProps } from 'react';

export type IconName = 'todo' | 'period' | 'anniversary' | 'settings' | 'arrow' | 'close' | 'spark' | 'sun' | 'heart' | 'plus' | 'inbox' | 'chevron' | 'check' | 'clock' | 'calendar' | 'tag' | 'filter' | 'history' | 'repeat' | 'bell' | 'note' | 'star' | 'sparkles' | 'cake' | 'gift' | 'ring' | 'home' | 'flower' | 'plane' | 'car' | 'camera' | 'music' | 'graduation' | 'paw' | 'baby';
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    todo: <><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 2.4 2.4L16 9"/></>,
    period: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h3"/></>,
    anniversary: <><path d="M12 21s-8-4.7-8-10.6A4.4 4.4 0 0 1 12 7.8a4.4 4.4 0 0 1 8 2.6C20 16.3 12 21 12 21Z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    arrow: <path d="m14 6-6 6 6 6"/>,
    close: <path d="M5 5 19 19M19 5 5 19"/>,
    spark: <><path d="m12 2 1.8 7.2L21 11l-7.2 1.8L12 20l-1.8-7.2L3 11l7.2-1.8L12 2Z"/><path d="m19 18 .5 1.5L21 20l-1.5.5L19 22l-.5-1.5L17 20l1.5-.5L19 18Z"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>,
    heart: <path d="M20.8 8.9c0 5.1-8.8 10.1-8.8 10.1S3.2 14 3.2 8.9A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.8 2.6Z"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    inbox: <><path d="M4 4h16l2 11v4H2v-4L4 4Z"/><path d="M2 14h5l2 3h6l2-3h5"/></>,
    chevron: <path d="m7 10 5 5 5-5"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18"/></>,
    tag: <><path d="m20 13-7 7-10-10V3h7l10 10Z"/><circle cx="7.5" cy="7.5" r=".8"/></>,
    filter: <><path d="M4 6h16M7 12h10m-7 6h4"/><circle cx="8" cy="6" r="1.5"/><circle cx="15" cy="12" r="1.5"/></>,
    history: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5m4-1v5l3 2"/></>,
    repeat: <><path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4"/></>,
    note: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8m-8 4h8"/></>,
    star: <path d="m12 2.8 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.4 6.3-.9L12 2.8Z"/>,
    sparkles: <><path d="m9 2 1.5 5.5L16 9l-5.5 1.5L9 16l-1.5-5.5L2 9l5.5-1.5L9 2Z"/><path d="m18 13 .9 3.1L22 17l-3.1.9L18 21l-.9-3.1L14 17l3.1-.9L18 13Z"/></>,
    cake: <><path d="M4 10h16v10H4zM3 14h18M8 10V7m4 3V6m4 4V7"/><path d="M7 4c0-1 1-2 1-2s1 1 1 2a1 1 0 0 1-2 0Zm4-1c0-1 1-2 1-2s1 1 1 2a1 1 0 0 1-2 0Zm4 1c0-1 1-2 1-2s1 1 1 2a1 1 0 0 1-2 0Z"/></>,
    gift: <><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M2 9h20V5H2v4Zm10-4v16M12 5H8.5A2.5 2.5 0 1 1 11 2.5L12 5Zm0 0h3.5A2.5 2.5 0 1 0 13 2.5L12 5Z"/></>,
    ring: <><circle cx="12" cy="14" r="7"/><path d="m9 5 3-3 3 3-3 3-3-3Z"/></>,
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/></>,
    flower: <><circle cx="12" cy="12" r="2"/><path d="M12 10c-3-1-4-3-3-5 2-1 4 0 5 3 1-3 3-4 5-3 1 2 0 4-3 5 3 1 4 3 3 5-2 1-4 0-5-3-1 3-3 4-5 3-1-2 0-4 3-5-3-1-4-3-3-5 2-1 4 0 5 3Z"/><path d="M12 14v8"/></>,
    plane: <path d="m22 2-7 20-4-9-9-4 20-7ZM11 13l4-4"/>,
    car: <><path d="m5 16-2-2 2-6h14l2 6-2 2H5Z"/><path d="M7 8l2-4h6l2 4M5 16v3m14-3v3M7 13h.01M17 13h.01"/></>,
    camera: <><rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 6 1.5-3h5L16 6"/><circle cx="12" cy="13" r="4"/></>,
    music: <><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></>,
    graduation: <><path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11v5c3 3 9 3 12 0v-5M22 9v6"/></>,
    paw: <><path d="M8.5 13.5c-3 1.4-4.5 4-3.2 6 1.4 2.1 4.1 1 6.7 1s5.3 1.1 6.7-1c1.3-2-0.2-4.6-3.2-6-2.3-1.1-4.7-1.1-7 0Z"/><ellipse cx="5" cy="9" rx="2" ry="3"/><ellipse cx="10" cy="6" rx="2" ry="3"/><ellipse cx="19" cy="9" rx="2" ry="3"/><ellipse cx="14" cy="6" rx="2" ry="3"/></>,
    baby: <><circle cx="12" cy="13" r="8"/><path d="M9 12h.01M15 12h.01M9 16c2 1.6 4 1.6 6 0M12 5c0-2 2-3 3-2"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
