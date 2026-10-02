import React from 'react';

/**
 * A switch, for settings that take effect as soon as they are flipped.
 */
export function Toggle({
  on,
  onChange,
  label,
  hint,
  tone = 'staff',
  disabled = false,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'staff' | 'diner';
  disabled?: boolean;
}) {
  const dark = tone === 'staff';
  const accent = dark ? '#e8a84a' : '#c8442a';
  const track = on ? accent : dark ? 'rgba(232,223,200,0.22)' : 'rgba(42,24,16,0.2)';

  return (
    <label
      className={`flex items-start gap-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
    >
      {/* Geometry in inline styles, not utilities. A global button rule was
          padding this one, which widened the track, pushed the knob out of it
          and left the label sitting on top of the result. */}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => !disabled && onChange(!on)}
        className="shrink-0 transition-colors"
        style={{
          position: 'relative',
          width: 36,
          height: 20,
          padding: 0,
          border: 'none',
          borderRadius: 999,
          marginTop: 2,
          background: track,
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        <span
          className="transition-transform"
          style={{
            position: 'absolute',
            top: 2,
            left: on ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: 999,
            background: '#fff',
          }}
        />
      </button>

      <span className="text-xs leading-relaxed">
        <span className="font-medium">{label}</span>
        {hint && <span className="block opacity-55 mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}
