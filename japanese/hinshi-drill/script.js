// ---- 瀕死の品詞：ロジック（バニラJS版） -----------------------------
// 元はReactアーティファクトとして作成。GitHub Pages等の静的ホスティングで
// 動かせるよう、React依存とwindow.storage(Claudeアーティファクト専用API)を
// 排除し、fetch + localStorageに置き換えている。

const CHOICES = [
  { key: "ア", label: "名詞" },
  { key: "イ", label: "動詞" },
  { key: "ウ", label: "形容詞" },
  { key: "エ", label: "形容動詞" },
  { key: "オ", label: "連体詞" },
  { key: "カ", label: "副詞" },
];

// ボーナス画像の一覧は bonus/bonus.json から読み込む（コード編集なしで追加できるように外出し）
let BONUS_IMAGES = [];

const ROUND_SIZE = 10;
const LOG_KEY = "hinshi4-drill-score-log";
const MAX_LOG = 20;
const STREAK_KEY = "hinshi4-drill-perfect-streak";
const OBTAINED_KEY = "hinshi4-drill-obtained-images";

let QUESTIONS = [];

// ---- 状態 ----
let round = [];
let index = 0;
let selected = null;
let correctCount = 0;
let phase = "quiz"; // "quiz" | "result"
let log = [];
let streak = 0;
let showLog = false;
let showGallery = false;
let bonusImage = null;
let saveError = false;
let obtainedImages = []; // これまでに獲得したボーナス画像のパス一覧（重複なし）

// ---- ユーティリティ ----
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRound() {
  return shuffle(QUESTIONS).slice(0, Math.min(ROUND_SIZE, QUESTIONS.length));
}

