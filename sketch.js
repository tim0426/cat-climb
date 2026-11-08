/**
 * NinJump DX — Cat Climb (local playable)
 * 貓喺兩邊牆向上爬；空白鍵／點擊跳去對面（有弧度）。
 * 小飛龍由上飛落；炮台射炮彈。GitHub Pages: tim0426/ninjump-dx-pixel
 *
 * Approved demo decisions:
 * 1) Wall-run: upright→scale(h=jump)→ROTATE_270→FLIP_TOP_BOTTOM (L);
 *    right = mirror(L). Feet on wall, head→gap; belly TOP / back BOTTOM.
 * 2) Camera: walls & bg scroll DOWN → climb-up illusion
 * 3) Pointed triangular spikes
 * 4) Shield: 8-frame aura + bubble + hit_flash (demo/shield_pack)
 * 5) Every 3 slash HITS → climb boost + cyan trailing afterimages
 * 6) Player cat sprites scaled ~18px body (NEAREST) to match dragon/bat (~14-16px)
 * 7) Removed wall beetles/hornets (tiny, no reliable hit feel)
 * 8) Cannon: brighter ember ball + muzzle flash/smoke on fire
 * 9) GEM teleport: soft dash-like afterimages + subtle streaks (demo/gem_soft_dash_*) — not full-screen wash
 * 10) Jump spin slash: START+4 midair (spin 00/02/04/06) + single sweeping arc (demo/spin_slash_cleaner_*) — not 米字 spokes
 * 11) Wall hazards (cannon / spikes) keep min vertical gap so they don't cluster
 * 12) Jump: shorter (19f) + ease-out + 3f buffer; soft phone haptic on jump / slash / hurt / death
 * 13) Global TOP 10 on death screen (Apps Script HTTPS leaderboard, all players)
 */

const VW = 180;
const VH = 320;
let SCALE = 2;

const WALL = 22;
const GAP_L = WALL;
const GAP_R = VW - WALL;
/** Min world-Y gap between wall hazards (cannon + spikes) so they don't stack too tight */
const MIN_WALL_HAZARD_GAP = 100;
/** Jump feel: shorter + ease-out so leap starts immediately (less sluggish) */
const JUMP_DUR = 19;
/** Frames before landing that still accept a jump press */
const JUMP_BUFFER_FRAMES = 3;
/** Phone haptic (ms). Soft buzz — Android Chrome; iOS often no-ops */
const HAPTIC_JUMP = 8;
const HAPTIC_SLASH = 14;
const HAPTIC_HURT = 22;
const HAPTIC_DEATH = [28, 36, 22];
/** Global top-10 (all players) via Google Apps Script HTTPS */
const LEADERBOARD_URL = 'https://script.google.com/macros/s/AKfycbzFweiMOySCx1Ts13lFnNWJ4Tsv1ufBllnycFlzvn5ezI5VTg_-ewhuJhcuWoJdyk2GpA/exec';

let sprites = {};
let bgImg = null;
let bgTube = null;
let player;
let entities = [];
let particles = [];
let camY = 0;
let best = 0;
let state = 'title';
let shake = 0;
let jumpBuffer = 0;
let spawnAcc = 0;
let slashHitCombo = 0; // 0..3 — any slash hit on enemy/obstacle
let flashMsg = '';
let flashTimer = 0;
let bgMode = 'cave';
let hitFlashTimer = 0;
let gemWarpTimer = 0;      // frames remaining of GEM scene-wide warp
let gemWarpPhase = 0;      // 0..1 progress
let gemStreaks = [];       // screen-space speed streaks regenerated each warp
let gemGhosts = [];        // world-space afterimage samples during warp
let leaderboard = [];      // [{name, score}] global top 10
let leaderboardStatus = 'idle'; // idle|loading|ok|error
let playerName = '';
let lastRunDist = 0;

function preload() {
  const load = (folder, name) => {
    sprites[name] = loadImage(`assets/${folder}/${name}.png`);
  };

  for (let i = 1; i <= 8; i++) {
    const id = String(i).padStart(2, '0');
    load('player', `cat_wall_run_${id}`);
    load('player', `cat_wall_run_${id}_rightwall`);
  }
  for (let i = 1; i <= 3; i++) {
    load('player', `cat_jump_0${i}`);
    load('player', `cat_jump_0${i}_rightwall`);
  }
  ['cat_slash', 'cat_slash_rightwall', 'cat_fall', 'cat_fall_rightwall',
   'cat_land', 'cat_land_rightwall',
   'cat_wall_run_01_shield', 'cat_wall_run_01_shield_rightwall',
   'cat_jump_01_shield', 'cat_jump_01_shield_rightwall'
  ].forEach(n => load('player', n));

  ['shield', 'combo_on', 'combo_off', 'boost_star', 'coin_01', 'heart', 'gem', 'clock']
    .forEach(n => load('items', n));

  for (let i = 0; i < 3; i++) {
    load('enemies', `dragon_right_${i}`);
    load('enemies', `dragon_left_${i}`);
    load('enemies', `dragon_downish_${i}`);
    load('enemies', `dragon_gold_${i}`);
  }
  for (let i = 0; i < 4; i++) load('enemies', `bat_${i}`);
  load('enemies', 'dragon');

  ['wall_spikes', 'wall_spikes_right', 'cannonball', 'arrow', 'shuriken']
    .forEach(n => load('obstacles', n));
  ['cannon_left', 'cannon_right'].forEach(n => load('obstacles', n));
  for (let i = 1; i <= 5; i++) {
    load('obstacles', `cannon_l_${i}`);
    load('obstacles', `cannon_r_${i}`);
  }

  ['classic', 'castle', 'pirate', 'jungle'].forEach(t => {
    load('tiles', `wall_${t}`);
    load('tiles', `wall_edge_${t}`);
  });

  ['slash_01', 'slash_02', 'land_dust_01', 'hit_puff',
   'explode_1', 'explode_2', 'explode_3',
   'spin_slash_burst'].forEach(n => load('effects', n));
  for (let i = 1; i <= 4; i++) load('effects', `spin_slash_arc_0${i}`);
  for (let i = 0; i < 8; i++) {
    const id = String(i).padStart(2, '0');
    load('player', `cat_spin_${id}`);
    load('player', `cat_spin_${id}_rightwall`);
  }
  for (let i = 1; i <= 8; i++) {
    load('effects', `shield_aura_0${i}`);
  }
  load('effects', 'shield_bubble');
  load('effects', 'shield_hit_flash');
  for (let i = 0; i < 5; i++) {
    load('effects', `muzzle_${i}`);
    load('effects', `muzzle_r_${i}`);
  }
  ['height_flag', 'medal'].forEach(n => load('ui', n));

  bgImg = loadImage('assets/bg/bg_cave.png');
  bgTube = loadImage('assets/bg/bg_tubes.png');
  sprites.bg_sky = loadImage('assets/bg/bg_sky.png');
  sprites.bg_stars = loadImage('assets/bg/bg_stars.png');
}

