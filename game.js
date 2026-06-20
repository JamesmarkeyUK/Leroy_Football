/* Leroy Football — swipe-to-shoot penalty shootout
   Vanilla canvas, no deps. Designed for touch + mouse. */
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // ---- UI refs ----
  const scoreVal  = document.getElementById('scoreVal');
  const streakVal = document.getElementById('streakVal');
  const bestVal   = document.getElementById('bestVal');
  const streakPill= document.getElementById('streakPill');
  const toastEl   = document.getElementById('toast');
  const hintEl    = document.getElementById('hint');
  const overlay   = document.getElementById('overlay');
  const startBtn  = document.getElementById('startBtn');
  const backBtn   = document.getElementById('backBtn');
  const hiScoreEl = document.getElementById('hiScore');
  const muteBtn   = document.getElementById('muteBtn');
  const startScreen = document.getElementById('startScreen');
  const teamSelect  = document.getElementById('teamSelect');
  const startText   = document.getElementById('startText');
  const playerPill  = document.getElementById('playerPill');
  const playerNameEl= document.getElementById('playerName');
  const playerDot   = document.getElementById('playerDot');

  // ---- Teams & players ----
  // pow / cur / con are 0..1 ratings. The girls' team rates higher across the
  // board ("who are better") — felt in-game as faster shots, more bend, and a
  // keeper that's easier to wrong-foot.
  const TEAMS = {
    boys: { kit: '#ff5b5b', dark: '#c0392b', players: [
      { name: 'Leroy',   pow: .72, cur: .66, con: .62, tag: 'The gaffer',
        photo: 'leroy.png', face: { sx: 88, sy: 34, s: 150 } },
      { name: 'Charlie', pow: .82, cur: .50, con: .54, tag: 'Big boot' },
      { name: 'Jack',    pow: .56, cur: .74, con: .60, tag: 'Tricky feet' },
      { name: 'Frankie', pow: .66, cur: .60, con: .52, tag: 'All effort' },
    ]},
    girls: { kit: '#a855f7', dark: '#7c3aed', players: [
      { name: 'Christie', pow: .92, cur: .86, con: .92, tag: '★ Unstoppable' },
      { name: 'Elsie',    pow: .86, cur: .96, con: .82, tag: '★ Bends it' },
    ]},
  };
  let currentPlayer = TEAMS.boys.players[0];
  let currentKit = TEAMS.boys.kit;

  // Leroy's photo, used for his card avatar + the striker on the pitch.
  const leroyImg = new Image();
  let leroyReady = false;
  leroyImg.onload = () => { leroyReady = true; };
  leroyImg.src = 'leroy.png';

  function buildCards() {
    for (const [key, team] of Object.entries(TEAMS)) {
      const host = document.getElementById(key + 'Cards');
      host.innerHTML = '';
      for (const p of team.players) {
        const card = document.createElement('div');
        card.className = 'pcard';
        const bar = (label, v) =>
          `<div class="barRow"><span>${label}</span><div class="bar"><i style="width:${Math.round(v*100)}%"></i></div></div>`;
        const avStyle = p.photo
          ? `background-image:url(${p.photo});background-size:175%;background-position:55% 26%`
          : `background:linear-gradient(180deg,${team.kit},${team.dark})`;
        card.innerHTML =
          `<div class="av" style="${avStyle}">${p.photo ? '' : p.name[0]}</div>` +
          `<div class="pname">${p.name}</div>` +
          `<div class="tag">${p.tag}</div>` +
          `<div class="bars">${bar('PWR',p.pow)}${bar('CRV',p.cur)}${bar('CTL',p.con)}</div>`;
        card.addEventListener('click', () => { audio(); startGame(p, team.kit); });
        host.appendChild(card);
      }
    }
  }

  // ---- World (logical units, virtual portrait field) ----
  // We render to a fixed virtual size then letterbox; gameplay math uses V.
  const V = { w: 600, h: 900 };
  let scale = 1, offX = 0, offY = 0, dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cw = window.innerWidth, ch = window.innerHeight;
    canvas.width  = Math.floor(cw * dpr);
    canvas.height = Math.floor(ch * dpr);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    scale = Math.min(cw / V.w, ch / V.h);
    offX = (cw - V.w * scale) / 2;
    offY = (ch - V.h * scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  // map a client (CSS px) point into virtual coords
  function toV(clientX, clientY) {
    return { x: (clientX - offX) / scale, y: (clientY - offY) / scale };
  }

  // ---- Goal geometry (in virtual coords) ----
  const goal = { x: 120, y: 175, w: 360, h: 200 }; // mouth of the goal
  const spot = { x: V.w / 2, y: 740 };             // penalty spot / ball rest

  // ---- Persistent best score ----
  let hiScore = +(localStorage.getItem('leroy_hi') || 0);
  hiScoreEl.textContent = hiScore;

  // ---- Audio (WebAudio, no assets) ----
  let muted = localStorage.getItem('leroy_muted') === '1';
  muteBtn.textContent = muted ? '🔇' : '🔊';
  let actx = null;
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    return actx;
  }
  function blip(freq, dur, type = 'sine', gain = 0.18, slideTo) {
    if (muted) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function kickSound()  { blip(180, 0.12, 'triangle', 0.25, 90); }
  function goalSound()  { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>blip(f,0.18,'square',0.16),i*70)); }
  function saveSound()  { blip(140, 0.22, 'sawtooth', 0.2, 60); }
  function missSound()  { blip(120, 0.3, 'sine', 0.2, 70); }
  function whistle()    { blip(2000, 0.15, 'square', 0.06, 2400); }
  function fizzSound()   { blip(700, 0.18, 'sawtooth', 0.12, 1500); }
  function kissSound()   { blip(520, 0.12, 'sine', 0.13, 720); setTimeout(()=>blip(820, 0.16, 'sine', 0.12, 1080), 110); }
  function wingsSound()  { [600,900,1300,1700].forEach((f,i)=>setTimeout(()=>blip(f,0.1,'triangle',0.16),i*45)); }

  muteBtn.addEventListener('click', () => {
    muted = !muted;
    muteBtn.textContent = muted ? '🔇' : '🔊';
    localStorage.setItem('leroy_muted', muted ? '1' : '0');
    if (!muted) whistle();
  });

  // ---- Game state ----
  const State = { MENU: 0, AIM: 1, FLIGHT: 2, RESULT: 3, OVER: 4 };
  let state = State.MENU;
  let score = 0, streak = 0, best = 0, misses = 0;
  const MAX_MISSES = 3;

  // Red Bull boost — "gives you wings". Fills 1/3 per goal; when full, tap the
  // can to arm a winged power shot.
  let boostCharge = 0, boostArmed = false;
  const BOOST = { x: 524, y: 808 };

  // ball
  const ball = {
    x: spot.x, y: spot.y, z: 0,      // z = height off ground (visual lift)
    vx: 0, vy: 0, vz: 0,
    spin: 0, rot: 0, r: 30, scale: 1,
    flying: false,
  };

  // keeper
  const keeper = {
    x: goal.x + goal.w/2, y: goal.y + goal.h - 8,
    baseX: goal.x + goal.w/2,
    dive: 0,        // -1..1 target horizontal lean
    diveX: 0,       // current px offset
    armUp: 0,       // 0..1 jump/reach
    targetDir: 0,
    reacting: false,
  };

  // input / aim
  let aiming = false;
  let aimStart = null, aimCur = null;
  let particles = [];
  let netRipple = 0, shake = 0, flash = 0, strikerKick = 0;
  let resultTimer = 0;
  let ballTrail = [];

  // ---- Helpers ----
  function setHUD() {
    scoreVal.textContent = score;
    streakVal.textContent = streak;
    bestVal.textContent = best;
    streakPill.classList.toggle('hot', streak >= 3);
  }

  function toast(text, color) {
    toastEl.textContent = text;
    toastEl.style.color = color || '#fff';
    toastEl.classList.remove('show');
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
  }

  function resetBall() {
    ball.x = spot.x; ball.y = spot.y; ball.z = 0;
    ball.vx = ball.vy = ball.vz = 0;
    ball.spin = 0; ball.rot = 0; ball.scale = 1; ball.flying = false;
    ball.winged = false;
    ballTrail = [];
  }

  function newKeeperStance() {
    // keeper picks a guess once ball is struck; here just idle sway target
    keeper.dive = 0; keeper.diveX = 0; keeper.armUp = 0;
    keeper.reacting = false;
    keeper.targetDir = 0;
  }

  function showTeamSelect() {
    startScreen.classList.add('hidden');
    teamSelect.classList.remove('hidden');
  }

  function startGame(player, kit) {
    currentPlayer = player;
    currentKit = kit;
    playerNameEl.textContent = player.name;
    playerDot.style.background = kit;
    playerPill.classList.add('show');
    score = 0; streak = 0; best = 0; misses = 0;
    boostCharge = 0; boostArmed = false;
    setHUD();
    state = State.AIM;
    overlay.classList.add('hidden');
    resetBall();
    newKeeperStance();
    hintEl.style.opacity = '1';
    hintEl.textContent = `${player.name}, swipe up from the ball to shoot ⚽`;
    whistle();
  }

  function gameOver() {
    state = State.OVER;
    playerPill.classList.remove('show');
    const isBest = score > hiScore;
    if (isBest) { hiScore = score; localStorage.setItem('leroy_hi', hiScore); }
    hiScoreEl.textContent = hiScore;
    startScreen.querySelector('h1').innerHTML = isBest && score > 0
      ? '🏆 New Best!' : '⚽ Full Time';
    startText.innerHTML =
      `<b>${currentPlayer.name}</b> scored <b>${score}</b> goal${score===1?'':'s'} ` +
      `with a best streak of <b>${best}</b>.<br>Pick a striker and go again!`;
    startBtn.textContent = 'PLAY AGAIN';
    teamSelect.classList.add('hidden');
    startScreen.classList.remove('hidden');
    overlay.classList.remove('hidden');
  }

  startBtn.addEventListener('click', () => {
    audio();
    // Leroy & Christie kiss to kick things off 💍
    startScreen.classList.add('kissing');
    kissSound();
    setTimeout(() => { startScreen.classList.remove('kissing'); showTeamSelect(); }, 850);
  });
  backBtn.addEventListener('click', () => {
    teamSelect.classList.add('hidden');
    startScreen.classList.remove('hidden');
  });
  buildCards();

  // ---- Shooting ----
  function shoot(dragVX, dragVY) {
    // dragVX/Y are swipe vector in virtual px (from ball toward release)
    // Up the field is negative Y. Require an upward-ish swipe.
    const power = Math.min(1, Math.hypot(dragVX, dragVY) / 320);
    if (power < 0.18 || dragVY > -30) { // too weak or not upward
      return false;
    }
    // Aim point on goal line derived from swipe direction.
    const aimX = spot.x + dragVX * 1.35;
    // velocities (virtual px/frame-ish; tuned with dt) — scaled by player power
    const P = currentPlayer;
    const speed = (13 + power * 11) * (0.9 + P.pow * 0.28);
    const ang = Math.atan2(dragVY, dragVX);
    ball.vx = Math.cos(ang) * speed;
    ball.vy = Math.sin(ang) * speed;
    ball.vz = 4 + power * 7;                            // loft
    ball.spin = dragVX * 0.0009 * (0.75 + P.cur * 0.7); // curve scaled by player

    // Red Bull wings: armed boost gives extra pace, more bend and lift.
    ball.winged = false;
    if (boostArmed) {
      ball.vx *= 1.38; ball.vy *= 1.38; ball.vz += 1.5;
      ball.spin *= 1.7;
      ball.winged = true;
      boostArmed = false;
      wingsSound();
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5;
        particles.push({ x: ball.x, y: ball.y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp,
          life: 1, r: 3 + Math.random()*4, c: '#ffd23f', kind: 'confetti', rot: 0, vr: 0 });
      }
    }

    ball.flying = true;
    ball._aimX = aimX;
    ball._power = power;

    // Keeper reacts: guesses a direction, biased (sometimes) toward the shot.
    const goalCenter = goal.x + goal.w/2;
    const aimSide = (aimX - goalCenter) / (goal.w/2); // -1..1
    let guess;
    const r = Math.random();
    // difficulty scales subtly with score; better players wrong-foot the keeper
    const smart = Math.min(0.55, 0.28 + score * 0.015) * (1.25 - P.con * 0.55);
    if (r < smart) guess = clamp(aimSide + (Math.random()-0.5)*0.7, -1.3, 1.3);
    else guess = (Math.random()*2 - 1) * 1.25;
    keeper.targetDir = guess;
    keeper.reacting = true;

    state = State.FLIGHT;
    strikerKick = 1;
    hintEl.style.opacity = '0';
    kickSound();
    spawnKickDust();
    return true;
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function spawnKickDust() {
    for (let i = 0; i < 10; i++) {
      particles.push({
        x: ball.x + (Math.random()-0.5)*30, y: ball.y + 10,
        vx: (Math.random()-0.5)*4, vy: -Math.random()*3 - 1,
        life: 1, r: 4 + Math.random()*5, c: 'rgba(255,255,255,', kind:'dust'
      });
    }
  }
  function spawnConfetti(cx, cy) {
    const cols = ['#ffd23f','#ff6b6b','#4dd2ff','#7bed9f','#a78bfa','#ff9f43'];
    for (let i = 0; i < 70; i++) {
      const a = Math.random()*Math.PI*2, sp = 4 + Math.random()*8;
      particles.push({
        x: cx, y: cy, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp - 4,
        life: 1, r: 4 + Math.random()*5, c: cols[i%cols.length],
        rot: Math.random()*6, vr: (Math.random()-0.5)*0.5, kind:'confetti'
      });
    }
  }

  // ---- Result resolution ----
  function resolveShot() {
    state = State.RESULT;
    resultTimer = 0;
    // Count it as long as at least half the ball is inside the posts — i.e. the
    // ball's centre is level with (or inside) the inner edge of either post.
    const inMouthX = ball.x >= goal.x && ball.x <= goal.x + goal.w;
    const aboveBar = ball.y < goal.y - 4;
    const crossedLine = ball.y <= goal.y + 26;

    // keeper hand position
    const kx = keeper.x + keeper.diveX;
    const reach = 70 + keeper.armUp * 40;
    const saved = Math.abs(ball.x - kx) < reach && ball.z < 130 && inMouthX;

    if (!crossedLine) return; // still resolving elsewhere
    if (inMouthX && !aboveBar && !saved) {
      // GOAL
      score++;
      streak++;
      best = Math.max(best, streak);
      const bonus = streak >= 3 ? ` +${streak}` : '';
      score += streak >= 3 ? streak : 0;
      setHUD();
      netRipple = 1; flash = 0.5; shake = 8;
      spawnConfetti(ball.x, ball.y);
      goalSound();
      if (ball.winged) toast('🪽 WINGS GOAL!', '#ffd23f');
      else toast(`${currentPlayer.name.toUpperCase()} SCORES!`, '#7bed9f');
      if (streak === 3) setTimeout(()=>toast('ON FIRE 🔥','#ffd23f'), 350);
      boostCharge = Math.min(1, boostCharge + 1/3);
      ball._scored = true;
    } else {
      // MISS or SAVE
      misses++;
      streak = 0;
      setHUD();
      shake = 6;
      if (saved) { saveSound(); toast('SAVED!', '#4dd2ff'); }
      else if (aboveBar) { missSound(); toast('OVER!', '#ff9f43'); }
      else { missSound(); toast('MISS!', '#ff6b6b'); }
      ball._scored = false;
    }
  }

  // ---- Update ----
  let last = performance.now();
  function update(now) {
    const dt = Math.min(2.2, (now - last) / 16.667); // normalized to 60fps steps
    last = now;

    // idle keeper sway + ambient
    if (state === State.AIM || state === State.MENU) {
      keeper.diveX = Math.sin(now / 600) * 26;
      keeper.armUp = 0;
    }

    if (state === State.FLIGHT || state === State.RESULT) {
      // ball physics
      ball.spin += 0; // constant curve already in spin
      ball.vx += ball.spin * dt;            // magnus-ish curve
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      // height: gravity on z
      ball.vz -= 0.42 * dt;
      ball.z += ball.vz * dt;
      if (ball.z < 0) { ball.z = 0; ball.vz *= -0.45; ball.vx *= 0.7; ball.vy *= 0.7; }
      ball.rot += (ball.vx * 0.03 + 0.1) * dt;
      // perspective shrink as it goes up the field
      const prog = clamp((spot.y - ball.y) / (spot.y - goal.y), 0, 1);
      ball.scale = 1 - prog * 0.55;

      ballTrail.push({ x: ball.x, y: ball.y - ball.z, r: ball.r * ball.scale });
      if (ballTrail.length > 12) ballTrail.shift();

      // keeper dives toward guess as ball approaches
      if (keeper.reacting) {
        const approach = prog; // 0..1
        keeper.armUp = clamp(approach * 1.4, 0, 1);
        const targetX = keeper.targetDir * (goal.w/2 - 30);
        keeper.diveX += (targetX - keeper.diveX) * 0.12 * dt;
      }

      // resolve when crossing goal line area
      if (state === State.FLIGHT && ball.y <= goal.y + 26) {
        resolveShot();
      }
      // safety: ball left field
      if (state === State.FLIGHT && (ball.y < -60 || ball.x < -120 || ball.x > V.w + 120)) {
        misses++; streak = 0; setHUD(); missSound(); toast('MISS!','#ff6b6b');
        state = State.RESULT; resultTimer = 0; ball._scored = false;
      }
    }

    if (state === State.RESULT) {
      resultTimer += dt;
      // let ball/confetti play out, then next shot or game over
      if (resultTimer > 55) {
        if (misses >= MAX_MISSES) gameOver();
        else { state = State.AIM; resetBall(); newKeeperStance();
               hintEl.style.opacity = '1'; }
      }
    }

    // particles
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'confetti') { p.vy += 0.18 * dt; p.rot += p.vr * dt; p.vx *= 0.99; }
      else { p.vy += 0.05 * dt; }
      p.life -= (p.kind === 'confetti' ? 0.012 : 0.04) * dt;
    }
    particles = particles.filter(p => p.life > 0 && p.y < V.h + 40);

    // decay effects
    netRipple *= Math.pow(0.92, dt);
    shake *= Math.pow(0.86, dt);
    flash *= Math.pow(0.88, dt);
    strikerKick *= Math.pow(0.9, dt);
  }

  // ---- Render ----
  function draw() {
    const sx = (Math.random()-0.5) * shake;
    const sy = (Math.random()-0.5) * shake;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offX + sx, offY + sy);
    ctx.scale(scale, scale);

    drawPitch();
    drawAdBoards();
    drawGoal();
    drawKeeper();
    drawStriker();
    drawBallTrail();
    if (state === State.AIM) drawAimGuide();
    drawBall();
    drawParticles();
    drawBoost();

    if (flash > 0.02) {
      ctx.fillStyle = `rgba(255,255,255,${flash})`;
      ctx.fillRect(-200, -200, V.w + 400, V.h + 400);
    }
    ctx.restore();
  }

  function drawPitch() {
    // grass gradient
    const g = ctx.createLinearGradient(0, goal.y - 80, 0, V.h);
    g.addColorStop(0, '#1f8e40');
    g.addColorStop(1, '#0c6128');
    ctx.fillStyle = g;
    ctx.fillRect(-200, -200, V.w + 400, V.h + 400);

    // mowed stripes (perspective-ish horizontal bands)
    ctx.save();
    for (let i = 0; i < 12; i++) {
      const y0 = goal.y - 60 + i * 78;
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(-200, y0, V.w + 400, 78);
    }
    ctx.restore();

    // penalty arc + box
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(40, goal.y + 250);
    ctx.lineTo(V.w - 40, goal.y + 250);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(V.w/2, goal.y + 250, 130, 0.15*Math.PI, 0.85*Math.PI);
    ctx.stroke();
    // penalty spot
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(spot.x, spot.y, 5, 0, 7); ctx.fill();
  }

  function drawGoal() {
    const x = goal.x, y = goal.y, w = goal.w, h = goal.h;
    const post = 9;
    // net
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.2;
    const rip = Math.sin(performance.now()/120) * netRipple * 8;
    for (let i = 0; i <= 18; i++) {
      const gx = x + (w/18) * i;
      ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + rip*Math.sin(i), y + h); ctx.stroke();
    }
    for (let j = 0; j <= 9; j++) {
      const gy = y + (h/9) * j;
      ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy + rip*0.2); ctx.stroke();
    }
    ctx.restore();

    // posts + crossbar
    ctx.fillStyle = '#f4f7ff';
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    roundRect(x - post, y - post, post, h + post, 3, true);            // left post
    roundRect(x + w, y - post, post, h + post, 3, true);               // right post
    roundRect(x - post, y - post, w + post*2, post, 3, true);          // crossbar
  }

  function drawKeeper() {
    const kx = keeper.x + keeper.diveX;
    const lift = keeper.armUp * 38;
    const ky = keeper.y - lift;
    const lean = clamp(keeper.diveX / 140, -1, 1);
    ctx.save();
    ctx.translate(kx, ky);
    ctx.rotate(lean * 0.5);

    // shadow
    ctx.save();
    ctx.setTransform(dpr,0,0,dpr, offX*1, offY*1);
    ctx.restore();

    // body
    const bodyW = 46, bodyH = 70;
    ctx.fillStyle = '#ff5b5b';
    roundRect(-bodyW/2, -bodyH, bodyW, bodyH, 12, true);
    // shorts
    ctx.fillStyle = '#222a44';
    roundRect(-bodyW/2, -22, bodyW, 26, 6, true);
    // arms up to reach
    ctx.strokeStyle = '#ff5b5b';
    ctx.lineWidth = 14; ctx.lineCap = 'round';
    const reach = 30 + keeper.armUp * 26;
    ctx.beginPath();
    ctx.moveTo(-bodyW/2 + 6, -bodyH + 18);
    ctx.lineTo(-bodyW/2 - 18, -bodyH - reach);
    ctx.moveTo(bodyW/2 - 6, -bodyH + 18);
    ctx.lineTo(bodyW/2 + 18, -bodyH - reach);
    ctx.stroke();
    // gloves
    ctx.fillStyle = '#ffe066';
    ctx.beginPath(); ctx.arc(-bodyW/2 - 18, -bodyH - reach, 11, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(bodyW/2 + 18, -bodyH - reach, 11, 0, 7); ctx.fill();
    // head
    ctx.fillStyle = '#f6c89a';
    ctx.beginPath(); ctx.arc(0, -bodyH - 14, 16, 0, 7); ctx.fill();
    ctx.restore();
  }

  // Red Bull pitchside advertising hoardings behind the goal
  function drawAdBoards() {
    const bx = goal.x - 34, bw = goal.w + 68, by = 120, bh = 34;
    ctx.save();
    roundRect(bx, by, bw, bh, 4, false);
    ctx.clip();
    const panelW = 104;
    const scroll = (performance.now() / 45) % panelW;
    for (let i = -1; i * panelW - scroll < bw; i++) {
      const px = bx + i * panelW - scroll;
      const even = ((i % 2) + 2) % 2 === 0;
      ctx.fillStyle = even ? '#0a1a4a' : '#d62631';
      ctx.fillRect(px, by, panelW, bh);
      // yellow "sun" disc
      ctx.fillStyle = '#ffc905';
      ctx.beginPath(); ctx.arc(px + 22, by + bh/2, 9, 0, 7); ctx.fill();
      // wordmark
      ctx.fillStyle = even ? '#ffc905' : '#ffffff';
      ctx.font = '700 13px -apple-system, Arial, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('RED BULL', px + 35, by + bh/2 + 1);
    }
    ctx.restore();
    // frame + legs
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2;
    roundRect(bx, by, bw, bh, 4, false);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(bx + 30, by + bh, 5, 8);
    ctx.fillRect(bx + bw - 35, by + bh, 5, 8);
    ctx.textBaseline = 'alphabetic';
  }

  // Foreground striker taking the kick — Leroy's photo for his head.
  function drawStriker() {
    if (state === State.MENU || state === State.OVER) return;
    const kick = strikerKick;
    const cx = spot.x, hy = 820 - kick * 8;       // small bob on the strike
    const headR = 30;
    ctx.save();
    ctx.translate(cx, 0);
    ctx.rotate(-kick * 0.06);

    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(0, 905, 70, 16, 0, 0, 7); ctx.fill();

    // torso (kit) with Red Bull sponsor
    const tColor = currentKit;
    const dark = currentPlayer && TEAMS.girls.players.includes(currentPlayer) ? '#7c3aed' : '#c0392b';
    const grd = ctx.createLinearGradient(0, hy + 20, 0, 930);
    grd.addColorStop(0, tColor); grd.addColorStop(1, dark);
    ctx.fillStyle = grd;
    roundRect(-62, hy + 16, 124, 110, 30, true);
    // collar
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(-22, hy + 14, 44, 12, 6, true);
    // Red Bull chest sponsor
    ctx.fillStyle = '#fff';
    ctx.font = '800 16px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RED BULL', 0, hy + 66);
    ctx.fillStyle = '#ffc905';
    ctx.beginPath(); ctx.arc(0, hy + 84, 7, 0, 7); ctx.fill();
    ctx.textAlign = 'left';

    // head
    ctx.save();
    ctx.beginPath(); ctx.arc(0, hy, headR, 0, 7); ctx.closePath(); ctx.clip();
    if (currentPlayer && currentPlayer.photo && leroyReady) {
      const f = currentPlayer.face;
      ctx.drawImage(leroyImg, f.sx, f.sy, f.s, f.s, -headR, hy - headR, headR*2, headR*2);
    } else {
      ctx.fillStyle = '#f6c89a';
      ctx.fillRect(-headR, hy - headR, headR*2, headR*2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.font = '800 26px -apple-system, Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(currentPlayer ? currentPlayer.name[0] : '?', 0, hy + 1);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
    // head ring
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, hy, headR, 0, 7); ctx.stroke();

    ctx.restore();
  }

  // Red Bull boost can + charge meter
  function drawBoost() {
    if (state === State.MENU || state === State.OVER) return;
    const x = BOOST.x, y = BOOST.y, w = 38, h = 70;
    const ready = boostCharge >= 1;
    const t = performance.now();
    const pulse = ready ? 0.5 + 0.5 * Math.sin(t / 200) : 0;

    ctx.save();
    // glow when ready / armed
    if (ready || boostArmed) {
      ctx.fillStyle = `rgba(255,210,63,${0.18 + pulse * 0.22})`;
      ctx.beginPath(); ctx.arc(x, y, 46 + pulse * 6, 0, 7); ctx.fill();
    }
    // charge ring
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.arc(x, y, 30, 0, 7); ctx.stroke();
    ctx.strokeStyle = ready ? '#ffd23f' : '#7bed9f';
    ctx.beginPath(); ctx.arc(x, y, 30, -Math.PI/2, -Math.PI/2 + boostCharge * Math.PI * 2); ctx.stroke();

    // the can
    const dim = ready || boostArmed ? 1 : 0.55;
    ctx.globalAlpha = dim;
    const cg = ctx.createLinearGradient(x - w/2, 0, x + w/2, 0);
    cg.addColorStop(0, '#9aa3ad'); cg.addColorStop(.5, '#eef1f4'); cg.addColorStop(1, '#9aa3ad');
    ctx.fillStyle = cg;
    roundRect(x - w/2, y - h/2, w, h, 7, true);
    // top lid
    ctx.fillStyle = '#c7ccd2';
    roundRect(x - w/2 + 3, y - h/2 - 3, w - 6, 7, 3, true);
    // blue diagonals (Red Bull motif)
    ctx.save();
    roundRect(x - w/2, y - h/2, w, h, 7, false); ctx.clip();
    ctx.fillStyle = '#0a1a6a';
    ctx.beginPath();
    ctx.moveTo(x - w/2, y - 6); ctx.lineTo(x + w/2, y - 16);
    ctx.lineTo(x + w/2, y + h); ctx.lineTo(x - w/2, y + h); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - w/2, y - 18); ctx.lineTo(x + w/2, y - 28);
    ctx.lineTo(x + w/2, y - 18); ctx.lineTo(x - w/2, y - 8); ctx.closePath();
    ctx.fillStyle = '#d62631'; ctx.fill();
    // yellow sun
    ctx.fillStyle = '#ffc905';
    ctx.beginPath(); ctx.arc(x, y + 6, 8, 0, 7); ctx.fill();
    ctx.restore();
    // tiny label
    ctx.globalAlpha = 1;
    ctx.fillStyle = ready ? '#ffd23f' : 'rgba(255,255,255,0.85)';
    ctx.font = '800 12px -apple-system, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(boostArmed ? 'ARMED' : ready ? 'WINGS!' : 'BOOST', x, y + h/2 + 20);
    if (ready && !boostArmed) {
      ctx.font = '700 10px -apple-system, Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText('tap', x, y + h/2 + 33);
    }
    ctx.textAlign = 'left';
    ctx.restore();
  }

  function drawBallTrail() {
    for (let i = 0; i < ballTrail.length; i++) {
      const t = ballTrail[i];
      const a = (i / ballTrail.length) * 0.25;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 0.9, 0, 7); ctx.fill();
    }
  }

  function drawBall() {
    const bx = ball.x, by = ball.y - ball.z;
    const r = ball.r * ball.scale;
    // ground shadow (stays on ground, shrinks with height)
    const shA = clamp(0.35 - ball.z/600, 0.06, 0.35);
    ctx.fillStyle = `rgba(0,0,0,${shA})`;
    ctx.beginPath();
    ctx.ellipse(ball.x, ball.y + 6, r * (1 - ball.z/900), r*0.4*(1-ball.z/900), 0, 0, 7);
    ctx.fill();

    // Red Bull wings — golden aura + wings when armed or in flight
    const winged = ball.winged || (boostArmed && state === State.AIM);
    if (winged) {
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 120);
      ctx.fillStyle = `rgba(255,210,63,${0.22 * pulse})`;
      ctx.beginPath(); ctx.arc(bx, by, r * 2.1, 0, 7); ctx.fill();
      const wr = r * 1.5;
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(bx + side * r * 0.7, by - r * 0.2);
        ctx.scale(side, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(wr * 0.9, -wr * 0.8, wr * 1.4, -wr * 0.2);
        ctx.quadraticCurveTo(wr * 0.8, -wr * 0.1, wr, wr * 0.2);
        ctx.quadraticCurveTo(wr * 0.5, wr * 0.15, 0, 0);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,200,40,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(ball.rot);
    // white sphere
    const grd = ctx.createRadialGradient(-r*0.3, -r*0.3, r*0.2, 0, 0, r);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(1, '#cfd6dd');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    // pentagon-ish dark patches
    ctx.fillStyle = '#1b2330';
    drawPentagon(0, 0, r*0.4);
    for (let k = 0; k < 5; k++) {
      const a = k * (Math.PI*2/5) - Math.PI/2;
      drawPentagon(Math.cos(a)*r*0.72, Math.sin(a)*r*0.72, r*0.2, a);
    }
    // rim
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0,0,r,0,7); ctx.stroke();
    ctx.restore();
  }

  function drawPentagon(cx, cy, rad, rot = 0) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = rot + i * (Math.PI*2/5) - Math.PI/2;
      const x = cx + Math.cos(a)*rad, y = cy + Math.sin(a)*rad;
      i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
    }
    ctx.closePath(); ctx.fill();
  }

  function drawAimGuide() {
    if (!aiming || !aimStart || !aimCur) return;
    const dx = aimCur.x - aimStart.x, dy = aimCur.y - aimStart.y;
    if (dy > -10) return;
    const power = Math.min(1, Math.hypot(dx, dy) / 320);
    // projected target on goal line
    const aimX = spot.x + dx * 1.35;
    // dotted curve from ball toward aim, bending with horizontal drag
    ctx.save();
    ctx.setLineDash([10, 12]);
    ctx.lineWidth = 5;
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + power*0.4})`;
    ctx.beginPath();
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = spot.x + (aimX - spot.x) * t + Math.sin(t*Math.PI) * dx * 0.18;
      const y = spot.y + (goal.y + 40 - spot.y) * t;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // power arrow head
    ctx.fillStyle = `rgba(255,210,63,${0.6 + power*0.4})`;
    ctx.beginPath();
    ctx.arc(aimX, goal.y + 40, 10 + power*8, 0, 7);
    ctx.fill();

    // power meter at ball
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(spot.x - 60, spot.y + 36, 120, 12, 6, true);
    ctx.fillStyle = power > 0.8 ? '#ff6b6b' : '#ffd23f';
    roundRect(spot.x - 58, spot.y + 38, 116 * power, 8, 4, true);
  }

  function drawParticles() {
    for (const p of particles) {
      if (p.kind === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.globalAlpha = clamp(p.life, 0, 1);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r/2, -p.r/2, p.r, p.r*0.6);
        ctx.restore();
      } else {
        ctx.globalAlpha = clamp(p.life, 0, 1);
        ctx.fillStyle = p.c + clamp(p.life,0,1) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function roundRect(x, y, w, h, r, fill) {
    r = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
    if (fill) ctx.fill(); else ctx.stroke();
  }

  // ---- Input handling ----
  function pointerDown(cx, cy) {
    if (state !== State.AIM) return;
    const p = toV(cx, cy);
    // tap the Red Bull can (when charged) to arm a winged shot
    if (Math.hypot(p.x - BOOST.x, p.y - BOOST.y) < 56) {
      if (boostCharge >= 1 && !boostArmed) {
        boostArmed = true; boostCharge = 0;
        fizzSound();
        toast('WINGS ARMED 🪽', '#ffd23f');
      }
      return;
    }
    // must start near the ball
    if (Math.hypot(p.x - ball.x, p.y - ball.y) < 140) {
      aiming = true;
      aimStart = p; aimCur = p;
    }
  }
  function pointerMove(cx, cy) {
    if (!aiming) return;
    aimCur = toV(cx, cy);
  }
  function pointerUp() {
    if (!aiming) return;
    aiming = false;
    if (aimStart && aimCur) {
      const dx = aimCur.x - aimStart.x, dy = aimCur.y - aimStart.y;
      shoot(dx, dy);
    }
    aimStart = aimCur = null;
  }

  canvas.addEventListener('touchstart', e => { e.preventDefault(); const t=e.changedTouches[0]; pointerDown(t.clientX, t.clientY); }, {passive:false});
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); const t=e.changedTouches[0]; pointerMove(t.clientX, t.clientY); }, {passive:false});
  canvas.addEventListener('touchend',   e => { e.preventDefault(); pointerUp(); }, {passive:false});
  canvas.addEventListener('mousedown',  e => pointerDown(e.clientX, e.clientY));
  window.addEventListener('mousemove',  e => pointerMove(e.clientX, e.clientY));
  window.addEventListener('mouseup',    () => pointerUp());

  // ---- Main loop ----
  function frame(now) {
    update(now);
    draw();
    requestAnimationFrame(frame);
  }
  setHUD();
  requestAnimationFrame(frame);
})();
