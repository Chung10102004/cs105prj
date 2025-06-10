// src/SimulationMode.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCamera } from './camera.js';

// Constants
const DECK_MEMBER_COLOR = 0x0077cc;
const COLUMN_MEMBER_COLOR = 0xccaa00;
const DECK_RECTANGLE_COLOR = 0x888888;
const JOINT_DISPLAY_RADIUS_3D = 0.001;
// const DECK_MEMBER_THICKNESS_RADIUS = 0.2; 
const COLUMN_MEMBER_THICKNESS_RADIUS = 0.02;

const GRAVITY = 9.8 * 0.8;
const INITIAL_CAR_Z_PADDING = -1.95;

const FRONT_RAY_LENGTH_FACTOR = 0.7;
const FRONT_RAY_Y_OFFSET_FROM_BOTTOM = 0.03;
const FRONT_OBSTACLE_ANGLE_THRESHOLD = Math.PI / 3.5; // Approx 51.4 degrees from vertical

const BUILD_MODE_Y_TO_3D_HEIGHT_SCALE = 0.03;
const BRIDGE_PLACEMENT_OFFSET_Y_ON_MAP = -0.87;

// const DEBUG_SHADOW_CAMERA = false;
// const DEBUG_CAR_RAYS = false; // Set to true to see car's downward rays

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

    this.isTumbling = false;
    this.angularVelocity = new THREE.Vector3();
    this.fallStartTumbleThreshold = this.carHeight * 0.3;
    this.bounceFactor = 0.3;
    this.minBounceVelocity = 0.05;
    this.lastGroundY = 0; 

    this.currentGroundNormal = new THREE.Vector3(0, 1, 0);
    this.onValidGround = false;

    this.isBoatMoving = false;
    this.hasBoatCompletedRun = false;
    this.boatSpeed = 2.0;
    this.initialBoatX = 0;
    this.boatTargetX = 0;

    this.raycaster = new THREE.Raycaster(); // General purpose, reused for car's downward rays
    this.raycastOriginLocalY = (this.carHeight/2) + 0.1; // Default, updated in addCar
    this.carModelBottomOffsetY = -this.carHeight / 2;    // Default, updated in addCar
    this.carRaycastPointsLocalXZ = [];                  // Defined in addCar
    this.rayDirection = new THREE.Vector3(0, -1, 0);    // Constant downward direction
    this.frontRaycaster = new THREE.Raycaster();        // For front obstacle detection

    this.bridgeMeshes = [];

    this.deckMaterial3D = null;
    this.columnMaterial3D = null;
    this.jointMaterial3D = null;
    this.deckRectangleMaterial = null;

    this.calculatedBridgeExtents = {
        minX: 0, maxX: 0,
        minZ: 0, maxZ: 0,
        mapCenter: new THREE.Vector3(),
        bridgePlacementOffsetX: 0,
        bridgePlacementOffsetZ_Global: 0,
        bridgeBaseY_3D: 0,
    };

    this.referenceAnchorBuildModeY_ = 0;
    this.finalBridgeStructureBaseY_3D_ = 0;

    this.directionalLight = null;
    this.hemisphereLight = null;
    // if (DEBUG_SHADOW_CAMERA) {
    //     this.shadowHelper = null;
    // }
    this.sunMesh = null;
    this.sunVisualDistance = 7;
    this.sunRadius = 1;

    // if (DEBUG_CAR_RAYS) {
    //     this.debugRayHelpers = [];
    // }

    this.initSceneAndCamera();
    this.initMaterials();
    this.loadMapModel(); 
}

setRenderer(renderer) {
    this.renderer = renderer;
    if (this.renderer) {
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
}

initSceneAndCamera() {
    this.scene.background = new THREE.Color(0x87CEEB); 

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); 
    this.scene.add(ambientLight);

    this.hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.5); 
    this.scene.add(this.hemisphereLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); 
    this.directionalLight.position.set(25, 35, 30); 
    this.directionalLight.castShadow = true;
    this.scene.add(this.directionalLight);

    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;
    const shadowCamSize = 20; 
    this.directionalLight.shadow.camera.near = 1;
    this.directionalLight.shadow.camera.far = 100; 
    this.directionalLight.shadow.camera.left = -shadowCamSize;
    this.directionalLight.shadow.camera.right = shadowCamSize;
    this.directionalLight.shadow.camera.top = shadowCamSize;
    this.directionalLight.shadow.camera.bottom = -shadowCamSize;
    this.directionalLight.shadow.bias = -0.001;
    this.scene.add(this.directionalLight.target); 

    const sunGeometry = new THREE.SphereGeometry(this.sunRadius, 32, 32);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffddaa, fog: false });
    this.sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    this.sunMesh.position.copy(this.directionalLight.position).normalize().multiplyScalar(this.sunVisualDistance);
    this.sunMesh.castShadow = false;
    this.sunMesh.receiveShadow = false;
    this.scene.add(this.sunMesh);

    if (typeof createCamera === 'function') {
        this.cameraControls = createCamera(this.renderTarget);
        this.camera = this.cameraControls.camera;
        this.camera.far = this.sunVisualDistance * 2;
        this.camera.updateProjectionMatrix();
    } else {
        console.error("SimulationMode: createCamera is not a function. Using default.");
        const width = this.renderTarget.offsetWidth;
        const height = this.renderTarget.offsetHeight;
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, this.sunVisualDistance * 2);
        this.camera.position.set(0, 10, 15); this.camera.lookAt(0, 0, 0);
    }
}

initMaterials() {
    this.jointMaterial3D = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.3, roughness: 0.6 });
    this.deckMaterial3D = new THREE.MeshStandardMaterial({ color: DECK_MEMBER_COLOR, metalness: 0.5, roughness: 0.5 });
    this.columnMaterial3D = new THREE.MeshStandardMaterial({ color: COLUMN_MEMBER_COLOR, metalness: 0.5, roughness: 0.5 });
    this.deckRectangleMaterial = new THREE.MeshStandardMaterial({
        color: DECK_RECTANGLE_COLOR,
        metalness: 0.3,
        roughness: 0.7,
        side: THREE.DoubleSide
    });
}

