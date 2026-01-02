/**
 * Script simple para inyectar anomalía HIGH
 * Ejecutar: node inject-anomaly-simple.js
 */

const mqtt = require('aws-iot-device-sdk');
const fs = require('fs');
const path = require('path');

// Cargar configuración
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

console.log('\n========================================');
console.log('  INYECTANDO ANOMALÍA HIGH A AWS IoT');
console.log('========================================\n');

// Conectar a AWS IoT Core
const device = mqtt.device({
  keyPath: config.mqtt.keyPath,
  certPath: config.mqtt.certPath,
  caPath: config.mqtt.caPath,
  clientId: config.mqtt.clientId + '-injector',
  host: config.mqtt.endpoint
});

device.on('connect', async () => {
  console.log('✅ Conectado a AWS IoT Core\n');
  console.log('Publicando 3 alertas HIGH (temperatura sostenida > 30°C)...\n');

  // Crear alerta HIGH
  const alert = {
    eventType: 'ALERT',
    greenhouseId: config.greenhouseId,
    zone: 'B',
    timestamp: new Date().toISOString(),
    alertType: 'THRESHOLD_HIGH_SUSTAINED',
    severity: 'HIGH',
    metric: 'temperature',
    value: 31.5,
    message: 'temperature sustained above threshold (31.5 > 30) for 3 readings in zone B',
    actionTaken: 'fan=ON',
    deviceId: config.mqtt.clientId
  };

  const topic = config.mqtt.topicAlerts.replace('{greenhouseId}', config.greenhouseId);

  // Publicar alerta
  device.publish(topic, JSON.stringify(alert), { qos: 1 }, (err) => {
    if (err) {
      console.error('❌ Error al publicar:', err.message);
    } else {
      console.log('✅ Alerta HIGH publicada exitosamente!');
      console.log(`   Topic: ${topic}`);
      console.log(`   Severity: ${alert.severity}`);
      console.log(`   Message: ${alert.message}\n`);
      console.log('📧 Deberías recibir email SNS en: gabriel7dev40@gmail.com');
      console.log('📊 Puedes verificar en CloudWatch Logs Lambda\n');

      // Cerrar conexión después de 2 segundos
      setTimeout(() => {
        device.end();
        console.log('Desconectado.');
        process.exit(0);
      }, 2000);
    }
  });
});

device.on('error', (error) => {
  console.error('❌ Error de conexión:', error.message);
  process.exit(1);
});

device.on('offline', () => {
  console.log('⚠️  Desconectado de AWS IoT Core');
});

// Timeout de seguridad
setTimeout(() => {
  console.log('⏱️  Timeout - cerrando...');
  device.end();
  process.exit(0);
}, 10000);
