import type { SVGProps } from 'react';

type IconName = 'todo' | 'period' | 'anniversary' | 'settings' | 'arrow' | 'close' | 'spark';
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    todo: <><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 2.4 2.4L16 9"/></>,
    period: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 5h3"/></>,
    anniversary: <><path d="M12 21s-8-4.7-8-10.6A4.4 4.4 0 0 1 12 7.8a4.4 4.4 0 0 1 8 2.6C20 16.3 12 21 12 21Z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    arrow: <path d="m14 6-6 6 6 6"/>,
    close: <path d="M5 5 19 19M19 5 5 19"/>,
    spark: <><path d="m12 2 1.8 7.2L21 11l-7.2 1.8L12 20l-1.8-7.2L3 11l7.2-1.8L12 2Z"/><path d="m19 18 .5 1.5L21 20l-1.5.5L19 22l-.5-1.5L17 20l1.5-.5L19 18Z"/></>
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