loadMapModel() {
    const loader = new GLTFLoader();
    loader.load(
        './models/Untitled1.gltf',
        (gltf) => {
            if (!gltf || !gltf.scene || !(gltf.scene instanceof THREE.Object3D)) {
                console.error("GLTF map loaded, but gltf.scene is invalid.", gltf);
                this.showErrorToUser("Failed to load map model: Invalid scene data.");
            } else {
                this.mapModel = gltf.scene;
                this.scene.add(this.mapModel);
                this.mapModel.scale.set(0.25, 0.25, 0.25);
                this.mapModel.updateMatrixWorld(true);
                
                this.mapModel.traverse(node => {
                    if (node.isMesh) {
                        node.castShadow = true;
                        node.receiveShadow = true;
                    }
                });
                console.log("SimulationMode: Map GLTF model processed.");

                const mapBox = new THREE.Box3().setFromObject(this.mapModel);
                if (!mapBox.isEmpty()) {
                    mapBox.getCenter(this.calculatedBridgeExtents.mapCenter);
                    this.calculatedBridgeExtents.bridgeBaseY_3D = mapBox.max.y;
                    if (this.directionalLight) {
                        this.directionalLight.target.position.copy(this.calculatedBridgeExtents.mapCenter);
                        this.directionalLight.target.updateMatrixWorld();
                    }
                } else {
                     this.calculatedBridgeExtents.mapCenter.set(0,0,0);
                     this.calculatedBridgeExtents.bridgeBaseY_3D = 0;
                     console.warn("Sim: Map bounding box empty. Light target at origin.");
                     if (this.directionalLight) this.directionalLight.target.position.set(0,0,0);
                }
            }
            this.buildBridge3D(); 
            this.addCar();       
        },
        (xhr) => { console.log(`SimulationMode: Map GLTF model ${(xhr.loaded / xhr.total * 100).toFixed(2)}% loaded`); },
        (error) => {
            console.error('SimulationMode: Map GLTF loading FAILED.', error);
            this.showErrorToUser(`Failed to load map model: ${error.message || 'Unknown error'}.`);
            this.calculatedBridgeExtents.mapCenter.set(0,0,0); 
            this.calculatedBridgeExtents.bridgeBaseY_3D = 0;
            if (this.directionalLight) this.directionalLight.target.position.set(0,0,0);
            this.buildBridge3D();
            this.addCar();
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

                this.boatModel.scale.set(0.15, 0.1, 0.1);
                this.boatModel.rotation.set(0, Math.PI / 2, 0);
                this.boatModel.updateMatrixWorld(true);

                const boatBoundingBox = new THREE.Box3().setFromObject(this.boatModel);
                let pivotToBottomOffsetY = boatBoundingBox.isEmpty() ? 0 : (this.boatModel.position.y - boatBoundingBox.min.y);

                this.boatModel.position.x = mapCenterForBoat.x + 1.3;
                this.boatModel.position.z = mapCenterForBoat.z - 0.2;

                let waterLevelY = mapTopYForBoat - 1.7;
                if (this.mapModel) {
                    const waterNode = this.mapModel.getObjectByName("Cube.002");
                    if (waterNode) {
                        waterNode.updateMatrixWorld(true);
                        const waterBox = new THREE.Box3().setFromObject(waterNode);
                        if (!waterBox.isEmpty()) waterLevelY = waterBox.max.y;
                    }
                }
                this.boatModel.position.y = waterLevelY + pivotToBottomOffsetY;

                this.initialBoatX = this.boatModel.position.x;
                this.boatTargetX = this.initialBoatX - 3;

                this.boatModel.traverse(node => {
                     if (node.isMesh) {
                         node.castShadow = true;
                         node.receiveShadow = true;
                    }
                });
                console.log("SimulationMode: Boat GLTF model processed.");
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
    const parent = this.renderTarget.parentNode || document.body;
    parent.appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 10000);
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

    const { joints: buildModeJoints, elements: buildModeElements } = this.bridgeData.getBridgeDataForSimulation();
    if (!buildModeJoints || !buildModeElements || buildModeJoints.length === 0) {
        console.warn("SimulationMode: Invalid or empty bridge data.");
        return;
    }

    let bridgeWidthDefiningX_Planes = { left: -0.35, right: 0.6 };
    let bridgeLengthDefiningZ_Span = { start: -1.3, end: 1 };

    if (this.bridgeData.anchorPointData && this.bridgeData.anchorPointData.length > 0) {
        let minX = Infinity, maxX = -Infinity;
        this.bridgeData.anchorPointData.forEach(ap => {
            minX = Math.min(minX, ap.x);
            maxX = Math.max(maxX, ap.x);
        });
        if (minX !== Infinity) { 
            bridgeLengthDefiningZ_Span = { start: minX, end: maxX };
        }
    }

    const xPlaneLeft_Value = bridgeWidthDefiningX_Planes.left;
    const xPlaneRight_Value = bridgeWidthDefiningX_Planes.right;
    const targetZStart_Value = bridgeLengthDefiningZ_Span.start;
    const targetZEnd_Value = bridgeLengthDefiningZ_Span.end;
    const targetSpanZ_forLength = targetZEnd_Value - targetZStart_Value;

    let minCurrentJointBuildModeX = Infinity, maxCurrentJointBuildModeX = -Infinity;
    buildModeJoints.forEach(j => {
        minCurrentJointBuildModeX = Math.min(minCurrentJointBuildModeX, j.x);
        maxCurrentJointBuildModeX = Math.max(maxCurrentJointBuildModeX, j.x);
    });
    const currentJointsSpanBuildModeX = (maxCurrentJointBuildModeX - minCurrentJointBuildModeX);
    const canScaleBuildModeXToSimZ = targetSpanZ_forLength > 0.001 && currentJointsSpanBuildModeX > 0.001;

    this.calculatedBridgeExtents.bridgePlacementOffsetX = 0; 
    this.calculatedBridgeExtents.bridgePlacementOffsetZ_Global = 0; 

    if (this.calculatedBridgeExtents.mapCenter.lengthSq() === 0 && this.mapModel) {
        const mapBox = new THREE.Box3().setFromObject(this.mapModel);
        if (!mapBox.isEmpty()) {
            mapBox.getCenter(this.calculatedBridgeExtents.mapCenter);
            this.calculatedBridgeExtents.bridgeBaseY_3D = mapBox.max.y;
        }
    }

    this.finalBridgeStructureBaseY_3D_ = this.calculatedBridgeExtents.bridgeBaseY_3D + BRIDGE_PLACEMENT_OFFSET_Y_ON_MAP;

    this.referenceAnchorBuildModeY_ = 0;
    if (this.bridgeData.anchorPointData && this.bridgeData.anchorPointData.length > 0) {
        let sumAnchorY = 0;
        this.bridgeData.anchorPointData.forEach(ap => sumAnchorY += ap.y);
        this.referenceAnchorBuildModeY_ = sumAnchorY / this.bridgeData.anchorPointData.length;
    }

    this.calculatedBridgeExtents.minX = this.calculatedBridgeExtents.mapCenter.x + xPlaneLeft_Value + this.calculatedBridgeExtents.bridgePlacementOffsetX;
    this.calculatedBridgeExtents.maxX = this.calculatedBridgeExtents.mapCenter.x + xPlaneRight_Value + this.calculatedBridgeExtents.bridgePlacementOffsetX;
    this.calculatedBridgeExtents.minZ = this.calculatedBridgeExtents.mapCenter.z + targetZStart_Value + this.calculatedBridgeExtents.bridgePlacementOffsetZ_Global;
    this.calculatedBridgeExtents.maxZ = this.calculatedBridgeExtents.mapCenter.z + targetZEnd_Value + this.calculatedBridgeExtents.bridgePlacementOffsetZ_Global;

    const jointWorldPositions = {};
    const jointSphereGeo = new THREE.SphereGeometry(JOINT_DISPLAY_RADIUS_3D, 8, 8);

    buildModeJoints.forEach(bmJoint => {
        let finalJointSimZ_LocalToBridge;
        if (canScaleBuildModeXToSimZ) {
            const normalizedCurrentJointBuildModeX = currentJointsSpanBuildModeX === 0 ? 0 : (bmJoint.x - minCurrentJointBuildModeX) / currentJointsSpanBuildModeX;
            finalJointSimZ_LocalToBridge = targetZStart_Value + (normalizedCurrentJointBuildModeX * targetSpanZ_forLength);
        } else { 
            finalJointSimZ_LocalToBridge = targetZStart_Value + (bmJoint.x - (minCurrentJointBuildModeX || 0) );
        }
        const finalJointSimZ_World = this.calculatedBridgeExtents.mapCenter.z + finalJointSimZ_LocalToBridge + this.calculatedBridgeExtents.bridgePlacementOffsetZ_Global;

        const deltaBuildModeY = bmJoint.y - this.referenceAnchorBuildModeY_;
        const heightOffsetInSimY = deltaBuildModeY * BUILD_MODE_Y_TO_3D_HEIGHT_SCALE;
        const jointSpecificSimY_World = this.finalBridgeStructureBaseY_3D_ + heightOffsetInSimY;

        const simX_Left_World = this.calculatedBridgeExtents.mapCenter.x + xPlaneLeft_Value + this.calculatedBridgeExtents.bridgePlacementOffsetX;
        
        const meshLeft = new THREE.Mesh(jointSphereGeo.clone(), this.jointMaterial3D);
        meshLeft.castShadow = true; meshLeft.receiveShadow = true;
        meshLeft.position.set(simX_Left_World, jointSpecificSimY_World, finalJointSimZ_World);
        jointWorldPositions[bmJoint.id + "_left_plane"] = meshLeft.position.clone();
        this.scene.add(meshLeft); this.bridgeMeshes.push(meshLeft);

        if (Math.abs(xPlaneLeft_Value - xPlaneRight_Value) > 0.001) { 
            const simX_Right_World = this.calculatedBridgeExtents.mapCenter.x + xPlaneRight_Value + this.calculatedBridgeExtents.bridgePlacementOffsetX;
            const meshRight = new THREE.Mesh(jointSphereGeo.clone(), this.jointMaterial3D);
            meshRight.castShadow = true; meshRight.receiveShadow = true;
            meshRight.position.set(simX_Right_World, jointSpecificSimY_World, finalJointSimZ_World);
            jointWorldPositions[bmJoint.id + "_right_plane"] = meshRight.position.clone();
            this.scene.add(meshRight); this.bridgeMeshes.push(meshRight);
        } else { 
            jointWorldPositions[bmJoint.id + "_right_plane"] = meshLeft.position.clone(); 
        }
    });

    const createTubeMember = (pos1, pos2, material, thickness, isDeckMember, baseElementId, suffix) => {
        if (pos1 && pos2 && !pos1.equals(pos2)) {
            const curve = new THREE.LineCurve3(pos1, pos2);
            const tubeGeo = new THREE.TubeGeometry(curve, 2, thickness, 6, false);
            const mesh = new THREE.Mesh(tubeGeo, material);
            mesh.castShadow = true; mesh.receiveShadow = true;
            mesh.userData = { isBridgeElement: true, isDeckMember: isDeckMember, originalElementId: baseElementId + suffix };
            this.scene.add(mesh); this.bridgeMeshes.push(mesh);
        }
    };

    buildModeElements.forEach(bmElement => {
        const j1_id = bmElement.joint1_id;
        const j2_id = bmElement.joint2_id;

        if (bmElement.materialKey === 'yellow') { 
            const materialToUse = this.columnMaterial3D;
            const thicknessToUse = COLUMN_MEMBER_THICKNESS_RADIUS;
            createTubeMember(jointWorldPositions[j1_id + "_left_plane"], jointWorldPositions[j2_id + "_left_plane"], materialToUse, thicknessToUse, false, bmElement.id, "_col_L");
            if (Math.abs(xPlaneLeft_Value - xPlaneRight_Value) > 0.001) {
                createTubeMember(jointWorldPositions[j1_id + "_right_plane"], jointWorldPositions[j2_id + "_right_plane"], materialToUse, thicknessToUse, false, bmElement.id, "_col_R");
            }
        } else { 
            const p1_l = jointWorldPositions[j1_id + "_left_plane"];
            const p2_l = jointWorldPositions[j2_id + "_left_plane"];
            const p1_r = jointWorldPositions[j1_id + "_right_plane"];
            const p2_r = jointWorldPositions[j2_id + "_right_plane"];

            if (p1_l && p2_l && p1_r && p2_r) { 
                 if (Math.abs(xPlaneLeft_Value - xPlaneRight_Value) > 0.001) { 
                    const vertices = new Float32Array([
                        p1_l.x, p1_l.y, p1_l.z, p2_l.x, p2_l.y, p2_l.z, p2_r.x, p2_r.y, p2_r.z,
                        p1_l.x, p1_l.y, p1_l.z, p2_r.x, p2_r.y, p2_r.z, p1_r.x, p1_r.y, p1_r.z
                    ]);
                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                    geometry.computeVertexNormals();
                    const rectangleMesh = new THREE.Mesh(geometry, this.deckRectangleMaterial);
                    rectangleMesh.castShadow = true; rectangleMesh.receiveShadow = true;
                    rectangleMesh.userData = { isBridgeElement: true, isDeckMember: true, originalElementId: bmElement.id + "_deck_rect" };
                    this.scene.add(rectangleMesh); this.bridgeMeshes.push(rectangleMesh);
                 } else { 
                    console.warn(`Sim: Deck member ${bmElement.id} has no width, visual might be a line.`);
                 }
            } else {
                console.warn(`Sim: Missing joint positions for deck member ${bmElement.id}`);
            }
        }
    });
    this.bridgeMeshes.forEach(mesh => mesh.updateMatrixWorld(true));
    console.log("SimulationMode: Bridge built. Total 3D meshes:", this.bridgeMeshes.length);
}

addCar() {
    if (this.car) {
        if (this.car.traverse) {
            this.car.traverse(child => {
                if (child.isMesh) {
                    child.geometry?.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose?.());
                        else child.material.dispose?.();
                    }
                }
            });
        } else { 
            this.car.geometry?.dispose();
            this.car.material?.dispose?.();
        }
        this.scene.remove(this.car);
        this.car = null;
    }

    const loader = new GLTFLoader();
    loader.load(
        './models/Car.gltf',
        (gltf) => {
            this.car = gltf.scene;
            this.scene.add(this.car);

            const desiredCarDepth = 0.5;
            this.car.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(this.car);
            const size = box.getSize(new THREE.Vector3());
            const scale = size.z === 0 ? 1 : desiredCarDepth / size.z;
            this.car.scale.set(scale, scale, scale);
            this.car.updateMatrixWorld(true);

            const originalPosition = this.car.position.clone();
            const originalQuaternion = this.car.quaternion.clone();
            this.car.position.set(0,0,0);
            this.car.quaternion.identity();
            this.car.updateMatrixWorld(true); 

            const localModelBox = new THREE.Box3();
            this.car.traverse(child => {
                if (child.isMesh) {
                    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox(); 
                    const childBox = child.geometry.boundingBox.clone();
                    childBox.applyMatrix4(child.matrixWorld); 
                    localModelBox.union(childBox);
                }
            });
            const scaledSize = localModelBox.getSize(new THREE.Vector3());
            this.carWidth = scaledSize.x;
            this.carHeight = scaledSize.y;
            this.carDepth = scaledSize.z;
            this.carModelBottomOffsetY = localModelBox.min.y; 

            this.car.position.copy(originalPosition);
            this.car.quaternion.copy(originalQuaternion);
            this.car.updateMatrixWorld(true);

            // Define Y-origin for downward rays (above car's top)
            this.raycastOriginLocalY = this.carModelBottomOffsetY + this.carHeight + 0.1;

            // Define XZ points for downward raycasts in car's local space
            const frontZ = this.carDepth * 0.45; // Slightly back from the very front
            const rearZ = -this.carDepth * 0.45; // Slightly forward from the very rear
            const sideX = this.carWidth * 0.40;  // Slightly inward from the sides, adjust as needed

            this.carRaycastPointsLocalXZ = [
                { name: "front_center", x: 0,     z: frontZ },
                { name: "rear_center",  x: 0,     z: rearZ  },
                { name: "front_right",  x: sideX, z: frontZ },
                { name: "front_left",   x: -sideX,z: frontZ },
                { name: "rear_right",   x: sideX, z: rearZ }, // Added for more stability
                { name: "rear_left",    x: -sideX,z: rearZ }, // Added for more stability
            ];
            // if (DEBUG_CAR_RAYS && this.carRaycastPointsLocalXZ.length > 0) {
            //     this.carRaycastPointsLocalXZ.forEach(() => {
            //         const helper = new THREE.ArrowHelper(this.rayDirection, new THREE.Vector3(), 1, 0x00ff00, 0.05, 0.03);
            //         this.debugRayHelpers.push(helper);
            //         this.scene.add(helper);
            //     });
            // }

            this.fallStartTumbleThreshold = this.carHeight * 0.3;

            this.car.traverse(node => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            this.initialCarX = (this.calculatedBridgeExtents.minX + this.calculatedBridgeExtents.maxX) / 2;
            const carHalfDepth = this.carDepth / 2;
            this.carZMin = this.calculatedBridgeExtents.minZ + carHalfDepth + INITIAL_CAR_Z_PADDING;
            this.carZMax = this.calculatedBridgeExtents.maxZ - carHalfDepth - INITIAL_CAR_Z_PADDING;

            if (this.carZMin >= this.carZMax) {
                console.warn(`Sim: Car Z-limits invalid. Min: ${this.carZMin.toFixed(2)}, Max: ${this.carZMax.toFixed(2)}. Adjusting.`);
                this.carZMax = this.carZMin + Math.max(this.carDepth, 0.1);
            }

            console.log(`Sim: GLTF Car. Dims (WxHxD): ${this.carWidth.toFixed(2)}x${this.carHeight.toFixed(2)}x${this.carDepth.toFixed(2)}. BottomY: ${this.carModelBottomOffsetY.toFixed(3)}. RaycastOriginLocalY: ${this.raycastOriginLocalY.toFixed(3)}`);
            console.log(`Sim: Car Raycast Points Local XZ:`, this.carRaycastPointsLocalXZ.map(p => `(${p.x.toFixed(2)},${p.z.toFixed(2)})`).join('; '));
            console.log(`Sim: Car Initial X: ${this.initialCarX.toFixed(2)}, Z-Bounds: [${this.carZMin.toFixed(2)}, ${this.carZMax.toFixed(2)}]`);
            
            this.loadBoatModel(); 
        },
        (xhr) => { console.log(`SimulationMode: Car GLTF model ${(xhr.loaded / xhr.total * 100).toFixed(2)}% loaded`); },
        (error) => {
            console.error('SimulationMode: Car GLTF loading FAILED.', error);
            this.showErrorToUser(`Failed to load car model: ${error.message || 'Unknown error'}. Using fallback.`);
            this.carWidth = 0.25; this.carHeight = 0.2; this.carDepth = 0.5;
            const carGeometry = new THREE.BoxGeometry(this.carWidth, this.carHeight, this.carDepth);
            const carMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
            this.car = new THREE.Mesh(carGeometry, carMaterial);
            this.car.castShadow = true; this.car.receiveShadow = true;
            this.scene.add(this.car);

            this.carModelBottomOffsetY = -this.carHeight / 2;
            this.raycastOriginLocalY = this.carModelBottomOffsetY + this.carHeight + 0.1;
             const frontZ = this.carDepth * 0.45; const rearZ = -this.carDepth * 0.45; const sideX = this.carWidth * 0.40;
            this.carRaycastPointsLocalXZ = [ { name: "front_center", x: 0, z: frontZ }, { name: "rear_center",  x: 0, z: rearZ  }, { name: "front_right",  x: sideX, z: frontZ }, { name: "front_left",   x: -sideX,z: frontZ }, { name: "rear_right", x: sideX, z: rearZ }, { name: "rear_left", x: -sideX, z: rearZ } ];

            this.fallStartTumbleThreshold = this.carHeight * 0.3;

            this.initialCarX = (this.calculatedBridgeExtents.minX + this.calculatedBridgeExtents.maxX) / 2;
            const carHalfDepth = this.carDepth / 2;
            this.carZMin = this.calculatedBridgeExtents.minZ + carHalfDepth + INITIAL_CAR_Z_PADDING;
            this.carZMax = this.calculatedBridgeExtents.maxZ - carHalfDepth - INITIAL_CAR_Z_PADDING;
            if (this.carZMin >= this.carZMax) this.carZMax = this.carZMin + Math.max(this.carDepth, 0.1);

            console.log(`Sim: Fallback Car created. Z-Bounds: [${this.carZMin.toFixed(2)}, ${this.carZMax.toFixed(2)}]`);
            this.loadBoatModel();
        }
    );
}

