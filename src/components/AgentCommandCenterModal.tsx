import React, { useState, useEffect } from 'react';

interface Skill {
  id: string;
  name: string;
  description: string;
  goal: string;
  steps?: string;
  createdAt: number;
}

interface MemoryStats {
  totalKeys: number;
  isEncryptionAvailable: boolean;
  storagePath: string;
  lastUpdated: number;
}

interface MCPServer {
  id: string;
  name: string;
  type: string;
  isConnected: boolean;
  authUrl?: string;
}

interface AgentCommandCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunSkillGoal?: (goal: string) => void;
}

/* ─────────────────────────────────────────────────────────────
   Crisp SVG Line Icons (No Emojis - Strawberry Minimalist Style)
   ───────────────────────────────────────────────────────────── */

const IconBolt = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const IconShieldLock = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <rect x="9" y="10" width="6" height="5" rx="1" />
    <path d="M10 10V8a2 2 0 0 1 4 0v2" />
  </svg>
);

const IconCpu = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <line x1="9" y1="1" x2="9" y2="4" />
    <line x1="15" y1="1" x2="15" y2="4" />
    <line x1="9" y1="20" x2="9" y2="23" />
    <line x1="15" y1="20" x2="15" y2="23" />
    <line x1="20" y1="9" x2="23" y2="9" />
    <line x1="20" y1="15" x2="23" y2="15" />
    <line x1="1" y1="9" x2="4" y2="9" />
    <line x1="1" y1="15" x2="4" y2="15" />
  </svg>
);

