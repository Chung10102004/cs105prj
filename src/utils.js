// src/utils.js
import * as THREE from 'three';

let idCounter = 0;
export function generateId(prefix = 'id') {
    return `${prefix}_${idCounter++}`;
}

export function getMouseWorldCoordinates(event, camera, renderTarget) {
    if (!camera || !renderTarget) return null;

    const rect = renderTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const mouse = new THREE.Vector2();
    mouse.x = (x / renderTarget.offsetWidth) * 2 - 1;
    mouse.y = -(y / renderTarget.offsetHeight) * 2 + 1;

    if (camera.isOrthographicCamera) {
        const vec = new THREE.Vector3(mouse.x, mouse.y, -1); // or 0 or (camera.near + camera.far) / (camera.near - camera.far)
        vec.unproject(camera); 
        return new THREE.Vector2(vec.x, vec.y);
    } else if (camera.isPerspectiveCamera) {
        // For PerspectiveCamera, you'd typically raycast to a plane
        // This example assumes you want coordinates on the XY plane (z=0)
        // This might not be what you want if your BuildMode isn't strictly 2D on Z=0 plane.
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // XY plane at Z=0
        const intersectPoint = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, intersectPoint)) {
            return new THREE.Vector2(intersectPoint.x, intersectPoint.y);
        }
        return null; // Ray doesn't intersect the plane
    }
    return null;
}

export function snapToGrid(value, gridSize) {
    if (gridSize <= 0) return value;
    return Math.round(value / gridSize) * gridSize;
}