/**
 * ショットガン・ルーレット ver. α0.16 (JSDoc強化版)
 * - GameEngine: ゲーム内部ロジック（UI非依存）
 * - UIController: 画面更新・入力処理・音／フラッシュ・テーマ・ポートレートなど
 * 
 * ポリシー:
 *  - すべての関数・重要変数にJSDocを付与し、型と目的・振る舞いを明記
 *  - 先頭に下線(_)を付けない命名
 *  - 各処理ブロックにコメントを追加し、演算の意図を明確化
 */

/**
 * プレイヤーの構造
 * @typedef {Object} Player
 * @property {number} id           - プレイヤーの識別子（0始まりのインデックス）
 * @property {string} name         - 表示名（例: "P1"）
 * @property {number} hp           - 現在のHP（0以下で脱落）
 * @property {boolean} alive       - 生存フラグ（true=生存、false=脱落）
 * @property {string[]} items      - 所持アイテムの配列（ラベル文字列）
 * @property {boolean} skip        - 次のターンをスキップするか（手錠の効果）
 * @property {boolean} hasSawBuff  - ノコギリで次命中が2倍になる一時バフ
 */

/**
 * エンジンのスナップショット（UIへ渡す読み取り専用の状態）
 * @typedef {Object} Snapshot
 * @property {Player[]} players        - プレイヤー配列（ディープコピー）
 * @property {number} playerCount      - プレイヤー数
 * @property {number} initHp           - 各プレイヤーの初期HP
 * @property {number} chamberRemain    - 残弾（薬室の残り弾数）
 * @property {number} chamberTotal     - 薬室の総弾数
 * @property {number} round            - 現在のラウンド番号（1始まり）
 * @property {number} currentIndex     - 現在ターンのプレイヤーインデックス
 * @property {"live"|"blank"|null} peekInfo - 拡大鏡で覗いた先頭弾の情報（null=不明）
 * @property {string[]} items          - ゲーム内で使用されるアイテム名一覧
 */

/**
 * エンジンからUIへ通知するイベント関数群
 * @typedef {Object} EngineDelegate
 * @property {(message:string)=>void} [onLog] - ログ文字列を受け取る
 * @property {(snapshot:Snapshot)=>void} [onUpdate] - 状態が変化した際に呼ばれる
 * @property {(snapshot:Snapshot)=>void} [onChamberChanged] - 薬室残数の更新が必要な時に呼ばれる
 * @property {("live"|"blank")=>void} [onPeek] - 拡大鏡で先頭弾を確認した時に呼ばれる
 * @property {(name:"blank"|"live"|"click")=>void} [onPlaySound] - 効果音の再生指示
 * @property {()=>void} [onFlash] - 実弾時のフラッシュ指示
 */

/**
 * 入力値セット（ゲーム開始時の設定）
 * @typedef {Object} EngineConfig
 * @property {number} playerCount  - プレイヤー数（2〜4）
 * @property {number} initHp       - 初期HP（1〜99）
 * @property {number} chamberSize  - 薬室の総弾数（1〜36）
 * @property {number} liveCount    - 実弾の数（0〜chamberSize）
 */

// ============================================================
// GameEngine: ゲーム内部ロジック（UIには依存しない）
// ============================================================
class GameEngine {
  /**
   * @param {EngineDelegate} delegate - UIへイベント通知する関数群
   */
  constructor(delegate) {
    /** @type {EngineDelegate} */
    this.delegate = delegate || {};

    /** @type {string[]} アイテム名の一覧（ここで登録されたもののみ配布される） */
    this.itemLabels = ["ノコギリ", "拡大鏡", "ビール", "タバコ", "手錠"];

    // 内部状態を初期化
    this.reset();
  }

  /**
   * エンジンの全状態を既定値に戻す
   */
  reset() {
    /** @type {Player[]} */
    this.players = [];
    /** @type {number} */
    this.playerCount = 4;
    /** @type {number} */
    this.initHp = 5;
    /** @type {("live"|"blank")[]} */
    this.chamber = [];               // 弾列（先頭=次に発射される弾）
    /** @type {number} */
    this.chamberTotal = 0;           // 薬室の総弾数（固定値として保持）
    /** @type {number} */
    this.round = 0;                  // ラウンド番号（ゲーム開始時に1へ）
    /** @type {number} */
    this.currentIndex = 0;           // 現在ターンのプレイヤー（配列インデックス）
    /** @type {"live"|"blank"|null} */
    this.peekInfo = null;            // 拡大鏡で覗いた先頭弾の情報

    /** @type {EngineConfig} */
    this.config = { playerCount: 4, initHp: 5, chamberSize: 6, liveCount: 3 };
  }

  /**
   * 数値を範囲にクランプする（下限・上限を超えないよう補正）
   * @param {number} value 入力値
   * @param {number} min 最小値
   * @param {number} max 最大値
   * @returns {number} 補正後の値
   */
  clamp(value, min, max) {
    let n = parseInt(value);
    if (!Number.isFinite(n)) n = min;     // 非数の場合は下限を採用
    if (n < min) n = min;                 // 下限未満は下限へ
    if (n > max) n = max;                 // 上限超過は上限へ
    return n;
  }

