/**
 * API GOOGLE WORKSPACE - PER 2026-2027
 *
 * Propiedades obligatorias del script:
 *   API_SHARED_SECRET, ROOT_FOLDER_ID, TEMPLATE_DOC_ID,
 *   SPREADSHEET_ID y CALENDAR_ID.
 *
 * Desplegar como Web App, ejecutar como el usuario que despliega y usar
 * exclusivamente la URL de producción terminada en /exec.
 */

var REQUEST_MAX_AGE_MS = 5 * 60 * 1000;
var PROVISIONING_PREFIX = "PER_PROVISIONING:";
var MANAGED_PREFIX = "PER_MANAGED_CASE:";

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Solicitud sin cuerpo JSON");
    }

    var data = JSON.parse(e.postData.contents);
    authenticateRequest_(data);

    var result;
    switch (data.action) {
      case "createCaseFolderHierarchy":
        result = createCaseFolderHierarchy(
          data.caseCode,
          data.regionId,
          data.perId,
          data.requestId
        );
        break;
      case "commitCaseFolderHierarchy":
        result = commitCaseFolderHierarchy(
          data.caseCode,
          data.caseFolderId,
          data.provisioningRequestId
        );
        break;
      case "rollbackCaseFolderHierarchy":
        result = rollbackCaseFolderHierarchy(
          data.caseCode,
          data.caseFolderId,
          data.provisioningRequestId
        );
        break;
      case "createIAPDoc":
        result = createIAPDoc(data.caseCode, data.folderId, data.requestId);
        break;
      case "commitIAPDoc":
        result = commitIAPDoc(data.fileId, data.documentRequestId);
        break;
      case "rollbackIAPDoc":
        result = rollbackIAPDoc(data.fileId, data.documentRequestId);
        break;
      case "scheduleSupervision":
        result = scheduleSupervision(
          data.perName,
          data.coordName,
          data.dateStr,
          data.durationMinutes,
          data.requestId
        );
        break;
      case "rollbackSupervision":
        result = rollbackSupervision(data.eventId, data.schedulingRequestId);
        break;
      case "syncMirrorSheet":
        result = syncMirrorSheet(data.cases);
        break;
      case "copyToValidados":
        result = copyToValidados(
          data.fileId,
          data.destFolderId,
          data.caseCode,
          data.instrumentName,
          data.version,
          data.requestId
        );
        break;
      case "verifyDriveFile":
        result = verifyDriveFile(data.fileId, data.expectedCaseFolderId);
        break;
      case "copyActaPrimerEncuentro":
        result = copyActaPrimerEncuentro(
          data.fileId,
          data.destinationFolderId,
          data.caseCode,
          data.requestId
        );
        break;
      case "commitValidatedCopy":
        result = commitValidatedCopy(data.fileId, data.copyRequestId);
        break;
      case "rollbackValidatedCopy":
        result = rollbackValidatedCopy(data.fileId, data.copyRequestId);
        break;
      default:
        throw new Error("Acción no soportada");
    }

    return jsonResponse_({ success: true, data: result });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ success: false, error: String(error.message || error) });
  }
}

/**
 * Ejecutar manualmente una sola vez antes de publicar el Web App.
 * Autoriza y comprueba Drive, Docs, Sheets y Calendar sin crear recursos.
 */
