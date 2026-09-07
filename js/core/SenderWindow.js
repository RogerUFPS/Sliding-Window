/**
 * SenderWindow.js
 * -----------------------------------------------------------------------
 * Maneja el estado del EMISOR en Selective Repeat:
 *   - base:       índice de la trama más antigua aún no confirmada.
 *   - nextSeqNum: siguiente número de secuencia a enviar.
 *   - windowSize: tamaño de la ventana (N).
 *   - frames[i]:  estado de cada trama { status, sentAt, timeoutAt, retransmissions }
 *
 * Nota de diseño: para simplificar la simulación pedagógica usamos
 * numeración ABSOLUTA de tramas (0..totalFrames-1) en vez de aritmética
 * modular sobre un espacio de 2N secuencias como haría una implementación
 * de producción. El comportamiento del protocolo (qué se envía, qué se
 * reenvía, cuándo se desliza la ventana) es idéntico; solo cambia la
 * representación del número de secuencia.
 *
 * Estados posibles de una trama:
 *   'pending'   -> aún no se ha enviado
 *   'sent'      -> enviada, esperando ACK
 *   'acked'     -> confirmada
 *   'timeout'   -> su temporizador expiró y está siendo retransmitida
 * -----------------------------------------------------------------------
 */
window.SRSim = window.SRSim || { core: {}, ui: {}, utils: {}, comparator: {} };

(function (ns) {
  'use strict';

  function SenderWindow(totalFrames, windowSize) {
    this.totalFrames = totalFrames;
    this.windowSize = windowSize;
    this.base = 0;
    this.nextSeqNum = 0;
    this.frames = [];
    for (let i = 0; i < totalFrames; i++) {
      this.frames.push({
        seqNum: i,
        status: 'pending',
        sentAt: null,
        timeoutAt: null,
        timerId: null,
        retransmissions: 0
      });
    }
  }

  SenderWindow.prototype.isDone = function () {
    return this.base >= this.totalFrames;
  };

  /** ¿Hay hueco en la ventana para enviar una trama nueva? */
  SenderWindow.prototype.canSendMore = function () {
    return this.nextSeqNum < this.totalFrames &&
           this.nextSeqNum < this.base + this.windowSize;
  };

  /** Marca una trama como enviada (o reenviada) */
  SenderWindow.prototype.markSent = function (seqNum, currentTime, timeoutDurationMs, isRetransmission) {
    const f = this.frames[seqNum];
    f.status = isRetransmission ? 'timeout' : 'sent'; // 'timeout' se usa aquí como "en retransmisión activa"
    f.sentAt = currentTime;
    f.timeoutAt = currentTime + timeoutDurationMs;
    if (isRetransmission) f.retransmissions++;
    if (seqNum === this.nextSeqNum && !isRetransmission) {
      this.nextSeqNum++;
    }
  };

  /** Procesa la llegada de un ACK selectivo para seqNum. Devuelve true si produjo cambios. */
  SenderWindow.prototype.receiveAck = function (seqNum) {
    if (seqNum < 0 || seqNum >= this.totalFrames) return false;
    const f = this.frames[seqNum];
    if (f.status === 'acked') return false; // ACK duplicado, ya confirmada
    f.status = 'acked';

    // Desliza la base mientras las tramas consecutivas ya estén confirmadas
    let moved = false;
    while (this.base < this.totalFrames && this.frames[this.base].status === 'acked') {
      this.base++;
      moved = true;
    }
    return true || moved;
  };

  SenderWindow.prototype.getFrame = function (seqNum) {
    return this.frames[seqNum];
  };

  ns.core.SenderWindow = SenderWindow;
})(window.SRSim);
