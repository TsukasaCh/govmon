const db = require('./database');
const crypto = require('crypto');

console.log('🌱 Seeding database with demo government VPS data...\n');

// Reset database
db.reset();

// OPD / Dinas Pemprov DKI Jakarta
const opdList = [
    { prefix: 'DISDUKCAPIL', name: 'Disdukcapil DKI Jakarta' },
    { prefix: 'DISDIK', name: 'Dinas Pendidikan DKI Jakarta' },
    { prefix: 'DINKES', name: 'Dinas Kesehatan DKI Jakarta' },
    { prefix: 'DISHUB', name: 'Dinas Perhubungan DKI Jakarta' },
    { prefix: 'BPBD', name: 'BPBD DKI Jakarta' },
    { prefix: 'DLH', name: 'Dinas Lingkungan Hidup DKI Jakarta' },
    { prefix: 'DPMPTSP', name: 'DPMPTSP DKI Jakarta' },
    { prefix: 'DISKOMINFOTIK', name: 'Diskominfotik DKI Jakarta' },
    { prefix: 'BPKD', name: 'BPKD DKI Jakarta' },
    { prefix: 'DISPARBUD', name: 'Dinas Pariwisata & Kebudayaan DKI Jakarta' },
    { prefix: 'DINSOS', name: 'Dinas Sosial DKI Jakarta' },
    { prefix: 'DINAS-PU', name: 'Dinas Pekerjaan Umum DKI Jakarta' },
    { prefix: 'SATPOL-PP', name: 'Satpol PP DKI Jakarta' },
    { prefix: 'BAPPEDA', name: 'Bappeda DKI Jakarta' },
    { prefix: 'BKD', name: 'BKD DKI Jakarta' },
    { prefix: 'INSPEKTORAT', name: 'Inspektorat DKI Jakarta' },
    { prefix: 'DISTAN-KP', name: 'Dinas Ketahanan Pangan DKI Jakarta' },
    { prefix: 'DISNAKER', name: 'Dinas Tenaga Kerja DKI Jakarta' },
    { prefix: 'DPRD-SEKRET', name: 'Sekretariat DPRD DKI Jakarta' },
    { prefix: 'SETDA', name: 'Sekretariat Daerah DKI Jakarta' },
];

const osVersions = ['Ubuntu 22.04 LTS', 'Ubuntu 20.04 LTS', 'CentOS 7', 'CentOS 8 Stream', 'Rocky Linux 9', 'Debian 12', 'RHEL 8', 'AlmaLinux 9'];
const vpsTypes = ['WEB', 'DB', 'APP', 'MAIL', 'DNS', 'PROXY', 'BACKUP', 'MON', 'API', 'FILE'];

function randomBetween(min, max) { return Math.random() * (max - min) + min; }
function randomInt(min, max) { return Math.floor(randomBetween(min, max)); }
function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function generateIP(i) { return `10.1.${Math.floor(i / 256) + 1}.${(i % 256) + 2}`; }

const vpsEntries = [];
let vpsIdx = 0;

// Create VPS entries
for (const opd of opdList) {
    const count = randomInt(4, 10);
    for (let i = 1; i <= count; i++) {
        vpsIdx++;
        const vpsType = randomChoice(vpsTypes);
        const hostname = `${opd.prefix}-${vpsType}-${String(i).padStart(2, '0')}`;
        const statusRoll = Math.random();
        let status = 'online';
        if (statusRoll < 0.08) status = 'offline';
        else if (statusRoll < 0.18) status = 'warning';
        else if (statusRoll < 0.22) status = 'maintenance';

        const monitorType = Math.random() > 0.3 ? 'agent' : 'agentless';
        const cpuCores = randomChoice([2, 4, 8, 16]);
        const ramTotal = randomChoice([2048, 4096, 8192, 16384, 32768]);
        const diskTotal = randomChoice([50, 100, 200, 500]);

        const lastSeen = status === 'offline'
            ? new Date(Date.now() - randomInt(3600000, 86400000)).toISOString()
            : new Date(Date.now() - randomInt(0, 60000)).toISOString();

        const vps = db.addVPS({
            hostname,
            ip: generateIP(vpsIdx),
            location: 'Jakarta',
            os: randomChoice(osVersions),
            status,
            monitor_type: monitorType,
            vps_group: opd.name,
            api_key: crypto.randomBytes(32).toString('hex'),
            cpu_cores: cpuCores,
            ram_total: ramTotal,
            disk_total: diskTotal,
            last_seen: lastSeen
        });

        vpsEntries.push({ ...vps, cpuCores, ramTotal, diskTotal });
    }
}

console.log(`✅ Created ${vpsEntries.length} VPS entries\n`);

// Generate metrics history (60 data points per VPS, ~30s apart)
let metricsCount = 0;
const now = Date.now();

