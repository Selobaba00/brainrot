/* Brainrot Hırsızı — ortak çekirdek.
   Hem Node sunucusunda hem tarayıcıda (çevrimdışı mod) aynı kod çalışır. */
(function (root) {
'use strict';

const WW = 1260, WH = 900, SEATS = 8, MAXSLOTS = 12, START_SLOTS = 6;
const RAR = [
  { n: 'Yaygın', c: '#9aa5b1', w: 55 }, { n: 'Nadir', c: '#4da3ff', w: 25 }, { n: 'Epik', c: '#b45cff', w: 12 },
  { n: 'Efsanevi', c: '#ffa627', w: 6 }, { n: 'Mitik', c: '#ff3b4e', w: 1.8 }, { n: 'Gizli', c: 'rainbow', w: 0.25 }
];
const TYPES = [
  { n: 'Kartopino Sosiso', r: 0, p: 40, i: 2 }, { n: 'Zibidi Zupa', r: 0, p: 80, i: 4 }, { n: 'Patatino Bumbo', r: 0, p: 120, i: 6 }, { n: 'Mortadelo Bimbo', r: 0, p: 160, i: 8 },
  { n: 'Lalabu Fritto', r: 1, p: 400, i: 15 }, { n: 'Capuchino Rockolo', r: 1, p: 650, i: 24 }, { n: 'Gelatto Kaboom', r: 1, p: 900, i: 34 },
  { n: 'Drakolino Pastino', r: 2, p: 2800, i: 90 }, { n: 'Tortellino Titano', r: 2, p: 4500, i: 150 },
  { n: 'Cosmo Ravioli', r: 3, p: 16000, i: 450 }, { n: 'Nonno Spaghettazo', r: 3, p: 28000, i: 780 },
  { n: 'Imperatore Zuppazuppa', r: 4, p: 130000, i: 3000 },
  { n: 'La Gran Pizzaluna', r: 5, p: 1000000, i: 24000 }
];
const BYR = RAR.map((_, r) => TYPES.map((t, i) => (t.r === r ? i : -1)).filter(i => i >= 0));
const SLOT_COSTS = [1000, 10000, 30000, 50000, 75000, 80000];
const LUCK_COST = 1000000, LUCK_DUR = 600, MAX_SPEED = 8;
const ADMIN_NAME = 'XXBrainrotXX', ADMIN_KEY = 'xxbrainrotxx';
const BOT_NAMES = ['Zibo', 'Mafya Kemal', 'Hırsız Hüso', 'Kara Murat', 'Tombik', 'Çakal Cemo', 'Sinsi Selim', 'Gölge Gökhan', 'Bıçkın Barış', 'Cimri Cafer', 'Deli Dursun', 'Pusu Polat'];

const speedCost = lv => Math.round(200 * Math.pow(1.9, lv));
const sellPrice = t => TYPES[t].p * 0.5;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const income = d => { let s = 0; for (let i = 0; i < d.slotCount; i++) if (d.slots[i] !== null && d.slots[i] !== undefined) s += TYPES[d.slots[i]].i; return s; };
const freeIdx = d => { for (let i = 0; i < d.slotCount; i++) if (d.slots[i] === null || d.slots[i] === undefined) return i; return -1; };
const nextSlotCost = d => (d.slotCount >= MAXSLOTS ? -1 : SLOT_COSTS[Math.min(d.slotCount - START_SLOTS, SLOT_COSTS.length - 1)]);
const fmt = n => { n = Math.floor(n); if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.0', '') + 'M'; if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace('.0', '') + 'K'; return String(n); };

function randType(maxR, luck) {
  let tot = 0;
  const ws = RAR.map((r, i) => { const w = i <= maxR ? r.w * (i >= 1 && luck > 1 ? luck : 1) : 0; tot += w; return w; });
  let x = Math.random() * tot, r = 0;
  for (; r < ws.length; r++) { x -= ws[r]; if (x <= 0) break; }
  r = Math.min(r, maxR);
  const arr = BYR[r];
  return arr[Math.floor(Math.random() * arr.length)];
}

function layout(i) {
  const col = i % 4, top = i < 4, x0 = 40 + col * 300, y0 = top ? 30 : 540, slots = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) slots.push({ x: x0 + 47 + c * 62, y: y0 + 75 + r * 85 });
  return { x0, y0, w: 280, h: 330, top, home: { x: x0 + 140, y: top ? y0 + 305 : y0 + 25 }, slots };
}
const LAY = []; for (let i = 0; i < SEATS; i++) LAY.push(layout(i));
const inBase = (e, L) => e.x > L.x0 && e.x < L.x0 + L.w && e.y > L.y0 && e.y < L.y0 + L.h;

let UID = 0;
function newEnt(i) {
  const h = LAY[i].home;
  return {
    x: h.x, y: h.y, face: 1, stun: 0, immune: 0, hitT: 0, hitCool: 0, carry: null, stealP: 0, stealKey: '', alerted: false, warnT: 0, moving: false,
    in: { mx: 0, my: 0, hold: false, press: 0, hit: 0 }, pressSeen: 0, hitSeen: 0,
    state: 'idle', wx: h.x, wy: h.y, wT: 0, tSeat: -1, tUid: 0, tSlot: -1, stealBP: 0, chaseSeat: -1, chaseDelay: 0, hitCD: 0, buyT: 8 + Math.random() * 14
  };
}

/* ------------------------------------------------------------------ Oda */
class Room {
  constructor(id, hub) {
    this.id = id; this.hub = hub; this.t = 0; this.belt = []; this.nid = 1; this.spawnT = 1; this.luckUntil = 0;
    this.raidT = 30 + Math.random() * 20; this.ev = []; this.seats = [];
    for (let i = 0; i < SEATS; i++) this.seats.push(this.makeBot(i));
  }
  humans() { return this.seats.filter(s => s.kind === 'human'); }
  luck() { return this.t < this.luckUntil ? 2 : 1; }
  emit(to, text, color, sfx) { this.ev.push({ to, text, color, sfx }); }

  makeBot(i) {
    const used = new Set(this.seats.filter(Boolean).map(s => s.name));
    const pool = BOT_NAMES.filter(n => !used.has(n));
    const name = pool.length ? pool[Math.floor(Math.random() * pool.length)] : 'Bot' + (i + 1);
    const slotCount = 4 + Math.floor(Math.random() * 3);
    const data = { coins: 0, slots: Array(MAXSLOTS).fill(null), slotCount, speedLv: 0 };
    const n = 1 + Math.floor(Math.random() * 2);
    for (let k = 0; k < n; k++) data.slots[k] = randType(this.t > 150 ? 3 : 1, 1);
    return { i, uid: ++UID, kind: 'bot', name, disp: name, avatar: null, data, ent: newEnt(i) };
  }
  addHuman(client, user) {
    let i = this.seats.findIndex(s => s.kind === 'bot');
    if (i < 0) return null;
    const seat = { i, uid: ++UID, kind: 'human', name: user.name, disp: user.disp || user.name, avatar: user.avatar === undefined ? null : user.avatar, data: user, ent: newEnt(i), client };
    const L = LAY[i];
    seat.ent.y = L.top ? L.y0 + L.h - 50 : L.y0 + 50;
    this.seats[i] = seat;
    return seat;
  }
  removeHuman(seat) {
    if (seat.ent.carry) this.returnCarry(seat);
    this.seats[seat.i] = this.makeBot(seat.i);
  }

  findInteract(s) {
    const e = s.ent, d = s.data;
    let best = null, bd = 1e9;
    for (const b of this.belt) { const dd = Math.hypot(e.x - b.x, e.y - b.y); if (dd < 62 && dd < bd) { bd = dd; best = { k: 'buy', id: b.id }; } }
    const L = LAY[s.i];
    for (let si = 0; si < d.slotCount; si++) { if (d.slots[si] === null || d.slots[si] === undefined) continue; const p = L.slots[si]; const dd = Math.hypot(e.x - p.x, e.y - p.y); if (dd < 46 && dd < bd) { bd = dd; best = { k: 'sell', slot: si }; } }
    if (!e.carry) {
      for (const o of this.seats) {
        if (o === s) continue;
        const OL = LAY[o.i];
        for (let si = 0; si < o.data.slotCount; si++) {
          if (o.data.slots[si] === null || o.data.slots[si] === undefined) continue;
          const p = OL.slots[si]; const dd = Math.hypot(e.x - p.x, e.y - p.y);
          if (dd < 54 && dd < bd) { bd = dd; best = { k: 'steal', seat: o.i, slot: si }; }
        }
      }
    }
    return best;
  }
  promptOf(s, it) {
    if (!it) return '';
    if (it.k === 'buy') { const b = this.belt.find(x => x.id === it.id); if (!b) return ''; const t = TYPES[b.t]; return 'Satın al: ' + t.n + ' — $' + fmt(t.p); }
    if (it.k === 'sell') return 'Sat (basılı tut): ' + TYPES[s.data.slots[it.slot]].n + ' — $' + fmt(sellPrice(s.data.slots[it.slot]));
    const o = this.seats[it.seat]; return 'ÇAL (basılı tut): ' + TYPES[o.data.slots[it.slot]].n + ' (' + o.disp + ')';
  }

  buy(s, it) {
    const bi = this.belt.findIndex(x => x.id === it.id); if (bi < 0) return;
    const b = this.belt[bi], t = TYPES[b.t], d = s.data, fi = freeIdx(d);
    if (fi < 0) { this.emit(s.i, 'Üssünde boş yer yok! Birini sat ya da yer satın al.', '#ff5a64', 'err'); return; }
    if (d.coins < t.p) { this.emit(s.i, 'Yetersiz para', '#ff5a64', 'err'); return; }
    d.coins -= t.p; d.slots[fi] = b.t; this.belt.splice(bi, 1);
    this.emit(s.i, '', '', 'buy'); this.hub && (this.hub.dirty = true);
  }
  completeSteal(s, it) {
    const e = s.ent, victim = this.seats[it.seat]; if (!victim) return;
    const item = victim.data.slots[it.slot];
    e.stealP = 0; e.stealKey = ''; e.alerted = false;
    if (item === null || item === undefined || e.carry) return;
    victim.data.slots[it.slot] = null;
    e.carry = { t: item, fromSeat: victim.i, fromUid: victim.uid, fromSlot: it.slot };
    if (victim.kind === 'bot') { victim.ent.state = 'chase'; victim.ent.chaseSeat = s.i; victim.ent.chaseDelay = 0.7; victim.ent.hitCD = 0; this.emit(s.i, victim.disp + ' peşinde! Üssüne koş!', '#ffa627', 'steal'); }
    else { this.emit(s.i, 'Çaldın! Üssüne koş, ' + victim.disp + ' peşinde olabilir.', '#ffa627', 'steal'); this.emit(victim.i, '🚨 ' + s.disp + ' ' + TYPES[item].n + ' çaldı! VUR ona!', '#ff5a64', 'alarm'); }
    this.hub && (this.hub.dirty = true);
  }
  returnCarry(s) {
    const e = s.ent, c = e.carry; if (!c) return; e.carry = null;
    const owner = this.seats[c.fromSeat];
    if (owner && owner.uid === c.fromUid) {
      const fi = freeIdx(owner.data);
      if (fi >= 0) owner.data.slots[fi] = c.t; else owner.data.coins += sellPrice(c.t);
      if (owner.kind === 'human') this.emit(owner.i, TYPES[c.t].n + ' geri geldi!', '#3ddc84', 'buy');
    }
  }
  hitFrom(a) {
    const e = a.ent;
    if (e.hitCool > 0 || e.stun > 0) return;
    e.hitT = 0.25; e.hitCool = 0.5; this.emit(a.i, '', '', 'hit');
    for (const o of this.seats) {
      if (o === a) continue;
      const oe = o.ent;
      if (Math.hypot(oe.x - e.x, oe.y - e.y) > 78) continue;
      if (o.kind === 'human' && (oe.immune > 0 || oe.stun > 0)) continue;
      oe.stun = o.kind === 'bot' ? 2.2 : 1.5;
      const ang = Math.atan2(oe.y - e.y, oe.x - e.x);
      oe.x = clamp(oe.x + Math.cos(ang) * 45, 18, WW - 18); oe.y = clamp(oe.y + Math.sin(ang) * 45, 18, WH - 18);
      if (oe.carry) {
        const t = oe.carry.t; this.returnCarry(o);
        this.emit(a.i, o.disp + ' yakalandı, yaratık sahibine döndü!', '#3ddc84', 'hit');
        if (o.kind === 'human') this.emit(o.i, a.disp + ' seni vurdu, çaldığın ' + TYPES[t].n + ' gitti!', '#ff5a64', 'hit');
        if (o.kind === 'bot') oe.state = 'flee';
      } else if (o.kind === 'bot' && (oe.state === 'stealing' || oe.state === 'raid')) { oe.state = 'flee'; this.emit(a.i, o.disp + ' kaçtı!', '#3ddc84', 'hit'); }
      else if (o.kind === 'human') this.emit(o.i, a.disp + ' seni vurdu!', '#ff5a64', 'hit');
    }
  }

  stepHuman(s, dt) {
    const e = s.ent, d = s.data, inp = e.in;
    e.hitT = Math.max(0, e.hitT - dt); e.hitCool = Math.max(0, e.hitCool - dt);
    if (e.immune > 0) e.immune -= dt;
    d.coins += income(d) * dt;
    let mx = +inp.mx || 0, my = +inp.my || 0; const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    if (e.stun > 0) { e.stun -= dt; if (e.stun <= 0) e.immune = 1; mx = my = 0; }
    e.moving = Math.hypot(mx, my) > 0.1;
    const sp = 170 + d.speedLv * 14;
    e.x = clamp(e.x + mx * sp * dt, 18, WW - 18); e.y = clamp(e.y + my * sp * dt, 18, WH - 18);
    if (mx > 0.1) e.face = 1; else if (mx < -0.1) e.face = -1;
    const pressEdge = inp.press > e.pressSeen; e.pressSeen = inp.press;
    const hitEdge = inp.hit > e.hitSeen; e.hitSeen = inp.hit;
    const it = this.findInteract(s); s.it = it;
    if (pressEdge && it && it.k === 'buy' && e.stun <= 0) this.buy(s, it);
    if (it && (it.k === 'steal' || it.k === 'sell') && inp.hold && e.stun <= 0) {
      const key = it.k + ':' + (it.seat === undefined ? '' : it.seat) + ':' + it.slot;
      if (e.stealKey !== key) { e.stealKey = key; e.stealP = 0; e.alerted = false; }
      if (it.k === 'steal') {
        if (freeIdx(d) < 0) { e.stealP = 0; if (this.t > e.warnT) { e.warnT = this.t + 2.5; this.emit(s.i, 'Üssünde boş yer yok! Önce birini sat ya da yer satın al.', '#ff5a64', 'err'); } }
        else {
          const victim = this.seats[it.seat];
          if (!e.alerted && victim && victim.kind === 'human') { e.alerted = true; this.emit(victim.i, '⚠ ' + s.disp + ' ' + TYPES[victim.data.slots[it.slot]].n + ' çalıyor!', '#ff5a64', 'alarm'); }
          e.stealP += dt / 1.5;
          if (e.stealP >= 1) this.completeSteal(s, it);
        }
      } else {
        e.stealP += dt / 0.8;
        if (e.stealP >= 1) { const t = d.slots[it.slot]; if (t !== null && t !== undefined) { d.coins += sellPrice(t); d.slots[it.slot] = null; this.emit(s.i, '', '', 'sell'); this.hub && (this.hub.dirty = true); } e.stealP = 0; e.stealKey = ''; }
      }
    } else { e.stealP = 0; e.stealKey = ''; e.alerted = false; }
    if (e.carry && inBase(e, LAY[s.i])) {
      const fi = freeIdx(d);
      if (fi >= 0) {
        d.slots[fi] = e.carry.t; this.emit(s.i, 'Çaldın: ' + TYPES[e.carry.t].n + '!', '#3ddc84', 'buy');
        const v = this.seats[e.carry.fromSeat]; if (v && v.uid === e.carry.fromUid && v.kind === 'bot' && v.ent.state === 'chase') v.ent.state = 'flee';
        e.carry = null; this.hub && (this.hub.dirty = true);
      }
    }
    if (hitEdge) this.hitFrom(s);
  }

  moveToward(e, tx, ty, sp, dt) { const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy); if (d < 1) return 0; const st = Math.min(d, sp * dt); e.x += dx / d * st; e.y += dy / d * st; return d - st; }

  startRaid(b) {
    const cands = this.seats.filter(s => s.kind === 'human' && income(s.data) > 0);
    if (!cands.length) return false;
    const t = cands[Math.floor(Math.random() * cands.length)];
    const filled = []; for (let i = 0; i < t.data.slotCount; i++) if (t.data.slots[i] !== null && t.data.slots[i] !== undefined) filled.push(i);
    let pick = filled[Math.floor(Math.random() * filled.length)];
    if (Math.random() < 0.5) pick = filled.reduce((a, c) => TYPES[t.data.slots[c]].i > TYPES[t.data.slots[a]].i ? c : a);
    const e = b.ent; e.tSeat = t.i; e.tUid = t.uid; e.tSlot = pick; e.state = 'raid';
    this.emit(t.i, '⚠ ' + b.disp + ' üssüne saldırıyor!', '#ff5a64', 'alarm');
    return true;
  }
  stepBot(s, dt) {
    const e = s.ent, d = s.data, L = LAY[s.i], home = L.home;
    e.hitCD = Math.max(0, e.hitCD - dt);
    e.buyT -= dt;
    if (e.buyT <= 0) { e.buyT = 14 + Math.random() * 16; const fi = freeIdx(d); if (fi >= 0) d.slots[fi] = randType(this.t > 300 ? 5 : this.t > 150 ? 3 : 2, 1); }
    if (e.stun > 0) { e.stun -= dt; return; }
    switch (e.state) {
      case 'idle': {
        e.wT -= dt; if (e.wT <= 0) { e.wT = 1 + Math.random() * 2.5; e.wx = L.x0 + 25 + Math.random() * 230; e.wy = L.top ? L.y0 + L.h - 90 + Math.random() * 70 : L.y0 + 20 + Math.random() * 70; }
        this.moveToward(e, e.wx, e.wy, 55, dt); break;
      }
      case 'raid': {
        const t = this.seats[e.tSeat];
        if (!t || t.uid !== e.tUid) { e.state = 'flee'; break; }
        if (t.data.slots[e.tSlot] === null || t.data.slots[e.tSlot] === undefined) {
          const f = []; for (let i = 0; i < t.data.slotCount; i++) if (t.data.slots[i] !== null && t.data.slots[i] !== undefined) f.push(i);
          if (f.length) e.tSlot = f[Math.floor(Math.random() * f.length)]; else { e.state = 'flee'; break; }
        }
        const sp2 = LAY[t.i].slots[e.tSlot];
        const rem = this.moveToward(e, sp2.x, sp2.y + (LAY[t.i].top ? 34 : -34), 125, dt);
        if (rem < 4) { e.state = 'stealing'; e.stealBP = 0; }
        break;
      }
      case 'stealing': {
        const t = this.seats[e.tSeat];
        if (!t || t.uid !== e.tUid || t.data.slots[e.tSlot] === null || t.data.slots[e.tSlot] === undefined) { e.state = 'flee'; break; }
        e.stealBP += dt / 2.4; e.stealP = e.stealBP;
        if (e.stealBP >= 1) {
          const item = t.data.slots[e.tSlot]; t.data.slots[e.tSlot] = null;
          e.carry = { t: item, fromSeat: t.i, fromUid: t.uid, fromSlot: e.tSlot }; e.state = 'run'; e.stealP = 0;
          this.emit(t.i, '🚨 ' + s.disp + ' ' + TYPES[item].n + ' çaldı! VUR ona!', '#ff5a64', 'alarm'); this.hub && (this.hub.dirty = true);
        }
        break;
      }
      case 'run': {
        const rem = this.moveToward(e, home.x, home.y, 150, dt);
        if (rem < 8) {
          const c = e.carry; e.carry = null;
          if (c) {
            let fi = freeIdx(d);
            if (fi < 0) { let mi = 0; for (let i = 1; i < d.slotCount; i++) if (TYPES[d.slots[i]].p < TYPES[d.slots[mi]].p) mi = i; if (TYPES[c.t].p > TYPES[d.slots[mi]].p) fi = mi; }
            if (fi >= 0) d.slots[fi] = c.t;
            const v = this.seats[c.fromSeat]; if (v && v.kind === 'human' && v.uid === c.fromUid) this.emit(v.i, s.disp + ' kaçmayı başardı...', '#ffa627', 'err');
          }
          e.state = 'idle';
        }
        break;
      }
      case 'flee': {
        const rem = this.moveToward(e, home.x, home.y, 150, dt);
        if (rem < 8) { e.state = 'idle'; e.stealP = 0; }
        break;
      }
      case 'chase': {
        const th = this.seats[e.chaseSeat];
        if (!th || th.kind !== 'human' || !th.ent.carry || th.ent.carry.fromUid !== s.uid) { e.state = 'flee'; break; }
        if (e.chaseDelay > 0) { e.chaseDelay -= dt; break; }
        this.moveToward(e, th.ent.x, th.ent.y, 138, dt);
        if (Math.hypot(e.x - th.ent.x, e.y - th.ent.y) < 30 && e.hitCD <= 0) {
          e.hitCD = 1;
          this.returnCarry(th);
          th.ent.stun = 0.9; const a = Math.atan2(th.ent.y - e.y, th.ent.x - e.x);
          th.ent.x = clamp(th.ent.x + Math.cos(a) * 60, 18, WW - 18); th.ent.y = clamp(th.ent.y + Math.sin(a) * 60, 18, WH - 18);
          this.emit(th.i, s.disp + ' seni yakaladı, yaratık geri gitti!', '#ff5a64', 'hit');
          e.state = 'flee';
        }
        break;
      }
    }
  }

  step(dt) {
    this.t += dt;
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 2.2; const maxR = this.t > 300 ? 5 : this.t > 150 ? 4 : 3; this.belt.push({ id: this.nid++, t: randType(maxR, this.luck()), x: -30, y: 450 }); }
    for (const b of this.belt) b.x += 70 * dt;
    this.belt = this.belt.filter(b => b.x < WW + 40);
    for (const s of this.seats) { if (s.kind === 'human') this.stepHuman(s, dt); else this.stepBot(s, dt); }
    this.raidT -= dt;
    if (this.raidT <= 0) {
      this.raidT = 28 + Math.random() * 30;
      const idle = this.seats.filter(s => s.kind === 'bot' && s.ent.state === 'idle' && s.ent.stun <= 0);
      if (idle.length) this.startRaid(idle[Math.floor(Math.random() * idle.length)]);
    }
  }

  snapCommon() {
    const r1 = v => Math.round(v * 10) / 10;
    return {
      seats: this.seats.map(s => {
        const e = s.ent, d = s.data;
        return { i: s.i, k: s.kind === 'human' ? 1 : 0, n: s.disp, x: r1(e.x), y: r1(e.y), f: e.face, st: e.stun > 0 ? 1 : 0, h: e.hitT > 0 ? 1 : 0, c: e.carry ? e.carry.t : -1,
          sp: Math.round(e.stealP * 100) / 100, b: s.kind === 'bot' ? e.state : '', a: s.avatar === null || s.avatar === undefined ? -1 : s.avatar,
          sl: d.slots.slice(0, d.slotCount), sc: d.slotCount, inc: income(d), mv: e.moving ? 1 : 0 };
      }),
      belt: this.belt.map(b => [b.id, b.t, Math.round(b.x)]),
      lk: Math.max(0, Math.round(this.luckUntil - this.t)),
      hn: this.humans().map(s => s.name), rid: this.id, rt: Math.round(this.t * 10) / 10
    };
  }
  snapYou(s, adm) {
    const d = s.data, it = s.it || null, e = s.ent;
    return { i: s.i, co: Math.floor(d.coins), sp: d.speedLv, spc: d.speedLv >= MAX_SPEED ? -1 : speedCost(d.speedLv), sc: d.slotCount, slc: nextSlotCost(d), lkc: LUCK_COST,
      pr: it ? this.promptOf(s, it) : '', hl: it ? it : null, adm: adm ? 1 : 0, stun: e.stun > 0 ? 1 : 0, sk: it && (it.k === 'steal' || it.k === 'sell') ? it.k : '' };
  }
}

