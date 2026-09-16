import React, { useEffect, useRef, useCallback } from 'react';
import type { ContextMenuSettings } from '../utils/storage';

export interface ContextMenuParams {
  x: number;
  y: number;
  linkURL?: string;
  linkText?: string;
  srcURL?: string;
  mediaType?: string;
  selectionText?: string;
  isEditable?: boolean;
  pageURL?: string;
  editFlags?: {
    canCut?: boolean;
    canCopy?: boolean;
    canPaste?: boolean;
    canSelectAll?: boolean;
  };
}

export interface ContextMenuAction {
  type: string;
  data?: string;
}

export interface MenuItem {
  type: 'item' | 'separator' | 'header';
  label?: string;
  icon?: string;
  disabled?: boolean;
  action?: string;
  data?: string;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  onAction: (action: ContextMenuAction) => void;
}

export function buildWebviewMenuItems(
  params: ContextMenuParams,
  canGoBack: boolean,
  canGoForward: boolean,
  settings?: ContextMenuSettings
): MenuItem[] {
  const items: MenuItem[] = [];
  const hasLink = !!params.linkURL;
  const hasImage = params.mediaType === 'image' && !!params.srcURL;
  const hasVideo = params.mediaType === 'video' && !!params.srcURL;
  const hasAudio = params.mediaType === 'audio' && !!params.srcURL;
  const hasSelection = !!params.selectionText && params.selectionText.trim().length > 0;
  const isEditable = !!params.isEditable;

  if (hasLink && (!settings || settings.showLinkActions)) {
    items.push({ type: 'item', label: 'Open Link in New Tab', icon: '↗', action: 'openInNewTab', data: params.linkURL });
    items.push({ type: 'item', label: 'Open Link in Incognito', action: 'openInIncognitoTab', data: params.linkURL });
    items.push({ type: 'item', label: 'Copy Link Address', action: 'copyLink', data: params.linkURL });
    items.push({ type: 'separator' });
  }

  if (hasImage && (!settings || settings.showMediaActions)) {
    items.push({ type: 'item', label: 'Open Image in New Tab', action: 'openImageInNewTab', data: params.srcURL });
    items.push({ type: 'item', label: 'Search with Google Lens', action: 'googleLensImage', data: params.srcURL });
    items.push({ type: 'item', label: 'Copy Image Address', action: 'copyImageUrl', data: params.srcURL });
    items.push({ type: 'item', label: 'Save Image As...', action: 'saveImageAs', data: params.srcURL });
    items.push({ type: 'separator' });
  }

  if (hasVideo && (!settings || settings.showMediaActions)) {
    items.push({ type: 'item', label: 'Copy Video URL', action: 'copyVideoUrl', data: params.srcURL });
    items.push({ type: 'item', label: 'Save Video As...', action: 'saveVideoAs', data: params.srcURL });
    items.push({ type: 'item', label: 'Picture-in-Picture', action: 'pictureInPicture' });
    items.push({ type: 'separator' });
  }

  if (hasAudio && (!settings || settings.showMediaActions)) {
    items.push({ type: 'item', label: 'Copy Audio URL', action: 'copyAudioUrl', data: params.srcURL });
    items.push({ type: 'item', label: 'Save Audio As...', action: 'saveAudioAs', data: params.srcURL });
    items.push({ type: 'separator' });
  }

  if (isEditable && (!settings || settings.showEditActions)) {
    items.push({ type: 'item', label: 'Cut', action: 'cut' });
    items.push({ type: 'item', label: 'Copy', action: 'copy' });
    items.push({ type: 'item', label: 'Paste', action: 'paste' });
    items.push({ type: 'item', label: 'Select All', action: 'selectAll' });
    items.push({ type: 'separator' });
  }

  if (hasSelection && (!settings || settings.showSelectionActions)) {
    items.push({ type: 'header', label: 'Selection' });
    items.push({ type: 'item', label: 'Copy', action: 'copy' });
    const truncated = (params.selectionText || '').length > 20 ? (params.selectionText || '').substring(0, 20) + '...' : params.selectionText || '';
    items.push({ type: 'item', label: `Search "${truncated}"`, action: 'searchGoogle', data: params.selectionText });
    items.push({ type: 'item', label: 'Search with Google Lens', action: 'googleLensText', data: params.selectionText });
    if (params.linkURL) {
      items.push({ type: 'item', label: 'Copy Clean Link', action: 'copyCleanLink', data: params.linkURL });
    }
    items.push({ type: 'separator' });
  }

  if (!hasLink && !hasImage && !hasVideo && !hasAudio && !hasSelection && !isEditable && (!settings || settings.showNavigation)) {
    items.push({ type: 'item', label: 'Back', disabled: !canGoBack, action: 'back' });
    items.push({ type: 'item', label: 'Forward', disabled: !canGoForward, action: 'forward' });
    items.push({ type: 'item', label: 'Reload', action: 'reload' });
    items.push({ type: 'separator' });
  }

  if (!settings || settings.showPageActions) {
    items.push({ type: 'header', label: 'Page' });
    items.push({ type: 'item', label: 'Bookmark Page', action: 'bookmarkPage' });
    items.push({ type: 'item', label: 'Read Aloud', action: 'readAloud' });
    items.push({ type: 'item', label: 'Share Page', action: 'sharePage' });
    items.push({ type: 'item', label: 'QR Code', action: 'qrCode' });
    items.push({ type: 'separator' });
  }

  if (!settings || settings.showAIActions) {
    items.push({ type: 'header', label: 'AI Actions' });
    if (hasSelection) {
      items.push({ type: 'item', label: 'Explain Selection', action: 'aiExplain', data: params.selectionText });
      items.push({ type: 'item', label: 'Translate Selection', action: 'aiTranslate', data: params.selectionText });
    }
    items.push({ type: 'item', label: 'Summarize Page', action: 'aiSummarize' });
    items.push({ type: 'item', label: 'Ask AI Assistant', action: 'aiAsk' });
    items.push({ type: 'separator' });
  }

  if (!settings || settings.showDebugActions) {
    items.push({ type: 'item', label: 'Print...', action: 'print' });
    items.push({ type: 'item', label: 'Inspect Element', action: 'inspect', data: `${params.x},${params.y}` });
  }

  return items;
}

