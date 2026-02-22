import * as THREE from 'three';

// --- Constants (from game_algo.md) ---
const GOAL_DISTANCE = 100.0;
const TRACK_WIDTH = 50.0;
const DT = 0.016; // 60 FPS
const BASE_SPEED_MEAN = 10.0;
const SPEED_VARIANCE = 20.0;

const SENSITIVITY_A = 20.0; // Gambler (Type A)
const SENSITIVITY_B = 5.0;  // Steady (Type B)

// --- Game State ---
let gameState = 'setup'; // 'setup', 'racing', 'finished'
let snails = [];
let seesawValue = 0.0;
let seesawTarget = 0.0;
let winners = [];
let clock = new THREE.Clock();
let accumulator = 0;

// --- Three.js Setup ---
let scene, camera, renderer, pivot, track;

// --- UI Elements ---
const setupScreen = document.getElementById('setup-screen');
const snailConfigsContainer = document.getElementById('snail-configs');
const snailCountInput = document.getElementById('snail-count');
const startBtn = document.getElementById('start-btn');
const gameHud = document.getElementById('game-hud');
const seesawValDisplay = document.getElementById('seesaw-value');
const seesawArrow = document.getElementById('seesaw-arrow');
const resultOverlay = document.getElementById('result-overlay');
const winnerText = document.getElementById('winner-text');
const snailInfo = document.getElementById('snail-info');

// --- Initialization ---
function init() {
    snailCountInput.addEventListener('change', updateSnailConfigs);
    startBtn.addEventListener('click', startGame);
    updateSnailConfigs();
}

function updateSnailConfigs() {
    const count = parseInt(snailCountInput.value);
    snailConfigsContainer.innerHTML = '';
    
    for (let i = 0; i < count; i++) {
        const configDiv = document.createElement('div');
        configDiv.className = 'bg-gray-700/50 p-4 rounded-lg border border-gray-600';
        configDiv.innerHTML = `
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-xs uppercase text-gray-400 mb-1">달팽이 ${i+1} 이름</label>
                    <input type="text" placeholder="달팽이 ${i+1}" class="snail-name w-full bg-gray-800 border border-gray-600 rounded p-1 text-sm">
                </div>
                <div>
                    <label class="block text-xs uppercase text-gray-400 mb-1">색상</label>
                    <input type="color" value="${getRandomColor()}" class="snail-color w-full h-8 bg-transparent cursor-pointer rounded">
                </div>
                <div class="col-span-2">
                    <label class="block text-xs uppercase text-gray-400 mb-1">타입</label>
                    <div class="flex gap-4">
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="type-${i}" value="A" checked class="snail-type"> 🎲 도박꾼 (High Risk)
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="type-${i}" value="B" class="snail-type"> 🐢 성실맨 (Steady)
                        </label>
                    </div>
                </div>
            </div>
        `;
        snailConfigsContainer.appendChild(configDiv);
    }
}