/* ------------------------------------------------------------------ Hub */
class Hub {
  constructor(o) {
    this.o = o; this.users = o.users || {}; this.clients = new Set(); this.byUser = new Map(); this.rooms = []; this.rid = 0; this.cid = 0;
    this.snapEvery = o.snapEvery || 1 / 15; this.snapAcc = 0; this.saveAcc = 0; this.dirty = false;
    this.ensureAdmin(o.adminPass || 'XXşifreXX');
  }
  mkUser(name, pass) {
    const salt = this.o.salt();
    return { name, key: name.toLowerCase(), salt, hash: this.o.hash(pass, salt), coins: 100, speedLv: 0, slotCount: START_SLOTS, slots: Array(MAXSLOTS).fill(null), friends: [], inc: [], out: [], avatar: null, disp: null, created: Date.now() };
  }
  ensureAdmin(pass) { if (!this.users[ADMIN_KEY]) { this.users[ADMIN_KEY] = this.mkUser(ADMIN_NAME, pass); this.dirty = true; } }
  isAdmin(u) { return !!u && u.key === ADMIN_KEY; }

  connect(send, close) {
    const c = { id: ++this.cid, send: m => { try { send(m); } catch (e) {} }, close: close || (() => {}), user: null, room: null, seat: null };
    this.clients.add(c); return c;
  }
  disconnect(c) {
    if (!this.clients.has(c)) return;
    this.leaveRoom(c);
    this.clients.delete(c);
    if (c.user && this.byUser.get(c.user.key) === c) { this.byUser.delete(c.user.key); this.presence(c.user); }
    this.dirty = true;
  }
  err(c, msg) { c.send({ t: 'err', msg }); }