function formatDate(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function pickBonusImage() {
  if (BONUS_IMAGES.length === 0) return null;
  return BONUS_IMAGES[Math.floor(Math.random() * BONUS_IMAGES.length)];
}

// ---- ローカルストレージ(旧window.storage相当) ----
function storageGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

// ---- 初期読み込み ----
async function init() {
  try {
    const res = await fetch("questions.json");
    if (!res.ok) throw new Error(`questions.json HTTP ${res.status}`);
    QUESTIONS = await res.json();
  } catch (e) {
    console.error("questions.json の読み込みに失敗しました:", e);
    document.querySelector(".card").innerHTML =
      `<div class="explain"><span class="tag">エラー</span><div>` +
      `問題データ(questions.json)を読み込めませんでした。ファイルの配置場所とファイル名を確認してください。` +
      `</div></div>`;
    return; // 問題データが無いと何もできないのでここで停止
  }

  try {
    const bonusRes = await fetch("bonus/bonus.json");
    if (!bonusRes.ok) throw new Error(`bonus/bonus.json HTTP ${bonusRes.status}`);
    const bonusFiles = await bonusRes.json();
    BONUS_IMAGES = bonusFiles.map((name) => `bonus/${name}`);
  } catch (e) {
    // ボーナス画像は無くても本体のクイズ機能は動かせるので、ここで止めない
    console.error("bonus/bonus.json の読み込みに失敗しました（ボーナス機能は無効化されます）:", e);
    BONUS_IMAGES = [];
  }

  const savedLog = storageGet(LOG_KEY);
  if (savedLog) log = savedLog;
  const savedStreak = storageGet(STREAK_KEY);
  if (savedStreak) streak = savedStreak;
  const savedObtained = storageGet(OBTAINED_KEY);
  if (savedObtained) obtainedImages = savedObtained;

  round = buildRound();
  render();
}

// ---- 結果保存 ----
function saveResult(correct, total) {
  const entry = { date: new Date().toISOString(), correct, total };
  log = [entry, ...log].slice(0, MAX_LOG);
  saveError = !storageSet(LOG_KEY, log);

  const isPerfect = correct === total;
  streak = isPerfect ? streak + 1 : 0;
  storageSet(STREAK_KEY, streak);

  if (isPerfect && streak > 0 && streak % 3 === 0) {
    bonusImage = pickBonusImage();
    if (!obtainedImages.includes(bonusImage)) {
      obtainedImages = [...obtainedImages, bonusImage];
      storageSet(OBTAINED_KEY, obtainedImages);
    }
  } else {
    bonusImage = null;
  }
}

// ---- イベントハンドラ ----
function handleSelect(key) {
  if (selected) return;
  selected = key;
  const current = round[index];
  if (key === current.answer) correctCount += 1;
  render();
}

function handleNext() {
  const wasLast = index + 1 >= round.length;
  if (wasLast) {
    saveResult(correctCount, round.length);
    phase = "result";
  } else {
    selected = null;
    index += 1;
  }
  render();
}

function startNewRound() {
  round = buildRound();
  index = 0;
  selected = null;
  correctCount = 0;
  phase = "quiz";
  showLog = false;
  showGallery = false;
  bonusImage = null;
  render();
}

// ---- 描画 ----
function render() {
  const current = round[index];

  document.getElementById("score-correct").textContent = correctCount;
  document.getElementById("score-total").textContent =
    phase === "quiz" ? index : round.length;

  const quizView = document.getElementById("quiz-view");
  const resultView = document.getElementById("result-view");
  const logView = document.getElementById("log-view");
  const galleryView = document.getElementById("gallery-view");

  const overlayOpen = showLog || showGallery;
  quizView.style.display = phase === "quiz" && !overlayOpen ? "" : "none";
  resultView.style.display = phase === "result" && !overlayOpen ? "" : "none";
  logView.style.display = showLog ? "" : "none";
  galleryView.style.display = showGallery ? "" : "none";

  if (phase === "quiz" && !overlayOpen && current) {
    document.getElementById("q-index").textContent = index + 1;
    document.getElementById("q-total").textContent = round.length;

    document.getElementById("sentence").innerHTML =
      `${escapeHtml(current.before)}<span class="u">${escapeHtml(current.word)}</span>${escapeHtml(current.after)}`;

    const choicesEl = document.getElementById("choices");
    choicesEl.innerHTML = "";
    CHOICES.forEach((c) => {
      const btn = document.createElement("button");
      let cls = "choice-btn";
      if (selected) {
        if (c.key === current.answer) cls += " reveal-correct";
        if (selected === c.key && c.key === current.answer) cls += " correct-pick";
        if (selected === c.key && c.key !== current.answer) cls += " wrong-pick";
      }
      btn.className = cls;
      btn.textContent = c.label;
      btn.disabled = !!selected;
      btn.addEventListener("click", () => handleSelect(c.key));
      choicesEl.appendChild(btn);
    });

    const stampArea = document.getElementById("stamp-area");
    if (selected) {
      const isCorrect = selected === current.answer;
      stampArea.innerHTML = `<div class="stamp ${isCorrect ? "circle" : "cross"}">${isCorrect ? "○" : "✕"}</div>`;
    } else {
      stampArea.innerHTML = "";
    }

    const explainArea = document.getElementById("explain-area");
    if (selected) {
      explainArea.innerHTML =
        `<div class="explain"><span class="tag">解説</span><div>${escapeHtml(current.explanation)}</div></div>`;
    } else {
      explainArea.innerHTML = "";
    }

    const nextBtn = document.getElementById("next-btn");
    if (selected) {
      nextBtn.style.display = "";
      nextBtn.textContent = index + 1 >= round.length ? "結果を見る →" : "次の問題へ →";
    } else {
      nextBtn.style.display = "none";
    }
  }

  if (phase === "result" && !overlayOpen) {
    document.getElementById("result-correct").textContent = correctCount;
    document.getElementById("result-total").textContent = round.length;

    const comment =
      correctCount === round.length
        ? "満点！完璧に識別できています。"
        : correctCount >= Math.ceil(round.length * 0.7)
        ? "よくできました。もう少しで満点です。"
        : "解説を読み返して、もう一度挑戦してみましょう。";
    document.getElementById("result-comment").textContent = comment;

    const streakNote = document.getElementById("streak-note");
    streakNote.innerHTML =
      `満点連続記録：<b>${streak}</b> 回` +
      (streak > 0 && streak % 3 !== 0 ? `（あと${3 - (streak % 3)}回で神様カード出現！）` : "");

    const bonusPanel = document.getElementById("bonus-panel");
    if (bonusImage) {
      bonusPanel.style.display = "";
      document.getElementById("bonus-label").textContent = `🎉 満点${streak}回達成ボーナス！ 🎉`;
      document.getElementById("bonus-img").src = bonusImage;
    } else {
      bonusPanel.style.display = "none";
    }

    document.getElementById("save-error").style.display = saveError ? "" : "none";
  }

  if (showLog) {
    document.getElementById("log-streak").textContent = streak;
    const logBody = document.getElementById("log-body");
    if (log.length === 0) {
      logBody.innerHTML = `<div class="log-empty">まだ記録がありません。10問解き終えると記録されます。</div>`;
    } else {
      const rows = log
        .map(
          (e) => `<tr>
            <td>${formatDate(e.date)}</td>
            <td class="num">${e.correct} / ${e.total}</td>
            <td class="num">${Math.round((e.correct / e.total) * 100)}%</td>
          </tr>`
        )
        .join("");
      logBody.innerHTML = `<table class="log-table">
        <thead><tr><th>実施日時</th><th>正解数</th><th>正答率</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    }
  }

  if (showGallery) {
    document.getElementById("gallery-count").textContent =
      `${obtainedImages.length} / ${BONUS_IMAGES.length}`;
    const galleryGrid = document.getElementById("gallery-grid");
    galleryGrid.innerHTML = BONUS_IMAGES.map((path) => {
      if (obtainedImages.includes(path)) {
        return `<div class="gallery-item"><img src="${path}" alt="獲得画像" /></div>`;
      }
      return `<div class="gallery-item locked"><span>？</span></div>`;
    }).join("");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---- イベント登録 ----
document.getElementById("next-btn").addEventListener("click", handleNext);
document.getElementById("retry-btn").addEventListener("click", startNewRound);
document.getElementById("show-log-btn").addEventListener("click", () => {
  showLog = true;
  render();
});
document.getElementById("close-log-btn").addEventListener("click", () => {
  showLog = false;
  render();
});
document.getElementById("toggle-log-btn").addEventListener("click", () => {
  showLog = !showLog;
  render();
});
document.getElementById("show-gallery-btn").addEventListener("click", () => {
  showGallery = true;
  render();
});
document.getElementById("close-gallery-btn").addEventListener("click", () => {
  showGallery = false;
  render();
});
document.getElementById("toggle-gallery-btn").addEventListener("click", () => {
  showGallery = !showGallery;
  render();
});

init();
