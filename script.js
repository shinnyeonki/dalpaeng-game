import * as THREE from 'three';

// --- 상수 설정 (game_algo.md 참조) ---
const GOAL_DISTANCE = 100.0;
const TRACK_WIDTH = 60.0;
const DT = 0.016; // 60 FPS 고정
const BASE_SPEED_MEAN = 10.0;
const SPEED_VARIANCE = 3.0;

const SENSITIVITY_A = 20.0; // 도박꾼 (A타입)
const SENSITIVITY_B = 5.0;  // 성실맨 (B타입)

// --- 게임 상태 ---
let gameState = 'setup'; // 'setup', 'racing', 'finished'
let snails = [];
let seesawValue = 0.0;
let seesawTarget = 0.0;
let winners = [];
let clock = new THREE.Clock();
let accumulator = 0;

// --- Three.js 구성 요소 ---
let scene, camera, renderer, pivot, track, fulcrum;

// --- UI 요소 ---
const setupScreen = document.getElementById('setup-screen');
const snailConfigsContainer = document.getElementById('snail-configs');
const snailCountInput = document.getElementById('snail-count');
const snailCountDisplay = document.getElementById('snail-count-display');
const startBtn = document.getElementById('start-btn');
const gameHud = document.getElementById('game-hud');
const seesawValDisplay = document.getElementById('seesaw-value');
const seesawArrow = document.getElementById('seesaw-arrow');
const resultOverlay = document.getElementById('result-overlay');
const winnerText = document.getElementById('winner-text');
const snailInfo = document.getElementById('snail-info');

// --- 초기화 ---
function init() {
    initThreeJS();
    
    snailCountInput.addEventListener('input', (e) => {
        snailCountDisplay.innerText = `${e.target.value}마리`;
        updateSnailConfigs();
    });
    
    startBtn.addEventListener('click', startGame);
    
    updateSnailConfigs();
    animate();
}

function updateSnailConfigs() {
    const count = parseInt(snailCountInput.value);
    snailConfigsContainer.innerHTML = '';
    
    // 기존 달팽이 제거
    snails.forEach(s => { if(s.mesh) track.remove(s.mesh); });
    snails = [];

    for (let i = 0; i < count; i++) {
        const defaultColor = getRandomColor(i);
        const configDiv = document.createElement('div');
        configDiv.className = 'bg-white p-4 rounded-2xl border border-slate-100 shadow-sm transition-all hover:shadow-md';
        configDiv.innerHTML = `
            <div class="grid grid-cols-[1fr_auto] gap-4">
                <div class="space-y-3">
                    <div class="flex gap-2 items-center">
                        <span class="text-xs font-black text-slate-300 uppercase">#${i+1}</span>
                        <input type="text" placeholder="달팽이 ${i+1}" class="snail-name bg-transparent border-b-2 border-slate-100 focus:border-blue-400 outline-none w-full text-sm font-bold text-slate-800">
                    </div>
                    <div class="flex gap-4">
                        <label class="flex items-center gap-2 cursor-pointer group">
                            <input type="radio" name="type-${i}" value="A" checked class="snail-type hidden">
                            <span class="type-btn px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider">도박꾼</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer group">
                            <input type="radio" name="type-${i}" value="B" class="snail-type hidden">
                            <span class="type-btn px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider">성실맨</span>
                        </label>
                    </div>
                </div>
                <div class="flex flex-col items-center justify-center">
                    <input type="color" value="${defaultColor}" class="snail-color w-10 h-10 bg-transparent cursor-pointer overflow-hidden">
                </div>
            </div>
        `;
        snailConfigsContainer.appendChild(configDiv);

        const snail = {
            id: i,
            name: `달팽이 ${i+1}`,
            color: defaultColor,
            type: 'A',
            sensitivity: SENSITIVITY_A,
            position: 0,
            mesh: null,
            shellMesh: null,
            bodyMesh: null,
            trail: [],
            hudElement: null
        };
        
        const visual = createSnailMesh(defaultColor, 'A');
        snail.mesh = visual.group;
        snail.shellMesh = visual.shell;
        snail.bodyMesh = visual.body;
        snails.push(snail);
        
        positionSnailInLane(snail, i, count);

        // 이벤트 바인딩
        configDiv.querySelector('.snail-color').oninput = (e) => {
            snail.color = e.target.value;
            updateSnailVisuals(snail);
        };
        
        configDiv.querySelectorAll('input[type="radio"]').forEach(radio => {
            radio.onchange = (e) => {
                if (e.target.checked) {
                    snail.type = e.target.value;
                    snail.sensitivity = snail.type === 'A' ? SENSITIVITY_A : SENSITIVITY_B;
                    updateSnailVisuals(snail);
                }
            };
        });
    }
}

