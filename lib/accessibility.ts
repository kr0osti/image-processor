/**
 * Utility functions for accessibility
 */

/**
 * Converts an HSL color value to RGB.
 * @param h - Hue (0-360)
 * @param s - Saturation (0-100)
 * @param l - Lightness (0-100)
 * @returns RGB values as [r, g, b] where each value is 0-255
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  // Convert HSL percentages to fractions
  s /= 100;
  l /= 100;
  
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  
  let r = 0, g = 0, b = 0;
  
  if (0 <= h && h < 60) {
    [r, g, b] = [c, x, 0];
  } else if (60 <= h && h < 120) {
    [r, g, b] = [x, c, 0];
  } else if (120 <= h && h < 180) {
    [r, g, b] = [0, c, x];
  } else if (180 <= h && h < 240) {
    [r, g, b] = [0, x, c];
  } else if (240 <= h && h < 300) {
    [r, g, b] = [x, 0, c];
  } else if (300 <= h && h < 360) {
    [r, g, b] = [c, 0, x];
  }
  
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}

/**
 * Calculates the relative luminance of an RGB color
 * @param r - Red (0-255)
 * @param g - Green (0-255)
 * @param b - Blue (0-255)
 * @returns Relative luminance value (0-1)
 */
export function calculateLuminance(r: number, g: number, b: number): number {
  // Convert RGB to sRGB
  const sR = r / 255;
  const sG = g / 255;
  const sB = b / 255;
  
  // Convert sRGB to linear RGB
  const R = sR <= 0.03928 ? sR / 12.92 : Math.pow((sR + 0.055) / 1.055, 2.4);
  const G = sG <= 0.03928 ? sG / 12.92 : Math.pow((sG + 0.055) / 1.055, 2.4);
  const B = sB <= 0.03928 ? sB / 12.92 : Math.pow((sB + 0.055) / 1.055, 2.4);
  
  // Calculate luminance
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Calculates the contrast ratio between two colors
 * @param color1 - First color as [r, g, b] (0-255)
 * @param color2 - Second color as [r, g, b] (0-255)
 * @returns Contrast ratio (1-21)
 */
export function calculateContrastRatio(
  color1: [number, number, number],
  color2: [number, number, number]
): number {
  const luminance1 = calculateLuminance(...color1);
  const luminance2 = calculateLuminance(...color2);
  
  // Ensure the lighter color is first for the calculation
  const lighter = Math.max(luminance1, luminance2);
  const darker = Math.min(luminance1, luminance2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Checks if a contrast ratio meets WCAG AA standards
 * @param ratio - Contrast ratio
 * @param isLargeText - Whether the text is large (>=18pt or >=14pt bold)
 * @returns Whether the contrast meets WCAG AA standards
 */
export function meetsWCAGAA(ratio: number, isLargeText: boolean = false): boolean {
  return isLargeText ? ratio >= 3 : ratio >= 4.5;
}

/**
 * Checks if a contrast ratio meets WCAG AAA standards
 * @param ratio - Contrast ratio
 * @param isLargeText - Whether the text is large (>=18pt or >=14pt bold)
 * @returns Whether the contrast meets WCAG AAA standards
 */
export function meetsWCAGAAA(ratio: number, isLargeText: boolean = false): boolean {
  return isLargeText ? ratio >= 4.5 : ratio >= 7;
}

/**
 * Parses CSS variables from the format "var(--color)" to get the variable name
 * @param cssVar - CSS variable in the format "var(--color)"
 * @returns The CSS variable name (e.g., "--color")
 */
export function parseCssVariable(cssVar: string): string | null {
  const match = cssVar.match(/var\((--[^)]+)\)/);
  return match ? match[1] : null;
}

/**
 * Gets the computed style value of a CSS variable
 * @param element - DOM element to check
 * @param variableName - CSS variable name (e.g., "--color")
 * @returns The computed value of the CSS variable
 */
export function getCssVariableValue(element: HTMLElement, variableName: string): string {
  return getComputedStyle(element).getPropertyValue(variableName).trim();
}

/**
 * Checks if an element is keyboard focusable
 * @param element - DOM element to check
 * @returns Whether the element is keyboard focusable
 */
export function isKeyboardFocusable(element: HTMLElement): boolean {
  const tabIndex = element.getAttribute('tabindex');
  
  // Elements with tabindex=-1 are programmatically focusable but not keyboard focusable
  if (tabIndex === '-1') return false;
  
  // Elements with tabindex >= 0 are keyboard focusable
  if (tabIndex !== null && parseInt(tabIndex) >= 0) return true;
  
  // Check if the element is naturally focusable
  const tagName = element.tagName.toLowerCase();
  const type = (element as HTMLInputElement).type?.toLowerCase();
  
  return (
    tagName === 'a' && element.hasAttribute('href') ||
    tagName === 'button' && !element.hasAttribute('disabled') ||
    tagName === 'input' && type !== 'hidden' && !element.hasAttribute('disabled') ||
    tagName === 'select' && !element.hasAttribute('disabled') ||
    tagName === 'textarea' && !element.hasAttribute('disabled') ||
    tagName === 'area' && element.hasAttribute('href') ||
    element.hasAttribute('contenteditable')
  );
}
