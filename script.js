// ===================== GameEngine (ロジック) =====================
class GameEngine {
  constructor(delegate){
    this.delegate = delegate || {};
    this.ITEMS = ["ノコギリ","拡大鏡","ビール","タバコ","手錠"];
    this.reset();
  }
  reset(){
    this.players = [];
    this.playerCount = 4;
    this.initHp = 5;
    this.chamber = [];
    this.chamberTotal = 0;
    this.round = 0;
    this.currentIndex = 0;
    this.peekInfo = null;
  }
  // --- utility
  clamp(n, lo, hi){ n = parseInt(n); if(!Number.isFinite(n)) n = lo; return Math.min(hi, Math.max(lo, n)); }
  shuffle(a){ if(!Array.isArray(a)) return; for(let i=a.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); const t = a[i]; a[i]=a[j]; a[j]=t; } }
  log(msg){ if(this.delegate.onLog) this.delegate.onLog(msg); }
  emitUpdate(){ if(this.delegate.onUpdate) this.delegate.onUpdate(this.snapshot()); }

  snapshot(){
    return {
      players: JSON.parse(JSON.stringify(this.players)),
      playerCount: this.playerCount,
      initHp: this.initHp,
      chamberRemain: this.chamber.length,
      chamberTotal: this.chamberTotal,
      round: this.round,
      currentIndex: this.currentIndex,
      peekInfo: this.peekInfo,
      items: this.ITEMS.slice(),
    };
  }

  configure({playerCount, initHp, chamberSize, liveCount}){
    this.playerCount = this.clamp(playerCount, 2, 4);
    this.initHp = this.clamp(initHp, 1, 99);
    const s = this.clamp(chamberSize, 1, 36);
    let l = this.clamp(liveCount, 0, 36);
    if(l > s) l = s;
    this._cfg = { chamberSize: s, liveCount: l };
  }

  start(){
    this.players = [];
    for(let i=0;i<this.playerCount;i++){
      this.players.push({ id:i, name:`P${i+1}`, hp:this.initHp, alive:true, items:[], skip:false, hasSawBuff:false });
    }
    this.round = 1;
    this._buildChamber(this._cfg.chamberSize, this._cfg.liveCount);
    this._distributeItems();
    this.currentIndex = 0;
    this.peekInfo = null;
    this.emitUpdate();
    this.log(`ゲーム開始。プレイヤー数=${this.playerCount}, 薬室=${this.chamberTotal}, 実弾=${this._cfg.liveCount}`);
    this._announceTurn();
  }

  _buildChamber(size, liveCount){
    const s = this.clamp(size, 1, 36);
    let l = this.clamp(liveCount, 0, 36);
    if(l > s) l = s;
    const arr = [];
    for(let i=0;i<l;i++)   arr.push("live");
    for(let i=0;i<s-l;i++) arr.push("blank");
    this.shuffle(arr);
    this.chamber = arr;
    this.chamberTotal = s;
    this.emitUpdate();
  }

  _distributeItems(){
    for(const p of this.players){
      if(!p.alive) continue;
      p.items = [];
      for(let i=0;i<3;i++) p.items.push(this._randomOf(this.ITEMS));
    }
    this.emitUpdate();
    this.log(`ラウンド ${this.round} 開始。各プレイヤーにランダムで3つのアイテムを配布しました。`);
  }
  _randomOf(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  _announceTurn(){
    if(this._allDeadOrOneLeft()) return;
    while(this.players[this.currentIndex] && !this.players[this.currentIndex].alive){
      this.currentIndex = (this.currentIndex+1)%this.players.length;
    }
    const cur = this.players[this.currentIndex];
    if(!cur) return;
    if(cur.skip){
      this.log(`${cur.name} のターンは手錠効果でスキップされました。`);
      cur.skip = false; this._advanceTurn(); return;
    }
    this.emitUpdate();
    this.log(`ターン: ${cur.name}`);
  }

  performShoot(targetId, isSelf){
    const cur = this.players[this.currentIndex];
    if(!cur || !cur.alive){ this.log("行動できるプレイヤーがいません。"); return; }
    if(this.chamber.length === 0){ this.log("薬室が空です。ラウンド終了処理を行います。"); this._endRound(); return; }

    if(isSelf) targetId = cur.id;
    const target = this.players.find(p=>p.id===targetId && p.alive);
    if(!target){ this.log("無効なターゲットです。"); return; }

    const top = this.chamber.shift();
    this.peekInfo = null;

    if(this.delegate.onChamberChanged) this.delegate.onChamberChanged(this.snapshot());

    if(top === "blank"){
      if(this.delegate.onPlaySound) this.delegate.onPlaySound("blank");
      this.log(`${cur.name} が ${target.name} に発砲 → 空包（安心）。`);
      if(isSelf){
        this.log(`${cur.name} は空包だったため、追加で行動できます。`);
        this.emitUpdate(); this._checkRoundEndAfterShot(); return;
      } else {
        this._checkRoundEndAfterShot(); this._advanceTurn(); return;
      }
    } else {
      if(this.delegate.onPlaySound) this.delegate.onPlaySound("live");
      if(this.delegate.onFlash) this.delegate.onFlash();
      let dmg = 1;
      if(cur.hasSawBuff){ dmg = 2; cur.hasSawBuff = false; this.log(`${cur.name} のノコギリ効果でダメージが2倍になった！`); }
      target.hp -= dmg;
      this.log(`${cur.name} が ${target.name} に発砲 → 実弾！ ${target.name} に ${dmg} ダメージ。残HP=${Math.max(0,target.hp)}`);
      if(target.hp <= 0){ target.alive = false; this.log(`${target.name} は脱落しました。`); }
      this._checkRoundEndAfterShot(); this._advanceTurn(); return;
    }
  }

  useItem(pid, idx){
    const p = this.players[pid];
    if(!p || !p.alive){ this.log("使用不可"); return; }
    if(pid !== this.currentIndex){ this.log("自分のターンの時だけ使用できます。"); return; }
    const item = p.items[idx];
    if(!item){ this.log("アイテムがありません"); return; }

    switch(item){
      case "ノコギリ": p.hasSawBuff = true; this.log(`${p.name} は ノコギリ を使用。次に命中すればダメージ2倍。`); break;
      case "拡大鏡":
        if(this.chamber.length === 0){ this.log("薬室が空のため覗けません。"); }
        else {
          const next = this.chamber[0]; this.peekInfo = next;
          this.log(`${p.name} は 拡大鏡 を使い、先頭弾が「${next==="live"?"実弾":"空包"}」であることを確認した。`);
          if(this.delegate.onPeek) this.delegate.onPeek(next);
        }
        break;
      case "ビール":
        if(this.chamber.length===0){ this.log("薬室に弾がないため排莢できません。"); }
        else {
          const removed = this.chamber.shift();
          this.log(`${p.name} は ビール を使用し、次の弾を排莢した（${removed==="live"?"実弾が取り除かれた":"空包が取り除かれた"}）。`);
          if(this.delegate.onChamberChanged) this.delegate.onChamberChanged(this.snapshot());
        }
        break;
      case "タバコ": p.hp += 1; this.log(`${p.name} は タバコ を喫み、HPを1回復。（現在HP=${p.hp}）`); break;
      case "手錠":
        let nextOpp = null;
        for(let i=1;i<this.players.length;i++){
          const cand = (this.currentIndex + i) % this.players.length;
          if(this.players[cand].alive){ nextOpp = this.players[cand]; break; }
        }
        if(nextOpp){ nextOpp.skip = true; this.log(`${p.name} は 手錠 を使用。次のプレイヤー ${nextOpp.name} のターンを飛ばす。`); }
        else { this.log("スキップ対象が見つからないため手錠は効果がなかった。"); }
        break;
      default: this.log("未定義のアイテム");
    }
    p.items.splice(idx,1);
    this.emitUpdate();
    this.log(`（${p.name} のターン継続：アイテム使用はターンを消費しません）`);
  }

  _checkRoundEndAfterShot(){
    if(this.chamber.length === 0){
      this.log("このラウンドの薬室は全て撃たれました。ラウンド終了です。");
      this._endRound();
    } else { this.emitUpdate(); }
  }
  _advanceTurn(){
    if(this._allDeadOrOneLeft()) return;
    let next = this.currentIndex;
    for(let i=1;i<=this.players.length;i++){
      const cand = (this.currentIndex + i) % this.players.length;
      if(this.players[cand].alive){ next = cand; break; }
    }
    this.currentIndex = next; this._announceTurn();
  }
  _allDeadOrOneLeft(){
    const alive = this.players.filter(p=>p.alive);
    if(alive.length <= 1){
      if(alive.length === 1){ this.log(`ゲーム終了！ 勝者: ${alive[0].name}`); }
      else { this.log("すべてのプレイヤーが脱落しました（同時脱落）。"); }
      this.emitUpdate(); return true;
    }
    return false;
  }
  _endRound(){
    const alive = this.players.filter(p=>p.alive);
    if(alive.length <= 1){ this._allDeadOrOneLeft(); return; }
    this.round += 1;
    this._buildChamber(this._cfg.chamberSize, this._cfg.liveCount);
    this._distributeItems();
    this.currentIndex = this.players.findIndex(p=>p.alive);
    this._announceTurn();
  }
}

