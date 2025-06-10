// src/SimulationMode.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCamera } from './camera.js'; // Đảm bảo đường dẫn này đúng


// Constants
const DECK_MEMBER_COLOR = 0x0077cc;     // Color for roadway/deck members (formerly MEMBER_COLOR)
const COLUMN_MEMBER_COLOR = 0xccaa00;   // Color for support column members (formerly SUPPORT_COLOR, works well if columns are yellowish)
const JOINT_RADIUS = 0.5;
const DECK_MEMBER_THICKNESS_RADIUS = 0.3; // Thickness for deck members (formerly MEMBER_THICKNESS_RADIUS)
const COLUMN_MEMBER_THICKNESS_RADIUS = 0.20; // Thickness for column members (formerly SUPPORT_THICKNESS_RADIUS, making it a bit more substantial)

const GRAVITY = 9.8 * 0.5;
const INITIAL_CAR_Z_PADDING = 0.05;

const FRONT_RAY_LENGTH_FACTOR = 0.7;
const FRONT_RAY_Y_OFFSET_FROM_BOTTOM = 0.03;
const FRONT_OBSTACLE_ANGLE_THRESHOLD = Math.PI / 3.5;

export class SimulationMode {
constructor(renderTargetElement, bridgeData) {
console.log("SimulationMode Constructor: Initializing...");
this.renderTarget = renderTargetElement;
this.bridgeData = bridgeData;

this.scene = new THREE.Scene();
    this.cameraControls = null;
    this.camera = null;
    this.renderer = null;

    this.isActive = false;
    this.mapModel = null;
    this.boatModel = null;
    this.car = null;

    this.carSpeed = 3.0;
    this.carZMin = 0;
    this.carZMax = 0;
    this.carWidth = 0.25;
    this.carHeight = 0.2;
    this.carDepth = 0.5;
    this.initialCarX = 0;

    this.isCarFalling = false;
    this.verticalVelocity = 0;
    this.hasCarCompletedRun = false;
    this.isCarRunning = false;

    this.isBoatMoving = false;
    this.hasBoatCompletedRun = false;
    this.boatSpeed = 2.0;
    this.initialBoatX = 0;
    this.boatTargetX = 0;

    this.raycaster = new THREE.Raycaster(); // For ground detection
    this.rayOriginOffset = new THREE.Vector3(0, this.carHeight / 1.8, 0);
    this.rayDirection = new THREE.Vector3(0, -1, 0);

    this.frontRaycaster = new THREE.Raycaster(); // For front obstacle detection

    this.bridgeMeshes = [];

    this.deckMaterial3D = null;     // Initialize here
    this.columnMaterial3D = null;   // Initialize here
    this.jointMaterial3D = null;    // Initialize here for joints

    this.initSceneAndCamera();
    this.initMaterials(); // Initialize materials once
    this.loadMapModel();
}

setRenderer(renderer) {
    this.renderer = renderer;
}

initSceneAndCamera() {
    this.scene.background = new THREE.Color(0x777777);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(10, 20, 15);
    this.scene.add(directionalLight);

    if (typeof createCamera === 'function') {
        this.cameraControls = createCamera(this.renderTarget);
        this.camera = this.cameraControls.camera;
    } else {
        console.error("SimulationMode: createCamera is not a function. Using default.");
        const width = this.renderTarget.offsetWidth;
        const height = this.renderTarget.offsetHeight;
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.set(0, 10, 15);
        this.camera.lookAt(0, 0, 0);
    }
}

initMaterials() {
    this.jointMaterial3D = new THREE.MeshStandardMaterial({ 
        color: 0xcccccc, // Color for joints
        metalness: 0.5, 
        roughness: 0.5 
    });
    this.deckMaterial3D = new THREE.MeshStandardMaterial({ 
        color: DECK_MEMBER_COLOR, 
        metalness: 0.5, 
        roughness: 0.5 
    });
    this.columnMaterial3D = new THREE.MeshStandardMaterial({ 
        color: COLUMN_MEMBER_COLOR, 
        metalness: 0.5, 
        roughness: 0.5 
    });
}


loadMapModel() {
    const loader = new GLTFLoader();
    loader.load(
        './models/Untitled1.gltf', // Đảm bảo model map của bạn ở đây
        (gltf) => {
            if (!gltf || !gltf.scene || !(gltf.scene instanceof THREE.Object3D)) {
                console.error("GLTF map loaded, but gltf.scene is invalid.", gltf);
                this.showErrorToUser("Failed to load map model: Invalid scene data.");
            } else {
                this.mapModel = gltf.scene;
                this.scene.add(this.mapModel);
                this.mapModel.scale.set(0.25, 0.25, 0.25);
                this.mapModel.updateMatrixWorld(true);
                this.mapModel.traverse(node => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }});
                console.log("SimulationMode: Map GLTF model processed.");
            }
            this.addCar();
            this.buildBridge3D(); // Build bridge after map, so bridgeBaseY can be accurate
            this.loadBoatModel();
        },
        (xhr) => { console.log(`SimulationMode: Map GLTF model ${(xhr.loaded / xhr.total * 100).toFixed(2)}% loaded`); },
        (error) => {
            console.error('SimulationMode: Map GLTF loading FAILED.', error);
            this.showErrorToUser(`Failed to load map model: ${error.message || 'Unknown error'}.`);
            this.addCar();
            this.buildBridge3D();
            this.loadBoatModel();
        }
    );
}

