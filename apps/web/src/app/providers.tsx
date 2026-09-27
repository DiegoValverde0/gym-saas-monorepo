'use client'

import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query'
import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { ApiError } from '@/lib/api-client'

import { ThemeProvider } from 'next-themes'

export default function Providers({ children }: { children: React.ReactNode }) {
  const { toast } = useToast()
  
  const [queryClient] = useState(() => new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        const status = error instanceof ApiError ? error.status : undefined
        // Sin permiso para leer algo: la página ya avisa "Acceso Denegado"
        // (Protect) o simplemente no muestra esa parte. Antes salía además
        // "Error de conexión", que no lo era.
        if (status === 403) return
        toast({
          title: status === 0 ? 'Error de conexión' : 'No se pudo cargar',
          description: error.message,
          variant: 'destructive',
        })
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: false, // Don't retry automatically to avoid UI hanging
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      }
    },
  }))

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </ThemeProvider>
  )
}
