const API = (p,o={})=>fetch(p,o).then(r=>r.json());
const socket = io({autoConnect:true, transports:['websocket','polling']});
let USER=null, PROFILE=null, ROOM_ID=null, MY_INDEX=0, VIEW='auth', CURRENT='peashooter';
let GAME_STATE=null, SUN_NOW=999, HOME_TIMER=null, HOVER_CELL=null;
let ROOM_CACHE=null, COUNTDOWN_TIMER=null, COUNTDOWN_LEFT=0;
let INV_PAGE=0;
let PENDING_ACTIONS=[];
let MY_ROLE='defender';
let CURRENT_ROLE_UI='';
let CURRENT_Z_CARD=null;
let ZOMBIE_POINTS=0;
let ZOMBIE_DECK=[];
let ZOMBIE_COOLDOWNS={};
let AVAILABLE_ZOMBIES=[];
let LOBBY_Z_DECK=[];
let LOBBY_DECK_NOTICE='';

const DEFAULT_OWNED = ['peashooter','sunflower','wallnut'];

const PLANTS_ALL=[
  {key:'1', code:'peashooter', name:'Стрелок', icon:'🌱', cost:100},
  {key:'2', code:'sunflower',  name:'Подсолнух', icon:'🌻', cost:50},
  {key:'3', code:'wallnut',    name:'Орех', icon:'🥜', cost:50},
  {key:'4', code:'freeze',     name:'Заморозка', icon:'❄️', cost:150},
  {key:'5', code:'bomb',       name:'Бомба', icon:'💣', cost:200},
  {key:'6', code:'icepea',     name:'Ледяной', icon:'🧊', cost:140},
  {key:'7', code:'potato',     name:'Картоф. мина', icon:'🥔', cost:25},
  {key:'8', code:'spikeweed',  name:'Шипы', icon:'🌵', cost:70},
  {key:'9', code:'tallnut',    name:'Толст. орех', icon:'🧱', cost:125},
  {key:'0', code:'cabbage',    name:'Капуст. пушка', icon:'🥬', cost:160},
];
let PLANTS=PLANTS_ALL.slice(); // filtered by ownership later

const ZOMBIE_LIBRARY={
  normal:{name:'Обычный',icon:'🧟',cost:20,cooldown:1.5},
  cone:{name:'Конус',icon:'🪖',cost:35,cooldown:4.0},
  bucket:{name:'Ведро',icon:'🪣',cost:55,cooldown:5.5},
  fast:{name:'Спринтер',icon:'⚡',cost:28,cooldown:3.5},
  swarm:{name:'Рой',icon:'👣',cost:18,cooldown:2.5},
  kamikaze:{name:'Подрывник',icon:'💥',cost:30,cooldown:4.5},
  cart:{name:'Тележка',icon:'🛒',cost:42,cooldown:5.5},
  screamer:{name:'Крикун',icon:'📢',cost:34,cooldown:5.0},
  shield:{name:'Щит',icon:'🛡️',cost:48,cooldown:6.0},
  regen:{name:'Реген',icon:'➕',cost:44,cooldown:5.5},
  air:{name:'Летун',icon:'🎈',cost:36,cooldown:4.5},
  boss:{name:'Босс',icon:'👑',cost:120,cooldown:25}
};

const left = document.getElementById('leftPanel');
const main = document.getElementById('mainPanel');
const navbar = document.getElementById('navbar');
const modal = document.getElementById('createModal');
const profileModal = document.getElementById('profileModal');
const shopModal = document.getElementById('shopModal');

function md5(s){return CryptoJS.MD5(s.toLowerCase().trim()).toString()}
function avatarUrl(name){ return `https://www.gravatar.com/avatar/${md5(name)}?d=identicon`; }

function setView(v){ VIEW=v; if(HOME_TIMER){clearInterval(HOME_TIMER); HOME_TIMER=null;} render(); }
function openModal(){ modal.style.display='flex'; }
function closeModal(){ modal.style.display='none'; }

function openProfile(name){
  profileModal.style.display='flex';
  const box=document.getElementById('profileBox');
  box.innerHTML = 'Загрузка...';
  API('/api/profile?u='+encodeURIComponent(name)).then(j=>{
    PROFILE=j.profile||{};
    PROFILE.zombie_classes=PROFILE.zombie_classes||['normal'];
    PROFILE.zombie_deck=PROFILE.zombie_deck||['normal'];
    AVAILABLE_ZOMBIES = PROFILE.zombie_classes.slice();
    const recent = (j.recent||[]).map(m=>`<li>Счёт: ${m.score}, Итог: ${m.outcome}, Время: ${m.duration}s</li>`).join('');
    box.innerHTML = `<div style="display:flex;align-items:center;gap:12px">
      <img class="avatar" src="${avatarUrl(name)}&s=42" style="width:42px;height:42px"/>
      <div><b>${name}</b><div class="muted">Очки: ${PROFILE.score||0} · Победы: ${PROFILE.games_won||0} · Матчей: ${PROFILE.games_played||0} · Монеты: ${PROFILE.coins||0}</div></div>
    </div>
    <div class="sep"></div>
    <div>Лучший счёт: <b>${j.best||0}</b></div>
    <div style="margin-top:6px"><b>Последние матчи:</b><ul>${recent||'<li>Пока нет</li>'}</ul></div>`;
  });
}
function closeProfile(){ profileModal.style.display='none'; }

function updateOwnedPlants(){
  const ownedList = Array.isArray(PROFILE?.owned) ? PROFILE.owned : [];
  const allowed = new Set([...DEFAULT_OWNED, ...ownedList]);
  const filtered = PLANTS_ALL.filter(p=>allowed.has(p.code));
  PLANTS = filtered.length ? filtered : PLANTS_ALL.filter(p=>DEFAULT_OWNED.includes(p.code));
  if(!PLANTS.some(p=>p.code===CURRENT)){
    CURRENT = PLANTS[0]?.code || 'peashooter';
  }
  const totalPages = Math.max(1, Math.ceil(PLANTS.length/24));
  if(INV_PAGE >= totalPages){ INV_PAGE = totalPages-1; }
  if(INV_PAGE < 0){ INV_PAGE = 0; }
  if(document.getElementById('inventory')){
    buildInventory();
  }
}

