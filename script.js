import * as THREE from 'three';
import * as World from './world.js';
import * as Simulation from './simulation.js';

// --- ⚙️ 게임 상수 설정 (밸런스 및 물리 환경) ---
const CONFIG = {
    GOAL_DISTANCE: 200.0,      // 목표 지점 거리 (m)
    TRACK_WIDTH: 120.0,        // 트랙 전체 너비
    TRACK_BUFFER: 25.0,        // 출발선 이전/도착선 이후 여유 공간
    TRACK_HEIGHT: 5.0,         // 트랙 판의 두께
    
    BASE_SPEED_MEAN: 7.0,      // 모든 달팽이의 평균 기본 이동 속도
    SPEED_VARIANCE: 5.0,       // 컨디션 변화에 따른 속도 변동폭 (기본 속도 ±5.0)
    
    SLOPE_SENSITIVITY_A: 4.0,  // [미끌미끌] 타입: 경사에 매우 민감 (내리막에서 매우 빠름, 오르막에서 역주행 위험)
    SLOPE_SENSITIVITY_B: 1.5,  // [빤딱빤딱] 타입: 경사에 둔감 (기울기에 상관없이 안정적으로 전진)
    
    TRIGGER_DISTANCE_RATIO: 0.5, // 천사 이벤트가 발생하는 시점 (선두가 50% 지점 통과 시)
    EVENT_TRIGGER_CHANCE: 1.0,   // 천사 이벤트가 발생할 확률 (1.0 = 100%)
    BOTTOM_RANK_RATIO: 0.4,      // 천사의 가호를 받을 후보군 범위 (하위 40% 달팽이들)
    SELECTION_RATIO: 0.5,        // 후보군 중 실제 당첨될 확률 (50%)
    BOOST_MULTIPLIER: 2.0,       // 천사 버프 시 기본 속도 증가 배율
    BOOST_DURATION: 3.0,         // 버프 지속 시간 (초)
    
    DT: 0.016,                 // 물리 연산 프레임 간격 (60FPS 기준, 약 0.016초)
    CONDITION_INTERVAL: 1.5,   // 달팽이의 컨디션(목표 속도)이 바뀌는 평균 주기 (초)
    CONDITION_SMOOTHING: 0.03  // 속도가 급격하게 변하지 않도록 하는 보간 계수 (낮을수록 부드러움)
};

// --- 🎮 게임 전역 상태 관리 ---
let gameState = 'setup';       // 게임 상태: 'setup'(대기), 'racing'(경주 중), 'finished'(종료)
let snails = [];               // 경주 중인 모든 달팽이 객체 배열
let seesawValue = 0.0;         // 현재 시소 기울기 수치 (-1.0: 왼쪽 높음 ~ 1.0: 오른쪽 높음)
let seesawTarget = 0.0;        // 시소가 향하려고 하는 목표 기울기 (랜덤하게 변함)
let winners = [];              // 결승선을 통과한 순서대로 달팽이 객체 저장
let clock = new THREE.Clock(); // 게임 내 절대 시간 측정을 위한 시계
let accumulator = 0;           // 물리 엔진의 프레임을 고르게 유지하기 위한 시간 누적값
let angelState = {             // 천사 이벤트의 현재 진행 상태
    triggered: false,          // 이번 판에 이미 이벤트가 발생했는지 여부
    active: false,             // 현재 화면에 천사가 나타나 활동 중인지 여부
    animTimer: 0,              // 천사 애니메이션 진행 시간
    targets: []                // 버프를 받고 있는 달팽이 목록
};
let currentSessionConfigs = []; // 사용자가 설정한 달팽이 이름, 색상, 타입 정보 (로컬 스토리지 동기화용)

// --- 🖥️ UI 요소 참조 (DOM Elements) ---
const setupScreen = document.getElementById('setup-screen');           // 초기 설정 화면 레이어
const snailConfigsContainer = document.getElementById('snail-configs'); // 개별 달팽이 설정 UI가 생성될 컨테이너
const snailCountInput = document.getElementById('snail-count');         // 달팽이 마리수 조절 슬라이더
const snailCountDisplay = document.getElementById('snail-count-display'); // 현재 선택된 마리수 텍스트 표시
const startBtn = document.getElementById('start-btn');                   // '경주 시작' 버튼
const gameHud = document.getElementById('game-hud');                     // 경주 중 진행 상황을 보여주는 HUD 레이어
const seesawValDisplay = document.getElementById('seesaw-value');       // 화면 우측 상단 지형 기울기 수치 표시창
const seesawArrow = document.getElementById('seesaw-arrow');             // 시소 기울기 방향을 보여주는 아이콘/화살표
const resultOverlay = document.getElementById('result-overlay');         // 경기 종료 후 우승자 발표 레이어
const winnerText = document.getElementById('winner-text');               // 우승자 이름이 출력되는 공간
const snailInfo = document.getElementById('snail-info');                 // 왼쪽 상단 개별 달팽이 상태(진행도, 속도) 컨테이너
const gameTimer = document.getElementById('game-timer');                 // 경주 경과 시간 표시기
const loadSettingsContainer = document.getElementById('load-settings-container'); // '이전 설정 불러오기' 영역
const loadSettingsBtn = document.getElementById('load-settings-btn');     // 실제 불러오기 버튼

