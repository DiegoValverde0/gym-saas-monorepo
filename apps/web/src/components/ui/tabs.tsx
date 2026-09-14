import * as React from "react"
import { cn } from "@/lib/utils"

const TabsContext = React.createContext<{
  value: string;
  onValueChange: (value: string) => void;
} | null>(null);

export interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'defaultValue'> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

export function Tabs({ defaultValue, value, onValueChange, children, className, ...props }: TabsProps) {
  const [tab, setTab] = React.useState(value || defaultValue || "")
  
  React.useEffect(() => {
    if (value !== undefined) setTab(value)
  }, [value])

  const handleTabChange = (val: string) => {
    setTab(val)
    if (onValueChange) onValueChange(val)
  }

  return (
    <TabsContext.Provider value={{ value: tab, onValueChange: handleTabChange }}>
      <div className={cn("w-full", className)} {...props}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div 
      className={cn("inline-flex p-1 bg-slate-200/80 rounded-xl border border-slate-200 shadow-inner", className)}
      role="tablist"
      {...props}
    >
      {children}
    </div>
  )
}

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  badge?: React.ReactNode;
}

export function TabsTrigger({ value, children, className, badge, ...props }: TabsTriggerProps) {
  const context = React.useContext(TabsContext)
  if (!context) return null
  
  const isActive = context.value === value
  
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => context.onValueChange(value)}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all",
        isActive 
          ? "bg-white text-indigo-700 shadow-xs border border-slate-200/60" 
          : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50",
        className
      )}
      {...props}
    >
      {children}
      {badge !== undefined && (
        <span className={cn(
          "ml-1 px-2 py-0.5 text-[10px] font-bold rounded-full",
          isActive ? "bg-indigo-100 text-indigo-800" : "bg-slate-300 text-slate-700"
        )}>
          {badge}
        </span>
      )}
    </button>
  )
}

export function TabsContent({ value, children, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const context = React.useContext(TabsContext)
  if (!context) return null
  
  if (context.value !== value) return null
  
  return (
    <div 
      role="tabpanel"
      className={cn("mt-5 focus:outline-none", className)}
      {...props}
    >
      {children}
    </div>
  )
}
