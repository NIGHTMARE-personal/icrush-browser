import { useState, useCallback, useRef, useEffect } from 'react';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const progressRef = useRef<number>(100);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [progress, setProgress] = useState(100);

  const typeStyles: Record<Toast['type'], { bg: string; border: string; color: string; icon: string }> = {
    success: { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)', color: '#10b981', icon: '✓' },
    error: { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)', color: '#ef4444', icon: '✕' },
    warning: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b', icon: '⚠' },
    info: { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.3)', color: '#3b82f6', icon: 'ℹ' },
  };

  const style = typeStyles[toast.type];

  useEffect(() => {
    const duration = toast.duration ?? 4000;
    const step = 100 / (duration / 50);
    
    progressIntervalRef.current = setInterval(() => {
      progressRef.current = Math.max(0, progressRef.current - step);
      setProgress(progressRef.current);
    }, 50);

    const timeout = setTimeout(() => onDismiss(toast.id), duration);
    
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      clearTimeout(timeout);
    };
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '12px 16px',
        minWidth: '280px',
        maxWidth: '420px',
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: '10px',
        color: style.color,
        fontSize: '13px',
        fontWeight: '500',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(12px)',
        animation: 'toast-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={() => {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      }}
      onMouseLeave={() => {
        const duration = toast.duration ?? 4000;
        const step = 100 / (duration / 50);
        progressIntervalRef.current = setInterval(() => {
          progressRef.current = Math.max(0, progressRef.current - step);
          setProgress(progressRef.current);
        }, 50);
      }}
    >
      <span style={{ fontSize: '14px', flexShrink: 0 }}>{style.icon}</span>
      <span style={{ flex: 1, lineHeight: 1.4 }}>{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{
          background: 'transparent',
          border: 'none',
          color: style.color,
          opacity: 0.6,
          cursor: 'pointer',
          padding: '4px',
          fontSize: '16px',
          lineHeight: 1,
          flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        ✕
      </button>
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          height: '3px',
          background: style.color,
          width: `${progress}%`,
          transition: 'width 0.05s linear',
        }}
      />
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: Toast['type'] = 'info', duration?: number) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToasts(prev => [...prev, { id, message, type, duration }]);
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const success = useCallback((message: string, duration?: number) => showToast(message, 'success', duration), [showToast]);
  const error = useCallback((message: string, duration?: number) => showToast(message, 'error', duration), [showToast]);
  const warning = useCallback((message: string, duration?: number) => showToast(message, 'warning', duration), [showToast]);
  const info = useCallback((message: string, duration?: number) => showToast(message, 'info', duration), [showToast]);

  return { toasts, showToast, dismissToast, success, error, warning, info };
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { toasts, dismissToast } = useToast();

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes toast-slide-in {
        from {
          opacity: 0;
          transform: translateX(100%) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateX(0) scale(1);
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}