// --- 🎥 카메라 제어 상태 ---
let cameraTargetSnail = null;  // 현재 카메라가 추적 중인 달팽이 객체
let zoomVelocity = 0;          // 줌 변화량 (Velocity Control)

function init() {
    World.initWorld('canvas-container', CONFIG.GOAL_DISTANCE, CONFIG.TRACK_WIDTH, CONFIG.TRACK_HEIGHT, CONFIG.TRACK_BUFFER);
    
    // 천사 오브젝트 풀 초기화 및 셰이더 프리컴파일 (스터터링 방지)
    Simulation.initAngelPool(World.scene, 10);
    World.renderer.compile(World.scene, World.camera);

    // 이전에 저장된 설정이 있는지 확인만 함
    const hasSaved = localStorage.getItem('snail-configs');
    if (hasSaved) {
        loadSettingsContainer.classList.remove('hidden');
    }

    // 불러오기 버튼 클릭 시 저장된 값을 현재 세션에 적용
    loadSettingsBtn.onclick = () => {
        const savedCount = localStorage.getItem('snail-count');
        const savedConfigs = localStorage.getItem('snail-configs');
        
        if (savedCount && savedConfigs) {
            snailCountInput.value = savedCount;
            snailCountDisplay.innerText = `${savedCount}마리`;
            updateSnailConfigs(true); // true: localStorage에서 읽어옴
        }
        loadSettingsContainer.classList.add('hidden');
    };

    snailCountInput.oninput = (e) => {
        snailCountDisplay.innerText = `${e.target.value}마리`;
        updateSnailConfigs(false); // 슬라이더 조절 시 실시간 UI 갱신 (저장은 안 함)
    };

    startBtn.onclick = startGame;
    
    // 초기 실행: 저장된 데이터가 아니라 기본값으로 화면을 구성 (저장은 하지 않음)
    updateSnailConfigs(false);
    initCameraUI();
    animate();
}

function initCameraUI() {
    // 추적 해제용 헬퍼
    const clearTracking = () => {
        cameraTargetSnail = null;
        World.controls.enablePan = true;
    };

    // 줌 슬라이더 (Velocity Control)
    const zoomSlider = document.getElementById('zoom-slider');
    zoomSlider.oninput = (e) => {
        zoomVelocity = -parseFloat(e.target.value) * 10.0; // 값에 비례하여 속도 조절
    };
    // 슬라이더 조절 후 떼면 0으로 복구 (선택 사항 - 문서에는 변화량 제어라고만 되어있음)
    zoomSlider.onmouseup = () => {
        zoomSlider.value = 0;
        zoomVelocity = 0;
    };

    // 이동 버튼 (Pan)
    const moveButtons = {
        'cam-move-up': new THREE.Vector3(0, 1, 0),
        'cam-move-down': new THREE.Vector3(0, -1, 0),
        'cam-move-left': new THREE.Vector3(-1, 0, 0),
        'cam-move-right': new THREE.Vector3(1, 0, 0)
    };

    Object.entries(moveButtons).forEach(([id, dir]) => {
        const btn = document.getElementById(id);
        let interval;
        const startMoving = () => {
            clearTracking(); // 수동 이동 시 추적 해제
            interval = setInterval(() => {
                const panSpeed = 5;
                const offset = dir.clone().multiplyScalar(panSpeed);
                World.camera.position.add(offset);
                World.controls.target.add(offset);
            }, 16);
        };
        const stopMoving = () => clearInterval(interval);
        btn.onmousedown = startMoving;
        btn.onmouseup = stopMoving;
        btn.onmouseleave = stopMoving;
    });

    // 프리셋 버튼
    document.getElementById('cam-preset-default').onclick = () => {
        clearTracking();
        setCameraPreset(100, 180, 350, CONFIG.GOAL_DISTANCE / 2, 0, 0);
    };
    document.getElementById('cam-preset-start').onclick = () => {
        clearTracking();
        setCameraPreset(-100, 60, 120, 0, 0, 0);
    };
    document.getElementById('cam-preset-end').onclick = () => {
        clearTracking();
        setCameraPreset(CONFIG.GOAL_DISTANCE + 100, 60, 120, CONFIG.GOAL_DISTANCE, 0, 0);
    };

    // 회전 패드 드래그 로직 (UI에서 직접 회전)
    const rotatePad = document.getElementById('cam-rotate-pad');
    let isRotating = false;
    let lastX, lastY;

    rotatePad.onmousedown = (e) => {
        isRotating = true;
        lastX = e.clientX;
        lastY = e.clientY;
        // 회전 중에는 추적 유지 (Pan만 아니면 됨)
    };

    window.addEventListener('mousemove', (e) => {
        if (!isRotating) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;

        const rotateSpeed = 0.005;
        // OrbitControls의 내부 상태를 직접 변경하거나 
        // controls.rotateLeft/Up 메서드 사용 (addons/OrbitControls에는 이 메서드들이 있음)
        World.controls.rotateLeft(dx * rotateSpeed * 2);
        World.controls.rotateUp(dy * rotateSpeed * 2);
        World.controls.update();
    });

    window.addEventListener('mouseup', () => {
        isRotating = false;
    });

    // 회전 동기화 (Globe UI)
    const globe = document.getElementById('camera-globe');
    World.controls.addEventListener('change', () => {
        const az = World.controls.getAzimuthalAngle();
        const pol = World.controls.getPolarAngle();
        // 간단한 시각적 회전 피드백
        globe.style.transform = `rotateY(${az * 180 / Math.PI}deg) rotateX(${pol * 180 / Math.PI - 90}deg)`;
    });
}

