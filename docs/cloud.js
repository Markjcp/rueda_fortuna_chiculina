import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

async function rpc(name, body = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || 'Cloud request failed'), { code: data.code, status: response.status });
  return data;
}

export async function readCloudState() {
  return rpc('chicu_state');
}

export async function saveCloudSpin(requestId) {
  return rpc('chicu_spin', { p_request_id: requestId });
}

export function cloudError(error) {
  const message = error?.message || '';
  if (message.includes('CHICU_DAILY_LIMIT')) return 'Ya usaste los giros disponibles. Actualizá tu colección.';
  if (message.includes('CHICU_WEEKEND')) return 'La rueda descansa el finde. ¡Nos vemos el lunes!';
  if (message.includes('CHICU_OUTSIDE_CAMPAIGN')) return 'Los giros están disponibles del 16 de septiembre al 21 de diciembre de 2026.';
  if (message.includes('CHICU_COMPLETE')) return '¡Ya completaste todas las sorpresas!';
  if (error?.code === 'PGRST202' || error?.code === '42P01') return 'La colección todavía no está preparada. Podés probar la rueda mientras tanto.';
  return 'No pudimos conectar con tu colección. Revisá la conexión y volvé a intentar.';
}

// Validate a full response before replacing the visible collection.
export function parseCloudState(data, prizes) {
  if (!data || !Array.isArray(data.spins) || !Number.isFinite(Date.parse(data.server_time))) throw new Error('Invalid cloud state');
  const used = {};
  const won = new Map();
  for (const row of data.spins) {
    const prize = prizes.find(p => p.id === row.prize_id);
    if (!prize || won.has(prize.id) || !/^\d{4}-\d{2}-\d{2}$/.test(row.spin_date)) throw new Error('Invalid saved spin');
    used[row.spin_date] = (used[row.spin_date] || 0) + 1;
    won.set(prize.id, { prize, date: row.spin_date, requestId: row.request_id });
  }
  return { used, won, serverTime: Date.parse(data.server_time) };
}