// ===================== UIController (GUI) =====================
class UIController {
  constructor(){
    // Theme
    this.THEME_KEY = "sg_roulette_theme_v016";
    this.defaultTheme = {
      flashColor: "#ffffff",
      background: null,
      panel: null,
      avatars: { P1:null, P2:null, P3:null, P4:null },
      icons: { "ノコギリ":null, "拡大鏡":null, "ビール":null, "タバコ":null, "手錠":null },
      sounds: { blank:null, live:null, click:null, volume:{ master:1, blank:1, live:1, click:1 }, muted:false }
    };
    this.theme = JSON.parse(JSON.stringify(this.defaultTheme));

    // Game options
    this.GAME_OPTS_KEY = "sg_roulette_gameopts_v016";
    this.gameOpts = { hideChamberRemain: false };

    // portrait
    this.PORTRAIT_KEY = "sg_roulette_portrait_v016";
    this.portrait = { url:"", expr:"通常" };

    // DOM util
    this.el = id => document.getElementById(id);

    // Engine
    this.engine = new GameEngine({
      onLog: (m)=> this.log(m),
      onUpdate: (snap)=> this.updateUI(snap),
      onChamberChanged: (snap)=> this.updateChamberUI(snap),
      onPeek: (next)=> { this.el("peekArea").innerText = (next==="live"?"実弾":"空包"); },
      onPlaySound: (name)=> this.playSound(name),
      onFlash: ()=> this.flash(),
    });
  }