function openShop(){
  shopModal.style.display='flex';
  const box=document.getElementById('shopBox'); box.textContent='Загрузка...';
  API('/api/store?u='+encodeURIComponent(USER)).then(j=>{
    const coins = j.coins||0;
    const items = j.items||[];
    const owned = items.filter(i=>i.owned).map(i=>i.item);
    if(PROFILE){
      PROFILE.coins=coins;
      PROFILE.owned=owned;
      PROFILE.zombie_classes=j.zombie_classes||PROFILE.zombie_classes||[];
      PROFILE.zombie_deck=j.zombie_deck||PROFILE.zombie_deck||[];
      AVAILABLE_ZOMBIES = PROFILE.zombie_classes||[];
      updateOwnedPlants();
    }
    const html = [`<div><b>Ваши монеты:</b> ${coins}</div><div class="sep"></div>`].concat(items.map(it=>{
      const ownedClass = it.type==='zombie' ? (it.owned ? '✅ Доступно' : '') : '';
      const btn = it.owned ? '✅ Куплено' : `<button class="btn" onclick="buyItem('${it.item}')">Купить за ${it.price}</button>`;
      const extra = it.type==='zombie' && it.unlocks ? `<div class="muted">Открывает: ${it.unlocks.map(z=>ZOMBIE_LIBRARY[z]?.name||z).join(', ')}</div>` : '';
      const kind = it.type==='plant'?'Растение':'Классы зомби';
      const status = ownedClass ? `${ownedClass}<br>${btn}` : btn;
      return `<div class="card"><div class="icon">${it.icon}</div><div style="flex:1"><div><b>${it.name}</b></div><div class="muted">${kind}</div>${extra}</div><div>${status}</div></div>`;
    })).join('');
    box.innerHTML = html;
  });
}
function buyItem(item){
  API('/api/buy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:USER,item})}).then(j=>{
    if(j.status==='ok'){
      if(PROFILE && j.profile){ PROFILE=j.profile; AVAILABLE_ZOMBIES=PROFILE.zombie_classes||[]; updateOwnedPlants(); }
      openShop(); buildInventory();
    }
    else{ alert('Покупка не удалась: '+(j.msg||'')); }
  });
}
function closeShop(){ shopModal.style.display='none'; }

function logout(){ localStorage.removeItem('USER'); USER=null; closeProfile(); setView('auth'); }

socket.on('connected', ()=>{
  const u=localStorage.getItem('USER');
  const rid=localStorage.getItem('ROOM_ID');
  if(u) USER=u;
  render();
  if(u && rid){
    ROOM_ID=rid;
    socket.emit('rejoin',{username:USER, room_id:ROOM_ID});
    setView('room');
  }else{
    setView(u? 'home' : 'auth');
  }
});

socket.on('room_update', (data)=>{
  ROOM_CACHE=data.room;
  if(VIEW==='room'){ drawRoomInfo(data.room); }
  if(data.room.countdown_until){
    COUNTDOWN_LEFT = Math.max(0, Math.floor(data.room.countdown_until - (Date.now()/1000)));
    startCountdownTicker();
  }else{
    stopCountdownTicker();
  }
  if(data.room.started && VIEW!=='game'){ setView('game'); }
});
socket.on('game_started', (payload)=>{ if(payload && payload.room_id===ROOM_ID){ setView('game'); }});
socket.on('game_over', (payload)=>{ if(ROOM_ID===payload.room_id){ setView('room'); }});
socket.on('room_deleted', (payload)=>{
  if(ROOM_ID===payload.room_id){
    alert('Комната удалена (все игроки вышли).');
    ROOM_ID=null; localStorage.removeItem('ROOM_ID'); setView('home'); listRooms();
  } else { if(VIEW==='home') listRooms(); }
});
socket.on('action_result', (payload={})=>{
  const pending = PENDING_ACTIONS.length ? PENDING_ACTIONS.shift() : null;
  if(payload.status==='ok'){
    if(pending && pending.type==='place'){
      SUN_NOW = Math.max(0, SUN_NOW - (pending.cost||0));
      if(GAME_STATE){ GAME_STATE.sun = SUN_NOW; if(VIEW==='game') redraw(); }
      else if(VIEW==='game'){ highlightInventory(); }
    }
    const s=document.getElementById('status'); if(s) s.textContent='';
  } else {
    if(payload.msg){ setStatus(payload.msg); }
    else { setStatus('Действие не выполнено'); }
    if(VIEW==='game'){
      if(GAME_STATE){ redraw(); }
      else { highlightInventory(); }
    }
  }
});
socket.on('chat', (m)=>{
  const box=document.getElementById('chatBox'); if(!box) return;
  const sys = m.user==='system'?'muted':'';
  box.innerHTML += `<div class="${sys}"><b>${m.user}:</b> ${m.text}</div>`;
  box.scrollTop=box.scrollHeight;
});
socket.on('state_update', (payload)=>{
  if(!ROOM_ID || payload.room_id!==ROOM_ID) return;
  const st=payload.state; GAME_STATE=st;
  SUN_NOW=st.sun;
  ZOMBIE_POINTS=st.zombie_points||ZOMBIE_POINTS;
  ZOMBIE_COOLDOWNS=st.zombie_cooldowns||{};
  if(Array.isArray(st.zombie_deck)) ZOMBIE_DECK=st.zombie_deck.slice();
  MY_ROLE=st.role||MY_ROLE;
  if(VIEW==='game'){
    if(CURRENT_ROLE_UI!==MY_ROLE){ renderGame(); return; }
    redraw();
    if(MY_ROLE==='attacker'){ buildZombieDeckUI(); }
  }
});
socket.on('wave_cleared', (p)=>{
  if(ROOM_ID===p.room_id){
    const s=document.getElementById('status');
    if(s) s.textContent = `Волна ${p.wave} завершена! Ждём напарника...`;
  }
});
socket.on('deck_saved', (payload={})=>{
  if(payload.deck && PROFILE){
    PROFILE.zombie_deck=payload.deck.slice();
    LOBBY_Z_DECK=payload.deck.slice();
  }
  if(VIEW==='room' && ROOM_CACHE && ROOM_CACHE.mode==='pvp'){ buildLobbyDeck(ROOM_CACHE, true); }
});
socket.on('profile_sync', (payload={})=>{
  if(!payload.profile){ return; }
  PROFILE=payload.profile||{};
  PROFILE.zombie_classes = PROFILE.zombie_classes||['normal'];
  PROFILE.zombie_deck = PROFILE.zombie_deck||['normal'];
  PROFILE.owned = PROFILE.owned||[];
  AVAILABLE_ZOMBIES = PROFILE.zombie_classes.slice();
  updateOwnedPlants();
});

