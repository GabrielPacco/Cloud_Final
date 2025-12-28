/**
 * Anomaly Detector - Detects anomalies based on rules
 */

class AnomalyDetector {
  constructor(config, aggregator) {
    this.config = config;
    this.aggregator = aggregator;
    this.rules = config.anomalyDetection.rules;
    this.listeners = [];

    // Tracking for sustained anomalies
    this.sustained = new Map(); // zone-metric -> count

    // Tracking for stuck sensors
    this.lastValues = new Map(); // zone-metric -> {value, count}

    // Tracking for silent sensors
    this.lastSeen = new Map(); // zone-metric -> timestamp

    // Actuator states (simulated)
    this.actuators = new Map(); // zone -> {fan, irrigation, vent, shade}
  }

  /**
   * Process readings and detect anomalies
   */
  processReadings(readings) {
    const now = Date.now();
    const alerts = [];

    for (const reading of readings) {
      const { zone, metric, value, timestamp } = reading;
      const key = `${zone}-${metric}`;

      // Update last seen
      this.lastSeen.set(key, now);

      // Check for stuck sensor
      const stuckAlert = this.checkStuck(zone, metric, value);
      if (stuckAlert) alerts.push(stuckAlert);

      // Check threshold rules
      const thresholdAlerts = this.checkThresholds(zone, metric, value);
      alerts.push(...thresholdAlerts);
    }

    // Check for silent sensors
    const silentAlerts = this.checkSilent(now);
    alerts.push(...silentAlerts);

    // Execute actions and notify
    if (alerts.length > 0) {
      for (const alert of alerts) {
        this.executeAction(alert);
      }
      this.notifyListeners(alerts);
    }
  }

  /**
   * Check if sensor is stuck (same value multiple times)
   */
  checkStuck(zone, metric, value) {
    const key = `${zone}-${metric}`;
    const last = this.lastValues.get(key);

    if (last && last.value === value) {
      last.count++;
      if (last.count >= this.config.anomalyDetection.stuckThreshold) {
        return {
          eventType: 'ALERT',
          greenhouseId: this.config.greenhouseId,
          zone,
          timestamp: new Date().toISOString(),
          alertType: 'SENSOR_STUCK',
          severity: 'MEDIUM',
          metric,
          value,
          message: `Sensor ${metric} stuck at ${value} in zone ${zone}`,
          deviceId: this.config.mqtt.clientId
        };
      }
    } else {
      this.lastValues.set(key, { value, count: 1 });
    }

    return null;
  }

  /**
   * Check threshold-based rules
   */
  checkThresholds(zone, metric, value) {
    const alerts = [];

    for (const rule of this.rules) {
      if (rule.metric !== metric) continue;

      const key = `${zone}-${metric}-${rule.type}`;

      if (rule.type === 'THRESHOLD_HIGH' && value > rule.threshold) {
        alerts.push({
          eventType: 'ALERT',
          greenhouseId: this.config.greenhouseId,
          zone,
          timestamp: new Date().toISOString(),
          alertType: 'THRESHOLD_HIGH',
          severity: rule.severity,
          metric,
          value,
          threshold: rule.threshold,
          message: `${metric} above threshold (${value} > ${rule.threshold}) in zone ${zone}`,
          action: rule.action,
          deviceId: this.config.mqtt.clientId
        });
      } else if (rule.type === 'THRESHOLD_LOW' && value < rule.threshold) {
        alerts.push({
          eventType: 'ALERT',
          greenhouseId: this.config.greenhouseId,
          zone,
          timestamp: new Date().toISOString(),
          alertType: 'THRESHOLD_LOW',
          severity: rule.severity,
          metric,
          value,
          threshold: rule.threshold,
          message: `${metric} below threshold (${value} < ${rule.threshold}) in zone ${zone}`,
          action: rule.action,
          deviceId: this.config.mqtt.clientId
        });
      } else if (rule.type === 'THRESHOLD_HIGH_SUSTAINED' && value > rule.threshold) {
        // Track sustained violations
        const count = (this.sustained.get(key) || 0) + 1;
        this.sustained.set(key, count);

        if (count >= rule.duration) {
          alerts.push({
            eventType: 'ALERT',
            greenhouseId: this.config.greenhouseId,
            zone,
            timestamp: new Date().toISOString(),
            alertType: 'THRESHOLD_HIGH_SUSTAINED',
            severity: rule.severity,
            metric,
            value,
            threshold: rule.threshold,
            duration: count * (this.config.sensors.readingIntervalMs / 1000),
            message: `${metric} sustained above threshold (${value} > ${rule.threshold}) for ${count} readings in zone ${zone}`,
            action: rule.action,
            deviceId: this.config.mqtt.clientId
          });
          // Reset counter after alert
          this.sustained.set(key, 0);
        }
      } else {
        // Reset sustained counter if threshold not violated
        if (rule.type === 'THRESHOLD_HIGH_SUSTAINED') {
          this.sustained.set(key, 0);
        }
      }
    }

    return alerts;
  }

  /**
   * Check for silent sensors (no data received)
   */
  checkSilent(now) {
    const alerts = [];
    const silentThresholdMs = this.config.anomalyDetection.silentThresholdSec * 1000;

    for (const [key, lastSeen] of this.lastSeen.entries()) {
      if (now - lastSeen > silentThresholdMs) {
        const [zone, metric] = key.split('-');
        alerts.push({
          eventType: 'ALERT',
          greenhouseId: this.config.greenhouseId,
          zone,
          timestamp: new Date().toISOString(),
          alertType: 'SENSOR_SILENT',
          severity: 'HIGH',
          metric,
          message: `Sensor ${metric} silent for ${Math.round((now - lastSeen) / 1000)}s in zone ${zone}`,
          deviceId: this.config.mqtt.clientId
        });
        // Remove to avoid repeated alerts
        this.lastSeen.delete(key);
      }
    }

    return alerts;
  }

  /**
   * Execute action (simulated actuators)
   */
  executeAction(alert) {
    if (!alert.action) return;

    const { zone, action } = alert;
    const [actuator, state] = action.split('=');

    if (!this.actuators.has(zone)) {
      this.actuators.set(zone, {});
    }

    const zoneActuators = this.actuators.get(zone);
    zoneActuators[actuator] = state;

    console.log(`[AnomalyDetector] ACTION TAKEN: Zone ${zone} -> ${action}`);
    alert.actionTaken = action;
  }

  /**
   * Get current actuator states
   */
  getActuatorStates() {
    return Object.fromEntries(this.actuators);
  }

  /**
   * Add listener for alerts
   */
  onAlerts(callback) {
    this.listeners.push(callback);
  }

  /**
   * Notify all listeners
   */
  notifyListeners(alerts) {
    for (const listener of this.listeners) {
      try {
        listener(alerts);
      } catch (err) {
        console.error('[AnomalyDetector] Error in listener:', err);
      }
    }
  }
}

module.exports = AnomalyDetector;
