"use client";

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantStore } from '@/store/use-tenant-store';
import { useAuth } from '@/hooks/use-auth';
import { apiGet, apiPost, apiPatch, apiPut, apiDelete, unwrapList } from '@/lib/api-client';
import { useForm } from 'react-hook-form';
import { useSoftDelete } from '@/hooks/use-soft-delete';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { TenantRequiredButton } from '@/components/ui/tenant-required-button';
import { GlobalFormModal } from '@/components/ui/global-form-modal';
import { GlobalConfirmDialog } from '@/components/ui/global-confirm-dialog';
import { Protect } from '@/components/ui/protect';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Package, Plus, Edit, Trash2, Search, Warehouse } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const productoSchema = z.object({
  nombre: z.string({ message: 'El nombre es obligatorio' }).min(2, 'Mínimo 2 caracteres'),
  sku: z.string().optional(),
  descripcion: z.string().optional(),
  precioVenta: z.coerce.number().min(0, 'El precio no puede ser negativo'),
  estado: z.string().default('ACTIVO'),
});
type ProductoFormValues = z.infer<typeof productoSchema>;

const inventarioSchema = z.object({
  productoId: z.string().min(1, 'Selecciona un producto'),
  sucursalId: z.string().optional(),
  cantidadActual: z.coerce.number().min(0, 'No puede ser negativo'),
  puntoReorden: z.coerce.number().min(0, 'No puede ser negativo'),
  ubicacionBodega: z.string().optional(),
});
type InventarioFormValues = z.infer<typeof inventarioSchema>;

