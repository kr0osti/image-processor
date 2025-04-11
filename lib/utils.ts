import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combines multiple class names into a single string using clsx and tailwind-merge
 * This utility helps with conditional class name application while preventing conflicts
 *
 * @param {...ClassValue[]} inputs - Class names or conditional class objects to merge
 * @returns {string} A merged string of class names optimized for Tailwind CSS
 * @example
 * // Returns "btn btn-primary p-4" (with any Tailwind conflicts resolved)
 * cn("btn", { "btn-primary": true }, "p-4")
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
