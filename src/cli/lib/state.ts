import path from "node:path";
import { promises as fsp } from "node:fs";

export interface DeployedFunction {
  name: string;
  id: string;
  publicAccess: boolean;
}

export interface DeployedObject {
  bucket: string;
  object: string;
}

export interface DeploymentState {
  deployedAt: string;
  folderId?: string;
  cloudId?: string;
  functions: DeployedFunction[];
  uploadedObjects: DeployedObject[];
  gateway?: {
    id: string;
    domain: string;
  };
}

const STATE_FILENAME = "state.json";

export function stateFilePath(outputDir: string): string {
  return path.join(outputDir, STATE_FILENAME);
}

export async function readState(outputDir: string): Promise<DeploymentState | null> {
  try {
    const raw = await fsp.readFile(stateFilePath(outputDir), "utf8");

    return JSON.parse(raw) as DeploymentState;
  } catch {
    return null;
  }
}

export async function writeState(outputDir: string, state: DeploymentState): Promise<void> {
  await fsp.writeFile(stateFilePath(outputDir), JSON.stringify(state, null, 2), "utf8");
}

export async function deleteState(outputDir: string): Promise<void> {
  await fsp.rm(stateFilePath(outputDir), { force: true });
}
