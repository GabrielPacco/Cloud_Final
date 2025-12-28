/**
 * Panel de Control Invernadero Inteligente - Aplicación Frontend
 */

// Configuración
const CONFIG_KEY = 'greenhouse-api-url';
let API_BASE_URL = localStorage.getItem(CONFIG_KEY);

// DOM Elements
const zonesContainer = document.getElementById('zones-container');
const alertsContainer = document.getElementById('alerts-container');
const apiStatus = document.getElementById('api-status');
const lastUpdate = document.getElementById('last-update');
const refreshBtn = document.getElementById('refresh-btn');
const configModal = document.getElementById('config-modal');
const apiUrlInput = document.getElementById('api-url-input');
const saveConfigBtn = document.getElementById('save-config-btn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  if (!API_BASE_URL) {
    showConfigModal();
  } else {
    loadData();
  }

  // Event listeners
  refreshBtn.addEventListener('click', loadData);
  saveConfigBtn.addEventListener('click', saveConfig);

  // Auto-refresh every 30 seconds
  setInterval(loadData, 30000);
});

/**
 * Mostrar modal de configuración
 */
function showConfigModal() {
  configModal.classList.add('show');
  apiUrlInput.value = API_BASE_URL || '';
}

/**
 * Guardar configuración de URL de API
 */
function saveConfig() {
  const url = apiUrlInput.value.trim();
  if (!url) {
    alert('Por favor ingresa una URL válida');
    return;
  }

  localStorage.setItem(CONFIG_KEY, url);
  API_BASE_URL = url;
  configModal.classList.remove('show');
  loadData();
}

/**
 * Cargar todos los datos
 */
async function loadData() {
  if (!API_BASE_URL) {
    showConfigModal();
    return;
  }

  try {
    apiStatus.textContent = 'Conectando...';
    apiStatus.style.color = '#ffc107';

    // Load zones and alerts in parallel
    await Promise.all([
      loadZones(),
      loadAlerts()
    ]);

    apiStatus.textContent = 'Conectado ✓';
    apiStatus.style.color = '#28a745';
    lastUpdate.textContent = new Date().toLocaleTimeString('es-ES');
  } catch (error) {
    console.error('Error al cargar datos:', error);
    apiStatus.textContent = 'Error de conexión ✗';
    apiStatus.style.color = '#dc3545';

    // Mostrar mensaje de error
    zonesContainer.innerHTML = `
      <div class="error">
        <strong>Error al cargar datos</strong><br>
        ${error.message}<br><br>
        <button onclick="showConfigModal()" class="btn-primary">Configurar API</button>
      </div>
    `;
  }
}

/**
 * Cargar datos de zonas
 */
async function loadZones() {
  const response = await fetch(`${API_BASE_URL}/zones`);

  if (!response.ok) {
    throw new Error(`Error de servidor: ${response.status}`);
  }

  const data = await response.json();
  renderZones(data.zones);
}

/**
 * Cargar datos de alertas
 */
async function loadAlerts() {
  const response = await fetch(`${API_BASE_URL}/alerts`);

  if (!response.ok) {
    throw new Error(`Error de servidor: ${response.status}`);
  }

  const data = await response.json();
  renderAlerts(data.alerts);
}

/**
 * Renderizar tarjetas de zonas
 */
function renderZones(zones) {
  if (!zones || zones.length === 0) {
    zonesContainer.innerHTML = '<div class="loading">No hay datos disponibles</div>';
    return;
  }

  zonesContainer.innerHTML = zones.map(zone => {
    const hasData = zone.metrics && Object.keys(zone.metrics).length > 0;

    if (!hasData) {
      return `
        <div class="zone-card">
          <div class="zone-header">
            <div class="zone-name">Zona ${zone.zone}</div>
            <div class="zone-status no-data">Sin datos</div>
          </div>
          <p style="color: #6c757d; text-align: center; padding: 20px;">
            No hay lecturas disponibles para esta zona
          </p>
        </div>
      `;
    }

    const metrics = zone.metrics;

    return `
      <div class="zone-card">
        <div class="zone-header">
          <div class="zone-name">Zona ${zone.zone}</div>
          <div class="zone-status active">Activa</div>
        </div>
        <div class="metrics">
          ${metrics.temperature ? `
            <div class="metric">
              <div class="metric-label">
                <span class="metric-icon">🌡️</span> Temperatura
              </div>
              <div class="metric-value">${metrics.temperature.avg}°C</div>
              <div style="font-size: 0.75rem; color: #6c757d;">
                Min: ${metrics.temperature.min}°C | Max: ${metrics.temperature.max}°C
              </div>
            </div>
          ` : ''}

          ${metrics.humidity ? `
            <div class="metric">
              <div class="metric-label">
                <span class="metric-icon">💧</span> Humedad
              </div>
              <div class="metric-value">${metrics.humidity.avg}%</div>
              <div style="font-size: 0.75rem; color: #6c757d;">
                Min: ${metrics.humidity.min}% | Max: ${metrics.humidity.max}%
              </div>
            </div>
          ` : ''}

          ${metrics.soilMoisture ? `
            <div class="metric">
              <div class="metric-label">
                <span class="metric-icon">🌱</span> Suelo
              </div>
              <div class="metric-value">${metrics.soilMoisture.avg}%</div>
              <div style="font-size: 0.75rem; color: #6c757d;">
                Min: ${metrics.soilMoisture.min}% | Max: ${metrics.soilMoisture.max}%
              </div>
            </div>
          ` : ''}

          ${metrics.lightIntensity ? `
            <div class="metric">
              <div class="metric-label">
                <span class="metric-icon">☀️</span> Luz
              </div>
              <div class="metric-value">${Math.round(metrics.lightIntensity.avg)}</div>
              <div style="font-size: 0.75rem; color: #6c757d;">
                lux (${metrics.lightIntensity.count} lecturas)
              </div>
            </div>
          ` : ''}
        </div>
        <div style="margin-top: 15px; font-size: 0.8rem; color: #6c757d; text-align: center;">
          Actualizado: ${zone.timestamp ? new Date(zone.timestamp).toLocaleTimeString('es-ES') : '-'}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Renderizar lista de alertas
 */
function renderAlerts(alerts) {
  if (!alerts || alerts.length === 0) {
    alertsContainer.innerHTML = '<div class="loading">No hay alertas recientes</div>';
    return;
  }

  // Ordenar por timestamp descendente
  const sortedAlerts = alerts.sort((a, b) =>
    new Date(b.timestamp) - new Date(a.timestamp)
  );

  // Tomar solo los primeros 10
  const recentAlerts = sortedAlerts.slice(0, 10);

  alertsContainer.innerHTML = recentAlerts.map(alert => `
    <div class="alert-card ${alert.severity}">
      <div class="alert-header">
        <div>
          <strong>Zona ${alert.zone}</strong> - ${alert.metric || 'General'}
        </div>
        <div class="alert-severity ${alert.severity}">${alert.severity}</div>
      </div>
      <div class="alert-message">${alert.message}</div>
      <div class="alert-meta">
        <span>🕐 ${new Date(alert.timestamp).toLocaleString('es-ES')}</span>
        ${alert.actionTaken ? `<span>⚙️ Acción: ${alert.actionTaken}</span>` : ''}
        ${alert.value !== undefined ? `<span>📊 Valor: ${alert.value}</span>` : ''}
      </div>
    </div>
  `).join('');
}

/**
 * Formatear timestamp a tiempo relativo
 */
function formatRelativeTime(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Ahora mismo';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Hace ${diffDays}d`;
}

// Hacer showConfigModal disponible globalmente
window.showConfigModal = showConfigModal;
