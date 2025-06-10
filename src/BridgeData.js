// src/BridgeData.js
import { generateId } from './utils.js';

export class BridgeData {
    constructor() {
        this.joints = []; // { id, x, y, isAnchor, threeObject }
        this.members = []; // { id, joint1_id, joint2_id, materialType, threeObject }
        this.anchorPoints = []; // Predefined anchor points for a level { x, y }
    }

    addJoint(x, y, isAnchor = false, threeObject = null) {
        const id = generateId();
        const joint = { id, x, y, isAnchor, threeObject };
        this.joints.push(joint);
        // console.log(`BridgeData: Added joint ${id} at (${x}, ${y})`);
        return joint;
    }

    addMember(joint1_id, joint2_id, materialType = 'wood', threeObject = null) {
        // Basic validation: prevent self-loops or duplicate members
        if (joint1_id === joint2_id) {
            console.warn("BridgeData: Cannot create member between the same joint.");
            return null;
        }
        if (this.findMember(joint1_id, joint2_id)) {
            console.warn("BridgeData: Member already exists between these joints.");
            return null;
        }

        const id = generateId();
        // materialType (e.g., 'blue', 'yellow') will be stored as passed from BuildMode
        const member = { id, joint1_id, joint2_id, materialType, threeObject };
        this.members.push(member);
        console.log(`BridgeData: Added member ${id} between ${joint1_id} and ${joint2_id} with materialType: ${materialType}`);
        return member;
    }

    getJointById(id) {
        return this.joints.find(j => j.id === id);
    }

    getMemberById(id) {
        return this.members.find(m => m.id === id);
    }

    findMember(joint1_id, joint2_id) {
        return this.members.find(
            m => (m.joint1_id === joint1_id && m.joint2_id === joint2_id) ||
                 (m.joint1_id === joint2_id && m.joint2_id === joint1_id)
        );
    }

    removeJoint(jointId) {
        const jointToRemove = this.getJointById(jointId);
        if (!jointToRemove) {
            console.warn(`BridgeData: Joint ${jointId} not found for removal.`);
            return false;
        }
        if (jointToRemove.isAnchor) {
            console.warn(`BridgeData: Cannot remove anchor joint ${jointId}.`);
            return false; // Cannot remove anchors
        }

        const initialMemberCount = this.members.length;
        // Remove associated members
        this.members = this.members.filter(member => {
            if (member.joint1_id === jointId || member.joint2_id === jointId) {
                if (member.threeObject && member.threeObject.parent) {
                    member.threeObject.parent.remove(member.threeObject);
                    if (member.threeObject.geometry) member.threeObject.geometry.dispose();
                    // Materials are typically shared, so don't dispose them here unless they are unique per object
                }
                return false;
            }
            return true;
        });
        if (this.members.length < initialMemberCount) {
            console.log(`BridgeData: Removed ${initialMemberCount - this.members.length} members associated with joint ${jointId}`);
        }

        // Remove joint
        this.joints = this.joints.filter(j => j.id !== jointId);
        if (jointToRemove.threeObject && jointToRemove.threeObject.parent) {
            jointToRemove.threeObject.parent.remove(jointToRemove.threeObject);
            if (jointToRemove.threeObject.geometry) jointToRemove.threeObject.geometry.dispose();
        }
        console.log(`BridgeData: Removed joint ${jointId}`);
        return true;
    }

    removeMember(memberId) {
        const memberToRemove = this.getMemberById(memberId);
        if (!memberToRemove) {
            console.warn(`BridgeData: Member ${memberId} not found for removal.`);
            return false;
        }

        this.members = this.members.filter(m => m.id !== memberId);
        if (memberToRemove.threeObject && memberToRemove.threeObject.parent) {
            memberToRemove.threeObject.parent.remove(memberToRemove.threeObject);
            if (memberToRemove.threeObject.geometry) memberToRemove.threeObject.geometry.dispose();
        }
        console.log(`BridgeData: Removed member ${memberId}`);
        return true;
    }

    clearAll() {
        console.log("BridgeData: Clearing all joints and members...");
        this.joints.forEach(j => {
            if (j.threeObject && j.threeObject.parent) {
                j.threeObject.parent.remove(j.threeObject);
                if (j.threeObject.geometry) j.threeObject.geometry.dispose();
            }
        });
        this.members.forEach(m => {
            if (m.threeObject && m.threeObject.parent) {
                m.threeObject.parent.remove(m.threeObject);
                if (m.threeObject.geometry) m.threeObject.geometry.dispose();
            }
        });
        this.joints = [];
        this.members = [];
        // Anchor points definition is kept. Their visual threeObjects are managed by BuildMode.
        console.log("BridgeData: All joints and members cleared.");
    }

    loadLevelAnchors(anchorData) { // anchorData = [{x,y}, {x,y}]
        this.anchorPoints = anchorData.map(p => ({ x: p.x, y: p.y }));
        // console.log("BridgeData: Loaded level anchors:", this.anchorPoints);
    }

    getBridgeDataForSimulation() {
        // SimulationMode expects an object with 'joints' and 'elements' properties.
        // 'elements' here corresponds to 'members' in BridgeData.
        const simData = {
            joints: this.joints.map(j => ({ id: j.id, x: j.x, y: j.y, isAnchor: j.isAnchor })),
            elements: this.members.map(m => ({ // Renamed 'members' to 'elements' for SimulationMode
                id: m.id,
                joint1_id: m.joint1_id,
                joint2_id: m.joint2_id,
                materialType: m.materialType // This will be 'blue' or 'yellow'
            }))
        };
        // console.log("BridgeData: Providing data for simulation:", JSON.stringify(simData, null, 2));
        return simData;
    }
}