function setup() {
  SCALE = max(2, min(floor(windowWidth / VW), floor(windowHeight / VH)));
  const c = createCanvas(VW * SCALE, VH * SCALE);
  c.elt.style.imageRendering = 'pixelated';
  noSmooth();
  pixelDensity(1);
  textFont('monospace');
  best = int(getItem('ninjump_cat_best') || 0);
  playerName = ensurePlayerName();
  resetRun(false);
  fetchLeaderboard();
}

function windowResized() {
  SCALE = max(2, min(floor(windowWidth / VW), floor(windowHeight / VH)));
  resizeCanvas(VW * SCALE, VH * SCALE);
}

function resetRun(startPlay) {
  const modes = ['cave', 'tubes', 'sky', 'stars'];
  bgMode = random(modes);
  player = new Player();
  entities = [];
  particles = [];
  camY = 0;
  spawnAcc = 0;
  slashHitCombo = 0;
  flashMsg = '';
  flashTimer = 0;
  hitFlashTimer = 0;
  gemWarpTimer = 0;
  gemWarpPhase = 0;
  gemStreaks = [];
  gemGhosts = [];
  jumpBuffer = 0;
  for (let i = 0; i < 7; i++) spawnContent(90 + i * 95);
  state = startPlay ? 'play' : 'title';
}

function draw() {
  push();
  if (shake > 0) {
    translate(random(-shake, shake) * SCALE, random(-shake, shake) * SCALE);
    shake *= 0.8;
    if (shake < 0.2) shake = 0;
  }
  scale(SCALE);
  noSmooth();

  drawBackground();
  drawWalls();

  // World layer: player stays ~mid-screen; camY tracks -player.y so world scrolls DOWN
  push();
  translate(0, VH * 0.62 + camY);

  if (state === 'play') updatePlay();

  for (let e of entities) e.draw();
  player.draw();
  for (let p of particles) p.draw();
  pop();

  drawGemWarpScreenFX();
  drawHUD();
  if (state === 'title') drawTitle();
  if (state === 'dead') drawDead();
  pop();
}

function updatePlay() {
  player.update();
  if (jumpBuffer > 0) {
    jumpBuffer--;
    if (player.climbing && player.jump()) haptic(HAPTIC_JUMP);
  }
  updateGemWarp();
  // Climbing UP (player.y ↓) → camY ↑ → walls/bg offsets scroll DOWN
  camY = -player.y;

  spawnAcc += player.climbSpeed;
  while (spawnAcc > 65) {
    spawnAcc -= 65;
    spawnContent(player.y - VH - random(30, 110));
  }

  for (let i = entities.length - 1; i >= 0; i--) {
    const e = entities[i];
    e.update();
    if (e.dead || e.y > player.y + VH) {
      entities.splice(i, 1);
      continue;
    }
    if (e.collides(player)) handleCollision(e);
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    if (particles[i].life <= 0) particles.splice(i, 1);
  }

  if (flashTimer > 0) flashTimer--;
  if (hitFlashTimer > 0) hitFlashTimer--;

  const dist = floor(max(0, -player.y) / 10);
  if (dist > best) {
    best = dist;
    storeItem('ninjump_cat_best', best);
  }
}

function handleCollision(e) {
  if (e.kind === 'pickup') {
    e.dead = true;
    if (e.type === 'shield') { player.hasShield = true; flash('SHIELD!', 40); }
    else if (e.type === 'heart') { player.invuln = max(player.invuln, 60); flash('SAFE!', 35); }
    else if (e.type === 'gem') { startGemWarp(80); flash('GEM UP!', 45); }
    else if (e.type === 'clock') { player.activateBoost(70); flash('BOOST', 35); }
    return;
  }
  if (e.kind === 'enemy') {
    if (player.slashing) {
      e.dead = true;
      spawnHit(e.x, e.y);
      registerSlashHit();
      haptic(HAPTIC_SLASH);
      return;
    }
    hurtPlayer();
    e.dead = true;
    return;
  }
  if (e.kind === 'obstacle') {
    if (player.slashing && (e.type === 'cannonball' || e.type === 'shuriken' || e.type === 'arrow' || e.type === 'wall_spikes')) {
      // slashable projectiles; spikes only count if mid-slash contact (rare) — keep projectiles
      if (e.type === 'wall_spikes') {
        hurtPlayer();
        return;
      }
      e.dead = true;
      spawnHit(e.x, e.y);
      registerSlashHit();
      haptic(HAPTIC_SLASH);
      return;
    }
    hurtPlayer();
    if (e.type !== 'cannon' && e.type !== 'wall_spikes') e.dead = true;
  }
}

function hurtPlayer() {
  if (player.invuln > 0) return;
  if (player.hasShield) {
    player.hasShield = false;
    player.invuln = 40;
    hitFlashTimer = 12;
    flash('SHIELD BREAK', 35);
    haptic(HAPTIC_HURT);
    return;
  }
  player.die();
  slashHitCombo = 0;
  state = 'dead';
  haptic(HAPTIC_DEATH);
  lastRunDist = floor(max(0, -player.y) / 10);
  submitLeaderboardScore(lastRunDist);
}

