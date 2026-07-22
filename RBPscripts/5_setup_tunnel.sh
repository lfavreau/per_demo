#!/bin/bash
# ==============================================================================
# Script 5: Instalación y Configuración de Cloudflare Tunnel (cloudflared)
# ==============================================================================
# Este script descarga e instala la última versión de cloudflared según la
# arquitectura de tu Raspberry Pi (32 o 64 bits), permitiendo exponer la app
# al internet con SSL/HTTPS gratuito de forma totalmente segura.
# Debe ejecutarse con sudo.
# ==============================================================================

set -e

# Asegurar que se ejecuta como root (sudo)
if [ "$EUID" -ne 0 ]; then
  echo "❌ Por favor, ejecuta este script como superusuario (con sudo):"
  echo "   sudo bash $0"
  exit 1
fi

echo "========================================================"
echo "  ☁️ Instalando Cloudflare Tunnel en la Raspberry Pi"
echo "========================================================"

# 1. Detectar arquitectura de CPU
ARCH=$(uname -m)
DOWNLOAD_URL=""
DEB_FILE="cloudflared.deb"

echo "🔎 Arquitectura de CPU detectada: $ARCH"

case "$ARCH" in
  x86_64)
    DOWNLOAD_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"
    ;;
  aarch64|arm64)
    DOWNLOAD_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb"
    ;;
  armv7l|armhf|armv6l)
    DOWNLOAD_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm.deb"
    ;;
  *)
    echo "❌ Arquitectura no soportada automáticamente ($ARCH)."
    echo "Puedes descargar el binario correcto manualmente desde:"
    echo "https://github.com/cloudflare/cloudflared/releases"
    exit 1
    ;;
esac

# 2. Descargar e instalar cloudflared
echo "📥 Descargando cloudflared desde: $DOWNLOAD_URL"
curl -L --output "$DEB_FILE" "$DOWNLOAD_URL"

echo "📦 Instalando paquete deb..."
dpkg -i "$DEB_FILE" || apt-get install -f -y

# Eliminar archivo temporal
rm "$DEB_FILE"

echo "✅ Instalación de cloudflared finalizada correctamente."
cloudflared --version

# 3. Preguntar si quiere configurar el túnel de forma administrada o local
echo "--------------------------------------------------------"
echo "Elige el método de configuración del túnel:"
echo "1) Por Token de Cloudflare Dashboard (RECOMENDADO y Sencillo)"
echo "   -> Creas el túnel en la web de Cloudflare Zero Trust."
echo "   -> Te dará un token de instalación."
echo "   -> Solo lo pegas aquí y se levanta automáticamente."
echo "2) Por CLI localmente"
echo "   -> Realizas la autenticación, creación del túnel y"
echo "      configuración de archivos YAML desde esta consola."
echo "--------------------------------------------------------"
read -p "Ingresa una opción (1 o 2): " TUNNEL_OPT

if [ "$TUNNEL_OPT" = "1" ]; then
  echo "🔑 Has elegido configuración por Token (Cloudflare Managed)."
  echo "Por favor, copia el Token de tu túnel desde el Dashboard de Cloudflare"
  echo "(Debe ser la cadena larga de texto que va después de '--token' en el comando provisto)."
  read -p "Ingresa tu Token de Cloudflare: " CF_TOKEN
  
  if [ -z "$CF_TOKEN" ]; then
    echo "❌ Token vacío. Abortando instalación del servicio."
    exit 1
  fi
  
  echo "⚙️ Instalando el servicio de Cloudflare Tunnel..."
  cloudflared service install "$CF_TOKEN"
  
  echo "🚀 Iniciando el servicio..."
  systemctl start cloudflared
  
  echo "========================================================"
  echo "✅ ¡Felicidades! Cloudflare Tunnel se ha configurado e iniciado."
  echo "   Tu aplicación Next.js ahora es accesible de forma segura"
  echo "   desde el dominio configurado en tu panel de Cloudflare."
  echo "========================================================"

elif [ "$TUNNEL_OPT" = "2" ]; then
  echo "🛠️ Has elegido configuración manual por CLI."
  echo "Sigue estos pasos a continuación de manera interactiva:"
  echo "1. Ejecuta: cloudflared tunnel login (abre el enlace en tu navegador para autenticarte)"
  echo "2. Crea un túnel ejecutando: cloudflared tunnel create alpha-tunnel"
  echo "3. Consulta el manual 'RBPinstall.md' para saber cómo crear el archivo 'config.yml'"
  echo "   y vincular tu dominio público."
fi
