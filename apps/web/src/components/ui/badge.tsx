import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 uppercase tracking-wider",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-slate-100 text-slate-700 hover:bg-slate-200",
        primary:
          "border-indigo-200 bg-indigo-100 text-indigo-800 hover:bg-indigo-200/80",
        success:
          "border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-200/80",
        warning:
          "border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-200/80",
        destructive:
          "border-rose-200 bg-rose-100 text-rose-800 hover:bg-rose-200/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