/** Every 3 jump-slashes that HIT an enemy/projectile → climb boost + afterimages */
function registerSlashHit() {
  slashHitCombo++;
  if (slashHitCombo >= 3) {
    slashHitCombo = 0;
    player.activateBoost(90);
    flash('DASH!', 50);
    for (let i = 0; i < 12; i++) {
      particles.push(new Particle(player.x, player.y - 10, color(80, 255, 255)));
    }
  }
}

function wallHazardTooClose(worldY) {
  for (const e of entities) {
    if ((e.type === 'cannon' || e.type === 'wall_spikes') &&
        Math.abs(e.y - worldY) < MIN_WALL_HAZARD_GAP) {
      return true;
    }
  }
  return false;
}

function placeAwayFromWallHazards(worldY) {
  let y = worldY;
  for (let tries = 0; tries < 4; tries++) {
    if (!wallHazardTooClose(y)) return y;
    y -= MIN_WALL_HAZARD_GAP; // further up the climb (smaller y)
  }
  return null; // still crowded
}

function spawnFlyerAt(worldY) {
  const kind = random() < 0.75 ? 'dragon' : 'bat';
  const x = GAP_L + 16 + random(VW - WALL * 2 - 32);
  entities.push(new Flyer(x, worldY, kind));
}

function spawnContent(worldY) {
  const r = random();
  if (r < 0.10) {
    entities.push(new Pickup(VW / 2 + random(-20, 20), worldY, random(['shield', 'shield', 'heart', 'gem', 'clock'])));
  } else if (r < 0.28) {
    const y = placeAwayFromWallHazards(worldY);
    if (y == null) { spawnFlyerAt(worldY); return; }
    const side = random() < 0.5 ? 'left' : 'right';
    const x = side === 'left' ? GAP_L + 8 : GAP_R - 8;
    entities.push(new Cannon(x, y, side));
  } else if (r < 0.78) {
    spawnFlyerAt(worldY);
  } else {
    const y = placeAwayFromWallHazards(worldY);
    if (y == null) { spawnFlyerAt(worldY); return; }
    const side = random() < 0.5 ? 'left' : 'right';
    const x = side === 'left' ? GAP_L + 8 : GAP_R - 8;
    entities.push(new Obstacle(x, y, 'wall_spikes', side));
  }
}

function spawnHit(x, y) {
  particles.push(new Particle(x, y, color(255, 80, 80)));
  particles.push(new Particle(x, y, color(255, 200, 80)));
}

function addShake(amount) {
  shake = max(shake, amount);
}

/** Soft device vibration (phone buzz). Safe no-op if unsupported. */
function haptic(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch (e) { /* ignore */ }
}

function doJump() {
  if (state === 'title' || state === 'dead') { resetRun(true); return; }
  if (state !== 'play') return;
  // buffer early presses so landing still feels snappy
  jumpBuffer = JUMP_BUFFER_FRAMES;
  if (player.jump()) haptic(HAPTIC_JUMP);
}

function keyPressed() {
  if (key === ' ' || key === 'w' || key === 'W' || keyCode === UP_ARROW) {
    doJump();
    return false;
  }
  if (key === 'r' || key === 'R') resetRun(true);
  if (key === 'b' || key === 'B') {
    const modes = ['cave', 'tubes', 'sky', 'stars'];
    bgMode = modes[(modes.indexOf(bgMode) + 1) % modes.length];
  }
}

function mousePressed() { doJump(); }
function touchStarted() { doJump(); return false; }

function drawBackground() {
  noStroke();
  let img = bgImg;
  if (bgMode === 'tubes') img = bgTube;
  else if (bgMode === 'sky') img = sprites.bg_sky;
  else if (bgMode === 'stars') img = sprites.bg_stars;
  else img = bgImg;

  if (img && img.width) {
    const scaleX = VW / img.width;
    const tileH = img.height * scaleX;
    // camY ↑ → off ↑ → tiles shift DOWN (climb-up illusion)
    const off = ((camY * 0.35) % tileH + tileH) % tileH;
    for (let y = -tileH; y < VH + tileH; y += tileH) {
      image(img, 0, y + off, VW, tileH);
    }
    fill(0, bgMode === 'sky' ? 40 : 70);
    rect(WALL, 0, VW - WALL * 2, VH);
  } else {
    for (let y = 0; y < VH; y++) {
      const t = y / VH;
      fill(30 * (1 - t * 0.3), 40, 70 + t * 20);
      rect(0, y, VW, 1);
    }
  }
}

function drawWalls() {
  const tile = sprites.wall_classic || sprites.wall_castle;
  const edge = sprites.wall_edge_classic;
  // camY ↑ → off ↑ → brick tiles scroll DOWN
  const off = ((camY % 16) + 16) % 16;
  for (let y = -16; y < VH + 16; y += 16) {
    if (tile) {
      image(tile, 0, y + off - 16, WALL, 16);
      image(tile, VW - WALL, y + off - 16, WALL, 16);
    } else {
      fill(90); rect(0, y + off - 16, WALL, 16); rect(VW - WALL, y + off - 16, WALL, 16);
    }
  }
  if (edge) {
    // scroll edges with same offset for continuity
    for (let y = -16; y < VH + 16; y += 16) {
      image(edge, WALL - 6, y + off - 16, 6, 16);
      push();
      translate(VW - WALL + 6, y + off - 16);
      scale(-1, 1);
      image(edge, 0, 0, 6, 16);
      pop();
    }
  }
}

function drawHUD() {
  const dist = state === 'title' ? 0 : floor(max(0, -player.y) / 10);
  noStroke();
  fill(0, 140);
  rect(0, 0, VW, 22);

  fill(255);
  textSize(8);
  textAlign(LEFT, CENTER);
  text(`H ${dist}m`, 6, 11);
  textAlign(RIGHT, CENTER);
  text(`BEST ${best}`, VW - 6, 11);

  // slash-hit combo meter (need 3 hits for DASH)
  for (let i = 0; i < 3; i++) {
    const sp = sprites[i < slashHitCombo ? 'combo_on' : 'combo_off'];
    if (sp) image(sp, 50 + i * 10, 6, 8, 8);
  }
  if (player && player.hasShield && sprites.shield) image(sprites.shield, VW / 2 - 8, 2, 16, 16);
  if (player && player.boostTimer > 0) {
    fill(80, 255, 255);
    textAlign(CENTER, CENTER);
    textSize(7);
    text('DASH', VW / 2 + 22, 11);
  }

  if (flashTimer > 0) {
    fill(255, 230, 80);
    textAlign(CENTER, TOP);
    textSize(10);
    text(flashMsg, VW / 2, 26);
  }

  fill(200);
  textSize(6);
  textAlign(CENTER, BOTTOM);
  text('CAT · ' + bgMode.toUpperCase() + '  (B換背景)', VW / 2, VH - 4);
}

