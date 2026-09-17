import { TOTAL, availability, draw, validatePrizes, TIME_ZONE } from './game.js';
import { readCloudState, saveCloudSpin, parseCloudState, cloudError } from './cloud.js';
import { createWheelSound } from './sound.js';

const $ = selector => document.querySelector(selector);
const wheelSound = createWheelSound($('#sound-toggle'), TOTAL);
let prizes = [];
const used = {};
const won = new Map();
let spinning = false;
let rotation = 0;
let lastFocus;
let cloudReady = false;
let syncing = false;
let serverClock = null;
let pendingRequest = null;
const pendingKey = 'chicu-2026-pending-spin';
try { pendingRequest = localStorage.getItem(pendingKey); } catch { /* Storage may be disabled. */ }
if (pendingRequest && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pendingRequest)) pendingRequest = null;

function rememberRequest(id) {
  pendingRequest = id;
  try {
    if (id) localStorage.setItem(pendingKey, id);
    else localStorage.removeItem(pendingKey);
  } catch { /* Server history still survives even when browser storage is unavailable. */ }
}

function gameNow() {
  return serverClock ? new Date(serverClock.time + performance.now() - serverClock.received) : new Date();
}

async function syncCloud() {
  if (syncing || spinning || !prizes.length) return;
  syncing = true;
  update();
  try {
    const state = parseCloudState(await readCloudState(), prizes);
    for (const date of Object.keys(used)) delete used[date];
    Object.assign(used, state.used);
    won.clear();
    for (const [id, entry] of state.won) won.set(id, entry);
    serverClock = { time: state.serverTime, received: performance.now() };
    cloudReady = true;
    const recovered = [...won.values()].find(entry => entry.requestId === pendingRequest);
    if (recovered) rememberRequest(null);
    $('#cloud-status').textContent = pendingRequest ? 'Hay un giro pendiente de confirmar. Reintentá para recuperar el resultado.' : 'Colección compartida · guardada en la nube';
    renderCards();
    if (recovered && !document.querySelector('dialog[open]')) showResult(recovered.prize, false);
  } catch (error) {
    cloudReady = false;
    $('#cloud-status').textContent = cloudError(error);
  } finally {
    syncing = false;
    update();
  }
}
const colors = ['#e9583c', '#f5c64e', '#87b8ab', '#ece0bf', '#7e73a7'];
const wheel = $('#wheel');
const NS = 'http://www.w3.org/2000/svg';

function svgElement(tag, attributes) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function buildWheel() {
  const angle = 2 * Math.PI / TOTAL;
  for (let i = 0; i < TOTAL; i++) {
    const a = i * angle - Math.PI / 2 - angle / 2;
    const b = a + angle;
    const point = theta => `${250 + 246 * Math.cos(theta)},${250 + 246 * Math.sin(theta)}`;
    wheel.append(svgElement('path', { d: `M250,250 L${point(a)} A246,246 0 0,1 ${point(b)} Z`, fill: colors[i % colors.length], stroke: '#312d66', 'stroke-width': '.8' }));
    const text = svgElement('text', { x: 250, y: 32, fill: '#292545', 'font-size': 12, 'font-family': 'Arial, sans-serif', 'font-weight': 700, 'text-anchor': 'middle', transform: `rotate(${i * 360 / TOTAL} 250 250)` });
    text.textContent = i + 1;
    wheel.append(text);
  }
}

