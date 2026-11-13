#!/usr/bin/env bun
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const output = join(root, "for_prod");

function run(args, cwd) {
  const result = Bun.spawnSync([process.execPath, ...args], {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) {
    throw new Error(`Command failed: bun ${args.join(" ")}`);
  }
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

run(["run", "build:frontend"], root);

await rm(output, { recursive: true, force: true });
await mkdir(join(output, "server"), { recursive: true });
await mkdir(join(output, "packages/shared"), { recursive: true });
await mkdir(join(output, "frontend"), { recursive: true });

const rootPackage = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
await writeJson(join(output, "package.json"), {
  name: "faster-chat-production",
  version: rootPackage.version,
  private: true,
  type: "module",
  workspaces: ["server", "packages/shared"],
  scripts: { start: "cd server && bun run start" },
});

for (const workspace of ["server", "packages/shared"]) {
  const manifest = JSON.parse(await readFile(join(root, workspace, "package.json"), "utf8"));
  delete manifest.devDependencies;
  if (workspace === "server") {
    manifest.scripts = { init: manifest.scripts.init, start: manifest.scripts.start };
  }
  await writeJson(join(output, workspace, "package.json"), manifest);
}

await cp(join(root, "server/src"), join(output, "server/src"), {
  recursive: true,
  filter: (source) => source !== join(root, "server/src/test"),
});
await cp(join(root, "packages/shared/src"), join(output, "packages/shared/src"), {
  recursive: true,
});
await cp(join(root, "frontend/dist"), join(output, "frontend/dist"), { recursive: true });
for (const file of ["bun.lock", "LICENSE", "production_README.md"]) {
  await cp(join(root, file), join(output, file));
}

await writeFile(
  join(output, "server/.env.example"),
  `NODE_ENV=production
PORT=18700
HOST=127.0.0.1
TRUST_PROXY=true
APP_URL=[need domain]
DATABASE_URL=sqlite://./data/chat.db

# The encryption key is generated on the first start.
# Configure provider API keys in Admin > Providers.
`
);

const cache = await mkdtemp(join(tmpdir(), "faster-chat-production-cache-"));
try {
  run(
    ["install", "--lockfile-only", "--offline", "--ignore-scripts", "--cache-dir", cache],
    output
  );
} finally {
  await rm(cache, { recursive: true, force: true });
}

console.log(`Production upload files prepared in ${output}`);
