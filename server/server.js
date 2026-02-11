const express = require('express');
const dns = require('dns');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const db = require('./database');
const apiRoutes = require('./routes/api');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve agent scripts
app.use('/agent', express.static(path.join(__dirname, '..', 'agent')));

// API Routes
app.use('/api', apiRoutes);

// WebSocket handling
wss.on('connection', (ws) => {
    console.log('📡 Dashboard client connected');
    ws.on('close', () => console.log('📡 Dashboard client disconnected'));
});

// Global broadcast function
global.wsBroadcast = (data) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
};

// Mark VPS as offline if no report in 2 minutes (agent-based only)
const cron = require('node-cron');
const { exec } = require('child_process');

cron.schedule('* * * * *', () => {
    const count = db.markStaleOffline(2 * 60 * 1000);
    if (count > 0) {
        global.wsBroadcast(JSON.stringify({ type: 'status_change', message: `${count} VPS went offline` }));
    }
});

// ICMP Ping for agentless VPS — every 30 seconds
function runICMPPing() {
    const allVPS = db.raw().vps.filter(v => v.monitor_type === 'agentless');
    for (const vps of allVPS) {
        const isWindows = process.platform === 'win32';
        const cmd = isWindows
            ? `ping -n 3 -w 3000 ${vps.ip}`
            : `ping -c 3 -W 3 ${vps.ip}`;

        exec(cmd, (err, stdout) => {
            const wasOnline = vps.status === 'online';
            const now = new Date().toISOString();

            // Parse ping output
            let latency = -1, ttl = 0, packetLoss = 100;

            if (!err && stdout) {
                // Parse latency (average)
                const avgMatch = stdout.match(/Average\s*=\s*(\d+)ms/i) ||
                    stdout.match(/avg\s*[=\/]\s*([\d.]+)/i) ||
                    stdout.match(/rtt.*?=\s*[\d.]+\/([\d.]+)/);
                if (avgMatch) latency = parseFloat(avgMatch[1]);

                // Parse individual latency if no avg
                if (latency < 0) {
                    const timeMatches = stdout.match(/time[=<]\s*([\d.]+)\s*ms/gi);
                    if (timeMatches && timeMatches.length > 0) {
                        const times = timeMatches.map(t => parseFloat(t.match(/([\d.]+)/)[1]));
                        latency = times.reduce((a, b) => a + b, 0) / times.length;
                    }
                }

                // Parse TTL
                const ttlMatch = stdout.match(/TTL[=:]\s*(\d+)/i);
                if (ttlMatch) ttl = parseInt(ttlMatch[1]);

                // Parse packet loss
                const lossMatch = stdout.match(/(\d+)%\s*(packet\s+)?loss/i) ||
                    stdout.match(/Lost\s*=\s*(\d+)/i);
                if (lossMatch) {
                    if (stdout.match(/Lost\s*=\s*\d+/i)) {
                        const sentMatch = stdout.match(/Sent\s*=\s*(\d+)/i);
                        const lostMatch = stdout.match(/Lost\s*=\s*(\d+)/i);
                        if (sentMatch && lostMatch) {
                            packetLoss = Math.round((parseInt(lostMatch[1]) / parseInt(sentMatch[1])) * 100);
                        }
                    } else {
                        packetLoss = parseInt(lossMatch[1]);
                    }
                }
            }

            const isUp = latency >= 0 && packetLoss < 100;

            // Store ping metric
            db.addMetric({
                vps_id: vps.id,
                // Store ping data in metric fields for reuse
                cpu_percent: 0,
                mem_percent: 0,
                mem_total: 0,
                mem_used: 0,
                disk_percent: 0,
                disk_total: 0,
                disk_used: 0,
                net_in: 0,
                net_out: 0,
                net_in_rate: latency >= 0 ? latency : 0,   // Reuse net_in_rate for latency (ms)
                net_out_rate: packetLoss,                    // Reuse net_out_rate for packet loss (%)
                uptime: ttl,                                 // Reuse uptime for TTL
                load_1: isUp ? 1 : 0,                       // 1 = reachable, 0 = unreachable
                load_5: 0,
                load_15: 0
            });

            if (isUp) {
                db.updateVPS(vps.id, { status: 'online', last_seen: now });
                if (!wasOnline) {
                    global.wsBroadcast(JSON.stringify({ type: 'status_change', message: `${vps.hostname} is now online (ICMP)` }));
                }
            } else {
                db.updateVPS(vps.id, { status: 'offline' });
                if (wasOnline) {
                    global.wsBroadcast(JSON.stringify({ type: 'status_change', message: `${vps.hostname} went offline (ICMP)` }));
                    db.addAlert({ vps_id: vps.id, type: 'icmp_down', severity: 'critical', message: `ICMP Ping failed for ${vps.hostname} (${vps.ip})` });
                }
            }

            // Broadcast ping update
            global.wsBroadcast(JSON.stringify({
                type: 'metric_update',
                vps_id: vps.id,
                hostname: vps.hostname,
                status: isUp ? 'online' : 'offline',
                latency: latency >= 0 ? latency : -1,
                packet_loss: packetLoss,
                ttl: ttl
            }));
        });
    }
}

