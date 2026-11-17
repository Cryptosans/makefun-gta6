// Solara Bay — the gta6-01 entry program (Node 22, standard library only).
//
// The game lives in this repository's game/ folder: plain static files that a
// desktop browser serves and plays offline (game/index.html plus its scripts
// and the vendored three.js build under game/vendor/). This program hands the
// entry in: it copies game/ and screenshots/ from beside this file into the
// output directory and writes /output/dossier.json with the make.fun library
// from vendor/makefun-game.ts, so the scorer and the judge read exactly what
// the repository holds.
//
// Play it locally first with `node serve.ts` (http://localhost:8080), then:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The gate's own caps (reference/gate.json): the text cap shapes the dossier
// bytes; the rest refuse an entry the scorer would refuse anyway (over 4
// screenshots or one over 256 KiB; game/ over 993 files or 48 MiB in all, or a
// path under game/ over 1000 bytes — game/ shares /output's 1000-entry cap
// with screenshots/ and dossier.json, so the game leaves them room).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
