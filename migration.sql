-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'PER',
    "regionId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PERProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "coordinatorId" TEXT,
    "generation" TEXT NOT NULL,
    "certificationStatus" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "certificationNote" TEXT,
    "certifiedByUserId" TEXT,
    "certifiedAt" DATETIME,
    "ethicsCodeStatus" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "gender" TEXT,
    "inductionCompleted" BOOLEAN NOT NULL DEFAULT false,
    "driveFolderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PERProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PACandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "regionId" TEXT NOT NULL,
    "sourceCenter" TEXT,
    "status" TEXT NOT NULL,
    "preRegistrationFormResponseRef" TEXT,
    "interviewDriveFileId" TEXT,
    "notes" TEXT,
    "convertedToCaseId" TEXT,
    "gender" TEXT,
    "birthDate" DATETIME,
    "ageRange" TEXT,
    "educationLevel" TEXT,
    "employmentStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PACase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "perId" TEXT NOT NULL,
    "coordinatorId" TEXT NOT NULL,
    "candidateId" TEXT,
    "status" TEXT NOT NULL,
    "matchStatus" TEXT NOT NULL DEFAULT 'PROPUESTO',
    "matchRationale" TEXT,
    "actaPrimerEncuentroDriveId" TEXT,
    "intensityLevel" TEXT,
    "genderSelfId" TEXT,
    "birthDate" DATETIME,
    "ageRange" TEXT,
    "educationLevel" TEXT,
    "employmentStatus" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'VINCULACION',
    "startDate" DATETIME,
    "lastSessionDate" DATETIME,
    "stageEnteredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exAnteTaskId" TEXT,
    "exPostTaskId" TEXT,
    "satisfactionTaskId" TEXT,
    "driveFolderId" TEXT,
    "driveFolderRegionId" TEXT,
    "driveFolderPerId" TEXT,
    "driveFolderCaseId" TEXT,
    "driveFolderVinculacionId" TEXT,
    "driveFolderConexionId" TEXT,
    "driveFolderFinalizacionId" TEXT,
    "driveFolderValidadosId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PACase_perId_fkey" FOREIGN KEY ("perId") REFERENCES "PERProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PACase_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "PACandidate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaseStatusHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paCaseId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "byUserId" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseStatusHistory_paCaseId_fkey" FOREIGN KEY ("paCaseId") REFERENCES "PACase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContactAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paCaseId" TEXT NOT NULL,
    "perId" TEXT NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "note" TEXT,
    CONSTRAINT "ContactAttempt_paCaseId_fkey" FOREIGN KEY ("paCaseId") REFERENCES "PACase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "googleResourceId" TEXT,
    "googleUrl" TEXT,
    "phaseId" TEXT NOT NULL,
    "stageId" TEXT,
    "targetRole" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "regionId" TEXT,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "effectiveFrom" DATETIME,
    "templateFileId" TEXT,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "blocksProgress" BOOLEAN NOT NULL DEFAULT false,
    "criticalTask" BOOLEAN NOT NULL DEFAULT false,
    "defaultDueDays" INTEGER,
    "validationRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Instrument_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instrumentId" TEXT,
    "assignedToUserId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "perId" TEXT,
    "paCaseId" TEXT,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "priority" TEXT NOT NULL DEFAULT 'MEDIA',
    "googleUrl" TEXT,
    "driveFileId" TEXT,
    "formResponseRef" TEXT,
    "calendarEventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_paCaseId_fkey" FOREIGN KEY ("paCaseId") REFERENCES "PACase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "note" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IAPRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paCaseId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "perFirstReflection" TEXT,
    "motivations" TEXT,
    "expectations" TEXT,
    "backgroundNotesDriveId" TEXT,
    "jointEvaluation" TEXT,
    "perFinalReflection" TEXT,
    "driveDocId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IAPRecord_paCaseId_fkey" FOREIGN KEY ("paCaseId") REFERENCES "PACase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IAPDomainMap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "iapRecordId" TEXT NOT NULL,
    "recoveryDomainId" TEXT NOT NULL,
    "needs" TEXT,
    "strengths" TEXT,
    "importance" TEXT,
    CONSTRAINT "IAPDomainMap_iapRecordId_fkey" FOREIGN KEY ("iapRecordId") REFERENCES "IAPRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IAPGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "iapRecordId" TEXT NOT NULL,
    "recoveryDomainId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "resources" TEXT,
    "activities" TEXT,
    "deadline" DATETIME,
    "result" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IAPGoal_iapRecordId_fkey" FOREIGN KEY ("iapRecordId") REFERENCES "IAPRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paCaseId" TEXT NOT NULL,
    "perId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "sessionNumber" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "modality" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "recoveryDomainId" TEXT,
    "iapGoalId" TEXT,
    "summary" TEXT NOT NULL,
    "agreements" TEXT,
    "difficulties" TEXT,
    "nextAction" TEXT,
    "perEmotion" TEXT,
    "perReflection" TEXT,
    "attendance" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'VINCULACION',
    "status" TEXT NOT NULL DEFAULT 'BORRADOR',
    "coordinatorFeedbackId" TEXT,
    "offlineDraftId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SessionLog_paCaseId_fkey" FOREIGN KEY ("paCaseId") REFERENCES "PACase" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Supervision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "coordinatorId" TEXT NOT NULL,
    "perId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "calendarEventId" TEXT,
    "modality" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "casesReviewedSerialized" TEXT NOT NULL,
    "agreements" TEXT,
    "observations" TEXT,
    "driveActaId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "coordinatorId" TEXT NOT NULL,
    "perId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "requiresCorrection" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ENVIADA',
    "taskId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Feedback_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "perId" TEXT,
    "paCaseId" TEXT,
    "taskId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABIERTA',
    "resolvedByUserId" TEXT,
    "resolutionNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TrainingRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "perId" TEXT NOT NULL,
    "activityName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "evidenceDriveId" TEXT,
    "score" REAL,
    CONSTRAINT "TrainingRecord_perId_fkey" FOREIGN KEY ("perId") REFERENCES "PERProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DriveFileRef" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driveFileId" TEXT NOT NULL,
    "driveFolderId" TEXT,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "version" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CalendarEventRef" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "calendarEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "regionId" TEXT,
    "perId" TEXT,
    "paCaseId" TEXT,
    "outcome" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "keys" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "ip" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "scope" TEXT
);

-- CreateTable
CREATE TABLE "CaseStageHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paCaseId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "enteredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" DATETIME,
    CONSTRAINT "CaseStageHistory_paCaseId_fkey" FOREIGN KEY ("paCaseId") REFERENCES "PACase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "instrumentVersion" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "isFinalVigente" BOOLEAN NOT NULL DEFAULT false,
    "driveFolderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentRecord_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "PACase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentRecord_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentRecord_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodKey" TEXT NOT NULL,
    "regionId" TEXT,
    "cutOffDate" DATETIME NOT NULL,
    "kpisJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "NetworkDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "contactPerson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "NetworkActivation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "networkDeviceId" TEXT NOT NULL,
    "caseId" TEXT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "driveDocId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NetworkActivation_networkDeviceId_fkey" FOREIGN KEY ("networkDeviceId") REFERENCES "NetworkDevice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NetworkActivation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "PACase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Phase5Record" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "participantsCount" INTEGER NOT NULL,
    "driveUrl" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PERProfile_userId_key" ON "PERProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PACase_code_key" ON "PACase"("code");

