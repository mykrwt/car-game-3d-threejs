import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const TRACK_R = 60;
const TRACK_W = 14;
const COIN_TOTAL = 20;
const TIME_LIMIT = 60;
const MAX_SPEED = 38;
const ACCEL = 14;
const BRAKE_DECEL = 30;
const DRAG = 6;
const TURN_RATE = 2.2;
const WORLD_LIMIT = 170;
const COIN_RADIUS_SQ = 5.5;

const $ = (id) => document.getElementById(id);
const hud = { coins: $('score'), time: $('time'), speed: $('speed') };
const overlay = $('msg');
const overlayTitle = overlay.querySelector('h1');
const overlayText = overlay.querySelector('p');
const startBtn = $('start');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 90, 260);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 600);

scene.add(new THREE.HemisphereLight(0xffffff, 0x446644, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(40, 80, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, far: 300 });
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(400, 64),
  new THREE.MeshLambertMaterial({ color: 0x3a8f3a })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const road = new THREE.Mesh(
  new THREE.RingGeometry(TRACK_R - TRACK_W / 2, TRACK_R + TRACK_W / 2, 128),
  new THREE.MeshLambertMaterial({ color: 0x444444 })
);
road.rotation.x = -Math.PI / 2;
road.position.y = 0.02;
road.receiveShadow = true;
scene.add(road);

const dashGeo = new THREE.BoxGeometry(0.4, 0.05, 4);
const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
for (let i = 0; i < 64; i++) {
  const a = (i / 64) * Math.PI * 2;
  const dash = new THREE.Mesh(dashGeo, dashMat);
  dash.position.set(Math.cos(a) * TRACK_R, 0.05, Math.sin(a) * TRACK_R);
  dash.rotation.y = -a;
  scene.add(dash);
}

const trunkGeo = new THREE.CylinderGeometry(0.4, 0.5, 2, 8);
trunkGeo.translate(0, 1, 0);
const leafGeo = new THREE.ConeGeometry(2.2, 5, 8);
leafGeo.translate(0, 4.5, 0);
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
const leafMat = new THREE.MeshLambertMaterial({ color: 0x2d6b2d });
for (let i = 0; i < 140; i++) {
  const a = Math.random() * Math.PI * 2;
  const inner = Math.random() < 0.4;
  const r = inner
    ? 8 + Math.random() * (TRACK_R - TRACK_W / 2 - 14)
    : TRACK_R + TRACK_W / 2 + 6 + Math.random() * 90;
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  const leaves = new THREE.Mesh(leafGeo, leafMat);
  trunk.castShadow = true;
  leaves.castShadow = true;
  tree.add(trunk, leaves);
  tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
  tree.scale.setScalar(0.8 + Math.random() * 0.7);
  scene.add(tree);
}

function makeCar(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.8, 4),
    new THREE.MeshLambertMaterial({ color })
  );
  body.position.y = 0.6;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.7, 2),
    new THREE.MeshLambertMaterial({ color: 0x222a33 })
  );
  cabin.position.set(0, 1.25, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.4, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  for (const [x, z] of [[-1.05, 1.3], [1.05, 1.3], [-1.05, -1.3], [1.05, -1.3]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, 0.45, z);
    group.add(wheel);
  }
  return group;
}

const car = makeCar(0xe63946);
scene.add(car);

const player = { x: TRACK_R, z: 0, heading: 0, speed: 0 };
const keys = { left: false, right: false, gas: false, brake: false };
const keyMap = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'gas', KeyW: 'gas',
  ArrowDown: 'brake', KeyS: 'brake', Space: 'brake'
};

let state = 'menu';
let score = 0;
let timeLeft = TIME_LIMIT;
let coins = [];

const coinGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.15, 20);
coinGeo.rotateX(Math.PI / 2);
const coinMat = new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: 0x553300 });

function spawnCoins() {
  for (const c of coins) scene.remove(c.mesh);
  coins = [];
  for (let i = 0; i < COIN_TOTAL; i++) {
    const a = ((i + Math.random() * 0.6) / COIN_TOTAL) * Math.PI * 2;
    const r = TRACK_R + (Math.random() - 0.5) * TRACK_W * 0.6;
    const mesh = new THREE.Mesh(coinGeo, coinMat);
    mesh.position.set(Math.cos(a) * r, 1.2, Math.sin(a) * r);
    mesh.castShadow = true;
    scene.add(mesh);
    coins.push({ mesh, taken: false, phase: Math.random() * Math.PI * 2 });
  }
}

