import { EvidenceType } from "@prisma/client";
import { storage } from "@/server/storage/evidence-storage";

// Upload rules for customer evidence, shared by ticket creation and "add evidence" (API contract, not config).
export const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_FILES = 5;

export type SavedEvidence = {
  storedPath: string;
  sha256: string;
  sizeBytes: number;
  mime: string;
  filename: string;
  type: EvidenceType;
};

export type UploadResult = { saved: SavedEvidence[] } | { error: { code: string; message: string } };

/** Validate every file first, then store them; nothing is stored if any file is rejected. */
export async function saveEvidenceFiles(files: Array<File | string>): Promise<UploadResult> {
  const real = files.filter((f): f is File => typeof f !== "string" && !!f.name);
  if (real.length > MAX_FILES) {
    return { error: { code: "VALIDATION_ERROR", message: `Maximum ${MAX_FILES} evidence files allowed` } };
  }
  for (const file of real) {
    if (!ALLOWED_MIMES.includes(file.type)) {
      return { error: { code: "INVALID_FILE_TYPE", message: `File type ${file.type} is not allowed. Only JPEG, PNG, WEBP, and PDF are supported.` } };
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return { error: { code: "FILE_TOO_LARGE", message: `File ${file.name} exceeds maximum limit of 5 MB` } };
    }
  }
  const saved: SavedEvidence[] = [];
  for (const file of real) {
    const stored = await storage.save(Buffer.from(await file.arrayBuffer()), file.name, file.type);
    saved.push({ ...stored, type: file.type === "application/pdf" ? EvidenceType.DOCUMENT : EvidenceType.IMAGE });
  }
  return { saved };
}

/** Prisma create rows for saved files; ids are random so files uploaded together never collide. */
export function evidenceRows(saved: SavedEvidence[]) {
  return saved.map((f) => ({
    id: `EVD-${crypto.randomUUID()}`,
    type: f.type,
    filename: f.filename,
    storedPath: f.storedPath,
    mime: f.mime,
    sizeBytes: f.sizeBytes,
    sha256: f.sha256,
  }));
}
