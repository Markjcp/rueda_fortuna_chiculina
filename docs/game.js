export const TIME_ZONE = 'America/Argentina/Buenos_Aires';
export const START = '2026-09-16';
export const END = '2026-12-21';

export function calendar() {
  const days = [];
  for (let date = new Date(`${START}T12:00:00Z`); date.toISOString().slice(0, 10) <= END; date.setUTCDate(date.getUTCDate() + 1)) {
    const weekday = date.getUTCDay();
    if (weekday > 0 && weekday < 6) days.push({ date: date.toISOString().slice(0, 10), spins: weekday === 1 ? 2 : 1 });
  }
  return days;
}
export const TOTAL = calendar().reduce((sum, day) => sum + day.spins, 0);

export function argentinaTime(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export function availability(used, now = new Date()) {
  const { date, hour } = argentinaTime(now);
  const day = calendar().find(day => day.date === date);
  const allowed = day ? (day.spins === 2 && hour >= 12 ? 2 : 1) : 0;
  const remaining = Math.max(0, allowed - (used[date] || 0));
  let message = remaining ? `Tenés ${remaining} ${remaining === 1 ? 'giro disponible' : 'giros disponibles'} hoy.` : 'Por hoy, ya giraste. ¡Volvé el próximo día hábil!';
  if (!day) message = date < START ? 'La rueda abre el 16 de septiembre. ¡Podés probarla mientras tanto!' : date > END ? 'Terminó esta edición. ¡Qué buena vuelta compartimos!' : 'La rueda descansa el finde. ¡Nos vemos el lunes!';
  if (day?.spins === 2 && hour < 12 && !remaining) message = 'Tu giro extra se habilita hoy a las 12 h de Argentina.';
  return { date, remaining, message };
}

export function draw(pool, random = Math.random) {
  if (!pool.length) throw new Error('No quedan números disponibles.');
  return pool[Math.floor(random() * pool.length)];
}

export function validatePrizes(prizes) {
  if (!Array.isArray(prizes) || prizes.length !== TOTAL) throw new Error(`Debe haber ${TOTAL} sorpresas.`);
  const ids = new Set();
  for (const p of prizes) {
    if (!Number.isInteger(p.id) || p.id < 1 || p.id > TOTAL || ids.has(p.id) || !['prize', 'meme'].includes(p.type) || typeof p.title !== 'string' || !p.title.trim() || (p.type === 'prize' && typeof p.text !== 'string') || (p.type === 'meme' && (typeof p.image !== 'string' || !p.image.startsWith('./assets/') || typeof p.alt !== 'string'))) throw new Error('Hay una sorpresa incompleta o un número repetido.');
    ids.add(p.id);
  }
  return prizes.sort((a, b) => a.id - b.id);
}
