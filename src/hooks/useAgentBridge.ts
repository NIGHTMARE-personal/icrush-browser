import { useState, useEffect, useCallback } from 'react';
import type {
  MCPTool,
  MCPServerConfig,
  MCPToolCallResult,
  AgentRecordedAction,
  AgentUndoResult,
  VaultStats,
  EncryptedMemoryEntry,
  SensitiveActionPrompt,
  SensitiveActionDecision,
} from '../../shared/agent-contracts';

/**
 * Cross-Layer React Hook for Agent Subsystems
 * Bridges UI components with MCP Connectors, Encrypted Vault, and Action Undo.
 */
export function useAgentBridge() {
  // 1. MCP Connectors State
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([]);
  const [mcpServers, setMcpServers] = useState<MCPServerConfig[]>([]);
  const [isMcpLoading, setIsMcpLoading] = useState(false);

  // 2. Encrypted Vault State
  const [memoryVault, setMemoryVault] = useState<Record<string, string>>({});
  const [vaultStats, setVaultStats] = useState<VaultStats | null>(null);

  // 3. Action Undo History State
  const [undoHistory, setUndoHistory] = useState<AgentRecordedAction[]>([]);

  // 4. Sensitive Field Prompt State
  const [activePrompt, setActivePrompt] = useState<SensitiveActionPrompt | null>(null);

  // Fetch MCP tools & servers
  const refreshMCP = useCallback(async () => {
    try {
      setIsMcpLoading(true);
      if (window.electronAPI?.mcp) {
        const [tools, servers] = await Promise.all([
          window.electronAPI.mcp.listTools(),
          window.electronAPI.mcp.getServers(),
        ]);
        setMcpTools(tools);
        setMcpServers(servers);
      }
    } catch (err) {
      console.error('[useAgentBridge] Error loading MCP tools:', err);
    } finally {
      setIsMcpLoading(false);
    }
  }, []);

  // Execute MCP Tool
  const callMCPTool = useCallback(async (toolId: string, params: Record<string, unknown>): Promise<MCPToolCallResult> => {
    if (!window.electronAPI?.mcp) {
      return { success: false, toolId, error: 'MCP API unavailable in renderer' };
    }
    return window.electronAPI.mcp.callTool(toolId, params);
  }, []);

  // Configure MCP Server
  const configureMCPServer = useCallback(async (config: MCPServerConfig): Promise<boolean> => {
    if (!window.electronAPI?.mcp) return false;
    const res = await window.electronAPI.mcp.configureServer(config);
    await refreshMCP();
    return res;
  }, [refreshMCP]);

  // Fetch Vault memory & stats
  const refreshVault = useCallback(async () => {
    try {
      if (window.electronAPI?.agent) {
        const [memory, stats] = await Promise.all([
          window.electronAPI.agent.getMemory(),
          window.electronAPI.agent.getMemoryStats(),
        ]);
        setMemoryVault(memory);
        setVaultStats(stats);
      }
    } catch (err) {
      console.error('[useAgentBridge] Error loading Vault memory:', err);
    }
  }, []);

  // Set Vault Memory Entry
  const setVaultMemory = useCallback(async (key: string, value: string, category?: EncryptedMemoryEntry['category']): Promise<boolean> => {
    if (!window.electronAPI?.agent) return false;
    const success = await window.electronAPI.agent.setMemory(key, value, category);
    if (success) {
      setMemoryVault(prev => ({ ...prev, [key]: value }));
    }
    return success;
  }, []);

  // Delete Vault Memory Entry
  const deleteVaultMemory = useCallback(async (key: string): Promise<boolean> => {
    if (!window.electronAPI?.agent) return false;
    const success = await window.electronAPI.agent.deleteMemory(key);
    if (success) {
      setMemoryVault(prev => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });
    }
    return success;
  }, []);

  // Record Agent Action for Undo
  const recordAgentAction = useCallback(async (actionReq: {
    stepNumber: number;
    goal: string;
    url: string;
    action: AgentRecordedAction['action'];
  }): Promise<AgentRecordedAction | null> => {
    if (!window.electronAPI?.agent) return null;
    const recorded = await window.electronAPI.agent.recordAction(actionReq);
    setUndoHistory(prev => [recorded, ...prev]);
    return recorded;
  }, []);

  // Execute Undo on Last Action
  const undoLastAction = useCallback(async (): Promise<AgentUndoResult> => {
    if (!window.electronAPI?.agent) {
      return { success: false, actionId: '', error: 'Agent API unavailable' };
    }
    const res = await window.electronAPI.agent.undoLastAction();
    if (res.success) {
      setUndoHistory(prev => prev.filter(a => a.id !== res.actionId));
    }
    return res;
  }, []);

  // Clear Undo History
  const clearUndoHistory = useCallback(async (): Promise<boolean> => {
    if (!window.electronAPI?.agent) return false;
    const success = await window.electronAPI.agent.clearUndoHistory();
    if (success) {
      setUndoHistory([]);
    }
    return success;
  }, []);

  // Sensitive action response
  const respondToPrompt = useCallback(async (decision: SensitiveActionDecision): Promise<boolean> => {
    if (!window.electronAPI?.sensitiveFields) return false;
    const res = await window.electronAPI.sensitiveFields.confirmAction(decision);
    setActivePrompt(null);
    return res;
  }, []);

  // Initial load and listeners
  useEffect(() => {
    refreshMCP();
    refreshVault();

    // Listen for sensitive field prompts
    if (window.electronAPI?.sensitiveFields) {
      const unsub = window.electronAPI.sensitiveFields.onPrompt(prompt => {
        setActivePrompt(prompt);
      });
      return () => unsub();
    }
  }, [refreshMCP, refreshVault]);

  return {
    // MCP
    mcpTools,
    mcpServers,
    isMcpLoading,
    refreshMCP,
    callMCPTool,
    configureMCPServer,

    // Vault
    memoryVault,
    vaultStats,
    refreshVault,
    setVaultMemory,
    deleteVaultMemory,

    // Undo Stack
    undoHistory,
    recordAgentAction,
    undoLastAction,
    clearUndoHistory,

    // Sensitive Field Prompts
    activePrompt,
    respondToPrompt,
  };
}
