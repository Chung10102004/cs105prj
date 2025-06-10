// src/main.js
import * as THREE from 'three';
import { BuildMode } from './BuildMode.js';
import { UIManager } from './UIManager.js';
import { SimulationMode } from './SimulationMode.js';
// Giả sử BridgeData được export từ BuildMode.js hoặc một file riêng
// Nếu BridgeData là một lớp riêng, bạn cần import nó:
// import { BridgeData } from './BridgeData.js'; // Nếu bạn tách BridgeData ra

class Game {
    constructor() {
        this.renderTargetElement = document.getElementById('render-target');
        if (!this.renderTargetElement) {
            console.error("FATAL: render-target element not found!");
            return;
        }
        this.renderer = null;
        this.currentMode = null; // 'build' or 'simulate'
        this.buildModeInstance = null;
        this.simulationModeInstance = null;
        this.uiManagerInstance = null;
        this.clock = new THREE.Clock();

        this.init();
    }

    init() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.renderTargetElement.offsetWidth, this.renderTargetElement.offsetHeight);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderTargetElement.appendChild(this.renderer.domElement);

        // Khởi tạo BuildMode. BuildMode sẽ tự khởi tạo BridgeData và 2 anchor mặc định bên trong nó.
        this.buildModeInstance = new BuildMode(this.renderTargetElement);

        // NẠP DỮ LIỆU ANCHOR CỦA LEVEL VÀO bridgeData.anchorPointData CỦA BUILDMODE
        // BuildMode sẽ không tự động dùng anchorPointData này để tạo joint ngay,
        // nhưng SimulationMode sẽ cần nó thông qua hàm prepareAnchorsFromLevelData.
        this.loadLevelAnchorDataIntoBridgeData();

         if (this.buildModeInstance && typeof this.buildModeInstance.prepareAnchorsFromLevelData === 'function') {
        // Gọi prepareAnchorsFromLevelData để nó thay thế các default UI anchors bằng level anchors
        // và tính lại anchorBoundingBox.
        // Hàm này không nên redraw nếu BuildMode chưa active.
        // Hoặc, chúng ta cần một hàm riêng để chỉ "set up" anchors cho lần đầu.
        // Cách đơn giản hơn là:
        this.buildModeInstance.restoreDefaultAnchors(); // Hàm này sẽ ưu tiên anchorPointData nếu có
        console.log("Game: Initialized BuildMode with level anchors (if available).");
    }
        // UIManager cần BuildMode để có thể gọi resetBridge, v.v.
        this.uiManagerInstance = new UIManager(this.buildModeInstance);
        this.uiManagerInstance.setGameManager(this); // UIManager cũng cần Game để chuyển mode

        this.buildModeInstance.setRenderer(this.renderer);
        this.buildModeInstance.setUIManager(this.uiManagerInstance); // BuildMode có thể cần UIManager

        this.switchToBuildMode(); // Bắt đầu ở chế độ build, sẽ hiển thị 2 anchor mặc định
        this.animate();
        window.addEventListener('resize', this.onWindowResize.bind(this), false);
    }

    // Hàm này nạp tọa độ anchor của level vào bridgeData.anchorPointData
    // BuildMode sẽ không tự động tạo joint từ đây.
    loadLevelAnchorDataIntoBridgeData() {
        if (this.buildModeInstance && this.buildModeInstance.bridgeData) {
            const level1Anchors = [ // 4 anchor cho level bạn muốn mô phỏng
                { x: -0.5, y: -1.3 },
                { x:  0.5, y: -1.3 },
                { x: -0.5, y:  1.3 },
                { x:  0.5, y:  1.3 }
            ];
            // Nạp vào anchorPointData.
            this.buildModeInstance.bridgeData.loadLevelAnchorData(level1Anchors);
            console.log("Game: Level anchor data loaded into BuildMode's BridgeData.anchorPointData.");
        } else {
            console.error("Game: Cannot load level anchor data, BuildMode or its BridgeData not ready.");
        }
    }

    switchToBuildMode() {
        console.log("Game: Switching to Build Mode");
        if (this.currentMode === 'simulate' && this.simulationModeInstance) {
            this.simulationModeInstance.deactivate();
            this.simulationModeInstance.dispose(); // Dọn dẹp instance cũ
            this.simulationModeInstance = null;

            // QUAN TRỌNG: Khôi phục 2 anchor mặc định cho BuildMode sau khi SimMode kết thúc
            if (this.buildModeInstance && typeof this.buildModeInstance.restoreDefaultAnchors === 'function') {
                this.buildModeInstance.restoreDefaultAnchors();
            } else if (this.buildModeInstance) {
                // Fallback nếu restoreDefaultAnchors không có: clear và re-init anchors mặc định
                this.buildModeInstance.bridgeData.clearAll(false);
                this.buildModeInstance.initSceneAndDefaultAnchors(); // Đảm bảo hàm này chỉ tạo anchor nếu chưa có
            }
        }

        this.currentMode = 'build';
        if (!this.buildModeInstance) {
            console.error("Game: BuildMode instance is unexpectedly null during switchToBuildMode.");
            this.buildModeInstance = new BuildMode(this.renderTargetElement); // Khởi tạo lại nếu cần
            this.loadLevelAnchorDataIntoBridgeData(); // Load lại data level cho instance mới
            this.buildModeInstance.setRenderer(this.renderer);
            this.buildModeInstance.setUIManager(this.uiManagerInstance);
            if(this.uiManagerInstance) this.uiManagerInstance.buildMode = this.buildModeInstance;
        }

        this.buildModeInstance.activate(); // Kích hoạt BuildMode, nó sẽ vẽ 2 anchor mặc định của nó

        if (this.uiManagerInstance) {
            this.uiManagerInstance.playButton.textContent = "Play Simulation";
            this.uiManagerInstance.showSimulationControls(false);
        }
        this.onWindowResize();
    }

    startSimulation() {
        if (!this.buildModeInstance || !this.buildModeInstance.bridgeData) {
            console.error("Game: Cannot start simulation, BuildMode or its bridgeData not ready.");
            return;
        }

        // TRƯỚC KHI VÀO SIMULATION MODE, YÊU CẦU BUILDMODE CẬP NHẬT JOINTS CỦA NÓ
        // ĐỂ SỬ DỤNG ANCHOR TỪ anchorPointData (4 điểm của level)
        if (typeof this.buildModeInstance.prepareAnchorsFromLevelData === 'function') {
            this.buildModeInstance.prepareAnchorsFromLevelData();
        } else {
            console.warn("Game: buildModeInstance.prepareAnchorsFromLevelData is not a function. Simulation might use default anchors.");
            // Fallback: Nếu hàm không tồn tại, SimMode sẽ dùng bất cứ anchor nào đang có trong bridgeData.joints
        }


        // Bây giờ bridgeDataInstance sẽ có các joints bao gồm 4 anchor của level (nếu prepareAnchorsFromLevelData chạy đúng)
        const bridgeDataInstance = this.buildModeInstance.bridgeData;
        console.log("Game: Starting simulation. Passing BridgeData instance.");
        // Log để kiểm tra các joints sẽ được dùng cho SimulationMode
        // console.log("Joints being passed to SimMode:", JSON.stringify(
        //     bridgeDataInstance.joints.filter(j => j.isAnchor).map(j=>({id:j.id, x:j.x, y:j.y}))
        // ));


        if (this.currentMode === 'build' && this.buildModeInstance) {
            this.buildModeInstance.deactivate(); // Deactivate BuildMode UI/interactions, không dispose
        }
        if (this.simulationModeInstance) { // Dọn dẹp instance SimMode cũ nếu có
            this.simulationModeInstance.dispose();
            this.simulationModeInstance = null;
        }

        this.currentMode = 'simulate';
        // Truyền bridgeDataInstance (đã được chuẩn bị với 4 anchor) vào constructor của SimulationMode
        this.simulationModeInstance = new SimulationMode(this.renderTargetElement, bridgeDataInstance);
        this.simulationModeInstance.setRenderer(this.renderer);

        this.simulationModeInstance.activate();

        if (this.uiManagerInstance) {
            this.uiManagerInstance.playButton.textContent = "Edit Bridge";
            this.uiManagerInstance.showSimulationControls(true);
            this.uiManagerInstance.updateSimCarButtonText();
        }
        this.onWindowResize();
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        const deltaTime = this.clock.getDelta();

        if (!this.renderer) return;

        if (this.currentMode === 'build' && this.buildModeInstance && this.buildModeInstance.isActive) {
            this.buildModeInstance.render();
        } else if (this.currentMode === 'simulate' && this.simulationModeInstance && this.simulationModeInstance.isActive) {
            this.simulationModeInstance.update(deltaTime);
            this.simulationModeInstance.render();

            if (this.uiManagerInstance) {
                this.uiManagerInstance.updateSimCarButtonText();
            }
        }
    }

    onWindowResize() {
        if (!this.renderTargetElement || !this.renderer) return;
        const width = this.renderTargetElement.offsetWidth;
        const height = this.renderTargetElement.offsetHeight;
        this.renderer.setSize(width, height);

        if (this.currentMode === 'build' && this.buildModeInstance && this.buildModeInstance.camera && this.buildModeInstance.isActive) {
            this.buildModeInstance.updateCameraProjection();
        } else if (this.currentMode === 'simulate' && this.simulationModeInstance && this.simulationModeInstance.camera && this.simulationModeInstance.isActive) {
            this.simulationModeInstance.camera.aspect = width / height;
            this.simulationModeInstance.camera.updateProjectionMatrix();
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    window.polyBridgeGame = game; // Expose for debugging if needed
});