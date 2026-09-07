/**
 * ReceiverBuffer.js
 * -----------------------------------------------------------------------
 * Maneja el estado del RECEPTOR en Selective Repeat.
 *
 * ESTRATEGIA DE ACK ELEGIDA (documentada según lo pedido en el enunciado):
 *   Usamos ACK SELECTIVO puro (el más fiel al nombre "Selective Repeat"):
 *   el receptor envía un ACK con el número de secuencia de CADA trama que
 *   recibe correctamente, sin importar si llegó en orden o no.
 *     - Si la trama es la esperada (seq === expectedSeqNum): se entrega
 *       al nivel superior, se avanza expectedSeqNum, y se intenta vaciar
 *       el buffer con las tramas consecutivas que ya estaban guardadas.
 *     - Si la trama es futura (seq > expectedSeqNum) y cabe dentro de la
 *       ventana de recepción [expected, expected + N - 1]: se guarda en
 *       el buffer y IGUALMENTE se envía ACK(seq), porque esa trama en
 *       particular sí fue recibida sin error (esto es lo que permite al
 *       emisor NO retransmitirla, a diferencia de Go-Back-N).
 *     - Si la trama es antigua (seq < expectedSeqNum, ya entregada antes):
 *       se descarta pero se reenvía ACK(seq) por si el ACK original se
 *       perdió en el camino.
 * -----------------------------------------------------------------------
 */
window.SRSim = window.SRSim || { core: {}, ui: {}, utils: {}, comparator: {} };

(function (ns) {
  'use strict';

  function ReceiverBuffer(totalFrames, windowSize) {
    this.totalFrames = totalFrames;
    this.windowSize = windowSize;
    this.expectedSeqNum = 0;
    this.buffer = {};       // seqNum -> true (recibida, fuera de orden, aún no entregada)
    this.delivered = [];    // lista de seqNum entregados al nivel superior, en orden
  }

  /**
   * Procesa la llegada de una trama DATA con número seq.
   * Devuelve { ackSeq, delivered: [...], stored: bool, duplicate: bool }
   */
  ReceiverBuffer.prototype.receiveFrame = function (seq) {
    const result = { ackSeq: seq, delivered: [], stored: false, duplicate: false };

    if (seq === this.expectedSeqNum) {
      // Entrega inmediata
      this.delivered.push(seq);
      result.delivered.push(seq);
      this.expectedSeqNum++;
      // Vaciar buffer con tramas consecutivas ya almacenadas
      while (this.buffer[this.expectedSeqNum]) {
        delete this.buffer[this.expectedSeqNum];
        this.delivered.push(this.expectedSeqNum);
        result.delivered.push(this.expectedSeqNum);
        this.expectedSeqNum++;
      }
    } else if (seq > this.expectedSeqNum && seq < this.expectedSeqNum + this.windowSize) {
      // Fuera de orden pero dentro de la ventana de recepción: se guarda
      if (!this.buffer[seq]) {
        this.buffer[seq] = true;
        result.stored = true;
      } else {
        result.duplicate = true;
      }
    } else {
      // Trama antigua / ya entregada: duplicado
      result.duplicate = true;
    }
    return result;
  };

  ReceiverBuffer.prototype.getBufferedList = function () {
    return Object.keys(this.buffer).map(Number).sort(function (a, b) { return a - b; });
  };

  ns.core.ReceiverBuffer = ReceiverBuffer;
})(window.SRSim);
