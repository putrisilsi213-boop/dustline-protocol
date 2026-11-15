// The HUD: health, armor, ammunition, money, round timer, team score, kill feed, the
// buy menu, the bomb status and a top-down minimap. The HUD reads the match state and
// the player; it never keeps its own copy of a number.
export function createHud(world) {
  const el = {};
  for (const id of [
    'overlay', 'overlay-title', 'overlay-copy', 'play', 'keys-list',
    'ammo-mag', 'ammo-reserve', 'weapon-name', 'health-value', 'health-bar',
    'armor-value', 'money-value', 'timer-value', 'score-sable', 'score-vermilion',
    'round-value', 'killfeed', 'hitmarker', 'crosshair', 'damage', 'bomb-status',
    'buy-menu', 'buy-list', 'buy-money', 'banner', 'banner-title', 'banner-sub',
    'minimap', 'grenades-value', 'hint',
  ]) {
    el[id] = document.getElementById(id);
  }
  const minimap = el.minimap ? el.minimap.getContext('2d') : null;
  let lastTimer = -1;
  let lastHealth = -1;

  function showOverlay(kind, data) {
    el.overlay.hidden = false;
    if (kind === 'start') {
      el['overlay-title'].textContent = 'DUSTLINE PROTOCOL';
      el['overlay-copy'].textContent = 'A tactical round-based shooter in a container yard at dusk. Sable attacks — plant the device at Site A or Site B. Vermilion defends. First to 5 rounds takes the match.';
      el.play.textContent = 'Click to play';
    } else if (kind === 'paused') {
      el['overlay-title'].textContent = 'Paused';
      el['overlay-copy'].textContent = 'Click to return to the yard.';
      el.play.textContent = 'Resume';
    } else if (kind === 'round') {
      el['overlay-title'].textContent = data.title;
      el['overlay-copy'].textContent = data.sub;
      el.play.textContent = 'Continue';
    } else if (kind === 'end') {
      el['overlay-title'].textContent = data.title;
      el['overlay-copy'].textContent = data.sub;
      el.play.textContent = 'Play again';
    }
  }

  function hideOverlay() {
    el.overlay.hidden = true;
  }

  function showBanner(title, sub, ms) {
    el['banner-title'].textContent = title;
    el['banner-sub'].textContent = sub || '';
    el.banner.hidden = false;
    setTimeout(() => { el.banner.hidden = true; }, ms || 2800);
  }

  function setAmmo(mag, reserve, grenades, weaponName) {
    el['ammo-mag'].textContent = String(mag);
    el['ammo-reserve'].textContent = `/ ${reserve}`;
    el['grenades-value'].textContent = `◉ ${grenades}`;
    if (weaponName) el['weapon-name'].textContent = weaponName;
    el.ammo = el.ammo || document.getElementById('ammo');
    if (el.ammo) el.ammo.classList.toggle('empty', mag === 0);
  }

  function setHealth(health, armor) {
    const shown = Math.max(0, Math.ceil(health));
    el['health-value'].textContent = String(shown);
    el['health-bar'].style.width = `${Math.max(0, Math.min(100, health))}%`;
    el['health-bar'].style.background = health > 50 ? '#f2a33c' : health > 25 ? '#d84a35' : '#ff2d2d';
    el['armor-value'].textContent = armor > 0 ? `🛡 ${Math.ceil(armor)}` : '';
    if (health < lastHealth) {
      el.damage.style.opacity = String(Math.min(0.85, (100 - health) / 100 + 0.25));
      setTimeout(() => { el.damage.style.opacity = '0'; }, 260);
    }
    lastHealth = health;
  }

  function setMoney(money) {
    el['money-value'].textContent = `$${money}`;
  }

  function setTimer(seconds, phase) {
    const value = Math.max(0, Math.ceil(seconds));
    if (value === lastTimer) return;
    lastTimer = value;
    const minutes = Math.floor(value / 60);
    const secs = String(value % 60).padStart(2, '0');
    el['timer-value'].textContent = `${minutes}:${secs}`;
    el['timer-value'].style.color = value <= 10 && phase === 'live' ? '#ff2d2d' : '';
  }

  function setScore(sable, vermilion, round) {
    el['score-sable'].textContent = String(sable);
    el['score-vermilion'].textContent = String(vermilion);
    el['round-value'].textContent = `ROUND ${round} / 9`;
  }

  function killfeed(attacker, victim, attackerTeam) {
    const row = document.createElement('div');
    row.className = 'feed-row';
    const killer = document.createElement('b');
    killer.textContent = attacker;
    killer.style.color = attackerTeam === 'sable' ? '#f2a33c' : '#d84a35';
    const mark = document.createElement('span');
    mark.textContent = ' ✕ ';
    mark.className = 'feed-x';
    const dead = document.createElement('span');
    dead.textContent = victim;
    row.append(killer, mark, dead);
    el.killfeed.prepend(row);
    while (el.killfeed.children.length > 5) el.killfeed.removeChild(el.killfeed.lastChild);
    setTimeout(() => { if (row.parentNode) row.parentNode.removeChild(row); }, 6000);
  }

  function hitMarker(killed, holdMs) {
    el.hitmarker.classList.add('on');
    if (killed) el.hitmarker.classList.add('kill');
    setTimeout(() => el.hitmarker.classList.remove('on', 'kill'), holdMs || 90);
  }

  function setCrosshairSpread(px) {
    el.crosshair.style.setProperty('--spread', `${px}px`);
  }

  function setBombStatus(state, timer, site) {
    if (state === 'planted') {
      el['bomb-status'].hidden = false;
      el['bomb-status'].textContent = `DEVICE PLANTED — SITE ${site} — ${Math.max(0, Math.ceil(timer))}s`;
      el['bomb-status'].classList.add('planted');
    } else if (state === 'defused') {
      el['bomb-status'].hidden = false;
      el['bomb-status'].textContent = 'DEVICE DEFUSED';
      el['bomb-status'].classList.remove('planted');
    } else {
      el['bomb-status'].hidden = true;
    }
  }

  function renderBuyMenu(money, items, owned) {
    el['buy-menu'].hidden = false;
    el['buy-money'].textContent = `$${money}`;
    el['buy-list'].innerHTML = '';
    items.forEach((item, index) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'buy-row';
      row.dataset.item = item.id;
      const ownedMark = owned && owned[item.id] ? ' ✓' : '';
      row.innerHTML = `<span class="buy-key">${index + 1}</span><span class="buy-name">${item.name}${ownedMark}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">$${item.price}</span>`;
      el['buy-list'].appendChild(row);
    });
  }

  function hideBuyMenu() {
    el['buy-menu'].hidden = true;
  }

  function setHint(text) {
    if (el.hint) el.hint.textContent = text || '';
  }

  function drawMinimap(player, agents, bomb) {
    if (!minimap) return;
    const canvas = el.minimap;
    const size = canvas.width;
    const scale = size / 52;
    const toX = (x) => (x + 26) * scale;
    const toY = (z) => (z + 20) * scale;
    minimap.clearRect(0, 0, size, size);
    minimap.fillStyle = 'rgba(20, 18, 15, 0.85)';
    minimap.fillRect(0, 0, size, size);
    // Walls and containers from the colliders.
    minimap.fillStyle = '#4a4238';
    for (const c of world.colliders) {
      minimap.fillRect(toX(c.min.x), toY(c.min.z), Math.max(1, (c.max.x - c.min.x) * scale), Math.max(1, (c.max.z - c.min.z) * scale));
    }
    // Sites.
    for (const [name, site] of Object.entries(world.sites)) {
      minimap.fillStyle = name === 'A' ? '#f2a33c' : '#4fb3a9';
      minimap.beginPath();
      minimap.arc(toX(site.x), toY(site.z), 4, 0, Math.PI * 2);
      minimap.fill();
      minimap.fillStyle = '#efe7d8';
      minimap.font = 'bold 9px sans-serif';
      minimap.fillText(name, toX(site.x) - 3, toY(site.z) - 6);
    }
    // Bomb.
    if (bomb.state === 'planted' && bomb.position) {
      minimap.fillStyle = '#ff2d2d';
      minimap.beginPath();
      minimap.arc(toX(bomb.position.x), toY(bomb.position.z), 4, 0, Math.PI * 2);
      minimap.fill();
    }
    // Agents: teammates amber, the player white, enemies only when dead (skipped).
    for (const agent of agents) {
      if (!agent.alive || agent.team !== 'sable') continue;
      minimap.fillStyle = agent.isPlayer ? '#ffffff' : '#f2a33c';
      minimap.beginPath();
      minimap.arc(toX(agent.body.position.x), toY(agent.body.position.z), agent.isPlayer ? 4 : 3, 0, Math.PI * 2);
      minimap.fill();
    }
    if (player && player.alive) {
      // Facing wedge for the player.
      const px = toX(player.body.position.x);
      const py = toY(player.body.position.z);
      const yaw = player.body.yaw;
      minimap.strokeStyle = '#ffffff';
      minimap.beginPath();
      minimap.moveTo(px, py);
      minimap.lineTo(px - Math.sin(yaw) * 10, py - Math.cos(yaw) * 10);
      minimap.stroke();
    }
  }

  return {
    showOverlay,
    hideOverlay,
    showBanner,
    setAmmo,
    setHealth,
    setMoney,
    setTimer,
    setScore,
    killfeed,
    hitMarker,
    setCrosshairSpread,
    setBombStatus,
    renderBuyMenu,
    hideBuyMenu,
    setHint,
    drawMinimap,
    onPlay(callback) { el.play.addEventListener('click', callback); },
    onBuy(callback) {
      el['buy-list'].addEventListener('click', (event) => {
        const row = event.target.closest('.buy-row');
        if (row) callback(row.dataset.item);
      });
    },
  };
}