function authorizeWorkspace() {
  var props = PropertiesService.getScriptProperties();
  var required = [
    "API_SHARED_SECRET",
    "ROOT_FOLDER_ID",
    "TEMPLATE_DOC_ID",
    "SPREADSHEET_ID",
    "CALENDAR_ID"
  ];
  var values = {};

  required.forEach(function (key) {
    var value = props.getProperty(key);
    if (!value) {
      throw new Error("Falta la propiedad del script: " + key);
    }
    values[key] = value;
  });

  if (values.API_SHARED_SECRET.length < 32) {
    throw new Error("API_SHARED_SECRET debe tener al menos 32 caracteres");
  }

  var rootFolder = DriveApp.getFolderById(values.ROOT_FOLDER_ID);
  var templateFile = DriveApp.getFileById(values.TEMPLATE_DOC_ID);
  var spreadsheet = SpreadsheetApp.openById(values.SPREADSHEET_ID);
  var calendar = CalendarApp.getCalendarById(values.CALENDAR_ID);

  if (!calendar) {
    throw new Error("CALENDAR_ID no corresponde a un calendario accesible");
  }

  var result = {
    success: true,
    rootFolder: rootFolder.getName(),
    template: templateFile.getName(),
    spreadsheet: spreadsheet.getName(),
    calendar: calendar.getName()
  };
  console.log(JSON.stringify(result));
  return result;
}

function authenticateRequest_(data) {
  var expected = PropertiesService.getScriptProperties().getProperty("API_SHARED_SECRET");
  if (!expected || expected.length < 32) {
    throw new Error("API_SHARED_SECRET no está configurado correctamente");
  }
  if (!data.apiSecret || !constantTimeEquals_(String(data.apiSecret), expected)) {
    throw new Error("Solicitud no autorizada");
  }

  var requestTime = new Date(data.timestamp).getTime();
  if (!requestTime || Math.abs(Date.now() - requestTime) > REQUEST_MAX_AGE_MS) {
    throw new Error("Solicitud vencida o con fecha inválida");
  }
  if (!data.requestId || !/^[A-Za-z0-9_-]{10,120}$/.test(String(data.requestId))) {
    throw new Error("requestId inválido");
  }

  var cache = CacheService.getScriptCache();
  var cacheKey = "request_" + data.requestId;
  if (cache.get(cacheKey)) {
    throw new Error("Solicitud repetida");
  }
  cache.put(cacheKey, "1", 600);
}

function constantTimeEquals_(left, right) {
  var mismatch = left.length ^ right.length;
  var length = Math.max(left.length, right.length);
  for (var i = 0; i < length; i++) {
    mismatch |= (left.charCodeAt(i % left.length) || 0) ^
      (right.charCodeAt(i % right.length) || 0);
  }
  return mismatch === 0;
}

function jsonResponse_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function requireText_(value, label) {
  var clean = String(value || "").trim();
  if (!clean || clean.length > 160) throw new Error(label + " inválido");
  return clean;
}

