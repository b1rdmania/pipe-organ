// The song list: the built-in songs, your own MIDI file, and a BitMidi search.
// Pop songs: the arranger finds the chorus and orchestrates every part for the
// organ (engine/orchestrate.js). Bach's organ works play as written.
export const SONGS = [
  { title: 'Believe', by: 'Cher', file: '../songs/cher-believe.mid' },
  { title: 'Toccata in D minor', by: 'J. S. Bach', file: '../songs/ToccataFugue.mid', from: 0, to: 20 },
  { title: 'A Whiter Shade of Pale', by: 'Procol Harum', file: '../songs/procol-whiter-shade-bitmidi.mid', solo: '2/2' },
  { title: 'All I Want for Christmas Is You', by: 'Mariah Carey', file: '../songs/mariah-aiwfc.mid' },
  { title: 'Passacaglia in C minor', by: 'J. S. Bach', file: '../songs/bwv582.mid', from: 0, to: 42 },
  { title: 'Fantasia in G minor', by: 'J. S. Bach', file: '../songs/bwv542-a4-1.mid', from: 0, to: 48 },
];
const BITMIDI = 'https://bitmidi.com'; // its API and files allow loading from the browser

// Wire up the list. `play(song)` is called with the chosen song.
export function songList(play) {
  const $ = (s) => document.querySelector(s);
  let current = null;
  const add = (song) => { SONGS.push(song); choose(song); };
  const choose = (song) => { current = song; draw(); play(song); };
  const pick = Object.assign(document.createElement('input'), { type: 'file', accept: '.mid,.midi,audio/midi' });
  pick.onchange = async () => {
    const f = pick.files[0]; if (!f) return;
    add({ title: f.name.replace(/\.midi?$/i, ''), by: 'your MIDI', data: await f.arrayBuffer() });
  };
  $('#ownmidi').onclick = () => pick.click();
  function draw() {
    const ol = $('#songs'); ol.innerHTML = '';
    for (const s of SONGS) {
      const li = document.createElement('li'), b = document.createElement('button');
      b.textContent = s.title; b.setAttribute('aria-pressed', s === current);
      if (s.by) { const by = document.createElement('span'); by.textContent = s.by; b.append(by); }
      b.onclick = () => choose(s);
      li.append(b); ol.append(li);
    }
  }
  $('#find').onsubmit = async (e) => {
    e.preventDefault();
    const q = $('#q').value.trim(); if (!q) return;
    const ol = $('#results'); ol.innerHTML = '<li><button disabled>…</button></li>';
    try {
      const r = await (await fetch(`${BITMIDI}/api/midi/search?q=${encodeURIComponent(q)}`)).json();
      const rows = (r?.result?.results || []).slice(0, 8);
      ol.innerHTML = '';
      if (!rows.length) { ol.innerHTML = '<li><button disabled>No MIDI found</button></li>'; return; }
      for (const row of rows) {
        const li = document.createElement('li'), b = document.createElement('button');
        const title = String(row.name).replace(/\.midi?$/i, '').replace(/[-_]+/g, ' ').trim();
        b.textContent = title;
        b.onclick = async () => {
          const url = row.downloadUrl || `/uploads/${row.id}.mid`;
          const data = await (await fetch(url.startsWith('http') ? url : BITMIDI + url)).arrayBuffer();
          ol.innerHTML = ''; $('#q').value = '';
          add({ title, by: 'BitMidi', data });
        };
        li.append(b); ol.append(li);
      }
    } catch { ol.innerHTML = '<li><button disabled>BitMidi is not answering</button></li>'; }
  };
  return { draw, isCurrent: (s) => s === current };
}
