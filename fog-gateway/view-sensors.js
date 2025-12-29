/**
 * Script para ver la generación de datos de sensores en tiempo real
 */

const SensorSimulator = require('./src/sensors');
const config = require('./config.json');

console.log('========================================');
console.log('  SIMULADOR DE SENSORES');
console.log('========================================');
console.log(`Invernadero: ${config.greenhouseId}`);
console.log(`Zonas: ${config.zones.join(', ')}`);
console.log(`Métricas: ${config.sensors.metrics.map(m => m.name).join(', ')}`);
console.log(`Intervalo: ${config.sensors.readingIntervalMs}ms`);
console.log('========================================\n');

// Crear simulador
const simulator = new SensorSimulator(config);

// Escuchar lecturas y mostrarlas en consola
simulator.onReadings((readings) => {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`\n[${timestamp}] Nueva lectura:`);

  // Agrupar por zona para mejor visualización
  const byZone = {};
  readings.forEach(r => {
    if (!byZone[r.zone]) byZone[r.zone] = [];
    byZone[r.zone].push(r);
  });

  // Mostrar por zona
  for (const zone of config.zones) {
    const zoneReadings = byZone[zone] || [];
    const values = zoneReadings.map(r =>
      `${r.metric}=${r.value}${r.unit}`
    ).join(', ');
    console.log(`  Zona ${zone}: ${values}`);
  }
});

// Iniciar simulador
simulator.start();

// Manejar Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\nDeteniendo simulador...');
  simulator.stop();
  process.exit(0);
});

console.log('Generando lecturas... (Presiona Ctrl+C para detener)\n');
