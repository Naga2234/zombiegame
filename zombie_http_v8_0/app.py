import eventlet
eventlet.monkey_patch()

import threading, time, random, json, os, re, hashlib
from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.config['SECRET_KEY'] = 'dev-secret'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

USERS_FILE = "users.json"
MATCHES_FILE = "matches.json"

HOST = "127.0.0.1"; PORT = 8000
ROWS, COLS, CELL_SIZE = 6, 9, 80
FIELD_WIDTH = COLS * CELL_SIZE
TICK_HZ = 20

SUN_PASSIVE_PER_SEC = 5.0
SUNFLOWER_GEN = 20
SUNFLOWER_PERIOD = 5.0

PLANT_COSTS = {"sunflower":50,"peashooter":100,"wallnut":50,"freeze":150,"bomb":200,
               "icepea":140,"potato":25,"spikeweed":70,"tallnut":125,"cabbage":160}
PLANT_HP = {"sunflower":120,"peashooter":120,"wallnut":600,"freeze":160,"bomb":100,
            "icepea":120,"potato":60,"spikeweed":180,"tallnut":1500,"cabbage":120}
PEA_DAMAGE = 20
BULLET_SPEED = 150  # slower projectiles

ZOMBIE_SPEED = 22
ZOMBIE_HP_BASE = 120
ZOMBIE_DPS = 18

# ---- Storage helpers ----
def load_json(path, default):
    if not os.path.exists(path): return default
    try:
        with open(path, "r", encoding="utf-8") as f: return json.load(f)
    except Exception: return default

def save_json_atomic(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f: json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)

def load_users(): return load_json(USERS_FILE, {})
def save_users(u): save_json_atomic(USERS_FILE, u)
def load_matches(): return load_json(MATCHES_FILE, [])
def save_matches(m): save_json_atomic(MATCHES_FILE, m)

def ensure_user(user):
    users=load_users()
    if user not in users:
        users[user]={"password":"","score":0,"games_played":0,"games_won":0,"plants_placed":0,
                     "coins":0,"owned":["peashooter","sunflower","wallnut"]}
        save_users(users)

def hash_pw(pw:str) -> str: return hashlib.sha256(pw.encode("utf-8")).hexdigest()

def validate_username(name:str):
    if not name: return "Введите логин"
    if len(name) < 3 or len(name) > 20: return "Логин от 3 до 20 символов"
    if not re.fullmatch(r"[A-Za-z0-9._-]+", name): return "Разрешены буквы/цифры/._-"
    return None

def validate_password(pw:str):
    if not pw or len(pw) < 4: return "Пароль от 4 символов"
    return None

# ---- Game init ----
def roll_weather(wave_number:int):
    # simple: 1-clear, 2-fog, 3-rain cycles, later random
    if wave_number % 3 == 2: return "fog"
    if wave_number % 3 == 0: return "rain"
    return "clear"

def init_game_state(room):
    grid = [[None for _ in range(COLS)] for __ in range(ROWS)]
    waves = [
        {"name":"Волна 1","spawn":[("normal",10)], "interval":1.60},
        {"name":"Волна 2","spawn":[("normal",10),("cone",3)], "interval":1.50},
        {"name":"Волна 3 (рой)","spawn":[("swarm",22)], "interval":0.60},
        {"name":"Волна 4","spawn":[("normal",8),("cone",6),("fast",6)], "interval":1.25},
        {"name":"Волна 5 (воздушные)","spawn":[("air",10),("fast",6)], "interval":1.10},
        {"name":"Волна 6","spawn":[("bucket",8),("cart",3),("fast",6)], "interval":1.00},
        {"name":"Волна 7","spawn":[("shield",4),("regen",6),("cone",6)], "interval":0.95},
        {"name":"Волна 8 (босс)","spawn":[("boss",1),("bucket",6),("screamer",4)], "interval":1.30},
    ]
    pending = []
    for typ, cnt in waves[0]["spawn"]:
        for _ in range(cnt):
            half = random.choice([0,1])
            pending.append({"type":typ,"half":half})
    random.shuffle(pending)

    # per-player sun and coins (kills)
    suns = {u:150 for u in room["players"]}
    coins = {u:0 for u in room["players"]}

    room["game"] = {
        "grid":grid,"zombies":[],"bullets":[],
        "suns":suns,"coins":coins,
        "score":0,"running":True,
        "start_time":time.time(),
        "sunflower_timers":{},"special_timers":{},
        "outcome": None,
        "wave_number":1,"waves":waves,
        "wave_pending":pending, "wave_interval":waves[0]["interval"],
        "wave_spawn_timer":0.0, "wave_done":[False,False], "await_next":False,
        "weather": roll_weather(1)
    }

