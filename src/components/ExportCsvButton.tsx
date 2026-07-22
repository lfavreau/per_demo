"use client";

interface AuditLogItem {
  id: string;
  userId: string;
  role: string;
  action: string;
  entityType: string;
  entityId: string;
  newValue: string | null;
  previousValue: string | null;
  timestamp: Date | string;
}

interface ExportCsvButtonProps {
  logs: AuditLogItem[];
}

export default function ExportCsvButton({ logs }: ExportCsvButtonProps) {
  const handleExport = () => {
    if (logs.length === 0) {
      alert("No hay registros para exportar.");
      return;
    }

    // Define CSV headers
    const headers = [
      "Fecha",
      "Usuario ID",
      "Rol",
      "Accion",
      "Entidad Tipo",
      "Entidad ID",
      "Valor Anterior",
      "Valor Nuevo"
    ];

    // Map log entries to CSV rows
    const rows = logs.map((log) => {
      const date = new Date(log.timestamp).toLocaleString("es-CL");
      
      // Clean values to avoid breaking CSV format
      const cleanString = (val: string | null) => {
        if (!val) return '""';
        return `"${val.replace(/"/g, '""').replace(/\r?\n|\r/g, " ")}"`;
      };

      return [
        `"${date}"`,
        `"${log.userId}"`,
        `"${log.role}"`,
        `"${log.action}"`,
        `"${log.entityType}"`,
        `"${log.entityId}"`,
        cleanString(log.previousValue),
        cleanString(log.newValue)
      ].join(",");
    });

    // Combine headers and rows
    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");

    // Create a Blob and trigger a download link
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    // Format date string for the filename
    const dateStr = new Date().toISOString().split("T")[0];
    
    link.setAttribute("href", url);
    link.setAttribute("download", `bitacora_auditoria_${dateStr}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <button
      onClick={handleExport}
      className="py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition duration-150 shadow text-xs cursor-pointer flex items-center gap-1.5 border border-emerald-700"
    >
      <span>📥</span> Exportar a CSV
    </button>
  );
}
