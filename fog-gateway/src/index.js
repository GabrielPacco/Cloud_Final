/**
 * Fog Gateway - Punto de Entrada Principal
 * Orquesta la simulación de sensores, agregación, detección de anomalías y publicación MQTT
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
    // Cargar configuración
    this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log(`[FogGateway] Loaded config for greenhouse ${this.config.greenhouseId}`);
    console.log(`[FogGateway] Zones: ${this.config.zones.join(', ')}`);

    // Inicializar componentes
    this.buffer = new EventBuffer(this.config);
    this.mqtt = new MQTTClient(this.config, this.buffer);
    this.aggregator = new Aggregator(this.config);
    this.anomalyDetector = new AnomalyDetector(this.config, this.aggregator);
    this.sensors = new SensorSimulator(this.config);

    // Configurar manejadores de eventos
    this.setupEventHandlers();

    // Estadísticas
    this.stats = {
      readingsGenerated: 0,
      aggregatesPublished: 0,
      alertsGenerated: 0,
      startTime: new Date()
    };
  }

  /**
   * Configura los manejadores de eventos entre componentes
   */
  setupEventHandlers() {
    // Sensores -> Agregador + Detector de Anomalías
    this.sensors.onReadings((readings) => {
      this.stats.readingsGenerated += readings.length;
      this.aggregator.processReadings(readings);
      this.anomalyDetector.processReadings(readings);
    });

    // Agregador -> MQTT
    this.aggregator.onAggregates((aggregates) => {
      for (const aggregate of aggregates) {
        this.mqtt.publish('AGGREGATE', aggregate);
        this.stats.aggregatesPublished++;
      }
    });

    // Detector de Anomalías -> MQTT
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
   * Inicia el Fog Gateway
   */
  start() {
    console.log('\n========================================');
    console.log('  FOG GATEWAY STARTING');
    console.log('========================================\n');

    // Conectar a AWS IoT Core
    this.mqtt.connect();

    // Iniciar temporizador de agregación
    this.aggregator.start();

    // Iniciar simulación de sensores
    this.sensors.start();

    // Iniciar reportador de estadísticas
    this.startStatsReporter();

    console.log('\n[FogGateway] All systems operational\n');
  }

  /**
   * Detiene el Fog Gateway
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
   * Inicia el reportador periódico de estadísticas
   */
  startStatsReporter() {
    this.statsIntervalId = setInterval(() => {
      this.printStats();
    }, 60000); // Cada 60 segundos
  }

  /**
   * Imprime estadísticas
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
   * Inyecta anomalía para pruebas
   */
  injectAnomaly(zone, metric, value) {
    this.sensors.injectAnomaly(zone, metric, value);
    console.log(`[FogGateway] Injected anomaly: ${zone} ${metric}=${value}`);
  }
}

// Ejecución principal
if (require.main === module) {
  const configPath = path.join(__dirname, '..', 'config.json');
  const gateway = new FogGateway(configPath);

  // Manejar apagado gracioso
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

  // Iniciar gateway
  gateway.start();

  // Ejemplo: Inyectar anomalía después de 30 segundos (para pruebas)
  setTimeout(() => {
    console.log('\n[FogGateway] === INJECTING TEST ANOMALY ===\n');
    gateway.injectAnomaly('B', 'temperature', 33);
  }, 30000);
}

module.exports = FogGateway;
