/**
 * Script para inyectar anomalía de severidad HIGH
 * Genera alerta THRESHOLD_HIGH_SUSTAINED que dispara notificación SNS
 */

const path = require('path');
const FogGateway = require('./src/index');

// Nota: Este script asume que el fog-gateway ya está corriendo
// Si no está corriendo, necesitas iniciarlo primero

console.log('\n========================================');
console.log('  INYECTANDO ANOMALÍA HIGH');
console.log('========================================\n');

console.log('Para generar una alerta HIGH (THRESHOLD_HIGH_SUSTAINED):');
console.log('- Se necesita temperatura > 30°C sostenida por 3 lecturas');
console.log('- Inyectaremos temperatura = 31°C tres veces con intervalo de 6 segundos\n');

// Conectar al proceso Node.js del fog-gateway en ejecución
// Para hacer esto, necesitamos usar el REPL de Node.js
// O podemos hacerlo vía archivo temporal

console.log('INSTRUCCIONES:');
console.log('==============\n');
console.log('1. Abre otra terminal/PowerShell');
console.log('2. Navega a: cd fog-gateway');
console.log('3. Ejecuta el siguiente comando Node.js REPL:\n');
console.log('   node -e "setTimeout(() => {}, 300000)" -i\n');
console.log('4. En el REPL, pega este código:\n');
console.log('-------------------------------------------');
console.log(`
const FogGateway = require('./src/index');
const path = require('path');
const configPath = path.join(__dirname, 'config.json');
const gateway = new FogGateway(configPath);

// Función para inyectar 3 veces con delay
async function injectHighAnomaly() {
  console.log('\\n[ANOMALY INJECTION] Inyectando temperatura alta en Zona B...');

  // Primera inyección
  gateway.sensors.injectAnomaly('B', 'temperature', 31);
  console.log('[1/3] Temperatura = 31°C inyectada');

  // Segunda inyección (después de 6 segundos)
  await new Promise(resolve => setTimeout(resolve, 6000));
  gateway.sensors.injectAnomaly('B', 'temperature', 31);
  console.log('[2/3] Temperatura = 31°C inyectada');

  // Tercera inyección (después de otros 6 segundos)
  await new Promise(resolve => setTimeout(resolve, 6000));
  gateway.sensors.injectAnomaly('B', 'temperature', 31);
  console.log('[3/3] Temperatura = 31°C inyectada');

  console.log('\\n✅ Anomalía HIGH inyectada!');
  console.log('Espera ~10-15 segundos para:');
  console.log('  1. Ver alerta en logs del fog-gateway');
  console.log('  2. Ver alerta en CloudWatch Logs');
  console.log('  3. Recibir email de SNS en: gabriel7dev40@gmail.com\\n');
}

// Ejecutar la inyección
injectHighAnomaly();
`);
console.log('-------------------------------------------\n');
console.log('ALTERNATIVA MÁS SIMPLE:');
console.log('=======================\n');
console.log('Si el fog-gateway está corriendo en otra terminal, simplemente pega este comando:\n');
console.log('Opción A - Temperatura alta puntual (THRESHOLD_HIGH - MEDIUM):');
console.log('   (Abre el código del fog-gateway y descomenta la línea con injectAnomaly)\n');
console.log('Opción B - Usar curl para publicar directamente (requiere más setup)');
console.log('Opción C - Modificar temporalmente el código y reiniciar\n');
console.log('========================================\n');