loadBoatModel() {
    const loader = new GLTFLoader();
    loader.load(
        './models/boatttt.gltf', 
        (gltf) => {
            if (!gltf || !gltf.scene || !(gltf.scene instanceof THREE.Object3D)) {
                console.error("GLTF boat loaded, but gltf.scene is invalid.", gltf);
                this.showErrorToUser("Failed to load boat model: Invalid scene data.");
            } else {
                this.boatModel = gltf.scene;
                this.scene.add(this.boatModel);
                let mapCenterForBoat = new THREE.Vector3(0,0,0);
                let mapTopYForBoat = 0;
                if (this.mapModel) {
                    this.mapModel.updateMatrixWorld(true);
                    const mapBoundingBox = new THREE.Box3().setFromObject(this.mapModel);
                    if (!mapBoundingBox.isEmpty()) {
                        mapBoundingBox.getCenter(mapCenterForBoat);
                        mapTopYForBoat = mapBoundingBox.max.y;
                    }
                }
                this.boatModel.scale.set(0.15, 0.15, 0.1);
                this.boatModel.rotation.set(0, Math.PI / 2, 0);
                this.boatModel.updateMatrixWorld(true);
                const boatBoundingBox = new THREE.Box3().setFromObject(this.boatModel);
                let pivotToBottomOffsetY = boatBoundingBox.isEmpty() ? 0 : boatBoundingBox.min.y;
                this.boatModel.position.x = mapCenterForBoat.x + 1.3;
                this.boatModel.position.z = mapCenterForBoat.z - 0.2;
                this.boatModel.position.y = mapTopYForBoat - pivotToBottomOffsetY - 1.3;
                this.initialBoatX = this.boatModel.position.x;
                this.boatTargetX = this.initialBoatX - 3;
                this.boatModel.updateMatrixWorld(true);
                this.boatModel.traverse(node => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }});
                console.log("SimulationMode: Boat GLTF model processed and positioned.");
            }
            this.resetSequence(); 
        },
        (xhr) => { console.log(`SimulationMode: Boat GLTF model ${(xhr.loaded / xhr.total * 100).toFixed(2)}% loaded`); },
        (error) => {
            console.error('SimulationMode: Boat GLTF loading FAILED.', error);
            this.showErrorToUser(`Failed to load boat model: ${error.message || 'Unknown error'}.`);
            this.resetSequence();
        }
    );
}

showErrorToUser(message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'absolute'; errorDiv.style.top = '10px'; errorDiv.style.left = '10px';
    errorDiv.style.padding = '10px'; errorDiv.style.backgroundColor = 'red'; errorDiv.style.color = 'white';
    errorDiv.style.zIndex = '1000'; errorDiv.textContent = message;
    this.renderTarget.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 10000);
}