for (const vps of vpsEntries) {
    const baseCpu = randomBetween(10, 60);
    const baseMem = randomBetween(30, 75);
    const baseDisk = randomBetween(20, 80);
    const baseNetIn = randomBetween(0.5, 50);
    const baseNetOut = randomBetween(0.2, 30);

    for (let i = 59; i >= 0; i--) {
        const timestamp = new Date(now - i * 30000).toISOString();
        const cpuVariance = randomBetween(-15, 15);
        const cpuPercent = Math.max(0, Math.min(100, baseCpu + cpuVariance + (vps.status === 'warning' ? 30 : 0)));
        const memPercent = Math.max(0, Math.min(100, baseMem + randomBetween(-5, 5)));
        const memUsed = Math.round(vps.ramTotal * memPercent / 100);
        const diskPercent = Math.max(0, Math.min(100, baseDisk + randomBetween(-1, 1)));
        const diskUsed = Math.round(vps.diskTotal * diskPercent / 100);
        const netInRate = Math.max(0, baseNetIn + randomBetween(-5, 5));
        const netOutRate = Math.max(0, baseNetOut + randomBetween(-3, 3));

        // Directly push to avoid counter overhead for bulk insert
        const raw = db.raw();
        raw._counters.metrics++;
        raw.metrics.push({
            id: raw._counters.metrics,
            vps_id: vps.id,
            timestamp,
            cpu_percent: Math.round(cpuPercent * 10) / 10,
            mem_percent: Math.round(memPercent * 10) / 10,
            mem_total: vps.ramTotal,
            mem_used: memUsed,
            disk_percent: Math.round(diskPercent * 10) / 10,
            disk_total: vps.diskTotal,
            disk_used: diskUsed,
            net_in: Math.round(netInRate * 1000),
            net_out: Math.round(netOutRate * 1000),
            net_in_rate: Math.round(netInRate * 10) / 10,
            net_out_rate: Math.round(netOutRate * 10) / 10,
            uptime: randomInt(86400, 8640000),
            load_1: Math.round(randomBetween(0.1, cpuPercent / 25) * 100) / 100,
            load_5: Math.round(randomBetween(0.1, cpuPercent / 30) * 100) / 100,
            load_15: Math.round(randomBetween(0.1, cpuPercent / 35) * 100) / 100
        });
        metricsCount++;
    }
}

console.log(`✅ Created ${metricsCount} metric entries\n`);

// Generate processes
const commonProcesses = [
    { name: 'nginx', command: '/usr/sbin/nginx -g daemon off;', user: 'www-data' },
    { name: 'apache2', command: '/usr/sbin/apache2 -k start', user: 'www-data' },
    { name: 'mysqld', command: '/usr/sbin/mysqld --basedir=/usr', user: 'mysql' },
    { name: 'postgres', command: '/usr/lib/postgresql/14/bin/postgres', user: 'postgres' },
    { name: 'redis-server', command: '/usr/bin/redis-server 127.0.0.1:6379', user: 'redis' },
    { name: 'node', command: '/usr/bin/node /app/server.js', user: 'app' },
    { name: 'python3', command: '/usr/bin/python3 /app/main.py', user: 'app' },
    { name: 'java', command: '/usr/bin/java -jar /app/service.jar', user: 'app' },
    { name: 'php-fpm', command: 'php-fpm: master process', user: 'www-data' },
    { name: 'sshd', command: '/usr/sbin/sshd -D', user: 'root' },
    { name: 'systemd', command: '/lib/systemd/systemd --system', user: 'root' },
    { name: 'cron', command: '/usr/sbin/cron -f', user: 'root' },
    { name: 'dockerd', command: '/usr/bin/dockerd -H fd://', user: 'root' },
    { name: 'containerd', command: '/usr/bin/containerd', user: 'root' },
    { name: 'fail2ban', command: '/usr/bin/python3 /usr/bin/fail2ban-server', user: 'root' },
];

let processCount = 0;
const processTimestamp = new Date().toISOString();
const raw = db.raw();

for (const vps of vpsEntries) {
    const numProcs = randomInt(6, 12);
    const shuffled = [...commonProcesses].sort(() => Math.random() - 0.5).slice(0, numProcs);

    for (const proc of shuffled) {
        raw._counters.processes++;
        raw.processes.push({
            id: raw._counters.processes,
            vps_id: vps.id,
            timestamp: processTimestamp,
            pid: randomInt(100, 65535),
            name: proc.name,
            cpu_percent: Math.round(randomBetween(0, 35) * 10) / 10,
            mem_percent: Math.round(randomBetween(0.1, 15) * 10) / 10,
            mem_rss: randomInt(1024, 524288),
            username: proc.user,
            command: proc.command
        });
        processCount++;
    }
}

console.log(`✅ Created ${processCount} process entries\n`);

// Generate alerts
let alertCount = 0;
for (const vps of vpsEntries) {
    if (vps.status === 'warning' || Math.random() < 0.15) {
        const alertTypes = [
            { type: 'high_cpu', severity: 'critical', message: `CPU usage exceeded 90% on ${vps.hostname}` },
            { type: 'high_memory', severity: 'warning', message: `Memory usage at 85% on ${vps.hostname}` },
            { type: 'disk_space', severity: 'warning', message: `Disk usage exceeded 80% on ${vps.hostname}` },
            { type: 'service_down', severity: 'critical', message: `Service nginx is down on ${vps.hostname}` },
            { type: 'high_load', severity: 'warning', message: `Load average exceeded threshold on ${vps.hostname}` },
        ];
        const alert = randomChoice(alertTypes);
        raw._counters.alerts++;
        raw.alerts.push({
            id: raw._counters.alerts,
            vps_id: vps.id,
            ...alert,
            acknowledged: 0,
            created_at: new Date(Date.now() - randomInt(0, 3600000)).toISOString()
        });
        alertCount++;
    }
}

console.log(`✅ Created ${alertCount} alert entries\n`);

// Save to disk
db.save();

console.log('🎉 Database seeded successfully!');
console.log(`📊 Total: ${vpsEntries.length} VPS servers across ${opdList.length} OPD Pemprov DKI Jakarta\n`);
