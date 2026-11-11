import React from 'react';

/**
 * The PixelFlow mark: three pixels, one per colour channel, stepping forward and
 * overlapping like additive light, on a dark tile. It is the same in every theme.
 *
 * Decorative by default (the visible "PixelFlow" text names the link); pass
 * `title` where the mark appears on its own.
 */
export const BRAND = {
  tile: '#0D0E11',
  red: '#FF5468',
  green: '#2BD483',
  blue: '#5C8DFF',
} as const;

interface Props {
  size?: number;
  className?: string;
  title?: string;
}

const BrandMark: React.FC<Props> = ({ size = 32, className, title }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    className={className}
    role={title ? 'img' : undefined}
    aria-hidden={title ? undefined : true}
    aria-label={title}
    focusable="false"
    style={{ isolation: 'isolate', flexShrink: 0 }}
  >
    <rect width="32" height="32" rx="7.5" fill={BRAND.tile} />
    <rect x="6" y="6" width="12" height="12" rx="2.75" fill={BRAND.red} />
    <rect x="10" y="10" width="12" height="12" rx="2.75" fill={BRAND.green} style={{ mixBlendMode: 'screen' }} />
    <rect x="14" y="14" width="12" height="12" rx="2.75" fill={BRAND.blue} style={{ mixBlendMode: 'screen' }} />
  </svg>
);

export default BrandMark;