updateCarVerticalPosition(isInitialOrResetSetup = false) {
    if (!this.car || !this.carRaycastPointsLocalXZ || this.carRaycastPointsLocalXZ.length === 0) return;
    this.car.updateMatrixWorld();

    const objectsToIntersect = [];
    if (this.mapModel) {
        this.mapModel.updateMatrixWorld(true); objectsToIntersect.push(this.mapModel);
    }
    this.bridgeMeshes.forEach(mesh => {
        if (mesh.userData?.isDeckMember && mesh.visible) {
            mesh.updateMatrixWorld(true); objectsToIntersect.push(mesh);
        }
    });

    if (objectsToIntersect.length === 0 && !isInitialOrResetSetup) {
        this.onValidGround = false;
        this.isCarFalling = true;
        return;
    }

    let highestHitPointY = -Infinity;
    let effectiveGroundNormal = null;
    let anyRayHit = false;

    const rayFarDistance = (this.raycastOriginLocalY - this.carModelBottomOffsetY) + 0.3; // Increased slightly for safety

    // if (DEBUG_CAR_RAYS) this.debugRayHelpers.forEach(h => h.visible = false); // Hide old helpers

    for (let i = 0; i < this.carRaycastPointsLocalXZ.length; i++) {
        const pointDef = this.carRaycastPointsLocalXZ[i];
        const rayOriginLocal = new THREE.Vector3(pointDef.x, this.raycastOriginLocalY, pointDef.z);
        const rayOriginWorld = this.car.localToWorld(rayOriginLocal.clone());

        this.raycaster.set(rayOriginWorld, this.rayDirection);
        this.raycaster.near = 0.01;
        this.raycaster.far = rayFarDistance;

        const intersects = this.raycaster.intersectObjects(objectsToIntersect, true);
        const closestValidHit = intersects.find(hit =>
            hit.object.uuid !== this.car.uuid &&
            hit.object.visible && hit.face &&
            (!hit.object.parent || hit.object.parent.uuid !== this.car.uuid)
        );
        
        // if (DEBUG_CAR_RAYS && this.debugRayHelpers[i]) {
        //     this.debugRayHelpers[i].position.copy(rayOriginWorld);
        //     this.debugRayHelpers[i].setDirection(this.rayDirection);
        //     this.debugRayHelpers[i].setLength(rayFarDistance, 0.05, 0.03);
        //     this.debugRayHelpers[i].setColor(closestValidHit ? 0x00ff00 : 0xff0000); // Green if hit, red if not
        //     this.debugRayHelpers[i].visible = true;
        // }

        if (closestValidHit) {
            anyRayHit = true;
            if (closestValidHit.point.y > highestHitPointY) {
                highestHitPointY = closestValidHit.point.y;
                effectiveGroundNormal = closestValidHit.face.normal.clone()
                                          .transformDirection(closestValidHit.object.matrixWorld)
                                          .normalize();
            }
        }
    }

    if (anyRayHit) {
        this.onValidGround = true;
        this.currentGroundNormal.copy(effectiveGroundNormal);

        if (!this.isTumbling) {
            const carUp = new THREE.Vector3(0, 1, 0);
            const targetQuaternion = new THREE.Quaternion().setFromUnitVectors(carUp, this.currentGroundNormal);
            if (isInitialOrResetSetup || (this.onValidGround && !this.isCarFalling && this.verticalVelocity < 0.01)) {
                this.car.quaternion.copy(targetQuaternion);
            } else if (this.isCarFalling) {
                this.car.quaternion.slerp(targetQuaternion, 0.6);
            }
        }

        const localContactPoint = new THREE.Vector3(0, this.carModelBottomOffsetY, 0);
        const worldContactOffset = localContactPoint.clone().applyQuaternion(this.car.quaternion);
        this.car.position.y = highestHitPointY - worldContactOffset.y;

        if (this.isCarFalling) {
            if (Math.abs(this.verticalVelocity) > this.minBounceVelocity) {
                this.verticalVelocity *= -this.bounceFactor;
                this.car.position.y += Math.max(0, this.verticalVelocity * (1 / 60));
                this.isCarFalling = Math.abs(this.verticalVelocity) > 0.01;
            } else {
                this.verticalVelocity = 0;
                this.isCarFalling = false;
            }
            if (this.isTumbling) {
                this.isTumbling = false;
                this.angularVelocity.set(0, 0, 0);
            }
        } else {
            this.verticalVelocity = 0;
        }
        this.lastGroundY = highestHitPointY;
    } else {
        this.onValidGround = false;
        if (!isInitialOrResetSetup) {
            const currentCarBottomY_World = this.car.localToWorld(new THREE.Vector3(0, this.carModelBottomOffsetY, 0)).y;
            if (!this.isCarFalling && (this.lastGroundY - currentCarBottomY_World > this.fallStartTumbleThreshold)) {
                if (!this.isTumbling) {
                    this.isTumbling = true;
                    this.angularVelocity.set((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 1.0);
                }
            }
            this.isCarFalling = true;
        } else {
            this.currentGroundNormal.set(0, 1, 0);
            let defaultY;
            const carBottomToPivotOffsetY = (this.carModelBottomOffsetY !== undefined) ? -this.carModelBottomOffsetY : (this.carHeight / 2 || 0.1);
            const bridgeSimData = this.bridgeData.getBridgeDataForSimulation();
            const firstJoint = bridgeSimData.joints && bridgeSimData.joints.length > 0 ? bridgeSimData.joints[0] : null;
            if (firstJoint && this.referenceAnchorBuildModeY_ !== undefined && this.finalBridgeStructureBaseY_3D_ !== 0) {
                const deltaBuildModeY = firstJoint.y - this.referenceAnchorBuildModeY_;
                const heightOffsetInSimY = deltaBuildModeY * BUILD_MODE_Y_TO_3D_HEIGHT_SCALE;
                defaultY = this.finalBridgeStructureBaseY_3D_ + heightOffsetInSimY + carBottomToPivotOffsetY + 0.02;
            } else {
                defaultY = (this.finalBridgeStructureBaseY_3D_ !== 0 ? this.finalBridgeStructureBaseY_3D_ : (this.calculatedBridgeExtents.bridgeBaseY_3D || 0) ) + carBottomToPivotOffsetY + 0.1;
            }
            if (isNaN(defaultY)) {
                defaultY = carBottomToPivotOffsetY + 0.1;
                console.warn("Car initial Y fallback: NaN detected, using absolute fallback.");
            }
            this.car.position.y = defaultY;
            this.isCarFalling = false;
            this.verticalVelocity = 0;
            this.isTumbling = false;
            this.angularVelocity.set(0, 0, 0);
            this.car.quaternion.identity();
        }
    }
}


resetSequence() {
    if (this.car) {
        this.isCarRunning = false; this.hasCarCompletedRun = false;
        this.isCarFalling = false; this.verticalVelocity = 0;
        this.isTumbling = false; this.angularVelocity.set(0, 0, 0);
        
        this.car.quaternion.identity();
        this.currentGroundNormal.set(0, 1, 0); 
        this.onValidGround = false;

        this.car.position.x = this.initialCarX;
        this.car.position.z = this.carZMin;

        let tempHighY = (this.finalBridgeStructureBaseY_3D_ || this.calculatedBridgeExtents.bridgeBaseY_3D || 0) + (this.carHeight || 1) * 2 + 10;
        if (this.bridgeMeshes.length > 0) {
            const bridgeBox = new THREE.Box3();
            this.bridgeMeshes.forEach(m => {
                if (m.userData?.isDeckMember && m.visible && m.geometry) {
                    m.updateMatrixWorld(true);
                    const currentBox = new THREE.Box3().setFromObject(m);
                    if(!currentBox.isEmpty()) bridgeBox.union(currentBox);
                }
            });
            if (!bridgeBox.isEmpty()) tempHighY = Math.max(tempHighY, bridgeBox.max.y + (this.carHeight || 1) * 2 + 1);
        }
        this.car.position.y = tempHighY;
        this.car.updateMatrixWorld();

        this.updateCarVerticalPosition(true); 

        if (this.onValidGround) {
            // This logic for lastGroundY might need adjustment with multi-ray, 
            // highestHitPointY is already stored in this.lastGroundY by updateCarVerticalPosition
        } else {
            this.lastGroundY = this.car.position.y + (this.carModelBottomOffsetY !== undefined ? this.carModelBottomOffsetY : -(this.carHeight/2||0.1)); 
        }
    }

    if (this.boatModel) {
        this.boatModel.position.x = this.initialBoatX;
        this.boatModel.updateMatrixWorld(true);
    }
    this.isBoatMoving = false; this.hasBoatCompletedRun = false;
    console.log("SimulationMode: Sequence reset.");
}

startSequence() {
    if (!this.car) { console.error("Sim Start: No car to run!"); return; }
    this.resetSequence(); 

    if (!this.boatModel || this.hasBoatCompletedRun) {
        this.isBoatMoving = false;
        this.isCarRunning = true;
    } else {
        this.isBoatMoving = true;
    }
    console.log(`SimulationMode: Sequence started. Car running: ${this.isCarRunning}, Boat moving: ${this.isBoatMoving}`);
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
    if (!this.mapModel) {
        console.log("Sim: Activating, map model not yet loaded. Asset loading chain should handle setup.");
    } else if (!this.car) {
        console.log("Sim: Activating, map loaded but no car. Calling addCar.");
        if (this.bridgeMeshes.length === 0) this.buildBridge3D(); 
        this.addCar(); 
    } else {
        console.log("Sim: Activating, assets seem loaded. Resetting sequence.");
        this.resetSequence();
    }
    
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
    console.log("SimulationMode: Activated.");
}

deactivate() {
    this.isActive = false;
    this.isCarRunning = false; this.isBoatMoving = false;
    if (this.cameraControls && typeof this.cameraControls.onMouseDown === 'function') {
        this.renderTarget.removeEventListener('mousedown', this.boundOnMouseDown3D);
        this.renderTarget.removeEventListener('mouseup', this.boundOnMouseUp3D);
        this.renderTarget.removeEventListener('mousemove', this.boundOnMouseMove3D);
        if (this.boundOnMouseWheel3D) this.renderTarget.removeEventListener('wheel', this.boundOnMouseWheel3D);
        this.boundOnMouseDown3D=null; this.boundOnMouseUp3D=null; this.boundOnMouseMove3D=null; this.boundOnMouseWheel3D=null;
    }
    console.log("SimulationMode: Deactivated.");
}

onMouseDown3D(event) { if (this.isActive && this.cameraControls?.onMouseDown) this.cameraControls.onMouseDown(event); }
onMouseUp3D(event) { if (this.isActive && this.cameraControls?.onMouseUp) this.cameraControls.onMouseUp(event); }
onMouseMove3D(event) { if (this.isActive && this.cameraControls?.onMouseMove) this.cameraControls.onMouseMove(event); }
onMouseWheel3D(event) { if (this.isActive && this.cameraControls?.onMouseWheel) this.cameraControls.onMouseWheel(event); }

update(deltaTime) {
    if (!this.isActive || deltaTime <= 0 || !this.car) return; 
    if (deltaTime > 0.1) deltaTime = 0.1;

    if (this.isBoatMoving && !this.hasBoatCompletedRun && this.boatModel) {
        const direction = Math.sign(this.boatTargetX - this.boatModel.position.x);
        const distanceToTarget = Math.abs(this.boatTargetX - this.boatModel.position.x);
        let moveDistance = this.boatSpeed * deltaTime;
        if (moveDistance >= distanceToTarget - 0.001) {
            this.boatModel.position.x = this.boatTargetX;
            this.isBoatMoving = false; this.hasBoatCompletedRun = true;
            if (this.car) this.isCarRunning = true;
        } else { this.boatModel.position.x += direction * moveDistance; }
        this.boatModel.updateMatrixWorld(true);
    } else if (this.isBoatMoving && !this.boatModel && !this.hasBoatCompletedRun) {
        this.isBoatMoving = false; this.hasBoatCompletedRun = true;
        if (this.car) this.isCarRunning = true;
    }

    // 1. Cập nhật vị trí thẳng đứng và hướng của xe.
    if (!this.isTumbling) { 
        this.updateCarVerticalPosition(false);
    }
    
    // 2. Xử lý di chuyển ngang nếu đang chạy.
    if (this.isCarRunning && !this.hasCarCompletedRun) {
        if (this.carZMin >= this.carZMax) {
            this.hasCarCompletedRun = true; this.isCarRunning = false;
        }

        if (!this.isTumbling) {
            const currentCarSpeed = this.carSpeed;
            const stepDistance = currentCarSpeed * deltaTime;
            let shouldStopDueToFrontObstacle = false;

            // Phát hiện chướng ngại vật phía trước
            if (this.mapModel && Math.abs(currentCarSpeed) > 0.01) {
                const carForwardWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(this.car.quaternion).normalize();
                const fallbackBottomY = (this.carHeight !== undefined) ? -this.carHeight/2 : -0.1;
                const frontRayLocalY = (this.carModelBottomOffsetY !== undefined ? this.carModelBottomOffsetY : fallbackBottomY) + FRONT_RAY_Y_OFFSET_FROM_BOTTOM;
                
                const rayOriginsLocal = [
                    new THREE.Vector3(0, frontRayLocalY, (this.carDepth / 2 - 0.01)),
                    new THREE.Vector3(this.carWidth / 2 * 0.85, frontRayLocalY, (this.carDepth / 2 - 0.01)),
                    new THREE.Vector3(-this.carWidth/ 2 * 0.85, frontRayLocalY, (this.carDepth / 2 - 0.01))
                ];
                const rayLength = Math.max(0.05, this.carDepth * FRONT_RAY_LENGTH_FACTOR + Math.abs(stepDistance));
                const frontObstacleCheckObjects = [this.mapModel];
                this.bridgeMeshes.forEach(mesh => {
                    if (mesh.userData?.isBridgeElement && !mesh.userData?.isDeckMember && mesh.visible) {
                        mesh.updateMatrixWorld(true); frontObstacleCheckObjects.push(mesh);
                    }
                });

                for (const localOrigin of rayOriginsLocal) {
                    if (shouldStopDueToFrontObstacle) break;
                    const worldOrigin = localOrigin.clone().applyMatrix4(this.car.matrixWorld);
                    this.frontRaycaster.set(worldOrigin, carForwardWorld);
                    this.frontRaycaster.near = 0.01; this.frontRaycaster.far = rayLength;
                    const intersects = this.frontRaycaster.intersectObjects(frontObstacleCheckObjects, true);
                    for (const hit of intersects) {
                         if (hit.object.uuid === this.car.uuid || !hit.object.visible || !hit.face || (hit.object.parent?.uuid === this.car.uuid)) continue;
                        const faceNormalWorld = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
                        const angleWithVertical = faceNormalWorld.angleTo(new THREE.Vector3(0, 1, 0));
                        if (angleWithVertical > FRONT_OBSTACLE_ANGLE_THRESHOLD) {
                            const hitPointRelativeToCar = this.car.worldToLocal(hit.point.clone());
                            if (hitPointRelativeToCar.y > frontRayLocalY - 0.01) {
                                shouldStopDueToFrontObstacle = true; this.hasCarCompletedRun = true; this.isCarRunning = false;
                                console.log(`Sim: Car stopping, front obstacle. Angle: ${THREE.MathUtils.radToDeg(angleWithVertical).toFixed(1)}°`);
                                break;
                            }
                        }
                    }
                }
            } 

            if (!shouldStopDueToFrontObstacle) {
                const localMoveDelta = new THREE.Vector3(0, 0, stepDistance);
                const worldMoveDelta = localMoveDelta.clone().applyQuaternion(this.car.quaternion);

                // ----- SỬA LỖI Ở ĐÂY -----
                // Nếu xe đang ở trên mặt đất, chiếu vector di chuyển lên mặt phẳng của mặt đất
                // để xe trượt dọc theo bề mặt thay vì cố gắng bay lên.
                if (this.onValidGround && this.currentGroundNormal) {
                    worldMoveDelta.projectOnPlane(this.currentGroundNormal);
                }
                // ----- KẾT THÚC SỬA LỖI -----

                this.car.position.add(worldMoveDelta);
            }

            // Kiểm tra hoàn thành chặng đường
            if (!this.hasCarCompletedRun) {
                const carWorldZ = this.car.position.z;
                if (currentCarSpeed > 0 && carWorldZ >= this.carZMax - 0.001) {
                    this.car.position.z = this.carZMax; this.hasCarCompletedRun = true; this.isCarRunning = false;
                } else if (currentCarSpeed < 0 && carWorldZ <= this.carZMin + 0.001) {
                    this.car.position.z = this.carZMin; this.hasCarCompletedRun = true; this.isCarRunning = false;
                }
            }
        } 
    } 

    // 3. Áp dụng trọng lực nếu xác định là đang rơi.
    if (this.isCarFalling) {
        this.verticalVelocity -= GRAVITY * deltaTime;
        this.car.position.y += this.verticalVelocity * deltaTime;
    }

    // 4. Xử lý quay lộn nhào.
    if (this.isTumbling && this.isCarFalling) {
        const deltaRotationEuler = new THREE.Euler(
            this.angularVelocity.x * deltaTime, this.angularVelocity.y * deltaTime, this.angularVelocity.z * deltaTime, 'XYZ'
        );
        const deltaRotationQuaternion = new THREE.Quaternion().setFromEuler(deltaRotationEuler);
        this.car.quaternion.multiplyQuaternions(deltaRotationQuaternion, this.car.quaternion);
    }

    this.car.updateMatrixWorld(); 

    // Kiểm tra xe rơi ra ngoài thế giới
    const minYPosition = -20;
    const carBottomYCheck = this.car.position.y + (this.carModelBottomOffsetY !== undefined ? this.carModelBottomOffsetY : -(this.carHeight/2 || 0.1));
    if (this.car.position.y < minYPosition && carBottomYCheck < minYPosition) {
        console.log("Sim: Car fell too far, resetting."); this.showErrorToUser("Car fell out of the world!"); this.resetSequence();
    }
}


render() {
    if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
    }
}

