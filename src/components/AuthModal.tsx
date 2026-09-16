import React, { useState } from 'react';
import { supabase } from '../utils/supabase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onNavigate?: (url: string) => void;
}

export function AuthModal({ isOpen, onClose, onSuccess, onNavigate }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRealOAuthLogin = async (provider: 'google' | 'microsoft') => {
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        provider: provider as any,
        options: {
          redirectTo: window.location.origin, // Redirect back to http://localhost:5174
        },
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      if (data?.url) {
        onClose();
        if (onNavigate) {
          onNavigate(data.url);
        } else {
          window.location.href = data.url;
        }
      } else {
        setErrorMsg('Authentication URL could not be resolved.');
      }
    } catch (err) {
      setErrorMsg('Failed to initialize secure cloud OAuth channel.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setErrorMsg(error.message);
        } else {
          setInfoMsg('Account created successfully! You can now sign in.');
          setIsSignUp(false);
          setPassword('');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setErrorMsg(error.message);
        } else {
          onSuccess();
          onClose();
        }
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'An unexpected authentication error occurred.';
      setErrorMsg(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal-card" onClick={e => e.stopPropagation()}>
        <div className="auth-header">
          <h2>{isSignUp ? 'Create ICRUSH Account' : 'Sync ICRUSH Profile'}</h2>
          <button
            className="auth-btn-close"
            onClick={onClose}
            aria-label="Close authentication panel"
          >
            ✕
          </button>
        </div>

        <div className="auth-tabs">
          <button
            className={`auth-tab-btn ${!isSignUp ? 'active' : ''}`}
            onClick={() => {
              setIsSignUp(false);
              setErrorMsg(null);
              setInfoMsg(null);
            }}
          >
            Sign In
          </button>
          <button
            className={`auth-tab-btn ${isSignUp ? 'active' : ''}`}
            onClick={() => {
              setIsSignUp(true);
              setErrorMsg(null);
              setInfoMsg(null);
            }}
          >
            Sign Up
          </button>
        </div>

        {errorMsg && (
          <div className="auth-error-banner">
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
            <span>{errorMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div className="auth-info-banner">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>{infoMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-form-group">
            <label htmlFor="auth-email">Email Address</label>
            <input
              id="auth-email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="auth-form-group">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading
              ? 'Securing Connection...'
              : isSignUp
                ? 'Create & Encrypt Vault'
                : 'Sync & Load Settings'}
          </button>
        </form>

        <div className="auth-oauth-divider">
          <span className="auth-divider-text">or continue with secure provider</span>
        </div>

        <div className="auth-oauth-buttons">
          <button
            className="oauth-btn oauth-btn-google"
            onClick={() => handleRealOAuthLogin('google')}
            disabled={loading}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.187 4.114-3.48 0-6.3-2.82-6.3-6.3s2.82-6.3 6.3-6.3c1.618 0 3.097.615 4.225 1.725l2.97-2.97C19.125 1.83 15.867 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c5.895 0 10.86-4.23 10.86-10.285 0-.735-.06-1.47-.195-2.19H12.24z"
                fill="currentColor"
              />
            </svg>
            Google
          </button>
          <button
            className="oauth-btn oauth-btn-microsoft"
            onClick={() => handleRealOAuthLogin('microsoft')}
            disabled={loading}
          >
            <svg width="14" height="14" viewBox="0 0 23 23" fill="currentColor">
              <rect x="0" y="0" width="11" height="11" fill="currentColor" />
              <rect x="12" y="0" width="11" height="11" fill="currentColor" />
              <rect x="0" y="12" width="11" height="11" fill="currentColor" />
              <rect x="12" y="12" width="11" height="11" fill="currentColor" />
            </svg>
            Microsoft
          </button>
        </div>

        <p className="auth-security-disclaimer">
          🔒 Encrypted using SSL. Your preferences, themes, and extensions sync data is isolated
          securely using row-level access tokens.
        </p>
      </div>
    </div>
  );
}
