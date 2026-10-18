import { Icon, type IconName } from '../../shared/ui/icons';

export const ANNIVERSARY_ICON_CATALOG = [
  { key: 'heart', label: '爱心' },
  { key: 'star', label: '星星' },
  { key: 'sparkles', label: '闪光' },
  { key: 'cake', label: '蛋糕' },
  { key: 'gift', label: '礼物' },
  { key: 'ring', label: '戒指' },
  { key: 'home', label: '家' },
  { key: 'flower', label: '花' },
  { key: 'plane', label: '飞机' },
  { key: 'car', label: '汽车' },
  { key: 'camera', label: '相机' },
  { key: 'music', label: '音乐' },
  { key: 'graduation', label: '毕业' },
  { key: 'paw', label: '宠物' },
  { key: 'baby', label: '宝宝' },
  { key: 'calendar', label: '日期' },
] as const satisfies ReadonlyArray<{ key: IconName; label: string }>;

export type AnniversaryIconKey = typeof ANNIVERSARY_ICON_CATALOG[number]['key'];

export const DEFAULT_ANNIVERSARY_ICON: AnniversaryIconKey = 'heart';

const iconKeys = new Set<string>(ANNIVERSARY_ICON_CATALOG.map(({ key }) => key));

export function isAnniversaryIconKey(value: unknown): value is AnniversaryIconKey {
  return typeof value === 'string' && iconKeys.has(value);
}

export function normalizeAnniversaryIcon(value: unknown): AnniversaryIconKey {
  return isAnniversaryIconKey(value) ? value : DEFAULT_ANNIVERSARY_ICON;
}

export function AnniversaryIcon({ icon, className }: { icon: unknown; className?: string }) {
  const normalized = normalizeAnniversaryIcon(icon);
  const label = ANNIVERSARY_ICON_CATALOG.find(({ key }) => key === normalized)!.label;
  return <Icon name={normalized} className={`anniversary-symbol anniversary-symbol-${normalized}${className ? ` ${className}` : ''}`} role="img" aria-hidden={false} aria-label={label}/>;
}
