/**
 * BindCacheContext
 *
 * Persists device bind-time history in localStorage so that:
 *  - Unbound devices still appear in the "Bound Devices / Month" chart
 *  - Weekly / monthly bind counts stay accurate across sessions
 *  - All date-scoped helpers derive from a single merged source of truth
 *
 * Usage
 *   Wrap your protected routes with <BindCacheProvider>.
 *   Consume with useBindCache() anywhere inside the tree.
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { registerCacheResetListener } from '../utils/clearAppCaches.js';

// ── Storage ───────────────────────────────────────────────────────────
const STORAGE_KEY = 'tpl_bind_cache_v2';

function readStorage() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function writeStorage(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

// ── Context ───────────────────────────────────────────────────────────
const BindCacheContext = createContext(null);

export function BindCacheProvider({ children }) {
  // { [sn]: isoBindTime }  — grows over time, never shrinks
  const [history, setHistory] = useState(readStorage);

  const resetBindCache = useCallback(() => {
    setHistory({});
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  useEffect(() => registerCacheResetListener(resetBindCache), [resetBindCache]);

  /**
   * Call this whenever a fresh device list arrives from the API.
   * Stores any unseen bindTimes so they survive future unbinding.
   */
  const updateFromDevices = useCallback((devices = []) => {
    setHistory(prev => {
      const next = { ...prev };
      let dirty = false;
      devices.forEach(d => {
        if (d.sn && d.bindTime && !next[d.sn]) {
          next[d.sn] = d.bindTime;
          dirty = true;
        }
      });
      if (!dirty) return prev;
      writeStorage(next);
      return next;
    });
  }, []);

  /**
   * Record a bind the moment it happens (from the bind modal), so the bind
   * history is captured reliably — independent of when the dashboard's device
   * list next refetches, and even for devices beyond the list's fetch cap.
   * Overwrites any prior entry so a re-bind reflects the latest bind date.
   * The history never shrinks, so the bind survives a later unbind.
   */
  const recordBind = useCallback((sn, isoTime) => {
    if (!sn) return;
    const t = isoTime || new Date().toISOString();
    setHistory(prev => {
      if (prev[sn] === t) return prev;
      const next = { ...prev, [sn]: t };
      writeStorage(next);
      return next;
    });
  }, []);

  /**
   * Returns a Map<sn, isoBindTime> that merges:
   *   1. All historically cached entries
   *   2. Current live device data (overwrites stale cache if both present)
   */
  const getMergedBindings = useCallback((devices = []) => {
    const map = new Map(Object.entries(history));
    devices.forEach(d => { if (d.sn && d.bindTime) map.set(d.sn, d.bindTime); });
    return map;
  }, [history]);

  /**
   * Count how many bindings fall within [fromDate, toDate] (both inclusive).
   * fromDate / toDate should be Date objects.
   */
  const countBindsInWindow = useCallback((devices, fromDate, toDate) => {
    const bindings = getMergedBindings(devices);
    const seen = new Set();
    let n = 0;
    devices.forEach(d => {
      if (!d.sn || seen.has(d.sn)) return;
      seen.add(d.sn);
      const bt = bindings.get(d.sn);
      if (!bt) return;
      const dt = new Date(bt);
      if (!isNaN(dt) && dt >= fromDate && dt <= toDate) n++;
    });
    return n;
  }, [getMergedBindings]);

  /**
   * Filter a device array to only those whose bindTime is on or before asOf.
   * Useful for computing "total devices as of date X" in historical mode.
   */
  const getDevicesBoundBy = useCallback((devices, asOf) => {
    const bindings = getMergedBindings(devices);
    return devices.filter(d => {
      const bt = bindings.get(d.sn) ?? null;
      if (!bt) return false;
      const dt = new Date(bt);
      return !isNaN(dt) && dt <= asOf;
    });
  }, [getMergedBindings]);

  return (
    <BindCacheContext.Provider
      value={{ history, updateFromDevices, recordBind, getMergedBindings, countBindsInWindow, getDevicesBoundBy }}
    >
      {children}
    </BindCacheContext.Provider>
  );
}

export function useBindCache() {
  const ctx = useContext(BindCacheContext);
  if (!ctx) throw new Error('useBindCache must be used inside <BindCacheProvider>');
  return ctx;
}
