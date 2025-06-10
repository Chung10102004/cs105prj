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
const MEMBER_BLUE_COLOR = 0x0000ff;
const MEMBER_YELLOW_COLOR = 0xffff00;

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
        this.anchorBoundingBox = null; // To store the bounding box of initial anchors

        this.anchorMaterial = new THREE.MeshBasicMaterial({ color: ANCHOR_COLOR, depthTest: false, transparent: true, opacity: 0.9 });
        this.jointMaterial = new THREE.MeshBasicMaterial({ color: JOINT_COLOR, depthTest: false, transparent: true, opacity: 0.9 });
        this.memberBlueMaterial = new THREE.MeshBasicMaterial({ color: MEMBER_BLUE_COLOR, depthTest: false, transparent: true, opacity: 0.8 });
        this.memberYellowMaterial = new THREE.MeshBasicMaterial({ color: MEMBER_YELLOW_COLOR, depthTest: false, transparent: true, opacity: 0.8 });
        this.previewMemberOrangeMaterial = new THREE.LineDashedMaterial({
            color: 0xffa500, linewidth: 2, scale: 1, dashSize: 0.5, gapSize: 0.25, depthTest: false
        });
        this.previewMemberYellowMaterial = new THREE.LineDashedMaterial({
            color: 0xeeee00, linewidth: 2, scale: 1, dashSize: 0.5, gapSize: 0.25, depthTest: false
        });

        this.boundOnMouseDown = this.onMouseDown.bind(this);
        this.boundOnMouseMove = this.onMouseMove.bind(this);
        this.isActive = false;

        this.initSceneAndDefaultAnchors();
    }

    setRenderer(renderer) {
        this.renderer = renderer;
    }

    setUIManager(uiManager) {
        this.uiManager = uiManager;
        this.updateUI();
    }

    activate() {
        if (this.isActive) return;
        console.log("BuildMode Activating: renderTarget is ->", this.renderTarget);
        if (this.renderTarget) {
            this.renderTarget.addEventListener('mousedown', this.boundOnMouseDown);
            this.renderTarget.addEventListener('mousemove', this.boundOnMouseMove);
            this.isActive = true;
            console.log("BuildMode Activated. Event listeners added.");
            this.updateCameraProjection();
            this.redrawAll(); // Will draw current anchors (default or level-specific if prepared)
            this.calculateAnchorBoundingBox(); // Calculate bounds after anchors are set
        } else {
            console.error("BuildMode Activate FAILED: renderTarget is NULL. Listeners NOT added.");
        }
    }

    deactivate() {
        if (!this.isActive) return;
        if (this.renderTarget) {
            this.renderTarget.removeEventListener('mousedown', this.boundOnMouseDown);
            this.renderTarget.removeEventListener('mousemove', this.boundOnMouseMove);
        }
        this.isActive = false;
        this.selectedJoint1ForMember = null;
        if (this.tempPreviewLine) {
            this.scene.remove(this.tempPreviewLine);
            if (this.tempPreviewLine.geometry) this.tempPreviewLine.geometry.dispose();
            this.tempPreviewLine = null;
        }
        console.log("BuildMode Deactivated. Event listeners removed.");
    }

    initSceneAndDefaultAnchors() {
        this.scene.background = new THREE.Color(0x606060);
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
        this.camera.position.z = 10;

        const gridHelperSize = 1000;
        const gridDivisions = gridHelperSize / GRID_CELL_SIZE;
        this.gridHelper = new THREE.GridHelper(gridHelperSize, gridDivisions, 0x707070, 0x505050);
        this.gridHelper.rotation.x = Math.PI / 2;
        this.gridHelper.position.z = -0.5;
        this.gridHelper.renderOrder = 0;
        this.scene.add(this.gridHelper);

        // Default UI anchors (will be replaced by level anchors later if Game.js calls prepare)
        console.log("BuildMode: Creating default 2 UI anchor joints directly into bridgeData.joints.");
        const effectiveWidthForAnchors = VIEW_REFERENCE_HEIGHT * 1.6;
        let anchorX = effectiveWidthForAnchors * 0.4;
        anchorX = snapToGrid(anchorX, GRID_CELL_SIZE);

        if (this.bridgeData.joints.filter(j => j.isAnchor).length === 0) {
            this.bridgeData.addJoint(-anchorX, 0, true, null, true); // Mark as UI anchor
            this.bridgeData.addJoint(anchorX, 0, true, null, true);  // Mark as UI anchor
            console.log(`BuildMode: Default UI anchors created at X: +/-${anchorX}`);
        }
        this.calculateAnchorBoundingBox(); // Calculate bounds for these default anchors
    }

    // Call this after anchors are loaded or changed
    calculateAnchorBoundingBox() {
        const anchorJoints = this.bridgeData.joints.filter(j => j.isAnchor && !j.isUiAnchor); // Use actual level anchors
        if (anchorJoints.length > 0) {
            this.anchorBoundingBox = new THREE.Box2();
            anchorJoints.forEach(j => this.anchorBoundingBox.expandByPoint(new THREE.Vector2(j.x, j.y)));
            console.log("BuildMode: Anchor bounding box calculated:",
                this.anchorBoundingBox.min.x, this.anchorBoundingBox.min.y,
                this.anchorBoundingBox.max.x, this.anchorBoundingBox.max.y);
        } else {
            // If no level anchors, use a default large bounding box or disable adding joints
            // For now, let's make it permissive if no level anchors are explicitly set for bounds
            const defaultSize = VIEW_REFERENCE_HEIGHT * 2;
            this.anchorBoundingBox = new THREE.Box2(
                new THREE.Vector2(-defaultSize, -defaultSize),
                new THREE.Vector2(defaultSize, defaultSize)
            );
            console.warn("BuildMode: No level anchors found for bounding box, using large default.");
        }
    }


    redrawAll() {
        const childrenToRemove = [];
        this.scene.children.forEach(child => {
            if (child !== this.gridHelper && child !== this.tempPreviewLine) {
                if (child.userData && (child.userData.type === 'joint' || child.userData.type === 'member')) {
                    childrenToRemove.push(child);
                }
            }
        });

        childrenToRemove.forEach(child => {
            this.scene.remove(child);
            if (child.geometry) child.geometry.dispose();
        });

        this.bridgeData.joints.forEach(j => j.threeObject = null);
        this.bridgeData.members.forEach(m => m.threeObject = null);

        this.bridgeData.joints.forEach(jointData => {
            // Skip UI anchors if actual level anchors are present (they get drawn by prepareAnchorsFromLevelData -> redrawAll)
            if (jointData.isUiAnchor && this.bridgeData.joints.some(j => j.isAnchor && !j.isUiAnchor)) {
                return;
            }

            const material = jointData.isAnchor ? this.anchorMaterial : this.jointMaterial;
            const radius = jointData.isAnchor ? ANCHOR_RADIUS : JOINT_RADIUS;
            const geometry = new THREE.CircleGeometry(radius, JOINT_SEGMENTS);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(jointData.x, jointData.y, 0);
            mesh.renderOrder = 1;
            mesh.userData = { id: jointData.id, type: 'joint' };
            this.scene.add(mesh);
            jointData.threeObject = mesh;
        });

        this.bridgeData.members.forEach(memberData => {
            const j1Data = this.bridgeData.getJointById(memberData.joint1_id);
            const j2Data = this.bridgeData.getJointById(memberData.joint2_id);
            if (j1Data && j2Data) {
                const p1 = new THREE.Vector3(j1Data.x, j1Data.y, 0.1);
                const p2 = new THREE.Vector3(j2Data.x, j2Data.y, 0.1);
                const curve = new THREE.LineCurve3(p1, p2);
                const tubeGeometry = new THREE.TubeGeometry(curve, MEMBER_SEGMENTS_TUBULAR, MEMBER_THICKNESS_RADIUS, MEMBER_SEGMENTS_RADIAL, false);
                let chosenMaterial = this.memberBlueMaterial;
                if (memberData.materialKey === 'yellow') {
                    chosenMaterial = this.memberYellowMaterial;
                }
                const memberMesh = new THREE.Mesh(tubeGeometry, chosenMaterial);
                memberMesh.renderOrder = 2;
                memberMesh.userData = { id: memberData.id, type: 'member' };
                this.scene.add(memberMesh);
                memberData.threeObject = memberMesh;
            }
        });
        this.updateUI();
    }

    updateCameraProjection() {
        if (!this.camera || !this.renderTarget || this.renderTarget.offsetWidth === 0 || this.renderTarget.offsetHeight === 0) return;
        const aspect = this.renderTarget.offsetWidth / this.renderTarget.offsetHeight;
        const worldViewHeight = VIEW_REFERENCE_HEIGHT;
        const worldViewWidth = worldViewHeight * aspect;
        this.camera.left = -worldViewWidth / 2; this.camera.right = worldViewWidth / 2;
        this.camera.top = worldViewHeight / 2; this.camera.bottom = -worldViewHeight / 2;
        this.camera.updateProjectionMatrix();
    }

    setCurrentTool(toolName) {
        this.currentTool = toolName;
        this.selectedJoint1ForMember = null;
        if (this.tempPreviewLine) {
            this.scene.remove(this.tempPreviewLine);
            if (this.tempPreviewLine.geometry) this.tempPreviewLine.geometry.dispose();
            this.tempPreviewLine = null;
        }
        if (this.uiManager) this.uiManager.updateToolDisplay(toolName);
        console.log("BuildMode: Set current tool to ->", this.currentTool);
    }

    onMouseDown(event) {
        if (!this.isActive || event.button !== 0) return;
        const worldCoords = getMouseWorldCoordinates(event, this.camera, this.renderTarget);
        if (!worldCoords) return;
        const snappedX = snapToGrid(worldCoords.x, GRID_CELL_SIZE);
        const snappedY = snapToGrid(worldCoords.y, GRID_CELL_SIZE);

        switch (this.currentTool) {
            case 'add_joint':
                this.handleAddJoint(snappedX, snappedY);
                break;
            case 'add_member_blue':
                this.handleAddMemberClick(worldCoords, 'blue');
                break;
            case 'add_member_yellow':
                this.handleAddMemberClick(worldCoords, 'yellow');
                break;
            case 'delete':
                this.handleDeleteClick(worldCoords);
                break;
        }
    }

    onMouseMove(event) {
        if (!this.isActive) return;
        if ((this.currentTool === 'add_member_blue' || this.currentTool === 'add_member_yellow') && this.selectedJoint1ForMember) {
            const worldCoords = getMouseWorldCoordinates(event, this.camera, this.renderTarget);
            if (!worldCoords) return;
            if (this.tempPreviewLine) {
                this.scene.remove(this.tempPreviewLine);
                if (this.tempPreviewLine.geometry) this.tempPreviewLine.geometry.dispose();
                this.tempPreviewLine = null;
            }
            const points = [];
            const j1Position = this.selectedJoint1ForMember.position;
            points.push(new THREE.Vector3(j1Position.x, j1Position.y, 0.2));
            points.push(new THREE.Vector3(worldCoords.x, worldCoords.y, 0.2));
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            geometry.computeLineDistances();
            let previewMaterialToUse = this.previewMemberOrangeMaterial;
            if (this.currentTool === 'add_member_yellow') {
                previewMaterialToUse = this.previewMemberYellowMaterial;
            }
            this.tempPreviewLine = new THREE.Line(geometry, previewMaterialToUse);
            this.tempPreviewLine.renderOrder = 3;
            this.scene.add(this.tempPreviewLine);
        }
    }

    handleAddJoint(x, y) {
        const epsilon = 0.01;
        const existing = this.bridgeData.joints.find(j => Math.abs(j.x - x) < epsilon && Math.abs(j.y - y) < epsilon);
        if (existing) {
            console.warn("BuildMode: Joint already exists at this snapped position.");
            return;
        }

        // Constrain joint placement within anchor bounding box
        // if (this.anchorBoundingBox && !this.anchorBoundingBox.containsPoint(new THREE.Vector2(x, y))) {
        //     console.warn(`BuildMode: Attempted to add joint at (${x}, ${y}) outside of anchor bounds. Joint not added.`);
        //     // Optionally, provide user feedback (e.g., a temporary red X or UI message)
        //     if (this.uiManager) this.uiManager.showTemporaryMessage("Cannot place joint outside anchor area!", "error");
        //     return;
        // }

        const jointData = this.bridgeData.addJoint(x, y, false /* isAnchor=false */);
        if (jointData) {
            this.redrawAll();
        } else {
            console.error("BuildMode: Failed to add joint to BridgeData.");
        }
    }

    handleAddMemberClick(worldCoords, materialKey = 'blue') {
        const clickedJointMesh = this.pickObject(worldCoords, 'joint');
        if (!clickedJointMesh) {
            this.selectedJoint1ForMember = null;
            if (this.tempPreviewLine) {
                this.scene.remove(this.tempPreviewLine);
                if (this.tempPreviewLine.geometry) this.tempPreviewLine.geometry.dispose();
                this.tempPreviewLine = null;
            }
            return;
        }
        if (!this.selectedJoint1ForMember) {
            this.selectedJoint1ForMember = clickedJointMesh;
        } else {
            const joint1_id = this.selectedJoint1ForMember.userData.id;
            const joint2_id = clickedJointMesh.userData.id;
            if (joint1_id === joint2_id) {
                console.warn("BuildMode: Cannot connect a joint to itself.");
                return;
            }
            const memberData = this.bridgeData.addMember(joint1_id, joint2_id, materialKey);
            if (memberData) {
                this.redrawAll();
            }
            this.selectedJoint1ForMember = null;
            if (this.tempPreviewLine) {
                this.scene.remove(this.tempPreviewLine);
                if (this.tempPreviewLine.geometry) this.tempPreviewLine.geometry.dispose();
                this.tempPreviewLine = null;
            }
        }
    }

    handleDeleteClick(worldCoords) {
        let clickedObject = this.pickObject(worldCoords, 'member');
        let success = false;
        if (clickedObject && clickedObject.userData && clickedObject.userData.type === 'member') {
            success = this.bridgeData.removeMember(clickedObject.userData.id);
        } else {
            clickedObject = this.pickObject(worldCoords, 'joint');
            if (clickedObject && clickedObject.userData && clickedObject.userData.type === 'joint') {
                const jointData = this.bridgeData.getJointById(clickedObject.userData.id);
                if (jointData && (jointData.isAnchor && !jointData.isUiAnchor) ) { // Prevent deleting actual level anchors
                    console.warn("BuildMode: Cannot delete level anchor points.");
                } else if (jointData) {
                    success = this.bridgeData.removeJoint(clickedObject.userData.id);
                }
            }
        }
        if (success) {
            this.redrawAll();
        }
    }

    pickObject(worldCoords, targetType = null) {
        let closestObject = null;
        let minDistanceSq = Infinity;
        const clickPos = new THREE.Vector2(worldCoords.x, worldCoords.y);
        const pickSensitivityFactorJoint = 2.5;
        const pickSensitivityMember = MEMBER_THICKNESS_RADIUS * 3;

        for (let i = this.scene.children.length - 1; i >= 0; i--) {
            const child = this.scene.children[i];
            if (child.userData && child.userData.id !== undefined && child.visible && child.isMesh) {
                if (targetType && child.userData.type !== targetType) continue;
                if (child.userData.type === 'joint') {
                    const jointPos = new THREE.Vector2(child.position.x, child.position.y);
                    const distSq = clickPos.distanceToSquared(jointPos);
                    let actualRadius = JOINT_RADIUS;
                    const jointData = this.bridgeData.getJointById(child.userData.id);
                    if (jointData && jointData.isAnchor) {
                        actualRadius = ANCHOR_RADIUS;
                    }
                    const effectivePickRadiusSq = (actualRadius * pickSensitivityFactorJoint) ** 2;
                    if (distSq < effectivePickRadiusSq && distSq < minDistanceSq) {
                        minDistanceSq = distSq;
                        closestObject = child;
                    }
                } else if (child.userData.type === 'member') {
                    const memberData = this.bridgeData.getMemberById(child.userData.id);
                    if (memberData) {
                        const j1 = this.bridgeData.getJointById(memberData.joint1_id);
                        const j2 = this.bridgeData.getJointById(memberData.joint2_id);
                        if (j1 && j2) {
                            const p1Vec2 = new THREE.Vector2(j1.x, j1.y);
                            const p2Vec2 = new THREE.Vector2(j2.x, j2.y);
                            const l2 = p1Vec2.distanceToSquared(p2Vec2);
                            if (l2 === 0) continue;
                            let t = ((clickPos.x - p1Vec2.x) * (p2Vec2.x - p1Vec2.x) + (clickPos.y - p1Vec2.y) * (p2Vec2.y - p1Vec2.y)) / l2;
                            t = Math.max(0, Math.min(1, t));
                            const closestPointOnSegment = new THREE.Vector2(
                                p1Vec2.x + t * (p2Vec2.x - p1Vec2.x),
                                p1Vec2.y + t * (p2Vec2.y - p1Vec2.y)
                            );
                            const distSqToSegment = clickPos.distanceToSquared(closestPointOnSegment);
                            if (distSqToSegment < (pickSensitivityMember ** 2) && distSqToSegment < minDistanceSq) {
                                minDistanceSq = distSqToSegment;
                                closestObject = child;
                            }
                        }
                    }
                }
            }
        }
        return closestObject;
    }

    resetBridge() {
        console.log("BuildMode: Resetting bridge...");
        // Keep level anchors (from anchorPointData), remove everything else
        const levelAnchorsToRestore = [...this.bridgeData.anchorPointData];

        this.bridgeData.clearAll(false); // Clear everything including UI anchors

        // Re-add level anchors from anchorPointData if they exist
        if (levelAnchorsToRestore.length > 0) {
            levelAnchorsToRestore.forEach(apData => {
                this.bridgeData.addJoint(apData.x, apData.y, true /* isAnchor */, null, false /* not UI anchor */);
            });
            console.log("BuildMode: Level anchors restored from anchorPointData.");
        } else {
            // If no level anchors were ever loaded, restore default UI anchors
            const effectiveWidthForAnchors = VIEW_REFERENCE_HEIGHT * 1.6;
            let anchorX = effectiveWidthForAnchors * 0.4;
            anchorX = snapToGrid(anchorX, GRID_CELL_SIZE);
            this.bridgeData.addJoint(-anchorX, 0, true, null, true); // UI anchor
            this.bridgeData.addJoint(anchorX, 0, true, null, true);  // UI anchor
            console.log("BuildMode: No level anchors to restore, default UI anchors reset.");
        }

        this.selectedJoint1ForMember = null;
        if (this.tempPreviewLine) {
            this.scene.remove(this.tempPreviewLine);
            if (this.tempPreviewLine.geometry) this.tempPreviewLine.geometry.dispose();
            this.tempPreviewLine = null;
        }
        this.redrawAll();
        this.calculateAnchorBoundingBox(); // Recalculate bounds
        console.log("BuildMode: Bridge reset complete.");
    }

    updateUI() {
        if (this.uiManager) {
            const nonAnchorJointsCount = this.bridgeData.joints.filter(j => !j.isAnchor).length;
            this.uiManager.updateCounts(nonAnchorJointsCount, this.bridgeData.members.length);
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
        this.bridgeData.clearAll(false); // Clear all, including any type of anchors
        if(this.gridHelper) {
            if(this.gridHelper.parent) this.scene.remove(this.gridHelper);
            if(this.gridHelper.geometry) this.gridHelper.geometry.dispose();
            this.gridHelper = null;
        }
        if(this.tempPreviewLine){
             if(this.tempPreviewLine.parent) this.scene.remove(this.tempPreviewLine);
             if(this.tempPreviewLine.geometry) this.tempPreviewLine.geometry.dispose();
             this.tempPreviewLine = null;
        }
        if (this.anchorMaterial) this.anchorMaterial.dispose();
        if (this.jointMaterial) this.jointMaterial.dispose();
        if (this.memberBlueMaterial) this.memberBlueMaterial.dispose();
        if (this.memberYellowMaterial) this.memberYellowMaterial.dispose();
        if (this.previewMemberOrangeMaterial) this.previewMemberOrangeMaterial.dispose();
        if (this.previewMemberYellowMaterial) this.previewMemberYellowMaterial.dispose();
        this.anchorMaterial = this.jointMaterial = this.memberBlueMaterial = this.memberYellowMaterial = this.previewMemberOrangeMaterial = this.previewMemberYellowMaterial = null;
        while(this.scene.children.length > 0){
            const child = this.scene.children[0];
            this.scene.remove(child);
            if(child.geometry) child.geometry.dispose();
        }
        console.log("BuildMode disposed.");
    }

    // Called by Game.js BEFORE switching to SimulationMode
    prepareAnchorsFromLevelData() {
        if (this.bridgeData && this.bridgeData.anchorPointData && this.bridgeData.anchorPointData.length > 0) {
            console.log("BuildMode: Preparing anchors from level data (anchorPointData).");

            // 1. Clear existing joints that are anchors (could be UI anchors or previously loaded level anchors)
            const existingAnchorMeshesToRemove = [];
            this.bridgeData.joints = this.bridgeData.joints.filter(j => {
                if (j.isAnchor) { // Remove any existing anchor
                    if (j.threeObject && j.threeObject.parent) {
                        existingAnchorMeshesToRemove.push(j.threeObject);
                    }
                    return false;
                }
                return true; // Keep non-anchor joints
            });
            existingAnchorMeshesToRemove.forEach(mesh => {
                this.scene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
            });

            // 2. Add new anchor joints from anchorPointData. These are the definitive level anchors.
            this.bridgeData.anchorPointData.forEach(apData => {
                // Add as isAnchor=true, and NOT a UI anchor.
                this.bridgeData.addJoint(apData.x, apData.y, true, null, false);
            });

            this.calculateAnchorBoundingBox(); // Crucial: update bounding box based on these level anchors
            // No redrawAll here; SimulationMode will handle its own drawing.
            // BuildMode will redraw when reactivated.
            console.log("BuildMode: Anchors replaced with level data. Total joints:", this.bridgeData.joints.length);
        } else {
            console.log("BuildMode: No level-specific anchorPointData. Simulation will use existing/default anchors and bounds.");
            // If there's no level data, calculateAnchorBoundingBox() will use defaults or existing UI anchors
            this.calculateAnchorBoundingBox();
        }
    }

    // Called by Game.js AFTER SimulationMode, to go back to BuildMode editing
    restoreDefaultAnchors() {
        console.log("BuildMode: Restoring anchors for build editing.");
        // 1. Clear all joints and members. anchorPointData (level definition) remains.
        this.bridgeData.clearAll(false); // false to remove everything

        // 2. If anchorPointData (level definition) exists, add those as the current anchors for editing
        if (this.bridgeData.anchorPointData && this.bridgeData.anchorPointData.length > 0) {
            this.bridgeData.anchorPointData.forEach(apData => {
                this.bridgeData.addJoint(apData.x, apData.y, true, null, false); // Level anchors
            });
            console.log("BuildMode: Restored level anchors from anchorPointData for editing.");
        } else {
            // 3. If no anchorPointData (no level loaded), add the default UI anchors.
            const effectiveWidthForAnchors = VIEW_REFERENCE_HEIGHT * 1.6;
            let anchorX = effectiveWidthForAnchors * 0.4;
            anchorX = snapToGrid(anchorX, GRID_CELL_SIZE);
            this.bridgeData.addJoint(-anchorX, 0, true, null, true); // UI anchor
            this.bridgeData.addJoint(anchorX, 0, true, null, true);  // UI anchor
            console.log("BuildMode: No level data, restored default UI anchors.");
        }
        this.calculateAnchorBoundingBox(); // Recalculate bounds
        // redrawAll() will be called by activate() when BuildMode is switched back to.
        console.log("BuildMode: Anchors restored for editing. Total joints:", this.bridgeData.joints.length);
    }
}