// Run immediately on start, then every 30 seconds
setTimeout(runICMPPing, 5000);
setInterval(runICMPPing, 30000);

// HTTP Website Check — every 30 seconds
const https = require('https');

function runHTTPCheck() {
    const allVPS = db.raw().vps.filter(v => v.monitor_type === 'http');
    for (const vps of allVPS) {
        const targetUrl = vps.url || `http://${vps.ip}`;
        const startTime = Date.now();
        const mod = targetUrl.startsWith('https') ? https : http;

        const req = mod.get(targetUrl, { timeout: 10000, rejectUnauthorized: false }, (res) => {
            const responseTime = Date.now() - startTime;
            const statusCode = res.statusCode;
            let bodySize = 0;
            res.on('data', (chunk) => { bodySize += chunk.length; });
            res.on('end', () => {
                const isUp = statusCode >= 200 && statusCode < 500;
                const wasOnline = vps.status === 'online';
                const now = new Date().toISOString();

                // Store HTTP metrics using field reuse:
                // net_in_rate = response time (ms), net_out_rate = status code
                // uptime = body size (bytes), load_1 = 1/0 reachable
                db.addMetric({
                    vps_id: vps.id,
                    cpu_percent: 0, mem_percent: 0, mem_total: 0, mem_used: 0,
                    disk_percent: 0, disk_total: 0, disk_used: 0,
                    net_in: bodySize, net_out: 0,
                    net_in_rate: responseTime,
                    net_out_rate: statusCode,
                    uptime: bodySize,
                    load_1: isUp ? 1 : 0,
                    load_5: 0, load_15: 0
                });

                if (isUp) {
                    db.updateVPS(vps.id, { status: 'online', last_seen: now });
                    if (!wasOnline) global.wsBroadcast(JSON.stringify({ type: 'status_change', message: `${vps.hostname} is now online (HTTP ${statusCode})` }));
                } else {
                    db.updateVPS(vps.id, { status: 'offline' });
                    if (wasOnline) {
                        global.wsBroadcast(JSON.stringify({ type: 'status_change', message: `${vps.hostname} went offline (HTTP ${statusCode})` }));
                        db.addAlert({ vps_id: vps.id, type: 'http_down', severity: 'critical', message: `HTTP check failed for ${vps.hostname} — Status ${statusCode}` });
                    }
                }

                global.wsBroadcast(JSON.stringify({
                    type: 'metric_update', vps_id: vps.id, hostname: vps.hostname,
                    status: isUp ? 'online' : 'offline',
                    response_time: responseTime, status_code: statusCode
                }));
            });
        });

        req.on('error', () => {
            const responseTime = Date.now() - startTime;
            const wasOnline = vps.status === 'online';
            db.addMetric({
                vps_id: vps.id,
                cpu_percent: 0, mem_percent: 0, mem_total: 0, mem_used: 0,
                disk_percent: 0, disk_total: 0, disk_used: 0,
                net_in: 0, net_out: 0,
                net_in_rate: responseTime, net_out_rate: 0,
                uptime: 0, load_1: 0, load_5: 0, load_15: 0
            });
            db.updateVPS(vps.id, { status: 'offline' });
            if (wasOnline) {
                global.wsBroadcast(JSON.stringify({ type: 'status_change', message: `${vps.hostname} went offline (HTTP Error)` }));
                db.addAlert({ vps_id: vps.id, type: 'http_down', severity: 'critical', message: `HTTP check failed for ${vps.hostname} — Connection error` });
            }
            global.wsBroadcast(JSON.stringify({
                type: 'metric_update', vps_id: vps.id, hostname: vps.hostname,
                status: 'offline', response_time: responseTime, status_code: 0
            }));
        });

        req.on('timeout', () => { req.destroy(); });
    }
}

setTimeout(runHTTPCheck, 6000);
setInterval(runHTTPCheck, 30000);

// TCP/UDP Port Check — every 30 seconds
const net = require('net');
const dgram = require('dgram');

