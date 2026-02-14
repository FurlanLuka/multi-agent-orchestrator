import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createOrchestratorMcpServer, OrchestratorMcpDeps } from './orchestrator-mcp-server';
import { createDesignerMcpServer, DesignerMcpDeps } from './designer-mcp-server';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

interface McpSession {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  createdAt: number;
}

/**
 * Creates Express routes for MCP Streamable HTTP transport.
 * Two endpoints:
 *   - /mcp/orchestrator?project={project} — orchestrator tools (permission, task_complete, etc.)
 *   - /mcp/designer?sessionId={id} — designer tools (themes, mockups, pages, etc.)
 */
export function createMcpRoutes(
  orchestratorDeps: OrchestratorMcpDeps,
  designerDeps: DesignerMcpDeps
): Router {
  const router = Router();

  // Track active sessions by Mcp-Session-Id header
  const orchestratorSessions = new Map<string, McpSession>();
  const designerSessions = new Map<string, McpSession>();

  // ═══════════════════════════════════════════════════════════════
  // Orchestrator MCP endpoint
  // ═══════════════════════════════════════════════════════════════

  router.post('/mcp/orchestrator', async (req: Request, res: Response) => {
    const project = (req.query.project as string) || 'unknown';
    const serverName = (req.query.serverName as string) || 'orchestrator-permission';
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Existing session — forward to stored transport
    if (sessionId && orchestratorSessions.has(sessionId)) {
      const session = orchestratorSessions.get(sessionId)!;
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    // New session — must be an initialize request
    const body = req.body;
    if (!isInitializeRequest(body)) {
      res.status(400).json({ error: 'First request must be an initialize request' });
      return;
    }

    // Create transport with unique session ID
    const newSessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
    });

    // Create MCP server with project context
    const server = createOrchestratorMcpServer(orchestratorDeps, project, serverName);

    // Store session
    orchestratorSessions.set(newSessionId, { transport, server, createdAt: Date.now() });

    // Connect server to transport
    await server.connect(transport);

    // Handle the initialize request
    await transport.handleRequest(req, res, body);

    // Cleanup on transport close
    transport.onclose = () => {
      orchestratorSessions.delete(newSessionId);
      console.log(`[MCP] Orchestrator session ${newSessionId} closed (project: ${project})`);
    };

    console.log(`[MCP] Orchestrator session ${newSessionId} created (project: ${project}, serverName: ${serverName})`);
  });

  // GET for SSE stream (server→client notifications)
  router.get('/mcp/orchestrator', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !orchestratorSessions.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }
    const session = orchestratorSessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
  });

  // DELETE to cleanup
  router.delete('/mcp/orchestrator', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && orchestratorSessions.has(sessionId)) {
      const session = orchestratorSessions.get(sessionId)!;
      await session.transport.handleRequest(req, res);
      orchestratorSessions.delete(sessionId);
      console.log(`[MCP] Orchestrator session ${sessionId} deleted`);
    } else {
      res.status(204).end();
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Designer MCP endpoint
  // ═══════════════════════════════════════════════════════════════

  router.post('/mcp/designer', async (req: Request, res: Response) => {
    const designerSessionId = (req.query.sessionId as string) || 'unknown';
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Existing session — forward to stored transport
    if (sessionId && designerSessions.has(sessionId)) {
      const session = designerSessions.get(sessionId)!;
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    // New session — must be an initialize request
    const body = req.body;
    if (!isInitializeRequest(body)) {
      res.status(400).json({ error: 'First request must be an initialize request' });
      return;
    }

    // Create transport
    const newSessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
    });

    // Create MCP server with session context
    const server = createDesignerMcpServer(designerDeps, designerSessionId);

    // Store session
    designerSessions.set(newSessionId, { transport, server, createdAt: Date.now() });

    // Connect server to transport
    await server.connect(transport);

    // Handle the initialize request
    await transport.handleRequest(req, res, body);

    // Cleanup on transport close
    transport.onclose = () => {
      designerSessions.delete(newSessionId);
      console.log(`[MCP] Designer session ${newSessionId} closed (designerSession: ${designerSessionId})`);
    };

    console.log(`[MCP] Designer session ${newSessionId} created (designerSession: ${designerSessionId})`);
  });

  // GET for SSE stream
  router.get('/mcp/designer', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !designerSessions.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }
    const session = designerSessions.get(sessionId)!;
    await session.transport.handleRequest(req, res);
  });

  // DELETE to cleanup
  router.delete('/mcp/designer', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && designerSessions.has(sessionId)) {
      const session = designerSessions.get(sessionId)!;
      await session.transport.handleRequest(req, res);
      designerSessions.delete(sessionId);
      console.log(`[MCP] Designer session ${sessionId} deleted`);
    } else {
      res.status(204).end();
    }
  });

  return router;
}
