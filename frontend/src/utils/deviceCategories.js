// Shared device category lists, used by the Bind modal (Devices page) and the
// Assign User modal (device detail pages) so both stay in sync.

export const BIND_CATS = [
  'wallet', 'bag', 'purse', 'car', 'motorcycle', 'bicycle', 'van', 'truck', 'bus',
  'laptop', 'phone', 'keys', 'pet tracker', 'child tracker', 'asset', 'luggage', 'backpack',
  'pallet', 'carton', 'container', 'parcel', 'equipment', 'other',
]

export const STICKER_CATS = [
  'Mobile Phone', 'Tablet', 'Laptop', 'Camera', 'Drone', 'Gaming Console',
  'Power Bank', 'Headphones', 'Portable Speaker', 'Monitor', 'Printer',
  'Projector', 'Router', 'POS Terminal', 'Toolbox', 'Equipment',
  'Asset', 'Inventory Item', 'Package', 'Other',
]

// Category list for a device type ('sticker' → STICKER_CATS, else BIND_CATS)
export function categoriesFor(deviceType) {
  return deviceType === 'sticker' ? STICKER_CATS : BIND_CATS
}
