import * as THREE from 'three';

export function createSnailMesh(color, type) {
    const snailGroup = new THREE.Group();
    const isSlippery = (type === 'A');

    // 1. 껍질
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

    // 2. 몸체
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

    // 3. 눈
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

    return { group: snailGroup, shell: shellGroup, body, pupils };
}

export function createAngelMesh() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ 
        color: 0xfffae0, emissive: 0xffd700, emissiveIntensity: 0.6,
        transparent: true, opacity: 0.9, flatShading: true
    });
    const body = new THREE.Mesh(new THREE.ConeGeometry(4, 12, 8), bodyMat);
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(2.5, 16, 16), bodyMat);
    head.position.y = 7;
    group.add(head);

    const wingGeo = new THREE.CircleGeometry(6, 4);
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
    const w1 = new THREE.Mesh(wingGeo, wingMat);
    w1.position.set(-4, 4, -2); w1.rotation.y = -0.4;
    group.add(w1);
    const w2 = new THREE.Mesh(wingGeo, wingMat);
    w2.position.set(4, 4, -2); w2.rotation.y = 0.4;
    group.add(w2);

    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.3, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffff00 }));
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, 11, 0);
    group.add(halo);

    const light = new THREE.SpotLight(0xffdd00, 150, 150, 0.2, 0.4, 1);
    light.position.set(0, 5, 0);
    light.target.position.set(0, -50, 0);
    group.add(light);
    group.add(light.target);

    return group;
}

export function updateSnailPhysics(snail, params) {
    const { dt, seesawValue, goalDistance, trackHeight, baseSpeedMean, speedVariance, conditionInterval, conditionSmoothing } = params;
    
    snail.conditionTimer -= dt;
    if (snail.conditionTimer <= 0) {
        snail.targetBaseSpeed = baseSpeedMean + (Math.random() * 2 - 1) * speedVariance;
        snail.conditionTimer = conditionInterval * (0.5 + Math.random());
    }
    snail.currentBaseSpeed += (snail.targetBaseSpeed - snail.currentBaseSpeed) * conditionSmoothing;

    // --- 기본 속도에 천사 버프 적용 ---
    let effectiveBaseSpeed = snail.currentBaseSpeed;
    if (params.isAngelActive && params.isTarget && params.angelAnimTimer > 0.2) {
        effectiveBaseSpeed *= params.boostMultiplier;
    }

    // 최종 속도 = (버프된 기본 속도) + (지형 영향)
    const finalVelocity = effectiveBaseSpeed + (seesawValue * snail.sensitivity);
    
    snail.speed = finalVelocity;
    snail.position += finalVelocity * dt;
    if (snail.position < 0) snail.position = 0;

    // 시각적 업데이트
    snail.mesh.position.x = snail.position - (goalDistance / 2);
    snail.mesh.position.y = (trackHeight / 2);
    
    const crawlFrequency = 0.15;
    const crawlCycle = Math.sin(snail.position * crawlFrequency);
    
    const stretchIntensity = snail.type === 'A' ? 0.5 : 0.25; 
    const baseStretch = 1 + (finalVelocity / (snail.type === 'A' ? 40 : 80));
    const rhythmicStretch = crawlCycle * stretchIntensity;
    
    const finalStretch = Math.max(0.5, baseStretch + rhythmicStretch);
    snail.body.scale.set(1, finalStretch, 1); 
    
    snail.shell.position.x = -1.5 + (crawlCycle * 0.7); 
    snail.shell.rotation.z = -finalVelocity * 0.01 - (crawlCycle * 0.1);

    snail.pupils.forEach(p => {
        const time = performance.now() * 0.01;
        p.position.x = 0.4 + Math.sin(time) * 0.05 + (crawlCycle * 0.1);
    });
}

export function updateDeathAnimation(snail, dt, trackHeight) {
    snail.deathAnim = Math.min(1, snail.deathAnim + 0.06);
    snail.mesh.rotation.x = snail.deathAnim * (Math.PI / 2.1);
    snail.mesh.position.y = (trackHeight / 2) + (snail.deathAnim * 2.0);
    snail.mesh.scale.y = 1 - (snail.deathAnim * 0.7);
    snail.pupils.forEach(p => p.material.color.set(0x000000));
}

export function createSlimeTrail(snail, track, trackHeight, goalDistance) {
    if (Math.random() < 0.2) {
        const trail = new THREE.Mesh(
            new THREE.PlaneGeometry(3, 4), 
            new THREE.MeshBasicMaterial({ color: snail.color, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
        );
        trail.rotation.x = -Math.PI / 2;
        trail.position.set(snail.position - (goalDistance / 2) - 4, trackHeight / 2 + 0.02, snail.mesh.position.z);
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
export function checkAngelEvent(snails, goalDistance, angelState, config) {
    if (angelState.triggered || snails.length === 0) return;

    const maxPos = Math.max(...snails.map(s => s.position));
    // 대소문자 수정: triggerDistanceRatio -> TRIGGER_DISTANCE_RATIO
    if (maxPos / goalDistance >= config.TRIGGER_DISTANCE_RATIO) {
        if (Math.random() > config.EVENT_TRIGGER_CHANCE) return; 

        angelState.triggered = true; 
        
        const sorted = [...snails].sort((a, b) => a.position - b.position);
        // 대소문자 수정: bottomRankRatio -> BOTTOM_RANK_RATIO
        const bottomCount = Math.max(1, Math.ceil(snails.length * config.BOTTOM_RANK_RATIO));
        const candidates = sorted.slice(0, bottomCount);
        
        // 대소문자 수정: selectionRatio -> SELECTION_RATIO
        angelState.targets = candidates.filter(() => Math.random() < config.SELECTION_RATIO);
        
        if (angelState.targets.length > 0) {
            angelState.active = true;
            angelState.animTimer = 0;
            return true; 
        }
    }
    return false;
}

const _worldPos = new THREE.Vector3();
export function updateAngelAnimation(angelState, dt, scene, boostDuration) {
    if (!angelState.active) return;
    
    angelState.animTimer += dt;
    const t = angelState.animTimer;
    
    const descentTime = 0.3; 
    const ascentTime = 0.3;  
    
    let targetYOffset;
    if (t < descentTime) { 
        targetYOffset = THREE.MathUtils.lerp(300, 45, t / descentTime);
    } else if (t < boostDuration + descentTime) { 
        targetYOffset = 45 + Math.sin(t * 3) * 2;
    } else { 
        const ascendT = (t - (boostDuration + descentTime)) / ascentTime;
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

    angelState.targets.forEach(snail => {
        if (snail.angelMesh) {
            snail.mesh.getWorldPosition(_worldPos);
            snail.angelMesh.position.copy(_worldPos);
            snail.angelMesh.position.y += targetYOffset;
        }
    });
}