  message(c, m) {
    if (!m || typeof m !== 'object' || !this.clients.has(c)) return;
    if (m.t === 'ping') return c.send({ t: 'pong' });
    if (!c.user) {
      if (m.t === 'register') return this.register(c, m);
      if (m.t === 'login') return this.login(c, m);
      return;
    }
    switch (m.t) {
      case 'in': { if (c.seat) { const i = c.seat.ent.in; i.mx = clamp(+m.mx || 0, -1, 1); i.my = clamp(+m.my || 0, -1, 1); i.hold = !!m.hold; i.press = Math.max(i.press, m.press | 0); i.hit = Math.max(i.hit, m.hit | 0); } break; }
      case 'upg': return this.upgrade(c, m.what);
      case 'fr': return this.friendOp(c, m);
      case 'admin': return this.admin(c, m);
      case 'out': this.disconnect(c); break;
    }
  }
  cleanName(n) { return String(n || '').normalize('NFC').trim(); }
  register(c, m) {
    const name = this.cleanName(m.name), pass = String(m.pass || '').normalize('NFC');
    if (!/^[\p{L}\p{N}_.\- ]{3,16}$/u.test(name)) return this.err(c, 'Kullanıcı adı 3-16 karakter olmalı (harf, rakam, _ . -)');
    if (pass.length < 4 || pass.length > 32) return this.err(c, 'Şifre 4-32 karakter olmalı');
    if (this.users[name.toLowerCase()]) return this.err(c, 'Bu kullanıcı adı alınmış');
    const u = this.mkUser(name, pass); this.users[u.key] = u; this.dirty = true;
    this.enter(c, u);
  }
  login(c, m) {
    const name = this.cleanName(m.name), pass = String(m.pass || '').normalize('NFC');
    const u = this.users[name.toLowerCase()];
    if (!u || this.o.hash(pass, u.salt) !== u.hash) return this.err(c, 'Kullanıcı adı veya şifre yanlış');
    this.enter(c, u);
  }
  enter(c, u) {
    const old = this.byUser.get(u.key);
    if (old && old !== c) { old.send({ t: 'kick', msg: 'Hesabına başka yerden girildi' }); this.disconnect(old); old.close(); }
    c.user = u; this.byUser.set(u.key, c);
    c.send({ t: 'authok', name: u.name, adm: this.isAdmin(u) ? 1 : 0 });
    this.joinRoom(c, null);
    c.send(this.friendsPayload(u));
    this.presence(u);
  }

