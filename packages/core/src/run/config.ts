import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** `.aeom/config.json`: how to reach the project's app, so commands need no flags. */
export interface ProjectConfig {
  url?: string;
  start?: string;
}

export async function loadConfig(projectDir = process.cwd()): Promise<ProjectConfig> {
  try {
    const { url, start } = JSON.parse(await readFile(join(projectDir, ".aeom", "config.json"), "utf8")) as ProjectConfig;
    return { ...(url ? { url } : {}), ...(start ? { start } : {}) };
  } catch {
    return {};
  }
}
