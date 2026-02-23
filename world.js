import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export let scene, camera, renderer, pivot, track, fulcrum, controls;

export function initWorld(containerId, goalDistance, trackWidth, trackHeight, trackBuffer) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    scene.fog = new THREE.Fog(0xf1f5f9, 300, 1500);

    const width = window.innerWidth;
    const height = window.innerHeight;
    camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 10000);
    camera.position.set(100, 180, 350);
    camera.lookAt(goalDistance / 2, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById(containerId).appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(goalDistance / 2, 0, 0);

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
    pivot.position.set(goalDistance / 2, 0, 0);
    scene.add(pivot);

    const fulcrumMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.4, roughness: 0.3 });
    fulcrum = new THREE.Mesh(new THREE.CylinderGeometry(5, 15, 30, 4), fulcrumMat);
    fulcrum.position.set(goalDistance / 2, -16.5, 0);
    scene.add(fulcrum);
    
    const joint = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, trackWidth + 20, 32), fulcrumMat);
    joint.rotation.x = Math.PI / 2;
    joint.position.set(goalDistance/2, -2.5, 0);
    scene.add(joint);

    const trackLength = goalDistance + (trackBuffer * 2);
    track = new THREE.Mesh(new THREE.BoxGeometry(trackLength, trackHeight, trackWidth), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 }));
    track.position.set(0, -trackHeight / 2, 0);
    track.receiveShadow = true;
    pivot.add(track);

    addTrackLines(goalDistance, trackWidth, trackHeight, trackLength);

    window.addEventListener('resize', onWindowResize);
}

function addTrackLines(goalDistance, trackWidth, trackHeight, trackLength) {
    const startLine = new THREE.Mesh(new THREE.PlaneGeometry(5, trackWidth), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.5 }));
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.set(-goalDistance / 2, trackHeight / 2 + 0.02, 0);
    track.add(startLine);

    const goalLine = new THREE.Mesh(new THREE.PlaneGeometry(8, trackWidth), new THREE.MeshStandardMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.3 }));
    goalLine.rotation.x = -Math.PI / 2;
    goalLine.position.set(goalDistance / 2, trackHeight / 2 + 0.02, 0);
    track.add(goalLine);

    for(let i = -10; i <= 20; i++) {
        const xPos = i * 25 - (goalDistance / 2);
        if (xPos > -trackLength/2 && xPos < trackLength/2) {
            const line = new THREE.Mesh(new THREE.PlaneGeometry(0.3, trackWidth), new THREE.MeshBasicMaterial({ color: 0xf1f5f9 }));
            line.rotation.x = -Math.PI / 2;
            line.position.set(xPos, trackHeight / 2 + 0.01, 0);
            track.add(line);
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
