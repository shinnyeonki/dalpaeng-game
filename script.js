import * as THREE from 'three';

// --- 상수 설정 (game_algo.md 참조) ---
const GOAL_DISTANCE = 100.0;
const TRACK_WIDTH = 60.0;
const TRACK_BUFFER = 50.0; // 출발/도착선 밖의 여유 공간
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
    scene.background = new THREE.Color(0xf1f5f9);
    scene.fog = new THREE.Fog(0xf1f5f9, 150, 600);

    const width = window.innerWidth;
    const height = window.innerHeight;
    camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 2000);
    camera.position.set(50, 100, 180);
    camera.lookAt(50, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    sunLight.position.set(50, 200, 100);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    scene.add(sunLight);

    pivot = new THREE.Object3D();
    pivot.position.set(GOAL_DISTANCE / 2, 0, 0);
    scene.add(pivot);

    // 시소 받침대 (더 견고하게 디자인)
    const fulcrumGeo = new THREE.CylinderGeometry(3, 8, 15, 4);
    const fulcrumMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.6, roughness: 0.2 });
    fulcrum = new THREE.Mesh(fulcrumGeo, fulcrumMat);
    fulcrum.position.set(GOAL_DISTANCE / 2, -9, 0);
    scene.add(fulcrum);
    
    const jointGeo = new THREE.CylinderGeometry(1.5, 1.5, TRACK_WIDTH + 15, 32);
    jointGeo.rotateX(Math.PI / 2);
    const joint = new THREE.Mesh(jointGeo, fulcrumMat);
    joint.position.set(GOAL_DISTANCE/2, -1.5, 0);
    scene.add(joint);

    // 트랙 (Track) - 전후방으로 훨씬 길게 확장
    const trackLength = GOAL_DISTANCE + (TRACK_BUFFER * 2);
    const trackGeo = new THREE.BoxGeometry(trackLength, 3, TRACK_WIDTH);
    const trackMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.05 });
    track = new THREE.Mesh(trackGeo, trackMat);
    track.position.set(0, -1.5, 0); // pivot 중심 기준
    track.receiveShadow = true;
    pivot.add(track);

    // 출발선 (Start Line)
    const startLine = new THREE.Mesh(
        new THREE.PlaneGeometry(3, TRACK_WIDTH),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.5 })
    );
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.set(-GOAL_DISTANCE / 2, 1.52, 0);
    track.add(startLine);

    // 도착선 (Goal Line)
    const goalLine = new THREE.Mesh(
        new THREE.PlaneGeometry(5, TRACK_WIDTH),
        new THREE.MeshStandardMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.6 })
    );
    goalLine.rotation.x = -Math.PI / 2;
    goalLine.position.set(GOAL_DISTANCE / 2, 1.52, 0);
    track.add(goalLine);

    // 트랙 장식: 10m 마다 가로선
    for(let i = -5; i <= 15; i++) {
        const xPos = i * 10 - (GOAL_DISTANCE / 2);
        if (Math.abs(i) <= 10 && i !== 0 && i !== 10) {
            const line = new THREE.Mesh(
                new THREE.PlaneGeometry(0.2, TRACK_WIDTH),
                new THREE.MeshBasicMaterial({ color: 0xf1f5f9 })
            );
            line.rotation.x = -Math.PI / 2;
            line.position.set(xPos, 1.51, 0);
            track.add(line);
        }
    }

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
    shell.position.set(-1.5, 3.5, 0);
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
    body.position.set(0, 1.2, 0);
    body.castShadow = true;
    snailGroup.add(body);

    const eyes = new THREE.Group();
    [0.5, -0.5].forEach(z => {
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.5), new THREE.MeshBasicMaterial({ color: 0xf8fafc }));
        stalk.position.set(2.5, 2, z);
        stalk.rotation.z = -0.4;
        eyes.add(stalk);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        ball.position.set(3, 3, z);
        eyes.add(ball);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0x334155 }));
        pupil.position.set(3.2, 3, z);
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
        seesawValDisplay.style.color = '#94a3b8';
        seesawArrow.innerText = '↔️';
    } else if (seesawValue > 0) {
        seesawValDisplay.style.color = '#10b981';
        seesawArrow.innerText = '➡️';
    } else {
        seesawValDisplay.style.color = '#ef4444';
        seesawArrow.innerText = '⬅️';
    }
}

function updateSnailPhysics() {
    snails.forEach(snail => {
        const baseSpeed = BASE_SPEED_MEAN + (Math.random() * 2 - 1) * SPEED_VARIANCE;
        const finalVelocity = baseSpeed + (seesawValue * snail.sensitivity);
        snail.speed = finalVelocity;
        snail.position += finalVelocity * DT;
        
        // 출발선 뒤로 나가는 것 방지
        if (snail.position < 0) snail.position = 0;

        // 메시 위치 업데이트 (출발선 기준)
        snail.mesh.position.x = snail.position - (GOAL_DISTANCE / 2);
        
        // 시각적 효과
        snail.bodyMesh.scale.set(1, Math.max(0.4, 1 + (finalVelocity / 45)), 1);
        snail.mesh.position.y = Math.abs(Math.sin(snail.position * 0.4)) * 0.4;
        snail.shellMesh.rotation.z = -finalVelocity * 0.015;

        createSlimeTrail(snail);

        // 진행도 및 속도 표시 (머리 기준)
        const progress = Math.min(100, ((snail.position + 3.5) / GOAL_DISTANCE) * 100);
        snail.hudElement.querySelector('.progress-bar').style.width = `${progress}%`;
        snail.hudElement.querySelector('.speed-val').innerText = `${finalVelocity.toFixed(1)} m/s`;

        // 도착 판단: 달팽이의 앞부분(눈/더듬이 위치)이 골인 지점을 넘었을 때
        // snail.position은 몸통 중심이므로, 약 3.5m 앞이 머리 부분임
        if (snail.position + 3.5 >= GOAL_DISTANCE && !winners.includes(snail)) {
            winners.push(snail);
            if (winners.length === 1) setTimeout(endGame, 1000);
        }
    });
}

function createSlimeTrail(snail) {
    if (Math.random() < 0.2) {
        const trail = new THREE.Mesh(
            new THREE.PlaneGeometry(2.5, 3),
            new THREE.MeshBasicMaterial({ color: snail.color, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
        );
        trail.rotation.x = -Math.PI / 2;
        // 꼬리 부분에 자국 남기기
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