addCar() {
    if (this.car) {
        this.scene.remove(this.car);
        if (this.car.geometry) this.car.geometry.dispose();
        if (this.car.material) this.car.material.dispose();
        this.car = null;
    }
    const carGeometry = new THREE.BoxGeometry(this.carWidth, this.carHeight, this.carDepth);
    const carMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.3, roughness: 0.7 });
    this.car = new THREE.Mesh(carGeometry, carMaterial);
    this.car.castShadow = true;
    this.scene.add(this.car);

    const modelBoundingBox = new THREE.Box3();
    const modelCenter = new THREE.Vector3(0,0,0);
    if (this.mapModel) {
        this.mapModel.updateMatrixWorld(true);
        modelBoundingBox.setFromObject(this.mapModel, true);
    }
    if (!modelBoundingBox.isEmpty()) {
        modelBoundingBox.getCenter(modelCenter);
    }

    const mapSizeZ = modelBoundingBox.isEmpty() ? 10 : (modelBoundingBox.max.z - modelBoundingBox.min.z);
    if (mapSizeZ < this.carDepth + 2 * INITIAL_CAR_Z_PADDING + 0.1) {
        this.carZMin = modelCenter.z - Math.max(1, mapSizeZ / 2 - this.carDepth/2 - INITIAL_CAR_Z_PADDING);
        this.carZMax = modelCenter.z + Math.max(1, mapSizeZ / 2 - this.carDepth/2 - INITIAL_CAR_Z_PADDING);
    } else {
        this.carZMin = modelBoundingBox.min.z + (this.carDepth / 2) + INITIAL_CAR_Z_PADDING;
        this.carZMax = modelBoundingBox.max.z - (this.carDepth / 2) - INITIAL_CAR_Z_PADDING;
    }
    if (this.carZMin >= this.carZMax) {
        this.carZMax = this.carZMin + Math.max(1, this.carDepth * 2);
    }
    this.initialCarX = modelCenter.x;
    console.log(`SimulationMode: Car created. Z-Bounds: [${this.carZMin.toFixed(2)}, ${this.carZMax.toFixed(2)}]`);
}

updateCarVerticalPosition(isInitialOrResetSetup = false) {
    if (!this.car) return;
    this.car.updateMatrixWorld();
    let rayOriginVec, rayFarDistance;
    if (isInitialOrResetSetup) {
        rayOriginVec = this.car.position.clone();
        rayOriginVec.y += this.carHeight; 
        rayFarDistance = this.carHeight * 2 + 10; 
    } else {
        rayOriginVec = this.car.position.clone().add(this.rayOriginOffset);
        rayFarDistance = this.rayOriginOffset.y + (this.carHeight / 2) + 0.2;
    }
    this.raycaster.set(rayOriginVec, this.rayDirection);
    this.raycaster.near = 0.01; this.raycaster.far = rayFarDistance;
    const objectsToIntersect = [];
    if (this.mapModel) { this.mapModel.updateMatrixWorld(true); objectsToIntersect.push(this.mapModel); }
    // Add bridge deck members to raycasting for car ground detection
    this.bridgeMeshes.forEach(mesh => {
        if (mesh.userData && mesh.userData.isDeckMember) { // Check for a flag indicating it's a deck member
            objectsToIntersect.push(mesh);
        }
    });

    let onGround = false;
    if (objectsToIntersect.length > 0) {
        const intersects = this.raycaster.intersectObjects(objectsToIntersect, true);
        if (intersects.length > 0) {
            let closestValidIntersection = null;
            for (const hit of intersects) { if (hit.object.uuid !== this.car.uuid && hit.object.visible) { closestValidIntersection = hit; break; } }
            if (closestValidIntersection) {
                this.car.position.y = closestValidIntersection.point.y + (this.carHeight / 2);
                this.isCarFalling = false; this.verticalVelocity = 0; onGround = true;
            }
        }
    }
    if (!onGround) {
        if (isInitialOrResetSetup) {
            let defaultY = this.carHeight / 2;
            if (this.mapModel) {
                const mapBox = new THREE.Box3().setFromObject(this.mapModel);
                if (!mapBox.isEmpty()) defaultY = mapBox.max.y + this.carHeight / 2 + 0.1;
            }
            this.car.position.y = defaultY;
            this.isCarFalling = false; this.verticalVelocity = 0;
        } else { this.isCarFalling = true; }
    }
    this.car.updateMatrixWorld();
}