function runTCPUDPCheck() {
    const allVPS = db.raw().vps.filter(v => v.monitor_type === 'tcp_udp');
    for (const vps of allVPS) {
        const port = vps.port || 80;
        const proto = (vps.protocol || 'tcp').toLowerCase();
        const startTime = Date.now();

        if (proto === 'udp') {
            const client = dgram.createSocket('udp4');
            const msg = Buffer.from('ping');
            const timeout = setTimeout(() => {
                // UDP: no response usually means port is open (no ICMP unreachable)
                const responseTime = Date.now() - startTime;
                client.close();
                storePortMetric(vps, responseTime, port, true, 'udp');
            }, 5000);

            client.send(msg, port, vps.ip, (err) => {
                if (err) {
                    clearTimeout(timeout);
                    const responseTime = Date.now() - startTime;
                    client.close();
                    storePortMetric(vps, responseTime, port, false, 'udp');
                }
            });

            client.on('message', () => {
                clearTimeout(timeout);
                const responseTime = Date.now() - startTime;
                client.close();
                storePortMetric(vps, responseTime, port, true, 'udp');
            });

            client.on('error', () => {
                clearTimeout(timeout);
                const responseTime = Date.now() - startTime;
                try { client.close(); } catch (e) { }
                storePortMetric(vps, responseTime, port, false, 'udp');
            });
        } else {
            // TCP
            const socket = new net.Socket();
            socket.setTimeout(5000);

            socket.connect(port, vps.ip, () => {
                const responseTime = Date.now() - startTime;
                socket.destroy();
                storePortMetric(vps, responseTime, port, true, 'tcp');
            });

            socket.on('error', () => {
                const responseTime = Date.now() - startTime;
                socket.destroy();
                storePortMetric(vps, responseTime, port, false, 'tcp');
            });

            socket.on('timeout', () => {
                const responseTime = Date.now() - startTime;
                socket.destroy();
                storePortMetric(vps, responseTime, port, false, 'tcp');
            });
        }
    }
}

function storePortMetric(vps, responseTime, port, isUp, proto) {
    const wasOnline = vps.status === 'online';
    const now = new Date().toISOString();

    // net_in_rate = response time (ms), net_out_rate = port number
    // uptime = 0, load_1 = 1/0 reachable
    db.addMetric({
        vps_id: vps.id,
        cpu_percent: 0, mem_percent: 0, mem_total: 0, mem_used: 0,
        disk_percent: 0, disk_total: 0, disk_used: 0,
        net_in: 0, net_out: 0,
        net_in_rate: responseTime,
        net_out_rate: port,
        uptime: 0,
        load_1: isUp ? 1 : 0,
        load_5: 0, load_15: 0
    });

    if (isUp) {
        db.updateVPS(vps.id, { status: 'online', last_seen: now });
        if (!wasOnline) global.wsBroadcast(JSON.stringify({ type: 'status_change', message: `${vps.hostname} port ${port}/${proto} is now OPEN` }));
    } else {
        db.updateVPS(vps.id, { status: 'offline' });
        if (wasOnline) {
            global.wsBroadcast(JSON.stringify({ type: 'status_change', message: `${vps.hostname} port ${port}/${proto} is now CLOSED` }));
            db.addAlert({ vps_id: vps.id, type: 'port_down', severity: 'critical', message: `Port ${port}/${proto} closed on ${vps.hostname} (${vps.ip})` });
        }
    }

    global.wsBroadcast(JSON.stringify({
        type: 'metric_update', vps_id: vps.id, hostname: vps.hostname,
        status: isUp ? 'online' : 'offline',
        response_time: responseTime, port: port
    }));
}

setTimeout(runTCPUDPCheck, 7000);
setInterval(runTCPUDPCheck, 30000);

function runDNSCheck() {
    const allVPS = db.raw().vps.filter(v => v.monitor_type === 'dns');
    for (const vps of allVPS) {
        const domain = vps.lookup_domain || 'google.com';
        const type = vps.record_type || 'A';
        const resolver = new dns.Resolver();

        try {
            resolver.setServers([vps.ip]);
        } catch (e) {
            storeDNSMetric(vps, 0, 'Invalid IP', false);
            continue;
        }

        const startTime = Date.now();
        resolver.resolve(domain, type, (err, addresses) => {
            const responseTime = Date.now() - startTime;
            if (err) {
                storeDNSMetric(vps, responseTime, err.code, false);
            } else {
                const result = Array.isArray(addresses) ? addresses.join(', ') : JSON.stringify(addresses);
                storeDNSMetric(vps, responseTime, result, true);
            }
        });
    }
}

function storeDNSMetric(vps, responseTime, result, isUp) {
    db.addMetric({
        vps_id: vps.id,
        cpu_percent: 0, ram_percent: 0, disk_percent: 0,
        net_in_rate: responseTime,  // Response Time (ms)
        net_out_rate: 0,            // Unused
        uptime: 0,                  // Unused
        load_1: isUp ? 1 : 0,       // Status
        dns_res: result             // Resolved IP or Error Code
    });

    db.updateVPS(vps.id, {
        status: isUp ? 'online' : 'offline',
        last_seen: isUp ? new Date().toISOString() : vps.last_seen
    });

    global.wsBroadcast(JSON.stringify({
        type: 'metric_update',
        vps_id: vps.id,
        hostname: vps.hostname,
        status: isUp ? 'online' : 'offline',
        response_time: responseTime,
        dns_res: result
    }));
}

setTimeout(runDNSCheck, 10000);
setInterval(runDNSCheck, 30000);

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

server.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════════╗
  ║   🏛️  GovMon - VPS Monitoring System         ║
  ║   🌐  http://localhost:${PORT}                  ║
  ║   📡  WebSocket active                        ║
  ║   💾  Database: JSON In-Memory                ║
  ╚══════════════════════════════════════════════╝
  `);
});
