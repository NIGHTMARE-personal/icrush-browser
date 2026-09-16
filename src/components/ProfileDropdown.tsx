import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { AuthModal } from './AuthModal';
import { User } from '@supabase/supabase-js';

interface Profile {
  id: string;
  name: string;
  email: string;
}

interface Palette {
  id: string;
  name: string;
  color: string;
}

interface ProfileDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenProfileEditor: () => void;
  currentPalette?: string;
  onSelectPalette?: (id: string) => void;
  onOpenSettings: (tab: string) => void;
  onNavigate?: (url: string) => void;
  onTriggerSync?: () => void;
}

export function ProfileDropdown({
  isOpen,
  onClose,
  onOpenProfileEditor,
  currentPalette = 'default',
  onSelectPalette,
  onOpenSettings,
  onNavigate,
  onTriggerSync,
}: ProfileDropdownProps) {
  const [activeProfileId, setActiveProfileId] = useState<string>('1');
  const [activeAvatar, setActiveAvatar] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([
    { id: '1', name: 'Amits', email: 'amits@icrushbrowser.com' },
    { id: '2', name: 'Work Profile', email: 'work@icrushbrowser.com' },
    { id: '3', name: 'Guest User', email: 'guest@icrushbrowser.com' },
  ]);

  const checkUser = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUser(user);
    } catch (err) {
      console.warn('Error loading sync user state:', err);
    }
  };

  // Load active profile and its specific avatar
  useEffect(() => {
    if (isOpen) {
      const savedId = localStorage.getItem('gemini-browser-active-profile-id') || '1';
      setActiveProfileId(savedId);

      const savedAvatar =
        localStorage.getItem(`gemini-browser-profile-pic-${savedId}`) ||
        localStorage.getItem('gemini-browser-profile-pic') ||
        '';
      setActiveAvatar(savedAvatar);

      // Load custom profile names and emails from localStorage
      setProfiles([
        {
          id: '1',
          name: localStorage.getItem('gemini-browser-profile-name-1') || 'Amits',
          email: localStorage.getItem('gemini-browser-profile-email-1') || 'amits@icrushbrowser.com',
        },
        {
          id: '2',
          name: localStorage.getItem('gemini-browser-profile-name-2') || 'Work Profile',
          email: localStorage.getItem('gemini-browser-profile-email-2') || 'work@icrushbrowser.com',
        },
        {
          id: '3',
          name: localStorage.getItem('gemini-browser-profile-name-3') || 'Guest User',
          email: localStorage.getItem('gemini-browser-profile-email-3') || 'guest@icrushbrowser.com',
        },
      ]);

      checkUser();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleProfileUpdate = () => {
      const savedId = localStorage.getItem('gemini-browser-active-profile-id') || '1';
      setActiveProfileId(savedId);
      const savedAvatar =
        localStorage.getItem(`gemini-browser-profile-pic-${savedId}`) ||
        localStorage.getItem('gemini-browser-profile-pic') ||
        '';
      setActiveAvatar(savedAvatar);

      setProfiles([
        {
          id: '1',
          name: localStorage.getItem('gemini-browser-profile-name-1') || 'Amits',
          email: localStorage.getItem('gemini-browser-profile-email-1') || 'amits@icrushbrowser.com',
        },
        {
          id: '2',
          name: localStorage.getItem('gemini-browser-profile-name-2') || 'Work Profile',
          email: localStorage.getItem('gemini-browser-profile-email-2') || 'work@icrushbrowser.com',
        },
        {
          id: '3',
          name: localStorage.getItem('gemini-browser-profile-name-3') || 'Guest User',
          email: localStorage.getItem('gemini-browser-profile-email-3') || 'guest@icrushbrowser.com',
        },
      ]);
    };

    window.addEventListener('profile-updated', handleProfileUpdate);
    return () => {
      window.removeEventListener('profile-updated', handleProfileUpdate);
    };
  }, []);

  if (!isOpen) return null;

  const handleSelectProfile = (id: string) => {
    localStorage.setItem('gemini-browser-active-profile-id', id);
    setActiveProfileId(id);

    // Trigger window update
    const newAvatar = localStorage.getItem(`gemini-browser-profile-pic-${id}`) || '';
    setActiveAvatar(newAvatar);

    // Reload components to reflect new profile context
    window.location.reload();
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setCurrentUser(null);
      if (onTriggerSync) onTriggerSync();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleAuthSuccess = () => {
    checkUser();
    if (onTriggerSync) onTriggerSync();
  };

  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];

  const palettes: Palette[] = [
    { id: 'default', name: 'Default', color: '#6366f1' },
    { id: 'premium', name: 'Premium', color: '#aa7c11' },
    { id: 'warmer', name: 'Warmer', color: '#c55a44' },
    { id: 'simple', name: 'Minimalist', color: '#a3a3a3' },
  ];

  return (
    <>
      <div className="profile-dropdown-container" onClick={e => e.stopPropagation()}>
        {/* Top Section: Large Avatar with Camera Icon Overlay */}
        <div className="dropdown-profile-header">
          <div className="dropdown-avatar-wrapper">
            {activeAvatar ? (
              <img src={activeAvatar} alt="Profile" className="dropdown-avatar-img" />
            ) : (
              <div className="dropdown-avatar-placeholder">
                <span>
                  {currentUser
                    ? (currentUser.email || 'C').charAt(0).toUpperCase()
                    : activeProfile.name.charAt(0)}
                </span>
              </div>
            )}

            {/* Circular Camera Edit Overlay */}
            <button
              className="avatar-edit-overlay-btn"
              onClick={() => {
                onOpenProfileEditor();
                onClose();
              }}
              title="Upload Profile Picture"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
            </button>
          </div>

          {currentUser ? (
            <>
              <h3 className="dropdown-profile-name">{currentUser.email?.split('@')[0]}</h3>
              <p className="dropdown-profile-email">{currentUser.email}</p>
              <div className="sync-status-badge">
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Sync Active</span>
              </div>
              <button
                className="pm-btn"
                style={{
                  marginTop: '8px',
                  width: '100%',
                  borderColor: 'rgba(239, 68, 68, 0.2)',
                  color: '#f87171',
                  background: 'rgba(239, 68, 68, 0.05)',
                }}
                onClick={handleLogout}
              >
                Sign Out Sync
              </button>
            </>
          ) : (
            <>
              <h3 className="dropdown-profile-name">{activeProfile.name}</h3>
              <p className="dropdown-profile-email">{activeProfile.email}</p>
              <button
                className="pm-btn pm-btn-primary"
                style={{ marginTop: '8px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                onClick={() => setShowAuthModal(true)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2l-2 2m-1.5 1.5L10 13l-4 4-4-4 4-4 7.5-7.5" />
                  <circle cx="15.5" cy="8.5" r="2.5" />
                </svg>
                Sign In to Sync
              </button>
            </>
          )}
        </div>

        {/* Theme Quick Switcher */}
        <div className="dropdown-theme-switcher">
          <span className="dropdown-section-title">Personalize Theme</span>
          <div className="dropdown-palettes-row">
            {palettes.map(p => {
              const isSelected = p.id === currentPalette;
              return (
                <button
                  key={p.id}
                  className={`dropdown-palette-swatch ${isSelected ? 'active' : ''}`}
                  style={{ backgroundColor: p.color }}
                  onClick={() => {
                    if (onSelectPalette) {
                      onSelectPalette(p.id);
                      localStorage.setItem('gemini-browser-palette', p.id);
                    }
                  }}
                  title={`Switch to ${p.name} theme`}
                />
              );
            })}
          </div>
        </div>

        {/* Shortcuts Links */}
        <div className="dropdown-shortcuts-list">
          <button
            className="dropdown-shortcut-item"
            onClick={() => {
              if (onNavigate) onNavigate('about:bookmarks');
              onClose();
            }}
          >
            <span className="shortcut-icon">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <span>Bookmarks</span>
          </button>
          <button
            className="dropdown-shortcut-item"
            onClick={() => {
              onOpenSettings('history');
              onClose();
            }}
          >
            <span className="shortcut-icon">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </span>
            <span>History Extension</span>
          </button>
        </div>

        {/* Profile/Accounts Switcher */}
        {!currentUser && (
          <div className="dropdown-profiles-switcher">
            <span className="dropdown-section-title">Switch Profile</span>
            <div className="dropdown-profiles-list">
              {profiles.map(p => {
                const isActive = p.id === activeProfileId;
                const profileAvatar =
                  localStorage.getItem(`gemini-browser-profile-pic-${p.id}`) || '';
                return (
                  <div
                    key={p.id}
                    className={`dropdown-profile-row ${isActive ? 'active' : ''}`}
                    onClick={() => !isActive && handleSelectProfile(p.id)}
                  >
                    {profileAvatar ? (
                      <img src={profileAvatar} alt={p.name} className="profile-row-avatar-img" />
                    ) : (
                      <div className="profile-row-avatar-placeholder">
                        <span>{p.name.charAt(0)}</span>
                      </div>
                    )}
                    <div className="profile-row-meta">
                      <span className="profile-row-name">{p.name}</span>
                      {isActive && <span className="profile-row-active-tag">Active</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
        onNavigate={onNavigate}
      />
    </>
  );
}