function drawTitle() {
  fill(0, 150);
  rect(0, 0, VW, VH);
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(12);
  text('Cat Climb DX', VW / 2, VH / 2 - 48);
  textSize(7);
  fill(255, 200, 80);
  text('Ranger Cat · NinJump style', VW / 2, VH / 2 - 32);
  fill(220);
  text('空白鍵／點擊 → 跳去對面牆', VW / 2, VH / 2 - 2);
  text('空中可斬小飛龍同炮彈', VW / 2, VH / 2 + 10);
  text('斬中 3 次 → DASH 疾走＋殘影', VW / 2, VH / 2 + 22);
  text('藍寶石 = 全場 WARP · 跳牆旋轉斬', VW / 2, VH / 2 + 34);
  text('攞盾 = 藍色光環防護', VW / 2, VH / 2 + 46);
  fill(180);
  text('按空白鍵開始', VW / 2, VH / 2 + 68);
}

function ensurePlayerName() {
  let n = getItem('ninjump_cat_name');
  if (n && String(n).length >= 2) return String(n).slice(0, 16);
  const id = String(floor(random(1000, 9999)));
  n = 'Cat' + id;
  storeItem('ninjump_cat_name', n);
  return n;
}

function leaderboardJsonp(query, onOk, onErr) {
  const cb = '_lb' + Date.now() + '_' + floor(random(1e6));
  let done = false;
  const finish = (fn, arg) => {
    if (done) return;
    done = true;
    try { delete window[cb]; } catch (e) {}
    if (script && script.parentNode) script.parentNode.removeChild(script);
    clearTimeout(timer);
    fn && fn(arg);
  };
  window[cb] = (data) => finish(onOk, data);
  const script = document.createElement('script');
  script.async = true;
  script.src = LEADERBOARD_URL + '?' + query + '&callback=' + cb + '&_=' + Date.now();
  script.onerror = () => finish(onErr);
  const timer = setTimeout(() => finish(onErr), 10000);
  document.head.appendChild(script);
}

function applyLeaderboardData(data) {
  if (data && data.ok && Array.isArray(data.top)) {
    leaderboard = data.top.slice(0, 10);
    leaderboardStatus = 'ok';
    return true;
  }
  leaderboardStatus = 'error';
  return false;
}

function fetchLeaderboard() {
  leaderboardStatus = 'loading';
  leaderboardJsonp('action=list', (data) => {
    applyLeaderboardData(data);
  }, () => { leaderboardStatus = 'error'; });
}

function submitLeaderboardScore(score) {
  score = int(score) || 0;
  if (score <= 0) {
    fetchLeaderboard();
    return;
  }
  leaderboardStatus = 'loading';
  const q = 'action=add'
    + '&name=' + encodeURIComponent(playerName || ensurePlayerName())
    + '&score=' + score;
  leaderboardJsonp(q, (data) => {
    if (!applyLeaderboardData(data)) fetchLeaderboard();
  }, () => {
    leaderboardStatus = 'error';
    fetchLeaderboard();
  });
}

function drawDead() {
  fill(0, 175);
  rect(0, 0, VW, VH);
  const dist = lastRunDist || floor(max(0, -player.y) / 10);

  fill(255, 80, 80);
  textAlign(CENTER, TOP);
  textSize(12);
  text('FALL!', VW / 2, 18);
  fill(255);
  textSize(9);
  text(dist + ' m', VW / 2, 34);
  fill(180);
  textSize(6);
  text('You ' + (playerName || 'Cat') + ' · Best ' + best + ' m', VW / 2, 48);

  // Global TOP 10
  fill(120, 255, 220);
  textSize(7);
  text('GLOBAL TOP 10', VW / 2, 64);
  textAlign(LEFT, TOP);
  textSize(6);
  let y = 76;
  if (leaderboardStatus === 'loading' && leaderboard.length === 0) {
    fill(200);
    textAlign(CENTER, TOP);
    text('loading…', VW / 2, y);
  } else if (leaderboardStatus === 'error' && leaderboard.length === 0) {
    fill(255, 160, 120);
    textAlign(CENTER, TOP);
    text('board offline', VW / 2, y);
  } else {
    const rows = leaderboard.slice(0, 10);
    for (let i = 0; i < 10; i++) {
      const row = rows[i];
      const mine = row && row.name === playerName;
      fill(mine ? color(255, 230, 80) : color(220));
      const rank = (i + 1) + '.';
      if (row) {
        const nm = String(row.name).slice(0, 12);
        const sc = int(row.score) + 'm';
        text(rank, 18, y);
        text(nm, 36, y);
        textAlign(RIGHT, TOP);
        text(sc, VW - 18, y);
        textAlign(LEFT, TOP);
      } else {
        fill(90);
        text(rank + ' —', 18, y);
      }
      y += 11;
    }
  }

  fill(200);
  textAlign(CENTER, BOTTOM);
  textSize(7);
  text('空白鍵再試', VW / 2, VH - 14);
}

function flash(msg, t) { flashMsg = msg; flashTimer = t; }

/* ========== GEM teleport — soft dash-like (demo/gem_soft_dash_*) ========== */
const GEM_WARP_DUR = 28; // shorter soft dash warp