function startCountdownTicker(){
  if(COUNTDOWN_TIMER) return;
  COUNTDOWN_TIMER=setInterval(()=>{
    COUNTDOWN_LEFT=Math.max(0, COUNTDOWN_LEFT-1);
    const cd=document.getElementById('countdown'); if(cd) cd.textContent = COUNTDOWN_LEFT>0 ? ('Старт через: '+COUNTDOWN_LEFT+' сек') : '';
  },1000);
}
function stopCountdownTicker(){ if(COUNTDOWN_TIMER){ clearInterval(COUNTDOWN_TIMER); COUNTDOWN_TIMER=null; const cd=document.getElementById('countdown'); if(cd) cd.textContent=''; } }

function render(){
  if(USER){
    navbar.innerHTML = `<span style="cursor:pointer" onclick="openProfile('${USER}')"><img class="avatar" src="${avatarUrl(USER)}&s=24" style="width:24px;height:24px"/> <b>${USER}</b></span>`;
  }else{ navbar.textContent = 'Гость'; }
  if(VIEW==='auth'){ renderAuth(); return; }
  if(VIEW==='home'){ renderHome(); return; }
  if(VIEW==='room'){ renderRoom(); return; }
  if(VIEW==='game'){ renderGame(); return; }
}

function renderAuth(){
  left.innerHTML = `<h2>Вход / Регистрация</h2>
  <div class="row"><input id="login" placeholder="Логин (латиница/цифры ._-)" /></div>
  <div class="row"><input id="pass" type="password" placeholder="Пароль (мин. 4 символа)" /></div>
  <div class="row"><button class="btn" onclick="register()"><span>📝</span> Регистрация</button>
  <button class="btn primary" onclick="signin()"><span>🔑</span> Вход</button></div>
  <div class="muted" id="authMsg"></div>`;
  main.innerHTML = `<div class='muted'>Это страница входа. После входа попадёшь на главную.</div>`;
}
async function register(){
  const u=document.getElementById('login').value.trim();
  const p=document.getElementById('pass').value;
  const r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
  const j=await r.json(); document.getElementById('authMsg').textContent = j.status==='ok'?'Регистрация успешна':'Ошибка: '+(j.msg||' ');
}
async function signin(){
  const u=document.getElementById('login').value.trim();
  const p=document.getElementById('pass').value;
  const j=await API('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
  if(j.status==='ok'){
    USER=u; PROFILE=j.profile||{};
    PROFILE.zombie_classes = PROFILE.zombie_classes||['normal'];
    PROFILE.zombie_deck = PROFILE.zombie_deck||['normal'];
    AVAILABLE_ZOMBIES = PROFILE.zombie_classes.slice();
    updateOwnedPlants();
    localStorage.setItem('USER', USER);
    setView('home'); listRooms();
  } else document.getElementById('authMsg').textContent='Ошибка: '+(j.msg||' ');
}
(function restore(){ const u=localStorage.getItem('USER'); if(u){ USER=u; setView('home'); listRooms(); } else { setView('auth'); } })();

function renderHome(){
  left.innerHTML = `<h2>Главная</h2>
    <div class="row"><button class="btn primary" onclick="openModal()"><span>➕</span> Создать игру</button></div>
    <div class="row"><button class="btn" onclick="showLeaderboard()"><span>🏆</span> Топ игроков</button></div>
    <div id="leaders" class="muted"></div>`;
  main.innerHTML = `<div style="width:920px"><h3>Список комнат</h3><div id="rooms"></div></div>`;
  showLeaderboard(); listRooms(); HOME_TIMER=setInterval(listRooms, 2000);
}
async function showLeaderboard(){
  const j=await API('/api/leaderboard');
  if(j.status==='ok'){
    document.getElementById('leaders').innerHTML = j.leaders.map((u,i)=>`${i+1}. <span class="pill" onclick="openProfile('${u.user}')">${u.user}</span> — ${u.score||0}`).join('<br>');
  }
}
async function listRooms(){
  const j=await API('/api/list_rooms'); if(j.status!=='ok') return;
  const wrap=document.getElementById('rooms'); if(!wrap) return;
  wrap.innerHTML = j.rooms.map(r=>{
    const players = r.players.map(p=>`<span class="pill" onclick="openProfile('${p.name}')">${p.name} ${p.ready?'✔️':'❌'}</span>`).join(' ');
    const cap = `${r.players.length}/${r.max_players}`;
    const started = r.started ? '<span class="badge" style="border-color:#fecaca;background:#fee2e2">Идёт</span>' : '<span class="badge" style="border-color:#bbf7d0;background:#dcfce7">Лобби</span>';
    const lock = r.locked ? '🔒' : '🔓';
    return `<div class="room">
      <div><b>${lock} ${r.name}</b> (ID: ${r.room_id}) ${started} <span class="badge">Режим: ${r.mode}</span> <span class="badge">Игроков: ${cap}</span></div>
      <div class="muted" style="margin-top:6px">${players || 'Пока пусто'}</div>
      <div class="row"><button class="btn" onclick="openRoom('${r.room_id}', ${r.locked})"><span>➡️</span> Открыть</button></div>
    </div>`;
  }).join('');
}
function confirmCreate(){
  const mode=document.getElementById('modeSelect').value;
  const mp=parseInt(document.getElementById('maxPlayers').value,10);
  const name=(document.getElementById('roomName').value||'').trim() || 'Без названия';
  const password=(document.getElementById('roomPass').value||'').trim();
  createRoom(name, mode, mp, password);
}
async function createRoom(name='Без названия', mode='coop', max_players=2, password=''){
  if(!USER){ alert('Сначала войдите'); setView('auth'); return; }
  closeModal();
  const j=await API('/api/create_room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:USER,name,mode,max_players,password})});
  if(j.status==='ok'){ ROOM_ID=j.room_id; localStorage.setItem('ROOM_ID', ROOM_ID); socket.emit('join_room',{username:USER, room_id:ROOM_ID, password: password||''}); setView('room'); }
  else { alert('Не удалось создать комнату'); }
}
function openRoom(id, locked){
  if(!USER){ alert('Сначала войдите'); setView('auth'); return; }
  ROOM_ID=id; let password=''; if(locked){ password = prompt('Введите пароль комнаты') || ''; }
  socket.emit('join_room',{username:USER, room_id:ROOM_ID, password}); localStorage.setItem('ROOM_ID', ROOM_ID); setView('room');
}

function renderRoom(){
  left.innerHTML = `<h2>Комната</h2>
    <div id="roomInfo" class="muted"></div>
    <div class="sep"></div>
    <div class="row">
      <button class="btn" onclick="toggleReady()"><span>✅</span> Готов/Не готов</button>
      <button id="startBtn" class="btn primary" onclick="startGame()" disabled><span>🚀</span> Старт</button>
      <button class="btn" onclick="rematch()"><span>🔁</span> Реванш</button>
    </div>
    <div class="row"><button class="btn" onclick="leaveRoom()"><span>⬅️</span> Выйти</button></div>
    <div id="roleControls" class="row"></div>
    <div id="deckLobby" class="row"></div>`;
  main.innerHTML = `<div style="display:flex;gap:16px; width:980px">
    <div style="flex:1">
      <h3>Состав</h3><div id="players"></div><div class="sep"></div><div id="countdown" class="muted"></div>
    </div>
    <div style="width:420px">
      <h3>Чат комнаты</h3>
      <div id="chatBox" style="border:1px solid var(--border);border-radius:12px;height:360px;overflow:auto;background:#fff;padding:8px"></div>
      <div style="display:flex;gap:8px;margin-top:8px"><input id="chatInput" placeholder="Сообщение..." /><button class="btn" onclick="sendChat()"><span>💬</span> Отправить</button></div>
    </div>
  </div>`;
  if(ROOM_CACHE) drawRoomInfo(ROOM_CACHE);
}
function drawRoomInfo(r){
  const info=document.getElementById('roomInfo');
  if(info) info.innerHTML = `Комната: <b>${r.name}</b> (ID: ${r.room_id}) <span class="badge">Режим: ${r.mode}</span> <span class="badge">Игроков: ${r.players.length}/${r.max_players}</span> · Хост: <span class="pill" onclick="openProfile('${r.owner}')">${r.owner}</span>`;
  const playersDiv=document.getElementById('players');
  if(playersDiv){
    const roles=r.roles||{}; const assigned=r.assigned||{};
    playersDiv.innerHTML = r.players.map(p=>{
      const choice=roles[p.name]||'random';
      const final=(assigned && assigned.defender===p.name)?'plant':(assigned && assigned.attacker===p.name)?'zombie':choice;
      const badge = r.mode==='pvp'?` <span class="muted">(${roleIcon(final)})</span>`:'';
      return `<span class="pill" onclick="openProfile('${p.name}')">${p.name} ${p.ready?'✔️':'❌'}${badge}</span>`;
    }).join(' ');
  }
  const startBtn=document.getElementById('startBtn'); if(startBtn){ const allReady = (r.players.length===r.max_players) && r.players.every(p=>p.ready); startBtn.disabled = !(USER===r.owner && allReady); }
  MY_INDEX = Math.max(0, r.players.map(p=>p.name).indexOf(USER));
  if(r.mode==='pvp' && r.assigned){
    if(r.assigned.defender===USER) MY_INDEX=0;
    else if(r.assigned.attacker===USER) MY_INDEX=1;
  }
  if(r.started && VIEW!=='game'){ setView('game'); }
  if(r.mode==='pvp'){ buildRoleControls(r); buildLobbyDeck(r, true); }
}

function roleIcon(code){
  if(code==='plant') return '🌿';
  if(code==='zombie') return '🧟';
  return '🎲';
}

function buildRoleControls(r){
  const box=document.getElementById('roleControls');
  if(!box){ return; }
  if(r.mode!=='pvp'){ box.innerHTML=''; return; }
  const role=(r.roles||{})[USER]||'random';
  const disabled = !!r.started;
  const btn=(code,label)=>`<button class="btn${role===code?' primary':''}" ${disabled?'disabled':''} onclick="selectRole('${code}')">${label}</button>`;
  box.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px">
    <div class="muted">Выбор роли</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${btn('plant','🌿 Растения')}
      ${btn('zombie','🧟 Зомби')}
      ${btn('random','🎲 Рандом')}
    </div>
  </div>`;
}

function selectRole(role){ if(!ROOM_ID) return; socket.emit('select_role',{room_id:ROOM_ID, username:USER, role}); }

function buildLobbyDeck(r, reset=false){
  const wrap=document.getElementById('deckLobby');
  if(!wrap){ return; }
  if(r.mode!=='pvp'){ wrap.innerHTML=''; return; }
  const available=(PROFILE?.zombie_classes||['normal']).filter(z=>ZOMBIE_LIBRARY[z]);
  AVAILABLE_ZOMBIES=available.slice();
  const fromRoom=(r.zombie_decks&&r.zombie_decks[USER]&&r.zombie_decks[USER].length)?r.zombie_decks[USER]:null;
  const base=(fromRoom || PROFILE?.zombie_deck || ['normal']).slice(0,6);
  if(reset){
    if(base.join(',')!==LOBBY_Z_DECK.join(',')){
      LOBBY_Z_DECK=base.slice();
    }
  } else if(!LOBBY_Z_DECK.length){
    LOBBY_Z_DECK=base.slice();
  } else {
    LOBBY_Z_DECK=LOBBY_Z_DECK.filter(z=>available.includes(z));
  }
  const cards = available.map(z=>{
    const info=ZOMBIE_LIBRARY[z];
    const selected=LOBBY_Z_DECK.includes(z);
    const cls=selected?' selected':'';
    return `<button type="button" class="card${cls}" data-zombie="${z}">
      <div class="icon">${info?.icon||'🧟'}</div>
      <div><div>${info?.name||z}</div><div class="muted">${info?.cost||0} очк.</div></div>
    </button>`;
  }).join('');
  const message = LOBBY_DECK_NOTICE;
  LOBBY_DECK_NOTICE='';
  wrap.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px">
    <div><b>Дека зомби</b></div>
    <div class="muted">Выберите до 6 классов для PvP. Выбрано: ${LOBBY_Z_DECK.length}/6.</div>
    <div id="deckMsg" class="muted" style="min-height:18px;color:${message?'#ef4444':'var(--muted)'}">${message||''}</div>
    <div id="deckCards" class="grid">${cards || '<div class="muted">Нет доступных классов</div>'}</div>
    <div><button class="btn primary" onclick="saveDeck()" ${available.length?'' :'disabled'}>Сохранить деку</button></div>
  </div>`;
  const grid=document.getElementById('deckCards');
  if(grid){
    grid.onclick=(ev)=>{
      const btn=ev.target.closest('button.card');
      if(!btn) return;
      const code=btn.getAttribute('data-zombie');
      if(!AVAILABLE_ZOMBIES.includes(code)) return;
      const idx=LOBBY_Z_DECK.indexOf(code);
      if(idx>=0){
        LOBBY_Z_DECK.splice(idx,1);
      }else{
        if(LOBBY_Z_DECK.length>=6){
          LOBBY_DECK_NOTICE='Можно выбрать не более 6 классов.';
          buildLobbyDeck(r);
          return;
        }
        LOBBY_Z_DECK.push(code);
      }
      buildLobbyDeck(r);
    };
  }
}

function saveDeck(){ if(!ROOM_ID) return; socket.emit('set_zombie_deck',{room_id:ROOM_ID, username:USER, deck:LOBBY_Z_DECK}); }
function toggleReady(){ socket.emit('toggle_ready',{room_id:ROOM_ID, username:USER}); }
function startGame(){ socket.emit('start',{room_id:ROOM_ID, username:USER}); }
function rematch(){ socket.emit('rejoin',{room_id:ROOM_ID, username:USER}); }
function sendChat(){ const t=document.getElementById('chatInput').value.trim(); if(!t) return; socket.emit('chat',{room_id:ROOM_ID, username:USER, text:t}); document.getElementById('chatInput').value=''; }
function leaveRoom(){ socket.emit('leave_room',{room_id:ROOM_ID, username:USER}); ROOM_ID=null; localStorage.removeItem('ROOM_ID'); setView('home'); listRooms(); stopCountdownTicker(); }

function renderGame(){
  const mode=ROOM_CACHE?.mode||'coop';
  const assigned=ROOM_CACHE?.assigned;
  let hint='defender';
  if(mode==='pvp' && assigned){
    if(assigned.attacker===USER) hint='attacker';
    else if(assigned.defender===USER) hint='defender';
  }
  const role=(GAME_STATE?.role)||hint;
  MY_ROLE=role;
  if(mode==='pvp' && role==='attacker') renderZombieGame();
  else renderDefenderGame(mode==='pvp');
}

function renderDefenderGame(isPvP){
  CURRENT_ROLE_UI='defender';
  left.innerHTML = `<h2>Идёт бой</h2>
    <div id="hud" class="muted"></div>
    <div class="sep"></div>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <b>Инвентарь</b> <div><button class="btn" onclick="prevPage()">&lt;</button> <span class="muted" id="pageLbl"></span> <button class="btn" onclick="nextPage()">&gt;</button></div>
    </div>
    <div id="inventory" class="grid"></div>
    ${isPvP?'':`<div class="row" id="giveRow" style="display:flex;gap:6px;align-items:center">
      <span class="muted">Передать солнце напарнику:</span>
      <input id="giveAmt" style="width:90px" type="number" min="1" step="10" value="50"/>
      <button class="btn" onclick="giveSun()">Передать</button>
    </div>`}
    <div class="sep"></div>
    ${isPvP?'':`<div id="nextWrap"><button id="nextWaveBtn" class="btn" onclick="nextWave()" disabled>⏭ Далее (хост)</button></div><div class="sep"></div>`}
    <button class="btn" onclick="leaveRoom()">Выйти в лобби</button>`;
  main.innerHTML = `<div>
    <canvas id="game" width="940" height="480"></canvas>
    <div id="status" class="muted" style="margin-top:8px"></div>
  </div>`;
  buildInventory();
  const cvs=document.getElementById('game');
  cvs.addEventListener('mousemove', (e)=>{
    const rect=cvs.getBoundingClientRect(); const x=e.clientX-rect.left, y=e.clientY-rect.top;
    if(x>9*80){ HOVER_CELL=null; redraw(); return; }
    HOVER_CELL={c:Math.floor(x/80), r:Math.floor(y/80)}; redraw();
  });
  cvs.addEventListener('mouseleave', ()=>{ HOVER_CELL=null; redraw(); });
  cvs.addEventListener('click', (e)=>{
    if(!ROOM_ID||!GAME_STATE) return;
    const rect=cvs.getBoundingClientRect(); const x=e.clientX-rect.left, y=e.clientY-rect.top;
    if(x>9*80) return; const c=Math.floor(x/80), r=Math.floor(y/80);
    const p=PLANTS.find(x=>x.code===CURRENT); if(!p) return;
    if(SUN_NOW < p.cost){ setStatus('Недостаточно солнца'); return; }
    if(!canPlace(r,c)){ setStatus('Недоступная клетка'); return; }
    PENDING_ACTIONS.push({type:'place', plant:CURRENT, cost:p.cost});
    socket.emit('place_plant',{room_id:ROOM_ID,username:USER,row:r,col:c,ptype:CURRENT});
  });
  redraw();
}

function renderZombieGame(){
  CURRENT_ROLE_UI='attacker';
  left.innerHTML = `<h2>Идёт бой</h2>
    <div class="muted">Очки: <span id="zPoints">0</span></div>
    <div class="muted">Волна: <span id="zWave">-</span></div>
    <div id="waveCd" class="muted"></div>
    <div class="sep"></div>
    <div><b>Дека</b></div>
    <div id="zDeck" class="grid"></div>
    <div class="row"><button id="waveBtn" class="btn" onclick="triggerWave()">🚨 Запустить волну</button></div>
    <div class="sep"></div>
    <button class="btn" onclick="leaveRoom()">Выйти в лобби</button>`;
  main.innerHTML = `<div>
    <canvas id="game" width="940" height="480"></canvas>
    <div id="status" class="muted" style="margin-top:8px"></div>
  </div>`;
  buildZombieDeckUI();
  const cvs=document.getElementById('game');
  cvs.addEventListener('mousemove', (e)=>{
    const rect=cvs.getBoundingClientRect(); const x=e.clientX-rect.left, y=e.clientY-rect.top;
    if(x>9*80){ HOVER_CELL=null; redraw(); return; }
    HOVER_CELL={c:Math.floor(x/80), r:Math.floor(y/80)}; redraw();
  });
  cvs.addEventListener('mouseleave', ()=>{ HOVER_CELL=null; redraw(); });
  cvs.addEventListener('click', (e)=>{
    if(!ROOM_ID||!GAME_STATE) return;
    const rect=cvs.getBoundingClientRect(); const x=e.clientX-rect.left, y=e.clientY-rect.top;
    if(x>9*80) return; const r=Math.floor(y/80);
    if(!CURRENT_Z_CARD){ setStatus('Выберите зомби'); return; }
    const info=ZOMBIE_LIBRARY[CURRENT_Z_CARD];
    if(!info) return;
    if(ZOMBIE_POINTS < info.cost){ setStatus('Недостаточно очков'); return; }
    if((ZOMBIE_COOLDOWNS[CURRENT_Z_CARD]||0)>0){ setStatus('Ожидайте перезарядку'); return; }
    socket.emit('spawn_zombie_manual',{room_id:ROOM_ID, username:USER, ztype:CURRENT_Z_CARD, row:r});
  });
  redraw();
}

function buildZombieDeckUI(){
  const wrap=document.getElementById('zDeck');
  if(!wrap){ return; }
  const deck=(GAME_STATE?.zombie_deck||PROFILE?.zombie_deck||[]).filter(z=>ZOMBIE_LIBRARY[z]);
  if(deck.length){ ZOMBIE_DECK=deck.slice(); }
  if(!ZOMBIE_DECK.length) ZOMBIE_DECK=['normal'];
  if(!CURRENT_Z_CARD || !ZOMBIE_DECK.includes(CURRENT_Z_CARD)) CURRENT_Z_CARD=ZOMBIE_DECK[0];
  wrap.innerHTML = ZOMBIE_DECK.map(z=>{
    const info=ZOMBIE_LIBRARY[z]||{};
    const cd=ZOMBIE_COOLDOWNS[z]||0;
    const ready = cd<=0 && ZOMBIE_POINTS >= (info.cost||0);
    const cls=`card${CURRENT_Z_CARD===z?' selected':''}${ready?'':' disabled'}`;
    const label = cd>0 ? `${cd.toFixed(1)}s` : `${info.cost||0}`;
    return `<button type="button" class="${cls}" data-z="${z}"><div class="icon">${info.icon||'🧟'}</div><div><div>${info.name||z}</div><div class="muted">${label}</div></div></button>`;
  }).join('');
  wrap.onclick=(ev)=>{
    const btn=ev.target.closest('button'); if(!btn) return;
    const code=btn.getAttribute('data-z'); if(!ZOMBIE_DECK.includes(code)) return;
    CURRENT_Z_CARD=code; buildZombieDeckUI();
  };
  updateZombieHUD();
}

function updateZombieHUD(){
  const pts=document.getElementById('zPoints'); if(pts) pts.textContent=Math.floor(ZOMBIE_POINTS||0);
  const wave=document.getElementById('zWave'); if(wave && GAME_STATE) wave.textContent=GAME_STATE.wave_number||1;
  const cd=document.getElementById('waveCd');
  if(cd){
    if(GAME_STATE && !GAME_STATE.wave_ready){ cd.textContent=`Перезарядка волны: ${Math.ceil(GAME_STATE.wave_cd||0)}c`; }
    else cd.textContent='';
  }
  const btn=document.getElementById('waveBtn');
  if(btn){ btn.disabled=!(GAME_STATE && GAME_STATE.wave_ready); }
}

function triggerWave(){ if(!ROOM_ID) return; socket.emit('trigger_wave',{room_id:ROOM_ID, username:USER}); }
function pageCount(){ return Math.max(1, Math.ceil(PLANTS.length/24)); }
function buildInventory(){
  const inv=document.getElementById('inventory'); if(!inv) return;
  const pageLbl=document.getElementById('pageLbl'); if(pageLbl) pageLbl.textContent = `Стр. ${INV_PAGE+1}/${pageCount()}`;
  const start=INV_PAGE*24, end=Math.min(PLANTS.length, start+24);
  const items=PLANTS.slice(start,end);
  inv.innerHTML = items.map((p)=>{
    const lack = (SUN_NOW < p.cost);
    return `<button type="button" class="card${lack?' disabled':''}" data-code="${p.code}">
      <div class="icon">${p.icon}</div>
      <div><div>${p.name}</div><div class="muted">${p.key}) ${p.cost}</div></div>
    </button>`;
  }).join('');
  inv.onclick = (e)=>{
    const btn = e.target.closest('.card'); if(!btn) return; const code=btn.getAttribute('data-code');
    const p=PLANTS.find(x=>x.code===code); if(!p) return; if(SUN_NOW < p.cost) return; CURRENT=code; highlightInventory();
  };
  highlightInventory();
}
function prevPage(){ INV_PAGE = (INV_PAGE-1+pageCount())%pageCount(); buildInventory(); }
function nextPage(){ INV_PAGE = (INV_PAGE+1)%pageCount(); buildInventory(); }
function highlightInventory(){
  const nodes=Array.from(document.querySelectorAll('#inventory .card'));
  nodes.forEach((n)=>{
    const code=n.getAttribute('data-code');
    n.style.outline = (code===CURRENT) ? '2px solid var(--accent)' : 'none';
    const p=PLANTS.find(x=>x.code===code);
    if(p){ if(SUN_NOW < p.cost) n.classList.add('disabled'); else n.classList.remove('disabled'); }
  });
}
window.addEventListener('keydown', (e)=>{
  if(e.key==='[') prevPage(); else if(e.key===']') nextPage();
  const p=PLANTS.find(x=>x.key===e.key);
  if(p && SUN_NOW>=p.cost){ CURRENT=p.code; highlightInventory(); }
});
function nextWave(){ const btn=document.getElementById('nextWaveBtn'); if(btn) btn.disabled=true; socket.emit('next_wave',{room_id:ROOM_ID}); }
function setStatus(t){ const s=document.getElementById('status'); if(s){ s.textContent=t; setTimeout(()=>{ if(s.textContent===t) s.textContent=''; },1500);} }
function giveSun(){
  if(!ROOM_CACHE) return;
  const mate = ROOM_CACHE.players.map(p=>p.name).find(n=>n!==USER);
  if(!mate) { setStatus('Нет напарника'); return; }
  const amt = parseFloat(document.getElementById('giveAmt').value||'0'); if(amt<=0){ setStatus('Неверная сумма'); return; }
  if(SUN_NOW < amt){ setStatus('Не хватает солнца'); return; }
  socket.emit('transfer_sun',{room_id:ROOM_ID, from:USER, to:mate, amount:amt});
}

function redraw(){
  if(MY_ROLE==='attacker') redrawZombie();
  else redrawDefender();
}

function redrawDefender(){
  const cvs=document.getElementById('game'); if(!cvs||!GAME_STATE) return;
  const ctx=cvs.getContext('2d');
  ctx.clearRect(0,0,cvs.width,cvs.height);
  drawGrid(ctx);
  const st=GAME_STATE;
  // weather overlay
  if(st.weather==='fog'){
    ctx.fillStyle='rgba(148,163,184,0.25)'; ctx.fillRect(0,0,9*80,6*80);
  } else if(st.weather==='rain'){
    // simple rain streaks
    ctx.fillStyle='rgba(59,130,246,0.08)'; ctx.fillRect(0,0,9*80,6*80);
  }
  for(let r=0;r<6;r++){
    for(let c=0;c<9;c++){
      const cell=st.grid[r][c]; if(!cell) continue;
      const x=c*80+8,y=r*80+8,w=80-16;
      const colors={sunflower:'#ffd700',peashooter:'#4ade80',wallnut:'#b08968',freeze:'#7dd3fc',bomb:'#ef4444', icepea:'#60a5fa', potato:'#a8a29e', spikeweed:'#16a34a', tallnut:'#92400e', cabbage:'#84cc16'};
      ctx.fillStyle=colors[cell.type]||'#000'; ctx.fillRect(x,y,w,w);
      ctx.fillStyle='#065f46'; const maxhp=(cell.type==='tallnut'?1500:(cell.type==='wallnut'?600:300)); const hpw=Math.max(0,Math.min(1,cell.hp/maxhp))*w; ctx.fillRect(x,y-6,hpw,5);
    }
  }
  ctx.fillStyle='#111'; st.bullets.forEach(b=>{ ctx.beginPath(); ctx.arc(b.x, b.row*80+40, 5, 0, Math.PI*2); ctx.fill(); });
  st.zombies.forEach(z=>{ 
    const col = z.type==='cone' ? '#7c3aed' : z.type==='bucket' ? '#1e40af' : z.type==='fast' ? '#16a34a' : z.type==='kamikaze' ? '#ef4444' : z.type==='cart' ? '#ea580c' : z.type==='screamer' ? '#22d3ee' : z.type==='shield' ? '#475569' : z.type==='regen' ? '#10b981' : z.type==='boss' ? '#0f172a' : z.type==='air' ? '#60a5fa' : '#b91c1c';
    ctx.fillStyle=col; ctx.fillRect(z.x-20, z.row*80+18, 40, 44);
    if(z.shield && z.shield>0){ ctx.fillStyle='#94a3b8'; ctx.fillRect(z.x-22, z.row*80+14, 44, 6); }
  });
  ctx.fillStyle='#111'; ctx.font='16px Inter,system-ui';
  ctx.fillText('Пользователь: '+(USER||'-'), 9*80+10, 24);
  ctx.fillText('Солнце: '+Math.floor(st.sun), 9*80+10, 48);
  ctx.fillText('Монеты: '+(st.coins||0), 9*80+10, 72);
  const zoneLabel = (ROOM_CACHE?.mode)==='pvp' ? 'все' : (MY_INDEX===0?'0-2':'3-5');
  ctx.fillText('Зона: '+zoneLabel, 9*80+10, 96);
  ctx.fillText('Волна: '+st.wave_number+'  Погода: '+st.weather, 9*80+10, 120);
  if(st.await_next){
    const btn=document.getElementById('nextWaveBtn');
    if(btn){ let can=false; if(ROOM_CACHE && ROOM_CACHE.owner){ can=(ROOM_CACHE.owner===USER); } else { can=true; } btn.disabled=!can; }
    const s=document.getElementById('status'); if(s && !s.textContent) s.textContent='Волна очищена! Ждём хоста «Далее».';
  } else { const btn=document.getElementById('nextWaveBtn'); if(btn) btn.disabled=true; }
  if(HOVER_CELL){
    const ok = canPlace(HOVER_CELL.r, HOVER_CELL.c);
    ctx.strokeStyle = ok ? '#16a34a' : '#ef4444'; ctx.lineWidth=3; ctx.strokeRect(HOVER_CELL.c*80+2, HOVER_CELL.r*80+2, 80-4, 80-4);
  }
  highlightInventory();
  if(!st.running){
    ctx.font='26px Inter';
    const txt = st.outcome==='win'?'ПОБЕДА!':'ПОРАЖЕНИЕ';
    ctx.fillStyle= st.outcome==='win' ? '#16a34a' : '#ef4444';
    ctx.fillText(txt, 9*80/2-80, (6*80)/2);
  }
}

function redrawZombie(){
  const cvs=document.getElementById('game'); if(!cvs||!GAME_STATE) return;
  const ctx=cvs.getContext('2d');
  ctx.clearRect(0,0,cvs.width,cvs.height);
  drawGrid(ctx);
  const st=GAME_STATE;
  if(st.weather==='fog'){
    ctx.fillStyle='rgba(148,163,184,0.25)'; ctx.fillRect(0,0,9*80,6*80);
  } else if(st.weather==='rain'){
    ctx.fillStyle='rgba(59,130,246,0.08)'; ctx.fillRect(0,0,9*80,6*80);
  }
  for(let r=0;r<6;r++){
    for(let c=0;c<9;c++){
      const cell=st.grid[r][c]; if(!cell) continue;
      const x=c*80+8,y=r*80+8,w=80-16;
      const colors={sunflower:'#ffd700',peashooter:'#4ade80',wallnut:'#b08968',freeze:'#7dd3fc',bomb:'#ef4444', icepea:'#60a5fa', potato:'#a8a29e', spikeweed:'#16a34a', tallnut:'#92400e', cabbage:'#84cc16'};
      ctx.fillStyle=colors[cell.type]||'#000'; ctx.fillRect(x,y,w,w);
      ctx.fillStyle='#065f46'; const maxhp=(cell.type==='tallnut'?1500:(cell.type==='wallnut'?600:300)); const hpw=Math.max(0,Math.min(1,cell.hp/maxhp))*w; ctx.fillRect(x,y-6,hpw,5);
    }
  }
  ctx.fillStyle='#111'; st.bullets.forEach(b=>{ ctx.beginPath(); ctx.arc(b.x, b.row*80+40, 5, 0, Math.PI*2); ctx.fill(); });
  st.zombies.forEach(z=>{
    const col = z.type==='cone' ? '#7c3aed' : z.type==='bucket' ? '#1e40af' : z.type==='fast' ? '#16a34a' : z.type==='kamikaze'? '#ef4444' : z.type==='cart' ? '#ea580c' : z.type==='screamer' ? '#22d3ee' : z.type==='shield' ? '#475569' : z.type==='regen' ? '#10b981' : z.type==='boss' ? '#0f172a' : z.type==='air' ? '#60a5fa' : '#b91c1c';
    ctx.fillStyle=col; ctx.fillRect(z.x-20, z.row*80+18, 40, 44);
    if(z.shield && z.shield>0){ ctx.fillStyle='#94a3b8'; ctx.fillRect(z.x-22, z.row*80+14, 44, 6); }
  });
  ctx.fillStyle='#111'; ctx.font='16px Inter,system-ui';
  ctx.fillText('Очки: '+Math.floor(ZOMBIE_POINTS||0), 9*80+10, 24);
  ctx.fillText('Волна: '+(st.wave_number||1), 9*80+10, 48);
  ctx.fillText('Погода: '+st.weather, 9*80+10, 72);
  if(HOVER_CELL){
    ctx.strokeStyle='#111'; ctx.lineWidth=2; ctx.strokeRect(HOVER_CELL.c*80+2, HOVER_CELL.r*80+2, 80-4, 80-4);
  }
  if(!st.running){
    ctx.font='26px Inter';
    const txt = st.outcome==='win'?'ПОБЕДА!':'ПОРАЖЕНИЕ';
    ctx.fillStyle= st.outcome==='win' ? '#16a34a' : '#ef4444';
    ctx.fillText(txt, 9*80/2-80, (6*80)/2);
  }
  updateZombieHUD();
}

function canPlace(r,c){
  if(!GAME_STATE) return false;
  if(GAME_STATE.grid[r][c]) return false;
  if((ROOM_CACHE?.mode)==='pvp'){ return MY_ROLE!=='attacker'; }
  const allowed = (MY_INDEX===0) ? (r>=0 && r<3) : (r>=3 && r<6);
  return allowed;
}
function drawGrid(ctx){
  const CELL=80;
  const isPvP=(ROOM_CACHE?.mode)==='pvp';
  for(let r=0;r<6;r++){
    for(let c=0;c<9;c++){
      let base,alt,stroke;
      if(isPvP){
        base='#f4f1de';
        alt='#ece5ce';
        stroke='#d4cbb3';
      } else {
        base=(r<3)?'#d9fbe5':'#e9f5ff';
        alt=(r<3)?'#c9f2d7':'#dcefff';
        stroke='#a7d3a7';
      }
      ctx.fillStyle=(r+c)%2===0?base:alt;
      ctx.fillRect(c*CELL,r*CELL,CELL,CELL);
      ctx.strokeStyle=stroke; ctx.strokeRect(c*CELL,r*CELL,CELL,CELL);
    }
  }
  if(!isPvP){
    ctx.fillStyle='#94a3b8'; ctx.fillRect(0, 3*80-2, 9*80, 4);
  }
  if(!isPvP && MY_ROLE!=='attacker'){
    ctx.fillStyle='rgba(96,165,250,0.15)';
    if(MY_INDEX===0){ ctx.fillRect(0,0,9*80,3*80); }
    else { ctx.fillRect(0,3*80,9*80,3*80); }
  }
  ctx.fillStyle='#f5f5f5'; ctx.fillRect(9*80,0,220,6*80);
}
