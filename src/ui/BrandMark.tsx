import { useId } from "react";
import { BRAND_BLUE, BRAND_PURPLE, KEYHOLE_PATH, MARK_PATH } from "./brand";

interface BrandMarkProps {
  size?: number;
  className?: string;
}

/**
 * Primary gradient M for extension pages. The artwork includes its own clear
 * space; size is the square box, so the visible mark is slightly smaller.
 * Use 24px or larger (the 16px optical mark is for compact chrome).
 */
export function BrandMark({ size = 24, className }: BrandMarkProps) {
  const gradientId = `mw-brand-${useId().replace(/:/g, "")}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={BRAND_BLUE} />
          <stop offset="100%" stopColor={BRAND_PURPLE} />
        </linearGradient>
      </defs>
      <path fill={`url(#${gradientId})`} d={MARK_PATH} />
      <path fill={BRAND_BLUE} d={KEYHOLE_PATH} />
    </svg>
  );
}
