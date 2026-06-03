// ─── Companies ────────────────────────────────────────────────────────────────
export const companies = [
  { id: 'C001', name: 'BlueStar Logistics',  industry: 'Logistics',     devices: 142, plan: 'Enterprise', status: 'Active' },
  { id: 'C002', name: 'MediCare Pharma',     industry: 'Healthcare',    devices: 64,  plan: 'Business',   status: 'Active' },
  { id: 'C003', name: 'RetailChain Ltd',     industry: 'Retail',        devices: 38,  plan: 'Starter',    status: 'Active' },
  { id: 'C004', name: 'AutoZone India',      industry: 'Automotive',    devices: 91,  plan: 'Business',   status: 'Suspended' },
]

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = [
  { id: 'U001', name: 'Arjun Mehta',    email: 'arjun@bletrack.io',   role: 'Super Admin',    company: 'BLETrack Platform',  status: 'Active',   lastLogin: '2026-05-15 09:12' },
  { id: 'U002', name: 'Priya Sharma',   email: 'priya@bluestar.com',  role: 'Company Admin',  company: 'BlueStar Logistics', status: 'Active',   lastLogin: '2026-05-15 08:44' },
  { id: 'U003', name: 'Rajan Kumar',    email: 'rajan@bluestar.com',  role: 'Operator',       company: 'BlueStar Logistics', status: 'Active',   lastLogin: '2026-05-15 07:30' },
  { id: 'U004', name: 'Suresh Nair',    email: 'suresh@bluestar.com', role: 'Viewer',         company: 'BlueStar Logistics', status: 'Active',   lastLogin: '2026-05-14 18:22' },
  { id: 'U005', name: 'Kavita Devi',    email: 'kavita@medicare.com', role: 'Company Admin',  company: 'MediCare Pharma',   status: 'Active',   lastLogin: '2026-05-15 06:55' },
  { id: 'U006', name: 'Amit Patel',     email: 'amit@retail.com',     role: 'Operator',       company: 'RetailChain Ltd',   status: 'Inactive', lastLogin: '2026-05-10 14:00' },
]