function setCameraPreset(px, py, pz, tx, ty, tz) {
    // 부드러운 이동을 위해 TWEEN 등을 쓸 수도 있지만 여기선 즉시 변경
    World.camera.position.set(px, py, pz);
    World.controls.target.set(tx, ty, tz);
    World.controls.update();
}

function updateSnailConfigs(loadFromStorage = false) {
    if (loadFromStorage) {
        try { 
            const savedConfigs = JSON.parse(localStorage.getItem('snail-configs'));
            if (savedConfigs) {
                currentSessionConfigs = savedConfigs;
            }
        } catch (e) { 
            console.error('설정 로드 실패:', e); 
        }
    }

    const count = parseInt(snailCountInput.value);
    
    // 현재 UI에 표시된 달팽이 마리수와 설정 데이터의 개수를 맞춤
    if (currentSessionConfigs.length !== count) {
        if (currentSessionConfigs.length > count) {
            currentSessionConfigs = currentSessionConfigs.slice(0, count);
        } else {
            for (let i = currentSessionConfigs.length; i < count; i++) {
                currentSessionConfigs[i] = {
                    name: `달팽이 ${i + 1}`,
                    color: getRandomColor(i),
                    type: 'A'
                };
            }
        }
    }

    snailConfigsContainer.innerHTML = '';
    snails.forEach(s => { if(s.mesh) World.track.remove(s.mesh); });
    snails = [];

    for (let i = 0; i < count; i++) {
        const config = currentSessionConfigs[i];
        const configDiv = document.createElement('div');
        configDiv.className = 'bg-white p-4 rounded-2xl border border-slate-100 shadow-sm transition-all hover:shadow-md';
        configDiv.innerHTML = `
            <div class="grid grid-cols-[1fr_auto] gap-4">
                <div class="space-y-3">
                    <div class="flex gap-2 items-center">
                        <span class="text-xs font-black text-slate-300 uppercase">#${i+1}</span>
                        <input type="text" value="${config.name}" placeholder="달팽이 ${i+1}" class="snail-name bg-transparent border-b-2 border-slate-100 focus:border-blue-400 outline-none w-full text-sm font-bold text-slate-800">
                    </div>
                    <div class="flex gap-4">
                        <label class="flex items-center gap-2 cursor-pointer group">
                            <input type="radio" name="type-${i}" value="A" ${config.type === 'A' ? 'checked' : ''} class="snail-type hidden">
                            <span class="type-btn px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider">미끌미끌 달팽이</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer group">
                            <input type="radio" name="type-${i}" value="B" ${config.type === 'B' ? 'checked' : ''} class="snail-type hidden">
                            <span class="type-btn px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider">빤딱빤딱 달팽이</span>
                        </label>
                    </div>
                </div>
                <div class="flex flex-col items-center justify-center">
                    <input type="color" value="${config.color}" class="snail-color w-10 h-10 bg-transparent cursor-pointer overflow-hidden">
                </div>
            </div>
        `;
        snailConfigsContainer.appendChild(configDiv);

        addSnail(i, config.color, config.type, count, config.name);

        // 입력 시 메모리 내 currentSessionConfigs 만 업데이트
        configDiv.querySelector('.snail-name').oninput = (e) => {
            const val = e.target.value || `달팽이 ${i+1}`;
            snails[i].name = val;
            currentSessionConfigs[i].name = val;
        };

        configDiv.querySelector('.snail-color').oninput = (e) => {
            const val = e.target.value;
            snails[i].color = val;
            currentSessionConfigs[i].color = val;
            refreshSnailMesh(snails[i], i, count);
        };

        configDiv.querySelectorAll('input[type="radio"]').forEach(radio => {
            radio.onchange = (e) => {
                if (e.target.checked) {
                    const val = e.target.value;
                    const snail = snails[i];
                    snail.type = val;
                    snail.sensitivity = val === 'A' ? CONFIG.SLOPE_SENSITIVITY_A : CONFIG.SLOPE_SENSITIVITY_B;
                    currentSessionConfigs[i].type = val;
                    refreshSnailMesh(snail, i, count);
                }
            };
        });
    }
}

