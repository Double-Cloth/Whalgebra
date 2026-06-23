import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export async function temporaryDirectory(t) {
    const directory = await mkdtemp(path.join(os.tmpdir(), "whalgebra-tools-"));
    t.after(() => rm(directory, {recursive: true, force: true}));
    return directory;
}
