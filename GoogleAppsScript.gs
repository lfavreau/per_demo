/**
 * GOOGLE APPS SCRIPT (Code.gs)
 * ----------------------------------------------------
 * Copia este código en https://script.google.com/
 * 
 * Este script actúa como una API que Next.js llama para crear
 * carpetas en Google Drive, generar documentos desde plantillas,
 * crear eventos en Google Calendar y sincronizar planillas en Google Sheets.
 */

// 1. FUNCIÓN DE CONFIGURACIÓN INICIAL (Ejecutar primero en script.google.com)
// Crea la carpeta maestra, la planilla espejo, la plantilla de IAP y el calendario.
function setupPilotDrive() {
  var props = PropertiesService.getScriptProperties();
  
  // 1.1 Crear carpeta maestra del pilotaje
  var rootFolder = DriveApp.createFolder("PER Pilotaje 2026-2027");
  props.setProperty("ROOT_FOLDER_ID", rootFolder.getId());
  
  // 1.2 Crear subcarpetas
  var docTemplatesFolder = rootFolder.createFolder("Plantillas de Documentos");
  var reportsFolder = rootFolder.createFolder("Planillas y Reportes");
  props.setProperty("TEMPLATES_FOLDER_ID", docTemplatesFolder.getId());
  
  // 1.3 Crear plantilla de documento IAP
  var templateDoc = DocumentApp.create("Plantilla IAP - Itinerario de Acompañamiento");
  var docFile = DriveApp.getFileById(templateDoc.getId());
  docTemplatesFolder.addFile(docFile);
  DriveApp.getRootFolder().removeFile(docFile); // Quitar de la raíz
  props.setProperty("TEMPLATE_DOC_ID", templateDoc.getId());
  
  // 1.4 Crear planilla espejo
  var masterSheet = SpreadsheetApp.create("Planilla Espejo - Casos PER 2026-2027");
  var sheetFile = DriveApp.getFileById(masterSheet.getId());
  reportsFolder.addFile(sheetFile);
  DriveApp.getRootFolder().removeFile(sheetFile); // Quitar de la raíz
  
  var activeSheet = masterSheet.getActiveSheet();
  activeSheet.setName("Casos Activos");
  // Escribir cabeceras
  activeSheet.appendRow([
    "Código Caso", 
    "Región", 
    "PER Asignado", 
    "Fase Actual", 
    "Tipo de Ingreso", 
    "Última Sesión", 
    "Creado El"
  ]);
  // Darle un formato inicial a las cabeceras
  activeSheet.getRange("A1:G1").setFontWeight("bold").setBackground("#f0f4f8");
  props.setProperty("SPREADSHEET_ID", masterSheet.getId());
  
  // 1.5 Crear calendario de supervisiones
  var calendarName = "Supervisiones PER 2026-2027";
  var calendar = CalendarApp.createCalendar(calendarName);
  props.setProperty("CALENDAR_ID", calendar.getId());
  
  Logger.log("=== CONFIGURACIÓN COMPLETADA CON ÉXITO ===");
  Logger.log("ID Carpeta Raíz: " + rootFolder.getId());
  Logger.log("ID Plantilla Doc IAP: " + templateDoc.getId());
  Logger.log("ID Planilla de Reportes: " + masterSheet.getId());
  Logger.log("ID Calendario de Supervisiones: " + calendar.getId());
  Logger.log("Enlace Carpeta Drive: " + rootFolder.getUrl());
  
  return "Ok";
}

// 2. ENTRADA HTTP POST (Next.js se comunica con esta función)
function doPost(e) {
  var responseHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    var result;
    
    if (action === "createCaseFolderHierarchy") {
      result = createCaseFolderHierarchy(data.caseCode, data.regionId, data.perId);
    } else if (action === "createIAPDoc") {
      result = createIAPDoc(data.caseCode, data.folderId);
    } else if (action === "scheduleSupervision") {
      result = scheduleSupervision(data.perName, data.coordName, data.dateStr);
    } else if (action === "syncMirrorSheet") {
      result = syncMirrorSheet(data.cases);
    } else if (action === "copyToValidados") {
      result = copyToValidados(data.fileId, data.destFolderId, data.caseCode, data.instrumentName, data.version);
    } else {
      throw new Error("Acción no soportada: " + action);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, data: result }))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

// 3. FUNCIONES OPERATIVAS

