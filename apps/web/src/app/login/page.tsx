"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowLeft } from 'lucide-react';
import { apiPost } from '@/lib/api-client';
import { useTenantStore } from '@/store/use-tenant-store';

interface Tenant {
  organizacionId: string;
  nombre: string;
  sucursalNombre?: string;
  rolNombre?: string;
}

interface LoginResponse {
  requireTenantSelection?: boolean;
  tenants?: Tenant[];
  user?: unknown;
}

export default function LoginPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [availableTenants, setAvailableTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const router = useRouter();
  const setActiveTenantId = useTenantStore((state) => state.setActiveTenantId);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload: Record<string, string> = { correo, contrasena };
      if (step === 2 && selectedTenant) {
        payload.organizacionId = selectedTenant;
      }

      const response = await apiPost<LoginResponse>('/auth/login', payload);

      if (response.requireTenantSelection && response.tenants) {
        setAvailableTenants(response.tenants);
        if (response.tenants.length > 0) {
          setSelectedTenant(response.tenants[0].organizacionId);
        }
        setStep(2);
        setLoading(false);
        return;
      }

      // Si pasamos aquí, el login fue 100% exitoso. El backend ya dejó la
      // sesión en una cookie HttpOnly -- no hay nada que guardar acá.
      setActiveTenantId(step === 2 ? selectedTenant : null);
      router.push('/dashboard');
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || 'Credenciales inválidas o acceso denegado');
      } else {
        setError('Ocurrió un error inesperado');
      }
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep(1);
    setContrasena('');
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 relative overflow-hidden font-sans selection:bg-indigo-500/30">
      {/* Background gradients for aesthetics (Glassmorphism + Modern Dark Mode) */}
      <div className="absolute top-0 -left-4 w-96 h-96 bg-indigo-600 rounded-full mix-blend-screen filter blur-[128px] opacity-20 animate-pulse"></div>
      <div className="absolute bottom-0 -right-4 w-96 h-96 bg-purple-600 rounded-full mix-blend-screen filter blur-[128px] opacity-20 animate-pulse" style={{ animationDelay: '2s' }}></div>

      <div className="relative z-10 w-full max-w-md px-4">
        <Card className="bg-zinc-900/60 border-zinc-800/60 backdrop-blur-xl shadow-2xl text-zinc-100">
          <CardHeader className="space-y-2 text-center pb-8 relative">
            {step === 2 && (
              <button 
                onClick={handleBack}
                className="absolute left-6 top-6 text-zinc-400 hover:text-white transition-colors"
                type="button"
                aria-label="Volver"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="mx-auto bg-zinc-800/80 w-14 h-14 rounded-2xl flex items-center justify-center mb-4 border border-zinc-700/50 shadow-inner">
              <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight">Gym Manager</CardTitle>
            <CardDescription className="text-zinc-400">
              {step === 1 ? 'Ingresa tus credenciales para acceder al sistema' : 'Selecciona la sucursal/organización'}
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            {error && (
              <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm font-medium text-center animate-in fade-in zoom-in-95 duration-300">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              {step === 1 ? (
                <>
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
                </>
              ) : (
                <div className="space-y-4">
                  <Label className="text-zinc-300">Selecciona tu Organización</Label>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {availableTenants.map(tenant => (
                      <label 
                        key={tenant.organizacionId}
                        className={`flex flex-col p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                          selectedTenant === tenant.organizacionId 
                            ? 'bg-indigo-600/10 border-indigo-500 ring-1 ring-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.15)]' 
                            : 'bg-zinc-950/50 border-zinc-800 hover:bg-zinc-800/80 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center">
                          <input 
                            type="radio" 
                            name="tenant" 
                            value={tenant.organizacionId}
                            checked={selectedTenant === tenant.organizacionId}
                            onChange={(e) => setSelectedTenant(e.target.value)}
                            className="mr-3 w-4 h-4 text-indigo-500 bg-zinc-900 border-zinc-700 focus:ring-indigo-500 focus:ring-offset-zinc-900"
                          />
                          <div className="flex flex-col flex-1">
                            <span className="text-zinc-100 font-semibold text-base">{tenant.nombre}</span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-medium border border-zinc-700/50">
                                {tenant.rolNombre || 'Miembro'}
                              </span>
                              <span className="text-xs text-zinc-500 flex items-center">
                                <span className="w-1 h-1 rounded-full bg-zinc-600 mx-1.5 inline-block"></span>
                                {tenant.sucursalNombre || 'Sede Global'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all mt-4"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Autenticando...
                  </>
                ) : (
                  step === 1 ? "Continuar" : "Iniciar Sesión"
                )}
              </Button>
            </form>
          </CardContent>

          {step === 1 && (
            <CardFooter className="flex flex-col border-t border-zinc-800/50 mt-6 pt-6">
              <div className="w-full text-xs text-zinc-500 space-y-3">
                <p className="font-semibold uppercase tracking-wider text-center text-zinc-400">Cuentas de Demostración</p>
                <div className="flex justify-between items-center p-2.5 rounded-md bg-zinc-950/50 border border-zinc-800/50">
                  <span className="text-indigo-400 font-medium">Gym Titan</span>
                  <code className="text-zinc-300">admin@gymmanager.com / admin123</code>
                </div>
              </div>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
