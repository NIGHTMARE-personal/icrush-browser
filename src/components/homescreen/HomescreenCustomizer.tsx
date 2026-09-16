import React, { useState, useRef } from 'react';

interface HomescreenCustomizerProps {
  isOpen: boolean;
  onClose: () => void;
  bgImage: string;
  onBgChange: (img: string) => void;
  activeFont: string;
  onFontChange: (font: string) => void;
  colorState: string;
  onColorChange: (color: string) => void;
  clockStyle: string;
  onClockStyleChange: (style: string) => void;
  widgetVisibility: Record<string, boolean>;
  onWidgetToggle: (widget: string, visible: boolean) => void;
  onSelectPalette?: (palette: string) => void;
}

const FONTS = ['Sans', 'Serif', 'Mono'];

const COLOR_PALETTES = [
  { id: 'indigo-night', label: 'Indigo Night', color: '#6366f1' },
  { id: 'ocean-teal', label: 'Ocean Teal', color: '#14b8a6' },
  { id: 'sunset-rose', label: 'Sunset Rose', color: '#f43f5e' },
  { id: 'obsidian-glass', label: 'Obsidian Glass', color: '#64748b' },
  { id: 'warm-gold', label: 'Warm Gold', color: '#d4af37' },
  { id: 'emerald-forest', label: 'Emerald Forest', color: '#10b981' },
];

const WIDGETS = [
  'Calendar',
  'Tasks',
  'Pomodoro',
  'Weather',
  'Quote',
  'News',
  'Notes',
  'AI Actions',
  'System Monitor',
  'Quick Links',
];

const CLOCK_STYLES = ['Digital', 'Radar', 'Typographic'];

const HomescreenCustomizer: React.FC<HomescreenCustomizerProps> = ({
  isOpen,
  onClose,
  bgImage,
  onBgChange,
  activeFont,
  onFontChange,
  colorState,
  onColorChange,
  clockStyle,
  onClockStyleChange,
  widgetVisibility,
  onWidgetToggle,
  onSelectPalette,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localBg, setLocalBg] = useState(bgImage);

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setLocalBg(result);
      onBgChange(result);
      localStorage.setItem('homescreen-bg', result);
    };
    reader.readAsDataURL(file);
  };

  const handleBgReset = () => {
    setLocalBg('');
    onBgChange('');
    localStorage.removeItem('homescreen-bg');
  };

  const handleFontSelect = (font: string) => {
    onFontChange(font);
    localStorage.setItem('homescreen-font', font);
  };

  const handleColorSelect = (colorId: string) => {
    onColorChange(colorId);
    localStorage.setItem('homescreen-color', colorId);
    onSelectPalette?.(colorId);
  };

  const handleClockSelect = (style: string) => {
    onClockStyleChange(style);
    localStorage.setItem('homescreen-clock', style);
  };

  const handleWidgetToggle = (widget: string) => {
    const next = !widgetVisibility[widget];
    onWidgetToggle(widget, next);
    const stored = JSON.parse(localStorage.getItem('homescreen-widgets') || '{}');
    stored[widget] = next;
    localStorage.setItem('homescreen-widgets', JSON.stringify(stored));
  };

  const activeColor = COLOR_PALETTES.find((p) => p.id === colorState)?.color || '#d4af37';

  if (!isOpen) return null;

  return (
    <>
      <div className="homescreen-customizer-overlay" onClick={onClose} />
      <div className="homescreen-customizer-drawer">
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            background: 'transparent',
            border: 'none',
            color: '#a0aec0',
            fontSize: 16,
            cursor: 'pointer',
            padding: 4,
            lineHeight: 1,
          }}
          aria-label="Close customizer"
        >
          ✕
        </button>

        <div className="customizer-header">
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#f5f5f5' }}>
            Customize Homescreen
          </h2>
        </div>

        <div className="customizer-section">
          <div className="customizer-section-title">Background Wallpaper</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleBgUpload}
          />
          <button
            className="customizer-option-btn"
            onClick={() => fileInputRef.current?.click()}
            style={{ width: '100%', marginBottom: 8 }}
          >
            Upload Image
          </button>
          <button
            className="customizer-option-btn"
            onClick={handleBgReset}
            style={{ width: '100%' }}
          >
            Reset
          </button>
        </div>

        <div className="customizer-section">
          <div className="customizer-section-title">Typography</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {FONTS.map((font) => (
              <button
                key={font}
                className={`customizer-option-btn ${activeFont === font ? 'active' : ''}`}
                style={
                  activeFont === font
                    ? { borderColor: activeColor, background: 'rgba(255,255,255,0.08)' }
                    : undefined
                }
                onClick={() => handleFontSelect(font)}
              >
                {font}
              </button>
            ))}
          </div>
        </div>

        <div className="customizer-section">
          <div className="customizer-section-title">Color Theme</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {COLOR_PALETTES.map((palette) => (
              <button
                key={palette.id}
                className={`customizer-option-btn ${colorState === palette.id ? 'active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  borderColor: colorState === palette.id ? palette.color : undefined,
                  background: colorState === palette.id ? 'rgba(255,255,255,0.08)' : undefined,
                }}
                onClick={() => handleColorSelect(palette.id)}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: palette.color,
                    flexShrink: 0,
                  }}
                />
                {palette.label}
              </button>
            ))}
          </div>
        </div>

        <div className="customizer-section">
          <div className="customizer-section-title">Widget Layout</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {WIDGETS.map((widget) => (
              <div key={widget} className="customizer-toggle-row">
                <button
                  className="customizer-option-btn"
                  onClick={() => handleWidgetToggle(widget)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>{widget}</span>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: widgetVisibility[widget] ? '#10b981' : '#ef4444',
                    }}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="customizer-section">
          <div className="customizer-section-title">Clock Style</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {CLOCK_STYLES.map((style) => (
              <button
                key={style}
                className={`customizer-option-btn ${clockStyle === style ? 'active' : ''}`}
                style={
                  clockStyle === style
                    ? { borderColor: activeColor, background: 'rgba(255,255,255,0.08)' }
                    : undefined
                }
                onClick={() => handleClockSelect(style)}
              >
                {style}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export { HomescreenCustomizer };
export type { HomescreenCustomizerProps };
