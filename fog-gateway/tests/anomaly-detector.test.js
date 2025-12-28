/**
 * Unit tests for Anomaly Detector
 */

const AnomalyDetector = require('../src/anomaly-detector');

describe('AnomalyDetector', () => {
  let detector;
  const mockConfig = {
    greenhouseId: 'TEST01',
    anomalyRules: {
      temperature: {
        thresholdHigh: 32,
        thresholdHighSustained: { value: 30, readings: 3 },
        thresholdLow: 18,
        actions: { high: 'fan=ON', low: 'heater=ON' }
      },
      soilMoisture: {
        thresholdLow: 30,
        actions: { low: 'irrigation=ON' }
      }
    }
  };

  beforeEach(() => {
    detector = new AnomalyDetector(mockConfig);
  });

  test('should initialize with correct configuration', () => {
    expect(detector.config).toBe(mockConfig);
    expect(detector.history.size).toBe(0);
  });

  test('should detect THRESHOLD_HIGH anomaly', (done) => {
    const reading = {
      zone: 'A',
      metric: 'temperature',
      value: 35, // Above threshold of 32
      timestamp: new Date().toISOString()
    };

    detector.on('anomaly', (alert) => {
      expect(alert.alertType).toBe('THRESHOLD_HIGH');
      expect(alert.severity).toBe('MEDIUM');
      expect(alert.metric).toBe('temperature');
      expect(alert.value).toBe(35);
      expect(alert.action).toBe('fan=ON');
      done();
    });

    detector.check(reading);
  });

  test('should detect THRESHOLD_LOW anomaly', (done) => {
    const reading = {
      zone: 'A',
      metric: 'temperature',
      value: 15, // Below threshold of 18
      timestamp: new Date().toISOString()
    };

    detector.on('anomaly', (alert) => {
      expect(alert.alertType).toBe('THRESHOLD_LOW');
      expect(alert.severity).toBe('MEDIUM');
      expect(alert.action).toBe('heater=ON');
      done();
    });

    detector.check(reading);
  });

  test('should detect THRESHOLD_HIGH_SUSTAINED after multiple readings', (done) => {
    const baseTime = Date.now();
    let alertCount = 0;

    detector.on('anomaly', (alert) => {
      if (alert.alertType === 'THRESHOLD_HIGH_SUSTAINED') {
        expect(alert.severity).toBe('HIGH');
        expect(alert.duration).toBeGreaterThan(0);
        done();
      }
      alertCount++;
    });

    // Send 3 high readings (sustained threshold)
    for (let i = 0; i < 3; i++) {
      detector.check({
        zone: 'A',
        metric: 'temperature',
        value: 31, // Above sustained threshold of 30
        timestamp: new Date(baseTime + i * 5000).toISOString()
      });
    }
  });

  test('should detect SENSOR_STUCK when value repeats', (done) => {
    const baseTime = Date.now();
    let stuckDetected = false;

    detector.on('anomaly', (alert) => {
      if (alert.alertType === 'SENSOR_STUCK') {
        stuckDetected = true;
        expect(alert.severity).toBe('HIGH');
        expect(alert.value).toBe(25);
        done();
      }
    });

    // Send 6 identical readings
    for (let i = 0; i < 6; i++) {
      detector.check({
        zone: 'B',
        metric: 'humidity',
        value: 25,
        timestamp: new Date(baseTime + i * 5000).toISOString()
      });
    }

    if (!stuckDetected) {
      setTimeout(() => {
        if (!stuckDetected) {
          done(new Error('SENSOR_STUCK not detected'));
        }
      }, 1000);
    }
  });

  test('should not detect stuck sensor with varying values', () => {
    const baseTime = Date.now();
    let stuckAlertEmitted = false;

    detector.on('anomaly', (alert) => {
      if (alert.alertType === 'SENSOR_STUCK') {
        stuckAlertEmitted = true;
      }
    });

    // Send different values
    const values = [25, 26, 25, 27, 25];
    values.forEach((value, i) => {
      detector.check({
        zone: 'B',
        metric: 'humidity',
        value,
        timestamp: new Date(baseTime + i * 5000).toISOString()
      });
    });

    expect(stuckAlertEmitted).toBe(false);
  });

  test('should track history by zone and metric', () => {
    detector.check({
      zone: 'A',
      metric: 'temperature',
      value: 24,
      timestamp: new Date().toISOString()
    });

    detector.check({
      zone: 'B',
      metric: 'temperature',
      value: 26,
      timestamp: new Date().toISOString()
    });

    expect(detector.history.has('A-temperature')).toBe(true);
    expect(detector.history.has('B-temperature')).toBe(true);
  });

  test('should limit history to maxHistory length', () => {
    const baseTime = Date.now();

    // Add more than maxHistory (10) readings
    for (let i = 0; i < 15; i++) {
      detector.check({
        zone: 'A',
        metric: 'temperature',
        value: 20 + i,
        timestamp: new Date(baseTime + i * 1000).toISOString()
      });
    }

    const history = detector.history.get('A-temperature');
    expect(history.length).toBeLessThanOrEqual(detector.maxHistory);
  });

  test('should not detect anomaly for normal readings', () => {
    let anomalyEmitted = false;

    detector.on('anomaly', () => {
      anomalyEmitted = true;
    });

    detector.check({
      zone: 'A',
      metric: 'temperature',
      value: 24, // Normal value
      timestamp: new Date().toISOString()
    });

    expect(anomalyEmitted).toBe(false);
  });

  test('should calculate duration correctly for sustained alerts', (done) => {
    const baseTime = Date.now();

    detector.on('anomaly', (alert) => {
      if (alert.alertType === 'THRESHOLD_HIGH_SUSTAINED') {
        expect(alert.duration).toBeGreaterThan(0);
        expect(typeof alert.duration).toBe('number');
        done();
      }
    });

    for (let i = 0; i < 3; i++) {
      detector.check({
        zone: 'A',
        metric: 'temperature',
        value: 31,
        timestamp: new Date(baseTime + i * 5000).toISOString()
      });
    }
  });

  test('should handle metrics without rules gracefully', () => {
    let errorThrown = false;

    try {
      detector.check({
        zone: 'A',
        metric: 'unknownMetric',
        value: 100,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      errorThrown = true;
    }

    expect(errorThrown).toBe(false);
  });
});
