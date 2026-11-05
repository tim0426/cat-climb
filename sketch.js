/**
 * NinJump DX — Cat Climb (local demo)
 * 貓喺兩邊牆向上爬；空白鍵／點擊跳去對面（有弧度）。
 * 小飛龍由上飛落；炮台射炮彈。唔連 GitHub，本地試玩。
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
let comboType = null;
let comboCount = 0;
let flashMsg = '';
let flashTimer = 0;
let bgMode = 'cave'; // cave | tubes | sky

function preload() {
  const load = (folder, name) => {
    sprites[name] = loadImage(`assets/${folder}/${name}.png`);
  };

  // Ranger Cat player
  for (let i = 1; i <= 4; i++) {
    load('player', `cat_wall_run_0${i}`);
    load('player', `cat_wall_run_0${i}_rightwall`);
  }
  for (let i = 1; i <= 3; i++) {
    load('player', `cat_jump_0${i}`);
    load('player', `cat_jump_0${i}_rightwall`);
  }
  ['cat_slash','cat_slash_rightwall','cat_fall','cat_fall_rightwall',
   'cat_land','cat_land_rightwall',
   'cat_wall_run_01_shield','cat_wall_run_01_shield_rightwall',
   'cat_jump_01_shield','cat_jump_01_shield_rightwall'
  ].forEach(n => load('player', n));

  // keep old ninja as silent fallback names mapped in draw
  ['shield','combo_on','combo_off','boost_star','coin_01','heart','gem','clock']
    .forEach(n => load('items', n));

  // dragons / bats
  for (let i = 0; i < 3; i++) {
    load('enemies', `dragon_right_${i}`);
    load('enemies', `dragon_left_${i}`);
    load('enemies', `dragon_downish_${i}`);
    load('enemies', `dragon_gold_${i}`);
  }
  for (let i = 0; i < 4; i++) load('enemies', `bat_${i}`);
  load('enemies', 'dragon');

  // light old enemies as rare fillers
  ['beetle','hornet'].forEach(n => load('enemies', n));

  ['wall_spikes','wall_spikes_right','cannonball','arrow','shuriken']
    .forEach(n => load('obstacles', n));
  ['cannon_left','cannon_right'].forEach(n => load('obstacles', n));
  for (let i = 1; i <= 5; i++) {
    load('obstacles', `cannon_l_${i}`);
    load('obstacles', `cannon_r_${i}`);
  }

  ['classic','castle','pirate','jungle'].forEach(t => {
    load('tiles', `wall_${t}`);
    load('tiles', `wall_edge_${t}`);
  });

  ['slash_01','slash_02','land_dust_01','hit_puff',
   'shield_aura_01','shield_aura_02','shield_aura_03','shield_aura_04',
   'explode_1','explode_2','explode_3'].forEach(n => load('effects', n));
  ['height_flag','medal'].forEach(n => load('ui', n));

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
  comboType = null;
  comboCount = 0;
  flashMsg = '';
  flashTimer = 0;
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
    else if (e.type === 'clock') { player.boostTimer = max(player.boostTimer, 70); flash('BOOST', 35); }
    return;
  }
  if (e.kind === 'enemy') {
    if (player.slashing) {
      e.dead = true;
      spawnHit(e.x, e.y);
      registerCombo(e.type);
      shake = 2;
      return;
    }
    hurtPlayer();
    e.dead = true;
    return;
  }
  if (e.kind === 'obstacle') {
    if (player.slashing && (e.type === 'cannonball' || e.type === 'shuriken' || e.type === 'arrow')) {
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
  if (comboType === type) comboCount++;
  else { comboType = type; comboCount = 1; }
  if (comboCount >= 3) {
    player.boostTimer = 90;
    comboCount = 0;
    comboType = null;
    flash('BOOST!', 50);
    for (let i = 0; i < 10; i++) particles.push(new Particle(player.x, player.y - 10, color(255, 220, 80)));
  }
}

function spawnContent(worldY) {
  const r = random();
  if (r < 0.10) {
    entities.push(new Pickup(VW / 2 + random(-20, 20), worldY, random(['shield', 'shield', 'heart', 'gem', 'clock'])));
  } else if (r < 0.28) {
    // 炮台
    const side = random() < 0.5 ? 'left' : 'right';
    const x = side === 'left' ? GAP_L + 8 : GAP_R - 8;
    entities.push(new Cannon(x, worldY, side));
  } else if (r < 0.72) {
    // 小飛龍／蝙蝠由上飛落
    const kind = random() < 0.75 ? 'dragon' : 'bat';
    const x = GAP_L + 16 + random(VW - WALL * 2 - 32);
    entities.push(new Flyer(x, worldY, kind));
  } else if (r < 0.88) {
    // 偶有貼牆小怪
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
    // 無限向上：跟 camY 垂直循環
    const th = img.height * (VW / img.width); // 縮放至畫面闊
    const scaleX = VW / img.width;
    const tileH = img.height * scaleX;
    const off = ((-camY * 0.35) % tileH + tileH) % tileH;
    for (let y = -tileH; y < VH + tileH; y += tileH) {
      image(img, 0, y + off - tileH * 0, VW, tileH);
    }
    // 暗一層令角色清楚
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
  const off = ((-camY % 16) + 16) % 16;
  for (let y = -16; y < VH + 16; y += 16) {
    if (tile) {
      image(tile, 0, y + off - 16, WALL, 16);
      image(tile, VW - WALL, y + off - 16, WALL, 16);
    } else {
      fill(90); rect(0, y + off - 16, WALL, 16); rect(VW - WALL, y + off - 16, WALL, 16);
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

  for (let i = 0; i < 3; i++) {
    const sp = sprites[i < comboCount ? 'combo_on' : 'combo_off'];
    if (sp) image(sp, 50 + i * 10, 6, 8, 8);
  }
  if (player && player.hasShield && sprites.shield) image(sprites.shield, VW / 2 - 8, 2, 16, 16);

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
  text('Cat Climb DX', VW / 2, VH / 2 - 42);
  textSize(7);
  fill(255, 200, 80);
  text('Ranger Cat · NinJump style', VW / 2, VH / 2 - 26);
  fill(220);
  text('空白鍵／點擊 → 跳去對面牆', VW / 2, VH / 2 + 4);
  text('空中可斬小飛龍同炮彈', VW / 2, VH / 2 + 16);
  text('連續斬 3 隻同類 = BOOST', VW / 2, VH / 2 + 28);
  fill(180);
  text('按空白鍵開始', VW / 2, VH / 2 + 50);
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
    this.x = GAP_L + 2;
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
      this.x = this.side === 'left' ? GAP_L + 2 : GAP_R - 2;
      this.anim += 0.28;
      this.slashing = false;
    } else {
      // 更大弧度跳去對面牆
      this.jumpT++;
      const dur = 22; // 稍慢，弧線更明顯
      const t = constrain(this.jumpT / dur, 0, 1);
      // ease in-out 水平
      const te = t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2;
      const fromX = this.jumpFrom === 'left' ? GAP_L + 2 : GAP_R - 2;
      const toX = this.jumpFrom === 'left' ? GAP_R - 2 : GAP_L + 2;
      this.x = lerp(fromX, toX, te);
      // 持續向上 + 明顯拋物線弧（向畫面上方凸）
      this.y -= this.climbSpeed * 0.9;
      this.y -= sin(t * PI) * 4.5;

      this.slashFrame = floor(t * 3);
      if (t >= 1) {
        this.side = this.jumpFrom === 'left' ? 'right' : 'left';
        this.x = this.side === 'left' ? GAP_L + 2 : GAP_R - 2;
        this.slashing = false;
        particles.push(new Particle(this.x, this.y + 8, color(220, 220, 230)));
      }
    }
  }

  draw() {
    if (this.invuln > 0 && frameCount % 4 < 2) return;

    let name;
    const useRightWall = (this.side === 'right') || (this.side === 'air' && this.jumpFrom === 'left');

    if (this.dead) {
      name = useRightWall ? 'cat_fall_rightwall' : 'cat_fall';
    } else if (this.side === 'air') {
      const f = constrain(this.slashFrame + 1, 1, 3);
      if (this.hasShield) {
        name = useRightWall ? 'cat_jump_01_shield_rightwall' : 'cat_jump_01_shield';
      } else {
        name = useRightWall ? `cat_jump_0${f}_rightwall` : `cat_jump_0${f}`;
      }
    } else {
      const f = (floor(this.anim) % 4) + 1;
      if (this.hasShield) {
        name = this.side === 'right' ? 'cat_wall_run_01_shield_rightwall' : 'cat_wall_run_01_shield';
      } else {
        name = this.side === 'right' ? `cat_wall_run_0${f}_rightwall` : `cat_wall_run_0${f}`;
      }
    }

    const sp = sprites[name] || sprites.cat_wall_run_01;
    if (sp) {
      imageMode(CORNER);
      let dx, dy;
      dy = this.y - sp.height / 2;
      if (this.side === 'air') {
        dx = this.x - sp.width / 2;
        dy = this.y - sp.height / 2;
      } else if (this.side === 'left') {
        dx = this.x;
      } else {
        dx = this.x - sp.width;
      }
      image(sp, dx, dy);

      if (this.hasShield && !this.dead) {
        const ai = 1 + (floor(frameCount / 4) % 4);
        const aura = sprites[`shield_aura_0${ai}`];
        if (aura) {
          imageMode(CENTER);
          image(aura, this.x + (this.side === 'left' ? 10 : this.side === 'right' ? -10 : 0), this.y, 28, 28);
          imageMode(CORNER);
        }
      }
    } else {
      fill(240, 180, 80);
      rect(this.x - 6, this.y - 10, 12, 20);
    }

    if (this.boostTimer > 0) {
      noFill();
      stroke(255, 220, 80, 180);
      strokeWeight(1);
      rect(this.x - 10, this.y - 14, 20, 26);
      noStroke();
    }
  }

  hitbox() { return { x: this.x - 7, y: this.y - 12, w: 14, h: 22 }; }
  slashbox() { return { x: this.x - 14, y: this.y - 14, w: 28, h: 26 }; }
}

/* ========== Flying dragon / bat — 由上飛落 ========== */
class Flyer {
  constructor(x, y, kind) {
    this.x = x;
    this.y = y;
    this.kind = 'enemy';
    this.type = kind; // dragon | bat
    this.dead = false;
    this.w = 16; this.h = 14;
    this.vy = random(0.35, 0.85); // 向下飛（世界 y 增大＝畫面下方；玩家向上 y 減）
    // 世界座標：玩家向上係 y 變負。小怪喺上方（更細／更負嘅 y）飛落＝y 增加
    this.vx = random(-0.4, 0.4);
    this.frame = 0;
    this.facing = this.vx >= 0 ? 'right' : 'left';
    this.gold = kind === 'dragon' && random() < 0.35;
  }
  update() {
    this.y += this.vy;          // 飛落（往玩家方向／往畫面下方）
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
      // 用 downish 為主，更似由上落
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
  }
  update() {
    this.x += this.vx;
    if (this.vx !== 0 && (this.x < GAP_L - 20 || this.x > GAP_R + 20)) this.dead = true;
  }
  draw() {
    let key = this.type;
    if (this.type === 'wall_spikes' && this.side === 'right') key = 'wall_spikes_right';
    const sp = sprites[key] || sprites[this.type];
    if (sp) { imageMode(CENTER); image(sp, this.x, this.y); imageMode(CORNER); }
    else { fill(150); rect(this.x - 5, this.y - 6, 10, 12); }
  }
  collides(p) {
    const box = p.slashing ? p.slashbox() : p.hitbox();
    return aabb(box, { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h });
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
