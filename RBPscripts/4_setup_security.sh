#!/bin/bash
# ==============================================================================
# Script 4: Configuración de Seguridad (UFW Firewall & Fail2Ban)
# ==============================================================================
# Este script configura el Firewall No Complicado (UFW) y habilita Fail2Ban
# para proteger la Raspberry Pi contra accesos no autorizados y ataques brute force.
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
echo "  🔒 Configurando Seguridad en la Raspberry Pi"
echo "========================================================"

# 1. Habilitar Fail2Ban para proteger SSH
echo "🛡️ Configurando Fail2Ban para mitigar ataques de fuerza bruta en SSH..."
if systemctl is-active --quiet fail2ban; then
  echo "✅ Fail2Ban ya está corriendo."
else
  systemctl enable fail2ban
  systemctl start fail2ban
  echo "✅ Fail2Ban activado y habilitado."
fi

# 2. Configurar Firewall (UFW)
echo "🧱 Configurando Firewall (UFW)..."

# Restablecer reglas predeterminadas
ufw --force reset

# Reglas por defecto: Denegar toda entrada, Permitir toda salida
ufw default deny incoming
ufw default allow outgoing

# Permitir SSH (Crucial para no perder acceso remoto)
echo "🔑 Permitiendo tráfico entrante SSH (puerto 22)..."
ufw allow ssh

# Preguntar el método de exposición a Internet
echo "--------------------------------------------------------"
echo "Elige cómo vas a exponer la aplicación a Internet:"
echo "1) Por túnel seguro (Cloudflare Tunnel - RECOMENDADO)"
echo "   -> No requiere abrir puertos en tu router doméstico."
echo "   -> No expone puertos de tu Raspberry Pi hacia el exterior."
echo "   -> Incluye certificado SSL e IP/Dominio público seguro gratis."
echo "2) Directamente (IP Pública propia / Port Forwarding en Router)"
echo "   -> Requiere abrir puertos (80 y 443) en tu router."
echo "   -> Requiere un Nginx Reverse Proxy y configurar Certbot (SSL)."
echo "--------------------------------------------------------"
read -p "Ingresa una opción (1 o 2): " EXPOSE_OPT

if [ "$EXPOSE_OPT" = "1" ]; then
  echo "🔒 Has elegido Cloudflare Tunnel."
  echo "   El túnel funciona mediante conexiones salientes."
  echo "   No es necesario abrir puertos entrantes para la web en el firewall local."
  echo "   Solo dejaremos abierto el puerto SSH (22)."
elif [ "$EXPOSE_OPT" = "2" ]; then
  echo "🌐 Has elegido Exposición Directa."
  echo "   Abriendo puertos HTTP (80) y HTTPS (443) en el firewall..."
  ufw allow http
  ufw allow https
else
  echo "⚠️ Opción inválida. Por seguridad, solo permitiremos SSH por ahora."
fi

# Habilitar el Firewall
echo "🧱 Activando UFW..."
ufw --force enable

echo "📊 Estado del Firewall:"
ufw status verbose

echo "========================================================"
echo "🎉 ¡Firewall y seguridad básica configurados!"
echo "👉 Ahora ejecuta el Script 5 si elegiste la opción 1 (Túnel Cloudflare):"
echo "   sudo bash RBPscripts/5_setup_tunnel.sh"
echo "========================================================"
