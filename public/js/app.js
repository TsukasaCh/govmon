/* ============================================================
   GovMon - Main Application Controller
   ============================================================ */

const App = {
    currentPage: 'dashboard',
    currentVpsPage: 1,
    currentServerPage: 1,
    isListView: false,
    ws: null,
    charts: {},

    // Initialize
    async init() {
        this.setupRouter();
        this.setupEventListeners();
        this.setupWebSocket();
        this.startClock();
        this.route();
        this.loadDashboard();
    },

    // ============ ROUTER ============
    setupRouter() {
        window.addEventListener('hashchange', () => this.route());
    },

    route() {
        const hash = window.location.hash || '#/';
        const path = hash.replace('#/', '').split('/');
        const page = path[0] || 'dashboard';
        const param = path[1];

        // Remove active class from all nav items and pages
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

        if (page === '' || page === 'dashboard') {
            this.showPage('dashboard');
        } else if (page === 'detail' && param) {
            this.showPage('detail');
            this.loadDetailPage(param);
        } else if (page === 'servers') {
            this.showPage('servers');
            this.loadServerTable();
        } else if (page === 'alerts') {
            this.showPage('alerts');
            this.loadAlerts();
        } else if (page === 'add') {
            this.showPage('add');
        }
    },

    showPage(pageName) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const page = document.getElementById(`page-${pageName}`);
        if (page) page.classList.add('active');

        // Activate nav
        document.querySelectorAll('.nav-item').forEach(n => {
            n.classList.toggle('active', n.dataset.page === pageName);
        });

        this.currentPage = pageName;

        // Close mobile sidebar
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebarOverlay').classList.remove('open');
    },

    // ============ EVENTS ============
    setupEventListeners() {
        // Mobile menu toggle
        document.getElementById('menuToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
            document.getElementById('sidebarOverlay').classList.toggle('open');
        });

        document.getElementById('sidebarOverlay').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('sidebarOverlay').classList.remove('open');
        });

        // Search
        document.getElementById('globalSearch').addEventListener('input', debounce((e) => {
            this.currentVpsPage = 1;
            this.loadVPSGrid();
        }, 300));

        document.getElementById('serverSearch').addEventListener('input', debounce((e) => {
            this.currentServerPage = 1;
            this.loadServerTable();
        }, 300));

        // Filters
        document.getElementById('filterStatus').addEventListener('change', () => { this.currentVpsPage = 1; this.loadVPSGrid(); });
        document.getElementById('filterGroup').addEventListener('change', () => { this.currentVpsPage = 1; this.loadVPSGrid(); });
        document.getElementById('filterType').addEventListener('change', () => { this.currentVpsPage = 1; this.loadVPSGrid(); });

        // View toggle
        document.getElementById('viewToggle').addEventListener('click', () => {
            this.isListView = !this.isListView;
            const grid = document.getElementById('vpsGrid');
            grid.classList.toggle('list-view', this.isListView);
            const btn = document.getElementById('viewToggle');
            btn.innerHTML = this.isListView
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
        });

        // Back button
        document.getElementById('btnBack').addEventListener('click', () => {
            window.history.back();
        });

        // Monitor type toggle
        document.querySelectorAll('input[name="monitorType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const v = e.target.value;
                document.getElementById('methodAgent').classList.toggle('active', v === 'agent');
                document.getElementById('methodAgentless').classList.toggle('active', v === 'agentless');
                document.getElementById('methodHTTP').classList.toggle('active', v === 'http');
                document.getElementById('methodTCPUDP').classList.toggle('active', v === 'tcp_udp');
                document.getElementById('installSection').style.display = v === 'agent' ? 'block' : 'none';
                document.getElementById('icmpSection').style.display = v === 'agentless' ? 'block' : 'none';
                document.getElementById('httpSection').style.display = v === 'http' ? 'block' : 'none';
                document.getElementById('tcpudpSection').style.display = v === 'tcp_udp' ? 'block' : 'none';
                document.getElementById('dnsSection').style.display = v === 'dns' ? 'block' : 'none';
            });
        });

        // Add server form
        document.getElementById('addServerForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addServer();
        });

        // Copy button
        document.getElementById('btnCopy').addEventListener('click', () => {
            const code = document.getElementById('installCommand').textContent;
            navigator.clipboard.writeText(code).then(() => Components.toast('Copied to clipboard!', 'success'));
        });

        // Edit/Delete buttons on detail page
        document.getElementById('btnEditServer').addEventListener('click', () => this.editServer());
        document.getElementById('btnDeleteServer').addEventListener('click', () => this.deleteServer());
        document.getElementById('btnSaveEdit').addEventListener('click', () => this.saveEdit());
        document.getElementById('btnConfirmDelete').addEventListener('click', () => this.confirmDelete());
    },

    // ============ WEBSOCKET ============
    setupWebSocket() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${location.host}`;

        try {
            this.ws = new WebSocket(wsUrl);
            this.ws.onopen = () => console.log('📡 WebSocket connected');
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWSMessage(data);
                } catch (e) { }
            };
            this.ws.onclose = () => {
                console.log('📡 WebSocket disconnected, reconnecting...');
                setTimeout(() => this.setupWebSocket(), 3000);
            };
        } catch (e) {
            setTimeout(() => this.setupWebSocket(), 5000);
        }
    },

    handleWSMessage(data) {
        if (data.type === 'metric_update') {
            // Update card if visible
            const card = document.querySelector(`.vps-card[data-id="${data.vps_id}"]`);
            if (card) {
                const cpuVal = card.querySelector('.vps-metric-value');
                if (cpuVal) cpuVal.textContent = data.cpu_percent.toFixed(1) + '%';
            }

            // Update detail page if viewing this VPS
            if (this.currentPage === 'detail' && this.currentDetailId == data.vps_id) {
                document.getElementById('detailCpu').textContent = data.cpu_percent.toFixed(1) + '%';
                document.getElementById('detailCpuBar').style.width = data.cpu_percent + '%';
                document.getElementById('detailMem').textContent = data.mem_percent.toFixed(1) + '%';
                document.getElementById('detailMemBar').style.width = data.mem_percent + '%';
            }

            this.updateLastUpdate();
        }

        if (data.type === 'status_change') {
            Components.toast(data.message, 'info');
            if (this.currentPage === 'dashboard') this.loadDashboard();
        }
    },

    // ============ CLOCK ============
    startClock() {
        const update = () => {
            const now = new Date();
            const timeStr = now.toLocaleString('id-ID', {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
            document.getElementById('sidebarTime').textContent = timeStr;
        };
        update();
        setInterval(update, 1000);
    },

    updateLastUpdate() {
        const el = document.getElementById('lastUpdate');
        if (el) el.querySelector('span').textContent = 'Just now';
    },

    // ============ API ============
    async api(endpoint, options = {}) {
        try {
            const res = await fetch(`/api${endpoint}`, {
                headers: { 'Content-Type': 'application/json' },
                ...options
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (error) {
            console.error('API Error:', error);
            return null;
        }
    },

    // ============ DASHBOARD ============
    async loadDashboard() {
        const stats = await this.api('/stats');
        if (!stats) return;

        // Update stats cards
        this.animateValue('statTotal', stats.total);
        this.animateValue('statOnline', stats.online);
        this.animateValue('statWarning', stats.warning);
        this.animateValue('statOffline', stats.offline);
        document.getElementById('statCpu').textContent = stats.avg_cpu + '%';
        document.getElementById('statBandwidth').textContent = Components.formatBandwidth(stats.total_bandwidth_in + stats.total_bandwidth_out);

        // Alert badge
        const badge = document.getElementById('alertBadge');
        if (stats.active_alerts > 0) {
            badge.style.display = 'block';
            badge.textContent = stats.active_alerts;
        } else {
            badge.style.display = 'none';
        }

        // Status donut chart
        const statusCanvas = document.getElementById('statusChart');
        if (statusCanvas) {
            const chart = new GovChart(statusCanvas, { height: 200 });
            chart.drawDonut([
                { label: 'Online', value: stats.online, color: '#00ff88' },
                { label: 'Warning', value: stats.warning, color: '#ffa502' },
                { label: 'Offline', value: stats.offline, color: '#ff4757' },
                { label: 'Maint', value: stats.maintenance, color: '#3b82f6' }
            ]);
        }

        // Ministry bars
        const barsContainer = document.getElementById('ministryBars');
        if (stats.groups && barsContainer) {
            const maxCount = Math.max(...stats.groups.map(g => g.count));
            barsContainer.innerHTML = stats.groups.slice(0, 15).map(g => `
        <div class="ministry-bar-item">
          <span class="ministry-bar-label" title="${g.vps_group}">${g.vps_group}</span>
          <div class="ministry-bar-track">
            <div class="ministry-bar-fill" style="width:${(g.count / maxCount) * 100}%">${g.count}</div>
          </div>
        </div>
      `).join('');
        }

        // Load groups for filter
        this.loadGroups();

        // Load VPS grid
        this.loadVPSGrid();
    },

    async loadGroups() {
        const groups = await this.api('/groups');
        if (!groups) return;

        const select = document.getElementById('filterGroup');
        const current = select.value;
        select.innerHTML = '<option value="">All Groups</option>';
        groups.forEach(g => {
            select.innerHTML += `<option value="${g}">${g}</option>`;
        });
        select.value = current;
    },

    async loadVPSGrid() {
        const search = document.getElementById('globalSearch').value;
        const status = document.getElementById('filterStatus').value;
        const group = document.getElementById('filterGroup').value;
        const monitorType = document.getElementById('filterType').value;

        const params = new URLSearchParams({
            page: this.currentVpsPage,
            limit: 24,
            ...(search && { search }),
            ...(status && { status }),
            ...(group && { group }),
            ...(monitorType && { monitor_type: monitorType })
        });

        const data = await this.api(`/vps?${params}`);
        if (!data) return;

        const grid = document.getElementById('vpsGrid');
        if (data.data.length === 0) {
            grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/></svg>
          <h4>No servers found</h4>
          <p>Try adjusting your filters or search query</p>
        </div>
      `;
        } else {
            grid.innerHTML = data.data.map(vps => Components.vpsCard(vps)).join('');
        }

        // Pagination
        document.getElementById('pagination').innerHTML = Components.pagination(
            data.pagination.page, data.pagination.pages, 'App.goToPage'
        );
    },

    goToPage(page) {
        this.currentVpsPage = page;
        this.loadVPSGrid();
    },

    goToServerPage(page) {
        this.currentServerPage = page;
        this.loadServerTable();
    },

    // ============ DETAIL PAGE ============
    showDetail(id) {
        window.location.hash = `#/detail/${id}`;
    },

    async loadDetailPage(id) {
        this.currentDetailId = id;
        const vps = await this.api(`/vps/${id}`);
        if (!vps) return;

        // Header
        document.getElementById('detailHostname').textContent = vps.hostname;
        document.getElementById('detailSubtitle').textContent = `${vps.ip} • ${vps.location} • ${vps.os}`;
        document.getElementById('detailStatus').className = `status-badge ${vps.status}`;
        document.getElementById('detailStatus').textContent = vps.status;

        if (vps.monitor_type === 'agent') {
            this.loadAgentDetail(vps);
        } else {
            this.loadAgentlessDetail(vps);
        }
    },

    loadAgentDetail(vps) {
        // Stats
        const m = vps.latest_metric || {};
        document.getElementById('detailStats').innerHTML = `
          <div class="detail-stat-card">
            <div class="detail-stat-label">CPU Usage</div>
            <div class="detail-stat-value" id="detailCpu">${(m.cpu_percent || 0).toFixed(1)}%</div>
            <div class="detail-stat-bar"><div class="bar-fill cpu-fill" id="detailCpuBar" style="width:${m.cpu_percent || 0}%"></div></div>
          </div>
          <div class="detail-stat-card">
            <div class="detail-stat-label">Memory</div>
            <div class="detail-stat-value" id="detailMem">${(m.mem_percent || 0).toFixed(1)}%</div>
            <div class="detail-stat-bar"><div class="bar-fill mem-fill" id="detailMemBar" style="width:${m.mem_percent || 0}%"></div></div>
          </div>
          <div class="detail-stat-card">
            <div class="detail-stat-label">Disk</div>
            <div class="detail-stat-value">${(m.disk_percent || 0).toFixed(1)}%</div>
            <div class="detail-stat-bar"><div class="bar-fill disk-fill" style="width:${m.disk_percent || 0}%"></div></div>
          </div>
          <div class="detail-stat-card">
            <div class="detail-stat-label">Network In</div>
            <div class="detail-stat-value">${Components.formatBandwidth(m.net_in_rate || 0)}</div>
            <div class="detail-stat-sub"><span>Inbound</span></div>
          </div>
          <div class="detail-stat-card">
            <div class="detail-stat-label">Network Out</div>
            <div class="detail-stat-value">${Components.formatBandwidth(m.net_out_rate || 0)}</div>
            <div class="detail-stat-sub"><span>Outbound</span></div>
          </div>
          <div class="detail-stat-card">
            <div class="detail-stat-label">Uptime</div>
            <div class="detail-stat-value">${Components.formatUptime(m.uptime)}</div>
            <div class="detail-stat-sub"><span>Duration</span></div>
          </div>
        `;

        // Server info
        document.getElementById('serverInfo').innerHTML = Components.serverInfo(vps);

        // CPU/BW Charts
        if (vps.metrics_history && vps.metrics_history.length > 0) {
            const cpuData = vps.metrics_history.map(m => m.cpu_percent);
            const memData = vps.metrics_history.map(m => m.mem_percent);

            setTimeout(() => {
                const cpuCanvas = document.getElementById('cpuChart');
                if (cpuCanvas) {
                    const cpuChart = new GovChart(cpuCanvas, { height: 220 });
                    cpuChart.drawLine(cpuData, memData);
                }

                const bwCanvas = document.getElementById('bandwidthChart');
                if (bwCanvas) {
                    const netIn = vps.metrics_history.map(m => m.net_in_rate);
                    const netOut = vps.metrics_history.map(m => m.net_out_rate);
                    const bwChart = new GovChart(bwCanvas, {
                        height: 220,
                        lineColor: '#00ff88',
                        lineColor2: '#ff4757',
                        fillColor: 'rgba(0, 255, 136, 0.08)',
                        fillColor2: 'rgba(255, 71, 87, 0.08)'
                    });
                    bwChart.drawLine(netIn, netOut);
                }
            }, 100);
        }

        // Processes
        this.loadProcesses(vps.id);
    },

    loadAgentlessDetail(vps) {
        const m = vps.latest_metric || {};
        const type = vps.monitor_type;
        const isReachable = m.load_1 === 1;

        // Custom stats based on type
        let statsHtml = '';
        if (type === 'http') {
            const resp = m.net_in_rate || 0;
            const code = m.net_out_rate || 0;
            const size = m.uptime || 0;
            const codeColor = code >= 200 && code < 300 ? '#00ff88' : '#ff4757';
            statsHtml = `
              <div class="detail-stat-card">
                <div class="detail-stat-label">Response Time</div>
                <div class="detail-stat-value" style="color:${resp > 2000 ? '#ff4757' : resp > 500 ? '#ffa502' : '#00ff88'}">${resp > 0 ? resp + ' ms' : '-'}</div>
                <div class="detail-stat-sub"><span>HTTP Latency</span></div>
              </div>
              <div class="detail-stat-card">
                <div class="detail-stat-label">Status Code</div>
                <div class="detail-stat-value" style="color:${codeColor}">${code || '-'}</div>
                <div class="detail-stat-sub"><span>HTTP Reply</span></div>
              </div>
              <div class="detail-stat-card">
                <div class="detail-stat-label">Page Size</div>
                <div class="detail-stat-value">${Components.formatBytes(size)}</div>
                <div class="detail-stat-sub"><span>Body Size</span></div>
              </div>`;
        } else if (type === 'tcp_udp') {
            const resp = m.net_in_rate || 0;
            const port = m.net_out_rate || vps.port;
            statsHtml = `
              <div class="detail-stat-card">
                <div class="detail-stat-label">Response Time</div>
                <div class="detail-stat-value" style="color:${resp > 2000 ? '#ff4757' : resp > 500 ? '#ffa502' : '#00ff88'}">${resp > 0 ? resp + ' ms' : '-'}</div>
                <div class="detail-stat-sub"><span>Connection Time</span></div>
              </div>
              <div class="detail-stat-card">
                <div class="detail-stat-label">Port</div>
                <div class="detail-stat-value">${port}</div>
                <div class="detail-stat-sub"><span>${(vps.protocol || 'TCP').toUpperCase()}</span></div>
              </div>
              <div class="detail-stat-card">
                <div class="detail-stat-label">Status</div>
                <div class="detail-stat-value" style="color:${isReachable ? '#00ff88' : '#ff4757'}">${isReachable ? '✓ Open' : '✗ Closed'}</div>
                <div class="detail-stat-sub"><span>Port Availability</span></div>
              </div>`;
        } else if (type === 'dns') {
            const resp = m.net_in_rate || 0;
            const result = m.dns_res || '-';
            statsHtml = `
              <div class="detail-stat-card">
                <div class="detail-stat-label">Response Time</div>
                <div class="detail-stat-value" style="color:${resp > 2000 ? '#ff4757' : resp > 500 ? '#ffa502' : '#00ff88'}">${resp > 0 ? resp + ' ms' : '-'}</div>
                <div class="detail-stat-sub"><span>DNS Latency</span></div>
              </div>
              <div class="detail-stat-card">
                <div class="detail-stat-label">Resolved IP</div>
                <div class="detail-stat-value" style="font-size:14px;word-break:break-all">${result}</div>
                <div class="detail-stat-sub"><span>lookup: ${vps.lookup_domain}</span></div>
              </div>
              <div class="detail-stat-card">
                <div class="detail-stat-label">Status</div>
                <div class="detail-stat-value" style="color:${isReachable ? '#00ff88' : '#ff4757'}">${isReachable ? '✓ Resolved' : '✗ Failed'}</div>
                <div class="detail-stat-sub"><span>Resolution Status</span></div>
              </div>`;
        } else {
            // Default Agentless (ICMP)
            const latency = m.net_in_rate || 0;
            const packetLoss = m.net_out_rate || 0;
            const ttl = m.uptime || 0;
            const latencyColor = latency > 200 ? '#ff4757' : latency > 100 ? '#ffa502' : latency > 50 ? '#ffd93d' : '#00ff88';
            const lossColor = packetLoss > 50 ? '#ff4757' : packetLoss > 20 ? '#ffa502' : packetLoss > 0 ? '#ffd93d' : '#00ff88';
            statsHtml = `
              <div class="detail-stat-card">
                <div class="detail-stat-label">Latency</div>
                <div class="detail-stat-value" style="color:${latencyColor}">${latency > 0 ? latency.toFixed(1) + ' ms' : '-'}</div>
                <div class="detail-stat-sub"><span>Ping Response Time</span></div>
              </div>
              <div class="detail-stat-card">
                <div class="detail-stat-label">Packet Loss</div>
                <div class="detail-stat-value" style="color:${lossColor}">${packetLoss}%</div>
                <div class="detail-stat-bar"><div class="bar-fill" style="width:${packetLoss}%;background:${lossColor}"></div></div>
              </div>
              <div class="detail-stat-card">
                <div class="detail-stat-label">TTL</div>
                <div class="detail-stat-value">${ttl > 0 ? ttl : '-'}</div>
                <div class="detail-stat-sub"><span>Time To Live</span></div>
              </div>`;
        }

        // Common Status Card for all non-agent
        if (type !== 'tcp_udp' && type !== 'dns') { // TCP & DNS have status in custom block
            statsHtml += `
              <div class="detail-stat-card">
                <div class="detail-stat-label">Status</div>
                <div class="detail-stat-value" style="color:${isReachable ? '#00ff88' : '#ff4757'}">${isReachable ? '✓ Reachable' : '✗ Unreachable'}</div>
                <div class="detail-stat-sub"><span>Availability</span></div>
              </div>`;
        }

        statsHtml += `
          <div class="detail-stat-card">
            <div class="detail-stat-label">Monitor Type</div>
            <div class="detail-stat-value" style="font-size:16px">${type.toUpperCase()}</div>
            <div class="detail-stat-sub"><span>Agentless</span></div>
          </div>
          <div class="detail-stat-card">
            <div class="detail-stat-label">Last Seen</div>
            <div class="detail-stat-value" style="font-size:14px">${Components.timeAgo(vps.last_seen)}</div>
            <div class="detail-stat-sub"><span>Last Check</span></div>
          </div>
        `;

        document.getElementById('detailStats').innerHTML = statsHtml;

        // Charts: Values based on type
        // net_in_rate = Latency/RespTime
        // net_out_rate = PacketLoss/StatusCode/Port
        const chart1Title = type === 'agentless' ? '📶 Latency History (ms)' : '⏱️ Response Time History (ms)';
        const chart2Title = type === 'agentless' ? '📦 Packet Loss History (%)' : type === 'http' ? '🔢 Status Code History' : type === 'dns' ? '✅ Resolution Status (1=OK, 0=Fail)' : null;

        const chartsRow1 = document.querySelectorAll('#page-detail .charts-row')[0];
        if (chartsRow1) {
            let html = `
              <div class="chart-card">
                <div class="chart-header"><h3>${chart1Title}</h3></div>
                <div class="chart-body"><canvas id="latencyChart" width="500" height="220"></canvas></div>
              </div>`;

            if (chart2Title) {
                html += `
                  <div class="chart-card">
                    <div class="chart-header"><h3>${chart2Title}</h3></div>
                    <div class="chart-body"><canvas id="packetLossChart" width="500" height="220"></canvas></div>
                  </div>`;
            }
            chartsRow1.innerHTML = html;
        }

        // Server info
        document.getElementById('serverInfo').innerHTML = Components.serverInfo(vps);

        // Initialize Charts
        if (vps.metrics_history && vps.metrics_history.length > 0) {
            const data1 = vps.metrics_history.map(m => m.net_in_rate || 0); // Latency or Resp Time
            const data2 = vps.metrics_history.map(m => type === 'dns' ? m.load_1 : (m.net_out_rate || 0)); // Loss, Status, or Load1(DNS)

            setTimeout(() => {
                const c1 = document.getElementById('latencyChart');
                if (c1) {
                    const chart = new GovChart(c1, {
                        height: 220,
                        lineColor: '#00d4ff',
                        fillColor: 'rgba(0, 212, 255, 0.08)'
                    });
                    chart.drawLine(data1);
                }

                const c2 = document.getElementById('packetLossChart');
                if (c2 && chart2Title) {
                    const chart = new GovChart(c2, {
                        height: 220,
                        lineColor: '#ff4757',
                        fillColor: 'rgba(255, 71, 87, 0.08)'
                    });
                    // For HTTP status codes, maybe show as line is fine
                    chart.drawLine(data2);
                }
            }, 100);
        }

        // Toggle Processes vs History
        const isAgent = vps.monitor_type === 'agent';
        const procCard = document.getElementById('processCard');
        const histCard = document.getElementById('historyCard');
        if (procCard) procCard.style.display = isAgent ? 'block' : 'none';
        if (histCard) histCard.style.display = isAgent ? 'none' : 'block';

        if (!isAgent && vps.metrics_history && histCard) {
            const tbody = document.getElementById('historyBody');
            const thead = document.getElementById('historyHeader');
            const type = vps.monitor_type;

            // Set Headers
            let headers = '<tr><th>Time</th><th>Status</th>';
            if (type === 'agentless') headers += '<th>Latency</th><th>Packet Loss</th><th>TTL</th>';
            else if (type === 'http') headers += '<th>Response Time</th><th>Status Code</th><th>Size</th>';
            else if (type === 'tcp_udp') headers += '<th>Response Time</th><th>Port</th><th>Protocol</th>';
            headers += '</tr>';
            thead.innerHTML = headers;

            // Set Rows
            const rows = [...vps.metrics_history].reverse().slice(0, 30).map(m => {
                const time = new Date(m.timestamp).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: 'numeric', month: 'short' });
                const reachable = m.load_1 === 1;
                const statusHtml = reachable
                    ? '<span style="color:#00ff88;font-weight:600">✓ OK</span>'
                    : '<span style="color:#ff4757;font-weight:600">✗ FAIL</span>';

                let cols = '';
                if (type === 'agentless') {
                    const lat = m.net_in_rate || 0;
                    const loss = m.net_out_rate || 0;
                    const ttl = m.uptime || 0;
                    cols += `<td style="color:${lat > 200 ? '#ff4757' : lat > 100 ? '#ffa502' : '#00ff88'}">${reachable ? lat.toFixed(1) + ' ms' : '-'}</td>`;
                    cols += `<td style="color:${loss > 50 ? '#ff4757' : '#00ff88'}">${loss}%</td>`;
                    cols += `<td>${ttl}</td>`;
                } else if (type === 'http') {
                    const resp = m.net_in_rate || 0;
                    const code = m.net_out_rate || 0;
                    const size = m.uptime || 0;
                    const codeColor = code >= 200 && code < 300 ? '#00ff88' : '#ff4757';
                    cols += `<td style="color:${resp > 2000 ? '#ff4757' : resp > 500 ? '#ffa502' : '#00ff88'}">${reachable ? resp + ' ms' : '-'}</td>`;
                    cols += `<td style="color:${codeColor}">${code || '-'}</td>`;
                    cols += `<td>${Components.formatBytes(size)}</td>`;
                } else if (type === 'tcp_udp') {
                    const resp = m.net_in_rate || 0;
                    const port = m.net_out_rate || vps.port;
                    const proto = (vps.protocol || 'TCP').toUpperCase();
                    cols += `<td style="color:${resp > 2000 ? '#ff4757' : resp > 500 ? '#ffa502' : '#00ff88'}">${reachable ? resp + ' ms' : '-'}</td>`;
                    cols += `<td>${port}</td>`;
                    cols += `<td>${proto}</td>`;
                }

                return `<tr>
                    <td style="color:var(--text-muted);font-size:12px">${time}</td>
                    <td>${statusHtml}</td>
                    ${cols}
                </tr>`;
            });
            tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">No history data available</td></tr>';
        }
    },

    async loadProcesses(id) {
        const processes = await this.api(`/vps/${id}/processes`);
        if (!processes) return;

        const tbody = document.getElementById('processBody');
        if (!tbody) return;
        if (processes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px">No process data available</td></tr>';
        } else {
            tbody.innerHTML = processes.map(p => Components.processRow(p)).join('');
        }
    },

    // ============ SERVER TABLE ============
    async loadServerTable() {
        const search = document.getElementById('serverSearch').value;
        const params = new URLSearchParams({
            page: this.currentServerPage,
            limit: 30,
            ...(search && { search })
        });

        const data = await this.api(`/vps?${params}`);
        if (!data) return;

        const tbody = document.getElementById('serverTableBody');
        tbody.innerHTML = data.data.map(vps => Components.serverTableRow(vps)).join('');

        document.getElementById('serverPagination').innerHTML = Components.pagination(
            data.pagination.page, data.pagination.pages, 'App.goToServerPage'
        );
    },

    // ============ ALERTS ============
    async loadAlerts() {
        const alerts = await this.api('/alerts?limit=100');
        if (!alerts) return;

        const container = document.getElementById('alertsList');
        if (alerts.length === 0) {
            container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <h4>No active alerts</h4>
          <p>All systems are operating normally</p>
        </div>
      `;
        } else {
            container.innerHTML = alerts.map(a => Components.alertCard(a)).join('');
        }
    },

    async acknowledgeAlert(id, event) {
        event.stopPropagation();
        await this.api(`/alerts/${id}/acknowledge`, { method: 'PUT' });
        this.loadAlerts();
        Components.toast('Alert dismissed', 'success');

        // Refresh dashboard badge
        const stats = await this.api('/stats');
        if (stats) {
            const badge = document.getElementById('alertBadge');
            if (stats.active_alerts > 0) {
                badge.style.display = 'block';
                badge.textContent = stats.active_alerts;
            } else {
                badge.style.display = 'none';
            }
        }
    },

    // ============ ADD SERVER ============
    async addServer() {
        const monitorType = document.querySelector('input[name="monitorType"]:checked').value;
        const body = {
            hostname: document.getElementById('addHostname').value,
            ip: document.getElementById('addIP').value,
            location: document.getElementById('addLocation').value,
            vps_group: document.getElementById('addGroup').value,
            monitor_type: monitorType
        };

        if (monitorType === 'http') {
            body.url = document.getElementById('addURL').value;
        }
        if (monitorType === 'tcp_udp') {
            body.port = document.getElementById('addPort').value;
            body.protocol = document.getElementById('addProtocol').value;
        }
        if (monitorType === 'dns') {
            body.lookup_domain = document.getElementById('addDomain').value;
            body.record_type = document.getElementById('addRecordType').value;
        }

        const result = await this.api('/vps', {
            method: 'POST',
            body: JSON.stringify(body)
        });

        if (result && result.id) {
            Components.toast('Server registered successfully!', 'success');

            const modal = document.getElementById('successModal');
            modal.style.display = 'flex';

            if (monitorType === 'agent') {
                const serverUrl = `${location.protocol}//${location.host}`;
                const installCmd = `curl -sSL ${serverUrl}/agent/install.sh | bash -s -- ${serverUrl} ${result.api_key}`;
                document.getElementById('modalMessage').textContent = 'Server terdaftar! Jalankan command ini di VPS untuk install agent monitoring:';
                document.getElementById('modalInstallCommand').style.display = 'block';
                document.getElementById('modalCode').textContent = installCmd;
                document.getElementById('installCommand').textContent = installCmd;
            } else if (monitorType === 'http') {
                document.getElementById('modalMessage').textContent = `Server terdaftar untuk monitoring HTTP. Website ${body.url} akan dicek otomatis setiap 30 detik.`;
                document.getElementById('modalInstallCommand').style.display = 'none';
            } else if (monitorType === 'tcp_udp') {
                document.getElementById('modalMessage').textContent = `Server terdaftar untuk monitoring port ${body.port}/${body.protocol}. Port akan dicek otomatis setiap 30 detik.`;
                document.getElementById('modalInstallCommand').style.display = 'none';
            } else if (monitorType === 'dns') {
                document.getElementById('modalMessage').textContent = `Server terdaftar untuk monitoring DNS (${body.lookup_domain} - ${body.record_type}). Akan dicek otomatis setiap 30 detik.`;
                document.getElementById('modalInstallCommand').style.display = 'none';
            } else {
                document.getElementById('modalMessage').textContent = 'Server terdaftar untuk monitoring ICMP Ping. Status akan dicek otomatis setiap 30 detik.';
                document.getElementById('modalInstallCommand').style.display = 'none';
            }

            document.getElementById('addServerForm').reset();
        } else {
            Components.toast('Gagal mendaftarkan server. Coba lagi.', 'error');
        }
    },

    // ============ EDIT SERVER ============
    async editServer() {
        const vps = await this.api(`/vps/${this.currentDetailId}`);
        if (!vps) return;
        document.getElementById('editHostname').value = vps.hostname || '';
        document.getElementById('editIP').value = vps.ip || '';
        document.getElementById('editLocation').value = vps.location || '';
        document.getElementById('editGroup').value = vps.vps_group || '';
        document.getElementById('editModal').style.display = 'flex';
    },

    async saveEdit() {
        const body = {
            hostname: document.getElementById('editHostname').value,
            ip: document.getElementById('editIP').value,
            location: document.getElementById('editLocation').value,
            vps_group: document.getElementById('editGroup').value
        };
        const result = await this.api(`/vps/${this.currentDetailId}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
        if (result) {
            Components.toast('Server berhasil diupdate!', 'success');
            document.getElementById('editModal').style.display = 'none';
            this.loadDetailPage(this.currentDetailId);
        }
    },

    // ============ DELETE SERVER ============
    deleteServer() {
        const hostname = document.getElementById('detailHostname').textContent;
        document.getElementById('deleteMsg').textContent = `Server "${hostname}" akan dihapus permanen beserta seluruh data metrik dan alert-nya.`;
        document.getElementById('deleteModal').style.display = 'flex';
    },

    async confirmDelete() {
        const result = await this.api(`/vps/${this.currentDetailId}`, { method: 'DELETE' });
        if (result) {
            Components.toast('Server berhasil dihapus!', 'success');
            document.getElementById('deleteModal').style.display = 'none';
            window.location.hash = '#/servers';
        }
    },

    // ============ HELPERS ============
    animateValue(elementId, target) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const start = parseInt(el.textContent) || 0;
        const duration = 600;
        const startTime = performance.now();

        function step(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease out cubic
            el.textContent = Math.round(start + (target - start) * eased);
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }
};

// Debounce helper
function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// Initialize
document.addEventListener('DOMContentLoaded', () => App.init());
