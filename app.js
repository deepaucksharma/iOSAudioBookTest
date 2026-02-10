// === PLATFORM DETECTION ===
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const SAF = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const MAX_U = IOS ? 180 : SAF ? 250 : 800;
const S = window.speechSynthesis;

let V = [], cCh = 0, cP = 0, playing = 0, sQ = [], sI = 0;
const C = [];

// === CHAPTER TEXT FILE PARSER ===
// Text file format:
//   First line: "Chapter N: Title" (ignored, metadata comes from chapters.json)
//   Blank lines separate paragraphs
//   A line containing only "§" is a section break
function parseTxt(text) {
    const lines = text.split('\n');
    const paragraphs = [];
    let buf = '';

    // Skip the first line (chapter title header) and any blank lines after it
    let start = 0;
    if (lines.length > 0 && lines[0].startsWith('Chapter ')) {
        start = 1;
        while (start < lines.length && lines[start].trim() === '') start++;
    }

    for (let i = start; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (trimmed === '§') {
            if (buf.trim()) {
                paragraphs.push(buf.trim());
                buf = '';
            }
            paragraphs.push('§');
        } else if (trimmed === '') {
            if (buf.trim()) {
                paragraphs.push(buf.trim());
                buf = '';
            }
        } else {
            if (buf) buf += ' ';
            buf += trimmed;
        }
    }
    if (buf.trim()) paragraphs.push(buf.trim());

    return paragraphs;
}

// === LOAD CHAPTERS FROM JSON + TEXT FILES ===
async function loadChapters() {
    const res = await fetch('chapters.json');
    const manifest = await res.json();

    for (const ch of manifest) {
        let paragraphs = [];
        try {
            const r = await fetch(ch.file);
            if (r.ok) {
                const txt = await r.text();
                paragraphs = parseTxt(txt);
            }
        } catch (e) {
            // Chapter file not found or empty — that's OK
        }
        C.push({ n: ch.id, t: ch.title, s: ch.subtitle, p: paragraphs });
    }
}

// === SENTENCE SPLITTING (iOS fix) ===
function split(t) {
    if (t.length <= MAX_U) return [t];
    const r = t.match(/[^.!?]+[.!?]+[\s]*/g) || [t], o = [];
    let b = '';
    for (const s of r) {
        if ((b + s).length > MAX_U && b) { o.push(b.trim()); b = s; }
        else b += s;
    }
    if (b.trim()) o.push(b.trim());
    return o;
}

// === VOICE LOADING ===
function lv() {
    V = S.getVoices();
    if (!V.length) return;
    const s = document.getElementById('vc');
    s.innerHTML = '';
    const q = ['Samantha', 'Karen', 'Daniel', 'Moira', 'Google US English', 'Google UK English Female', 'Microsoft Zira', 'Alex'];
    let e = V.filter(v => v.lang.startsWith('en'));
    if (!e.length) e = V;
    e.sort((a, b) => {
        let ai = q.findIndex(x => a.name.includes(x)), bi = q.findIndex(x => b.name.includes(x));
        if (ai < 0) ai = 999; if (bi < 0) bi = 999;
        return ai - bi;
    });
    e.forEach(v => {
        const o = document.createElement('option');
        o.value = v.name;
        o.textContent = v.name.replace(/Google |Microsoft |Apple /g, '').substring(0, 24);
        s.appendChild(o);
    });
}
S.onvoiceschanged = lv; lv();
let vp = 0;
const vpi = setInterval(() => { lv(); if (V.length || ++vp > 20) clearInterval(vpi); }, 250);

