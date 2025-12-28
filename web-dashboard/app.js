/**
 * Panel de Control Invernadero Inteligente - Aplicación Frontend
 */

// Configuración
const CONFIG_KEY = 'greenhouse-api-url';
const THEME_KEY = 'greenhouse-theme';
let API_BASE_URL = localStorage.getItem(CONFIG_KEY);
let currentAlerts = [];
let currentFilter = 'ALL';

// DOM Elements
const zonesContainer = document.getElementById('zones-container');
const alertsContainer = document.getElementById('alerts-container');
const apiStatus = document.getElementById('api-status');
const lastUpdate = document.getElementById('last-update');
const activeZones = document.getElementById('active-zones');
const alertCount = document.getElementById('alert-count');
const refreshBtn = document.getElementById('refresh-btn');
const configModal = document.getElementById('config-modal');
const apiUrlInput = document.getElementById('api-url-input');
const saveConfigBtn = document.getElementById('save-config-btn');
const themeToggle = document.getElementById('theme-toggle');
const configBtn = document.getElementById('config-btn');
const closeModalBtn = document.querySelector('.close-modal');

// Statistics elements
const avgTemp = document.getElementById('avg-temp');
const avgHumidity = document.getElementById('avg-humidity');
const avgSoil = document.getElementById('avg-soil');
const avgLight = document.getElementById('avg-light');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Initialize theme
  initTheme();

  if (!API_BASE_URL) {
    showConfigModal();
  } else {
    loadData();
  }

  // Event listeners
  refreshBtn.addEventListener('click', loadData);
  saveConfigBtn.addEventListener('click', saveConfig);
  themeToggle.addEventListener('click', toggleTheme);
  configBtn.addEventListener('click', showConfigModal);
  closeModalBtn.addEventListener('click', hideConfigModal);

  // Alert filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      currentFilter = e.target.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      renderAlerts(currentAlerts);
    });
  });

  // Auto-refresh every 30 seconds
  setInterval(loadData, 30000);
});

/**
 * Inicializar tema
 */
function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
  document.body.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

/**
 * Toggle tema claro/oscuro
 */
function toggleTheme() {
  const currentTheme = document.body.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.body.setAttribute('data-theme', newTheme);
  localStorage.setItem(THEME_KEY, newTheme);
  updateThemeIcon(newTheme);
  showToast(`Tema ${newTheme === 'dark' ? 'oscuro' : 'claro'} activado`, 'info');
}

/**
 * Actualizar icono de tema
 */
function updateThemeIcon(theme) {
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌓';
  themeToggle.title = theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
}

/**
 * Mostrar modal de configuración
 */
function showConfigModal() {
  configModal.classList.add('show');
  apiUrlInput.value = API_BASE_URL || '';
  apiUrlInput.focus();
}

/**
 * Ocultar modal de configuración
 */
function hideConfigModal() {
  configModal.classList.remove('show');
}

/**
 * Guardar configuración de URL de API
 */
