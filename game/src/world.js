// DUSTLINE YARD: a 48 x 36 m container yard at dusk, built from boxes. Two bomb sites
// (A west, B east), a mid lane and two long lanes, Sable spawning south and Vermilion
// north. Every box is a collider for agents and a surface a bullet stops on. The map
// also owns the waypoint graph the bots route on, and a segment test bots use to ask
// whether two points can see each other.
import * as THREE from 'three';
import { PALETTE, SITE_COLORS } from './palette.js';

const CONTAINER_COLORS = [0x7a5a34, 0x5d6b63, 0x8a6f45, 0x6b4a3a, 0x4f5d6b, 0x75603f];

export function createWorld(scene, random) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.04,
    });
  }
  const containerMats = CONTAINER_COLORS.map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.15 }),
  );

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function container(width, height, depth, x, z, rotY, colorIndex) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      containerMats[colorIndex % containerMats.length],
    );
    mesh.position.set(x, height / 2, z);
    mesh.rotation.y = rotY || 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    mesh.updateMatrixWorld(true);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and the yard wall: 48 x 36 m, 5 m walls, open dusk sky above.
  box(48.4, 0.4, 36.4, 0, -0.2, 0, materials.surface);
  box(0.4, 5, 36.4, -24.2, 2.5, 0, materials.surface);
  box(0.4, 5, 36.4, 24.2, 2.5, 0, materials.surface);
  box(48.4, 5, 0.4, 0, 2.5, -18.2, materials.surface);
  box(48.4, 5, 0.4, 0, 2.5, 18.2, materials.surface);

  // Mid: a low spine of crates splitting the yard into A-long (west) and B-long (east).
  container(6, 2.6, 2.4, 0, -6, 0, 0);
  container(6, 2.6, 2.4, 0.4, -6, 0, 1);
  box(1.4, 1.1, 1.4, -3.4, 0.55, -1.5, materials.hairline);
  box(1.4, 1.1, 1.4, 3.6, 0.55, -1.5, materials.hairline);
  box(2.2, 0.8, 2.2, 0, 0.4, 2.6, materials.hairline);

  // West lane: stacked containers make Site A's corner and a sniper perch.
  container(6, 2.6, 2.4, -14, -12, Math.PI / 2, 2);
  container(6, 2.6, 2.4, -14, -9.4, Math.PI / 2, 3);
  container(6, 2.6, 2.4, -18, -6, 0, 4);
  box(1.6, 1.0, 1.6, -9, 0.5, -10, materials.hairline);
  box(1.6, 1.0, 1.6, -19, 0.5, -13, materials.hairline);
  box(3.2, 0.6, 1.8, -11, 0.3, -14.5, materials.hairline);

  // East lane: Site B's yard, mirrored but not identical — a tall stack and a low wall.
  container(6, 2.6, 2.4, 14, -12, Math.PI / 2, 5);
  container(6, 2.6, 2.4, 18, -8, 0, 0);
  container(6, 2.6, 2.4, 14, -9.4, Math.PI / 2, 1);
  box(1.6, 1.0, 1.6, 9, 0.5, -11, materials.hairline);
  box(2.6, 1.2, 0.8, 19, 0.6, -13, materials.hairline);

  // South (Sable) half: scattered cover on the push out of spawn.
  container(6, 2.6, 2.4, -10, 8, 0, 1);
  container(6, 2.6, 2.4, 10, 8, 0, 3);
  box(1.4, 1.1, 1.4, -4, 0.55, 6, materials.hairline);
  box(1.4, 1.1, 1.4, 4, 0.55, 6, materials.hairline);
  box(1.4, 1.1, 1.4, 0, 0.55, 11, materials.hairline);
  box(2.4, 0.9, 1.2, -16, 0.45, 12, materials.hairline);
  box(2.4, 0.9, 1.2, 16, 0.45, 12, materials.hairline);

  // Bomb sites: glowing floor plates so both teams read them at a glance.
  function sitePlate(x, z, color) {
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 0.08, 5.4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.35 }),
    );
    plate.position.set(x, 0.05, z);
    group.add(plate);
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 2.6, 0.18),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.5, metalness: 0.3 }),
    );
    post.position.set(x + 2.5, 1.3, z + 2.5);
    group.add(post);
    colliders.push(new THREE.Box3().setFromObject(post));
    shootables.push(post);
  }
  sitePlate(-16, -13.5, SITE_COLORS.a);
  sitePlate(16, -13.5, SITE_COLORS.b);

  // Light: a low amber sun from the west, a cool teal fill from the east, dusk sky.
  const sky = new THREE.HemisphereLight(new THREE.Color(0x8a7a66), new THREE.Color(0x241d18), 1.0);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color(0xffb35c), 2.4);
  sun.position.set(-22, 10, 6);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(0x4fb3a9), 0.5);
  fill.position.set(18, 12, -8);
  scene.add(fill);

  // Floodlight poles over mid and the two sites, for readable silhouettes at dusk.
  function floodlight(x, z) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.12, 6, 8),
      materials.hairline,
    );
    pole.position.set(x, 3, z);
    pole.castShadow = true;
    group.add(pole);
    const lamp = new THREE.PointLight(new THREE.Color(0xffd9a0), 22, 26, 1.6);
    lamp.position.set(x, 5.8, z);
    scene.add(lamp);
  }
  floodlight(0, -6);
  floodlight(-16, -13.5);
  floodlight(16, -13.5);

  const sites = {
    A: { x: -16, z: -13.5, radius: 3.4 },
    B: { x: 16, z: -13.5, radius: 3.4 },
  };
  const spawns = {
    sable: [
      { x: -8, z: 15, yaw: 0 },
      { x: -4, z: 15.5, yaw: 0 },
      { x: 0, z: 16, yaw: 0 },
      { x: 4, z: 15.5, yaw: 0 },
      { x: 8, z: 15, yaw: 0 },
    ],
    vermilion: [
      { x: -8, z: -15, yaw: Math.PI },
      { x: -4, z: -15.5, yaw: Math.PI },
      { x: 0, z: -16, yaw: Math.PI },
      { x: 4, z: -15.5, yaw: Math.PI },
      { x: 8, z: -15, yaw: Math.PI },
    ],
  };

  // Waypoint graph: nodes across the yard, edges where two nodes are close and the
  // straight walk between them clears every collider.
  const nodePoints = [
    [-8, 15], [-4, 15], [0, 15], [4, 15], [8, 15],
    [-14, 5], [0, 8], [14, 5],
    [-16, 4], [-6, 4], [6, 4], [16, 4],
    [-10, 0], [0, -1], [10, 0],
    [-12, -6], [-6, -6], [6, -6], [16, -6],
    [-16, -13.5], [-10, -12], [0, -12], [10, -12], [16, -13.5],
    [-8, -15], [0, -15], [8, -15],
  ];
  const nodes = nodePoints.map(([x, z], i) => ({ id: i, x, z, edges: [] }));
  function segmentBlocked(ax, az, bx, bz) {
    // 2D segment vs every collider's XZ footprint, checked at agent height (y 0..1.7).
    const dx = bx - ax;
    const dz = bz - az;
    for (const c of colliders) {
      if (c.max.y < 0.2 || c.min.y > 1.7) continue;
      // Slab test in 2D.
      let tmin = 0;
      let tmax = 1;
      let blocked = false;
      const dims = [
        [ax, dx, c.min.x, c.max.x],
        [az, dz, c.min.z, c.max.z],
      ];
      for (const [p, d, lo, hi] of dims) {
        if (Math.abs(d) < 1e-9) {
          if (p < lo || p > hi) { blocked = true; break; }
        } else {
          let t1 = (lo - p) / d;
          let t2 = (hi - p) / d;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { blocked = true; break; }
        }
      }
      if (!blocked && tmin <= tmax) return true;
    }
    return false;
  }
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      if (dist > 9.5) continue;
      if (segmentBlocked(a.x, a.z, b.x, b.z)) continue;
      a.edges.push(j);
      b.edges.push(i);
    }
  }

  // Line of sight between two eye-level points: blocked when the segment crosses a
  // collider box (3D slab test).
  function lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    for (const c of colliders) {
      let tmin = 0;
      let tmax = 1;
      let blocked = false;
      const dims = [
        [ax, dx, c.min.x, c.max.x],
        [ay, dy, c.min.y, c.max.y],
        [az, dz, c.min.z, c.max.z],
      ];
      for (const [p, d, lo, hi] of dims) {
        if (Math.abs(d) < 1e-9) {
          if (p < lo || p > hi) { blocked = true; break; }
        } else {
          let t1 = (lo - p) / d;
          let t2 = (hi - p) / d;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) { blocked = true; break; }
        }
      }
      if (!blocked) return false;
    }
    return true;
  }

  function nearestNode(x, z) {
    let best = 0;
    let bestDist = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bestDist) { bestDist = d; best = n.id; }
    }
    return best;
  }

  // Breadth-first route between two nodes; returns a list of node ids.
  function route(fromId, toId) {
    if (fromId === toId) return [fromId];
    const prev = new Map([[fromId, -1]]);
    const queue = [fromId];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const next of nodes[current].edges) {
        if (prev.has(next)) continue;
        prev.set(next, current);
        if (next === toId) {
          const path = [toId];
          let step = toId;
          while (prev.get(step) !== -1) { step = prev.get(step); path.unshift(step); }
          return path;
        }
        queue.push(next);
      }
    }
    return [fromId, toId];
  }

  return { colliders, shootables, group, sites, spawns, nodes, nearestNode, route, lineOfSight };
}
