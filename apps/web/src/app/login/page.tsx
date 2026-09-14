"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { apiPost } from '@/lib/api-client';

export default function LoginPage() {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiPost<{ access_token: string }>('/auth/login', { correo, contrasena });
      localStorage.setItem('gym_token', data.access_token);
      // Cookie no sensible (no lleva el token) solo para que middleware.ts
      // pueda redirigir a /login sin flash de contenido protegido; la
      // autorización real siempre se valida contra el backend con el Bearer.
      document.cookie = 'has_session=1; path=/';

      // Use router.push to navigate client-side (no reload)
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Credenciales inválidas o acceso denegado');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 relative overflow-hidden font-sans selection:bg-indigo-500/30">
      {/* Background gradients for aesthetics (Glassmorphism + Modern Dark Mode) */}
      <div className="absolute top-0 -left-4 w-96 h-96 bg-indigo-600 rounded-full mix-blend-screen filter blur-[128px] opacity-20 animate-pulse"></div>
      <div className="absolute bottom-0 -right-4 w-96 h-96 bg-purple-600 rounded-full mix-blend-screen filter blur-[128px] opacity-20 animate-pulse" style={{ animationDelay: '2s' }}></div>

      <div className="relative z-10 w-full max-w-md px-4">
        <Card className="bg-zinc-900/60 border-zinc-800/60 backdrop-blur-xl shadow-2xl text-zinc-100">
          <CardHeader className="space-y-2 text-center pb-8">
            <div className="mx-auto bg-zinc-800/80 w-14 h-14 rounded-2xl flex items-center justify-center mb-4 border border-zinc-700/50 shadow-inner">
              <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight">Gym Manager</CardTitle>
            <CardDescription className="text-zinc-400">
              Ingresa tus credenciales para acceder al sistema
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            {error && (
              <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm font-medium text-center animate-in fade-in zoom-in-95 duration-300">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-300">Correo Electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@gymtitan.com"
                  required
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  className="bg-zinc-950/50 border-zinc-800 focus-visible:ring-indigo-500 focus-visible:ring-offset-zinc-950 text-zinc-100 placeholder:text-zinc-600 transition-all h-11"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-zinc-300">Contraseña</Label>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  className="bg-zinc-950/50 border-zinc-800 focus-visible:ring-indigo-500 focus-visible:ring-offset-zinc-950 text-zinc-100 placeholder:text-zinc-600 transition-all h-11"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Autenticando...
                  </>
                ) : (
                  "Iniciar Sesión"
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col border-t border-zinc-800/50 mt-6 pt-6">
            <div className="w-full text-xs text-zinc-500 space-y-3">
              <p className="font-semibold uppercase tracking-wider text-center text-zinc-400">Cuentas de Demostración</p>
              <div className="flex justify-between items-center p-2.5 rounded-md bg-zinc-950/50 border border-zinc-800/50">
                <span className="text-indigo-400 font-medium">Gym Titan</span>
                <code className="text-zinc-300">admin@gymmanager.com / admin123</code>
              </div>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
