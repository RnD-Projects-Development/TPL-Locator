import { useEffect } from 'react';

const DEVICES_UPDATED_EVENT = 'tpl_devices_updated';

/**
 * Broadcasts a global event indicating that device data has been modified
 * (renamed, reassigned, bound, or fresh polling data arrived).
 */
export function emitDevicesUpdated() {
  window.dispatchEvent(new CustomEvent(DEVICES_UPDATED_EVENT));
}

/**
 * Custom React hook to listen for global device updates and execute a callback.
 * Automatically cleans up the event listener on unmount.
 *
 * @param {Function} callback - The function to call when devices are updated.
 */
export function useDeviceUpdates(callback) {
  useEffect(() => {
    if (!callback) return;
    
    // Wrap callback to ensure we don't accidentally pass the Event object
    // as an argument to functions that might misinterpret it
    const handler = () => callback();
    
    window.addEventListener(DEVICES_UPDATED_EVENT, handler);
    return () => window.removeEventListener(DEVICES_UPDATED_EVENT, handler);
  }, [callback]);
}