function update() {
  const status = availability(used, gameNow());
  $('#availability').textContent = !cloudReady ? 'Conectá con tu colección para girar. Mientras tanto, podés probar la rueda.' : won.size === TOTAL ? '¡Completaste todas las sorpresas!' : status.message;
  $('#spin').disabled = !prizes.length || spinning || syncing || !cloudReady || (!pendingRequest && (!status.remaining || won.size === TOTAL));
  $('#test-spin').disabled = !prizes.length || spinning || syncing;
  $('#refresh-cloud').disabled = spinning || syncing;
  $('#spin').textContent = spinning ? 'Girando…' : pendingRequest ? 'Reintentar giro' : '¡Girar la rueda! ↗';
  $('#remaining').textContent = TOTAL - won.size;
  $('#album-count').textContent = won.size;
  $('#collection-progress').textContent = `${won.size} de ${TOTAL}`;
  $('#album-empty').hidden = won.size > 0;
  $('#today').textContent = new Intl.DateTimeFormat('es-AR', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' }).format(gameNow()).toUpperCase();
}

function showTab(name) {
  for (const tab of ['wheel', 'album']) {
    const selected = tab === name;
    $(`#${tab}-tab`).setAttribute('aria-selected', String(selected));
    $(`#${tab}-tab`).tabIndex = selected ? 0 : -1;
    $(`#${tab}-panel`).hidden = !selected;
  }
}

function renderCards() {
  const fragment = document.createDocumentFragment();
  for (const prize of prizes) {
    const unlocked = won.has(prize.id);
    const card = document.createElement(unlocked ? 'button' : 'div');
    card.className = `card ${unlocked ? `unlocked ${prize.type}` : ''}`;
    const number = document.createElement('strong');
    number.textContent = String(prize.id).padStart(2, '0');
    const caption = document.createElement('span');
    caption.textContent = unlocked ? prize.title : 'Por descubrir';
    card.append(number, caption);
    if (unlocked) {
      card.setAttribute('aria-label', `Ver sorpresa ${prize.id}: ${prize.title}`);
      card.addEventListener('click', () => showResult(prize, false));
    }
    fragment.append(card);
  }
  $('#cards').replaceChildren(fragment);
}

function openDialog(dialog) {
  lastFocus = document.activeElement;
  dialog.showModal();
}

function showResult(prize, test) {
  $('#result-label').textContent = `${test ? 'GIRO DE PRUEBA · ' : ''}SORPRESA Nº ${String(prize.id).padStart(2, '0')}`;
  const content = $('#result-content');
  content.replaceChildren();
  const container = document.createElement('div');
  const title = document.createElement('h2');
  title.id = 'result-title';
  title.textContent = prize.title;
  if (prize.type === 'prize') {
    container.className = 'diploma';
    const overline = document.createElement('p');
    overline.className = 'eyebrow';
    overline.textContent = 'DIPLOMA DE BUENA ONDA';
    const seal = document.createElement('span');
    seal.className = 'seal';
    seal.textContent = '✷';
    seal.setAttribute('aria-hidden', 'true');
    const text = document.createElement('p');
    text.textContent = prize.text;
    const signature = document.createElement('small');
    signature.textContent = 'CON CARIÑO · EL CHICU CLUB';
    container.append(overline, seal, title, text, signature);
  } else {
    const image = document.createElement('img');
    image.className = 'meme-image';
    image.alt = prize.alt;
    image.src = prize.image;
    image.addEventListener('error', () => {
      const fallback = document.createElement('p');
      fallback.className = 'image-error';
      fallback.textContent = 'Esta imagen todavía no está lista. La sorpresa sigue siendo tuya.';
      image.replaceWith(fallback);
    }, { once: true });
    container.append(title, image);
  }
  content.append(container);
  openDialog($('#result'));
}

async function spin(test = false) {
  if (spinning || syncing || !prizes.length || $('#result').open) return;
  const status = availability(used, gameNow());
  if (!test && (!cloudReady || (!pendingRequest && (!status.remaining || won.size === TOTAL)))) { update(); return; }
  const pool = prizes.filter(p => !won.has(p.id));
  let selected;
  spinning = true;
  update();
  if (test) selected = draw(pool.length ? pool : prizes);
  else {
    try {
      // Reuse the request ID after timeouts so retries cannot spend another turn.
      rememberRequest(pendingRequest || crypto.randomUUID());
      $('#cloud-status').textContent = 'Guardando tu giro…';
      const saved = await saveCloudSpin(pendingRequest);
      selected = prizes.find(prize => prize.id === saved.prize_id);
      if (!selected) throw new Error('Invalid saved prize');
      if (!won.has(selected.id)) {
        used[saved.spin_date] = (used[saved.spin_date] || 0) + 1;
        won.set(selected.id, { prize: selected, date: saved.spin_date, requestId: saved.request_id });
      }
      rememberRequest(null);
      $('#cloud-status').textContent = 'Giro guardado. ¡Acá viene tu sorpresa!';
    } catch (error) {
      if (error?.message?.includes('CHICU_')) rememberRequest(null);
      const recoveringRequest = pendingRequest;
      spinning = false;
      await syncCloud();
      const recovered = recoveringRequest && [...won.values()].some(entry => entry.requestId === recoveringRequest);
      $('#cloud-status').textContent = recovered ? 'Recuperamos tu giro: ya estaba guardado.' : pendingRequest ? 'No pudimos confirmar el giro. Reintentá para recuperar el mismo resultado sin gastar otro giro.' : cloudError(error);
      update();
      return;
    }
  }
  update();
  const target = (360 - (selected.id - 1) * 360 / TOTAL) % 360;
  const destination = rotation + 5 * 360 + ((target - rotation % 360 + 360) % 360);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animation = wheel.animate([{ transform: `rotate(${rotation}deg)` }, { transform: `rotate(${destination}deg)` }], { duration: reduced ? 100 : 4700, easing: 'cubic-bezier(.12,.66,.12,1)', fill: 'forwards' });
  wheelSound.start(animation, destination - rotation);
  try { await animation.finished; } catch { /* A canceled animation still reveals the reserved result. */ }
  finally { wheelSound.stop(); }
  rotation = destination % 360;
  wheel.style.transform = `rotate(${rotation}deg)`;
  animation.cancel();
  spinning = false;
  update();
  renderCards();
  showResult(selected, test);
  if (!test) void syncCloud();
  return { number: selected.id, type: selected.type, test };
}

for (const name of ['wheel', 'album']) {
  $(`#${name}-tab`).addEventListener('click', () => showTab(name));
  $(`#${name}-tab`).addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'wheel' : event.key === 'End' ? 'album' : name === 'wheel' ? 'album' : 'wheel';
    showTab(next);
    $(`#${next}-tab`).focus();
  });
}
$('#spin').addEventListener('click', () => {
  $('#confirmation').returnValue = '';
  openDialog($('#confirmation'));
});
$('#confirmation').addEventListener('close', () => {
  if ($('#confirmation').returnValue === 'spin') spin(false);
});
// Resume audio from a direct user gesture, before a database request can delay it.
$('#confirm-spin').addEventListener('click', () => { void wheelSound.unlock(); });
$('#test-spin').addEventListener('click', () => { void wheelSound.unlock(); void spin(true); });
$('#refresh-cloud').addEventListener('click', syncCloud);
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close('cancel')));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => {
  if (lastFocus?.isConnected && !lastFocus.disabled) lastFocus.focus();
  else $('#wheel-tab').focus();
}));

buildWheel();
try {
  const response = await fetch('./data/prizes.json');
  if (!response.ok) throw new Error('No se pudo cargar el archivo de sorpresas.');
  prizes = validatePrizes(await response.json());
  renderCards();
  update();
  void syncCloud();
  setInterval(update, 15000);
  setInterval(() => { if (!document.hidden) void syncCloud(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void syncCloud(); });
  window.addEventListener('online', syncCloud);
} catch (error) {
  $('#availability').textContent = `${error.message} Revisá data/prizes.json y recargá la página.`;
  $('#availability').classList.add('error');
}

if (document.modelContext?.registerTool) {
  try {
    Promise.resolve(document.modelContext.registerTool({
      name: 'preview_chicu_spin',
      description: 'Run a test spin and open its surprise. Does not consume a daily turn or unlock a card.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false },
      async execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Expected an empty object.');
        if (!prizes.length || spinning || document.querySelector('dialog[open]')) throw new Error('The wheel is not ready, or a dialog is open.');
        showTab('wheel');
        return await spin(true);
      },
    })).catch(() => {});
  } catch { /* Optional browser capability. The visible game works without it. */ }
}
