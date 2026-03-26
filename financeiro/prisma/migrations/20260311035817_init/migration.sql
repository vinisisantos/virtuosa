-- CreateTable
CREATE TABLE "PayrollImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "competenceMonth" INTEGER NOT NULL,
    "competenceYear" INTEGER NOT NULL,
    "uploadDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStatus" TEXT NOT NULL DEFAULT 'completed',
    "rawExtractedText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PayrollEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payrollImportId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "netSalary" REAL NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "paymentDate" DATETIME,
    "confidenceScore" REAL NOT NULL DEFAULT 1.0,
    "extractionSource" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollEntry_payrollImportId_fkey" FOREIGN KEY ("payrollImportId") REFERENCES "PayrollImport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollImport_competenceMonth_competenceYear_fileName_key" ON "PayrollImport"("competenceMonth", "competenceYear", "fileName");
