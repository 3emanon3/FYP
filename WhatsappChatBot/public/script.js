const API_BASE = '/api';
let blocks = [];
let nextId = 1;
let draggedElement = null;

// DOM Elements
let serviceControlButton;
let serviceModal;
let ngrokUrlDisplay;

// Sidebar functionality
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
}

// Close sidebar when clicking outside
document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    
    if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
        sidebar.classList.remove('open');
    }
});

// Utility functions
function showLoading() {
    document.getElementById('loading').classList.add('show');
}

function hideLoading() {
    document.getElementById('loading').classList.remove('show');
}

function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    errorEl.textContent = message;
    errorEl.classList.add('show');
    setTimeout(() => errorEl.classList.remove('show'), 5000);
}

function showSuccess(message) {
    const successEl = document.getElementById('successMessage');
    successEl.textContent = message;
    successEl.classList.add('show');
    setTimeout(() => successEl.classList.remove('show'), 3000);
}

// Service Management Functions
async function toggleService() {
    const isRunning = serviceControlButton.classList.contains('active');
    if (isRunning) {
        await stopService();
    } else {
        await startService();
    }
}

async function startService() {
    showLoading();
    try {
        const response = await fetch(`${API_BASE}/service/start`);
        const data = await response.json();

        if (!response.ok) {
            if (data.url) {
                showServiceModal(data.url);
                updateServiceUi(true);
            }
            throw new Error(data.error || 'Failed to start services');
        }

        showSuccess(data.message);
        showServiceModal(data.url);
        updateServiceUi(true);

    } catch (error) {
        showError(error.message);
        updateServiceUi(false);
    } finally {
        hideLoading();
    }
}

async function stopService() {
    showLoading();
    try {
        const response = await fetch(`${API_BASE}/service/stop`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to stop services');
        }

        showSuccess(data.message);
        hideServiceModal();
        updateServiceUi(false);

    } catch (error) {
        showError(error.message);
    } finally {
        hideLoading();
    }
}

async function checkServiceStatus() {
    try {
        const response = await fetch(`${API_BASE}/service/status`);
        if (!response.ok) return;

        const data = await response.json();
        if (data.status === 'running' && data.ngrokService.url) {
            showServiceModal(data.ngrokService.url);
            updateServiceUi(true);
        } else {
            updateServiceUi(false);
        }
    } catch (error) {
        console.error('Could not fetch service status:', error);
        updateServiceUi(false);
    }
}

function updateServiceUi(isRunning) {
    if (isRunning) {
        serviceControlButton.textContent = 'Stop Services';
        serviceControlButton.classList.add('active');
    } else {
        serviceControlButton.textContent = 'Start Services';
        serviceControlButton.classList.remove('active');
    }
}

function showServiceModal(url) {
    ngrokUrlDisplay.value = url + '/webhook';
    serviceModal.classList.add('show');
}

function hideServiceModal() {
    serviceModal.classList.remove('show');
}

function copyUrlToClipboard() {
    ngrokUrlDisplay.select();
    ngrokUrlDisplay.setSelectionRange(0, 99999);
    try {
        document.execCommand('copy');
        showSuccess('URL copied to clipboard!');
    } catch (err) {
        showError('Failed to copy URL.');
    }
}

