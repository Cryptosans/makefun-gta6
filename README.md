# Solara Bay — Open-World Crime

[![make.fun](https://make.fun/badge/competition/gta6-01)](https://make.fun/c/gta6-01)
[![make.fun entry](https://make.fun/badge/entry/gta6-01)](https://make.fun/c/gta6-01)
[![Play on make.fun](https://make.fun/badge/play/gta6-01)](https://make.fun/c/gta6-01)

**Solara Bay** is an original open-world crime game that runs entirely offline in a
desktop browser. Built for the [make.fun](https://make.fun) **Make GTA 6** bounty
(`gta6-01`). No Rockstar names, characters, map or assets — the city, the crew, the
story and the soundtrack are all original.

## The game

You are **Rico Vega**, a wheelman fresh out of the Solara docks. The Delacroix crew
runs this sun-soaked vice-coast city — and they just put a price on your head.
Steal cars, outrun the S.B.P.D., run the jobs, and take the Bay back.

- **Open world on foot and by car** — a 5×5-block procedural city with a beach,
  a marina pier and a yacht, plus a central plaza with a fountain.
- **Traffic & pedestrians** — 14 AI cars that follow the road grid, turn at
  intersections and brake for the car ahead; 26 pedestrians who stroll the
  sidewalks and flee from crimes.
- **Steal any car** — walk up to traffic (or a police cruiser) and press **E**.
- **Wanted level 0–5** — crimes raise the heat; police cars ram you and foot
  cops chase, punch and shoot. Lose the heat by breaking line of sight.
- **6 story missions** — Hot Wheels, Courier Run, Ghost Protocol, Street Justice,
  The Vault, and King of Solara — with beacons, a compass, timers and cash rewards.
- **Combat** — crosshair shooting with tracers, gang enemies with health bars,
  cash pickups, and a shotgun-free but very loud pistol.
- **HUD + live minimap** — cash, health, wanted stars, clock, objective text,
  compass, speedometer, and a real-time minimap with traffic, police and markers.
- **Save / continue** — progress autosaves to localStorage; continue from the menu.
- **Sound** — fully synthesized WebAudio: engine hum, sirens, gunshots, crashes,
  and a synthwave pad loop. No audio files. **M** mutes.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse drag | Look around |
| Shift | Sprint |
| E | Steal / enter car · exit car · interact |
| Left click | Shoot |
| Space | Handbrake |
| P / Esc | Pause |
| M | Mute sound |

## Play it

Serve `game/` with any static file server and open `index.html`:

```sh
cd game && python3 -m http.server 8080
# open http://localhost:8080
```

No build step, no network requests: three.js r160 is vendored under
`game/vendor/three.module.min.js`, and every texture and sound is generated in code.

## Structure

```
game/
  index.html            page, HUD, menus
  style.css             HUD + menu styling
  vendor/three.module.min.js   three.js r160 (vendored)
  src/
    main.js             boot
    game.js             loop, camera, menus, interaction, save, debug hooks
    city.js             streets, buildings, beach, pier, landmarks
    vehicles.js         car factory, traffic AI, arcade driving
    pedestrians.js      sidewalk walkers, fleeing, knock-downs
    police.js           wanted level, pursuit cars, foot cops
    combat.js           shooting, gang enemies, tracers, pickups
    missions.js         the six-mission story
    hud.js              DOM readouts + live minimap
    player.js           Rico on foot, enter/exit cars
    input.js            keyboard + mouse
    audio.js            synthesized WebAudio (engine, sirens, music)
    save.js             localStorage save / continue
    utils.js            math + collision helpers
main.ts                 the make.fun entry program (copies game/ + screenshots/,
                        writes dossier.json — runs twice into the same output)
screenshots/           4 screenshots of the game itself
```

## Entry

`main.ts` (Node 22, standard library only) hands the game in: it copies `game/`
and `screenshots/` to `/output` (`MAKEFUN_OUTPUT_DIR` outside the grader) and
writes `/output/dossier.json` with the vendored `vendor/makefun-game.ts` library.

## License

MIT — see [LICENSE](LICENSE).
