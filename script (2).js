/**
 * ショットガン・ルーレット ver. α0.18
 * - GameEngine: ゲーム内部ロジック（UI非依存）
 * - UIController: DOM・入力・音・テーマ（GUI専用）
 *
 * 追加要件:
 * - HPは★で表示
 * - 顔はプレイヤー番号で固定（P1〜P4）
 * - HP<=3でダメージ顔（なければ赤ティント）
 * - ポートレートは常に現在手番の顔
 * - 単発関数は使う場所でローカル定義（グローバルに無駄な小関数を置かない）
 */

/** @typedef {"live"|"blank"} BulletKind */

/**
 * @typedef {Object} Player
 * @property {number} id
 * @property {string} name
 * @property {number} hp
 * @property {boolean} alive
 * @property {string[]} items
 * @property {boolean} skip
 * @property {boolean} hasSawBuff
 */

/**
 * @typedef {Object} Snapshot
 * @property {Player[]} players
 * @property {number} playerCount
 * @property {number} initHp
 * @property {number} chamberRemain
 * @property {number} chamberTotal
 * @property {number} round
 * @property {number} currentIndex
 * @property {BulletKind|null} peekInfo
 * @property {string[]} items
 */

/**
 * @typedef {Object} EngineDelegate
 * @property {(message:string)=>void} [onLog]
 * @property {(snapshot:Snapshot)=>void} [onUpdate]
 * @property {(snapshot:Snapshot)=>void} [onChamberChanged]
 * @property {(next:BulletKind)=>void} [onPeek]
 * @property {(name:"blank"|"live"|"click")=>void} [onPlaySound]
 * @property {()=>void} [onFlash]
 */

/**
 * @typedef {Object} EngineConfig
 * @property {number} playerCount
 * @property {number} initHp
 * @property {number} chamberSize
 * @property {number} liveCount
 */

