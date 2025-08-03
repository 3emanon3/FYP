// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { spawn, exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8080;

// Service management variables
let whatsappService = null;
let ngrokService = null;
let ngrokUrl = null;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files from public directory

// Initialize SQLite database
const db = new sqlite3.Database('word_blocks.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize database tables
function initializeDatabase() {
    db.run(`
        CREATE TABLE IF NOT EXISTS word_blocks (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            is_active INTEGER DEFAULT 0,
            is_default INTEGER DEFAULT 0,
            arrangement INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Error creating table:', err.message);
        } else {
            console.log('Word blocks table ready');
            insertDefaultBlocks();
        }
    });
}

// Insert default blocks if they don't exist
function insertDefaultBlocks() {
    db.get("SELECT COUNT(*) as count FROM word_blocks WHERE is_default = 1", (err, row) => {
        if (err) {
            console.error('Error checking default blocks:', err.message);
            return;
        }
        
        if (row.count === 0) {
            const defaultBlocks = [
                { id: 'default1', text: '{{historyChat}}', is_active: 1, is_default: 1, arrangement: 0 },
                { id: 'default2', text: '{{newMessage}}', is_active: 1, is_default: 1, arrangement: 1 }
            ];
            
            const stmt = db.prepare(`
                INSERT INTO word_blocks (id, text, is_active, is_default, arrangement)
                VALUES (?, ?, ?, ?, ?)
            `);
            
            defaultBlocks.forEach(block => {
                stmt.run(block.id, block.text, block.is_active, block.is_default, block.arrangement);
            });
            
            stmt.finalize();
            console.log('Default blocks inserted');
        }
    });
}

// Helper function to get ngrok URL from API
async function getNgrokUrl() {
    try {
        
        const response = await fetch('http://127.0.0.1:4040/api/tunnels');
        if (!response.ok) {
            throw new Error(`Ngrok API responded with status: ${response.status}`);
        }
        const data = await response.json();
        
        const httpsTunnel = data.tunnels.find(tunnel => 
            tunnel.proto === 'https' && 
            tunnel.config.addr === 'http://localhost:3000'
        );
        
        return httpsTunnel ? httpsTunnel.public_url : null;
    } catch (error) {
        console.error('Error details when getting ngrok URL:', error.message);
        return null;
    }
}

// Helper function to update .env file
function updateEnvFile(envPath, updates) {
    return new Promise((resolve, reject) => {
        let envContent = '';
        
        // Read existing .env file if it exists
        if (fs.existsSync(envPath)) {
            try {
                envContent = fs.readFileSync(envPath, 'utf8');
            } catch (err) {
                return reject(new Error(`Failed to read .env file: ${err.message}`));
            }
        }
        
        // Parse existing content into key-value pairs
        const envLines = envContent.split('\n');
        const envVars = {};
        
        envLines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('#')) {
                const [key, ...valueParts] = trimmedLine.split('=');
                if (key && valueParts.length > 0) {
                    envVars[key.trim()] = valueParts.join('=').trim();
                }
            }
        });
        
        // Update with new values
        Object.keys(updates).forEach(key => {
            envVars[key] = updates[key];
        });
        
        // Rebuild .env content
        const newEnvContent = Object.keys(envVars)
            .map(key => `${key}=${envVars[key]}`)
            .join('\n');
        
        // Write back to file
        try {
            fs.writeFileSync(envPath, newEnvContent, 'utf8');
            resolve();
        } catch (err) {
            reject(new Error(`Failed to write .env file: ${err.message}`));
        }
    });
}

// Helper function to kill process gracefully
function killProcessGracefully(process, processName) {
    return new Promise((resolve) => {
        if (!process || process.killed) {
            resolve();
            return;
        }
        
        console.log(`Stopping ${processName}...`);
        
        // Send Ctrl+C (SIGINT)
        process.kill('SIGINT');
        
        // Wait a moment for graceful shutdown
        setTimeout(() => {
            if (!process.killed) {
                console.log(`Force killing ${processName}...`);
                process.kill('SIGKILL');
            }
            resolve();
        }, 3000);
    });
}

// API Routes

// Get all word blocks
app.get('/api/blocks', (req, res) => {
    db.all(`
        SELECT id, text, is_active, is_default, arrangement, created_at, updated_at
        FROM word_blocks
        ORDER BY 
            CASE WHEN is_active = 1 THEN arrangement END ASC,
            CASE WHEN is_active = 0 THEN created_at END DESC
    `, (err, rows) => {
        if (err) {
            console.error('Error fetching blocks:', err.message);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        
        const blocks = rows.map(row => ({
            id: row.id,
            text: row.text,
            isActive: row.is_active === 1,
            isDefault: row.is_default === 1,
            arrangement: row.arrangement,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));
        
        res.json(blocks);
    });
});

// Create a new word block
app.post('/api/blocks', (req, res) => {
    const { id, text, isActive = false, isDefault = false, arrangement = null } = req.body;
    
    if (!id || !text) {
        return res.status(400).json({ error: 'ID and text are required' });
    }
    
    db.run(`
        INSERT INTO word_blocks (id, text, is_active, is_default, arrangement)
        VALUES (?, ?, ?, ?, ?)
    `, [id, text, isActive ? 1 : 0, isDefault ? 1 : 0, arrangement], function(err) {
        if (err) {
            console.error('Error creating block:', err.message);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        
        res.json({ 
            id: id,
            text: text,
            isActive: isActive,
            isDefault: isDefault,
            arrangement: arrangement,
            message: 'Block created successfully' 
        });
    });
});

// Update arrangement of active blocks
app.put('/api/blocks/arrangement', (req, res) => {
    const { blocks } = req.body;
    
    if (!Array.isArray(blocks)) {
        return res.status(400).json({ error: 'Blocks must be an array' });
    }
    
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        const stmt = db.prepare('UPDATE word_blocks SET arrangement = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        
        blocks.forEach((block, index) => {
            stmt.run(index, block.id);
        });
        
        stmt.finalize((err) => {
            if (err) {
                db.run('ROLLBACK');
                console.error('Error updating arrangement:', err.message);
                res.status(500).json({ error: 'Internal server error' });
                return;
            }
            
            db.run('COMMIT');
            res.json({ message: 'Arrangement updated successfully' });
        });
    });
});

// Update a word block
app.put('/api/blocks/:id', (req, res) => {
    const { id } = req.params;
    const { text, isActive, arrangement } = req.body;
    
    let updateFields = [];
    let updateValues = [];
    
    if (text !== undefined) {
        updateFields.push('text = ?');
        updateValues.push(text);
    }
    
    if (isActive !== undefined) {
        updateFields.push('is_active = ?');
        updateValues.push(isActive ? 1 : 0);
    }
    
    if (arrangement !== undefined) {
        updateFields.push('arrangement = ?');
        updateValues.push(arrangement);
    }
    
    if (updateFields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }
    
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(id);
    
    db.run(`
        UPDATE word_blocks 
        SET ${updateFields.join(', ')}
        WHERE id = ?
    `, updateValues, function(err) {
        if (err) {
            console.error('Error updating block:', err.message);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        
        if (this.changes === 0) {
            res.status(404).json({ error: 'Block not found' });
            return;
        }
        
        res.json({ message: 'Block updated successfully' });
    });
});

// Delete a word block
app.delete('/api/blocks/:id', (req, res) => {
    const { id } = req.params;
    
    // Check if it's a default block
    db.get('SELECT is_default FROM word_blocks WHERE id = ?', [id], (err, row) => {
        if (err) {
            console.error('Error checking block:', err.message);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        
        if (!row) {
            res.status(404).json({ error: 'Block not found' });
            return;
        }
        
        if (row.is_default === 1) {
            res.status(400).json({ error: 'Cannot delete default blocks' });
            return;
        }
        
        db.run('DELETE FROM word_blocks WHERE id = ?', [id], function(err) {
            if (err) {
                console.error('Error deleting block:', err.message);
                res.status(500).json({ error: 'Internal server error' });
                return;
            }
            
            res.json({ message: 'Block deleted successfully' });
        });
    });
});

// Update Twilio configuration in .env file
app.put('/api/information', async (req, res) => {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, GEMINI_API_KEYS} = req.body;
    
    // Validate required fields
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER || !GEMINI_API_KEYS) {
        return res.status(400).json({ 
            error: 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, GEMINI_API_KEYS are required' 
        });
    }
    
    // Validate phone number format (must have + and numbers)
    const phoneRegex = /^\+\d+$/;
    if (!phoneRegex.test(TWILIO_PHONE_NUMBER)) {
        return res.status(400).json({ 
            error: 'TWILIO_PHONE_NUMBER must start with + followed by numbers only' 
        });
    }
    
    try {
        // You can modify this path as needed
        const envPath = path.join(__dirname, '..', 'TwilioAPI', '.env');
        
        // Prepare updates - add whatsapp: prefix to phone number
        const updates = {
            TWILIO_ACCOUNT_SID: TWILIO_ACCOUNT_SID,
            TWILIO_AUTH_TOKEN: TWILIO_AUTH_TOKEN,
            TWILIO_PHONE_NUMBER: `whatsapp:${TWILIO_PHONE_NUMBER}`,
            GEMINI_API_KEYS: GEMINI_API_KEYS
        };
        
        // Update .env file
        await updateEnvFile(envPath, updates);
        
        res.json({ 
            message: 'Twilio configuration updated successfully',
            updated: {
                TWILIO_ACCOUNT_SID: TWILIO_ACCOUNT_SID,
                TWILIO_AUTH_TOKEN: '***hidden***',
                TWILIO_PHONE_NUMBER: `whatsapp:${TWILIO_PHONE_NUMBER}`,
                GEMINI_API_KEYS: GEMINI_API_KEYS
            }
        });
        
    } catch (error) {
        console.error('Error updating Twilio configuration:', error.message);
        res.status(500).json({ 
            error: 'Failed to update configuration', 
            details: error.message 
        });
    }
});

// NEW ENDPOINTS - Service Management

// Start WhatsApp service and ngrok
app.get('/api/service/start', async (req, res) => {
    try {
        if (whatsappService && !whatsappService.killed) {
            return res.status(400).json({ 
                error: 'WhatsApp service is already running',
                url: ngrokUrl 
            });
        }
        
        console.log('Starting WhatsApp service...');
        
        const servicePath = path.join(__dirname, '..', 'TwilioAPI');
        
        if (!fs.existsSync(servicePath)) {
            return res.status(400).json({ 
                error: `Service directory not found: ${servicePath}` 
            });
        }
        
        whatsappService = spawn('npm', ['start'], {
            cwd: servicePath,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true
        });
        
        let serviceStarted = false;
        
        whatsappService.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('WhatsApp Service:', output);
            
            if (output.includes('WhatsApp Gemini AI chatbot server running on port 3000') && !serviceStarted) {
                serviceStarted = true;
                
                console.log('WhatsApp service confirmed running. Starting ngrok...');
                
                ngrokService = spawn('ngrok', ['http', '3000'], {
                    stdio: 'ignore',
                    shell: true
                });

                ngrokService.on('close', (code) => {
                    console.log(`Ngrok process exited with code ${code}`);
                    ngrokUrl = null;
                });

                const maxRetries = 15; 
                const retryDelay = 2000; 


                const attemptToGetNgrokUrl = async (retries) => {
                    console.log(`Attempting to get ngrok URL... (Attempt ${retries + 1})`);

                    try {
                        const url = await getNgrokUrl(); 
                        
                        if (url) {
                            ngrokUrl = url;
                            console.log('Services started successfully. Ngrok URL:', ngrokUrl);
                            res.json({ 
                                message: 'Services started successfully',
                                url: ngrokUrl 
                            });
                        } else if (retries < maxRetries) {
                            console.log('Ngrok API not ready yet. Retrying in 2 seconds...');
                            setTimeout(() => attemptToGetNgrokUrl(retries + 1), retryDelay);
                        } else {
                            console.error('Ngrok startup timeout after multiple retries.');
                            res.status(500).json({ 
                                error: 'Ngrok failed to start within the timeout period.' 
                            });
                        }
                    } catch (error) {
                        if (retries < maxRetries) {
                            console.log('Error connecting to Ngrok API. Retrying in 2 seconds...');
                            setTimeout(() => attemptToGetNgrokUrl(retries + 1), retryDelay);
                        } else {
                            console.error('Could not connect to Ngrok API after multiple retries.', error);
                            res.status(500).json({ 
                                error: 'Failed to connect to Ngrok API.',
                                details: error.message
                            });
                        }
                    }
                };

                setTimeout(() => attemptToGetNgrokUrl(0), 2000);
            }
        });
        
        whatsappService.stderr.on('data', (data) => {
            console.error('WhatsApp Service Error:', data.toString());
        });
        
        whatsappService.on('close', (code) => {
            console.log(`WhatsApp service process exited with code ${code}`);
            whatsappService = null;
        });
        
    } catch (error) {
        console.error('Error starting services:', error);
        res.status(500).json({ 
            error: 'Failed to start services', 
            details: error.message 
        });
    }
});

// Stop WhatsApp service and ngrok
app.get('/api/service/stop', async (req, res) => {
    try {
        console.log('Stopping services...');
        
        // Stop both services
        const stopPromises = [];
        
        if (ngrokService && !ngrokService.killed) {
            stopPromises.push(killProcessGracefully(ngrokService, 'Ngrok'));
        }
        
        if (whatsappService && !whatsappService.killed) {
            stopPromises.push(killProcessGracefully(whatsappService, 'WhatsApp Service'));
        }
        
        if (stopPromises.length === 0) {
            return res.json({ 
                message: 'No services were running' 
            });
        }
        
        // Wait for all services to stop
        await Promise.all(stopPromises);
        
        // Reset variables
        whatsappService = null;
        ngrokService = null;
        ngrokUrl = null;
        
        console.log('All services stopped successfully');
        res.json({ 
            message: 'Services stopped successfully' 
        });
        
    } catch (error) {
        console.error('Error stopping services:', error);
        res.status(500).json({ 
            error: 'Failed to stop services', 
            details: error.message 
        });
    }
});

// Get service status
app.get('/api/service/status', (req, res) => {
    const isWhatsAppRunning = whatsappService && !whatsappService.killed;
    const isNgrokRunning = ngrokService && !ngrokService.killed;
    
    res.json({
        whatsappService: {
            running: isWhatsAppRunning,
            pid: isWhatsAppRunning ? whatsappService.pid : null
        },
        ngrokService: {
            running: isNgrokRunning,
            pid: isNgrokRunning ? ngrokService.pid : null,
            url: ngrokUrl
        },
        status: (isWhatsAppRunning && isNgrokRunning) ? 'running' : 
                (isWhatsAppRunning || isNgrokRunning) ? 'partial' : 'stopped'
    });
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down server...');
    
    // Stop services first
    const stopPromises = [];
    
    if (ngrokService && !ngrokService.killed) {
        stopPromises.push(killProcessGracefully(ngrokService, 'Ngrok'));
    }
    
    if (whatsappService && !whatsappService.killed) {
        stopPromises.push(killProcessGracefully(whatsappService, 'WhatsApp Service'));
    }
    
    await Promise.all(stopPromises);
    
    // Close database connection
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed');
        }
        process.exit(0);
    });
});

// Export for testing
module.exports = app;