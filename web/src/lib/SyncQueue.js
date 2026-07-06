class SyncQueue {
  constructor(worker, options = {}) {
    this.worker = worker;
    this.timeoutMs = options.timeoutMs || 30000;
    this.inFlight = new Map();
    this.pending = new Map();
  }

  enqueue(noteId, change) {
    if (this.inFlight.get(noteId)) {
      this.pending.set(noteId, change);
      return;
    }

    const run = async (nextChange) => {
      this.inFlight.set(noteId, true);
      const timer = setTimeout(() => {
        this.inFlight.delete(noteId);
        this.pending.delete(noteId);
        console.warn(`SyncQueue timeout for ${noteId}`);
      }, this.timeoutMs);

      try {
        await this.worker(noteId, nextChange);
      } catch (error) {
        console.warn(`SyncQueue worker failed for ${noteId}`, error);
      } finally {
        clearTimeout(timer);
        this.inFlight.delete(noteId);
        const pending = this.pending.get(noteId);
        this.pending.delete(noteId);
        if (pending) {
          run(pending);
        }
      }
    };

    run(change);
  }
}

export { SyncQueue };
