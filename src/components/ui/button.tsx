import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

/**
 * Sizes are deliberately larger than a desktop default. This is operated on a
 * tablet, often one-handed, sometimes with wet hands — 44px is the accessibility
 * floor and the wrong target for a forecourt, so the default is 48px and the
 * primary POS actions use `lg`.
 */
const buttonVariants = cva(
  [
    "pressable inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-semibold rounded-lg select-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "disabled:pointer-events-none disabled:opacity-45",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-brand-700 text-white shadow-sm hover:bg-brand-800 active:bg-brand-900",
        primary:
          "bg-brand-800 text-white shadow-brand hover:bg-brand-900 active:bg-brand-950",
        accent:
          "bg-accent-300 text-brand-950 shadow-sm hover:bg-accent-400 active:bg-accent-500",
        destructive:
          "bg-destructive text-white shadow-sm hover:bg-red-700 active:bg-red-800",
        outline:
          "border-2 border-ink-200 bg-card text-ink-800 hover:border-brand-300 hover:bg-brand-50 active:bg-brand-100",
        secondary:
          "bg-brand-50 text-brand-900 border border-brand-100 hover:bg-brand-100 active:bg-brand-200",
        ghost:
          "text-ink-600 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200",
        link:
          "text-brand-700 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3 text-sm rounded-md",
        default: "h-12 px-5 text-[0.9375rem]",
        lg: "h-14 px-8 text-base",
        xl: "h-16 px-8 text-lg rounded-xl",
        icon: "h-12 w-12",
        "icon-sm": "h-9 w-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? "span" : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref as any}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