function startGemWarp(distance) {
  gemWarpTimer = GEM_WARP_DUR;
  gemWarpPhase = 0;
  gemGhosts = [];
  // few thin screen-space streaks (not dense wash)
  gemStreaks = [];
  for (let i = 0; i < 8; i++) {
    gemStreaks.push({
      x: WALL + 4 + random(VW - WALL * 2 - 8),
      y: random(-30, VH),
      len: random(18, 42),
      thick: 1,
      speed: random(10, 18),
      bright: random()
    });
  }
  player.gemWarpDist = distance;
  player.gemWarpFromY = player.y;
  player.invuln = max(player.invuln, GEM_WARP_DUR + 8);
  // soft localized pickup flash (not full-screen)
  for (let i = 0; i < 6; i++) {
    particles.push(new Particle(player.x, player.y, color(80, 255, 255)));
  }
  addShake(1.2);
}

function updateGemWarp() {
  if (gemWarpTimer <= 0) {
    // let lingering ghosts fade after settle
    for (let i = gemGhosts.length - 1; i >= 0; i--) {
      gemGhosts[i].life--;
      if (gemGhosts[i].life <= 0) gemGhosts.splice(i, 1);
    }
    return;
  }
  gemWarpTimer--;
  const t = 1 - gemWarpTimer / GEM_WARP_DUR;
  gemWarpPhase = t;
  // ease-out upward teleport
  const eased = 1 - pow(1 - constrain(t, 0, 1), 2.2);
  if (player && !player.dead && player.gemWarpDist) {
    player.y = player.gemWarpFromY - player.gemWarpDist * eased;
    // sample sparsely — keep 2–3 dash-like clones
    if (t > 0.08 && t < 0.9 && frameCount % 3 === 0) {
      gemGhosts.push({
        x: player.x,
        y: player.y,
        side: player.side,
        jumpFrom: player.jumpFrom,
        anim: player.anim,
        slashFrame: player.slashFrame,
        air: player.side === 'air',
        spinFrame: player.spinFrame || 0,
        life: 14
      });
      if (gemGhosts.length > 3) gemGhosts.shift();
    }
  }
  // advance streaks downward (climb-up illusion)
  for (let s of gemStreaks) {
    s.y += s.speed;
    if (s.y > VH + 20) {
      s.y = -s.len - random(10);
      s.x = WALL + 4 + random(VW - WALL * 2 - 8);
    }
  }
  for (let i = gemGhosts.length - 1; i >= 0; i--) {
    gemGhosts[i].life--;
    if (gemGhosts[i].life <= 0) gemGhosts.splice(i, 1);
  }
  if (gemWarpTimer <= 0) {
    gemStreaks = [];
    player.gemWarpDist = 0;
    // keep at most 1 faint trail ghost on land
    while (gemGhosts.length > 1) gemGhosts.shift();
  }
}

/** Soft screen streaks + subtle tint (no full-screen wash) */
function drawGemWarpScreenFX() {
  if (gemWarpTimer <= 0 && gemGhosts.length === 0) return;
  const peak = gemWarpTimer > 0
    ? sin(constrain(gemWarpPhase, 0, 1) * PI)
    : 0;

  // very soft localized cyan — avoid full-screen brightness
  if (gemWarpTimer > 0 && peak > 0.05) {
    noStroke();
    fill(40, 180, 255, 12 + peak * 22);
    rect(WALL, 0, VW - WALL * 2, VH);
  }

  // subtle thin vertical streaks in the gap
  if (gemWarpTimer > 0) {
    noStroke();
    for (let s of gemStreaks) {
      const a = s.bright > 0.6
        ? 70 + peak * 50
        : 35 + peak * 35;
      fill(80, 230, 255, a);
      rect(s.x, s.y, s.thick, s.len);
    }
  }
}

/** World-space dash-like afterimages (2–3 clones, like DASH) */
function drawGemWarpGhosts() {
  if (!gemGhosts.length || !player) return;
  // draw oldest → newest, spaced samples only
  const n = gemGhosts.length;
  for (let i = 0; i < n; i++) {
    const g = gemGhosts[i];
    const name = player.spriteName(g.side, g.jumpFrom, g.anim, g.slashFrame, g.air, false, g.spinFrame);
    const sp = sprites[name] || sprites.cat_wall_run_01;
    if (!sp) continue;
    // softer alphas than old dense wash
    const alpha = map(i, 0, max(1, n - 1), 35, 110) * map(g.life, 0, 14, 0.35, 1);
    push();
    tint(60, 230, 255, alpha);
    player.drawSpriteAt(sp, g.x, g.y, g.side, g.air);
    pop();
    noTint();
  }
}

/* ========== Player ========== */
class Player {
  constructor() {
    this.side = 'left';
    this.x = GAP_L;
    this.y = 0;
    this.vy = 0;
    this.jumpT = 0;
    this.jumpFrom = 'left';
    this.anim = 0;
    this.slashFrame = 0;
    this.slashing = false;
    this.hasShield = false;
    this.invuln = 0;
    this.boostTimer = 0;
    this.dead = false;
    this.climbSpeed = 1.6;
    this.w = 9;
    this.h = 13;
    this.trail = []; // afterimage samples {x,y,side,jumpFrom,anim,name hint}
    this.hitThisSlash = false;
    this.spinFrame = 0;       // even ids 00/02/04/06 (4 midair poses)
    this.gemWarpDist = 0;
    this.gemWarpFromY = 0;
    this.slashTrail = [];     // cyan path dots during spin jump
  }

  get climbing() { return this.side === 'left' || this.side === 'right'; }

  activateBoost(frames) {
    this.boostTimer = max(this.boostTimer, frames);
  }

  jump() {
    if (this.dead || !this.climbing) return false;
    this.jumpFrom = this.side;
    this.side = 'air';
    this.jumpT = 0;
    this.slashing = true;
    this.slashFrame = 0;
    this.spinFrame = 0;
    this.hitThisSlash = false;
    this.slashTrail = [];
    jumpBuffer = 0;
    return true;
  }

  die() {
    this.dead = true;
    this.slashing = false;
    this.side = 'air';
    this.vy = 2;
    this.trail = [];
    this.slashTrail = [];
  }

