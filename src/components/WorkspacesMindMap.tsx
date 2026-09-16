import React, { useState, useEffect } from 'react';

interface Tab {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  isSuspended?: boolean;
}

interface Workspace {
  id: string;
  name: string;
  color: string;
  tabIds: string[];
}

interface WorkspacesMindMapProps {
  tabs: Tab[];
  workspaces: Workspace[];
  onUpdateWorkspaces: (workspaces: Workspace[]) => void;
  onFocusTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNavigate: (url: string) => void;
}

interface WorkspaceDoc {
  id: string;
  title: string;
  content: string;
}

interface TaskItem {
  id: string;
  text: string;
  completed: boolean;
}

interface QuickLink {
  id: string;
  title: string;
  url: string;
}

export function WorkspacesMindMap({
  tabs,
  workspaces,
  onUpdateWorkspaces,
  onFocusTab,
  onCloseTab,
  onNavigate,
}: WorkspacesMindMapProps) {
  // Current active states
  const [activeWsId, setActiveWsId] = useState<string>(() => {
    return workspaces[0]?.id || 'default';
  });
  const [activeDocId, setActiveDocId] = useState<string>('primary');

  // Local storage lists
  const [docs, setDocs] = useState<WorkspaceDoc[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [links, setLinks] = useState<QuickLink[]>([]);

  // Task / Link Input values
  const [newTaskText, setNewTaskText] = useState('');
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  // Auto-redirect if no workspace is active
  useEffect(() => {
    if (workspaces.length > 0 && !workspaces.some(w => w.id === activeWsId)) {
      setActiveWsId(workspaces[0].id);
    }
  }, [workspaces, activeWsId]);

  // Load documents, tasks, and links for active workspace
  useEffect(() => {
    // 1. Documents
    const savedDocs = localStorage.getItem(`ws-docs-${activeWsId}`);
    if (savedDocs) {
      try {
        setDocs(JSON.parse(savedDocs));
      } catch {
        initDefaultDocs();
      }
    } else {
      initDefaultDocs();
    }

    // 2. Tasks
    const savedTasks = localStorage.getItem(`ws-tasks-${activeWsId}`);
    if (savedTasks) {
      try {
        setTasks(JSON.parse(savedTasks));
      } catch {
        setTasks([]);
      }
    } else {
      setTasks([]);
    }

    // 3. Links
    const savedLinks = localStorage.getItem(`ws-links-${activeWsId}`);
    if (savedLinks) {
      try {
        setLinks(JSON.parse(savedLinks));
      } catch {
        setLinks([]);
      }
    } else {
      setLinks([]);
    }
  }, [activeWsId]);

  const initDefaultDocs = () => {
    const mainNotes = localStorage.getItem('gemini-browser-notes') || '';
    const initialDocs: WorkspaceDoc[] = [
      { id: 'primary', title: 'Primary Notes', content: activeWsId === 'default' ? mainNotes : '' }
    ];
    setDocs(initialDocs);
    setActiveDocId('primary');
    localStorage.setItem(`ws-docs-${activeWsId}`, JSON.stringify(initialDocs));
  };

  const activeWs = workspaces.find(w => w.id === activeWsId) || workspaces[0];
  const activeDoc = docs.find(d => d.id === activeDocId) || docs[0];

  // Document actions
  const handleUpdateDocContent = (content: string) => {
    const updated = docs.map(d => (d.id === activeDocId ? { ...d, content } : d));
    setDocs(updated);
    localStorage.setItem(`ws-docs-${activeWsId}`, JSON.stringify(updated));

    // NOTES INTEGRATION: Sync primary note in default workspace to home notes
    if (activeWsId === 'default' && activeDocId === 'primary') {
      localStorage.setItem('gemini-browser-notes', content);
      // Dispatch update event
      window.dispatchEvent(new Event('notes-updated'));
    }
  };

  const handleUpdateDocTitle = (title: string) => {
    const updated = docs.map(d => (d.id === activeDocId ? { ...d, title } : d));
    setDocs(updated);
    localStorage.setItem(`ws-docs-${activeWsId}`, JSON.stringify(updated));
  };

  const handleCreateDocument = () => {
    const title = prompt('Enter document title:', 'New Notes');
    if (!title) return;
    const newDoc: WorkspaceDoc = {
      id: Date.now().toString(),
      title: title.trim(),
      content: ''
    };
    const updated = [...docs, newDoc];
    setDocs(updated);
    setActiveDocId(newDoc.id);
    localStorage.setItem(`ws-docs-${activeWsId}`, JSON.stringify(updated));
  };

  const handleDeleteDocument = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (id === 'primary') {
      alert('Primary Notes document cannot be deleted.');
      return;
    }
    if (confirm('Delete this document?')) {
      const updated = docs.filter(d => d.id !== id);
      setDocs(updated);
      if (activeDocId === id) {
        setActiveDocId('primary');
      }
      localStorage.setItem(`ws-docs-${activeWsId}`, JSON.stringify(updated));
    }
  };

  // Task actions
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;
    const newItem: TaskItem = {
      id: Date.now().toString(),
      text: newTaskText.trim(),
      completed: false
    };
    const updated = [...tasks, newItem];
    setTasks(updated);
    setNewTaskText('');
    localStorage.setItem(`ws-tasks-${activeWsId}`, JSON.stringify(updated));
  };

  const handleToggleTask = (id: string) => {
    const updated = tasks.map(t => (t.id === id ? { ...t, completed: !t.completed } : t));
    setTasks(updated);
    localStorage.setItem(`ws-tasks-${activeWsId}`, JSON.stringify(updated));
  };

  const handleDeleteTask = (id: string) => {
    const updated = tasks.filter(t => t.id !== id);
    setTasks(updated);
    localStorage.setItem(`ws-tasks-${activeWsId}`, JSON.stringify(updated));
  };

  // Links actions
  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkTitle.trim() || !newLinkUrl.trim()) return;
    let url = newLinkUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    const newLink: QuickLink = {
      id: Date.now().toString(),
      title: newLinkTitle.trim(),
      url
    };
    const updated = [...links, newLink];
    setLinks(updated);
    setNewLinkTitle('');
    setNewLinkUrl('');
    localStorage.setItem(`ws-links-${activeWsId}`, JSON.stringify(updated));
  };

  const handleDeleteLink = (id: string) => {
    const updated = links.filter(l => l.id !== id);
    setLinks(updated);
    localStorage.setItem(`ws-links-${activeWsId}`, JSON.stringify(updated));
  };

  // Tab reallocation (moving tabs between workspaces)
  const handleMoveTab = (tabId: string, targetWsId: string) => {
    const updated = workspaces.map(ws => {
      let tabIds = ws.tabIds.filter(id => id !== tabId);
      if (ws.id === targetWsId) {
        if (!tabIds.includes(tabId)) {
          tabIds = [...tabIds, tabId];
        }
      }
      return { ...ws, tabIds };
    });
    onUpdateWorkspaces(updated);
  };

  // Create new tab inside workspace
  const handleAddNewTab = () => {
    const url = prompt('Enter tab URL:', 'https://www.google.com');
    if (url === null) return;
    const targetUrl = url.trim() || 'about:blank';
    
    // Broadcast event to create tab inside current workspace
    window.dispatchEvent(new CustomEvent('workspace-create-tab', {
      detail: { url: targetUrl, workspaceId: activeWsId }
    }));
  };

  const workspaceTabs = activeWs ? tabs.filter(t => activeWs.tabIds.includes(t.id)) : [];

  return (
    <div 
      className="workspace-dashboard-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'radial-gradient(circle at top left, #1e1b18 0%, #0d0c0a 100%)',
        color: '#f4f0ea',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: 'hidden'
      }}
    >
      {/* Header bar */}
      <header 
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          background: 'rgba(25, 24, 22, 0.5)',
          backdropFilter: 'blur(10px)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>💼</span>
          <h2 style={{ fontSize: '15px', fontWeight: 'bold', letterSpacing: '0.5px', margin: 0 }}>
            Workspace Dashboard
          </h2>
        </div>
        <button 
          onClick={() => onNavigate('about:blank')}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#f4f0ea',
            borderRadius: '6px',
            fontSize: '11px',
            padding: '6px 12px',
            cursor: 'pointer',
            fontWeight: '600',
            transition: 'background 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
        >
          Go Back Home
        </button>
      </header>

      {/* Main dashboard splits */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* PANEL 1: Left Workspace/Doc Navigator */}
        <aside 
          style={{
            width: '210px',
            borderRight: '1px solid rgba(255, 255, 255, 0.05)',
            background: 'rgba(15, 14, 12, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            padding: '16px',
            overflowY: 'auto'
          }}
        >
          {/* Workspaces list */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#a39e93', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
              Workspaces
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {workspaces.map(ws => {
                const isActive = ws.id === activeWsId;
                return (
                  <div
                    key={ws.id}
                    onClick={() => setActiveWsId(ws.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: isActive ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
                      border: isActive ? `1px solid ${ws.color}3f` : '1px solid transparent',
                      transition: 'background 0.15s'
                    }}
                  >
                    <span 
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: ws.color,
                        marginRight: '8px',
                        boxShadow: `0 0 8px ${ws.color}`
                      }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: isActive ? '600' : '400', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ws.name}
                    </span>
                    <span style={{ fontSize: '9px', color: '#a39e93', background: 'rgba(255,255,255,0.04)', padding: '1px 5px', borderRadius: '4px' }}>
                      {ws.tabIds.length}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Documents list */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#a39e93', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Documents
              </span>
              <button 
                onClick={handleCreateDocument}
                style={{ background: 'transparent', border: 'none', color: '#c55a44', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', padding: '0 4px' }}
                title="Create document"
              >
                +
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', overflowY: 'auto' }}>
              {docs.map(doc => {
                const isActive = doc.id === activeDocId;
                return (
                  <div
                    key={doc.id}
                    onClick={() => setActiveDocId(doc.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: isActive ? 'rgba(197, 90, 68, 0.08)' : 'transparent',
                      border: isActive ? '1px solid rgba(197, 90, 68, 0.2)' : '1px solid transparent',
                      transition: 'background 0.15s'
                    }}
                  >
                    <span style={{ marginRight: '6px', fontSize: '11px' }}>📄</span>
                    <span style={{ fontSize: '11.5px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isActive ? '#f4f0ea' : '#d2cbb8' }}>
                      {doc.title}
                    </span>
                    {doc.id !== 'primary' && (
                      <button 
                        onClick={(e) => handleDeleteDocument(doc.id, e)}
                        style={{ background: 'transparent', border: 'none', color: '#a39e93', cursor: 'pointer', fontSize: '10px', display: isActive ? 'block' : 'none' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* PANEL 2: Center Editor & Workspace Tabs manager */}
        <main 
          style={{
            flex: 2,
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            overflowY: 'auto'
          }}
        >
          {/* Note Editor Area */}
          <div 
            style={{
              background: 'rgba(25, 24, 22, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.04)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            {activeDoc && (
              <>
                <input
                  type="text"
                  value={activeDoc.title}
                  onChange={e => handleUpdateDocTitle(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    color: '#f4f0ea',
                    fontSize: '15px',
                    fontWeight: 'bold',
                    paddingBottom: '8px',
                    outline: 'none',
                    width: '100%'
                  }}
                  placeholder="Document Title"
                />
                <textarea
                  value={activeDoc.content}
                  onChange={e => handleUpdateDocContent(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f4f0ea',
                    fontSize: '12.5px',
                    lineHeight: '1.6',
                    height: '180px',
                    resize: 'vertical',
                    outline: 'none',
                    width: '100%',
                    fontFamily: 'inherit'
                  }}
                  placeholder="Jot down notes, markdown lists, links or tasks. Saved automatically in this workspace..."
                />
              </>
            )}
          </div>

          {/* Active Tabs Manager in Workspace */}
          <div 
            style={{
              background: 'rgba(25, 24, 22, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.04)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              flex: 1
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🌐</span> Active Tabs in Workspace ({workspaceTabs.length})
              </h3>
              <button 
                onClick={handleAddNewTab}
                style={{
                  background: 'rgba(197, 90, 68, 0.1)',
                  border: '1px solid rgba(197, 90, 68, 0.3)',
                  color: '#f4f0ea',
                  borderRadius: '4px',
                  fontSize: '10.5px',
                  padding: '3px 8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                + New Tab
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', flex: 1, maxHeight: '240px' }}>
              {workspaceTabs.map(tab => (
                <div
                  key={tab.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}
                >
                  <div 
                    onClick={() => onFocusTab(tab.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: '12px' }}>🌐</span>
                    <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '340px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#f4f0ea' }}>
                        {tab.title || 'New Tab'}
                      </span>
                      <span style={{ fontSize: '9.5px', color: '#a39e93', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tab.url}
                      </span>
                    </div>
                  </div>

                  {/* Actions: Move Workspace selector, Close */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <select
                      value={activeWsId}
                      onChange={e => handleMoveTab(tab.id, e.target.value)}
                      style={{
                        background: '#151412',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: '#d2cbb8',
                        borderRadius: '4px',
                        fontSize: '10px',
                        padding: '2px 4px',
                        cursor: 'pointer',
                        outline: 'none'
                      }}
                    >
                      {workspaces.map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>

                    <button
                      onClick={() => onCloseTab(tab.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#a39e93',
                        cursor: 'pointer',
                        fontSize: '11px',
                        padding: '4px'
                      }}
                      title="Close Tab"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              {workspaceTabs.length === 0 && (
                <div style={{ textAlign: 'center', color: '#a39e93', fontSize: '11.5px', padding: '24px 0' }}>
                  No active tabs in this workspace. Create a tab to populate it.
                </div>
              )}
            </div>
          </div>
        </main>

        {/* PANEL 3: Right Sidebar Tasks & Quick Links */}
        <aside 
          style={{
            width: '260px',
            borderLeft: '1px solid rgba(255, 255, 255, 0.05)',
            background: 'rgba(15, 14, 12, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            padding: '16px',
            overflowY: 'auto'
          }}
        >
          {/* Workspace Tasks (To-Do) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#a39e93', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Tasks Checklist
            </div>
            
            <form onSubmit={handleAddTask} style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                value={newTaskText}
                onChange={e => setNewTaskText(e.target.value)}
                placeholder="Add task item..."
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  padding: '6px 8px',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                style={{
                  background: '#c55a44',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '0 10px',
                  fontSize: '11.5px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                +
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', maxHeight: '180px', overflowY: 'auto' }}>
              {tasks.map(task => (
                <div
                  key={task.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 8px',
                    background: 'rgba(255,255,255,0.01)',
                    border: '1px solid rgba(255,255,255,0.02)',
                    borderRadius: '6px'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => handleToggleTask(task.id)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span 
                    style={{
                      fontSize: '11.5px',
                      flex: 1,
                      textDecoration: task.completed ? 'line-through' : 'none',
                      color: task.completed ? '#a39e93' : '#f4f0ea',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {task.text}
                  </span>
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    style={{ background: 'transparent', border: 'none', color: '#a39e93', cursor: 'pointer', fontSize: '10px' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {tasks.length === 0 && (
                <div style={{ textAlign: 'center', color: '#a39e93', fontSize: '10.5px', padding: '12px 0' }}>
                  No tasks recorded for this workspace.
                </div>
              )}
            </div>
          </div>

          {/* Quick Links / Bookmarks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#a39e93', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Workspace Links
            </div>

            <form onSubmit={handleAddLink} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input
                type="text"
                value={newLinkTitle}
                onChange={e => setNewLinkTitle(e.target.value)}
                placeholder="Link Title (e.g. GitHub)"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: '11px',
                  padding: '5px 8px',
                  outline: 'none'
                }}
              />
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={newLinkUrl}
                  onChange={e => setNewLinkUrl(e.target.value)}
                  placeholder="URL (e.g. github.com)"
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    color: '#fff',
                    borderRadius: '6px',
                    fontSize: '11px',
                    padding: '5px 8px',
                    outline: 'none'
                  }}
                />
                <button
                  type="submit"
                  style={{
                    background: '#c55a44',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '6px',
                    padding: '0 12px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  Add
                </button>
              </div>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', maxHeight: '180px', overflowY: 'auto' }}>
              {links.map(link => (
                <div
                  key={link.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 8px',
                    background: 'rgba(255,255,255,0.01)',
                    border: '1px solid rgba(255,255,255,0.02)',
                    borderRadius: '6px',
                    justifyContent: 'space-between'
                  }}
                >
                  <span 
                    onClick={() => onNavigate(link.url)}
                    style={{
                      fontSize: '11.5px',
                      color: 'var(--color-primary, #6366f1)',
                      cursor: 'pointer',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textDecoration: 'underline'
                    }}
                  >
                    {link.title}
                  </span>
                  <button
                    onClick={() => handleDeleteLink(link.id)}
                    style={{ background: 'transparent', border: 'none', color: '#a39e93', cursor: 'pointer', fontSize: '10px' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {links.length === 0 && (
                <div style={{ textAlign: 'center', color: '#a39e93', fontSize: '10.5px', padding: '12px 0' }}>
                  No quick links added yet.
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
