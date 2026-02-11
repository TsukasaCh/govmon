const express = require('express');
const router = express.Router();
const db = require('../database');
const crypto = require('crypto');

// ============ STATS ============
router.get('/stats', (req, res) => {
  res.json(db.getStats());
});

// ============ VPS LIST ============
router.get('/vps', (req, res) => {
  const { status, group, monitor_type, search, page = 1, limit = 50 } = req.query;
  const result = db.getAllVPS({
    status, group, monitor_type, search,
    page: parseInt(page),
    limit: parseInt(limit)
  });
  res.json(result);
});

// ============ VPS DETAIL ============
router.get('/vps/:id', (req, res) => {
  const vps = db.getVPS(req.params.id);
  if (!vps) return res.status(404).json({ error: 'VPS not found' });
  res.json(vps);
});

// ============ VPS PROCESSES ============
router.get('/vps/:id/processes', (req, res) => {
  const processes = db.getProcesses(req.params.id);
  res.json(processes);
});

// ============ ADD VPS ============
router.post('/vps', (req, res) => {
  const { hostname, ip, location, os, monitor_type, vps_group, url, port, protocol, lookup_domain, record_type } = req.body;

  if (!hostname || !ip) return res.status(400).json({ error: 'hostname and ip are required' });

  const apiKey = crypto.randomBytes(32).toString('hex');
  const vps = db.addVPS({
    hostname, ip,
    location: location || 'Jakarta',
    os: os || '-',
    monitor_type: monitor_type || 'agent',
    vps_group: vps_group || 'General',
    api_key: apiKey,
    url: url || '',
    port: parseInt(port) || 0,
    protocol: protocol || '',
    lookup_domain: lookup_domain || '',
    record_type: record_type || 'A'
  });

  res.json({ id: vps.id, api_key: apiKey, message: 'VPS added successfully' });
});

// ============ UPDATE VPS ============
router.put('/vps/:id', (req, res) => {
  const success = db.updateVPS(req.params.id, req.body);
  if (!success) return res.status(404).json({ error: 'VPS not found' });
  res.json({ message: 'VPS updated successfully' });
});

// ============ DELETE VPS ============
router.delete('/vps/:id', (req, res) => {
  const success = db.deleteVPS(req.params.id);
  if (!success) return res.status(404).json({ error: 'VPS not found' });
  res.json({ message: 'VPS deleted successfully' });
});

// ============ AGENT REPORT ============
router.post('/report', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });

  const vps = db.getVPSByApiKey(apiKey);
  if (!vps) return res.status(403).json({ error: 'Invalid API key' });

  const { cpu_percent, mem_percent, mem_total, mem_used, disk_percent, disk_total, disk_used,
    net_in, net_out, net_in_rate, net_out_rate, uptime, load_1, load_5, load_15, processes } = req.body;

  // Update VPS status and auto-detect hardware specs
  const newStatus = cpu_percent > 90 || mem_percent > 95 ? 'warning' : 'online';
  const updateData = { status: newStatus, last_seen: new Date().toISOString() };

  // Auto-detect hardware specs from agent report
  if (req.body.cpu_cores) updateData.cpu_cores = req.body.cpu_cores;
  if (req.body.ram_total_mb) updateData.ram_total = req.body.ram_total_mb;
  if (req.body.disk_total_gb) updateData.disk_total = req.body.disk_total_gb;

  db.updateVPS(vps.id, updateData);

  // Insert metrics
  db.addMetric({
    vps_id: vps.id,
    cpu_percent: cpu_percent || 0,
    mem_percent: mem_percent || 0,
    mem_total: mem_total || 0,
    mem_used: mem_used || 0,
    disk_percent: disk_percent || 0,
    disk_total: disk_total || 0,
    disk_used: disk_used || 0,
    net_in: net_in || 0,
    net_out: net_out || 0,
    net_in_rate: net_in_rate || 0,
    net_out_rate: net_out_rate || 0,
    uptime: uptime || 0,
    load_1: load_1 || 0,
    load_5: load_5 || 0,
    load_15: load_15 || 0
  });

  // Insert processes
  if (processes && Array.isArray(processes)) {
    db.clearOldProcesses(vps.id);
    const ts = new Date().toISOString();
    for (const p of processes) {
      db.addProcess({
        vps_id: vps.id,
        timestamp: ts,
        pid: p.pid,
        name: p.name,
        cpu_percent: p.cpu || 0,
        mem_percent: p.mem || 0,
        mem_rss: p.rss || 0,
        username: p.user,
        command: p.command
      });
    }
  }

  // Generate alerts
  if (cpu_percent > 90) {
    db.addAlert({ vps_id: vps.id, type: 'high_cpu', severity: 'critical', message: `CPU usage at ${cpu_percent}% on ${vps.hostname}` });
  }
  if (mem_percent > 95) {
    db.addAlert({ vps_id: vps.id, type: 'high_memory', severity: 'critical', message: `Memory usage at ${mem_percent}% on ${vps.hostname}` });
  }

  // Broadcast via WebSocket
  if (global.wsBroadcast) {
    global.wsBroadcast(JSON.stringify({
      type: 'metric_update',
      vps_id: vps.id,
      hostname: vps.hostname,
      status: newStatus,
      cpu_percent, mem_percent, net_in_rate, net_out_rate
    }));
  }

  res.json({ message: 'Report received', status: newStatus });
});

// ============ ALERTS ============
router.get('/alerts', (req, res) => {
  const { acknowledged = 0, limit = 50 } = req.query;
  res.json(db.getAlerts({ acknowledged: parseInt(acknowledged), limit: parseInt(limit) }));
});

router.put('/alerts/:id/acknowledge', (req, res) => {
  db.acknowledgeAlert(req.params.id);
  res.json({ message: 'Alert acknowledged' });
});

// ============ GROUPS ============
router.get('/groups', (req, res) => {
  res.json(db.getGroups());
});

module.exports = router;
