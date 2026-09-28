-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "usuario_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "clientes_organizacion_id_usuario_id_key" ON "clientes"("organizacion_id", "usuario_id");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

