// ─────────────────────────────────────────────────────────────
//  BreathLog — script.js
//  Requires: Supabase JS v2 loaded via CDN in index.html
// ─────────────────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════
//  ⚙️  CONFIGURATION — paste your keys here
// ════════════════════════════════════════════════════════════

const SUPABASE_URL         = 'https://yehzylnzhoffmgshnjyi.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_PHKO6h45-jyy3n8ly9L7hQ_vsnxiivH';
const WEATHER_API_KEY      = 'ebdedd454bb01e6c6e80e935cc186ce4';

// ════════════════════════════════════════════════════════════
//  SUPABASE CLIENT
// ════════════════════════════════════════════════════════════

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// ════════════════════════════════════════════════════════════
//  STATE — auto-collected data
// ════════════════════════════════════════════════════════════

let autoData = {
  latitude:    null,
  longitude:   null,
  city:        null,
  state:       null,
  temperature: null,
  humidity:    null,
  raining:     false,
};

// ════════════════════════════════════════════════════════════
//  DOM REFERENCES
// ════════════════════════════════════════════════════════════

const form            = document.getElementById('log-form');
const submitBtn       = document.getElementById('submit-btn');
const btnText         = document.getElementById('btn-text');
const btnSpinner      = document.getElementById('btn-spinner');
const statusBanner    = document.getElementById('status-banner');
const locationStatus  = document.getElementById('location-status');
const weatherStatus   = document.getElementById('weather-status');
const entriesList     = document.getElementById('entries-list');

// ════════════════════════════════════════════════════════════
//  DYSPNEA — read selected radio button value
// ════════════════════════════════════════════════════════════

function getDyspneaValue() {
  const checked = document.querySelector('input[name="dyspnea"]:checked');
  return checked ? parseInt(checked.value, 10) : 0;
}

// ════════════════════════════════════════════════════════════
//  GEOLOCATION + WEATHER  (runs automatically on page load)
// ════════════════════════════════════════════════════════════

function setLocationChip(text, state) {
  locationStatus.textContent = text;
  locationStatus.className = 'status-pill ' + (state || '');
}

function setWeatherChip(text, state) {
  weatherStatus.textContent = text;
  weatherStatus.className = 'status-pill weather-pill ' + (state || '');
}

