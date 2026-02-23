import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- 상수 설정 (보통 스케일로 정상화) ---
const GOAL_DISTANCE = 200.0; 
const TRACK_WIDTH = 70.0;   
const TRACK_BUFFER = 25.0;   
const TRACK_HEIGHT = 5.0;   

// const BASE_SPEED_MEAN = 6.0;
const BASE_SPEED_MEAN = 20.0;
// const SPEED_VARIANCE = 4.0;
const SPEED_VARIANCE = 15.0;

const SENSITIVITY_A = 4.0;
const SENSITIVITY_B = 1.5;

// --- [추가] 천사 이벤트 상수 ---
const TRIGGER_DISTANCE_RATIO = 0.3; // 선두가 30% 지점 통과 시 발동 시도
const BOTTOM_RANK_RATIO = 0.2;      // 하위 20% 그룹 선정
const SELECTION_RATIO = 1;        // 그 그룹 내에서 30% 당첨
const BOOST_MULTIPLIER = 2.5;       // 속도 2.5배
const BOOST_DURATION = 4.0;         // 4초간 지속

const DT = 0.016;
const CONDITION_INTERVAL = 1.5;
const CONDITION_SMOOTHING = 0.03;


// --- 게임 상태 ---
let gameState = 'setup';
let snails = [];
let seesawValue = 0.0;
let seesawTarget = 0.0;
let winners = [];
let clock = new THREE.Clock();
let accumulator = 0;

// --- [추가] 천사 이벤트 상태 ---
let angelState = {
    triggered: false,   // 이번 판에 이미 발동했는지 여부
    active: false,      // 현재 화면에 천사가 있는지
    animTimer: 0,       // 애니메이션 타이머
    targets: []         // 부스터 받을 달팽이들
};

