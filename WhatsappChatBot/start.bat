@echo off
echo Starting Web Application...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js is installed
node --version

REM Check if package.json exists, if not create it
if not exist package.json (
    echo Creating package.json...
    echo {> package.json
    echo   "name": "web-app",>> package.json
    echo   "version": "1.0.0",>> package.json
    echo   "description": "Simple web application",>> package.json
    echo   "main": "server.js",>> package.json
    echo   "scripts": {>> package.json
    echo     "start": "node server.js",>> package.json
    echo     "dev": "nodemon server.js">> package.json
    echo   },>> package.json
    echo   "dependencies": {>> package.json
    echo     "express": "^4.18.2",>> package.json
    echo     "sqlite3": "^5.1.6",>> package.json
    echo     "cors": "^2.8.5">> package.json
    echo   },>> package.json
    echo   "devDependencies": {>> package.json
    echo     "nodemon": "^3.0.1">> package.json
    echo   }>> package.json
    echo }>> package.json
)


REM Check if node_modules exists, if not install dependencies
if not exist node_modules (
    echo Installing dependencies...
    npm install
    if errorlevel 1 (
        echo Failed to install dependencies
        pause
        exit /b 1
    )
) 

REM Check if server.js exists, if not create it
if not exist server.js (
    echo Creating server.js...
    goto :create_server
)

:run_server
echo Starting server...
start /b node server.js

REM Wait a moment for server to start
timeout /t 3 /nobreak >nul

REM Open browser
echo Opening browser...
start http://localhost:8080

echo.
echo Web application is running!
echo Server: http://localhost:8080
echo Press Ctrl+C in the server window to stop the application
echo.
pause
exit /b 0

:create_server
(
echo const express = require('express'^);
echo const path = require('path'^);
echo const cors = require('cors'^);
echo const sqlite3 = require('sqlite3'^).verbose(^);
echo const app = express(^);
echo const PORT = 8080;
echo.
echo // Enable CORS
echo app.use(cors(^)^);
echo.
echo // Parse JSON bodies
echo app.use(express.json(^)^);
echo.
echo // Serve static files from public directory
echo app.use(express.static('public'^)^);
echo.
echo // Initialize SQLite database
echo const db = new sqlite3.Database('database.db'^);
echo.
echo // Create a sample table if it doesn't exist
echo db.serialize((^) =^> {
echo   db.run('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT)'^);
echo }^);
echo.
echo // Route for main page
echo app.get('/', (req, res^) =^> {
echo   res.sendFile(path.join(__dirname, 'public', 'index.html'^)^);
echo }^);
echo.
echo // API route to get users
echo app.get('/api/users', (req, res^) =^> {
echo   db.all('SELECT * FROM users', (err, rows^) =^> {
echo     if (err^) {
echo       res.status(500^).json({ error: err.message }^);
echo       return;
echo     }
echo     res.json(rows^);
echo   }^);
echo }^);
echo.
echo // API route to add user
echo app.post('/api/users', (req, res^) =^> {
echo   const { name, email } = req.body;
echo   db.run('INSERT INTO users (name, email^) VALUES (?, ?^)', [name, email], function(err^) {
echo     if (err^) {
echo       res.status(500^).json({ error: err.message }^);
echo       return;
echo     }
echo     res.json({ id: this.lastID, name, email }^);
echo   }^);
echo }^);
echo.
echo // Start server
echo app.listen(PORT, (^) =^> {
echo   console.log('Server running at http://localhost:' + PORT^);
echo   console.log('Database initialized successfully'^);
echo }^);
) > server.js
goto :run_server