  /* odalar */
  findRoom() {
    let best = null;
    for (const r of this.rooms) { const n = r.humans().length; if (n < SEATS && (!best || n > best.humans().length)) best = r; }
    if (!best) { best = new Room(++this.rid, this); this.rooms.push(best); }
    return best;
  }
  joinRoom(c, room) {
    this.leaveRoom(c);
    const r = room || this.findRoom();
    const seat = r.addHuman(c, c.user); if (!seat) return this.err(c, 'Oda dolu');
    c.room = r; c.seat = seat;
    this.presence(c.user);
  }
  leaveRoom(c) {
    if (!c.room) return;
    const r = c.room; r.removeHuman(c.seat); c.room = null; c.seat = null;
    if (!r.humans().length) this.rooms = this.rooms.filter(x => x !== r);
    this.dirty = true;
  }

  upgrade(c, what) {
    const d = c.user, r = c.room, s = c.seat; if (!r || !s) return;
    if (what === 'speed') {
      if (d.speedLv >= MAX_SPEED) return; const cost = speedCost(d.speedLv);
      if (d.coins < cost) return r.emit(s.i, 'Yetersiz para', '#ff5a64', 'err');
      d.coins -= cost; d.speedLv++; r.emit(s.i, 'Hız arttı! Lv ' + d.speedLv, '#5ad1ff', 'buy');
    } else if (what === 'slot') {
      const cost = nextSlotCost(d); if (cost < 0) return r.emit(s.i, 'Tüm yerler açık', '#ffd84d', 'err');
      if (d.coins < cost) return r.emit(s.i, 'Yetersiz para ($' + fmt(cost) + ' lazım)', '#ff5a64', 'err');
      d.coins -= cost; d.slotCount++; r.emit(s.i, 'Yeni brainrot yeri açıldı! (' + d.slotCount + '/' + MAXSLOTS + ')', '#3ddc84', 'buy');
    } else if (what === 'luck') {
      if (d.coins < LUCK_COST) return r.emit(s.i, 'Yetersiz para ($' + fmt(LUCK_COST) + ' lazım)', '#ff5a64', 'err');
      d.coins -= LUCK_COST; r.luckUntil = Math.max(r.luckUntil, r.t) + LUCK_DUR;
      r.emit(-1, '🍀 ' + s.disp + ' sunucuya 2x şans aldı! (10 dk)', '#ffd84d', 'buy');
    } else return;
    this.dirty = true;
  }