  async boot(){
    window.addEventListener("hashchange", ()=> this.route());
    this.route();
    await this.loadThemeAssetsThenLocal();
    this.loadGameOpts();
    this.loadPortrait();
    this.initUI();
  }

  // ---------- Routing
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

  // ---------- Theme/Audio
  async loadThemeAssetsThenLocal(){
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
    this.syncSoundUI();
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
  syncSoundUI(){
    const v = this.theme.sounds.volume || {master:1,blank:1,live:1,click:1};
    const safe = (x, d=1)=> Number.isFinite(x)? x : d;
    const ids = ["volMaster","volBlank","volLive","volClick"];
    const labels = ["volMasterLabel","volBlankLabel","volLiveLabel","volClickLabel"];
    const vals = [safe(v.master), safe(v.blank), safe(v.live), safe(v.click)];
    ids.forEach((id,i)=>{ const e=this.el(id); if(e) e.value = vals[i]; });
    labels.forEach((id,i)=>{ const e=this.el(id); if(e) e.textContent = Math.round(vals[i]*100)+"%"; });
    const tb = this.el("volMasterToolbar"); if(tb){ tb.value = vals[0]; }
    const tbl = this.el("volMasterToolbarLabel"); if(tbl){ tbl.textContent = Math.round(vals[0]*100)+"%"; }
    const muteBtn = this.el("muteToggle"); if(muteBtn){ muteBtn.textContent = this.theme.sounds.muted ? "🔈 ミュート解除" : "🔇 ミュート"; }
    const setUrl = (id, url)=>{ const e=this.el(id); if(e) e.value = url || ""; };
    setUrl("sndBlankUrl", this.theme.sounds.blank);
    setUrl("sndLiveUrl",  this.theme.sounds.live);
    setUrl("sndClickUrl", this.theme.sounds.click);
  }
  playSound(name){
    const id = {blank:"sndBlank", live:"sndLive", click:"sndClick"}[name];
    const a = id && this.el(id);
    if(a && a.src){ try{ a.currentTime = 0; a.play().catch(()=>{}); }catch(_e){} }
  }
  flash(){ const f = this.el("flashOverlay"); f.style.animation = "flashEffect 0.28s ease"; f.onanimationend = () => { f.style.animation = ""; }; }

  // ---------- Game Options & Portrait
  loadGameOpts(){
    try{ const s = localStorage.getItem(this.GAME_OPTS_KEY); if(s){ this.gameOpts = { ...this.gameOpts, ...(JSON.parse(s)||{}) }; } }catch(_){}
    const cb = this.el("optHideChamberRemain"); if(cb) cb.checked = !!this.gameOpts.hideChamberRemain;
  }
  saveGameOpts(){
    const cb = this.el("optHideChamberRemain");
    this.gameOpts.hideChamberRemain = !!(cb && cb.checked);
    localStorage.setItem(this.GAME_OPTS_KEY, JSON.stringify(this.gameOpts));
    const res = this.el("saveGameOptsResult"); if(res){ res.textContent = "保存しました ✓"; setTimeout(()=>res.textContent="", 1600); }
    this.updateChamberUI(this.engine.snapshot());
  }
  loadPortrait(){
    try{ const s = localStorage.getItem(this.PORTRAIT_KEY); if(s) this.portrait = { ...this.portrait, ...(JSON.parse(s)||{}) }; }catch(_){}
    this.applyPortrait();
  }
  applyPortrait(){
    const img = this.el("portraitImg");
    const badge = this.el("portraitBadge");
    if(img) img.style.backgroundImage = this.portrait.url ? `url(${this.portrait.url})` : "none";
    if(badge) badge.textContent = this.portrait.expr || "通常";
    const input = this.el("portraitUrl"); if(input) input.value = this.portrait.url || "";
  }

  // ---------- UI init & bindings
  strictClampInputs(){
    const clamp = (id, fn) => { const e = this.el(id); if(!e) return; e.addEventListener("change", ()=>{ e.value = fn(parseInt(e.value)); }); };
    clamp("playerCount", v => (!Number.isFinite(v)||v<2)?2:(v>4?4:v));
    clamp("initHp",     v => (!Number.isFinite(v)||v<1)?1:(v>99?99:v));
    clamp("chamberSize",v => (!Number.isFinite(v)||v<1)?1:(v>36?36:v));
    clamp("liveCount",  v => (!Number.isFinite(v)||v<0)?0:(v>36?36:v));
  }
  bindHelp(){
    const panel = this.el("helpPanel");
    const open = ()=>{ panel.classList.add("open"); panel.setAttribute("aria-hidden", "false"); };
    const close = ()=>{ panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true"); };
    this.el("helpToggle").onclick = open;
    this.el("helpClose").onclick = close;
  }
  initUI(){
    // Title
    this.el("startBtnTitle").addEventListener("click", ()=>{
      this.playSound('click');
      this.el("titleScreen").style.display = "none";
      this.el("view-game").classList.remove("hidden");
      this.startGameFromInputs();
    });

    // Game controls
    this.el("startBtn").onclick = ()=> this.startGameFromInputs();
    this.el("resetBtn").onclick = ()=> { this.engine.reset(); this.updateUI(this.engine.snapshot()); this.log("ゲームをリセットしました。"); };
    this.el("shootBtn").onclick = ()=> this.engine.performShoot(parseInt(this.el("targetSelect").value), false);
    this.el("shootSelfBtn").onclick = ()=> this.engine.performShoot(null, true);
    this.el("endTurnBtn").onclick = ()=> { /* advance is internal after actions */ };

    this.el("clearLog").onclick = ()=> this.el("log").innerHTML = "";

    // Settings modal
    this.el("openSettings").onclick = ()=>{ this.playSound('click'); this.openSettings(); };
    this.el("closeSettings").onclick = ()=> this.closeSettings();
    this.el("settingsBackdrop").onclick = ()=> this.closeSettings();

    // Applyers
    this.el("bgApply").onclick = ()=>{ const url = (this.el("bgUrl").value||"").trim(); this.theme.background = url||null; this.applyThemeToDOM(); this.el("bgPreview").style.backgroundImage = url?`url(${url})`:"none"; };
    this.el("panelApply").onclick = ()=>{ const url = (this.el("panelUrl").value||"").trim(); this.theme.panel = url||null; this.applyThemeToDOM(); this.el("panelPreview").style.backgroundImage = url?`url(${url})`:"none"; };
    this.el("flashTest").onclick = ()=> this.flash();
    this.el("avatarsApply").onclick = ()=>{ for(let i=1;i<=4;i++){ const key="P"+i; const url=(this.el("p"+i+"Url").value||"").trim(); this.theme.avatars[key]=url||null; } this.updateUI(this.engine.snapshot()); };
    this.el("iconsApply").onclick = ()=>{
      [["icoSaw","ノコギリ"],["icoGlass","拡大鏡"],["icoBeer","ビール"],["icoSmoke","タバコ"],["icoCuff","手錠"]]
        .forEach(([id,label])=>{ const url=(this.el(id).value||"").trim(); this.theme.icons[label]=url||null; });
      this.updateUI(this.engine.snapshot());
    };
    this.el("soundsApply").onclick = ()=>{
      this.theme.sounds.blank=(this.el("sndBlankUrl").value||"").trim()||null;
      this.theme.sounds.live =(this.el("sndLiveUrl").value ||"").trim()||null;
      this.theme.sounds.click=(this.el("sndClickUrl").value||"").trim()||null;
      this.theme.sounds.volume.master=parseFloat(this.el("volMaster").value);
      this.theme.sounds.volume.blank =parseFloat(this.el("volBlank").value);
      this.theme.sounds.volume.live  =parseFloat(this.el("volLive").value);
      this.theme.sounds.volume.click =parseFloat(this.el("volClick").value);
      this.applyThemeToDOM();
    };
    this.el("testBlank").onclick = ()=> this.playSound('blank');
    this.el("testLive").onclick  = ()=> this.playSound('live');
    this.el("testClick").onclick = ()=> this.playSound('click');

    // Volume & mute
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
    this.el("saveTheme").onclick = ()=>{ this.theme.flashColor = this.el("flashColor").value||"#ffffff"; this.applyThemeToDOM(); try{ localStorage.setItem(this.THEME_KEY, JSON.stringify(this.theme)); alert("保存しました。"); }catch(e){ alert("保存に失敗しました"); } };
    this.el("resetTheme").onclick = ()=>{ if(!confirm("UI設定をリセットしますか？")) return; this.theme = JSON.parse(JSON.stringify(this.defaultTheme)); this.applyThemeToDOM(); this.syncSoundUI(); this.updateUI(this.engine.snapshot()); };
    this.el("exportTheme").onclick = ()=>{ const blob = new Blob([JSON.stringify(this.theme,null,2)],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="sg_roulette_theme_v016.json"; a.click(); URL.revokeObjectURL(a.href); };
    this.el("importTheme").onclick = ()=> this.el("importThemeFile").click();
    this.el("importThemeFile").onchange = (e)=>{ const f=e.target.files[0]; if(!f) return; const fr=new FileReader(); fr.onload=()=>{ try{ const data=JSON.parse(fr.result); this.theme={...this.defaultTheme, ...(data||{})}; this.applyThemeToDOM(); this.syncSoundUI(); this.updateUI(this.engine.snapshot()); alert("インポート完了"); }catch(_){ alert("インポート失敗"); } }; fr.readAsText(f); };

    // Game options
    const saveGameOptsBtn = this.el("saveGameOpts"); if(saveGameOptsBtn) saveGameOptsBtn.onclick = ()=> this.saveGameOpts();

    // Portrait
    const pApply = this.el("portraitApply"); if(pApply) pApply.onclick = ()=>{ this.portrait.url=(this.el("portraitUrl").value||"").trim(); localStorage.setItem(this.PORTRAIT_KEY, JSON.stringify(this.portrait)); this.applyPortrait(); };
    const row = document.querySelector(".expr-row"); if(row){ row.querySelectorAll("button[data-expr]").forEach(b=> b.onclick = ()=>{ this.portrait.expr = b.getAttribute("data-expr")||"通常"; localStorage.setItem(this.PORTRAIT_KEY, JSON.stringify(this.portrait)); this.applyPortrait(); }); }

    this.bindHelp();
    this.strictClampInputs();
  }

  // ---------- UI updates
  updateUI(snap){
    if(!snap) snap = this.engine.snapshot();
    this.el("roundNo").innerText = snap.round;
    this.el("currentPlayer").innerText = snap.players[snap.currentIndex]? snap.players[snap.currentIndex].name : "-";
    this.el("peekState").innerText = snap.peekInfo ? (snap.peekInfo==="live"?"実弾":"空包") : "不明";
    this.updateChamberUI(snap);
    this.renderPlayers(snap);
    this.populateTargetSelect(snap);
  }
  updateChamberUI(snap){
    if(this.gameOpts.hideChamberRemain){
      this.el("chamberTotal").innerText = snap.chamberTotal;
      this.el("chamberRemain").innerText = "??";
    } else {
      this.el("chamberTotal").innerText = snap.chamberTotal;
      this.el("chamberRemain").innerText = snap.chamberRemain;
    }
  }
  renderPlayers(snap){
    const cont = this.el("playersContainer"); cont.innerHTML = "";
    snap.players.forEach((p, i)=>{
      const div = document.createElement("div");
      div.className = "player" + (p.alive? "":" dead");
      div.id = "player_"+p.id;
      const itemsHtml = p.items.map((it, idx)=>{
        const iconUrl = (this.theme.icons||{})[it];
        const iconHtml = iconUrl ? `<span class="icon" style="background-image:url('${iconUrl}')"></span>` : "";
        return `<span class="item" data-player="${p.id}" data-idx="${idx}">${iconHtml}<span>${it}</span></span>`;
      }).join("");
      const avatarUrl = (this.theme.avatars||{})["P"+(i+1)];
      const avatarStyle = avatarUrl? `background-image:url('${avatarUrl}')` : "";
      div.innerHTML = `
        <div class="avatar" style="${avatarStyle}"></div>
        <div>
          <div style="font-weight:700">${p.name} ${snap.currentIndex===i? "←":""}</div>
          <div>HP: <span class="hp">${p.hp}</span></div>
          <div>状態: ${p.alive? "生存":"脱落"}</div>
          <div class="items">アイテム: ${itemsHtml}</div>
          <div style="margin-top:6px; font-size:13px;">${p.skip? "（次ターンをスキップ予定）": ""}</div>
        </div>`;
      cont.appendChild(div);
    });
    cont.querySelectorAll('.item').forEach(elm=>{
      elm.onclick = ()=>{
        const pid = parseInt(elm.getAttribute('data-player'));
        const idx = parseInt(elm.getAttribute('data-idx'));
        this.engine.useItem(pid, idx);
      };
    });

    // your items area
    const me = snap.players[snap.currentIndex];
    const area = this.el("yourItems");
    if(!me){ area.innerHTML = "なし"; return; }
    area.innerHTML = me.items.map((it, idx)=>{
      const iconUrl = (this.theme.icons||{})[it];
      const iconHtml = iconUrl ? `<span class="icon" style="width:16px;height:16px; background-image:url('${iconUrl}'); display:inline-block; vertical-align:-3px; margin-right:6px;"></span>` : "";
      return `<button data-idx="${idx}" data-player="${me.id}">${iconHtml}${it}</button>`;
    }).join(" ");
    area.querySelectorAll('button').forEach(btn=>{
      btn.onclick = ()=>{
        const idx = parseInt(btn.getAttribute('data-idx'));
        this.engine.useItem(me.id, idx);
      };
    });
  }
  populateTargetSelect(snap){
    const sel = this.el("targetSelect"); sel.innerHTML = "";
    const cur = snap.players[snap.currentIndex]; if(!cur) return;
    snap.players.forEach(p=>{
      if(!p.alive) return;
      const opt = document.createElement("option");
      opt.value = p.id; opt.text = p.name + (p.id===cur.id? " (自分)":"");
      sel.add(opt);
    });
    let defaultIndex = 0;
    for(let i=0;i<sel.options.length;i++){
      if(parseInt(sel.options[i].value) !== cur.id){ defaultIndex = i; break; }
    }
    sel.selectedIndex = defaultIndex;
  }
  log(msg){
    const l = this.el("log"); const time = new Date().toLocaleTimeString();
    l.innerHTML = `<div>[${time}] ${this.escapeHtml(msg)}</div>` + l.innerHTML;
  }
  escapeHtml(s){ return s==null? "" : s.toString().replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

  // ---------- public helpers
  startGameFromInputs(){
    this.engine.reset();
    const cfg = {
      playerCount: parseInt(this.el("playerCount").value),
      initHp: parseInt(this.el("initHp").value),
      chamberSize: parseInt(this.el("chamberSize").value),
      liveCount: parseInt(this.el("liveCount").value),
    };
    this.engine.configure(cfg);
    this.engine.start();
  }
  openSettings(){ this.el("settingsModal").classList.remove("hidden"); }
  closeSettings(){ this.el("settingsModal").classList.add("hidden"); }
}

// ---------- Mount
document.addEventListener("DOMContentLoaded", () => {
  const ui = new UIController();
  window.ui = ui;
  ui.boot();
});
