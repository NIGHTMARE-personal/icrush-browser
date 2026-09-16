import React, { useState, useEffect, useRef } from 'react';

export interface NodeItem {
  id: string;
  type: 'note' | 'link' | 'task' | 'ai';
  title: string;
  content: string;
  x: number;
  y: number;
  connections: string[]; // Connected node IDs
  url?: string;
  completed?: boolean;
  aiSummary?: string;
}

interface NodesCanvasProps {
  onNavigate?: (url: string) => void;
}

export function NodesCanvas({ onNavigate }: NodesCanvasProps) {
  const [nodes, setNodes] = useState<NodeItem[]>(() => {
    try {
      const saved = localStorage.getItem('icrush-nodes-graph-data');
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore localStorage parse error
    }
    return [
      {
        id: 'node-1',
        type: 'note',
        title: 'Project Roadmap',
        content: 'System architecture setup, local LLM integrations, and encryption layer.',
        x: 120,
        y: 140,
        connections: ['node-2', 'node-3'],
      },
      {
        id: 'node-2',
        type: 'link',
        title: 'Google AI Studio',
        content: 'Prototyping prompt models and testing system instructions.',
        url: 'https://aistudio.google.com',
        x: 480,
        y: 120,
        connections: [],
      },
      {
        id: 'node-3',
        type: 'ai',
        title: 'Local AI Insight',
        content: 'All node data is stored locally in encrypted SQLite DB. Ollama Qwen 2.5 performs node synthesis offline.',
        x: 320,
        y: 360,
        connections: ['node-2'],
      },
    ];
  });

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState<string | null>(null);
  const [zoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [nodeDragOffset, setNodeDragOffset] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Save nodes to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem('icrush-nodes-graph-data', JSON.stringify(nodes));
    } catch {
      // Ignore localStorage parse error
    }
  }, [nodes]);

  // Handle Dragging Canvas
  const handleMouseDownCanvas = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('nodes-canvas-grid') || (e.target as HTMLElement).tagName === 'svg') {
      setIsDraggingCanvas(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingCanvas) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    } else if (draggingNodeId) {
      setNodes(prev =>
        prev.map(n =>
          n.id === draggingNodeId
            ? {
                ...n,
                x: Math.max(20, Math.round((e.clientX - nodeDragOffset.x - pan.x) / zoom)),
                y: Math.max(20, Math.round((e.clientY - nodeDragOffset.y - pan.y) / zoom)),
              }
            : n
        )
      );
    }
  };

  const handleMouseUp = () => {
    setIsDraggingCanvas(false);
    setDraggingNodeId(null);
  };

  // Node Drag Start
  const handleNodeMouseDown = (e: React.MouseEvent, node: NodeItem) => {
    e.stopPropagation();
    if (connectingNodeId && connectingNodeId !== node.id) {
      // Connect nodes!
      setNodes(prev =>
        prev.map(n => {
          if (n.id === connectingNodeId && !n.connections.includes(node.id)) {
            return { ...n, connections: [...n.connections, node.id] };
          }
          return n;
        })
      );
      setConnectingNodeId(null);
      return;
    }

    setSelectedNodeId(node.id);
    setDraggingNodeId(node.id);
    setNodeDragOffset({
      x: e.clientX - (node.x * zoom + pan.x),
      y: e.clientY - (node.y * zoom + pan.y),
    });
  };

  // Add new Node
  const handleAddNode = (type: 'note' | 'link' | 'task' | 'ai') => {
    const id = `node-${Date.now()}`;
    const newNode: NodeItem = {
      id,
      type,
      title: type === 'link' ? 'New Link Node' : type === 'task' ? 'New Task' : type === 'ai' ? 'AI Summary' : 'New Note',
      content: type === 'link' ? 'https://google.com' : 'Enter node description...',
      x: 200 + Math.random() * 80,
      y: 200 + Math.random() * 80,
      connections: selectedNodeId ? [selectedNodeId] : [],
      url: type === 'link' ? 'https://google.com' : undefined,
      completed: type === 'task' ? false : undefined,
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(id);
  };

  // Delete selected node
  const handleDeleteNode = (id: string) => {
    setNodes(prev =>
      prev
        .filter(n => n.id !== id)
        .map(n => ({
          ...n,
          connections: n.connections.filter(cId => cId !== id),
        }))
    );
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  // Summarize node using Local LLM
  const handleSummarizeNode = (node: NodeItem) => {
    setIsSummarizing(node.id);
    const prompt = `Summarize and synthesize the following node concept for a visual knowledge map in 2 concise sentences:\nTitle: ${node.title}\nContent: ${node.content}`;
    
    let fullResponse = '';
    const removeListener = window.electronAPI.onGeminiResponse((chunk: string) => {
      fullResponse += chunk;
      setNodes(prev =>
        prev.map(n => (n.id === node.id ? { ...n, aiSummary: fullResponse } : n))
      );
    });

    const removeDone = window.electronAPI.onGeminiDone(() => {
      setIsSummarizing(null);
      removeListener();
      removeDone();
    });

    const removeErr = window.electronAPI.onGeminiError(() => {
      setIsSummarizing(null);
      removeListener();
      removeErr();
    });

    window.electronAPI.sendGeminiMessage(prompt, [], 'local', undefined, { forceLocal: true });
  };

  return (
    <div
      ref={containerRef}
      className="nodes-canvas-wrapper"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseDown={handleMouseDownCanvas}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#0c0b0a',
        color: '#f9f6f0',
        overflow: 'hidden',
        userSelect: 'none',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Grid pattern background */}
      <div
        className="nodes-canvas-grid"
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(rgba(212, 175, 55, 0.12) 1px, transparent 1px)',
          backgroundSize: `${32 * zoom}px ${32 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      />

      {/* Floating Top Control Toolbar */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          borderRadius: '9999px',
          backgroundColor: 'rgba(18, 16, 14, 0.88)',
          border: '1px solid rgba(212, 175, 55, 0.25)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6)',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#d4af37', marginRight: '6px' }}>
          Nodes Canvas
        </span>

        <button
          onClick={() => handleAddNode('note')}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: '600',
            borderRadius: '9999px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(255, 255, 255, 0.05)',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Note
        </button>

        <button
          onClick={() => handleAddNode('link')}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: '600',
            borderRadius: '9999px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(255, 255, 255, 0.05)',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          Web Link
        </button>

        <button
          onClick={() => handleAddNode('task')}
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: '600',
            borderRadius: '9999px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(255, 255, 255, 0.05)',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Task
        </button>

        <div style={{ width: '1px', height: '16px', background: 'rgba(255, 255, 255, 0.1)', margin: '0 4px' }} />

        <button
          onClick={() => setPan({ x: 0, y: 0 })}
          style={{
            padding: '6px',
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            color: '#a0aec0',
            cursor: 'pointer',
          }}
          title="Reset View"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
        </button>
      </div>

      {/* SVG Canvas Lines Layer */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      >
        {nodes.map(srcNode =>
          srcNode.connections.map(targetId => {
            const targetNode = nodes.find(n => n.id === targetId);
            if (!targetNode) return null;

            const x1 = srcNode.x * zoom + pan.x + 100 * zoom;
            const y1 = srcNode.y * zoom + pan.y + 60 * zoom;
            const x2 = targetNode.x * zoom + pan.x + 100 * zoom;
            const y2 = targetNode.y * zoom + pan.y + 60 * zoom;

            const dx = Math.abs(x2 - x1) * 0.5;
            const pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

            return (
              <path
                key={`${srcNode.id}-${targetId}`}
                d={pathData}
                fill="none"
                stroke="rgba(212, 175, 55, 0.4)"
                strokeWidth="2.5"
                strokeDasharray="6 4"
              />
            );
          })
        )}
      </svg>

      {/* Nodes Render Container */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          zIndex: 2,
        }}
      >
        {nodes.map(node => {
          const isSelected = selectedNodeId === node.id;
          const isConnecting = connectingNodeId === node.id;

          return (
            <div
              key={node.id}
              onMouseDown={e => handleNodeMouseDown(e, node)}
              style={{
                position: 'absolute',
                left: `${node.x}px`,
                top: `${node.y}px`,
                width: '220px',
                borderRadius: '16px',
                backgroundColor: 'rgba(20, 18, 16, 0.92)',
                border: isSelected
                  ? '1.5px solid #d4af37'
                  : isConnecting
                  ? '1.5px solid #10b981'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: isSelected
                  ? '0 0 20px rgba(212, 175, 55, 0.3)'
                  : '0 8px 30px rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(16px)',
                padding: '14px',
                cursor: 'grab',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                transition: 'border 0.15s, box-shadow 0.15s',
              }}
            >
              {/* Node Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 'bold',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color:
                      node.type === 'link'
                        ? '#60a5fa'
                        : node.type === 'task'
                        ? '#34d399'
                        : node.type === 'ai'
                        ? '#c084fc'
                        : '#d4af37',
                  }}
                >
                  {node.type}
                </span>

                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setConnectingNodeId(isConnecting ? null : node.id);
                    }}
                    style={{
                      background: isConnecting ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                      border: 'none',
                      color: isConnecting ? '#10b981' : '#71717a',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                    title="Connect to another node"
                  >
                    🔗
                  </button>

                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleDeleteNode(node.id);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#71717a',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                    title="Delete Node"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Node Title Input */}
              <input
                type="text"
                value={node.title}
                onChange={e => {
                  const val = e.target.value;
                  setNodes(prev => prev.map(n => (n.id === node.id ? { ...n, title: val } : n)));
                }}
                onMouseDown={e => e.stopPropagation()}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: '700',
                  outline: 'none',
                  width: '100%',
                }}
              />

              {/* Node Content Input */}
              <textarea
                value={node.content}
                onChange={e => {
                  const val = e.target.value;
                  setNodes(prev => prev.map(n => (n.id === node.id ? { ...n, content: val } : n)));
                }}
                onMouseDown={e => e.stopPropagation()}
                rows={2}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '8px',
                  color: '#d6d3d1',
                  fontSize: '11px',
                  outline: 'none',
                  padding: '6px',
                  resize: 'none',
                  fontFamily: 'inherit',
                }}
              />

              {/* Link Navigation button */}
              {node.type === 'link' && node.url && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    if (onNavigate) onNavigate(node.url!);
                  }}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: 'rgba(96, 165, 250, 0.12)',
                    border: '1px solid rgba(96, 165, 250, 0.25)',
                    color: '#60a5fa',
                    fontSize: '10.5px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                >
                  Launch Link ↗
                </button>
              )}

              {/* Local AI Summarize Button */}
              <button
                onClick={e => {
                  e.stopPropagation();
                  handleSummarizeNode(node);
                }}
                disabled={isSummarizing === node.id}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  background: 'rgba(212, 175, 55, 0.1)',
                  border: '1px solid rgba(212, 175, 55, 0.2)',
                  color: '#d4af37',
                  fontSize: '10.5px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  marginTop: '2px',
                }}
              >
                {isSummarizing === node.id ? 'Synthesizing (Qwen)...' : 'Local AI Summary'}
              </button>

              {/* AI Summary Text Box */}
              {node.aiSummary && (
                <div
                  style={{
                    fontSize: '10px',
                    color: '#e9d5ff',
                    background: 'rgba(168, 85, 247, 0.08)',
                    border: '1px solid rgba(168, 85, 247, 0.2)',
                    borderRadius: '6px',
                    padding: '6px',
                    lineHeight: '1.4',
                  }}
                >
                  {node.aiSummary}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
