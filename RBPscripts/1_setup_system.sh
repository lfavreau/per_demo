#!/bin/bash
# ==============================================================================
# Script 1: Configuración del Sistema en Raspberry Pi 3B+
# ==============================================================================
# Este script actualiza el sistema, instala Node.js (20 LTS), git y herramientas
# de compilación. También aumenta el tamaño de la memoria SWAP a 2GB para evitar
# que la Raspberry Pi 3B+ se quede sin memoria (OOM) al compilar la app Next.js.
# ==============================================================================

# Detener el script si hay algún error
set -e

# Asegurar que se ejecuta como root (sudo)
if [ "$EUID" -ne 0 ]; then
  echo "❌ Por favor, ejecuta este script como superusuario (con sudo):"
  echo "   sudo bash $0"
  exit 1
fi

echo "========================================================"
echo "  🚀 Iniciando Configuración del Sistema para PER Alpha"
echo "========================================================"

# 1. Actualización de Repositorios y Sistema
echo "📦 Actualizando paquetes del sistema..."
apt-get update && apt-get upgrade -y

# 2. Instalar dependencias básicas de compilación
echo "🛠️ Instalando herramientas de compilación y utilidades..."
apt-get install -y build-essential curl git ufw fail2ban

# 3. Aumentar memoria SWAP a 2GB (Crucial para Raspberry Pi 3B+ de 1GB RAM)
echo "💾 Configurando memoria SWAP a 2048MB para evitar bloqueos en compilación..."
SWAP_FILE="/etc/dphys-swapfile"
if [ -f "$SWAP_FILE" ]; then
  # Hacer respaldo
  cp "$SWAP_FILE" "${SWAP_FILE}.bak"
  
  # Cambiar CONF_SWAPSIZE a 2048
  sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' "$SWAP_FILE"
  
  echo "🔄 Reiniciando servicio de SWAP para aplicar cambios..."
  dphys-swapfile swapoff
  dphys-swapfile setup
  dphys-swapfile swapon
  echo "✅ SWAP configurada exitosamente."
else
  echo "⚠️ Archivo /etc/dphys-swapfile no encontrado. Si estás en una distro distinta a Raspberry Pi OS, asegúrate de configurar al menos 2GB de SWAP manualmente."
fi

# 4. Instalar Node.js 20 LTS (Compatible con Next.js 16 + React 19)
echo "🟢 Instalando Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Verificar versiones instaladas
NODE_VER=$(node -v)
NPM_VER=$(npm -v)
echo "✅ Node.js instalado: $NODE_VER"
echo "✅ NPM instalado: $NPM_VER"

echo "========================================================"
echo "🎉 ¡Paso 1 completado exitosamente!"
echo "👉 Ahora ejecuta el Script 2 para desplegar la app:"
echo "   bash RBPscripts/2_deploy_app.sh"
echo "========================================================"
