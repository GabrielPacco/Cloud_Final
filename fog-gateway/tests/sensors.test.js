/**
 * Unit tests for Sensor Simulator
 */

const SensorSimulator = require('../src/sensors');

describe('SensorSimulator', () => {
  let simulator;
  const mockConfig = {
    greenhouseId: 'TEST01',
    zones: ['A', 'B'],
    sensors: {
      temperature: { min: 15, max: 35, normal: 24, unit: 'celsius' },
      humidity: { min: 40, max: 90, normal: 65, unit: 'percent' }
    }
  };

  beforeEach(() => {
    simulator = new SensorSimulator(mockConfig, 1000); // 1 second interval for tests
  });

  afterEach(() => {
    if (simulator) {
      simulator.stop();
    }
  });

  test('should initialize with correct configuration', () => {
    expect(simulator.config).toBe(mockConfig);
    expect(simulator.intervalMs).toBe(1000);
  });

  test('should generate readings within valid range', () => {
    const reading = simulator.generateReading(mockConfig.sensors.temperature, 'A');

    expect(reading).toBeGreaterThanOrEqual(mockConfig.sensors.temperature.min);
    expect(reading).toBeLessThanOrEqual(mockConfig.sensors.temperature.max);
  });

  test('should generate different readings for different zones', () => {
    const readingA1 = simulator.generateReading(mockConfig.sensors.temperature, 'A');
    const readingA2 = simulator.generateReading(mockConfig.sensors.temperature, 'A');
    const readingB = simulator.generateReading(mockConfig.sensors.temperature, 'B');

    // Readings from same zone should be similar (Brownian motion)
    expect(Math.abs(readingA2 - readingA1)).toBeLessThan(5);

    // Different zones might have different values
    expect(readingB).toBeGreaterThanOrEqual(mockConfig.sensors.temperature.min);
  });

  test('should emit sensor-reading events', (done) => {
    let eventCount = 0;

    simulator.on('sensor-reading', (data) => {
      expect(data).toHaveProperty('greenhouseId', 'TEST01');
      expect(data).toHaveProperty('zone');
      expect(data).toHaveProperty('metric');
      expect(data).toHaveProperty('value');
      expect(data).toHaveProperty('timestamp');
      expect(['A', 'B']).toContain(data.zone);

      eventCount++;
      if (eventCount >= 2) {
        simulator.stop();
        done();
      }
    });

    simulator.start();
  }, 5000);

  test('should handle anomaly injection', () => {
    const originalValue = simulator.generateReading(mockConfig.sensors.temperature, 'A');

    simulator.injectAnomaly('A', 'temperature', 100);
    const anomalyValue = simulator.generateReading(mockConfig.sensors.temperature, 'A');

    expect(anomalyValue).toBe(100);
    expect(anomalyValue).not.toBe(originalValue);
  });

  test('should stop generating readings when stopped', (done) => {
    let eventCount = 0;

    simulator.on('sensor-reading', () => {
      eventCount++;
    });

    simulator.start();

    setTimeout(() => {
      simulator.stop();
      const countAtStop = eventCount;

      setTimeout(() => {
        // Count should not increase after stop
        expect(eventCount).toBe(countAtStop);
        done();
      }, 2000);
    }, 1500);
  }, 5000);

  test('should clamp values to min/max range', () => {
    // Force a value outside range
    const metric = mockConfig.sensors.temperature;
    simulator.readings.set('A-temperature', metric.max + 10);

    const reading = simulator.generateReading(metric, 'A');

    expect(reading).toBeLessThanOrEqual(metric.max);
    expect(reading).toBeGreaterThanOrEqual(metric.min);
  });
});
