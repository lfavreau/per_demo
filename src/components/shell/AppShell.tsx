"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { 
  getUserNotificationsAction, 
  markNotificationAsReadAction, 
  markAllNotificationsAsReadAction,
  UserNotification 
} from "@/app/actions/notifications";
import { getSwRegistration } from "@/components/PWARegistration";

interface AppShellProps {
  children: React.ReactNode;
  user: {
    name: string;
    email: string;
    role: "ADMIN" | "COORDINATOR" | "PER";
    regionId: string | null;
    isDemo?: boolean;
  };
}

export default function AppShell({ children, user }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const prevUnreadCountRef = useRef<number | null>(null);
  const [showPushBanner, setShowPushBanner] = useState(false);
  const [pushStatus, setPushStatus] = useState<"idle" | "subscribing" | "subscribed" | "denied">("idle");

  const fetchNotifications = async () => {
    const data = await getUserNotificationsAction();
    setNotifications(data);
    const unread = data.filter(n => !n.read).length;
    const prev = prevUnreadCountRef.current;
    if (unread > 0 && (prev === null || unread > prev)) {
      setShouldAnimate(true);
      setTimeout(() => setShouldAnimate(false), 2400);
    }
    prevUnreadCountRef.current = unread;
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, []);

  // Monitor online status
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  // Check if push opt-in banner should show
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || !("PushManager" in window)) return;
    const permission = Notification.permission;
    if (permission === "granted") {
      setPushStatus("subscribed");
      return;
    }
    if (permission === "denied") {
      setPushStatus("denied");
      return;
    }
    // Check if user dismissed the banner recently (7 days)
    const dismissed = localStorage.getItem("push-banner-dismissed");
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
    }
    // Show the banner after a short delay so it doesn't flash on load
    const timer = setTimeout(() => setShowPushBanner(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleSubscribePush = async () => {
    setPushStatus("subscribing");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushStatus("denied");
        setShowPushBanner(false);
        return;
      }

      // Wait a bit for SW to register if it hasn't yet
      let reg = getSwRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.ready;
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        console.error("[Push] VAPID public key not found");
        setPushStatus("idle");
        return;
      }

      // Convert VAPID key to Uint8Array
      const urlBase64ToUint8Array = (base64String: string) => {
        const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
      };

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const subJson = subscription.toJSON();

      // Send subscription to backend
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      });

      if (res.ok) {
        setPushStatus("subscribed");
        setShowPushBanner(false);
      } else {
        setPushStatus("idle");
      }
    } catch (err) {
      console.error("[Push] Subscribe error:", err);
      setPushStatus("idle");
    }
  };

  const dismissPushBanner = () => {
    localStorage.setItem("push-banner-dismissed", Date.now().toString());
    setShowPushBanner(false);
  };

  const handleLogout = async () => {
    await logoutAction();
  };

  // Define sidebar menu options by role
  const menuItems = {
    ADMIN: [
      { name: "Resumen", path: "/admin", icon: "📊" },
      { name: "Instrumentos", path: "/admin/instrumentos", icon: "📋" },
      { name: "Reportes SENDA", path: "/admin/reportes", icon: "📥" },
      { name: "Auditoría", path: "/admin/auditoria", icon: "🛡️" },
    ],
    COORDINATOR: [
      { name: "Resumen Regional", path: "/coordinacion", icon: "📊" },
      { name: "Nómina / Fase 2", path: "/coordinacion/candidatas", icon: "👥" },
      { name: "Acompañamientos", path: "/coordinacion/casos", icon: "🤝" },
      { name: "Validación Sesiones", path: "/coordinacion/sesiones", icon: "✓" },
      { name: "Supervisiones", path: "/coordinacion/supervisiones", icon: "🗓️" },
      { name: "Gestión de Redes", path: "/coordinacion/redes", icon: "🌐" },
      { name: "Alertas y Tareas", path: "/coordinacion/alertas", icon: "⚠️" },
    ],
    PER: [
      { name: "Mi Agenda", path: "/per", icon: "📅" },
      { name: "Casos Activos", path: "/per", icon: "👥" },
      { name: "Avisos", path: "/per", icon: "🔔" },
    ],
  };

  const currentMenu = menuItems[user.role] || [];
  const isPerRole = user.role === "PER";

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Offline Status Warning Banner */}
      {!isOnline && (
        <div className="bg-amber-600 text-white text-xs font-semibold text-center py-2 px-4 flex items-center justify-center gap-2 animate-bounce z-50">
          <span>⚠️ Estás trabajando en modo desconectado. Los borradores de bitácoras se guardarán localmente.</span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Desktop Layout (Hidden for PER role as they are mobile-first) */}
        {!isPerRole && (
          <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 bg-white text-slate-800 shadow-sm">
            {/* Header / Brand */}
            <div className="p-6 border-b border-slate-100 flex items-center gap-3">
              <span className="text-xl">🛡️</span>
              <div>
                <h1 className="font-extrabold tracking-tight text-sm text-slate-900">PER 2026-2027</h1>
                <p className="text-[10px] text-slate-500 uppercase font-semibold">
                  {user.role === "ADMIN" ? "Admin Nacional" : `Coordinador - ${user.regionId}`}
                </p>
              </div>
            </div>

            <nav className="flex-1 p-4 space-y-1">
              {currentMenu.map((item) => {
                const isActive = pathname === item.path || (item.path !== "/" && pathname.startsWith(item.path));
                return (
                  <a
                    key={item.name}
                    href={item.path}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                      isActive
                        ? "bg-blue-50 text-blue-900 border-l-4 border-blue-600 shadow-sm"
                        : "hover:bg-slate-100 text-slate-600 hover:text-slate-900"
                    } text-left cursor-pointer`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.name}</span>
                  </a>
                );
              })}
            </nav>

            {/* User Footer Profile */}
            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-900">
                  {user.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate text-slate-800">{user.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full py-2 px-3 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 transition text-center cursor-pointer border border-transparent hover:border-red-200"
              >
                Cerrar Sesión
              </button>
            </div>
          </aside>
        )}

        {/* Main Content Pane */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Header Bar - Desktop & Mobile */}
          <header className="sticky top-0 bg-white border-b border-slate-200 z-30 px-4 py-3 md:px-6 md:py-4 flex items-center justify-between shadow-sm">
            {/* Mobile Header elements */}
            <div className="flex items-center gap-2 md:gap-3">
              {/* Hamburger Button for mobile (coordinators and admins only) */}
              {!isPerRole && (
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="p-1.5 text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition cursor-pointer md:hidden text-sm flex items-center justify-center mr-1"
                  title="Menú"
                >
                  <span className="text-base font-bold">☰</span>
                </button>
              )}
              {/* Brand logo shown on mobile */}
              <div className="md:hidden flex items-center gap-1.5">
                <span className="text-lg">🛡️</span>
                <span className="font-extrabold text-xs tracking-tight text-slate-800">PER APP</span>
              </div>
              <h2 className="hidden md:block font-bold text-lg text-slate-800">
                {pathname === "/admin" || pathname === "/coordinacion" || pathname === "/per"
                  ? "Panel de Control"
                  : currentMenu.find((m) => m.path === pathname)?.name || "Detalle"}
              </h2>
            </div>

            {/* Profile Status & Global Logout */}
            <div className="flex items-center gap-3 text-slate-800">
              
              {/* Notification Bell Dropdown */}
              <div className="relative">
                <button 
                  onClick={() => setIsNotifOpen(!isNotifOpen)}
                  className="p-2 text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition relative cursor-pointer text-sm flex items-center justify-center"
                  title="Notificaciones"
                >
                  <span className={shouldAnimate ? "animate-bell-ring inline-block" : "inline-block"}>🔔</span>
                  {notifications.filter(n => !n.read).length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white font-extrabold text-[9px] w-5 h-5 rounded-full flex items-center justify-center shadow-sm border border-white animate-pulse">
                      {notifications.filter(n => !n.read).length}
                    </span>
                  )}
                </button>
                
                {isNotifOpen && (
                  <div className="absolute right-0 mt-2.5 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-4 space-y-3 text-left">
                    <div className="flex justify-between items-center border-b pb-2">
                      <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Notificaciones</h4>
                      {notifications.filter(n => !n.read).length > 0 && (
                        <button 
                          onClick={async () => {
                            await markAllNotificationsAsReadAction();
                            fetchNotifications();
                          }}
                          className="text-[10px] text-blue-600 font-bold hover:underline cursor-pointer"
                        >
                          Marcar leídas
                        </button>
                      )}
                    </div>
                    
                    <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                      {notifications.map((notif) => (
                        <div 
                          key={notif.id} 
                          onClick={async () => {
                            if (!notif.read) {
                              await markNotificationAsReadAction(notif.id);
                              fetchNotifications();
                            }
                            if (notif.link) {
                              setIsNotifOpen(false);
                              router.push(notif.link);
                            }
                          }}
                          className={`p-2.5 rounded-xl border transition text-[11px] cursor-pointer hover:shadow-sm ${
                            notif.read 
                              ? "bg-white border-slate-100 text-slate-500 hover:bg-slate-50" 
                              : "bg-blue-50/50 border-blue-100 text-slate-850 font-medium hover:bg-blue-50"
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex justify-between items-start gap-2">
                              <span className="font-bold leading-tight block text-slate-800">{notif.title}</span>
                              {!notif.read && (
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0 mt-1" title="Nueva"></span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-500 leading-normal">{notif.message}</p>
                            <span className="text-[8px] text-slate-400 block mt-1">
                              {new Date(notif.createdAt).toLocaleDateString("es-CL")} {new Date(notif.createdAt).toLocaleTimeString("es-CL", { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      ))}
                      
                      {notifications.length === 0 && (
                        <p className="text-center text-slate-400 py-6 text-xs font-semibold">Sin notificaciones nuevas.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {user.isDemo && (
                  <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold border border-amber-300 flex items-center gap-1 shadow-xs">
                    <span>🧪</span> Modo Demo
                  </span>
                )}
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold text-slate-900">{user.name}</p>
                  <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-tight">
                    {user.role === "ADMIN" 
                      ? "Admin Nacional" 
                      : user.role === "COORDINATOR" 
                        ? `Coordinador - ${user.regionId}` 
                        : "Acompañante PER"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Cerrar Sesión"
                className="py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 border border-slate-200"
              >
                <span>🚪</span>
                <span className="hidden md:inline">Cerrar Sesión</span>
              </button>
            </div>
          </header>

          {/* Push Opt-in Banner */}
          {showPushBanner && (
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-medium px-4 py-3 flex items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-lg shrink-0">🔔</span>
                <p className="leading-snug">
                  <span className="font-bold">¿Activar notificaciones?</span>{" "}
                  <span className="hidden sm:inline">Las alertas importantes llegarán aunque la app esté cerrada.</span>
                  <span className="sm:hidden">Recibe alertas con la app cerrada.</span>
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleSubscribePush}
                  disabled={pushStatus === "subscribing"}
                  className="px-3 py-1.5 bg-white text-blue-700 font-bold rounded-lg hover:bg-blue-50 transition cursor-pointer text-[10px] disabled:opacity-50"
                >
                  {pushStatus === "subscribing" ? "Activando..." : "Activar"}
                </button>
                <button
                  onClick={dismissPushBanner}
                  className="p-1 text-white/70 hover:text-white transition cursor-pointer font-bold text-sm"
                  title="No ahora"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Children View Container */}
          <main className={`flex-1 p-4 md:p-6 bg-slate-50 ${isPerRole ? "pb-24" : ""}`}>
            {children}
          </main>
        </div>
      </div>

      {/* Bottom Navigation Menu - Mobile & PER Role ONLY */}
      {isPerRole && (
        <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 py-2 px-6 flex justify-around items-center z-40 shadow-lg md:hidden">
          {currentMenu.map((item) => {
            const isActive = pathname === item.path || item.path.startsWith(pathname + "#");
            return (
              <a
                key={item.name}
                href={item.path}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition ${
                  isActive ? "text-blue-700 font-bold scale-105" : "text-slate-400 hover:text-slate-600"
                } cursor-pointer`}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-[10px]">{item.name}</span>
              </a>
            );
          })}
        </nav>
      )}

      {/* Mobile Drawer Navigation (Slide-in) for non-PER roles */}
      {!isPerRole && isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          
          {/* Drawer Content */}
          <aside className="relative flex flex-col w-72 max-w-[85vw] h-full bg-white text-slate-800 shadow-2xl z-50 animate-slide-in-left">
            {/* Header / Brand */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🛡️</span>
                <div>
                  <h1 className="font-extrabold tracking-tight text-xs text-slate-900">PER 2026-2027</h1>
                  <p className="text-[9px] text-slate-500 uppercase font-bold">
                    {user.role === "ADMIN" ? "Admin Nacional" : `Coordinador - ${user.regionId}`}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 text-slate-405 hover:text-slate-600 rounded-lg hover:bg-slate-50 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            {/* Navigation links */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {currentMenu.map((item) => {
                const isActive = pathname === item.path || (item.path !== "/" && pathname.startsWith(item.path));
                return (
                  <a
                    key={item.name}
                    href={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                      isActive
                        ? "bg-blue-50 text-blue-900 border-l-4 border-blue-600 shadow-sm"
                        : "hover:bg-slate-100 text-slate-600 hover:text-slate-900"
                    } text-left cursor-pointer`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.name}</span>
                  </a>
                );
              })}
            </nav>

            {/* User Footer Profile */}
            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-900 text-xs">
                  {user.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate text-slate-800">{user.name}</p>
                  <p className="text-[9px] text-slate-500 truncate">{user.email}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full py-2 px-3 rounded-lg text-xs font-semibold text-red-650 bg-red-50 hover:bg-red-100 transition text-center cursor-pointer border border-red-200"
              >
                Cerrar Sesión
              </button>
            </div>
          </aside>
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes bellRing {
          0%, 100% { transform: rotate(0); }
          15% { transform: rotate(15deg); }
          30% { transform: rotate(-15deg); }
          45% { transform: rotate(10deg); }
          60% { transform: rotate(-10deg); }
          75% { transform: rotate(5deg); }
          85% { transform: rotate(-5deg); }
        }
        .animate-bell-ring {
          animation: bellRing 0.8s ease-in-out 3;
          transform-origin: top center;
          display: inline-block;
        }
        @keyframes slideInLeft {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-left {
          animation: slideInLeft 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}} />
    </div>
  );
}
