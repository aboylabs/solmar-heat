# Solmar Heat

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/aboylabs/solmar-heat/rank.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![Reward](https://make.fun/badge/gta6-01/aboylabs/solmar-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original 2D top-down open-world crime game. Sun-soaked coastal city, no
borrowed names, places, characters, art or music — everything is drawn on
canvas and synthesized with WebAudio.

You play **Rex Dalton**, a driver back in Solmar City with fifty bucks and no
ride. Steal cars, outrun the Solmar PD, run jobs for the crew, and crack the
Solmar Reserve vault.

## How to run

```sh
node serve.ts
```

Then open <http://localhost:8080> in desktop Chrome. The game is plain static
files under `game/` — no build step, no network requests, everything offline.

## How it is entered

This repository is a [make.fun](https://make.fun/bounty/gta6-01) entry for the
**Make GTA 6** bounty (`gta6-01`). `main.ts` (Node 22, standard library only)
copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with the vendored `vendor/makefun-game.ts` library:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## What's in the game

- **A living city** — 3200×2400 Solmar City with six districts (Downtown,
  Marina, Old Town, Hills, Docks, Beach), a road grid with intersections,
  traffic, pedestrians, palms, and a turquoise sea along the beach.
- **Driving** — five car types (sedan, taxi, sports car, truck, police
  cruiser) with distinct speed, acceleration and handling; steal any car
  with `E`, including pulling the driver out.
- **Wanted system** — 0–5 stars on a continuous heat value. Heat decays when
  you lie low and stay unseen. Foot cops chase and arrest; cruisers ram your
  car. Get busted and you pay $100 bail.
- **Combat** — fists and a pistol (buy it at Ironworks Arms, $300; ammo
  $50/box), plus ammo pickups around the city. The Viper gang defends a deal
  at the docks.
- **Six story missions** — steal your first wheels, a timed 100-second
  delivery, a shakedown of the debtor Finn, a three-star getaway, a dockside
  shootout, and the Big Score at the Solmar Reserve vault. Briefings,
  objective markers on the map, minimap and a world arrow, cash rewards.
- **Side activity** — ten hidden cash packages ($100 each) scattered across
  the districts.
- **Shops** — Ironworks Arms (pistol + ammo) and the Solmar Spray Shop
  (repair your car, drop one star of heat).
- **HUD & screens** — health, cash, wanted stars, clock, district, objective,
  speed, minimap, start screen, pause menu with mission list, WASTED and
  BUSTED screens, and a victory screen after mission six.
- **Save** — pause-menu save and auto-save on mission complete, stored in
  `localStorage` under `solmar-heat-save`; Continue on the title screen
  restores it.
- **Feel** — particles, floating text, skid marks, screen shake, warm day
  lighting, vignette, and a fully synthesized soundtrack (engine hum, sirens,
  gunshots, bass loop). `M` mutes.

## Controls

| Key | Action |
| --- | --- |
| WASD / Arrows | Move on foot, drive |
| Shift | Sprint |
| Mouse | Aim |
| Left click | Punch / shoot |
| E | Enter car, steal car, interact |
| P / Esc | Pause |
| Enter | Start mission / confirm |
| M | Mute |

## Screenshots

`?shot=start`, `?shot=play`, `?shot=chase` and `?shot=end` jump to staged
states (title, driving with a mission, a police chase, victory) for
screenshots. A playtest debug hook lives at `window.SH.debug`
(`setCash`, `setWanted`, `completeMission`, `teleport`, `givePistol`,
`startMission`) — playtesting only, no effect on normal play.

## License

MIT — see `LICENSE`.
