#!/bin/bash
# ==============================================================================
# Script 3: Configuración de Servicio de Sistema (systemd)
# ==============================================================================
# Este script crea un servicio en systemd para que la aplicación Next.js se
# ejecute en segundo plano, se inicie automáticamente cuando arranque la
# Raspberry Pi y se reinicie sola si llega a fallar.
# Debe ejecutarse con sudo.
# ==============================================================================

set -e

# Asegurar que se ejecuta como root (sudo)
if [ "$EUID" -ne 0 ]; then
  echo "❌ Por favor, ejecuta este script como superusuario (con sudo):"
  echo "   sudo bash $0"
  exit 1
fi

# Detectar el directorio real de la aplicación
CURRENT_DIR=$(pwd)
if [[ "$CURRENT_DIR" == */RBPscripts ]]; then
  APP_DIR=$(dirname "$CURRENT_DIR")
else
  APP_DIR="$CURRENT_DIR"
fi

# Validar que sea el directorio correcto buscando package.json
if [ ! -f "$APP_DIR/package.json" ]; then
  echo "❌ Error: No se pudo determinar la ruta raíz de la aplicación."
  echo "   Asegúrate de estar ejecutando este script desde la carpeta 'alpha' o 'RBPscripts'."
  exit 1
fi

# Detectar el usuario original que llamó a sudo
REAL_USER=${SUDO_USER:-$USER}
REAL_GROUP=$(id -gn "$REAL_USER")

# Evitar ejecutar la app como root por seguridad si es posible
if [ "$REAL_USER" = "root" ]; then
  echo "⚠️ Advertencia: Estás ejecutando el instalador directamente como root."
  echo "   Se recomienda definir un usuario no-root para correr el servicio."
  echo "   Ingresa el nombre del usuario del sistema que poseerá el servicio (ej. pi o admn):"
  read -r REAL_USER
  if ! id "$REAL_USER" >/dev/null 2>&1; then
    echo "❌ El usuario '$REAL_USER' no existe en el sistema."
    exit 1
  fi
  REAL_GROUP=$(id -gn "$REAL_USER")
fi

SERVICE_FILE="/etc/systemd/system/alpha-app.service"

echo "========================================================"
echo "  ⚙️ Configurando Servicio systemd para PER Alpha"
echo "  Ruta de la App: $APP_DIR"
echo "  Usuario: $REAL_USER ($REAL_GROUP)"
echo "========================================================"

# Asegurar que el usuario tiene permisos correctos sobre los archivos de la app
chown -R "$REAL_USER":"$REAL_GROUP" "$APP_DIR"

# Obtener ruta absoluta de npm y node
NPM_PATH=$(which npm)
NODE_PATH=$(which node)

# Crear archivo de servicio
cat <<EOT > "$SERVICE_FILE"
[Unit]
Description=Aplicacion Next.js PER Alpha
After=network.target

[Service]
Type=simple
User=$REAL_USER
Group=$REAL_GROUP
WorkingDirectory=$APP_DIR
ExecStart=$NPM_PATH run start
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=alpha-app
# Cargar variables de entorno si existen
EnvironmentFile=-$APP_DIR/.env
EnvironmentFile=-$APP_DIR/.env.local
Environment=NODE_ENV=production PORT=3000

[Install]
WantedBy=multi-user.target
EOT

echo "🔄 Recargando demonio de systemd..."
systemctl daemon-reload

echo "🔋 Habilitando el servicio en el inicio del sistema..."
systemctl enable alpha-app.service

echo "🚀 Iniciando el servicio alpha-app..."
systemctl start alpha-app.service

# Esperar unos segundos y verificar estado
sleep 2
if systemctl is-active --quiet alpha-app; then
  echo "✅ El servicio se ha iniciado correctamente."
  echo "🌐 La app ya está corriendo internamente en http://localhost:3000"
else
  echo "❌ Error: El servicio no pudo iniciarse correctamente."
  echo "   Puedes ver los logs de error ejecutando: journalctl -u alpha-app -n 50"
  exit 1
fi

echo "========================================================"
echo "🎉 ¡Servicio systemd configurado!"
echo "👉 Ahora ejecuta el Script 4 para configurar la seguridad del firewall:"
echo "   sudo bash RBPscripts/4_setup_security.sh"
echo "========================================================"
