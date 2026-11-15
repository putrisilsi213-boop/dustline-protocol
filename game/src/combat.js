// Combat: hitscan shooting, grenades and the bomb. One raycaster and a small pool of
// tracer lines are reused, so a firefight allocates nothing per frame. Damage falls
// off with distance; the head takes a multiplier; armor absorbs half of a hit until
// it is gone.
import * as THREE from 'three';
import { TEAM_COLORS } from './palette.js';

const TRACER_POOL = 24;
const TRACER_LIFE = 0.07;

export function createCombat(scene, world, match, audio, random) {
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const tmpVec = new THREE.Vector3();
  const agents = [];

  // Tracer pool: lines the muzzle and the impact share, recycled by age.
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }),
    );
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  function fireTracer(from, to, color) {
    const tracer = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % TRACER_POOL;
    const positions = tracer.line.geometry.attributes.position.array;
    positions[0] = from.x; positions[1] = from.y; positions[2] = from.z;
    positions[3] = to.x; positions[4] = to.y; positions[5] = to.z;
    tracer.line.geometry.attributes.position.needsUpdate = true;
    tracer.line.material.color.set(color);
    tracer.line.material.opacity = 0.9;
    tracer.line.visible = true;
    tracer.life = TRACER_LIFE;
  }

  function buildAgentMesh(agent) {
    const teamColor = new THREE.Color(TEAM_COLORS[agent.team]);
    const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3d3831'), roughness: 0.9, metalness: 0.05 });
    const vest = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.7, metalness: 0.1 });
    const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a184'), roughness: 0.8, metalness: 0 });
    const group = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), vest);
    torso.position.y = 1.06;
    torso.userData = { agent, part: 'body' };
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
    head.position.y = 1.58;
    head.userData = { agent, part: 'head' };
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), cloth);
    helmet.position.y = 1.74;
    helmet.userData = { agent, part: 'head' };
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), cloth);
    legL.position.set(-0.14, 0.35, 0);
    legL.userData = { agent, part: 'body' };
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), cloth);
    legR.position.set(0.14, 0.35, 0);
    legR.userData = { agent, part: 'body' };
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.6), cloth);
    gun.position.set(0.2, 1.15, -0.3);
    gun.userData = { agent, part: 'body' };
    group.add(torso, head, helmet, legL, legR, gun);
    group.traverse((child) => { if (child.isMesh) { child.castShadow = true; } });
    scene.add(group);
    agent.mesh = group;
    agent.hitMeshes = [torso, head, helmet, legL, legR, gun];
  }

  function registerAgent(agent) {
    agents.push(agent);
    buildAgentMesh(agent);
  }

  function allHitMeshes(except) {
    const list = world.shootables.slice();
    for (const agent of agents) {
      if (!agent.alive || agent === except) continue;
      for (const mesh of agent.hitMeshes) list.push(mesh);
    }
    return list;
  }

  function applyDamage(target, amount, attacker, part) {
    if (!target.alive) return 0;
    let remaining = amount;
    if (target.armor > 0) {
      const absorbed = Math.min(target.armor, remaining * 0.5);
      target.armor -= absorbed;
      remaining -= absorbed;
    }
    target.health -= remaining;
    if (target.health <= 0) {
      target.health = 0;
      target.alive = false;
      target.deaths = (target.deaths || 0) + 1;
      if (attacker) attacker.kills = (attacker.kills || 0) + 1;
      if (target.mesh) {
        target.mesh.rotation.z = Math.PI / 2;
        target.mesh.position.y = 0.25;
      }
      return 2;
    }
    return 1;
  }

  function shoot(shooter, from, dir, def, spread, muzzleColor) {
    origin.copy(from);
    direction.copy(dir);
    direction.x += (random() * 2 - 1) * spread;
    direction.y += (random() * 2 - 1) * spread;
    direction.z += (random() * 2 - 1) * spread;
    direction.normalize();
    raycaster.set(origin, direction);
    raycaster.far = def.range;
    const hits = raycaster.intersectObjects(allHitMeshes(shooter), false);
    const end = tmpVec.copy(direction).multiplyScalar(def.range).add(origin);
    if (hits.length === 0) {
      fireTracer(origin, end, def.tracer);
      return { hit: false };
    }
    const hit = hits[0];
    const point = hit.point;
    fireTracer(origin, point, def.tracer);
    const userData = hit.object.userData;
    if (!userData.agent) return { hit: true, point, wall: true };
    const target = userData.agent;
    const distance = hit.distance;
    const falloff = Math.max(0.5, 1 - distance / (def.range * 1.6));
    const mult = userData.part === 'head' ? def.headMult : 1;
    const damage = def.damage * falloff * mult;
    const result = applyDamage(target, damage, shooter, userData.part);
    return { hit: true, point, target, part: userData.part, killed: result === 2, damage };
  }

  // Grenades: thrown arcs with a bounce, then a radius blast.
  const grenades = [];
  const blastMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  blastMesh.visible = false;
  scene.add(blastMesh);
  let blastLife = 0;

  function throwGrenade(agent, from, dir) {
    if (grenades.length > 12) return;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.5, metalness: 0.6 }),
    );
    mesh.position.copy(from);
    scene.add(mesh);
    grenades.push({
      mesh,
      velocity: new THREE.Vector3(dir.x * 14, dir.y * 14 + 4, dir.z * 14),
      timer: 1.6,
      owner: agent,
    });
  }

  function stepGrenades(dt, onExplode) {
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.timer -= dt;
      g.velocity.y -= 18 * dt;
      const pos = g.mesh.position;
      pos.x += g.velocity.x * dt;
      pos.y += g.velocity.y * dt;
      pos.z += g.velocity.z * dt;
      if (pos.y < 0.09) { pos.y = 0.09; g.velocity.y = Math.abs(g.velocity.y) * 0.45; g.velocity.x *= 0.7; g.velocity.z *= 0.7; }
      if (pos.x < -23.5 || pos.x > 23.5) g.velocity.x *= -0.45;
      if (pos.z < -17.5 || pos.z > 17.5) g.velocity.z *= -0.45;
      if (g.timer <= 0) {
        scene.remove(g.mesh);
        grenades.splice(i, 1);
        blastMesh.position.copy(pos);
        blastMesh.scale.setScalar(5.5);
        blastMesh.visible = true;
        blastLife = 0.35;
        audio.explosion();
        for (const agent of agents) {
          if (!agent.alive) continue;
          const dist = Math.hypot(
            agent.body.position.x - pos.x,
            agent.body.position.y + 1 - pos.y,
            agent.body.position.z - pos.z,
          );
          if (dist < 7) {
            const damage = 110 * (1 - dist / 7) + 10;
            const result = applyDamage(agent, damage, g.owner, 'body');
            if (onExplode) onExplode(agent, result === 2, g.owner);
          }
        }
      }
    }
    if (blastLife > 0) {
      blastLife -= dt;
      blastMesh.material.opacity = Math.max(0, blastLife / 0.35) * 0.55;
      if (blastLife <= 0) blastMesh.visible = false;
    }
  }

  function stepTracers(dt) {
    for (const tracer of tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.life / TRACER_LIFE) * 0.9;
      if (tracer.life <= 0) tracer.line.visible = false;
    }
  }

  function resetAgentVisuals(agent) {
    if (agent.mesh) {
      agent.mesh.rotation.z = 0;
      agent.mesh.position.y = 0;
    }
  }

  return {
    agents,
    registerAgent,
    shoot,
    throwGrenade,
    stepGrenades,
    stepTracers,
    applyDamage,
    resetAgentVisuals,
  };
}