function safeFolderName_(value) {
  return requireText_(value, "Nombre")
    .replace(/[\\/:*?"<>|#%{}~&]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function getSingleChildFolder_(parent, name) {
  var iterator = parent.getFoldersByName(name);
  if (!iterator.hasNext()) return null;
  var folder = iterator.next();
  if (iterator.hasNext()) {
    throw new Error("Existen carpetas duplicadas llamadas " + name + ". Corrígelas antes de continuar.");
  }
  return folder;
}

function getOrCreateChildFolder_(parent, name) {
  var existing = getSingleChildFolder_(parent, name);
  return existing || parent.createFolder(name);
}

function createCaseFolderHierarchy(caseCode, regionId, perId, requestId) {
  caseCode = safeFolderName_(caseCode);
  regionId = safeFolderName_(regionId);
  perId = safeFolderName_(perId);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var rootFolderId = PropertiesService.getScriptProperties().getProperty("ROOT_FOLDER_ID");
    if (!rootFolderId) throw new Error("ROOT_FOLDER_ID no está configurado");

    var rootFolder = DriveApp.getFolderById(rootFolderId);
    var regionFolder = getOrCreateChildFolder_(rootFolder, regionId);
    var perFolder = getOrCreateChildFolder_(regionFolder, "PER_" + perId);
    var caseFolder = getSingleChildFolder_(perFolder, caseCode);
    var createdCaseFolder = false;

    if (!caseFolder) {
      caseFolder = perFolder.createFolder(caseCode);
      caseFolder.setDescription(PROVISIONING_PREFIX + requestId);
      createdCaseFolder = true;
    }

    var vinculacion = getOrCreateChildFolder_(caseFolder, "01_Vinculacion");
    var conexion = getOrCreateChildFolder_(caseFolder, "02_Conexion");
    var finalizacion = getOrCreateChildFolder_(caseFolder, "03_Finalizacion");
    var validados = getOrCreateChildFolder_(caseFolder, "99_Validados");

    return {
      regionFolderId: regionFolder.getId(),
      perFolderId: perFolder.getId(),
      caseFolderId: caseFolder.getId(),
      vinculacionFolderId: vinculacion.getId(),
      conexionFolderId: conexion.getId(),
      finalizacionFolderId: finalizacion.getId(),
      validadosFolderId: validados.getId(),
      folderUrl: caseFolder.getUrl(),
      createdCaseFolder: createdCaseFolder,
      requestId: requestId
    };
  } finally {
    lock.releaseLock();
  }
}

function commitCaseFolderHierarchy(caseCode, caseFolderId, provisioningRequestId) {
  caseCode = safeFolderName_(caseCode);
  var folder = DriveApp.getFolderById(requireText_(caseFolderId, "caseFolderId"));
  if (folder.getName() !== caseCode) throw new Error("La carpeta no corresponde al caso");

  var description = folder.getDescription() || "";
  var expected = PROVISIONING_PREFIX + provisioningRequestId;
  if (description === expected || description.indexOf(MANAGED_PREFIX) === 0) {
    folder.setDescription(MANAGED_PREFIX + caseCode);
    return { committed: true };
  }
  throw new Error("La carpeta no pertenece a esta provisión");
}

function rollbackCaseFolderHierarchy(caseCode, caseFolderId, provisioningRequestId) {
  caseCode = safeFolderName_(caseCode);
  var folder = DriveApp.getFolderById(requireText_(caseFolderId, "caseFolderId"));
  if (folder.getName() !== caseCode) throw new Error("La carpeta no corresponde al caso");
  if ((folder.getDescription() || "") !== PROVISIONING_PREFIX + provisioningRequestId) {
    throw new Error("No se puede eliminar una carpeta confirmada o ajena");
  }
  folder.setTrashed(true);
  return { rolledBack: true };
}

function createIAPDoc(caseCode, folderId, requestId) {
  caseCode = safeFolderName_(caseCode);
  var templateId = PropertiesService.getScriptProperties().getProperty("TEMPLATE_DOC_ID");
  if (!templateId) throw new Error("TEMPLATE_DOC_ID no está configurado");

  var destination = DriveApp.getFolderById(requireText_(folderId, "folderId"));
  var fileName = caseCode + "_IAP_v01";
  var matches = destination.getFilesByName(fileName);
  if (matches.hasNext()) {
    var existing = matches.next();
    if (matches.hasNext()) throw new Error("Existen IAP duplicados para " + caseCode);
    return {
      docId: existing.getId(),
      docUrl: existing.getUrl(),
      createdDocument: false,
      requestId: requestId
    };
  }

  var copied = DriveApp.getFileById(templateId).makeCopy(fileName, destination);
  copied.setDescription(PROVISIONING_PREFIX + requestId);
  return {
    docId: copied.getId(),
    docUrl: copied.getUrl(),
    createdDocument: true,
    requestId: requestId
  };
}

function commitIAPDoc(fileId, documentRequestId) {
  var file = DriveApp.getFileById(requireText_(fileId, "fileId"));
  if ((file.getDescription() || "") !== PROVISIONING_PREFIX + documentRequestId) {
    throw new Error("El IAP no pertenece a esta provisión");
  }
  file.setDescription("PER_MANAGED_IAP");
  return { committed: true };
}

function rollbackIAPDoc(fileId, documentRequestId) {
  var file = DriveApp.getFileById(requireText_(fileId, "fileId"));
  if ((file.getDescription() || "") !== PROVISIONING_PREFIX + documentRequestId) {
    throw new Error("No se puede eliminar un IAP confirmado o ajeno");
  }
  file.setTrashed(true);
  return { rolledBack: true };
}

function scheduleSupervision(perName, coordName, dateStr, durationMinutes, requestId) {
  perName = requireText_(perName, "Nombre PER");
  coordName = requireText_(coordName, "Nombre coordinador");
  var calendarId = PropertiesService.getScriptProperties().getProperty("CALENDAR_ID");
  if (!calendarId) throw new Error("CALENDAR_ID no está configurado");

  var start = new Date(dateStr);
  if (isNaN(start.getTime())) throw new Error("Fecha de supervisión inválida");
  var minutes = Number(durationMinutes);
  if (!minutes || minutes < 15 || minutes > 480) throw new Error("Duración inválida");
  var end = new Date(start.getTime() + minutes * 60000);
  var title = "Supervisión PER: " + perName + " / " + coordName;
  var calendar = CalendarApp.getCalendarById(calendarId);
  if (!calendar) throw new Error("No se puede acceder al calendario configurado");

  var existing = calendar.getEvents(
    new Date(start.getTime() - 60000),
    new Date(end.getTime() + 60000)
  ).filter(function(event) {
    return event.getTitle() === title &&
      Math.abs(event.getStartTime().getTime() - start.getTime()) < 1000;
  });
  if (existing.length > 1) throw new Error("Existen supervisiones duplicadas en Calendar");

  var event = existing[0];
  var createdEvent = false;
  if (!event) {
    event = calendar.createEvent(title, start, end, {
      description: "Reunión técnica de supervisión PER."
    });
    event.setTag("PER_REQUEST_ID", requestId);
    createdEvent = true;
  }

  return {
    eventId: event.getId(),
    eventUrl: "https://calendar.google.com/calendar/event?eid=" +
      Utilities.base64EncodeWebSafe(event.getId()),
    createdEvent: createdEvent,
    requestId: requestId
  };
}

function rollbackSupervision(eventId, schedulingRequestId) {
  var calendarId = PropertiesService.getScriptProperties().getProperty("CALENDAR_ID");
  var calendar = CalendarApp.getCalendarById(calendarId);
  var event = calendar.getEventById(requireText_(eventId, "eventId"));
  if (!event) return { rolledBack: true, alreadyMissing: true };
  if (event.getTag("PER_REQUEST_ID") !== schedulingRequestId) {
    throw new Error("No se puede eliminar un evento confirmado o ajeno");
  }
  event.deleteEvent();
  return { rolledBack: true };
}

function syncMirrorSheet(cases) {
  if (!Array.isArray(cases)) throw new Error("cases debe ser un arreglo");
  var spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!spreadsheetId) throw new Error("SPREADSHEET_ID no está configurado");

  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var sheet = spreadsheet.getSheetByName("Casos Activos");
  if (!sheet) sheet = spreadsheet.insertSheet("Casos Activos");

  var rows = [["Código Caso", "Región", "PER Asignado", "Estado", "Tipo", "Última Sesión", "Creado El"]];
  cases.forEach(function(item) {
    rows.push([
      item.code,
      item.regionId,
      item.perName,
      item.status,
      item.type,
      item.lastSessionDate || "",
      item.createdAt
    ]);
  });

  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.getRange(1, 1, 1, rows[0].length).setFontWeight("bold").setBackground("#f0f4f8");
  return { success: true, rowsSynced: cases.length };
}