// =========================== GameEngine ===========================
class GameEngine{
  /** @param {EngineDelegate} delegate */
  constructor(delegate){
    this.delegate = delegate || {};
    this.itemLabels = ["ノコギリ","拡大鏡","ビール","タバコ","手錠"];
    this.reset();
  }
  /** すべて既定値に戻す */
  reset(){
    this.players = [];
    this.playerCount = 4;
    this.initHp = 5;
    /** @type {BulletKind[]} */ this.chamber = [];
    this.chamberTotal = 0;
    this.round = 0;
    this.currentIndex = 0;
    /** @type {BulletKind|null} */ this.peekInfo = null;
    /** @type {EngineConfig} */ this.config = { playerCount:4, initHp:5, chamberSize:6, liveCount:3 };
  }
  /** @param {number} value @param {number} min @param {number} max */
  clamp(value, min, max){
    let n = parseInt(value);
    if(!Number.isFinite(n)) n = min;
    if(n < min) n = min;
    if(n > max) n = max;
    return n;
  }
  /** @template T @param {T[]} array */
  shuffle(array){
    for(let i=array.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      const t = array[i]; array[i]=array[j]; array[j]=t;
    }
  }
  /** @returns {Snapshot} */
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
      items: this.itemLabels.slice(),
    };
  }
  /** @param {string} m */
  log(m){ if(this.delegate.onLog) this.delegate.onLog(m); }

  /** @param {EngineConfig} input */
  configure(input){
    const c = this.clamp(input.playerCount,2,4);
    const h = this.clamp(input.initHp,1,99);
    const s = this.clamp(input.chamberSize,1,36);
    let l = this.clamp(input.liveCount,0,36);
    if(l > s) l = s;
    this.playerCount=c; this.initHp=h;
    this.config = { playerCount:c, initHp:h, chamberSize:s, liveCount:l };
  }

  /** ゲーム開始 */
  start(){
    this.players = [];
    for(let i=0;i<this.playerCount;i++){
      this.players.push({ id:i, name:`P${i+1}`, hp:this.initHp, alive:true, items:[], skip:false, hasSawBuff:false });
    }
    this.round = 1;
    this.buildChamber(this.config.chamberSize, this.config.liveCount);
    this.distributeItems();
    this.currentIndex = 0;
    this.peekInfo = null;
    if(this.delegate.onUpdate) this.delegate.onUpdate(this.snapshot());
    this.log(`ゲーム開始。プレイヤー数=${this.playerCount}, 薬室=${this.chamberTotal}, 実弾=${this.config.liveCount}`);
    this.announceTurn();
  }

  /** @param {number} size @param {number} liveCount */
  buildChamber(size, liveCount){
    const s = this.clamp(size,1,36);
    let l = this.clamp(liveCount,0,36);
    if(l > s) l = s;
    /** @type {BulletKind[]} */ const arr = [];
    for(let i=0;i<l;i++) arr.push("live");
    for(let i=0;i<s-l;i++) arr.push("blank");
    this.shuffle(arr);
    this.chamber = arr;
    this.chamberTotal = s;
    if(this.delegate.onUpdate) this.delegate.onUpdate(this.snapshot());
  }

  /** ランダムに3つ配布 */
  distributeItems(){
    for(const p of this.players){
      if(!p.alive) continue;
      p.items = [];
      for(let i=0;i<3;i++){
        const label = this.itemLabels[Math.floor(Math.random()*this.itemLabels.length)];
        p.items.push(label);
      }
    }
    if(this.delegate.onUpdate) this.delegate.onUpdate(this.snapshot());
    this.log(`ラウンド ${this.round} 開始。各プレイヤーにアイテムを配布しました。`);
  }

  /** ターン開始（スキップ処理） */
  announceTurn(){
    if(this.checkAllDeadOrOneLeft()) return;
    while(this.players[this.currentIndex] && !this.players[this.currentIndex].alive){
      this.currentIndex = (this.currentIndex+1) % this.players.length;
    }
    const cur = this.players[this.currentIndex];
    if(!cur) return;
    if(cur.skip){
      this.log(`${cur.name} のターンは手錠でスキップ。`);
      cur.skip = false;
      this.advanceTurn();
      return;
    }
    if(this.delegate.onUpdate) this.delegate.onUpdate(this.snapshot());
    this.log(`ターン: ${cur.name}`);
  }

  /** @param {number|null} targetId @param {boolean} isSelf */
  performShoot(targetId, isSelf){
    const cur = this.players[this.currentIndex];
    if(!cur || !cur.alive){ this.log("行動できるプレイヤーがいません。"); return; }
    if(this.chamber.length===0){ this.log("薬室が空です。ラウンド終了処理を行います。"); this.endRound(); return; }

    const actualTargetId = isSelf ? cur.id : targetId;
    const target = this.players.find(p=>p.id===actualTargetId && p.alive);
    if(!target){ this.log("無効なターゲットです。"); return; }

    // 先頭の弾を取得して配列から除去
    const top = this.chamber.shift();
    // 拡大鏡情報はリセット
    this.peekInfo = null;
    if(this.delegate.onChamberChanged) this.delegate.onChamberChanged(this.snapshot());

    if(top==="blank"){
      if(this.delegate.onPlaySound) this.delegate.onPlaySound("blank");
      this.log(`${cur.name} → ${target.name} に発砲（空包）`);
      if(isSelf){
        this.log(`${cur.name} は空包だったので追加行動可。`);
        if(this.delegate.onUpdate) this.delegate.onUpdate(this.snapshot());
        this.checkRoundEndAfterShot();
        return;
      } else {
        this.checkRoundEndAfterShot();
        this.advanceTurn();
        return;
      }
    }

    // 実弾
    if(this.delegate.onPlaySound) this.delegate.onPlaySound("live");
    if(this.delegate.onFlash) this.delegate.onFlash();
    let damage = 1;
    if(cur.hasSawBuff){ damage = 2; cur.hasSawBuff = false; this.log(`${cur.name} のノコギリ効果でダメージ2倍！`); }
    target.hp -= damage;
    this.log(`${cur.name} → ${target.name} に実弾 ${damage} ダメージ。残HP=${Math.max(0,target.hp)}`);
    if(target.hp<=0){ target.alive=false; this.log(`${target.name} は脱落。`); }

    this.checkRoundEndAfterShot();
    this.advanceTurn();
  }

  /** @param {number} playerId @param {number} itemIndex */
  useItem(playerId, itemIndex){
    const p = this.players[playerId];
    if(!p || !p.alive){ this.log("使用不可"); return; }
    if(playerId!==this.currentIndex){ this.log("自分のターンの時だけ使用できます。"); return; }
    const item = p.items[itemIndex];
    if(!item){ this.log("アイテムがありません"); return; }

    switch(item){
      case "ノコギリ":
        p.hasSawBuff = true; this.log(`${p.name} は ノコギリ を使用。次命中で2倍。`); break;
      case "拡大鏡":
        if(this.chamber.length===0){ this.log("薬室が空のため覗けません。"); }
        else {
          const next = /** @type {BulletKind} */ (this.chamber[0]);
          this.peekInfo = next;
          this.log(`${p.name} は 拡大鏡 で先頭弾を確認 → ${next==="live"?"実弾":"空包"}`);
          if(this.delegate.onPeek) this.delegate.onPeek(next);
        }
        break;
      case "ビール":
        if(this.chamber.length===0){ this.log("薬室に弾がないため排莢できません。"); }
        else {
          const removed = /** @type {BulletKind} */ (this.chamber.shift());
          this.log(`${p.name} は ビール で先頭弾を排莢（${removed==="live"?"実弾":"空包"}）`);
          if(this.delegate.onChamberChanged) this.delegate.onChamberChanged(this.snapshot());
        }
        break;
      case "タバコ":
        p.hp += 1; this.log(`${p.name} は タバコ でHP+1（${p.hp}）`); break;
      case "手錠":
        let nextTarget = null;
        for(let i=1;i<this.players.length;i++){
          const candidate = (this.currentIndex + i) % this.players.length;
          if(this.players[candidate].alive){ nextTarget = this.players[candidate]; break; }
        }
        if(nextTarget){ nextTarget.skip = true; this.log(`${p.name} は 手錠 を使用。次の ${nextTarget.name} をスキップ。`); }
        else { this.log("スキップ対象なし。"); }
        break;
      default:
        this.log("未定義のアイテム");
    }

    p.items.splice(itemIndex,1);
    if(this.delegate.onUpdate) this.delegate.onUpdate(this.snapshot());
    this.log(`（${p.name} のターン継続：アイテム使用はターンを消費しません）`);
  }

  checkRoundEndAfterShot(){
    if(this.chamber.length===0){
      this.log("このラウンドは弾切れです。");
      this.endRound();
    } else {
      if(this.delegate.onUpdate) this.delegate.onUpdate(this.snapshot());
    }
  }

  advanceTurn(){
    if(this.checkAllDeadOrOneLeft()) return;
    let nextIndex = this.currentIndex;
    for(let step=1; step<=this.players.length; step++){
      const candidate = (this.currentIndex + step) % this.players.length;
      if(this.players[candidate].alive){ nextIndex = candidate; break; }
    }
    this.currentIndex = nextIndex;
    this.announceTurn();
  }

  /** @returns {boolean} */
  checkAllDeadOrOneLeft(){
    const alive = this.players.filter(p=>p.alive);
    if(alive.length<=1){
      if(alive.length===1) this.log(`ゲーム終了！ 勝者: ${alive[0].name}`);
      else this.log("同時脱落でゲーム終了。");
      if(this.delegate.onUpdate) this.delegate.onUpdate(this.snapshot());
      return true;
    }
    return false;
  }

  endRound(){
    const alive = this.players.filter(p=>p.alive);
    if(alive.length<=1){ this.checkAllDeadOrOneLeft(); return; }
    this.round += 1;
    this.buildChamber(this.config.chamberSize, this.config.liveCount);
    this.distributeItems();
    this.currentIndex = this.players.findIndex(p=>p.alive);
    this.announceTurn();
  }
}