// API functions
async function fetchBlocks() {
    try {
        showLoading();
        const response = await fetch(`${API_BASE}/blocks`);
        if (!response.ok) throw new Error('Failed to fetch blocks');
        
        const data = await response.json();
        blocks = data;
        renderBlocks();
    } catch (error) {
        showError('Error loading blocks: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function saveBlockToDatabase(block) {
    try {
        const response = await fetch(`${API_BASE}/blocks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(block),
        });
        
        if (!response.ok) throw new Error('Failed to save block');
        return await response.json();
    } catch (error) {
        showError('Error saving block: ' + error.message);
        throw error;
    }
}

async function updateBlockInDatabase(blockId, updates) {
    try {
        const response = await fetch(`${API_BASE}/blocks/${blockId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updates),
        });
        
        if (!response.ok) throw new Error('Failed to update block');
        return await response.json();
    } catch (error) {
        showError('Error updating block: ' + error.message);
        throw error;
    }
}

async function deleteBlockFromDatabase(blockId) {
    try {
        const response = await fetch(`${API_BASE}/blocks/${blockId}`, {
            method: 'DELETE',
        });
        
        if (!response.ok) throw new Error('Failed to delete block');
        return await response.json();
    } catch (error) {
        showError('Error deleting block: ' + error.message);
        throw error;
    }
}

async function updateArrangementInDatabase(activeBlocks) {
    try {
        const blockIds = activeBlocks.map(block => ({ id: block.id }));
        
        const response = await fetch(`${API_BASE}/blocks/arrangement`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ blocks: blockIds }),
        });
        
        if (!response.ok) throw new Error('Failed to update arrangement');
        return await response.json();
    } catch (error) {
        showError('Error updating arrangement: ' + error.message);
        throw error;
    }
}

async function saveTwilioInformation() {
    const sid = document.getElementById('twilioSid').value.trim();
    const token = document.getElementById('twilioToken').value.trim();
    const phone = document.getElementById('twilioPhone').value.trim();
    const geminiApiKeys = document.getElementById('geminiApiKeys').value.trim();

    if (!sid || !token || !phone || !geminiApiKeys) {
        showError('Please fill in all Twilio information fields.');
        return;
    }

    const payload = {
        TWILIO_ACCOUNT_SID: sid,
        TWILIO_AUTH_TOKEN: token,
        TWILIO_PHONE_NUMBER: phone,
        GEMINI_API_KEYS: geminiApiKeys
    };

    try {
        showLoading();
        const response = await fetch(`${API_BASE}/information`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error('Failed to save information');
        }

        await response.json();
        showSuccess('Twilio information saved successfully!');
    } catch (error) {
        showError(error.message);
    } finally {
        hideLoading();
    }
}

async function fetchTwilioInformation() {
    try {
        const response = await fetch(`${API_BASE}/information`);
        if (!response.ok) return;

        const data = await response.json();
        if (data) {
            document.getElementById('twilioSid').value = data.TWILIO_ACCOUNT_SID || '';
            document.getElementById('twilioToken').value = data.TWILIO_AUTH_TOKEN || '';
            document.getElementById('twilioPhone').value = data.TWILIO_PHONE_NUMBER || '';
            document.getElementById('geminiApiKeys').value = data.GEMINI_API_KEYS || '';
        }
    } catch (error) {
        console.error('Could not fetch Twilio information:', error);
    }
}

function renderBlocks() {
    const leftContainer = document.getElementById('leftBlocks');
    const rightContainer = document.getElementById('rightBlocks');
    
    leftContainer.innerHTML = '';
    rightContainer.innerHTML = '';

    const activeBlocks = blocks.filter(b => b.isActive).sort((a, b) => (a.arrangement || 0) - (b.arrangement || 0));
    const inactiveBlocks = blocks.filter(b => !b.isActive);

    activeBlocks.forEach(block => {
        const blockElement = createBlockElement(block);
        rightContainer.appendChild(blockElement);
    });

    inactiveBlocks.forEach(block => {
        const blockElement = createBlockElement(block);
        leftContainer.appendChild(blockElement);
    });
}