// ─── BLE Locators ─────────────────────────────────────────────────────────────
export const locators = [
  { id: 'LOC-001', bleId: 'AA:BB:CC:11:22:01', userName: 'Rajan Kumar',    category: 'Human',   company: 'BlueStar Logistics', battery: 78, status: 'Active',   lastSeen: '2026-05-15 09:58', lastLocation: 'Andheri East, Mumbai',     hoursAgo: 0.03, rssi: -58, detections: 142 },
  { id: 'LOC-002', bleId: 'AA:BB:CC:11:22:02', userName: 'Priya Sharma',   category: 'Human',   company: 'BlueStar Logistics', battery: 92, status: 'Active',   lastSeen: '2026-05-15 09:45', lastLocation: 'BKC, Mumbai',              hoursAgo: 0.25, rssi: -62, detections: 98  },
  { id: 'LOC-003', bleId: 'AA:BB:CC:11:22:03', userName: 'Wallet #A12',    category: 'Wallet',  company: 'BlueStar Logistics', battery: 45, status: 'Active',   lastSeen: '2026-05-15 08:30', lastLocation: 'Dadar, Mumbai',            hoursAgo: 1.5,  rssi: -71, detections: 56  },
  { id: 'LOC-004', bleId: 'AA:BB:CC:11:22:04', userName: 'Car Key #KA01',  category: 'Key',     company: 'BlueStar Logistics', battery: 63, status: 'Active',   lastSeen: '2026-05-15 09:00', lastLocation: 'Powai, Mumbai',            hoursAgo: 1.0,  rssi: -65, detections: 78  },
  { id: 'LOC-005', bleId: 'AA:BB:CC:11:22:05', userName: 'Suresh Nair',    category: 'Human',   company: 'BlueStar Logistics', battery: 88, status: 'At Risk',  lastSeen: '2026-05-14 22:00', lastLocation: 'Thane, Mumbai',            hoursAgo: 12,   rssi: -74, detections: 34  },
  { id: 'LOC-006', bleId: 'AA:BB:CC:11:22:06', userName: 'Bruno (Pet)',     category: 'Pet',     company: 'BlueStar Logistics', battery: 54, status: 'At Risk',  lastSeen: '2026-05-14 20:30', lastLocation: 'Juhu Beach, Mumbai',       hoursAgo: 13.5, rssi: -79, detections: 21  },
  { id: 'LOC-007', bleId: 'AA:BB:CC:11:22:07', userName: 'Kavita Devi',    category: 'Human',   company: 'MediCare Pharma',    battery: 71, status: 'Active',   lastSeen: '2026-05-15 09:50', lastLocation: 'Bandra West, Mumbai',      hoursAgo: 0.17, rssi: -60, detections: 67  },
  { id: 'LOC-008', bleId: 'AA:BB:CC:11:22:08', userName: 'Laptop Bag #B3', category: 'Wallet',  company: 'MediCare Pharma',    battery: 12, status: 'Missing',  lastSeen: '2026-05-13 15:00', lastLocation: 'Lower Parel, Mumbai',      hoursAgo: 42,   rssi: null,detections: 8   },
  { id: 'LOC-009', bleId: 'AA:BB:CC:11:22:09', userName: 'Visitor Pass 9', category: 'Human',   company: 'RetailChain Ltd',    battery: 96, status: 'Active',   lastSeen: '2026-05-15 10:00', lastLocation: 'Colaba, Mumbai',           hoursAgo: 0.0,  rssi: -55, detections: 189 },
  { id: 'LOC-010', bleId: 'AA:BB:CC:11:22:10', userName: 'Vikram Bose',    category: 'Human',   company: 'BlueStar Logistics', battery: 34, status: 'Missing',  lastSeen: '2026-05-13 09:00', lastLocation: 'Goregaon, Mumbai',         hoursAgo: 49,   rssi: null,detections: 12  },
]

