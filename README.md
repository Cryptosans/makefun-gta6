[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Cryptosans/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Cryptosans/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
<sub>Entered on [make.fun](https://make.fun/?ref=nstczpc4&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

# Solara Bay — Open World Crime

An original open-world crime game for make.fun's **"Make GTA 6"** bounty (`gta6-01`).
Rico Vale just rolled into **Solara Bay** — a sun-soaked coastal city invented for this
game — with $250 and a reputation to build. Work for fixer Mara Solis: steal cars, run
packages, dodge the Bay PD, settle scores on the pier, and become King of the Bay.

## Play

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

Open `http://localhost:8080` in desktop Chrome. No build step, no network request:
everything the game loads is a file under `game/` (three.js r128 is vendored as
`game/vendor/three.min.js`; every texture is drawn at runtime on canvas, every sound
is synthesised live with WebAudio).

## What's in the city

- **A city to explore on foot and by car** — grid streets, downtown towers, beach,
  pier, marina and a lighthouse; drive with arcade handling or walk, run and jump.
- **Traffic & pedestrians** — cars drive the road graph (slowing for traffic ahead),
  pedestrians walk the sidewalks and flee gunfire and speeding cars.
- **Steal & drive** — press `E` near any parked or moving car. The driver of a moving
  car bails and runs; stealing in the open raises your wanted level.
- **Wanted level & police** — 5 stars, police cars that chase and ram, officers on foot
  who arrest you, pot-shots at 3+ stars, heat that cools off when you lay low.
  Get busted or wasted and you wake up at Solara General, lighter in the pocket.
- **6 story missions** — Fresh Wheels, Bay Runner (timed delivery), Heat Check
  (get hot, then go cold), Pier Payback (4 Dock Rats), The Getaway (3-star escort),
  King of the Bay (3 drops + the lighthouse). Cash rewards, dialogue, objective
  markers and a save that persists in the browser.
- **Combat** — fists (`F`) and a pistol (left click) with tracers and muzzle flash.
- **HUD & minimap** — cash, health, wanted stars, mission objective with distance,
  speedometer, live minimap (traffic, police, pickups, mission marker).
- **Polish** — start screen, pause menu, save/continue, synthesised engine hum,
  sirens, gunshots and a bassline loop, damage flash, bust meter, camera orbit/zoom.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk / drive |
| Mouse drag | Look around (wheel zooms) |
| E | Steal / enter / exit car |
| F | Punch |
| Left click | Shoot pistol |
| Shift / Space | Run / jump |
| M | Start next mission |
| H | Horn · C camera distance · P / Esc pause |

## Layout

```
game/
  index.html            page + HUD DOM
  style.css             HUD and menu styling
  vendor/three.min.js   three.js r128 (vendored library)
  src/
    util.js             seeded RNG, math, DOM helpers
    config.js           world layout, palette, names
    textures.js         canvas-drawn building/road/sand textures
    audio.js            WebAudio synth: engine, siren, shots, music
    city.js             the city: roads, towers, beach, pier, lighthouse
    vehicles.js         car models, traffic AI, driving physics
    pedestrians.js      person models, sidewalk walkers, gang
    police.js           wanted system, chases, busts
    combat.js           punching, pistol, tracers, damage
    missions.js         the six-mission story
    player.js           Rico on foot and behind the wheel, camera rig
    hud.js              HUD, minimap, toasts, dialogue, menus
    save.js             localStorage save / load
    main.js             boot, game loop, state machine, shot setups
main.ts                 entry program: copies game/ + screenshots/ to /output,
                        writes /output/dossier.json
screenshots/            4 real renders of the game in headless Chromium
```

## Originality

Solara Bay, Rico Vale, Mara Solis, the Dock Rats, every street name, vehicle name,
texture and sound in this game were invented for it. Nothing is taken from Rockstar
Games, Grand Theft Auto, or any other commercial game.

## License

MIT — see [LICENSE](LICENSE).
