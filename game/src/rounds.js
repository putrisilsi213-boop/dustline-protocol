// Round flow and the economy. A round is a buy phase, a live phase, then a banner.
// Sable attacks and must plant the device at A or B, or eliminate Vermilion; Vermilion
// defends and wins by stopping the plant, defusing, or running the clock out. First
// to five rounds takes the match.
import {
  PHASE, WIN_ROUNDS, MAX_ROUNDS, ROUND_SECONDS, BUY_SECONDS, BOMB_SECONDS,
} from './state.js';
import { WEAPONS, ARMOR_PRICE, ARMOR_HP } from './weapons.js';

export const BUY_ITEMS = [
  { id: 'vulture', name: 'AR-7 Vulture', price: WEAPONS.vulture.price, kind: 'primary', desc: 'Full-auto rifle. The workhorse.' },
  { id: 'hornet', name: 'PDW-9 Hornet', price: WEAPONS.hornet.price, kind: 'primary', desc: 'Fast SMG for close lanes.' },
  { id: 'falcon', name: 'LR-80 Falcon', price: WEAPONS.falcon.price, kind: 'primary', desc: 'One-shot sniper. Slow, decisive.' },
  { id: 'frag', name: 'Frag-5', price: WEAPONS.frag.price, kind: 'grenade', desc: 'Timed grenade. Clears corners.' },
  { id: 'armor', name: 'Kevlar Vest', price: ARMOR_PRICE, kind: 'armor', desc: '+50 armor that soaks half of each hit.' },
];

export function createRounds(match, audio, onEvent) {
  function aliveCount(team, agents) {
    let count = 0;
    for (const agent of agents) if (agent.alive && agent.team === team) count += 1;
    return count;
  }

  function startBuyPhase() {
    match.phase = PHASE.BUY;
    match.phaseTime = BUY_SECONDS;
    match.bomb.state = 'idle';
    match.bomb.site = null;
    match.bomb.position = null;
    match.bomb.plantProgress = 0;
    match.bomb.defuseProgress = 0;
    match.bomb.timer = 0;
    onEvent(`Round ${match.round} — buy phase`, 'info');
  }

  function startLivePhase() {
    match.phase = PHASE.LIVE;
    match.phaseTime = ROUND_SECONDS;
    audio.horn();
    onEvent('Round live — plant the device at A or B', 'info');
  }

  function endRound(winner, reason) {
    match.phase = PHASE.ROUND_END;
    match.phaseTime = 4;
    match.roundWinner = winner;
    match.roundReason = reason;
    match.score[winner] += 1;
    // Economy: winners take the big payout, losers the consolation.
    match.money[winner] += 3250;
    match.money[winner === 'sable' ? 'vermilion' : 'sable'] += 1900;
    if (winner === 'sable') audio.roundWin();
    else audio.roundLose();
    onEvent(`${winner === 'sable' ? 'SABLE' : 'VERMILION'} takes the round — ${reason}`, winner === 'sable' ? 'win' : 'lose');
    if (match.score[winner] >= WIN_ROUNDS || match.round >= MAX_ROUNDS) {
      match.matchWinner = match.score.sable > match.score.vermilion ? 'sable'
        : match.score.vermilion > match.score.sable ? 'vermilion' : 'draw';
    }
  }

  function nextRound() {
    if (match.matchWinner) {
      match.phase = PHASE.MATCH_END;
      match.phaseTime = 0;
      return;
    }
    match.round += 1;
    match.roundWinner = null;
    match.roundReason = '';
    startBuyPhase();
  }

  function step(dt, agents, player) {
    match.phaseTime -= dt;
    if (match.phase === PHASE.BUY) {
      if (match.phaseTime <= 0) startLivePhase();
      return;
    }
    if (match.phase === PHASE.ROUND_END) {
      if (match.phaseTime <= 0) nextRound();
      return;
    }
    if (match.phase !== PHASE.LIVE) return;

    // Bomb timer.
    if (match.bomb.state === 'planted') {
      match.bomb.timer -= dt;
      if (Math.ceil(match.bomb.timer) !== Math.ceil(match.bomb.timer + dt)) audio.bombBeep();
      if (match.bomb.timer <= 0) {
        match.bomb.state = 'detonated';
        endRound('sable', 'device detonated');
        return;
      }
    }
    if (match.bomb.state === 'defused') {
      endRound('vermilion', 'device defused');
      return;
    }

    const sableAlive = aliveCount('sable', agents);
    const vermilionAlive = aliveCount('vermilion', agents);
    if (sableAlive === 0) {
      endRound('vermilion', match.bomb.state === 'planted' ? 'attackers eliminated' : 'squad wiped');
      return;
    }
    if (vermilionAlive === 0) {
      endRound('sable', match.bomb.state === 'planted' ? 'site cleared' : 'squad wiped');
      return;
    }
    if (match.phaseTime <= 0) {
      if (match.bomb.state === 'planted') {
        // Clock out with the device live: the blast still goes off.
        match.bomb.timer = Math.min(match.bomb.timer, 0.01);
      } else {
        endRound('vermilion', 'time expired — device never planted');
      }
    }
  }

  function buy(player, itemId) {
    const item = BUY_ITEMS.find((entry) => entry.id === itemId);
    if (!item || match.phase !== PHASE.BUY) return false;
    if (match.money.sable < item.price) return false;
    if (item.kind === 'armor') {
      if (player.armor >= ARMOR_HP) return false;
      match.money.sable -= item.price;
      player.armor = ARMOR_HP;
      return true;
    }
    if (item.kind === 'grenade') {
      if (player.grenades >= 2) return false;
      match.money.sable -= item.price;
      player.grenades += 1;
      return true;
    }
    // Primary: buying a new rifle replaces the old one, kept magazines included.
    match.money.sable -= item.price;
    player.primaryId = item.id;
    player.primaryMag = WEAPONS[item.id].mag;
    player.primaryReserve = WEAPONS[item.id].reserve;
    return true;
  }

  return { startBuyPhase, startLivePhase, endRound, nextRound, step, buy, aliveCount };
}
