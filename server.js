const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

var ADMINS = [
    { login: 'VsXe', password: 'admin123' },
    { login: 'WeXiO', password: 'admin123' },
    { login: 'WiSnNiA', password: 'admin123' }
];

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

var players = [];
var serverStatus = { name: 'Lomza Roleplay', isOnline: false, maxPlayers: 50, uptime: 0 };
var logs = [];
var bannedPlayers = [];
var commandQueue = [];

function addLog(type, message) {
    var log = { id: Date.now(), type: type, message: message, time: new Date().toLocaleString('pl-PL') };
    logs.unshift(log);
    if (logs.length > 500) logs.pop();
    io.emit('newLog', log);
    return log;
}

// === LOGIN ===
app.post('/api/login', function(req, res) {
    var login = req.body.login;
    var password = req.body.password;
    var found = false;
    for (var i = 0; i < ADMINS.length; i++) {
        if (ADMINS[i].login === login && ADMINS[i].password === password) {
            found = true;
            break;
        }
    }
    if (found) {
        addLog('info', '🔑 ' + login + ' zalogowal sie do panelu');
        return res.json({ success: true, login: login });
    }
    return res.json({ success: false });
});

// === STATUS ===
app.get('/api/status', function(req, res) {
    res.json({
        name: serverStatus.name,
        isOnline: serverStatus.isOnline,
        maxPlayers: serverStatus.maxPlayers,
        uptime: serverStatus.uptime,
        playerCount: players.length,
        bannedCount: bannedPlayers.length
    });
});

app.post('/api/server/toggle', function(req, res) {
    serverStatus.isOnline = !serverStatus.isOnline;
    addLog('server', 'Serwer: ' + (serverStatus.isOnline ? 'ONLINE' : 'OFFLINE'));
    io.emit('serverStatus', serverStatus);
    res.json({ success: true, isOnline: serverStatus.isOnline });
});

// === PLAYERS ===
app.get('/api/players', function(req, res) { res.json(players); });

app.post('/api/players/kick', function(req, res) {
    var name = req.body.name;
    var reason = req.body.reason || 'Brak powodu';
    players = players.filter(function(p) { return p.name !== name; });
    commandQueue.push({ type: 'kick', target: name, reason: reason, time: Date.now() });
    addLog('kick', '👢 ' + name + ' wyrzucony. Powod: ' + reason);
    io.emit('playerList', players);
    res.json({ success: true });
});

app.post('/api/players/ban', function(req, res) {
    var name = req.body.name;
    var reason = req.body.reason || 'Brak powodu';
    var duration = req.body.duration || 'perm';
    players = players.filter(function(p) { return p.name !== name; });
    bannedPlayers.push({ name: name, reason: reason, duration: duration, time: new Date().toLocaleString('pl-PL') });
    commandQueue.push({ type: 'ban', target: name, reason: reason, duration: duration, time: Date.now() });
    addLog('ban', '🔨 ' + name + ' ZBANOWANY! Powod: ' + reason);
    io.emit('playerList', players);
    res.json({ success: true });
});

app.post('/api/players/unban', function(req, res) {
    var name = req.body.name;
    bannedPlayers = bannedPlayers.filter(function(b) { return b.name !== name; });
    addLog('info', '✅ ' + name + ' odbanowany');
    res.json({ success: true });
});

app.get('/api/bans', function(req, res) { res.json(bannedPlayers); });

// === ANNOUNCE ===
app.post('/api/announce', function(req, res) {
    var message = req.body.message;
    commandQueue.push({ type: 'announce', message: message, time: Date.now() });
    addLog('announce', '📢 Ogloszenie: ' + message);
    io.emit('announcement', { message: message });
    res.json({ success: true });
});

// === COMMAND ===
app.post('/api/command', function(req, res) {
    var command = req.body.command;
    commandQueue.push({ type: 'command', command: command, time: Date.now() });
    addLog('command', '⚡ Komenda: ' + command);
    res.json({ success: true });
});

// === LOGS ===
app.get('/api/logs', function(req, res) { res.json(logs); });
app.post('/api/logs/clear', function(req, res) {
    logs = [];
    addLog('info', '🗑️ Logi wyczyszczone');
    res.json({ success: true });
});

