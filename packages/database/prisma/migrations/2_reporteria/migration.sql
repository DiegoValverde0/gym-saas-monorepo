-- CreateEnum
CREATE TYPE "VisibilidadCarpetaReporte" AS ENUM ('PRIVADA', 'COMPARTIDA');

-- CreateEnum
CREATE TYPE "FormatoReporte" AS ENUM ('LISTA', 'AGRUPADO', 'TABLA_CRUZADA');

-- CreateTable
CREATE TABLE "carpetas_reportes" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" TEXT,
    "visibilidad" "VisibilidadCarpetaReporte" NOT NULL DEFAULT 'PRIVADA',
    "roles_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "creado_por_id" UUID,

    CONSTRAINT "carpetas_reportes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reportes" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "carpeta_id" UUID,
    "nombre" VARCHAR(150) NOT NULL,
    "descripcion" TEXT,
    "tipo_reporte" VARCHAR(50) NOT NULL,
    "formato" "FormatoReporte" NOT NULL DEFAULT 'LISTA',
    "definicion" JSONB NOT NULL,
    "es_plantilla" BOOLEAN NOT NULL DEFAULT false,
    "ultima_ejecucion" TIMESTAMPTZ(6),
    "veces_ejecutado" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "creado_por_id" UUID,

    CONSTRAINT "reportes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "carpetas_reportes_organizacion_id_idx" ON "carpetas_reportes"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "carpetas_reportes_id_organizacion_id_key" ON "carpetas_reportes"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "reportes_organizacion_id_carpeta_id_idx" ON "reportes"("organizacion_id", "carpeta_id");

-- CreateIndex
CREATE INDEX "reportes_organizacion_id_creado_por_id_idx" ON "reportes"("organizacion_id", "creado_por_id");

-- AddForeignKey
ALTER TABLE "carpetas_reportes" ADD CONSTRAINT "carpetas_reportes_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carpetas_reportes" ADD CONSTRAINT "carpetas_reportes_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_carpeta_id_organizacion_id_fkey" FOREIGN KEY ("carpeta_id", "organizacion_id") REFERENCES "carpetas_reportes"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reportes" ADD CONSTRAINT "reportes_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

