import { TaskDefinition } from '../types';

export interface CycleDetectionResult {
  hasCycle: boolean;
  cycle?: number[];  // Task indices forming the cycle (if detected)
  message?: string;  // Human-readable error message
}

/**
 * Detects circular dependencies in a task list using Kahn's algorithm (topological sort).
 *
 * @param tasks Array of task definitions with dependencies
 * @returns CycleDetectionResult indicating if a cycle exists and details
 */
export function detectCycles(tasks: TaskDefinition[]): CycleDetectionResult {
  const n = tasks.length;
  if (n === 0) {
    return { hasCycle: false };
  }

  // Build adjacency list and in-degree count
  const adjacencyList: number[][] = Array.from({ length: n }, () => []);
  const inDegree: number[] = Array(n).fill(0);

  // Validate dependencies and build graph
  for (let i = 0; i < n; i++) {
    const task = tasks[i];
    for (const dep of task.dependencies) {
      // Validate dependency index
      if (dep < 0 || dep >= n) {
        return {
          hasCycle: true,
          message: `Task #${i} (${task.name}) has invalid dependency index: ${dep}`
        };
      }
      // Self-dependency
      if (dep === i) {
        return {
          hasCycle: true,
          cycle: [i],
          message: `Task #${i} (${task.name}) depends on itself`
        };
      }
      // Add edge: dep -> i (task i depends on dep, so dep must come first)
      adjacencyList[dep].push(i);
      inDegree[i]++;
    }
  }

  // Kahn's algorithm: start with nodes that have no incoming edges
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) {
      queue.push(i);
    }
  }

  let processedCount = 0;
  const order: number[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    processedCount++;

    for (const neighbor of adjacencyList[current]) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If we couldn't process all nodes, there's a cycle
  if (processedCount !== n) {
    // Find nodes involved in cycle (those with remaining in-degree > 0)
    const cycleNodes: number[] = [];
    for (let i = 0; i < n; i++) {
      if (inDegree[i] > 0) {
        cycleNodes.push(i);
      }
    }

    // Try to find the actual cycle path using DFS
    const cycle = findCyclePath(tasks, cycleNodes);

    const cycleDesc = cycle
      .map(i => `#${i} (${tasks[i].name})`)
      .join(' -> ');

    return {
      hasCycle: true,
      cycle,
      message: `Circular dependency detected: ${cycleDesc} -> #${cycle[0]} (${tasks[cycle[0]].name})`
    };
  }

  return { hasCycle: false };
}

/**
 * Uses DFS to find the actual cycle path starting from nodes known to be in a cycle.
 */
function findCyclePath(tasks: TaskDefinition[], cycleNodes: number[]): number[] {
  if (cycleNodes.length === 0) return [];

  // Build reverse adjacency (task -> tasks it depends on)
  const reverseDeps: Map<number, number[]> = new Map();
  for (let i = 0; i < tasks.length; i++) {
    reverseDeps.set(i, [...tasks[i].dependencies]);
  }

  // DFS from first cycle node to find path back to itself
  const start = cycleNodes[0];
  const visited: Set<number> = new Set();
  const path: number[] = [];

  function dfs(node: number): boolean {
    if (path.includes(node)) {
      // Found cycle - trim path to start from this node
      const cycleStart = path.indexOf(node);
      path.splice(0, cycleStart);
      return true;
    }
    if (visited.has(node)) return false;

    visited.add(node);
    path.push(node);

    const deps = reverseDeps.get(node) || [];
    for (const dep of deps) {
      if (cycleNodes.includes(dep)) {
        if (dfs(dep)) return true;
      }
    }

    path.pop();
    return false;
  }

  dfs(start);
  return path.length > 0 ? path : cycleNodes.slice(0, 3); // Fallback to first few nodes
}

/**
 * Gets a valid execution order (topological sort) for tasks.
 * Returns null if there's a cycle.
 */
export function getExecutionOrder(tasks: TaskDefinition[]): number[] | null {
  const result = detectCycles(tasks);
  if (result.hasCycle) {
    return null;
  }

  // Return topological order using Kahn's algorithm
  const n = tasks.length;
  const inDegree: number[] = Array(n).fill(0);
  const adjacencyList: number[][] = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    for (const dep of tasks[i].dependencies) {
      adjacencyList[dep].push(i);
      inDegree[i]++;
    }
  }

  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) {
      queue.push(i);
    }
  }

  const order: number[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const neighbor of adjacencyList[current]) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  return order;
}
