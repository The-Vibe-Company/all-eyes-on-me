import { cp, rm } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

/** `dest` would wipe or recurse into what it copies. */
export class SnapshotPathError extends Error {}

const isInside = (child: string, parent: string) => {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep) && rel !== "..");
};

/**
 * Copies `<aeomDir>/captures` and `<aeomDir>/reports` into `dest`, replacing
 * what was there. Refuses a `dest` that contains `aeomDir` (it would be
 * deleted) or that sits inside the captures or reports it copies.
 */
export async function snapshot(aeomDir: string, dest: string): Promise<void> {
  const source = resolve(aeomDir);
  const target = resolve(dest);
  if (isInside(source, target)) throw new SnapshotPathError(`${dest} contains ${aeomDir}: replacing it would delete what it should copy.`);
  for (const part of ["captures", "reports"]) {
    if (isInside(target, join(source, part))) throw new SnapshotPathError(`${dest} is inside ${join(aeomDir, part)}, which it copies.`);
  }
  await rm(target, { recursive: true, force: true });
  for (const part of ["captures", "reports"]) {
    await cp(join(source, part), join(target, part), { recursive: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
