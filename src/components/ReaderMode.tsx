import React, { useState, useEffect, useRef, useCallback } from 'react';

interface ReaderModeProps {
  webview: Electron.WebviewTag | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ReaderMode({ webview, isOpen, onClose }: ReaderModeProps) {
  const [content, setContent] = useState<{ title: string; html: string; url?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [fontFamily, setFontFamily] = useState<'serif' | 'sans-serif' | 'monospace'>('serif');
  const [theme, setTheme] = useState<'light' | 'dark' | 'sepia'>('light');
  const [width, setWidth] = useState<'narrow' | 'medium' | 'wide'>('medium');
  const [showControls, setShowControls] = useState(true);
  const readerRef = useRef<HTMLDivElement>(null);

  const extractContent = useCallback(async () => {
    if (!webview) return;
    setLoading(true);
    
    try {
      // Use Mozilla Readability algorithm via webview.executeJavaScript
      const readabilityScript = `
        (() => {
          // Simple readability extraction
          const documentClone = document.cloneNode(true);
          
          // Remove scripts, styles, nav, footer, aside, etc.
          const removeSelectors = [
            'script', 'style', 'nav', 'footer', 'aside', 
            '.ad', '.ads', '.advertisement', '.sidebar',
            '.header', '.footer', '.nav', '.menu',
            '[role="banner"]', '[role="navigation"]',
            '[role="complementary"]', '[role="contentinfo"]'
          ];
          
          removeSelectors.forEach(sel => {
            documentClone.querySelectorAll(sel).forEach(el => el.remove());
          });
          
          // Try to find main content
          let content = documentClone.querySelector('article') ||
                       documentClone.querySelector('[role="main"]') ||
                       documentClone.querySelector('main') ||
                       documentClone.querySelector('#content') ||
                       documentClone.querySelector('.content') ||
                       documentClone.querySelector('.post') ||
                       documentClone.querySelector('.article') ||
                       documentClone.querySelector('#main') ||
                       documentClone.body;
          
          if (content) {
            // Clean up
            content.querySelectorAll('script, style, nav, footer, aside, .ad, .ads, .advertisement, .sidebar, .header, .footer, .nav, .menu, [role="banner"], [role="navigation"], [role="complementary"], [role="contentinfo"]').forEach(el => el.remove());
            
            // Get text content and HTML
            const text = content.innerText || content.textContent || '';
            const html = content.innerHTML || '';
            
            return {
              title: document.title,
              text: text.trim(),
              html: html.trim(),
              url: window.location.href
            };
          }
          return null;
        })()
      `;
      
      const result = await webview!.executeJavaScript(readabilityScript);
      if (result) {
        setContent(result);
      }
    } catch (err) {
      console.error('Reader mode extraction failed:', err);
    } finally {
      setLoading(false);
    }
  }, [webview]);

  useEffect(() => {
    if (isOpen) {
      extractContent();
    }
  }, [isOpen, webview, extractContent]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleClose = () => {
    onClose();
  };

  const handleFontSizeChange = (delta: number) => {
    setFontSize(prev => Math.max(12, Math.min(prev + delta, 32)));
  };

  const handleFontFamilyChange = (family: 'serif' | 'sans-serif' | 'monospace') => {
    setFontFamily(family);
  };

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'sepia') => {
    setTheme(newTheme);
  };

  const handleWidthChange = (width: 'narrow' | 'medium' | 'wide') => {
    setWidth(width);
  };

  const toggleControls = () => {
    setShowControls(!showControls);
  };

  const getThemeStyles = () => {
    const themes = {
      light: { bg: '#ffffff', text: '#1a1a2e', link: '#2563eb', border: '#e5e7eb' },
      dark: { bg: '#1a1a2e', text: '#f3f4f6', link: '#60a5fa', border: '#374151' },
      sepia: { bg: '#fdf6e3', text: '#3c2e2e', link: '#8b4513', border: '#d4c4a8' }
    };
    return themes[theme];
  };

  const getWidthStyles = () => {
    const widths = {
      narrow: '600px',
      medium: '800px',
      wide: '1000px'
    };
    return { maxWidth: widths[width] };
  };

  const getFontStyles = () => ({
    fontSize: `${fontSize}px`,
    fontFamily: fontFamily === 'serif' ? 'Georgia, serif' : fontFamily === 'sans-serif' ? 'system-ui, -apple-system, sans-serif' : 'Monaco, monospace',
  });

  const themeStyles = getThemeStyles();
  const widthStyles = getWidthStyles();
  const fontStyles = getFontStyles();

  if (!isOpen) return null;

  return (
    <div className="reader-mode-overlay" onClick={onClose}>
      <div 
        ref={readerRef}
        className="reader-mode-container"
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: themeStyles.bg,
          color: themeStyles.text,
          maxWidth: widthStyles.maxWidth,
          fontFamily: fontStyles.fontFamily,
          fontSize: fontStyles.fontSize,
          lineHeight: 1.7,
        }}
      >
        {/* Top Bar */}
        <div className="reader-top-bar" style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          padding: '12px 20px',
          borderBottom: `1px solid ${themeStyles.border}`,
          position: 'sticky',
          top: 0,
          backgroundColor: themeStyles.bg,
          zIndex: 10,
        }}>
          <div className="reader-title" style={{ flex: 1, textAlign: 'center' }}>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: themeStyles.text }}>
              {content?.title || 'Reader Mode'}
            </h1>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {content?.url ? new URL(content.url).hostname : ''}
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Font Size */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={() => handleFontSizeChange(-2)} title="Smaller" style={buttonStyle}>A-</button>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: '40px', textAlign: 'center' }}>{fontSize}px</span>
              <button onClick={() => handleFontSizeChange(2)} title="Larger" style={buttonStyle}>A+</button>
            </div>

            {/* Font Family */}
            <select value={fontFamily} onChange={e => handleFontFamilyChange(e.target.value as 'serif' | 'sans-serif' | 'monospace')} style={selectStyle}>
              <option value="serif">Serif</option>
              <option value="sans-serif">Sans-Serif</option>
              <option value="monospace">Monospace</option>
            </select>

            {/* Theme */}
            <select value={theme} onChange={e => handleThemeChange(e.target.value as 'light' | 'dark' | 'sepia')} style={selectStyle}>
              <option value="light">☀️ Light</option>
              <option value="dark">🌙 Dark</option>
              <option value="sepia">📜 Sepia</option>
            </select>

            {/* Width */}
            <select value={width} onChange={e => handleWidthChange(e.target.value as 'narrow' | 'medium' | 'wide')} style={selectStyle}>
              <option value="narrow">Narrow</option>
              <option value="medium">Medium</option>
              <option value="wide">Wide</option>
            </select>

            <button onClick={toggleControls} style={buttonStyle} title="Toggle Controls (T)">
              {showControls ? '👁' : '👁‍🗨'}
            </button>

            <button onClick={handleClose} style={{...buttonStyle, color: 'var(--text-danger)'}} title="Exit Reader Mode (Esc)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div 
          className="reader-content"
          style={{ 
            padding: '40px 60px',
            maxWidth: '100%',
            overflow: 'auto',
          }}
        >
          {content ? (
            <article>
              <header style={{ marginBottom: '2rem', paddingBottom: '1rem', borderBottom: `1px solid ${themeStyles.border}` }}>
                <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '2.5rem', fontWeight: 700, lineHeight: 1.2, color: themeStyles.text }}>
                  {content.title}
                </h1>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  {content.url ? new URL(content.url).hostname : ''}
                </div>
              </header>
              <div 
                className="reader-body"
                dangerouslySetInnerHTML={{ __html: content.html }}
                style={{ fontSize: '1.1rem', lineHeight: 1.8, color: themeStyles.text }}
              />
            </article>
          ) : loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div className="reader-spinner" style={{ 
                width: '40px', height: '40px', border: '3px solid var(--border-light)', 
                borderTopColor: 'var(--color-primary)', borderRadius: '50%', 
                animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
              <p>Extracting article content...</p>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '16px', opacity: 0.5 }}>
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M18 19.5A2.5 2.5 0 0 0 21.5 17H4" />
                <path d="M12 2v20" />
              </svg>
              <p style={{ fontSize: '1.1rem', marginBottom: '8px' }}>No readable content found</p>
              <p style={{ fontSize: '0.9rem', opacity: 0.7 }}>This page doesn't have extractable article content.</p>
            </div>
          )}
        </div>

        {/* Keyboard hints */}
        <div style={{ 
          position: 'absolute', 
          bottom: '20px', 
          left: '50%', 
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '16px',
          fontSize: '11px',
          color: 'var(--text-muted)',
          opacity: showControls ? 1 : 0,
          transition: 'opacity 0.2s',
          pointerEvents: 'none',
        }}>
          <kbd style={kbdStyle}>Esc</kbd> <span>Exit</span>
          <kbd style={kbdStyle}>+/-</kbd> <span>Zoom</span>
          <kbd style={kbdStyle}>T</kbd> <span>Theme</span>
          <kbd style={kbdStyle}>W</kbd> <span>Width</span>
          <kbd style={kbdStyle}>F</kbd> <span>Font</span>
        </div>
      </div>
    </div>
  );
}

const buttonStyle = {
  padding: '6px 12px',
  borderRadius: '6px',
  background: 'transparent',
  border: '1px solid var(--border-light)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 500,
  transition: 'all 0.15s',
} as React.CSSProperties;

const selectStyle = {
  padding: '4px 8px',
  borderRadius: '4px',
  background: 'var(--bg-deep)',
  border: '1px solid var(--border-light)',
  color: 'var(--text-primary)',
  fontSize: '11px',
  cursor: 'pointer',
} as React.CSSProperties;

const kbdStyle = {
  padding: '2px 6px',
  borderRadius: '4px',
  background: 'var(--bg-deep)',
  border: '1px solid var(--border-light)',
  fontFamily: 'monospace',
  fontSize: '10px',
} as React.CSSProperties;

export default ReaderMode;