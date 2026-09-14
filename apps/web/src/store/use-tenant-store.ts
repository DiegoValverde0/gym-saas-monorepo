import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TenantState {
  activeTenantId: string | null;
  setActiveTenantId: (id: string | null) => void;
}

export const useTenantStore = create<TenantState>()(
  persist(
    (set) => ({
      activeTenantId: null,
      setActiveTenantId: (id) => set({ activeTenantId: id }),
    }),
    {
      name: 'gym_tenant_storage',
    }
  )
);
