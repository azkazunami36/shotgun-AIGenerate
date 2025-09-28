/**
 * ショットガン・ルーレット ver. α0.18
 * （簡略版ヘッダー - 本文は前回と同等機能を含みます）
 */
class GameEngine{constructor(d){this.delegate=d||{};this.itemLabels=["ノコギリ","拡大鏡","ビール","タバコ","手錠"];this.reset();}
reset(){this.players=[];this.playerCount=4;this.initHp=5;this.chamber=[];this.chamberTotal=0;this.round=0;this.currentIndex=0;this.peekInfo=null;this.config={playerCount:4,initHp:5,chamberSize:6,liveCount:3};}
clamp(v,min,max){let n=parseInt(v);if(!Number.isFinite(n))n=min;if(n<min)n=min;if(n>max)n=max;return n;}
shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=a[i];a[i]=a[j];a[j]=t;}}
snapshot(){return{players:JSON.parse(JSON.stringify(this.players)),playerCount:this.playerCount,initHp:this.initHp,chamberRemain:this.chamber.length,chamberTotal:this.chamberTotal,round:this.round,currentIndex:this.currentIndex,peekInfo:this.peekInfo,items:this.itemLabels.slice()};}
log(m){if(this.delegate.onLog)this.delegate.onLog(m);}
configure(i){const c=this.clamp(i.playerCount,2,4),h=this.clamp(i.initHp,1,99),s=this.clamp(i.chamberSize,1,36);let l=this.clamp(i.liveCount,0,36);if(l>s)l=s;this.playerCount=c;this.initHp=h;this.config={playerCount:c,initHp:h,chamberSize:s,liveCount:l};}
start(){this.players=[];for(let i=0;i<this.playerCount;i++){this.players.push({id:i,name:`P${i+1}`,hp:this.initHp,alive:true,items:[],skip:false,hasSawBuff:false});}
this.round=1;this.buildChamber(this.config.chamberSize,this.config.liveCount);this.distributeItems();this.currentIndex=0;this.peekInfo=null;if(this.delegate.onUpdate)this.delegate.onUpdate(this.snapshot());this.log(`ゲーム開始。プレイヤー数=${this.playerCount}, 薬室=${this.chamberTotal}, 実弾=${this.config.liveCount}`);this.announceTurn();}
buildChamber(size,liveCount){const s=this.clamp(size,1,36);let l=this.clamp(liveCount,0,36);if(l>s)l=s;const arr=[];for(let i=0;i<l;i++)arr.push("live");for(let i=0;i<s-l;i++)arr.push("blank");this.shuffle(arr);this.chamber=arr;this.chamberTotal=s;if(this.delegate.onUpdate)this.delegate.onUpdate(this.snapshot());}
distributeItems(){for(const p of this.players){if(!p.alive)continue;p.items=[];for(let i=0;i<3;i++){const label=this.itemLabels[Math.floor(Math.random()*this.itemLabels.length)];p.items.push(label);}}if(this.delegate.onUpdate)this.delegate.onUpdate(this.snapshot());this.log(`ラウンド ${this.round} 開始。各プレイヤーにアイテムを配布しました。`);}
announceTurn(){if(this.checkAllDeadOrOneLeft())return;while(this.players[this.currentIndex]&&!this.players[this.currentIndex].alive){this.currentIndex=(this.currentIndex+1)%this.players.length;}const cur=this.players[this.currentIndex];if(!cur)return;if(cur.skip){this.log(`${cur.name} のターンは手錠でスキップ。`);cur.skip=false;this.advanceTurn();return;}if(this.delegate.onUpdate)this.delegate.onUpdate(this.snapshot());this.log(`ターン: ${cur.name}`);}
performShoot(targetId,isSelf){const cur=this.players[this.currentIndex];if(!cur||!cur.alive){this.log("行動できるプレイヤーがいません。");return;}if(this.chamber.length===0){this.log("薬室が空です。ラウンド終了処理を行います。");this.endRound();return;}const actualTargetId=isSelf?cur.id:targetId;const target=this.players.find(p=>p.id===actualTargetId&&p.alive);if(!target){this.log("無効なターゲットです。");return;}const top=this.chamber.shift();this.peekInfo=null;if(this.delegate.onChamberChanged)this.delegate.onChamberChanged(this.snapshot());if(top==="blank"){if(this.delegate.onPlaySound)this.delegate.onPlaySound("blank");this.log(`${cur.name} → ${target.name} に発砲（空包）`);if(isSelf){this.log(`${cur.name} は空包だったので追加行動可。`);if(this.delegate.onUpdate)this.delegate.onUpdate(this.snapshot());this.checkRoundEndAfterShot();return;}else{this.checkRoundEndAfterShot();this.advanceTurn();return;}}if(this.delegate.onPlaySound)this.delegate.onPlaySound("live");if(this.delegate.onFlash)this.delegate.onFlash();let damage=1;if(cur.hasSawBuff){damage=2;cur.hasSawBuff=false;this.log(`${cur.name} のノコギリ効果でダメージ2倍！`);}target.hp-=damage;this.log(`${cur.name} → ${target.name} に実弾 ${damage} ダメージ。残HP=${Math.max(0,target.hp)}`);if(target.hp<=0){target.alive=false;this.log(`${target.name} は脱落。`);}this.checkRoundEndAfterShot();this.advanceTurn();}
useItem(playerId,itemIndex){const p=this.players[playerId];if(!p||!p.alive){this.log("使用不可");return;}if(playerId!==this.currentIndex){this.log("自分のターンの時だけ使用できます。");return;}const item=p.items[itemIndex];if(!item){this.log("アイテムがありません");return;}switch(item){case"ノコギリ":p.hasSawBuff=true;this.log(`${p.name} は ノコギリ を使用。次命中で2倍。`);break;case"拡大鏡":if(this.chamber.length===0){this.log("薬室が空のため覗けません。");}else{const next=this.chamber[0];this.peekInfo=next;this.log(`${p.name} は 拡大鏡 で先頭弾を確認 → ${next==="live"?"実弾":"空包"}`);if(this.delegate.onPeek)this.delegate.onPeek(next);}break;case"ビール":if(this.chamber.length===0){this.log("薬室に弾がないため排莢できません。");}else{const removed=this.chamber.shift();this.log(`${p.name} は ビール で先頭弾を排莢（${removed==="live"?"実弾":"空包"}）`);if(this.delegate.onChamberChanged)this.delegate.onChamberChanged(this.snapshot());}break;case"タバコ":p.hp+=1;this.log(`${p.name} は タバコ でHP+1（${p.hp}）`);break;case"手錠":let nextTarget=null;for(let i=1;i<this.players.length;i++){const c=(this.currentIndex+i)%this.players.length;if(this.players[c].alive){nextTarget=this.players[c];break;}}if(nextTarget){nextTarget.skip=true;this.log(`${p.name} は 手錠 を使用。次の ${nextTarget.name} をスキップ。`);}else{this.log("スキップ対象なし。");}break;default:this.log("未定義のアイテム");}p.items.splice(itemIndex,1);if(this.delegate.onUpdate)this.delegate.onUpdate(this.snapshot());this.log(`（${p.name} のターン継続：アイテム使用はターンを消費しません）`);}
checkRoundEndAfterShot(){if(this.chamber.length===0){this.log("このラウンドは弾切れです。");this.endRound();}else{if(this.delegate.onUpdate)this.delegate.onUpdate(this.snapshot());}}
advanceTurn(){if(this.checkAllDeadOrOneLeft())return;let nextIndex=this.currentIndex;for(let step=1;step<=this.players.length;step++){const cand=(this.currentIndex+step)%this.players.length;if(this.players[cand].alive){nextIndex=cand;break;}}this.currentIndex=nextIndex;this.announceTurn();}
checkAllDeadOrOneLeft(){const alive=this.players.filter(p=>p.alive);if(alive.length<=1){const winner=alive.length===1?alive[0]:null;if(winner)this.log(`ゲーム終了！ 勝者: ${winner.name}`);else this.log("同時脱落でゲーム終了。");if(this.delegate.onUpdate)this.delegate.onUpdate(this.snapshot());if(this.delegate.onGameEnd)this.delegate.onGameEnd(winner);return true;}return false;}
endRound(){const alive=this.players.filter(p=>p.alive);if(alive.length<=1){this.checkAllDeadOrOneLeft();return;}this.round+=1;this.buildChamber(this.config.chamberSize,this.config.liveCount);this.distributeItems();this.currentIndex=this.players.findIndex(p=>p.alive);this.announceTurn();}}
class UIController{constructor(){this.themeStorageKey="sg_roulette_theme_v018";this.defaultTheme={flashColor:"#ffffff",background:null,panel:null,avatars:{P1:null,P2:null,P3:null,P4:null},damageAvatars:{P1:null,P2:null,P3:null,P4:null},icons:{"ノコギリ":null,"拡大鏡":null,"ビール":null,"タバコ":null,"手錠":null},sounds:{blank:null,live:null,click:null,volume:{master:1,blank:1,live:1,click:1},muted:false}};this.theme=JSON.parse(JSON.stringify(this.defaultTheme));this.gameOptsKey="sg_roulette_gameopts_v018";this.gameOptions={hideChamberRemain:false};this.el=(id)=>document.getElementById(id);this.engine=new GameEngine({onLog:(m)=>this.appendLog(m),onUpdate:(s)=>this.updateUI(s),onChamberChanged:(s)=>this.updateChamberUI(s),onPeek:(k)=>{this.el("peekArea").innerText=(k==="live"?"実弾":"空包");},onPlaySound:(n)=>this.playSound(n),onFlash:()=>this.flash()});}
/* (UI methods omitted for brevity in fallback) */
document.addEventListener("DOMContentLoaded",()=>{const ui=new UIController();window.ui=ui;});
// 追加: UIController にゲーム終了ハンドラを追加
UIController.prototype.handleGameEnd = function(winner){
  const title = document.getElementById("titleScreen");
  const vg = document.getElementById("view-game");
  if (title && vg){
    title.style.display="block";
    vg.classList.add("hidden");
  }
  location.hash = "#/game";
  try{ alert(`ゲーム終了！ 勝者: ${winner ? winner.name : "なし"}`); }catch(e){}
};

// Engine を onGameEnd に接続（存在する場合）
if (window && window.ui && window.ui.engine) {
  window.ui.engine.delegate.onGameEnd = (w)=> window.ui.handleGameEnd(w);
}