buildBridge3D() {
    if (!this.bridgeData) {
        console.warn("SimulationMode: No bridge data to build.");
        return;
    }
    this.bridgeMeshes.forEach(mesh => {
        if (mesh.geometry) mesh.geometry.dispose();
        this.scene.remove(mesh);
    });
    this.bridgeMeshes = [];

    const { joints, elements } = this.bridgeData; 
    if (!joints || !elements) {
        console.warn("SimulationMode: Invalid joints or elements in bridge data.");
        return;
    }

    // --- START: Điều chỉnh vị trí cầu ---
    // Thay đổi các giá trị này để dịch chuyển toàn bộ cây cầu
    // so với vị trí tính toán mặc định (dựa trên tâm map và chiều cao map).
    const bridgePlacementOffsetX = 30.0; // Dịch chuyển cầu theo trục X (trái/phải)
    const bridgePlacementOffsetY = -1.0; // Dịch chuyển cầu theo trục Y (lên/xuống)
    const bridgePlacementOffsetZ = 0.0; // Dịch chuyển cầu theo trục Z (tiến/lùi)
    // --- END: Điều chỉnh vị trí cầu ---

    let bridgeBaseY = .0; // Default base Y cho cầu (tâm của joints và elements)
    const mapCenter = new THREE.Vector3(0, 0, 0); // Trung tâm X, Z của map để đặt cầu
    // let mapScaleFactor = 1.0; // Hiện không được sử dụng, nhưng để lại nếu cần

    if (this.mapModel) {
        this.mapModel.updateMatrixWorld(true); 
        const mapBox = new THREE.Box3().setFromObject(this.mapModel);
        if (!mapBox.isEmpty()) {
            // Đặt TÂM của các joint/element cầu cao hơn điểm cao nhất của map một chút
            bridgeBaseY = mapBox.max.y + 0.5; 
            mapBox.getCenter(mapCenter);   
            // mapScaleFactor = this.mapModel.scale.x; 
        } else {
            console.warn("SimulationMode: Map model bounding box is empty. Using default bridge placement.");
        }
    } else {
        console.warn("SimulationMode: Map model not loaded, bridge placement might be off. Using default bridge placement.");
    }

    // Áp dụng offset Y cho độ cao cơ sở của cầu
    bridgeBaseY += bridgePlacementOffsetY;

    console.log(`SimulationMode: Building bridge. Calculated BaseY (center of joints/elements): ${bridgeBaseY.toFixed(2)}, MapCenter for bridge origin: (${mapCenter.x.toFixed(2)}, ${mapCenter.y.toFixed(2)}, ${mapCenter.z.toFixed(2)})`);
    console.log(`SimulationMode: Applied Offsets: X=${bridgePlacementOffsetX}, Y=${bridgePlacementOffsetY}, Z=${bridgePlacementOffsetZ}`);


    joints.forEach(jointData => {
        const geo = new THREE.SphereGeometry(JOINT_RADIUS, 16, 16);
        const mesh = new THREE.Mesh(geo, this.jointMaterial3D);
        mesh.castShadow = true; mesh.receiveShadow = true;
        
        // Tọa độ X từ BuildMode -> X trong 3D, dịch chuyển theo mapCenter.x và offset X
        // Tọa độ Y từ BuildMode -> Z trong 3D (độ sâu), dịch chuyển theo mapCenter.z và offset Z
        // Chiều cao Y trong 3D được xác định bởi bridgeBaseY (đã bao gồm offset Y)
        const posX = mapCenter.x + jointData.x + bridgePlacementOffsetX;
        const posY = bridgeBaseY; // Đây là Y của TÂM joint
        const posZ = mapCenter.z + jointData.y + bridgePlacementOffsetZ;

        mesh.position.set(posX, posY, posZ);
        // console.log(`  Joint ${jointData.id}: BuildMode(${jointData.x}, ${jointData.y}) -> SimMode(${posX.toFixed(2)}, ${posY.toFixed(2)}, ${posZ.toFixed(2)})`);

        this.scene.add(mesh); this.bridgeMeshes.push(mesh);
    });

    elements.forEach(el => {
        const j1Data = joints.find(j => j.id === el.joint1_id);
        const j2Data = joints.find(j => j.id === el.joint2_id);

        if (j1Data && j2Data) {
            // Tính toán vị trí điểm đầu và cuối của member, áp dụng các offset
            const p1 = new THREE.Vector3(
                mapCenter.x + j1Data.x + bridgePlacementOffsetX,
                bridgeBaseY, // Đây là Y của ĐƯỜNG TÂM element
                mapCenter.z + j1Data.y + bridgePlacementOffsetZ
            );
            const p2 = new THREE.Vector3(
                mapCenter.x + j2Data.x + bridgePlacementOffsetX,
                bridgeBaseY, // Đây là Y của ĐƯỜNG TÂM element
                mapCenter.z + j2Data.y + bridgePlacementOffsetZ
            );

            let materialToUse;
            let thicknessToUse;
            let isDeck = false;

            if (el.materialType === 'yellow') {
                materialToUse = this.columnMaterial3D;
                thicknessToUse = COLUMN_MEMBER_THICKNESS_RADIUS;
            } else { // Mặc định là deck member nếu không phải 'yellow'
                materialToUse = this.deckMaterial3D;
                thicknessToUse = DECK_MEMBER_THICKNESS_RADIUS;
                isDeck = true;
                if (el.materialType !== 'blue' && el.materialType !== undefined && el.materialType !== 'wood') {
                    console.warn(`SimulationMode: Element ${el.id} has materialType "${el.materialType}", defaulting to deck.`);
                }
            }

            const curve = new THREE.LineCurve3(p1, p2);
            const tubeGeo = new THREE.TubeGeometry(curve, 2, thicknessToUse, 8, false);
            const mesh = new THREE.Mesh(tubeGeo, materialToUse);
            mesh.castShadow = true; mesh.receiveShadow = true;
            mesh.userData = { isBridgeElement: true, isDeckMember: isDeck, originalElementId: el.id };

            this.scene.add(mesh);
            this.bridgeMeshes.push(mesh);
        } else {
            console.warn(`SimulationMode: Could not find joints for element ${el.id}`);
        }
    });
    this.bridgeMeshes.forEach(mesh => mesh.updateMatrixWorld(true));
    console.log("SimulationMode: Bridge built with " + joints.length + " joints and " + elements.length + " elements.");
}

