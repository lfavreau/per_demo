export function extractGoogleDriveFileId(value: string): string {
  const clean = value.trim();
  if (/^[A-Za-z0-9_-]{10,}$/.test(clean)) return clean;

  let url: URL;
  try {
    url = new URL(clean);
  } catch {
    throw new Error("Ingresa un enlace válido de Google Drive o el ID del archivo");
  }

  const allowedHosts = new Set(["drive.google.com", "docs.google.com"]);
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname)) {
    throw new Error("El Acta debe ser un archivo de Google Drive o Google Docs");
  }

  const pathMatch = url.pathname.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  const queryId = url.searchParams.get("id");
  const fileId = pathMatch?.[1] || queryId;
  if (!fileId || !/^[A-Za-z0-9_-]{10,}$/.test(fileId)) {
    throw new Error("No se pudo obtener el ID del Acta desde el enlace");
  }

  return fileId;
}
