/* ============================================================
   GovMon - Reusable UI Components
   ============================================================ */

const Components = {
  statusBadge(status) {
    return `<span class="status-badge ${status}">${status}</span>`;
  },

  pulseDot(status) {
    return `<div class="pulse-dot ${status}"></div>`;
  },

  vpsCard(vps) {
    const cpu = vps.cpu_percent || 0;
    const mem = vps.mem_percent || 0;
    const netIn = vps.net_in_rate || 0;
    const netOut = vps.net_out_rate || 0;
    const mt = vps.monitor_type;

    let metricsHtml = '';
    if (mt === 'agentless') {
      metricsHtml = `
          <div class="vps-metric">
            <span class="vps-metric-label">Latency</span>
            <span class="vps-metric-value" style="color:${netIn > 200 ? '#ff4757' : netIn > 100 ? '#ffa502' : '#00ff88'}">${netIn > 0 ? netIn.toFixed(1) + ' ms' : '-'}</span>
          </div>
          <div class="vps-metric">
            <span class="vps-metric-label">Pkt Loss</span>
            <span class="vps-metric-value" style="color:${netOut > 50 ? '#ff4757' : netOut > 0 ? '#ffa502' : '#00ff88'}">${netOut}%</span>
          </div>`;
    } else if (mt === 'http') {
      const respTime = netIn;
      const statusCode = netOut;
      const scColor = statusCode >= 200 && statusCode < 300 ? '#00ff88' : statusCode >= 300 && statusCode < 400 ? '#ffa502' : '#ff4757';
      metricsHtml = `
          <div class="vps-metric">
            <span class="vps-metric-label">Resp Time</span>
            <span class="vps-metric-value" style="color:${respTime > 2000 ? '#ff4757' : respTime > 500 ? '#ffa502' : '#00ff88'}">${respTime > 0 ? respTime + ' ms' : '-'}</span>
          </div>
          <div class="vps-metric">
            <span class="vps-metric-label">Status</span>
            <span class="vps-metric-value" style="color:${scColor}">${statusCode > 0 ? statusCode : '-'}</span>
          </div>`;
    } else if (mt === 'tcp_udp') {
      const respTime = netIn;
      const portNum = vps.port || netOut;
      const proto = (vps.protocol || 'tcp').toUpperCase();
      metricsHtml = `
          <div class="vps-metric">
            <span class="vps-metric-label">Resp Time</span>
            <span class="vps-metric-value" style="color:${respTime > 2000 ? '#ff4757' : respTime > 500 ? '#ffa502' : '#00ff88'}">${respTime > 0 ? respTime + ' ms' : '-'}</span>
          </div>
          <div class="vps-metric">
            <span class="vps-metric-label">Port</span>
            <span class="vps-metric-value">${portNum} ${proto}</span>
          </div>`;
    } else if (mt === 'dns') {
      const respTime = netIn;
      const status = vps.status === 'online';
      metricsHtml = `
          <div class="vps-metric">
            <span class="vps-metric-label">Resp Time</span>
            <span class="vps-metric-value" style="color:${respTime > 2000 ? '#ff4757' : respTime > 500 ? '#ffa502' : '#00ff88'}">${respTime > 0 ? respTime + ' ms' : '-'}</span>
          </div>
          <div class="vps-metric">
            <span class="vps-metric-label">Status</span>
            <span class="vps-metric-value" style="color:${status ? '#00ff88' : '#ff4757'}">${status ? 'RESOLVED' : 'FAILED'}</span>
          </div>`;
    } else {
      metricsHtml = `
          <div class="vps-metric">
            <span class="vps-metric-label">CPU</span>
            <span class="vps-metric-value" style="color:${this.cpuColor(cpu)}">${cpu.toFixed(1)}%</span>
            <div class="metric-bar"><div class="metric-bar-fill cpu" style="width:${Math.min(cpu, 100)}%"></div></div>
          </div>
          <div class="vps-metric">
            <span class="vps-metric-label">Memory</span>
            <span class="vps-metric-value">${mem.toFixed(1)}%</span>
            <div class="metric-bar"><div class="metric-bar-fill mem" style="width:${Math.min(mem, 100)}%"></div></div>
          </div>
          <div class="vps-metric">
            <span class="vps-metric-label">Net In</span>
            <span class="vps-metric-value">${this.formatBandwidth(netIn)}</span>
          </div>
          <div class="vps-metric">
            <span class="vps-metric-label">Net Out</span>
            <span class="vps-metric-value">${this.formatBandwidth(netOut)}</span>
          </div>`;
    }

    return `
      <div class="vps-card status-${vps.status}" data-id="${vps.id}" onclick="App.showDetail(${vps.id})">
        <div class="vps-card-header">
          <div>
            <div class="vps-hostname">${this.escapeHtml(vps.hostname)}</div>
            <div class="vps-ip">${vps.ip}</div>
          </div>
          ${this.statusBadge(vps.status)}
        </div>
        <div class="vps-metrics">
          ${metricsHtml}
        </div>
        <div class="vps-card-footer">
          <span class="vps-tag ${vps.monitor_type}">${vps.monitor_type}</span>
          <span>${vps.vps_group || 'General'}</span>
        </div>
      </div>
    `;
  },

  serverTableRow(vps) {
    const cpu = vps.cpu_percent || 0;
    const mem = vps.mem_percent || 0;
    const netIn = vps.net_in_rate || 0;
    const netOut = vps.net_out_rate || 0;
    const mt = vps.monitor_type;

    let col4, col5, col6;
    if (mt === 'agentless') {
      col4 = `<td style="color:${netIn > 200 ? '#ff4757' : netIn > 100 ? '#ffa502' : '#00ff88'};font-weight:600">${netIn > 0 ? netIn.toFixed(1) + ' ms' : '-'}</td>`;
      col5 = `<td style="color:${netOut > 50 ? '#ff4757' : netOut > 0 ? '#ffa502' : '#00ff88'};font-weight:600">${netOut}%</td>`;
      col6 = `<td>ICMP Ping</td>`;
    } else if (mt === 'http') {
      const scColor = netOut >= 200 && netOut < 300 ? '#00ff88' : netOut >= 300 && netOut < 400 ? '#ffa502' : '#ff4757';
      col4 = `<td style="color:${netIn > 2000 ? '#ff4757' : netIn > 500 ? '#ffa502' : '#00ff88'};font-weight:600">${netIn > 0 ? netIn + ' ms' : '-'}</td>`;
      col5 = `<td style="color:${scColor};font-weight:600">${netOut > 0 ? netOut : '-'}</td>`;
      col6 = `<td>HTTP</td>`;
    } else if (mt === 'tcp_udp') {
      col4 = `<td style="color:${netIn > 2000 ? '#ff4757' : netIn > 500 ? '#ffa502' : '#00ff88'};font-weight:600">${netIn > 0 ? netIn + ' ms' : '-'}</td>`;
      col5 = `<td style="font-weight:600">${vps.port || '-'}</td>`;
      col6 = `<td>${(vps.protocol || 'TCP').toUpperCase()}</td>`;
    } else if (mt === 'dns') {
      col4 = `<td style="color:${netIn > 2000 ? '#ff4757' : netIn > 500 ? '#ffa502' : '#00ff88'};font-weight:600">${netIn > 0 ? netIn + ' ms' : '-'}</td>`;
      const isUp = vps.status === 'online';
      col5 = `<td style="color:${isUp ? '#00ff88' : '#ff4757'};font-weight:600">${isUp ? 'RESOLVED' : 'FAILED'}</td>`;
      col6 = `<td>DNS</td>`;
    } else {
      col4 = `<td style="color:${this.cpuColor(cpu)};font-weight:600">${cpu.toFixed(1)}%</td>`;
      col5 = `<td>${mem.toFixed(1)}%</td>`;
      col6 = `<td>↓${this.formatBandwidth(netIn)} ↑${this.formatBandwidth(netOut)}</td>`;
    }

    return `
      <tr onclick="App.showDetail(${vps.id})" data-id="${vps.id}">
        <td>${this.pulseDot(vps.status)} <span class="status-badge ${vps.status}" style="margin-left:8px">${vps.status}</span></td>
        <td class="hostname-cell">${this.escapeHtml(vps.hostname)}</td>
        <td style="font-variant-numeric:tabular-nums">${vps.ip}</td>
        <td>${vps.vps_group || '-'}</td>
        ${col4}
        ${col5}
        ${col6}
        <td><span class="vps-tag ${vps.monitor_type}">${vps.monitor_type}</span></td>
        <td style="color:var(--text-muted);font-size:11px">${this.timeAgo(vps.last_seen)}</td>
      </tr>
    `;
  },

  alertCard(alert) {
    const icon = alert.severity === 'critical'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

    return `
      <div class="alert-card ${alert.severity}">
        <div class="alert-icon">${icon}</div>
        <div class="alert-content">
          <div class="alert-message">${this.escapeHtml(alert.message)}</div>
          <div class="alert-meta">${alert.hostname || ''} • ${this.timeAgo(alert.created_at)}</div>
        </div>
        <button class="alert-action" onclick="App.acknowledgeAlert(${alert.id}, event)">Dismiss</button>
      </div>
    `;
  },

  processRow(proc) {
    const cpuClass = proc.cpu_percent > 50 ? 'process-cpu-high' : proc.cpu_percent > 20 ? 'process-cpu-med' : '';
    return `
      <tr>
        <td>${proc.pid}</td>
        <td class="process-name">${this.escapeHtml(proc.name)}</td>
        <td>${this.escapeHtml(proc.username || '-')}</td>
        <td class="${cpuClass}">${proc.cpu_percent.toFixed(1)}%</td>
        <td>${proc.mem_percent.toFixed(1)}%</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${this.escapeHtml(proc.command || '')}">${this.escapeHtml(proc.command || '-')}</td>
      </tr>
    `;
  },

  serverInfo(vps) {
    const mt = vps.monitor_type;
    const m = vps.latest_metric || {};
    const reachable = m.load_1 === 1;

    let extraRows = '';
    if (mt === 'agentless') {
      const latency = m.net_in_rate || 0;
      const pktLoss = m.net_out_rate || 0;
      const ttl = m.uptime || 0;
      extraRows = `
        <div class="info-item"><span class="info-label">Latency</span><span class="info-value" style="color:${latency > 200 ? '#ff4757' : latency > 100 ? '#ffa502' : '#00ff88'}">${latency > 0 ? latency.toFixed(1) + ' ms' : '-'}</span></div>
        <div class="info-item"><span class="info-label">Packet Loss</span><span class="info-value" style="color:${pktLoss > 50 ? '#ff4757' : pktLoss > 0 ? '#ffa502' : '#00ff88'}">${pktLoss}%</span></div>
        <div class="info-item"><span class="info-label">TTL</span><span class="info-value">${ttl > 0 ? ttl : '-'}</span></div>
        <div class="info-item"><span class="info-label">Status</span><span class="info-value" style="color:${reachable ? '#00ff88' : '#ff4757'}">${reachable ? '✓ Reachable' : '✗ Unreachable'}</span></div>
      `;
    } else if (mt === 'http') {
      const respTime = m.net_in_rate || 0;
      const statusCode = m.net_out_rate || 0;
      extraRows = `
        <div class="info-item"><span class="info-label">URL</span><span class="info-value" style="word-break:break-all">${vps.url || '-'}</span></div>
        <div class="info-item"><span class="info-label">Response Time</span><span class="info-value" style="color:${respTime > 2000 ? '#ff4757' : respTime > 500 ? '#ffa502' : '#00ff88'}">${respTime > 0 ? respTime + ' ms' : '-'}</span></div>
        <div class="info-item"><span class="info-label">Status Code</span><span class="info-value" style="color:${statusCode >= 200 && statusCode < 300 ? '#00ff88' : '#ffa502'}">${statusCode > 0 ? statusCode : '-'}</span></div>
        <div class="info-item"><span class="info-label">Status</span><span class="info-value" style="color:${reachable ? '#00ff88' : '#ff4757'}">${reachable ? '✓ Reachable' : '✗ Unreachable'}</span></div>
      `;
    } else if (mt === 'dns') {
      const respTime = m.net_in_rate || 0;
      extraRows = `
        <div class="info-item"><span class="info-label">Lookup Domain</span><span class="info-value" style="word-break:break-all">${vps.lookup_domain || '-'}</span></div>
        <div class="info-item"><span class="info-label">Record Type</span><span class="info-value">${vps.record_type || 'A'}</span></div>
        <div class="info-item"><span class="info-label">Response Time</span><span class="info-value" style="color:${respTime > 2000 ? '#ff4757' : respTime > 500 ? '#ffa502' : '#00ff88'}">${respTime > 0 ? respTime + ' ms' : '-'}</span></div>
        <div class="info-item"><span class="info-label">Status</span><span class="info-value" style="color:${reachable ? '#00ff88' : '#ff4757'}">${reachable ? '✓ Resolved' : '✗ Failed'}</span></div>
      `;
    } else if (mt === 'tcp_udp') {
      const respTime = m.net_in_rate || 0;
      extraRows = `
        <div class="info-item"><span class="info-label">Port</span><span class="info-value">${vps.port || '-'}</span></div>
        <div class="info-item"><span class="info-label">Protocol</span><span class="info-value">${(vps.protocol || 'TCP').toUpperCase()}</span></div>
        <div class="info-item"><span class="info-label">Response Time</span><span class="info-value" style="color:${respTime > 2000 ? '#ff4757' : respTime > 500 ? '#ffa502' : '#00ff88'}">${respTime > 0 ? respTime + ' ms' : '-'}</span></div>
        <div class="info-item"><span class="info-label">Status</span><span class="info-value" style="color:${reachable ? '#00ff88' : '#ff4757'}">${reachable ? '✓ Open' : '✗ Closed'}</span></div>
      `;
    } else {
      const cpuText = vps.cpu_cores > 0 ? vps.cpu_cores : '<span style="color:var(--text-muted)">Menunggu agent...</span>';
      const ramText = vps.ram_total > 0 ? this.formatBytes(vps.ram_total * 1024 * 1024) : '<span style="color:var(--text-muted)">Menunggu agent...</span>';
      const diskText = vps.disk_total > 0 ? `${vps.disk_total} GB` : '<span style="color:var(--text-muted)">Menunggu agent...</span>';
      extraRows = `
        <div class="info-item"><span class="info-label">CPU Cores</span><span class="info-value">${cpuText}</span></div>
        <div class="info-item"><span class="info-label">RAM</span><span class="info-value">${ramText}</span></div>
        <div class="info-item"><span class="info-label">Disk</span><span class="info-value">${diskText}</span></div>
        <div class="info-item"><span class="info-label">Load Avg</span><span class="info-value">${m.load_1 !== undefined ? `${m.load_1} / ${m.load_5} / ${m.load_15}` : '-'}</span></div>
      `;
    }

    return `
      <div class="info-item"><span class="info-label">Hostname</span><span class="info-value">${this.escapeHtml(vps.hostname)}</span></div>
      <div class="info-item"><span class="info-label">IP Address</span><span class="info-value">${vps.ip}</span></div>
      <div class="info-item"><span class="info-label">Location</span><span class="info-value">${vps.location || '-'}</span></div>
      <div class="info-item"><span class="info-label">Monitor Type</span><span class="info-value"><span class="vps-tag ${vps.monitor_type}">${vps.monitor_type}</span></span></div>
      <div class="info-item"><span class="info-label">OPD / Dinas</span><span class="info-value">${vps.vps_group || '-'}</span></div>
      ${extraRows}
    `;
  },

  pagination(currentPage, totalPages, onClickFn) {
    if (totalPages <= 1) return '';
    let html = '';

    html += `<button class="page-btn" onclick="${onClickFn}(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>‹</button>`;

    const range = 2;
    let start = Math.max(1, currentPage - range);
    let end = Math.min(totalPages, currentPage + range);

    if (start > 1) {
      html += `<button class="page-btn" onclick="${onClickFn}(1)">1</button>`;
      if (start > 2) html += `<span style="color:var(--text-muted)">…</span>`;
    }

    for (let i = start; i <= end; i++) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="${onClickFn}(${i})">${i}</button>`;
    }

    if (end < totalPages) {
      if (end < totalPages - 1) html += `<span style="color:var(--text-muted)">…</span>`;
      html += `<button class="page-btn" onclick="${onClickFn}(totalPages)">${totalPages}</button>`;
    }

    html += `<button class="page-btn" onclick="${onClickFn}(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>›</button>`;

    return html;
  },

  // Utility functions
  cpuColor(val) {
    if (val > 80) return '#ff4757';
    if (val > 60) return '#ffa502';
    if (val > 40) return '#ffd93d';
    return '#00ff88';
  },

  formatBandwidth(kbps) {
    if (kbps >= 1024) return (kbps / 1024).toFixed(1) + ' MB/s';
    return kbps.toFixed(1) + ' KB/s';
  },

  formatBytes(bytes) {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  },

  formatUptime(seconds) {
    if (!seconds) return '-';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  },

  timeAgo(dateStr) {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return 'Just now';
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3500);
  }
};

window.Components = Components;
