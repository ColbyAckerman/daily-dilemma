// lib/uid.js
// Persistent per-device id. Backs callsign ownership and live-duel identity.
// Survives the "start over" reset — it's who you are, not what you're building.

const KEY = 'dd-uid';

export function getUid() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id =
        'u_' +
        ((typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID().replace(/-/g, '')
          : Math.random().toString(36).slice(2) + Date.now().toString(36)));
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch (e) {
    return 'u_ephemeral';
  }
}
