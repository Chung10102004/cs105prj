// src/BuildMode.js

import * as THREE from 'three';
import { getMouseWorldCoordinates, snapToGrid } from './utils.js';
import { BridgeData } from './BridgeData.js';



const ANCHOR_RADIUS = 1;
const ANCHOR_COLOR = 0xffd700; 

const JOINT_RADIUS = 0.7;
const JOINT_COLOR = 0x00dd00; 

const JOINT_SEGMENTS = 16;
const GRID_CELL_SIZE = 10;
const VIEW_REFERENCE_HEIGHT = 70;

const MEMBER_THICKNESS_RADIUS = 0.25;
const MEMBER_SEGMENTS_TUBULAR = 2;
const MEMBER_SEGMENTS_RADIAL = 6;
const MEMBER_BLUE_COLOR = 0x0000ff; // Original member color
const MEMBER_YELLOW_COLOR = 0xffff00; // New member color

export class BuildMode {
    constructor(renderTargetElement) {
        console.log("BuildMode Constructor: Received renderTargetElement ->", renderTargetElement);
        if (!renderTargetElement) {
            console.error("BuildMode CRITICAL: renderTargetElement is NULL or UNDEFINED in constructor!");
        }
        this.renderTarget = renderTargetElement;
        this.scene = new THREE.Scene();
        this.camera = null;
        this.renderer = null;

        this.bridgeData = new BridgeData();
        this.uiManager = null;

        this.currentTool = 'none';
        this.selectedJoint1ForMember = null;
        this.tempPreviewLine = null;

        this.gridHelper = null;

        this.anchorMaterial = new THREE.MeshBasicMaterial({ color: ANCHOR_COLOR, depthTest: false });
        this.jointMaterial = new THREE.MeshBasicMaterial({ color: JOINT_COLOR, depthTest: false });
        
        this.memberBlueMaterial = new THREE.MeshBasicMaterial({ color: MEMBER_BLUE_COLOR, depthTest: false });
        this.memberYellowMaterial = new THREE.MeshBasicMaterial({ color: MEMBER_YELLOW_COLOR, depthTest: false });
        
        this.previewMemberOrangeMaterial = new THREE.LineDashedMaterial({ // For blue members
            color: 0xffa500, // Orange
            linewidth: 2,
            scale: 1,
            dashSize: 0.5,
            gapSize: 0.25,
            depthTest: false
        });
        this.previewMemberYellowMaterial = new THREE.LineDashedMaterial({ // For yellow members
            color: 0xffff00, // Yellow
            linewidth: 2,
            scale: 1,
            dashSize: 0.5,
            gapSize: 0.25,
            depthTest: false
        });


        this.boundOnMouseDown = this.onMouseDown.bind(this);
        this.boundOnMouseMove = this.onMouseMove.bind(this);
        this.isActive = false;

        this.initScene();
    }

    setRenderer(renderer) {
        this.renderer = renderer;
    }

    setUIManager(uiManager) {
        this.uiManager = uiManager;
        this.updateUI();
    }

    activate() {
        if (this.isActive) {
            console.log("BuildMode is already active.");
            return;
        }
        console.log("BuildMode Activating: renderTarget is ->", this.renderTarget);
        if (this.renderTarget) {
            this.renderTarget.addEventListener('mousedown', this.boundOnMouseDown);
            this.renderTarget.addEventListener('mousemove', this.boundOnMouseMove);
            this.isActive = true;
            console.log("BuildMode Activated. Event listeners added to:", this.renderTarget);
        } else {
            console.error("BuildMode Activate FAILED: renderTarget is NULL. Listeners NOT added.");
        }
    }

    deactivate() {
        if (!this.isActive) {
            console.log("BuildMode is not active. No listeners to remove.");
            return;
        }
        if (this.renderTarget) {
            this.renderTarget.removeEventListener('mousedown', this.boundOnMouseDown);
            this.renderTarget.removeEventListener('mousemove', this.boundOnMouseMove);
        }
        this.isActive = false;
        console.log("BuildMode Deactivated. Event listeners removed.");
    }

