// src/BridgeData.js
import { generateId } from './utils.js'; // Đảm bảo bạn có hàm này trong utils.js

export class BridgeData {
    constructor() {
        this.joints = []; // { id, x, y, isAnchor, threeObject }
        this.members = []; // { id, joint1_id, joint2_id, materialKey, threeObject }
        this.anchorPointData = []; // Dữ liệu gốc của anchor { x, y } - để có thể load lại
        console.log("BridgeData initialized");
    }

    addJoint(x, y, isAnchor = false, threeObject = null) {
        const id = generateId('j'); // Thêm prefix 'j' cho dễ debug
        const joint = { id, x, y, isAnchor, threeObject };
        this.joints.push(joint);
        // console.log(`BridgeData: Added joint ${id} at (${x.toFixed(2)}, ${y.toFixed(2)}), isAnchor: ${isAnchor}`);
        return joint;
    }

    addMember(joint1_id, joint2_id, materialKey = 'blue', threeObject = null) {
        // Sửa 'materialType' thành 'materialKey' cho nhất quán
        if (joint1_id === joint2_id) {
            console.warn("BridgeData: Cannot create member between the same joint.");
            return null;
        }
        if (this.findMember(joint1_id, joint2_id)) {
            console.warn(`BridgeData: Member already exists between joints ${joint1_id} and ${joint2_id}.`);
            return null;
        }

        const id = generateId('m'); // Thêm prefix 'm'
        const member = { id, joint1_id, joint2_id, materialKey, threeObject };
        this.members.push(member);
        // console.log(`BridgeData: Added member ${id} between ${joint1_id} and ${joint2_id} with materialKey: ${materialKey}`);
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
        const jointIndex = this.joints.findIndex(j => j.id === jointId);
        if (jointIndex === -1) {
            console.warn(`BridgeData: Joint ${jointId} not found for removal.`);
            return false;
        }
        
        const jointToRemove = this.joints[jointIndex];
        if (jointToRemove.isAnchor) {
            console.warn(`BridgeData: Cannot remove anchor joint ${jointId}.`);
            return false;
        }

        // Xóa threeObject của joint khỏi scene (BuildMode sẽ làm điều này qua redrawAll hoặc cụ thể)
        if (jointToRemove.threeObject && jointToRemove.threeObject.parent) {
            jointToRemove.threeObject.parent.remove(jointToRemove.threeObject);
            if (jointToRemove.threeObject.geometry) jointToRemove.threeObject.geometry.dispose();
        }
        this.joints.splice(jointIndex, 1);
        // console.log(`BridgeData: Removed joint ${jointId}`);

        // Xóa các member liên quan
        const membersToRemove = this.members.filter(member =>
            member.joint1_id === jointId || member.joint2_id === jointId
        );
        membersToRemove.forEach(member => {
            this.removeMember(member.id); // Gọi removeMember để xử lý threeObject của member
        });
        // console.log(`BridgeData: Finished removing joint ${jointId} and associated members.`);
        return true;
    }

    removeMember(memberId) {
        const memberIndex = this.members.findIndex(m => m.id === memberId);
        if (memberIndex === -1) {
            console.warn(`BridgeData: Member ${memberId} not found for removal.`);
            return false;
        }
        const memberToRemove = this.members[memberIndex];

        // Xóa threeObject của member khỏi scene (BuildMode sẽ làm điều này qua redrawAll hoặc cụ thể)
        if (memberToRemove.threeObject && memberToRemove.threeObject.parent) {
            memberToRemove.threeObject.parent.remove(memberToRemove.threeObject);
            if (memberToRemove.threeObject.geometry) memberToRemove.threeObject.geometry.dispose();
        }
        this.members.splice(memberIndex, 1);
        // console.log(`BridgeData: Removed member ${memberId}`);
        return true;
    }

    clearAll(preserveAnchors = false) { // Thêm tùy chọn giữ lại anchor
        console.log("BridgeData: Clearing data. Preserve anchors:", preserveAnchors);
        
        // Xóa threeObjects của các non-anchor joints và tất cả members
        const jointsToClear = preserveAnchors ? this.joints.filter(j => !j.isAnchor) : [...this.joints];
        
        jointsToClear.forEach(j => {
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

        if (preserveAnchors) {
            this.joints = this.joints.filter(j => j.isAnchor); // Giữ lại anchor joints
        } else {
            this.joints = [];
            this.anchorPointData = []; // Nếu không giữ anchor, xóa cả dữ liệu gốc của anchor
        }
        this.members = [];
        console.log("BridgeData: Data cleared. Joints remaining:", this.joints.length, "Members:", this.members.length);
    }

    /**
     * Loads predefined anchor point positions for a level.
     * BuildMode will be responsible for creating actual joint objects from this data.
     * @param {Array<{x: number, y: number}>} anchorData Array of {x, y} objects.
     */
    loadLevelAnchorData(anchorPositions) {
        this.anchorPointData = anchorPositions.map(p => ({ x: p.x, y: p.y }));
        console.log("BridgeData: Loaded level anchor point data:", this.anchorPointData);
        // BuildMode sẽ dùng this.anchorPointData để tạo các joints isAnchor=true
        // và thêm chúng vào this.joints bằng cách gọi this.addJoint(ap.x, ap.y, true)
    }

    /**
     * Prepares data in the format expected by SimulationMode.
     * @returns {{joints: Array, elements: Array}}
     */
    getBridgeDataForSimulation() {
        const simData = {
            joints: this.joints.map(j => ({
                id: j.id,
                x: j.x,
                y: j.y,
                isAnchor: j.isAnchor
            })),
            elements: this.members.map(m => ({
                id: m.id,
                joint1_id: m.joint1_id,
                joint2_id: m.joint2_id,
                materialKey: m.materialKey // Đảm bảo tên thuộc tính là materialKey
            }))
        };
        // console.log("BridgeData: Providing data for simulation:", JSON.stringify(simData, null, 2));
        return simData;
    }
}