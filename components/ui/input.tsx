import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Input component with enhanced accessibility features
 *
 * This component extends the standard HTML input element with additional
 * accessibility attributes and styling consistent with the design system.
 *
 * @component
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  /**
   * @param {object} props - Component props
   * @param {string} [props.className] - Additional CSS classes to apply
   * @param {string} [props.type] - Input type attribute
   * @param {string} [props.aria-describedby] - ID of element describing this input
   * @param {boolean|string} [props.aria-invalid] - Indicates if input has an invalid value
   * @param {React.Ref<HTMLInputElement>} ref - Forwarded ref
   * @returns {JSX.Element} Rendered input element
   */
  ({ className, type, "aria-describedby": ariaDescribedby, "aria-invalid": ariaInvalid, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        aria-describedby={ariaDescribedby}
        aria-invalid={ariaInvalid === "true" || ariaInvalid === true || undefined}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