    initScene() {
        this.scene.background = new THREE.Color(0x606060);
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
        this.camera.position.z = 10;
        this.updateCameraProjection();

        const gridHelperSize = 1000;
        const gridDivisions = gridHelperSize / GRID_CELL_SIZE;
        const mainGridColor = 0x707070;
        const subGridColor = 0x505050;

        this.gridHelper = new THREE.GridHelper(gridHelperSize, gridDivisions, mainGridColor, subGridColor);
        this.gridHelper.rotation.x = Math.PI / 2;
        this.gridHelper.position.z = -0.5;
        this.gridHelper.renderOrder = 0;
        this.scene.add(this.gridHelper);

        const effectiveWidthForAnchors = VIEW_REFERENCE_HEIGHT * 1.2;
        let anchorX = effectiveWidthForAnchors * 0.4;
        anchorX = snapToGrid(anchorX, GRID_CELL_SIZE);
        this.bridgeData.loadLevelAnchors([{ x: -anchorX, y: 0 }, { x: anchorX, y: 0 }]);
        this.drawAnchorPoints();
    }

    drawAnchorPoints() {
        this.bridgeData.anchorPoints.forEach(apData => {
            let existingJoint = this.bridgeData.joints.find(j => j.x === apData.x && j.y === apData.y && j.isAnchor);
            if (!existingJoint) {
                const geometry = new THREE.CircleGeometry(ANCHOR_RADIUS, JOINT_SEGMENTS);
                const anchorMesh = new THREE.Mesh(geometry, this.anchorMaterial);
                anchorMesh.position.set(apData.x, apData.y, 0);
                anchorMesh.renderOrder = 1;
                this.scene.add(anchorMesh);
                const joint = this.bridgeData.addJoint(apData.x, apData.y, true, anchorMesh);
                anchorMesh.userData = { id: joint.id, type: 'joint' };
            }
        });
    }

    updateCameraProjection() {
        if (!this.camera || !this.renderTarget) return;
        const aspect = this.renderTarget.offsetWidth / this.renderTarget.offsetHeight;
        const worldViewHeight = VIEW_REFERENCE_HEIGHT;
        const worldViewWidth = worldViewHeight * aspect;

        this.camera.left = -worldViewWidth / 2;
        this.camera.right = worldViewWidth / 2;
        this.camera.top = worldViewHeight / 2;
        this.camera.bottom = -worldViewHeight / 2;
        this.camera.updateProjectionMatrix();
    }

    setCurrentTool(toolName) {
        this.currentTool = toolName;
        this.selectedJoint1ForMember = null;
        if (this.tempPreviewLine) {
            this.scene.remove(this.tempPreviewLine);
            this.tempPreviewLine.geometry.dispose();
            this.tempPreviewLine = null;
        }
        if (this.uiManager) this.uiManager.updateToolDisplay(toolName);
        console.log("BuildMode: Set current tool to ->", this.currentTool);
    }

    onMouseDown(event) {
        console.log("BuildMode: onMouseDown triggered. isActive:", this.isActive, "Tool:", this.currentTool);
        if (!this.isActive || event.button !== 0) {
            if (!this.isActive) console.warn("BuildMode: Mouse down ignored because mode is not active.");
            return;
        }

        const worldCoords = getMouseWorldCoordinates(event, this.camera, this.renderTarget);
        if (!worldCoords) {
            console.error("BuildMode: Could not get world coordinates from mouse event.");
            return;
        }
        const snappedX = snapToGrid(worldCoords.x, GRID_CELL_SIZE);
        const snappedY = snapToGrid(worldCoords.y, GRID_CELL_SIZE);

        switch (this.currentTool) {
            case 'add_joint':
                this.handleAddJoint(snappedX, snappedY);
                break;
            case 'add_member_blue': // Was 'add_member'
                this.handleAddMemberClick(worldCoords, 'blue'); // Pass material key
                break;
            case 'add_member_yellow': // New tool
                this.handleAddMemberClick(worldCoords, 'yellow'); // Pass material key
                break;
            case 'delete':
                this.handleDeleteClick(worldCoords);
                break;
            default:
                console.log("BuildMode: No valid tool selected or tool is 'none'.");
        }
        this.updateUI();
    }

