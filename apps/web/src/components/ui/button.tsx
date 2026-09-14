import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-lg text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm",
        outline:
          "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm",
        secondary:
          "bg-slate-100 text-slate-900 hover:bg-slate-200",
        ghost:
          "hover:bg-slate-100 hover:text-slate-900 text-slate-600",
        destructive:
          "bg-rose-600 text-white hover:bg-rose-700 shadow-sm focus:ring-rose-500",
        link: "text-indigo-600 underline-offset-4 hover:underline",
      },
      size: {
        default: "px-4 py-2.5",
        xs: "h-7 px-2.5 text-xs rounded-md",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef<HTMLButtonElement, ButtonPrimitive.Props & VariantProps<typeof buttonVariants>>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <ButtonPrimitive
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
