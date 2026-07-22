#!/bin/bash
# ==============================================================================
# Script 2: Despliegue de la Aplicación Next.js y Base de Datos (SQLite)
# ==============================================================================
# Este script instala las dependencias de npm, genera el cliente de Prisma,
# sincroniza el esquema de base de datos SQLite y compila la aplicación en
# modo producción.
# Se recomienda ejecutarlo como usuario normal (no root/sudo).
# ==============================================================================

set -e

# Advertir si se ejecuta como root (no recomendado para npm install)
if [ "$EUID" -eq 0 ]; then
  echo "⚠️ Advertencia: Estás ejecutando este script como root."
  echo "   Es más seguro y recomendado ejecutarlo como tu usuario normal (ej. pi o admn)."
  echo "   Presiona CTRL+C para cancelar, o ENTER para continuar de todos modos..."
  read -r
fi

# Validar que exista el package.json en el directorio actual
if [ ! -f "package.json" ]; then
  echo "❌ Error: No se encontró package.json en el directorio actual."
  echo "   Asegúrate de ejecutar este script desde la raíz de la aplicación (alpha/)."
  exit 1
fi

echo "========================================================"
echo "  📦 Iniciando Despliegue de la Aplicación PER Alpha"
echo "========================================================"

# 1. Instalar dependencias de NPM
echo "📥 Instalando dependencias de NPM..."
npm install

# 2. Configurar variables de entorno iniciales (.env.local)
if [ ! -f ".env.local" ] && [ ! -f ".env" ]; then
  echo "📄 Creando archivo .env.local inicial..."
  cat <<EOT > .env.local
# Entorno local para Raspberry Pi
DATABASE_URL="file:./dev.db"
PORT=3000
NODE_ENV=production
# Si vas a usar integración con Google Workspace, coloca la URL de tu Web App aquí:
# GOOGLE_APPS_SCRIPT_URL="https://script.google.com/macros/s/.../exec"
EOT
  echo "✅ Archivo .env.local creado con configuración básica SQLite."
else
  echo "ℹ️ Se detectó un archivo .env o .env.local existente. Conservando configuración."
fi

# 3. Generar cliente Prisma y sincronizar base de datos SQLite
echo "🗄️ Generando cliente Prisma..."
npx prisma generate

echo "⚙️ Sincronizando esquema con la base de datos local SQLite..."
npx prisma db push

# Opcional: Cargar datos de prueba si la base de datos está vacía
echo "🌱 ¿Deseas aplicar el script de datos de prueba (seed)? (s/n)"
read -r response
if [[ "$response" =~ ^([sS][iI]|[sS])$ ]]; then
  echo "🌾 Ejecutando prisma db seed..."
  npx prisma db seed
else
  echo "⏭️ Omitiendo carga de datos de prueba."
fi

# 4. Compilar la aplicación Next.js para producción
echo "🏗️ Compilando aplicación Next.js (npm run build)..."
# Usamos NODE_OPTIONS para dar soporte de memoria suficiente a Node si es necesario
NODE_OPTIONS="--max-old-space-size=1536" npm run build

echo "========================================================"
echo "🎉 ¡Despliegue y compilación finalizados exitosamente!"
echo "👉 Ahora ejecuta el Script 3 para configurar el servicio de autoinicio:"
echo "   sudo bash RBPscripts/3_setup_service.sh"
echo "========================================================"