// =========================== UIController ===========================
class UIController{
  constructor(){
    // テーマ（localStorage / assets）
    this.themeStorageKey = "sg_roulette_theme_v018";
    this.defaultTheme = {
      flashColor:"#ffffff",
      background:null,
      panel:null,
      avatars:{ P1:null, P2:null, P3:null, P4:null },
      damageAvatars:{ P1:null, P2:null, P3:null, P4:null },
      icons:{ "ノコギリ":null, "拡大鏡":null, "ビール":null, "タバコ":null, "手錠":null },
      sounds:{ blank:null, live:null, click:null, volume:{ master:1, blank:1, live:1, click:1 }, muted:false }
    };
    this.theme = JSON.parse(JSON.stringify(this.defaultTheme));

    // 残薬室表示オプション
    this.gameOptsKey = "sg_roulette_gameopts_v018";
    this.gameOptions = { hideChamberRemain:false };

    this.el = (id)=>document.getElementById(id);

    this.engine = new GameEngine({
      onLog: (m)=> this.appendLog(m),
      onUpdate: (s)=> this.updateUI(s),
      onChamberChanged: (s)=> this.updateChamberUI(s),
      onPeek: (k)=> { this.el("peekArea").innerText = (k==="live"?"実弾":"空包"); },
      onPlaySound: (n)=> this.playSound(n),
      onFlash: ()=> this.flash()
    });
  }

