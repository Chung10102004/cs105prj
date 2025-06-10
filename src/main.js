// src/main.js
import * as THREE from 'three';
import { BuildMode } from './BuildMode.js';
import { UIManager } from './UIManager.js';
import { SimulationMode } from './SimulationMode.js';

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
        this.renderer.useLegacyLights = false;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.shadowMap.enabled = true; // Enable shadows
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
        this.renderTargetElement.appendChild(this.renderer.domElement);

        this.buildModeInstance = new BuildMode(this.renderTargetElement);
        this.uiManagerInstance = new UIManager(this.buildModeInstance);
        this.uiManagerInstance.setGameManager(this);

        this.buildModeInstance.setRenderer(this.renderer);
        this.buildModeInstance.setUIManager(this.uiManagerInstance);

        this.switchToBuildMode();
        this.animate();
        window.addEventListener('resize', this.onWindowResize.bind(this), false);
    }

    switchToBuildMode() {
        console.log("Game: Switching to Build Mode");
        if (this.currentMode === 'simulate' && this.simulationModeInstance) {
            this.simulationModeInstance.deactivate();
            this.simulationModeInstance.dispose();
            this.simulationModeInstance = null;
        }

        this.currentMode = 'build';
        if (this.buildModeInstance) {
            this.buildModeInstance.activate();
            this.buildModeInstance.setCurrentTool('add_joint'); // Default tool
        }

        if (this.uiManagerInstance) {
            this.uiManagerInstance.playButton.textContent = "Play Simulation";
            this.uiManagerInstance.showSimulationControls(false); // Hide sim-specific buttons
        }
        this.onWindowResize(); // Update camera for build mode
    }

    startSimulation() {
        if (!this.buildModeInstance) {
            console.error("Game: Cannot start simulation, BuildMode not ready.");
            return;
        }
        const bridgeData = this.buildModeInstance.bridgeData.getBridgeDataForSimulation();
        console.log("Game: Starting simulation with bridge data:", bridgeData);

        if (this.currentMode === 'build' && this.buildModeInstance) {
            this.buildModeInstance.deactivate();
        }
        if (this.simulationModeInstance) {
            this.simulationModeInstance.dispose(); // Clean up old sim if any
            this.simulationModeInstance = null;
        }

        this.currentMode = 'simulate';
        this.simulationModeInstance = new SimulationMode(this.renderTargetElement, bridgeData);
        this.simulationModeInstance.setRenderer(this.renderer);
        // SimulationMode's constructor now calls loadMapModel, which chains to addCar,
        // and then calls this.resetCar() internally to position it and set initial button state.

        // Activate AFTER instance is fully constructed and car is potentially reset
        this.simulationModeInstance.activate(); 

        if (this.uiManagerInstance) {
            this.uiManagerInstance.playButton.textContent = "Edit Bridge";
            this.uiManagerInstance.showSimulationControls(true); // Show sim-specific buttons
            this.uiManagerInstance.updateSimCarButtonText(); // Set initial text for "Run Car"
        }
        this.onWindowResize(); // Update camera for sim mode
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        const deltaTime = this.clock.getDelta();

        if (!this.renderer) return;

        if (this.currentMode === 'build' && this.buildModeInstance) {
            this.buildModeInstance.render();
        } else if (this.currentMode === 'simulate' && this.simulationModeInstance) {
            this.simulationModeInstance.update(deltaTime);
            this.simulationModeInstance.render();
            
            // Crucially, update the car run/reset button text based on simulation state
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

        if (this.currentMode === 'build' && this.buildModeInstance && this.buildModeInstance.camera) {
            this.buildModeInstance.updateCameraProjection();
        } else if (this.currentMode === 'simulate' && this.simulationModeInstance && this.simulationModeInstance.camera) {
            this.simulationModeInstance.camera.aspect = width / height;
            this.simulationModeInstance.camera.updateProjectionMatrix();
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    window.polyBridgeGame = game;
});