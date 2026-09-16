// frontend/src/utils/deviceCardDisplay.js

function matchQuality(fieldValue, query) {
  if (!fieldValue || !query) return 0;
  const f = String(fieldValue).toLowerCase().trim();
  const q = String(query).toLowerCase().trim();
  if (!f || !q) return 0;
  if (f === q) return 3; // exact match
  if (f.startsWith(q)) return 2; // prefix match
  if (f.includes(q)) return 1; // substring match
  return 0;
}

/**
 * Resolves the primary title and supporting subtitle fields for a device card
 * dynamically according to the active search term.
 *
 * If a search query matches:
 * - Device Name -> Title is Device Name, subtitle shows User & SN
 * - Serial Number -> Title is SN, subtitle shows Name & User
 * - User Name/Email -> Title is User Name, subtitle shows Name & SN
 * - Client -> Title is Client Name, subtitle shows Name, User & SN
 * - Category -> Title is Category, subtitle shows Name, User & SN
 *
 * If no search query is active (default browsing view):
 * - Title is Device Name (if custom name assigned) or User Name (if bound) or SN
 * - Subtitles show the remaining attributes cleanly
 */
export function getDeviceCardDisplay(device, searchTerm = '') {
  if (!device) {
    return {
      primaryTitle: 'Unknown Device',
      subTitle: '',
      extraSub: '',
      matchedField: null,
      sn: '',
      name: '',
      userName: '',
      client: '',
      category: '',
    };
  }

  const sn = String(device.sn || device.id || device.local_id || '').trim();
  let name = String(device.name || device.assigned_name || '').trim();
  // If name is merely the SN fallback, treat it as not having a custom name
  if (name.toLowerCase() === sn.toLowerCase()) {
    name = '';
  }

  const userName = String(
    device.assigned_user_name ||
    device.assignedUser ||
    device.userName ||
    device.user_name ||
    ''
  ).trim();

  const client = String(device.client || device.company || '').trim();
  const category = String(device.category || '').trim();
  const q = String(searchTerm || '').trim().toLowerCase();

  // ── Default view (no search active) ──────────────────────────────────────────
  if (!q) {
    const primaryTitle = name || userName || sn || 'Unknown Device';
    let subTitle = '';
    let extraSub = '';

    if (primaryTitle === name) {
      subTitle = userName || '';
      extraSub = sn;
    } else if (primaryTitle === userName) {
      subTitle = sn;
      extraSub = client;
    } else {
      subTitle = client || (userName ? userName : '');
      extraSub = '';
    }

    return {
      primaryTitle,
      subTitle,
      extraSub,
      matchedField: null,
      sn,
      name,
      userName,
      client,
      category,
    };
  }

  // ── Active search: score match relevance for each field ──────────────────────
  const scores = [
    { field: 'name',     score: matchQuality(name, q),     val: name     },
    { field: 'sn',       score: matchQuality(sn, q),       val: sn       },
    { field: 'user',     score: matchQuality(userName, q), val: userName },
    { field: 'client',   score: matchQuality(client, q),   val: client   },
  ].filter(c => c.score > 0);

  // Highest match quality wins; ties break in natural order: name > sn > user > client
  scores.sort((a, b) => b.score - a.score);

  const best = scores[0] || null;
  const matchedField = best ? best.field : null;

  let primaryTitle = '';
  let subTitle = '';
  let extraSub = '';

  switch (matchedField) {
    case 'name':
      primaryTitle = name;
      subTitle = userName || '';
      extraSub = sn;
      break;

    case 'sn':
      primaryTitle = sn;
      subTitle = name || userName || '';
      extraSub = name && userName ? userName : (client || '');
      break;

    case 'user':
      primaryTitle = userName;
      subTitle = name || '';
      extraSub = sn;
      break;

    case 'client':
      primaryTitle = client;
      subTitle = name || userName || sn;
      extraSub = primaryTitle !== sn && subTitle !== sn ? sn : '';
      break;

    default:
      primaryTitle = name || userName || sn || 'Unknown Device';
      subTitle = userName || '';
      extraSub = sn;
      break;
  }

  return {
    primaryTitle,
    subTitle,
    extraSub,
    matchedField,
    sn,
    name,
    userName,
    client,
    category,
  };
}