function getRandomColor() {
    const colors = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function startGame() {
    const configElements = snailConfigsContainer.children;
    snails = [];

    for (let i = 0; i < configElements.length; i++) {
        const name = configElements[i].querySelector('.snail-name').value || `달팽이 ${i+1}`;
        const colorInput = configElements[i].querySelector('.snail-color').value;
        const type = configElements[i].querySelector('input[name="type-' + i + '"]:checked').value;
        
        snails.push({
            name,
            color: colorInput,
            type,
            sensitivity: type === 'A' ? SENSITIVITY_A : SENSITIVITY_B,
            position: 0,
            speed: 0,
            mesh: null,
            shellMesh: null,
            bodyMesh: null,
            trail: [],
            hudElement: null
        });
    }

    setupScreen.classList.add('hidden');
    gameHud.classList.remove('hidden');
    
    initThreeJS();
    initHUD();
    gameState = 'racing';
    clock.start();
    animate();
}

function initHUD() {
    snailInfo.innerHTML = '';
    snails.forEach(snail => {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-3 text-sm';
        div.innerHTML = `
            <div class="w-3 h-3 rounded-full" style="background-color: ${snail.color}"></div>
            <div class="font-bold min-w-[80px]">${snail.name}</div>
            <div class="w-48 bg-gray-700 h-2 rounded-full overflow-hidden">
                <div class="progress-bar bg-blue-500 h-full transition-all duration-100" style="width: 0%"></div>
            </div>
            <div class="speed-val font-mono text-xs text-gray-400">0.0 m/s</div>
        `;
        snailInfo.appendChild(div);
        snail.hudElement = div;
    });
}

function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); 
    scene.fog = new THREE.Fog(0x0f172a, 100, 400);

    const width = window.innerWidth;
    const height = window.innerHeight;
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(50, 75, 120);
    camera.lookAt(50, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Stars/Background
    const starGeo = new THREE.BufferGeometry();
    const starCoords = [];
    for(let i=0; i<5000; i++) {
        starCoords.push((Math.random()-0.5)*1000, (Math.random()-0.5)*1000, (Math.random()-0.5)*1000);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starCoords, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1 });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(20, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    scene.add(sunLight);

    pivot = new THREE.Object3D();
    pivot.position.set(GOAL_DISTANCE / 2, 0, 0);
    scene.add(pivot);

    // Track
    const trackGeo = new THREE.BoxGeometry(GOAL_DISTANCE + 40, 3, TRACK_WIDTH);
    const trackMat = new THREE.MeshStandardMaterial({ 
        color: 0x1e293b, 
        roughness: 0.7,
        metalness: 0.2
    });
    track = new THREE.Mesh(trackGeo, trackMat);
    track.position.set(0, -1.5, 0);
    track.receiveShadow = true;
    pivot.add(track);

    // Visual elements on track
    const lineMat = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 });
    
    const startLine = new THREE.Mesh(new THREE.PlaneGeometry(2, TRACK_WIDTH), lineMat(0xffffff));
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.set(-GOAL_DISTANCE / 2, 1.51, 0);
    track.add(startLine);

    const goalLine = new THREE.Mesh(new THREE.PlaneGeometry(2, TRACK_WIDTH), lineMat(0xf59e0b));
    goalLine.rotation.x = -Math.PI / 2;
    goalLine.position.set(GOAL_DISTANCE / 2, 1.51, 0);
    track.add(goalLine);

    // Lane Lines
    for(let i=0; i<5; i++) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_DISTANCE + 40, 0.2), lineMat(0x334155));
        l.rotation.x = -Math.PI / 2;
        l.position.set(0, 1.51, -TRACK_WIDTH/2 + i * (TRACK_WIDTH/4));
        track.add(l);
    }

    snails.forEach((snail, index) => {
        const snailGroup = new THREE.Group();
        
        // Shell (Spiral-ish)
        const shellGeo = new THREE.SphereGeometry(3, 32, 32);
        const shellMat = new THREE.MeshStandardMaterial({ 
            color: snail.color,
            roughness: snail.type === 'B' ? 0.05 : 0.4,
            metalness: snail.type === 'B' ? 0.9 : 0.1,
        });
        const shell = new THREE.Mesh(shellGeo, shellMat);
        shell.position.set(-1, 3.5, 0);
        shell.castShadow = true;
        snailGroup.add(shell);
        snail.shellMesh = shell;

        // Body
        const bodyGeo = new THREE.CapsuleGeometry(1.2, 5, 8, 16);
        const bodyMat = new THREE.MeshPhysicalMaterial({ 
            color: 0xeeeeee,
            roughness: 0.1,
            metalness: 0.1,
            transmission: snail.type === 'A' ? 0.4 : 0, 
            thickness: 1,
            transparent: true,
            opacity: 0.95
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.rotation.z = Math.PI / 2;
        body.position.set(0, 1.2, 0);
        body.castShadow = true;
        snailGroup.add(body);
        snail.bodyMesh = body;

        // Eyes / Tentacles
        const eyeGroup = new THREE.Group();
        eyeGroup.position.set(2.5, 1.5, 0);
        
        const tentacleGeo = new THREE.CylinderGeometry(0.1, 0.1, 2);
        const tentacleMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
        
        const eyeBallGeo = new THREE.SphereGeometry(0.3, 16, 16);
        const eyeBallMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const pupilGeo = new THREE.SphereGeometry(0.15, 8, 8);
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

        [0.5, -0.5].forEach(zOffset => {
            const t = new THREE.Mesh(tentacleGeo, tentacleMat);
            t.position.set(0.5, 1, zOffset);
            t.rotation.z = -0.3;
            eyeGroup.add(t);

            const e = new THREE.Mesh(eyeBallGeo, eyeBallMat);
            e.position.set(0.8, 2, zOffset);
            eyeGroup.add(e);

            const p = new THREE.Mesh(pupilGeo, pupilMat);
            p.position.set(1, 2, zOffset);
            eyeGroup.add(p);
        });

        snailGroup.add(eyeGroup);

        const laneZ = (index - (snails.length - 1) / 2) * (TRACK_WIDTH / (snails.length + 1));
        snailGroup.position.set(-GOAL_DISTANCE / 2, 0, laneZ);
        
        track.add(snailGroup);
        snail.mesh = snailGroup;
    });

    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Game Loop ---
function animate() {
    if (gameState === 'setup') return;
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    accumulator += delta;

    while (accumulator >= DT) {
        if (gameState === 'racing') {
            updateSeesawLogic();
            updateSnailPhysics();
        }
        accumulator -= DT;
    }

    renderer.render(scene, camera);
}

function updateSeesawLogic() {
    if (Math.random() < 0.01) {
        seesawTarget = (Math.random() * 2) - 1;
    }
    seesawValue += (seesawTarget - seesawValue) * 0.03;
    pivot.rotation.z = -seesawValue * (Math.PI / 12);

    seesawValDisplay.innerText = seesawValue.toFixed(2);
    if (Math.abs(seesawValue) < 0.1) {
        seesawValDisplay.style.color = '#ffffff';
        seesawArrow.style.transform = 'rotate(0deg)';
        seesawArrow.innerText = '↔️';
    } else if (seesawValue > 0) {
        seesawValDisplay.style.color = '#34d399'; 
        seesawArrow.style.transform = 'rotate(180deg)';
        seesawArrow.innerText = '➡️';
    } else {
        seesawValDisplay.style.color = '#f87171'; 
        seesawArrow.style.transform = 'rotate(0deg)';
        seesawArrow.innerText = '⬅️';
    }
}

function updateSnailPhysics() {
    snails.forEach(snail => {
        const baseSpeed = BASE_SPEED_MEAN + (Math.random() * 2 - 1) * SPEED_VARIANCE;
        const finalVelocity = baseSpeed + (seesawValue * snail.sensitivity);
        snail.speed = finalVelocity;

        snail.position += finalVelocity * DT;
        if (snail.position < 0) snail.position = 0;

        snail.mesh.position.x = snail.position - (GOAL_DISTANCE / 2);

        // Visual stretching
        const speedScale = 1 + (finalVelocity / 40);
        snail.bodyMesh.scale.set(1, Math.max(0.5, speedScale), 1);
        
        // Wobble/Head movement
        const time = performance.now() * 0.005;
        snail.mesh.position.y = Math.sin(time + snail.position * 0.5) * 0.2;
        
        snail.shellMesh.rotation.z = -finalVelocity * 0.01;

        createSlimeTrail(snail);

        const progress = Math.min(100, (snail.position / GOAL_DISTANCE) * 100);
        snail.hudElement.querySelector('.progress-bar').style.width = `${progress}%`;
        snail.hudElement.querySelector('.speed-val').innerText = `${finalVelocity.toFixed(1)} m/s`;

        if (snail.position >= GOAL_DISTANCE && !winners.includes(snail)) {
            winners.push(snail);
            if (winners.length === 1) {
                setTimeout(endGame, 1000);
            }
        }
    });
}

function createSlimeTrail(snail) {
    if (Math.random() < 0.15) {
        const trailGeo = new THREE.PlaneGeometry(2, 2.5);
        const trailMat = new THREE.MeshBasicMaterial({ 
            color: snail.color, 
            transparent: true, 
            opacity: 0.15,
            side: THREE.DoubleSide
        });
        const trail = new THREE.Mesh(trailGeo, trailMat);
        trail.rotation.x = -Math.PI / 2;
        trail.position.set(snail.position - (GOAL_DISTANCE / 2) - 2.5, 1.52, snail.mesh.position.z);
        track.add(trail);
        snail.trail.push(trail);
        
        if (snail.trail.length > 80) {
            const old = snail.trail.shift();
            track.remove(old);
            old.geometry.dispose();
            old.material.dispose();
        }
    }
}

function endGame() {
    gameState = 'finished';
    const winner = winners[0];
    winnerText.innerText = `${winner.name} 우승!`;
    winnerText.style.color = winner.color;
    resultOverlay.classList.remove('hidden');
}

init();
