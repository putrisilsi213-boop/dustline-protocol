// DUSTLINE PROTOCOL: boot and the one loop. A fixed 60 Hz simulation feeds a render
// at the display's rate. ?shot=start|play|end with &seed=N sets up a deterministic
// frame for a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createMatchState, PHASE, logEvent } from './state.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createAgentBody } from './agent.js';
import { createWeaponSet, WEAPONS } from './weapons.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createRounds, BUY_ITEMS } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 22, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene, random);
const match = createMatchState(seed);
const audio = createAudio();
const combat = createCombat(scene, world, match, audio, random);
const bots = createBots(world, combat, match, audio, random);
const rounds = createRounds(match, audio, (text, kind) => logEvent(match, text, kind));
const hud = createHud(world);
const weaponSet = createWeaponSet(camera);

const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const shootDir = new THREE.Vector3();
const muzzlePos = new THREE.Vector3();
const plantBar = document.getElementById('plant-bar');
const plantFill = document.getElementById('plant-fill');
const spectateLabel = document.getElementById('spectate');

// The player: an agent body, a weapon set, and an invisible hitbox the bots shoot at.
const playerBody = createAgentBody(world.colliders, world.spawns.sable[0].x, world.spawns.sable[0].z, 0);
const player = {
  name: 'You',
  team: 'sable',
  isPlayer: true,
  body: playerBody.body,
  move: playerBody,
  health: 100,
  armor: 0,
  alive: true,
  kills: 0,
  deaths: 0,
  primaryId: 'vulture',
  primaryMag: WEAPONS.vulture.mag,
  primaryReserve: WEAPONS.vulture.reserve,
  sidearmMag: WEAPONS.p9.mag,
  sidearmReserve: WEAPONS.p9.reserve,
  grenades: 0,
  currentSlot: 'primary',
  plantProgress: 0,
  spectating: null,
};
const hitboxMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true });
const hitboxGroup = new THREE.Group();
const torsoHit = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), hitboxMaterial);
torsoHit.position.y = 1.06;
torsoHit.userData = { agent: player, part: 'body' };
const headHit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), hitboxMaterial);
headHit.position.y = 1.58;
headHit.userData = { agent: player, part: 'head' };
const legsHit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.28), hitboxMaterial);
legsHit.position.y = 0.35;
legsHit.userData = { agent: player, part: 'body' };
hitboxGroup.add(torsoHit, headHit, legsHit);
scene.add(hitboxGroup);
player.hitMeshes = [torsoHit, headHit, legsHit];
player.mesh = hitboxGroup;
combat.registerAgent(player);
bots.createTeam();

const allAgents = [player, ...bots.bots];
let killfeedSeen = 0;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let lastShotAt = -99;
let buyOpen = false;

function syncWeaponHud() {
  const def = weaponSet.def();
  hud.setAmmo(weaponSet.state.mag, weaponSet.state.reserve, player.grenades, def.name);
  hud.setHealth(player.health, player.armor);
  hud.setMoney(match.money.sable);
}

function equipSlot(slot) {
  if (slot === 'primary') {
    player.currentSlot = 'primary';
    weaponSet.equip(player.primaryId, player.primaryMag, player.primaryReserve, player.grenades);
  } else if (slot === 'sidearm') {
    player.currentSlot = 'sidearm';
    weaponSet.equip('p9', player.sidearmMag, player.sidearmReserve, player.grenades);
  } else if (slot === 'grenade') {
    player.currentSlot = 'grenade';
    weaponSet.equip('frag', 1, 0, player.grenades);
  }
  syncWeaponHud();
}

function storeWeaponState() {
  const def = weaponSet.def();
  if (player.currentSlot === 'primary') {
    player.primaryMag = weaponSet.state.mag;
    player.primaryReserve = weaponSet.state.reserve;
  } else if (player.currentSlot === 'sidearm') {
    player.sidearmMag = weaponSet.state.mag;
    player.sidearmReserve = weaponSet.state.reserve;
  }
  player.grenades = weaponSet.state.grenades;
}

