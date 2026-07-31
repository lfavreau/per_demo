// Next.js implementa redirect() lanzando una excepción especial. Los server actions que envuelven
// redirect() en try/catch deben distinguir ese "error" del mecanismo real de negocio y relanzarlo.
export function isNextRedirect(err: unknown): boolean {
  const e = err as { message?: string; digest?: string } | null | undefined;
  return !!e && (e.message === "NEXT_REDIRECT" || (typeof e.digest === "string" && e.digest.startsWith("NEXT_REDIRECT")));
}