  /* arkadaşlar */
  friendsPayload(u) {
    const nm = k => (this.users[k] ? this.users[k].name : k);
    return { t: 'friends', f: u.friends.map(k => { const fc = this.byUser.get(k); return { n: nm(k), on: fc ? 1 : 0, r: fc && fc.room ? fc.room.id : 0 }; }), i: u.inc.map(nm), o: u.out.map(nm) };
  }
  pushFriends(u) { const c = this.byUser.get(u.key); if (c) c.send(this.friendsPayload(u)); }
  presence(u) { for (const k of u.friends) { const f = this.users[k]; if (f) this.pushFriends(f); } this.pushFriends(u); }
  friendOp(c, m) {
    const me = c.user, key = this.cleanName(m.name).toLowerCase(), other = this.users[key], op = m.op;
    const rm = (arr, k) => { const i = arr.indexOf(k); if (i >= 0) arr.splice(i, 1); };
    if (op === 'join') {
      const fc = this.byUser.get(key);
      if (!other || !me.friends.includes(key)) return this.err(c, 'Bu kişi arkadaşın değil');
      if (!fc || !fc.room) return this.err(c, 'Arkadaşın çevrimdışı');
      if (fc.room === c.room) return this.err(c, 'Zaten aynı sunucudasınız');
      if (fc.room.humans().length >= SEATS) return this.err(c, 'Sunucu dolu');
      this.joinRoom(c, fc.room); return;
    }
    if (!other) return this.err(c, 'Böyle bir kullanıcı yok');
    if (other === me) return this.err(c, 'Kendini ekleyemezsin');
    if (op === 'add') {
      if (me.friends.includes(key)) return this.err(c, 'Zaten arkadaşsınız');
      if (me.out.includes(key)) return this.err(c, 'İstek zaten gönderilmiş');
      if (me.inc.includes(key)) return this.friendOp(c, { op: 'accept', name: m.name });
      me.out.push(key); other.inc.push(me.key);
      const oc = this.byUser.get(key); if (oc) oc.send({ t: 'ev', text: '👥 ' + me.name + ' sana arkadaşlık isteği gönderdi!', color: '#5ad1ff', sfx: 'alarm' });
      c.send({ t: 'ev', text: 'İstek gönderildi: ' + other.name, color: '#3ddc84', sfx: 'buy' });
    } else if (op === 'accept') {
      if (!me.inc.includes(key)) return this.err(c, 'Bu kişiden istek yok');
      rm(me.inc, key); rm(other.out, me.key); me.friends.push(key); other.friends.push(me.key);
      const oc = this.byUser.get(key); if (oc) oc.send({ t: 'ev', text: '🤝 ' + me.name + ' isteğini kabul etti!', color: '#3ddc84', sfx: 'buy' });
    } else if (op === 'decline') { rm(me.inc, key); rm(other.out, me.key); }
    else if (op === 'remove') { rm(me.friends, key); rm(other.friends, me.key); }
    else if (op === 'cancel') { rm(me.out, key); rm(other.inc, me.key); }
    this.dirty = true; this.pushFriends(me); this.pushFriends(other);
  }

