// import '@testing-library/jest-dom';
import { vi, beforeAll, afterAll } from 'vitest';

// Mock electronAPI for tests
const mockElectronAPI = {
  sendGeminiMessage: vi.fn(),
  onGeminiResponse: vi.fn(cb => {
    cb('test');
    return () => {};
  }),
  onGeminiDone: vi.fn(cb => {
    cb();
    return () => {};
  }),
  onGeminiError: vi.fn(cb => {
    cb('error');
    return () => {};
  }),
  onExecuteCommand: vi.fn(() => {
    return () => {};
  }),
  groupTabs: vi.fn().mockResolvedValue([]),
  executeAgentStep: vi.fn().mockResolvedValue({ thought: '', action: 'finish' as const }),
  getEnvApiKey: vi.fn().mockResolvedValue(undefined),
  extensions: {
    selectDirectory: vi.fn().mockResolvedValue(null),
    loadExtension: vi.fn().mockResolvedValue({}),
    removeExtension: vi.fn().mockResolvedValue(undefined),
    toggleExtension: vi.fn().mockResolvedValue([]),
    getExtensions: vi.fn().mockResolvedValue([]),
  },
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

// Mock localStorage and sessionStorage
// JSDOM has native mock implementations, so we don't override them unless necessary.

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
  writable: true,
});

// Suppress console.error in tests unless needed
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (args[0]?.includes?.('Warning: ReactDOM.render is no longer supported')) return;
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
