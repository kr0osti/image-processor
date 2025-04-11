import * as React from "react"

/**
 * Breakpoint in pixels below which a device is considered mobile
 * @constant {number}
 */
const MOBILE_BREAKPOINT = 768

/**
 * Custom hook to detect if the current viewport is mobile-sized
 *
 * This hook uses media queries to determine if the current viewport width
 * is below the defined mobile breakpoint. It updates when the window is resized.
 *
 * @returns {boolean} True if the viewport is mobile-sized, false otherwise
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  /**
   * Effect hook to set up media query listener and handle viewport changes
   */
  React.useEffect(() => {
    // Create media query list for mobile breakpoint
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)

    /**
     * Handler for media query changes
     * Updates state based on current window width
     */
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    // Add event listener for viewport changes
    mql.addEventListener("change", onChange)

    // Set initial value
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)

    // Clean up event listener on unmount
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
