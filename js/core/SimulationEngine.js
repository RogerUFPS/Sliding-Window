/**
 * SimulationEngine.js
 * -----------------------------------------------------------------------
 * Orquesta toda la simulación de Selective Repeat: mantiene un RELOJ
 * VIRTUAL (currentTime, en ms) y una COLA DE EVENTOS PROGRAMADOS
 * (timers de retransmisión). El avance de la lógica NUNCA depende de
 * setInterval: solo avanza cuando
 *   (a) el usuario pulsa "Paso a Paso" (salta directo al próximo evento), o
 *   (b) el modo "Iniciar" está activo, en cuyo caso un requestAnimationFrame
 *       calcula cuánto tiempo VIRTUAL transcurrió desde el frame anterior
 *       (delta real * multiplicador de velocidad) y se lo pide al motor
 *       mediante advanceTo(currentTime + delta). Este diseño es lo que
 *       permite animar tramas "volando" por el canal en vez de saltar
 *       instantáneamente de evento en evento, sin recurrir a setInterval
 *       para la lógica del protocolo.
 *
 * Eventos soportados: solo TIMEOUTS de temporizador (los envíos/llegadas
 * de tramas los resuelve el Channel comparando arriveAt con currentTime,
 * ver update()).
 * -----------------------------------------------------------------------
 */
window.SRSim = window.SRSim || { core: {}, ui: {}, utils: {}, comparator: {} };

