/**
 * Sensor Simulator - Generates realistic sensor readings
 */

class SensorSimulator {
  constructor(config) {
    this.config = config;
    this.zones = config.zones;
    this.metrics = config.sensors.metrics;
    this.intervalMs = config.sensors.readingIntervalMs;
    this.readings = new Map(); // zone -> metric -> last value
    this.listeners = [];
    this.intervalId = null;
  }

  /**
   * Generate a reading with realistic variation (Brownian motion)
   */
  generateReading(metric, zone) {
    const key = `${zone}-${metric.name}`;
    const lastValue = this.readings.get(key);

    let value;
    if (lastValue !== undefined) {
      // Add random walk with tendency to return to normal
      const range = metric.max - metric.min;
      const randomWalk = (Math.random() - 0.5) * (range * 0.05);
      const returnToNormal = (metric.normal - lastValue) * 0.1;
      value = lastValue + randomWalk + returnToNormal;
    } else {
      // Initial value near normal with small variation
      const range = metric.max - metric.min;
      value = metric.normal + (Math.random() - 0.5) * (range * 0.2);
    }

    // Clamp to min/max
    value = Math.max(metric.min, Math.min(metric.max, value));

    // Round based on metric type
    if (metric.name === 'lightIntensity') {
      value = Math.round(value);
    } else {
      value = Math.round(value * 10) / 10;
    }

    this.readings.set(key, value);
    return value;
  }

  /**
   * Generate readings for all zones and metrics
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
   * Start continuous reading generation
   */
  start() {
    console.log(`[Sensors] Starting simulator with ${this.zones.length} zones, ${this.metrics.length} metrics, interval ${this.intervalMs}ms`);

    this.intervalId = setInterval(() => {
      const readings = this.generateAllReadings();
      this.notifyListeners(readings);
    }, this.intervalMs);

    // Generate initial readings immediately
    const readings = this.generateAllReadings();
    this.notifyListeners(readings);
  }

  /**
   * Stop simulator
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[Sensors] Simulator stopped');
    }
  }

  /**
   * Add listener for new readings
   */
  onReadings(callback) {
    this.listeners.push(callback);
  }

  /**
   * Notify all listeners
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
   * Inject anomaly for testing (override next reading)
   */
  injectAnomaly(zone, metric, value) {
    const key = `${zone}-${metric}`;
    this.readings.set(key, value);
    console.log(`[Sensors] Injected anomaly: ${zone} ${metric}=${value}`);
  }
}

module.exports = SensorSimulator;
