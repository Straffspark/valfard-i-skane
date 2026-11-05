/* Välfärdsindex för Skånes kommuner. Data: data.json, byggd av scripts/build_data.py från Kolada. */
(async function () {
  const D = await fetch('data.json', {cache: 'no-cache'}).then(r => r.json());
  const $ = s => document.querySelector(s);
  const name = id => id === '0000' ? 'Riket' : D.kommuner[id];
  const fmt = (v, unit) => v == null ? '–' : (+v).toLocaleString('sv-SE', {maximumFractionDigits: unit === 'kr' ? 0 : 1});
  const years = idx => Object.keys(D[idx]).map(Number).sort((a, b) => a - b);
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const tip = $('#tip');
  const showTip = (ev, lines) => {
    tip.replaceChildren(...lines.map((l, i) => { const d = document.createElement('div'); if (i === 0) d.className = 't'; d.textContent = l; return d; }));
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(ev.clientX + 14, innerWidth - w - 8) + 'px';
    tip.style.top = Math.min(ev.clientY + 14, innerHeight - h - 8) + 'px';
  };
  const hideTip = () => { tip.hidden = true; };

  const skane = D.skane.slice().sort((a, b) => name(a).localeCompare(name(b), 'sv'));
  const measures = D.matt;
  const hash = new URLSearchParams(location.hash.slice(1));
  const state = {
    kommun: skane.includes(hash.get('kommun')) ? hash.get('kommun') : (skane.includes('1282') ? '1282' : skane[0]),
    jamfor: skane.includes(hash.get('jamfor')) ? hash.get('jamfor') : '',
    idx: hash.get('index') === 'karnindex' ? 'karnindex' : 'index',
    matt: measures.some(m => m.key === hash.get('matt')) ? hash.get('matt') : 'arbl_af',
    sort: {col: 'last', dir: 1},
  };

  for (const id of skane) { $('#kommun').add(new Option(name(id), id)); $('#jamfor').add(new Option(name(id), id)); }
  for (const m of measures) $('#matt').add(new Option(`${m.omrade}: ${m.namn}`, m.key));
  $('#kommun').value = state.kommun; $('#jamfor').value = state.jamfor; $('#indextyp').value = state.idx; $('#matt').value = state.matt;
  const sync = () => {
    const p = new URLSearchParams({kommun: state.kommun, index: state.idx, matt: state.matt});
    if (state.jamfor) p.set('jamfor', state.jamfor);
    history.replaceState(null, '', '#' + p);
    render();
  };
  $('#kommun').onchange = e => { state.kommun = e.target.value; sync(); };
  $('#jamfor').onchange = e => { state.jamfor = e.target.value; sync(); };
  $('#indextyp').onchange = e => { state.idx = e.target.value; sync(); };
  $('#matt').onchange = e => { state.matt = e.target.value; sync(); };

  const plats = (idx, id, y) => D[idx][y]?.[id]?.plats ?? null;
  const skaneRank = (idx, id, y) => {
    const arr = skane.map(k => [k, D[idx][y]?.[k]?.poang]).filter(x => x[1] != null).sort((a, b) => a[1] - b[1]);
    const i = arr.findIndex(x => x[0] === id);
    return i < 0 ? null : i + 1;
  };
  const latest = (key, id) => {
    const s = D.varden[key]?.[id];
    if (!s) return null;
    const ys = Object.keys(s).map(Number).sort((a, b) => a - b);
    return {first: ys[0], last: ys[ys.length - 1], v0: s[ys[0]], v1: s[ys[ys.length - 1]]};
  };
  const isBetter = (m, a, b) => m.battre === 'hog' ? a > b : a < b;

  function tiles() {
    const ys = years(state.idx), y1 = ys[ys.length - 1], y0 = ys[0];
    const k = state.kommun;
    const core = measures.filter(m => !m.reserv_for);
    let worse = 0, tot = 0, improved = 0;
    for (const m of core) {
      const a = latest(m.key, k), r = latest(m.key, '0000');
      if (!a) continue;
      if (r && D.varden[m.key]['0000'][a.last] != null) { tot++; if (isBetter(m, D.varden[m.key]['0000'][a.last], a.v1)) worse++; }
      if (isBetter(m, a.v1, a.v0)) improved++;
    }
    const t = [
      [`Plats i Sverige ${y1}`, fmt(plats(state.idx, k, y1)), `${y0}: plats ${fmt(plats(state.idx, k, y0))}`],
      [`Plats i Skåne ${y1}`, `${fmt(skaneRank(state.idx, k, y1))} av ${skane.length}`, `${y0}: plats ${fmt(skaneRank(state.idx, k, y0))}`],
      ['Mått sämre än riket', `${worse} av ${tot}`, 'Senaste år för respektive mått'],
      ['Mått som förbättrats', `${improved} av ${core.length}`, 'Jämfört med första året med data'],
    ];
    $('#tiles').replaceChildren(...t.map(([l, b, s]) => {
      const d = document.createElement('div'); d.className = 'tile';
      for (const [cls, txt] of [['lbl', l], ['big', b], ['sub', s]]) { const p = document.createElement('div'); p.className = cls; p.textContent = txt; d.appendChild(p); }
      return d;
    }));
  }

  function lineChart(el, {xs, series, yDomain, invert, yLabel, below, tipFmt}) {
    el.replaceChildren();
    const W = Math.max(320, el.clientWidth), H = 340, m = {t: 14, r: 20, b: below ? 46 : 28, l: 46};
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
    for (const s of series.filter(s => s.label)) {
      const lp = s.pts.filter(p => p[1] != null).pop(); if (!lp) continue;
      const pr = svg.append('text').style('font-weight', 600).text(`${s.label} ${tipFmt(lp[1])}`);
      m.r = Math.max(m.r, pr.node().getComputedTextLength() + 18); pr.remove();
    }
    const x = d3.scaleLinear(d3.extent(xs), [m.l, W - m.r]);
    const y = invert ? d3.scaleLinear(yDomain, [m.t, H - m.b]) : d3.scaleLinear(yDomain, [H - m.b, m.t]).nice();
    svg.append('g').attr('class', 'grid').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).tickValues(invert ? [1, 50, 100, 150, 200, 250, 290] : null).ticks(6).tickSize(-(W - m.l - m.r)).tickFormat(d3.format('~s')));
    svg.append('g').attr('class', 'grid').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(Math.min(xs.length, W < 600 ? 6 : 12)).tickFormat(d3.format('d')).tickSize(0).tickPadding(8));
    if (yLabel) svg.append('text').attr('x', m.l).attr('y', m.t - 2).attr('dy', '-0.2em').text(yLabel).style('font-size', '11px');
    if (below) svg.append('g').selectAll('text').data(xs).join('text').attr('x', d => x(d)).attr('y', H - 8).attr('text-anchor', 'middle').style('font-size', '10px').text(d => below(d));
    const line = d3.line().defined(d => d[1] != null).x(d => x(d[0])).y(d => y(d[1]));
    const order = series.slice().sort((a, b) => (a.z || 0) - (b.z || 0));
    for (const s of order) {
      svg.append('path').attr('d', line(s.pts)).attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', s.w || 2)
        .attr('stroke-dasharray', s.dash || null).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round').attr('opacity', s.op || 1);
      const lastPt = s.pts.filter(p => p[1] != null).pop();
      if (s.label && lastPt) {
        svg.append('circle').attr('cx', x(lastPt[0])).attr('cy', y(lastPt[1])).attr('r', 3.5).attr('fill', s.color);
        svg.append('text').attr('x', x(lastPt[0]) + 8).attr('y', y(lastPt[1])).attr('dy', '0.35em').style('fill', s.color).style('font-weight', 600).text(`${s.label} ${tipFmt(lastPt[1])}`);
      }
    }
    const rule = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', css('--muted')).attr('stroke-dasharray', '3 3').attr('opacity', 0);
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('mousemove', ev => {
        const [mx] = d3.pointer(ev);
        const yr = Math.round(x.invert(mx));
        rule.attr('x1', x(yr)).attr('x2', x(yr)).attr('opacity', 1);
        const lines = [String(yr)];
        for (const s of series.filter(s => s.label)) { const p = s.pts.find(p => p[0] === yr); lines.push(`${s.label}: ${p && p[1] != null ? tipFmt(p[1]) : '–'}`); }
        showTip(ev, lines);
      })
      .on('mouseleave', () => { rule.attr('opacity', 0); hideTip(); });
  }

  function trend() {
    const idx = state.idx, ys = years(idx), k = state.kommun;
    $('#trend-title').textContent = `${name(k)}: plats över tid i ${idx === 'index' ? 'välfärdsindexet' : 'kärnindexet'}`;
    const series = skane.filter(id => id !== k && id !== state.jamfor).map(id => ({pts: ys.map(y => [y, plats(idx, id, y)]), color: css('--grey'), w: 1, op: .7, z: 0}));
    if (state.jamfor) series.push({pts: ys.map(y => [y, plats(idx, state.jamfor, y)]), color: css('--accent2'), w: 2.5, label: name(state.jamfor), z: 1});
    series.push({pts: ys.map(y => [y, plats(idx, k, y)]), color: css('--accent'), w: 3, label: name(k), z: 2});
    lineChart($('#trend'), {xs: ys, series, yDomain: [1, Object.keys(D.kommuner).length], invert: true, yLabel: 'Plats',
      below: idx === 'index' ? y => `${D.matt_per_ar[y].length}` : null, tipFmt: v => 'plats ' + v});
  }

  function heat() {
    const idx = state.idx, ys = years(idx), y1 = ys[ys.length - 1];
    const color = d3.scaleSequential([1, 290], t => d3.interpolateRdYlGn(1 - t));
    let rows = skane.map(id => ({id, n: name(id), v: Object.fromEntries(ys.map(y => [y, plats(idx, id, y)]))}));
    const {col, dir} = state.sort;
    rows.sort((a, b) => col === 'name' ? dir * a.n.localeCompare(b.n, 'sv') : dir * ((a.v[col === 'last' ? y1 : col] ?? 999) - (b.v[col === 'last' ? y1 : col] ?? 999)));
    const t = $('#heat'); t.replaceChildren();
    const hr = t.createTHead().insertRow();
    const th = (txt, key) => { const c = document.createElement('th'); c.textContent = txt; c.onclick = () => { state.sort = {col: key, dir: state.sort.col === key ? -state.sort.dir : 1}; heat(); }; hr.appendChild(c); };
    th('Kommun', 'name'); for (const y of ys) th(String(y), y === y1 ? 'last' : y);
    const tb = t.createTBody();
    for (const r of rows) {
      const tr = tb.insertRow(); if (r.id === state.kommun) tr.className = 'sel';
      tr.onclick = () => { state.kommun = r.id; $('#kommun').value = r.id; sync(); };
      tr.insertCell().textContent = r.n;
      for (const y of ys) { const c = tr.insertCell(); const v = r.v[y]; c.textContent = v ?? '–'; if (v != null) { const bg = color(v); c.className = 'c'; c.style.background = bg; c.style.color = d3.hsl(bg).l < 0.45 ? '#fff' : '#111'; } }
    }
  }

  function profile() {
    const k = state.kommun;
    $('#profile-title').textContent = `Profil: ${name(k)}`;
    const t = $('#profile'); t.replaceChildren();
    const hr = t.createTHead().insertRow();
    for (const h of ['Mått', 'Område', 'År', name(k), 'Riket', 'Plats', 'Första år', 'Värde då', 'Förändring']) { const c = document.createElement('th'); c.textContent = h; hr.appendChild(c); }
    const tb = t.createTBody();
    for (const m of measures) {
      const a = latest(m.key, k); if (!a) continue;
      const r = D.varden[m.key]['0000']?.[a.last];
      const pl = D.placering[m.key === 'arbl_af' ? 'arbl' : m.key]?.[k]?.[a.last];
      const tr = tb.insertRow();
      const cells = [`${m.namn} (${m.enhet})`, m.omrade, a.last, fmt(a.v1, m.enhet), fmt(r, m.enhet), m.key === 'arbl_af' ? '–' : fmt(pl), a.first, fmt(a.v0, m.enhet)];
      cells.forEach((v, i) => { const c = tr.insertCell(); c.textContent = v; if (i === 0) c.className = 'wrap'; if (i === 3 && r != null && a.v1 !== r) c.className = isBetter(m, a.v1, r) ? 'good' : 'bad'; });
      const c = tr.insertCell();
      if (a.v1 === a.v0) { c.textContent = 'Oförändrad'; c.className = 'muted'; }
      else { const up = isBetter(m, a.v1, a.v0); c.textContent = up ? 'Bättre' : 'Sämre'; c.className = up ? 'good' : 'bad'; }
    }
  }

  function measure() {
    const m = measures.find(x => x.key === state.matt), k = state.kommun;
    const s = D.varden[m.key];
    const ys = [...new Set(Object.values(s).flatMap(o => Object.keys(o).map(Number)))].sort((a, b) => a - b);
    $('#matt-note').textContent = `${m.namn}, ${m.enhet}. ${m.battre === 'hog' ? 'Högre' : 'Lägre'} värde är bättre. Källa: Kolada ${m.kolada}.` + (m.reserv_for ? ' Serien används i indexet för åren före 2023.' : '');
    const all = Object.values(s).flatMap(o => Object.values(o));
    const series = skane.filter(id => id !== k && id !== state.jamfor).map(id => ({pts: ys.map(y => [y, s[id]?.[y] ?? null]), color: css('--grey'), w: 1, op: .7, z: 0}));
    series.push({pts: ys.map(y => [y, s['0000']?.[y] ?? null]), color: css('--fg'), w: 2, dash: '5 4', label: 'Riket', z: 1});
    if (state.jamfor) series.push({pts: ys.map(y => [y, s[state.jamfor]?.[y] ?? null]), color: css('--accent2'), w: 2.5, label: name(state.jamfor), z: 2});
    series.push({pts: ys.map(y => [y, s[k]?.[y] ?? null]), color: css('--accent'), w: 3, label: name(k), z: 3});
    lineChart($('#measure'), {xs: ys, series, yDomain: d3.extent(all), invert: false, yLabel: m.enhet, tipFmt: v => fmt(v, m.enhet)});
    const t = $('#measure-table'); t.replaceChildren();
    const cols = [name(k), ...(state.jamfor ? [name(state.jamfor)] : []), 'Riket', `Plats ${name(k)}`];
    const hr = t.createTHead().insertRow();
    for (const h of ['År', ...cols]) { const c = document.createElement('th'); c.textContent = h; hr.appendChild(c); }
    const tb = t.createTBody();
    const rk = D.placering[m.key]?.[k] || {};
    for (const y of ys.slice().reverse()) {
      const tr = tb.insertRow();
      const vals = [y, fmt(s[k]?.[y], m.enhet), ...(state.jamfor ? [fmt(s[state.jamfor]?.[y], m.enhet)] : []), fmt(s['0000']?.[y], m.enhet), m.reserv_for ? '–' : fmt(rk[y])];
      for (const v of vals) tr.insertCell().textContent = v;
    }
  }

  function render() { tiles(); trend(); heat(); profile(); measure(); }
  $('#meta').textContent = `Data hämtad ${D.skapad.slice(0, 10)}. ${D.kalla}.`;
  render();
  let w = innerWidth;
  addEventListener('resize', () => { if (Math.abs(innerWidth - w) > 40) { w = innerWidth; trend(); measure(); } });
})();
