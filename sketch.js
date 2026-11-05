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
 */

const VW = 180;
const VH = 320;
let SCALE = 2;

const WALL = 22;
const GAP_L = WALL;
const GAP_R = VW - WALL;

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
let spawnAcc = 0;
let slashHitCombo = 0; // 0..3 — any slash hit on enemy/obstacle
let flashMsg = '';
let flashTimer = 0;
let bgMode = 'cave';
let hitFlashTimer = 0;

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
  ['beetle', 'hornet'].forEach(n => load('enemies', n));

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
   'explode_1', 'explode_2', 'explode_3'].forEach(n => load('effects', n));
  for (let i = 1; i <= 8; i++) {
    load('effects', `shield_aura_0${i}`);
  }
  load('effects', 'shield_bubble');
  load('effects', 'shield_hit_flash');
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
  resetRun(false);
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
  for (let i = 0; i < 8; i++) spawnContent(80 + i * 70);
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

  drawHUD();
  if (state === 'title') drawTitle();
  if (state === 'dead') drawDead();
  pop();
}

function updatePlay() {
  player.update();
  // Climbing UP (player.y ↓) → camY ↑ → walls/bg offsets scroll DOWN
  camY = -player.y;

  spawnAcc += player.climbSpeed;
  while (spawnAcc > 50) {
    spawnAcc -= 50;
    spawnContent(player.y - VH - random(20, 90));
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
    else if (e.type === 'gem') { player.y -= 80; flash('GEM UP!', 35); }
    else if (e.type === 'clock') { player.activateBoost(70); flash('BOOST', 35); }
    return;
  }
  if (e.kind === 'enemy') {
    if (player.slashing) {
      e.dead = true;
      spawnHit(e.x, e.y);
      registerSlashHit();
      shake = 2;
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
    shake = 3;
    return;
  }
  player.die();
  slashHitCombo = 0;
  state = 'dead';
  shake = 5;
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

function spawnContent(worldY) {
  const r = random();
  if (r < 0.10) {
    entities.push(new Pickup(VW / 2 + random(-20, 20), worldY, random(['shield', 'shield', 'heart', 'gem', 'clock'])));
  } else if (r < 0.28) {
    const side = random() < 0.5 ? 'left' : 'right';
    const x = side === 'left' ? GAP_L + 8 : GAP_R - 8;
    entities.push(new Cannon(x, worldY, side));
  } else if (r < 0.72) {
    const kind = random() < 0.75 ? 'dragon' : 'bat';
    const x = GAP_L + 16 + random(VW - WALL * 2 - 32);
    entities.push(new Flyer(x, worldY, kind));
  } else if (r < 0.88) {
    const side = random(['left', 'right']);
    const x = side === 'left' ? GAP_L + 14 : GAP_R - 14;
    entities.push(new Enemy(x, worldY, random(['beetle', 'hornet']), side));
  } else {
    const side = random() < 0.5 ? 'left' : 'right';
    const x = side === 'left' ? GAP_L + 8 : GAP_R - 8;
    entities.push(new Obstacle(x, worldY, 'wall_spikes', side));
  }
}

function spawnHit(x, y) {
  particles.push(new Particle(x, y, color(255, 80, 80)));
  particles.push(new Particle(x, y, color(255, 200, 80)));
}

function doJump() {
  if (state === 'title' || state === 'dead') { resetRun(true); return; }
  if (state === 'play') player.jump();
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
  text('攞盾 = 藍色光環防護', VW / 2, VH / 2 + 34);
  fill(180);
  text('按空白鍵開始', VW / 2, VH / 2 + 56);
}

function drawDead() {
  fill(0, 160);
  rect(0, 0, VW, VH);
  const dist = floor(max(0, -player.y) / 10);
  fill(255, 80, 80);
  textAlign(CENTER, CENTER);
  textSize(14);
  text('FALL!', VW / 2, VH / 2 - 30);
  fill(255);
  textSize(10);
  text(`${dist} m`, VW / 2, VH / 2);
  fill(200);
  textSize(7);
  text(`Best ${best} m`, VW / 2, VH / 2 + 16);
  text('空白鍵再試', VW / 2, VH / 2 + 36);
}

function flash(msg, t) { flashMsg = msg; flashTimer = t; }

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
  }

  get climbing() { return this.side === 'left' || this.side === 'right'; }

  activateBoost(frames) {
    this.boostTimer = max(this.boostTimer, frames);
  }

  jump() {
    if (this.dead || !this.climbing) return;
    this.jumpFrom = this.side;
    this.side = 'air';
    this.jumpT = 0;
    this.slashing = true;
    this.slashFrame = 0;
    this.hitThisSlash = false;
  }

  die() {
    this.dead = true;
    this.slashing = false;
    this.side = 'air';
    this.vy = 2;
    this.trail = [];
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
      const dur = 22;
      const t = constrain(this.jumpT / dur, 0, 1);
      const te = t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2;
      const fromX = this.jumpFrom === 'left' ? GAP_L : GAP_R;
      const toX = this.jumpFrom === 'left' ? GAP_R : GAP_L;
      this.x = lerp(fromX, toX, te);
      this.y -= this.climbSpeed * 0.9;
      this.y -= sin(t * PI) * 4.5;

      this.slashFrame = floor(t * 3);
      if (t >= 1) {
        this.side = this.jumpFrom === 'left' ? 'right' : 'left';
        this.x = this.side === 'left' ? GAP_L : GAP_R;
        this.slashing = false;
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
        air: this.side === 'air'
      });
      if (this.trail.length > 10) this.trail.shift();
    } else {
      this.trail = [];
    }
  }

  spriteName(side, jumpFrom, anim, slashFrame, air, dead) {
    const useRightWall = (side === 'right') || (air && jumpFrom === 'left');
    if (dead) return useRightWall ? 'cat_fall_rightwall' : 'cat_fall';
    if (air) {
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
      const name = this.spriteName(s.side, s.jumpFrom, s.anim, s.slashFrame, s.air, false);
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
    if (this.invuln > 0 && frameCount % 4 < 2 && !this.hasShield) return;

    // afterimages behind (trail is lower / older climb positions)
    if (this.boostTimer > 0) this.drawAfterimages();

    const name = this.spriteName(this.side, this.jumpFrom, this.anim, this.slashFrame, this.side === 'air', this.dead);
    const sp = sprites[name] || sprites.cat_wall_run_01;
    if (sp) {
      this.drawSpriteAt(sp, this.x, this.y, this.side, this.side === 'air');
      this.drawShieldFX();
    } else {
      fill(240, 180, 80);
      rect(this.x - 4, this.y - 6, 8, 13);
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

class Enemy {
  constructor(x, y, type, side) {
    this.x = x; this.y = y; this.type = type; this.side = side;
    this.kind = 'enemy'; this.dead = false;
    this.w = 14; this.h = 14; this.bob = random(TWO_PI);
  }
  update() {
    this.bob += 0.08;
    if (this.side === 'mid') this.x += sin(this.bob) * 0.3;
  }
  draw() {
    const sp = sprites[this.type];
    if (sp) { imageMode(CENTER); image(sp, this.x, this.y + sin(this.bob) * 1.5); imageMode(CORNER); }
    else { fill(200, 50, 50); rect(this.x - 6, this.y - 6, 12, 12); }
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
  }
  update() {
    this.fireCd--;
    if (this.fireCd <= 0) {
      this.fireCd = floor(random(70, 120));
      this.anim = 5;
      const ball = new Obstacle(this.x + (this.side === 'left' ? 8 : -8), this.y, 'cannonball', this.side);
      ball.vx = this.side === 'left' ? 1.5 : -1.5;
      ball.w = 8; ball.h = 8;
      entities.push(ball);
    }
    if (this.anim > 0) this.anim--;
  }
  draw() {
    const frame = this.anim > 0 ? min(5, 6 - this.anim) : 1;
    const key = this.side === 'left' ? `cannon_l_${frame}` : `cannon_r_${frame}`;
    const sp = sprites[key] || sprites[this.side === 'left' ? 'cannon_left' : 'cannon_right'];
    if (sp) { imageMode(CENTER); image(sp, this.x, this.y); imageMode(CORNER); }
    else { fill(80); rect(this.x - 6, this.y - 5, 12, 10); }
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
