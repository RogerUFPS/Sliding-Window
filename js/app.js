/**
 * app.js
 * -----------------------------------------------------------------------
 * Punto de entrada de la aplicación. Instancia el motor de simulación,
 * el renderer, el panel de estadísticas y conecta los controles del
 * HTML. Arranca el bucle de animación con requestAnimationFrame.
 *
 * IMPORTANTE: la lógica del protocolo (envíos, ACKs, timeouts) SOLO
 * avanza cuando el usuario pulsa "Iniciar" (modo continuo) o "Paso a
 * Paso" (modo discreto). El requestAnimationFrame en modo continuo se
 * limita a calcular cuánto tiempo virtual transcurrió y pedírselo al
 * SimulationEngine mediante advanceTo(); no usamos setInterval en
 * ningún punto de la lógica central.
 * -----------------------------------------------------------------------
 */
(function () {
  'use strict';

  const ns = window.SRSim;
  const Controls = ns.ui.Controls;

  let engine = null;
  let renderer = null;
  let statsDisplay = null;
  let running = false;
  let lastWallTime = null;

  function buildEngine() {
    const config = Controls.readConfig('');
    engine = new ns.core.SimulationEngine(config);
    return engine;
  }

  function resetSimulation() {
    running = false;
    lastWallTime = null;
    buildEngine();
    statsDisplay.clearLog();
    renderer.render(engine);
    statsDisplay.update(engine);
    setRunningUI(false);
  }

  function setRunningUI(isRunning) {
    document.getElementById('btnStart').disabled = isRunning || (engine && engine.finished);
    document.getElementById('btnPause').disabled = !isRunning;
    document.getElementById('btnStep').disabled = isRunning || (engine && engine.finished);
  }

  function loop(timestamp) {
    if (running && engine && !engine.finished) {
      if (lastWallTime === null) lastWallTime = timestamp;
      const deltaWallMs = timestamp - lastWallTime;
      lastWallTime = timestamp;
      const speed = Controls.getSpeedMultiplier();
      const deltaSimMs = deltaWallMs * speed;
      engine.advanceTo(engine.currentTime + deltaSimMs);

      if (engine.finished) {
        running = false;
        setRunningUI(false);
      }
    } else {
      lastWallTime = null;
    }

    if (engine) {
      renderer.render(engine);
      statsDisplay.update(engine);
    }
    requestAnimationFrame(loop);
  }

  function exportCurrentCsv() {
    if (!engine) return;
    const m = engine.getMetrics();
    const rows = [
      ['Métrica', 'Valor'],
      ['Tiempo total (ms)', m.elapsedMs.toFixed(2)],
      ['Tramas enviadas', m.framesSent],
      ['Retransmisiones', m.framesRetransmitted],
      ['Tramas perdidas en canal', m.framesLostChannel],
      ['ACKs perdidos', m.ackLost],
      ['Throughput (Mbps)', m.throughputMbps.toFixed(3)],
      ['Throughput (KB/s)', m.throughputKBs.toFixed(2)],
      ['Eficiencia teórica (%)', m.theoreticalEfficiency.toFixed(2)],
      ['Eficiencia real (%)', m.realEfficiency.toFixed(2)],
      ['Tramas en buffer receptor', m.bufferedOutOfOrder],
      ['Progreso', m.deliveredFrames + ' / ' + m.totalFrames]
    ];
    const csv = rows.map(function (r) { return r.join(','); }).join('\n');
    ns.comparator.Comparator.downloadTextFile(csv, 'simulacion_selective_repeat.csv', 'text/csv');
  }

  function initCanvasInteraction(canvas) {
    canvas.addEventListener('click', function (evt) {
      if (!engine) return;
      const rect = canvas.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      const y = evt.clientY - rect.top;
      const id = renderer.hitTest(x, y);
      if (id) engine.forceFrameLoss(id);
    });
    canvas.addEventListener('mousemove', function (evt) {
      const rect = canvas.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      const y = evt.clientY - rect.top;
      canvas.style.cursor = renderer.hitTest(x, y) ? 'pointer' : 'default';
    });
  }

  function initComparatorTab() {
    const btnCompare = document.getElementById('btnCompare');
    const btnExportCompare = document.getElementById('btnExportCompare');
    const tbody = document.getElementById('compareTableBody');
    const chartCanvas = document.getElementById('compareChart');
    let lastResults = null;

    btnCompare.addEventListener('click', function () {
      const configA = Controls.readConfig('a');
      const configB = Controls.readConfig('b');
      lastResults = ns.comparator.Comparator.runComparison(configA, configB);
      ns.comparator.Comparator.renderTable(tbody, lastResults);
      ns.comparator.Comparator.renderChart(chartCanvas, lastResults);
      btnExportCompare.disabled = false;
    });

    btnExportCompare.addEventListener('click', function () {
      if (lastResults) ns.comparator.Comparator.exportCsv(lastResults, 'comparacion_selective_repeat.csv');
    });
  }

  function init() {
    Controls.bindRangeDisplays(document);
    Controls.initTabs(
      Array.prototype.slice.call(document.querySelectorAll('.tab-btn')),
      Array.prototype.slice.call(document.querySelectorAll('.tab-panel'))
    );
    Controls.initThemeToggle(document.getElementById('btnTheme'));

    const canvas = document.getElementById('simCanvas');
    renderer = new ns.ui.Renderer(canvas);
    renderer.resize();

    statsDisplay = new ns.ui.StatsDisplay(document.getElementById('statsPanel'));

    buildEngine();
    setRunningUI(false);

    document.getElementById('btnStart').addEventListener('click', function () {
      if (engine.finished) return;
      running = true;
      lastWallTime = null;
      setRunningUI(true);
    });
    document.getElementById('btnPause').addEventListener('click', function () {
      running = false;
      setRunningUI(false);
    });
    document.getElementById('btnReset').addEventListener('click', resetSimulation);
    document.getElementById('btnStep').addEventListener('click', function () {
      if (engine.finished) return;
      engine.step();
      renderer.render(engine);
      statsDisplay.update(engine);
      setRunningUI(false);
      if (engine.finished) setRunningUI(false);
    });
    document.getElementById('btnExportCsv').addEventListener('click', exportCurrentCsv);

    initCanvasInteraction(canvas);
    initComparatorTab();

    window.addEventListener('resize', function () { renderer.resize(); });

    requestAnimationFrame(loop);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