  /* admin */
  admin(c, m) {
    if (!this.isAdmin(c.user) || !c.room || !c.seat) return this.err(c, 'Yetkin yok');
    const r = c.room, s = c.seat, tn = String(m.target || 'self').toLowerCase();
    const targetSeat = () => (tn === 'self' ? s : r.humans().find(x => x.name.toLowerCase() === tn));
    const ty = Number.isInteger(m.type) && TYPES[m.type] ? m.type : null;
    const ev = (t, col) => c.send({ t: 'ev', text: t, color: col || '#c77dff', sfx: 'buy' });
    switch (m.op) {
      case 'spawnPet': {
        const ts = targetSeat(); if (!ts) return this.err(c, 'Oyuncu bulunamadı'); if (ty === null) return;
        const fi = freeIdx(ts.data); if (fi < 0) return this.err(c, 'Hedefte boş yer yok');
        ts.data.slots[fi] = ty; ev(TYPES[ty].n + ' → ' + ts.name); if (ts !== s) r.emit(ts.i, '🎁 Admin sana ' + TYPES[ty].n + ' verdi!', '#c77dff', 'buy'); break;
      }
      case 'giveMoney': {
        const ts = targetSeat(); if (!ts) return this.err(c, 'Oyuncu bulunamadı');
        const a = Number(m.amount); if (!isFinite(a) || Math.abs(a) > 1e15) return this.err(c, 'Geçersiz miktar');
        ts.data.coins = Math.max(0, ts.data.coins + a); ev((a >= 0 ? '+' : '') + fmt(a) + ' → ' + ts.name); if (ts !== s) r.emit(ts.i, '🎁 Admin sana $' + fmt(a) + ' verdi!', '#c77dff', 'buy'); break;
      }
      case 'setMoney': {
        const a = Number(m.amount); if (!isFinite(a) || a < 0 || a > 1e15) return this.err(c, 'Geçersiz miktar');
        s.data.coins = a; ev('Paran: $' + fmt(a)); break;
      }
      case 'spawnBelt': {
        if (ty === null) return; const n = clamp(m.count | 0 || 1, 1, 10);
        for (let k = 0; k < n; k++) r.belt.push({ id: r.nid++, t: ty, x: -30 - k * 50, y: 450 });
        ev(n + 'x ' + TYPES[ty].n + ' banta'); break;
      }
      case 'morph': {
        const av = m.type === -1 || m.type === null ? null : ty;
        const nm = this.cleanName(m.name).slice(0, 20);
        s.avatar = av; s.disp = nm || s.name; c.user.avatar = av; c.user.disp = nm || null;
        ev(av === null ? 'Avatar normale döndü' : 'Artık bir ' + TYPES[av].n + ' oldun!'); break;
      }
      case 'fillSlots': { for (let i = 0; i < s.data.slotCount; i++) if (s.data.slots[i] === null) s.data.slots[i] = ty === null ? randType(5, 1) : ty; ev('Üssün dolduruldu'); break; }
    }
    this.dirty = true;
  }

