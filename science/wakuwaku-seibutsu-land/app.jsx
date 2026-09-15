const { useState, useEffect } = React;

/* =========================================================================
   わくわく生物ランド — 静的デプロイ版 (GitHub Pages)
   ビルド不要。React/ReactDOM/Babel standalone は index.html で CDN 読み込み。
   分野構成・景品画像リストは fields.json、設問は questions/<id>.json を
   fetch で読み込む。分野を増やすときはコードを触らず、
   fields.json に1行足して questions/<id>.json を置くだけでよい。
   ========================================================================= */

const QUESTIONS_PER_ROUND = 10;
const HIDE_ROUNDS = 15; // 「覚えた」チェック後、何ラウンド出題プールから外すか(仮の初期値)
const WRONG_WEIGHT_STEP = 1.5; // 不正解1回ごとに出やすさへ加える重み
const WRONG_WEIGHT_CAP = 5; // 重み計算に使う不正解回数の上限

const TYPE_LABEL = { single: "4択", multi: "複数選択", matching: "組み合わせ" };

/* ============================= storage helpers ========================== */
// artifact版の window.storage から localStorage に置き換え。
// 呼び出し側は await のまま使えるよう、Promise でラップしている。

function loadJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return Promise.resolve(fallback);
    return Promise.resolve(JSON.parse(raw));
  } catch (e) {
    return Promise.resolve(fallback);
  }
}
function saveJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // 保存失敗時は静かに無視(進行は止めない)
  }
  return Promise.resolve();
}

const KEY_SCORELOG = "wakuwaku-seibutsu-scorelog";
const KEY_MASTERED = "wakuwaku-seibutsu-mastered"; // { qid: roundsRemaining }
const KEY_WRONGCOUNT = "wakuwaku-seibutsu-wrongcount"; // { qid: count }
const KEY_OBTAINED = "wakuwaku-seibutsu-obtained-images"; // { fieldId: [imageName,...] }

/* ============================= utility logic ============================ */

function weightedSampleWithoutReplacement(items, weights, n) {
  const pool = items.map((it, i) => ({ it, w: Math.max(weights[i], 0.0001) }));
  const chosen = [];
  while (chosen.length < n && pool.length > 0) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx].w;
      if (r <= 0) break;
    }
    idx = Math.min(idx, pool.length - 1);
    chosen.push(pool[idx].it);
    pool.splice(idx, 1);
  }
  return chosen;
}

function gradeSingle(q, state) {
  return state === q.answerIndex;
}
function gradeMulti(q, state) {
  const sel = state || new Set();
  if (sel.size !== q.answerIndices.length) return false;
  return q.answerIndices.every((i) => sel.has(i));
}
function gradeMatching(q, state) {
  const map = state || {};
  if (Object.keys(map).length !== q.leftItems.length) return false;
  return q.correctPairs.every(([l, r]) => map[l] === r);
}
function isCorrect(q, state) {
  if (q.type === "single") return gradeSingle(q, state);
  if (q.type === "multi") return gradeMulti(q, state);
  if (q.type === "matching") return gradeMatching(q, state);
  return false;
}

const graphPaperBg = {
  backgroundColor: "#FAF7EE",
  backgroundImage:
    "linear-gradient(#E7E0C9 1px, transparent 1px), linear-gradient(90deg, #E7E0C9 1px, transparent 1px)",
  backgroundSize: "22px 22px",
};

/* ================================ App ==================================== */