  async boot(){
    window.addEventListener("hashchange", ()=> this.route());
    this.route();
    await this.loadThemeAssetsThenLocal();
    this.loadGameOptions();
    this.initUI();
  }

  route(){
    const hash=location.hash || "#/game";
    const vg=this.el("view-game"), vs=this.el("view-settings");
    const ng=this.el("navGame"), ns=this.el("navSettings");
    [ng,ns].forEach(n=>n.classList.remove("active"));
    if(hash.startsWith("#/settings")){ vg.classList.add("hidden"); vs.classList.remove("hidden"); ns.classList.add("active"); }
    else { vs.classList.add("hidden"); vg.classList.remove("hidden"); ng.classList.add("active"); }
  }

  async loadThemeAssetsThenLocal(){
    try{
      const r = await fetch("assets/config.json", {cache:"no-store"});
      if(r.ok){
        const cfg = await r.json();
        this.theme = { ...this.theme, ...cfg };
        const vol = (this.theme.sounds && this.theme.sounds.volume) || {};
        this.theme.sounds.volume = { master:1, blank:1, live:1, click:1, ...vol };
        this.theme.sounds.muted = !!this.theme.sounds.muted;
      }
    }catch(e){}
    try{
      const s = localStorage.getItem(this.themeStorageKey);
      if(s){
        const override = JSON.parse(s);
        this.theme = { ...this.theme, ...override };
        this.theme.avatars = { ...(this.theme.avatars||{}), ...(override.avatars||{}) };
        this.theme.damageAvatars = { ...(this.theme.damageAvatars||{}), ...(override.damageAvatars||{}) };
        this.theme.icons = { ...(this.theme.icons||{}), ...(override.icons||{}) };
        this.theme.sounds = { ...(this.theme.sounds||{}), ...(override.sounds||{}) };
        const vol = (override.sounds && override.sounds.volume) || (this.theme.sounds && this.theme.sounds.volume) || {};
        this.theme.sounds.volume = { master:1, blank:1, live:1, click:1, ...vol };
        this.theme.sounds.muted = !!((override.sounds||{}).muted ?? this.theme.sounds.muted);
      }
    }catch(e){}
    this.applyThemeToDOM();
    this.syncSoundUI();
  }

  applyThemeToDOM(){
    document.documentElement.style.setProperty("--bg-image", this.theme.background? `url(${this.theme.background})`:"none");
    document.documentElement.style.setProperty("--panel-image", this.theme.panel? `url(${this.theme.panel})`:"none");
    document.documentElement.style.setProperty("--flash-color", this.theme.flashColor || "#ffffff");
    if(this.theme.sounds.blank) this.el("sndBlank").src = this.theme.sounds.blank;
    if(this.theme.sounds.live)  this.el("sndLive").src  = this.theme.sounds.live;
    if(this.theme.sounds.click) this.el("sndClick").src = this.theme.sounds.click;
    this.updateAudioVolumes();
  }

  updateAudioVolumes(){
    const m=this.theme.sounds.volume?.master ?? 1;
    const vb=this.theme.sounds.volume?.blank ?? 1;
    const vl=this.theme.sounds.volume?.live ?? 1;
    const vc=this.theme.sounds.volume?.click ?? 1;
    const muted=!!this.theme.sounds.muted;
    const setVol=(id,v)=>{ const a=this.el(id); a.volume = muted? 0 : Math.max(0,Math.min(1,v)); };
    setVol("sndBlank", m*vb); setVol("sndLive", m*vl); setVol("sndClick", m*vc);
  }