function getRandomColor(index) {
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
    return colors[index % colors.length];
}

function updateSnailVisuals(snail) {
    snail.shellMesh.material.color.set(snail.color);
    snail.shellMesh.material.roughness = snail.type === 'B' ? 0.05 : 0.4;
    snail.shellMesh.material.metalness = snail.type === 'B' ? 0.9 : 0.1;

    snail.bodyMesh.material.transmission = snail.type === 'A' ? 0.6 : 0;
    snail.bodyMesh.material.thickness = snail.type === 'A' ? 2 : 0;
    snail.bodyMesh.material.roughness = snail.type === 'A' ? 0.05 : 0.2;
}

function startGame() {
    const configElements = snailConfigsContainer.children;
    snails.forEach((snail, i) => {
        const nameInput = configElements[i].querySelector('.snail-name');
        snail.name = nameInput.value || `달팽이 ${i+1}`;
    });

    setupScreen.classList.add('opacity-0');
    setTimeout(() => {
        setupScreen.classList.add('hidden');
        gameHud.classList.remove('hidden');
        initHUD();
        gameState = 'racing';
        clock.start();
    }, 500);
}

function initHUD() {
    snailInfo.innerHTML = '';
    snails.forEach(snail => {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-4 text-sm';
        div.innerHTML = `
            <div class="w-2.5 h-2.5 rounded-full shadow-sm" style="background-color: ${snail.color}"></div>
            <div class="font-black min-w-[80px] text-[11px] tracking-widest text-slate-700 uppercase">${snail.name}</div>
            <div class="w-40 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div class="progress-bar bg-blue-500 h-full transition-all duration-100" style="width: 0%"></div>
            </div>
            <div class="speed-val font-mono text-[10px] text-slate-400 font-bold">0.0 m/s</div>
        `;
        snailInfo.appendChild(div);
        snail.hudElement = div;
    });
}

function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9); // Slate-100 (밝은 배경)
    scene.fog = new THREE.Fog(0xf1f5f9, 100, 500);

    const width = window.innerWidth;
    const height = window.innerHeight;
    camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(50, 80, 130);
    camera.lookAt(50, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // 구름 느낌의 부드러운 배경 도트 (별 대신)
    const cloudGeo = new THREE.BufferGeometry();
    const cloudCoords = [];
    for(let i=0; i<1000; i++) {
        cloudCoords.push((Math.random()-0.5)*800, (Math.random())*400, (Math.random()-0.5)*800);
    }
    cloudGeo.setAttribute('position', new THREE.Float32BufferAttribute(cloudCoords, 3));
    const cloudMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, transparent: true, opacity: 0.8 });
    const clouds = new THREE.Points(cloudGeo, cloudMat);
    scene.add(clouds);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(20, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    scene.add(sunLight);

    pivot = new THREE.Object3D();
    pivot.position.set(GOAL_DISTANCE / 2, 0, 0);
    scene.add(pivot);

    // 시소 받침대 (Fulcrum)
    const fulcrumGeo = new THREE.CylinderGeometry(2, 6, 12, 4);
    const fulcrumMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.5, roughness: 0.2 });
    fulcrum = new THREE.Mesh(fulcrumGeo, fulcrumMat);
    fulcrum.position.set(GOAL_DISTANCE / 2, -7.5, 0);
    fulcrum.receiveShadow = true;
    scene.add(fulcrum);
    
    const jointGeo = new THREE.CylinderGeometry(1.2, 1.2, TRACK_WIDTH + 10, 16);
    jointGeo.rotateX(Math.PI / 2);
    const joint = new THREE.Mesh(jointGeo, fulcrumMat);
    joint.position.set(GOAL_DISTANCE/2, -1.5, 0);
    scene.add(joint);

    // 트랙 (Track)
    const trackGeo = new THREE.BoxGeometry(GOAL_DISTANCE + 40, 3, TRACK_WIDTH);
    const trackMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.1 });
    track = new THREE.Mesh(trackGeo, trackMat);
    track.position.set(0, -1.5, 0);
    track.receiveShadow = true;
    pivot.add(track);

    // 도착선 (Goal)
    const goalLine = new THREE.Mesh(
        new THREE.PlaneGeometry(4, TRACK_WIDTH),
        new THREE.MeshStandardMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.4 })
    );
    goalLine.rotation.x = -Math.PI / 2;
    goalLine.position.set(GOAL_DISTANCE / 2, 1.52, 0);
    track.add(goalLine);

    window.addEventListener('resize', onWindowResize);
}

