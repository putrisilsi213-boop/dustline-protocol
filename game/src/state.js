// One state store for the whole match. The simulation reads and writes only this
// object; rendering and the HUD read it, never their own copies.
export const PHASE = {
  MENU: 'menu',
  BUY: 'buy',
  LIVE: 'live',
  ROUND_END: 'round_end',
  MATCH_END: 'match_end',
};

export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const ROUND_SECONDS = 100;
export const BUY_SECONDS = 15;
export const BOMB_SECONDS = 40;
export const PLANT_SECONDS = 3.5;
export const DEFUSE_SECONDS = 5;

export function createMatchState(seed) {
  return {
    seed,
    phase: PHASE.MENU,
    phaseTime: 0,
    round: 1,
    score: { sable: 0, vermilion: 0 },
    money: { sable: 800, vermilion: 800 },
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    bomb: {
      state: 'idle', // idle | planted | defused | detonated
      site: null,
      position: null,
      plantProgress: 0,
      defuseProgress: 0,
      timer: 0,
      carrier: null,
    },
    kills: [],
    events: [],
    time: 0,
  };
}

export function logEvent(state, text, kind) {
  state.events.push({ time: state.time, text, kind: kind || 'info' });
  if (state.events.length > 40) state.events.shift();
}