  /* döngü */
  tick(dt) {
    for (const r of this.rooms) {
      r.step(dt);
      if (r.ev.length) {
        for (const e of r.ev) {
          const msg = { t: 'ev', text: e.text, color: e.color, sfx: e.sfx };
          if (e.to === -1) { for (const s of r.seats) if (s.kind === 'human') s.client.send(msg); }
          else { const s = r.seats[e.to]; if (s && s.kind === 'human') s.client.send(msg); }
        }
        r.ev.length = 0;
      }
    }
    this.snapAcc += dt;
    if (this.snapAcc >= this.snapEvery) {
      this.snapAcc = 0;
      for (const r of this.rooms) {
        const common = JSON.stringify(r.snapCommon());
        for (const s of r.seats) if (s.kind === 'human') s.client.send('{"t":"snap","c":' + common + ',"y":' + JSON.stringify(r.snapYou(s, this.isAdmin(s.client.user))) + '}');
      }
    }
    this.saveAcc += dt;
    if (this.saveAcc >= 6) { this.saveAcc = 0; if (this.dirty || this.rooms.length) this.save(); }
  }
  save() { this.dirty = false; if (this.o.save) this.o.save(this.users); }
}

const API = { WW, WH, SEATS, MAXSLOTS, START_SLOTS, RAR, TYPES, BYR, SLOT_COSTS, LUCK_COST, LUCK_DUR, MAX_SPEED, ADMIN_NAME, LAY, Room, Hub, speedCost, sellPrice, income, nextSlotCost, fmt, clamp, dist, randType, inBase };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.BRCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