// ─── BLE Smart Stickers ───────────────────────────────────────────────────────
export const stickers = [
  { id: 'STK-001', bleId: 'E8:FA:C4:22:11:AA', cargoName: 'Electronics Pallet #12',  shipmentId: 'SHP-001', company: 'BlueStar Logistics', category: 'Pallet',    assignedVehicle: 'KA-01-AB-2345', battery: 82, status: 'In Transit',  lastSeen: '2026-05-15 09:58', lastLocation: 'NH-48, Pune Bypass',      lastSource: 'Mobile App',  hoursAgo: 0.03, rssi: -61, detections: 28 },
  { id: 'STK-002', bleId: 'E8:FA:C4:22:11:BB', cargoName: 'Pharma Cold Box A',        shipmentId: 'SHP-002', company: 'MediCare Pharma',    category: 'Carton',    assignedVehicle: 'MH-14-CD-9876', battery: 64, status: 'Delivered',   lastSeen: '2026-05-15 08:30', lastLocation: 'MediCare Depot, Pune',   lastSource: 'Gateway',     hoursAgo: 1.5,  rssi: -54, detections: 45 },
  { id: 'STK-003', bleId: 'E8:FA:C4:22:11:CC', cargoName: 'FMCG Carton #55',          shipmentId: 'SHP-003', company: 'RetailChain Ltd',    category: 'Carton',    assignedVehicle: 'TN-09-EF-4567', battery: 41, status: 'In Transit',  lastSeen: '2026-05-15 09:30', lastLocation: 'Coimbatore Highway',     lastSource: 'Mobile App',  hoursAgo: 0.5,  rssi: -68, detections: 19 },
  { id: 'STK-004', bleId: 'E8:FA:C4:22:11:DD', cargoName: 'Auto Parts Box #7',        shipmentId: 'SHP-004', company: 'AutoZone India',     category: 'Carton',    assignedVehicle: 'DL-12-GH-7654', battery: 93, status: 'In Transit',  lastSeen: '2026-05-15 09:55', lastLocation: 'Delhi–Jaipur Highway',   lastSource: 'Gateway',     hoursAgo: 0.08, rssi: -59, detections: 37 },
  { id: 'STK-005', bleId: 'E8:FA:C4:22:11:EE', cargoName: 'Textile Roll #34',         shipmentId: 'SHP-005', company: 'BlueStar Logistics', category: 'Pallet',    assignedVehicle: 'GJ-25-IJ-8901', battery: 77, status: 'In Transit',  lastSeen: '2026-05-15 09:40', lastLocation: 'Ahmedabad Ring Road',    lastSource: 'Mobile App',  hoursAgo: 0.33, rssi: -66, detections: 22 },
  { id: 'STK-006', bleId: 'E8:FA:C4:22:11:FF', cargoName: 'Container CXYZ-9001',      shipmentId: 'SHP-006', company: 'BlueStar Logistics', category: 'Container', assignedVehicle: 'RJ-14-KL-3210', battery: 58, status: 'In Transit',  lastSeen: '2026-05-15 09:15', lastLocation: 'Jaipur RIICO Area',      lastSource: 'Manual Entry',hoursAgo: 0.75, rssi: -72, detections: 14 },
  { id: 'STK-007', bleId: 'E8:FA:C4:22:22:AA', cargoName: 'Cold Chain Bag #12',       shipmentId: 'SHP-007', company: 'MediCare Pharma',    category: 'Carton',    assignedVehicle: 'AP-28-MN-5432', battery: 22, status: 'At Risk',    lastSeen: '2026-05-14 22:00', lastLocation: 'Hyderabad Outskirts',    lastSource: 'Mobile App',  hoursAgo: 12,   rssi: -81, detections: 9  },
  { id: 'STK-008', bleId: 'E8:FA:C4:22:22:BB', cargoName: 'Chemical Drum #8',         shipmentId: 'SHP-008', company: 'BlueStar Logistics', category: 'Container', assignedVehicle: 'WB-20-OP-6789', battery: 87, status: 'In Transit',  lastSeen: '2026-05-15 09:50', lastLocation: 'Kolkata Port Access Road',lastSource: 'Gateway',     hoursAgo: 0.17, rssi: -58, detections: 31 },
  { id: 'STK-009', bleId: 'E8:FA:C4:22:22:CC', cargoName: 'Steel Coil #19',           shipmentId: null,      company: 'BlueStar Logistics', category: 'Pallet',    assignedVehicle: null,            battery: 95, status: 'Idle',        lastSeen: '2026-05-15 06:00', lastLocation: 'Mumbai Warehouse B4',    lastSource: 'Gateway',     hoursAgo: 4,    rssi: -49, detections: 5  },
  { id: 'STK-010', bleId: 'E8:FA:C4:22:22:DD', cargoName: 'Delivery Bag #45',         shipmentId: 'SHP-009', company: 'RetailChain Ltd',    category: 'Carton',    assignedVehicle: 'KA-01-AB-2345', battery: 73, status: 'Delivered',   lastSeen: '2026-05-15 07:45', lastLocation: 'RetailChain Store #12',  lastSource: 'Mobile App',  hoursAgo: 2.25, rssi: -63, detections: 18 },
  { id: 'STK-011', bleId: 'E8:FA:C4:22:33:AA', cargoName: 'Frozen Goods Box #3',      shipmentId: 'SHP-010', company: 'MediCare Pharma',    category: 'Carton',    assignedVehicle: 'MH-14-CD-9876', battery: 8,  status: 'Missing',     lastSeen: '2026-05-13 10:00', lastLocation: 'Nashik Highway (last)',   lastSource: 'Mobile App',  hoursAgo: 48,   rssi: null,detections: 3  },
  { id: 'STK-012', bleId: 'E8:FA:C4:22:33:BB', cargoName: 'Export Box B-44',          shipmentId: 'SHP-011', company: 'BlueStar Logistics', category: 'Container', assignedVehicle: null,            battery: 31, status: 'Missing',     lastSeen: '2026-05-13 18:00', lastLocation: 'Chennai Port (last seen)',lastSource: 'Gateway',     hoursAgo: 40,   rssi: null,detections: 7  },
]