def spawn_zombie(room, typ="normal", half=None):
    st=room["game"]
    if half is None: half = random.choice([0,1])
    row = random.randint(0,2) if half==0 else random.randint(3,5)

    def mk(hp_mult=1.0, spd_mult=1.0, dps_mult=1.0, special=None):
        return {"row":row,"x":FIELD_WIDTH-10,
                "hp":int(ZOMBIE_HP_BASE*hp_mult),"hp_max":int(ZOMBIE_HP_BASE*hp_mult),
                "speed":ZOMBIE_SPEED*spd_mult,"dps":int(ZOMBIE_DPS*dps_mult),
                "frozen":0,"type":typ,"special":special,"half":half,
                "charge_cool":0.0,"last_hit":0.0,"last_hit_by":None,
                "flying_until_x": None}

    if typ=="normal": z=mk()
    elif typ=="cone": z=mk(1.6,0.95,1.0)
    elif typ=="bucket": z=mk(2.4,0.9,1.0)
    elif typ=="fast": z=mk(0.7,1.7,0.8)
    elif typ=="swarm": z=mk(0.5,1.6,0.7)
    elif typ=="kamikaze": z=mk(0.9,1.15,0.0,"explode")
    elif typ=="cart": z=mk(1.2,2.0,1.2,"charge")
    elif typ=="screamer": z=mk(0.9,1.0,0.6,"aura")
    elif typ=="shield":
        z=mk(0.9,0.9,1.0,"shield"); z["shield_hp"]=int(ZOMBIE_HP_BASE*1.2)
    elif typ=="regen":
        z=mk(1.1,1.0,1.0,"regen"); z["regen_rate"]=8.0
    elif typ=="brute": # legacy
        z=mk(6.5,0.7,1.8,"brute"); z["stomp_cool"]=0.0
    elif typ=="boss":
        z=mk(10.0,0.7,2.0,"boss"); z["smash_cool"]=0.0
    elif typ=="air":
        z=mk(0.9,1.2,0.8,"air"); z["flying_until_x"]=3*CELL_SIZE
    else: z=mk()

    st["zombies"].append(z)

def build_next_wave(st, players):
    idx = st["wave_number"]
    if idx >= len(st["waves"]):
        st["outcome"]="win"; st["running"]=False; return
    spec = st["waves"][idx]
    pending = []
    for typ, cnt in spec["spawn"]:
        for _ in range(cnt):
            half = random.choice([0,1])
            pending.append({"type":typ,"half":half})
    random.shuffle(pending)
    st["wave_number"] += 1
    st["wave_pending"] = pending
    st["wave_interval"] = spec["interval"]
    st["wave_spawn_timer"]=0.0
    st["wave_done"]=[False,False]
    st["await_next"]=False
    st["weather"]=roll_weather(st["wave_number"])
    # ensure sun dict includes all current players
    for u in players:
        st["suns"].setdefault(u, 150)
        st["coins"].setdefault(u, 0)

