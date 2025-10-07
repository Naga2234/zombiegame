const API = (p,o={})=>fetch(p,o).then(r=>r.json());
const socket = io({autoConnect:true, transports:['websocket','polling']});
let USER=null, PROFILE=null, ROOM_ID=null, MY_INDEX=0, VIEW='auth', CURRENT='peashooter';
let GAME_STATE=null, SUN_NOW=999, HOME_TIMER=null, HOVER_CELL=null;
let ROOM_CACHE=null, COUNTDOWN_TIMER=null, COUNTDOWN_LEFT=0;
let GAME_SUMMARY=null;
let INV_PAGE=0;
let PENDING_ACTIONS=[];
let MY_ROLE='defender';
let CURRENT_ROLE_UI='';
let CURRENT_Z_CARD=null;
let ZOMBIE_POINTS=0;
let ZOMBIE_DECK=[];
let ZOMBIE_COOLDOWNS={};
let SHOP_TAB='plants';
let SHOP_DATA=null;
let PLANT_COOLDOWN_UNTIL=0;
let USERNAME_CHECK_STATE={available:false,msg:'Введите логин',tone:'muted',pending:false};
let USERNAME_CHECK_COUNTER=0;
let PROFILE_INV_TAB='plants';
let SELL_CONFIRMATION=null;

const NICKNAME_ADJECTIVES=[
  'Swift','Brave','Lucky','Frosty','Cosmic','Mighty','Sunny','Shadow','Electric','Silent'
];
const NICKNAME_NOUNS=[
  'Pea','Runner','Knight','Guardian','Sprout','Ranger','Sun','Dream','Zombie','Bolt'
];

const DEFAULT_OWNED = ['peashooter','sunflower','wallnut'];
const DEFAULT_ZOMBIE_CLASSES = ['normal','cone','bucket'];
const DEFAULT_ZOMBIE_DECK = DEFAULT_ZOMBIE_CLASSES.slice();

const PLANT_HP_HINT={
  sunflower:90,
  peashooter:100,
  wallnut:450,
  freeze:130,
  bomb:95,
  icepea:100,
  potato:55,
  spikeweed:140,
  tallnut:1100,
  cabbage:100,
};

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
const PLANT_COST_MAP = PLANTS_ALL.reduce((acc, item)=>{ acc[item.code]=item.cost; return acc; }, {});
const PLANT_META_MAP = PLANTS_ALL.reduce((acc, item)=>{ acc[item.code]=item; return acc; }, {});
const PLANT_ORDER_INDEX = PLANTS_ALL.reduce((acc, item, idx)=>{ acc[item.code]=idx; return acc; }, {});

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

const RESOURCE_STORE_ITEMS=[
  {code:'fertilizer',name:'Удобрение',icon:'🧪',amount:5,description:'Ускоряет рост растений'},
  {code:'sun_boost',name:'Солнечный заряд',icon:'☀️',amount:15,description:'Доп. запас солнечной энергии'},
  {code:'repair_kit',name:'Ремкомплект',icon:'🧰',amount:3,description:'Материалы для укрепления защит'},
];
const RESOURCE_DROP_ITEMS=[
  {code:'sun_crystal',name:'Солнечные кристаллы',icon:'🌞'},
  {code:'seed_bundle',name:'Семена',icon:'🌾'},
  {code:'power_leaf',name:'Листья силы',icon:'🍃'},
  {code:'pollen',name:'Цветочная пыльца',icon:'🌸'},
  {code:'root_core',name:'Корень-укрепитель',icon:'🌱'},
  {code:'dew_drop',name:'Капли росы',icon:'💧'},
  {code:'bone',name:'Кости',icon:'🦴'},
  {code:'brain_fragment',name:'Фрагменты мозга',icon:'🧠'},
  {code:'rust_metal',name:'Ржавый металл',icon:'⚙️'},
  {code:'skull_fragment',name:'Черепки',icon:'💀'},
  {code:'rotten_fabric',name:'Гнилая ткань',icon:'🕸️'},
  {code:'powder_shard',name:'Осколки пороха',icon:'💥'},
  {code:'black_slime',name:'Чёрная слизь',icon:'🩸'},
  {code:'hell_coal',name:'Адский уголь',icon:'🔥'},
  {code:'ice_shard',name:'Ледяной осколок',icon:'❄️'},
  {code:'zombie_eye',name:'Глаз зомби',icon:'👁️'},
];
const RESOURCE_ITEMS=[...RESOURCE_STORE_ITEMS, ...RESOURCE_DROP_ITEMS];
const RESOURCE_META_MAP = RESOURCE_ITEMS.reduce((acc,item)=>{acc[item.code]=item; return acc;},{});

const left = document.getElementById('leftPanel');
const main = document.getElementById('mainPanel');
const navbar = document.getElementById('navbar');
const modal = document.getElementById('createModal');
const profileModal = document.getElementById('profileModal');
const shopModal = document.getElementById('shopModal');
const craftModal = document.getElementById('craftModal');

function debounce(fn, delay=300){
  let timer;
  return function(...args){
    clearTimeout(timer);
    timer=setTimeout(()=>fn.apply(this,args), delay);
  };
}

function mergeDefaultZombieClasses(list){
  const arr = Array.isArray(list) ? list : [];
  const seen = new Set();
  const merged = [];
  [...DEFAULT_ZOMBIE_CLASSES, ...arr].forEach(code=>{
    if(ZOMBIE_LIBRARY[code] && !seen.has(code)){
      seen.add(code);
      merged.push(code);
    }
  });
  return merged;
}

function normalizeZombieDeckList(deck, available){
  const availSet = new Set(available);
  const arr = Array.isArray(deck) ? deck : [];
  const result = [];
  arr.forEach(code=>{
    if(availSet.has(code) && ZOMBIE_LIBRARY[code] && !result.includes(code)){
      result.push(code);
    }
  });
  if(!result.length){
    DEFAULT_ZOMBIE_DECK.forEach(code=>{
      if(availSet.has(code) && !result.includes(code) && ZOMBIE_LIBRARY[code]){
        result.push(code);
      }
    });
  } else {
    DEFAULT_ZOMBIE_DECK.forEach(code=>{
      if(result.length>=6) return;
      if(availSet.has(code) && !result.includes(code) && ZOMBIE_LIBRARY[code]){
        result.push(code);
      }
    });
  }
  return result.slice(0,6);
}

function applyZombieDefaults(profile){
  if(!profile) return;
  profile.zombie_classes = mergeDefaultZombieClasses(profile.zombie_classes);
  profile.zombie_deck = normalizeZombieDeckList(profile.zombie_deck, profile.zombie_classes);
}

function arraysEqual(a=[], b=[]){
  if(!Array.isArray(a) || !Array.isArray(b) || a.length!==b.length) return false;
  for(let i=0;i<a.length;i++){ if(a[i]!==b[i]) return false; }
  return true;
}

function cooldownsEqual(a={}, b={}){
  const mapA=a||{}; const mapB=b||{};
  const keysA=Object.keys(mapA); const keysB=Object.keys(mapB);
  if(keysA.length!==keysB.length) return false;
  for(const key of keysA){
    const va=Number(mapA[key])||0; const vb=Number(mapB[key])||0;
    if(Math.abs(va-vb) > 0.0001) return false;
  }
  return true;
}

function formatDuration(seconds){
  const value=Number(seconds);
  if(!Number.isFinite(value) || value < 0){
    return '—';
  }
  const total=Math.floor(value);
  const minutes=Math.floor(total/60);
  const secs=total%60;
  return `${minutes}:${secs.toString().padStart(2,'0')}`;
}

function safeStatNumber(value){
  const num=Number(value);
  if(!Number.isFinite(num)) return 0;
  return Math.max(0, Math.round(num));
}

function summaryOutcomeMeta(outcome){
  const code=String(outcome||'').toLowerCase();
  if(code==='win'){
    return {emoji:'🏆', title:'Победа', background:'linear-gradient(135deg,#bbf7d0,#86efac)', text:'#166534'};
  }
  if(code==='lose'){
    return {emoji:'💀', title:'Поражение', background:'linear-gradient(135deg,#fecaca,#fca5a5)', text:'#7f1d1d'};
  }
  if(code==='draw'){
    return {emoji:'🤝', title:'Ничья', background:'linear-gradient(135deg,#fde68a,#fcd34d)', text:'#92400e'};
  }
  return {emoji:'🎮', title:'Матч завершён', background:'linear-gradient(135deg,#dbeafe,#bfdbfe)', text:'#1e3a8a'};
}

function collectSummaryPlayers(data){
  const payload=data||{};
  const base=Array.isArray(payload.players)? payload.players.slice():[];
  const seen=new Set(base);
  const stats=payload.stats&&typeof payload.stats==='object'?payload.stats:{};
  ['kills','coins','plants','destroyed','resources'].forEach(key=>{
    const section=stats[key];
    if(section && typeof section==='object'){
      Object.keys(section).forEach(name=>{
        if(!seen.has(name)){
          seen.add(name);
          base.push(name);
        }
      });
    }
  });
  return base;
}