// ─── Detection Events ─────────────────────────────────────────────────────────
export const detectionEvents = [
  { id: 'DET-001', deviceId: 'LOC-001', deviceType: 'Locator', detectedBy: 'Mobile App',   location: 'Andheri East, Mumbai',     rssi: -58, confidence: 95, timestamp: '2026-05-15 09:58:22', source: 'MOBILE_APP'  },
  { id: 'DET-002', deviceId: 'STK-001', deviceType: 'Sticker', detectedBy: 'BLE Gateway',  location: 'NH-48, Pune Bypass',       rssi: -61, confidence: 91, timestamp: '2026-05-15 09:57:45', source: 'GATEWAY'     },
  { id: 'DET-003', deviceId: 'LOC-009', deviceType: 'Locator', detectedBy: 'Mobile App',   location: 'Colaba, Mumbai',            rssi: -55, confidence: 97, timestamp: '2026-05-15 10:00:00', source: 'MOBILE_APP'  },
  { id: 'DET-004', deviceId: 'STK-004', deviceType: 'Sticker', detectedBy: 'BLE Gateway',  location: 'Delhi–Jaipur Highway',     rssi: -59, confidence: 93, timestamp: '2026-05-15 09:55:30', source: 'GATEWAY'     },
  { id: 'DET-005', deviceId: 'LOC-002', deviceType: 'Locator', detectedBy: 'Mobile App',   location: 'BKC, Mumbai',               rssi: -62, confidence: 88, timestamp: '2026-05-15 09:45:11', source: 'MOBILE_APP'  },
  { id: 'DET-006', deviceId: 'STK-008', deviceType: 'Sticker', detectedBy: 'BLE Gateway',  location: 'Kolkata Port Access Road', rssi: -58, confidence: 94, timestamp: '2026-05-15 09:50:00', source: 'GATEWAY'     },
  { id: 'DET-007', deviceId: 'LOC-007', deviceType: 'Locator', detectedBy: 'Mobile App',   location: 'Bandra West, Mumbai',      rssi: -60, confidence: 90, timestamp: '2026-05-15 09:50:22', source: 'MOBILE_APP'  },
  { id: 'DET-008', deviceId: 'STK-005', deviceType: 'Sticker', detectedBy: 'Mobile App',   location: 'Ahmedabad Ring Road',      rssi: -66, confidence: 84, timestamp: '2026-05-15 09:40:05', source: 'MOBILE_APP'  },
  { id: 'DET-009', deviceId: 'STK-006', deviceType: 'Sticker', detectedBy: 'Manual Entry', location: 'Jaipur RIICO Area',        rssi: -72, confidence: 70, timestamp: '2026-05-15 09:15:00', source: 'MANUAL'      },
  { id: 'DET-010', deviceId: 'LOC-003', deviceType: 'Locator', detectedBy: 'Mobile App',   location: 'Dadar, Mumbai',            rssi: -71, confidence: 80, timestamp: '2026-05-15 08:30:45', source: 'MOBILE_APP'  },
]

// ─── Geofences ────────────────────────────────────────────────────────────────
export const geofences = [
  { id: 'GF-001', name: 'Mumbai HQ',          shape: 'Circle',  radius: 0.5, lat: 19.07, lng: 72.87, devices: 8,  events: 24, status: 'Active', color: '#6366F1' },
  { id: 'GF-002', name: 'Pune Distribution',  shape: 'Circle',  radius: 1.2, lat: 18.52, lng: 73.85, devices: 5,  events: 11, status: 'Active', color: '#10B981' },
  { id: 'GF-003', name: 'Delhi Warehouse',    shape: 'Circle',  radius: 2.0, lat: 28.70, lng: 77.10, devices: 12, events: 38, status: 'Active', color: '#8B5CF6' },
  { id: 'GF-004', name: 'Chennai Port',       shape: 'Polygon', radius: 1.5, lat: 13.08, lng: 80.27, devices: 4,  events: 7,  status: 'Active', color: '#F59E0B' },
  { id: 'GF-005', name: 'Bangalore DC',       shape: 'Circle',  radius: 0.8, lat: 12.97, lng: 77.59, devices: 6,  events: 16, status: 'Inactive', color: '#64748B' },
]