function verifyDriveFile(fileId, expectedCaseFolderId) {
  var file = DriveApp.getFileById(requireText_(fileId, "fileId"));
  if (file.isTrashed()) throw new Error("El archivo entregado está en la papelera");

  var expectedId = requireText_(expectedCaseFolderId, "expectedCaseFolderId");
  var parents = file.getParents();
  var belongsToCase = false;
  while (parents.hasNext()) {
    var current = parents.next();
    for (var depth = 0; depth < 4 && current; depth++) {
      if (current.getId() === expectedId) {
        belongsToCase = true;
        break;
      }
      var upper = current.getParents();
      current = upper.hasNext() ? upper.next() : null;
    }
    if (belongsToCase) break;
  }
  if (!belongsToCase) throw new Error("El archivo no pertenece a la carpeta del caso");

  return {
    fileId: file.getId(),
    fileName: file.getName(),
    fileUrl: file.getUrl(),
    mimeType: file.getMimeType()
  };
}

function copyActaPrimerEncuentro(fileId, destinationFolderId, caseCode, requestId) {
  caseCode = safeFolderName_(caseCode);
  var source = DriveApp.getFileById(requireText_(fileId, "fileId"));
  if (source.isTrashed()) throw new Error("El Acta de Primer Encuentro está en la papelera");
  var destination = DriveApp.getFolderById(
    requireText_(destinationFolderId, "destinationFolderId")
  );
  var fileName = caseCode + "_Acta_Primer_Encuentro";
  var matches = destination.getFilesByName(fileName);
  if (matches.hasNext()) {
    var existing = matches.next();
    if (matches.hasNext()) throw new Error("Existen Actas duplicadas para " + caseCode);
    return {
      newFileId: existing.getId(),
      newRevisionId: "existing",
      fileName: existing.getName(),
      fileUrl: existing.getUrl(),
      createdCopy: false,
      requestId: requestId
    };
  }

  var copied = source.makeCopy(fileName, destination);
  copied.setDescription(PROVISIONING_PREFIX + requestId);
  return {
    newFileId: copied.getId(),
    newRevisionId: Utilities.getUuid(),
    fileName: copied.getName(),
    fileUrl: copied.getUrl(),
    createdCopy: true,
    requestId: requestId
  };
}

