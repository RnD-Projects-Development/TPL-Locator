import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import PopoverPortal from './PopoverPortal.jsx';
import './DateRangePicker.css';

/**
 * Two-month range calendar, in the shape of the shadcn <Calendar mode="range">.
 *
 * Built directly rather than via react-day-picker: this project has no shadcn
 * infrastructure (no cva, no ui/button, no `@/` alias), so wiring that chain in
 * would cost more than the calendar itself — and the day-cap below needs custom
 * disabled-date logic anyway.
 *
 * Props:
 *   value        { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 *   onChange     (next) => void — fires once a complete range is picked
 *   maxRangeDays cap on the span, inclusive of both ends. null = unlimited.
 *   maxDate      latest selectable day (default: today)
 *   minDate      earliest selectable day
 *   label        optional field label rendered above the trigger
 *   align        'left' | 'right' — which edge the popover hangs from
 */

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const pad2 = (n) => String(n).padStart(2, '0');

export function toKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function fromKey(key) {
  if (!key) return null;
  const [y, m, d] = String(key).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function sameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function daysBetween(fromKeyStr, toKeyStr) {
  const a = fromKey(fromKeyStr);
  const b = fromKey(toKeyStr);
  if (!a || !b) return 0;
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS) + 1;
}

function fmtDisplay(key) {
  const d = fromKey(key);
  if (!d) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
}