    onMouseMove(event) {
        if (!this.isActive) return;
        if ((this.currentTool === 'add_member_blue' || this.currentTool === 'add_member_yellow') && this.selectedJoint1ForMember) {
            const worldCoords = getMouseWorldCoordinates(event, this.camera, this.renderTarget);
            if (!worldCoords) return;

            if (this.tempPreviewLine) {
                this.scene.remove(this.tempPreviewLine);
                this.tempPreviewLine.geometry.dispose();
                this.tempPreviewLine = null; // Important to nullify after dispose
            }

            const points = [];
            const j1Data = this.bridgeData.getJointById(this.selectedJoint1ForMember.userData.id);
            if (j1Data) {
                points.push(new THREE.Vector3(j1Data.x, j1Data.y, 0.2)); 
                points.push(new THREE.Vector3(worldCoords.x, worldCoords.y, 0.2));

                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                geometry.computeLineDistances(); // Required for LineDashedMaterial

                let previewMaterialToUse = this.previewMemberOrangeMaterial;
                if (this.currentTool === 'add_member_yellow') {
                    previewMaterialToUse = this.previewMemberYellowMaterial;
                }

                this.tempPreviewLine = new THREE.Line(geometry, previewMaterialToUse);
                this.tempPreviewLine.renderOrder = 3; 
                this.scene.add(this.tempPreviewLine);
            }
        }
    }

    handleAddJoint(x, y) {
        console.log(`BuildMode: handleAddJoint called with x: ${x}, y: ${y}`);
        const epsilon = 0.001;
        const existing = this.bridgeData.joints.find(j => Math.abs(j.x - x) < epsilon && Math.abs(j.y - y) < epsilon);
        if (existing) {
            console.warn("BuildMode: Joint already exists at this position.", existing);
            return;
        }

        const geometry = new THREE.CircleGeometry(JOINT_RADIUS, JOINT_SEGMENTS);
        const jointMesh = new THREE.Mesh(geometry, this.jointMaterial);
        jointMesh.position.set(x, y, 0); 
        jointMesh.renderOrder = 1;      
        this.scene.add(jointMesh);

        const jointData = this.bridgeData.addJoint(x, y, false, jointMesh);
        if (jointData) {
            jointMesh.userData = { id: jointData.id, type: 'joint' };
        } else {
            this.scene.remove(jointMesh); // Clean up if addJoint failed (should not happen with current logic)
            geometry.dispose();
        }
    }

    handleAddMemberClick(worldCoords, materialKey = 'blue') { // materialKey: 'blue' or 'yellow'
        const clickedJointMesh = this.pickObject(worldCoords, 'joint');

        if (!clickedJointMesh) {
            if (this.selectedJoint1ForMember) {
                 this.selectedJoint1ForMember = null;
                 if (this.tempPreviewLine) {
                    this.scene.remove(this.tempPreviewLine);
                    this.tempPreviewLine.geometry.dispose();
                    this.tempPreviewLine = null;
                }
            }
            return;
        }

        if (!this.selectedJoint1ForMember) {
            this.selectedJoint1ForMember = clickedJointMesh;
        } else {
            const joint1_id = this.selectedJoint1ForMember.userData.id;
            const joint2_id = clickedJointMesh.userData.id;

            if (joint1_id === joint2_id) return; // Cannot connect to self

            const j1Data = this.bridgeData.getJointById(joint1_id);
            const j2Data = this.bridgeData.getJointById(joint2_id);

            if (!j1Data || !j2Data) {
                this.selectedJoint1ForMember = null;
                 if (this.tempPreviewLine) {
                    this.scene.remove(this.tempPreviewLine);
                    this.tempPreviewLine.geometry.dispose();
                    this.tempPreviewLine = null;
                 }
                return;
            }

            // Pass materialKey to BridgeData
            const memberData = this.bridgeData.addMember(joint1_id, joint2_id, materialKey);
            if (memberData) {
                const p1 = new THREE.Vector3(j1Data.x, j1Data.y, 0.1);
                const p2 = new THREE.Vector3(j2Data.x, j2Data.y, 0.1);

                const curve = new THREE.LineCurve3(p1, p2);
                const tubeGeometry = new THREE.TubeGeometry(
                    curve, MEMBER_SEGMENTS_TUBULAR, MEMBER_THICKNESS_RADIUS, MEMBER_SEGMENTS_RADIAL, false
                );

                let chosenMaterial = this.memberBlueMaterial; // Default
                if (materialKey === 'yellow') {
                    chosenMaterial = this.memberYellowMaterial;
                }
                
                const memberMesh = new THREE.Mesh(tubeGeometry, chosenMaterial);
                memberMesh.renderOrder = 2;
                this.scene.add(memberMesh);

                memberData.threeObject = memberMesh; // Store mesh reference
                memberMesh.userData = { id: memberData.id, type: 'member' };
            }

            this.selectedJoint1ForMember = null;
            if (this.tempPreviewLine) {
                this.scene.remove(this.tempPreviewLine);
                this.tempPreviewLine.geometry.dispose();
                this.tempPreviewLine = null;
            }
        }
    }