// Crea la jerarquía de carpetas Drive para un nuevo caso
function createCaseFolderHierarchy(caseCode, regionId, perId) {
  var props = PropertiesService.getScriptProperties();
  var rootFolderId = props.getProperty("ROOT_FOLDER_ID");
  if (!rootFolderId) throw new Error("No se ha ejecutado setupPilotDrive en Google Script");
  
  var rootFolder = DriveApp.getFolderById(rootFolderId);
  
  // Buscar o crear carpeta de la Región
  var regionFolder;
  var regionFolders = rootFolder.getFoldersByName(regionId);
  if (regionFolders.hasNext()) {
    regionFolder = regionFolders.next();
  } else {
    regionFolder = rootFolder.createFolder(regionId);
  }
  
  // Buscar o crear carpeta del PER
  var perFolder;
  var perFolderLabel = "PER_" + perId;
  var perFolders = regionFolder.getFoldersByName(perFolderLabel);
  if (perFolders.hasNext()) {
    perFolder = perFolders.next();
  } else {
    perFolder = regionFolder.createFolder(perFolderLabel);
  }
  
  // Crear carpeta única del Caso
  var caseFolder = perFolder.createFolder(caseCode);
  
  // Crear subcarpetas metodológicas
  var vincFolder = caseFolder.createFolder("Vinculacion");
  var conexFolder = caseFolder.createFolder("Conexion");
  var finalFolder = caseFolder.createFolder("Finalizacion");
  var validadosFolder = caseFolder.createFolder("Validados");
  
  return {
    regionFolderId: regionFolder.getId(),
    perFolderId: perFolder.getId(),
    caseFolderId: caseFolder.getId(),
    vinculacionFolderId: vincFolder.getId(),
    conexionFolderId: conexFolder.getId(),
    finalizacionFolderId: finalFolder.getId(),
    validadosFolderId: validadosFolder.getId(),
    folderUrl: caseFolder.getUrl()
  };
}

// Copia la plantilla IAP en la carpeta de Conexión del caso
function createIAPDoc(caseCode, folderId) {
  var props = PropertiesService.getScriptProperties();
  var templateDocId = props.getProperty("TEMPLATE_DOC_ID");
  if (!templateDocId) throw new Error("No se encuentra la plantilla IAP configurada");
  
  var templateFile = DriveApp.getFileById(templateDocId);
  var destinationFolder = DriveApp.getFolderById(folderId);
  
  var copiedFile = templateFile.makeCopy("IAP - Caso " + caseCode, destinationFolder);
  
  return {
    docId: copiedFile.getId(),
    docUrl: copiedFile.getUrl()
  };
}

// Registra una supervisión en Google Calendar y devuelve el enlace de Meet
function scheduleSupervision(perName, coordName, dateStr) {
  var props = PropertiesService.getScriptProperties();
  var calendarId = props.getProperty("CALENDAR_ID");
  if (!calendarId) throw new Error("No se encuentra el calendario configurado");
  
  var calendar = CalendarApp.getCalendarById(calendarId);
  var date = new Date(dateStr);
  var endDate = new Date(date.getTime() + 60 * 60 * 1000); // 1 hora de duración
  
  var eventTitle = "Supervisión de Dupla: PER " + perName + " y Coord " + coordName;
  var event = calendar.createEvent(eventTitle, date, endDate, {
    description: "Reunión técnica semanal obligatoria para revisión de duplas de acompañamiento."
  });
  
  // Nota: En la versión gratuita/normal de Google Calendar, Google Meet se genera automáticamente 
  // en cuentas Workspace. Si no genera Meet nativamente, devolvemos el enlace del evento en el calendario.
  return {
    eventId: event.getId(),
    eventUrl: "https://calendar.google.com/calendar/event?eid=" + Utilities.base64EncodeWebSafe(event.getId())
  };
}

// Sincroniza la planilla espejo de Google Sheets con los casos activos
function syncMirrorSheet(cases) {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty("SPREADSHEET_ID");
  if (!spreadsheetId) throw new Error("No se encuentra la planilla espejo configurada");
  
  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var sheet = spreadsheet.getSheetByName("Casos Activos");
  
  // Limpiar datos previos manteniendo la cabecera
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).clearContent();
  }
  
  // Agregar cada caso
  for (var i = 0; i < cases.length; i++) {
    var c = cases[i];
    sheet.appendRow([
      c.code,
      c.regionId,
      c.perName,
      c.status,
      c.type,
      c.lastSessionDate ? new Date(c.lastSessionDate).toLocaleDateString("es-CL") : "Sin sesiones",
      new Date(c.createdAt).toLocaleDateString("es-CL")
    ]);
  }
  
  return {
    success: true,
    rowsSynced: cases.length
  };
}

// Copia un entregable aprobado a la carpeta de /Validados con su control de versión
function copyToValidados(fileId, destFolderId, caseCode, instrumentName, version) {
  var file = DriveApp.getFileById(fileId);
  var destFolder = DriveApp.getFolderById(destFolderId);
  
  var dateStr = new Date().toISOString().split("T")[0];
  var newFileName = instrumentName.replace(/[^a-zA-Z0-9]/g, "_") + "_" + caseCode + "_v" + version + "_" + dateStr;
  
  var copiedFile = file.makeCopy(newFileName, destFolder);
  
  return {
    newFileId: copiedFile.getId(),
    newRevisionId: "rev_" + Utilities.getUuid().substring(0, 8),
    fileName: copiedFile.getName(),
    fileUrl: copiedFile.getUrl()
  };
}