function resetPlayerForRound() {
  const spawn = world.spawns.sable[0];
  const diedLastRound = !player.alive;
  player.body.position.set(spawn.x, 0, spawn.z);
  player.body.velocity.set(0, 0, 0);
  player.body.yaw = spawn.yaw;
  player.body.pitch = 0;
  player.health = 100;
  if (diedLastRound) player.armor = 0;
  player.alive = true;
  player.spectating = null;
  player.plantProgress = 0;
  player.primaryMag = WEAPONS[player.primaryId].mag;
  player.primaryReserve = WEAPONS[player.primaryId].reserve;
  player.sidearmMag = WEAPONS.p9.mag;
  player.sidearmReserve = WEAPONS.p9.reserve;
  player.grenades = 0;
  equipSlot('primary');
  hitboxGroup.rotation.z = 0;
  hitboxGroup.position.y = 0;
}

function startMatch() {
  match.round = 1;
  match.score = { sable: 0, vermilion: 0 };
  match.money = { sable: 800, vermilion: 800 };
  match.matchWinner = null;
  match.roundWinner = null;
  match.kills = [];
  match.events = [];
  player.primaryId = 'vulture';
  player.kills = 0;
  player.deaths = 0;
  player.armor = 0;
  killfeedSeen = 0;
  resetPlayerForRound();
  bots.resetRound(1);
  rounds.startBuyPhase();
  hud.setScore(0, 0, 1);
  hud.showBanner('ROUND 1', 'Sable attacks — plant the device at A or B', 3000);
  syncWeaponHud();
}

function resetRound() {
  resetPlayerForRound();
  bots.resetRound(match.round);
  rounds.startBuyPhase();
  hud.setScore(match.score.sable, match.score.vermilion, match.round);
  hud.showBanner(`ROUND ${match.round}`, match.round % 2 === 0 ? 'Sable attacks — plant the device at A or B' : 'Sable attacks — plant the device at A or B', 2600);
  syncWeaponHud();
}

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (match.phase === PHASE.MENU || match.phase === PHASE.MATCH_END) {
    startMatch();
    hud.hideOverlay();
    input.requestLock();
  } else {
    hud.hideOverlay();
    input.requestLock();
  }
});

hud.onBuy((itemId) => {
  if (rounds.buy(player, itemId)) {
    if (itemId === 'vulture' || itemId === 'hornet' || itemId === 'falcon') equipSlot('primary');
    weaponSet.state.grenades = player.grenades;
    audio.reload();
    syncWeaponHud();
    hud.renderBuyMenu(match.money.sable, BUY_ITEMS, ownedItems());
  }
});

function ownedItems() {
  return {
    [player.primaryId]: true,
    armor: player.armor > 0,
  };
}

const input = createInput(renderer.domElement, (locked) => {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    if (buyOpen) {
      buyOpen = false;
      hud.hideBuyMenu();
    }
  } else if (match.phase === PHASE.LIVE || match.phase === PHASE.BUY) {
    if (match.phase === PHASE.BUY && !buyOpen) {
      openBuyMenu();
    } else if (!player.alive) {
      // Dead players spectate without the overlay.
    } else {
      hud.showOverlay('paused', {});
    }
  }
});

function openBuyMenu() {
  buyOpen = true;
  hud.renderBuyMenu(match.money.sable, BUY_ITEMS, ownedItems());
  if (document.pointerLockElement) document.exitPointerLock();
}

function closeBuyMenu() {
  buyOpen = false;
  hud.hideBuyMenu();
}

document.getElementById('buy-deploy').addEventListener('click', () => {
  closeBuyMenu();
  input.requestLock();
});