function restart() {
  player.x = TRACK_R;
  player.z = 0;
  player.heading = 0;
  player.speed = 0;
  score = 0;
  timeLeft = TIME_LIMIT;
  spawnCoins();
  state = 'playing';
  overlay.style.display = 'none';
}

function endGame(win) {
  state = 'over';
  overlayTitle.textContent = win ? 'You win!' : 'Time is up';
  overlayText.textContent = win
    ? `All ${COIN_TOTAL} coins collected with ${timeLeft.toFixed(1)}s left.`
    : `You collected ${score} of ${COIN_TOTAL} coins. Try again.`;
  startBtn.textContent = 'Play again';
  overlay.style.display = 'flex';
}

function update(dt) {
  if (state !== 'playing') return;
  timeLeft -= dt;

  if (keys.gas) {
    player.speed += ACCEL * dt;
  } else if (keys.brake) {
    if (player.speed > 0) {
      player.speed = Math.max(0, player.speed - BRAKE_DECEL * dt);
    } else {
      player.speed = Math.max(-MAX_SPEED * 0.4, player.speed - ACCEL * dt);
    }
  } else {
    const d = DRAG * dt;
    player.speed = Math.abs(player.speed) <= d ? 0 : player.speed - Math.sign(player.speed) * d;
  }
  if (keys.gas && keys.brake) {
    player.speed = Math.max(0, player.speed - BRAKE_DECEL * dt);
  }
  player.speed = Math.min(MAX_SPEED, Math.max(-MAX_SPEED * 0.4, player.speed));

  const steer = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  const turnFactor = Math.min(1, Math.abs(player.speed) / 8) * Math.sign(player.speed);
  player.heading += steer * TURN_RATE * turnFactor * dt;

  player.x += Math.sin(player.heading) * player.speed * dt;
  player.z += Math.cos(player.heading) * player.speed * dt;

  const r = Math.hypot(player.x, player.z);
  if (Math.abs(r - TRACK_R) > TRACK_W / 2) {
    player.speed *= Math.exp(-1.5 * dt);
  }
  if (r > WORLD_LIMIT) {
    const k = WORLD_LIMIT / r;
    player.x *= k;
    player.z *= k;
    player.speed *= 0.5;
  }

  for (const c of coins) {
    if (c.taken) continue;
    const dx = c.mesh.position.x - player.x;
    const dz = c.mesh.position.z - player.z;
    if (dx * dx + dz * dz < COIN_RADIUS_SQ) {
      c.taken = true;
      c.mesh.visible = false;
      score++;
    }
  }

  if (score === COIN_TOTAL) return endGame(true);
  if (timeLeft <= 0) {
    timeLeft = 0;
    return endGame(false);
  }
}

const look = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

function updateCamera(dt) {
  const sinH = Math.sin(player.heading);
  const cosH = Math.cos(player.heading);
  camTarget.set(player.x - sinH * 10, 4.5, player.z - cosH * 10);
  camera.position.lerp(camTarget, 1 - Math.exp(-6 * dt));
  lookTarget.set(player.x + sinH * 4, 1.2, player.z + cosH * 4);
  look.lerp(lookTarget, 1 - Math.exp(-10 * dt));
  camera.lookAt(look);
}

function syncScene(t) {
  car.position.set(player.x, 0, player.z);
  car.rotation.y = player.heading;
  for (const c of coins) {
    if (c.taken) continue;
    c.mesh.rotation.y += 0.05;
    c.mesh.position.y = 1.2 + Math.sin(t * 3 + c.phase) * 0.2;
  }
  hud.coins.textContent = `Coins: ${score} / ${COIN_TOTAL}`;
  hud.time.textContent = `Time: ${timeLeft.toFixed(1)}`;
  hud.speed.textContent = `${Math.round(Math.abs(player.speed) * 3.6)} km/h`;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') return restart();
  const k = keyMap[e.code];
  if (k) {
    keys[k] = true;
    e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  const k = keyMap[e.code];
  if (k) keys[k] = false;
});
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
});

document.querySelectorAll('#touch button').forEach((btn) => {
  const k = btn.dataset.k;
  const press = (e) => { e.preventDefault(); keys[k] = true; };
  const release = (e) => { e.preventDefault(); keys[k] = false; };
  btn.addEventListener('pointerdown', press);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointerleave', release);
  btn.addEventListener('pointercancel', release);
});

startBtn.addEventListener('click', restart);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

spawnCoins();
updateCamera(10);
syncScene(0);

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  update(dt);
  updateCamera(dt);
  syncScene(t);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
