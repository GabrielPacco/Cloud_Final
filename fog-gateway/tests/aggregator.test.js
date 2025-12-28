/**
 * Unit tests for Aggregator
 */

const Aggregator = require('../src/aggregator');

describe('Aggregator', () => {
  let aggregator;
  const mockConfig = {
    greenhouseId: 'TEST01',
    zones: ['A', 'B', 'C']
  };

  beforeEach(() => {
    aggregator = new Aggregator(mockConfig, 120); // 120 seconds window
  });

  afterEach(() => {
    if (aggregator) {
      aggregator.stop();
    }
  });

  test('should initialize with correct window duration', () => {
    expect(aggregator.windowDurationSec).toBe(120);
  });

  test('should add readings to window', () => {
    const reading = {
      zone: 'A',
      metric: 'temperature',
      value: 24.5,
      timestamp: new Date().toISOString()
    };

    aggregator.addReading(reading);

    const window = aggregator.windows.get('A');
    expect(window).toBeDefined();
    expect(window.metrics.has('temperature')).toBe(true);

    const stats = window.metrics.get('temperature');
    expect(stats.count).toBe(1);
    expect(stats.sum).toBe(24.5);
    expect(stats.min).toBe(24.5);
    expect(stats.max).toBe(24.5);
  });

  test('should update statistics correctly with multiple readings', () => {
    const readings = [
      { zone: 'A', metric: 'temperature', value: 20, timestamp: new Date().toISOString() },
      { zone: 'A', metric: 'temperature', value: 25, timestamp: new Date().toISOString() },
      { zone: 'A', metric: 'temperature', value: 30, timestamp: new Date().toISOString() }
    ];

    readings.forEach(r => aggregator.addReading(r));

    const window = aggregator.windows.get('A');
    const stats = window.metrics.get('temperature');

    expect(stats.count).toBe(3);
    expect(stats.sum).toBe(75);
    expect(stats.min).toBe(20);
    expect(stats.max).toBe(30);
  });

  test('should calculate average correctly', () => {
    const readings = [
      { zone: 'B', metric: 'humidity', value: 60, timestamp: new Date().toISOString() },
      { zone: 'B', metric: 'humidity', value: 70, timestamp: new Date().toISOString() },
      { zone: 'B', metric: 'humidity', value: 80, timestamp: new Date().toISOString() }
    ];

    readings.forEach(r => aggregator.addReading(r));

    const window = aggregator.windows.get('B');
    const stats = window.metrics.get('humidity');

    const avg = stats.sum / stats.count;
    expect(avg).toBe(70); // (60 + 70 + 80) / 3 = 70
  });

  test('should emit aggregate events when publishing', (done) => {
    const readings = [
      { zone: 'A', metric: 'temperature', value: 24, timestamp: new Date().toISOString() },
      { zone: 'A', metric: 'humidity', value: 65, timestamp: new Date().toISOString() }
    ];

    readings.forEach(r => aggregator.addReading(r));

    let eventCount = 0;

    aggregator.on('aggregate', (data) => {
      expect(data).toHaveProperty('eventType', 'AGGREGATE');
      expect(data).toHaveProperty('greenhouseId', 'TEST01');
      expect(data).toHaveProperty('zone');
      expect(data).toHaveProperty('metrics');
      expect(data).toHaveProperty('windowDurationSec', 120);

      eventCount++;
      if (eventCount === 1) {
        done();
      }
    });

    aggregator.publishWindows();
  });

  test('should clear windows after publishing', () => {
    const reading = {
      zone: 'A',
      metric: 'temperature',
      value: 24.5,
      timestamp: new Date().toISOString()
    };

    aggregator.addReading(reading);
    expect(aggregator.windows.get('A')).toBeDefined();

    aggregator.publishWindows();

    // Window should be cleared after publish
    const window = aggregator.windows.get('A');
    expect(window.metrics.get('temperature').count).toBe(0);
  });

  test('should handle multiple zones independently', () => {
    aggregator.addReading({
      zone: 'A',
      metric: 'temperature',
      value: 20,
      timestamp: new Date().toISOString()
    });

    aggregator.addReading({
      zone: 'B',
      metric: 'temperature',
      value: 30,
      timestamp: new Date().toISOString()
    });

    const windowA = aggregator.windows.get('A');
    const windowB = aggregator.windows.get('B');

    expect(windowA.metrics.get('temperature').min).toBe(20);
    expect(windowB.metrics.get('temperature').min).toBe(30);
  });

  test('should track first and last reading timestamps', () => {
    const timestamp1 = new Date('2025-01-01T10:00:00Z').toISOString();
    const timestamp2 = new Date('2025-01-01T10:05:00Z').toISOString();

    aggregator.addReading({
      zone: 'A',
      metric: 'temperature',
      value: 20,
      timestamp: timestamp1
    });

    aggregator.addReading({
      zone: 'A',
      metric: 'temperature',
      value: 25,
      timestamp: timestamp2
    });

    const window = aggregator.windows.get('A');

    expect(window.firstReading).toBe(timestamp1);
    expect(window.lastReading).toBe(timestamp2);
  });

  test('should round aggregate values to 1 decimal place', (done) => {
    aggregator.addReading({
      zone: 'A',
      metric: 'temperature',
      value: 24.123456,
      timestamp: new Date().toISOString()
    });

    aggregator.on('aggregate', (data) => {
      const tempAvg = data.metrics.temperature.avg;
      // Should be rounded to 1 decimal
      expect(tempAvg.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(1);
      done();
    });

    aggregator.publishWindows();
  });
});
