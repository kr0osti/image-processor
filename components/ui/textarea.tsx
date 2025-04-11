import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Props interface for the Textarea component
 * Extends the standard HTML textarea element attributes
 *
 * @interface TextareaProps
 */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * Textarea component with enhanced accessibility features
 *
 * This component extends the standard HTML textarea element with additional
 * accessibility attributes and styling consistent with the design system.
 *
 * @component
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  /**
   * @param {object} props - Component props
   * @param {string} [props.className] - Additional CSS classes to apply
   * @param {string} [props.aria-describedby] - ID of element describing this textarea
   * @param {boolean|string} [props.aria-invalid] - Indicates if textarea has an invalid value
   * @param {React.Ref<HTMLTextAreaElement>} ref - Forwarded ref
   * @returns {JSX.Element} Rendered textarea element
   */
  ({ className, "aria-describedby": ariaDescribedby, "aria-invalid": ariaInvalid, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        aria-describedby={ariaDescribedby}
        aria-invalid={ariaInvalid === "true" || ariaInvalid === true || undefined}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
