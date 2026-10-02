import './globals.css';
import Providers from './providers';
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });


import { Toaster } from "@/components/ui/toast";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // suppressHydrationWarning: next-themes pone la clase del tema en <html>
    // antes de que React cargue (si no, React avisa que no coincide).
    <html lang="es" className={cn("font-sans", inter.variable)} suppressHydrationWarning>
      <body>
        <Providers>
          {children}
        </Providers>
        <Toaster />
      </body>
    </html>
  )
}
