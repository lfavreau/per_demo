import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex-1 flex flex-col justify-center items-center px-4 py-12 bg-[#f0f4f8] relative overflow-hidden">
      {/* Subtle background overlay */}
      <div className="absolute top-0 left-0 w-full h-full bg-slate-900/[0.02] pointer-events-none z-0"></div>

      <Suspense fallback={<div className="text-sm text-slate-500">Cargando portal institucional...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
