import { cp, rm } from "node:fs/promises";
import { join } from "node:path";

/** Copies `<aeomDir>/captures` and `<aeomDir>/reports` into `dest`, replacing what was there. */
export async function snapshot(aeomDir: string, dest: string): Promise<void> {
  await rm(dest, { recursive: true, force: true });
  for (const part of ["captures", "reports"]) {
    await cp(join(aeomDir, part), join(dest, part), { recursive: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
