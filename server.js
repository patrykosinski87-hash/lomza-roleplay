const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const DISCORD_WEBHOOK = "https://discord.com/api/webhooks/1494374094857306313/tXlKfOg1skeQX3yaLSeOGBHJs6FQS-II_tFbRptcBnsoN1PsB8gtf3RWRrnv28P2WTz8";

var ADMINS = [
    { login: 'VsXe',              password: 'm8Rk3Z1tQw', role: 'admin' },
    { login: 'WeXiO',             password: 'X7q9L2vP4z', role: 'admin' },
    { login: 'WiSnNiA',           password: '5ZpX1v8NqT', role: 'admin' },
    { login: 'zvujsyy',           password: 'V1tZ8p3LqR', role: 'mod'   },
    { login: 'k1ngvss',           password: '6yM4Xn2QkP', role: 'mod'   },
    { login: 'kebsioow_tortilli', password: '9bVxT6pL2s', role: 'mod'   },
    { login: 'patryk03413',       password: 'r7K2mW9xQb', role: 'mod'   }
];

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

var players = [];
var serverStatus = { name: 'Lomza Roleplay', isOnline: false, maxPlayers: 50, uptime: 0 };
var logs = [];
var bannedPlayers = [];
var commandQueue = [];

function sendDiscordBan(data) {
    var https = require('https');
    var url = require('url');
    var now = new Date().toLocaleString('pl-PL');

    var durationText = '';
    if (data.duration === '1h') durationText = '1 Godzina';
    else if (data.duration === '24h') durationText = '24 Godziny';
    else if (data.duration === '7d') durationText = '7 Dni';
    else if (data.duration === '30d') durationText = '30 Dni';
    else if (data.duration === 'perm') durationText = '🔴 Permanentny';
    else durationText = data.duration || 'Permanentny';

    var payload = JSON.stringify({
        username: "Łomża Roleplay",
        embeds: [
            {
                author: { name: "System Banów • Łomża Roleplay" },
                title: "🔨 Nowy Ban",
                color: 15158332,
                description: "Gracz **" + data.name + "** został zbanowany na serwerze.",
                fields: [
                    { name: "👤 Zbanowany Gracz", value: "```yml\n" + data.name + "\n```", inline: true },
                    { name: "👮 Zbanowany przez", value: "```yml\n" + data.admin + "\n```", inline: true },
                    { name: "\u200B", value: "\u200B", inline: false },
                    { name: "📋 Powód Bana", value: "```fix\n" + (data.reason || 'Brak powodu') + "\n```", inline: false },
                    { name: "⏱️ Czas Trwania", value: "```fix\n" + durationText + "\n```", inline: true },
                    { name: "📅 Data i Godzina", value: "```fix\n" + now + "\n```", inline: true },
                    { name: "\u200B", value: "\u200B", inline: false },
                    { name: "🆔 ID Gracza", value: "```yml\n" + (data.userId || 'Nieznane') + "\n```", inline: true },
                    { name: "🌐 Serwer", value: "```yml\nŁomża Roleplay\n```", inline: true }
                ],
                thumbnail: {
                    url: "https://www.roblox.com/headshot-thumbnail/image?userId=" + (data.userId || '1') + "&width=420&height=420&format=png"
                },
                footer: { text: "Łomża Roleplay • System Banów • " + now },
                timestamp: new Date().toISOString()
            }
        ]
    });

    try {
        var parsedUrl = url.parse(DISCORD_WEBHOOK);
        var options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };
        var req = https.request(options, function(res) {
            console.log('[Discord] Status: ' + res.statusCode);
        });
        req.on('error', function(e) { console.error('[Discord] Blad: ' + e.message); });
        req.write(payload);
        req.end();
    } catch(e) {
        console.error('[Discord] Blad: ' + e.message);
    }
}

function addLog(type, message) {
    var log = { id: Date.now(), type: type, message: message, time: new Date().toLocaleString('pl-PL') };
    logs.unshift(log);
    if (logs.length > 500) logs.pop();
    io.emit('newLog', log);
    return log;
}

app.post('/api/login', function(req, res) {
    var login = req.body.login;
    var password = req.body.password;
    var found = null;
    for (var i = 0; i < ADMINS.length; i++) {
        if (ADMINS[i].login === login && ADMINS[i].password === password) {
            found = ADMINS[i];
            break;
        }
    }
    if (found) {
        addLog('info', '🔑 ' + login + ' zalogowal sie do panelu (' + found.role + ')');
        return res.json({ success: true, login: found.login, role: found.role });
    }
    return res.json({ success: false });
});

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

app.get('/api/players', function(req, res) { res.json(players); });

app.post('/api/players/kick', function(req, res) {
    var name = req.body.name;
    var reason = req.body.reason || 'Brak powodu';
    var admin = req.body.admin || 'Panel';
    players = players.filter(function(p) { return p.name !== name; });
    commandQueue.push({ type: 'kick', target: name, reason: reason, time: Date.now() });
    addLog('kick', '👢 ' + name + ' wyrzucony przez ' + admin + '. Powod: ' + reason);
    io.emit('playerList', players);
    res.json({ success: true });
});

