# 🍓 Guía de Instalación y Despliegue en Raspberry Pi 3B+ (PER Alpha)

Esta guía contiene las instrucciones detalladas paso a paso para desplegar la aplicación **PER Alpha** (Next.js + Prisma + SQLite) en una **Raspberry Pi 3B+** de forma segura, estable y con acceso público a Internet mediante HTTPS (sin necesidad de abrir puertos en tu router doméstico).

---

## 📋 Requisitos Previos

1. **Hardware**:
   - Raspberry Pi 3B+ (o posterior).
   - Tarjeta MicroSD (mínimo 16 GB, Clase 10 / A1 o A2 recomendada).
   - Cable de red Ethernet o conexión WiFi configurada.
2. **Software**:
   - Raspberry Pi OS (Lite o Desktop, basado en Debian).
   - Acceso SSH habilitado.
3. **Dominio Público (Gratis o de pago)**:
   - Para exponer la app mediante HTTPS seguro, necesitarás administrar un dominio en Cloudflare (puedes registrar uno muy barato o vincular uno gratuito).

---

## 🛠️ Estructura de Scripts Automatizados

Hemos creado una suite de scripts en la carpeta [`RBPscripts/`](file:///c:/Users/admn/Desktop/apps/per/alpha/RBPscripts) para automatizar todo el proceso. Deberás transferir esta carpeta a tu Raspberry Pi junto con el código del proyecto.

Los scripts creados son:
1. [`1_setup_system.sh`](file:///c:/Users/admn/Desktop/apps/per/alpha/RBPscripts/1_setup_system.sh): Actualiza el sistema, instala Node.js 20 LTS, Git y configura **2 GB de memoria SWAP** (indispensable para que no se congele la RPi al compilar).
2. [`2_deploy_app.sh`](file:///c:/Users/admn/Desktop/apps/per/alpha/RBPscripts/2_deploy_app.sh): Instala dependencias, genera el cliente Prisma, migra la base de datos local SQLite y compila Next.js en producción.
3. [`3_setup_service.sh`](file:///c:/Users/admn/Desktop/apps/per/alpha/RBPscripts/3_setup_service.sh): Configura un servicio en `systemd` para correr la app en segundo plano y auto-iniciar en el encendido.
4. [`4_setup_security.sh`](file:///c:/Users/admn/Desktop/apps/per/alpha/RBPscripts/4_setup_security.sh): Configura el Firewall (UFW) y habilita protección contra fuerza bruta con Fail2Ban.
5. [`5_setup_tunnel.sh`](file:///c:/Users/admn/Desktop/apps/per/alpha/RBPscripts/5_setup_tunnel.sh): Descarga e instala `cloudflared` para exponer la app a internet con SSL gratis de forma inmediata.

---

## 🚀 Proceso de Instalación Paso a Paso

### Paso 1: Clonar o copiar el proyecto a la Raspberry Pi
Conéctate por SSH a tu Raspberry Pi y clona el repositorio en la carpeta de tu usuario (por ejemplo `/home/pi/alpha` o `/home/admn/alpha`):

```bash
git clone <URL_DE_TU_REPOSITORIO> alpha
cd alpha
```
*(Si no tienes Git configurado en tu servidor, puedes transferir los archivos usando SCP, SFTP o FileZilla).*

---

### Paso 2: Configurar permisos de los scripts
Antes de correr los scripts, dales permisos de ejecución:

```bash
chmod +x RBPscripts/*.sh
```

---

### Paso 3: Preparar el Sistema
Ejecuta el script que instala Node.js, Git y optimiza la memoria de intercambio (SWAP) de la Raspberry Pi:

```bash
sudo bash RBPscripts/1_setup_system.sh
```
> [!NOTE]
> Al configurar la SWAP a 2GB, la Raspberry Pi 3B+ (que solo posee 1GB de RAM física) tendrá memoria virtual suficiente para llevar a cabo la compilación de Next.js sin colapsar.

---

### Paso 4: Desplegar la Aplicación
Ejecuta el script de compilación y base de datos como **usuario normal** (sin sudo):

```bash
bash RBPscripts/2_deploy_app.sh
```
Durante este paso:
* Se instalarán los módulos de Node.js.
* Se creará automáticamente un archivo `.env.local` optimizado para SQLite.
* Se creará la base de datos `dev.db` y se aplicarán los esquemas de Prisma.
* Se te preguntará si deseas sembrar datos de prueba (`db seed`). Responde **s** (sí) o **n** (no).
* Se compilará Next.js para producción usando límites de memoria asignados.

---

### Paso 5: Instalar el Servicio en Segundo Plano
Para asegurar que la aplicación se mantenga corriendo 24/7 y se encienda sola con el sistema, configúrala como servicio del sistema:

```bash
sudo bash RBPscripts/3_setup_service.sh
```
El script detectará tu usuario y la ruta del proyecto automáticamente, configurará el servicio `alpha-app.service` e iniciará la aplicación en el puerto local `3000`.

---

### Paso 6: Configurar Cortafuegos y Seguridad
Habilita el Firewall y protege tu SSH contra escaneos maliciosos:

```bash
sudo bash RBPscripts/4_setup_security.sh
```
* Este script configurará **UFW** para bloquear todo el tráfico entrante a excepción de SSH (puerto 22).
* Te dará a elegir entre el **Túnel de Cloudflare** (opción 1) o **Exposición Directa** (opción 2). Selecciona **1** para máxima seguridad.

---

### Paso 7: Exponer la Aplicación (Obtener IP/Dominio Público Seguro)

Utilizaremos **Cloudflare Tunnels**. Esto crea una conexión encriptada saliente desde la Raspberry Pi hacia los servidores de Cloudflare. **No requiere abrir puertos en tu módem/router doméstico ni configurar DDNS**, y protege tu IP real contra ataques de denegación de servicio (DDoS).

1. Ve a [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) (es gratis para hasta 50 usuarios).
2. En el panel izquierdo, ve a **Networks** ➔ **Tunnels**.
3. Haz clic en **Create a Tunnel**, nómbralo (ej. `alpha-rpi`) y guárdalo.
4. En la pestaña **Install connector**, selecciona **Debian** y copia el token largo que aparece en el comando de instalación de la derecha. El token es una cadena alfanumérica similar a:
   `eyJ0IjoiY2E2N2...`
5. Ejecuta el script del túnel en la Raspberry Pi:
   ```bash
   sudo bash RBPscripts/5_setup_tunnel.sh
   ```
6. Elige la **Opción 1**, e ingresa el token cuando el script te lo solicite.
7. De vuelta en el panel web de Cloudflare, una vez que el conector aparezca como **Connected**, ve a la pestaña **Route Tunnel** (Rutas públicas).
8. Configura una nueva ruta pública:
   * **Subdomain / Domain**: Configura el subdominio que quieras usar (ej. `per.tudominio.com`).
   * **Type**: `HTTP`
   * **URL**: `localhost:3000` (ya que la app corre en el puerto 3000 local).
9. Guarda los cambios.

**¡Listo!** Ahora podrás acceder a tu aplicación desde cualquier lugar del mundo a través de `https://per.tudominio.com` con certificado SSL válido y cifrado HTTPS de extremo a extremo.

---

## 🔒 Medidas de Seguridad Clave Implementadas

1. **Aislamiento de Puerto**: El puerto `3000` de Next.js está cerrado al exterior en el firewall local de la Raspberry Pi. Solo se puede acceder internamente a través de localhost.
2. **Sin Puertos Abiertos en el Router**: Al usar Cloudflare Tunnel, no tienes que exponer tu IP pública residencial a internet. No hay puertos abiertos orientados a la WAN en tu router doméstico.
3. **Protección SSH brute-force (Fail2ban)**: Si alguien intenta adivinar tu contraseña SSH por fuerza bruta, Fail2ban baneará su dirección IP temporalmente.
4. **Ejecución como Usuario Limitado**: El servicio de Node.js corre bajo el usuario estándar del sistema (ej. `pi` o `admn`), limitando el acceso al sistema operativo en el hipotético caso de que la aplicación sufra una vulnerabilidad.

---

## 📊 Mantenimiento y Comandos Útiles

Si necesitas administrar el servidor en el futuro, utiliza estos comandos SSH comunes:

### Ver logs en tiempo real (Útil para depuración)
```bash
journalctl -u alpha-app -f
```

### Detener, Iniciar o Reiniciar la aplicación
```bash
sudo systemctl stop alpha-app
sudo systemctl start alpha-app
sudo systemctl restart alpha-app
```

### Ver estado del servicio
```bash
systemctl status alpha-app
```

### Respaldar Base de Datos (SQLite)
La base de datos SQLite se encuentra en una ruta local de la aplicación. Para respaldarla, solo debes copiar el archivo `dev.db` de forma segura:
```bash
cp /home/pi/alpha/prisma/dev.db /home/pi/copia_seguridad_dev.db
```
*(Puedes programar una tarea cron diaria para copiar este archivo a un almacenamiento externo).*