  syncSoundUI(){
    const v=this.theme.sounds.volume || {master:1,blank:1,live:1,click:1};
    const ids=["volMaster","volBlank","volLive","volClick"];
    const labels=["volMasterLabel","volBlankLabel","volLiveLabel","volClickLabel"];
    const vals=[v.master??1, v.blank??1, v.live??1, v.click??1];
    ids.forEach((id,i)=>{ const e=this.el(id); if(e) e.value = vals[i]; });
    labels.forEach((id,i)=>{ const e=this.el(id); if(e) e.textContent = Math.round(vals[i]*100)+"%"; });
    const tb=this.el("volMasterToolbar"); if(tb) tb.value = vals[0];
    const tbl=this.el("volMasterToolbarLabel"); if(tbl) tbl.textContent = Math.round(vals[0]*100)+"%";
    const muteBtn=this.el("muteToggle"); if(muteBtn) muteBtn.textContent = this.theme.sounds.muted ? "🔈 ミュート解除" : "🔇 ミュート";
    const setUrl=(id,url)=>{ const e=this.el(id); if(e) e.value = url||""; };
    setUrl("sndBlankUrl", this.theme.sounds.blank);
    setUrl("sndLiveUrl",  this.theme.sounds.live);
    setUrl("sndClickUrl", this.theme.sounds.click);
  }

  playSound(name){
    const id = {blank:"sndBlank", live:"sndLive", click:"sndClick"}[name];
    const a = id && this.el(id);
    if(a && a.src){ try{ a.currentTime=0; a.play().catch(()=>{});}catch(e){} }
  }
  flash(){ const f=this.el("flashOverlay"); f.style.animation="flashEffect .28s ease"; f.onanimationend=()=>{ f.style.animation=""; }; }

  loadGameOptions(){
    try{ const s=localStorage.getItem(this.gameOptsKey); if(s) this.gameOptions={...this.gameOptions, ...(JSON.parse(s)||{})}; }catch(e){}
    const cb=this.el("optHideChamberRemain"); if(cb) cb.checked = !!this.gameOptions.hideChamberRemain;
  }
  saveGameOptions(){
    const cb=this.el("optHideChamberRemain"); this.gameOptions.hideChamberRemain = !!(cb && cb.checked);
    localStorage.setItem(this.gameOptsKey, JSON.stringify(this.gameOptions));
    const res=this.el("saveGameOptsResult"); if(res){ res.textContent="保存しました ✓"; setTimeout(()=>res.textContent="",1600); }
    this.updateChamberUI(this.engine.snapshot());
  }