dispose() {
    console.log("SimulationMode: Disposing...");
    this.deactivate(); 

    // if (DEBUG_CAR_RAYS) {
    //     this.debugRayHelpers.forEach(helper => this.scene.remove(helper));
    //     this.debugRayHelpers = [];
    // }

    if (this.car) {
        if (this.car.traverse) {
            this.car.traverse(child => {
                if (child.isMesh) {
                    child.geometry?.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose?.());
                        else child.material.dispose?.();
                    }
                }
            });
        } else {
            this.car.geometry?.dispose();
            this.car.material?.dispose?.();
        }
        this.scene.remove(this.car); this.car = null;
    }

    if (this.mapModel) {
        this.mapModel.traverse(child => {
            if (child.isMesh) {
                child.geometry?.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(m => m.dispose?.());
                    else child.material.dispose?.();
                }
            }
        });
        this.scene.remove(this.mapModel); this.mapModel = null;
    }

    if (this.boatModel) {
        this.boatModel.traverse(child => {
            if (child.isMesh) {
                child.geometry?.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(m => m.dispose?.());
                    else child.material.dispose?.();
                }
            }
        });
        this.scene.remove(this.boatModel); this.boatModel = null;
    }

    this.bridgeMeshes.forEach(m => {
        m.geometry?.dispose();
        this.scene.remove(m);
    });
    this.bridgeMeshes = [];

    this.deckMaterial3D?.dispose(); this.deckMaterial3D = null;
    this.columnMaterial3D?.dispose(); this.columnMaterial3D = null;
    this.jointMaterial3D?.dispose(); this.jointMaterial3D = null;
    this.deckRectangleMaterial?.dispose(); this.deckRectangleMaterial = null;

    if (this.directionalLight) {
        this.scene.remove(this.directionalLight.target); 
        this.directionalLight.dispose(); // Important for shadow map resources
        this.scene.remove(this.directionalLight);
        this.directionalLight = null;
    }
    if (this.hemisphereLight) {
        this.hemisphereLight.dispose();
        this.scene.remove(this.hemisphereLight);
        this.hemisphereLight = null;
    }
    if (this.sunMesh) {
        this.scene.remove(this.sunMesh);
        this.sunMesh.geometry?.dispose();
        this.sunMesh.material?.dispose();
        this.sunMesh = null;
    }
    
    // Dispose ambient light (was directly added to scene)
    const ambientLight = this.scene.getObjectByProperty('isAmbientLight', true);
    if(ambientLight){
        this.scene.remove(ambientLight);
        // ambientLight.dispose(); // AmbientLight doesn't have specific resources to dispose usually
    }

    this.camera = null;
    this.cameraControls = null;
    console.log("SimulationMode: Disposed.");
}
}