resetSequence() {
    if (this.car) {
        this.isCarRunning = false; this.hasCarCompletedRun = false; this.isCarFalling = false; this.verticalVelocity = 0;
        this.car.position.x = this.initialCarX;
        this.car.position.z = this.carZMin;
        
        let tempHighY = this.carHeight * 2 + 10; 
         if (this.mapModel) {
            this.mapModel.updateMatrixWorld(true);
            const modelBoundingBox = new THREE.Box3().setFromObject(this.mapModel, true);
            if (!modelBoundingBox.isEmpty()) {
                 tempHighY = modelBoundingBox.max.y + this.carHeight * 2 + 1; 
            }
        }
        if (this.bridgeMeshes.length > 0) {
             const bridgeBox = new THREE.Box3();
             this.bridgeMeshes.forEach(m => {
                m.updateMatrixWorld(true); // Ensure matrix world is up-to-date before expanding box
                bridgeBox.expandByObject(m);
            });
             if(!bridgeBox.isEmpty()) {
                tempHighY = Math.max(tempHighY, bridgeBox.max.y + this.carHeight * 2 + 1);
             }
        }
        this.car.position.y = tempHighY;
        this.car.updateMatrixWorld();
        this.updateCarVerticalPosition(true); 
    }
    if (this.boatModel) {
        this.boatModel.position.x = this.initialBoatX;
        this.boatModel.updateMatrixWorld(true);
    }
    this.isBoatMoving = false; this.hasBoatCompletedRun = false;
}

startSequence() {
    if (!this.car || !this.boatModel) { 
        console.warn("SimulationMode: Cannot start sequence, car or boat not ready.");
        return; 
    }
    this.resetSequence(); 
    this.isBoatMoving = true;
}

handlePlayReset() {
    if (this.isCarRunning || this.isBoatMoving || this.hasCarCompletedRun || this.hasBoatCompletedRun) {
        this.resetSequence();
    } else {
        this.startSequence();
    }
}

activate() {
    this.isActive = true;
    if (this.cameraControls && typeof this.cameraControls.onMouseDown === 'function') {
        this.boundOnMouseDown3D = this.onMouseDown3D.bind(this);
        this.boundOnMouseUp3D = this.onMouseUp3D.bind(this);
        this.boundOnMouseMove3D = this.onMouseMove3D.bind(this);
        this.renderTarget.addEventListener('mousedown', this.boundOnMouseDown3D);
        this.renderTarget.addEventListener('mouseup', this.boundOnMouseUp3D);
        this.renderTarget.addEventListener('mousemove', this.boundOnMouseMove3D);
        if (typeof this.cameraControls.onMouseWheel === 'function') {
            this.boundOnMouseWheel3D = this.onMouseWheel3D.bind(this);
            this.renderTarget.addEventListener('wheel', this.boundOnMouseWheel3D);
        }
    }
}

