/**
 * NinJump DX — Pixel Demo (p5.js)
 * 玩法對齊原作：兩邊牆往上跑，點擊／空白鍵跳去另一邊，空中揮刀斬敵人。
 * 素材為原創像素圖，非官方資源。
 */

const VW = 180;   // 邏輯寬
const VH = 320;   // 邏輯高
let SCALE = 2;

const WALL = 22;          // 牆厚度
const GAP_L = WALL;       // 左牆內緣
const GAP_R = VW - WALL;  // 右牆內緣

let sprites = {};
let player;
let entities = [];
let particles = [];
let camY = 0;             // 世界捲動（玩家高度）
let best = 0;
let state = 'title';       // title | play | dead
let theme = 'classic';
let shake = 0;
let spawnAcc = 0;
let bgOffset = 0;
let comboType = null;
let comboCount = 0;
let flashMsg = '';
let flashTimer = 0;

const THEMES = ['classic', 'castle', 'pirate', 'jungle'];
const ENEMY_POOL = {
  classic: ['enemy_ninja', 'beetle', 'hornet'],
  castle: ['ogre', 'enemy_ninja', 'beetle'],
  pirate: ['parrot', 'sea_monster', 'enemy_ninja'],
  jungle: ['snake', 'monkey', 'witch_doctor', 'hornet'],
};
const OBSTACLE_POOL = {
  classic: ['wall_spikes', 'shuriken', 'arrow'],
  castle: ['wall_spikes', 'arrow', 'cannonball'],
  pirate: ['cannonball', 'shuriken', 'arrow'],
  jungle: ['vine', 'beehive', 'wall_spikes'],
};

function preload() {
  const load = (folder, name) => {
    sprites[name] = loadImage(`assets/${folder}/${name}.png`);
  };
  // player
  [
    'ninja_wall_run_01','ninja_wall_run_02','ninja_wall_run_03','ninja_wall_run_04',
    'ninja_jump_slash_01','ninja_jump_slash_02','ninja_jump_slash_03',
    'ninja_land_01','ninja_fall_01','ninja_hurt_01',
    'ninja_wall_run_shield_01','ninja_jump_slash_shield_01',
    'ninja_wall_run_01_rightwall','ninja_wall_run_02_rightwall','ninja_wall_run_03_rightwall','ninja_wall_run_04_rightwall',
    'ninja_jump_slash_01_rightwall','ninja_jump_slash_02_rightwall','ninja_jump_slash_03_rightwall',
    'ninja_land_01_rightwall','ninja_fall_01_rightwall','ninja_hurt_01_rightwall',
    'ninja_wall_run_shield_01_rightwall','ninja_jump_slash_shield_01_rightwall',
  ].forEach(n => load('player', n));

  ['shield','combo_on','combo_off','boost_star','coin_01'].forEach(n => load('items', n));
  ['enemy_ninja','parrot','snake','monkey','ogre','dragon','sea_monster','witch_doctor','beetle','hornet']
    .forEach(n => load('enemies', n));
  ['wall_spikes','wall_spikes_right','cannonball','arrow','shuriken','beehive','vine']
    .forEach(n => load('obstacles', n));
  THEMES.forEach(t => {
    load('tiles', `wall_${t}`);
    load('tiles', `wall_edge_${t}`);
  });
  ['slash_01','slash_02','land_dust_01','hit_puff'].forEach(n => load('effects', n));
  ['height_flag','medal'].forEach(n => load('ui', n));
}

function setup() {
  // 放大到接近全屏但保持整數倍
  SCALE = max(2, min(floor(windowWidth / VW), floor(windowHeight / VH)));
  const c = createCanvas(VW * SCALE, VH * SCALE);
  c.elt.style.imageRendering = 'pixelated';
  noSmooth();
  pixelDensity(1);
  textFont('monospace');
  best = int(getItem('ninjump_best') || 0);
  resetRun(false);
}

