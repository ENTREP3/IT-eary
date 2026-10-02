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
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => !disabled && onChange(!on)}
        className="mt-0.5 relative w-9 h-5 rounded-full shrink-0 transition-colors"
        style={{ background: track }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
          style={{ transform: on ? 'translateX(1.15rem)' : 'translateX(0.15rem)' }}
        />
      </button>

      <span className="text-xs leading-relaxed">
        <span className="font-medium">{label}</span>
        {hint && <span className="block opacity-55 mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}