function syncCamera() {
  if (player.alive) {
    camera.position.set(player.body.position.x, player.body.position.y + player.body.eye, player.body.position.z);
    camera.rotation.set(player.body.pitch, player.body.yaw, 0, 'YXZ');
  } else if (player.spectating) {
    const target = player.spectating;
    camera.position.set(target.body.position.x, target.body.position.y + target.body.eye, target.body.position.z);
    camera.rotation.set(target.body.pitch, target.body.yaw, 0, 'YXZ');
  }
  hitboxGroup.position.set(player.body.position.x, player.body.position.y, player.body.position.z);
  hitboxGroup.rotation.y = player.body.yaw;
  for (const bot of bots.bots) {
    if (!bot.mesh) continue;
    bot.mesh.position.set(bot.body.position.x, bot.body.position.y, bot.body.position.z);
    bot.mesh.rotation.y = bot.body.yaw;
    bot.mesh.scale.y = bot.body.crouching ? 0.72 : 1;
  }
}

function aimAt(point) {
  const dx = point.x - player.body.position.x;
  const dy = point.y - (player.body.position.y + player.body.eye);
  const dz = point.z - player.body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  player.body.yaw = Math.atan2(-dx, -dz);
  player.body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function playerShoot() {
  const def = weaponSet.def();
  if (def.id === 'frag') {
    if (!weaponSet.takeRound()) { audio.dryClick(); return false; }
    camera.getWorldDirection(shootDir);
    muzzlePos.copy(camera.position).addScaledVector(shootDir, 0.6);
    combat.throwGrenade(player, muzzlePos, shootDir);
    audio.shot('frag');
    weaponSet.pullTrigger();
    player.grenades = weaponSet.state.grenades;
    syncWeaponHud();
    return true;
  }
  if (!weaponSet.takeRound()) {
    audio.dryClick();
    return false;
  }
  camera.getWorldDirection(shootDir);
  muzzlePos.copy(camera.position);
  const result = combat.shoot(player, muzzlePos, shootDir, def, shot ? 0 : weaponSet.spread(player.move.groundSpeed()), def.tracer);
  audio.shot(def.id);
  bots.hearShot(player.body.position, 'sable');
  lastShotAt = elapsed;
  if (result.hit && result.target) {
    hud.hitMarker(result.killed, result.killed ? 300 : 90);
    audio.hit();
    if (result.killed) {
      audio.kill();
      match.money.sable += 300;
      match.kills.push({ attacker: 'You', victim: result.target.name, team: 'sable' });
    }
  }
  weaponSet.pullTrigger();
  playerBody.body.pitch = Math.min(1.45, playerBody.body.pitch + def.recoilPitch * (0.8 + random() * 0.4));
  playerBody.body.yaw += (random() * 2 - 1) * def.recoilYaw;
  syncWeaponHud();
  return true;
}

function plantStep(dt, keys) {
  if (match.phase !== PHASE.LIVE || !player.alive || match.bomb.state !== 'idle') {
    player.plantProgress = 0;
    plantBar.hidden = true;
    return;
  }
  let inSite = null;
  for (const [name, site] of Object.entries(world.sites)) {
    if (Math.hypot(player.body.position.x - site.x, player.body.position.z - site.z) < site.radius) inSite = name;
  }
  if (inSite && keys.has('KeyE')) {
    player.plantProgress += dt;
    plantBar.hidden = false;
    plantFill.style.width = `${Math.min(100, (player.plantProgress / 3.5) * 100)}%`;
    if (Math.floor(player.plantProgress * 4) !== Math.floor((player.plantProgress - dt) * 4)) audio.plantBeep();
    if (player.plantProgress >= 3.5) {
      match.bomb.state = 'planted';
      match.bomb.site = inSite;
      match.bomb.timer = 40;
      match.bomb.position = { x: player.body.position.x, z: player.body.position.z };
      match.money.sable += 300;
      plantBar.hidden = true;
      hud.showBanner('DEVICE PLANTED', `Site ${inSite} — defend it for 40 seconds`, 3000);
      logEvent(match, `Device planted at Site ${inSite}`, 'win');
    }
  } else {
    player.plantProgress = Math.max(0, player.plantProgress - dt * 2);
    plantBar.hidden = player.plantProgress <= 0;
    plantFill.style.width = `${Math.min(100, (player.plantProgress / 3.5) * 100)}%`;
  }
}

function drainKillfeed() {
  while (killfeedSeen < match.kills.length) {
    const kill = match.kills[killfeedSeen];
    killfeedSeen += 1;
    hud.killfeed(kill.attacker, kill.victim, kill.team);
  }
}

function step(dt) {
  elapsed += dt;
  match.time = elapsed;
  const keys = input.state.keys;
  const prevPhase = match.phase;
  const prevRound = match.round;

  if (match.phase === PHASE.LIVE || match.phase === PHASE.BUY) {
    // Player movement.
    if (player.alive) {
      const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
      const jump = keys.has('Space');
      player.move.step(dt, forward, strafe, crouch, jump);
    }
    weaponSet.step(dt);
    bots.step(dt, allAgents);
    combat.stepGrenades(dt, (victim, killed, owner) => {
      if (killed && owner) match.kills.push({ attacker: owner.isPlayer ? 'You' : owner.name, victim: victim.isPlayer ? 'You' : victim.name, team: owner.team });
    });
    plantStep(dt, keys);
  }
  combat.stepTracers(dt);
  rounds.step(dt, allAgents, player);

  // Round transitions: reset positions for the next round.
  if (match.phase === PHASE.BUY && prevPhase === PHASE.ROUND_END) {
    resetRound();
  }
  if (match.phase === PHASE.MATCH_END && prevPhase !== PHASE.MATCH_END) {
    const title = match.matchWinner === 'sable' ? 'SABLE WINS THE MATCH'
      : match.matchWinner === 'vermilion' ? 'VERMILION WINS THE MATCH' : 'MATCH DRAWN';
    hud.showOverlay('end', { title, sub: `Final score — Sable ${match.score.sable} : ${match.score.vermilion} Vermilion. Click to play again.` });
    if (document.pointerLockElement) document.exitPointerLock();
  }
  if (match.phase === PHASE.ROUND_END && prevPhase === PHASE.LIVE) {
    const title = match.roundWinner === 'sable' ? 'SABLE TAKES THE ROUND' : 'VERMILION TAKES THE ROUND';
    hud.showBanner(title, match.roundReason, 3800);
    storeWeaponState();
  }

  // Deaths: the player starts spectating a living teammate.
  if (!player.alive && !player.spectating) {
    const mate = bots.bots.find((bot) => bot.alive && bot.team === 'sable');
    if (mate) {
      player.spectating = mate;
      spectateLabel.hidden = false;
      spectateLabel.textContent = `Spectating ${mate.name} — round continues`;
    } else {
      spectateLabel.hidden = false;
      spectateLabel.textContent = 'Sable squad eliminated';
    }
  }
  if (player.alive && player.spectating) {
    player.spectating = null;
    spectateLabel.hidden = true;
  }

  drainKillfeed();
  hud.setTimer(match.phaseTime, match.phase);
  hud.setScore(match.score.sable, match.score.vermilion, match.round);
  hud.setBombStatus(match.bomb.state, match.bomb.timer, match.bomb.site);
  hud.drawMinimap(player, allAgents, match.bomb);
  hud.setCrosshairSpread(2 + weaponSet.spread(player.move.groundSpeed()) * 500);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (player.alive) {
      player.body.yaw -= look.x * 0.0022;
      player.body.pitch = Math.max(-1.45, Math.min(1.45, player.body.pitch - look.y * 0.0022));
    }
    // Scope: right mouse with the Falcon.
    const def = weaponSet.def();
    const wantScope = input.state.aiming && def.id === 'falcon' && player.alive;
    if (wantScope !== weaponSet.state.scoped) {
      weaponSet.state.scoped = wantScope;
      camera.fov = wantScope ? 74 / def.zoom : 74;
      camera.updateProjectionMatrix();
      document.getElementById('crosshair').style.opacity = wantScope ? '0' : '';
    }
    if (input.state.firing && player.alive && (match.phase === PHASE.LIVE) && weaponSet.ready()) {
      if (def.auto || elapsed - lastShotAt > def.fireGap) playerShoot();
    }
    const pressed = input.takePressed();
    if (pressed.has('KeyR') && player.alive) {
      weaponSet.reload();
      audio.reload();
      syncWeaponHud();
    }
    if (pressed.has('Digit1') && player.alive && !buyOpen) equipSlot('primary');
    if (pressed.has('Digit2') && player.alive && !buyOpen) equipSlot('sidearm');
    if (pressed.has('Digit3') && player.alive && !buyOpen) equipSlot('grenade');
    if (pressed.has('KeyB') && match.phase === PHASE.BUY) {
      if (buyOpen) { closeBuyMenu(); input.requestLock(); }
      else openBuyMenu();
    }
    if (pressed.has('KeyB') && match.phase === PHASE.LIVE) {
      hud.setHint('The buy menu opens between rounds (B).');
      setTimeout(() => hud.setHint(''), 3000);
    }
    // Buy menu number keys while it is open.
    if (buyOpen && match.phase === PHASE.BUY) {
      for (let i = 0; i < BUY_ITEMS.length; i += 1) {
        if (pressed.has(`Digit${i + 1}`)) {
          if (rounds.buy(player, BUY_ITEMS[i].id)) {
            if (BUY_ITEMS[i].kind === 'primary') equipSlot('primary');
            weaponSet.state.grenades = player.grenades;
            syncWeaponHud();
            hud.renderBuyMenu(match.money.sable, BUY_ITEMS, ownedItems());
          }
        }
      }
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuyMenu();
  startMatch();
  if (name === 'start') {
    player.body.position.set(-2, 0, 14);
    player.body.yaw = 0.15;
    player.body.pitch = 0.02;
    settle(20);
    hud.showOverlay('start', {});
  } else if (name === 'buy') {
    // Buy phase: the player at spawn with the buy menu open and $2,450 to spend.
    match.money.sable = 2450;
    player.body.position.set(-2, 0, 14);
    player.body.yaw = 0.15;
    player.body.pitch = 0.02;
    settle(20);
    hud.renderBuyMenu(match.money.sable, BUY_ITEMS, ownedItems());
    syncCamera();
    paintTwiceThenReady();
    return;
  } else if (name === 'play') {
    // Mid-round: the player pushes mid, an enemy holds the far lane, one shot fired.
    rounds.startLivePhase();
    match.score = { sable: 2, vermilion: 1 };
    match.round = 3;
    match.money.sable = 2450;
    player.body.position.set(0, 0, 6);
    player.body.yaw = 0;
    settle(30);
    const enemy = bots.bots.find((bot) => bot.team === 'vermilion' && bot.alive);
    if (enemy) {
      enemy.body.position.set(2, 0, -8);
      enemy.body.yaw = Math.PI;
      aimAt(new THREE.Vector3(enemy.body.position.x, 1.4, enemy.body.position.z));
      playerShoot();
      match.kills.push({ attacker: 'Ash', victim: 'Vex', team: 'sable' });
      settle(6);
    }
  } else {
    // End: Sable takes the round at Site A, device planted, banner up.
    rounds.startLivePhase();
    match.bomb.state = 'planted';
    match.bomb.site = 'A';
    match.bomb.timer = 32;
    match.bomb.position = { x: -16, z: -13.5 };
    match.score = { sable: 3, vermilion: 1 };
    match.round = 4;
    player.body.position.set(-10, 0, -6);
    settle(20);
    aimAt(new THREE.Vector3(-16, 1.2, -13.5));
    hud.showBanner('SABLE TAKES THE ROUND', 'device detonated', 60000);
    hud.setScore(3, 1, 4);
    settle(10);
  }
  syncWeaponHud();
  hud.setScore(match.score.sable, match.score.vermilion, match.round);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
hud.setScore(0, 0, 1);
syncWeaponHud();
if (shot) runShot(shot);
else {
  hud.showOverlay('start', {});
  requestAnimationFrame(frame);
}
