/**
 * Comparator.js
 * -----------------------------------------------------------------------
 * Ejecuta dos configuraciones de Selective Repeat (A y B) de forma
 * "headless" (sin animación, saltando evento por evento hasta el final)
 * y produce una tabla comparativa + un gráfico de barras simple dibujado
 * en un <canvas> con Canvas 2D puro (sin librerías externas).
 * -----------------------------------------------------------------------
 */
window.SRSim = window.SRSim || { core: {}, ui: {}, utils: {}, comparator: {} };

(function (ns) {
  'use strict';

  const MAX_STEPS = 500000; // salvaguarda anti-loop infinito

  /** Corre una configuración hasta el final y devuelve sus métricas */
  function runHeadless(config) {
    const engine = new ns.core.SimulationEngine(config, function () {});
    let steps = 0;
    while (!engine.finished && steps < MAX_STEPS) {
      engine.step();
      steps++;
    }
    return engine.getMetrics();
  }

  function runComparison(configA, configB) {
    const resultA = runHeadless(configA);
    const resultB = runHeadless(configB);
    return { A: resultA, B: resultB };
  }

  /** Rellena una tabla HTML (tbody) con la comparación lado a lado */
  function renderTable(tbodyEl, results) {
    const TM = ns.utils.TimerManager;
    const rows = [
      ['Tiempo total', TM.formatMs(results.A.elapsedMs), TM.formatMs(results.B.elapsedMs)],
      ['Tramas enviadas (con retx.)', results.A.framesSent, results.B.framesSent],
      ['Retransmisiones', results.A.framesRetransmitted, results.B.framesRetransmitted],
      ['Tramas perdidas en canal', results.A.framesLostChannel, results.B.framesLostChannel],
      ['Throughput', results.A.throughputMbps.toFixed(3) + ' Mbps', results.B.throughputMbps.toFixed(3) + ' Mbps'],
      ['Eficiencia teórica', results.A.theoreticalEfficiency.toFixed(1) + ' %', results.B.theoreticalEfficiency.toFixed(1) + ' %'],
      ['Eficiencia real', results.A.realEfficiency.toFixed(1) + ' %', results.B.realEfficiency.toFixed(1) + ' %']
    ];
    tbodyEl.innerHTML = '';
    rows.forEach(function (r) {
      const tr = document.createElement('tr');
      r.forEach(function (cell, idx) {
        const td = document.createElement(idx === 0 ? 'th' : 'td');
        td.textContent = cell;
        tr.appendChild(td);
      });
      tbodyEl.appendChild(tr);
    });
  }

  /** Dibuja un gráfico de barras comparando eficiencia real y throughput */
  function renderChart(canvas, results) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(320, rect.width) * dpr;
    canvas.height = Math.max(220, rect.height) * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const metrics = [
      { label: 'Eficiencia real (%)', a: results.A.realEfficiency, b: results.B.realEfficiency, max: 100 },
      { label: 'Throughput (Mbps)', a: results.A.throughputMbps, b: results.B.throughputMbps,
        max: Math.max(results.A.throughputMbps, results.B.throughputMbps, 1) * 1.2 }
    ];

    const groupW = w / metrics.length;
    const barW = 42;
    const baseY = h - 40;
    const maxBarH = h - 80;

    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';

    metrics.forEach(function (m, i) {
      const cx = groupW * i + groupW / 2;
      const aH = (m.a / m.max) * maxBarH;
      const bH = (m.b / m.max) * maxBarH;

      ctx.fillStyle = '#4f8cff';
      ctx.fillRect(cx - barW - 6, baseY - aH, barW, aH);
      ctx.fillStyle = '#3ecf8e';
      ctx.fillRect(cx + 6, baseY - bH, barW, bH);

      ctx.fillStyle = '#e6e9f0';
      ctx.fillText(m.a.toFixed(1), cx - barW / 2 - 6, baseY - aH - 8);
      ctx.fillText(m.b.toFixed(1), cx + barW / 2 + 6, baseY - bH - 8);

      ctx.fillStyle = '#9aa3b5';
      ctx.fillText(m.label, cx, baseY + 20);
    });

    // Leyenda
    ctx.fillStyle = '#4f8cff';
    ctx.fillRect(12, 10, 12, 12);
    ctx.fillStyle = '#3ecf8e';
    ctx.fillRect(90, 10, 12, 12);
    ctx.fillStyle = '#e6e9f0';
    ctx.textAlign = 'left';
    ctx.fillText('Config. A', 28, 20);
    ctx.fillText('Config. B', 106, 20);
  }

  /** Genera y descarga un CSV con la comparación */
  function exportCsv(results, filename) {
    const rows = [
      ['Métrica', 'Config A', 'Config B'],
      ['Tiempo total (ms)', results.A.elapsedMs.toFixed(2), results.B.elapsedMs.toFixed(2)],
      ['Tramas enviadas', results.A.framesSent, results.B.framesSent],
      ['Retransmisiones', results.A.framesRetransmitted, results.B.framesRetransmitted],
      ['Tramas perdidas', results.A.framesLostChannel, results.B.framesLostChannel],
      ['Throughput (Mbps)', results.A.throughputMbps.toFixed(3), results.B.throughputMbps.toFixed(3)],
      ['Eficiencia teórica (%)', results.A.theoreticalEfficiency.toFixed(2), results.B.theoreticalEfficiency.toFixed(2)],
      ['Eficiencia real (%)', results.A.realEfficiency.toFixed(2), results.B.realEfficiency.toFixed(2)]
    ];
    const csv = rows.map(function (r) { return r.join(','); }).join('\n');
    downloadTextFile(csv, filename || 'comparacion_sr.csv', 'text/csv');
  }

  function downloadTextFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  ns.comparator.Comparator = {
    runComparison: runComparison,
    renderTable: renderTable,
    renderChart: renderChart,
    exportCsv: exportCsv,
    downloadTextFile: downloadTextFile
  };
})(window.SRSim);