// === RENDER ===
function rCh(i) {
    cCh = i; cP = 0; sQ = []; sI = 0;
    const c = C[i];
    document.getElementById('ct').textContent = c.t;
    document.getElementById('cs').textContent = c.s;
    const tx = document.getElementById('tx');
    tx.innerHTML = '';
    c.p.forEach((p, j) => {
        if (p === '§') {
            const d = document.createElement('div');
            d.className = 'sb'; d.textContent = '• • •';
            tx.appendChild(d);
        } else {
            const d = document.createElement('div');
            d.className = 'p'; d.id = 'p' + j; d.textContent = p;
            d.onclick = () => jmp(j);
            tx.appendChild(d);
        }
    });
    document.querySelectorAll('.cb').forEach((b, j) => b.classList.toggle('on', j === i));
    uPr();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function rNav() {
    const n = document.getElementById('nav');
    C.forEach((c, i) => {
        const b = document.createElement('button');
        b.className = 'cb'; b.textContent = c.n; b.title = c.t;
        b.onclick = () => { stp(); rCh(i); };
        n.appendChild(b);
    });
}

function hl(i) {
    document.querySelectorAll('.p').forEach(e => {
        const pi = +e.id.replace('p', '');
        e.classList.remove('sp', 'dn');
        if (pi === i) e.classList.add('sp');
        else if (pi < i) e.classList.add('dn');
    });
    const e = document.getElementById('p' + i);
    if (e) e.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function uPr() {
    const c = C[cCh], sp = c.p.filter(x => x !== '§');
    let si = 0;
    for (let i = 0; i < cP && i < c.p.length; i++) if (c.p[i] !== '§') si++;
    document.getElementById('pf').style.width = (sp.length ? (si / sp.length) * 100 : 0) + '%';
    document.getElementById('cp').textContent = si + ' / ' + sp.length;
    document.getElementById('chp').textContent = 'Ch ' + (cCh + 1) + ' / ' + C.length;
}

// === SPEECH ENGINE ===
function gv() {
    const n = document.getElementById('vc').value;
    return V.find(v => v.name === n) || V[0] || null;
}

function spkS(ss, done) {
    sQ = ss; sI = 0;
    function nx() {
        if (!playing || sI >= sQ.length) { if (done) done(); return; }
        const u = new SpeechSynthesisUtterance(sQ[sI]);
        const v = gv(); if (v) u.voice = v;
        u.rate = +document.getElementById('spd').value;
        u.pitch = 1;
        u.onend = () => { sI++; if (playing) setTimeout(nx, IOS ? 80 : 50); };
        u.onerror = e => { if (e.error === 'canceled') return; sI++; if (playing) setTimeout(nx, 200); };
        S.cancel();
        setTimeout(() => S.speak(u), IOS ? 50 : 10);
    }
    nx();
}

function fns(f) { const p = C[cCh].p; let i = f; while (i < p.length && p[i] === '§') i++; return i; }
function fps(f) { const p = C[cCh].p; let i = f; while (i >= 0 && p[i] === '§') i--; return Math.max(0, i); }

function spkP(i) {
    const c = C[cCh];
    if (i >= c.p.length) {
        if (cCh < C.length - 1) {
            rCh(cCh + 1);
            setTimeout(() => { if (playing) spkP(fns(0)); }, 600);
        } else { stp(); tst('Book complete'); }
        return;
    }
    if (c.p[i] === '§') {
        cP = fns(i + 1);
        setTimeout(() => { if (playing) spkP(cP); }, 700);
        return;
    }
    cP = i; hl(i); uPr();
    spkS(split(c.p[i]), () => {
        if (!playing) return;
        const ni = fns(i + 1);
        cP = ni;
        setTimeout(() => { if (playing) spkP(ni); }, 350);
    });
}

// === CONTROLS ===
function ply() { playing = 1; uBtn(); spkP(fns(cP)); }
function stp() { playing = 0; S.cancel(); uBtn(); }
function tgl() { playing ? stp() : ply(); }
function jmp(i) { stp(); cP = i; hl(i); uPr(); ply(); }

function uBtn() {
    const ic = document.getElementById('pli'), bt = document.getElementById('pl');
    if (playing) {
        ic.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
        bt.classList.add('on');
    } else {
        ic.innerHTML = '<path d="M8 5v14l11-7z"/>';
        bt.classList.remove('on');
    }
}

function tst(m) {
    const t = document.getElementById('toast');
    t.textContent = m; t.classList.add('s');
    setTimeout(() => t.classList.remove('s'), 2500);
}

// === EVENT BINDINGS ===
document.getElementById('pl').onclick = tgl;
document.getElementById('pp').onclick = () => { stp(); cP = fps(cP - 1); hl(cP); uPr(); };
document.getElementById('np').onclick = () => { stp(); cP = fns(cP + 1); hl(cP); uPr(); };
document.getElementById('pch').onclick = () => { stp(); if (cCh > 0) rCh(cCh - 1); };
document.getElementById('nch').onclick = () => { stp(); if (cCh < C.length - 1) rCh(cCh + 1); };
document.getElementById('pc').onclick = e => {
    const r = e.currentTarget.getBoundingClientRect(), pct = (e.clientX - r.left) / r.width;
    const c = C[cCh], sp = c.p.reduce((a, p, i) => { if (p !== '§') a.push(i); return a; }, []);
    const ti = Math.floor(pct * sp.length);
    if (sp[ti] != null) { stp(); cP = sp[ti]; hl(cP); uPr(); }
};
document.getElementById('vc').onchange = () => { if (playing) { S.cancel(); spkP(cP); } };
if (IOS || SAF) setInterval(() => { if (S.speaking && !S.paused) S.resume(); }, 5000);

document.getElementById('ib').onclick = () => {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = .01; u.rate = 2; S.speak(u);
    document.getElementById('vi').classList.add('x');
    tst('Audio ready');
};

// === INIT ===
window.onload = async () => {
    await loadChapters();
    rNav();
    rCh(0);
    setTimeout(() => {
        document.getElementById('ld').classList.add('x');
        setTimeout(() => {
            document.getElementById('ld').style.display = 'none';
            document.getElementById('vi').classList.remove('x');
        }, 800);
    }, 1200);
};
