"use client";

import { useEffect, useState } from 'react';

// Devuelve `value` recién cuando deja de cambiar durante `delay` ms: así una
// búsqueda no pide al servidor una vez por cada tecla.
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}
