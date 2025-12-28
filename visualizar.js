/**
 * Dashboard de Visualización - Invernadero Inteligente
 * Muestra datos de DynamoDB en tiempo real
 */

const { DynamoDBClient, ScanCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({ region: "us-east-1" });
const GREENHOUSE_ID = "GH01";
const ZONES = ["A", "B", "C"];

// Colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function clearScreen() {
  console.clear();
}

function printHeader() {
  console.log(colors.cyan + colors.bright);
  console.log("╔════════════════════════════════════════════════════════════════════╗");
  console.log("║         INVERNADERO INTELIGENTE - DASHBOARD EN VIVO              ║");
  console.log("╚════════════════════════════════════════════════════════════════════╝");
  console.log(colors.reset);
}

function formatTimestamp(iso) {
  const date = new Date(iso);
  return date.toLocaleString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function getTimeAgo(iso) {
  const now = new Date();
  const then = new Date(iso);
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

async function getCurrentState(zone) {
  try {
    const result = await client.send(new QueryCommand({
      TableName: "GreenhouseState",
      KeyConditionExpression: "PK = :pk AND SK = :sk",
      ExpressionAttributeValues: {
        ":pk": { S: `GH#${GREENHOUSE_ID}#ZONE#${zone}` },
        ":sk": { S: "CURRENT" },
      },
    }));

    if (result.Items && result.Items.length > 0) {
      return unmarshall(result.Items[0]);
    }
    return null;
  } catch (err) {
    return null;
  }
}

async function getRecentAlerts(zone, limit = 3) {
  try {
    const result = await client.send(new QueryCommand({
      TableName: "GreenhouseState",
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": { S: `GH#${GREENHOUSE_ID}#ZONE#${zone}` },
        ":sk": { S: "ALERT#" },
      },
      ScanIndexForward: false,
      Limit: limit,
    }));

    if (result.Items && result.Items.length > 0) {
      return result.Items.map(item => unmarshall(item));
    }
    return [];
  } catch (err) {
    return [];
  }
}

function printZoneStatus(zone, state) {
  console.log(colors.blue + colors.bright + `\n┌─── ZONA ${zone} ───────────────────────────────────────────────┐` + colors.reset);

  if (!state) {
    console.log(colors.yellow + "  Sin datos (esperando primera agregación...)" + colors.reset);
    console.log(colors.blue + "└─────────────────────────────────────────────────────────┘" + colors.reset);
    return;
  }

  const metrics = JSON.parse(state.metrics);
  const age = getTimeAgo(state.timestamp);

  console.log(`  ${colors.cyan}Última actualización:${colors.reset} ${formatTimestamp(state.timestamp)} (${age} atrás)`);
  console.log("");

  // Temperature
  const temp = metrics.temperature;
  const tempColor = temp.avg > 30 ? colors.red : temp.avg > 28 ? colors.yellow : colors.green;
  console.log(`  🌡️  ${colors.bright}Temperatura:${colors.reset} ${tempColor}${temp.avg}°C${colors.reset} (min: ${temp.min}°C, max: ${temp.max}°C)`);

  // Humidity
  const hum = metrics.humidity;
  const humColor = hum.avg > 75 ? colors.yellow : colors.green;
  console.log(`  💧 ${colors.bright}Humedad:${colors.reset}     ${humColor}${hum.avg}%${colors.reset} (min: ${hum.min}%, max: ${hum.max}%)`);

  // Soil Moisture
  const soil = metrics.soilMoisture;
  const soilColor = soil.avg < 35 ? colors.red : soil.avg < 40 ? colors.yellow : colors.green;
  console.log(`  🌱 ${colors.bright}Suelo:${colors.reset}        ${soilColor}${soil.avg}%${colors.reset} (min: ${soil.min}%, max: ${soil.max}%)`);

  // Light
  const light = metrics.lightIntensity;
  const lightColor = light.avg > 40000 ? colors.yellow : colors.green;
  console.log(`  ☀️  ${colors.bright}Luz:${colors.reset}          ${lightColor}${Math.round(light.avg)} lux${colors.reset} (min: ${Math.round(light.min)}, max: ${Math.round(light.max)})`);

  console.log(colors.blue + "└─────────────────────────────────────────────────────────┘" + colors.reset);
}

async function printAlerts() {
  console.log(colors.magenta + colors.bright + "\n╔═══ ALERTAS RECIENTES (ÚLTIMAS 24H) ═══════════════════════╗" + colors.reset);

  let totalAlerts = 0;

  for (const zone of ZONES) {
    const alerts = await getRecentAlerts(zone, 2);

    for (const alert of alerts) {
      totalAlerts++;
      const severityColor = alert.severity === 'HIGH' ? colors.red :
                           alert.severity === 'MEDIUM' ? colors.yellow : colors.green;

      console.log(`  ${severityColor}[${alert.severity}]${colors.reset} Zona ${zone} - ${alert.alertType}`);
      console.log(`       ${alert.message}`);
      if (alert.actionTaken) {
        console.log(`       ${colors.cyan}→ Acción: ${alert.actionTaken}${colors.reset}`);
      }
      console.log(`       ${colors.blue}${formatTimestamp(alert.timestamp)}${colors.reset}`);
      console.log("");
    }
  }

  if (totalAlerts === 0) {
    console.log(colors.green + "  ✓ Sin alertas. Sistema operando normalmente." + colors.reset);
  }

  console.log(colors.magenta + "╚═══════════════════════════════════════════════════════════╝" + colors.reset);
}

async function refresh() {
  clearScreen();
  printHeader();

  console.log(colors.cyan + `Invernadero: ${GREENHOUSE_ID}` + colors.reset);
  console.log(colors.cyan + `Región: us-east-1` + colors.reset);
  console.log(colors.cyan + `Tabla: GreenhouseState` + colors.reset);

  // Get current state for all zones
  for (const zone of ZONES) {
    const state = await getCurrentState(zone);
    printZoneStatus(zone, state);
  }

  // Print alerts
  await printAlerts();

  console.log("");
  console.log(colors.blue + "Actualizando cada 10 segundos... (Ctrl+C para salir)" + colors.reset);
}

// Main loop
async function main() {
  console.log("Conectando a AWS DynamoDB...\n");

  // Initial refresh
  await refresh();

  // Auto-refresh every 10 seconds
  setInterval(async () => {
    await refresh();
  }, 10000);
}

// Error handling
process.on('unhandledRejection', (err) => {
  console.error(colors.red + "\nError: " + err.message + colors.reset);
  console.error("Verifica que AWS CLI esté configurado correctamente.");
  process.exit(1);
});

// Run
main();
