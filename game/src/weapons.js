// The arsenal: four guns and one grenade, each with its own price, damage, fire rate,
// spread, recoil and sound. A weapon owns its numbers and its view model; combat.js
// owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', slot: 'sidearm', price: 0, auto: false,
    damage: 34, headMult: 3.0, mag: 12, reserve: 36, fireGap: 0.16, reloadTime: 1.5,
    spreadStill: 0.004, spreadMove: 0.02, recoilPitch: 0.011, recoilYaw: 0.004,
    range: 60, tracer: '#ffe9a8',
  },
  vulture: {
    id: 'vulture', name: 'AR-7 Vulture', slot: 'primary', price: 2700, auto: true,
    damage: 33, headMult: 4.0, mag: 30, reserve: 90, fireGap: 0.096, reloadTime: 2.0,
    spreadStill: 0.0022, spreadMove: 0.028, recoilPitch: 0.012, recoilYaw: 0.005,
    range: 90, tracer: '#ffd27a',
  },
  hornet: {
    id: 'hornet', name: 'PDW-9 Hornet', slot: 'primary', price: 1500, auto: true,
    damage: 26, headMult: 3.4, mag: 32, reserve: 96, fireGap: 0.075, reloadTime: 1.8,
    spreadStill: 0.006, spreadMove: 0.024, recoilPitch: 0.008, recoilYaw: 0.006,
    range: 55, tracer: '#ffe9a8',
  },
  falcon: {
    id: 'falcon', name: 'LR-80 Falcon', slot: 'primary', price: 4750, auto: false,
    damage: 110, headMult: 2.0, mag: 5, reserve: 15, fireGap: 1.1, reloadTime: 3.0,
    spreadStill: 0.0004, spreadMove: 0.05, recoilPitch: 0.05, recoilYaw: 0.008,
    range: 120, tracer: '#fff3c4', zoom: 2.4,
  },
  frag: {
    id: 'frag', name: 'Frag-5', slot: 'grenade', price: 300, auto: false,
    damage: 0, headMult: 1, mag: 1, reserve: 0, fireGap: 0.8, reloadTime: 0,
    spreadStill: 0, spreadMove: 0, recoilPitch: 0, recoilYaw: 0, range: 0, tracer: null,
  },
};

export const ARMOR_PRICE = 650;
export const ARMOR_HP = 50;

export function createWeaponSet(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a332b'), roughness: 0.6, metalness: 0.3 });

  function buildModel(def) {
    const model = new THREE.Group();
    if (def.id === 'p9') {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.2), body);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.07, 0.16), grip);
      frame.position.set(0, -0.04, 0.02);
      model.add(slide, frame);
    } else if (def.id === 'hornet') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.3), body);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.22), grip);
      barrel.position.set(0, 0.02, -0.24);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.06), dark);
      mag.position.set(0, -0.1, -0.02);
      model.add(receiver, barrel, mag);
    } else if (def.id === 'falcon') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.5), body);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.55), grip);
      barrel.position.set(0, 0.03, -0.48);
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10), dark);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.09, -0.05);
      model.add(receiver, barrel, scope);
    } else if (def.id === 'frag') {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), dark);
      const pin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.02), body);
      pin.position.set(0.04, 0.06, 0);
      model.add(ball, pin);
    } else {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
      barrel.position.set(0, 0.025, -0.38);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
      stock.position.set(0, -0.02, 0.3);
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), dark);
      sight.position.set(0, 0.075, -0.1);
      model.add(receiver, barrel, stock, sight);
    }
    model.position.set(0.26, -0.26, -0.62);
    model.rotation.set(0, -0.05, 0.06);
    return model;
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const models = {};
  for (const def of Object.values(WEAPONS)) {
    models[def.id] = buildModel(def);
    models[def.id].visible = false;
    camera.add(models[def.id]);
  }

  const state = {
    current: 'vulture',
    mag: 30,
    reserve: 90,
    grenades: 0,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    scoped: false,
  };

  function def() {
    return WEAPONS[state.current];
  }

  function showModel() {
    for (const id of Object.keys(models)) models[id].visible = id === state.current;
  }

  function equip(id, mag, reserve, grenades) {
    state.current = id;
    state.mag = mag !== undefined ? mag : WEAPONS[id].mag;
    state.reserve = reserve !== undefined ? reserve : WEAPONS[id].reserve;
    if (grenades !== undefined) state.grenades = grenades;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.scoped = false;
    showModel();
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.62 + state.kick;
    model.rotation.x = state.kick * 2.2;
    if (state.current === 'falcon' && state.scoped) {
      model.position.x = 0;
      model.position.y = -0.145;
    } else {
      model.position.x = 0.26;
      model.position.y = -0.26;
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    const d = def();
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, ((d.reloadTime - state.reloadLeft) * 2) / d.reloadTime);
      if (state.reloadLeft === 0) {
        const need = d.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    equip,
    def,
    ready() {
      const d = def();
      if (d.id === 'frag') return state.grenades > 0 && state.cooldown === 0;
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const d = def();
      state.cooldown = d.fireGap;
      if (d.id !== 'frag') {
        state.flash = 0.06;
        state.kick = d.id === 'falcon' ? 0.12 : 0.055;
      }
    },
    takeRound() {
      const d = def();
      if (d.id === 'frag') {
        if (state.grenades <= 0) return false;
        state.grenades -= 1;
        return true;
      }
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const d = def();
      if (d.id === 'frag' || state.reloadLeft > 0 || state.mag === d.mag || state.reserve === 0) return;
      state.reloadLeft = d.reloadTime;
    },
    spread(speed) {
      const d = def();
      const moveShare = Math.min(1, speed / 5.4);
      return d.spreadStill + moveShare * d.spreadMove;
    },
    refill() {
      const d = def();
      state.mag = d.mag;
      state.reserve = d.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.scoped = false;
    },
  };
}