// ─── Alerts ───────────────────────────────────────────────────────────────────
export const alertsData = [
  { id: 'ALT-001', type: 'Missing Device',   severity: 'critical', deviceId: 'LOC-010', message: 'Vikram Bose locator missing for 49h — no detection events', time: '10:02 AM', read: false },
  { id: 'ALT-002', type: 'Missing Device',   severity: 'critical', deviceId: 'STK-011', message: 'Frozen Goods Box STK-011 missing 48h — cold chain at risk',  time: '09:58 AM', read: false },
  { id: 'ALT-003', type: 'Low Battery',      severity: 'high',     deviceId: 'STK-011', message: 'STK-011 battery at 8% — device may go offline soon',         time: '09:50 AM', read: false },
  { id: 'ALT-004', type: 'At Risk',          severity: 'medium',   deviceId: 'LOC-005', message: 'Suresh Nair locator not seen in 12h — classified At Risk',   time: '09:45 AM', read: false },
  { id: 'ALT-005', type: 'At Risk',          severity: 'medium',   deviceId: 'STK-007', message: 'Cold Chain Bag STK-007 not seen in 12h — At Risk',           time: '09:40 AM', read: false },
  { id: 'ALT-006', type: 'Low Battery',      severity: 'medium',   deviceId: 'LOC-008', message: 'Laptop Bag LOC-008 battery at 12%',                          time: '09:30 AM', read: false },
  { id: 'ALT-007', type: 'Geofence Breach',  severity: 'high',     deviceId: 'STK-006', message: 'STK-006 exited Delhi Warehouse geofence without authorization',time:'09:20 AM', read: false },
  { id: 'ALT-008', type: 'New Detection',    severity: 'low',      deviceId: 'LOC-009', message: 'Visitor Pass 9 detected at Colaba — first detection today',   time: '09:15 AM', read: true  },
  { id: 'ALT-009', type: 'Delivery',         severity: 'low',      deviceId: 'STK-002', message: 'Pharma Cold Box delivered to MediCare Depot, Pune',           time: '08:30 AM', read: true  },
  { id: 'ALT-010', type: 'Recovery',         severity: 'low',      deviceId: 'STK-012', message: 'Export Box STK-012 still undetected — 40h since last scan',  time: '08:00 AM', read: true  },
]

// ─── Analytics ────────────────────────────────────────────────────────────────
export const detectionsByHour = [
  { h: '00', count: 4  }, { h: '02', count: 2  }, { h: '04', count: 6  }, { h: '06', count: 18 },
  { h: '08', count: 42 }, { h: '10', count: 38 }, { h: '12', count: 29 }, { h: '14', count: 35 },
  { h: '16', count: 47 }, { h: '18', count: 31 }, { h: '20', count: 14 }, { h: '22', count: 7  },
]

export const deviceStatusTrend = [
  { day: 'Mon', active: 18, atRisk: 4, missing: 1 },
  { day: 'Tue', active: 20, atRisk: 3, missing: 1 },
  { day: 'Wed', active: 17, atRisk: 5, missing: 2 },
  { day: 'Thu', active: 21, atRisk: 2, missing: 1 },
  { day: 'Fri', active: 19, atRisk: 4, missing: 3 },
  { day: 'Sat', active: 15, atRisk: 6, missing: 2 },
  { day: 'Sun', active: 16, atRisk: 3, missing: 2 },
]

export const batteryDistrib = [
  { range: '0–20%', count: 4 }, { range: '21–40%', count: 8 },
  { range: '41–60%', count: 9 }, { range: '61–80%', count: 7 }, { range: '81–100%', count: 8 },
]
