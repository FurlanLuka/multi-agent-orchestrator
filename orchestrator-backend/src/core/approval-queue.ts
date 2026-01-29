import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { ApprovalRequest, ApprovalResponse } from '@orchy/types';

export class ApprovalQueue extends EventEmitter {
  private queue: ApprovalRequest[] = [];
  private processing: boolean = false;
  private currentRequest: ApprovalRequest | null = null;

  // UI mode: responses come from WebSocket instead of readline
  private uiMode: boolean = true;

  constructor(uiMode: boolean = true) {
    super();
    this.uiMode = uiMode;

    // Ensure response directory exists
    fs.mkdirSync('/tmp/orchestrator/approval_queue/responses', { recursive: true });
  }

  /**
   * Adds an approval request to the queue
   */
  addRequest(request: ApprovalRequest): void {
    console.log(`[ApprovalQueue] New request from ${request.project}: ${request.prompt}`);

    this.queue.push(request);
    this.emit('requestAdded', request);

    if (!this.processing) {
      this.processNext();
    }
  }

  /**
   * Processes the next request in the queue
   */
  private processNext(): void {
    if (this.queue.length === 0) {
      this.processing = false;
      this.currentRequest = null;
      return;
    }

    this.processing = true;
    this.currentRequest = this.queue.shift()!;

    console.log(`[ApprovalQueue] Processing: ${this.currentRequest.id}`);
    this.emit('processing', this.currentRequest);

    // In UI mode, we emit and wait for response via respond()
    // In non-UI mode, we'd use readline (not implemented here)
    if (!this.uiMode) {
      // Auto-approve in non-interactive mode (for testing)
      setTimeout(() => {
        this.respond(this.currentRequest!.id, true);
      }, 100);
    }
  }

  /**
   * Responds to an approval request (called from UI)
   */
  respond(requestId: string, approved: boolean): boolean {
    if (!this.currentRequest || this.currentRequest.id !== requestId) {
      // Check if it's in the queue
      const idx = this.queue.findIndex(r => r.id === requestId);
      if (idx !== -1) {
        // Remove from queue and respond directly
        const request = this.queue.splice(idx, 1)[0];
        this.writeResponse(request.id, approved);
        this.emit('responded', { request, approved });
        return true;
      }
      console.warn(`[ApprovalQueue] Unknown request ID: ${requestId}`);
      return false;
    }

    const request = this.currentRequest;

    // Write response file (for the hook to read)
    this.writeResponse(requestId, approved);

    console.log(`[ApprovalQueue] Responded to ${requestId}: ${approved ? 'APPROVED' : 'REJECTED'}`);
    this.emit('responded', { request, approved });

    // Process next
    this.processNext();
    return true;
  }

  /**
   * Writes the response file for a hook to read
   */
  private writeResponse(requestId: string, approved: boolean): void {
    const responsePath = `/tmp/orchestrator/approval_queue/responses/${requestId}.json`;
    const response: ApprovalResponse = {
      approved,
      timestamp: Date.now()
    };

    fs.writeFileSync(responsePath, JSON.stringify(response, null, 2));
  }

  /**
   * Gets the current pending request (for UI display)
   */
  getCurrentRequest(): ApprovalRequest | null {
    return this.currentRequest;
  }

  /**
   * Gets all queued requests
   */
  getQueue(): ApprovalRequest[] {
    return [...this.queue];
  }

  /**
   * Gets queue length
   */
  getQueueLength(): number {
    return this.queue.length + (this.currentRequest ? 1 : 0);
  }

  /**
   * Checks if there are pending requests
   */
  hasPending(): boolean {
    return this.currentRequest !== null || this.queue.length > 0;
  }

  /**
   * Clears all pending requests (reject them)
   */
  clearAll(): void {
    // Reject current request
    if (this.currentRequest) {
      this.writeResponse(this.currentRequest.id, false);
      this.emit('responded', { request: this.currentRequest, approved: false });
    }

    // Reject all queued requests
    for (const request of this.queue) {
      this.writeResponse(request.id, false);
      this.emit('responded', { request, approved: false });
    }

    this.queue = [];
    this.currentRequest = null;
    this.processing = false;
  }

  /**
   * Sets timeout for current request
   */
  setTimeout(timeoutMs: number): void {
    if (!this.currentRequest) return;

    const requestId = this.currentRequest.id;

    setTimeout(() => {
      if (this.currentRequest?.id === requestId) {
        console.log(`[ApprovalQueue] Request ${requestId} timed out`);
        this.emit('timeout', this.currentRequest);
        this.respond(requestId, false);
      }
    }, timeoutMs);
  }
}
