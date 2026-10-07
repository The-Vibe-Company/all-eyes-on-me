import { cp, lstat, realpath, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** `dest` is not a place a snapshot may write to. */
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
 * what was there. `dest` must sit inside `<aeomDir>/runs/`, both as written
 * and once symlinks are resolved, and must not overlap what it copies. If
 * `dest` is itself a symlink, the link is replaced, never what it points to.
 */
export async function snapshot(aeomDir: string, dest: string): Promise<void> {
  const runs = join(resolve(aeomDir), "runs");
  const target = resolve(dest);
  if (!isInside(target, runs) || target === runs) throw new SnapshotPathError(`${dest} is not inside ${join(aeomDir, "runs")}: snapshots only go there, such as ${join(aeomDir, "runs", "<run>", "before")}.`);
  const realTarget = await canonical(target);
  if (!isInside(realTarget, await canonical(runs))) throw new SnapshotPathError(`${dest} leads outside ${join(aeomDir, "runs")} through a symlink.`);
  for (const part of ["captures", "reports"]) {
    const realPart = await canonical(join(aeomDir, part));
    if (isInside(realTarget, realPart) || isInside(realPart, realTarget)) throw new SnapshotPathError(`${dest} overlaps ${join(aeomDir, part)}, which it copies.`);
  }

  // rm on the path as written removes a symlink itself, not its target.
  const isLink = await lstat(target).then((s) => s.isSymbolicLink(), () => false);
  await rm(target, { recursive: !isLink, force: true });
  for (const part of ["captures", "reports"]) {
    await cp(join(aeomDir, part), join(target, part), { recursive: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