  initUI(){
    // タイトルから開始
    this.el("startBtnTitle").addEventListener("click", ()=>{
      this.playSound("click");
      this.el("titleScreen").style.display="none";
      this.el("view-game").classList.remove("hidden");
      this.startGameFromInputs();
    });

    // 基本操作
    this.el("startBtn").onclick = ()=> this.startGameFromInputs();
    this.el("resetBtn").onclick = ()=>{ this.engine.reset(); this.updateUI(this.engine.snapshot()); this.appendLog("ゲームをリセットしました。"); };
    this.el("shootBtn").onclick = ()=> this.engine.performShoot(parseInt(this.el("targetSelect").value), false);
    this.el("shootSelfBtn").onclick = ()=> this.engine.performShoot(null, true);
    this.el("endTurnBtn").onclick = ()=>{};
    this.el("clearLog").onclick = ()=> this.el("log").innerHTML="";

    // 設定モーダル
    this.el("openSettings").onclick = ()=>{ this.playSound("click"); this.openSettings(); };
    this.el("closeSettings").onclick = ()=> this.closeSettings();
    this.el("settingsBackdrop").onclick = ()=> this.closeSettings();

    // 背景・パネル・フラッシュ
    this.el("bgApply").onclick = ()=>{ const url=(this.el("bgUrl").value||"").trim(); this.theme.background=url||null; this.applyThemeToDOM(); this.el("bgPreview").style.backgroundImage = url?`url(${url})`:"none"; };
    this.el("panelApply").onclick = ()=>{ const url=(this.el("panelUrl").value||"").trim(); this.theme.panel=url||null; this.applyThemeToDOM(); this.el("panelPreview").style.backgroundImage = url?`url(${url})`:"none"; };
    this.el("flashTest").onclick = ()=> this.flash();

    // サウンド
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
    this.el("testBlank").onclick=()=>this.playSound("blank");
    this.el("testLive").onclick =()=>this.playSound("live");
    this.el("testClick").onclick=()=>this.playSound("click");

    // 音量・ミュート
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

    // ヘルプ開閉（ローカル関数で定義）
    {
      const panel=this.el("helpPanel");
      const open=()=>{ panel.classList.add("open"); panel.setAttribute("aria-hidden","false"); };
      const close=()=>{ panel.classList.remove("open"); panel.setAttribute("aria-hidden","true"); };
      this.el("helpToggle").onclick = open;
      this.el("helpClose").onclick = close;
    }

    // 数値入力クランプ（その場定義）
    {
      const attach=(id, fn)=>{ const e=this.el(id); if(!e) return; e.addEventListener("change", ()=>{ e.value = fn(parseInt(e.value)); }); };
      attach("playerCount", v=> (!Number.isFinite(v)||v<2)?2:(v>4?4:v));
      attach("initHp", v=> (!Number.isFinite(v)||v<1)?1:(v>99?99:v));
      attach("chamberSize", v=> (!Number.isFinite(v)||v<1)?1:(v>36?36:v));
      attach("liveCount", v=> (!Number.isFinite(v)||v<0)?0:(v>36?36:v));
    }

    // ゲームオプション保存
    const saveOpts=this.el("saveGameOpts"); if(saveOpts) saveOpts.onclick = ()=> this.saveGameOptions();
  }

  /** @param {Snapshot} snapshot */
  updateUI(snapshot){
    if(!snapshot) snapshot = this.engine.snapshot();
    this.el("roundNo").innerText = String(snapshot.round);
    this.el("currentPlayer").innerText = snapshot.players[snapshot.currentIndex]? snapshot.players[snapshot.currentIndex].name : "-";
    this.el("peekState").innerText = snapshot.peekInfo ? (snapshot.peekInfo==="live"?"実弾":"空包") : "不明";
    this.updateChamberUI(snapshot);
    this.renderPlayers(snapshot);

    // ターゲット選択をこの場で作る
    const sel=this.el("targetSelect"); sel.innerHTML="";
    const me=snapshot.players[snapshot.currentIndex];
    if(me){
      snapshot.players.forEach(p=>{
        if(!p.alive) return;
        const opt=document.createElement("option");
        opt.value=String(p.id);
        opt.text=p.name + (p.id===me.id ? " (自分)" : "");
        sel.add(opt);
      });
      let def=0;
      for(let i=0;i<sel.options.length;i++){ if(parseInt(sel.options[i].value)!==me.id){ def=i; break; } }
      sel.selectedIndex=def;
    }

    // 現在手番の顔をポートレートへ（HP<=3でダメージ顔）
    const current=snapshot.players[snapshot.currentIndex];
    if(current){
      const idx=snapshot.currentIndex;
      const normal=(this.theme.avatars||{})["P"+(idx+1)];
      const hurt=(this.theme.damageAvatars||{})["P"+(idx+1)];
      const useHurt=current.hp<=3;
      const img=this.el("portraitImg"); const badge=this.el("portraitBadge");
      const url = useHurt ? (hurt || normal) : normal;
      if(img){ img.style.backgroundImage = url?`url(${url})`:"none"; img.classList.toggle("hurt", useHurt && !hurt); }
      if(badge) badge.textContent = current.name;
    }
  }

  /** @param {Snapshot} snapshot */
  updateChamberUI(snapshot){
    if(this.gameOptions.hideChamberRemain){
      this.el("chamberTotal").innerText = String(snapshot.chamberTotal);
      this.el("chamberRemain").innerText = "??";
    } else {
      this.el("chamberTotal").innerText = String(snapshot.chamberTotal);
      this.el("chamberRemain").innerText = String(snapshot.chamberRemain);
    }
  }

