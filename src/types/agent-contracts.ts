/**
 * Shared Type-Safe Contracts for AI Agent Subsystems
 * Covers: MCP Connectors, Encrypted Memory Vault, Action Undo Stack, and Sensitive Fields.
 */

// ==========================================
// 1. MCP (Model Context Protocol) Contracts
// ==========================================

export type MCPServerType = 'gmail' | 'calendar' | 'slack' | 'stdio' | 'sse' | 'custom';

export interface MCPServerConfig {
  id: string;
  name: string;
  type: MCPServerType;
  enabled: boolean;
  command?: string;
  args?: string[];
  endpointUrl?: string;
  apiKey?: string;
  authUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string[];
  authenticated?: boolean;
  accessToken?: string;
  refreshToken?: string;
  oauthTokens?: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  };
  customHeaders?: Record<string, string>;
}

export interface MCPToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
}

export interface MCPTool {
  id: string;
  serverId: string;
  serverName: string;
  name: string;
  description: string;
  parameters: MCPToolParameter[];
}

export interface MCPToolCallRequest {
  toolId: string;
  serverId: string;
  params: Record<string, unknown>;
}

export interface MCPToolCallResult {
  success: boolean;
  toolId: string;
  output?: unknown;
  error?: string;
  executionTimeMs?: number;
}

// ==========================================
// 2. Encrypted Agent Memory Vault Contracts
// ==========================================

export interface EncryptedMemoryEntry {
  key: string;
  value: string;
  category?: 'user_preference' | 'task_state' | 'auth_hint' | 'workflow' | 'system';
  updatedAt: number;
  isEncrypted: boolean;
}

export interface VaultStats {
  totalKeys: number;
  isEncryptionAvailable: boolean;
  storagePath: string;
  lastUpdated: number;
}

// ==========================================
// 3. Agent Action Undo & Reversible Stack
// ==========================================

export type AgentActionType =
  | 'click'
  | 'type'
  | 'fill_form'
  | 'select'
  | 'navigate'
  | 'press_key'
  | 'scroll';

export interface AgentRecordedAction {
  id: string;
  stepNumber: number;
  goal: string;
  timestamp: number;
  url: string;
  action: {
    type: AgentActionType;
    selector?: string;
    value?: string;
    previousValue?: string;
    keys?: string;
    formFields?: Array<{ selector: string; value: string; previousValue?: string }>;
  };
  undoJsCode?: string;
  canUndo: boolean;
}

export interface AgentUndoResult {
  success: boolean;
  actionId: string;
  undoJsCode?: string;
  error?: string;
}

// ==========================================
// 4. Sensitive Field & Form Confirmation
// ==========================================

export interface SensitiveField {
  selector: string;
  fieldType: 'password' | 'credit_card' | 'ssn' | 'api_key' | 'auth_token' | 'unknown_sensitive';
  label: string;
  placeholder?: string;
}

export interface SensitiveActionPrompt {
  id: string;
  url: string;
  domain: string;
  actionType: 'fill_password' | 'submit_sensitive_form' | 'reveal_token';
  fields: SensitiveField[];
  timestamp: number;
}

export interface SensitiveActionDecision {
  promptId: string;
  approved: boolean;
  rememberDecision?: boolean;
}
