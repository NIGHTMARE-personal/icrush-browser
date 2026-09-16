import React, { useState, useEffect, useCallback } from 'react';

interface PasswordEntry {
  id: string;
  url: string;
  username: string;
  password: string;
  title?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  category?: string;
}

interface PasswordManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PasswordManager({ isOpen, onClose }: PasswordManagerProps) {
  const [entries, setEntries] = useState<Omit<PasswordEntry, 'password'>[]>([]);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showMasterPrompt, setShowMasterPrompt] = useState(false);
  const [masterPassword, setMasterPassword] = useState('');
  const [newEntry, setNewEntry] = useState({ url: '', username: '', password: '', title: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');

  // Enhanced premium notification states
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<Map<string, boolean>>(new Map());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    try {
      const entries = await window.electronAPI.passwords.getAll();
      setEntries(entries);
    } catch (err) {
      console.error('Failed to load passwords:', err);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const checkStatus = async () => {
      const unlocked = await window.electronAPI.passwords.isUnlocked();
      setIsUnlocked(unlocked);
      if (unlocked) loadEntries();
      else setShowMasterPrompt(true);
    };
    checkStatus();
  }, [isOpen, loadEntries]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const success = await window.electronAPI.passwords.unlock(masterPassword);
      if (success) {
        setIsUnlocked(true);
        setShowMasterPrompt(false);
        setMasterPassword('');
        loadEntries();
      } else {
        setErrorMessage('Incorrect master password. Please try again.');
      }
    } catch (err) {
      setErrorMessage('Verification failed.');
    }
  };

  const handleLock = async () => {
    setErrorMessage(null);
    await window.electronAPI.passwords.lock();
    setIsUnlocked(false);
    setEntries([]);
    setShowMasterPrompt(true);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!newEntry.url || !newEntry.username || !newEntry.password) {
      setErrorMessage('Please fill in the website, username, and password fields.');
      return;
    }

    try {
      const entry = await window.electronAPI.passwords.add(newEntry);
      setEntries(prev => [entry, ...prev]);
      setNewEntry({ url: '', username: '', password: '', title: '' });
      setEditingId(null);
      setGeneratedPassword('');
    } catch (err) {
      setErrorMessage('Failed to encrypt and save credentials.');
    }
  };

  const handleDelete = async (id: string) => {
    setErrorMessage(null);
    try {
      const success = await window.electronAPI.passwords.delete(id);
      if (success) {
        setEntries(prev => prev.filter(e => e.id !== id));
        setConfirmDeleteId(null);
      } else {
        setErrorMessage('Failed to delete item.');
      }
    } catch (err) {
      setErrorMessage('Error deleting item from keychain.');
    }
  };

  const handleReveal = async (id: string) => {
    if (showPassword === id) {
      setShowPassword(null);
      return;
    }
    try {
      const entry = await window.electronAPI.passwords.getEntry(id);
      if (entry) setShowPassword(entry.password);
    } catch (err) {
      setErrorMessage('Authentication needed to reveal password.');
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setErrorMessage(null);
    try {
      const pwd = await window.electronAPI.passwords.generate(16);
      setGeneratedPassword(pwd);
      setNewEntry(prev => ({ ...prev, password: pwd }));
    } catch (err) {
      setErrorMessage('Failed to generate secure password.');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string, typeKey: string) => {
    navigator.clipboard.writeText(text);
    setCopyState(prev => new Map(prev).set(typeKey, true));
    setTimeout(() => {
      setCopyState(prev => {
        const next = new Map(prev);
        next.delete(typeKey);
        return next;
      });
    }, 1500);
  };

  const filteredEntries = entries.filter(
    e =>
      e.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderDomainIcon = (url: string) => {
    const cleanUrl = url.toLowerCase();
    if (cleanUrl.includes('github.com')) {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
        </svg>
      );
    }
    if (cleanUrl.includes('google.com')) {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.113-5.111 4.113-3.418 0-6.205-2.787-6.205-6.205s2.787-6.205 6.205-6.205c1.583 0 3.024.595 4.117 1.564l3.126-3.126C19.167 2.624 15.935 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c5.895 0 10.865-4.233 10.865-11.24 0-.693-.079-1.357-.19-1.955H12.24z" />
        </svg>
      );
    }
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="password-manager-overlay" onClick={onClose}>
      <div className="password-manager-panel" onClick={e => e.stopPropagation()}>
        <div className="pm-header">
          <h2>Secure Credential Vault</h2>
          <div className="pm-header-actions">
            {isUnlocked && (
              <button className="pm-btn" onClick={handleLock}>
                Lock Vault
              </button>
            )}
            <button className="pm-btn-close" onClick={onClose} aria-label="Close credentials panel">
              ✕
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="pm-error-banner" style={{ margin: '16px 16px 0 16px' }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {!isUnlocked && showMasterPrompt && (
          <div className="pm-lock-screen">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <h3>Unlock Your Keychain</h3>
            <form onSubmit={handleUnlock}>
              <input
                type="password"
                value={masterPassword}
                onChange={e => setMasterPassword(e.target.value)}
                placeholder="Enter master password..."
                autoFocus
              />
              <button type="submit" disabled={!masterPassword}>
                Decrypt Vault
              </button>
            </form>
            {!masterPassword && (
              <p className="pm-hint">
                First time? Set your master password above to initialize secure storage.
              </p>
            )}
          </div>
        )}

        {isUnlocked && (
          <div className="pm-content">
            {editingId === 'new' ? (
              <form onSubmit={handleAdd} className="pm-add-form">
                <h3>Add Credentials</h3>
                <div className="pm-form-group">
                  <label htmlFor="pm-title-input">Title / Service</label>
                  <input
                    id="pm-title-input"
                    type="text"
                    placeholder="e.g., GitHub"
                    value={newEntry.title}
                    onChange={e => setNewEntry(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div className="pm-form-group">
                  <label htmlFor="pm-url-input">Website URL</label>
                  <input
                    id="pm-url-input"
                    type="url"
                    placeholder="e.g., https://github.com"
                    value={newEntry.url}
                    onChange={e => setNewEntry(prev => ({ ...prev, url: e.target.value }))}
                    required
                  />
                </div>
                <div className="pm-form-group">
                  <label htmlFor="pm-user-input">Username / Email</label>
                  <input
                    id="pm-user-input"
                    type="text"
                    placeholder="Username or email address"
                    value={newEntry.username}
                    onChange={e => setNewEntry(prev => ({ ...prev, username: e.target.value }))}
                    required
                  />
                </div>
                <div className="pm-form-group">
                  <label htmlFor="pm-password-input">Password</label>
                  <div className="pm-password-input-wrapper">
                    <input
                      id="pm-password-input"
                      type="password"
                      placeholder="Password string"
                      value={newEntry.password}
                      onChange={e => setNewEntry(prev => ({ ...prev, password: e.target.value }))}
                      required
                    />
                    <button
                      type="button"
                      className="pm-btn pm-btn-primary"
                      onClick={handleGenerate}
                      disabled={generating}
                    >
                      {generating ? 'Generating...' : 'Generate Strong'}
                    </button>
                  </div>
                  {generatedPassword && (
                    <div className="pm-generated-password-note">
                      Generated password: <code>{generatedPassword}</code>
                    </div>
                  )}
                </div>
                <div className="pm-form-actions">
                  <button
                    type="button"
                    className="pm-btn"
                    onClick={() => {
                      setEditingId(null);
                      setGeneratedPassword('');
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="pm-btn pm-btn-primary">
                    Encrypt & Save
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="pm-toolbar">
                  <input
                    type="text"
                    placeholder="Search credentials..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pm-search"
                    aria-label="Search saved credentials"
                  />
                  <button
                    className="pm-btn pm-btn-primary"
                    onClick={() => {
                      setEditingId('new');
                      setNewEntry({ url: '', username: '', password: '', title: '' });
                    }}
                  >
                    Add Login
                  </button>
                </div>

                {filteredEntries.length === 0 ? (
                  <div className="pm-empty">
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <p>
                      {searchQuery
                        ? 'No matching credentials found'
                        : 'No credentials saved in vault'}
                    </p>
                    {!searchQuery && (
                      <button className="pm-btn pm-btn-primary" onClick={() => setEditingId('new')}>
                        Create First Keychain Entry
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="pm-list">
                    {filteredEntries.map(entry => (
                      <div key={entry.id} className="pm-entry">
                        {/* Inline Delete Confirmation Overlay */}
                        {confirmDeleteId === entry.id && (
                          <div className="pm-confirm-delete-overlay">
                            <span>Permanently delete?</span>
                            <button
                              className="pm-confirm-yes"
                              onClick={() => handleDelete(entry.id)}
                            >
                              Yes, Delete
                            </button>
                            <button
                              className="pm-confirm-no"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        )}

                        <div className="pm-entry-info">
                          <div className="pm-entry-icon">{renderDomainIcon(entry.url)}</div>
                          <div className="pm-entry-details">
                            <div className="pm-entry-title">{entry.title || entry.url}</div>
                            <div className="pm-entry-username">{entry.username}</div>
                            <div className="pm-entry-url">{entry.url}</div>
                          </div>
                        </div>

                        <div className="pm-entry-actions">
                          <button
                            className="pm-action-btn"
                            onClick={() => copyToClipboard(entry.username, `user-${entry.id}`)}
                            title={copyState.get(`user-${entry.id}`) ? 'Copied!' : 'Copy username'}
                          >
                            {copyState.get(`user-${entry.id}`) ? (
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            ) : (
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                              </svg>
                            )}
                          </button>
                          <button
                            className="pm-action-btn"
                            onClick={() => handleReveal(entry.id)}
                            title={showPassword === entry.id ? 'Hide password' : 'Show password'}
                          >
                            {showPassword === entry.id ? (
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                              </svg>
                            ) : (
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            )}
                          </button>
                          <button
                            className="pm-action-btn"
                            onClick={() => {
                              if (showPassword === entry.id) {
                                copyToClipboard(showPassword, `pwd-${entry.id}`);
                              }
                            }}
                            title={
                              showPassword !== entry.id
                                ? 'Reveal password to copy'
                                : copyState.get(`pwd-${entry.id}`)
                                  ? 'Copied!'
                                  : 'Copy password'
                            }
                            disabled={showPassword !== entry.id}
                          >
                            {copyState.get(`pwd-${entry.id}`) ? (
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            ) : (
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                            )}
                          </button>
                          <button
                            className="pm-action-btn pm-danger"
                            onClick={() => setConfirmDeleteId(entry.id)}
                            title="Delete credential"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              <line x1="10" y1="11" x2="10" y2="17" />
                              <line x1="14" y1="11" x2="14" y2="17" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