function formatModeLabel(mode){
  const code=String(mode||'').toLowerCase();
  if(code==='pvp') return 'PvP';
  if(code==='coop') return 'Coop';
  if(code==='survival') return 'Survival';
  return mode||'—';
}

function md5(s){return CryptoJS.MD5(s.toLowerCase().trim()).toString()}
function avatarUrl(name){ return `https://www.gravatar.com/avatar/${md5(name)}?d=identicon`; }

function setView(v){
  VIEW=v;
  if(v==='game'){ GAME_SUMMARY=null; }
  if(HOME_TIMER){clearInterval(HOME_TIMER); HOME_TIMER=null;}
  render();
}
function handleCreateModalKeydown(event){
  if(event.key==='Escape'){
    event.preventDefault();
    closeModal();
  }
}

function handleCreateModalPointerDown(event){
  if(event.target===modal || (event.target && event.target.classList && event.target.classList.contains('modal__content'))){
    closeModal();
  }
}

function openModal(){
  if(!modal) return;
  modal.style.display='flex';
  document.addEventListener('keydown', handleCreateModalKeydown);
  modal.addEventListener('pointerdown', handleCreateModalPointerDown);
  const roomInput=document.getElementById('roomName');
  if(roomInput && typeof roomInput.focus==='function'){
    roomInput.focus();
  }
}
function closeModal(){
  if(!modal) return;
  modal.style.display='none';
  document.removeEventListener('keydown', handleCreateModalKeydown);
  modal.removeEventListener('pointerdown', handleCreateModalPointerDown);
}

function isProfileModalOpen(){
  return profileModal && profileModal.style.display==='flex';
}

function renderProfileInventory(){
  if(!PROFILE || !isProfileModalOpen()) return;
  const listEl=document.getElementById('profileInventoryList');
  if(!listEl) return;
  const plantBtn=document.getElementById('profileTabPlants');
  const zombieBtn=document.getElementById('profileTabZombies');
  const resourceBtn=document.getElementById('profileTabResources');
  if(plantBtn){ plantBtn.classList.toggle('primary', PROFILE_INV_TAB==='plants'); }
  if(zombieBtn){ zombieBtn.classList.toggle('primary', PROFILE_INV_TAB==='zombies'); }
  if(resourceBtn){ resourceBtn.classList.toggle('primary', PROFILE_INV_TAB==='resources'); }
  const ownedPlantsRaw = Array.isArray(PROFILE.owned) ? PROFILE.owned : [];
  const plantSet = new Set([...DEFAULT_OWNED, ...ownedPlantsRaw]);
  const plantItems = Array.from(plantSet).map(code=>{
    const meta = PLANT_META_MAP[code] || {};
    return {
      code,
      name: meta.name || code,
      icon: meta.icon || '🌿',
      cost: typeof meta.cost==='number' ? meta.cost : null,
    };
  }).sort((a,b)=>{
    const ai = Number.isInteger(PLANT_ORDER_INDEX[a.code]) ? PLANT_ORDER_INDEX[a.code] : Infinity;
    const bi = Number.isInteger(PLANT_ORDER_INDEX[b.code]) ? PLANT_ORDER_INDEX[b.code] : Infinity;
    if(ai===bi){ return a.name.localeCompare(b.name,'ru'); }
    return ai-bi;
  });
  const zombieCodes = Array.isArray(PROFILE.zombie_classes) ? PROFILE.zombie_classes : [];
  const zombieItems = zombieCodes.filter(code=>ZOMBIE_LIBRARY[code]).map(code=>{
    const meta = ZOMBIE_LIBRARY[code];
    return {
      code,
      name: meta.name || code,
      icon: meta.icon || '🧟',
      cost: typeof meta.cost==='number' ? meta.cost : null,
      cooldown: typeof meta.cooldown==='number' ? meta.cooldown : null,
    };
  });
  const resourceCounts = PROFILE && PROFILE.resources && typeof PROFILE.resources==='object' ? PROFILE.resources : {};
  const resourceItems = RESOURCE_ITEMS.map(item=>({
    ...item,
    quantity: Number(resourceCounts[item.code])||0,
  })).filter(item=>item.quantity>0);
  const prettyName=(code='')=>code.replace(/_/g,' ').replace(/\b\w/g,ch=>ch.toUpperCase());
  const fallbackItems=[];
  Object.keys(PROFILE||{}).forEach(key=>{
    if(!key || !key.startsWith('resource_')) return;
    const rawVal=PROFILE[key];
    const parsed=Number(rawVal);
    if(!Number.isFinite(parsed) || parsed<=0) return;
    const code=key.slice('resource_'.length);
    if(!code) return;
    if(resourceItems.some(item=>item.code===code)) return;
    const meta=RESOURCE_META_MAP[code]||{};
    fallbackItems.push({
      code,
      name: meta.name || prettyName(code),
      icon: meta.icon || '📦',
      description: meta.description || '',
      quantity: parsed,
    });
  });
  if(fallbackItems.length){
    resourceItems.push(...fallbackItems);
  }
  let html='';
  if(PROFILE_INV_TAB==='zombies'){
    html = zombieItems.length ? zombieItems.map(item=>{
      const costPart = item.cost!=null ? `Очки: ${item.cost}` : '';
      const cdPart = item.cooldown!=null ? `${costPart ? ' · ' : ''}Кд: ${item.cooldown}s` : '';
      const extra = costPart || cdPart ? `<div class="profile-item-sub">${costPart}${cdPart}</div>` : '';
      return `<div class="profile-item"><div class="profile-item-icon">${item.icon}</div><div><div class="profile-item-title">${item.name}</div>${extra}</div></div>`;
    }).join('') : '<div class="muted">Нет доступных классов зомби</div>';
  } else if(PROFILE_INV_TAB==='resources'){
    html = resourceItems.length ? resourceItems.map(item=>{
      const desc = item.description ? `<div class="profile-item-sub">${item.description}</div>` : '';
      return `<div class="profile-item"><div class="profile-item-icon">${item.icon}</div><div><div class="profile-item-title">${item.name}</div><div class="profile-item-sub">Количество: ${item.quantity}</div>${desc}</div></div>`;
    }).join('') : '<div class="muted">Нет собранных ресурсов</div>';
  } else {
    html = plantItems.length ? plantItems.map(item=>{
      const extra = item.cost!=null ? `<div class="profile-item-sub">Стоимость: ${item.cost}</div>` : '';
      return `<div class="profile-item"><div class="profile-item-icon">${item.icon}</div><div><div class="profile-item-title">${item.name}</div>${extra}</div></div>`;
    }).join('') : '<div class="muted">Нет доступных растений</div>';
  }
  listEl.innerHTML=html;
}

function setProfileInvTab(tab){
  if(PROFILE_INV_TAB===tab) return;
  PROFILE_INV_TAB=tab;
  renderProfileInventory();
}