function createSnailMesh(color, type) {
    const snailGroup = new THREE.Group();
    
    const shellGeo = new THREE.SphereGeometry(3, 32, 32);
    const shellMat = new THREE.MeshStandardMaterial({ 
        color: color,
        roughness: type === 'B' ? 0.05 : 0.4,
        metalness: type === 'B' ? 0.9 : 0.1,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.position.set(-1, 3.5, 0);
    shell.castShadow = true;
    snailGroup.add(shell);

    const bodyGeo = new THREE.CapsuleGeometry(1.2, 5.5, 8, 16);
    const bodyMat = new THREE.MeshPhysicalMaterial({ 
        color: 0xf8fafc,
        roughness: 0.2,
        metalness: 0.1,
        transmission: type === 'A' ? 0.6 : 0, 
        transparent: true,
        opacity: 0.95
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.z = Math.PI / 2;
    body.position.set(0.5, 1.2, 0);
    body.castShadow = true;
    snailGroup.add(body);

    const eyes = new THREE.Group();
    [0.5, -0.5].forEach(z => {
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.5), new THREE.MeshBasicMaterial({ color: 0xf8fafc }));
        stalk.position.set(3, 2, z);
        stalk.rotation.z = -0.4;
        eyes.add(stalk);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        ball.position.set(3.5, 3, z);
        eyes.add(ball);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0x334155 }));
        pupil.position.set(3.7, 3, z);
        eyes.add(pupil);
    });
    snailGroup.add(eyes);

    track.add(snailGroup);
    return { group: snailGroup, shell, body };
}

function positionSnailInLane(snail, index, total) {
    const laneZ = (index - (total - 1) / 2) * (TRACK_WIDTH / (total + 0.5));
    snail.mesh.position.set(-GOAL_DISTANCE / 2, 0, laneZ);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (gameState === 'setup') {
        snails.forEach((snail, i) => {
            const time = performance.now() * 0.002;
            snail.mesh.position.y = Math.sin(time + i) * 0.2;
        });
        pivot.rotation.z = Math.sin(performance.now() * 0.001) * 0.05;
    } else {
        accumulator += delta;
        while (accumulator >= DT) {
            if (gameState === 'racing') {
                updateSeesawLogic();
                updateSnailPhysics();
            }
            accumulator -= DT;
        }
    }
    renderer.render(scene, camera);
}

function updateSeesawLogic() {
    if (Math.random() < 0.012) seesawTarget = (Math.random() * 2) - 1;
    seesawValue += (seesawTarget - seesawValue) * 0.04;
    pivot.rotation.z = -seesawValue * (Math.PI / 10);
    seesawValDisplay.innerText = seesawValue.toFixed(2);
    
    const intensity = Math.abs(seesawValue);
    if (intensity < 0.1) {
        seesawValDisplay.style.color = '#94a3b8'; // slate-400
        seesawArrow.innerText = '↔️';
    } else if (seesawValue > 0) {
        seesawValDisplay.style.color = '#10b981'; // emerald-500
        seesawArrow.innerText = '➡️';
    } else {
        seesawValDisplay.style.color = '#ef4444'; // red-500
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
        snail.bodyMesh.scale.set(1, Math.max(0.4, 1 + (finalVelocity / 45)), 1);
        snail.mesh.position.y = Math.abs(Math.sin(snail.position * 0.4)) * 0.4;
        snail.shellMesh.rotation.z = -finalVelocity * 0.015;

        createSlimeTrail(snail);

        const progress = Math.min(100, (snail.position / GOAL_DISTANCE) * 100);
        snail.hudElement.querySelector('.progress-bar').style.width = `${progress}%`;
        snail.hudElement.querySelector('.speed-val').innerText = `${finalVelocity.toFixed(1)} m/s`;

        if (snail.position >= GOAL_DISTANCE && !winners.includes(snail)) {
            winners.push(snail);
            if (winners.length === 1) setTimeout(endGame, 1000);
        }
    });
}

function createSlimeTrail(snail) {
    if (Math.random() < 0.2) {
        const trail = new THREE.Mesh(
            new THREE.PlaneGeometry(2.5, 3),
            new THREE.MeshBasicMaterial({ color: snail.color, transparent: true, opacity: 0.2, side: THREE.DoubleSide })
        );
        trail.rotation.x = -Math.PI / 2;
        trail.position.set(snail.position - (GOAL_DISTANCE / 2) - 3, 1.52, snail.mesh.position.z);
        track.add(trail);
        snail.trail.push(trail);
        if (snail.trail.length > 60) {
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
