# Dustline Protocol

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/putrisilsi213-boop/dustline-protocol/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/putrisilsi213-boop/dustline-protocol/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical first-person shooter in the style Counter-Strike made famous,
built on three.js: two teams, short rounds won by eliminating the other team or by
planting and detonating a device, money between rounds to buy weapons, and gunfire
where accuracy counts more than speed. It is Counter-Strike-STYLE, never a copy:
its own map (a container yard at dusk), art, sounds and names.

Sable attacks — plant the device at Site A or Site B, or wipe Vermilion out.
Vermilion defends — hold the sites, defuse the device, run the clock out. First
to 5 rounds takes the match. Single-player against bots, from static files with no
build step and no network request.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome and click to play.

## How it plays

- **Gunplay:** hitscan weapons with headshot multipliers, recoil and spread that
  punish firing on the move, acceleration, crouching and collision with the map.
- **Arsenal:** AR-7 Vulture rifle, PDW-9 Hornet SMG, LR-80 Falcon sniper (right-click
  to scope), P9 Sidearm and the Frag-5 grenade, bought with round earnings in the
  buy menu (B between rounds), plus a Kevlar vest.
- **Tactics:** a bomb to plant and defuse, money earned each round and spent in a
  buy menu, bots that follow routes through the map, hold positions, react to what
  they see and hear, push sites in groups and converge to defuse.
- **Map:** Dustline Yard — a 48 x 36 m container yard at dusk with two long lanes,
  a mid spine, two bomb sites and a waypoint graph the bots route on.
- **HUD:** health and armor, ammunition, money, round timer, team score, kill feed,
  bomb status and a live minimap.

## Layout

- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to `/output` and
  writes `dossier.json`.
- `game/index.html` — the page, HUD and import map for three.js.
- `game/src/` — the game, one module per job: `main.js` (loop), `state.js` (the
  one store), `world.js` (map, waypoints, line of sight), `agent.js` (movement),
  `weapons.js` (arsenal), `combat.js` (shooting, grenades), `bots.js` (bot AI),
  `rounds.js` (round flow and economy), `hud.js`, `input.js`, `audio.js`
  (procedural WebAudio sounds) and `palette.js` / `rng.js`.
- `game/vendor/three/` — three.js 0.187.0, byte for byte from npm.
- `screenshots/` — real renders of the game in a browser.

---

<sub>Entered on [make.fun](https://make.fun/?ref=d6m6thj3&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
