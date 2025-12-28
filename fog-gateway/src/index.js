/**
 * Fog Gateway - Main Entry Point
 * Orchestrates sensor simulation, aggregation, anomaly detection, and MQTT publishing
 */

const fs = require('fs');
const path = require('path');
const SensorSimulator = require('./sensors');
const Aggregator = require('./aggregator');
const AnomalyDetector = require('./anomaly-detector');
const EventBuffer = require('./buffer');
const MQTTClient = require('./mqtt-client');

class FogGateway {
  constructor(configPath) {
    // Load configuration
    this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log(`[FogGateway] Loaded config for greenhouse ${this.config.greenhouseId}`);
    console.log(`[FogGateway] Zones: ${this.config.zones.join(', ')}`);

    // Initialize components
    this.buffer = new EventBuffer(this.config);
    this.mqtt = new MQTTClient(this.config, this.buffer);
    this.aggregator = new Aggregator(this.config);
    this.anomalyDetector = new AnomalyDetector(this.config, this.aggregator);
    this.sensors = new SensorSimulator(this.config);

    // Wire up event handlers
    this.setupEventHandlers();

    // Stats
    this.stats = {
      readingsGenerated: 0,
      aggregatesPublished: 0,
      alertsGenerated: 0,
      startTime: new Date()
    };
  }

  /**
   * Setup event handlers between components
   */
  setupEventHandlers() {
    // Sensors -> Aggregator + Anomaly Detector
    this.sensors.onReadings((readings) => {
      this.stats.readingsGenerated += readings.length;
      this.aggregator.processReadings(readings);
      this.anomalyDetector.processReadings(readings);
    });

    // Aggregator -> MQTT
    this.aggregator.onAggregates((aggregates) => {
      for (const aggregate of aggregates) {
        this.mqtt.publish('AGGREGATE', aggregate);
        this.stats.aggregatesPublished++;
      }
    });

    // Anomaly Detector -> MQTT
    this.anomalyDetector.onAlerts((alerts) => {
      for (const alert of alerts) {
        this.mqtt.publish('ALERT', alert);
        this.stats.alertsGenerated++;
        console.log(`[FogGateway] ALERT: ${alert.alertType} - ${alert.message}`);
        if (alert.actionTaken) {
          console.log(`[FogGateway] ACTION: ${alert.actionTaken}`);
        }
      }
    });
  }

  /**
   * Start Fog Gateway
   */
  start() {
    console.log('\n========================================');
    console.log('  FOG GATEWAY STARTING');
    console.log('========================================\n');

    // Connect to AWS IoT Core
    this.mqtt.connect();

    // Start aggregation timer
    this.aggregator.start();

    // Start sensor simulation
    this.sensors.start();

    // Start stats reporter
    this.startStatsReporter();

    console.log('\n[FogGateway] All systems operational\n');
  }

  /**
   * Stop Fog Gateway
   */
  stop() {
    console.log('\n[FogGateway] Shutting down...');

    this.sensors.stop();
    this.aggregator.stop();
    this.mqtt.disconnect();
    this.buffer.close();

    if (this.statsIntervalId) {
      clearInterval(this.statsIntervalId);
    }

    this.printStats();
    console.log('[FogGateway] Stopped\n');
  }

  /**
   * Start periodic stats reporter
   */
  startStatsReporter() {
    this.statsIntervalId = setInterval(() => {
      this.printStats();
    }, 60000); // Every 60 seconds
  }

  /**
   * Print statistics
   */
  printStats() {
    const uptime = Math.round((Date.now() - this.stats.startTime) / 1000);
    const bufferStats = this.buffer.getStats();
    const actuators = this.anomalyDetector.getActuatorStates();

    console.log('\n========================================');
    console.log('  FOG GATEWAY STATISTICS');
    console.log('========================================');
    console.log(`Uptime: ${uptime}s`);
    console.log(`MQTT Connected: ${this.mqtt.isConnected() ? 'YES' : 'NO'}`);
    console.log(`Readings Generated: ${this.stats.readingsGenerated}`);
    console.log(`Aggregates Published: ${this.stats.aggregatesPublished}`);
    console.log(`Alerts Generated: ${this.stats.alertsGenerated}`);
    console.log(`Buffer Size: ${bufferStats.total} events`);
    if (bufferStats.total > 0) {
      console.log(`  By Type: ${JSON.stringify(bufferStats.byType)}`);
    }
    console.log(`Actuator States:`);
    for (const [zone, states] of Object.entries(actuators)) {
      console.log(`  Zone ${zone}: ${JSON.stringify(states)}`);
    }
    console.log('========================================\n');
  }

  /**
   * Inject anomaly for testing
   */
  injectAnomaly(zone, metric, value) {
    this.sensors.injectAnomaly(zone, metric, value);
    console.log(`[FogGateway] Injected anomaly: ${zone} ${metric}=${value}`);
  }
}

// Main execution
if (require.main === module) {
  const configPath = path.join(__dirname, '..', 'config.json');
  const gateway = new FogGateway(configPath);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[FogGateway] Received SIGINT');
    gateway.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[FogGateway] Received SIGTERM');
    gateway.stop();
    process.exit(0);
  });

  // Start gateway
  gateway.start();

  // Example: Inject anomaly after 30 seconds (for testing)
  setTimeout(() => {
    console.log('\n[FogGateway] === INJECTING TEST ANOMALY ===\n');
    gateway.injectAnomaly('B', 'temperature', 33);
  }, 30000);
}

module.exports = FogGateway;