deactivate() {
    this.isActive = false; this.isCarRunning = false; this.isBoatMoving = false;
    if (this.cameraControls && typeof this.cameraControls.onMouseDown === 'function') {
        this.renderTarget.removeEventListener('mousedown', this.boundOnMouseDown3D);
        this.renderTarget.removeEventListener('mouseup', this.boundOnMouseUp3D);
        this.renderTarget.removeEventListener('mousemove', this.boundOnMouseMove3D);
        if (this.boundOnMouseWheel3D) {
            this.renderTarget.removeEventListener('wheel', this.boundOnMouseWheel3D);
        }
    }
}
onMouseDown3D(event) { if (this.isActive && this.cameraControls && this.cameraControls.onMouseDown) this.cameraControls.onMouseDown(event); }
onMouseUp3D(event) { if (this.isActive && this.cameraControls && this.cameraControls.onMouseUp) this.cameraControls.onMouseUp(event); }
onMouseMove3D(event) { if (this.isActive && this.cameraControls && this.cameraControls.onMouseMove) this.cameraControls.onMouseMove(event); }
onMouseWheel3D(event) { if (this.isActive && this.cameraControls && this.cameraControls.onMouseWheel) this.cameraControls.onMouseWheel(event); }

update(deltaTime) {
    if (!this.isActive || deltaTime <= 0) return;

    if (this.isBoatMoving && !this.hasBoatCompletedRun && this.boatModel) {
        const direction = Math.sign(this.boatTargetX - this.boatModel.position.x);
        const distanceToTarget = Math.abs(this.boatTargetX - this.boatModel.position.x);
        let moveDistance = this.boatSpeed * deltaTime;
        if (moveDistance >= distanceToTarget - 0.001) {
            this.boatModel.position.x = this.boatTargetX;
            this.isBoatMoving = false; this.hasBoatCompletedRun = true;
            if (this.car) {
                console.log("Boat finished, starting car.");
                this.isCarRunning = true; 
            }
        } else {
            this.boatModel.position.x += direction * moveDistance;
        }
        this.boatModel.updateMatrixWorld(true);
    }

    if (this.isCarRunning && !this.hasCarCompletedRun && this.car) {
        if (this.carZMin >= this.carZMax) { 
            console.warn("Car Z bounds invalid, stopping car.");
            this.isCarRunning = false; this.hasCarCompletedRun = true; return;
        }

        const currentCarSpeed = this.carSpeed;
        const totalDeltaZ = currentCarSpeed * deltaTime;
        let carMovedThisFrame = false;

        let shouldStopDueToFrontObstacle = false;
        if (this.mapModel && Math.abs(currentCarSpeed) > 0.01) { 
            this.mapModel.updateMatrixWorld(true);
            this.car.updateMatrixWorld();
            const carPosition = this.car.position.clone();
            const carMatrixWorld = this.car.matrixWorld.clone();

            const moveDirectionZ = Math.sign(currentCarSpeed);
            const forwardVector = new THREE.Vector3(0, 0, moveDirectionZ);
            
            const rayOriginsLocal = [
                new THREE.Vector3(0, FRONT_RAY_Y_OFFSET_FROM_BOTTOM - this.carHeight / 2, (this.carDepth / 2 - 0.01) * moveDirectionZ),
                new THREE.Vector3(this.carWidth / 2 * 0.85, FRONT_RAY_Y_OFFSET_FROM_BOTTOM - this.carHeight / 2, (this.carDepth / 2 - 0.01) * moveDirectionZ),
                new THREE.Vector3(-this.carWidth / 2 * 0.85, FRONT_RAY_Y_OFFSET_FROM_BOTTOM - this.carHeight / 2, (this.carDepth / 2 - 0.01) * moveDirectionZ)
            ];
            const rayLength = Math.max(0.05, this.carDepth * FRONT_RAY_LENGTH_FACTOR + Math.abs(totalDeltaZ));

            const frontObstacleCheckObjects = [this.mapModel];
            this.bridgeMeshes.forEach(mesh => {
                if (mesh.userData && mesh.userData.isBridgeElement && !mesh.userData.isDeckMember) { 
                    frontObstacleCheckObjects.push(mesh);
                }
            });


            for (const localOrigin of rayOriginsLocal) {
                if (shouldStopDueToFrontObstacle) break;
                const worldOrigin = localOrigin.clone().applyMatrix4(carMatrixWorld);

                this.frontRaycaster.set(worldOrigin, forwardVector);
                this.frontRaycaster.near = 0.01;
                this.frontRaycaster.far = rayLength;
                const intersects = this.frontRaycaster.intersectObjects(frontObstacleCheckObjects, true);

                if (intersects.length > 0) {
                    for (const hit of intersects) {
                        if (hit.object.uuid === this.car.uuid || !hit.object.visible) continue;

                        const carBottomY = carPosition.y - this.carHeight / 2;
                        const obstacleHitY = hit.point.y;
                        const faceNormal = hit.face.normal.clone();
                        const worldFaceNormal = faceNormal.transformDirection(hit.object.matrixWorld).normalize();
                        const angleWithVertical = worldFaceNormal.angleTo(new THREE.Vector3(0, 1, 0));

                        if (carBottomY < obstacleHitY + 0.02 && angleWithVertical > FRONT_OBSTACLE_ANGLE_THRESHOLD) {
                            console.log(`Car stopping: Front obstacle. carBottomY=${carBottomY.toFixed(2)} < obstacleHitY=${obstacleHitY.toFixed(2)}. Angle: ${THREE.MathUtils.radToDeg(angleWithVertical).toFixed(1)}`);
                            shouldStopDueToFrontObstacle = true;
                            this.hasCarCompletedRun = true; 
                            this.isCarRunning = false;
                            break;
                        }
                    }
                }
            }
        }
        
        if (!shouldStopDueToFrontObstacle) {
            this.car.position.z += totalDeltaZ;
            carMovedThisFrame = true;
        }
        if (carMovedThisFrame) this.car.updateMatrixWorld();


        if (this.hasCarCompletedRun) { /* Already stopped */ }
        else { 
            if (currentCarSpeed > 0 && this.car.position.z >= this.carZMax - 0.001) {
                this.car.position.z = this.carZMax;
                this.hasCarCompletedRun = true; this.isCarRunning = false;
                console.log("Car reached Z max.");
            } else if (currentCarSpeed < 0 && this.car.position.z <= this.carZMin + 0.001) {
                this.car.position.z = this.carZMin;
                this.hasCarCompletedRun = true; this.isCarRunning = false;
                console.log("Car reached Z min.");
            }
        }
    }

    if (this.car && (this.isCarRunning || this.isCarFalling || this.hasCarCompletedRun )) {
        this.updateCarVerticalPosition(false); 
        if (this.isCarFalling) {
            this.verticalVelocity -= GRAVITY * deltaTime;
            this.car.position.y += this.verticalVelocity * deltaTime;
        }
    }
    
    const minYPosition = -20; 
    if (this.car && this.car.position.y < minYPosition) {
        console.log("Car fell through world, resetting.");
        this.resetSequence();
    }
    if (this.car) this.car.updateMatrixWorld(); 
}

render() {
    if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
    }
}

dispose() {
    this.deactivate();
    if (this.car) {
        if (this.car.geometry) this.car.geometry.dispose();
        if (this.car.material) this.car.material.dispose();
        this.scene.remove(this.car); this.car = null;
    }
    if (this.mapModel) {
        this.mapModel.traverse(c => { if (c.isMesh && c.geometry) c.geometry.dispose(); });
        this.scene.remove(this.mapModel); this.mapModel = null;
    }
    if (this.boatModel) {
        this.boatModel.traverse(c => { if (c.isMesh && c.geometry) c.geometry.dispose(); });
        this.scene.remove(this.boatModel); this.boatModel = null;
    }
    this.bridgeMeshes.forEach(m => { 
        if (m.geometry) m.geometry.dispose(); 
        this.scene.remove(m); 
    });
    this.bridgeMeshes = [];

    if (this.deckMaterial3D) this.deckMaterial3D.dispose();
    if (this.columnMaterial3D) this.columnMaterial3D.dispose();
    if (this.jointMaterial3D) this.jointMaterial3D.dispose();
}

}