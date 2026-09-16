import React, { useEffect, useRef } from 'react';

interface InlineAIMenuProps {
  text: string;
  x: number;
  y: number;
  onClose: () => void;
  onAction?: (action: string, text: string) => void;
}

export function InlineAIMenu({ text, x, y, onClose, onAction }: InlineAIMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();
    const handleResize = () => onClose();

    // Delay listener registration to avoid immediate close from the selecting click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [onClose]);

  const handleAction = (action: string) => {
    if (action === 'copy') {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    if (onAction) onAction(action, text);
    onClose();
  };

  const buttons = [
    { action: 'copy', label: 'Copy' },
    { action: 'search', label: 'Search' },
    { action: 'explain', label: 'Explain' },
    { action: 'translate', label: 'Translate' },
    { action: 'ask', label: 'Ask AI' },
  ];

  const adjustedX = Math.min(x, window.innerWidth - 300);
  const adjustedY = y + 8;

  return (
    <div
      ref={menuRef}
      className="inline-ai-menu"
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        zIndex: 2147483647,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '2px',
        padding: '4px 6px',
        background: 'rgba(20, 18, 30, 0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(168, 85, 247, 0.3)',
        borderRadius: '10px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(168,85,247,0.15)',
        animation: 'context-menu-appear 0.15s ease-out',
      }}
    >
      {buttons.map(btn => (
        <button
          key={btn.action}
          className="inline-ai-menu-btn"
          onClick={() => handleAction(btn.action)}
          title={btn.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            border: 'none',
            borderRadius: '6px',
            background: 'transparent',
            color: '#e0d0f0',
            fontSize: '16px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(168, 85, 247, 0.2)';
            (e.currentTarget as HTMLButtonElement).style.color = '#fff';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = '#e0d0f0';
          }}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}