export function ContextMenu({ x, y, items, onClose, onAction }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleScrollOrResize = () => onClose();

    const timer = setTimeout(() => {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('scroll', handleScrollOrResize, true);
      window.addEventListener('resize', handleScrollOrResize);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [onClose]);

  const handleAction = useCallback((type: string, data?: string) => {
    onAction({ type, data });
    onClose();
  }, [onAction, onClose]);

  const adjustedX = Math.min(x, window.innerWidth - 260);
  const adjustedY = Math.min(y, window.innerHeight - Math.min(items.length * 32 + 20, 500));

  return (
    <>
      {/* Transparent overlay to catch clicks anywhere, including inside webviews */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          left: adjustedX,
          top: adjustedY,
          zIndex: 10000,
        minWidth: 230,
        maxWidth: 290,
        background: 'rgba(16, 16, 22, 0.96)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid #1f1f2e',
        borderRadius: 10,
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.03)',
        padding: 4,
        fontFamily: "'Inter', -apple-system, sans-serif",
        fontSize: 12,
        color: '#f3f4f6',
        animation: 'context-menu-appear 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {items.map((item, i) => {
        if (item.type === 'separator') {
          return <div key={i} style={{ height: 1, background: '#1f1f2e', margin: '3px 6px' }} />;
        }
        if (item.type === 'header') {
          return (
            <div key={i} style={{ padding: '4px 10px 2px', fontSize: 10, fontWeight: 600, color: '#6b7280', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {item.label}
            </div>
          );
        }
        return (
          <div
            key={i}
            onClick={() => { if (!item.disabled && item.action) handleAction(item.action, item.data); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 10px',
              borderRadius: 6,
              cursor: item.disabled ? 'default' : 'pointer',
              opacity: item.disabled ? 0.35 : 1,
              color: '#9ca3af',
              transition: 'background 0.12s ease, color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                e.currentTarget.style.background = 'rgba(124, 58, 237, 0.1)';
                e.currentTarget.style.color = '#f3f4f6';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#9ca3af';
            }}
          >
            {item.icon && <span style={{ width: 16, textAlign: 'center', flexShrink: 0, fontSize: 13 }}>{item.icon}</span>}
            <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{item.label}</span>
          </div>
        );
      })}
    </div>
    </>
  );
}