const IconLayers = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const IconClock = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconPlay = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const IconTrash = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconPlus = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconRefresh = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const IconSearch = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export function AgentCommandCenterModal({
  isOpen,
  onClose,
  onRunSkillGoal,
}: AgentCommandCenterModalProps) {
  const [activeTab, setActiveTab] = useState<'skills' | 'memory' | 'mcp' | 'subagents' | 'scheduler'>('skills');

  // Skills State
  const [skills, setSkills] = useState<Skill[]>([]);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillGoal, setNewSkillGoal] = useState('');
  const [isAddingSkill, setIsAddingSkill] = useState(false);

  // Memory Vault State
  const [memoryEntries, setMemoryEntries] = useState<Record<string, any>>({});
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);
  const [newMemKey, setNewMemKey] = useState('');
  const [newMemVal, setNewMemVal] = useState('');
  const [memSearchQuery, setMemSearchQuery] = useState('');

  // MCP Servers State
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);

  // Sub-agent Workers State
  const [subAgentTasks, setSubAgentTasks] = useState<Array<{
    id: string;
    name: string;
    status: string;
    progress: number;
    goal: string;
  }>>([]);

  // Scheduler State
  const [schedules, setSchedules] = useState<Array<{
    id: string;
    title: string;
    cron: string;
    enabled: boolean;
    lastRun?: string;
  }>>([]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      if (window.electronAPI?.agent) {
        const loadedSkills = await window.electronAPI.agent.getSkills();
        setSkills(loadedSkills || []);

        const mem = await window.electronAPI.agent.getMemory();
        setMemoryEntries(mem || {});

        const stats = await window.electronAPI.agent.getMemoryStats();
        setMemoryStats(stats || null);
      }

      if (window.electronAPI?.mcp) {
        const servers = await window.electronAPI.mcp.getServers();
        setMcpServers(
          servers?.map((s: any) => ({
            id: s.id,
            name: s.name,
            type: s.type || 'stdio',
            isConnected: Boolean(s.connected || s.status === 'connected'),
          })) || []
        );
      }

      // Default mock state for subagents and scheduler
      setSubAgentTasks([
        { id: 'sub-1', name: 'Background Research Worker', status: 'idle', progress: 100, goal: 'Index latest web trends' },
        { id: 'sub-2', name: 'Form Automation Worker', status: 'ready', progress: 0, goal: 'Autofill secure login fields' },
      ]);

      setSchedules([
        { id: 'sched-1', title: 'Morning AI News Digest', cron: '0 8 * * *', enabled: true, lastRun: 'Today, 08:00 AM' },
        { id: 'sched-2', title: 'Weekly Memory Compaction', cron: '0 0 * * 0', enabled: true, lastRun: 'Last Sunday' },
      ]);
    } catch (err) {
      console.warn('Failed to load Aura Nexus Engine data:', err);
    }
  };

  const handleCreateSkill = async () => {
    if (!newSkillName || !newSkillGoal) return;
    try {
      if (window.electronAPI?.agent) {
        const created = await window.electronAPI.agent.saveSkill({
          name: newSkillName,
          description: newSkillDesc,
          goal: newSkillGoal,
          steps: '',
        });
        setSkills(prev => [...prev, created]);
      } else {
        const mock: Skill = {
          id: 'skill-' + Date.now(),
          name: newSkillName,
          description: newSkillDesc,
          goal: newSkillGoal,
          steps: '',
          createdAt: Date.now(),
        };
        setSkills(prev => [...prev, mock]);
      }
      setNewSkillName('');
      setNewSkillDesc('');
      setNewSkillGoal('');
      setIsAddingSkill(false);
    } catch (err) {
      console.error('Failed to create skill:', err);
    }
  };

  const handleDeleteSkill = async (id: string) => {
    try {
      if (window.electronAPI?.agent) {
        await window.electronAPI.agent.deleteSkill(id);
      }
      setSkills(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('Failed to delete skill:', err);
    }
  };

  const handleRunSkill = async (skill: Skill) => {
    if (onRunSkillGoal) {
      onRunSkillGoal(`Agent: ${skill.goal}`);
      onClose();
    }
  };

  const handleSaveMemory = async () => {
    if (!newMemKey || !newMemVal) return;
    try {
      if (window.electronAPI?.agent) {
        await window.electronAPI.agent.setMemory(newMemKey, newMemVal, 'user_preference');
      }
      setMemoryEntries(prev => ({ ...prev, [newMemKey]: newMemVal }));
      setNewMemKey('');
      setNewMemVal('');
    } catch (err) {
      console.error('Failed to save memory:', err);
    }
  };

  const handleDeleteMemory = async (key: string) => {
    try {
      if (window.electronAPI?.agent) {
        await window.electronAPI.agent.deleteMemory(key);
      }
      setMemoryEntries(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (err) {
      console.error('Failed to delete memory:', err);
    }
  };

  if (!isOpen) return null;

  const filteredMemoryKeys = Object.keys(memoryEntries).filter(k =>
    k.toLowerCase().includes(memSearchQuery.toLowerCase()) ||
    String(memoryEntries[k]).toLowerCase().includes(memSearchQuery.toLowerCase())
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(5, 5, 8, 0.8)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        style={{
          width: '920px',
          height: '660px',
          maxHeight: '90vh',
          background: 'rgba(12, 12, 16, 0.98)',
          border: '1px solid rgba(212, 175, 55, 0.25)',
          borderRadius: '24px',
          boxShadow: '0 32px 80px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#e5e5e5',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* ─── Header ─── */}
        <header
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(18, 18, 24, 0.8)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #d4af37, #f2ca50)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#000000',
                boxShadow: '0 0 16px rgba(212, 175, 55, 0.4)',
              }}
            >
              <IconCpu />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontFamily: 'Playfair Display, Georgia, serif',
                    fontSize: '17px',
                    fontWeight: '700',
                    color: '#ffffff',
                    letterSpacing: '0.02em',
                  }}
                >
                  Aura Nexus Engine
                </span>
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: '800',
                    textTransform: 'uppercase',
                    letterSpacing: '0.18em',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#10b981',
                  }}
                >
                  Active Core
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#71717a', letterSpacing: '0.02em', marginTop: '1px' }}>
                Agent Skills • Encrypted DPAPI Vault • MCP Matrix • Worker Monitor
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#a1a1aa',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
              e.currentTarget.style.color = '#f87171';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.color = '#a1a1aa';
            }}
            title="Close"
          >
            <IconClose />
          </button>
        </header>

        {/* ─── Strawberry Segmented Tab Navigation ─── */}
        <nav
          style={{
            padding: '10px 24px',
            background: 'rgba(10, 10, 14, 0.7)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {[
            { id: 'skills', label: 'Agent Skills', icon: <IconBolt /> },
            { id: 'memory', label: 'DPAPI Memory Vault', icon: <IconShieldLock /> },
            { id: 'mcp', label: 'MCP Connectors', icon: <IconCpu /> },
            { id: 'subagents', label: 'Worker Pool', icon: <IconLayers /> },
            { id: 'scheduler', label: 'Task Scheduler', icon: <IconClock /> },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '9999px',
                background: activeTab === tab.id ? 'rgba(212, 175, 55, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                border: activeTab === tab.id ? '1px solid rgba(212, 175, 55, 0.45)' : '1px solid rgba(255, 255, 255, 0.06)',
                color: activeTab === tab.id ? '#f2ca50' : '#a1a1aa',
                fontSize: '12px',
                fontWeight: '600',
                letterSpacing: '0.02em',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* ─── Tab Content Area ─── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* TAB 1: SKILLS */}
          {activeTab === 'skills' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff', letterSpacing: '0.01em', margin: 0 }}>
                    Workflow Skills & Automations
                  </h3>
                  <div style={{ fontSize: '12px', color: '#71717a', marginTop: '2px' }}>
                    Saved reusable multi-step browser tasks executed autonomously by the agent.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAddingSkill(!isAddingSkill)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#d4af37',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '8px 14px',
                    color: '#000000',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    letterSpacing: '0.02em',
                  }}
                >
                  <IconPlus />
                  <span>{isAddingSkill ? 'Cancel' : 'Create Skill'}</span>
                </button>
              </div>

              {isAddingSkill && (
                <div
                  style={{
                    background: 'rgba(24, 24, 32, 0.95)',
                    border: '1px solid rgba(212, 175, 55, 0.3)',
                    borderRadius: '16px',
                    padding: '18px',
                    marginBottom: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.24em', color: '#d4af37' }}>
                    Define New Autonomous Skill
                  </div>
                  <input
                    type="text"
                    placeholder="Skill Name (e.g. Amazon Price Comparator)"
                    value={newSkillName}
                    onChange={e => setNewSkillName(e.target.value)}
                    style={{
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      color: '#fff',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Short Description"
                    value={newSkillDesc}
                    onChange={e => setNewSkillDesc(e.target.value)}
                    style={{
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      color: '#fff',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                  <textarea
                    placeholder="Autonomous Execution Goal (e.g. Navigate to amazon.com, search for query, extract prices, and summarize top reviews)"
                    value={newSkillGoal}
                    onChange={e => setNewSkillGoal(e.target.value)}
                    rows={3}
                    style={{
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      color: '#fff',
                      fontSize: '13px',
                      outline: 'none',
                      resize: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleCreateSkill}
                    style={{
                      alignSelf: 'flex-end',
                      background: '#d4af37',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '8px 18px',
                      color: '#000000',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    Save Skill
                  </button>
                </div>
              )}

              {skills.length === 0 && !isAddingSkill ? (
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px dashed rgba(255, 255, 255, 0.1)',
                    borderRadius: '16px',
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: '#71717a',
                  }}
                >
                  <div style={{ marginBottom: '10px' }}><IconBolt /></div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#d4d4d8' }}>No Workflow Skills Recorded</div>
                  <div style={{ fontSize: '11px', color: '#71717a', marginTop: '4px' }}>
                    Click &apos;Create Skill&apos; to register automated workflows for the browser agent.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
                  {skills.map(skill => (
                    <div
                      key={skill.id}
                      style={{
                        background: 'rgba(24, 24, 32, 0.7)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '16px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '14px', fontWeight: '700', color: '#ffffff' }}>{skill.name}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteSkill(skill.id)}
                            style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer' }}
                            title="Delete Skill"
                          >
                            <IconTrash />
                          </button>
                        </div>
                        <div style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '6px', lineHeight: '1.4' }}>
                          {skill.description || skill.goal}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <span style={{ fontSize: '10px', color: '#71717a' }}>
                          {new Date(skill.createdAt).toLocaleDateString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRunSkill(skill)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'rgba(212, 175, 55, 0.15)',
                            border: '1px solid rgba(212, 175, 55, 0.4)',
                            borderRadius: '8px',
                            padding: '5px 12px',
                            color: '#d4af37',
                            fontSize: '11px',
                            fontWeight: '700',
                            cursor: 'pointer',
                          }}
                        >
                          <IconPlay />
                          <span>Execute</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DPAPI MEMORY VAULT */}
          {activeTab === 'memory' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff', letterSpacing: '0.01em', margin: 0 }}>
                    Encrypted DPAPI Memory Vault
                  </h3>
                  <div style={{ fontSize: '12px', color: '#71717a', marginTop: '2px' }}>
                    Hardware-backed Windows DPAPI AES-256 encrypted storage for learned user facts.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      padding: '4px 10px',
                    }}
                  >
                    <IconSearch />
                    <input
                      type="text"
                      placeholder="Search Vault..."
                      value={memSearchQuery}
                      onChange={e => setMemSearchQuery(e.target.value)}
                      style={{ background: 'none', border: 'none', color: '#fff', fontSize: '11px', outline: 'none', width: '130px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Add Key/Value Card */}
              <div
                style={{
                  background: 'rgba(24, 24, 32, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  padding: '16px',
                  marginBottom: '20px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center',
                }}
              >
                <input
                  type="text"
                  placeholder="Key (e.g. user_preference_theme)"
                  value={newMemKey}
                  onChange={e => setNewMemKey(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#fff',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
                <input
                  type="text"
                  placeholder="Value"
                  value={newMemVal}
                  onChange={e => setNewMemVal(e.target.value)}
                  style={{
                    flex: 2,
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#fff',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={handleSaveMemory}
                  style={{
                    background: '#d4af37',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    color: '#000000',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Add Fact
                </button>
              </div>

              {/* Vault Records Table */}
              <div
                style={{
                  background: 'rgba(18, 18, 24, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '16px',
                  overflow: 'hidden',
                }}
              >
                {filteredMemoryKeys.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#71717a', fontSize: '12px' }}>
                    No matching encrypted keys in vault.
                  </div>
                ) : (
                  filteredMemoryKeys.map(key => (
                    <div
                      key={key}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#f2ca50', fontFamily: 'monospace' }}>
                          {key}
                        </span>
                        <span style={{ fontSize: '12px', color: '#a1a1aa' }}>
                          {String(memoryEntries[key])}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteMemory(key)}
                        style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer' }}
                        title="Delete from Vault"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: MCP CONNECTORS */}
          {activeTab === 'mcp' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff', letterSpacing: '0.01em', margin: 0 }}>
                    Model Context Protocol (MCP) Hub
                  </h3>
                  <div style={{ fontSize: '12px', color: '#71717a', marginTop: '2px' }}>
                    Standard protocol tools connecting external data feeds, APIs, and local services.
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
                {[
                  { id: 'google-workspace', name: 'Google Workspace (Gmail & Calendar)', type: 'oauth', connected: true },
                  { id: 'slack-mcp', name: 'Slack Team Communications', type: 'oauth', connected: false },
                  { id: 'filesystem-stdio', name: 'Local File System Protocol', type: 'stdio', connected: true },
                  { id: 'github-mcp', name: 'GitHub Code Repository Tools', type: 'oauth', connected: false },
                ].map(server => (
                  <div
                    key={server.id}
                    style={{
                      background: 'rgba(24, 24, 32, 0.7)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '16px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#ffffff' }}>{server.name}</span>
                        <span
                          style={{
                            fontSize: '9px',
                            fontWeight: '700',
                            padding: '2px 6px',
                            borderRadius: '9999px',
                            background: server.connected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                            color: server.connected ? '#10b981' : '#71717a',
                          }}
                        >
                          {server.connected ? 'Connected' : 'Offline'}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#71717a', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                        Protocol: {server.type}
                      </div>
                    </div>

                    <button
                      type="button"
                      style={{
                        marginTop: '16px',
                        background: server.connected ? 'rgba(255, 255, 255, 0.06)' : 'rgba(212, 175, 55, 0.15)',
                        border: server.connected ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(212, 175, 55, 0.4)',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        color: server.connected ? '#d4d4d8' : '#d4af37',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      {server.connected ? 'Configure Bridge' : 'Authorize OAuth'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: WORKER POOL */}
          {activeTab === 'subagents' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff', letterSpacing: '0.01em', margin: 0 }}>
                    Sub-Agent Pool Monitor
                  </h3>
                  <div style={{ fontSize: '12px', color: '#71717a', marginTop: '2px' }}>
                    Real-time concurrency manager and background worker execution slots.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {subAgentTasks.map(task => (
                  <div
                    key={task.id}
                    style={{
                      background: 'rgba(24, 24, 32, 0.7)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '16px',
                      padding: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#ffffff' }}>{task.name}</span>
                        <span style={{ fontSize: '10px', color: '#71717a', fontFamily: 'monospace' }}>({task.id})</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '4px' }}>
                        {task.goal}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          padding: '3px 8px',
                          borderRadius: '9999px',
                          background: task.status === 'idle' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(212, 175, 55, 0.15)',
                          color: task.status === 'idle' ? '#10b981' : '#f2ca50',
                        }}
                      >
                        {task.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: TASK SCHEDULER */}
          {activeTab === 'scheduler' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#ffffff', letterSpacing: '0.01em', margin: 0 }}>
                    Autonomous Cron Task Scheduler
                  </h3>
                  <div style={{ fontSize: '12px', color: '#71717a', marginTop: '2px' }}>
                    Recurring background cron schedules for automated web data scraping and digest reporting.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {schedules.map(sched => (
                  <div
                    key={sched.id}
                    style={{
                      background: 'rgba(24, 24, 32, 0.7)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '16px',
                      padding: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#ffffff' }}>{sched.title}</span>
                        <span style={{ fontSize: '10px', color: '#d4af37', fontFamily: 'monospace', background: 'rgba(212, 175, 55, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                          {sched.cron}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#71717a', marginTop: '4px' }}>
                        Last Run: {sched.lastRun}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '8px',
                          padding: '5px 12px',
                          color: '#fff',
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer',
                        }}
                      >
                        Trigger Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
