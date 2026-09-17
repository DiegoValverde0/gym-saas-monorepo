'use client'

import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query'
import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'

import { ThemeProvider } from 'next-themes'

export default function Providers({ children }: { children: React.ReactNode }) {
  const { toast } = useToast()
  
  const [queryClient] = useState(() => new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        toast({
          title: 'Error de conexión',
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
