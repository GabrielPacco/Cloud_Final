/**
 * Buffer - Local persistence for offline/retry scenarios
 */

const Database = require('better-sqlite3');
const path = require('path');

class EventBuffer {
  constructor(config) {
    this.config = config;
    this.maxRetries = config.buffer.maxRetries;
    this.retryDelays = config.buffer.retryDelayMs;
    this.maxBufferSize = config.buffer.maxBufferSize;

    // Initialize SQLite database
    const dbPath = path.join(__dirname, '..', 'buffer.db');
    this.db = new Database(dbPath);

    this.initDatabase();
  }

  /**
   * Initialize database schema
   */
  initDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        retry_count INTEGER DEFAULT 0,
        next_retry_at INTEGER,
        last_error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_next_retry ON events(next_retry_at);
    `);

    console.log('[Buffer] Database initialized');
  }

  /**
   * Add event to buffer
   */
  add(eventType, payload) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO events (event_type, payload, created_at, next_retry_at)
        VALUES (?, ?, ?, ?)
      `);

      const now = Date.now();
      stmt.run(eventType, JSON.stringify(payload), now, now);

      const count = this.count();
      if (count > this.maxBufferSize) {
        console.warn(`[Buffer] Buffer size ${count} exceeds max ${this.maxBufferSize}, deleting oldest`);
        this.deleteOldest(count - this.maxBufferSize);
      }

      return true;
    } catch (err) {
      console.error('[Buffer] Error adding event:', err);
      return false;
    }
  }

  /**
   * Get events ready for retry
   */
  getReadyEvents(limit = 100) {
    try {
      const stmt = this.db.prepare(`
        SELECT id, event_type, payload, retry_count
        FROM events
        WHERE next_retry_at <= ?
        ORDER BY created_at ASC
        LIMIT ?
      `);

      const now = Date.now();
      const rows = stmt.all(now, limit);

      return rows.map(row => ({
        id: row.id,
        eventType: row.event_type,
        payload: JSON.parse(row.payload),
        retryCount: row.retry_count
      }));
    } catch (err) {
      console.error('[Buffer] Error getting ready events:', err);
      return [];
    }
  }

  /**
   * Mark event as successfully sent (delete from buffer)
   */
  markSuccess(eventId) {
    try {
      const stmt = this.db.prepare('DELETE FROM events WHERE id = ?');
      stmt.run(eventId);
      return true;
    } catch (err) {
      console.error('[Buffer] Error marking success:', err);
      return false;
    }
  }

  /**
   * Mark event as failed (increment retry count, schedule next retry)
   */
  markFailed(eventId, error) {
    try {
      const stmt = this.db.prepare(`
        UPDATE events
        SET retry_count = retry_count + 1,
            next_retry_at = ?,
            last_error = ?
        WHERE id = ?
      `);

      // Get current retry count
      const event = this.db.prepare('SELECT retry_count FROM events WHERE id = ?').get(eventId);
      if (!event) return false;

      const retryCount = event.retry_count;

      if (retryCount >= this.maxRetries) {
        // Max retries reached, delete event
        console.error(`[Buffer] Event ${eventId} exceeded max retries, deleting`);
        this.db.prepare('DELETE FROM events WHERE id = ?').run(eventId);
        return false;
      }

      // Calculate next retry time with exponential backoff
      const delay = this.retryDelays[Math.min(retryCount, this.retryDelays.length - 1)];
      const nextRetryAt = Date.now() + delay;

      stmt.run(nextRetryAt, error, eventId);
      return true;
    } catch (err) {
      console.error('[Buffer] Error marking failed:', err);
      return false;
    }
  }

  /**
   * Get buffer statistics
   */
  getStats() {
    try {
      const count = this.count();
      const oldest = this.db.prepare('SELECT MIN(created_at) as oldest FROM events').get();
      const byType = this.db.prepare(`
        SELECT event_type, COUNT(*) as count
        FROM events
        GROUP BY event_type
      `).all();

      return {
        total: count,
        oldestTimestamp: oldest.oldest,
        byType: byType.reduce((acc, row) => {
          acc[row.event_type] = row.count;
          return acc;
        }, {})
      };
    } catch (err) {
      console.error('[Buffer] Error getting stats:', err);
      return { total: 0, byType: {} };
    }
  }

  /**
   * Count total events in buffer
   */
  count() {
    try {
      const result = this.db.prepare('SELECT COUNT(*) as count FROM events').get();
      return result.count;
    } catch (err) {
      console.error('[Buffer] Error counting events:', err);
      return 0;
    }
  }

  /**
   * Delete oldest events
   */
  deleteOldest(n) {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM events
        WHERE id IN (
          SELECT id FROM events
          ORDER BY created_at ASC
          LIMIT ?
        )
      `);
      stmt.run(n);
    } catch (err) {
      console.error('[Buffer] Error deleting oldest:', err);
    }
  }

  /**
   * Clear all events (for testing)
   */
  clear() {
    try {
      this.db.prepare('DELETE FROM events').run();
      console.log('[Buffer] Cleared all events');
    } catch (err) {
      console.error('[Buffer] Error clearing:', err);
    }
  }

  /**
   * Close database
   */
  close() {
    this.db.close();
    console.log('[Buffer] Database closed');
  }
}

module.exports = EventBuffer;