async function fetchWeather(lat, lon) {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=imperial&appid=${WEATHER_API_KEY}`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error(`Weather API ${res.status}`);
    const data = await res.json();

    autoData.city        = data.name || null;
    autoData.state       = data.sys?.country || null;  // OWM returns country code; for US you can parse state from geo API
    autoData.temperature = data.main?.temp ?? null;
    autoData.humidity    = data.main?.humidity ?? null;

    // Check if any weather condition description includes "rain"
    autoData.raining = (data.weather || []).some(w =>
      w.main?.toLowerCase().includes('rain') ||
      w.description?.toLowerCase().includes('rain')
    );

    // Also try to get the US state name via reverse geocoding endpoint
    await fetchStateFromGeo(lat, lon);

    const tempStr  = autoData.temperature !== null ? `${Math.round(autoData.temperature)}°F` : '—';
    const humStr   = autoData.humidity    !== null ? `${autoData.humidity}%`                 : '—';
    const rainStr  = autoData.raining ? ' 🌧' : '';
    setWeatherChip(`🌡 ${tempStr} · 💧 ${humStr}${rainStr}`, 'ready');
  } catch (err) {
    console.error('Weather fetch error:', err);
    setWeatherChip('🌡 Weather unavailable', 'error');
  }
}

// Use OWM Geo API for better city/state data (US-specific state name)
async function fetchStateFromGeo(lat, lon) {
  try {
    const url = `https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${WEATHER_API_KEY}`;
    const res  = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (data && data[0]) {
      autoData.city  = data[0].name        || autoData.city;
      autoData.state = data[0].state       || data[0].country || autoData.state;
    }
  } catch (_) { /* silently ignore — we already have fallback from OWM */ }
}

function initLocation() {
  if (!navigator.geolocation) {
    setLocationChip('📍 GPS not supported', 'error');
    setWeatherChip('🌡 Weather unavailable', 'error');
    return;
  }

  setLocationChip('📍 Fetching location…');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      autoData.latitude  = pos.coords.latitude;
      autoData.longitude = pos.coords.longitude;
      setLocationChip(`📍 ${autoData.latitude.toFixed(3)}, ${autoData.longitude.toFixed(3)}`, 'ready');
      await fetchWeather(autoData.latitude, autoData.longitude);
      // Update location chip with city once we have it
      if (autoData.city) {
        const loc = autoData.state ? `${autoData.city}, ${autoData.state}` : autoData.city;
        setLocationChip(`📍 ${loc}`, 'ready');
      }
    },
    (err) => {
      console.error('Geolocation error:', err);
      setLocationChip('📍 Location denied', 'error');
      setWeatherChip('🌡 Weather unavailable', 'error');
    },
    { timeout: 10000, maximumAge: 60000 }
  );
}

// ════════════════════════════════════════════════════════════
//  FORM SUBMIT
// ════════════════════════════════════════════════════════════

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideBanner();
  setSubmitting(true);

  const entry = {
    dyspnea:               getDyspneaValue(),
    at_home:               document.getElementById('at_home').checked,
    outside:               document.getElementById('outside').checked,
    working_out_or_active: document.getElementById('working_out_or_active').checked,
    wearing_mask:          document.getElementById('wearing_mask').checked,
    other_symptoms:        document.getElementById('other_symptoms').value.trim() || null,
    notes:                 document.getElementById('notes').value.trim()          || null,
    // auto-collected
    latitude:              autoData.latitude,
    longitude:             autoData.longitude,
    city:                  autoData.city,
    state:                 autoData.state,
    temperature:           autoData.temperature,
    humidity:              autoData.humidity,
    raining:               autoData.raining,
  };

  try {
    const { error } = await db.from('entries').insert([entry]);
    if (error) throw error;

    showBanner('✓ Entry logged successfully!', 'success');
    form.reset();
    // Restore default checked state after reset
    document.getElementById('at_home').checked = true;
    // Reload entries
    loadEntries();
  } catch (err) {
    console.error('Insert error:', err);
    showBanner(`✗ Error saving entry: ${err.message}`, 'error');
  } finally {
    setSubmitting(false);
  }
});

function setSubmitting(loading) {
  submitBtn.disabled = loading;
  btnText.textContent = loading ? 'Saving…' : 'Log Entry';
  btnSpinner.classList.toggle('hidden', !loading);
}

// ════════════════════════════════════════════════════════════
//  STATUS BANNER
// ════════════════════════════════════════════════════════════

function showBanner(message, type) {
  statusBanner.textContent = message;
  statusBanner.className = `banner ${type}`;
  statusBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  // Auto-hide success after 4 s
  if (type === 'success') {
    setTimeout(hideBanner, 4000);
  }
}

function hideBanner() {
  statusBanner.className = 'banner hidden';
}

// ════════════════════════════════════════════════════════════
//  LOAD & RENDER PREVIOUS ENTRIES
// ════════════════════════════════════════════════════════════

async function loadEntries() {
  entriesList.innerHTML = '<p class="muted">Loading entries…</p>';

  try {
    const { data, error } = await db
      .from('entries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    if (!data || data.length === 0) {
      entriesList.innerHTML = '<p class="muted">No entries yet. Log your first one above!</p>';
      return;
    }

    entriesList.innerHTML = data.map(renderEntry).join('');
  } catch (err) {
    console.error('Load error:', err);
    entriesList.innerHTML = `<p class="muted" style="color:var(--danger)">Could not load entries: ${err.message}</p>`;
  }
}

function renderEntry(e) {
  const date = new Date(e.created_at);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const dyspneaLabelsShort = ['None', 'Mild', 'Moderate', 'Severe'];
  const dyspneaHtml = `<span class="entry-dyspnea d${e.dyspnea}">${e.dyspnea} · ${dyspneaLabelsShort[e.dyspnea]}</span>`;

  const tags = [];
  if (e.at_home)               tags.push('🏠 Home');
  if (e.outside)               tags.push('🌤 Outside');
  if (e.working_out_or_active) tags.push('🏃 Active');
  if (e.wearing_mask)          tags.push('😷 Mask');
  if (e.raining)               tags.push('🌧 Rain');
  const tagsHtml = tags.length
    ? `<div class="entry-tags">${tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>`
    : '';

  const metaParts = [];
  if (e.city || e.state) metaParts.push(`📍 ${[e.city, e.state].filter(Boolean).join(', ')}`);
  if (e.temperature != null) metaParts.push(`${Math.round(e.temperature)}°F`);
  if (e.humidity    != null) metaParts.push(`${e.humidity}% humidity`);
  const metaHtml = metaParts.length
    ? `<div class="entry-meta">${metaParts.join(' · ')}</div>`
    : '';

  const noteParts = [];
  if (e.other_symptoms) noteParts.push(`<strong>Symptoms:</strong> ${escHtml(e.other_symptoms)}`);
  if (e.notes)          noteParts.push(`<strong>Notes:</strong> ${escHtml(e.notes)}`);
  const notesHtml = noteParts.length
    ? `<div class="entry-notes">${noteParts.join('<br/>')}</div>`
    : '';

  return `
    <div class="entry-item">
      <div class="entry-top">
        <span class="entry-date">${dateStr} · ${timeStr}</span>
        ${dyspneaHtml}
      </div>
      ${tagsHtml}
      ${metaHtml}
      ${notesHtml}
    </div>
  `;
}

// Basic HTML escaping to prevent XSS from user-entered text
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════

initLocation();
loadEntries();