function saveConfig() {
  const url = apiUrlInput.value.trim();
  if (!url) {
    showToast('Por favor ingresa una URL válida', 'error');
    return;
  }

  // Validar formato básico de URL
  try {
    new URL(url);
  } catch {
    showToast('El formato de la URL no es válido', 'error');
    return;
  }

  localStorage.setItem(CONFIG_KEY, url);
  API_BASE_URL = url;
  hideConfigModal();
  showToast('Configuración guardada correctamente', 'success');
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
    refreshBtn.disabled = true;
    refreshBtn.style.opacity = '0.6';

    // Load zones and alerts in parallel
    const [zonesData, alertsData] = await Promise.all([
      loadZones(),
      loadAlerts()
    ]);

    // Update statistics
    updateStatistics(zonesData);

    // Update status bar
    apiStatus.textContent = 'Conectado ✓';
    apiStatus.style.color = '#28a745';
    lastUpdate.textContent = new Date().toLocaleTimeString('es-ES');

    // Count active zones
    const activeZonesCount = zonesData.filter(z =>
      z.metrics && Object.keys(z.metrics).length > 0
    ).length;
    activeZones.textContent = `${activeZonesCount}/${zonesData.length}`;

    // Count active alerts
    const activeAlertsCount = alertsData.filter(a =>
      a.severity === 'HIGH' || a.severity === 'MEDIUM'
    ).length;
    alertCount.textContent = activeAlertsCount;
    alertCount.style.color = activeAlertsCount > 0 ? '#dc3545' : '#28a745';

    refreshBtn.disabled = false;
    refreshBtn.style.opacity = '1';

  } catch (error) {
    console.error('Error al cargar datos:', error);
    apiStatus.textContent = 'Error de conexión ✗';
    apiStatus.style.color = '#dc3545';
    activeZones.textContent = '-';
    alertCount.textContent = '-';

    // Mostrar mensaje de error
    zonesContainer.innerHTML = `
      <div class="error">
        <strong>❌ Error al cargar datos</strong><br>
        ${error.message}<br><br>
        <button onclick="showConfigModal()" class="btn-primary">Configurar API</button>
      </div>
    `;

    showToast('Error al cargar datos del servidor', 'error');

    refreshBtn.disabled = false;
    refreshBtn.style.opacity = '1';
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
  return data.zones;
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
  currentAlerts = data.alerts;
  renderAlerts(currentAlerts);
  return data.alerts;
}

/**
 * Actualizar estadísticas generales
 */
function updateStatistics(zones) {
  const stats = {
    temperature: [],
    humidity: [],
    soilMoisture: [],
    lightIntensity: []
  };

  // Recopilar todos los valores promedio
  zones.forEach(zone => {
    if (zone.metrics) {
      if (zone.metrics.temperature) stats.temperature.push(zone.metrics.temperature.avg);
      if (zone.metrics.humidity) stats.humidity.push(zone.metrics.humidity.avg);
      if (zone.metrics.soilMoisture) stats.soilMoisture.push(zone.metrics.soilMoisture.avg);
      if (zone.metrics.lightIntensity) stats.lightIntensity.push(zone.metrics.lightIntensity.avg);
    }
  });

  // Calcular promedios
  avgTemp.textContent = stats.temperature.length > 0
    ? `${calculateAverage(stats.temperature)}°C`
    : '--°C';

  avgHumidity.textContent = stats.humidity.length > 0
    ? `${calculateAverage(stats.humidity)}%`
    : '--%';

  avgSoil.textContent = stats.soilMoisture.length > 0
    ? `${calculateAverage(stats.soilMoisture)}%`
    : '--%';

  avgLight.textContent = stats.lightIntensity.length > 0
    ? `${Math.round(calculateAverage(stats.lightIntensity))} lux`
    : '-- lux';
}

/**
 * Calcular promedio de un array
 */
function calculateAverage(values) {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return (sum / values.length).toFixed(1);
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
              <div class="metric-range">
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
              <div class="metric-range">
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
              <div class="metric-range">
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
              <div class="metric-range">
                lux (${metrics.lightIntensity.count} lecturas)
              </div>
            </div>
          ` : ''}
        </div>
        <div class="zone-timestamp">
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

  // Filtrar alertas según filtro activo
  let filteredAlerts = alerts;
  if (currentFilter !== 'ALL') {
    filteredAlerts = alerts.filter(alert => alert.severity === currentFilter);
  }

  if (filteredAlerts.length === 0) {
    alertsContainer.innerHTML = `<div class="loading">No hay alertas de tipo ${currentFilter}</div>`;
    return;
  }

  // Ordenar por timestamp descendente
  const sortedAlerts = filteredAlerts.sort((a, b) =>
    new Date(b.timestamp) - new Date(a.timestamp)
  );

  // Tomar solo los primeros 20
  const recentAlerts = sortedAlerts.slice(0, 20);

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
 * Mostrar toast notification
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = {
    success: '✓',
    error: '✗',
    info: 'ℹ',
    warning: '⚠'
  }[type] || 'ℹ';

  toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;

  const container = document.getElementById('toast-container');
  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);

  // Auto remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
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

// Hacer funciones disponibles globalmente
window.showConfigModal = showConfigModal;
window.hideConfigModal = hideConfigModal;
