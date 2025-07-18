const express = require('express');
const twilio = require('twilio');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Twilio credentials from environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// Gemini API configuration
const geminiApiKey = process.env.GEMINI_API_KEYS;
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

// Configurable phone number - defaults to sandbox if not specified
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || 'whatsapp:+14155238886';

// Helper function to ensure proper WhatsApp format
function formatWhatsAppNumber(phoneNumber) {
    // If it already has whatsapp: prefix, return as is
    if (phoneNumber.startsWith('whatsapp:')) {
        return phoneNumber;
    }
    // If it starts with +, add whatsapp: prefix
    if (phoneNumber.startsWith('+')) {
        return `whatsapp:${phoneNumber}`;
    }
    // If it's just numbers, add whatsapp:+ prefix
    return `whatsapp:+${phoneNumber}`;
}

// Initialize SQLite database for message history
const dbPath = path.join(__dirname, 'history.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database:', dbPath);
        initializeDatabase();
    }
});

// Initialize SQLite database for word blocks
const wordBlocksDbPath = path.join(__dirname,'..','WhatsappChatBot', 'word_blocks.db');
const wordBlocksDb = new sqlite3.Database(wordBlocksDbPath, (err) => {
    if (err) {
        console.error('Error opening word_blocks database:', err.message);
    } else {
        console.log('Connected to word_blocks SQLite database:', wordBlocksDbPath);
    }
});

// Initialize database tables
function initializeDatabase() {
    // Create phone_number table
    db.run(`CREATE TABLE IF NOT EXISTS phone_number (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('Error creating phone_number table:', err.message);
        } else {
            console.log('Phone number table ready');
        }
    });

    // Create message table
    db.run(`CREATE TABLE IF NOT EXISTS message (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_number_id INTEGER,
        sender_type TEXT NOT NULL CHECK(sender_type IN ('user', 'chatbot')),
        message TEXT NOT NULL,
        message_date DATE DEFAULT (date('now')),
        message_time TIME DEFAULT (time('now')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (phone_number_id) REFERENCES phone_number (id)
    )`, (err) => {
        if (err) {
            console.error('Error creating message table:', err.message);
        } else {
            console.log('Message table ready');
        }
    });
}

// Function to get or create phone number entry
function getOrCreatePhoneNumber(phoneNumber) {
    return new Promise((resolve, reject) => {
        // Clean phone number (remove whatsapp: prefix if present)
        const cleanPhoneNumber = phoneNumber.replace('whatsapp:', '');
        
        // First, try to get existing phone number
        db.get(`SELECT id FROM phone_number WHERE phone_number = ?`, [cleanPhoneNumber], (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            
            if (row) {
                // Phone number exists, return its ID
                resolve(row.id);
            } else {
                // Phone number doesn't exist, create it
                db.run(`INSERT INTO phone_number (phone_number) VALUES (?)`, [cleanPhoneNumber], function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                });
            }
        });
    });
}

// Function to store message
function storeMessage(phoneNumberId, senderType, message) {
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO message (phone_number_id, sender_type, message) VALUES (?, ?, ?)`, 
            [phoneNumberId, senderType, message], function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this.lastID);
            }
        });
    });
}