function saveAllSettings() {
    localStorage.setItem('snail-count', snailCountInput.value);
    localStorage.setItem('snail-configs', JSON.stringify(currentSessionConfigs));
}

function startGame() {
    // 경주 시작 시점에 모든 설정을 확정 저장
    saveAllSettings();
    
    setupScreen.classList.add('opacity-0');
    setTimeout(() => {
        setupScreen.classList.add('hidden');
        gameHud.classList.remove('hidden');
        document.getElementById('camera-controls').classList.remove('hidden');
        initHUD();
        gameState = 'racing';
        clock.start();
    }, 500);
}

function addSnail(index, color, type, total, name) {
    const visual = Simulation.createSnailMesh(color, type);
    const snail = {
        id: index,
        name: name || `달팽이 ${index+1}`,
        color: color,
        type: type,
        sensitivity: type === 'A' ? CONFIG.SLOPE_SENSITIVITY_A : CONFIG.SLOPE_SENSITIVITY_B,
        position: 0,
        speed: 0,
        currentBaseSpeed: CONFIG.BASE_SPEED_MEAN,
        targetBaseSpeed: CONFIG.BASE_SPEED_MEAN,
        conditionTimer: Math.random() * CONFIG.CONDITION_INTERVAL,
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
    World.track.add(snail.mesh);
}

function refreshSnailMesh(snail, index, total) {
    if (snail.mesh) World.track.remove(snail.mesh);
    const visual = Simulation.createSnailMesh(snail.color, snail.type);
    snail.mesh = visual.group;
    snail.shell = visual.shell;
    snail.body = visual.body;
    snail.pupils = visual.pupils;
    positionSnailInLane(snail, index, total);
    World.track.add(snail.mesh);
}

function positionSnailInLane(snail, index, total) {
    const laneZ = (index - (total - 1) / 2) * (CONFIG.TRACK_WIDTH / (total + 0.5));
    snail.mesh.position.set(-CONFIG.GOAL_DISTANCE / 2, CONFIG.TRACK_HEIGHT / 2, laneZ);
}

function getRandomColor(index) {
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#a855f7'];
    return colors[index % colors.length];
}

function initHUD() {
    snailInfo.innerHTML = '';
    snails.forEach(snail => {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50/50 p-1 rounded-lg transition-colors pointer-events-auto';
        div.onclick = () => {
            cameraTargetSnail = snail;
            // // 추적 시점: 달팽이 약간 위에서 정면(경주 방향)을 바라보는 뷰
            const worldPos = new THREE.Vector3();
            snail.mesh.getWorldPosition(worldPos);
            
            // 초기 위치 설정 (추적 시작 시 한 번만 점프)
            // 뒤쪽(-15) 약간 위(y+7)에서 달팽이와 경주 방향을 함께 바라보는 시점
            World.camera.position.set(worldPos.x - 15, worldPos.y + 15, worldPos.z);
            World.controls.target.copy(worldPos);
            World.controls.enablePan = false; // 추적 중에는 수동 이동(Pan) 제한 (회전/확대만 허용)
        };
        div.innerHTML = `
            <div class="w-2 h-2 rounded-full shadow-sm" style="background-color: ${snail.color}"></div>
            <div class="font-black min-w-[50px] text-[10px] tracking-wider text-slate-700 uppercase truncate">${snail.name}</div>
            <div class="w-20 bg-slate-100 h-1 rounded-full overflow-hidden">
                <div class="progress-bar bg-blue-500 h-full transition-all duration-100" style="width: 0%"></div>
            </div>
            <div class="speed-val font-mono text-[9px] text-slate-400 font-bold min-w-[45px] text-right">0.0 m/s</div>
        `;
        snailInfo.appendChild(div);
        snail.hudElement = div;
    });
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // --- 카메라 제어 업데이트 ---
    if (cameraTargetSnail) {
        const worldPos = new THREE.Vector3();
        cameraTargetSnail.mesh.getWorldPosition(worldPos);
        
        // 달팽이의 실제 이동량(Delta)을 계산
        const moveDelta = new THREE.Vector3().subVectors(worldPos, World.controls.target);
        
        // 타겟과 카메라 위치를 동시에 이동시켜 상대적 거리와 각도를 완벽하게 유지
        World.controls.target.add(moveDelta);
        World.camera.position.add(moveDelta);
        
        // OrbitControls 내부 상태 동기화
        World.controls.update();
    }

    if (Math.abs(zoomVelocity) > 0.1) {
        const zoomDir = new THREE.Vector3();
        World.camera.getWorldDirection(zoomDir);
        World.camera.position.addScaledVector(zoomDir, -zoomVelocity);
    }

    if (gameState === 'setup') {
        snails.forEach((snail, i) => {
            const time = performance.now() * 0.002;
            snail.mesh.position.y = (CONFIG.TRACK_HEIGHT / 2) + Math.sin(time + i) * 0.4;
        });
        World.pivot.rotation.z = Math.sin(performance.now() * 0.001) * 0.03;
    } else {
        accumulator += delta;
        while (accumulator >= CONFIG.DT) {
            updateGameLogic();
            accumulator -= CONFIG.DT;
        }
    }
    if (World.controls) World.controls.update();
    World.renderer.render(World.scene, World.camera);
}

function updateGameLogic() {
    if (gameState === 'racing') {
        updateSeesawLogic();
        
        Simulation.checkAngelEvent(snails, CONFIG.GOAL_DISTANCE, angelState, CONFIG);
        
        Simulation.updateAngelAnimation(angelState, CONFIG.DT, World.scene, CONFIG.BOOST_DURATION);
        
        snails.forEach(snail => {
            Simulation.updateSnailPhysics(snail, {
                dt: CONFIG.DT,
                seesawValue,
                goalDistance: CONFIG.GOAL_DISTANCE,
                trackHeight: CONFIG.TRACK_HEIGHT,
                baseSpeedMean: CONFIG.BASE_SPEED_MEAN,
                speedVariance: CONFIG.SPEED_VARIANCE,
                conditionInterval: CONFIG.CONDITION_INTERVAL,
                conditionSmoothing: CONFIG.CONDITION_SMOOTHING,
                isAngelActive: angelState.active,
                isTarget: angelState.targets.includes(snail),
                angelAnimTimer: angelState.animTimer,
                boostMultiplier: CONFIG.BOOST_MULTIPLIER
            });
            Simulation.createSlimeTrail(snail, World.track, CONFIG.TRACK_HEIGHT, CONFIG.GOAL_DISTANCE);
            
            // HUD 업데이트
            const progress = Math.min(100, ((snail.position + 5) / CONFIG.GOAL_DISTANCE) * 100);
            snail.hudElement.querySelector('.progress-bar').style.width = `${progress}%`;
            snail.hudElement.querySelector('.speed-val').innerText = `${snail.speed.toFixed(1)} m/s`;

            if (snail.position + 5 >= CONFIG.GOAL_DISTANCE && !winners.includes(snail)) {
                winners.push(snail);
                if (winners.length === 1) endGame();
            }
        });
        
        // 타이머 업데이트
        const time = clock.elapsedTime;
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        const cents = Math.floor((time % 1) * 100);
        gameTimer.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${cents.toString().padStart(2, '0')}`;
    } else if (gameState === 'finished') {
        snails.forEach(snail => { 
            if (snail.isDead) Simulation.updateDeathAnimation(snail, CONFIG.DT, CONFIG.TRACK_HEIGHT); 
        });
    }
}

function updateSeesawLogic() {
    if (Math.random() < 0.01) seesawTarget = (Math.random() * 2) - 1;
    seesawValue += (seesawTarget - seesawValue) * 0.04;
    World.pivot.rotation.z = -seesawValue * (Math.PI / 12);
    seesawValDisplay.innerText = seesawValue.toFixed(2);
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