def step_game(room,dt):
    st=room["game"]
    if not st or not st["running"]: return

    # passive sun: per-player; stop for finished half
    for i,u in enumerate(room["players"][:2]):
        half = 0 if i==0 else 1
        if st.get("await_next") and st["wave_done"][half]:
            continue
        st["suns"][u] = st["suns"].get(u,0) + SUN_PASSIVE_PER_SEC*dt

    # wave spawn
    st["wave_spawn_timer"] += dt
    if st["wave_pending"] and st["wave_spawn_timer"] >= st["wave_interval"]:
        task = st["wave_pending"].pop()
        spawn_zombie(room, task["type"], task["half"])
        st["wave_spawn_timer"] = 0.0

    now = time.time()
    # plants
    for r in range(ROWS):
        for c in range(COLS):
            plant = st["grid"][r][c]
            if not plant: continue
            ptype = plant["type"]; owner = plant.get("owner")
            if ptype=="sunflower":
                rain_boost = 0.7 if st["weather"]=="rain" else 1.0
                key=f"{r},{c}"; last=st["sunflower_timers"].get(key,0.0)
                # stop sunflower if half finished and awaiting
                half = 0 if r<=2 else 1
                if st.get("await_next") and st["wave_done"][half]: pass
                else:
                    if now-last>=SUNFLOWER_PERIOD*rain_boost:
                        if owner: st["suns"][owner] = st["suns"].get(owner,0) + SUNFLOWER_GEN
                        st["sunflower_timers"][key]=now
            elif ptype in ("peashooter","icepea","cabbage"):  # fire only when zombie visible in row
                plant["cd"]-=dt
                if plant["cd"]<=0:
                    px=c*CELL_SIZE+40
                    # fog reduces visibility
                    sight = FIELD_WIDTH if st["weather"]!="fog" else 220
                    visible = any((z["row"]==r and z["x"]>px and (z["x"]-px)<=sight) for z in st["zombies"])
                    if visible:
                        if ptype=="peashooter":
                            st["bullets"].append({"row":r,"x":px,"vx":BULLET_SPEED,"dmg":PEA_DAMAGE,"effect":None,"owner":owner})
                            plant["cd"]=0.8
                        elif ptype=="icepea":
                            st["bullets"].append({"row":r,"x":px,"vx":BULLET_SPEED,"dmg":16,"effect":"freeze","owner":owner})
                            plant["cd"]=1.0
                        elif ptype=="cabbage":
                            st["bullets"].append({"row":r,"x":px,"vx":int(BULLET_SPEED*0.9),"dmg":40,"effect":None,"owner":owner})
                            plant["cd"]=1.4
            elif ptype=="freeze":
                key=f"freeze_{r},{c}"; last=st["special_timers"].get(key,0.0)
                if now-last>=10:
                    for z in st["zombies"]: z["frozen"]=3
                    st["special_timers"][key]=now
            elif ptype=="bomb":
                key=f"bomb_{r},{c}"
                if key not in st["special_timers"]: st["special_timers"][key]=now
                if now-st["special_timers"][key]>=5:
                    bx=c*CELL_SIZE
                    for z in list(st["zombies"]):
                        if abs(z["row"]-r)<=1 and abs(z["x"]-bx)<120:
                            z["hp"]-=240; z["last_hit"]=now; z["last_hit_by"]=owner
                            if z["hp"]<=0 and z in st["zombies"]:
                                st["zombies"].remove(z); st["score"]+=20
                                if owner: st["coins"][owner]=st["coins"].get(owner,0)+1
                    st["grid"][r][c]=None
            elif ptype=="potato":
                if "armed_at" not in plant: plant["armed_at"]=now+3.0
                if now>=plant["armed_at"]:
                    left=c*CELL_SIZE; right=(c+1)*CELL_SIZE
                    triggered=False
                    for z in list(st["zombies"]):
                        if z["row"]==r and left-2 <= z["x"] <= right+2:
                            z["hp"]-=260; z["last_hit"]=now; z["last_hit_by"]=owner; triggered=True
                            if z["hp"]<=0 and z in st["zombies"]:
                                st["zombies"].remove(z); st["score"]+=25
                                if owner: st["coins"][owner]=st["coins"].get(owner,0)+1
                    if triggered: st["grid"][r][c]=None
            elif ptype=="spikeweed":
                left=c*CELL_SIZE; right=(c+1)*CELL_SIZE
                for z in list(st["zombies"]):
                    if z["row"]==r and left<=z["x"]<=right:
                        if z.get("special")=="air" and z.get("flying_until_x",0) and z["x"]>z["flying_until_x"]: # immune while flying
                            continue
                        z["hp"]-=12*dt; z["last_hit"]=now; z["last_hit_by"]=owner
                        if z["hp"]<=0 and z in st["zombies"]:
                            st["zombies"].remove(z); st["score"]+=8
                            if owner: st["coins"][owner]=st["coins"].get(owner,0)+1

    # bullets
    for b in list(st["bullets"]):
        b["x"]+=b["vx"]*dt
        if b["x"]>FIELD_WIDTH: st["bullets"].remove(b)
    for b in list(st["bullets"]):
        for z in list(st["zombies"]):
            if z["row"]==b["row"] and z["x"]-20<=b["x"]<=z["x"]+20:
                dmg = b.get("dmg", PEA_DAMAGE)
                if z.get("shield_hp",0)>0: z["shield_hp"] -= dmg
                else: z["hp"] -= dmg
                if b.get("effect")=="freeze": z["frozen"] += 1.0
                z["last_hit"]=time.time(); z["last_hit_by"]=b.get("owner")
                if b in st["bullets"]: st["bullets"].remove(b)
                if z["hp"]<=0:
                    if z in st["zombies"]:
                        st["zombies"].remove(z); st["score"]+=10
                        owner = z.get("last_hit_by")
                        if owner: st["coins"][owner]=st["coins"].get(owner,0)+1
                break

    # aura list per row
    screamers = {r:[] for r in range(ROWS)}
    for z in st["zombies"]:
        if z["type"]=="screamer":
            screamers[z["row"]].append(z["x"])

    # zombies move
    now=time.time()
    for z in list(st["zombies"]):
        if z.get("special")=="regen" and now - z.get("last_hit",0) > 2.0:
            z["hp"] = min(z["hp_max"], z["hp"] + z.get("regen_rate",8.0)*dt)
        if z["frozen"]>0:
            z["frozen"]-=dt
        else:
            col=max(0,min(COLS-1,int(z["x"]//CELL_SIZE)))
            plant=st["grid"][z["row"]][col]
            # flying check
            if z.get("special")=="air" and z.get("flying_until_x") and z["x"]>z["flying_until_x"]:
                plant=None  # ignore plants while flying
            if plant:
                if z["special"]=="explode":
                    for rr in range(max(0,z["row"]-1), min(ROWS, z["row"]+2)):
                        for cc in range(max(0,col-1), min(COLS, col+2)):
                            if st["grid"][rr][cc]:
                                st["grid"][rr][cc]["hp"]-=160
                                if st["grid"][rr][cc]["hp"]<=0: st["grid"][rr][cc]=None
                    if z in st["zombies"]: st["zombies"].remove(z)
                    continue
                if z["special"]=="charge" and z["charge_cool"]<=0:
                    z["x"] -= 50; z["charge_cool"]=2.5
                elif z["special"]=="boss":
                    # smash: destroy 2x3 around contact every 2.5s
                    if z["smash_cool"]<=0:
                        z["smash_cool"]=2.5
                        for rr in range(max(0,z["row"]-1), min(ROWS, z["row"]+2)):
                            for cc in range(max(0,col-1), min(COLS, col+2)):
                                if st["grid"][rr][cc]: st["grid"][rr][cc]=None
                    else:
                        z["smash_cool"]-=dt
                    # also damages if plant survives
                    if st["grid"][z["row"]][col]:
                        st["grid"][z["row"]][col]["hp"]-=z["dps"]*dt
                        if st["grid"][z["row"]][col]["hp"]<=0: st["grid"][z["row"]][col]=None
                else:
                    plant["hp"]-=z["dps"]*dt
                    if plant["hp"]<=0: st["grid"][z["row"]][col]=None
                if z["charge_cool"]>0: z["charge_cool"]-=dt
            else:
                buff=1.0
                if screamers.get(z["row"]):
                    for sx in screamers[z["row"]]:
                        if abs(sx - z["x"]) < 160: buff=1.25; break
                z["x"]-=z["speed"]*buff*dt

        if z["x"]<0 and st["outcome"] is None:
            st["outcome"] = "lose"; st["running"]=False

    # wave completion check per half
    if not st["wave_pending"]:
        any0 = any((0<=z["row"]<=2) for z in st["zombies"])
        any1 = any((3<=z["row"]<=5) for z in st["zombies"])
        st["wave_done"][0] = st["wave_done"][0] or (not any0)
        st["wave_done"][1] = st["wave_done"][1] or (not any1)
        if st["wave_done"][0] and st["wave_done"][1] and not st["await_next"]:
            st["await_next"]=True
            socketio.emit("wave_cleared", {"room_id": room["id"], "wave": st["wave_number"]}, to=room["id"])

def snapshot(room, me):
    st = room.get("game")
    if not st: return None
    small_grid=[[None if not cell else {"type":cell["type"],"hp":int(cell["hp"])} for cell in row] for row in st["grid"]]
    return {"grid":small_grid,
            "zombies":[{"row": z["row"], "x": z["x"], "hp": int(z["hp"]), "frozen": (z["frozen"]>0), "type": z.get("type","normal"),
                        "shield": int(z.get("shield_hp",0))} for z in st["zombies"]],
            "bullets":[{"row":b["row"],"x":b["x"]} for b in st["bullets"]],
            "sun":int(st["suns"].get(me,0)),"score":int(st["score"]),
            "running":st["running"],"outcome": st["outcome"],
            "wave_number": st["wave_number"],
            "await_next": st["await_next"],
            "wave_done": st["wave_done"],
            "coins": int(st["coins"].get(me,0)),
            "weather": st.get("weather","clear")}

def room_payload(room_id):
    r=rooms.get(room_id)
    return {"room":{
        "room_id": room_id,
        "name": r.get("name","Без названия"),
        "mode": r["mode"], "owner": r["owner"],
        "players":[{"name":u,"ready":bool(r["ready"].get(u,False))} for u in r["players"]],
        "max_players":r["max_players"],
        "started":r["started"],
        "countdown_until": r.get("countdown_until"),
        "chat": r["chat"][-100:],
        "locked": bool(r.get("password"))
    }}

def game_loop(room_id):
    t_prev=time.time()
    last_cd_broadcast=0
    while True:
        with rooms_lock:
            room=rooms.get(room_id)
            if not room: return
            if not room["players"] and not room.get("started"):
                rooms.pop(room_id, None)
                socketio.emit("room_deleted", {"room_id": room_id})
                return
            if room.get("countdown_until"):
                now=time.time()
                if now-last_cd_broadcast>=1.0:
                    socketio.emit("room_update", room_payload(room_id), to=room_id)
                    last_cd_broadcast=now
                if now >= room["countdown_until"] and not room.get("started"):
                    room["started"]=True
                    init_game_state(room)
                    room["countdown_until"]=None
                    socketio.emit("room_update", room_payload(room_id), to=room_id)
                    socketio.emit("game_started", {"room_id": room_id}, to=room_id)
                    socketio.emit("chat", {"user":"system","text":"Бой начался! Волна 1"}, to=room_id)

        now=time.time(); dt=now-t_prev; t_prev=now
        with rooms_lock:
            room=rooms.get(room_id)
            if not room: return
            if room.get("started"):
                st = room.get("game")
                if st and st["running"]:
                    step_game(room,dt)
                else:
                    outcome = st["outcome"] if st else "lose"
                    duration = int(time.time() - st["start_time"]) if st else 0
                    score = int(st["score"]) if st else 0
                    users=load_users(); matches=load_matches()
                    match_entry = {"room_id": room_id, "players": list(room["players"]), "score": score,
                                   "outcome": outcome, "duration": duration, "ended_at": int(time.time())}
                    matches.append(match_entry); save_matches(matches)
                    # award coins
                    for u in room["players"]:
                        ensure_user(u)
                        users=load_users()
                        users[u]["score"]=users[u].get("score",0)+score
                        users[u]["games_played"]=users[u].get("games_played",0)+1
                        if outcome=="win":
                            users[u]["games_won"]=users[u].get("games_won",0)+1
                        users[u]["coins"]=users[u].get("coins",0)+int(st["coins"].get(u,0))
                        save_users(users)
                    room["started"]=False; room["game"]=None
                    socketio.emit("room_update", room_payload(room_id), to=room_id)
                    socketio.emit("game_over", {"room_id": room_id, "outcome": outcome}, to=room_id)

        with rooms_lock:
            room=rooms.get(room_id)
            if room and room.get("started"):
                # personalized state per player
                for u in room["players"]:
                    socketio.emit("state_update", {"room_id": room_id, "state": snapshot(room, u)}, to=room_id)

        socketio.sleep(1.0/TICK_HZ)

rooms = {}; rooms_lock = threading.Lock()

# -------- HTTP ----------
@app.route("/")
def index(): return send_from_directory("static","index.html")

@app.route("/app.js")
def appjs(): return send_from_directory("static","app.js")

@app.route("/api/register", methods=["POST"])
def api_register():
    data=request.json or {}
    u, p = (data.get("username") or "").strip(), (data.get("password") or "")
    err = validate_username(u) or validate_password(p)
    if err: return jsonify({"status":"error","msg":err}), 400
    users=load_users()
    if u in users: return jsonify({"status":"error","msg":"Пользователь уже существует"}), 409
    users[u]={"password":hash_pw(p),"score":0,"games_played":0,"games_won":0,"plants_placed":0,
              "coins":0,"owned":["peashooter","sunflower","wallnut"]}
    save_users(users)
    return jsonify({"status":"ok"})

@app.route("/api/login", methods=["POST"])
def api_login():
    data=request.json or {}
    u, p = (data.get("username") or "").strip(), (data.get("password") or "")
    users=load_users()
    if u not in users or users[u]["password"]!=hash_pw(p):
        return jsonify({"status":"error","msg":"Неверный логин или пароль"}),401
    prof={k:v for k,v in users[u].items() if k!="password"}
    return jsonify({"status":"ok","profile":prof})

@app.route("/api/leaderboard")
def api_leaderboard():
    users=load_users()
    top=sorted(users.items(), key=lambda kv: kv[1].get("score",0), reverse=True)[:10]
    res=[{"user":u, **{k:v for k,v in d.items() if k!='password'}} for u,d in top]
    return jsonify({"status":"ok","leaders":res})

@app.route("/api/profile")
def api_profile():
    u=(request.args.get("u") or "").strip()
    users=load_users(); matches=load_matches()
    user_matches=[m for m in matches if u in m.get("players",[])]
    best = max([m.get("score",0) for m in user_matches], default=0)
    recent = sorted(user_matches, key=lambda m: m.get("ended_at",0), reverse=True)[:10]
    return jsonify({"status":"ok","best":best,"recent":recent,"profile":{k:v for k,v in users.get(u,{}).items() if k!="password"}})

# ---- Store ----
STORE_ITEMS = [
    {"item":"icepea","type":"plant","price":20,"name":"Ледяной (Ice Pea)","icon":"🧊"},
    {"item":"cabbage","type":"plant","price":25,"name":"Капуст. пушка","icon":"🥬"},
    {"item":"spikeweed","type":"plant","price":18,"name":"Шипы","icon":"🌵"},
    {"item":"tallnut","type":"plant","price":30,"name":"Толст. орех","icon":"🧱"},
    {"item":"potato","type":"plant","price":12,"name":"Картоф. мина","icon":"🥔"},
    {"item":"freeze","type":"plant","price":28,"name":"Заморозка","icon":"❄️"},
    {"item":"bomb","type":"plant","price":35,"name":"Бомба","icon":"💣"},
    {"item":"zombies_pack","type":"zombie","price":99,"name":"Пак зомби (PvP WIP)","icon":"🧟"},
]

@app.route("/api/store")
def api_store():
    u=(request.args.get("u") or "").strip()
    users=load_users(); owned=set(users.get(u,{}).get("owned",[]))
    items=[]
    for it in STORE_ITEMS:
        items.append({**it,"owned": it["item"] in owned})
    coins = int(users.get(u,{}).get("coins",0))
    return jsonify({"status":"ok","coins":coins,"items":items})

@app.route("/api/buy", methods=["POST"])
def api_buy():
    data=request.json or {}
    u=(data.get("username") or "").strip()
    item=(data.get("item") or "").strip()
    users=load_users()
    if u not in users: return jsonify({"status":"error","msg":"Пользователь не найден"}),404
    info = next((x for x in STORE_ITEMS if x["item"]==item), None)
    if not info: return jsonify({"status":"error","msg":"Товар не найден"}),404
    if item in users[u].get("owned",[]): return jsonify({"status":"error","msg":"Уже куплено"}),400
    price=int(info["price"])
    if users[u].get("coins",0) < price: return jsonify({"status":"error","msg":"Не хватает монет"}),400
    users[u]["coins"]-=price
    users[u].setdefault("owned",[]).append(item)
    save_users(users)
    return jsonify({"status":"ok","coins":users[u]["coins"],"owned":users[u]["owned"]})

# -------- Socket.IO ----------
@socketio.on("connect")
def on_connect():
    emit("connected", {"ok":True})

@socketio.on("join_room")
def on_join_room(data):
    username=(data.get("username") or "").strip()
    room_id=(data.get("room_id") or "").strip()
    passwd=(data.get("password") or "").strip()
    with rooms_lock:
        r=rooms.get(room_id)
        if not r: emit("join_result", {"status":"error","msg":"Комната не найдена"}); return
        if r.get("password") and r["password"] != passwd:
            emit("join_result", {"status":"error","msg":"Неверный пароль"}); return
        if username not in r["players"] and not r["started"] and len(r["players"])<r["max_players"]:
            r["players"].append(username); r["ready"][username]=False
            r["chat"].append({"user":"system","text":f"{username} присоединился"})
        join_room(room_id)
        emit("join_result", {"status":"ok","room": room_payload(room_id)["room"]})
        socketio.emit("room_update", room_payload(room_id), to=room_id)
        socketio.emit("chat", {"user":"system","text":f"{username} присоединился"}, to=room_id)

@socketio.on("rejoin")
def on_rejoin(data):
    username = (data.get("username") or "").strip()
    room_id = (data.get("room_id") or "").strip()
    with rooms_lock:
        r=rooms.get(room_id)
        if not r: emit("error", {"msg":"Комната не найдена"}); return
        join_room(room_id)
        socketio.emit("room_update", room_payload(room_id), to=room_id)

@socketio.on("leave_room")
def on_leave_room(data):
    username=(data.get("username") or "").strip()
    room_id=(data.get("room_id") or "").strip()
    with rooms_lock:
        r=rooms.get(room_id)
        if not r: return
        if username in r["players"] and not r["started"]:
            r["players"].remove(username)
            r["ready"].pop(username, None)
            r["chat"].append({"user":"system","text":f"{username} вышел"})
            socketio.emit("chat", {"user":"system","text":f"{username} вышел"}, to=room_id)
        if not r["started"] and r["players"] and r["owner"] not in r["players"]:
            r["owner"] = r["players"][0]
            r["chat"].append({"user":"system","text":f"Новый хост — {r['owner']}"})
            socketio.emit("chat", {"user":"system","text":f"Новый хост — {r['owner']}"}, to=room_id)
        if not r["players"] and not r["started"]:
            rooms.pop(room_id, None)
            socketio.emit("room_deleted", {"room_id": room_id})
            return
        socketio.emit("room_update", room_payload(room_id), to=room_id)

@socketio.on("toggle_ready")
def on_toggle_ready(data):
    username=(data.get("username") or "").strip()
    room_id=(data.get("room_id") or "").strip()
    with rooms_lock:
        r=rooms.get(room_id)
        if not r or r.get("started"): return
        cur = bool(r["ready"].get(username, False))
        r["ready"][username] = not cur
        socketio.emit("room_update", room_payload(room_id), to=room_id)

@socketio.on("start")
def on_start(data):
    username=(data.get("username") or "").strip()
    room_id=(data.get("room_id") or "").strip()
    with rooms_lock:
        r=rooms.get(room_id)
        if not r: return
        if r["owner"]!=username: emit("error", {"msg":"Только хост может стартовать"}); return
        if len(r["players"])!=r["max_players"] or not all(r["ready"].get(u,False) for u in r["players"]):
            emit("error", {"msg":"Не все готовы"}); return
        r["countdown_until"] = time.time() + 10
        r["chat"].append({"user":"system","text":"Старт через 10 секунд!"})
        socketio.emit("room_update", room_payload(room_id), to=room_id)
        socketio.emit("chat", {"user":"system","text":"Старт через 10 секунд!"}, to=room_id)

@socketio.on("next_wave")
def on_next_wave(data):
    room_id=(data.get("room_id") or "").strip()
    with rooms_lock:
        r=rooms.get(room_id)
        if not r or not r.get("started") or not r.get("game"): return
        st=r["game"]
        if st.get("await_next"):
            build_next_wave(st, r["players"])
            socketio.emit("chat", {"user":"system","text":f"Волна {st['wave_number']}! Погода: {st['weather']}"}, to=room_id)

@socketio.on("transfer_sun")
def on_transfer_sun(data):
    room_id=(data.get("room_id") or "").strip()
    src=(data.get("from") or "").strip()
    dst=(data.get("to") or "").strip()
    amt=float(data.get("amount",0))
    if amt<=0: return
    with rooms_lock:
        r=rooms.get(room_id)
        if not r or not r.get("started") or not r.get("game"): return
        st=r["game"]
        cur = st["suns"].get(src,0.0)
        if cur >= amt:
            st["suns"][src]=cur-amt
            st["suns"][dst]=st["suns"].get(dst,0.0)+amt
            socketio.emit("chat", {"user":"system","text":f"{src} передал {int(amt)} солнца игроку {dst}"}, to=room_id)

@socketio.on("place_plant")
def on_place_plant(data):
    rid=data.get("room_id"); username=(data.get("username") or "").strip()
    r=int(data.get("row")); c=int(data.get("col")); ptype=data.get("ptype")
    with rooms_lock:
        room=rooms.get(rid)
        if not room or not room.get("started") or not room.get("game"):
            emit("action_result", {"status":"error","msg":"Игра не идёт"}); return
        st=room["game"]
        # ownership check (shop)
        users=load_users(); owned=set(users.get(username,{}).get("owned",["peashooter","sunflower","wallnut"]))
        if ptype not in owned:
            emit("action_result", {"status":"error","msg":"Растение не куплено"}); return
        idx=room["players"].index(username) if username in room["players"] else 0
        allowed=range(0,3) if idx==0 else range(3,6)
        if r not in allowed: emit("action_result", {"status":"error","msg":"Не ваша зона"}); return
        if st["grid"][r][c] is not None: emit("action_result", {"status":"error","msg":"Занято"}); return
        if ptype not in PLANT_COSTS: emit("action_result", {"status":"error","msg":"Неизвестное растение"}); return
        cost=PLANT_COSTS[ptype]
        if st["suns"].get(username,0)<cost: emit("action_result", {"status":"error","msg":"Нет солнца"}); return
        st["suns"][username]-=cost
        st["grid"][r][c]={"type":ptype,"hp":PLANT_HP[ptype],"owner":username,"cd":0.0}
        emit("action_result", {"status":"ok"})

# ---- Rooms HTTP ----
@app.route("/api/create_room", methods=["POST"])
def api_create_room():
    data=request.json or {}
    username=(data.get("username") or "").strip()
    room_name=(data.get("name") or "").strip() or "Без названия"
    mode=data.get("mode","coop")
    password=(data.get("password") or "").strip()
    max_players=int(data.get("max_players",2))
    if max_players<2: max_players=2
    with rooms_lock:
        rid=str(len(rooms)+1)
        rooms[rid]={
            "id": rid,
            "name": room_name, "password": password,
            "mode":mode,"max_players":max_players,"players":[username],
            "ready":{username:False},"started":False,"game":None,"owner":username,
            "countdown_until": None, "chat":[{"user":"system","text":f"Комната «{room_name}» создана хостом {username}"}]
        }
        socketio.start_background_task(game_loop, rid)
    return jsonify({"status":"ok","room_id":rid})

@app.route("/api/list_rooms")
def api_list_rooms():
    out = []
    with rooms_lock:
        for rid, r in rooms.items():
            out.append({
                "room_id": rid, "name": r.get("name","Без названия"),
                "mode": r["mode"], "locked": bool(r.get("password")),
                "players": [{"name": u, "ready": bool(r["ready"].get(u, False))} for u in r["players"]],
                "max_players": r["max_players"], "started": r["started"]
            })
    return jsonify({"status":"ok","rooms":out})

if __name__=="__main__":
    socketio.run(app, host=HOST, port=PORT, debug=False)