  update() {
    if (this.dead) {
      this.y += 2.5;
      this.vy += 0.15;
      return;
    }

    const base = this.boostTimer > 0 ? 3.4 : 1.6;
    this.climbSpeed = base;
    if (this.boostTimer > 0) this.boostTimer--;
    if (this.invuln > 0) this.invuln--;

    if (this.climbing) {
      this.y -= this.climbSpeed;
      this.x = this.side === 'left' ? GAP_L : GAP_R;
      this.anim += this.boostTimer > 0 ? 0.45 : 0.28;
      this.slashing = false;
    } else {
      this.jumpT++;
      const dur = JUMP_DUR;
      const t = constrain(this.jumpT / dur, 0, 1);
      // ease-out quad: strong horizontal start → less "slow takeoff" feel
      const te = 1 - (1 - t) * (1 - t);
      const fromX = this.jumpFrom === 'left' ? GAP_L : GAP_R;
      const toX = this.jumpFrom === 'left' ? GAP_R : GAP_L;
      this.x = lerp(fromX, toX, te);
      this.y -= this.climbSpeed * 0.9;
      this.y -= sin(t * PI) * 4.5;

      this.slashFrame = floor(t * 3);
      // cleaner spin: only 4 midair poses — spin 00/02/04/06
      this.spinFrame = constrain(floor(t * 4), 0, 3) * 2;
      // soft white/cyan dash afterimages (2–3), not dense path dots
      if (this.jumpT % 3 === 0) {
        this.slashTrail.push({ x: this.x, y: this.y, life: 10, spinFrame: this.spinFrame });
        if (this.slashTrail.length > 3) this.slashTrail.shift();
      }
      for (let i = this.slashTrail.length - 1; i >= 0; i--) {
        this.slashTrail[i].life--;
        if (this.slashTrail[i].life <= 0) this.slashTrail.splice(i, 1);
      }
      if (t >= 1) {
        this.side = this.jumpFrom === 'left' ? 'right' : 'left';
        this.x = this.side === 'left' ? GAP_L : GAP_R;
        this.slashing = false;
        this.spinFrame = 0;
        this.slashTrail = [];
        particles.push(new Particle(this.x, this.y + 8, color(220, 220, 230)));
      }
    }

    // record trail while boosting (for dash afterimages / 殘影)
    if (this.boostTimer > 0) {
      this.trail.push({
        x: this.x,
        y: this.y,
        side: this.side,
        jumpFrom: this.jumpFrom,
        anim: this.anim,
        slashFrame: this.slashFrame,
        spinFrame: this.spinFrame,
        air: this.side === 'air'
      });
      if (this.trail.length > 10) this.trail.shift();
    } else {
      this.trail = [];
    }
  }

  spriteName(side, jumpFrom, anim, slashFrame, air, dead, spinFrame) {
    const useRightWall = (side === 'right') || (air && jumpFrom === 'left');
    if (dead) return useRightWall ? 'cat_fall_rightwall' : 'cat_fall';
    if (air) {
      // Jump spin slash: prefer pre-rotated NEAREST spin frames
      const sf = (spinFrame == null) ? slashFrame : spinFrame;
      const id = String(constrain(sf, 0, 7)).padStart(2, '0');
      const spinKey = useRightWall ? `cat_spin_${id}_rightwall` : `cat_spin_${id}`;
      if (sprites[spinKey]) return spinKey;
      const f = constrain(slashFrame + 1, 1, 3);
      return useRightWall ? `cat_jump_0${f}_rightwall` : `cat_jump_0${f}`;
    }
    const f = String((floor(anim) % 8) + 1).padStart(2, '0');
    return side === 'right' ? `cat_wall_run_${f}_rightwall` : `cat_wall_run_${f}`;
  }

  drawSpriteAt(sp, x, y, side, air) {
    if (!sp) return;
    imageMode(CORNER);
    let dx, dy;
    dy = y - sp.height / 2;
    if (air) {
      dx = x - sp.width / 2;
    } else if (side === 'left') {
      // flush: feet on left wall
      dx = GAP_L;
    } else if (side === 'right') {
      // flush: feet on right wall
      dx = GAP_R - sp.width;
    } else {
      dx = x - sp.width / 2;
    }
    image(sp, dx, dy);
  }

  drawAfterimages() {
    if (this.trail.length < 2) return;
    // demo/dash_afterimage: 2–3 translucent cyan trailing clones behind climb
    const idxs = [];
    const n = this.trail.length;
    // pick spaced samples (skip newest = current pose)
    if (n >= 8) idxs.push(n - 8, n - 5, n - 3);
    else if (n >= 5) idxs.push(0, floor(n / 2), n - 2);
    else idxs.push(0, n - 2);
    for (let i = 0; i < idxs.length; i++) {
      const s = this.trail[idxs[i]];
      if (!s) continue;
      const name = this.spriteName(s.side, s.jumpFrom, s.anim, s.slashFrame, s.air, false, s.spinFrame);
      const sp = sprites[name] || sprites.cat_wall_run_01;
      if (!sp) continue;
      const alpha = map(i, 0, idxs.length - 1, 45, 150);
      push();
      tint(60, 230, 255, alpha);
      this.drawSpriteAt(sp, s.x, s.y, s.side, s.air);
      pop();
      noTint();
    }
  }

  drawShieldFX() {
    if (!this.hasShield || this.dead) return;
    // center on body: wall-run sprites are flush; offset into gap
    const cx = this.side === 'left' ? GAP_L + 9
      : this.side === 'right' ? GAP_R - 9
      : this.x;
    const cy = this.y;
    // demo/shield_pack aura_01..08 loop + bubble (+ hit_flash on break)
    const ai = 1 + (floor(frameCount / 3) % 8);
    const aura = sprites[`shield_aura_0${ai}`];
    imageMode(CENTER);
    if (aura) {
      push();
      translate(cx, cy);
      const pulse = 1 + sin(frameCount * 0.15) * 0.08;
      image(aura, 0, 0, 23 * pulse, 23 * pulse);
      pop();
    }
    const bubble = sprites.shield_bubble;
    if (bubble) {
      push();
      translate(cx, cy);
      rotate(frameCount * 0.05);
      const bp = 1 + sin(frameCount * 0.12 + 1) * 0.05;
      image(bubble, 0, 0, 18 * bp, 18 * bp);
      pop();
    }
    if (hitFlashTimer > 0 && sprites.shield_hit_flash) {
      const a = map(hitFlashTimer, 0, 12, 0, 255);
      push();
      tint(255, 255, 255, a);
      image(sprites.shield_hit_flash, cx, cy, 26, 26);
      pop();
      noTint();
    }
    imageMode(CORNER);
  }

