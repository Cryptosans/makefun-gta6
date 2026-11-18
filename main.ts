// Solara Bay — build entry point.
//
// This script assembles the submission bundle for the make.fun bounty:
// it copies the playable game into the output directory, copies the
// screenshots alongside it, and asks the kit's buildDossier helper to
// write the dossier.json manifest that describes the whole bundle.
//
// Run it with Node 22:
//
//   MAKEFUN_OUTPUT_DIR=/tmp/solara-out node main.ts
//
// When MAKEFUN_OUTPUT_DIR is not set the bundle lands in /output.
// The script only ever creates directories and copies files; it never
// deletes anything, so re-running it over an existing output is safe.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the directory that holds this file.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));

// Where the finished bundle goes. The grading harness sets
// MAKEFUN_OUTPUT_DIR; local runs fall back to /output.
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');
const outGameDir = join(outDir, 'game');
const outShotsDir = join(outDir, 'screenshots');

// Create the output tree first so every copy below has a home.
mkdirSync(outDir, { recursive: true });
mkdirSync(outShotsDir, { recursive: true });

// Ship the game exactly as it is in the repo.
cpSync(gameDir, outGameDir, { recursive: true });

// Ship the screenshots when the repo has a screenshots folder.
if (existsSync(shotsDir)) {
  cpSync(shotsDir, outShotsDir, { recursive: true });
}

// Ask the kit to describe the bundle. buildDossier hands back the
// manifest as raw bytes, so write them straight to disk untouched.
const dossier = await buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log('Solara Bay bundle written to ' + outDir);
