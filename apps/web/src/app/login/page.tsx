"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
      const res = await fetch('http://localhost:3001/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ correo, contrasena }),
      });

      if (!res.ok) {
        throw new Error('Credenciales inválidas o acceso denegado');
      }

      const data = await res.json();
      localStorage.setItem('gym_token', data.access_token);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 bg-gradient-to-br from-indigo-900 via-gray-900 to-black relative overflow-hidden text-white font-sans">
      {/* Elementos decorativos (Glassmorphism) */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-1/2 w-96 h-96 bg-pink-600 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

      <div className="max-w-md w-full relative z-10 backdrop-blur-xl bg-white/10 p-10 rounded-3xl shadow-2xl border border-white/20">
        <div className="text-center mb-10">
          <h2 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
            Gym Manager
          </h2>
          <p className="text-gray-300 mt-3 text-sm font-light tracking-wide">
            Ingresa al portal de tu organización
          </p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-4 rounded-xl mb-6 text-sm text-center font-medium backdrop-blur-md transition-all">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-300">Correo Electrónico</label>
            <input
              type="email"
              required
              className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-xl shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder-gray-500 text-white"
              placeholder="ejemplo@gymtitan.com"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-300">Contraseña</label>
            <input
              type="password"
              required
              className="w-full px-4 py-3 bg-gray-800/50 border border-gray-600 rounded-xl shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all placeholder-gray-500 text-white"
              placeholder="••••••••"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : "Autenticar"}
          </button>
        </form>

        <div className="mt-8 border-t border-gray-700/50 pt-6">
          <div className="bg-black/20 p-4 rounded-xl border border-white/5">
            <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">Cuentas de Demostración</p>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex justify-between items-center bg-white/5 p-2 rounded">
                <span><strong className="text-indigo-400">Gym Titan</strong></span>
                <code className="text-xs">admin@gymtitan.com / hashed_password_123</code>
              </div>
              <div className="flex justify-between items-center bg-white/5 p-2 rounded">
                <span><strong className="text-cyan-400">CrossFit Alpha</strong></span>
                <code className="text-xs">coach@cfalpha.com / hashed_password_456</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