function createBlockElement(block) {
    const div = document.createElement('div');
    div.className = `word-block ${block.isDefault ? 'default' : 'custom'}`;
    div.draggable = true;
    div.dataset.blockId = block.id;
    
    let arrangementInputHtml = '';
    if (block.isActive) {
        arrangementInputHtml = `<input type="number" class="arrangement-input" value="${(block.arrangement || 0) + 1}" 
             onchange="updateArrangement('${block.id}', this.value)" 
             onclick="event.stopPropagation()" 
             min="1">`;
    }

    let editBtnHtml = '';
    if (!block.isActive) {
        const escapedText = JSON.stringify(block.text);
        editBtnHtml = `<button class="edit-btn" onclick='showEditBlockModal("${block.id}", ${escapedText})' onclick="event.stopPropagation()">✎</button>`;
    }

    let deleteBtnHtml = '';
    if (!block.isDefault) {
        deleteBtnHtml = `<button class="delete-btn" onclick="deleteBlock('${block.id}')" onclick="event.stopPropagation()">×</button>`;
    }
    
    div.innerHTML = `
        <div class="word-block-content">${block.text}</div>
        <div class="word-block-actions">
            ${arrangementInputHtml}
            ${editBtnHtml}
            ${deleteBtnHtml}
        </div>
    `;

    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragend', handleDragEnd);

    return div;
}

async function updateArrangement(blockId, newPosition) {
    const position = parseInt(newPosition, 10);
    
    if (isNaN(position) || position < 1) {
        showError('请输入一个有效的位置数字 (大于等于1)');
        renderBlocks(); 
        return;
    }

    try {
        showLoading(); 
        
        let activeBlocks = blocks.filter(b => b.isActive).sort((a, b) => (a.arrangement || 0) - (b.arrangement || 0));
        
        const blockToMove = activeBlocks.find(b => b.id === blockId);
        if (!blockToMove) throw new Error('找不到这个积木块');
        
        activeBlocks = activeBlocks.filter(b => b.id !== blockId);
        
        const newIndex = Math.max(0, Math.min(position - 1, activeBlocks.length));
        activeBlocks.splice(newIndex, 0, blockToMove);

        activeBlocks.forEach((block, index) => {
            block.arrangement = index;
        });

        await updateArrangementInDatabase(activeBlocks);

        renderBlocks();
        showSuccess('排序更新成功！');

    } catch (error) {
        showError('更新排序时出错: ' + error.message);
        renderBlocks(); 
    } finally {
        hideLoading(); 
    }
}

function handleDragStart(e) {
    draggedElement = e.target;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedElement = null;
}