  draw() {
    if (this.invuln > 0 && frameCount % 4 < 2 && !this.hasShield && gemWarpTimer <= 0) return;

    // GEM screen afterimages (world layer)
    drawGemWarpGhosts();

    // afterimages behind (trail is lower / older climb positions)
    if (this.boostTimer > 0) this.drawAfterimages();

    // soft dash-like spin afterimages (behind cat)
    if (this.side === 'air' && this.slashTrail.length) {
      for (let i = 0; i < this.slashTrail.length; i++) {
        const p = this.slashTrail[i];
        const sf = (p.spinFrame == null) ? this.spinFrame : p.spinFrame;
        const nm = this.spriteName('air', this.jumpFrom, this.anim, this.slashFrame, true, false, sf);
        const tsp = sprites[nm];
        if (!tsp) continue;
        const alpha = map(i, 0, max(1, this.slashTrail.length - 1), 40, 100)
          * map(p.life, 0, 10, 0.4, 1);
        push();
        tint(180, 240, 255, alpha);
        this.drawSpriteAt(tsp, p.x, p.y, 'air', true);
        pop();
        noTint();
      }
    }

    const name = this.spriteName(this.side, this.jumpFrom, this.anim, this.slashFrame, this.side === 'air', this.dead, this.spinFrame);
    const sp = sprites[name] || sprites.cat_wall_run_01;
    if (sp) {
      this.drawSpriteAt(sp, this.x, this.y, this.side, this.side === 'air');
      this.drawShieldFX();
    } else {
      fill(240, 180, 80);
      rect(this.x - 4, this.y - 6, 8, 13);
    }

    // Jump spin slash VFX — single sweeping arc only
    if (this.side === 'air' && this.slashing && !this.dead) {
      this.drawSpinSlashFX();
    }

    if (this.boostTimer > 0) {
      // subtle upward streak lines (殘影 companion)
      strokeWeight(1);
      const cx = this.side === 'left' ? GAP_L + 6
        : this.side === 'right' ? GAP_R - 6
        : this.x;
      for (let i = 0; i < 3; i++) {
        stroke(80, 255, 255, 90 - i * 25);
        const ox = (i - 1) * 3;
        line(cx + ox, this.y + 6 + i * 3, cx + ox, this.y + 16 + i * 4);
      }
      noStroke();
    }

    // GEM warp: soft local companion streaks (dash-like, not wash)
    if (gemWarpTimer > 0) {
      strokeWeight(1);
      for (let i = 0; i < 3; i++) {
        stroke(80, 255, 255, 55 - i * 14);
        const ox = (i - 1) * 3;
        line(this.x + ox, this.y + 6 + i * 2, this.x + ox, this.y + 14 + i * 3);
      }
      noStroke();
      // soft yellow hop marker (low opacity)
      if (gemWarpPhase > 0.08 && gemWarpPhase < 0.8) {
        noStroke();
        fill(255, 220, 80, 140);
        triangle(this.x, this.y - 14, this.x - 3, this.y - 9, this.x + 3, this.y - 9);
      }
    }
  }

  drawSpinSlashFX() {
    const t = constrain(this.jumpT / 22, 0, 1);
    // one arc frame per midair spin pose (readable single sweep — not 米字)
    const ai = constrain(1 + floor(t * 4), 1, 4);
    const arc = sprites[`spin_slash_arc_0${ai}`];
    imageMode(CENTER);
    if (arc) {
      push();
      translate(this.x, this.y);
      // mirror arc when jumping right→left
      if (this.jumpFrom === 'right') scale(-1, 1);
      const pulse = 0.95 + sin(t * PI) * 0.12;
      image(arc, 0, 0, 36 * pulse, 36 * pulse);
      pop();
    }
    // soft white dash streak behind (not radial spokes / burst)
    if (t > 0.18 && t < 0.78) {
      const dash = sprites.spin_slash_burst;
      if (dash) {
        push();
        translate(this.x, this.y);
        // orient dash opposite travel (trail behind)
        const goingRight = this.jumpFrom === 'left';
        if (!goingRight) scale(-1, 1);
        const a = map(sin(t * PI), 0, 1, 80, 180);
        tint(255, 255, 255, a);
        image(dash, goingRight ? -10 : -10, 0, 18, 12);
        pop();
        noTint();
      }
    }
    imageMode(CORNER);
  }

  hitbox() { return { x: this.x - 5, y: this.y - 8, w: 9, h: 14 }; }
  slashbox() { return { x: this.x - 9, y: this.y - 9, w: 18, h: 17 }; }
}

/* ========== Flying dragon / bat ========== */
class Flyer {
  constructor(x, y, kind) {
    this.x = x;
    this.y = y;
    this.kind = 'enemy';
    this.type = kind;
    this.dead = false;
    this.w = 16; this.h = 14;
    this.vy = random(0.35, 0.85);
    this.vx = random(-0.4, 0.4);
    this.frame = 0;
    this.facing = this.vx >= 0 ? 'right' : 'left';
    this.gold = kind === 'dragon' && random() < 0.35;
  }
  update() {
    this.y += this.vy;
    this.x += this.vx + sin(frameCount * 0.08 + this.y * 0.02) * 0.25;
    this.x = constrain(this.x, GAP_L + 10, GAP_R - 10);
    this.frame += 0.2;
  }
  draw() {
    const fi = floor(this.frame) % 3;
    let sp;
    if (this.type === 'bat') {
      sp = sprites[`bat_${floor(this.frame) % 4}`];
    } else if (this.gold) {
      sp = sprites[`dragon_gold_${fi}`];
    } else {
      sp = sprites[`dragon_downish_${fi}`] || sprites[`dragon_${this.facing}_${fi}`];
    }
    if (sp) {
      imageMode(CENTER);
      image(sp, this.x, this.y);
      imageMode(CORNER);
    } else {
      fill(200, 60, 60);
      ellipse(this.x, this.y, 12, 10);
    }
  }
  collides(p) {
    const box = p.slashing ? p.slashbox() : p.hitbox();
    return aabb(box, { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h });
  }
}


