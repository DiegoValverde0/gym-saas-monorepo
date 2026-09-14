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
    <html lang="es" className={cn("font-sans", inter.variable)}>
      <body>
        <Providers>
          {children}
        </Providers>
        <Toaster />
      </body>
    </html>
  )
}