function copyToValidados(fileId, destFolderId, caseCode, instrumentName, version, requestId) {
  caseCode = safeFolderName_(caseCode);
  instrumentName = safeFolderName_(instrumentName).replace(/\s+/g, "_");
  version = requireText_(version, "Versión").replace(/[^A-Za-z0-9._-]/g, "_");

  var destination = DriveApp.getFolderById(requireText_(destFolderId, "destFolderId"));
  var date = Utilities.formatDate(new Date(), "America/Santiago", "yyyy-MM-dd");
  var fileName = caseCode + "_" + instrumentName + "_v" + version + "_" + date;
  var matches = destination.getFilesByName(fileName);
  if (matches.hasNext()) {
    var existing = matches.next();
    if (matches.hasNext()) throw new Error("Existen copias validadas duplicadas");
    return {
      newFileId: existing.getId(),
      newRevisionId: "existing",
      fileName: existing.getName(),
      fileUrl: existing.getUrl(),
      createdCopy: false,
      requestId: requestId
    };
  }

  var copied = DriveApp.getFileById(requireText_(fileId, "fileId")).makeCopy(fileName, destination);
  copied.setDescription(PROVISIONING_PREFIX + requestId);
  return {
    newFileId: copied.getId(),
    newRevisionId: Utilities.getUuid(),
    fileName: copied.getName(),
    fileUrl: copied.getUrl(),
    createdCopy: true,
    requestId: requestId
  };
}

function commitValidatedCopy(fileId, copyRequestId) {
  var file = DriveApp.getFileById(requireText_(fileId, "fileId"));
  if ((file.getDescription() || "") !== PROVISIONING_PREFIX + copyRequestId) {
    throw new Error("La copia no pertenece a esta provisión");
  }
  file.setDescription("PER_VALIDATED_DOCUMENT");
  return { committed: true };
}

function rollbackValidatedCopy(fileId, copyRequestId) {
  var file = DriveApp.getFileById(requireText_(fileId, "fileId"));
  if ((file.getDescription() || "") !== PROVISIONING_PREFIX + copyRequestId) {
    throw new Error("No se puede eliminar una copia confirmada o ajena");
  }
  file.setTrashed(true);
  return { rolledBack: true };
}