    handleDeleteClick(worldCoords) {
        const clickedObject = this.pickObject(worldCoords); 

        if (clickedObject) {
            const { id, type } = clickedObject.userData;
            if (type === 'joint') {
                const joint = this.bridgeData.getJointById(id);
                if (joint && joint.isAnchor) {
                    console.warn("BuildMode: Cannot delete anchor points.");
                    return;
                }
                // Removing joint will also remove its associated members and their threeObjects
                this.bridgeData.removeJoint(id); 
            } else if (type === 'member') {
                // To delete members directly, pickObject would need raycasting against TubeGeometry.
                // For now, members are deleted when their joints are deleted.
                // If direct member deletion is desired: this.bridgeData.removeMember(id);
                console.warn("BuildMode: Direct member deletion by clicking member is not fully implemented yet. Delete connected joints.");
            }
        }
    }

    pickObject(worldCoords, targetType = null) {
        let closestObject = null;
        let minDistanceSq = Infinity;
        const clickPos = new THREE.Vector2(worldCoords.x, worldCoords.y);
        const pickSensitivityFactor = 1.5;

        this.scene.children.forEach(child => {
            if (child.userData && child.userData.id !== undefined && child.visible && child.isMesh) {
                if (targetType && child.userData.type !== targetType) return;

                if (child.userData.type === 'joint') {
                    const jointPos = new THREE.Vector2(child.position.x, child.position.y);
                    const distSq = clickPos.distanceToSquared(jointPos);
                    let actualRadius = JOINT_RADIUS;
                    const jointData = this.bridgeData.getJointById(child.userData.id);
                    if (jointData && jointData.isAnchor) {
                        actualRadius = ANCHOR_RADIUS;
                    }
                    const effectivePickRadiusSq = (actualRadius * pickSensitivityFactor) ** 2;
                    if (distSq < effectivePickRadiusSq && distSq < minDistanceSq) {
                        minDistanceSq = distSq;
                        closestObject = child;
                    }
                }
                // Picking members directly would require raycasting.
                // For now, this only picks joints.
            }
        });
        return closestObject;
    }

    resetBridge() {
        console.log("BuildMode: Resetting bridge...");
        this.bridgeData.clearAll(); // This also removes threeObjects from scene
        this.drawAnchorPoints(); // Re-add anchor visuals
        this.selectedJoint1ForMember = null;
        if (this.tempPreviewLine) {
            this.scene.remove(this.tempPreviewLine);
            this.tempPreviewLine.geometry.dispose();
            this.tempPreviewLine = null;
        }
        this.updateUI();
        console.log("BuildMode: Bridge reset complete.");
    }

    updateUI() {
        if (this.uiManager) {
            const nonAnchorJoints = this.bridgeData.joints.filter(j => !j.isAnchor).length;
            this.uiManager.updateCounts(nonAnchorJoints, this.bridgeData.members.length);
        }
    }

    render() {
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    dispose() {
        console.log("BuildMode: Disposing...");
        this.deactivate();
        // Materials and geometries are managed by THREE.js garbage collection
        // if not explicitly disposed, but it's good practice for complex objects.
        // For this example, letting bridgeData.clearAll() handle mesh removal is sufficient.
        console.log("BuildMode disposed.");
    }
}