// === SETTINGS ===
app.post('/api/server/settings', function(req, res) {
    if (req.body.name) serverStatus.name = req.body.name;
    if (req.body.maxPlayers) serverStatus.maxPlayers = req.body.maxPlayers;
    addLog('info', '⚙️ Ustawienia zmienione');
    res.json({ success: true });
});

// === TEST PLAYERS ===
app.post('/api/test/addplayers', function(req, res) {
    var names = ['ProGamer', 'NoobSlayer', 'BuilderKing', 'SpeedRunner', 'PolskiGracz', 'CoolPlayer', 'RobloxFan', 'DarkKnight'];
    var positions = ['Spawn', 'Sklep', 'Komisariat', 'Szpital', 'Ratusz', 'Garaz', 'Centrum'];
    var player = {
        name: names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 100),
        id: Math.random().toString(36).substr(2, 9),
        joinTime: new Date().toLocaleString('pl-PL'),
        health: Math.floor(Math.random() * 100) + 1,
        position: positions[Math.floor(Math.random() * positions.length)]
    };
    players.push(player);
    addLog('join', '✅ ' + player.name + ' dolaczyl');
    io.emit('playerList', players);
    res.json({ success: true });
});

// ============================================
// === ROBLOX API — TO LACZY GRE Z PANELEM ===
// ============================================

// Roblox: gracz dolacza
app.post('/api/roblox/join', function(req, res) {
    var name = req.body.name || 'Unknown';
    var userId = req.body.userId || '0';

    // Sprawdz czy zbanowany
    var isBanned = false;
    for (var i = 0; i < bannedPlayers.length; i++) {
        if (bannedPlayers[i].name === name) {
            isBanned = true;
            break;
        }
    }
    if (isBanned) {
        return res.json({ success: false, banned: true, message: 'Jestes zbanowany!' });
    }

    var player = {
        name: name,
        id: userId,
        joinTime: new Date().toLocaleString('pl-PL'),
        health: 100,
        position: 'Spawn'
    };
    players.push(player);
    addLog('join', '✅ ' + name + ' dolaczyl do gry');
    io.emit('playerList', players);
    serverStatus.isOnline = true;
    io.emit('serverStatus', serverStatus);
    res.json({ success: true, banned: false });
});

// Roblox: gracz wychodzi
app.post('/api/roblox/leave', function(req, res) {
    var name = req.body.name;
    players = players.filter(function(p) { return p.name !== name; });
    addLog('leave', '❌ ' + name + ' opuscil gre');
    io.emit('playerList', players);
    if (players.length === 0) {
        serverStatus.isOnline = false;
        io.emit('serverStatus', serverStatus);
    }
    res.json({ success: true });
});

// Roblox: aktualizuj pozycje gracza
app.post('/api/roblox/update', function(req, res) {
    var name = req.body.name;
    var health = req.body.health;
    var position = req.body.position;
    for (var i = 0; i < players.length; i++) {
        if (players[i].name === name) {
            if (health !== undefined) players[i].health = health;
            if (position) players[i].position = position;
            break;
        }
    }
    io.emit('playerList', players);
    res.json({ success: true });
});

// Roblox: pobierz komendy do wykonania
app.get('/api/roblox/commands', function(req, res) {
    var cmds = commandQueue.slice();
    commandQueue = [];
    res.json(cmds);
});

// Roblox: sprawdz czy gracz jest zbanowany
app.get('/api/roblox/checkban', function(req, res) {
    var name = req.query.name;
    var isBanned = false;
    var reason = '';
    for (var i = 0; i < bannedPlayers.length; i++) {
        if (bannedPlayers[i].name === name) {
            isBanned = true;
            reason = bannedPlayers[i].reason;
            break;
        }
    }
    res.json({ banned: isBanned, reason: reason });
});

// === SOCKET ===
io.on('connection', function(socket) {
    socket.emit('playerList', players);
    socket.emit('serverStatus', serverStatus);
});

setInterval(function() {
    if (serverStatus.isOnline) { serverStatus.uptime++; io.emit('uptimeUpdate', serverStatus.uptime); }
}, 1000);

server.listen(PORT, function() {
    console.log('');
    console.log('========================================');
    console.log('  LOMZA ROLEPLAY — ADMIN PANEL');
    console.log('  Panel: http://localhost:' + PORT);
    console.log('  Loginy: VsXe, WeXiO, WiSnNiA');
    console.log('  Haslo: admin123');
    console.log('========================================');
    console.log('');
});