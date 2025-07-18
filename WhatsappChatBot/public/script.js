const API_BASE = '/api';
let blocks = [];
let nextId = 1;
let draggedElement = null;

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
        // Send only the IDs in the correct order
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
        if (!response.ok) return; // Silently fail if not found

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

    // Sort active blocks by arrangement
    const activeBlocks = blocks.filter(b => b.isActive).sort((a, b) => (a.arrangement || 0) - (b.arrangement || 0));
    const inactiveBlocks = blocks.filter(b => !b.isActive);

    // Render active blocks
    activeBlocks.forEach(block => {
        const blockElement = createBlockElement(block);
        rightContainer.appendChild(blockElement);
    });

    // Render inactive blocks
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
    
    const actionsHtml = block.isActive 
        ? `<input type="number" class="arrangement-input" value="${(block.arrangement || 0) + 1}" 
             onchange="updateArrangement('${block.id}', this.value)" 
             onclick="event.stopPropagation()" 
             min="1">`
        : '';
    
    const deleteBtn = !block.isDefault 
        ? `<button class="delete-btn" onclick="deleteBlock('${block.id}')">×</button>`
        : '';
    
    div.innerHTML = `
        <div class="word-block-content">${block.text}</div>
        <div class="word-block-actions">
            ${actionsHtml}
            ${deleteBtn}
        </div>
    `;

    // Add drag event listeners
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragend', handleDragEnd);

    return div;
}

async function updateArrangement(blockId, newPosition) {
    const position = parseInt(newPosition);
    
    if (isNaN(position) || position < 1) {
        showError('Please enter a valid position number (1 or higher)');
        renderBlocks(); // Re-render to restore original value
        return;
    }

    try {
        showLoading();
        
        const block = blocks.find(b => b.id === blockId);
        if (!block) throw new Error('Block not found');

        const activeBlocks = blocks.filter(b => b.isActive);
        const maxPosition = activeBlocks.length;
        
        // Clamp position to valid range
        const clampedPosition = Math.min(position, maxPosition);
        
        // Update arrangements
        const targetArrangement = clampedPosition - 1;
        const currentArrangement = block.arrangement || 0;
        
        if (targetArrangement !== currentArrangement) {
            // Reorder blocks
            activeBlocks.forEach(b => {
                if (b.id === blockId) {
                    b.arrangement = targetArrangement;
                } else if (targetArrangement > currentArrangement) {
                    // Moving down: shift blocks up
                    if (b.arrangement > currentArrangement && b.arrangement <= targetArrangement) {
                        b.arrangement--;
                    }
                } else {
                    // Moving up: shift blocks down
                    if (b.arrangement >= targetArrangement && b.arrangement < currentArrangement) {
                        b.arrangement++;
                    }
                }
            });
            
            // Update in database
            await updateArrangementInDatabase(activeBlocks);
            
            renderBlocks();
            showSuccess('Arrangement updated successfully');
        } else {
            renderBlocks(); // Re-render to restore original display
        }
    } catch (error) {
        showError('Error updating arrangement: ' + error.message);
        renderBlocks(); // Re-render to restore original value
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

// Setup drop zones
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

    // Prevent moving default blocks to inactive
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
                // Moving to active - set arrangement to end
                const activeBlocks = blocks.filter(b => b.isActive);
                block.arrangement = activeBlocks.length - 1;
            } else {
                // Moving to inactive - remove arrangement
                block.arrangement = null;
                
                // Reorder remaining active blocks
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
            // Revert changes on error
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
        // Error already handled in saveBlockToDatabase
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
            // Error already handled in deleteBlockFromDatabase
        } finally {
            hideLoading();
        }
    }
}

async function saveArrangement() {
    try {
        showLoading();
        
        const activeBlocks = blocks.filter(b => b.isActive).sort((a, b) => (a.arrangement || 0) - (b.arrangement || 0));
        await updateArrangementInDatabase(activeBlocks);
        
        // Visual feedback
        const btn = event.target;
        const originalText = btn.textContent;
        const originalStyle = btn.style.background;
        
        btn.textContent = 'Saved!';
        btn.style.background = 'linear-gradient(45deg, #27ae60, #2ecc71)';
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = originalStyle;
        }, 1500);
        
        showSuccess('Arrangement saved successfully');
    } catch (error) {
        // Error already handled in updateArrangementInDatabase
    } finally {
        hideLoading();
    }
}

async function resetToDefaults() {
    if (confirm('This will reset to default blocks and delete all custom blocks. Continue?')) {
        try {
            showLoading();
            
            // Delete all custom blocks
            const customBlocks = blocks.filter(b => !b.isDefault);
            for (const block of customBlocks) {
                await deleteBlockFromDatabase(block.id);
            }
            
            // Reset default blocks to active
            const defaultBlocks = blocks.filter(b => b.isDefault);
            for (let i = 0; i < defaultBlocks.length; i++) {
                await updateBlockInDatabase(defaultBlocks[i].id, {
                    isActive: true,
                    arrangement: i
                });
            }
            
            // Reload from database
            await fetchBlocks();
            showSuccess('Reset to defaults successfully');
        } catch (error) {
            // Error already handled in individual functions
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

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    setupDropZones();
    fetchBlocks();
    fetchTwilioInformation();
});