  /**
   * 配列をインプレースでFisher-Yatesシャッフルする
   * @template T
   * @param {T[]} array シャッフル対象
   */
  shuffle(array) {
    if (!Array.isArray(array)) return;
    // 後方から順に「自分と0..iのランダム位置」を交換
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); // 0〜i の一様乱数
      const tmp = array[i];
      array[i] = array[j];
      array[j] = tmp;
    }
  }

  /**
   * ログ送信（UI側がいれば渡す）
   * @param {string} message 表示したい内容
   */
  log(message) {
    if (this.delegate.onLog) this.delegate.onLog(message);
  }

  /**
   * 現在状態のスナップショットを作成して返す（UIはこれだけを読む）
   * @returns {Snapshot}
   */
  snapshot() {
    return {
      players: JSON.parse(JSON.stringify(this.players)),  // 破壊防止にディープコピー
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

  /**
   * UIから受け取ったゲーム設定を保存（値はすべてクランプ）
   * @param {EngineConfig} input 設定値
   */
  configure(input) {
    const clampedCount = this.clamp(input.playerCount, 2, 4);
    const clampedHp = this.clamp(input.initHp, 1, 99);
    const clampedChamber = this.clamp(input.chamberSize, 1, 36);
    let clampedLive = this.clamp(input.liveCount, 0, 36);
    if (clampedLive > clampedChamber) clampedLive = clampedChamber; // 実弾は総弾数を超えない

    this.playerCount = clampedCount;
    this.initHp = clampedHp;
    this.config = {
      playerCount: clampedCount,
      initHp: clampedHp,
      chamberSize: clampedChamber,
      liveCount: clampedLive
    };
  }

  /**
   * ゲームを開始（プレイヤー作成→弾倉作成→配布→ターン通知）
   */
  start() {
    // プレイヤー配列を構築
    this.players = [];
    for (let i = 0; i < this.playerCount; i++) {
      /** @type {Player} */
      const p = { id: i, name: `P${i + 1}`, hp: this.initHp, alive: true, items: [], skip: false, hasSawBuff: false };
      this.players.push(p);
    }

    // ラウンド番号を1に設定
    this.round = 1;

    // 弾倉を構築（実弾 live と 空包 blank の配列を作りシャッフル）
    this.buildChamber(this.config.chamberSize, this.config.liveCount);

    // 各プレイヤーへランダムに3つのアイテムを配布
    this.distributeItems();

    // 最初のターンはインデックス0
    this.currentIndex = 0;

    // 直前の覗き情報はクリア
    this.peekInfo = null;

    // UIへ初回更新通知
    if (this.delegate.onUpdate) this.delegate.onUpdate(this.snapshot());

    // ログを出し、ターン開始を知らせる
    this.log(`ゲーム開始。プレイヤー数=${this.playerCount}, 薬室=${this.chamberTotal}, 実弾=${this.config.liveCount}`);
    this.announceTurn();
  }

  /**
   * 薬室（弾配列）を再構築する
   * @param {number} size 総弾数
   * @param {number} liveCount 実弾の数
   */
  buildChamber(size, liveCount) {
    // 値を安全に補正
    const s = this.clamp(size, 1, 36);
    let l = this.clamp(liveCount, 0, 36);
    if (l > s) l = s;

    // 実弾l個・空包(s-l)個の配列を作る
    /** @type {("live"|"blank")[]} */
    const arr = [];
    for (let i = 0; i < l; i++) arr.push("live");
    for (let i = 0; i < s - l; i++) arr.push("blank");

    // 配列をシャッフルして弾の順序をランダムにする
    this.shuffle(arr);

    // 内部状態へ反映
    this.chamber = arr;
    this.chamberTotal = s;

    // UIへ更新通知
    if (this.delegate.onUpdate) this.delegate.onUpdate(this.snapshot());
  }

  /**
   * 全プレイヤーに3つのアイテムをランダム配布
   */
  distributeItems() {
    for (const p of this.players) {
      if (!p.alive) continue;            // 脱落者には配布しない
      p.items = [];
      for (let i = 0; i < 3; i++) {
        const label = this.itemLabels[Math.floor(Math.random() * this.itemLabels.length)];
        p.items.push(label);
      }
    }
    // UI更新とログ
    if (this.delegate.onUpdate) this.delegate.onUpdate(this.snapshot());
    this.log(`ラウンド ${this.round} 開始。各プレイヤーにランダムで3つのアイテムを配布しました。`);
  }

  /**
   * 現在の手番プレイヤーをアナウンスし、スキップがあれば処理する
   */
  announceTurn() {
    // 全滅・最後の1人の判定
    if (this.checkAllDeadOrOneLeft()) return;

    // 生存しているプレイヤーまでcurrentIndexを進める
    while (this.players[this.currentIndex] && !this.players[this.currentIndex].alive) {
      this.currentIndex = (this.currentIndex + 1) % this.players.length; // 次のインデックスへ循環
    }

    // 現在手番のプレイヤーを取得
    const cur = this.players[this.currentIndex];
    if (!cur) return;

    // スキップフラグが立っている場合はスキップ処理
    if (cur.skip) {
      this.log(`${cur.name} のターンは手錠効果でスキップされました。`);
      cur.skip = false;                // スキップは一度きりの効果
      this.advanceTurn();              // 次のプレイヤーへ移動
      return;
    }

    // UI更新とログ出力
    if (this.delegate.onUpdate) this.delegate.onUpdate(this.snapshot());
    this.log(`ターン: ${cur.name}`);
  }

  /**
   * 発砲アクションを実行する
   * @param {number|null} targetId 射撃対象のプレイヤーID（nullなら自分撃ち）
   * @param {boolean} isSelf 自分に撃つ場合はtrue
   */
  performShoot(targetId, isSelf) {
    const cur = this.players[this.currentIndex];
    if (!cur || !cur.alive) { this.log("行動できるプレイヤーがいません。"); return; }
    if (this.chamber.length === 0) { this.log("薬室が空です。ラウンド終了処理を行います。"); this.endRound(); return; }

    // ターゲットを決定：isSelfがtrueなら自分、falseならtargetIdを採用
    const actualTargetId = isSelf ? cur.id : targetId;
    const target = this.players.find(p => p.id === actualTargetId && p.alive);
    if (!target) { this.log("無効なターゲットです。"); return; }

    // 先頭の弾を取り出す（shift() は先頭要素を取りつつ配列を1つ前詰めにする）
    const top = this.chamber.shift();

    // 拡大鏡の事前情報は発砲と同時にリセット
    this.peekInfo = null;

    // 薬室残数のUI更新
    if (this.delegate.onChamberChanged) this.delegate.onChamberChanged(this.snapshot());

    // 弾が空包の場合の処理
    if (top === "blank") {
      if (this.delegate.onPlaySound) this.delegate.onPlaySound("blank");
      this.log(`${cur.name} が ${target.name} に発砲 → 空包（安心）。`);

      if (isSelf) {
        // 自分撃ちが空包なら追加行動可能（ターンは変えずに状態だけ更新）
        this.log(`${cur.name} は空包だったため、追加で行動できます。`);
        if (this.delegate.onUpdate) this.delegate.onUpdate(this.snapshot());
        this.checkRoundEndAfterShot();
        return;
      } else {
        // 他人へ空包 → 通常どおりターンを進める
        this.checkRoundEndAfterShot();
        this.advanceTurn();
        return;
      }
    }

    // 弾が実弾の場合の処理
    if (this.delegate.onPlaySound) this.delegate.onPlaySound("live");
    if (this.delegate.onFlash) this.delegate.onFlash();

    // ダメージは通常1。ノコギリ効果があれば2にする
    let damage = 1;
    if (cur.hasSawBuff) {
      damage = 2;
      cur.hasSawBuff = false; // 一度使うと消える
      this.log(`${cur.name} のノコギリ効果でダメージが2倍になった！`);
    }

    // ターゲットのHPを減算し、0以下なら脱落とする
    target.hp -= damage;
    this.log(`${cur.name} が ${target.name} に発砲 → 実弾！ ${target.name} に ${damage} ダメージ。残HP=${Math.max(0, target.hp)}`);
    if (target.hp <= 0) {
      target.alive = false;
      this.log(`${target.name} は脱落しました。`);
    }

    // ラウンド終了チェック → その後、次のプレイヤーへ
    this.checkRoundEndAfterShot();
    this.advanceTurn();
  }

  /**
   * アイテム使用アクション
   * @param {number} playerId 使用者のプレイヤーID
   * @param {number} itemIndex プレイヤー所持アイテム配列のインデックス
   */
  useItem(playerId, itemIndex) {
    const p = this.players[playerId];
    if (!p || !p.alive) { this.log("使用不可"); return; }
    if (playerId !== this.currentIndex) { this.log("自分のターンの時だけ使用できます。"); return; }

    const item = p.items[itemIndex];
    if (!item) { this.log("アイテムがありません"); return; }

    // アイテムごとの効果分岐
    switch (item) {
      case "ノコギリ":
        // 次の命中ダメージを2倍にする
        p.hasSawBuff = true;
        this.log(`${p.name} は ノコギリ を使用。次に命中すればダメージ2倍。`);
        break;

      case "拡大鏡":
        // 薬室が空なら不可、弾があるなら先頭弾の種別をpeekInfoに記録
        if (this.chamber.length === 0) {
          this.log("薬室が空のため覗けません。");
        } else {
          const next = this.chamber[0];
          this.peekInfo = next;
          this.log(`${p.name} は 拡大鏡 を使い、先頭弾が「${next === "live" ? "実弾" : "空包"}」であることを確認した。`);
          if (this.delegate.onPeek) this.delegate.onPeek(next);
        }
        break;

      case "ビール":
        // 先頭弾を排出して捨てる（配列先頭の要素を削除）
        if (this.chamber.length === 0) {
          this.log("薬室に弾がないため排莢できません。");
        } else {
          const removed = this.chamber.shift();
          this.log(`${p.name} は ビール を使用し、次の弾を排莢した（${removed === "live" ? "実弾" : "空包"}が取り除かれた）。`);
          if (this.delegate.onChamberChanged) this.delegate.onChamberChanged(this.snapshot());
        }
        break;

        case "タバコ":
        // HPを1回復する（上限は設けない）
        p.hp += 1;
        this.log(`${p.name} は タバコ を喫み、HPを1回復。（現在HP=${p.hp}）`);
        break;

      case "手錠":
        // 次の生存プレイヤーを探索し、そのターンをスキップさせる
        let nextTarget = null;
        for (let i = 1; i < this.players.length; i++) {
          const candidate = (this.currentIndex + i) % this.players.length; // 次以降のインデックス
          if (this.players[candidate].alive) { nextTarget = this.players[candidate]; break; }
        }
        if (nextTarget) {
          nextTarget.skip = true;
          this.log(`${p.name} は 手錠 を使用。次のプレイヤー ${nextTarget.name} のターンを飛ばす。`);
        } else {
          this.log("スキップ対象が見つからないため手錠は効果がなかった。");
        }
        break;

      default:
        this.log("未定義のアイテム");
    }

    // 使用したアイテムを所持リストから削除
    p.items.splice(itemIndex, 1);

    // UI更新と「アイテム使用はターンを消費しない」旨のログ
    if (this.delegate.onUpdate) this.delegate.onUpdate(this.snapshot());
    this.log(`（${p.name} のターン継続：アイテム使用はターンを消費しません）`);
  }

  /**
   * 発砲後にラウンドが終わる状態かを確認し、必要ならラウンドを終了する
   */
  checkRoundEndAfterShot() {
    // 残弾がゼロであればラウンド終了
    if (this.chamber.length === 0) {
      this.log("このラウンドの薬室は全て撃たれました。ラウンド終了です。");
      this.endRound();
    } else {
      // まだ弾が残っている場合はUI更新だけ行う
      if (this.delegate.onUpdate) this.delegate.onUpdate(this.snapshot());
    }
  }

  /**
   * 次の手番へ移動し、ターン開始をアナウンス
   */
  advanceTurn() {
    // すでにゲームが決着しているなら何もしない
    if (this.checkAllDeadOrOneLeft()) return;

    // 次に生きているプレイヤーを探す（1..Nまで先送り）
    let nextIndex = this.currentIndex;
    for (let step = 1; step <= this.players.length; step++) {
      const candidate = (this.currentIndex + step) % this.players.length;
      if (this.players[candidate].alive) { nextIndex = candidate; break; }
    }
    this.currentIndex = nextIndex;

    // 新しい手番を通知
    this.announceTurn();
  }

  /**
   * 残り生存が0または1かを判定し、勝者発表または同時脱落ログを出す
   * @returns {boolean} trueならゲーム終了
   */
  checkAllDeadOrOneLeft() {
    const alive = this.players.filter(p => p.alive);
    if (alive.length <= 1) {
      if (alive.length === 1) this.log(`ゲーム終了！ 勝者: ${alive[0].name}`);
      else this.log("すべてのプレイヤーが脱落しました（同時脱落）。");
      if (this.delegate.onUpdate) this.delegate.onUpdate(this.snapshot());
      return true;
    }
    return false;
  }

  /**
   * ラウンドを進め、新しい弾倉とアイテムを配布してゲーム継続
   */
  endRound() {
    const alive = this.players.filter(p => p.alive);
    if (alive.length <= 1) { this.checkAllDeadOrOneLeft(); return; }

    // ラウンド番号を1増やす（例: 1→2）
    this.round += 1;

    // 弾倉を新しく作り直す
    this.buildChamber(this.config.chamberSize, this.config.liveCount);

    // アイテムを再配布
    this.distributeItems();

    // 次の手番は最初に生存しているプレイヤー
    this.currentIndex = this.players.findIndex(p => p.alive);

    // ターン開始を通知
    this.announceTurn();
  }
}

// ============================================================
// UIController: GUI専用（DOM操作・入力・音・テーマ・ポートレート等）
// ============================================================
class UIController {
  constructor() {
    // ---------- テーマ関連のキーと既定
    this.themeStorageKey = "sg_roulette_theme_v016";
    this.defaultTheme = {
      flashColor: "#ffffff",
      background: null,
      panel: null,
      avatars: { P1: null, P2: null, P3: null, P4: null },
      icons: { "ノコギリ": null, "拡大鏡": null, "ビール": null, "タバコ": null, "手錠": null },
      sounds: { blank: null, live: null, click: null, volume: { master: 1, blank: 1, live: 1, click: 1 }, muted: false }
    };
    this.theme = JSON.parse(JSON.stringify(this.defaultTheme));

    // ---------- ゲームオプション（残薬室の表示など）
    this.gameOptsKey = "sg_roulette_gameopts_v016";
    this.gameOptions = { hideChamberRemain: false };

    // ---------- ポートレート（表情表示）
    this.portraitKey = "sg_roulette_portrait_v016";
    this.portrait = { url: "", expr: "通常" };

    // DOMユーティリティ（ID取得）
    this.el = (id) => document.getElementById(id);

    // ---------- エンジン生成とイベント購読
    this.engine = new GameEngine({
      onLog: (m) => this.appendLog(m),
      onUpdate: (snap) => this.updateUI(snap),
      onChamberChanged: (snap) => this.updateChamberUI(snap),
      onPeek: (next) => { this.el("peekArea").innerText = (next === "live" ? "実弾" : "空包"); },
      onPlaySound: (name) => this.playSound(name),
      onFlash: () => this.flash()
    });
  }

  /**
   * アプリ起動処理（テーマ・設定・ポートレート読み込み→UI初期化→ルーティング反映）
   * @returns {Promise<void>}
   */
  async boot() {
    window.addEventListener("hashchange", () => this.route());
    this.route();
    await this.loadThemeAssetsThenLocal();
    this.loadGameOptions();
    this.loadPortrait();
    this.initUI();
  }

  /**
   * ルーティング（#/settings なら設定ビュー、その他はゲームビュー）
   */
  route() {
    const hash = location.hash || "#/game";
    const viewGame = this.el("view-game");
    const viewSettings = this.el("view-settings");
    const navGame = this.el("navGame");
    const navSettings = this.el("navSettings");
    [navGame, navSettings].forEach(n => n.classList.remove("active"));

    if (hash.startsWith("#/settings")) {
      viewGame.classList.add("hidden");
      viewSettings.classList.remove("hidden");
      navSettings.classList.add("active");
    } else {
      viewSettings.classList.add("hidden");
      viewGame.classList.remove("hidden");
      navGame.classList.add("active");
    }
  }

  // ------------------ テーマとサウンド ------------------

  /**
   * assets/config.json → localStorage の順でテーマを読み込み、DOMへ反映
   * @returns {Promise<void>}
   */
  async loadThemeAssetsThenLocal() {
    // 1) assets/config.json を試しに読む（存在しない場合は握りつぶす）
    try {
      const r = await fetch("assets/config.json", { cache: "no-store" });
      if (r.ok) {
        const cfg = await r.json();
        this.theme = { ...this.theme, ...cfg };
        const vol = (this.theme.sounds && this.theme.sounds.volume) || {};
        this.theme.sounds.volume = { master: 1, blank: 1, live: 1, click: 1, ...vol };
        this.theme.sounds.muted = !!this.theme.sounds.muted;
      }
    } catch (err) {
      // 無視（assetsがない環境でも動くようにする）
    }

    // 2) localStorage の上書きを適用（ユーザー設定を優先）
    try {
      const s = localStorage.getItem(this.themeStorageKey);
      if (s) {
        const override = JSON.parse(s);
        this.theme = { ...this.theme, ...override };
        this.theme.avatars = { ...(this.theme.avatars || {}), ...(override.avatars || {}) };
        this.theme.icons = { ...(this.theme.icons || {}), ...(override.icons || {}) };
        this.theme.sounds = { ...(this.theme.sounds || {}), ...(override.sounds || {}) };
        const vol = (override.sounds && override.sounds.volume) || (this.theme.sounds && this.theme.sounds.volume) || {};
        this.theme.sounds.volume = { master: 1, blank: 1, live: 1, click: 1, ...vol };
        this.theme.sounds.muted = !!((override.sounds || {}).muted ?? this.theme.sounds.muted);
      }
    } catch (err) {
      // 読込失敗は握りつぶし（権限や容量などの可能性）
    }

    // 3) DOMに反映し、スライダー類も同期
    this.applyThemeToDOM();
    this.syncSoundUI();
  }

  /**
   * CSSカスタムプロパティやaudio要素へテーマを適用
   */
  applyThemeToDOM() {
    document.documentElement.style.setProperty("--bg-image", this.theme.background ? `url(${this.theme.background})` : "none");
    document.documentElement.style.setProperty("--panel-image", this.theme.panel ? `url(${this.theme.panel})` : "none");
    document.documentElement.style.setProperty("--flash-color", this.theme.flashColor || "#ffffff");
    if (this.theme.sounds.blank) this.el("sndBlank").src = this.theme.sounds.blank;
    if (this.theme.sounds.live) this.el("sndLive").src = this.theme.sounds.live;
    if (this.theme.sounds.click) this.el("sndClick").src = this.theme.sounds.click;
    this.updateAudioVolumes();
  }

  /**
   * マスターボリュームと個別ボリュームをaudio要素へ反映
   */
  updateAudioVolumes() {
    const master = this.theme.sounds.volume?.master ?? 1;
    const volBlank = this.theme.sounds.volume?.blank ?? 1;
    const volLive = this.theme.sounds.volume?.live ?? 1;
    const volClick = this.theme.sounds.volume?.click ?? 1;
    const muted = !!this.theme.sounds.muted;

    const setVol = (id, v) => {
      const a = this.el(id);
      a.volume = muted ? 0 : Math.max(0, Math.min(1, v)); // 0..1に制限、ミュート時は0
    };
    setVol("sndBlank", master * volBlank);   // 実効音量 = マスター × 種別
    setVol("sndLive", master * volLive);
    setVol("sndClick", master * volClick);
  }

  /**
   * 音量スライダーやURL入力などUIの値をテーマ状態へ同期
   */
  syncSoundUI() {
    const v = this.theme.sounds.volume || { master: 1, blank: 1, live: 1, click: 1 };
    const safe = (x, d = 1) => (Number.isFinite(x) ? x : d);
    const ids = ["volMaster", "volBlank", "volLive", "volClick"];
    const labels = ["volMasterLabel", "volBlankLabel", "volLiveLabel", "volClickLabel"];
    const vals = [safe(v.master), safe(v.blank), safe(v.live), safe(v.click)];

    ids.forEach((id, i) => { const e = this.el(id); if (e) e.value = vals[i]; });
    labels.forEach((id, i) => { const e = this.el(id); if (e) e.textContent = Math.round(vals[i] * 100) + "%"; });

    const tb = this.el("volMasterToolbar"); if (tb) tb.value = vals[0];
    const tbl = this.el("volMasterToolbarLabel"); if (tbl) tbl.textContent = Math.round(vals[0] * 100) + "%";

    const muteBtn = this.el("muteToggle");
    if (muteBtn) muteBtn.textContent = this.theme.sounds.muted ? "🔈 ミュート解除" : "🔇 ミュート";

    const setUrl = (id, url) => { const e = this.el(id); if (e) e.value = url || ""; };
    setUrl("sndBlankUrl", this.theme.sounds.blank);
    setUrl("sndLiveUrl", this.theme.sounds.live);
    setUrl("sndClickUrl", this.theme.sounds.click);
  }

  /**
   * 効果音を再生（ブラウザの自動再生制限により失敗する場合は握りつぶす）
   * @param {"blank"|"live"|"click"} name 再生する種別
   */
  playSound(name) {
    const idMap = { blank: "sndBlank", live: "sndLive", click: "sndClick" };
    const id = idMap[name];
    const a = id && this.el(id);
    if (a && a.src) {
      try { a.currentTime = 0; a.play().catch(() => {}); } catch (err) {}
    }
  }

  /**
   * 実弾時のフラッシュ演出（CSSアニメーションを設定→終了で解除）
   */
  flash() {
    const f = this.el("flashOverlay");
    f.style.animation = "flashEffect 0.28s ease";
    f.onanimationend = () => { f.style.animation = ""; };
  }

  // ------------------ ゲーム設定・ポートレート ------------------

  /**
   * localStorageからゲームオプションを読み込み、チェックボックスに反映
   */
  loadGameOptions() {
    try {
      const s = localStorage.getItem(this.gameOptsKey);
      if (s) this.gameOptions = { ...this.gameOptions, ...(JSON.parse(s) || {}) };
    } catch (err) {}
    const cb = this.el("optHideChamberRemain");
    if (cb) cb.checked = !!this.gameOptions.hideChamberRemain;
  }

  /**
   * ゲームオプションを保存（残薬室の非表示など）
   */
  saveGameOptions() {
    const cb = this.el("optHideChamberRemain");
    this.gameOptions.hideChamberRemain = !!(cb && cb.checked);
    localStorage.setItem(this.gameOptsKey, JSON.stringify(this.gameOptions));
    const res = this.el("saveGameOptsResult");
    if (res) { res.textContent = "保存しました ✓"; setTimeout(() => res.textContent = "", 1600); }
    this.updateChamberUI(this.engine.snapshot());
  }

  /**
   * ポートレート設定を読み込み、DOMに反映
   */
  loadPortrait() {
    try {
      const s = localStorage.getItem(this.portraitKey);
      if (s) this.portrait = { ...this.portrait, ...(JSON.parse(s) || {}) };
    } catch (err) {}
    this.applyPortrait();
  }

  /**
   * 現在のポートレート情報をDOMに反映
   */
  applyPortrait() {
    const img = this.el("portraitImg");
    const badge = this.el("portraitBadge");
    if (img) img.style.backgroundImage = this.portrait.url ? `url(${this.portrait.url})` : "none";
    if (badge) badge.textContent = this.portrait.expr || "通常";
    const input = this.el("portraitUrl"); if (input) input.value = this.portrait.url || "";
  }

  // ------------------ UI初期化とバインド ------------------

  /**
   * 数値入力のクランプ（ユーザーが異常値を入れた際に自動補正）
   */
  strictClampInputs() {
    const clampAttach = (id, fn) => {
      const e = this.el(id); if (!e) return;
      e.addEventListener("change", () => { e.value = fn(parseInt(e.value)); });
    };
    clampAttach("playerCount", v => (!Number.isFinite(v) || v < 2) ? 2 : (v > 4 ? 4 : v));
    clampAttach("initHp", v => (!Number.isFinite(v) || v < 1) ? 1 : (v > 99 ? 99 : v));
    clampAttach("chamberSize", v => (!Number.isFinite(v) || v < 1) ? 1 : (v > 36 ? 36 : v));
    clampAttach("liveCount", v => (!Number.isFinite(v) || v < 0) ? 0 : (v > 36 ? 36 : v));
  }

  /**
   * 左端ヘルプの開閉をバインド
   */
  bindHelp() {
    const panel = this.el("helpPanel");
    const open = () => { panel.classList.add("open"); panel.setAttribute("aria-hidden", "false"); };
    const close = () => { panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true"); };
    this.el("helpToggle").onclick = open;
    this.el("helpClose").onclick = close;
  }

  /**
   * UI要素へイベントを登録し、初期表示を整える
   */
  initUI() {
    // タイトル画面 → ゲーム開始
    this.el("startBtnTitle").addEventListener("click", () => {
      this.playSound("click");
      this.el("titleScreen").style.display = "none";
      this.el("view-game").classList.remove("hidden");
      this.startGameFromInputs();
    });

    // ゲーム操作ボタン
    this.el("startBtn").onclick = () => this.startGameFromInputs();
    this.el("resetBtn").onclick = () => { this.engine.reset(); this.updateUI(this.engine.snapshot()); this.appendLog("ゲームをリセットしました。"); };
    this.el("shootBtn").onclick = () => this.engine.performShoot(parseInt(this.el("targetSelect").value), false);
    this.el("shootSelfBtn").onclick = () => this.engine.performShoot(null, true);
    this.el("endTurnBtn").onclick = () => { /* 手動終了は不要。必要ならここにロジック追加 */ };
    this.el("clearLog").onclick = () => this.el("log").innerHTML = "";

    // UI設定モーダル
    this.el("openSettings").onclick = () => { this.playSound("click"); this.openSettings(); };
    this.el("closeSettings").onclick = () => this.closeSettings();
    this.el("settingsBackdrop").onclick = () => this.closeSettings();

    // 背景・パネルURL、フラッシュ色の適用
    this.el("bgApply").onclick = () => {
      const url = (this.el("bgUrl").value || "").trim();
      this.theme.background = url || null;
      this.applyThemeToDOM();
      this.el("bgPreview").style.backgroundImage = url ? `url(${url})` : "none";
    };
    this.el("panelApply").onclick = () => {
      const url = (this.el("panelUrl").value || "").trim();
      this.theme.panel = url || null;
      this.applyThemeToDOM();
      this.el("panelPreview").style.backgroundImage = url ? `url(${url})` : "none";
    };
    this.el("flashTest").onclick = () => this.flash();

    // アバター・アイコン適用
    this.el("avatarsApply").onclick = () => {
      for (let i = 1; i <= 4; i++) {
        const key = "P" + i;
        const url = (this.el("p" + i + "Url").value || "").trim();
        this.theme.avatars[key] = url || null;
      }
      this.updateUI(this.engine.snapshot());
    };
    this.el("iconsApply").onclick = () => {
      const pairs = [["icoSaw", "ノコギリ"], ["icoGlass", "拡大鏡"], ["icoBeer", "ビール"], ["icoSmoke", "タバコ"], ["icoCuff", "手錠"]];
      pairs.forEach(([id, label]) => {
        const url = (this.el(id).value || "").trim();
        this.theme.icons[label] = url || null;
      });
      this.updateUI(this.engine.snapshot());
    };

    // サウンドURLと音量適用
    this.el("soundsApply").onclick = () => {
      this.theme.sounds.blank = (this.el("sndBlankUrl").value || "").trim() || null;
      this.theme.sounds.live = (this.el("sndLiveUrl").value || "").trim() || null;
      this.theme.sounds.click = (this.el("sndClickUrl").value || "").trim() || null;
      this.theme.sounds.volume.master = parseFloat(this.el("volMaster").value);
      this.theme.sounds.volume.blank = parseFloat(this.el("volBlank").value);
      this.theme.sounds.volume.live = parseFloat(this.el("volLive").value);
      this.theme.sounds.volume.click = parseFloat(this.el("volClick").value);
      this.applyThemeToDOM();
    };
    this.el("testBlank").onclick = () => this.playSound("blank");
    this.el("testLive").onclick = () => this.playSound("live");
    this.el("testClick").onclick = () => this.playSound("click");

    // ツールバー音量とミュート
    this.el("volMasterToolbar").addEventListener("input", () => {
      this.theme.sounds.volume.master = parseFloat(this.el("volMasterToolbar").value);
      this.el("volMasterToolbarLabel").textContent = Math.round(this.theme.sounds.volume.master * 100) + "%";
      this.updateAudioVolumes();
    });
    this.el("muteToggle").onclick = () => {
      this.theme.sounds.muted = !this.theme.sounds.muted;
      this.el("muteToggle").textContent = this.theme.sounds.muted ? "🔈 ミュート解除" : "🔇 ミュート";
      this.updateAudioVolumes();
    };
    this.el("saveTheme").onclick = () => {
      this.theme.flashColor = this.el("flashColor").value || "#ffffff";
      this.applyThemeToDOM();
      try { localStorage.setItem(this.themeStorageKey, JSON.stringify(this.theme)); alert("保存しました。"); }
      catch (err) { alert("保存に失敗しました"); }
    };
    this.el("resetTheme").onclick = () => {
      if (!confirm("UI設定をリセットしますか？")) return;
      this.theme = JSON.parse(JSON.stringify(this.defaultTheme));
      this.applyThemeToDOM();
      this.syncSoundUI();
      this.updateUI(this.engine.snapshot());
    };
    this.el("exportTheme").onclick = () => {
      const blob = new Blob([JSON.stringify(this.theme, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "sg_roulette_theme_v016.json"; a.click(); URL.revokeObjectURL(a.href);
    };
    this.el("importTheme").onclick = () => this.el("importThemeFile").click();
    this.el("importThemeFile").onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const data = JSON.parse(fr.result);
          this.theme = { ...this.defaultTheme, ...(data || {}) };
          this.applyThemeToDOM(); this.syncSoundUI(); this.updateUI(this.engine.snapshot());
          alert("インポート完了");
        } catch (err) { alert("インポート失敗"); }
      };
      fr.readAsText(f);
    };

    // ゲームオプション保存
    const btnSave = this.el("saveGameOpts"); if (btnSave) btnSave.onclick = () => this.saveGameOptions();

    // ポートレートURL適用と表情切替
    const btnPortraitApply = this.el("portraitApply");
    if (btnPortraitApply) btnPortraitApply.onclick = () => {
      this.portrait.url = (this.el("portraitUrl").value || "").trim();
      localStorage.setItem(this.portraitKey, JSON.stringify(this.portrait));
      this.applyPortrait();
    };
    const row = document.querySelector(".expr-row");
    if (row) row.querySelectorAll("button[data-expr]").forEach(b => b.onclick = () => {
      this.portrait.expr = b.getAttribute("data-expr") || "通常";
      localStorage.setItem(this.portraitKey, JSON.stringify(this.portrait));
      this.applyPortrait();
    });

    // ヘルプと入力クランプ
    this.bindHelp();
    this.strictClampInputs();
  }

  // ------------------ UI更新ルーチン ------------------

  /**
   * スナップショットに基づいてUI全体を再描画
   * @param {Snapshot} snapshot エンジンが提供する現在状態
   */
  updateUI(snapshot) {
    if (!snapshot) snapshot = this.engine.snapshot();
    this.el("roundNo").innerText = String(snapshot.round);
    this.el("currentPlayer").innerText = snapshot.players[snapshot.currentIndex] ? snapshot.players[snapshot.currentIndex].name : "-";
    this.el("peekState").innerText = snapshot.peekInfo ? (snapshot.peekInfo === "live" ? "実弾" : "空包") : "不明";
    this.updateChamberUI(snapshot);
    this.renderPlayers(snapshot);
    this.populateTargetSelect(snapshot);
  }

  /**
   * 残薬室表示を更新（非表示オプションに応じて表記を切替）
   * @param {Snapshot} snapshot エンジンの状態
   */
  updateChamberUI(snapshot) {
    if (this.gameOptions.hideChamberRemain) {
      this.el("chamberTotal").innerText = String(snapshot.chamberTotal);
      this.el("chamberRemain").innerText = "??";
    } else {
      this.el("chamberTotal").innerText = String(snapshot.chamberTotal);
      this.el("chamberRemain").innerText = String(snapshot.chamberRemain);
    }
  }

  /**
   * プレイヤー一覧を描画（アバター・アイテム・HPなど）
   * @param {Snapshot} snapshot エンジンの状態
   */
  renderPlayers(snapshot) {
    const cont = this.el("playersContainer");
    cont.innerHTML = "";

    snapshot.players.forEach((p, i) => {
      const div = document.createElement("div");
      div.className = "player" + (p.alive ? "" : " dead");
      div.id = "player_" + p.id;

      // アイテムボタンを構築
      const itemsHtml = p.items.map((label, idx) => {
        const iconUrl = (this.theme.icons || {})[label];
        const iconHtml = iconUrl ? `<span class="icon" style="background-image:url('${iconUrl}')"></span>` : "";
        return `<span class="item" data-player="${p.id}" data-idx="${idx}">${iconHtml}<span>${label}</span></span>`;
      }).join("");

      // アバター画像（正方形枠にcontainで収める）
      const avatarUrl = (this.theme.avatars || {})["P" + (i + 1)];
      const avatarStyle = avatarUrl ? `background-image:url('${avatarUrl}')` : "";

      div.innerHTML = `
        <div class="avatar" style="${avatarStyle}"></div>
        <div>
          <div style="font-weight:700">${p.name} ${snapshot.currentIndex === i ? "←" : ""}</div>
          <div>HP: <span class="hp">${p.hp}</span></div>
          <div>状態: ${p.alive ? "生存" : "脱落"}</div>
          <div class="items">アイテム: ${itemsHtml}</div>
          <div style="margin-top:6px; font-size:13px;">${p.skip ? "（次ターンをスキップ予定）" : ""}</div>
        </div>`;
      cont.appendChild(div);
    });

    // アイテムボタンのクリックでエンジンへ通知
    cont.querySelectorAll(".item").forEach(el => {
      el.onclick = () => {
        const pid = parseInt(el.getAttribute("data-player"));
        const idx = parseInt(el.getAttribute("data-idx"));
        this.engine.useItem(pid, idx);
      };
    });

    // 自分のアイテムを別枠にもボタン表示
    const me = snapshot.players[snapshot.currentIndex];
    const area = this.el("yourItems");
    if (!me) { area.innerHTML = "なし"; return; }
    area.innerHTML = me.items.map((label, idx) => {
      const iconUrl = (this.theme.icons || {})[label];
      const iconHtml = iconUrl ? `<span class="icon" style="width:16px;height:16px; background-image:url('${iconUrl}'); display:inline-block; vertical-align:-3px; margin-right:6px;"></span>` : "";
      return `<button data-idx="${idx}" data-player="${me.id}">${iconHtml}${label}</button>`;
    }).join(" ");
    area.querySelectorAll("button").forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.getAttribute("data-idx"));
        this.engine.useItem(me.id, idx);
      };
    });
  }

  /**
   * ターゲット選択肢を更新（自分以外を優先選択）
   * @param {Snapshot} snapshot エンジンの状態
   */
  populateTargetSelect(snapshot) {
    const sel = this.el("targetSelect");
    sel.innerHTML = "";
    const me = snapshot.players[snapshot.currentIndex];
    if (!me) return;

    snapshot.players.forEach(p => {
      if (!p.alive) return;
      const opt = document.createElement("option");
      opt.value = String(p.id);
      opt.text = p.name + (p.id === me.id ? " (自分)" : "");
      sel.add(opt);
    });

    // できるだけ「自分以外」を初期選択にする
    let defaultIndex = 0;
    for (let i = 0; i < sel.options.length; i++) {
      if (parseInt(sel.options[i].value) !== me.id) { defaultIndex = i; break; }
    }
    sel.selectedIndex = defaultIndex;
  }

  /**
   * ログを上に積む（直近メッセージが先頭）
   * @param {string} message 表示文字列
   */
  appendLog(message) {
    const l = this.el("log");
    const time = new Date().toLocaleTimeString();
    l.innerHTML = `<div>[${time}] ${this.escapeHtml(message)}</div>` + l.innerHTML;
  }

  /**
   * HTMLエスケープ（ログXSS対策）
   * @param {string} s 入力文字列
   * @returns {string} エスケープ済み文字列
   */
  escapeHtml(s) {
    if (s == null) return "";
    return s.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  // ------------------ パブリック補助 ------------------

  /**
   * 画面上の入力値を読み取り、エンジンを再設定して開始
   */
  startGameFromInputs() {
    this.engine.reset();
    this.engine.configure({
      playerCount: parseInt(this.el("playerCount").value),
      initHp: parseInt(this.el("initHp").value),
      chamberSize: parseInt(this.el("chamberSize").value),
      liveCount: parseInt(this.el("liveCount").value)
    });
    this.engine.start();
  }

  /** モーダルを開く */
  openSettings() { this.el("settingsModal").classList.remove("hidden"); }
  /** モーダルを閉じる */
  closeSettings() { this.el("settingsModal").classList.add("hidden"); }
}

// ============================================================
// マウント: DOMロード完了後にUIControllerを起動
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const ui = new UIController();
  window.ui = ui;   // デバッグ用にwindowへ公開
  ui.boot();
});