// --- Three.js 구성 요소 ---
let scene, camera, renderer, pivot, track, fulcrum, controls;

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
const gameTimer = document.getElementById('game-timer');

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
                            <span class="type-btn px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider">미끌미끌 달팽이</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer group">
                            <input type="radio" name="type-${i}" value="B" class="snail-type hidden">
                            <span class="type-btn px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider">빤딱빤딱 달팽이</span>
                        </label>
                    </div>
                </div>
                <div class="flex flex-col items-center justify-center">
                    <input type="color" value="${defaultColor}" class="snail-color w-10 h-10 bg-transparent cursor-pointer overflow-hidden">
                </div>
            </div>
        `;
        snailConfigsContainer.appendChild(configDiv);

        addSnail(i, defaultColor, 'A', count);

        configDiv.querySelector('.snail-color').oninput = (e) => {
            const snail = snails[i];
            snail.color = e.target.value;
            refreshSnailMesh(snail, i, count);
        };
        configDiv.querySelectorAll('input[type="radio"]').forEach(radio => {
            radio.onchange = (e) => {
                if (e.target.checked) {
                    const snail = snails[i];
                    snail.type = e.target.value;
                    snail.sensitivity = snail.type === 'A' ? SENSITIVITY_A : SENSITIVITY_B;
                    refreshSnailMesh(snail, i, count);
                }
            };
        });
    }
}

function addSnail(index, color, type, total) {
    const visual = createSnailMesh(color, type);
    const snail = {
        id: index,
        name: `달팽이 ${index+1}`,
        color: color,
        type: type,
        sensitivity: type === 'A' ? SENSITIVITY_A : SENSITIVITY_B,
        position: 0,
        speed: 0,
        currentBaseSpeed: BASE_SPEED_MEAN,
        targetBaseSpeed: BASE_SPEED_MEAN,
        conditionTimer: Math.random() * CONDITION_INTERVAL,
        isDead: false,
        deathAnim: 0,
        mesh: visual.group,
        shell: visual.shell,
        body: visual.body,
        pupils: visual.pupils,
        trail: [],
        hudElement: null
    };
    snails.push(snail);
    positionSnailInLane(snail, index, total);
}

function refreshSnailMesh(snail, index, total) {
    if (snail.mesh) track.remove(snail.mesh);
    const visual = createSnailMesh(snail.color, snail.type);
    snail.mesh = visual.group;
    snail.shell = visual.shell;
    snail.body = visual.body;
    snail.pupils = visual.pupils;
    positionSnailInLane(snail, index, total);
}

function getRandomColor(index) {
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
    return colors[index % colors.length];
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
    scene.fog = new THREE.Fog(0xf1f5f9, 300, 1500);

    const width = window.innerWidth;
    const height = window.innerHeight;
    camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 10000);
    camera.position.set(100, 180, 350);
    camera.lookAt(GOAL_DISTANCE / 2, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // 마우스 카메라 조작 활성화
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; 
    controls.dampingFactor = 0.05;
    controls.target.set(GOAL_DISTANCE / 2, 0, 0); 

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(100, 300, 150);
    sunLight.castShadow = true;
    sunLight.shadow.camera.left = -300;
    sunLight.shadow.camera.right = 300;
    sunLight.shadow.camera.top = 300;
    sunLight.shadow.camera.bottom = -300;
    sunLight.shadow.mapSize.set(2048, 2048);
    scene.add(sunLight);

    pivot = new THREE.Object3D();
    pivot.position.set(GOAL_DISTANCE / 2, 0, 0);
    scene.add(pivot);

    // 받침대 (스케일 축소)
    const fulcrumMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.4, roughness: 0.3 });
    fulcrum = new THREE.Mesh(new THREE.CylinderGeometry(5, 15, 30, 4), fulcrumMat);
    fulcrum.position.set(GOAL_DISTANCE / 2, -16.5, 0);
    scene.add(fulcrum);
    
    const joint = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, TRACK_WIDTH + 20, 32), fulcrumMat);
    joint.rotation.x = Math.PI / 2;
    joint.position.set(GOAL_DISTANCE/2, -2.5, 0);
    scene.add(joint);

    // 트랙 (보통 스케일)
    const trackLength = GOAL_DISTANCE + (TRACK_BUFFER * 2);
    track = new THREE.Mesh(new THREE.BoxGeometry(trackLength, TRACK_HEIGHT, TRACK_WIDTH), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 }));
    track.position.set(0, -TRACK_HEIGHT / 2, 0);
    track.receiveShadow = true;
    pivot.add(track);

    // 출발선
    const startLine = new THREE.Mesh(new THREE.PlaneGeometry(5, TRACK_WIDTH), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.5 }));
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.set(-GOAL_DISTANCE / 2, TRACK_HEIGHT / 2 + 0.02, 0);
    track.add(startLine);

    // 도착선
    const goalLine = new THREE.Mesh(new THREE.PlaneGeometry(8, TRACK_WIDTH), new THREE.MeshStandardMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.3 }));
    goalLine.rotation.x = -Math.PI / 2;
    goalLine.position.set(GOAL_DISTANCE / 2, TRACK_HEIGHT / 2 + 0.02, 0);
    track.add(goalLine);

    // 보조 가로선 (25m 간격)
    for(let i = -10; i <= 20; i++) {
        const xPos = i * 25 - (GOAL_DISTANCE / 2);
        if (xPos > -trackLength/2 && xPos < trackLength/2) {
            const line = new THREE.Mesh(
                new THREE.PlaneGeometry(0.3, TRACK_WIDTH),
                new THREE.MeshBasicMaterial({ color: 0xf1f5f9 })
            );
            line.rotation.x = -Math.PI / 2;
            line.position.set(xPos, TRACK_HEIGHT / 2 + 0.01, 0);
            track.add(line);
        }
    }

    window.addEventListener('resize', onWindowResize);
}

function createSnailMesh(color, type) {
    const snailGroup = new THREE.Group();
    const isSlippery = (type === 'A');

    // 1. 껍질 (보통 스케일 7.5 -> 3.5)
    const shellMat = new THREE.MeshStandardMaterial({ 
        color: color,
        roughness: isSlippery ? 0.05 : 0.8,
        metalness: isSlippery ? 0.9 : 0.0,
    });
    
    const shellGroup = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(3.5, 32, 32), shellMat);
    shellGroup.add(shell);

    if (!isSlippery) {
        const ringGeo = new THREE.TorusGeometry(2.2, 0.7, 16, 32);
        const ring = new THREE.Mesh(ringGeo, shellMat);
        ring.rotation.y = Math.PI / 2;
        ring.position.set(1.5, 0, 0);
        shellGroup.add(ring);
    }
    
    shellGroup.position.set(-1.5, 4.0, 0);
    shellGroup.castShadow = true;
    snailGroup.add(shellGroup);

    // 2. 몸체 (보통 스케일)
    const bodyMat = new THREE.MeshPhysicalMaterial({ 
        color: isSlippery ? 0xdbeafe : 0xf8fafc,
        roughness: isSlippery ? 0.0 : 0.4,
        transmission: isSlippery ? 0.95 : 0.0,
        transparent: true,
        opacity: isSlippery ? 0.85 : 1.0,
        thickness: 2
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 6, 8, 16), bodyMat);
    body.rotation.z = Math.PI / 2;
    body.position.set(0.5, 1.4, 0);
    body.castShadow = true;
    snailGroup.add(body);

    // 3. 눈 (보통 스케일)
    const eyes = new THREE.Group();
    const pupils = [];
    [0.6, -0.6].forEach(z => {
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 3), bodyMat);
        stalk.position.set(2.8, 2.8, z);
        stalk.rotation.z = -0.4;
        eyes.add(stalk);
        
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        ball.position.set(3.5, 4.2, z);
        eyes.add(ball);
        
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), new THREE.MeshBasicMaterial({ color: 0x020617 }));
        pupil.position.set(4.0, 4.2, z);
        eyes.add(pupil);
        pupils.push(pupil);
    });
    snailGroup.add(eyes);

    track.add(snailGroup);
    return { group: snailGroup, shell: shellGroup, body, pupils };
}

function positionSnailInLane(snail, index, total) {
    const laneZ = (index - (total - 1) / 2) * (TRACK_WIDTH / (total + 0.5));
    snail.mesh.position.set(-GOAL_DISTANCE / 2, TRACK_HEIGHT / 2, laneZ);
}

function createAngelMesh() {
    const group = new THREE.Group();

    // 1. 몸통 (빛나는 원뿔)
    const bodyMat = new THREE.MeshStandardMaterial({ 
        color: 0xfffae0, emissive: 0xffd700, emissiveIntensity: 0.6,
        transparent: true, opacity: 0.9, flatShading: true
    });
    const body = new THREE.Mesh(new THREE.ConeGeometry(4, 12, 8), bodyMat);
    body.position.y = 0;
    group.add(body);

    // 2. 머리
    const head = new THREE.Mesh(new THREE.SphereGeometry(2.5, 16, 16), bodyMat);
    head.position.y = 7;
    group.add(head);

    // 3. 날개
    const wingGeo = new THREE.CircleGeometry(6, 4);
    const wingMat = new THREE.MeshBasicMaterial({ 
        color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.7 
    });
    const w1 = new THREE.Mesh(wingGeo, wingMat);
    w1.position.set(-4, 4, -2); w1.rotation.y = -0.4;
    group.add(w1);
    const w2 = new THREE.Mesh(wingGeo, wingMat);
    w2.position.set(4, 4, -2); w2.rotation.y = 0.4;
    group.add(w2);

    // 4. 헤일로 (고리)
    const halo = new THREE.Mesh(
        new THREE.TorusGeometry(1.8, 0.3, 8, 24), 
        new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, 11, 0);
    group.add(halo);

    // 5. 스포트라이트 (집중 조명: 각도는 좁게, 트랙은 선명하게)
    const light = new THREE.SpotLight(0xffdd00, 150, 150, 0.2, 0.4, 1);
    light.position.set(0, 5, 0);
    light.target.position.set(0, -50, 0);
    group.add(light);
    group.add(light.target);

    return group;
}

function checkAngelEvent() {
    if (angelState.triggered || snails.length === 0) return;

    const maxPos = Math.max(...snails.map(s => s.position));
    if (maxPos / GOAL_DISTANCE >= TRIGGER_DISTANCE_RATIO) {
        angelState.triggered = true;
        
        // 발동 확률 (선택사항이나 "확률적으로 1회" 지침 준수)
        if (Math.random() > 0.7) return; 

        // 하위 20% 그룹 선정 (오름차순 정렬)
        const sorted = [...snails].sort((a, b) => a.position - b.position);
        const bottomCount = Math.max(1, Math.ceil(snails.length * BOTTOM_RANK_RATIO));
        const candidates = sorted.slice(0, bottomCount);
        
        // 그룹 내에서 30% 선정
        angelState.targets = candidates.filter(() => Math.random() < SELECTION_RATIO);
        
        if (angelState.targets.length > 0) {
            angelState.active = true;
            angelState.targets.forEach(snail => {
                const angel = createAngelMesh();
                snail.angelMesh = angel;
                scene.add(angel);
                // 초기 위치: 매우 높은 곳
                angel.position.set(0, 300, 0); 
            });
            angelState.animTimer = 0;
        }
    }
}

const _worldPos = new THREE.Vector3();
function updateAngelAnimation() {
    if (!angelState.active) return;
    
    angelState.animTimer += DT;
    const t = angelState.animTimer;
    
    let targetYOffset;
    if (t < 1.0) { // 하강 (1초)
        targetYOffset = THREE.MathUtils.lerp(300, 45, t);
    } else if (t < BOOST_DURATION + 1.0) { // 체공 및 버프 유지 (4초)
        targetYOffset = 45 + Math.sin(t * 3) * 2;
    } else { // 상승 및 소멸 (1초)
        const ascendT = (t - (BOOST_DURATION + 1.0));
        targetYOffset = THREE.MathUtils.lerp(45, 300, ascendT);
        if (ascendT > 1.0) {
            angelState.targets.forEach(snail => {
                if (snail.angelMesh) {
                    scene.remove(snail.angelMesh);
                    delete snail.angelMesh;
                }
            });
            angelState.active = false;
            angelState.targets = [];
            return;
        }
    }

    // 각 천사의 위치를 대응하는 달팽이의 머리 위로 실시간 업데이트
    angelState.targets.forEach(snail => {
        if (snail.angelMesh) {
            snail.mesh.getWorldPosition(_worldPos);
            snail.angelMesh.position.copy(_worldPos);
            snail.angelMesh.position.y += targetYOffset;
        }
    });
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
            snail.mesh.position.y = (TRACK_HEIGHT / 2) + Math.sin(time + i) * 0.4;
        });
        pivot.rotation.z = Math.sin(performance.now() * 0.001) * 0.03;
    } else {
        accumulator += delta;
        while (accumulator >= DT) {
            updateGameLogic();
            accumulator -= DT;
        }
    }
    if (controls) controls.update();
    renderer.render(scene, camera);
}

function updateGameLogic() {
    if (gameState === 'racing') {
        updateSeesawLogic();
        checkAngelEvent();
        updateAngelAnimation();
        snails.forEach(snail => updateSnailPhysics(snail));
        
        // 타이머 업데이트
        const time = clock.elapsedTime;
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        const cents = Math.floor((time % 1) * 100);
        gameTimer.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${cents.toString().padStart(2, '0')}`;
    } else if (gameState === 'finished') {
        snails.forEach(snail => { if (snail.isDead) updateDeathAnimation(snail); });
    }
}

