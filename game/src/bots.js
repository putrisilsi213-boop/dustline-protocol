// Bot brains: waypoint routes, hold positions, sight and hearing, bursts of fire, and
// the objective — attackers push a site and plant, defenders hold and defuse. A bot
// thinks every 0.1 s (staggered), moves every fixed step, and never sees through walls:
// every sight check runs the world's line-of-sight test.
import * as THREE from 'three';
import { createAgentBody } from './agent.js';
import { WEAPONS } from './weapons.js';
import { pick } from './rng.js';

const SABLE_NAMES = ['Ash', 'Bram', 'Cy', 'Dove'];
const VERMILION_NAMES = ['Rook', 'Vex', 'Moss', 'Kite', 'Nyx'];
const PERCEIVE_EVERY = 0.12;
const FOV_COS = Math.cos((110 * Math.PI) / 360);
const SEE_DISTANCE = 42;
const HEAR_DISTANCE = 25;

export function createBots(world, combat, match, audio, random) {
  const bots = [];
  const eyePos = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  const toTarget = new THREE.Vector3();

  function makeBot(id, name, team, spawn, weaponId, role) {
    const body = createAgentBody(world.colliders, spawn.x, spawn.z, spawn.yaw);
    const bot = {
      id,
      name,
      team,
      body: body.body,
      move: body,
      health: 100,
      armor: 0,
      alive: true,
      weaponId,
      role,
      kills: 0,
      deaths: 0,
      state: 'route',
      route: [],
      routeIndex: 0,
      holdNode: null,
      target: null,
      lastSeen: null,
      lastSeenTime: -99,
      perceiveTimer: random() * PERCEIVE_EVERY,
      reactionTimer: 0,
      burstLeft: 0,
      burstTimer: 0,
      reloadTimer: 0,
      mag: WEAPONS[weaponId].mag,
      noise: null,
      plantTimer: 0,
      defuseTimer: 0,
      site: null,
      thinkOffset: random(),
    };
    combat.registerAgent(bot);
    bots.push(bot);
    return bot;
  }

  function setupRound(round, carrierId) {
    const sableSpawns = world.spawns.sable;
    const vermilionSpawns = world.spawns.vermilion;
    // Sable attacks: three push A, two push B. The bomb carrier leads the A push.
    const sablePlan = [
      { site: 'A', weapon: 'vulture' },
      { site: 'A', weapon: 'vulture' },
      { site: 'A', weapon: 'hornet' },
      { site: 'B', weapon: 'vulture' },
      { site: 'B', weapon: 'falcon' },
    ];
    const vermilionPlan = [
      { site: 'A', weapon: 'vulture' },
      { site: 'A', weapon: 'hornet' },
      { site: 'B', weapon: 'vulture' },
      { site: 'B', weapon: 'falcon' },
      { site: 'mid', weapon: 'vulture' },
    ];
    let index = 0;
    for (const bot of bots) {
      if (bot.team === 'sable') {
        const plan = sablePlan[index % sablePlan.length];
        index += 1;
        bot.site = plan.site;
        bot.weaponId = plan.weapon;
        bot.mag = WEAPONS[plan.weapon].mag;
        bot.role = bot.id === carrierId ? 'carrier' : 'attacker';
      }
    }
    index = 0;
    for (const bot of bots) {
      if (bot.team === 'vermilion') {
        const plan = vermilionPlan[index % vermilionPlan.length];
        index += 1;
        bot.site = plan.site;
        bot.weaponId = plan.weapon;
        bot.mag = WEAPONS[plan.weapon].mag;
        bot.role = 'defender';
      }
    }
    for (const bot of bots) assignRoute(bot);
  }

  function siteNode(site) {
    if (site === 'A') return world.nearestNode(world.sites.A.x, world.sites.A.z);
    if (site === 'B') return world.nearestNode(world.sites.B.x, world.sites.B.z);
    return world.nearestNode(0, -1);
  }

  function assignRoute(bot) {
    const from = world.nearestNode(bot.body.position.x, bot.body.position.z);
    let to;
    if (bot.role === 'carrier' || bot.role === 'attacker') to = siteNode(bot.site);
    else if (bot.site === 'mid') to = world.nearestNode(0, -1);
    else to = siteNode(bot.site);
    bot.route = world.route(from, to);
    bot.routeIndex = 0;
    bot.state = 'route';
    bot.holdNode = to;
  }

  function routeTo(bot, nodeId) {
    const from = world.nearestNode(bot.body.position.x, bot.body.position.z);
    bot.route = world.route(from, nodeId);
    bot.routeIndex = 0;
    bot.state = 'route';
  }

  function perceive(bot, dt, allAgents) {
    bot.perceiveTimer -= dt;
    if (bot.perceiveTimer > 0) return;
    bot.perceiveTimer = PERCEIVE_EVERY;
    eyePos.set(bot.body.position.x, bot.body.position.y + bot.body.eye, bot.body.position.z);
    let best = null;
    let bestScore = Infinity;
    for (const other of allAgents) {
      if (!other.alive || other.team === bot.team) continue;
      const dx = other.body.position.x - eyePos.x;
      const dy = other.body.position.y + 1.2 - eyePos.y;
      const dz = other.body.position.z - eyePos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > SEE_DISTANCE) continue;
      // Facing: the dot of the bot's forward against the direction to the target.
      const fx = -Math.sin(bot.body.yaw);
      const fz = -Math.cos(bot.body.yaw);
      const dot = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);
      if (dot < FOV_COS && dist > 4) continue;
      if (!world.lineOfSight(eyePos.x, eyePos.y, eyePos.z, other.body.position.x, other.body.position.y + 1.2, other.body.position.z)) continue;
      const score = dist + (other.crouching ? 6 : 0);
      if (score < bestScore) { bestScore = score; best = other; }
    }
    if (best) {
      if (!bot.target) bot.reactionTimer = 0.35 + random() * 0.45;
      bot.target = best;
      bot.lastSeen = { x: best.body.position.x, z: best.body.position.z };
      bot.lastSeenTime = match.time;
      bot.state = 'engage';
    } else if (bot.target && match.time - bot.lastSeenTime > 2.5) {
      bot.target = null;
      if (bot.state === 'engage') {
        if (bot.role === 'defender' && match.bomb.state === 'planted') routeTo(bot, siteNode(match.bomb.site));
        else if (bot.routeIndex >= bot.route.length) bot.state = 'hold';
        else bot.state = 'route';
      }
    }
  }

  function hearShot(position, team) {
    for (const bot of bots) {
      if (!bot.alive || bot.team === team || bot.target) continue;
      const dist = Math.hypot(bot.body.position.x - position.x, bot.body.position.z - position.z);
      if (dist < HEAR_DISTANCE) {
        bot.noise = { x: position.x, z: position.z };
        bot.noiseTime = match.time;
      }
    }
  }

  function angleTo(bot, x, z) {
    const dx = x - bot.body.position.x;
    const dz = z - bot.body.position.z;
    return Math.atan2(-dx, -dz);
  }

  function turnToward(bot, targetYaw, dt, rate) {
    let diff = targetYaw - bot.body.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
    bot.body.yaw += step;
    return Math.abs(diff);
  }

  function fireAt(bot, dt) {
    const def = WEAPONS[bot.weaponId];
    if (bot.reloadTimer > 0) {
      bot.reloadTimer -= dt;
      if (bot.reloadTimer <= 0) bot.mag = def.mag;
      return;
    }
    if (bot.mag <= 0) {
      bot.reloadTimer = def.reloadTime;
      return;
    }
    if (bot.reactionTimer > 0) {
      bot.reactionTimer -= dt;
      return;
    }
    bot.burstTimer -= dt;
    if (bot.burstLeft <= 0) {
      if (bot.burstTimer <= 0) {
        bot.burstLeft = def.auto ? 3 + Math.floor(random() * 3) : 1;
        bot.burstTimer = 0.5 + random() * 0.7;
      }
      return;
    }
    if (bot.burstTimer > 0.25) return;
    bot.burstTimer = def.fireGap;
    bot.burstLeft -= 1;
    bot.mag -= 1;
    const target = bot.target;
    eyePos.set(bot.body.position.x, bot.body.position.y + bot.body.eye - 0.12, bot.body.position.z);
    targetPos.set(target.body.position.x, target.body.position.y + 1.15, target.body.position.z);
    toTarget.copy(targetPos).sub(eyePos);
    const dist = toTarget.length();
    toTarget.normalize();
    // Accuracy: worse at distance, worse against a moving or crouched target, worse
    // while the bot itself moves. Headshots happen when the spread is small.
    const targetSpeed = Math.hypot(target.body.velocity.x, target.body.velocity.z);
    const spread = 0.012 + dist * 0.0009 + targetSpeed * 0.004 + (bot.move.groundSpeed() > 1 ? 0.02 : 0);
    const result = combat.shoot(bot, eyePos, toTarget, def, spread, def.tracer);
    audio.shot(def.id, dist);
    if (result.target && result.target.isPlayer) {
      audio.hurt();
    }
    if (result.killed && result.target) {
      match.kills.push({ attacker: bot.name, victim: result.target.name || 'You', team: bot.team });
    }
  }

  function stepBot(bot, dt, allAgents) {
    if (!bot.alive) return;
    perceive(bot, dt, allAgents);

    // Bomb logic overrides movement.
    if (match.bomb.state === 'planted') {
      if (bot.team === 'vermilion' && bot.state !== 'defuse' && bot.state !== 'engage') {
        routeTo(bot, siteNode(match.bomb.site));
        bot.state = 'route';
      }
      if (bot.team === 'sable' && bot.state !== 'engage') {
        // Hold near the planted site.
        const site = world.sites[match.bomb.site];
        if (Math.hypot(bot.body.position.x - site.x, bot.body.position.z - site.z) > 7) {
          routeTo(bot, siteNode(match.bomb.site));
        } else bot.state = 'hold';
      }
    }

    // Planting: the carrier stands in the site for PLANT_SECONDS.
    if (bot.role === 'carrier' && match.bomb.state === 'idle' && bot.state === 'hold' && bot.site) {
      const site = world.sites[bot.site];
      const dist = Math.hypot(bot.body.position.x - site.x, bot.body.position.z - site.z);
      if (dist < site.radius) {
        bot.state = 'plant';
        bot.plantTimer = 0;
      }
    }
    if (bot.state === 'plant') {
      bot.plantTimer += dt;
      if (bot.plantTimer >= 3.5) {
        match.bomb.state = 'planted';
        match.bomb.site = bot.site;
        match.bomb.timer = 40;
        match.bomb.position = { x: bot.body.position.x, z: bot.body.position.z };
        bot.state = 'hold';
        audio.plantBeep();
      }
      return;
    }
    // Defusing: a defender inside the planted site for DEFUSE_SECONDS.
    if (bot.state === 'defuse') {
      bot.defuseTimer += dt;
      if (bot.defuseTimer >= 5) {
        match.bomb.state = 'defused';
        bot.state = 'hold';
      }
      return;
    }
    if (match.bomb.state === 'planted' && bot.team === 'vermilion' && bot.state === 'hold') {
      const site = world.sites[match.bomb.site];
      const dist = Math.hypot(bot.body.position.x - site.x, bot.body.position.z - site.z);
      if (dist < site.radius && !bot.target) {
        bot.state = 'defuse';
        bot.defuseTimer = 0;
        return;
      }
    }

    let forward = 0;
    let strafe = 0;
    let wantYaw = bot.body.yaw;
    let moving = false;

    if (bot.state === 'engage' && bot.target && bot.target.alive) {
      targetPos.set(bot.target.body.position.x, bot.body.position.y + 1.15, bot.target.body.position.z);
      wantYaw = angleTo(bot, targetPos.x, targetPos.z);
      const dist = Math.hypot(bot.target.body.position.x - bot.body.position.x, bot.target.body.position.z - bot.body.position.z);
      // Strafe in and out of cover while firing; close in when far.
      if (dist > 16) forward = 1;
      else if (dist < 5) forward = -0.6;
      else strafe = Math.sin(match.time * 1.3 + bot.thinkOffset * 6) > 0 ? 0.7 : -0.7;
      moving = true;
      fireAt(bot, dt);
    } else if (bot.state === 'route' && bot.route.length > 0) {
      const node = world.nodes[bot.route[Math.min(bot.routeIndex, bot.route.length - 1)]];
      const dx = node.x - bot.body.position.x;
      const dz = node.z - bot.body.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.9) {
        bot.routeIndex += 1;
        if (bot.routeIndex >= bot.route.length) {
          bot.state = 'hold';
          // Attackers who reach the site hold it; the carrier plants.
          if ((bot.role === 'carrier' || bot.role === 'attacker') && bot.site) {
            const site = world.sites[bot.site];
            if (Math.hypot(bot.body.position.x - site.x, bot.body.position.z - site.z) < site.radius + 1.5) {
              bot.state = 'hold';
            }
          }
        }
      } else {
        wantYaw = angleTo(bot, node.x, node.z);
        forward = 1;
        moving = true;
      }
    } else if (bot.state === 'hold') {
      // Scan: slow sweep of the yaw, listening for the next sound.
      wantYaw = bot.body.yaw + Math.sin(match.time * 0.5 + bot.thinkOffset * 8) * 0.004;
      if (bot.noise && match.time - (bot.noiseTime || 0) < 6) {
        routeTo(bot, world.nearestNode(bot.noise.x, bot.noise.z));
        bot.noise = null;
      }
    }

    const remaining = turnToward(bot, wantYaw, dt, bot.state === 'engage' ? 6 : 3.5);
    if (moving && remaining > 0.7) forward = 0;
    bot.move.step(dt, forward, strafe, false, false);
  }

  function createTeam() {
    bots.length = 0;
    for (let i = 0; i < 4; i += 1) {
      makeBot(`sable-${i}`, SABLE_NAMES[i], 'sable', world.spawns.sable[i + 1], 'vulture', 'attacker');
    }
    for (let i = 0; i < 5; i += 1) {
      makeBot(`verm-${i}`, VERMILION_NAMES[i], 'vermilion', world.spawns.vermilion[i], 'vulture', 'defender');
    }
    return bots;
  }

  function resetRound(round) {
    // Respawn everyone at their spawn, alive, with full health.
    const carrier = pick(random, bots.filter((b) => b.team === 'sable'));
    for (const bot of bots) {
      const spawn = bot.team === 'sable'
        ? world.spawns.sable[bots.filter((b) => b.team === 'sable').indexOf(bot) + 1]
        : world.spawns.vermilion[bots.filter((b) => b.team === 'vermilion').indexOf(bot)];
      bot.body.position.set(spawn.x, 0, spawn.z);
      bot.body.velocity.set(0, 0, 0);
      bot.body.yaw = spawn.yaw;
      bot.health = 100;
      bot.armor = 0;
      bot.alive = true;
      bot.target = null;
      bot.noise = null;
      bot.plantTimer = 0;
      bot.defuseTimer = 0;
      bot.burstLeft = 0;
      bot.reloadTimer = 0;
      combat.resetAgentVisuals(bot);
    }
    setupRound(round, carrier ? carrier.id : null);
    match.bomb.carrier = carrier ? carrier.id : null;
    return carrier;
  }

  function step(dt, allAgents) {
    for (const bot of bots) stepBot(bot, dt, allAgents);
  }

  return { bots, createTeam, resetRound, setupRound, step, hearShot };
}
