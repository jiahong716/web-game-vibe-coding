import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

(() => {
  const overlay = document.querySelector("#overlay");
  const gameContainer = document.querySelector("#game");
  const startButton = document.querySelector("#start-button");
  const introCopy = document.querySelector("#intro-copy");
  const healthFill = document.querySelector("#health-fill");
  const healthValue = document.querySelector("#health-value");
  const scoreElement = document.querySelector("#score");
  const timerElement = document.querySelector("#timer");
  const hitMarker = document.querySelector("#hit-marker");
  const damageFlash = document.querySelector("#damage-flash");
  const message = document.querySelector("#message");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090d12);
  scene.fog = new THREE.Fog(0x090d12, 18, 54);

  const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.7, 9);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  gameContainer.prepend(renderer.domElement);

  const clock = new THREE.Clock();
  const raycaster = new THREE.Raycaster();
  const keys = new Set();
  const enemies = [];
  const obstacles = [];
  const arenaLimit = 19;

  const game = {
    active: false,
    started: false,
    ended: false,
    health: 100,
    score: 0,
    time: 60,
    pitch: 0,
    yaw: 0,
    aiming: false,
    shotCooldown: 0,
    damageCooldown: 0
  };

  scene.add(new THREE.HemisphereLight(0x91c9d5, 0x18202a, 2.0));

  const keyLight = new THREE.DirectionalLight(0xd7fff0, 2.2);
  keyLight.position.set(-5, 12, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);

  const tealLight = new THREE.PointLight(0x28e6b2, 22, 24);
  tealLight.position.set(-10, 4, -7);
  scene.add(tealLight);

  const redLight = new THREE.PointLight(0xff3a5e, 18, 22);
  redLight.position.set(10, 4, 7);
  scene.add(redLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(42, 42),
    new THREE.MeshStandardMaterial({ color: 0x172128, roughness: 0.86 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const floorMarkingMaterial = new THREE.MeshStandardMaterial({
    color: 0x286656,
    emissive: 0x123d34,
    emissiveIntensity: 0.65,
    roughness: 0.6
  });
  [5.5, 11, 17].forEach((radius, index) => {
    const marking = new THREE.Mesh(
      new THREE.TorusGeometry(radius, index === 1 ? 0.035 : 0.022, 10, 128),
      floorMarkingMaterial
    );
    marking.rotation.x = Math.PI / 2;
    marking.position.y = 0.025 + index * 0.002;
    scene.add(marking);
  });

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x30434a,
    roughness: 0.58,
    metalness: 0.24
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x54d9b0,
    emissive: 0x138267,
    emissiveIntensity: 1.2
  });

  function addWall(x, y, z, width, height, depth) {
    const radius = Math.min(0.9, height * 0.48, depth * 0.48, width * 0.48);
    const wall = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 8, radius), wallMaterial);
    wall.position.set(x, y, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    obstacles.push({ x, z, halfWidth: width / 2, halfDepth: depth / 2 });

    const trim = new THREE.Mesh(
      new RoundedBoxGeometry(width, 0.08, depth + 0.04, 4, 0.035),
      trimMaterial
    );
    trim.position.set(x, height / 2 + y, z);
    scene.add(trim);
  }

  addWall(0, 2, -21, 42, 4, 1);
  addWall(0, 2, 21, 42, 4, 1);
  addWall(-21, 2, 0, 1, 4, 42);
  addWall(21, 2, 0, 1, 4, 42);
  addWall(-7, 1, -3, 3.2, 2, 2.2);
  addWall(7, 1, -7, 3.2, 2, 2.2);
  addWall(-8, 1, 8, 2.3, 2, 3.2);
  addWall(7, 1, 8, 3.2, 2, 2.2);

  function createEnemy(x, z, phase) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.userData.phase = phase;

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b5960,
      metalness: 0.52,
      roughness: 0.36
    });
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: 0xff5470,
      emissive: 0xc41439,
      emissiveIntensity: 2.4,
      metalness: 0.2,
      roughness: 0.24
    });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 40, 32), bodyMaterial);
    body.position.y = 1.65;
    body.scale.set(1, 0.92, 0.86);
    body.castShadow = true;
    body.userData.enemy = group;
    group.add(body);

    const core = new THREE.Mesh(new THREE.SphereGeometry(0.23, 28, 20), coreMaterial);
    core.position.set(0, 1.65, 0.61);
    core.userData.enemy = group;
    group.add(core);

    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0x9df9ff,
      emissive: 0x21aeb7,
      emissiveIntensity: 1.8
    });
    [-1, 1].forEach((side) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), eyeMaterial);
      eye.position.set(side * 0.2, 1.9, 0.51);
      group.add(eye);
    });

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.04, 12, 64),
      new THREE.MeshStandardMaterial({ color: 0xff657c, emissive: 0x8c132b, emissiveIntensity: 1.8 })
    );
    ring.position.y = 1.65;
    ring.rotation.x = Math.PI / 2.3;
    group.add(ring);

    scene.add(group);
    enemies.push({ group, alive: true, phase, speed: 0.38 + Math.random() * 0.18 });
  }

  [
    [-13, -12], [-2, -14], [12, -13], [14, -2],
    [13, 13], [1, 14], [-13, 12], [-15, 0]
  ].forEach(([x, z], index) => createEnemy(x, z, index * 1.7));

  const weapon = new THREE.Group();
  const gunBody = new THREE.Mesh(
    new RoundedBoxGeometry(0.22, 0.19, 0.65, 6, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x35494e, metalness: 0.68, roughness: 0.32 })
  );
  gunBody.position.set(0.34, -0.31, -0.62);
  weapon.add(gunBody);

  const gunBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.055, 0.36, 32),
    new THREE.MeshStandardMaterial({ color: 0x8ef6cf, emissive: 0x247c61, emissiveIntensity: 1 })
  );
  gunBarrel.rotation.x = Math.PI / 2;
  gunBarrel.position.set(0.34, -0.27, -0.96);
  weapon.add(gunBarrel);
  camera.add(weapon);
  scene.add(camera);

  function showMessage(text) {
    message.textContent = text;
    message.classList.remove("show");
    void message.offsetWidth;
    message.classList.add("show");
  }

  function updateHud() {
    healthFill.style.width = `${game.health}%`;
    healthFill.style.background = game.health <= 30 ? "#ff6077" : "#71f6c2";
    healthValue.textContent = String(game.health);
    scoreElement.textContent = String(game.score).padStart(2, "0");
    timerElement.textContent = String(Math.ceil(game.time)).padStart(2, "0");
  }

  function setAiming(aiming) {
    game.aiming = aiming;
    gameContainer.classList.toggle("aiming", aiming);
  }

  function finishGame(won) {
    game.active = false;
    setAiming(false);
    game.ended = true;
    document.exitPointerLock();
    overlay.classList.remove("hidden");
    startButton.textContent = "再次出擊";
    introCopy.textContent = won
      ? `模擬完成！你擊落了 ${game.score} 架守衛。`
      : `模擬結束，你擊落了 ${game.score} 架守衛。再試一次，撐過 60 秒！`;
  }

  function startGame() {
    if (!game.started || game.ended) {
      game.health = 100;
      game.score = 0;
      game.time = 60;
      game.ended = false;
      game.yaw = 0;
      game.pitch = 0;
      camera.position.set(0, 1.7, 9);
      camera.rotation.set(0, 0, 0);
      enemies.forEach((enemy) => {
        enemy.alive = true;
        enemy.group.visible = true;
      });
      game.started = true;
      updateHud();
    }

    overlay.classList.add("hidden");
    game.active = true;
    renderer.domElement.requestPointerLock();
  }

  function shoot() {
    if (!game.active || game.shotCooldown > 0) return;
    game.shotCooldown = 0.18;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const targets = enemies.filter((enemy) => enemy.alive).flatMap((enemy) => enemy.group.children);
    const hit = raycaster.intersectObjects(targets, false)[0];

    if (!hit) return;
    const enemyGroup = hit.object.userData.enemy;
    const enemy = enemies.find((candidate) => candidate.group === enemyGroup);
    if (!enemy || !enemy.alive) return;

    enemy.alive = false;
    enemy.group.visible = false;
    game.score += 1;
    updateHud();
    hitMarker.classList.remove("show");
    void hitMarker.offsetWidth;
    hitMarker.classList.add("show");
    showMessage("TARGET NEUTRALIZED");

    if (game.score === enemies.length) finishGame(true);
  }

  function takeDamage() {
    if (game.damageCooldown > 0) return;
    game.damageCooldown = 0.8;
    game.health = Math.max(0, game.health - 8);
    updateHud();
    damageFlash.classList.remove("show");
    void damageFlash.offsetWidth;
    damageFlash.classList.add("show");
    if (game.health === 0) finishGame(false);
  }

  function blockedAt(x, z) {
    return obstacles.some((obstacle) =>
      Math.abs(x - obstacle.x) < obstacle.halfWidth + 0.45 &&
      Math.abs(z - obstacle.z) < obstacle.halfDepth + 0.45
    );
  }

  function update(delta) {
    game.shotCooldown = Math.max(0, game.shotCooldown - delta);
    game.damageCooldown = Math.max(0, game.damageCooldown - delta);
    game.time = Math.max(0, game.time - delta);
    updateHud();

    const forwardInput = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
    const sideInput = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
    const directionLength = Math.hypot(forwardInput, sideInput) || 1;
    const speed = 7.5 * (game.aiming ? 0.65 : 1) * delta;
    const forward = new THREE.Vector3(-Math.sin(game.yaw), 0, -Math.cos(game.yaw));
    const right = new THREE.Vector3(Math.cos(game.yaw), 0, -Math.sin(game.yaw));
    const moveX = (forward.x * forwardInput + right.x * sideInput) / directionLength * speed;
    const moveZ = (forward.z * forwardInput + right.z * sideInput) / directionLength * speed;
    const nextX = THREE.MathUtils.clamp(camera.position.x + moveX, -19.2, 19.2);
    const nextZ = THREE.MathUtils.clamp(camera.position.z + moveZ, -19.2, 19.2);
    if (!blockedAt(nextX, camera.position.z)) camera.position.x = nextX;
    if (!blockedAt(camera.position.x, nextZ)) camera.position.z = nextZ;

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const { group } = enemy;
      group.position.y = Math.sin(clock.elapsedTime * 2.2 + enemy.phase) * 0.13;
      const dx = camera.position.x - group.position.x;
      const dz = camera.position.z - group.position.z;
      const distance = Math.hypot(dx, dz);

      if (distance > 2.25) {
        group.position.x += dx / distance * enemy.speed * delta;
        group.position.z += dz / distance * enemy.speed * delta;
      } else {
        takeDamage();
      }

      group.lookAt(camera.position.x, group.position.y + 1.4, camera.position.z);
    }

    if (game.time <= 0 && game.active) finishGame(true);
    weapon.position.z = Math.sin(clock.elapsedTime * 8) * (forwardInput || sideInput ? 0.006 : 0.002);
    weapon.position.x = THREE.MathUtils.lerp(weapon.position.x, game.aiming ? -0.24 : 0, delta * 12);
    weapon.position.y = THREE.MathUtils.lerp(weapon.position.y, game.aiming ? 0.11 : 0, delta * 12);
    camera.fov = THREE.MathUtils.lerp(camera.fov, game.aiming ? 58 : 76, delta * 10);
    camera.updateProjectionMatrix();
  }

  function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05);
    if (game.active && document.pointerLockElement === renderer.domElement) update(delta);
    renderer.render(scene, camera);
  }

  startButton.addEventListener("click", startGame);
  document.addEventListener("keydown", (event) => {
    keys.add(event.code);
    if (event.code.startsWith("Arrow")) event.preventDefault();
  });
  document.addEventListener("keyup", (event) => keys.delete(event.code));
  document.addEventListener("mousemove", (event) => {
    if (!game.active || document.pointerLockElement !== renderer.domElement) return;
    const sensitivity = game.aiming ? 0.0015 : 0.0022;
    game.yaw -= event.movementX * sensitivity;
    game.pitch = THREE.MathUtils.clamp(game.pitch - event.movementY * sensitivity, -1.35, 1.35);
    camera.rotation.set(game.pitch, game.yaw, 0, "YXZ");
  });
  document.addEventListener("mousedown", (event) => {
    if (event.button === 0) shoot();
    if (event.button === 2 && game.active) setAiming(true);
  });
  document.addEventListener("mouseup", (event) => {
    if (event.button === 2) setAiming(false);
  });
  document.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === renderer.domElement) {
      game.active = true;
      return;
    }

    setAiming(false);
    if (game.active) {
      game.active = false;
      overlay.classList.remove("hidden");
      startButton.textContent = "繼續遊戲";
      introCopy.textContent = "模擬已暫停。準備好後繼續清除守衛。";
    }
  });
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });

  updateHud();
  animate();
})();