app.post('/api/players/ban', function(req, res) {
    var name = req.body.name;
    var reason = req.body.reason || 'Brak powodu';
    var duration = req.body.duration || 'perm';
    var admin = req.body.admin || 'Panel';

    var userId = '1';
    for (var i = 0; i < players.length; i++) {
        if (players[i].name === name) {
            userId = players[i].id || '1';
            break;
        }
    }

    players = players.filter(function(p) { return p.name !== name; });
    bannedPlayers.push({
        name: name,
        reason: reason,
        duration: duration,
        admin: admin,
        time: new Date().toLocaleString('pl-PL')
    });
    commandQueue.push({ type: 'ban', target: name, reason: reason, duration: duration, time: Date.now() });
    addLog('ban', '🔨 ' + name + ' ZBANOWANY przez ' + admin + '! Powod: ' + reason);

    sendDiscordBan({ name: name, reason: reason, duration: duration, admin: admin, userId: userId });

    io.emit('playerList', players);
    res.json({ success: true });
});

app.post('/api/players/unban', function(req, res) {
    var name = req.body.name;
    var admin = req.body.admin || 'Panel';
    bannedPlayers = bannedPlayers.filter(function(b) { return b.name !== name; });
    addLog('info', '✅ ' + name + ' odbanowany przez ' + admin);
    res.json({ success: true });
});

app.get('/api/bans', function(req, res) { res.json(bannedPlayers); });

app.post('/api/announce', function(req, res) {
    var message = req.body.message;
    commandQueue.push({ type: 'announce', message: message, time: Date.now() });
    addLog('announce', '📢 Ogloszenie: ' + message);
    io.emit('announcement', { message: message });
    res.json({ success: true });
});

app.post('/api/command', function(req, res) {
    var command = req.body.command;
    commandQueue.push({ type: 'command', command: command, time: Date.now() });
    addLog('command', '⚡ Komenda: ' + command);
    res.json({ success: true });
});

app.get('/api/logs', function(req, res) { res.json(logs); });

app.post('/api/logs/clear', function(req, res) {
    logs = [];
    addLog('info', '🗑️ Logi wyczyszczone');
    res.json({ success: true });
});

app.post('/api/server/settings', function(req, res) {
    if (req.body.name) serverStatus.name = req.body.name;
    if (req.body.maxPlayers) serverStatus.maxPlayers = req.body.maxPlayers;
    addLog('info', '⚙️ Ustawienia zmienione');
    res.json({ success: true });
});

app.post('/api/test/addplayers', function(req, res) {
    var names = ['ProGamer','NoobSlayer','BuilderKing','SpeedRunner','PolskiGracz','CoolPlayer','RobloxFan','DarkKnight'];
    var positions = ['Spawn','Sklep','Komisariat','Szpital','Ratusz','Garaz','Centrum'];
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

app.post('/api/roblox/join', function(req, res) {
    var name = req.body.name || 'Unknown';
    var userId = req.body.userId || '0';
    var isBanned = false;
    for (var i = 0; i < bannedPlayers.length; i++) {
        if (bannedPlayers[i].name === name) { isBanned = true; break; }
    }
    if (isBanned) return res.json({ success: false, banned: true, message: 'Jestes zbanowany!' });
    var player = { name: name, id: userId, joinTime: new Date().toLocaleString('pl-PL'), health: 100, position: 'Spawn' };
    players.push(player);
    addLog('join', '✅ ' + name + ' dolaczyl do gry');
    io.emit('playerList', players);
    serverStatus.isOnline = true;
    io.emit('serverStatus', serverStatus);
    res.json({ success: true, banned: false });
});

app.post('/api/roblox/leave', function(req, res) {
    var name = req.body.name;
    players = players.filter(function(p) { return p.name !== name; });
    addLog('leave', '❌ ' + name + ' opuscil gre');
    io.emit('playerList', players);
    if (players.length === 0) { serverStatus.isOnline = false; io.emit('serverStatus', serverStatus); }
    res.json({ success: true });
});

app.post('/api/roblox/update', function(req, res) {
    var name = req.body.name;
    for (var i = 0; i < players.length; i++) {
        if (players[i].name === name) {
            if (req.body.health !== undefined) players[i].health = req.body.health;
            if (req.body.position) players[i].position = req.body.position;
            break;
        }
    }
    io.emit('playerList', players);
    res.json({ success: true });
});

app.get('/api/roblox/commands', function(req, res) {
    var cmds = commandQueue.slice();
    commandQueue = [];
    res.json(cmds);
});

app.get('/api/roblox/checkban', function(req, res) {
    var name = req.query.name;
    var isBanned = false;
    var reason = '';
    for (var i = 0; i < bannedPlayers.length; i++) {
        if (bannedPlayers[i].name === name) { isBanned = true; reason = bannedPlayers[i].reason; break; }
    }
    res.json({ banned: isBanned, reason: reason });
});

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
    console.log('  Admini:     VsXe | WeXiO | WiSnNiA');
    console.log('  Moderatorzy: zvujsyy | k1ngvss | kebsioow_tortilli | patryk03413');
    console.log('========================================');
    console.log('');
});
