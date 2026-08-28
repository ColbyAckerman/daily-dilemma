// lib/validate.js
// Server-side validation + sanitization for the public write endpoint.
// Never trust the client payload: cap lengths, strip control chars, and
// validate every rule against the allowed enum.

export const RULE_SPECS = {
  opp_last: (p) => ({ move: mv(p.move) }),
  my_last: (p) => ({ move: mv(p.move) }),
  opp_streak: (p) => ({ move: mv(p.move), n: clampInt(p.n, 1, 50, 2) }),
  opp_defect_gte: (p) => ({ n: clampInt(p.n, 1, 999, 1) }),
  opp_coop_rate: (p) => ({
    cmp: p.cmp === 'lte' ? 'lte' : 'gte',
    pct: clampInt(p.pct, 0, 100, 50),
  }),
  round_is: (p) => ({
    cmp: ['eq', 'gte', 'multiple'].includes(p.cmp) ? p.cmp : 'gte',
    n: clampInt(p.n, 1, 1000, 10),
  }),
  random_chance: (p) => ({ pct: clampInt(p.pct, 0, 100, 10) }),
};

export const MAX_RULES = 12;
export const MAX_NAME = 30;
export const MAX_AUTHOR = 20;
export const MIN_AUTHOR = 2;

const RESERVED_CALLSIGNS = new Set([
  'ANONYMOUS',
  'ANON',
  'BOT',
  'HOUSE',
  'HOUSE_BOT',
  'ADMIN',
  'SYSTEM',
  'MODERATOR',
  'MOD',
  'NULL',
  'UNDEFINED',
  'YOU',
]);

// Callsign = one uppercase word, letters + underscores only. Anything else
// (spaces, digits, periods, punctuation) collapses to a single underscore.
export function normalizeCallsign(s) {
  if (typeof s !== 'string') return '';
  return s
    .toUpperCase()
    .replace(/[^A-Z_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_AUTHOR);
}

// Same idea, but keeps a trailing underscore so it doesn't fight the user
// mid-type in the input field.
export function formatCallsignLive(s) {
  if (typeof s !== 'string') return '';
  return s
    .toUpperCase()
    .replace(/[^A-Z_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+/g, '')
    .slice(0, MAX_AUTHOR);
}

export function callsignError(callsign) {
  if (!callsign) return 'Pick a callsign.';
  if (callsign.length < MIN_AUTHOR) return 'Callsign is too short.';
  if (!/^[A-Z][A-Z_]*$/.test(callsign)) return 'Letters and underscores only.';
  if (RESERVED_CALLSIGNS.has(callsign)) return 'That callsign is reserved.';
  return null;
}

function mv(x) {
  return x === 'D' ? 'D' : 'C';
}

function clampInt(x, lo, hi, dflt) {
  let n = Math.floor(Number(x));
  if (!Number.isFinite(n)) n = dflt;
  if (n < lo) n = lo;
  if (n > hi) n = hi;
  return n;
}

// Strip C0 control chars + DEL, collapse whitespace, trim, cap length.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

export function sanitizeText(s, max) {
  if (typeof s !== 'string') return '';
  return s.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function validateStrategyInput(body) {
  const errors = [];
  body = body && typeof body === 'object' ? body : {};

  const author = normalizeCallsign(body.author);
  const cErr = callsignError(author);
  if (cErr) errors.push(cErr);

  const name = sanitizeText(body.name, MAX_NAME);
  if (!name) errors.push('A strategy name is required.');

  const firstMove = body.firstMove === 'D' ? 'D' : 'C';
  const dflt = body.default === 'D' ? 'D' : 'C';

  let rules = Array.isArray(body.rules) ? body.rules.slice(0, MAX_RULES) : [];
  rules = rules
    .filter((r) => r && typeof r === 'object' && RULE_SPECS[r.type])
    .map((r) => ({
      type: r.type,
      params: RULE_SPECS[r.type](
        r.params && typeof r.params === 'object' ? r.params : {}
      ),
      action: r.action === 'D' ? 'D' : 'C',
    }));

  return {
    ok: errors.length === 0,
    errors,
    value: { author, name, firstMove, rules, default: dflt },
  };
}
