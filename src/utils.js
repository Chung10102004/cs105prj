import *
as THREE from 'three';

const vec = new THREE.Vector3();

export function getMouseWorldCoordinates(event, camera, renderTargetElement) {
    const rect = renderTargetElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    vec.set(
        (x / renderTargetElement.offsetWidth) * 2 - 1,
        -(y / renderTargetElement.offsetHeight) * 2 + 1,
        0.5 // z doesn't matter for orthographic unproject for xy plane
    );
    vec.unproject(camera);
    // Assuming camera is looking along Z, and no rotation other than default
    return new THREE.Vector2(vec.x, vec.y);
}

export function snapToGrid(value, gridSize) {
    return Math.round(value / gridSize) * gridSize;
}

// Simple unique ID generator
let _idCounter = 0;
export function generateId() {
    return _idCounter++;
}