export default function ProductosPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { token, user } = useAuth();
  const { activeTenantId } = useTenantStore();
  const userSucursalId = user?.sucursalId;

  const [activeTab, setActiveTab] = useState('catalogo');
  const [searchProducto, setSearchProducto] = useState('');
  const [searchInventario, setSearchInventario] = useState('');

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    description: '',
    onConfirm: () => {},
    isDestructive: false,
  });

  // ==========================================================
  // Catálogo de productos
  // ==========================================================
  const [productoModalOpen, setProductoModalOpen] = useState(false);
  const [editingProducto, setEditingProducto] = useState<any | null>(null);

  const productoForm = useForm<ProductoFormValues>({
    resolver: zodResolver(productoSchema) as any,
    mode: 'onChange',
    defaultValues: { nombre: '', sku: '', descripcion: '', precioVenta: 0, estado: 'ACTIVO' },
  });

  const { data: productos, isLoading: loadingProductos } = useQuery({
    queryKey: ['productos', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/productos')),
    enabled: !!token,
  });

  const createProductoMutation = useMutation({
    mutationFn: async (values: ProductoFormValues) => apiPost('/productos', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      setProductoModalOpen(false);
      productoForm.reset();
      toast({ title: 'Éxito', description: 'Producto creado correctamente.', variant: 'success' });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const updateProductoMutation = useMutation({
    mutationFn: async (data: { id: string; values: ProductoFormValues }) => apiPatch(`/productos/${data.id}`, data.values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      setProductoModalOpen(false);
      setEditingProducto(null);
      productoForm.reset();
      toast({ title: 'Éxito', description: 'Producto actualizado correctamente.', variant: 'success' });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const { deleteItem: deleteProducto } = useSoftDelete({ queryKey: ['productos'], endpoint: 'productos', itemName: 'El producto' });

  const onSubmitProducto = (values: ProductoFormValues) => {
    if (editingProducto) updateProductoMutation.mutate({ id: editingProducto.id, values });
    else createProductoMutation.mutate(values);
  };

  const handleAddProducto = () => {
    setEditingProducto(null);
    productoForm.reset({ nombre: '', sku: '', descripcion: '', precioVenta: 0, estado: 'ACTIVO' });
    setProductoModalOpen(true);
  };

  const handleEditProducto = (producto: any) => {
    setEditingProducto(producto);
    productoForm.reset({
      nombre: producto.nombre,
      sku: producto.sku || '',
      descripcion: producto.descripcion || '',
      precioVenta: Number(producto.precioVenta),
      estado: producto.estado || 'ACTIVO',
    });
    setProductoModalOpen(true);
  };

  const handleDeleteProducto = (id: string) => {
    setConfirmConfig({
      title: '¿Eliminar producto?',
      description: 'Esta acción desactivará el producto del catálogo. Los registros de inventario asociados también se eliminarán.',
      isDestructive: true,
      onConfirm: () => deleteProducto(id),
    });
    setConfirmOpen(true);
  };

  const filteredProductos = (productos || []).filter((p: any) => {
    if (!searchProducto) return true;
    const lower = searchProducto.toLowerCase();
    return p.nombre?.toLowerCase().includes(lower) || p.sku?.toLowerCase().includes(lower);
  });

  const productosActivos = (productos || []).filter((p: any) => p.estado === 'ACTIVO');

  // ==========================================================
  // Inventario por sucursal
  // ==========================================================
  const [inventarioModalOpen, setInventarioModalOpen] = useState(false);
  const [editingInventario, setEditingInventario] = useState<any | null>(null);
  const [confirmInventarioOpen, setConfirmInventarioOpen] = useState(false);
  const [inventarioToDelete, setInventarioToDelete] = useState<any>(null);

  const inventarioForm = useForm<InventarioFormValues>({
    resolver: zodResolver(inventarioSchema) as any,
    mode: 'onChange',
    defaultValues: { productoId: '', sucursalId: '', cantidadActual: 0, puntoReorden: 5, ubicacionBodega: '' },
  });

  const { data: inventarios, isLoading: loadingInventarios } = useQuery({
    queryKey: ['inventarios', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/inventarios')),
    enabled: !!token,
  });

  const { data: sucursales } = useQuery({
    queryKey: ['sucursales', activeTenantId],
    queryFn: async () => unwrapList(await apiGet('/sucursales')),
    enabled: !!token && !userSucursalId,
  });

  const saveInventarioMutation = useMutation({
    mutationFn: async (values: InventarioFormValues) => {
      const payload: any = { ...values };
      // Si el usuario tiene una sucursal vinculada en el token, la forzamos
      // (igual que sucursalBaseId en clientes/page.tsx); el backend también
      // la fuerza vía RLS, esto solo evita mandar un valor inconsistente.
      if (userSucursalId) payload.sucursalId = userSucursalId;
      if (!payload.sucursalId) delete payload.sucursalId;

      return editingInventario
        ? apiPut(`/inventarios/${editingInventario.id}`, payload)
        : apiPost('/inventarios', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventarios'] });
      setInventarioModalOpen(false);
      setEditingInventario(null);
      inventarioForm.reset();
      toast({ title: 'Éxito', description: 'Inventario guardado correctamente.', variant: 'success' });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const deleteInventarioMutation = useMutation({
    mutationFn: async (id: string) => apiDelete(`/inventarios/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventarios'] });
      setConfirmInventarioOpen(false);
      setInventarioToDelete(null);
      toast({ title: 'Éxito', description: 'Registro de inventario eliminado.', variant: 'success' });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const handleAddInventario = () => {
    setEditingInventario(null);
    inventarioForm.reset({ productoId: '', sucursalId: userSucursalId || '', cantidadActual: 0, puntoReorden: 5, ubicacionBodega: '' });
    setInventarioModalOpen(true);
  };

  const handleEditInventario = (inv: any) => {
    setEditingInventario(inv);
    inventarioForm.reset({
      productoId: inv.productoId,
      sucursalId: inv.sucursalId,
      cantidadActual: inv.cantidadActual,
      puntoReorden: inv.puntoReorden,
      ubicacionBodega: inv.ubicacionBodega || '',
    });
    setInventarioModalOpen(true);
  };

  const handleDeleteInventario = (inv: any) => {
    setInventarioToDelete(inv);
    setConfirmInventarioOpen(true);
  };

  const filteredInventarios = (inventarios || []).filter((inv: any) => {
    if (!searchInventario) return true;
    const lower = searchInventario.toLowerCase();
    return inv.producto?.nombre?.toLowerCase().includes(lower) || inv.sucursal?.nombre?.toLowerCase().includes(lower);
  });

  const bajoStockCount = (inventarios || []).filter((inv: any) => inv.cantidadActual <= inv.puntoReorden).length;

  if (!token) return null;

  return (
    <Protect permission="productos:leer" fallbackType="redirect">
      <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Productos e Inventario</h2>
          <p className="text-sm text-slate-500 mt-1">Gestiona el catálogo de productos y su stock por sucursal.</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
            <TabsTrigger value="inventario" badge={bajoStockCount > 0 ? bajoStockCount : undefined}>
              Inventario por Sucursal
            </TabsTrigger>
          </TabsList>

          {/* ================= CATÁLOGO ================= */}
          <TabsContent value="catalogo">
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar producto o SKU..."
                    value={searchProducto}
                    onChange={(e) => setSearchProducto(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-xs"
                  />
                </div>
                <Protect permission="productos:crear">
                  <TenantRequiredButton onClick={handleAddProducto} icon={<Plus className="mr-2 h-4 w-4" />} label="Nuevo Producto" />
                </Protect>
              </div>

              {loadingProductos ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8 flex justify-center">
                  <div className="animate-pulse flex flex-col items-center gap-4">
                    <div className="h-8 w-8 bg-slate-200 rounded-full"></div>
                    <div className="h-4 w-32 bg-slate-200 rounded"></div>
                  </div>
                </div>
              ) : filteredProductos.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-12 text-center flex flex-col items-center">
                  <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
                    <Package className="w-6 h-6" />
                  </div>
                  <p className="text-base font-semibold text-slate-900">
                    {searchProducto ? 'Ningún producto coincide con la búsqueda' : 'No hay productos registrados'}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    {searchProducto ? 'Prueba con otro nombre o SKU.' : 'Crea tu primer producto para empezar a llevar inventario.'}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProductos.map((producto: any) => (
                      <TableRow key={producto.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 shrink-0">
                              <Package className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 text-sm">{producto.nombre}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{producto.sku || 'Sin SKU'}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-bold text-slate-900">${Number(producto.precioVenta).toFixed(2)}</span>
                        </TableCell>
                        <TableCell>
                          {producto.estado === 'ACTIVO' ? <Badge variant="success">Activo</Badge> : <Badge variant="default">Inactivo</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Protect permission="productos:actualizar">
                              <Button variant="ghost" size="icon" onClick={() => handleEditProducto(producto)} className="text-slate-500 hover:text-indigo-600">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </Protect>
                            <Protect permission="productos:eliminar">
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteProducto(producto.id)} className="text-slate-500 hover:text-rose-600">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </Protect>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* ================= INVENTARIO POR SUCURSAL ================= */}
          <TabsContent value="inventario">
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por producto o sucursal..."
                    value={searchInventario}
                    onChange={(e) => setSearchInventario(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-xs"
                  />
                </div>
                <Protect permission="inventarios:crear">
                  <TenantRequiredButton onClick={handleAddInventario} icon={<Plus className="mr-2 h-4 w-4" />} label="Registrar Stock" />
                </Protect>
              </div>

              {loadingInventarios ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8 flex justify-center">
                  <div className="animate-pulse flex flex-col items-center gap-4">
                    <div className="h-8 w-8 bg-slate-200 rounded-full"></div>
                    <div className="h-4 w-32 bg-slate-200 rounded"></div>
                  </div>
                </div>
              ) : filteredInventarios.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-12 text-center flex flex-col items-center">
                  <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4">
                    <Warehouse className="w-6 h-6" />
                  </div>
                  <p className="text-base font-semibold text-slate-900">
                    {searchInventario ? 'Ningún registro coincide con la búsqueda' : 'No hay inventario registrado'}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    {searchInventario ? 'Prueba con otro producto o sucursal.' : 'Registra el stock inicial de un producto en una sucursal.'}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Sucursal</TableHead>
                      <TableHead>Cantidad Actual</TableHead>
                      <TableHead>Punto de Reorden</TableHead>
                      <TableHead>Ubicación</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInventarios.map((inv: any) => {
                      const bajoStock = inv.cantidadActual <= inv.puntoReorden;
                      return (
                        <TableRow key={inv.id}>
                          <TableCell>
                            <div>
                              <p className="font-semibold text-slate-900 text-sm">{inv.producto?.nombre}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{inv.producto?.sku || 'Sin SKU'}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-slate-600">{inv.sucursal?.nombre}</span>
                          </TableCell>
                          <TableCell>
                            {bajoStock ? (
                              <Badge variant="warning">Bajo stock ({inv.cantidadActual})</Badge>
                            ) : (
                              <span className="font-bold text-slate-900">{inv.cantidadActual}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-slate-600">{inv.puntoReorden}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-slate-600">{inv.ubicacionBodega || '-'}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Protect permission="inventarios:actualizar">
                                <Button variant="ghost" size="icon" onClick={() => handleEditInventario(inv)} className="text-slate-500 hover:text-indigo-600">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </Protect>
                              <Protect permission="inventarios:eliminar">
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteInventario(inv)} className="text-slate-500 hover:text-rose-600">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </Protect>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* ================= MODALES ================= */}
        <GlobalFormModal
          open={productoModalOpen}
          onOpenChange={setProductoModalOpen}
          title={editingProducto ? 'Editar Producto' : 'Nuevo Producto'}
          description={editingProducto ? 'Modifica los datos del producto.' : 'Agrega un nuevo producto al catálogo.'}
          form={productoForm}
          sections={[
            {
              fields: [
                { name: 'nombre', label: 'Nombre del Producto', type: 'text', placeholder: 'Ej. Botella Shaker', colSpan: 2 },
                { name: 'sku', label: 'SKU (Opcional)', type: 'text', placeholder: 'Ej. SHK-001' },
                { name: 'precioVenta', label: 'Precio de Venta', type: 'number', placeholder: '0.00', allowDecimals: true },
                { name: 'descripcion', label: 'Descripción (Opcional)', type: 'text', colSpan: 2 },
                { name: 'estado', label: 'Estado', type: 'select', options: [{ label: 'Activo', value: 'ACTIVO' }, { label: 'Inactivo', value: 'INACTIVO' }], colSpan: 2 },
              ],
            },
          ]}
          onSubmit={onSubmitProducto}
          isPending={createProductoMutation.isPending || updateProductoMutation.isPending}
          submitLabel="Guardar Producto"
        />

        <GlobalFormModal
          open={inventarioModalOpen}
          onOpenChange={setInventarioModalOpen}
          title={editingInventario ? 'Editar Inventario' : 'Registrar Stock'}
          description={editingInventario ? 'Modifica el stock de este producto en la sucursal.' : 'Registra la cantidad inicial de un producto en una sucursal.'}
          form={inventarioForm}
          sections={[
            {
              fields: [
                {
                  name: 'productoId',
                  label: 'Producto',
                  type: 'select',
                  placeholder: 'Selecciona un producto',
                  disabled: !!editingInventario,
                  options: productosActivos.map((p: any) => ({ label: `${p.nombre}${p.sku ? ` (${p.sku})` : ''}`, value: p.id })),
                  colSpan: 2,
                },
                ...(!userSucursalId
                  ? [{
                      name: 'sucursalId',
                      label: 'Sucursal',
                      type: 'select' as const,
                      placeholder: 'Selecciona una sucursal',
                      disabled: !!editingInventario,
                      options: (sucursales || []).map((s: any) => ({ label: s.nombre, value: s.id })),
                      colSpan: 2 as const,
                    }]
                  : []),
                { name: 'cantidadActual', label: 'Cantidad Actual', type: 'number', placeholder: '0' },
                { name: 'puntoReorden', label: 'Punto de Reorden', type: 'number', placeholder: '5' },
                { name: 'ubicacionBodega', label: 'Ubicación en Bodega (Opcional)', type: 'text', placeholder: 'Ej. Estante A-3', colSpan: 2 },
              ],
            },
          ]}
          onSubmit={saveInventarioMutation.mutateAsync}
          isPending={saveInventarioMutation.isPending}
          submitLabel="Guardar Inventario"
        />

        <GlobalConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={confirmConfig.title}
          description={confirmConfig.description}
          onConfirm={confirmConfig.onConfirm}
          isDestructive={confirmConfig.isDestructive}
        />

        <GlobalConfirmDialog
          open={confirmInventarioOpen}
          onOpenChange={setConfirmInventarioOpen}
          title="¿Eliminar registro de inventario?"
          description={`Se eliminará el stock de "${inventarioToDelete?.producto?.nombre}" en "${inventarioToDelete?.sucursal?.nombre}". Esta acción no se puede deshacer.`}
          onConfirm={() => inventarioToDelete && deleteInventarioMutation.mutate(inventarioToDelete.id)}
          isDestructive={true}
        />
      </div>
    </Protect>
  );
}
