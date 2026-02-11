/**
 * GovMon - Pure JavaScript In-Memory Database with JSON Persistence
 * No native modules required
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Default empty database
const DEFAULT_DB = {
  vps: [],
  metrics: [],
  processes: [],
  alerts: [],
  _counters: { vps: 0, metrics: 0, processes: 0, alerts: 0 }
};

// Load from disk or start fresh
let db;
try {
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    console.log(`💾 Database loaded: ${db.vps.length} VPS, ${db.metrics.length} metrics`);
  } else {
    db = JSON.parse(JSON.stringify(DEFAULT_DB));
    console.log('💾 New database initialized');
  }
} catch (e) {
  db = JSON.parse(JSON.stringify(DEFAULT_DB));
  console.log('💾 Database reset due to parse error');
}

// Auto-save every 30 seconds
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(db));
    } catch (e) { console.error('Save error:', e.message); }
  }, 5000);
}

function saveNow() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch (e) { }
}

// ===== Query Helpers =====

const Database = {
  // Get raw data reference (for seeding)
  raw() { return db; },

  // Reset DB
  reset() {
    db.vps = [];
    db.metrics = [];
    db.processes = [];
    db.alerts = [];
    db._counters = { vps: 0, metrics: 0, processes: 0, alerts: 0 };
  },

  // ===== VPS =====
  getAllVPS({ status, group, monitor_type, search, page = 1, limit = 50 } = {}) {
    let results = [...db.vps];

    if (status) results = results.filter(v => v.status === status);
    if (group) results = results.filter(v => v.vps_group === group);
    if (monitor_type) results = results.filter(v => v.monitor_type === monitor_type);
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(v => v.hostname.toLowerCase().includes(q) || v.ip.includes(q));
    }

    // Sort: online first, then by hostname
    results.sort((a, b) => {
      if (a.status === 'online' && b.status !== 'online') return -1;
      if (a.status !== 'online' && b.status === 'online') return 1;
      return a.hostname.localeCompare(b.hostname);
    });

    const total = results.length;
    const offset = (page - 1) * limit;
    const paged = results.slice(offset, offset + limit);

    // Attach latest metric to each VPS
    const enriched = paged.map(v => {
      const latestMetric = this.getLatestMetric(v.id);
      return {
        ...v,
        cpu_percent: latestMetric ? latestMetric.cpu_percent : 0,
        mem_percent: latestMetric ? latestMetric.mem_percent : 0,
        disk_percent: latestMetric ? latestMetric.disk_percent : 0,
        net_in_rate: latestMetric ? latestMetric.net_in_rate : 0,
        net_out_rate: latestMetric ? latestMetric.net_out_rate : 0,
        load_1: latestMetric ? latestMetric.load_1 : 0,
        uptime: latestMetric ? latestMetric.uptime : 0
      };
    });

    return {
      data: enriched,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    };
  },

  getVPS(id) {
    const vps = db.vps.find(v => v.id === parseInt(id));
    if (!vps) return null;

    const latest_metric = this.getLatestMetric(vps.id);
    const metrics_history = db.metrics
      .filter(m => m.vps_id === vps.id)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(-60);

    return { ...vps, latest_metric, metrics_history };
  },

  getVPSByApiKey(apiKey) {
    return db.vps.find(v => v.api_key === apiKey) || null;
  },

  addVPS(data) {
    db._counters.vps++;
    const vps = {
      id: db._counters.vps,
      hostname: data.hostname,
      ip: data.ip,
      location: data.location || 'Jakarta',
      os: data.os || '-',
      status: data.status || 'offline',
      monitor_type: data.monitor_type || 'agent',
      vps_group: data.vps_group || 'General',
      api_key: data.api_key,
      cpu_cores: data.cpu_cores || 0,
      ram_total: data.ram_total || 0,
      disk_total: data.disk_total || 0,
      url: data.url || '',
      port: data.port || 0,
      protocol: data.protocol || '',
      lookup_domain: data.lookup_domain || '',
      record_type: data.record_type || 'A',
      created_at: new Date().toISOString(),
      last_seen: data.last_seen || null
    };
    db.vps.push(vps);
    scheduleSave();
    return vps;
  },

  updateVPS(id, data) {
    const vps = db.vps.find(v => v.id === parseInt(id));
    if (!vps) return false;
    Object.keys(data).forEach(key => {
      if (data[key] !== null && data[key] !== undefined) vps[key] = data[key];
    });
    scheduleSave();
    return true;
  },

  deleteVPS(id) {
    const idx = db.vps.findIndex(v => v.id === parseInt(id));
    if (idx === -1) return false;
    db.vps.splice(idx, 1);
    db.metrics = db.metrics.filter(m => m.vps_id !== parseInt(id));
    db.processes = db.processes.filter(p => p.vps_id !== parseInt(id));
    db.alerts = db.alerts.filter(a => a.vps_id !== parseInt(id));
    scheduleSave();
    return true;
  },

  // ===== METRICS =====
  getLatestMetric(vpsId) {
    const vpsMetrics = db.metrics.filter(m => m.vps_id === vpsId);
    if (vpsMetrics.length === 0) return null;
    return vpsMetrics.reduce((latest, m) =>
      new Date(m.timestamp) > new Date(latest.timestamp) ? m : latest
    );
  },

  addMetric(data) {
    db._counters.metrics++;
    const metric = { id: db._counters.metrics, timestamp: new Date().toISOString(), ...data };
    db.metrics.push(metric);

    // Keep only last 120 per VPS to prevent memory bloat
    const vpsMetrics = db.metrics.filter(m => m.vps_id === data.vps_id);
    if (vpsMetrics.length > 120) {
      const oldest = vpsMetrics.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const toRemove = oldest.slice(0, vpsMetrics.length - 120);
      const removeIds = new Set(toRemove.map(m => m.id));
      db.metrics = db.metrics.filter(m => !removeIds.has(m.id));
    }

    scheduleSave();
    return metric;
  },

  // ===== PROCESSES =====
  getProcesses(vpsId) {
    const vpsProcSets = db.processes.filter(p => p.vps_id === parseInt(vpsId));
    if (vpsProcSets.length === 0) return [];

    // Get latest timestamp
    const latestTs = vpsProcSets.reduce((latest, p) =>
      new Date(p.timestamp) > new Date(latest) ? p.timestamp : latest, vpsProcSets[0].timestamp
    );

    return vpsProcSets
      .filter(p => p.timestamp === latestTs)
      .sort((a, b) => b.cpu_percent - a.cpu_percent)
      .slice(0, 20);
  },

  addProcess(data) {
    db._counters.processes++;
    const proc = { id: db._counters.processes, ...data };
    db.processes.push(proc);
    return proc;
  },

  clearOldProcesses(vpsId) {
    // Keep only latest batch
    const vpsProcs = db.processes.filter(p => p.vps_id === vpsId);
    if (vpsProcs.length === 0) return;
    const latestTs = vpsProcs.reduce((latest, p) =>
      new Date(p.timestamp) > new Date(latest) ? p.timestamp : latest, vpsProcs[0].timestamp
    );
    db.processes = db.processes.filter(p => p.vps_id !== vpsId || p.timestamp === latestTs);
  },

  // ===== ALERTS =====
  getAlerts({ acknowledged = 0, limit = 50 } = {}) {
    return db.alerts
      .filter(a => a.acknowledged === parseInt(acknowledged))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit)
      .map(a => {
        const vps = db.vps.find(v => v.id === a.vps_id);
        return { ...a, hostname: vps ? vps.hostname : 'Unknown', ip: vps ? vps.ip : '' };
      });
  },

  addAlert(data) {
    db._counters.alerts++;
    const alert = {
      id: db._counters.alerts,
      acknowledged: 0,
      created_at: new Date().toISOString(),
      ...data
    };
    db.alerts.push(alert);
    scheduleSave();
    return alert;
  },

  acknowledgeAlert(id) {
    const alert = db.alerts.find(a => a.id === parseInt(id));
    if (alert) { alert.acknowledged = 1; scheduleSave(); return true; }
    return false;
  },

  // ===== STATS =====
  getStats() {
    const total = db.vps.length;
    const online = db.vps.filter(v => v.status === 'online').length;
    const offline = db.vps.filter(v => v.status === 'offline').length;
    const warning = db.vps.filter(v => v.status === 'warning').length;
    const maintenance = db.vps.filter(v => v.status === 'maintenance').length;

    // Avg CPU across latest metrics
    let cpuSum = 0, cpuCount = 0, bwIn = 0, bwOut = 0;
    for (const vps of db.vps) {
      const m = this.getLatestMetric(vps.id);
      if (m) {
        cpuSum += m.cpu_percent;
        bwIn += m.net_in_rate || 0;
        bwOut += m.net_out_rate || 0;
        cpuCount++;
      }
    }

    const activeAlerts = db.alerts.filter(a => a.acknowledged === 0).length;

    // Groups
    const groupMap = {};
    db.vps.forEach(v => { groupMap[v.vps_group] = (groupMap[v.vps_group] || 0) + 1; });
    const groups = Object.entries(groupMap)
      .map(([vps_group, count]) => ({ vps_group, count }))
      .sort((a, b) => b.count - a.count);

    return {
      total, online, offline, warning, maintenance,
      avg_cpu: cpuCount > 0 ? Math.round(cpuSum / cpuCount * 10) / 10 : 0,
      total_bandwidth_in: Math.round(bwIn * 10) / 10,
      total_bandwidth_out: Math.round(bwOut * 10) / 10,
      active_alerts: activeAlerts,
      groups
    };
  },

  getGroups() {
    return [...new Set(db.vps.map(v => v.vps_group))].sort();
  },

  // Mark VPS offline if not seen recently
  markStaleOffline(maxAgeMs) {
    const cutoff = Date.now() - maxAgeMs;
    let count = 0;
    db.vps.forEach(v => {
      if ((v.status === 'online' || v.status === 'warning') && v.monitor_type === 'agent') {
        if (v.last_seen && new Date(v.last_seen).getTime() < cutoff) {
          v.status = 'offline';
          count++;
        }
      }
    });
    if (count > 0) scheduleSave();
    return count;
  },

  save() { saveNow(); }
};

module.exports = Database;
