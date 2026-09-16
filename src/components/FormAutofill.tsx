import React, { useState, useEffect, useCallback } from 'react';

interface FormAutofillProps {
  webview: Electron.WebviewTag | null;
  currentUrl: string;
}

interface DetectedField {
  type: 'username' | 'password';
  selector: string;
}

interface PasswordEntry {
  id: string;
  url: string;
  username: string;
  title?: string;
  password?: string; // Optional: only available when vault is unlocked
}

export function FormAutofill({ webview, currentUrl }: FormAutofillProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [credentials, setCredentials] = useState<PasswordEntry[]>([]);
  const [detectedFields, setDetectedFields] = useState<DetectedField[]>([]);
  const [hostname, setHostname] = useState('');

  const detectFormFields = useCallback(async () => {
    if (!webview || !currentUrl) return;
    try {
      const domain = new URL(currentUrl).hostname;
      setHostname(domain);

      const fields = await webview.executeJavaScript(`
        (() => {
          const fields = [];
          const inputs = document.querySelectorAll('input');
          inputs.forEach(input => {
            const type = input.type?.toLowerCase();
            const name = (input.name || '').toLowerCase();
            const id = (input.id || '').toLowerCase();
            const autocomplete = (input.autocomplete || '').toLowerCase();
            const placeholder = (input.placeholder || '').toLowerCase();
            
            if (type === 'password' || name.includes('pass') || id.includes('pass')) {
              fields.push({ type: 'password', selector: input.id ? '#' + input.id : input.name ? '[name="' + input.name + '"]' : null });
            } else if (type === 'email' || type === 'text' || type === 'tel') {
              if (name.includes('user') || name.includes('login') || name.includes('email') || name.includes('account') ||
                  id.includes('user') || id.includes('login') || id.includes('email') || id.includes('account') ||
                  autocomplete.includes('username') || autocomplete.includes('email') ||
                  placeholder.includes('user') || placeholder.includes('email') || placeholder.includes('login')) {
                fields.push({ type: 'username', selector: input.id ? '#' + input.id : input.name ? '[name="' + input.name + '"]' : null });
              }
            }
          });
          return fields.filter(f => f.selector);
        })()
      `);

      if (Array.isArray(fields) && fields.length > 0) {
        setDetectedFields(fields);
        try {
          const saved = await window.electronAPI?.passwords?.getAll();
          if (saved && Array.isArray(saved)) {
            const matching = saved.filter((p: PasswordEntry) => {
              try {
                return new URL(p.url).hostname === domain;
              } catch {
                return false;
              }
            });
            if (matching.length > 0) {
              setCredentials(matching);
              setShowPrompt(true);
            }
          }
        } catch (err) {
          // Password manager not available
        }
      }
    } catch (err) {
      // URL parsing failed
    }
  }, [webview, currentUrl]);

  useEffect(() => {
    if (!webview) return;
    const handleLoad = () => {
      setTimeout(detectFormFields, 1500);
    };
    webview.addEventListener('did-finish-load', handleLoad);
    return () => {
      webview.removeEventListener('did-finish-load', handleLoad);
    };
  }, [webview, detectFormFields]);

  const handleAutofill = async (cred: PasswordEntry) => {
    if (!webview) return;
    try {
      const usernameField = detectedFields.find(f => f.type === 'username');
      if (usernameField?.selector) {
        const safeUsername = JSON.stringify(cred.username);
        const safeSelector = JSON.stringify(usernameField.selector);
        await webview.executeJavaScript(`
          (() => {
            const el = document.querySelector(${safeSelector});
            if (el) {
              el.value = ${safeUsername};
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          })()
        `);
      }

      const passwordField = detectedFields.find(f => f.type === 'password');
      if (passwordField?.selector) {
        const safePassword = JSON.stringify(cred.password);
        const safeSelector = JSON.stringify(passwordField.selector);
        await webview.executeJavaScript(`
          (() => {
            const el = document.querySelector(${safeSelector});
            if (el) {
              el.value = ${safePassword};
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          })()
        `);
      }

      setShowPrompt(false);
    } catch (err) {
      console.error('Autofill failed:', err);
    }
  };

  if (!showPrompt || credentials.length === 0) return null;

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.3)' }} onClick={() => setShowPrompt(false)} />
      <div style={{
        position: 'fixed', bottom: '60px', right: '20px', zIndex: 9999,
        background: 'rgba(15, 15, 20, 0.98)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px', boxShadow: '0 16px 48px rgba(0,0,0,0.8)', backdropFilter: 'blur(20px)',
        padding: '12px', minWidth: '260px', maxWidth: '320px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#f3f4f6' }}>Saved Passwords for {hostname}</span>
        </div>
        {credentials.map(cred => (
          <div
            key={cred.id}
            onClick={() => handleAutofill(cred)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
              background: 'rgba(255,255,255,0.04)', borderRadius: '8px', cursor: 'pointer',
              marginBottom: '4px', transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cred.title || cred.username}
              </div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>
                {cred.username}
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        ))}
        <button
          onClick={() => setShowPrompt(false)}
          style={{
            width: '100%', padding: '6px', background: 'transparent', border: 'none',
            color: '#6b7280', fontSize: '11px', cursor: 'pointer', marginTop: '4px',
          }}
        >
          Not now
        </button>
      </div>
    </>
  );
}
