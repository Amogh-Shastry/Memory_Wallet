/**
 * Memory Wallet — Direction 2 "The M" brand mark.
 *
 * Source of truth: brand/mark-primary.svg and brand/mark-16.svg.
 * These are fixed brand colours, not product UI tokens. The 16px optical
 * drawing is used at 16px and for compact chrome (badges, pills); the primary
 * gradient drawing is used at 24px and above.
 */
export const BRAND_BLUE = "#3B82F6";
export const BRAND_PURPLE = "#7C3AED";

/** Primary gradient M, 1024-unit artboard. */
export const MARK_PATH = `M176 870
    C112 870 72 829 72 765
    L72 300
    C72 247 98 206 142 176
    C172 155 204 162 234 185
    L454 355
    C485 379 539 379 570 355
    L790 185
    C820 162 852 155 882 176
    C926 206 952 247 952 300
    L952 765
    C952 829 912 870 848 870
    C784 870 744 829 744 765
    L744 399
    L612 420
    C554 455 470 455 412 420
    L280 399
    L280 765
    C280 829 240 870 176 870 Z`;

/** Primary keyhole, solid Electric Blue. */
export const KEYHOLE_PATH = `M512 510
    C484 510 462 532 462 560
    C462 584 480 604 506 608
    L484 840
    C482 858 496 870 512 870
    C528 870 542 858 540 840
    L518 608
    C544 604 562 584 562 560
    C562 532 540 510 512 510 Z`;

/** Optical 16px M, 16-unit artboard. */
export const MARK_16_PATH = `M2.4 13.2
    C1.6 13.2 1.1 12.7 1.1 11.9
    L1.1 5.3
    C1.1 4.9 1.3 4.5 1.7 4.2
    C2 4 2.3 4 2.6 4.25
    L6.6 7.3
    C7.35 7.85 8.65 7.85 9.4 7.3
    L13.4 4.25
    C13.7 4 14 4 14.3 4.2
    C14.7 4.5 14.9 4.9 14.9 5.3
    L14.9 11.9
    C14.9 12.7 14.4 13.2 13.6 13.2
    C12.8 13.2 12.3 12.7 12.3 11.9
    L12.3 6.9
    L9.35 9.2
    C8.5 9.85 7.5 9.85 6.65 9.2
    L3.7 6.9
    L3.7 11.9
    C3.7 12.7 3.2 13.2 2.4 13.2 Z`;

/** Optical 16px keyhole. */
export const KEYHOLE_16_PATH = `M8 10.3 C8.65 10.3 9.15 10.8 9.15 11.45 C9.15 11.92 8.85 12.3 8.4 12.42 L8.55 13.95 C8.62 14.35 8.4 14.7 8 14.7 C7.6 14.7 7.38 14.35 7.45 13.95 L7.6 12.42 C7.15 12.3 6.85 11.92 6.85 11.45 C6.85 10.8 7.35 10.3 8 10.3 Z`;

/**
 * Inline optical mark for Shadow DOM templates (permission card, pill).
 * Flat Electric Blue by design: it is always rendered at 16px or below.
 */
export function brandMarkSvg(size = 16): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false"><path fill="${BRAND_BLUE}" d="${MARK_16_PATH}"/><path fill="${BRAND_BLUE}" d="${KEYHOLE_16_PATH}"/></svg>`;
}
