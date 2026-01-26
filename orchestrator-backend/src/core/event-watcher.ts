import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import chokidar, { FSWatcher } from 'chokidar';
import { OutboxEvent } from '@aio/types';

export class EventWatcher extends EventEmitter {
  private watchers: Map<string, FSWatcher> = new Map();
  private processing: Set<string> = new Set();

  /**
   * Starts watching a project's outbox directory for events
   */
  watchProject(project: string, sessionDir: string): void {
    const outboxDir = path.join(sessionDir, 'outbox');

    // Ensure outbox directory exists
    if (!fs.existsSync(outboxDir)) {
      fs.mkdirSync(outboxDir, { recursive: true });
    }

    // Stop existing watcher if any
    this.stopWatching(project);

    console.log(`[EventWatcher] Watching ${project} outbox: ${outboxDir}`);

    // Use chokidar for reliable cross-platform file watching
    const watcher = chokidar.watch(outboxDir, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    });

    watcher.on('add', async (filePath: string) => {
      const filename = path.basename(filePath);

      // Only process JSON files
      if (!filename.endsWith('.json')) return;

      // Debounce / prevent double processing
      if (this.processing.has(filePath)) return;
      this.processing.add(filePath);

      try {
        await this.processEventFile(filePath, project);
      } finally {
        this.processing.delete(filePath);
      }
    });

    watcher.on('error', (error: Error) => {
      console.error(`[EventWatcher] Error watching ${project}:`, error);
    });

    this.watchers.set(project, watcher);
  }

  /**
   * Processes an event file from the outbox
   */
  private async processEventFile(filePath: string, project: string): Promise<void> {
    const filename = path.basename(filePath);

    try {
      // Small delay to ensure file is fully written
      await new Promise(r => setTimeout(r, 50));

      if (!fs.existsSync(filePath)) {
        console.warn(`[EventWatcher] File no longer exists: ${filePath}`);
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const event: OutboxEvent = JSON.parse(content);

      console.log(`[EventWatcher] Event from ${project}: ${event.type}`);

      // Emit the event for routing (include project in the event)
      this.emit('event', { ...event, project });

      // Delete processed file
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error(`[EventWatcher] Error processing event file ${filename}:`, err);

      // Move failed file to a .failed extension for debugging
      try {
        fs.renameSync(filePath, filePath + '.failed');
      } catch {
        // Ignore rename errors
      }
    }
  }

  /**
   * Processes any existing files in the outbox (for startup recovery)
   */
  async processExistingEvents(project: string, sessionDir: string): Promise<void> {
    const outboxDir = path.join(sessionDir, 'outbox');

    if (!fs.existsSync(outboxDir)) return;

    const files = fs.readdirSync(outboxDir)
      .filter(f => f.endsWith('.json'))
      .sort(); // Process in order

    console.log(`[EventWatcher] Processing ${files.length} existing events for ${project}`);

    for (const file of files) {
      const filePath = path.join(outboxDir, file);
      await this.processEventFile(filePath, project);
    }
  }

  /**
   * Stops watching a specific project
   */
  stopWatching(project: string): void {
    const watcher = this.watchers.get(project);
    if (watcher) {
      watcher.close();
      this.watchers.delete(project);
      console.log(`[EventWatcher] Stopped watching ${project}`);
    }
  }

  /**
   * Stops all watchers
   */
  stopAll(): void {
    console.log(`[EventWatcher] Stopping all watchers`);
    for (const [project, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();
  }

  /**
   * Lists all watched projects
   */
  listWatched(): string[] {
    return Array.from(this.watchers.keys());
  }
}