function setupDropZones() {
    const leftDropZone = document.getElementById('leftDropZone');
    const rightDropZone = document.getElementById('rightDropZone');

    [leftDropZone, rightDropZone].forEach(zone => {
        zone.addEventListener('dragover', handleDragOver);
        zone.addEventListener('drop', handleDrop);
        zone.addEventListener('dragenter', handleDragEnter);
        zone.addEventListener('dragleave', handleDragLeave);
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    e.preventDefault();
    e.target.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.target.classList.remove('drag-over');
}

async function handleDrop(e) {
    e.preventDefault();
    e.target.classList.remove('drag-over');
    
    if (!draggedElement) return;

    const blockId = draggedElement.dataset.blockId;
    const block = blocks.find(b => b.id === blockId);
    
    if (!block) return;

    if (block.isDefault && e.target.id === 'leftDropZone') {
        showError('Default blocks cannot be moved to inactive area');
        return;
    }

    const isMovingToActive = e.target.id === 'rightDropZone';
    
    if (block.isActive !== isMovingToActive) {
        try {
            showLoading();
            
            block.isActive = isMovingToActive;
            
            if (isMovingToActive) {
                const activeBlocks = blocks.filter(b => b.isActive);
                block.arrangement = activeBlocks.length - 1;
            } else {
                block.arrangement = null;
                
                const activeBlocks = blocks.filter(b => b.isActive && b.id !== blockId);
                activeBlocks.sort((a, b) => (a.arrangement || 0) - (b.arrangement || 0));
                activeBlocks.forEach((b, index) => {
                    b.arrangement = index;
                });
            }
            
            await updateBlockInDatabase(block.id, {
                isActive: block.isActive,
                arrangement: block.arrangement
            });
            
            renderBlocks();
            showSuccess('Block moved successfully');
        } catch (error) {
            block.isActive = !isMovingToActive;
            renderBlocks();
        } finally {
            hideLoading();
        }
    }
}

function showAddBlockModal() {
    document.getElementById('inputModal').classList.add('show');
    document.getElementById('blockTextInput').focus();
}

function hideAddBlockModal() {
    document.getElementById('inputModal').classList.remove('show');
    document.getElementById('blockTextInput').value = '';
}

async function addNewBlock() {
    const text = document.getElementById('blockTextInput').value.trim();
    
    if (!text) {
        showError('Please enter some text for the block');
        return;
    }

    try {
        showLoading();
        
        const newBlock = {
            id: 'block_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            text: text,
            isActive: false,
            isDefault: false,
            arrangement: null
        };

        await saveBlockToDatabase(newBlock);
        blocks.push(newBlock);
        
        renderBlocks();
        hideAddBlockModal();
        showSuccess('Block added successfully');
    } catch (error) {
    } finally {
        hideLoading();
    }
}

function showEditBlockModal(blockId, currentText) {
    document.getElementById('editBlockId').value = blockId;
    document.getElementById('blockTextInputEdit').value = currentText;
    document.getElementById('editModal').classList.add('show');
    document.getElementById('blockTextInputEdit').focus();
}

function hideEditBlockModal() {
    document.getElementById('editModal').classList.remove('show');
    document.getElementById('editBlockId').value = '';
    document.getElementById('blockTextInputEdit').value = '';
}

async function updateBlock() {
    const blockId = document.getElementById('editBlockId').value;
    const newText = document.getElementById('blockTextInputEdit').value.trim();

    if (!newText) {
        showError('Block text cannot be empty.');
        return;
    }

    if (!blockId) {
        showError('Error: Block ID is missing.');
        return;
    }

    try {
        showLoading();
        await updateBlockInDatabase(blockId, { text: newText });

        const blockToUpdate = blocks.find(b => b.id === blockId);
        if (blockToUpdate) {
            blockToUpdate.text = newText;
        }

        renderBlocks();
        hideEditBlockModal();
        showSuccess('Block updated successfully!');
    } catch (error) {
    } finally {
        hideLoading();
    }
}

async function deleteBlock(blockId) {
    if (confirm('Are you sure you want to delete this block?')) {
        try {
            showLoading();
            
            await deleteBlockFromDatabase(blockId);
            blocks = blocks.filter(b => b.id !== blockId);
            
            renderBlocks();
            showSuccess('Block deleted successfully');
        } catch (error) {
        } finally {
            hideLoading();
        }
    }
}

async function resetToDefaults() {
    if (confirm('This will reset to default blocks and delete all custom blocks. Continue?')) {
        try {
            showLoading();
            
            const customBlocks = blocks.filter(b => !b.isDefault);
            for (const block of customBlocks) {
                await deleteBlockFromDatabase(block.id);
            }
            
            const defaultBlocks = blocks.filter(b => b.isDefault);
            for (let i = 0; i < defaultBlocks.length; i++) {
                await updateBlockInDatabase(defaultBlocks[i].id, {
                    isActive: true,
                    arrangement: i
                });
            }
            
            await fetchBlocks();
            showSuccess('Reset to defaults successfully');
        } catch (error) {
        } finally {
            hideLoading();
        }
    }
}

// Handle Enter key in modal
document.getElementById('blockTextInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addNewBlock();
    }
});

document.getElementById('blockTextInputEdit').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        updateBlock();
    }
});

// Handle page unload to stop services
window.addEventListener('beforeunload', () => {
    if (serviceControlButton && serviceControlButton.classList.contains('active')) {
        fetch(`${API_BASE}/service/stop`, {
            method: 'GET',
            keepalive: true,
        });
    }
});

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Assign DOM elements after they are loaded
    serviceControlButton = document.getElementById('service-control-btn');
    serviceModal = document.getElementById('serviceModal');
    ngrokUrlDisplay = document.getElementById('ngrokUrlDisplay');

    setupDropZones();
    fetchBlocks();
    fetchTwilioInformation();
    checkServiceStatus();
});