import { useState, useEffect, useRef } from 'react';

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  type?: 'text' | 'url';
}

export function PromptModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  placeholder = '',
  defaultValue = '',
  type = 'text',
}: PromptModalProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slide-up {
        from { opacity: 0; transform: translateY(16px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, defaultValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleConfirm = () => {
    if (value.trim()) {
      onConfirm(value.trim());
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fade-in 0.15s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-elevated, #1a1a2e)',
          border: '1px solid var(--border-light, rgba(255,255,255,0.1))',
          borderRadius: '16px',
          padding: '24px',
          minWidth: '360px',
          maxWidth: '480px',
          boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
          animation: 'slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
          {title}
        </h3>
        {message && (
          <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {message}
          </p>
        )}
        <input
          ref={inputRef}
          type={type}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: '10px',
            border: '1px solid var(--border-light, rgba(255,255,255,0.1))',
            background: 'var(--bg-deep, #0d0d12)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseOver={e => e.currentTarget.style.background = 'var(--bg-deep)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--accent, #d4af37)',
              color: '#000',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.1)'}
            onMouseOut={e => e.currentTarget.style.filter = 'brightness(1)'}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

interface DoublePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value1: string, value2: string) => void;
  title: string;
  message?: string;
  field1: {
    label: string;
    placeholder?: string;
    defaultValue?: string;
    type?: 'text' | 'url';
  };
  field2: {
    label: string;
    placeholder?: string;
    defaultValue?: string;
    type?: 'text' | 'url';
  };
}

export function DoublePromptModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  field1,
  field2,
}: DoublePromptModalProps) {
  const [value1, setValue1] = useState(field1.defaultValue || '');
  const [value2, setValue2] = useState(field2.defaultValue || '');
  const input1Ref = useRef<HTMLInputElement>(null);
  const input2Ref = useRef<HTMLInputElement>(null);
  const [focusedField, setFocusedField] = useState<1 | 2>(1);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slide-up {
        from { opacity: 0; transform: translateY(16px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setValue1(field1.defaultValue || '');
      setValue2(field2.defaultValue || '');
      setTimeout(() => input1Ref.current?.focus(), 100);
    }
  }, [isOpen, field1.defaultValue, field2.defaultValue]);

  const handleKeyDown = (e: React.KeyboardEvent, field: 1 | 2) => {
    if (e.key === 'Enter') {
      if (field === 1) {
        setFocusedField(2);
        setTimeout(() => input2Ref.current?.focus(), 0);
      } else {
        handleConfirm();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleConfirm = () => {
    if (value1.trim() || value2.trim()) {
      onConfirm(value1.trim(), value2.trim());
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fade-in 0.15s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-elevated, #1a1a2e)',
          border: '1px solid var(--border-light, rgba(255,255,255,0.1))',
          borderRadius: '16px',
          padding: '24px',
          minWidth: '360px',
          maxWidth: '480px',
          boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
          animation: 'slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
          {title}
        </h3>
        {message && (
          <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {message}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>
              {field1.label}
            </label>
            <input
              ref={input1Ref}
              type={field1.type}
              value={value1}
              onChange={e => setValue1(e.target.value)}
              onKeyDown={e => handleKeyDown(e, 1)}
              placeholder={field1.placeholder}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border-light, rgba(255,255,255,0.1))',
                background: 'var(--bg-deep, #0d0d12)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '500', color: 'var(--text-secondary)' }}>
              {field2.label}
            </label>
            <input
              ref={input2Ref}
              type={field2.type}
              value={value2}
              onChange={e => setValue2(e.target.value)}
              onKeyDown={e => handleKeyDown(e, 2)}
              placeholder={field2.placeholder}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border-light, rgba(255,255,255,0.1))',
                background: 'var(--bg-deep, #0d0d12)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseOver={e => e.currentTarget.style.background = 'var(--bg-deep)'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--accent, #d4af37)',
              color: '#000',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.1)'}
            onMouseOut={e => e.currentTarget.style.filter = 'brightness(1)'}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}