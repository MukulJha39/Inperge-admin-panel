import logoUrl from '../assets/logo.png';

interface BrandMarkProps {
  size?: number;
  className?: string;
}

/** The Inperge logo. Decorative: the brand name beside it is the accessible label. */
export function BrandMark({ size = 32, className }: BrandMarkProps) {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`brand-mark${className ? ` ${className}` : ''}`}
    />
  );
}