function App() {
  const [screen, setScreen] = useState("home"); // home | quiz | result | album
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [fields, setFields] = useState([]); // fields.json の内容
  const [fieldQuestions, setFieldQuestions] = useState({}); // { id: [...] }

  const [selectedFields, setSelectedFields] = useState(() => new Set());
  const [scoreLog, setScoreLog] = useState([]);
  const [mastered, setMastered] = useState({});
  const [wrongCount, setWrongCount] = useState({});
  const [obtained, setObtained] = useState({});

  const [round, setRound] = useState([]); // 今回の10問
  const [pos, setPos] = useState(0);
  const [answerState, setAnswerState] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [markLearned, setMarkLearned] = useState(false);
  const [roundLog, setRoundLog] = useState([]); // [{id, field, correct}]
  const [awardedImage, setAwardedImage] = useState(null);
  const [awardedField, setAwardedField] = useState(null);
  const [markLearnedIds, setMarkLearnedIds] = useState(() => new Set());

  // 初回ロード: fields.json → 各分野の questions/<id>.json → localStorage
  useEffect(() => {
    (async () => {
      try {
        const fRes = await fetch("fields.json");
        const fieldsData = await fRes.json();
        const qEntries = await Promise.all(
          fieldsData.map(async (f) => {
            try {
              const r = await fetch(f.questionsFile);
              const arr = await r.json();
              return [f.id, arr];
            } catch (e) {
              return [f.id, []];
            }
          })
        );
        const qMap = {};
        qEntries.forEach(([id, arr]) => (qMap[id] = arr));

        const [sl, ms, wc, ob] = await Promise.all([
          loadJSON(KEY_SCORELOG, []),
          loadJSON(KEY_MASTERED, {}),
          loadJSON(KEY_WRONGCOUNT, {}),
          loadJSON(KEY_OBTAINED, {}),
        ]);

        setFields(fieldsData);
        setFieldQuestions(qMap);
        setScoreLog(sl);
        setMastered(ms);
        setWrongCount(wc);
        setObtained(ob);
        setLoading(false);
      } catch (e) {
        setLoadError("データの読み込みに失敗しました。fields.json とフォルダ構成をご確認ください。");
        setLoading(false);
      }
    })();
  }, []);

  function toggleField(id) {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function buildPool() {
    const all = [];
    selectedFields.forEach((fid) => {
      (fieldQuestions[fid] || []).forEach((q) => all.push({ ...q, __field: fid }));
    });
    let eligible = all.filter((q) => !(mastered[q.id] > 0));
    if (eligible.length < QUESTIONS_PER_ROUND) eligible = all; // 覚えた問題を除くと不足する場合は全体から出題
    return eligible;
  }

  function resetAnswerState(q) {
    if (!q) return null;
    if (q.type === "multi") return new Set();
    if (q.type === "matching") return {};
    return null;
  }

  function startQuiz() {
    const pool = buildPool();
    const n = Math.min(QUESTIONS_PER_ROUND, pool.length);
    const weights = pool.map((q) => 1 + Math.min(wrongCount[q.id] || 0, WRONG_WEIGHT_CAP) * WRONG_WEIGHT_STEP);
    const picked = weightedSampleWithoutReplacement(pool, weights, n);
    setRound(picked);
    setPos(0);
    setRoundLog([]);
    setMarkLearnedIds(new Set());
    setAnswerState(resetAnswerState(picked[0]));
    setSubmitted(false);
    setMarkLearned(false);
    setAwardedImage(null);
    setAwardedField(null);
    setScreen("quiz");
  }

  const q = round[pos];

  function canSubmit() {
    if (!q) return false;
    if (q.type === "single") return answerState !== null && answerState !== undefined;
    if (q.type === "multi") return answerState && answerState.size > 0;
    if (q.type === "matching") return answerState && Object.keys(answerState).length === q.leftItems.length;
    return false;
  }

  function handleSubmit() {
    if (!canSubmit()) return;
    const correct = isCorrect(q, answerState);
    setRoundLog((prev) => [...prev, { id: q.id, field: q.__field, correct }]);
    setSubmitted(true);
  }

  async function finishRound(finalLog, learnedIds) {
    const nextWrong = { ...wrongCount };
    const nextMastered = {};
    Object.keys(mastered).forEach((k) => {
      const remain = mastered[k] - 1;
      if (remain > 0) nextMastered[k] = remain;
    });

    finalLog.forEach((r) => {
      if (r.correct) {
        nextWrong[r.id] = Math.max((nextWrong[r.id] || 0) - 1, 0);
      } else {
        nextWrong[r.id] = (nextWrong[r.id] || 0) + 1;
      }
    });
    learnedIds.forEach((id) => {
      nextMastered[id] = HIDE_ROUNDS;
    });

    const score = finalLog.filter((r) => r.correct).length;
    const usedFields = [...new Set(finalLog.map((r) => r.field))];
    const entry = { date: new Date().toISOString(), fields: usedFields, score, total: finalLog.length };
    const nextLog = [entry, ...scoreLog].slice(0, 20);

    let nextObtained = obtained;
    let award = null;
    let awardField = null;
    if (score === finalLog.length && finalLog.length === QUESTIONS_PER_ROUND) {
      const candidateFields = usedFields.filter((fid) => {
        const f = fields.find((x) => x.id === fid);
        return f && (f.prizeImages || []).length > 0;
      });
      if (candidateFields.length > 0) {
        awardField = candidateFields[Math.floor(Math.random() * candidateFields.length)];
        const f = fields.find((x) => x.id === awardField);
        const pool = f.prizeImages || [];
        const already = new Set(obtained[awardField] || []);
        let drawPool = pool.filter((p) => !already.has(p));
        if (drawPool.length === 0) drawPool = pool; // 全部集めたら重複OK
        award = drawPool[Math.floor(Math.random() * drawPool.length)];
        nextObtained = { ...obtained, [awardField]: [...(obtained[awardField] || []), award] };
      }
    }

    setWrongCount(nextWrong);
    setMastered(nextMastered);
    setScoreLog(nextLog);
    setObtained(nextObtained);
    setAwardedImage(award);
    setAwardedField(awardField);

    await Promise.all([
      saveJSON(KEY_WRONGCOUNT, nextWrong),
      saveJSON(KEY_MASTERED, nextMastered),
      saveJSON(KEY_SCORELOG, nextLog),
      saveJSON(KEY_OBTAINED, nextObtained),
    ]);

    setScreen("result");
  }

  function handleNext() {
    const nextLearnedIds = new Set(markLearnedIds);
    if (markLearned && q) nextLearnedIds.add(q.id);
    setMarkLearnedIds(nextLearnedIds);

    const nextPos = pos + 1;
    if (nextPos >= round.length) {
      finishRound(roundLog, nextLearnedIds);
    } else {
      setPos(nextPos);
      setAnswerState(resetAnswerState(round[nextPos]));
      setSubmitted(false);
      setMarkLearned(false);
    }
  }

  function toggleSingle(i) {
    if (submitted) return;
    setAnswerState(i);
  }
  function toggleMulti(i) {
    if (submitted) return;
    setAnswerState((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }
  function setMatch(li, ri) {
    if (submitted) return;
    setAnswerState((prev) => ({ ...(prev || {}), [li]: ri }));
  }

  const pageStyle = {
    minHeight: "100vh",
    ...graphPaperBg,
    fontFamily: "'Zen Maru Gothic', sans-serif",
    color: "#2B2B23",
    display: "flex",
    justifyContent: "center",
    padding: "24px 12px",
    boxSizing: "border-box",
  };
  const cardShell = { width: "100%", maxWidth: 480 };
  const cardStyle = {
    background: "#fff",
    border: "1px solid #E3DCC8",
    borderRadius: 18,
    boxShadow: "0 2px 10px rgba(43,43,35,0.06)",
  };

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardShell, textAlign: "center", paddingTop: 80, color: "#8A8874" }}>読み込み中…</div>
      </div>
    );
  }
  if (loadError) {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardShell, textAlign: "center", paddingTop: 80, color: "#C1503D" }}>{loadError}</div>
      </div>
    );
  }

  /* --------------------------------- HOME --------------------------------- */
  if (screen === "home") {
    return (
      <div style={pageStyle}>
        <div style={cardShell}>
          <div style={{ ...cardStyle, padding: "30px 24px", marginBottom: 16, textAlign: "center" }}>
            <h1 style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 26, margin: "0 0 4px", color: "#3F6B4E" }}>
              わくわく生物ランド
            </h1>
            <p style={{ fontSize: 12, color: "#8A8874", margin: 0 }}>中学受験理科・生物分野</p>
          </div>

          <div style={{ ...cardStyle, padding: "20px 20px 22px", marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 12px" }}>出題分野を選ぶ（複数選択可）</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {fields.map((f) => {
                const count = (fieldQuestions[f.id] || []).length;
                const ready = count > 0;
                const sel = selectedFields.has(f.id);
                return (
                  <button
                    key={f.id}
                    disabled={!ready}
                    onClick={() => ready && toggleField(f.id)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: sel ? "2px solid #3F6B4E" : "1px solid #E3DCC8",
                      background: !ready ? "#F2EFE4" : sel ? "#EEF3E6" : "#fff",
                      color: !ready ? "#B4B09A" : "#2B2B23",
                      fontFamily: "'Zen Maru Gothic', sans-serif",
                      fontSize: 14,
                      fontWeight: sel ? 700 : 500,
                      cursor: ready ? "pointer" : "not-allowed",
                    }}
                  >
                    <span>{f.name}</span>
                    <span style={{ fontSize: 11 }}>{ready ? `全${count}問` : "準備中"}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <button
              onClick={startQuiz}
              disabled={selectedFields.size === 0}
              style={{
                flex: 2,
                background: selectedFields.size === 0 ? "#D8D0BF" : "#3F6B4E",
                color: "#fff",
                border: "none",
                borderRadius: 999,
                padding: "15px 0",
                fontSize: 16,
                fontWeight: 700,
                fontFamily: "'Zen Maru Gothic', sans-serif",
                cursor: selectedFields.size === 0 ? "not-allowed" : "pointer",
              }}
            >
              スタート
            </button>
            <button
              onClick={() => setScreen("album")}
              style={{
                flex: 1,
                background: "#fff",
                color: "#3F6B4E",
                border: "2px solid #3F6B4E",
                borderRadius: 999,
                padding: "15px 0",
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "'Zen Maru Gothic', sans-serif",
                cursor: "pointer",
              }}
            >
              アルバム
            </button>
          </div>

          <div style={{ ...cardStyle, padding: "18px 20px" }}>
            <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>過去の成績（直近20回）</p>
            {scoreLog.length === 0 ? (
              <p style={{ fontSize: 12, color: "#8A8874", margin: 0 }}>まだ記録がありません。</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {scoreLog.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      padding: "6px 10px",
                      borderRadius: 8,
                      background: i % 2 === 0 ? "#FBF9F3" : "transparent",
                    }}
                  >
                    <span style={{ color: "#8A8874" }}>
                      {new Date(r.date).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
                      {"　"}
                      {r.fields.map((fid) => fields.find((f) => f.id === fid)?.name || fid).join("・")}
                    </span>
                    <span style={{ fontWeight: 700, color: r.score === r.total ? "#3F8F5F" : "#2B2B23" }}>
                      {r.score}/{r.total}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* --------------------------------- ALBUM --------------------------------- */
  if (screen === "album") {
    return (
      <div style={pageStyle}>
        <div style={cardShell}>
          <div style={{ ...cardStyle, padding: "22px 20px", marginBottom: 16 }}>
            <h2 style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 20, margin: "0 0 4px" }}>アルバム</h2>
            <p style={{ fontSize: 12, color: "#8A8874", margin: 0 }}>満点をとると景品カードがもらえます</p>
          </div>

          {fields.map((f) => {
            const got = obtained[f.id] || [];
            const total = (f.prizeImages || []).length;
            return (
              <div key={f.id} style={{ ...cardStyle, padding: "16px 18px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{f.name}</span>
                  <span style={{ fontSize: 11, color: "#8A8874" }}>
                    {total > 0 ? `${new Set(got).size}/${total}枚` : "準備中"}
                  </span>
                </div>
                {got.length === 0 ? (
                  <p style={{ fontSize: 12, color: "#B4B09A", margin: 0 }}>
                    {total > 0 ? "まだ景品を手に入れていません。" : "この分野の景品はまだ用意されていません。"}
                  </p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    {[...new Set(got)].map((img) => (
                      <div
                        key={img}
                        style={{
                          aspectRatio: "1",
                          borderRadius: 8,
                          background: "#EEF3E6",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 9,
                          color: "#3F6B4E",
                          overflow: "hidden",
                          border: "1px solid #D8E4D2",
                        }}
                      >
                        <img
                          src={`${f.prizeDir}/${img}`}
                          alt={img}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          onError={(e) => {
                            e.target.style.display = "none";
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={() => setScreen("home")}
            style={{
              width: "100%",
              background: "#2B2B23",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "13px 0",
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "'Zen Maru Gothic', sans-serif",
              cursor: "pointer",
            }}
          >
            ホームへ戻る
          </button>
        </div>
      </div>
    );
  }

  /* --------------------------------- RESULT --------------------------------- */
  if (screen === "result") {
    const score = roundLog.filter((r) => r.correct).length;
    const total = roundLog.length;
    const perfect = score === total && total === QUESTIONS_PER_ROUND;
    return (
      <div style={pageStyle}>
        <div style={cardShell}>
          <div style={{ ...cardStyle, padding: "32px 26px" }}>
            <h2 style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 20, textAlign: "center", margin: "0 0 4px" }}>
              けっか
            </h2>
            <p
              style={{
                textAlign: "center",
                fontSize: 40,
                fontWeight: 700,
                margin: "10px 0 4px",
                color: "#3F6B4E",
                fontFamily: "'Shippori Mincho', serif",
              }}
            >
              {score} / {total}
            </p>

            {perfect && (
              <div
                style={{
                  marginTop: 18,
                  padding: "18px 16px",
                  borderRadius: 14,
                  background: "#FFF7E0",
                  border: "1px solid #F0DFA0",
                  textAlign: "center",
                }}
              >
                <p style={{ margin: "0 0 8px", fontWeight: 700, color: "#B8860B", fontSize: 14 }}>満点！🎉</p>
                {awardedImage ? (
                  <>
                    <div
                      style={{
                        width: 120,
                        height: 120,
                        margin: "0 auto 8px",
                        borderRadius: 12,
                        overflow: "hidden",
                        background: "#fff",
                        border: "1px solid #F0DFA0",
                      }}
                    >
                      <img
                        src={`${fields.find((f) => f.id === awardedField)?.prizeDir}/${awardedImage}`}
                        alt="prize"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                    <p style={{ fontSize: 12, color: "#8A7B3E", margin: 0 }}>
                      {fields.find((f) => f.id === awardedField)?.name} の記念カードをゲット！
                    </p>
                  </>
                ) : (
                  <p style={{ fontSize: 12, color: "#8A7B3E", margin: 0 }}>
                    この分野の景品はまだ準備中です。景品が追加されたらもらえるようになります。
                  </p>
                )}
              </div>
            )}

            <button
              onClick={() => setScreen("home")}
              style={{
                width: "100%",
                marginTop: 22,
                background: "#3F6B4E",
                color: "#fff",
                border: "none",
                borderRadius: 999,
                padding: "13px 0",
                fontSize: 15,
                fontWeight: 700,
                fontFamily: "'Zen Maru Gothic', sans-serif",
                cursor: "pointer",
              }}
            >
              ホームへ戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* --------------------------------- QUIZ --------------------------------- */
  const correctNow = submitted ? isCorrect(q, answerState) : null;

  return (
    <div style={pageStyle}>
      <div style={cardShell}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 999, background: "#E7E0CB", overflow: "hidden" }}>
            <div
              style={{
                width: `${(pos / round.length) * 100}%`,
                height: "100%",
                background: "#3F6B4E",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <span style={{ fontSize: 12, color: "#6B6A5E", whiteSpace: "nowrap" }}>
            {pos + 1} / {round.length}
          </span>
        </div>

        <div style={{ ...cardStyle, overflow: "hidden" }}>
          <div style={{ background: "#EEF3E6", padding: "12px 20px", display: "flex", justifyContent: "space-between" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#3F6B4E",
                border: "1px solid #3F6B4E",
                borderRadius: 999,
                padding: "2px 10px",
              }}
            >
              {TYPE_LABEL[q.type]}
            </span>
            <span style={{ fontSize: 11, color: "#6B6A5E" }}>{fields.find((f) => f.id === q.__field)?.name}</span>
          </div>

          <div style={{ padding: "22px 20px 8px" }}>
            <p style={{ fontFamily: "'Shippori Mincho', serif", fontSize: 17, lineHeight: 1.7, margin: 0 }}>{q.text}</p>
          </div>

          <div style={{ padding: "10px 20px 20px" }}>
            {q.type === "single" &&
              q.choices.map((c, i) => {
                const chosen = answerState === i;
                let style = optionBaseStyle(chosen);
                if (submitted) {
                  if (i === q.answerIndex) style = optionCorrectStyle();
                  else if (chosen) style = optionWrongStyle();
                  else style = optionMutedStyle();
                }
                return (
                  <button key={i} onClick={() => toggleSingle(i)} style={{ ...style, marginBottom: 10 }} disabled={submitted}>
                    <span style={badgeStyle()}>{"アイウエオ"[i]}</span>
                    {c}
                  </button>
                );
              })}

            {q.type === "multi" && (
              <>
                <p style={{ fontSize: 11, color: "#6B6A5E", margin: "0 0 8px" }}>あてはまるものを、すべて選びなさい。</p>
                {q.choices.map((c, i) => {
                  const chosen = answerState && answerState.has(i);
                  let style = optionBaseStyle(chosen);
                  if (submitted) {
                    const shouldBeChosen = q.answerIndices.includes(i);
                    if (shouldBeChosen) style = optionCorrectStyle();
                    else if (chosen) style = optionWrongStyle();
                    else style = optionMutedStyle();
                  }
                  return (
                    <button key={i} onClick={() => toggleMulti(i)} style={{ ...style, marginBottom: 10 }} disabled={submitted}>
                      <span style={{ ...badgeStyle(), borderRadius: 5 }}>{chosen ? "✓" : ""}</span>
                      {c}
                    </button>
                  );
                })}
              </>
            )}

            {q.type === "matching" && (
              <>
                <p style={{ fontSize: 11, color: "#6B6A5E", margin: "0 0 8px" }}>それぞれに合うものを選びなさい。</p>
                {q.leftItems.map((left, li) => {
                  const chosenRight = answerState ? answerState[li] : undefined;
                  const correctRight = q.correctPairs.find(([l]) => l === li)[1];
                  const wasCorrect = submitted && chosenRight === correctRight;
                  return (
                    <div
                      key={li}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        border: `1px solid ${submitted ? (wasCorrect ? "#8FBF9E" : "#E7B9AB") : "#E3DCC8"}`,
                        background: submitted ? (wasCorrect ? "#EEF7EF" : "#FBF0EC") : "#FBF9F3",
                        borderRadius: 12,
                        padding: "10px 12px",
                        marginBottom: 10,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, minWidth: 92 }}>{left}</span>
                      <span style={{ color: "#B8B096" }}>→</span>
                      <select
                        value={chosenRight === undefined ? "" : chosenRight}
                        onChange={(e) => setMatch(li, Number(e.target.value))}
                        disabled={submitted}
                        style={{
                          flex: 1,
                          fontSize: 13,
                          fontFamily: "'Zen Maru Gothic', sans-serif",
                          padding: "8px 8px",
                          borderRadius: 8,
                          border: "1px solid #D8D0BF",
                          background: "#fff",
                        }}
                      >
                        <option value="" disabled>選ぶ</option>
                        {q.rightItems.map((r, ri) => (
                          <option key={ri} value={ri}>{r}</option>
                        ))}
                      </select>
                      {submitted && !wasCorrect && (
                        <span style={{ fontSize: 11, color: "#C1503D", whiteSpace: "nowrap" }}>
                          正解: {q.rightItems[correctRight]}
                        </span>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {submitted && (
            <div style={{ margin: "0 20px 14px" }}>
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: correctNow ? "#EEF7EF" : "#FBF0EC",
                  border: `1px solid ${correctNow ? "#8FBF9E" : "#E7B9AB"}`,
                  marginBottom: 10,
                }}
              >
                <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 13, color: correctNow ? "#2F6B45" : "#B14A34" }}>
                  {correctNow ? "正解！" : "不正解"}
                </p>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#4A493F" }}>{q.explanation}</p>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#4A493F", cursor: "pointer" }}>
                <input type="checkbox" checked={markLearned} onChange={(e) => setMarkLearned(e.target.checked)} />
                覚えた（しばらく出題しない）
              </label>
            </div>
          )}

          <div style={{ padding: "0 20px 20px" }}>
            {!submitted ? (
              <button
                onClick={handleSubmit}
                disabled={!canSubmit()}
                style={{
                  width: "100%",
                  background: canSubmit() ? "#3F6B4E" : "#D8D0BF",
                  color: "#fff",
                  border: "none",
                  borderRadius: 999,
                  padding: "13px 0",
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: "'Zen Maru Gothic', sans-serif",
                  cursor: canSubmit() ? "pointer" : "not-allowed",
                }}
              >
                答えあわせ
              </button>
            ) : (
              <button
                onClick={handleNext}
                style={{
                  width: "100%",
                  background: "#2B2B23",
                  color: "#fff",
                  border: "none",
                  borderRadius: 999,
                  padding: "13px 0",
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: "'Zen Maru Gothic', sans-serif",
                  cursor: "pointer",
                }}
              >
                {pos + 1 >= round.length ? "結果を見る" : "次へ"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function badgeStyle() {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "#EFE9D6",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  };
}
function optionBaseStyle(chosen) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    textAlign: "left",
    width: "100%",
    fontSize: 13.5,
    lineHeight: 1.5,
    padding: "12px 14px",
    borderRadius: 12,
    border: chosen ? "2px solid #3F6B4E" : "1px solid #E3DCC8",
    background: chosen ? "#EEF3E6" : "#fff",
    fontFamily: "'Zen Maru Gothic', sans-serif",
    cursor: "pointer",
    color: "#2B2B23",
  };
}
function optionCorrectStyle() {
  return { ...optionBaseStyle(false), border: "2px solid #3F8F5F", background: "#EAF6EC" };
}
function optionWrongStyle() {
  return { ...optionBaseStyle(false), border: "2px solid #C1503D", background: "#FBECE7" };
}
function optionMutedStyle() {
  return { ...optionBaseStyle(false), opacity: 0.55 };
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