function openProfile(name){
  profileModal.style.display='flex';
  const box=document.getElementById('profileBox');
  box.innerHTML = 'Загрузка...';
  API('/api/profile?u='+encodeURIComponent(name)).then(j=>{
    PROFILE=j.profile||{};
    applyZombieDefaults(PROFILE);
    if(!PROFILE.resources || typeof PROFILE.resources!=='object'){
      PROFILE.resources={};
    }
    PROFILE_INV_TAB='plants';
    const recent = (j.recent||[]).map(m=>`<li>Счёт: ${m.score}, Итог: ${m.outcome}, Время: ${m.duration}s</li>`).join('');
    box.innerHTML = `<div style="display:flex;align-items:center;gap:12px">
      <img class="avatar" src="${avatarUrl(name)}&s=42" style="width:42px;height:42px"/>
      <div><b>${name}</b><div class="muted">Очки: ${PROFILE.score||0} · Победы: ${PROFILE.games_won||0} · Матчей: ${PROFILE.games_played||0} · Монеты: ${PROFILE.coins||0}</div></div>
    </div>
    <div class="sep"></div>
    <div>Лучший счёт: <b>${j.best||0}</b></div>
    <div style="margin-top:6px"><b>Последние матчи:</b><ul>${recent||'<li>Пока нет</li>'}</ul></div>
    <div class="sep"></div>
    <div>
      <div class="profile-section-title">Инвентарь</div>
      <div class="profile-tabs">
        <button id="profileTabPlants" class="btn ${PROFILE_INV_TAB==='plants'?'primary':''}" onclick="setProfileInvTab('plants')">Растения</button>
        <button id="profileTabZombies" class="btn ${PROFILE_INV_TAB==='zombies'?'primary':''}" onclick="setProfileInvTab('zombies')">Зомби</button>
        <button id="profileTabResources" class="btn ${PROFILE_INV_TAB==='resources'?'primary':''}" onclick="setProfileInvTab('resources')">Ресурсы</button>
      </div>
      <div id="profileInventoryList" class="profile-inventory-list"><div class="muted">Загрузка...</div></div>
    </div>`;
    renderProfileInventory();
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
  if(isProfileModalOpen()){
    renderProfileInventory();
  }
}

function renderShop(){
  const box=document.getElementById('shopBox');
  if(!box) return;
  if(!SHOP_DATA){
    box.textContent='Загрузка...';
    return;
  }
  const coins = SHOP_DATA.coins||0;
  const plants = Array.isArray(SHOP_DATA.plants)? SHOP_DATA.plants : [];
  const zombies = Array.isArray(SHOP_DATA.zombies)? SHOP_DATA.zombies : [];
  const resources = Array.isArray(SHOP_DATA.resources)? SHOP_DATA.resources : [];
  if(!['plants','zombies','resources'].includes(SHOP_TAB)) SHOP_TAB='plants';
  const tabsHtml = `<div class="shop-tabs">
    <button class="btn ${SHOP_TAB==='plants'?'primary':''}" onclick="setShopTab('plants')">Растения</button>
    <button class="btn ${SHOP_TAB==='zombies'?'primary':''}" onclick="setShopTab('zombies')">Зомби</button>
    <button class="btn ${SHOP_TAB==='resources'?'primary':''}" onclick="setShopTab('resources')">Ресурсы</button>
  </div>`;
  let cardsHtml='';
  if(SHOP_TAB==='zombies'){
    cardsHtml = zombies.length ? zombies.map(it=>{
      const owned = !!it.owned;
      const zombieInfo = ZOMBIE_LIBRARY[it.item];
      const extra = zombieInfo ? `<div class="muted">Очки: ${zombieInfo.cost}, Кд: ${zombieInfo.cooldown}s</div>` : '';
      const status = owned ? '<span class="muted">✅ Куплено</span>' : `<button class="btn" onclick="buyItem('${it.item}')">Купить за ${it.price}</button>`;
      return `<div class="card"><div class="icon">${it.icon||'🧟'}</div><div style="flex:1">
        <div><b>${it.name||it.item}</b></div>
        <div class="muted">Класс зомби</div>
        ${extra}
      </div><div style="text-align:right">${status}</div></div>`;
    }).join('') : '<div class="muted">Нет доступных предметов</div>';
  } else if(SHOP_TAB==='resources'){
    cardsHtml = resources.length ? resources.map(it=>{
      const meta = RESOURCE_META_MAP[it.item] || {};
      const quantity = Number(it.quantity)||0;
      const amount = Number(it.amount)||0;
      const desc = (it.description || meta.description) ? `<div class="muted">${it.description || meta.description}</div>` : '';
      const gain = amount>0 ? `<div class="muted">Получите: +${amount}</div>` : '';
      return `<div class="card"><div class="icon">${it.icon||meta.icon||'📦'}</div><div style="flex:1">
        <div><b>${it.name||meta.name||it.item}</b></div>
        <div class="muted">Ресурс · У вас: ${quantity}</div>
        ${desc}
        ${gain}
      </div><div style="text-align:right"><button class="btn" onclick="buyItem('${it.item}')">Купить за ${it.price}</button></div></div>`;
    }).join('') : '<div class="muted">Нет доступных ресурсов</div>';
  } else {
    cardsHtml = plants.length ? plants.map(it=>{
      const owned = !!it.owned;
      const status = owned ? '<span class="muted">✅ Куплено</span>' : `<button class="btn" onclick="buyItem('${it.item}')">Купить за ${it.price}</button>`;
      return `<div class="card"><div class="icon">${it.icon||'🛒'}</div><div style="flex:1">
        <div><b>${it.name||it.item}</b></div>
        <div class="muted">Растение</div>
      </div><div style="text-align:right">${status}</div></div>`;
    }).join('') : '<div class="muted">Нет доступных предметов</div>';
  }
  box.innerHTML = `<div><b>Ваши монеты:</b> ${coins}</div><div class="sep"></div>${tabsHtml}<div class="sep"></div><div class="shop-items">${cardsHtml}</div>`;
}

function setShopTab(tab){
  SHOP_TAB = ['plants','zombies','resources'].includes(tab) ? tab : 'plants';
  renderShop();
}

function openShop(tab){
  SHOP_TAB = typeof tab === 'string' && ['plants','zombies','resources'].includes(tab) ? tab : 'plants';
  shopModal.style.display='flex';
  SHOP_DATA=null;
  renderShop();
  API('/api/store?u='+encodeURIComponent(USER)).then(j=>{
    const coins = j.coins||0;
    SHOP_DATA={
      coins,
      plants: Array.isArray(j.plants)? j.plants : [],
      zombies: Array.isArray(j.zombies)? j.zombies : [],
      resources: Array.isArray(j.resources)? j.resources : [],
    };
    if(PROFILE){
      PROFILE.coins=coins;
      if(Array.isArray(j.owned)) PROFILE.owned=j.owned;
      if(Array.isArray(j.zombie_classes)) PROFILE.zombie_classes=j.zombie_classes;
      if(Array.isArray(j.zombie_deck)) PROFILE.zombie_deck=j.zombie_deck;
      if(j.resource_inventory && typeof j.resource_inventory==='object'){
        PROFILE.resources=j.resource_inventory;
      }
      applyZombieDefaults(PROFILE);
      updateOwnedPlants();
    }
    renderShop();
    if(isProfileModalOpen()){
      renderProfileInventory();
    }
  }).catch(()=>{
    const box=document.getElementById('shopBox');
    if(box) box.textContent='Не удалось загрузить магазин';
  });
}
function buyItem(item){
  const prevTab = SHOP_TAB;
  API('/api/buy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:USER,item})}).then(j=>{
    if(j.status==='ok'){
      if(PROFILE && j.profile){
        PROFILE=j.profile;
        applyZombieDefaults(PROFILE);
        PROFILE.owned=Array.isArray(PROFILE.owned)?PROFILE.owned:[];
        PROFILE.zombie_classes=Array.isArray(PROFILE.zombie_classes)?PROFILE.zombie_classes:[];
        if(!PROFILE.resources || typeof PROFILE.resources!=='object'){
          PROFILE.resources={};
        }
        if(j.profile.resources && typeof j.profile.resources==='object'){
          PROFILE.resources = j.profile.resources;
        }
        PROFILE.coins=j.coins ?? PROFILE.coins;
        updateOwnedPlants();
      }
      openShop(prevTab);
      buildInventory();
      if(isProfileModalOpen()){
        renderProfileInventory();
      }
    }
    else{ alert('Покупка не удалась: '+(j.msg||'')); }
  });
}
function closeShop(){ shopModal.style.display='none'; }

function openCraft(){
  if(craftModal){
    craftModal.style.display='flex';
  }
}

function closeCraft(){
  if(craftModal){
    craftModal.style.display='none';
  }
}

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
  if(VIEW==='summary'){ renderGameSummary(); }
  if(data && data.room && Object.prototype.hasOwnProperty.call(data.room,'chat')){
    renderChatHistory(data.room.chat);
  }
  if(data.room.countdown_until){
    COUNTDOWN_LEFT = Math.max(0, Math.floor(data.room.countdown_until - (Date.now()/1000)));
    startCountdownTicker();
  }else{
    stopCountdownTicker();
  }
  if(data.room.started && VIEW!=='game'){ setView('game'); }
});
socket.on('game_started', (payload)=>{ if(payload && payload.room_id===ROOM_ID){ GAME_SUMMARY=null; setView('game'); }});
socket.on('game_over', (payload={})=>{
  if(ROOM_ID===payload.room_id){
    const statsPayload = payload.stats && typeof payload.stats==='object' ? payload.stats : {};
    GAME_SUMMARY = {
      ...payload,
      players: Array.isArray(payload.players) ? payload.players.slice() : [],
      stats: {
        kills: statsPayload.kills && typeof statsPayload.kills==='object' ? {...statsPayload.kills} : {},
        coins: statsPayload.coins && typeof statsPayload.coins==='object' ? {...statsPayload.coins} : {},
        plants: statsPayload.plants && typeof statsPayload.plants==='object' ? {...statsPayload.plants} : {},
        destroyed: statsPayload.destroyed && typeof statsPayload.destroyed==='object' ? {...statsPayload.destroyed} : {},
        resources: statsPayload.resources && typeof statsPayload.resources==='object' ? {...statsPayload.resources} : {},
      },
    };
    setView('summary');
  }
});
socket.on('room_deleted', (payload)=>{
  if(ROOM_ID===payload.room_id){
    alert('Комната удалена (все игроки вышли).');
    ROOM_ID=null; localStorage.removeItem('ROOM_ID'); setView('home'); listRooms();
  } else { if(VIEW==='home') listRooms(); }
});
socket.on('action_result', (payload={})=>{
  const pending = PENDING_ACTIONS.length ? PENDING_ACTIONS.shift() : null;
  if(typeof payload.cooldown === 'number'){
    const remain = Math.max(0, Number(payload.cooldown));
    PLANT_COOLDOWN_UNTIL = Date.now() + remain*1000;
  }
  if(payload.status==='sold'){
    SELL_CONFIRMATION=null;
    if(pending && pending.type==='sell'){
      const refund = Number(payload.refund)||0;
      if(Number.isFinite(Number(payload.sun))){
        SUN_NOW = Math.max(0, Number(payload.sun));
      } else {
        SUN_NOW = Math.max(0, SUN_NOW + refund);
      }
      const bonus = refund || Math.floor((PLANT_COST_MAP[pending.ptype]||0)/2);
      if(GAME_STATE){
        if(Array.isArray(GAME_STATE.grid) && GAME_STATE.grid[pending.row]){
          GAME_STATE.grid[pending.row][pending.col]=null;
        }
        GAME_STATE.sun = SUN_NOW;
      }
      if(VIEW==='game'){
        if(GAME_STATE){ redraw(); }
        else { highlightInventory(); }
      }
      const msg = payload.msg || `Растение продано (+${Math.floor(bonus)})`;
      setStatus(msg);
    }
    return;
  }
  if(payload.status==='ok'){
    PLANT_COOLDOWN_UNTIL = Math.max(PLANT_COOLDOWN_UNTIL, Date.now()+500);
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
function formatChatTimestamp(value){
  const num = Number(value);
  if(Number.isFinite(num) && num > 0){
    const millis = num < 1e12 ? num * 1000 : num;
    return new Date(millis);
  }
  return new Date();
}

function appendChatMessage(msg={}, opts={}){
  const box=document.getElementById('chatBox');
  if(!box) return;
  const message = msg || {};
  const skipScroll = !!opts.skipScroll;
  const user = (message.user || 'system').toString();
  const text = (message.text || '').toString();
  const date = formatChatTimestamp(message.time ?? Date.now());
  const timeLabel = date.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});

  const row=document.createElement('div');
  row.className='chat-message'+(user==='system'?' chat-message--system':'');

  const timeSpan=document.createElement('span');
  timeSpan.className='chat-message__time';
  timeSpan.textContent=timeLabel;

  const authorSpan=document.createElement('span');
  authorSpan.className='chat-message__author';
  authorSpan.textContent=user;

  const textSpan=document.createElement('span');
  textSpan.className='chat-message__text';
  textSpan.textContent=text;

  row.appendChild(timeSpan);
  row.appendChild(document.createTextNode(' '));
  row.appendChild(authorSpan);
  row.appendChild(document.createTextNode(': '));
  row.appendChild(textSpan);

  box.appendChild(row);
  if(!skipScroll){
    box.scrollTop=box.scrollHeight;
  }
}

function renderChatHistory(messages){
  const box=document.getElementById('chatBox');
  if(!box) return;
  box.innerHTML='';
  if(Array.isArray(messages)){
    messages.forEach(msg=>appendChatMessage(msg, {skipScroll:true}));
  }
  box.scrollTop=box.scrollHeight;
}

socket.on('chat', (m={})=>{
  if(ROOM_CACHE && Array.isArray(ROOM_CACHE.chat)){
    ROOM_CACHE.chat=[...ROOM_CACHE.chat, m].slice(-100);
  }
  appendChatMessage(m);
});
socket.on('state_update', (payload={})=>{
  if(!ROOM_ID || payload.room_id!==ROOM_ID) return;
  if(payload.target && payload.target!==USER) return;
  const st=payload.state; GAME_STATE=st;
  const prevPoints=ZOMBIE_POINTS;
  const prevCooldowns=ZOMBIE_COOLDOWNS;
  const prevDeck=ZOMBIE_DECK.slice();
  SUN_NOW=st.sun;
  if(typeof st.plant_cooldown === 'number'){
    const remainMs = Math.max(0, Number(st.plant_cooldown)*1000);
    PLANT_COOLDOWN_UNTIL = Date.now() + remainMs;
  }
  const nextPoints=(typeof st.zombie_points==='number') ? st.zombie_points : prevPoints;
  const nextCooldowns=(st.zombie_cooldowns && typeof st.zombie_cooldowns==='object') ? {...st.zombie_cooldowns} : prevCooldowns||{};
  let deckChanged=false;
  if(Array.isArray(st.zombie_deck)){
    const filtered=st.zombie_deck.filter(z=>ZOMBIE_LIBRARY[z]);
    deckChanged=!arraysEqual(prevDeck, filtered);
    if(deckChanged || !ZOMBIE_DECK.length){
      ZOMBIE_DECK=filtered.slice();
    }
  }
  const pointsChanged=(nextPoints!==prevPoints);
  const cooldownChanged=!cooldownsEqual(prevCooldowns||{}, nextCooldowns||{});
  ZOMBIE_POINTS=nextPoints;
  ZOMBIE_COOLDOWNS=nextCooldowns||{};
  MY_ROLE=st.role||MY_ROLE;
  if(VIEW==='game'){
    if(CURRENT_ROLE_UI!==MY_ROLE){ renderGame(); return; }
    redraw();
    if(MY_ROLE==='attacker' && (pointsChanged || cooldownChanged || deckChanged)){ buildZombieDeckUI(); }
  }
});
socket.on('wave_cleared', (p)=>{
  if(ROOM_ID===p.room_id){
    const s=document.getElementById('status');
    if(s) s.textContent = `Волна ${p.wave} завершена! Ждём напарника...`;
  }
});
socket.on('profile_sync', (payload={})=>{
  if(!payload.profile){ return; }
  PROFILE=payload.profile||{};
  PROFILE.owned = PROFILE.owned||[];
  applyZombieDefaults(PROFILE);
  updateOwnedPlants();
  if(isProfileModalOpen()){
    renderProfileInventory();
  }
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
  document.body.classList.toggle('auth-view', VIEW==='auth');
  if(USER){
    navbar.classList.remove('muted');
    const profileHtml = `<span style="cursor:pointer" onclick="openProfile('${USER}')"><img class="avatar" src="${avatarUrl(USER)}&s=24" style="width:24px;height:24px"/> <b>${USER}</b></span>`;
    navbar.innerHTML = `
      <button class="btn" onclick="openCraft()"><span>🧪</span> Крафт</button>
      <button class="btn" onclick="openShop()"><span>🛒</span> Магазин</button>
      ${profileHtml}
    `;
  }else{
    navbar.classList.add('muted');
    navbar.textContent = 'Гость';
  }
  if(VIEW==='auth'){ renderAuth(); return; }
  if(VIEW==='home'){ renderHome(); return; }
  if(VIEW==='room'){ renderRoom(); return; }
  if(VIEW==='summary'){ renderGameSummary(); return; }
  if(VIEW==='game'){ renderGame(); return; }
}

const debouncedUsernameCheck = debounce(async (value, counter)=>{
  try{
    const res = await fetch(`/api/check_username?username=${encodeURIComponent(value)}`);
    const data = await res.json();
    if(counter !== USERNAME_CHECK_COUNTER) return;
    const available = Boolean(data && data.available && res.ok);
    if(available){
      USERNAME_CHECK_STATE={available:true,msg:data.msg||'Логин свободен',tone:'good',pending:false};
    } else {
      const msg = data && data.msg ? data.msg : 'Логин занят';
      USERNAME_CHECK_STATE={available:false,msg:msg,tone:'bad',pending:false};
    }
  } catch (err) {
    if(counter !== USERNAME_CHECK_COUNTER) return;
    USERNAME_CHECK_STATE={available:false,msg:'Не удалось проверить логин',tone:'bad',pending:false};
  }
  updateAuthStatusUI();
}, 300);

function scheduleUsernameCheck(raw){
  const value=(raw||'').trim();
  USERNAME_CHECK_COUNTER++;
  const counter=USERNAME_CHECK_COUNTER;
  if(!value){
    USERNAME_CHECK_STATE={available:false,msg:'Введите логин',tone:'muted',pending:false};
    updateAuthStatusUI();
    return;
  }
  USERNAME_CHECK_STATE={available:false,msg:'Проверка...',tone:'muted',pending:true};
  updateAuthStatusUI();
  debouncedUsernameCheck(value, counter);
}

function generateNickname(){
  const loginInput=document.getElementById('login');
  if(!loginInput){
    return '';
  }
  const adj=NICKNAME_ADJECTIVES[Math.floor(Math.random()*NICKNAME_ADJECTIVES.length)]||'Swift';
  const noun=NICKNAME_NOUNS[Math.floor(Math.random()*NICKNAME_NOUNS.length)]||'Pea';
  const number=Math.floor(Math.random()*900)+100;
  const nickname=`${adj}${noun}${number}`;
  loginInput.value=nickname;
  loginInput.dispatchEvent(new Event('input',{bubbles:true}));
  loginInput.focus();
  if(typeof loginInput.setSelectionRange==='function'){
    const len=nickname.length;
    loginInput.setSelectionRange(len, len);
  }
  return nickname;
}

function updateAuthStatusUI(){
  const status=document.getElementById('loginStatus');
  if(status){
    status.textContent = USERNAME_CHECK_STATE.msg || '';
    let color='var(--muted)';
    if(USERNAME_CHECK_STATE.pending){
      color='var(--muted)';
    } else if(USERNAME_CHECK_STATE.tone==='good'){
      color='var(--good)';
    } else if(USERNAME_CHECK_STATE.tone==='bad'){
      color='var(--bad)';
    }
    status.style.color=color;
  }
  const registerBtn=document.getElementById('registerBtn');
  if(registerBtn){
    registerBtn.disabled = USERNAME_CHECK_STATE.pending || !USERNAME_CHECK_STATE.available;
  }
}

function evaluatePasswordStrength(password=''){
  const value=String(password||'');
  if(!value){
    return {score:0,label:'Введите пароль'};
  }
  let score=0;
  if(value.length>=4) score++;
  if(value.length>=8) score++;
  if(/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if(/\d/.test(value)) score++;
  if(/[^A-Za-z0-9]/.test(value)) score++;
  score=Math.min(score,4);
  const labels=['Очень слабый','Слабый','Средний','Хороший','Сильный'];
  return {score,label:labels[score]};
}

function updatePasswordStrengthUI(password=''){
  const indicator=document.getElementById('passStrength');
  if(!indicator) return;
  const {score,label}=evaluatePasswordStrength(password);
  const classes=['level-0','level-1','level-2','level-3','level-4'];
  indicator.classList.toggle('is-empty', !password);
  classes.forEach(cls=>indicator.classList.remove(cls));
  indicator.classList.add(classes[score]||'level-0');
  const bar=indicator.querySelector('.pass-strength__bar');
  const text=indicator.querySelector('.pass-strength__label');
  if(bar){
    const percent=score===0 && !password ? 0 : (score/4)*100;
    bar.style.width = `${percent}%`;
  }
  if(text){
    text.textContent = password ? label : 'Введите пароль';
  }
}

function initAuthControls(){
  USERNAME_CHECK_STATE={available:false,msg:'Введите логин',tone:'muted',pending:false};
  updateAuthStatusUI();
  const loginInput=document.getElementById('login');
  if(!loginInput) return;
  loginInput.addEventListener('input', ()=>scheduleUsernameCheck(loginInput.value));
  scheduleUsernameCheck(loginInput.value);
  const passInput=document.getElementById('pass');
  if(passInput){
    const handler=()=>updatePasswordStrengthUI(passInput.value);
    passInput.addEventListener('input', handler);
    updatePasswordStrengthUI(passInput.value);
  }
}

function renderAuth(){
  left.innerHTML = `
    <div class="auth-card">
      <div class="auth-card__header">
        <h1>Zombie Coop</h1>
        <p class="auth-card__subtitle">Кооперативные битвы растений и зомби</p>
      </div>
      <p class="auth-card__hint">Создай логин и пароль, чтобы собраться с друзьями и защитить двор от волн зомби.</p>
      <div class="auth-card__indicators">
        <div class="auth-card__status muted" id="loginStatus"></div>
      </div>
      <label class="auth-card__label" for="login">Логин</label>
      <div class="row login-row">
        <input id="login" placeholder="Логин (латиница/цифры ._-)" />
        <button type="button" class="btn" onclick="generateNickname()"><span>🎲</span> Рандомный ник</button>
      </div>
      <label class="auth-card__label" for="pass">Пароль</label>
      <div class="row">
        <input id="pass" type="password" placeholder="Пароль (мин. 4 символа)" />
      </div>
      <div id="passStrength" class="pass-strength level-0 is-empty">
        <div class="pass-strength__track"><div class="pass-strength__bar"></div></div>
        <div class="pass-strength__label muted">Введите пароль</div>
      </div>
      <div class="row auth-card__actions">
        <button id="registerBtn" class="btn" onclick="register()"><span>📝</span> Регистрация</button>
        <button class="btn primary" onclick="signin()"><span>🔑</span> Вход</button>
      </div>
      <div class="auth-card__helper muted">Регистрация сохраняет прогресс и коллекцию карточек.</div>
      <div class="muted" id="authMsg"></div>
    </div>`;
  main.innerHTML = `
    <div class="auth-illustration">
      <div class="auth-illustration__badge">🧟‍♂️</div>
      <h2>Стань защитником сада</h2>
      <p>Присоединяйся к кооперативным матчам, делись стратегией и отбивай волны зомби вместе с товарищами.</p>
      <ul class="auth-illustration__list">
        <li>Создавай лобби и приглашай друзей</li>
        <li>Развивай коллекцию растений и зомби</li>
        <li>Соревнуйся за место в таблице лидеров</li>
      </ul>
    </div>`;
  initAuthControls();
}
async function register(){
  const u=document.getElementById('login').value.trim();
  const p=document.getElementById('pass').value;
  if(!USERNAME_CHECK_STATE.available){
    document.getElementById('authMsg').textContent = 'Ошибка: '+(USERNAME_CHECK_STATE.msg||'Проверьте логин');
    return;
  }
  const r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
  const j=await r.json(); document.getElementById('authMsg').textContent = j.status==='ok'?'Регистрация успешна':'Ошибка: '+(j.msg||' ');
}
async function signin(){
  const u=document.getElementById('login').value.trim();
  const p=document.getElementById('pass').value;
  const j=await API('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
  if(j.status==='ok'){
    USER=u; PROFILE=j.profile||{};
    applyZombieDefaults(PROFILE);
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
  main.innerHTML = `<div class="main-home">
    <h3>Список комнат</h3>
    <div id="rooms" class="rooms-container"><div class="rooms-loading">Загрузка…</div></div>
  </div>`;
  showLeaderboard(); listRooms(); HOME_TIMER=setInterval(listRooms, 2000);
}
async function showLeaderboard(){
  const j=await API('/api/leaderboard');
  if(j.status==='ok'){
    document.getElementById('leaders').innerHTML = j.leaders.map((u,i)=>`${i+1}. <span class="pill" onclick="openProfile('${u.user}')">${u.user}</span> — ${u.score||0}`).join('<br>');
  }
}
function renderRoomCard(r){
  const playersList = Array.isArray(r.players) ? r.players : [];
  const players = playersList.map(p=>`<span class="pill" onclick="openProfile('${p.name}')">${p.name} ${p.ready?'✔️':'❌'}</span>`).join(' ');
  const cap = `${playersList.length}/${r.max_players}`;
  const started = r.started ? '<span class="badge" style="border-color:#fecaca;background:#fee2e2">Идёт</span>' : '<span class="badge" style="border-color:#bbf7d0;background:#dcfce7">Лобби</span>';
  const lock = r.locked ? '🔒' : '🔓';
  return `<div class="room">
    <div><b>${lock} ${r.name}</b> (ID: ${r.room_id}) ${started} <span class="badge">Режим: ${r.mode}</span> <span class="badge">Игроков: ${cap}</span></div>
    <div class="muted" style="margin-top:6px">${players || 'Пока пусто'}</div>
    <div class="row"><button class="btn" onclick="openRoom('${r.room_id}', ${r.locked})"><span>➡️</span> Открыть</button></div>
  </div>`;
}
async function listRooms(){
  const j=await API('/api/list_rooms'); if(j.status!=='ok') return;
  const wrap=document.getElementById('rooms'); if(!wrap) return;
  const rooms = Array.isArray(j.rooms) ? j.rooms : [];
  if(!rooms.length){
    wrap.innerHTML = `<div class="empty-state">
      <div class="empty-state__icon">🕹️</div>
      <div class="empty-state__title">Пока нет активных комнат</div>
      <div class="empty-state__text">Создай первую игру и пригласи друзей в кооператив!</div>
      <button class="btn primary" onclick="openModal()"><span>➕</span> Создать комнату</button>
    </div>`;
    return;
  }
  wrap.innerHTML = rooms.map(renderRoomCard).join('');
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
    <div class="room-actions">
      <button class="btn" onclick="toggleReady()"><span>✅</span> Готов/Не готов</button>
      <button id="startBtn" class="btn primary" onclick="startGame()" disabled><span>🚀</span> Старт</button>
      <button class="btn" onclick="rematch()"><span>🔁</span> Реванш</button>
    </div>
    <div class="room-actions room-actions--single">
      <button class="btn" onclick="leaveRoom()"><span>⬅️</span> Выйти</button>
    </div>
    <div class="sep"></div>
    <div id="roleControls" class="room-actions room-actions--column"></div>`;
  main.innerHTML = `<div class="room-layout">
    <section class="room-panel room-panel--info">
      <div class="room-panel__section">
        <div class="room-panel__header">
          <h3 class="room-panel__title">Информация</h3>
          <button class="btn" onclick="copyRoomInvite()"><span>🔗</span> Скопировать ID/приглашение</button>
        </div>
        <div id="roomInfo" class="room-info muted"></div>
        <div id="roomInfoFeedback" class="room-info__feedback"></div>
      </div>
      <div class="room-panel__section">
        <div class="room-panel__header">
          <h3 class="room-panel__title">Состав</h3>
        </div>
        <div class="room-roster">
          <div id="players" class="room-roster__list"></div>
        </div>
        <div id="countdown" class="muted room-roster__countdown"></div>
      </div>
    </section>
    <section class="room-panel room-panel--chat">
      <div class="room-panel__header">
        <h3 class="room-panel__title">Чат комнаты</h3>
      </div>
      <div id="chatBox" class="room-chat__log"></div>
      <div class="room-chat__form">
        <input id="chatInput" placeholder="Сообщение..." />
        <button class="btn" onclick="sendChat()"><span>💬</span> Отправить</button>
      </div>
    </section>
  </div>`;
  if(ROOM_CACHE) drawRoomInfo(ROOM_CACHE);
  const chatInput=document.getElementById('chatInput');
  if(chatInput && !chatInput.dataset.enterSubmit){
    chatInput.dataset.enterSubmit='1';
    chatInput.addEventListener('keydown',(ev)=>{
      if(ev.key==='Enter' && !ev.shiftKey){
        ev.preventDefault();
        sendChat();
      }
    });
  }
  if(ROOM_CACHE && Array.isArray(ROOM_CACHE.chat)){
    renderChatHistory(ROOM_CACHE.chat);
  }
}
function drawRoomInfo(r){
  const info=document.getElementById('roomInfo');
  if(info) info.innerHTML = `Комната: <b>${r.name}</b> (ID: ${r.room_id}) <span class="badge">Режим: ${r.mode}</span> <span class="badge">Игроков: ${r.players.length}/${r.max_players}</span> · Хост: <span class="pill" onclick="openProfile('${r.owner}')">${r.owner}</span>`;
  const playersDiv=document.getElementById('players');
  let readyCount=0;
  if(playersDiv){
    const roles=r.roles||{}; const assigned=r.assigned||{};
    readyCount = r.players.filter(p=>p.ready).length;
    if(!r.players.length){
      playersDiv.innerHTML = `<div class="room-roster__summary">Готовы: 0/0</div><div class="room-roster__empty">Пока пусто</div>`;
    } else {
      const cards = r.players.map(p=>{
        const choice=roles[p.name]||'random';
        const final=(assigned && assigned.defender===p.name)?'plant':(assigned && assigned.attacker===p.name)?'zombie':choice;
        const isReady = !!p.ready;
        const isHost = p.name===r.owner;
        const roleMarkup = `${roleIcon(final)} ${roleLabel(final)}`;
        return `<div class="player-tile${isReady?' player-tile--ready':''}${isHost?' player-tile--host':''}" onclick="openProfile('${p.name}')">
          <img class="player-tile__avatar" src="${avatarUrl(p.name)}" alt="${p.name}" />
          <div class="player-tile__info">
            <div class="player-tile__name">${p.name}</div>
            <div class="player-tile__role">${roleMarkup}</div>
          </div>
          <div class="player-tile__badges">
            ${isHost?'<span class="player-tile__badge player-tile__badge--host">Хост</span>':''}
            <span class="player-tile__badge ${isReady?'player-tile__badge--ready':'player-tile__badge--waiting'}">${isReady?'Готов':'Ждёт'}</span>
          </div>
        </div>`;
      });
      playersDiv.innerHTML = `<div class="room-roster__summary">Готовы: ${readyCount}/${r.players.length}</div>` + cards.join('');
    }
  }
  const startBtn=document.getElementById('startBtn'); if(startBtn){ const totalPlayers=r.players.length; const maxPlayers=r.max_players; const allReady=(totalPlayers===maxPlayers) && readyCount===totalPlayers; startBtn.disabled = !(USER===r.owner && allReady); }
  MY_INDEX = Math.max(0, r.players.map(p=>p.name).indexOf(USER));
  if(r.mode==='pvp' && r.assigned){
    if(r.assigned.defender===USER) MY_INDEX=0;
    else if(r.assigned.attacker===USER) MY_INDEX=1;
  }
  if(r.started && VIEW!=='game'){ setView('game'); }
  if(r.mode==='pvp'){ buildRoleControls(r); }
}

async function copyRoomInvite(){
  if(!ROOM_CACHE || !ROOM_CACHE.room_id) return;
  if(!navigator?.clipboard?.writeText){
    alert('Копирование не поддерживается в этом браузере');
    return;
  }
  const {room_id, name, mode, max_players, locked} = ROOM_CACHE;
  const baseUrl = window?.location?.origin || '';
  const link = baseUrl ? `${baseUrl}/?room=${room_id}` : `ID: ${room_id}`;
  const lines = [
    `Присоединяйся в Zombie Coop!`,
    `Комната: ${name || 'Без названия'}`,
    `Режим: ${mode || 'coop'} · Мест: ${max_players}`,
    `ID: ${room_id}`,
    `Ссылка: ${link}`,
    locked ? 'Комната защищена паролем.' : ''
  ].filter(Boolean);
  const text = lines.join('\n');
  try{
    await navigator.clipboard.writeText(text);
    const feedback=document.getElementById('roomInfoFeedback');
    if(feedback){
      feedback.textContent='Приглашение скопировано';
      feedback.classList.add('is-visible');
      setTimeout(()=>{
        if(feedback.textContent==='Приглашение скопировано'){
          feedback.textContent='';
          feedback.classList.remove('is-visible');
        }
      },2500);
    }
  } catch(err){
    console.error('Clipboard error', err);
    alert('Не удалось скопировать приглашение');
  }
}

function roleIcon(code){
  if(code==='plant') return '🌿';
  if(code==='zombie') return '🧟';
  return '🎲';
}

function roleLabel(code){
  if(code==='plant') return 'Растения';
  if(code==='zombie') return 'Зомби';
  if(code==='random') return 'Случайно';
  return '—';
}

function buildRoleControls(r){
  const box=document.getElementById('roleControls');
  if(!box){ return; }
  if(r.mode!=='pvp'){ box.innerHTML=''; return; }
  const role=(r.roles||{})[USER]||'random';
  const disabled = !!r.started;
  const btn=(code,label)=>`<button class="btn${role===code?' primary':''}" ${disabled?'disabled':''} onclick="selectRole('${code}')">${label}</button>`;
  box.innerHTML = `<div class="room-role">
    <div class="muted">Выбор роли</div>
    <div class="room-role__choices">
      ${btn('plant','🌿 Растения')}
      ${btn('zombie','🧟 Зомби')}
      ${btn('random','🎲 Рандом')}
    </div>
  </div>`;
}

function selectRole(role){ if(!ROOM_ID) return; socket.emit('select_role',{room_id:ROOM_ID, username:USER, role}); }

function toggleReady(){ socket.emit('toggle_ready',{room_id:ROOM_ID, username:USER}); }
function startGame(){ socket.emit('start',{room_id:ROOM_ID, username:USER}); }
function rematch(){ socket.emit('rejoin',{room_id:ROOM_ID, username:USER}); }
function sendChat(){
  const input=document.getElementById('chatInput');
  if(!input) return;
  const t=input.value.trim();
  if(!t) return;
  socket.emit('chat',{room_id:ROOM_ID, username:USER, text:t});
  input.value='';
}
function leaveRoom(){ socket.emit('leave_room',{room_id:ROOM_ID, username:USER}); ROOM_ID=null; localStorage.removeItem('ROOM_ID'); GAME_SUMMARY=null; setView('home'); listRooms(); stopCountdownTicker(); }

function returnToLobby(){ GAME_SUMMARY=null; setView('room'); }

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

function confirmSellPlant(row, col, plantType){
  const now = Date.now();
  const current = SELL_CONFIRMATION;
  if(current && current.row===row && current.col===col && current.ptype===plantType && now-current.ts < 2500){
    SELL_CONFIRMATION=null;
    return true;
  }
  const plantName = PLANT_META_MAP[plantType]?.name || 'растение';
  SELL_CONFIRMATION={row,col,ptype:plantType,ts:now};
  setTimeout(()=>{
    if(SELL_CONFIRMATION && SELL_CONFIRMATION.row===row && SELL_CONFIRMATION.col===col && SELL_CONFIRMATION.ptype===plantType && SELL_CONFIRMATION.ts===now){
      SELL_CONFIRMATION=null;
    }
  }, 2500);
  setStatus(`Нажмите ещё раз в течение 2 секунд, чтобы продать ${plantName}`);
  return false;
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
    const cellData=(GAME_STATE?.grid?.[r]||[])[c];
    if(cellData){
      const plantType=cellData?.type;
      if(!plantType){ setStatus('Нельзя продать неизвестное растение'); return; }
      if(!confirmSellPlant(r,c,plantType)) return;
      PENDING_ACTIONS.push({type:'sell', row:r, col:c, ptype:plantType});
      socket.emit('sell_plant',{room_id:ROOM_ID,username:USER,row:r,col:c,ptype:plantType});
      return;
    }
    SELL_CONFIRMATION=null;
    const p=PLANTS.find(x=>x.code===CURRENT); if(!p) return;
    const nowTs=Date.now();
    if(nowTs < PLANT_COOLDOWN_UNTIL){
      setStatus('Ожидайте перезарядку посадки');
      return;
    }
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

function renderGameSummary(){
  const data=GAME_SUMMARY||{};
  const meta=summaryOutcomeMeta(data.outcome);
  const rawMode=(data.mode||ROOM_CACHE?.mode||'coop');
  const modeLabel=formatModeLabel(rawMode);
  const scoreLabel=safeStatNumber(data.score||0);
  const durationLabel=formatDuration(data.duration);
  const players=collectSummaryPlayers(data);
  const participantsHtml = players.length
    ? players.map(name=>`<span class="pill" onclick="openProfile('${name}')">${name}</span>`).join(' ')
    : '<span class="muted">Нет данных</span>';

  left.innerHTML = `<h2>Итоги боя</h2>
    <div class="muted">Комната: <b>${ROOM_CACHE?.name||'-'}</b></div>
    <div class="muted">Режим: <b>${modeLabel}</b></div>
    <div class="muted">Результат: <b>${meta.emoji} ${meta.title}</b></div>
    <div class="muted">Очки команды: <b>${scoreLabel}</b></div>
    <div class="muted">Длительность: <b>${durationLabel}</b></div>
    <div class="sep"></div>
    <button class="btn" onclick="returnToLobby()"><span>⬅️</span> Вернуться в лобби</button>
    ${ROOM_ID?`<button class="btn" onclick="rematch()"><span>🔁</span> Реванш</button>`:''}
    <div class="sep"></div>
    <div class="muted">Участники</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${participantsHtml}</div>
    <div class="sep"></div>
    <div class="muted">Статистика сохранится до старта следующей игры.</div>`;

  main.innerHTML = renderGameOverSummary(data);
}

function renderGameOverSummary(data){
  const payload=data||{};
  const meta=summaryOutcomeMeta(payload.outcome);
  const players=collectSummaryPlayers(payload);
  const stats=payload.stats&&typeof payload.stats==='object'?payload.stats:{};
  const kills=stats.kills&&typeof stats.kills==='object'?stats.kills:{};
  const coins=stats.coins&&typeof stats.coins==='object'?stats.coins:{};
  const plants=stats.plants&&typeof stats.plants==='object'?stats.plants:{};
  const destroyed=stats.destroyed&&typeof stats.destroyed==='object'?stats.destroyed:{};
  const resources=stats.resources&&typeof stats.resources==='object'?stats.resources:{};
  const scoreLabel=safeStatNumber(payload.score||0);
  const durationLabel=formatDuration(payload.duration);
  const rawMode=(payload.mode||ROOM_CACHE?.mode||'coop');
  const modeLabel=formatModeLabel(rawMode);
  const isPvP = String(rawMode||'').toLowerCase()==='pvp';
  const attackerName = typeof payload.attacker==='string' && payload.attacker ? payload.attacker : null;
  const defenderName = typeof payload.defender==='string' && payload.defender ? payload.defender : null;

  let pvpRewardNote='';
  if(isPvP){
    const coinTotals=players.map(name=>safeStatNumber(coins[name]));
    const bestReward=coinTotals.length? Math.max(...coinTotals) : 0;
    if(bestReward>0){
      const winners=players.filter(name=>safeStatNumber(coins[name])===bestReward);
      const winnerLabel=winners.join(', ');
      pvpRewardNote=`Победитель (${winnerLabel}) получил ${bestReward} монет (1 монета каждые 15 секунд матча).`;
    } else {
      pvpRewardNote='Монеты начисляются победителю: 1 монета каждые 15 секунд матча. В этот раз награда не начислена.';
    }
  }

  if(!players.length){
    return `<div class="empty-state" style="max-width:680px">
      <div class="empty-state__icon">📊</div>
      <div class="empty-state__title">Нет данных по матчу</div>
      <div class="empty-state__text">Статистика будет отображаться после завершения игры.</div>
    </div>`;
  }

  const cards=players.map(name=>{
    const killCount=safeStatNumber(kills[name]);
    const coinCount=safeStatNumber(coins[name]);
    const plantMap=plants[name];
    const destroyedMap=destroyed[name];
    const resourceMap=resources[name];
    let roleHint = 'Защитник';
    if(isPvP){
      if(attackerName && name===attackerName){
        roleHint='Зомби';
      } else if(defenderName && name===defenderName){
        roleHint='Защитник';
      } else {
        roleHint='Участник PvP';
      }
    }
    const isSelf = typeof USER==='string' && USER && name===USER;
    const cardClasses=['summary-card'];
    if(isSelf){ cardClasses.push('summary-card--self'); }
    let plantsHtml='<span class="muted">—</span>';
    if(plantMap && typeof plantMap==='object'){
      const entries=Object.entries(plantMap).filter(([,cnt])=>safeStatNumber(cnt)>0);
      entries.sort((a,b)=>{
        const ai=PLANT_ORDER_INDEX[a[0]] ?? 999;
        const bi=PLANT_ORDER_INDEX[b[0]] ?? 999;
        return ai-bi;
      });
      if(entries.length){
        plantsHtml=entries.map(([ptype,count])=>{
          const metaPlant=PLANT_META_MAP[ptype]||{};
          const icon=metaPlant.icon||'🪴';
          const title=metaPlant.name||ptype;
          const qty=safeStatNumber(count);
          return `<span class="pill" title="${title}">${icon} ×${qty}</span>`;
        }).join(' ');
      }
    }
    let destroyedHtml='';
    if(isPvP && attackerName && name===attackerName){
      let entries=[];
      if(destroyedMap && typeof destroyedMap==='object'){
        entries=Object.entries(destroyedMap).filter(([,cnt])=>safeStatNumber(cnt)>0);
        entries.sort((a,b)=>{
          const ai=PLANT_ORDER_INDEX[a[0]] ?? 999;
          const bi=PLANT_ORDER_INDEX[b[0]] ?? 999;
          return ai-bi;
        });
      }
      const totalDestroyed=entries.reduce((sum,[,cnt])=>sum+safeStatNumber(cnt),0);
      const listHtml=entries.length
        ? entries.map(([ptype,count])=>{
            const metaPlant=PLANT_META_MAP[ptype]||{};
            const icon=metaPlant.icon||'🪴';
            const title=metaPlant.name||ptype;
            const qty=safeStatNumber(count);
            return `<span class="pill" title="${title}">${icon} ×${qty}</span>`;
          }).join(' ')
        : '<span class="muted">—</span>';
      destroyedHtml=`<div><div class="muted">Уничтожено растений: <b>${safeStatNumber(totalDestroyed)}</b></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">${listHtml}</div></div>`;
    }
    let resourcesHtml='<span class="muted">—</span>';
    if(resourceMap && typeof resourceMap==='object'){
      const entries=Object.entries(resourceMap).filter(([,cnt])=>safeStatNumber(cnt)>0);
      entries.sort((a,b)=>{
        const metaA=RESOURCE_META_MAP[a[0]]||{};
        const metaB=RESOURCE_META_MAP[b[0]]||{};
        const nameA=(metaA.name||a[0]).toString();
        const nameB=(metaB.name||b[0]).toString();
        return nameA.localeCompare(nameB,'ru');
      });
      if(entries.length){
        resourcesHtml=entries.map(([code,count])=>{
          const meta=RESOURCE_META_MAP[code]||{};
          const icon=meta.icon||'📦';
          const title=meta.name||code;
          const qty=safeStatNumber(count);
          return `<span class="pill" title="${title}">${icon} ×${qty}</span>`;
        }).join(' ');
      }
    }
    return `<div class="${cardClasses.join(' ')}">
      <div style="display:flex;align-items:center;gap:12px">
        <img class="avatar" src="${avatarUrl(name)}&s=48" alt="${name}" style="width:48px;height:48px"/>
        <div>
          <div style="font-weight:600;font-size:16px">${name}</div>
          <div class="muted">${roleHint}</div>
        </div>
      </div>
      <div style="display:flex;gap:24px;flex-wrap:wrap">
        <div><div class="muted">Убито</div><div style="font-weight:700;font-size:22px">${killCount}</div></div>
        <div><div class="muted">Монеты</div><div style="font-weight:700;font-size:22px">${coinCount}</div></div>
      </div>
      <div>
        <div class="muted">Растения</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">${plantsHtml}</div>
      </div>
      <div>
        <div class="muted">Ресурсы</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">${resourcesHtml}</div>
      </div>
      ${destroyedHtml}
    </div>`;
  }).join('');

  return `<div style="width:100%;max-width:980px;display:flex;flex-direction:column;gap:20px">
    <div style="padding:28px;border-radius:26px;background:${meta.background};color:${meta.text};box-shadow:0 24px 60px rgba(15,23,42,0.15);display:flex;flex-direction:column;gap:8px">
      <div style="font-size:28px;font-weight:700;display:flex;align-items:center;gap:12px">${meta.emoji} ${meta.title}</div>
      <div style="font-size:14px;opacity:0.9">Режим: ${modeLabel} · Очки: ${scoreLabel} · Время: ${durationLabel}</div>
      ${pvpRewardNote?`<div style="font-size:14px;opacity:0.9">${pvpRewardNote}</div>`:''}
    </div>
    <div>
      <h3 style="margin:0 0 12px">Статистика игроков</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px">${cards}</div>
    </div>
  </div>`;
}

function buildZombieDeckUI(){
  const wrap=document.getElementById('zDeck');
  if(!wrap){ return; }
  if(!wrap.dataset.listenerBound){
    wrap.addEventListener('click',(ev)=>{
      const btn=ev.target.closest('button[data-z]'); if(!btn) return;
      const code=btn.getAttribute('data-z'); if(!ZOMBIE_DECK.includes(code)) return;
      CURRENT_Z_CARD=code; buildZombieDeckUI();
    });
    wrap.dataset.listenerBound='1';
  }
  const fallback=(PROFILE?.zombie_deck||DEFAULT_ZOMBIE_DECK).filter(z=>ZOMBIE_LIBRARY[z]);
  let source=[];
  if(Array.isArray(GAME_STATE?.zombie_deck)){
    source=GAME_STATE.zombie_deck.filter(z=>ZOMBIE_LIBRARY[z]);
  } else if(ZOMBIE_DECK.length){
    source=ZOMBIE_DECK.filter(z=>ZOMBIE_LIBRARY[z]);
  } else {
    source=fallback;
  }
  if(!source.length){
    source=DEFAULT_ZOMBIE_DECK.filter(z=>ZOMBIE_LIBRARY[z]);
    if(!source.length){ source=['normal']; }
  }
  ZOMBIE_DECK=source.slice(0,6);
  if(!CURRENT_Z_CARD || !ZOMBIE_DECK.includes(CURRENT_Z_CARD)) CURRENT_Z_CARD=ZOMBIE_DECK[0];
  const existing=new Map(Array.from(wrap.children).map(btn=>[btn.getAttribute('data-z'), btn]));
  ZOMBIE_DECK.forEach((code, idx)=>{
    let btn=existing.get(code);
    if(!btn){
      btn=createZombieCardElement(code);
    }
    existing.delete(code);
    const ref=wrap.children[idx];
    if(ref!==btn){
      wrap.insertBefore(btn, ref||null);
    }
    updateZombieCardElement(btn, code);
  });
  existing.forEach(btn=>btn.remove());
  updateZombieHUD();
}

function createZombieCardElement(code){
  const btn=document.createElement('button');
  btn.type='button';
  btn.classList.add('card');
  btn.setAttribute('data-z', code);
  const icon=document.createElement('div'); icon.className='icon'; btn.appendChild(icon);
  const text=document.createElement('div');
  const name=document.createElement('div'); name.className='z-name'; text.appendChild(name);
  const label=document.createElement('div'); label.className='muted z-label'; text.appendChild(label);
  btn.appendChild(text);
  return btn;
}

function updateZombieCardElement(btn, code){
  btn.setAttribute('data-z', code);
  btn.classList.add('card');
  const info=ZOMBIE_LIBRARY[code]||{};
  const cooldownRaw=Number(ZOMBIE_COOLDOWNS[code]||0);
  const cd=Number.isFinite(cooldownRaw)?Math.max(0, cooldownRaw):0;
  const ready = cd<=0 && ZOMBIE_POINTS >= (info.cost||0);
  btn.classList.toggle('selected', CURRENT_Z_CARD===code);
  btn.classList.toggle('disabled', !ready);
  const icon=btn.querySelector('.icon'); if(icon) icon.textContent=info.icon||'🧟';
  const name=btn.querySelector('.z-name'); if(name) name.textContent=info.name||code;
  const label=btn.querySelector('.z-label'); if(label){
    if(cd>0){ label.textContent=`${cd.toFixed(1)}s`; }
    else { label.textContent=`${info.cost||0}`; }
  }
}

function updateZombieHUD(){
  const pts=document.getElementById('zPoints'); if(pts) pts.textContent=Math.floor(ZOMBIE_POINTS||0);
  const wave=document.getElementById('zWave'); if(wave && GAME_STATE) wave.textContent=GAME_STATE.wave_number||1;
  const cd=document.getElementById('waveCd');
  if(cd){
    if(GAME_STATE){
      if(GAME_STATE.wave_ready){
        cd.textContent='Волна готова!';
      } else {
        cd.textContent=`Перезарядка волны: ${Math.ceil(GAME_STATE.wave_cd||0)}c`;
      }
    } else {
      cd.textContent='';
    }
  }
}
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
    const p=PLANTS.find(x=>x.code===code);
    n.style.outline = (code===CURRENT) ? '2px solid var(--accent)' : 'none';
    if(!p){ return; }
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
      const maxhp = cell.hp_max || PLANT_HP_HINT[cell.type] || 1;
      ctx.fillStyle='#065f46'; const hpw=Math.max(0,Math.min(1,cell.hp/maxhp))*w; ctx.fillRect(x,y-6,hpw,5);
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
  const waveTotal = Number.isFinite(Number(st.wave_total)) ? Math.max(0, Math.trunc(Number(st.wave_total))) : 0;
  const waveRemainingRaw = Number.isFinite(Number(st.wave_remaining)) ? Math.trunc(Number(st.wave_remaining)) : 0;
  const waveRemaining = Math.max(0, waveRemainingRaw);
  if(waveTotal>0 || waveRemaining>0){
    ctx.fillText('Осталось зомби: '+waveRemaining+' из '+Math.max(waveTotal, waveRemaining), 9*80+10, 144);
  }
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
      const maxhp = cell.hp_max || PLANT_HP_HINT[cell.type] || 1;
      ctx.fillStyle='#065f46'; const hpw=Math.max(0,Math.min(1,cell.hp/maxhp))*w; ctx.fillRect(x,y-6,hpw,5);
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
  const totalRaw = Number.isFinite(Number(st.wave_total)) ? Math.trunc(Number(st.wave_total)) : 0;
  const remainRaw = Number.isFinite(Number(st.wave_remaining)) ? Math.trunc(Number(st.wave_remaining)) : 0;
  const remain = Math.max(0, remainRaw);
  const total = Math.max(0, totalRaw);
  if(total>0 || remain>0){
    ctx.fillText('Осталось зомби: '+remain+' из '+Math.max(total, remain), 9*80+10, 96);
  }
  if(HOVER_CELL){
    ctx.strokeStyle='#111'; ctx.lineWidth=2; ctx.strokeRect(HOVER_CELL.c*80+2, HOVER_CELL.r*80+2, 80-4, 80-4);
    const modeRaw = ROOM_CACHE?.mode || '';
    if(String(modeRaw).toLowerCase()==='pvp' && CURRENT_Z_CARD){
      const targetX = HOVER_CELL.c*80+40;
      const targetY = HOVER_CELL.r*80+40;
      const spawnX = Math.max(targetX, 9*80-6);
      ctx.save();
      ctx.globalAlpha=0.55;
      ctx.strokeStyle='#f97316';
      ctx.fillStyle='#f97316';
      ctx.lineWidth=4;
      ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(spawnX, targetY);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();
      const headLength=14;
      const headWidth=8;
      ctx.beginPath();
      ctx.moveTo(targetX, targetY);
      ctx.lineTo(targetX+headLength, targetY-headWidth);
      ctx.lineTo(targetX+headLength, targetY+headWidth);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
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
  const cellRight=(c+1)*80;
  const threshold=cellRight - 0.3*80;
  if(Array.isArray(GAME_STATE.zombies)){
    for(const z of GAME_STATE.zombies){
      if(!z || z.row!==r) continue;
      const zx=Number(z.x);
      if(!Number.isFinite(zx)) continue;
      if(Math.floor(zx/80)!==c) continue;
      if(z.flying) continue;
      if(zx < threshold) return false;
    }
  }
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
