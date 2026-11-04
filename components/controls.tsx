"use client";

import type { ReactNode } from "react";

export function Seg<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="seg">
        {options.map((o) => (
          <button key={o} type="button" className={value === o ? "on" : ""} onClick={() => onChange(o)} aria-pressed={value === o}>
            {labels[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

export const TEXT_COLORS = ["#ffffff", "#1c1c1e", "#ffe14d", "#ff5a3c", "#2f6bff", "#1b7f3a"];
export const BOX_COLORS = ["#ffffff", "#000000", "#1c1c1e", "#ffe14d", "#2f6bff", "#c62828"];

export function ColorField({
  label,
  value,
  presets = TEXT_COLORS,
  onChange,
}: {
  label: string;
  value: string;
  presets?: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="swatches">
        {presets.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch${value.toLowerCase() === c ? " on" : ""}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
            aria-label={c}
          />
        ))}
        <input
          type="color"
          className="swatch swatch-pick"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} 직접 고르기`}
        />
      </div>
    </div>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <b>{label}</b>
        {hint && <span className="muted small"> — {hint}</span>}
      </span>
    </label>
  );
}

/** 슬라이더 + 숫자 칸 */
export function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="range-field">
      <span className="field-label">{label}</span>
      <div className="range-row">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={Math.round(value * 100) / 100}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          aria-label={`${label} 숫자`}
        />
        {unit && <span className="muted small">{unit}</span>}
      </div>
    </div>
  );
}
