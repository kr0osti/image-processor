"use client"

import React from "react"
import { cn } from "@/lib/utils"

/**
 * Props for the SkipLink component
 * @interface SkipLinkProps
 */
interface SkipLinkProps {
  /**
   * Optional CSS class name for styling the skip link
   */
  className?: string
  /**
   * ID of the main content element to skip to
   * @default "main-content"
   */
  contentId?: string
}

/**
 * SkipLink component - Allows keyboard users to skip navigation and go directly to main content
 * This is an important accessibility feature for keyboard users
 *
 * @param {SkipLinkProps} props - The component props
 * @param {string} [props.className] - Optional CSS class name for styling
 * @param {string} [props.contentId="main-content"] - ID of the main content element to skip to
 * @returns {JSX.Element} The rendered SkipLink component
 */
export function SkipLink({
  className,
  contentId = "main-content"
}: SkipLinkProps) {
  return (
    <a
      href={`#${contentId}`}
      className={cn(
        "sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        className
      )}
    >
      Skip to main content
    </a>
  )
}
