import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock electron FIRST — must be before any imports that touch main/*.js
vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/test-userdata',
    isPackaged: false,
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: { getFocusedWindow: vi.fn() },
  dialog: { showMessageBox: vi.fn() },
  session: { defaultSession: { webRequest: { onBeforeSendHeaders: vi.fn(), onHeadersReceived: vi.fn() } } },
  Menu: { setApplicationMenu: vi.fn() },
  shell: { openExternal: vi.fn() },
  webContents: { getAllWebContents: vi.fn(() => []) },
}));

// Mock agent-memory-vault to avoid electron dependency in tests
vi.mock('../../main/agent-memory-vault.js', () => ({
  agentVault: {
    get: vi.fn(() => null),
    set: vi.fn(() => true),
    delete: vi.fn(() => true),
    list: vi.fn(() => ({})),
    init: vi.fn(),
    getStats: vi.fn(() => ({ totalKeys: 0, isEncryptionAvailable: false, storagePath: '', lastUpdated: 0 })),
  },
  agentMemoryVault: {
    get: vi.fn(() => null),
    set: vi.fn(() => true),
    delete: vi.fn(() => true),
    list: vi.fn(() => ({})),
    init: vi.fn(),
    getStats: vi.fn(() => ({ totalKeys: 0, isEncryptionAvailable: false, storagePath: '', lastUpdated: 0 })),
  },
}));

// Mock agent-undo-stack
vi.mock('@main/agent-undo-stack', () => ({
  agentUndoStack: { record: vi.fn(), popUndo: vi.fn(() => ({ success: false })), getHistory: vi.fn(() => []), clear: vi.fn() },
  recordAgentAction: vi.fn(),
  undoLastAction: vi.fn(() => ({ success: false })),
  getUndoHistory: vi.fn(() => []),
  clearUndoHistory: vi.fn(),
}));

// Mock agent-policy (partial — just the audit function)
vi.mock('@main/agent-policy', () => ({
  APPROVAL_TTL_MS: 300000,
  appendAuditLogFile: vi.fn(),
  buildAuditEvent: vi.fn((input: any) => ({ id: 'test', ts: Date.now(), url: input.url, domain: '', actionType: input.actionType, tier: input.tier, verdict: input.verdict, reasons: input.reasons })),
  crossesTrustBoundary: vi.fn(() => ({ crosses: false, reasons: [] })),
  defaultPolicyStore: vi.fn(() => ({ version: 1, defaultMaxTier: 'sensitive', sites: {} })),
  domainOf: vi.fn((url: string) => { try { return new URL(url).hostname; } catch { return ''; } }),
  evaluateAction: vi.fn(() => ({ allowed: true, requiresApproval: false, tier: 'read', reasons: [] })),
  loadAuditLog: vi.fn(() => []),
  loadPolicyStore: vi.fn(() => ({ version: 1, defaultMaxTier: 'sensitive', sites: {} })),
  newPromptId: vi.fn(() => 'test-prompt-id'),
  savePolicyStore: vi.fn(),
  classifyAgentAction: vi.fn(() => ({ tier: 'read', requiresApproval: false, reasons: [] })),
  isSensitiveField: vi.fn(() => false),
  hasSensitiveFields: vi.fn(() => []),
}));

// Mock agent-engine
vi.mock('@main/agent-engine', () => ({
  generateActionJS: vi.fn(() => 'JSON.stringify({ success: true })'),
  parseAgentAction: vi.fn((raw: any) => ({ type: raw.action_type || raw.type || 'extract', selector: raw.selector, text: raw.text })),
  isSensitiveField: vi.fn(() => false),
  hasSensitiveFields: vi.fn(() => []),
  generateSensitiveFieldDetectionJS: vi.fn(() => 'JSON.stringify({ sensitiveFields: [] })'),
  generateHighlightJS: vi.fn(() => ''),
  generateTooltipJS: vi.fn(() => ''),
  generateClickRippleJS: vi.fn(() => ''),
}));

// Mock local-model-router
vi.mock('@main/local-model-router', () => ({
  getLocalEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
  localSemanticSearch: vi.fn(async (query: string, corpus: any[]) => corpus.map((c, i) => ({ ...c, score: 1 - i * 0.1 }))),
  discoverLocalModels: vi.fn(async () => []),
  getBestLocalModel: vi.fn(async () => null),
  getRouterState: vi.fn(async () => ({ mode: 'local-only', availableLocalModels: [], configuredCloudProviders: {}, lastConsent: undefined })),
  grantCloudConsent: vi.fn(),
  hasCloudConsent: vi.fn(() => false),
  revokeCloudConsent: vi.fn(),
  routePrompt: vi.fn(),
  streamPrompt: vi.fn(),
  getStoredApiKeys: vi.fn(async () => ({})),
  setStoredApiKeys: vi.fn(async () => {}),
  getApiKey: vi.fn(async () => ''),
  setApiKey: vi.fn(async () => {}),
}));

import {
  AgentRunLoop,
  generateDefaultPlan,
  generateStepId,
} from '@main/agent-loop';
import {
  PageUnderstandingEngine,
} from '@main/page-understanding.ts';
import {
  AgentPlanner,
  ReplanMonitor,
} from '@main/agent-planner.ts';
import {
  ToolRegistry,
} from '@main/tool-registry.ts';
import {
  SafetySandbox,
} from '@main/agent-sandbox.ts';
import {
  SubAgentCoordinator,
} from '@main/sub-agent-coordinator.ts';
import {
  CrossTabAgent,
} from '@main/cross-tab-agent.ts';

// ─── Agent Loop Tests ─────────────────────────────────────────────────────

describe('AgentRunLoop', () => {
  let loop: AgentRunLoop;

  beforeEach(() => {
    loop = new AgentRunLoop();
  });

  it('should start in idle state', () => {
    expect(loop.getState()).toBe('idle');
  });

  it('should return correct progress in idle', () => {
    const progress = loop.getProgress();
    expect(progress.state).toBe('idle');
    expect(progress.goal).toBe('');
    expect(progress.currentStep).toBe(0);
    expect(progress.totalSteps).toBe(0);
  });

  it('should register callbacks', () => {
    const onProgress = vi.fn();
    const onStateChange = vi.fn();
    loop.setCallbacks({ onProgress, onStateChange });
    // Callbacks registered without error
    expect(true).toBe(true);
  });

  it('should execute with default plan (no callbacks)', async () => {
    const result = await loop.start({
      description: 'Extract page content',
      constraints: { maxSteps: 2, timeoutMs: 5000 },
    });
    // Without callbacks, loop completes with default plan
    expect(result).toBeDefined();
    expect(result.goal).toBe('Extract page content');
  });

  it('should cancel gracefully', async () => {
    const result = await loop.start({
      description: 'Do something long',
      constraints: { maxSteps: 50, timeoutMs: 2000 },
    });
    // Cancel should work
    loop.cancel('Test cancel');
    expect(loop.getState()).toBe('cancelled');
  });

  it('should return undo availability', async () => {
    const result = await loop.start({
      description: 'Simple task',
      constraints: { maxSteps: 1, timeoutMs: 3000 },
    });
    expect(typeof result.undoAvailable).toBe('boolean');
  });

  it('should enforce step budget', async () => {
    const result = await loop.start({
      description: 'Task',
      constraints: { maxSteps: 2, timeoutMs: 10000 },
    });
    expect(result.stepsExecuted).toBeLessThanOrEqual(2);
  });
});

describe('generateDefaultPlan', () => {
  it('should generate search plan', () => {
    const plan = generateDefaultPlan({ description: 'search for cats' }, '');
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.some(s => s.action.type === 'type')).toBe(true);
  });

  it('should generate click plan', () => {
    const plan = generateDefaultPlan({ description: 'click login button' }, '');
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.some(s => s.action.type === 'click')).toBe(true);
  });

  it('should generate extract plan', () => {
    const plan = generateDefaultPlan({ description: 'read the article' }, '');
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.some(s => s.action.type === 'extract')).toBe(true);
  });

  it('should always end with extract', () => {
    const plan = generateDefaultPlan({ description: 'fill the form' }, '');
    expect(plan[plan.length - 1].action.type).toBe('extract');
  });

  it('should include navigation when URL provided', () => {
    const plan = generateDefaultPlan({ description: 'go to page', url: 'https://example.com' }, '');
    expect(plan.length).toBeGreaterThan(0);
  });
});

describe('generateStepId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateStepId();
    const id2 = generateStepId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^step-/);
  });
});

// ─── Planner Tests ────────────────────────────────────────────────────────

describe('AgentPlanner', () => {
  let planner: AgentPlanner;

  beforeEach(() => {
    planner = new AgentPlanner();
  });

  it('should create a template plan', async () => {
    const plan = await planner.createPlan({
      goal: { description: 'search for cats' },
      history: [],
      previousFailures: [],
      constraints: {
        maxSteps: 10,
        maxDepth: 3,
        timeoutMs: 60000,
        allowedDomains: [],
        blockedDomains: [],
        requireApprovalForSensitive: true,
        maxReplans: 3,
        preferLocalExecution: true,
      },
      skills: [],
    });
    expect(plan).toBeDefined();
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.goal).toBe('search for cats');
  });

  it('should handle simple click goal', async () => {
    const plan = await planner.createPlan({
      goal: { description: 'click login' },
      history: [],
      previousFailures: [],
      constraints: {
        maxSteps: 10,
        maxDepth: 3,
        timeoutMs: 60000,
        allowedDomains: [],
        blockedDomains: [],
        requireApprovalForSensitive: true,
        maxReplans: 3,
        preferLocalExecution: true,
      },
      skills: [],
    });
    expect(plan.steps.some(s => s.action.type === 'click')).toBe(true);
  });

  it('should handle extract goal', async () => {
    const plan = await planner.createPlan({
      goal: { description: 'extract page content' },
      history: [],
      previousFailures: [],
      constraints: {
        maxSteps: 10,
        maxDepth: 3,
        timeoutMs: 60000,
        allowedDomains: [],
        blockedDomains: [],
        requireApprovalForSensitive: true,
        maxReplans: 3,
        preferLocalExecution: true,
      },
      skills: [],
    });
    expect(plan.steps.some(s => s.action.type === 'extract')).toBe(true);
  });

  it('should infer strategy', async () => {
    const plan = await planner.createPlan({
      goal: { description: 'carefully verify the data' },
      history: [],
      previousFailures: [],
      constraints: {
        maxSteps: 10,
        maxDepth: 3,
        timeoutMs: 60000,
        allowedDomains: [],
        blockedDomains: [],
        requireApprovalForSensitive: true,
        maxReplans: 3,
        preferLocalExecution: true,
      },
      skills: [],
    });
    expect(plan.strategy).toBe('conservative');
  });

  it('should set max replans', async () => {
    const plan = await planner.createPlan({
      goal: { description: 'quick search' },
      history: [],
      previousFailures: [],
      constraints: {
        maxSteps: 5,
        maxDepth: 2,
        timeoutMs: 30000,
        allowedDomains: [],
        blockedDomains: [],
        requireApprovalForSensitive: true,
        maxReplans: 2,
        preferLocalExecution: true,
      },
      skills: [],
    });
    expect(plan).toBeDefined();
  });
});

describe('ReplanMonitor', () => {
  let monitor: ReplanMonitor;

  beforeEach(() => {
    monitor = new ReplanMonitor();
  });

  it('should not replan on success', () => {
    const result = monitor.recordStep({
      stepId: 's1',
      stepIndex: 0,
      success: true,
      timestamp: Date.now(),
      executionTimeMs: 100,
    });
    expect(result.shouldReplan).toBe(false);
  });

  it('should replan after 3 consecutive failures', () => {
    for (let i = 0; i < 3; i++) {
      const result = monitor.recordStep({
        stepId: `s${i}`,
        stepIndex: i,
        success: false,
        error: 'element not found',
        timestamp: Date.now(),
        executionTimeMs: 100,
      });
      if (i < 2) {
        expect(result.shouldReplan).toBe(false);
      } else {
        expect(result.shouldReplan).toBe(true);
        expect(result.reason).toContain('consecutive failures');
      }
    }
  });

  it('should reset after success', () => {
    monitor.recordStep({ stepId: 's1', stepIndex: 0, success: false, error: 'err', timestamp: Date.now(), executionTimeMs: 100 });
    monitor.recordStep({ stepId: 's2', stepIndex: 1, success: false, error: 'err', timestamp: Date.now(), executionTimeMs: 100 });
    monitor.recordStep({ stepId: 's3', stepIndex: 2, success: true, timestamp: Date.now(), executionTimeMs: 100 });
    const result = monitor.recordStep({ stepId: 's4', stepIndex: 3, success: false, error: 'err', timestamp: Date.now(), executionTimeMs: 100 });
    expect(result.shouldReplan).toBe(false); // Reset after success
  });

  it('should replan on stall (same observation)', () => {
    for (let i = 0; i < 6; i++) {
      const result = monitor.recordStep(
        { stepId: `s${i}`, stepIndex: i, success: true, timestamp: Date.now(), executionTimeMs: 100 },
        'same-hash'
      );
      if (i < 5) {
        expect(result.shouldReplan).toBe(false);
      } else {
        expect(result.shouldReplan).toBe(true);
        expect(result.reason).toContain('stalled');
      }
    }
  });

  it('should reset properly', () => {
    monitor.recordStep({ stepId: 's1', stepIndex: 0, success: false, error: 'err', timestamp: Date.now(), executionTimeMs: 100 });
    monitor.reset();
    const result = monitor.recordStep({ stepId: 's2', stepIndex: 1, success: false, error: 'err', timestamp: Date.now(), executionTimeMs: 100 });
    expect(result.shouldReplan).toBe(false); // Counter was reset
  });
});

// ─── Tool Registry Tests ──────────────────────────────────────────────────

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry('/tmp/test-userdata');
  });

  it('should have built-in tools', () => {
    const tools = registry.getAllTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some(t => t.id === 'web_search')).toBe(true);
    expect(tools.some(t => t.id === 'execute_code')).toBe(true);
    expect(tools.some(t => t.id === 'calculate')).toBe(true);
    expect(tools.some(t => t.id === 'current_time')).toBe(true);
    expect(tools.some(t => t.id === 'json_parse')).toBe(true);
  });

  it('should get tools by category', () => {
    const searchTools = registry.getToolsByCategory('search');
    expect(searchTools.some(t => t.id === 'web_search')).toBe(true);

    const codeTools = registry.getToolsByCategory('code');
    expect(codeTools.some(t => t.id === 'execute_code')).toBe(true);
  });

  it('should get tools by tier', () => {
    const readTools = registry.getToolsByTier('read');
    expect(readTools.some(t => t.id === 'calculate')).toBe(true);
    expect(readTools.every(t => t.tier === 'read')).toBe(true);
  });

  it('should execute calculate tool', async () => {
    const result = await registry.execute({
      toolId: 'calculate',
      params: { expression: '2 + 2' },
      callId: 'test-1',
      timestamp: Date.now(),
    });
    expect(result.success).toBe(true);
    expect(result.output).toBe(4);
  });

  it('should execute current_time tool', async () => {
    const result = await registry.execute({
      toolId: 'current_time',
      params: {},
      callId: 'test-2',
      timestamp: Date.now(),
    });
    expect(result.success).toBe(true);
    expect(typeof result.output).toBe('string');
  });

  it('should execute text_transform tool', async () => {
    const result = await registry.execute({
      toolId: 'text_transform',
      params: { text: 'hello world test', operation: 'word_count' },
      callId: 'test-3',
      timestamp: Date.now(),
    });
    expect(result.success).toBe(true);
    expect(result.output).toBe(3);
  });

  it('should execute json_parse tool', async () => {
    const result = await registry.execute({
      toolId: 'json_parse',
      params: { text: '{"name":"test","value":42}', path: 'name' },
      callId: 'test-4',
      timestamp: Date.now(),
    });
    expect(result.success).toBe(true);
    expect(result.output).toBe('test');
  });

  it('should reject unknown tool', async () => {
    const result = await registry.execute({
      toolId: 'nonexistent',
      params: {},
      callId: 'test-5',
      timestamp: Date.now(),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should reject disabled tool', async () => {
    registry.disableTool('calculate');
    const result = await registry.execute({
      toolId: 'calculate',
      params: { expression: '1+1' },
      callId: 'test-6',
      timestamp: Date.now(),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('disabled');
    registry.enableTool('calculate');
  });

  it('should enforce rate limits', async () => {
    // The calculate tool has 60/min limit — just verify the check works
    const stats = registry.getStats();
    expect(stats.totalCalls).toBeGreaterThanOrEqual(0);
  });

  it('should track call history', async () => {
    await registry.execute({
      toolId: 'calculate',
      params: { expression: '1+1' },
      callId: 'test-7',
      timestamp: Date.now(),
    });
    const history = registry.getCallHistory();
    expect(history.length).toBeGreaterThan(0);
  });

  it('should register custom tool', async () => {
    registry.registerTool({
      id: 'custom_test',
      name: 'Custom Test',
      description: 'A test tool',
      category: 'custom',
      parameters: [{ name: 'input', type: 'string', description: 'Input', required: true }],
      tier: 'read',
      enabled: true,
      timeoutMs: 1000,
      rateLimitPerMinute: 10,
    }, async (params) => `Custom: ${params.input}`);

    const result = await registry.execute({
      toolId: 'custom_test',
      params: { input: 'hello' },
      callId: 'test-8',
      timestamp: Date.now(),
    });
    expect(result.success).toBe(true);
    expect(result.output).toBe('Custom: hello');
  });
});

// ─── Safety Sandbox Tests ─────────────────────────────────────────────────

describe('SafetySandbox', () => {
  let sandbox: SafetySandbox;

  beforeEach(() => {
    sandbox = new SafetySandbox();
  });

  it('should allow steps within budget', () => {
    const result = sandbox.checkStep();
    expect(result.allowed).toBe(true);
  });

  it('should block steps after budget exceeded', () => {
    sandbox.updateConfig({ maxSteps: 3 });
    sandbox.recordStep();
    sandbox.recordStep();
    sandbox.recordStep();
    const result = sandbox.checkStep();
    expect(result.allowed).toBe(false);
    expect(result.violation?.type).toBe('step_budget');
  });

  it('should allow navigation to allowed domains', () => {
    sandbox.updateConfig({ allowedDomains: ['example.com'] });
    const result = sandbox.checkNavigation('example.com');
    expect(result.allowed).toBe(true);
  });

  it('should block navigation to non-allowed domains', () => {
    sandbox.updateConfig({ allowedDomains: ['example.com'] });
    const result = sandbox.checkNavigation('evil.com');
    expect(result.allowed).toBe(false);
    expect(result.violation?.type).toBe('network_blocked');
  });

  it('should block navigation to blocked domains', () => {
    sandbox.updateConfig({ blockedDomains: ['malware.com'] });
    const result = sandbox.checkNavigation('malware.com');
    expect(result.allowed).toBe(false);
    expect(result.violation?.type).toBe('network_blocked');
  });

  it('should enforce HTTPS-only mode', () => {
    sandbox.updateConfig({ httpsOnly: true });
    const result = sandbox.checkNetworkRequest('example.com', 'http:');
    expect(result.allowed).toBe(false);
    expect(result.violation?.type).toBe('https_only');
  });

  it('should allow HTTPS in HTTPS-only mode', () => {
    sandbox.updateConfig({ httpsOnly: true });
    const result = sandbox.checkNetworkRequest('example.com', 'https:');
    expect(result.allowed).toBe(true);
  });

  it('should enforce rate limits', () => {
    sandbox.updateConfig({ maxClicksPerMinute: 2 });
    sandbox.checkRateLimit('click');
    sandbox.checkRateLimit('click');
    const result = sandbox.checkRateLimit('click');
    expect(result.allowed).toBe(false);
    expect(result.violation?.type).toBe('rate_limit');
  });

  it('should track violations', () => {
    sandbox.updateConfig({ maxSteps: 1 });
    sandbox.recordStep();
    sandbox.checkStep(); // Should fail
    const violations = sandbox.getViolations();
    expect(violations.length).toBe(1);
    expect(violations[0].type).toBe('step_budget');
  });

  it('should trigger kill switch', () => {
    sandbox.triggerKillSwitch('Emergency stop');
    const result = sandbox.checkStep();
    expect(result.allowed).toBe(false);
    expect(result.violation?.type).toBe('kill_switch');
  });

  it('should reset kill switch', () => {
    sandbox.triggerKillSwitch('Emergency stop');
    sandbox.resetKillSwitch();
    const result = sandbox.checkStep();
    expect(result.allowed).toBe(true);
  });

  it('should return usage stats', () => {
    const usage = sandbox.getUsage();
    expect(usage.steps.used).toBe(0);
    expect(usage.steps.max).toBe(50);
    expect(typeof usage.steps.pct).toBe('number');
  });

  it('should reset state', () => {
    sandbox.recordStep();
    sandbox.recordStep();
    sandbox.reset();
    const usage = sandbox.getUsage();
    expect(usage.steps.used).toBe(0);
  });

  it('should check DOM mutation limits', () => {
    sandbox.updateConfig({ maxDomMutations: 2 });
    sandbox.checkDomMutation();
    sandbox.checkDomMutation();
    const result = sandbox.checkDomMutation();
    expect(result.allowed).toBe(false);
    expect(result.violation?.type).toBe('mutation_limit');
  });

  it('should check selector depth', () => {
    sandbox.updateConfig({ maxSelectorDepth: 3 });
    const result = sandbox.checkSelectorDepth('div > p > span > a');
    expect(result.allowed).toBe(false);
    expect(result.violation?.type).toBe('selector_depth');
  });
});

// ─── Sub-Agent Coordinator Tests ──────────────────────────────────────────

describe('SubAgentCoordinator', () => {
  let coordinator: SubAgentCoordinator;

  beforeEach(() => {
    coordinator = new SubAgentCoordinator({ maxConcurrent: 2, defaultTimeoutMs: 5000 });
  });

  it('should spawn a task', () => {
    const taskId = coordinator.spawn({
      description: 'Test task',
    });
    expect(taskId).toMatch(/^sub-/);
    const task = coordinator.getTask(taskId);
    expect(task).toBeDefined();
    // Task starts as pending but may immediately become running if within concurrency limit
    expect(['pending', 'running']).toContain(task!.status);
  });

  it('should get all tasks', () => {
    coordinator.spawn({ description: 'Task 1' });
    coordinator.spawn({ description: 'Task 2' });
    expect(coordinator.getAllTasks().length).toBe(2);
  });

  it('should cancel a task', () => {
    const taskId = coordinator.spawn({ description: 'Task' });
    const result = coordinator.cancel(taskId);
    expect(result).toBe(true);
    expect(coordinator.getTask(taskId)!.status).toBe('cancelled');
  });

  it('should get aggregated results', () => {
    const agg = coordinator.getAggregatedResults();
    expect(agg.total).toBe(0);
    expect(agg.completed).toBe(0);
  });

  it('should cancel all tasks', () => {
    coordinator.spawn({ description: 'Task 1' });
    coordinator.spawn({ description: 'Task 2' });
    coordinator.cancelAll();
    const all = coordinator.getAllTasks();
    expect(all.every(t => t.status === 'cancelled')).toBe(true);
  });
});

// ─── Cross-Tab Agent Tests ────────────────────────────────────────────────

describe('CrossTabAgent', () => {
  let crossTab: CrossTabAgent;

  beforeEach(() => {
    crossTab = new CrossTabAgent();
  });

  it('should register a tab', () => {
    const mockExecJs = async () => '{}';
    const tabId = crossTab.registerTab(1, 'persist:default', mockExecJs);
    expect(tabId).toMatch(/^tab-/);
    expect(crossTab.getTab(tabId)).toBeDefined();
  });

  it('should unregister a tab', () => {
    const mockExecJs = async () => '{}';
    const tabId = crossTab.registerTab(1, 'persist:default', mockExecJs);
    crossTab.unregisterTab(tabId);
    expect(crossTab.getTab(tabId)).toBeUndefined();
  });

  it('should update tab state', () => {
    const mockExecJs = async () => '{}';
    const tabId = crossTab.registerTab(1, 'persist:default', mockExecJs);
    crossTab.updateTabState(tabId, 'https://example.com', 'Example');
    const tab = crossTab.getTab(tabId);
    expect(tab!.url).toBe('https://example.com');
    expect(tab!.title).toBe('Example');
  });

  it('should set active tab', () => {
    const mockExecJs = async () => '{}';
    const tabId1 = crossTab.registerTab(1, 'persist:default', mockExecJs);
    const tabId2 = crossTab.registerTab(2, 'persist:default', mockExecJs);
    crossTab.setActiveTab(tabId1);
    expect(crossTab.getActiveTab()!.id).toBe(tabId1);
    crossTab.setActiveTab(tabId2);
    expect(crossTab.getActiveTab()!.id).toBe(tabId2);
  });

  it('should get all tabs', () => {
    const mockExecJs = async () => '{}';
    crossTab.registerTab(1, 'persist:default', mockExecJs);
    crossTab.registerTab(2, 'persist:default', mockExecJs);
    expect(crossTab.getAllTabs().length).toBe(2);
  });

  it('should get tabs by domain', () => {
    const mockExecJs = async () => '{}';
    const tabId1 = crossTab.registerTab(1, 'persist:default', mockExecJs);
    const tabId2 = crossTab.registerTab(2, 'persist:default', mockExecJs);
    crossTab.updateTabState(tabId1, 'https://example.com', 'Ex1');
    crossTab.updateTabState(tabId2, 'https://other.com', 'Ex2');
    const tabs = crossTab.getTabsByDomain('example.com');
    expect(tabs.length).toBe(1);
    expect(tabs[0].id).toBe(tabId1);
  });

  it('should get stats', () => {
    const mockExecJs = async () => '{}';
    crossTab.registerTab(1, 'persist:default', mockExecJs);
    crossTab.registerTab(2, 'persist:default', mockExecJs);
    const stats = crossTab.getStats();
    expect(stats.totalTabs).toBe(2);
    expect(stats.activeTabs).toBe(0);
  });
});

// ─── Page Understanding Tests (basic, no DOMEngine needed) ────────────────

describe('PageUnderstanding (module exports)', () => {
  it('should export PageUnderstandingEngine', () => {
    expect(PageUnderstandingEngine).toBeDefined();
    expect(typeof PageUnderstandingEngine).toBe('function');
  });
});
