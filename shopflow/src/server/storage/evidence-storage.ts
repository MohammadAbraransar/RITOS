import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export interface StorageProvider {
  save(buffer: Buffer, originalFilename: string, mime: string): Promise<{
    storedPath: string;
    sha256: string;
    sizeBytes: number;
    mime: string;
    filename: string;
  }>;
  get(storedPath: string): Promise<Buffer>;
}

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
  }

  async save(buffer: Buffer, originalFilename: string, mime: string) {
    await fs.mkdir(this.baseDir, { recursive: true });
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const ext = path.extname(originalFilename) || "";
    const uniqueFilename = `${Date.now()}-${hash.substring(0, 12)}${ext}`;
    const destination = path.join(this.baseDir, uniqueFilename);

    await fs.writeFile(destination, buffer);

    return {
      storedPath: `/uploads/${uniqueFilename}`,
      sha256: hash,
      sizeBytes: buffer.length,
      mime,
      filename: originalFilename,
    };
  }

  async get(storedPath: string): Promise<Buffer> {
    const filename = path.basename(storedPath);
    const fullPath = path.join(this.baseDir, filename);
    return fs.readFile(fullPath);
  }
}

export const storage: StorageProvider = new LocalStorageProvider();