function windowResized() {
  SCALE = max(2, min(floor(windowWidth / VW), floor(windowHeight / VH)));
  resizeCanvas(VW * SCALE, VH * SCALE);
}

function resetRun(startPlay) {
  theme = random(THEMES);
  player = new Player();
  entities = [];
  particles = [];
  camY = 0;
  spawnAcc = 0;
  comboType = null;
  comboCount = 0;
  flashMsg = '';
  flashTimer = 0;
  // 預先放少少內容
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

  // 世界相對 camY
  push();
  translate(0, VH * 0.62 + camY); // 玩家大約喺畫面中下

  if (state === 'play') {
    updatePlay();
  }

  // entities
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
  camY = -player.y; // 捲動令玩家留喺視口

  // spawn
  spawnAcc += player.climbSpeed;
  while (spawnAcc > 55) {
    spawnAcc -= 55;
    spawnContent(player.y - VH - random(20, 80));
  }

  // update entities
  for (let i = entities.length - 1; i >= 0; i--) {
    const e = entities[i];
    e.update();
    if (e.dead || e.y > player.y + VH) {
      entities.splice(i, 1);
      continue;
    }
    // 碰撞
    if (e.collides(player)) {
      handleCollision(e);
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    if (particles[i].life <= 0) particles.splice(i, 1);
  }

  if (flashTimer > 0) flashTimer--;

  // best
  const dist = floor(max(0, -player.y) / 10);
  if (dist > best) {
    best = dist;
    storeItem('ninjump_best', best);
  }
}

function handleCollision(e) {
  if (e.kind === 'shield') {
    player.hasShield = true;
    e.dead = true;
    flash('SHIELD!', 40);
    return;
  }
  if (e.kind === 'enemy') {
    if (player.slashing) {
      // 斬殺
      e.dead = true;
      spawnHit(e.x, e.y);
      registerCombo(e.type);
      shake = 2;
      return;
    }
    // 撞到敵人
    hurtPlayer();
    e.dead = true;
    return;
  }
  if (e.kind === 'obstacle') {
    if (player.slashing && (e.type === 'shuriken' || e.type === 'arrow' || e.type === 'cannonball')) {
      // 空中可斬飛彈類
      e.dead = true;
      spawnHit(e.x, e.y);
      return;
    }
    hurtPlayer();
    e.dead = true;
  }
}

function hurtPlayer() {
  if (player.invuln > 0) return;
  if (player.hasShield) {
    player.hasShield = false;
    player.invuln = 40;
    flash('SHIELD BREAK', 35);
    shake = 3;
    return;
  }
  player.die();
  state = 'dead';
  shake = 5;
}

function registerCombo(type) {
  if (comboType === type) {
    comboCount++;
  } else {
    comboType = type;
    comboCount = 1;
  }
  if (comboCount >= 3) {
    // boost
    player.boostTimer = 90;
    comboCount = 0;
    comboType = null;
    flash('BOOST!', 50);
    for (let i = 0; i < 10; i++) {
      particles.push(new Particle(player.x, player.y - 10, color(255, 220, 80)));
    }
  }
}

function spawnContent(worldY) {
  // 隨機敵人／障礙／盾
  const r = random();
  if (r < 0.12) {
    // shield in gap
    entities.push(new Pickup(VW / 2 + random(-20, 20), worldY, 'shield'));
  } else if (r < 0.55) {
    // enemy on a wall or mid
    const type = random(ENEMY_POOL[theme]);
    const side = random(['left', 'right', 'mid']);
    let x;
    if (side === 'left') x = GAP_L + 14;
    else if (side === 'right') x = GAP_R - 14;
    else x = VW / 2 + random(-25, 25);
    entities.push(new Enemy(x, worldY, type, side));
  } else {
    // obstacle on wall
    const type = random(OBSTACLE_POOL[theme]);
    const side = random() < 0.5 ? 'left' : 'right';
    const x = side === 'left' ? GAP_L + 8 : GAP_R - 8;
    entities.push(new Obstacle(x, worldY, type, side));
  }
}

function spawnHit(x, y) {
  particles.push(new Particle(x, y, color(255, 80, 80)));
  particles.push(new Particle(x, y, color(255, 200, 80)));
}

/* ---------- input：點擊／空白／觸控 = 跳 ---------- */
function doJump() {
  if (state === 'title') {
    resetRun(true);
    return;
  }
  if (state === 'dead') {
    resetRun(true);
    return;
  }
  if (state === 'play') player.jump();
}

function keyPressed() {
  if (key === ' ' || key === 'w' || key === 'W' || keyCode === UP_ARROW) {
    doJump();
    return false;
  }
  if (key === 'r' || key === 'R') resetRun(true);
}

function mousePressed() { doJump(); }
function touchStarted() { doJump(); return false; }

/* ---------- draw helpers ---------- */
function drawBackground() {
  noStroke();
  // sky by theme
  const skies = {
    classic: [30, 50, 90],
    castle: [40, 35, 55],
    pirate: [25, 70, 110],
    jungle: [20, 55, 40],
  };
  const s = skies[theme] || skies.classic;
  for (let y = 0; y < VH; y++) {
    const t = y / VH;
    fill(s[0] * (1 - t * 0.3), s[1] * (1 - t * 0.2), s[2] * (1 + t * 0.2));
    rect(0, y, VW, 1);
  }
}

function drawWalls() {
  const tile = sprites[`wall_${theme}`];
  const edge = sprites[`wall_edge_${theme}`];
  // 用 camY 令牆紋捲動
  const off = ((-camY % 16) + 16) % 16;
  for (let y = -16; y < VH + 16; y += 16) {
    if (tile) {
      image(tile, 0, y + off - 16, WALL, 16);
      image(tile, VW - WALL, y + off - 16, WALL, 16);
    } else {
      fill(90);
      rect(0, y + off - 16, WALL, 16);
      rect(VW - WALL, y + off - 16, WALL, 16);
    }
  }
  if (edge) {
    image(edge, WALL - 6, 0, 6, VH);
    push();
    translate(VW - WALL + 6, 0);
    scale(-1, 1);
    image(edge, 0, 0, 6, VH);
    pop();
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

  // combo dots
  for (let i = 0; i < 3; i++) {
    const sp = sprites[i < comboCount ? 'combo_on' : 'combo_off'];
    if (sp) image(sp, 50 + i * 10, 6, 8, 8);
  }

  // shield icon
  if (player && player.hasShield && sprites.shield) {
    image(sprites.shield, VW / 2 - 6, 4, 12, 12);
  }

  if (flashTimer > 0) {
    fill(255, 230, 80);
    textAlign(CENTER, TOP);
    textSize(10);
    text(flashMsg, VW / 2, 26);
  }

  // theme tag
  fill(200);
  textSize(6);
  textAlign(CENTER, BOTTOM);
  text(theme.toUpperCase(), VW / 2, VH - 4);
}

function drawTitle() {
  fill(0, 150);
  rect(0, 0, VW, VH);
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(14);
  text('NinJump DX', VW / 2, VH / 2 - 40);
  textSize(8);
  fill(255, 200, 80);
  text('PIXEL DEMO', VW / 2, VH / 2 - 24);
  fill(220);
  textSize(7);
  text('Tap / Space / Click to JUMP', VW / 2, VH / 2 + 10);
  text('Slash enemies mid-air', VW / 2, VH / 2 + 22);
  text('3 same kills = BOOST', VW / 2, VH / 2 + 34);
  fill(180);
  text('Tap to start', VW / 2, VH / 2 + 55);
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
  text('Tap to retry', VW / 2, VH / 2 + 36);
}

function flash(msg, t) {
  flashMsg = msg;
  flashTimer = t;
}

/* ========== Player ========== */
class Player {
  constructor() {
    this.side = 'left'; // left | right | air
    this.x = GAP_L + 10;
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
    this.w = 14;
    this.h = 20;
  }

  get climbing() { return this.side === 'left' || this.side === 'right'; }

  jump() {
    if (this.dead || !this.climbing) return;
    this.jumpFrom = this.side;
    this.side = 'air';
    this.jumpT = 0;
    this.slashing = true;
    this.slashFrame = 0;
    // 跳向對面
  }

  die() {
    this.dead = true;
    this.slashing = false;
    this.side = 'air';
    this.vy = 2;
  }

  update() {
    if (this.dead) {
      this.y += 2.5;
      this.vy += 0.15;
      return;
    }

    const base = this.boostTimer > 0 ? 3.2 : 1.6;
    this.climbSpeed = base;
    if (this.boostTimer > 0) this.boostTimer--;
    if (this.invuln > 0) this.invuln--;

    if (this.climbing) {
      this.y -= this.climbSpeed;
      this.x = this.side === 'left' ? GAP_L + 10 : GAP_R - 10;
      this.anim += 0.25;
      this.slashing = false;
    } else {
      // 拋物線跳去對面
      this.jumpT++;
      const dur = 18;
      const t = constrain(this.jumpT / dur, 0, 1);
      const fromX = this.jumpFrom === 'left' ? GAP_L + 10 : GAP_R - 10;
      const toX = this.jumpFrom === 'left' ? GAP_R - 10 : GAP_L + 10;
      this.x = lerp(fromX, toX, t);
      this.y -= this.climbSpeed * 0.85; // 跳緊都繼續向上
      // 小弧線
      this.y -= sin(t * PI) * 1.2;

      this.slashFrame = floor(t * 3);
      if (t >= 1) {
        this.side = this.jumpFrom === 'left' ? 'right' : 'left';
        this.x = this.side === 'left' ? GAP_L + 10 : GAP_R - 10;
        this.slashing = false;
        // land dust
        particles.push(new Particle(this.x, this.y + 8, color(220, 220, 230)));
      }
    }
  }

  draw() {
    if (this.invuln > 0 && frameCount % 4 < 2) return;

    let name;
    const right = this.side === 'right' || (this.side === 'air' && this.jumpFrom === 'left');
    // 空中時：從左跳去右 → 用 rightwall 圖（面向左？）其實 jump 用對應方向
    const useRightWall = (this.side === 'right') || (this.side === 'air' && this.jumpFrom === 'left');

    if (this.dead) {
      name = useRightWall ? 'ninja_fall_01_rightwall' : 'ninja_fall_01';
    } else if (this.side === 'air') {
      const f = constrain(this.slashFrame + 1, 1, 3);
      const base = `ninja_jump_slash_0${f}`;
      name = this.hasShield
        ? (useRightWall ? 'ninja_jump_slash_shield_01_rightwall' : 'ninja_jump_slash_shield_01')
        : (useRightWall ? base + '_rightwall' : base);
    } else {
      const f = (floor(this.anim) % 4) + 1;
      const base = `ninja_wall_run_0${f}`;
      if (this.hasShield) {
        name = this.side === 'right' ? 'ninja_wall_run_shield_01_rightwall' : 'ninja_wall_run_shield_01';
      } else {
        name = this.side === 'right' ? base + '_rightwall' : base;
      }
    }

    const sp = sprites[name] || sprites['ninja_wall_run_01'];
    if (sp) {
      imageMode(CENTER);
      image(sp, this.x, this.y, sp.width, sp.height);
      imageMode(CORNER);
    } else {
      fill(50, 100, 200);
      rect(this.x - 6, this.y - 10, 12, 20);
    }

    // boost glow
    if (this.boostTimer > 0) {
      noFill();
      stroke(255, 220, 80, 180);
      strokeWeight(1);
      rect(this.x - 10, this.y - 14, 20, 26);
      noStroke();
    }
  }

  // hitbox
  hitbox() {
    return { x: this.x - 7, y: this.y - 12, w: 14, h: 22 };
  }
  slashbox() {
    // 空中斬擊範圍更大
    return { x: this.x - 14, y: this.y - 14, w: 28, h: 26 };
  }
}

/* ========== Entities ========== */
class Enemy {
  constructor(x, y, type, side) {
    this.x = x; this.y = y; this.type = type; this.side = side;
    this.kind = 'enemy';
    this.dead = false;
    this.w = 14; this.h = 14;
    this.bob = random(TWO_PI);
  }
  update() {
    this.bob += 0.08;
    if (this.side === 'mid') this.x += sin(this.bob) * 0.3;
  }
  draw() {
    const sp = sprites[this.type];
    if (sp) {
      imageMode(CENTER);
      image(sp, this.x, this.y + sin(this.bob) * 1.5, sp.width, sp.height);
      imageMode(CORNER);
    } else {
      fill(200, 50, 50);
      rect(this.x - 6, this.y - 6, 12, 12);
    }
  }
  collides(p) {
    const box = p.slashing ? p.slashbox() : p.hitbox();
    return aabb(box, { x: this.x - this.w/2, y: this.y - this.h/2, w: this.w, h: this.h });
  }
}

class Obstacle {
  constructor(x, y, type, side) {
    this.x = x; this.y = y; this.type = type; this.side = side;
    this.kind = 'obstacle';
    this.dead = false;
    this.w = 12; this.h = 14;
    this.vx = 0;
    if (type === 'arrow') this.vx = side === 'left' ? 1.2 : -1.2;
    if (type === 'cannonball' || type === 'shuriken') this.vx = side === 'left' ? 0.9 : -0.9;
  }
  update() {
    this.x += this.vx;
    // 飛出缺口就消失
    if (this.vx !== 0 && (this.x < GAP_L - 20 || this.x > GAP_R + 20)) this.dead = true;
  }
  draw() {
    let key = this.type;
    if (this.type === 'wall_spikes' && this.side === 'right') key = 'wall_spikes_right';
    const sp = sprites[key] || sprites[this.type];
    if (sp) {
      imageMode(CENTER);
      image(sp, this.x, this.y, sp.width, sp.height);
      imageMode(CORNER);
    } else {
      fill(150);
      rect(this.x - 5, this.y - 6, 10, 12);
    }
  }
  collides(p) {
    const box = p.slashing ? p.slashbox() : p.hitbox();
    return aabb(box, { x: this.x - this.w/2, y: this.y - this.h/2, w: this.w, h: this.h });
  }
}

class Pickup {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.type = type;
    this.kind = 'shield';
    this.dead = false;
    this.w = 12; this.h = 12;
    this.bob = random(TWO_PI);
  }
  update() { this.bob += 0.1; }
  draw() {
    const sp = sprites.shield;
    if (sp) {
      imageMode(CENTER);
      image(sp, this.x, this.y + sin(this.bob) * 2, 12, 12);
      imageMode(CORNER);
    }
  }
  collides(p) {
    return aabb(p.hitbox(), { x: this.x - 6, y: this.y - 6, w: 12, h: 12 });
  }
}

class Particle {
  constructor(x, y, col) {
    this.x = x; this.y = y;
    this.vx = random(-1.5, 1.5);
    this.vy = random(-2, 0.5);
    this.life = 20;
    this.col = col;
  }
  update() {
    this.x += this.vx; this.y += this.vy; this.vy += 0.08; this.life--;
  }
  draw() {
    // particles in world space already
    noStroke();
    fill(red(this.col), green(this.col), blue(this.col), map(this.life, 0, 20, 0, 255));
    rect(this.x, this.y, 2, 2);
  }
}

function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