// Function to get word blocks from word_blocks.db
function getWordBlocks() {
    return new Promise((resolve, reject) => {
        wordBlocksDb.all(
            `SELECT text, arrangement FROM word_blocks WHERE is_active = 1 ORDER BY arrangement ASC`,
            [],
            (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });
}

// Function to get chat history for a phone number
function getChatHistory(phoneNumber) {
    return new Promise((resolve, reject) => {
        const cleanPhoneNumber = phoneNumber.replace('whatsapp:', '');
        
        const query = `
            SELECT m.message_date, m.message_time, m.sender_type, m.message
            FROM message m 
            JOIN phone_number pn ON m.phone_number_id = pn.id 
            WHERE pn.phone_number = ? 
            ORDER BY m.created_at ASC
        `;
        
        db.all(query, [cleanPhoneNumber], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Function to build content for Gemini API
async function buildGeminiContent(sender, newMessage) {
    try {
        // Get word blocks
        const wordBlocks = await getWordBlocks();
        
        // Get chat history
        const chatHistory = await getChatHistory(sender);
        
        // Format chat history
        const formattedHistory = chatHistory.map(msg => 
            `${msg.message_date};${msg.message_time};${msg.sender_type}:${msg.message}`
        ).join('\n');
        
        // Build content by replacing placeholders
        let content = wordBlocks.map(block => {
            let text = block.text;
            
            // Replace placeholders
            text = text.replace(/\{\{historyChat\}\}/g, formattedHistory);
            text = text.replace(/\{\{newMessage\}\}/g, newMessage);
            
            return text;
        }).join('\n');
        
        return content;
        
    } catch (error) {
        console.error('Error building Gemini content:', error);
        throw error;
    }
}

// Function to call Gemini AI
async function callGeminiAI(content) {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: content
        });

        const text = response.text;
        
        console.log('Gemini AI response:', text);
        return text;
        
    } catch (error) {
        console.error('Error calling Gemini AI:', error);
        throw error;
    }
}

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Webhook endpoint for receiving WhatsApp messages
app.post('/webhook', async (req, res) => {
    const twiml = new twilio.twiml.MessagingResponse();
    
    try {
        // Get incoming message details
        const incomingMsg = req.body.Body || '';
        const sender = req.body.From;
        
        console.log(`Received message from ${sender}: ${incomingMsg}`);
        
        // Store incoming message to database
        const phoneNumberId = await getOrCreatePhoneNumber(sender);
        await storeMessage(phoneNumberId, 'user', incomingMsg);
        console.log('Incoming message stored to database');
        
        // Build content for Gemini AI
        const geminiContent = await buildGeminiContent(sender, incomingMsg);
        console.log('Built Gemini content:', geminiContent);
        
        // Call Gemini AI
        const aiResponse = await callGeminiAI(geminiContent);
        
        // Send the AI response
        twiml.message(aiResponse);
        
        // Store chatbot response to database
        await storeMessage(phoneNumberId, 'chatbot', aiResponse);
        console.log('Chatbot response stored to database');
        
        res.writeHead(200, {'Content-Type': 'text/xml'});
        res.end(twiml.toString());
        
    } catch (error) {
        console.error('Error processing webhook:', error);
        
        // Send error response
        const errorMessage = "Sorry, I encountered an error. Please try again later.";
        twiml.message(errorMessage);
        res.writeHead(200, {'Content-Type': 'text/xml'});
        res.end(twiml.toString());
    }
});

// Send message programmatically - now uses configurable phone number
app.post('/send-message', async (req, res) => {
    try {
        const { to, message } = req.body;
        
        // Format the recipient number properly
        const recipientNumber = formatWhatsAppNumber(to);
        
        const result = await client.messages.create({
            from: twilioPhoneNumber, // Now uses configurable phone number
            body: message,
            to: recipientNumber
        });
        
        // Store the programmatically sent message to database
        try {
            const phoneNumberId = await getOrCreatePhoneNumber(recipientNumber);
            await storeMessage(phoneNumberId, 'chatbot', message);
            console.log('Programmatic message stored to database');
        } catch (dbError) {
            console.error('Error storing programmatic message to database:', dbError);
        }
        
        res.json({ 
            success: true, 
            messageSid: result.sid,
            status: result.status,
            from: twilioPhoneNumber,
            to: recipientNumber
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// New endpoint to get current phone number configuration
app.get('/config', (req, res) => {
    const isSandbox = twilioPhoneNumber === 'whatsapp:+14155238886';
    
    res.json({
        currentPhoneNumber: twilioPhoneNumber,
        isSandbox: isSandbox,
        phoneNumberType: isSandbox ? 'Sandbox' : 'Business',
        accountSid: accountSid ? accountSid.substring(0, 8) + '...' : 'Not configured',
        geminiApiConfigured: geminiApiKey ? 'Yes' : 'No',
        environmentVariables: {
            TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || 'Not set (using default sandbox)',
            TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? 'Set' : 'Not set',
            TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ? 'Set' : 'Not set',
            GEMINI_API_KEYS: process.env.GEMINI_API_KEYS ? 'Set' : 'Not set'
        }
    });
});

// New endpoint to get message history
app.get('/history/:phoneNumber', (req, res) => {
    const phoneNumber = req.params.phoneNumber.replace('whatsapp:', '');
    
    const query = `
        SELECT m.*, pn.phone_number 
        FROM message m 
        JOIN phone_number pn ON m.phone_number_id = pn.id 
        WHERE pn.phone_number = ? 
        ORDER BY m.created_at ASC
    `;
    
    db.all(query, [phoneNumber], (err, rows) => {
        if (err) {
            console.error('Error fetching message history:', err);
            res.status(500).json({ error: 'Failed to fetch message history' });
        } else {
            res.json({
                phoneNumber: phoneNumber,
                messages: rows
            });
        }
    });
});

// New endpoint to get all conversations
app.get('/conversations', (req, res) => {
    const query = `
        SELECT pn.phone_number, 
               COUNT(m.id) as message_count,
               MAX(m.created_at) as last_message_time
        FROM phone_number pn 
        LEFT JOIN message m ON pn.id = m.phone_number_id 
        GROUP BY pn.id, pn.phone_number 
        ORDER BY last_message_time DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching conversations:', err);
            res.status(500).json({ error: 'Failed to fetch conversations' });
        } else {
            res.json({ conversations: rows });
        }
    });
});

// New endpoint to test word blocks retrieval
app.get('/test-word-blocks', async (req, res) => {
    try {
        const wordBlocks = await getWordBlocks();
        res.json({ wordBlocks });
    } catch (error) {
        console.error('Error testing word blocks:', error);
        res.status(500).json({ error: 'Failed to retrieve word blocks' });
    }
});

// Health check endpoint - now shows current phone number and Gemini status
app.get('/', (req, res) => {
    const isSandbox = twilioPhoneNumber === 'whatsapp:+14155238886';
    const geminiStatus = geminiApiKey ? '✅ Configured' : '❌ Not configured';
    
    res.send(`
        <h1>WhatsApp Gemini AI Chatbot is running! 🤖</h1>
        <p><strong>Current Phone Number:</strong> <code>${twilioPhoneNumber}</code></p>
        <p><strong>Phone Type:</strong> ${isSandbox ? '📱 Sandbox' : '🏢 Business'}</p>
        <p><strong>Gemini AI:</strong> ${geminiStatus}</p>
        <hr>
        <p><strong>Endpoints:</strong></p>
        <ul>
            <li>Webhook: <code>/webhook</code></li>
            <li>Send message: <code>/send-message</code></li>
            <li>Message history: <code>/history/{phoneNumber}</code></li>
            <li>All conversations: <code>/conversations</code></li>
            <li>Configuration: <code>/config</code></li>
            <li>Test word blocks: <code>/test-word-blocks</code></li>
        </ul>
        <p><strong>Server time:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Databases:</strong></p>
        <ul>
            <li>Message history: <code>${dbPath}</code></li>
            <li>Word blocks: <code>${wordBlocksDbPath}</code></li>
        </ul>
        <hr>
        <p><strong>💡 Configuration:</strong><br>
        • Set <code>TWILIO_PHONE_NUMBER</code> for business WhatsApp number<br>
        • Set <code>GEMINI_API_KEYS</code> for Gemini AI integration</p>
    `);
});

// Get webhook status - now includes phone number and Gemini info
app.get('/status', (req, res) => {
    const isSandbox = twilioPhoneNumber === 'whatsapp:+14155238886';
    
    res.json({
        status: 'running',
        timestamp: new Date().toISOString(),
        databases: {
            history: dbPath,
            wordBlocks: wordBlocksDbPath
        },
        phoneNumber: {
            current: twilioPhoneNumber,
            type: isSandbox ? 'sandbox' : 'business',
            isSandbox: isSandbox
        },
        geminiAI: {
            configured: geminiApiKey ? true : false,
            model: "gemini-2.0-flash-exp"
        },
        endpoints: {
            webhook: '/webhook',
            sendMessage: '/send-message',
            history: '/history/{phoneNumber}',
            conversations: '/conversations',
            config: '/config',
            testWordBlocks: '/test-word-blocks'
        }
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    db.close((err) => {
        if (err) {
            console.error('Error closing history database:', err.message);
        } else {
            console.log('History database connection closed.');
        }
    });
    
    wordBlocksDb.close((err) => {
        if (err) {
            console.error('Error closing word_blocks database:', err.message);
        } else {
            console.log('Word blocks database connection closed.');
        }
        process.exit(0);
    });
});

app.listen(port, () => {
    const isSandbox = twilioPhoneNumber === 'whatsapp:+14155238886';
    const geminiStatus = geminiApiKey ? '✅' : '❌';
    
    console.log(`🚀 WhatsApp Gemini AI chatbot server running on port ${port}`);
    console.log(`📱 Webhook URL: http://localhost:${port}/webhook`);
    console.log(`📞 Phone Number: ${twilioPhoneNumber} (${isSandbox ? 'Sandbox' : 'Business'})`);
    console.log(`🤖 Gemini AI: ${geminiStatus} ${geminiApiKey ? 'Configured' : 'Not configured'}`);
    console.log(`🗄️ Databases:`);
    console.log(`   - History: ${dbPath}`);
    console.log(`   - Word blocks: ${wordBlocksDbPath}`);
    console.log(`🌐 Make sure to expose this with ngrok for Twilio to reach it!`);
    
    if (isSandbox) {
        console.log(`💡 To use business phone number, set TWILIO_PHONE_NUMBER environment variable`);
    }
    
    if (!geminiApiKey) {
        console.log(`⚠️  Set GEMINI_API_KEYS environment variable for AI functionality`);
    }
});