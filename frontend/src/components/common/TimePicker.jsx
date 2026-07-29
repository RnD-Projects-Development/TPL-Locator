import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Clock as ClockIcon } from 'lucide-react';
import PopoverPortal from './PopoverPortal.jsx';
import './DateRangePicker.css';

/**
 * Hour/minute picker styled to match DateRangePicker, replacing the native
 * <input type="time"> (whose popup can't be themed and renders below the map on
 * these pages). Portalled for the same reason the calendar is.
 *
 * Props:
 *   value    'HH:MM'
 *   onChange (next: 'HH:MM') => void
 *   label    optional field label
 *   align    'left' | 'right'
 */

const pad2 = (n) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i));

function parse(value) {
  const [h, m] = String(value ?? '').split(':');
  const hh = Number(h);
  const mm = Number(m);
  return {
    h: Number.isFinite(hh) && hh >= 0 && hh <= 23 ? pad2(hh) : '00',
    m: Number.isFinite(mm) && mm >= 0 && mm <= 59 ? pad2(mm) : '00',
  };
}

/** Scrollable column that keeps the current selection in view when opened. */
function Column({ items, selected, onSelect, ariaLabel }) {
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]');
    el?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <div className="tp-col" ref={listRef} role="listbox" aria-label={ariaLabel}>
      {items.map((it) => (
        <button
          key={it}
          type="button"
          role="option"
          aria-selected={it === selected}
          data-selected={it === selected}
          className={`tp-cell${it === selected ? ' selected' : ''}`}
          onClick={() => onSelect(it)}
        >
          {it}
        </button>
      ))}
    </div>
  );
}

export default function TimePicker({ value, onChange, label = null, align = 'left', disabled = false }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const { h, m } = parse(value);

  const close = useCallback(() => setOpen(false), []);

  const set = (nh, nm) => onChange?.(`${nh}:${nm}`);

  return (
    <div className="drp-field">
      {label && <label className="drp-label">{label}</label>}

      <button
        ref={triggerRef}
        type="button"
        className={`drp-trigger tp-trigger${open ? ' open' : ''}`}
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
      >
        <ClockIcon className="drp-trigger-icon" />
        <span className="drp-trigger-text">{h}:{m}</span>
      </button>

      <PopoverPortal anchorRef={triggerRef} open={open} onClose={close} align={align}>
        <div className="drp-pop tp-pop">
          <div className="drp-pop-head">
            <span className="drp-hint">Hour · Minute</span>
          </div>

          <div className="tp-cols">
            <Column items={HOURS} selected={h} onSelect={(nh) => set(nh, m)} ariaLabel="Hour" />
            <Column items={MINUTES} selected={m} onSelect={(nm) => set(h, nm)} ariaLabel="Minute" />
          </div>

          <div className="drp-pop-foot">
            <span className="drp-foot-note">24-hour</span>
            <div className="drp-foot-actions">
              {[['00:00', 'Start of day'], ['23:59', 'End of day']].map(([v, title]) => (
                <button key={v} type="button" className="drp-preset" title={title}
                  onClick={() => { onChange?.(v); setOpen(false); }}>
                  {v}
                </button>
              ))}
              <button type="button" className="drp-preset"
                onClick={() => {
                  const now = new Date();
                  onChange?.(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
                  setOpen(false);
                }}>
                Now
              </button>
            </div>
          </div>
        </div>
      </PopoverPortal>
    </div>
  );
}
