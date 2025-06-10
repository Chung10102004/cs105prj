// src/UIManager.js

// Manages HTML UI elements
export class UIManager {
    constructor(buildModeInstance) {
        this.buildMode = buildModeInstance;
        this.gameManager = null; // Sẽ được set từ main.js

        this.toolAddJointButton = document.getElementById('tool-add-joint');
        this.toolAddMemberButton = document.getElementById('tool-add-member');
        this.toolAddMember2Button = document.getElementById('tool-add-member-2'); // NEW
        this.toolDeleteButton = document.getElementById('tool-delete');
        this.playButton = document.getElementById('play-button');
        this.resetBridgeButton = document.getElementById('reset-button');

        this.simPlayResetCarButton = null;

        this.currentToolDisplay = document.getElementById('current-tool-display');
        this.jointCountDisplay = document.getElementById('joint-count');
        this.memberCountDisplay = document.getElementById('member-count');

        this.activeToolButton = null;
        this.initEventListeners();
    }

    setGameManager(manager) {
        this.gameManager = manager;
    }

    initEventListeners() {
        this.toolAddJointButton.addEventListener('click', () => {
            if (this.buildMode) this.buildMode.setCurrentTool('add_joint');
        });
        this.toolAddMemberButton.addEventListener('click', () => { // Original "Add Member" button
            if (this.buildMode) this.buildMode.setCurrentTool('add_member_blue');
        });
        this.toolAddMember2Button.addEventListener('click', () => { // New "Add Member 2" button
            if (this.buildMode) this.buildMode.setCurrentTool('add_member_yellow');
        });
        this.toolDeleteButton.addEventListener('click', () => {
            if (this.buildMode) this.buildMode.setCurrentTool('delete');
        });

        this.playButton.addEventListener('click', () => {
            console.log("UIManager: Play/Edit button clicked.");
            if (this.gameManager) {
                if (this.gameManager.currentMode === 'build') {
                    this.gameManager.startSimulation();
                    this.playButton.textContent = "Edit Bridge";
                    this.showSimulationControls(true);
                } else if (this.gameManager.currentMode === 'simulate') {
                    this.gameManager.switchToBuildMode();
                    this.playButton.textContent = "Play Simulation";
                    this.showSimulationControls(false);
                }
            } else {
                console.error("UIManager: GameManager not available for play/edit action.");
            }
        });

        this.resetBridgeButton.addEventListener('click', () => {
            console.log("UIManager: Reset Bridge Design button clicked");
            if (this.gameManager && this.gameManager.currentMode === 'build' && this.buildMode) {
                this.buildMode.resetBridge();
            } else if (this.gameManager && this.gameManager.currentMode === 'simulate') {
                this.gameManager.switchToBuildMode();
                if (this.buildMode) this.buildMode.resetBridge();
            } else if (this.buildMode) {
                 this.buildMode.resetBridge();
            }
        });

        const toolbar = document.getElementById('toolbar');
        if (toolbar) {
            this.simPlayResetCarButton = document.createElement('button');
            this.simPlayResetCarButton.id = 'sim-run-reset-car-button';
            this.simPlayResetCarButton.textContent = 'Run Car';
            this.simPlayResetCarButton.style.display = 'none';
            toolbar.appendChild(this.simPlayResetCarButton);

            this.simPlayResetCarButton.addEventListener('click', () => {
                if (this.gameManager && this.gameManager.simulationModeInstance) {
                    this.gameManager.simulationModeInstance.handlePlayReset();
                } else {
                    console.warn("UIManager: Cannot run/reset car, simulation mode or game manager not ready.");
                }
            });
        } else {
            console.error("UIManager: Toolbar element not found, cannot add simulation car control button.");
        }
    }

    showSimulationControls(show) {
        if (this.simPlayResetCarButton) {
            this.simPlayResetCarButton.style.display = show ? 'inline-block' : 'none';
            if (show) {
                this.updateSimCarButtonText();
            }
        }
    }

    updateSimCarButtonText() {
        if (this.gameManager && this.gameManager.simulationModeInstance && this.simPlayResetCarButton) {
            if (this.gameManager.simulationModeInstance.isCarRunning) {
                this.simPlayResetCarButton.textContent = 'Reset Car';
            } else {
                if (this.gameManager.simulationModeInstance.hasCarCompletedRun) {
                    this.simPlayResetCarButton.textContent = 'Run Again';
                } else {
                    this.simPlayResetCarButton.textContent = 'Run Car';
                }
            }
        } else if (this.simPlayResetCarButton) {
            this.simPlayResetCarButton.textContent = 'Run Car';
        }
    }


    updateToolDisplay(toolName) {
        let displayToolName = toolName;
        if (toolName === 'add_member_blue') {
            displayToolName = 'Add Member';
        } else if (toolName === 'add_member_yellow') {
            displayToolName = 'Add Member 2';
        }

        if (this.currentToolDisplay) {
            this.currentToolDisplay.textContent = displayToolName.replace(/_/g, ' ').toUpperCase();
        }

        if (this.activeToolButton) {
            this.activeToolButton.classList.remove('active');
        }

        switch (toolName.toLowerCase()) {
            case 'add_joint':
                this.activeToolButton = this.toolAddJointButton;
                break;
            case 'add_member_blue': // Internal name for original "Add Member"
                this.activeToolButton = this.toolAddMemberButton;
                break;
            case 'add_member_yellow': // Internal name for "Add Member 2"
                this.activeToolButton = this.toolAddMember2Button;
                break;
            case 'delete':
                this.activeToolButton = this.toolDeleteButton;
                break;
            default:
                this.activeToolButton = null;
        }

        if (this.activeToolButton) {
            this.activeToolButton.classList.add('active');
        }
    }

    updateCounts(jointCount, memberCount) {
        if (this.jointCountDisplay) this.jointCountDisplay.textContent = jointCount;
        if (this.memberCountDisplay) this.memberCountDisplay.textContent = memberCount;
    }
}