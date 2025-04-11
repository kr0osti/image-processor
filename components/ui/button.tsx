import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Props interface for the Button component
 * Extends both the standard HTML button element attributes and the variant props
 *
 * @interface ButtonProps
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * When true, the button will render as its child component but with the button styles
   * This is useful for rendering button-styled links or other interactive elements
   */
  asChild?: boolean
}

/**
 * Button component with enhanced accessibility and styling options
 *
 * This component provides a consistent button interface with various style variants
 * and accessibility features built-in.
 *
 * @component
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  /**
   * @param {object} props - Component props
   * @param {string} [props.className] - Additional CSS classes to apply
   * @param {string} [props.variant] - Visual style variant of the button
   * @param {string} [props.size] - Size variant of the button
   * @param {boolean} [props.asChild=false] - When true, renders children with button styles
   * @param {string} [props.type="button"] - HTML button type attribute
   * @param {React.Ref<HTMLButtonElement>} ref - Forwarded ref
   * @returns {JSX.Element} Rendered button element
   */
  ({ className, variant, size, asChild = false, type = "button", ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        type={type}
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
