// 1. CONSTANTS (SYSTEM CONFIGS)
const GOAL = 100.0;
const DT = 0.016; // 60 FPS
const BASE_SPEED_MEAN = 10.0;
const SPEED_VARIANCE = 3.0;

const SNAIL_TYPES = {
    A: { 
        name: 'GAMBLER', 
        sensitivity: 20.0, 
        desc: 'HIGH_VOLATILITY', 
        code: 'H_RISK' 
    },
    B: { 
        name: 'STEADY', 
        sensitivity: 5.0, 
        desc: 'LOW_VARIANCE', 
        code: 'STABLE' 
    }
};

const DEFAULT_COLORS = ['#10b981', '#f43f5e', '#f59e0b', '#3b82f6', '#8b5cf6'];

// 2. STATE VARIABLES
let snails = [];
let seesawValue = 0.0;
let targetSeesaw = 0.0;
let isRacing = false;

// DOM
const setupScreen = document.getElementById('setup-screen');
const raceScreen = document.getElementById('race-screen');
const snailCountInput = document.getElementById('snail-count');
const snailConfigs = document.getElementById('snail-configs');
const trackContainer = document.getElementById('track-container');
const seesawIndicator = document.getElementById('seesaw-indicator');
const seesawStatus = document.getElementById('seesaw-status');

// 3. UI GENERATOR: SETUP
function generateSnailInputs() {
    let count = parseInt(snailCountInput.value) || 2;
    if (count > 5) { count = 5; snailCountInput.value = 5; }
    if (count < 1) { count = 1; snailCountInput.value = 1; }
    
    snailConfigs.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const row = document.createElement('div');
        row.className = 'grid grid-cols-12 gap-2 text-[10px] border border-emerald-900/50 p-3 bg-emerald-950/10 hover:border-emerald-600 transition-colors';
        row.innerHTML = `
            <div class="col-span-1 flex items-center justify-center font-bold text-emerald-800">#${i+1}</div>
            <input type="text" placeholder="NAME (RANDOM)" class="col-span-4 bg-black border border-emerald-900 p-2 focus:border-emerald-500 outline-none uppercase text-emerald-300">
            <input type="color" value="${DEFAULT_COLORS[i % DEFAULT_COLORS.length]}" class="col-span-2 w-full h-full bg-black border border-emerald-900 p-1 cursor-pointer">
            <select class="col-span-5 bg-black border border-emerald-900 p-2 focus:border-emerald-500 outline-none uppercase text-xs">
                <option value="A" ${i % 2 === 0 ? 'selected' : ''}>TYPE_A (H_RISK)</option>
                <option value="B" ${i % 2 !== 0 ? 'selected' : ''}>TYPE_B (STABLE)</option>
            </select>
        `;
        snailConfigs.appendChild(row);
    }
}

snailCountInput.addEventListener('change', generateSnailInputs);
generateSnailInputs();

// 4. RACE CORE LOGIC
document.getElementById('start-race-btn').addEventListener('click', () => {
    const configRows = snailConfigs.children;
    snails = [];
    trackContainer.innerHTML = '';

    const randomNames = ["CODER", "HACKER", "SHELL", "KERNEL", "ROOT", "ADMIN", "SNAIL_X", "NULL", "VOID"];

    for (let i = 0; i < configRows.length; i++) {
        const row = configRows[i];
        const nameInput = row.querySelector('input[type="text"]');
        const colorInput = row.querySelector('input[type="color"]');
        const typeSelect = row.querySelector('select');

        const name = nameInput.value.trim() || randomNames[Math.floor(Math.random() * randomNames.length)] + "_" + (i+1);
        const color = colorInput.value;
        const typeKey = typeSelect.value;
        
        const snailObj = {
            name: name.toUpperCase(),
            color: color,
            type: SNAIL_TYPES[typeKey],
            pos: 0.0,
            el: null
        };

        // Track UI
        const track = document.createElement('div');
        track.className = 'relative h-16 border-b border-emerald-950 track-line flex items-center overflow-visible';
        track.innerHTML = `
            <div id="snail-unit-${i}" class="absolute transition-all duration-[16ms] linear flex flex-col items-center z-10" style="left: 0; color: ${color}">
                <div class="px-1 border border-current bg-black text-[9px] font-black mb-1 whitespace-nowrap shadow-[0_0_5px_currentColor]">
                    ${snailObj.name} [${snailObj.type.code}]
                </div>
                <div class="text-3xl filter drop-shadow-[0_0_2px_currentColor]">🐌</div>
            </div>
            <div class="absolute right-0 top-0 bottom-0 w-1 bg-emerald-900/10 border-r border-emerald-500/20 pointer-events-none"></div>
        `;
        trackContainer.appendChild(track);
        snailObj.el = track.querySelector(`#snail-unit-${i}`);
        snails.push(snailObj);
    }

    setupScreen.classList.add('hidden');
    raceScreen.classList.remove('hidden');
    isRacing = true;
    requestAnimationFrame(loop);
});

function loop() {
    if (!isRacing) return;

    // A. ENVIRONMENT: SEESAW RANDOM WALK
    // 1% chance to pick new target, or when target reached
    if (Math.abs(seesawValue - targetSeesaw) < 0.05 || Math.random() < 0.015) {
        targetSeesaw = (Math.random() * 2) - 1.0;
    }
    // Interpolate smoothly
    seesawValue += (targetSeesaw - seesawValue) * 0.04;
    
    // UI Seesaw Update
    const visualWidth = Math.abs(seesawValue) * 50;
    seesawIndicator.style.width = `${visualWidth}%`;
    seesawIndicator.style.left = seesawValue >= 0 ? '50%' : `${50 - visualWidth}%`;
    seesawIndicator.style.backgroundColor = seesawValue >= 0 ? '#10b981' : '#f43f5e';
    
    const statusText = seesawValue >= 0 ? 'ENVIRONMENT_DOWNGRADE_ADVANTAGE' : 'ENVIRONMENT_UPGRADE_FRICTION';
    seesawStatus.innerText = `BIAS: ${seesawValue.toFixed(4)} | LOG: ${statusText}`;

    // B. PHYSICS: SNAIL MOVEMENT
    let winner = null;
    snails.forEach(s => {
        // Condition: 10.0 +/- 3.0
        const base = (BASE_SPEED_MEAN - SPEED_VARIANCE) + (Math.random() * (SPEED_VARIANCE * 2));
        
        // Final Velocity = Base + (Seesaw * Sensitivity)
        const velocity = base + (seesawValue * s.type.sensitivity);
        
        s.pos += velocity * DT;
        if (s.pos < 0) s.pos = 0; // Clamping

        // Visual State Feedback
        if (velocity > 25) {
            s.el.className = 'absolute snail-boost z-20';
        } else if (velocity < 2) {
            s.el.className = 'absolute snail-struggle';
        } else {
            s.el.className = 'absolute z-10';
        }

        // Render (Leave space at the end)
        const renderPos = (s.pos / GOAL) * 90;
        s.el.style.left = `${Math.min(renderPos, 90)}%`;

        if (s.pos >= GOAL && !winner) winner = s;
    });

    if (winner) {
        isRacing = false;
        setTimeout(() => announceWinner(winner), 500);
        return;
    }

    requestAnimationFrame(loop);
}

function announceWinner(winner) {
    const overlay = document.getElementById('result-overlay');
    const announce = document.getElementById('winner-announce');
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    announce.innerText = `>> ${winner.name}_WIN`;
    announce.style.color = winner.color;
    announce.style.textShadow = `0 0 30px ${winner.color}88`;
}
