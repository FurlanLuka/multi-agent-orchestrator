import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { LogEntry } from '../types';

export class LogAggregator extends EventEmitter {
  private logs: Map<string, LogEntry[]> = new Map();
  private sessionDirs: Map<string, string> = new Map();
  private readonly MAX_LOGS_PER_PROJECT = 1000;

  /**
   * Registers a project for log aggregation
   */
  registerProject(project: string, sessionDir: string): void {
    this.sessionDirs.set(project, sessionDir);
    this.logs.set(project, []);

    // Create logs directory
    const logsDir = path.join(sessionDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
  }

  /**
   * Adds a log entry
   */
  addLog(entry: LogEntry): void {
    const { project } = entry;

    // Store in memory
    if (!this.logs.has(project)) {
      this.logs.set(project, []);
    }

    const projectLogs = this.logs.get(project)!;
    projectLogs.push(entry);

    // Trim if too many logs
    if (projectLogs.length > this.MAX_LOGS_PER_PROJECT) {
      projectLogs.splice(0, projectLogs.length - this.MAX_LOGS_PER_PROJECT);
    }

    // Write to file
    this.writeToFile(entry);

    // Emit for real-time streaming
    this.emit('log', entry);
  }

  /**
   * Writes a log entry to the project's log file
   */
  private writeToFile(entry: LogEntry): void {
    const sessionDir = this.sessionDirs.get(entry.project);
    if (!sessionDir) return;

    const logFile = path.join(sessionDir, 'logs', `${entry.type}.log`);
    const timestamp = new Date(entry.timestamp).toISOString();
    const line = `[${timestamp}] [${entry.stream}] ${entry.text}\n`;

    try {
      fs.appendFileSync(logFile, line);
    } catch (err) {
      // Ignore file write errors
    }
  }

  /**
   * Gets recent logs for a project
   */
  getLogs(project: string, limit: number = 100): LogEntry[] {
    const projectLogs = this.logs.get(project) || [];
    return projectLogs.slice(-limit);
  }

  /**
   * Gets logs filtered by type
   */
  getLogsByType(project: string, type: 'devServer' | 'agent', limit: number = 100): LogEntry[] {
    const projectLogs = this.logs.get(project) || [];
    return projectLogs
      .filter(l => l.type === type)
      .slice(-limit);
  }

  /**
   * Gets logs filtered by stream
   */
  getLogsByStream(project: string, stream: 'stdout' | 'stderr', limit: number = 100): LogEntry[] {
    const projectLogs = this.logs.get(project) || [];
    return projectLogs
      .filter(l => l.stream === stream)
      .slice(-limit);
  }

  /**
   * Gets all logs across all projects
   */
  getAllLogs(limit: number = 100): LogEntry[] {
    const allLogs: LogEntry[] = [];

    for (const [_, projectLogs] of this.logs) {
      allLogs.push(...projectLogs);
    }

    // Sort by timestamp and return most recent
    return allLogs
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-limit);
  }

  /**
   * Searches logs for a pattern
   */
  searchLogs(project: string, pattern: string | RegExp): LogEntry[] {
    const projectLogs = this.logs.get(project) || [];
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;

    return projectLogs.filter(l => regex.test(l.text));
  }

  /**
   * Gets error logs (from stderr)
   */
  getErrors(project: string, limit: number = 50): LogEntry[] {
    return this.getLogsByStream(project, 'stderr', limit);
  }

  /**
   * Clears logs for a project
   */
  clearLogs(project: string): void {
    this.logs.set(project, []);
  }

  /**
   * Clears all logs
   */
  clearAll(): void {
    this.logs.clear();
  }

  /**
   * Gets log file path for a project
   */
  getLogFilePath(project: string, type: 'devServer' | 'agent'): string | null {
    const sessionDir = this.sessionDirs.get(project);
    if (!sessionDir) return null;
    return path.join(sessionDir, 'logs', `${type}.log`);
  }

  /**
   * Reads log file contents
   */
  readLogFile(project: string, type: 'devServer' | 'agent'): string | null {
    const filePath = this.getLogFilePath(project, type);
    if (!filePath || !fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  }

  /**
   * Gets summary of log counts
   */
  getSummary(): Record<string, { total: number; errors: number }> {
    const summary: Record<string, { total: number; errors: number }> = {};

    for (const [project, projectLogs] of this.logs) {
      summary[project] = {
        total: projectLogs.length,
        errors: projectLogs.filter(l => l.stream === 'stderr').length
      };
    }

    return summary;
  }
}
