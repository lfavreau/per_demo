"use client";

import { useEffect } from "react";

// Global ref so AppShell can access the SW registration for push subscription
let swRegistration: ServiceWorkerRegistration | null = null;
export function getSwRegistration() {
  return swRegistration;
}

export default function PWARegistration() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      // Register SW in both dev and prod for push testing
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          swRegistration = registration;
          console.log("Service Worker registered with scope:", registration.scope);
        })
        .catch((error) => {
          console.error("Service Worker registration failed:", error);
        });
    }
  }, []);

  return null;
}
