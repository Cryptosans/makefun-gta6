# makefun-gta6

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Cryptosans/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Cryptosans/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solara Bay** — an original open-world crime game built for make.fun's "Make GTA 6" bounty ($1,666 in USDC). Rio Vela is back in Solara Bay, broke and owed: steal cars, outrun the PD, and work six story missions from a first stolen sedan to the big score at Solara National Bank. The city, characters, story, art and sound are all original — no Rockstar material.

## What is in the game

- A drivable 3D city: streets, towers, a beach, a bay and a pier, built procedurally with three.js (vendored, offline)
- On foot and by car, with car stealing (E) — parked cars and traffic cars
- Traffic (14 cars) and pedestrians (26 locals) living on the road grid
- Wanted level 0–5 with police cruisers that chase, ram and bust you
- 6 story missions: First Wheels, Bay Runner, Hot Pursuit, Dockside Brawl, The Pickup, The Big Score
- Combat: fists and a pistol, plus hostile Viper thugs
- HUD with health, cash, wanted stars, speed and a live minimap
- Start screen, pause menu with a mission list, save / continue via localStorage
- Synthesized WebAudio sound: engine hum, sirens, gunshots, mission jingles — no audio files

## Run it

```sh
npx serve game
# open http://localhost:3000 in desktop Chrome — no network needed, everything is local
```

Or any static server: `python3 -m http.server --directory game 8080`.

## Controls

WASD move / drive · E enter car / start mission · F or click attack · Q switch weapon · R reload · Shift run · Esc pause · N mute · drag mouse to orbit the camera

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with `vendor/makefun-game.ts`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=Cryptosans&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
