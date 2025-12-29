/**
 * Simulador de Sensores - Genera lecturas realistas de sensores
 */

class SensorSimulator {
  constructor(config) {
    this.config = config;
    this.zones = config.zones;
    this.metrics = config.sensors.metrics;
    this.intervalMs = config.sensors.readingIntervalMs;
    this.readings = new Map(); // zona -> métrica -> último valor
    this.listeners = [];
    this.intervalId = null;
  }

  /**
   * Genera una lectura con variación realista (movimiento browniano)
   */
  generateReading(metric, zone) {
    const key = `${zone}-${metric.name}`;
    const lastValue = this.readings.get(key);

    let value;
    if (lastValue !== undefined) {
      // Añadir caminata aleatoria con tendencia a volver a lo normal
      const range = metric.max - metric.min;
      const randomWalk = (Math.random() - 0.5) * (range * 0.05);
      const returnToNormal = (metric.normal - lastValue) * 0.1;
      value = lastValue + randomWalk + returnToNormal;
    } else {
      // Valor inicial cercano al normal con pequeña variación
      const range = metric.max - metric.min;
      value = metric.normal + (Math.random() - 0.5) * (range * 0.2);
    }

    // Limitar a min/max
    value = Math.max(metric.min, Math.min(metric.max, value));

    // Redondear según el tipo de métrica
    if (metric.name === 'lightIntensity') {
      value = Math.round(value);
    } else {
      value = Math.round(value * 10) / 10;
    }

    this.readings.set(key, value);
    return value;
  }

  /**
   * Genera lecturas para todas las zonas y métricas
   */
  generateAllReadings() {
    const timestamp = new Date().toISOString();
    const readings = [];

    for (const zone of this.zones) {
      for (const metric of this.metrics) {
        const value = this.generateReading(metric, zone);
        readings.push({
          zone,
          metric: metric.name,
          value,
          unit: metric.unit,
          timestamp
        });
      }
    }

    return readings;
  }

  /**
   * Inicia la generación continua de lecturas
   */
  start() {
    console.log(`[Sensors] Starting simulator with ${this.zones.length} zones, ${this.metrics.length} metrics, interval ${this.intervalMs}ms`);

    this.intervalId = setInterval(() => {
      const readings = this.generateAllReadings();
      this.notifyListeners(readings);
    }, this.intervalMs);

    // Generar lecturas iniciales inmediatamente
    const readings = this.generateAllReadings();
    this.notifyListeners(readings);
  }

  /**
   * Detiene el simulador
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[Sensors] Simulator stopped');
    }
  }

  /**
   * Añade un listener para nuevas lecturas
   */
  onReadings(callback) {
    this.listeners.push(callback);
  }

  /**
   * Notifica a todos los listeners
   */
  notifyListeners(readings) {
    for (const listener of this.listeners) {
      try {
        listener(readings);
      } catch (err) {
        console.error('[Sensors] Error in listener:', err);
      }
    }
  }

  /**
   * Inyecta una anomalía para pruebas (sobrescribe la siguiente lectura)
   */
  injectAnomaly(zone, metric, value) {
    const key = `${zone}-${metric}`;
    this.readings.set(key, value);
    console.log(`[Sensors] Injected anomaly: ${zone} ${metric}=${value}`);
  }
}

module.exports = SensorSimulator;
