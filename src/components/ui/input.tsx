import * as React from "react"
import { cn } from "../../lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * 16px minimum font size is not a style choice — anything smaller makes iOS
 * Safari zoom the viewport when the field is focused, which on a POS means the
 * layout jumps mid-sale.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-lg border-2 border-ink-200 bg-card px-4 py-2",
          "text-base text-ink-900 placeholder:text-ink-400",
          "transition-[border-color,box-shadow] duration-150",
          "hover:border-ink-300",
          "focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12",
          "disabled:cursor-not-allowed disabled:bg-ink-50 disabled:opacity-60",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
