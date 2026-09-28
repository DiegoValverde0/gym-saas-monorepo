#!/bin/sh
# Respaldo diario de PostgreSQL (servicio "respaldos" de docker-compose.prod.yml).
# Guarda un pg_dump comprimido por día en /respaldos y borra los de más de
# DIAS_RESPALDO días. Restaurar: ver docs/despliegue.md.
set -eu

DIAS="${DIAS_RESPALDO:-14}"

respaldar() {
  archivo="/respaldos/gym-$(date +%Y-%m-%d_%H%M).dump"
  if pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$archivo.tmp"; then
    mv "$archivo.tmp" "$archivo"
    echo "$(date '+%F %T') respaldo listo: $archivo ($(du -h "$archivo" | cut -f1))"
  else
    rm -f "$archivo.tmp"
    echo "$(date '+%F %T') ERROR: falló el respaldo" >&2
  fi
  find /respaldos -name 'gym-*.dump' -mtime +"$DIAS" -delete
}

export PGPASSWORD="$POSTGRES_PASSWORD"
# Uno al arrancar y después cada 24 horas.
while true; do
  respaldar
  sleep 86400
done
