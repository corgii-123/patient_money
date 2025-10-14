import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const outDir = join(process.cwd(), "out");

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, ".nojekyll"), "");
