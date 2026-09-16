import React from 'react';

interface ModernSlideToggleProps {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'gold' | 'emerald' | 'amber';
  label?: string;
  ariaLabel?: string;
}

export const ModernSlideToggle: React.FC<ModernSlideToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  variant = 'gold',
  label,
  ariaLabel,
}) => {
  // Dimensions per size
  const config = {
    sm: {
      width: 28,
      height: 16,
      thumbSize: 12,
      thumbOffset: 2,
      travel: 12,
    },
    md: {
      width: 38,
      height: 22,
      thumbSize: 16,
      thumbOffset: 3,
      travel: 16,
    },
    lg: {
      width: 48,
      height: 26,
      thumbSize: 20,
      thumbOffset: 3,
      travel: 22,
    },
  }[size];

  const getActiveBackground = () => {
    switch (variant) {
      case 'emerald':
        return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      case 'amber':
        return 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
      case 'gold':
      default:
        return 'linear-gradient(135deg, #d4af37 0%, #b8860b 100%)';
    }
  };

  const getActiveGlow = () => {
    switch (variant) {
      case 'emerald':
        return '0 0 12px rgba(16, 185, 129, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.3)';
      case 'amber':
        return '0 0 12px rgba(245, 158, 11, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.3)';
      case 'gold':
      default:
        return '0 0 12px rgba(212, 175, 55, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.3)';
    }
  };

  return (
    <div
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel || label}
      tabIndex={disabled ? -1 : 0}
      onClick={() => {
        if (!disabled) {
          onChange(!checked);
        }
      }}
      onKeyDown={(e) => {
        if (!disabled && (e.key === ' ' || e.key === 'Enter')) {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.38 : 1,
        userSelect: 'none',
        outline: 'none',
      }}
    >
      <div
        style={{
          width: `${config.width}px`,
          height: `${config.height}px`,
          borderRadius: '9999px',
          background: checked
            ? getActiveBackground()
            : 'rgba(255, 255, 255, 0.12)',
          boxShadow: checked
            ? getActiveGlow()
            : 'inset 0 1px 2px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          position: 'relative',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: `${config.thumbSize}px`,
            height: `${config.thumbSize}px`,
            borderRadius: '50%',
            background: '#ffffff',
            position: 'absolute',
            top: `${config.thumbOffset}px`,
            left: checked
              ? `${config.thumbOffset + config.travel}px`
              : `${config.thumbOffset}px`,
            transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s ease',
            boxShadow: '0 2px 5px rgba(0, 0, 0, 0.4), 0 0 1px rgba(0, 0, 0, 0.3)',
          }}
        />
      </div>
      {label && (
        <span
          style={{
            marginLeft: '8px',
            fontSize: size === 'sm' ? '11px' : '12px',
            color: checked ? '#ffffff' : '#94a3b8',
            fontWeight: checked ? 600 : 500,
            transition: 'color 0.2s ease',
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
};