class Obstacle {
  constructor(x, y, type, side) {
    this.x = x; this.y = y; this.type = type; this.side = side;
    this.kind = 'obstacle'; this.dead = false;
    this.w = 12; this.h = 14; this.vx = 0;
    if (type === 'arrow') this.vx = side === 'left' ? 1.2 : -1.2;
    if (type === 'cannonball' || type === 'shuriken') this.vx = side === 'left' ? 0.9 : -0.9;
    if (type === 'wall_spikes') { this.w = 14; this.h = 18; }
  }
  update() {
    this.x += this.vx;
    if (this.vx !== 0 && (this.x < GAP_L - 20 || this.x > GAP_R + 20)) this.dead = true;
  }
  draw() {
    let key = this.type;
    if (this.type === 'wall_spikes' && this.side === 'right') key = 'wall_spikes_right';
    const sp = sprites[key] || sprites[this.type];
    if (sp) {
      imageMode(CENTER);
      // flush spikes to wall edge
      let dx = this.x;
      if (this.type === 'wall_spikes') {
        dx = this.side === 'left' ? GAP_L + sp.width / 2 : GAP_R - sp.width / 2;
      }
      image(sp, dx, this.y);
      imageMode(CORNER);
    } else {
      fill(150); rect(this.x - 5, this.y - 6, 10, 12);
    }
  }
  collides(p) {
    const box = p.slashing ? p.slashbox() : p.hitbox();
    let hx = this.x;
    if (this.type === 'wall_spikes') {
      hx = this.side === 'left' ? GAP_L + this.w / 2 : GAP_R - this.w / 2;
    }
    return aabb(box, { x: hx - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h });
  }
}

class Pickup {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.type = type;
    this.kind = 'pickup'; this.dead = false;
    this.w = 12; this.h = 12; this.bob = random(TWO_PI);
  }
  update() { this.bob += 0.1; }
  draw() {
    const sp = sprites[this.type] || sprites.shield;
    if (sp) {
      imageMode(CENTER);
      image(sp, this.x, this.y + sin(this.bob) * 2, this.type === 'shield' ? 16 : 12, this.type === 'shield' ? 16 : 12);
      imageMode(CORNER);
    }
  }
  collides(p) { return aabb(p.hitbox(), { x: this.x - 6, y: this.y - 6, w: 12, h: 12 }); }
}

class Cannon {
  constructor(x, y, side) {
    this.x = x; this.y = y; this.side = side;
    this.kind = 'obstacle'; this.type = 'cannon';
    this.dead = false; this.w = 14; this.h = 12;
    this.fireCd = floor(random(40, 90));
    this.anim = 0;
    this.muzzle = 0; // frames of flash+smoke (matches demo ~5 beats)
  }
  fire() {
    this.anim = 5;
    this.muzzle = 28; // ~0.45s so flash/smoke readable like demo GIF
    const dir = this.side === 'left' ? 1 : -1;
    const mx = this.x + dir * 10;
    const ball = new Obstacle(this.x + dir * 8, this.y, 'cannonball', this.side);
    ball.vx = dir * 1.5;
    ball.w = 8; ball.h = 8;
    entities.push(ball);
    // sparks + smoke puffs (demo feel)
    for (let i = 0; i < 6; i++) {
      const spark = new Particle(mx + dir * random(0, 4), this.y + random(-3, 3), color(255, 180 + random(40), 40));
      spark.vx = dir * random(0.6, 2.2);
      spark.vy = random(-1.2, 0.6);
      spark.life = floor(random(10, 18));
      particles.push(spark);
    }
    for (let i = 0; i < 5; i++) {
      const smoke = new Particle(mx + dir * random(0, 6), this.y + random(-4, 4), color(160, 155, 150));
      smoke.vx = dir * random(0.2, 0.9);
      smoke.vy = random(-0.8, -0.1);
      smoke.life = floor(random(16, 28));
      particles.push(smoke);
    }
  }
  update() {
    this.fireCd--;
    if (this.fireCd <= 0) {
      this.fireCd = floor(random(70, 120));
      this.fire();
    }
    if (this.anim > 0) this.anim--;
    if (this.muzzle > 0) this.muzzle--;
  }
  draw() {
    const frame = this.anim > 0 ? min(5, 6 - this.anim) : 1;
    const key = this.side === 'left' ? `cannon_l_${frame}` : `cannon_r_${frame}`;
    const sp = sprites[key] || sprites[this.side === 'left' ? 'cannon_left' : 'cannon_right'];
    imageMode(CENTER);
    if (sp) image(sp, this.x, this.y);
    else { fill(80); rect(this.x - 6, this.y - 5, 12, 10); }
    // demo/cannon_muzzle_fx: flash → sparks → smoke (5 beats stretched over muzzle timer)
    if (this.muzzle > 0) {
      const mi = constrain(floor((1 - this.muzzle / 28) * 5), 0, 4);
      const mz = this.side === 'left' ? sprites[`muzzle_${mi}`] : sprites[`muzzle_r_${mi}`];
      if (mz) {
        const mx = this.x + (this.side === 'left' ? 11 : -11);
        image(mz, mx, this.y, 36, 30); // larger than source so it reads like the demo
      }
    }
    imageMode(CORNER);
  }
  collides(p) {
    const box = p.slashing ? p.slashbox() : p.hitbox();
    return aabb(box, { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h });
  }
}

class Particle {
  constructor(x, y, col) {
    this.x = x; this.y = y;
    this.vx = random(-1.5, 1.5); this.vy = random(-2, 0.5);
    this.life = 20; this.col = col;
  }
  update() { this.x += this.vx; this.y += this.vy; this.vy += 0.08; this.life--; }
  draw() {
    noStroke();
    fill(red(this.col), green(this.col), blue(this.col), map(this.life, 0, 20, 0, 255));
    rect(this.x, this.y, 2, 2);
  }
}

function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
