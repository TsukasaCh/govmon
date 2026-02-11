/* ============================================================
   GovMon - Lightweight Canvas Chart Library
   ============================================================ */

class GovChart {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.dpr = window.devicePixelRatio || 1;
        this.options = {
            padding: { top: 20, right: 20, bottom: 30, left: 50 },
            lineColor: '#00d4ff',
            lineColor2: '#7c3aed',
            fillColor: 'rgba(0, 212, 255, 0.08)',
            fillColor2: 'rgba(124, 58, 237, 0.08)',
            gridColor: 'rgba(100, 120, 180, 0.08)',
            textColor: '#5a6478',
            lineWidth: 2,
            pointRadius: 0,
            animate: true,
            ...options
        };
        this.resizeCanvas();
    }

    resizeCanvas() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width * this.dpr;
        this.canvas.height = (this.options.height || rect.height || 200) * this.dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = (this.options.height || rect.height || 200) + 'px';
        this.ctx.scale(this.dpr, this.dpr);
        this.width = rect.width;
        this.height = this.options.height || rect.height || 200;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawLine(data, data2 = null) {
        this.clear();
        if (!data || data.length === 0) return;

        const { padding, gridColor, textColor, lineColor, lineColor2, fillColor, fillColor2, lineWidth } = this.options;
        const ctx = this.ctx;
        const w = this.width - padding.left - padding.right;
        const h = this.height - padding.top - padding.bottom;

        // Find range
        let allData = [...data];
        if (data2) allData = [...allData, ...data2];
        const maxVal = Math.max(...allData, 1) * 1.1;
        const minVal = 0;

        // Grid lines
        const gridLines = 4;
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        ctx.font = '10px Inter, sans-serif';
        ctx.fillStyle = textColor;
        ctx.textAlign = 'right';

        for (let i = 0; i <= gridLines; i++) {
            const y = padding.top + (h * i / gridLines);
            const val = maxVal - (maxVal - minVal) * i / gridLines;

            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + w, y);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillText(val.toFixed(1), padding.left - 8, y + 3);
        }

        // X-axis labels
        ctx.textAlign = 'center';
        const labelCount = Math.min(6, data.length);
        for (let i = 0; i < labelCount; i++) {
            const idx = Math.floor(i * (data.length - 1) / (labelCount - 1));
            const x = padding.left + (idx / (data.length - 1)) * w;
            ctx.fillText(`${(data.length - 1 - idx) * 0.5}m`, x, this.height - 5);
        }

        // Draw fill + line for data2 (behind)
        if (data2 && data2.length > 0) {
            this._drawDataLine(data2, w, h, padding, maxVal, lineColor2, fillColor2, lineWidth);
        }

        // Draw fill + line for data (front)
        this._drawDataLine(data, w, h, padding, maxVal, lineColor, fillColor, lineWidth);
    }

    _drawDataLine(data, w, h, padding, maxVal, color, fill, lw) {
        const ctx = this.ctx;
        const pts = data.map((v, i) => ({
            x: padding.left + (i / (data.length - 1)) * w,
            y: padding.top + h - (v / maxVal) * h
        }));

        // Fill
        ctx.beginPath();
        ctx.moveTo(pts[0].x, padding.top + h);
        pts.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(pts[pts.length - 1].x, padding.top + h);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();

        // Line
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Smooth curve
        if (pts.length > 2) {
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length - 1; i++) {
                const xc = (pts[i].x + pts[i + 1].x) / 2;
                const yc = (pts[i].y + pts[i + 1].y) / 2;
                ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
            }
            ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        } else {
            pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        }
        ctx.stroke();

        // Glow effect
        ctx.strokeStyle = color;
        ctx.lineWidth = lw + 3;
        ctx.globalAlpha = 0.1;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    drawDonut(segments) {
        this.clear();
        if (!segments || segments.length === 0) return;

        const ctx = this.ctx;
        const cx = this.width / 2;
        const cy = this.height / 2;
        const outerRadius = Math.min(cx, cy) - 20;
        const innerRadius = outerRadius * 0.6;
        const total = segments.reduce((s, seg) => s + seg.value, 0);

        if (total === 0) return;

        let startAngle = -Math.PI / 2;

        segments.forEach(seg => {
            const sliceAngle = (seg.value / total) * Math.PI * 2;
            const endAngle = startAngle + sliceAngle;

            ctx.beginPath();
            ctx.arc(cx, cy, outerRadius, startAngle, endAngle);
            ctx.arc(cx, cy, innerRadius, endAngle, startAngle, true);
            ctx.closePath();
            ctx.fillStyle = seg.color;
            ctx.fill();

            // Gap between segments
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#070b14';
            ctx.stroke();

            startAngle = endAngle;
        });

        // Center text
        ctx.fillStyle = '#e8ecf4';
        ctx.font = 'bold 22px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(total.toString(), cx, cy - 6);
        ctx.font = '11px Inter, sans-serif';
        ctx.fillStyle = '#5a6478';
        ctx.fillText('Total', cx, cy + 14);

        // Legend
        const legendY = cy + outerRadius + 10;
        const legendGap = this.width / (segments.length + 1);

        segments.forEach((seg, i) => {
            const lx = legendGap * (i + 1);
            ctx.fillStyle = seg.color;
            ctx.beginPath();
            ctx.roundRect(lx - 30, legendY, 8, 8, 2);
            ctx.fill();

            ctx.fillStyle = '#8892a8';
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`${seg.label}: ${seg.value}`, lx - 18, legendY + 7);
        });
    }
}

// Export globally
window.GovChart = GovChart;
