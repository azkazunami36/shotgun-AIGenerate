class ShotgunRouletteApp {
  constructor() {
    // Theme
    this.THEME_KEY = "sg_roulette_theme_v013";
    this.defaultTheme = {
      flashColor: "#ffffff",
      background: null,
      panel: null,
      avatars: { P1:null, P2:null, P3:null, P4:null },
      icons: { "ノコギリ":null, "拡大鏡":null, "ビール":null, "タバコ":null, "手錠":null },
      sounds: { blank:null, live:null, click:null, volume:{ master:1, blank:1, live:1, click:1 }, muted:false }
    };
    this.theme = JSON.parse(JSON.stringify(this.defaultTheme));

    // Game options (separate page)
    this.GAME_OPTS_KEY = "sg_roulette_gameopts_v013";
    this.gameOpts = { hideChamberRemain: false };

    // Game state
    this.ITEMS = ["ノコギリ","拡大鏡","ビール","タバコ","手錠"];
    this.state = {
      players: [], playerCount: 4, initHp: 5,
      chamber: [], chamberTotal: 0, round: 0,
      currentIndex: 0, peekInfo: null, autoNextOnEmptySelfShot: true
    };

    this.el = id => document.getElementById(id);
  }

  /* ===== Boot ===== */
  async boot(){
    // Routing
    window.addEventListener("hashchange", ()=> this.route());
    this.route(); // initial

    await this.loadAssetsThenLocal();
    this.loadGameOpts();
    this.initUI();
  }
  route(){
    const hash = location.hash || "#/game";
    const game = this.el("view-game");
    const settings = this.el("view-settings");
    const navGame = this.el("navGame");
    const navSettings = this.el("navSettings");
    [navGame,navSettings].forEach(n=>n.classList.remove("active"));

    if(hash.startsWith("#/settings")){
      game.classList.add("hidden");
      settings.classList.remove("hidden");
      navSettings.classList.add("active");
    } else {
      settings.classList.add("hidden");
      game.classList.remove("hidden");
      navGame.classList.add("active");
    }
  }

  /* ===== Theme IO ===== */
  async loadAssetsThenLocal(){
    try{
      const r = await fetch("assets/config.json", {cache:"no-store"});
      if(r.ok){
        const cfg = await r.json();
        this.theme = { ...this.theme, ...cfg };
        this.theme.sounds = this.theme.sounds || {};
        this.theme.sounds.volume = { master:1, blank:1, live:1, click:1, ...(this.theme.sounds.volume||{}) };
        this.theme.sounds.muted = !!this.theme.sounds.muted;
      }
    }catch(e){ console.info("assets/config.json スキップ", e); }

    try{
      const s = localStorage.getItem(this.THEME_KEY);
      if(s){
        const override = JSON.parse(s);
        this.theme = { ...this.theme, ...override };
        this.theme.avatars = { ...(this.theme.avatars||{}), ...(override.avatars||{}) };
        this.theme.icons   = { ...(this.theme.icons||{}),   ...(override.icons||{}) };
        this.theme.sounds  = { ...(this.theme.sounds||{}),  ...(override.sounds||{}) };
        this.theme.sounds.volume = { master:1, blank:1, live:1, click:1, ...(((override.sounds||{}).volume)||((this.theme.sounds||{}).volume)||{}) };
        this.theme.sounds.muted = !!((override.sounds||{}).muted ?? this.theme.sounds.muted);
      }
    }catch(e){ console.warn("localStorage 読込失敗", e); }

    this.applyThemeToDOM();
    this.renderPlayers();
    this.syncSoundUI();
  }
  saveThemeToStorage(){
    try{ localStorage.setItem(this.THEME_KEY, JSON.stringify(this.theme)); alert("保存しました。"); }
    catch(e){ alert("保存に失敗しました（容量超過の可能性）"); }
  }
  resetTheme(){
    if(!confirm("UI設定をリセットしますか？")) return;
    this.theme = JSON.parse(JSON.stringify(this.defaultTheme));
    this.applyThemeToDOM(); this.renderPlayers(); this.syncSoundUI();
  }
  exportTheme(){
    const blob = new Blob([JSON.stringify(this.theme,null,2)], {type:"application/json"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "sg_roulette_theme_v013.json"; a.click(); URL.revokeObjectURL(a.href);
  }
  importTheme(file){
    const fr = new FileReader();
    fr.onload = () => {
      try{
        const data = JSON.parse(fr.result);
        this.theme = { ...this.defaultTheme, ...(data||{}) };
        this.applyThemeToDOM(); this.renderPlayers(); this.syncSoundUI();
        alert("インポート完了");
      }catch(e){ alert("インポート失敗：JSON形式を確認してください。"); }
    };
    fr.readAsText(file);
  }
  applyThemeToDOM(){
    document.documentElement.style.setProperty("--bg-image", this.theme.background? `url(${this.theme.background})` : "none");
    document.documentElement.style.setProperty("--panel-image", this.theme.panel? `url(${this.theme.panel})` : "none");
    document.documentElement.style.setProperty("--flash-color", this.theme.flashColor || "#ffffff");
    if(this.theme.sounds.blank) this.el("sndBlank").src = this.theme.sounds.blank;
    if(this.theme.sounds.live)  this.el("sndLive").src  = this.theme.sounds.live;
    if(this.theme.sounds.click) this.el("sndClick").src = this.theme.sounds.click;
    this.updateAudioVolumes();
  }
  updateAudioVolumes(){
    const m = this.theme.sounds.volume?.master ?? 1;
    const vb = this.theme.sounds.volume?.blank ?? 1;
    const vl = this.theme.sounds.volume?.live ?? 1;
    const vc = this.theme.sounds.volume?.click ?? 1;
    const muted = !!this.theme.sounds.muted;
    const setVol = (id, v) => { const a = this.el(id); a.volume = muted ? 0 : Math.max(0, Math.min(1, v)); };
    setVol("sndBlank", m * vb);
    setVol("sndLive",  m * vl);
    setVol("sndClick", m * vc);
  }

  /* ===== Game Options (Settings page) ===== */
  loadGameOpts(){
    try{
      const s = localStorage.getItem(this.GAME_OPTS_KEY);
      if(s){ this.gameOpts = { ...this.gameOpts, ...(JSON.parse(s)||{}) }; }
    }catch(_){}
    // Reflect to form if present
    const cb = this.el("optHideChamberRemain");
    if(cb) cb.checked = !!this.gameOpts.hideChamberRemain;
  }
  saveGameOpts(){
    const cb = this.el("optHideChamberRemain");
    this.gameOpts.hideChamberRemain = !!(cb && cb.checked);
    localStorage.setItem(this.GAME_OPTS_KEY, JSON.stringify(this.gameOpts));
    const res = this.el("saveGameOptsResult");
    if(res){ res.textContent = "保存しました ✓"; setTimeout(()=>res.textContent="", 1600); }
  }

  /* ===== Help panel ===== */
  bindHelp(){
    const panel = this.el("helpPanel");
    const open = ()=>{ panel.classList.add("open"); panel.setAttribute("aria-hidden", "false"); };
    const close = ()=>{ panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true"); };
    this.el("helpToggle").onclick = open;
    this.el("helpClose").onclick = close;
  }

  /* ===== UI ===== */
  strictClampInputs(){
    const clamp = (id, fn) => { const e = this.el(id); if(!e) return; e.addEventListener("change", ()=>{ e.value = fn(parseInt(e.value)); }); };
    clamp("playerCount", v => (!Number.isFinite(v)||v<2)?2:(v>4?4:v));
    clamp("initHp",     v => (!Number.isFinite(v)||v<1)?1:(v>99?99:v));
    clamp("chamberSize",v => (!Number.isFinite(v)||v<1)?1:(v>36?36:v));
    clamp("liveCount",  v => (!Number.isFinite(v)||v<0)?0:(v>36?36:v));
  }
  initUI(){
    // Title → Game
    this.el("startBtnTitle").addEventListener("click", ()=>{
      this.playSound('click');
      this.el("titleScreen").style.display = "none";
      this.el("view-game").classList.remove("hidden");
      this.startGame();
    });

    // Game controls
    this.el("startBtn").onclick = ()=> this.startGame();
    this.el("resetBtn").onclick = ()=> this.resetAll();
    this.el("shootBtn").onclick = ()=> this.performShoot(false);
    this.el("shootSelfBtn").onclick = ()=> this.performShoot(true);
    this.el("endTurnBtn").onclick = ()=> this.endTurn();
    this.el("clearLog").onclick = ()=> this.el("log").innerHTML = "";

    // UI settings modal
    this.el("openSettings").onclick = ()=>{ this.playSound('click'); this.openSettings(); };
    this.el("closeSettings").onclick = ()=> this.closeSettings();
    this.el("settingsBackdrop").onclick = ()=> this.closeSettings();

    this.el("bgApply").onclick = ()=>{
      const url = (this.el("bgUrl").value || "").trim();
      this.theme.background = url || null; this.applyThemeToDOM();
      this.el("bgPreview").style.backgroundImage = url? `url(${url})` : "none";
    };
    this.el("panelApply").onclick = ()=>{
      const url = (this.el("panelUrl").value || "").trim();
      this.theme.panel = url || null; this.applyThemeToDOM();
      this.el("panelPreview").style.backgroundImage = url? `url(${url})` : "none";
    };
    this.el("flashTest").onclick = ()=> this.flash();

    this.el("avatarsApply").onclick = ()=>{
      for(let i=1;i<=4;i++){
        const key = "P"+i; const url = (this.el("p"+i+"Url").value || "").trim();
        this.theme.avatars[key] = url || null;
      }
      this.renderPlayers();
    };
    this.el("iconsApply").onclick = ()=>{
      const map = [["icoSaw","ノコギリ"],["icoGlass","拡大鏡"],["icoBeer","ビール"],["icoSmoke","タバコ"],["icoCuff","手錠"]];
      map.forEach(([id,label]) => { const url = (this.el(id).value || "").trim(); this.theme.icons[label] = url || null; });
      this.renderPlayers();
    };

    this.el("soundsApply").onclick = ()=>{
      this.theme.sounds.blank = (this.el("sndBlankUrl").value || "").trim() || null;
      this.theme.sounds.live  = (this.el("sndLiveUrl").value  || "").trim() || null;
      this.theme.sounds.click = (this.el("sndClickUrl").value || "").trim() || null;
      this.theme.sounds.volume.master = parseFloat(this.el("volMaster").value);
      this.theme.sounds.volume.blank  = parseFloat(this.el("volBlank").value);
      this.theme.sounds.volume.live   = parseFloat(this.el("volLive").value);
      this.theme.sounds.volume.click  = parseFloat(this.el("volClick").value);
      this.applyThemeToDOM();
    };
    this.el("testBlank").onclick = ()=> this.playSound('blank');
    this.el("testLive").onclick  = ()=> this.playSound('live');
    this.el("testClick").onclick = ()=> this.playSound('click');

    // Toolbar volume & mute
    this.el("volMasterToolbar").addEventListener("input", ()=>{
      this.theme.sounds.volume.master = parseFloat(this.el("volMasterToolbar").value);
      this.el("volMasterToolbarLabel").textContent = Math.round(this.theme.sounds.volume.master*100)+"%";
      this.updateAudioVolumes();
    });
    this.el("muteToggle").onclick = ()=>{
      this.theme.sounds.muted = !this.theme.sounds.muted;
      this.el("muteToggle").textContent = this.theme.sounds.muted ? "🔈 ミュート解除" : "🔇 ミュート";
      this.updateAudioVolumes();
    };

    this.el("saveTheme").onclick = ()=>{ this.theme.flashColor = this.el("flashColor").value || "#ffffff"; this.applyThemeToDOM(); this.saveThemeToStorage(); };
    this.el("resetTheme").onclick = ()=>{ this.resetTheme(); this.saveThemeToStorage(); };
    this.el("exportTheme").onclick = ()=> this.exportTheme();
    this.el("importTheme").onclick = ()=> this.el("importThemeFile").click();
    this.el("importThemeFile").onchange = (e)=>{ const f = e.target.files[0]; if(f) this.importTheme(f); };

    // Game options page
    const saveGameOptsBtn = this.el("saveGameOpts");
    if(saveGameOptsBtn){ saveGameOptsBtn.onclick = ()=> this.saveGameOpts(); }

    // Help panel
    this.bindHelp();

    // Strict clamping
    this.strictClampInputs();
  }

  /* ===== Game Core ===== */
  log(msg){
    const l = this.el("log"); const time = new Date().toLocaleTimeString();
    l.innerHTML = `<div>[${time}] ${this.escapeHtml(msg)}</div>` + l.innerHTML;
  }
  escapeHtml(s){ return s==null? "" : s.toString().replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
  flash(){ const f = this.el("flashOverlay"); f.style.animation = "flashEffect 0.28s ease"; f.onanimationend = () => { f.style.animation = ""; }; }
  playSound(name){ const id = {blank:"sndBlank", live:"sndLive", click:"sndClick"}[name]; if(!id) return; const a = this.el(id); if(a && a.src){ try{ a.currentTime = 0; a.play().catch(()=>{}); }catch(_e){} } }

  resetAll(){
    this.state = {
      players: [],
      playerCount: parseInt(this.el("playerCount").value),
      initHp: parseInt(this.el("initHp").value),
      chamber: [], chamberTotal: 0, round: 0,
      currentIndex: 0, peekInfo: null, autoNextOnEmptySelfShot: true
    };
    this.updateUI();
    this.el("playersContainer").innerHTML = "";
    this.el("yourItems").innerHTML = "";
    this.el("peekArea").innerText = "なし";
    this.log("ゲームをリセットしました。");
  }
  startGame(){
    this.resetAll();
    this.state.playerCount = parseInt(this.el("playerCount").value);
    this.state.initHp = parseInt(this.el("initHp").value);
    let chamberSize = parseInt(this.el("chamberSize").value);
    let liveCount   = parseInt(this.el("liveCount").value);
    if(!Number.isFinite(chamberSize) || chamberSize <= 0) chamberSize = 1;
    if(!Number.isFinite(liveCount)   || liveCount   <  0) liveCount   = 0;
    if(liveCount > chamberSize) liveCount = chamberSize;

    this.state.players = [];
    for(let i=0;i<this.state.playerCount;i++){
      this.state.players.push({ id:i, name:`P${i+1}`, hp:this.state.initHp, alive:true, items:[], skip:false, hasSawBuff:false });
    }
    this.state.round = 1;
    this.buildChamber(chamberSize, liveCount);
    this.distributeItemsToAll();
    this.state.currentIndex = 0; this.state.peekInfo = null;
    this.updateUI();
    this.log(`ゲーム開始。プレイヤー数=${this.state.playerCount}, 薬室=${chamberSize}, 実弾=${liveCount}`);
    this.announceTurn();
  }
  buildChamber(size, liveCount){
    let s = parseInt(size), l = parseInt(liveCount);
    if(!Number.isFinite(s) || s <= 0) s = 1;
    if(!Number.isFinite(l) || l < 0)  l = 0;
    if(l > s) l = s;
    const arr = [];
    for(let i=0;i<l;i++)   arr.push("live");
    for(let i=0;i<s-l;i++) arr.push("blank");
    this.shuffle(arr);
    this.state.chamber = arr; this.state.chamberTotal = s;
    this.el("chamberTotal").innerText = s;
    this.el("chamberRemain").innerText = this.state.chamber.length;
  }
  shuffle(a){ if(!Array.isArray(a)) return; for(let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); const t = a[i]; a[i] = a[j]; a[j] = t; } }
  distributeItemsToAll(){
    for(const p of this.state.players){
      if(!p.alive) continue;
      p.items = [];
      for(let i=0;i<3;i++){ p.items.push(this.randomOf(this.ITEMS)); }
    }
    this.renderPlayers();
    this.log(`ラウンド ${this.state.round} 開始。各プレイヤーにランダムで3つのアイテムを配布しました。`);
  }
  randomOf(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  renderPlayers(){
    const cont = this.el("playersContainer"); if(!cont) return;
    cont.innerHTML = "";
    for(let i=0;i<this.state.players.length;i++){
      const p = this.state.players[i];
      const div = document.createElement("div");
      div.className = "player" + (p.alive? "":" dead");
      div.id = "player_"+p.id;
      const itemsHtml = p.items.map((it, idx)=>{
        const iconUrl = this.theme.icons[it];
        const iconHtml = iconUrl ? `<span class="icon" style="background-image:url('${iconUrl}')"></span>` : "";
        return `<span class="item" data-player="${p.id}" data-idx="${idx}">${iconHtml}<span>${it}</span></span>`;
      }).join("");

      const avatarUrl = this.theme.avatars["P"+(i+1)] || (this.theme.assetsAvatars? this.theme.assetsAvatars["P"+(i+1)] : null);
      const avatarStyle = avatarUrl? `background-image:url('${avatarUrl}')` : "";

      div.innerHTML = `
        <div class="avatar" style="${avatarStyle}"></div>
        <div>
          <div style="font-weight:700">${p.name} ${this.state.currentIndex===i? "←":""}</div>
          <div>HP: <span class="hp">${p.hp}</span></div>
          <div>状態: ${p.alive? "生存":"脱落"}</div>
          <div class="items">アイテム: ${itemsHtml}</div>
          <div style="margin-top:6px; font-size:13px;">${p.skip? "（次ターンをスキップ予定）": ""}</div>
        </div>
      `;
      cont.appendChild(div);
    }
    cont.querySelectorAll('.item').forEach(elm=>{
      elm.onclick = (e) => {
        const pid = parseInt(elm.getAttribute('data-player'));
        const idx = parseInt(elm.getAttribute('data-idx'));
        if(pid !== this.state.currentIndex){ alert("自分のターンの時だけアイテムを使用できます。"); return; }
        this.useItem(pid, idx);
      };
    });
    this.updateYourItems();
  }
  updateYourItems(){
    const p = this.state.players[this.state.currentIndex];
    if(!p){ this.el("yourItems").innerHTML = "なし"; return; }
    const area = this.el("yourItems");
    area.innerHTML = p.items.map((it, idx)=>{
      const iconUrl = this.theme.icons[it];
      const iconHtml = iconUrl ? `<span class="icon" style="width:16px;height:16px; background-image:url('${iconUrl}'); display:inline-block; vertical-align:-3px; margin-right:6px;"></span>` : "";
      return `<button data-idx="${idx}" data-player="${p.id}">${iconHtml}${it}</button>`;
    }).join(" ");
    area.querySelectorAll('button').forEach(btn=>{
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute('data-idx'));
        if(this.state.currentIndex !== parseInt(btn.getAttribute('data-player'))){ alert("自分のターンの時だけ使用可能"); return; }
        this.useItem(this.state.currentIndex, idx);
      };
    });
  }

  updateUI(){
    this.el("roundNo").innerText = this.state.round;
    // 残薬室の表示制御
    if(this.gameOpts.hideChamberRemain){
      this.el("chamberRemain").innerText = "??";
      this.el("chamberTotal").innerText = this.state.chamberTotal;
    }else{
      this.el("chamberRemain").innerText = this.state.chamber.length;
      this.el("chamberTotal").innerText = this.state.chamberTotal;
    }
    this.el("currentPlayer").innerText = this.state.players[this.state.currentIndex]? this.state.players[this.state.currentIndex].name : "-";
    this.el("peekState").innerText = this.state.peekInfo ? (this.state.peekInfo==="live"? "実弾":"空包") : "不明";
    this.renderPlayers();
    this.populateTargetSelect();
  }
  populateTargetSelect(){
    const sel = this.el("targetSelect"); sel.innerHTML = "";
    const cur = this.state.players[this.state.currentIndex]; if(!cur) return;
    for(const p of this.state.players){
      if(!p.alive) continue;
      const opt = document.createElement("option");
      opt.value = p.id; opt.text = p.name + (p.id===cur.id? " (自分)":"");
      sel.add(opt);
    }
    let defaultIndex = 0;
    for(let i=0;i<sel.options.length;i++){
      if(parseInt(sel.options[i].value) !== cur.id){ defaultIndex = i; break; }
    }
    sel.selectedIndex = defaultIndex;
  }

  announceTurn(){
    if(this.allDeadOrOneLeft()) return;
    while(this.state.players[this.state.currentIndex] && !this.state.players[this.state.currentIndex].alive){
      this.state.currentIndex = (this.state.currentIndex+1)%this.state.players.length;
    }
    const cur = this.state.players[this.state.currentIndex];
    if(!cur) return;
    if(cur.skip){
      this.log(`${cur.name} のターンは手錠効果でスキップされました。`);
      cur.skip = false; this.advanceTurn(); return;
    }
    this.updateUI();
    this.log(`ターン: ${cur.name}`);
  }

  performShoot(isSelf){
    const cur = this.state.players[this.state.currentIndex];
    if(!cur || !cur.alive){ this.log("行動できるプレイヤーがいません。"); return; }
    if(this.state.chamber.length === 0){
      this.log("薬室が空です。ラウンド終了処理を行います。"); this.endRound(); return;
    }
    let targetId = isSelf ? cur.id : parseInt(this.el("targetSelect").value);
    if(!Number.isFinite(targetId)) targetId = cur.id;
    const target = this.state.players.find(p=>p.id===targetId);
    if(!target || !target.alive){ alert("無効なターゲットです。"); return; }

    const top = this.state.chamber.shift();
    this.state.peekInfo = null;
    this.el("peekArea").innerText = "なし";
    if(!this.gameOpts.hideChamberRemain){
      this.el("chamberRemain").innerText = this.state.chamber.length;
    }

    if(top === "blank"){
      this.playSound('blank');
      this.log(`${cur.name} が ${target.name} に発砲 → 空包（安心）。`);
      if(isSelf){
        this.log(`${cur.name} は空包だったため、追加で行動できます。`);
        this.updateUI(); this.checkRoundEndAfterShot(); return;
      } else {
        this.checkRoundEndAfterShot(); this.advanceTurn(); return;
      }
    } else {
      this.playSound('live');
      this.flash();
      let dmg = 1;
      if(cur.hasSawBuff){
        dmg = 2; cur.hasSawBuff = false;
        this.log(`${cur.name} のノコギリ効果でダメージが2倍になった！`);
      }
      target.hp -= dmg;
      this.log(`${cur.name} が ${target.name} に発砲 → 実弾！ ${target.name} に ${dmg} ダメージ。残HP=${Math.max(0,target.hp)}`);
      if(target.hp <= 0){ target.alive = false; this.log(`${target.name} は脱落しました。`); }
      this.checkRoundEndAfterShot(); this.advanceTurn(); return;
    }
  }
  checkRoundEndAfterShot(){
    if(this.state.chamber.length === 0){
      this.log("このラウンドの薬室は全て撃たれました。ラウンド終了です。"); this.endRound();
    } else { this.updateUI(); }
  }
  endTurn(){ this.advanceTurn(); }
  advanceTurn(){
    if(this.allDeadOrOneLeft()) return;
    let next = this.state.currentIndex;
    for(let i=1;i<=this.state.players.length;i++){
      const cand = (this.state.currentIndex + i) % this.state.players.length;
      if(this.state.players[cand].alive){ next = cand; break; }
    }
    this.state.currentIndex = next; this.announceTurn();
  }
  allDeadOrOneLeft(){
    const alive = this.state.players.filter(p=>p.alive);
    if(alive.length <= 1){
      if(alive.length === 1){ this.log(`ゲーム終了！ 勝者: ${alive[0].name}`); }
      else { this.log("すべてのプレイヤーが脱落しました（同時脱落）。"); }
      this.updateUI(); return true;
    }
    return false;
  }
  endRound(){
    const alive = this.state.players.filter(p=>p.alive);
    if(alive.length <= 1){ this.allDeadOrOneLeft(); return; }
    this.state.round += 1;
    let chamberSize = parseInt(this.el("chamberSize").value);
    let liveCount   = parseInt(this.el("liveCount").value);
    if(!Number.isFinite(chamberSize) || chamberSize <= 0) chamberSize = 1;
    if(!Number.isFinite(liveCount)   || liveCount   <  0) liveCount   = 0;
    if(liveCount > chamberSize) liveCount = chamberSize;
    this.buildChamber(chamberSize, liveCount);
    this.distributeItemsToAll();
    this.state.currentIndex = this.state.players.findIndex(p=>p.alive);
    this.announceTurn();
  }

  /* ===== Items ===== */
  useItem(pid, idx){
    const p = this.state.players[pid];
    if(!p || !p.alive){ alert("使用不可"); return; }
    if(pid !== this.state.currentIndex){ alert("自分のターンの時だけ使えます"); return; }
    const item = p.items[idx];
    if(!item){ alert("アイテムがありません"); return; }

    switch(item){
      case "ノコギリ": p.hasSawBuff = true; this.log(`${p.name} は ノコギリ を使用。次に命中すればダメージ2倍。`); break;
      case "拡大鏡":
        if(this.state.chamber.length === 0){ this.log("薬室が空のため覗けません。"); }
        else {
          const next = this.state.chamber[0]; this.state.peekInfo = next;
          this.el("peekArea").innerText = (next==="live"?"実弾":"空包");
          this.log(`${p.name} は 拡大鏡 を使い、先頭弾が「${next==="live"?"実弾":"空包"}」であることを確認した。`);
        }
        break;
      case "ビール":
        if(this.state.chamber.length===0){ this.log("薬室に弾がないため排莢できません。"); }
        else {
          const removed = this.state.chamber.shift();
          this.log(`${p.name} は ビール を使用し、次の弾を排莢した（${removed==="live"?"実弾が取り除かれた":"空包が取り除かれた"}）。`);
          if(!this.gameOpts.hideChamberRemain){
            this.el("chamberRemain").innerText = this.state.chamber.length;
          }
        }
        break;
        case "タバコ": p.hp += 1; this.log(`${p.name} は タバコ を喫み、HPを1回復。（現在HP=${p.hp}）`); break;
      case "手錠":
        let nextOpp = null;
        for(let i=1;i<this.state.players.length;i++){
          const cand = (this.state.currentIndex + i) % this.state.players.length;
          if(this.state.players[cand].alive){ nextOpp = this.state.players[cand]; break; }
        }
        if(nextOpp){ nextOpp.skip = true; this.log(`${p.name} は 手錠 を使用。次のプレイヤー ${nextOpp.name} のターンを飛ばす。`); }
        else { this.log("スキップ対象が見つからないため手錠は効果がなかった。"); }
        break;
      default: this.log("未定義のアイテム");
    }

    p.items.splice(idx,1);
    this.renderPlayers(); this.updateYourItems(); this.updateUI();
    this.log(`（${p.name} のターン継続：アイテム使用はターンを消費しません）`);
  }
}

/* ====== Mount ====== */
document.addEventListener("DOMContentLoaded", () => {
  const app = new ShotgunRouletteApp();
  window.app = app;
  app.boot();

  // STARTの後にゲームビューへフォーカス
  const navGame = document.getElementById("navGame");
  if(navGame) navGame.addEventListener("click", ()=> location.hash = "#/game");
});
