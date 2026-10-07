import { cp, realpath, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** `dest` would wipe or recurse into what it copies. */
export class SnapshotPathError extends Error {}

/** Whether `child` is `parent` or below it, by whole path components. */
export function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  if (rel === "") return true;
  if (isAbsolute(rel)) return false; // another drive on Windows
  return rel !== ".." && !rel.startsWith(`..${sep}`);
}

/** The real path of `path`, resolving symlinks in every part that exists. */
async function canonical(path: string): Promise<string> {
  const absolute = resolve(path);
  try {
    return await realpath(absolute);
  } catch {
    const parent = dirname(absolute);
    return parent === absolute ? absolute : join(await canonical(parent), basename(absolute));
  }
}

/**
 * Copies `<aeomDir>/captures` and `<aeomDir>/reports` into `dest`, replacing
 * what was there. Refuses a `dest` that contains `aeomDir` (it would be
 * deleted) or that sits inside the captures or reports it copies, comparing
 * real paths so a symlink cannot hide either case.
 */
export async function snapshot(aeomDir: string, dest: string): Promise<void> {
  const source = await canonical(aeomDir);
  const target = await canonical(dest);
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