(function (ns) {
  'use strict';

  const ACK_SIZE_BYTES = 64; // fijo, según especificación

  function SimulationEngine(config, logger) {
    this.config = config; // { windowSize, bitRateMbps, propDelayMs, fileSizeBytes, frameSizeBytes, lossProbability }
    this.logger = logger || function () {};
    this.reset();
  }

  SimulationEngine.prototype.reset = function () {
    const cfg = this.config;
    this.totalFrames = Math.max(1, Math.ceil(cfg.fileSizeBytes / cfg.frameSizeBytes));

    this.channel = new ns.core.Channel({
      bitRateMbps: cfg.bitRateMbps,
      propDelayMs: cfg.propDelayMs,
      lossProbability: cfg.lossProbability
    });
    this.sender = new ns.core.SenderWindow(this.totalFrames, cfg.windowSize);
    this.receiver = new ns.core.ReceiverBuffer(this.totalFrames, cfg.windowSize);

    this.currentTime = 0;
    this.eventQueue = []; // { time, type: 'timeout', seqNum }
    this.running = false;
    this.finished = false;

    // Métricas acumuladas
    this.stats = {
      framesSent: 0,          // incluye retransmisiones
      framesRetransmitted: 0,
      acksSent: 0,
      framesLostChannel: 0,
      ackLost: 0,
      usefulBitsDelivered: 0,
      totalBitsTransmitted: 0, // incluye DATA + ACK + retransmisiones
      startTime: 0,
      endTime: null
    };

    // Tiempos derivados (ms)
    this.txTimeData = this.channel.transmissionTimeMs(cfg.frameSizeBytes);
    this.txTimeAck = this.channel.transmissionTimeMs(ACK_SIZE_BYTES);
    this.rtt = 2 * cfg.propDelayMs + this.txTimeAck; // fórmula del enunciado (sección 6)
    // Timeout: tiempo de transmisión de la trama + RTT del ACK (round trip completo).
    // Se agrega un 25% de margen de seguridad sobre el RTT estimado: en la
    // práctica el timeout siempre debe ser ESTRICTAMENTE mayor que el RTT
    // esperado (igual que en TCP con su estimador de RTO); sin este margen,
    // el timeout y la llegada del ACK caerían exactamente en el mismo
    // instante y se producirían retransmisiones espurias por empate.
    this.timeoutDuration = (this.txTimeData + this.rtt) * 1.25;

    this._eventLog = [];

    // Iniciar el primer lote de envíos
    this._pump();
  };

  /** Agrega una línea a la consola de eventos */
  SimulationEngine.prototype._log = function (msg) {
    const entry = { time: this.currentTime, msg: msg };
    this._eventLog.push(entry);
    if (this._eventLog.length > 500) this._eventLog.shift();
    this.logger(entry);
  };

  /** Envía todas las tramas que quepan en la ventana actual */
  SimulationEngine.prototype._pump = function () {
    while (this.sender.canSendMore()) {
      const seq = this.sender.nextSeqNum;
      this._sendFrame(seq, false);
    }
  };

  SimulationEngine.prototype._sendFrame = function (seq, isRetransmission) {
    const cfg = this.config;
    const pkt = new ns.core.Packet('DATA', seq, this.currentTime, cfg.frameSizeBytes);
    pkt.isRetransmission = isRetransmission;
    this.channel.transmit(pkt, this.currentTime);

    this.sender.markSent(seq, this.currentTime, this.timeoutDuration, isRetransmission);

    this.stats.framesSent++;
    this.stats.totalBitsTransmitted += cfg.frameSizeBytes * 8;
    if (isRetransmission) this.stats.framesRetransmitted++;

    // Programa el temporizador de esta trama
    this._scheduleTimeout(seq, this.currentTime + this.timeoutDuration);

    this._log((isRetransmission ? 'Retransmitiendo' : 'Enviando') + ' trama ' + seq +
      (pkt.lost ? ' (se perderá en el canal)' : ''));
  };

  SimulationEngine.prototype._scheduleTimeout = function (seqNum, time) {
    const f = this.sender.getFrame(seqNum);
    const timerToken = {}; // identidad única para poder invalidar el timer si llega el ACK antes
    f.timerId = timerToken;
    this.eventQueue.push({ time: time, type: 'timeout', seqNum: seqNum, token: timerToken });
    this.eventQueue.sort(function (a, b) { return a.time - b.time; });
  };

  /** Cancela (invalida) el temporizador activo de una trama, si existe */
  SimulationEngine.prototype._cancelTimeout = function (seqNum) {
    const f = this.sender.getFrame(seqNum);
    f.timerId = null; // cualquier evento de timeout con token viejo será ignorado al procesarse
  };

  /** Devuelve el próximo instante de tiempo relevante (evento o llegada de canal) */
  SimulationEngine.prototype.peekNextEventTime = function () {
    let next = Infinity;
    if (this.eventQueue.length) next = Math.min(next, this.eventQueue[0].time);
    for (let i = 0; i < this.channel.inFlight.length; i++) {
      next = Math.min(next, this.channel.inFlight[i].arriveAt);
    }
    return next === Infinity ? null : next;
  };

  /**
   * Avanza la simulación hasta targetTime, procesando en orden todos los
   * eventos (timeouts y llegadas de paquetes) cuyo tiempo sea <= targetTime.
   */
  SimulationEngine.prototype.advanceTo = function (targetTime) {
    if (this.finished) return;

    // Procesamos eventos intercalando timeouts y llegadas de canal en orden cronológico
    while (true) {
      const nextTimeoutTime = this.eventQueue.length ? this.eventQueue[0].time : Infinity;
      const nextArrivalTime = this._nextChannelArrivalTime();
      const nextTime = Math.min(nextTimeoutTime, nextArrivalTime);

      if (nextTime === Infinity || nextTime > targetTime) break;

      this.currentTime = nextTime;

      if (nextTimeoutTime <= nextArrivalTime) {
        this._processNextTimeout();
      } else {
        this._processArrivalsAt(this.currentTime);
      }

      this._pump();

      if (this._checkFinished()) break;
    }

    this.currentTime = Math.max(this.currentTime, targetTime);
    this._checkFinished();
  };

  SimulationEngine.prototype._nextChannelArrivalTime = function () {
    let min = Infinity;
    for (let i = 0; i < this.channel.inFlight.length; i++) {
      if (this.channel.inFlight[i].arriveAt < min) min = this.channel.inFlight[i].arriveAt;
    }
    return min;
  };

  SimulationEngine.prototype._processNextTimeout = function () {
    const ev = this.eventQueue.shift();
    const f = this.sender.getFrame(ev.seqNum);
    // Ignorar si el timer fue cancelado (ya llegó el ACK) o ya no corresponde
    if (!f || f.timerId !== ev.token) return;
    if (f.status === 'acked') return;

    this._log('Timeout de la trama ' + ev.seqNum + ': se retransmite');
    this._sendFrame(ev.seqNum, true);
  };

  SimulationEngine.prototype._processArrivalsAt = function (time) {
    const arrived = this.channel.update(time);
    for (let i = 0; i < arrived.length; i++) {
      const pkt = arrived[i];
      if (pkt.lost) {
        if (pkt.type === 'DATA') { this.stats.framesLostChannel++; }
        else { this.stats.ackLost++; }
        this._log((pkt.forcedLoss ? 'Pérdida forzada por el usuario: ' : 'Trama perdida en el canal: ') +
          pkt.type + ' ' + pkt.seqNum);
        continue; // no se entrega
      }
      if (pkt.type === 'DATA') {
        this._handleDataArrival(pkt);
      } else {
        this._handleAckArrival(pkt);
      }
    }
  };

  SimulationEngine.prototype._handleDataArrival = function (pkt) {
    const res = this.receiver.receiveFrame(pkt.seqNum);

    if (res.delivered.length) {
      this.stats.usefulBitsDelivered += res.delivered.length * this.config.frameSizeBytes * 8;
      this._log('Trama ' + pkt.seqNum + ' recibida en orden. Entregadas al nivel superior: [' +
        res.delivered.join(', ') + ']');
    } else if (res.stored) {
      this._log('Trama ' + pkt.seqNum + ' fuera de orden: almacenada en buffer del receptor');
    } else if (res.duplicate) {
      this._log('Trama ' + pkt.seqNum + ' duplicada/antigua: descartada, se reenvía ACK');
    }

    // Se envía ACK selectivo para esta trama en particular
    this._sendAck(res.ackSeq);
  };

  SimulationEngine.prototype._sendAck = function (seqNum) {
    const ackPkt = new ns.core.Packet('ACK', seqNum, this.currentTime, ACK_SIZE_BYTES);
    this.channel.transmit(ackPkt, this.currentTime);
    this.stats.acksSent++;
    this.stats.totalBitsTransmitted += ACK_SIZE_BYTES * 8;
  };

  SimulationEngine.prototype._handleAckArrival = function (pkt) {
    const f = this.sender.getFrame(pkt.seqNum);
    if (!f || f.status === 'acked') {
      this._log('ACK ' + pkt.seqNum + ' recibido (duplicado, ignorado)');
      return;
    }
    this._cancelTimeout(pkt.seqNum);
    this.sender.receiveAck(pkt.seqNum);
    this._log('ACK ' + pkt.seqNum + ' recibido. Ventana desliza a base=' + this.sender.base);
  };

  SimulationEngine.prototype._checkFinished = function () {
    if (!this.finished && this.sender.isDone() && this.channel.inFlight.length === 0 && this.eventQueue.length === 0) {
      this.finished = true;
      this.stats.endTime = this.currentTime;
      this._log('Simulación completa: todas las tramas fueron entregadas y confirmadas.');
    }
    return this.finished;
  };

  /** Fuerza la pérdida de una trama en vuelo (usado al hacer click sobre ella en el Canvas) */
  SimulationEngine.prototype.forceFrameLoss = function (packetId) {
    const pkt = this.channel.forceLoss(packetId);
    if (pkt) {
      this._log('Pérdida forzada manualmente: ' + pkt.type + ' ' + pkt.seqNum);
    }
    return pkt;
  };

  /** Avanza directamente hasta el próximo evento relevante (modo Paso a Paso) */
  SimulationEngine.prototype.step = function () {
    const next = this.peekNextEventTime();
    if (next === null) { this._checkFinished(); return; }
    this.advanceTo(next);
  };

  // ---------------------------------------------------------------------
  // Métricas derivadas, calculadas bajo demanda
  // ---------------------------------------------------------------------
  SimulationEngine.prototype.getMetrics = function () {
    const cfg = this.config;
    const elapsedMs = this.finished ? this.stats.endTime : this.currentTime;
    const elapsedSec = elapsedMs / 1000;

    const throughputBps = elapsedSec > 0 ? (this.stats.usefulBitsDelivered / elapsedSec) : 0;
    const throughputMbps = throughputBps / 1e6;
    const throughputKBs = (throughputBps / 8) / 1000;

    // Eficiencia teórica del canal (fórmula sección 1): N * Ttx / (Ttx + 2*Tprop)
    const theoreticalEff = Math.min(1, (cfg.windowSize * this.txTimeData) /
      (this.txTimeData + 2 * cfg.propDelayMs)) * 100;

    // Eficiencia real considerando pérdidas y retransmisiones (sección 6)
    const realEff = this.stats.totalBitsTransmitted > 0 ?
      (this.stats.usefulBitsDelivered / this.stats.totalBitsTransmitted) * 100 : 0;

    return {
      elapsedMs: elapsedMs,
      framesSent: this.stats.framesSent,
      framesRetransmitted: this.stats.framesRetransmitted,
      framesLostChannel: this.stats.framesLostChannel,
      ackLost: this.stats.ackLost,
      throughputMbps: throughputMbps,
      throughputKBs: throughputKBs,
      theoreticalEfficiency: theoreticalEff,
      realEfficiency: realEff,
      bufferedOutOfOrder: this.receiver.getBufferedList().length,
      totalFrames: this.totalFrames,
      deliveredFrames: this.receiver.delivered.length,
      finished: this.finished,
      base: this.sender.base,
      nextSeqNum: this.sender.nextSeqNum,
      expectedSeqNum: this.receiver.expectedSeqNum
    };
  };

  ns.core.SimulationEngine = SimulationEngine;
  ns.core.ACK_SIZE_BYTES = ACK_SIZE_BYTES;
})(window.SRSim);