function updateSeesawLogic() {
    if (Math.random() < 0.01) seesawTarget = (Math.random() * 2) - 1;
    seesawValue += (seesawTarget - seesawValue) * 0.04;
    pivot.rotation.z = -seesawValue * (Math.PI / 12);
    seesawValDisplay.innerText = seesawValue.toFixed(2);
}

function updateSnailPhysics(snail) {
    snail.conditionTimer -= DT;
    if (snail.conditionTimer <= 0) {
        snail.targetBaseSpeed = BASE_SPEED_MEAN + (Math.random() * 2 - 1) * SPEED_VARIANCE;
        snail.conditionTimer = CONDITION_INTERVAL * (0.5 + Math.random());
    }
    snail.currentBaseSpeed += (snail.targetBaseSpeed - snail.currentBaseSpeed) * CONDITION_SMOOTHING;

    const finalVelocity = snail.currentBaseSpeed + (seesawValue * snail.sensitivity);
    
    // --- [추가] 부스터 효과 적용 ---
    let effectiveVelocity = finalVelocity;
    if (angelState.active && angelState.targets.includes(snail)) {
        effectiveVelocity *= BOOST_MULTIPLIER;
    }

    snail.speed = effectiveVelocity;
    snail.position += effectiveVelocity * DT;
    if (snail.position < 0) snail.position = 0;

    // --- 시각적 업데이트 (앞뒤 수축/팽창 방식) ---
    snail.mesh.position.x = snail.position - (GOAL_DISTANCE / 2);
    
    // 1. 수직 바운스 제거 (트랙 표면에 밀착)
    snail.mesh.position.y = (TRACK_HEIGHT / 2);
    
    // 2. 기어가는 리듬 계산 (위치 기반 사인파)
    const crawlFrequency = 0.15; // 기어가는 주기
    const crawlCycle = Math.sin(snail.position * crawlFrequency);
    
    // 3. 앞뒤 수축/팽창 (Squash and Stretch)
    const stretchIntensity = snail.type === 'A' ? 0.5 : 0.25; 
    const baseStretch = 1 + (effectiveVelocity / (snail.type === 'A' ? 40 : 80));
    const rhythmicStretch = crawlCycle * stretchIntensity;
    
    const finalStretch = Math.max(0.5, baseStretch + rhythmicStretch);
    snail.body.scale.set(1, finalStretch, 1); 
    
    // 4. 껍질과 눈의 미세 반응
    snail.shell.position.x = -1.5 + (crawlCycle * 0.7); 
    snail.shell.rotation.z = -effectiveVelocity * 0.01 - (crawlCycle * 0.1);

    snail.pupils.forEach(p => {
        const time = performance.now() * 0.01;
        p.position.x = 0.4 + Math.sin(time) * 0.05 + (crawlCycle * 0.1);
    });

    createSlimeTrail(snail);

    // 머리 위치 보정 (약 5m 앞)
    const progress = Math.min(100, ((snail.position + 5) / GOAL_DISTANCE) * 100);
    snail.hudElement.querySelector('.progress-bar').style.width = `${progress}%`;
    snail.hudElement.querySelector('.speed-val').innerText = `${effectiveVelocity.toFixed(1)} m/s`;

    if (snail.position + 5 >= GOAL_DISTANCE && !winners.includes(snail)) {
        winners.push(snail);
        if (winners.length === 1) endGame();
    }
}

function updateDeathAnimation(snail) {
    snail.deathAnim = Math.min(1, snail.deathAnim + 0.06);
    snail.mesh.rotation.x = snail.deathAnim * (Math.PI / 2.1);
    snail.mesh.position.y = (TRACK_HEIGHT / 2) + (snail.deathAnim * 2.0);
    snail.mesh.scale.y = 1 - (snail.deathAnim * 0.7);
    snail.pupils.forEach(p => p.material.color.set(0x000000));
}

function createSlimeTrail(snail) {
    if (Math.random() < 0.2) {
        const trail = new THREE.Mesh(
            new THREE.PlaneGeometry(3, 4), 
            new THREE.MeshBasicMaterial({ color: snail.color, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
        );
        trail.rotation.x = -Math.PI / 2;
        trail.position.set(snail.position - (GOAL_DISTANCE / 2) - 4, TRACK_HEIGHT / 2 + 0.02, snail.mesh.position.z);
        track.add(trail);
        snail.trail.push(trail);
        if (snail.trail.length > 70) {
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
    snails.forEach(snail => { if (snail !== winner) snail.isDead = true; });
    setTimeout(() => { resultOverlay.classList.remove('hidden'); }, 2000);
}

init();
