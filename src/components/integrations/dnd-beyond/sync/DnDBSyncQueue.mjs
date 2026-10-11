/**
 * Per-key debounce queue for D&D Beyond writes. A flush runs after a quiet period with no new
 * changes, or after a maximum wait while changes keep arriving. Only one flush per key runs at a
 * time; changes arriving during a flush schedule another one.
 */
export class DnDBSyncQueue {

  /**
   * @param {Object} options
   * @param {(key: string) => Promise<void>} options.flush - Sends the pending changes for a key
   * @param {number} [options.quietMs=3000] - Wait after the last change before flushing
   * @param {number} [options.maxWaitMs=15000] - Longest a change may wait while changes keep coming
   * @param {{setTimeout: Function, clearTimeout: Function, now: Function}} [options.clock] - Timer functions, replaceable in tests
   */
  constructor({ flush, quietMs = 3000, maxWaitMs = 15000, clock = null }) {
    this._flushFn = flush;
    this.quietMs = quietMs;
    this.maxWaitMs = maxWaitMs;
    this._clock = clock ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: id => clearTimeout(id),
      now: () => Date.now()
    };
    this._entries = new Map();
  }

  /**
   * Record a change for a key and (re)start its quiet timer
   * @param {string} key - Usually an actor id
   */
  touch(key) {
    const now = this._clock.now();
    let entry = this._entries.get(key);
    if (!entry) {
      entry = { firstAt: now, timer: null, running: false, dirty: false };
      this._entries.set(key, entry);
    }
    if (entry.running) {
      entry.dirty = true;
      return;
    }
    entry.firstAt ??= now;
    if (entry.timer) this._clock.clearTimeout(entry.timer);
    const remainingMax = Math.max(0, entry.firstAt + this.maxWaitMs - now);
    entry.timer = this._clock.setTimeout(() => this._run(key), Math.min(this.quietMs, remainingMax));
  }

  /**
   * Whether a key has changes waiting to be sent
   * @param {string} key
   * @returns {boolean}
   */
  isPending(key) {
    const entry = this._entries.get(key);
    return !!entry && (!!entry.timer || entry.running || entry.dirty);
  }

  /**
   * Send a key's pending changes now
   * @param {string} key
   * @returns {Promise<void>}
   */
  async flushNow(key) {
    const entry = this._entries.get(key);
    if (!entry || entry.running || !entry.timer) return;
    await this._run(key);
  }

  /**
   * Send every pending key now
   * @returns {Promise<void>}
   */
  async flushAll() {
    await Promise.all([...this._entries.keys()].map(key => this.flushNow(key)));
  }

  /**
   * Drop all timers without sending
   */
  clear() {
    for (const entry of this._entries.values()) {
      if (entry.timer) this._clock.clearTimeout(entry.timer);
    }
    this._entries.clear();
  }

  /**
   * Run one flush for a key, then reschedule if changes arrived meanwhile
   * @param {string} key
   * @returns {Promise<void>}
   * @private
   */
  async _run(key) {
    const entry = this._entries.get(key);
    if (!entry || entry.running) return;
    if (entry.timer) this._clock.clearTimeout(entry.timer);
    entry.timer = null;
    entry.firstAt = null;
    entry.running = true;
    try {
      await this._flushFn(key);
    } finally {
      entry.running = false;
      if (entry.dirty) {
        entry.dirty = false;
        this.touch(key);
      } else {
        this._entries.delete(key);
      }
    }
  }
}