  /** @param {Snapshot} snapshot */
  renderPlayers(snapshot){
    const cont=this.el("playersContainer"); cont.innerHTML="";
    // HPを星（★）で表示する関数（ここだけで使用）
    const stars = (n)=> "★".repeat(Math.max(0, Math.floor(n)));

    snapshot.players.forEach((p,i)=>{
      const div=document.createElement("div");
      div.className="player"+(p.alive?"":" dead"); div.id="player_"+p.id;

      // 顔（番号固定）。HP<=3でダメージ顔（未設定なら赤ティント）
      const normal=(this.theme.avatars||{})["P"+(i+1)];
      const hurt=(this.theme.damageAvatars||{})["P"+(i+1)] || null;
      const isHurt=p.hp<=3;
      const avatarUrl = isHurt ? (hurt || normal) : normal;
      const avatarStyle = avatarUrl ? `background-image:url('${avatarUrl}')` : "";
      const avatarClass = "avatar" + (isHurt && !hurt ? " hurt" : "");

      const itemsHtml = p.items.map((label, idx)=>{
        const iconUrl=(this.theme.icons||{})[label];
        const iconHtml = iconUrl? `<span class="icon" style="background-image:url('${iconUrl}')"></span>` : "";
        return `<span class="item" data-player="\${p.id}" data-idx="\${idx}">\${iconHtml}<span>\${label}</span></span>`;
      }).join("");

      div.innerHTML = `
        <div class="${avatarClass}" style="${avatarStyle}" title="${p.name}"></div>
        <div>
          <div style="font-weight:700">${p.name} ${snapshot.currentIndex===i?"←":""}</div>
          <div>HP: <span class="hp" title="${p.hp}">${stars(p.hp)}</span></div>
          <div>状態: ${p.alive?"生存":"脱落"}</div>
          <div class="items">アイテム: ${itemsHtml}</div>
          <div style="margin-top:6px; font-size:13px;">${p.skip? "（次ターンをスキップ予定）": ""}</div>
        </div>`;
      cont.appendChild(div);
    });

    // アイテムボタンのクリック
    cont.querySelectorAll(".item").forEach(el=>{
      el.onclick = ()=>{
        const pid=parseInt(el.getAttribute("data-player"));
        const idx=parseInt(el.getAttribute("data-idx"));
        this.engine.useItem(pid, idx);
      };
    });

    // 自分のアイテムを別枠に
    const me=snapshot.players[snapshot.currentIndex];
    const area=this.el("yourItems");
    if(!me){ area.innerHTML="なし"; return; }
    area.innerHTML = me.items.map((label, idx)=>{
      const iconUrl=(this.theme.icons||{})[label];
      const iconHtml = iconUrl? `<span class="icon" style="width:16px;height:16px; background-image:url('${iconUrl}'); display:inline-block; vertical-align:-3px; margin-right:6px;"></span>` : "";
      return `<button data-idx="${idx}" data-player="${me.id}">${iconHtml}${label}</button>`;
    }).join(" ");
    area.querySelectorAll("button").forEach(btn=>{
      btn.onclick = ()=>{
        const idx=parseInt(btn.getAttribute("data-idx"));
        this.engine.useItem(me.id, idx);
      };
    });
  }

  appendLog(message){
    const l=this.el("log"); const time=new Date().toLocaleTimeString();
    l.innerHTML = `<div>[${time}] ${this.escapeHtml(message)}</div>` + l.innerHTML;
  }
  escapeHtml(s){ return s==null? "" : s.toString().replace(/&/g,"&amp;").replace(/</g,"&lt;"); }

  startGameFromInputs(){
    this.engine.reset();
    this.engine.configure({
      playerCount: parseInt(this.el("playerCount").value),
      initHp: parseInt(this.el("initHp").value),
      chamberSize: parseInt(this.el("chamberSize").value),
      liveCount: parseInt(this.el("liveCount").value),
    });
    this.engine.start();
  }
  openSettings(){ this.el("settingsModal").classList.remove("hidden"); }
  closeSettings(){ this.el("settingsModal").classList.add("hidden"); }
}

document.addEventListener("DOMContentLoaded", ()=>{
  const ui = new UIController(); window.ui = ui; ui.boot();
});