/** 6x7 grid of dates covering the month, padded with neighbouring days. */
function monthMatrix(monthStart) {
  const first = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  const gridStart = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

function MonthGrid({
  monthStart, from, to, hovered, onPick, onHover,
  isDisabled, isOutOfMonth,
}) {
  const cells = useMemo(() => monthMatrix(monthStart), [monthStart]);

  // While picking the end of a range, preview against whatever is hovered.
  const rangeEnd = to || (from && hovered && hovered > from ? hovered : null);

  return (
    <div className="drp-month">
      <div className="drp-month-label">
        {MONTHS[monthStart.getMonth()]} {monthStart.getFullYear()}
      </div>
      <div className="drp-weekdays">
        {WEEKDAYS.map(w => <span key={w}>{w}</span>)}
      </div>
      <div className="drp-grid">
        {cells.map((day) => {
          const outside = isOutOfMonth(day, monthStart);
          const disabled = isDisabled(day);
          const isFrom = sameDay(day, from);
          const isTo = sameDay(day, rangeEnd);
          const inRange = from && rangeEnd && day > from && day < rangeEnd;
          const cls = [
            'drp-day',
            outside ? 'outside' : '',
            disabled ? 'disabled' : '',
            isFrom || isTo ? 'endpoint' : '',
            inRange ? 'in-range' : '',
          ].filter(Boolean).join(' ');

          return (
            <button
              key={day.getTime()}
              type="button"
              className={cls}
              disabled={disabled}
              onClick={() => !disabled && onPick(day)}
              onMouseEnter={() => !disabled && onHover(day)}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DateRangePicker({
  value,
  onChange,
  maxRangeDays = null,
  maxDate = null,
  minDate = null,
  label = null,
  align = 'left',
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [anchorMonth, setAnchorMonth] = useState(() =>
    fromKey(value?.from) ? new Date(fromKey(value.from).getFullYear(), fromKey(value.from).getMonth(), 1)
      : new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
  const [draftFrom, setDraftFrom] = useState(null);   // set while picking the end
  const [hovered, setHovered] = useState(null);
  const triggerRef = useRef(null);

  const max = maxDate ? startOfDay(fromKey(maxDate) || new Date(maxDate)) : startOfDay(new Date());
  const min = minDate ? startOfDay(fromKey(minDate) || new Date(minDate)) : null;

  const from = draftFrom || fromKey(value?.from);
  const to = draftFrom ? null : fromKey(value?.to);

  // Outside-click and Escape are handled by PopoverPortal.
  const close = useCallback(() => {
    setOpen(false);
    setDraftFrom(null);
    setHovered(null);
  }, []);

  function isDisabled(day) {
    const d = startOfDay(day);
    if (max && d > max) return true;
    if (min && d < min) return true;
    // Second click: everything past the cap is unreachable, and so is anything
    // before the start — that's what enforces the N-day limit at the UI level.
    if (draftFrom) {
      if (d < startOfDay(draftFrom)) return true;
      if (maxRangeDays) {
        const limit = addDays(startOfDay(draftFrom), maxRangeDays - 1);
        if (d > limit) return true;
      }
    }
    return false;
  }

  function handlePick(day) {
    const d = startOfDay(day);
    if (!draftFrom) {
      setDraftFrom(d);
      setHovered(null);
      return;
    }
    const start = startOfDay(draftFrom);
    const [a, b] = d < start ? [d, start] : [start, d];
    setDraftFrom(null);
    setHovered(null);
    setOpen(false);
    onChange?.({ from: toKey(a), to: toKey(b) });
  }

  const spanDays = value?.from && value?.to ? daysBetween(value.from, value.to) : 0;
  const triggerText = value?.from && value?.to
    ? (value.from === value.to
      ? fmtDisplay(value.from)
      : `${fmtDisplay(value.from)} – ${fmtDisplay(value.to)}`)
    : 'Select a date range';

  return (
    <div className="drp-field">
      {label && <label className="drp-label">{label}</label>}

      <button
        ref={triggerRef}
        type="button"
        className={`drp-trigger${open ? ' open' : ''}`}
        onClick={() => !disabled && (open ? close() : setOpen(true))}
        disabled={disabled}
      >
        <CalendarIcon className="drp-trigger-icon" />
        <span className="drp-trigger-text">{triggerText}</span>
        {spanDays > 0 && <span className="drp-trigger-badge">{spanDays}d</span>}
      </button>

      <PopoverPortal anchorRef={triggerRef} open={open} onClose={close} align={align}>
        <div className="drp-pop">
          <div className="drp-pop-head">
            <button type="button" className="drp-nav" onClick={() => setAnchorMonth(m => addMonths(m, -1))} aria-label="Previous month">
              <ChevronLeft style={{ width: 15, height: 15 }} />
            </button>
            <span className="drp-hint">
              {draftFrom
                ? (maxRangeDays ? `Pick the end date — up to ${maxRangeDays} days` : 'Pick the end date')
                : 'Pick the start date'}
            </span>
            <button type="button" className="drp-nav" onClick={() => setAnchorMonth(m => addMonths(m, 1))} aria-label="Next month">
              <ChevronRight style={{ width: 15, height: 15 }} />
            </button>
          </div>

          <div className="drp-months">
            {[0, 1].map(offset => {
              const monthStart = addMonths(anchorMonth, offset);
              return (
                <MonthGrid
                  key={offset}
                  monthStart={monthStart}
                  from={from}
                  to={to}
                  hovered={hovered}
                  onPick={handlePick}
                  onHover={setHovered}
                  isDisabled={isDisabled}
                  isOutOfMonth={(day, ms) => day.getMonth() !== ms.getMonth()}
                />
              );
            })}
          </div>

          <div className="drp-pop-foot">
            {maxRangeDays
              ? <span className="drp-foot-note">Maximum range {maxRangeDays} days</span>
              : <span className="drp-foot-note">Any range</span>}
            <div className="drp-foot-actions">
              {PRESETS.filter(p => !maxRangeDays || p.days <= maxRangeDays).map(p => (
                <button
                  key={p.label}
                  type="button"
                  className="drp-preset"
                  onClick={() => {
                    const end = max;
                    const start = addDays(end, -(p.days - 1));
                    setDraftFrom(null);
                    setHovered(null);
                    setOpen(false);
                    onChange?.({ from: toKey(min && start < min ? min : start), to: toKey(end) });
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PopoverPortal>
    </div>
  );
}

const PRESETS = [
  { label: 'Today', days: 1 },
  { label: '3D', days: 3 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
];
