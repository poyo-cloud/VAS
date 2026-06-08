const STORAGE_KEYS = {
  draft: "nioi-vas-main-draft-v1",
  history: "nioi-vas-main-history-v1",
  calibration: "nioi-vas-main-calibration-v1",
};

const FLOW_STAGES = [
  { key: "intro", title: "基本情報", subtitle: "患者情報" },
  { key: "calibration", title: "校正", subtitle: "10cm 調整" },
  { key: "vas", title: "VAS", subtitle: "5回評価" },
];

const PATTERN_DEFINITIONS = {
  A: [3, 1, 4, 2],
  B: [2, 4, 1, 3],
  C: [4, 2, 3, 1],
  D: [1, 3, 2, 4],
  E: [3, 4, 2, 1],
  F: [2, 1, 4, 3],
  G: [4, 3, 1, 2],
  H: [1, 4, 3, 2],
};

const CONTROL_EXPORT_KEY = "control";
const CONDITION_EXPORT_KEYS = Array.from(
  { length: 4 },
  (_item, index) => `condition${index + 1}`,
);
const DEFAULT_PATTERN_SEQUENCE = [1, 2, 3, 4];

const VAS_ITEMS = [
  {
    id: "smell",
    number: 1,
    prompt: "香りをどれくらい感じましたか?",
    leftLabel: "何も感じない",
    rightLabel: "最も感じる",
  },
  {
    id: "preference",
    number: 2,
    prompt: "香りはどのくらい好きでしたか?",
    leftLabel: "まったく好きではない",
    rightLabel: "最も好きな香り",
  },
  {
    id: "pungency",
    number: 3,
    prompt: "香りはどのくらいツンとしましたか?",
    leftLabel: "まったくツンとしない",
    rightLabel: "最もツンとする",
  },
  {
    id: "comfort",
    number: 4,
    prompt: "いまの心地よさはどのくらいですか?",
    leftLabel: "まったく心地よくない",
    rightLabel: "最も心地よい",
  },
  {
    id: "fatigue",
    number: 5,
    prompt: "いまの疲れはどのくらいですか?",
    leftLabel: "まったく感じない",
    rightLabel: "最も感じる",
  },
  {
    id: "focus",
    number: 6,
    prompt: "いまの集中力はどのくらいですか?",
    leftLabel: "まったくできない",
    rightLabel: "最も集中できている",
  },
];

const STANFORD_SLEEPINESS_FIELD = {
  id: "stanfordSleepiness",
  number: 2,
  prompt: "スタンフォード眠気尺度 日本語版",
  options: [
    "やる気があり、活発で、頭がさえていて、眠くない",
    "最高とはいえないが、頭の働きはよく、集中していられる",
    "くつろいでいて、目覚めているが、どちらかというと反応が鈍い",
    "少しぼんやりしていて、元気がない",
    "ぼんやりしている。目覚めていることへの興味を失い始めている。動作が鈍い",
    "眠い。横になりたい。もうろうとしている",
    "ほとんど眠っている。すぐに眠ってしまいそうで、起きていられない",
  ],
};

const REACTION_TIME_FIELD = {
  id: "reactionTime",
  number: 3,
  prompt: "reaction time",
};
const REACTION_TIME_TRIAL_COUNT = 3;
const REACTION_TIME_MODALITIES = [
  { key: "visual", label: "視覚" },
  { key: "auditory", label: "聴覚" },
];

const refs = {
  statusSummary: document.getElementById("statusSummary"),
  flowStrip: document.getElementById("flowStrip"),
  viewPanel: document.getElementById("viewPanel"),
  historyCount: document.getElementById("historyCount"),
  historyList: document.getElementById("historyList"),
  openCalibrationButton: document.getElementById("openCalibrationButton"),
  exportAllButton: document.getElementById("exportAllButton"),
  resetDraftButton: document.getElementById("resetDraftButton"),
  clearHistoryButton: document.getElementById("clearHistoryButton"),
};

const basePixelsPerMm = measureCssPixelsPerMm();
let calibration = loadCalibration();
let state = normalizeState(loadDraft());
let historyEntries = loadHistory();
let vasPointerState = null;
let calibrationPointerState = null;

bindEvents();
render();

function buildScreens(patternKey) {
  const activePatternKey = patternKey == null ? state.patternKey : patternKey;
  const screens = [
    {
      id: "intro",
      type: "intro",
      stage: "intro",
      title: "参加者情報",
    },
    {
      id: "calibration",
      type: "calibration",
      stage: "calibration",
      title: "VAS の 10cm 校正",
    },
  ];

  buildTimepoints(activePatternKey).forEach((timepoint, index) => {
    screens.push({
      id: `timepoint-${timepoint.id}-vas`,
      type: "timepoint",
      stage: "vas",
      phase: "vas",
      title: `${timepoint.title} VAS`,
      pageNumber: index * 2 + 1,
      pageCount: getTimepointPageCount(activePatternKey),
      timepointId: timepoint.id,
      exportKey: timepoint.exportKey,
    });
    screens.push({
      id: `timepoint-${timepoint.id}-followup`,
      type: "timepoint",
      stage: "vas",
      phase: "followup",
      title: `${timepoint.title} 眠気尺度・reaction time`,
      pageNumber: index * 2 + 2,
      pageCount: getTimepointPageCount(activePatternKey),
      timepointId: timepoint.id,
      exportKey: timepoint.exportKey,
    });
  });

  return screens;
}

function buildTimepoints(patternKey) {
  const sequence = PATTERN_DEFINITIONS[patternKey] || DEFAULT_PATTERN_SEQUENCE;

  return [
    {
      id: "control",
      title: "コントロール",
      exportKey: CONTROL_EXPORT_KEY,
      conditionNumber: 0,
      runNumber: 0,
    },
    ...sequence.map((conditionNumber, index) => ({
      id: `run${index + 1}`,
      title: `${index + 1}回目`,
      exportKey: `condition${conditionNumber}`,
      conditionNumber,
      runNumber: index + 1,
    })),
  ];
}

function createAnswerStore() {
  const answers = {
    [CONTROL_EXPORT_KEY]: createAnswerEntry(),
  };

  CONDITION_EXPORT_KEYS.forEach((key) => {
    answers[key] = createAnswerEntry();
  });

  return answers;
}

function createAnswerEntry() {
  return {
    [STANFORD_SLEEPINESS_FIELD.id]: "",
    reactionTimes: createEmptyReactionTimeSet(),
  };
}

function createEmptyReactionTimes() {
  return Array.from({ length: REACTION_TIME_TRIAL_COUNT }, () => "");
}

function createEmptyReactionTimeSet() {
  return REACTION_TIME_MODALITIES.reduce((entries, modality) => {
    entries[modality.key] = createEmptyReactionTimes();
    return entries;
  }, {});
}

function createInitialState() {
  return {
    sessionId: createSessionId(),
    currentScreenIndex: 0,
    participantId: "",
    sessionDate: todayInputValue(),
    patternKey: "",
    calibrationDraftPx: Math.round(
      (calibration?.pixelsPerMm || basePixelsPerMm) * 100,
    ),
    calibrationNextIndex: null,
    calibrationCancelIndex: null,
    answers: createAnswerStore(),
    savedRecordId: "",
  };
}

function normalizeState(candidate) {
  const next = {
    ...createInitialState(),
    ...candidate,
  };

  if (!next.sessionId) {
    next.sessionId = createSessionId();
  }

  if (!next.sessionDate) {
    next.sessionDate = todayInputValue();
  }

  if (!PATTERN_DEFINITIONS[next.patternKey]) {
    next.patternKey = "";
  }

  if (!Number.isFinite(next.calibrationDraftPx)) {
    next.calibrationDraftPx = Math.round(
      (calibration?.pixelsPerMm || basePixelsPerMm) * 100,
    );
  }

  next.currentScreenIndex = clamp(
    Number.isInteger(next.currentScreenIndex) ? next.currentScreenIndex : 0,
    0,
    buildScreens(next.patternKey).length - 1,
  );

  next.calibrationNextIndex = normalizeIndexCandidate(next.calibrationNextIndex);
  next.calibrationCancelIndex = normalizeIndexCandidate(next.calibrationCancelIndex);
  next.answers = normalizeAnswers(candidate?.answers);

  return next;
}

function normalizeIndexCandidate(value) {
  return Number.isInteger(value) ? value : null;
}

function normalizeAnswers(value) {
  const answers = createAnswerStore();
  if (!value || typeof value !== "object") {
    return answers;
  }

  Object.keys(answers).forEach((key) => {
    const source = value[key];
    if (!source || typeof source !== "object") {
      return;
    }

    const { reactionTime, reactionTimes, ...rest } = source;
    answers[key] = {
      ...createAnswerEntry(),
      ...rest,
      reactionTimes: normalizeReactionTimes(reactionTimes ?? reactionTime),
    };
  });

  return answers;
}

function normalizeReactionTimes(value) {
  const emptySet = createEmptyReactionTimeSet();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return REACTION_TIME_MODALITIES.reduce((entries, modality) => {
      entries[modality.key] = normalizeReactionTimeList(value[modality.key]);
      return entries;
    }, {});
  }

  if (Array.isArray(value)) {
    emptySet.visual = normalizeReactionTimeList(value);
    return emptySet;
  }

  const text = value == null ? "" : String(value).trim();
  if (text) {
    emptySet.visual[0] = text;
  }
  return emptySet;
}

function normalizeReactionTimeList(value) {
  if (Array.isArray(value)) {
    return createEmptyReactionTimes().map((_item, index) => {
      const item = value[index];
      return item == null ? "" : String(item);
    });
  }

  const normalized = createEmptyReactionTimes();
  if (value == null) {
    return normalized;
  }

  const text = String(value).trim();
  if (text) {
    normalized[0] = text;
  }
  return normalized;
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.draft);
    return raw ? JSON.parse(raw) : createInitialState();
  } catch (_error) {
    return createInitialState();
  }
}

function persistDraft() {
  localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(state));
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.history);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function persistHistory() {
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(historyEntries));
}

function loadCalibration() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.calibration);
    if (!raw) {
      return {
        pixelsPerMm: basePixelsPerMm,
        savedAt: "",
      };
    }

    const parsed = JSON.parse(raw);
    return {
      pixelsPerMm: Number(parsed?.pixelsPerMm) || basePixelsPerMm,
      savedAt: parsed?.savedAt || "",
    };
  } catch (_error) {
    return {
      pixelsPerMm: basePixelsPerMm,
      savedAt: "",
    };
  }
}

function persistCalibration() {
  localStorage.setItem(STORAGE_KEYS.calibration, JSON.stringify(calibration));
}

function bindEvents() {
  refs.viewPanel.addEventListener("click", handleViewClick);
  refs.viewPanel.addEventListener("input", handleViewInput);
  refs.viewPanel.addEventListener("pointerdown", handlePointerDown);
  refs.viewPanel.addEventListener("pointermove", handlePointerMove);
  refs.viewPanel.addEventListener("pointerup", handlePointerEnd);
  refs.viewPanel.addEventListener("pointercancel", handlePointerEnd);
  refs.openCalibrationButton.addEventListener("click", openCalibrationFromCurrentPosition);
  refs.exportAllButton.addEventListener("click", exportAllHistory);
  refs.resetDraftButton.addEventListener("click", resetDraftWithConfirm);
  refs.clearHistoryButton.addEventListener("click", clearHistoryWithConfirm);
  refs.historyList.addEventListener("click", handleHistoryClick);
}

function render() {
  renderStatus();
  renderCurrentScreen();
  renderHistory();
}

function renderStatus() {
  const currentScreen = getCurrentScreen();

  refs.historyCount.textContent = `${historyEntries.length} 件`;
  refs.statusSummary.innerHTML = [
    renderSummaryCard("患者ID", state.participantId || "未入力"),
    renderSummaryCard("検査実施日", formatDateValue(state.sessionDate) || "未入力"),
    renderSummaryCard("パターン", state.patternKey ? `パターン${state.patternKey}` : "未選択"),
    renderSummaryCard("現在", getCurrentProgressLabel(currentScreen)),
    renderSummaryCard("回答済み", `${countCompletedTimepoints()} / ${getTimepointCount()}`),
    renderSummaryCard("校正", hasCalibrationSaved() ? "校正済み" : "未校正"),
  ].join("");
  refs.flowStrip.innerHTML = "";
}

function renderSummaryCard(label, value) {
  return `
    <div class="summary-card">
      <div class="summary-card-label">${escapeHtml(label)}</div>
      <div class="summary-card-value">${escapeHtml(value)}</div>
    </div>
  `;
}

function getCurrentProgressLabel(screen) {
  if (!screen) {
    return "未開始";
  }

  if (screen.type !== "timepoint") {
    return screen.title || "未開始";
  }

  const timepoint = buildTimepoints(state.patternKey).find(
    (entry) => entry.id === screen.timepointId,
  );
  if (!timepoint || timepoint.id === "control") {
    return "コントロール";
  }

  return String(timepoint.runNumber);
}

function renderCurrentScreen() {
  const screen = getCurrentScreen();

  if (screen.type === "intro") {
    refs.viewPanel.innerHTML = renderIntroScreen();
    return;
  }

  if (screen.type === "calibration") {
    refs.viewPanel.innerHTML = renderCalibrationScreen();
    return;
  }

  if (screen.type === "timepoint") {
    refs.viewPanel.innerHTML = renderTimepointScreen(screen);
    return;
  }

  refs.viewPanel.innerHTML = renderIntroScreen();
}

function renderIntroScreen() {
  const calibrationMessage = hasCalibrationSaved()
    ? `このブラウザでは ${formatDateTime(calibration.savedAt)} に校正済みです。必要な時だけ「校正」を押してください。`
    : "このブラウザではまだ校正がないため、初回開始時に 10cm 校正を行います。";

  return `
    <div class="screen-shell">
      <div class="screen-head">
        <div>
          <p class="eyebrow">Patient Entry</p>
          <h2>患者情報を入力</h2>
        </div>
      </div>

      <div class="screen-subgrid intro-grid">
        <label class="field-stack">
          <span class="field-label">患者ID</span>
          <input
            class="text-input"
            type="text"
            maxlength="80"
            data-field="participantId"
            placeholder="例: P-001"
            value="${escapeAttribute(state.participantId)}"
          />
        </label>

        <label class="field-stack">
          <span class="field-label">検査実施日</span>
          <input
            class="text-input date-input"
            type="date"
            data-field="sessionDate"
            value="${escapeAttribute(state.sessionDate)}"
          />
        </label>

        <label class="field-stack">
          <span class="field-label">パターン</span>
          <select class="select-input" data-field="patternKey">
            ${renderSelectOption("", "選択してください", state.patternKey)}
            ${Object.keys(PATTERN_DEFINITIONS)
              .map((key) => renderSelectOption(key, `パターン${key}`, state.patternKey))
              .join("")}
          </select>
        </label>
      </div>

      <div class="summary-callout">
        <p class="field-note">${escapeHtml(calibrationMessage)}</p>
      </div>

      <div class="nav-row nav-row-end">
        <button
          class="button-primary"
          type="button"
          data-action="start"
          ${isIntroComplete() ? "" : "disabled"}
        >
          VAS を開始
        </button>
      </div>
    </div>
  `;
}

function renderCalibrationScreen() {
  const savedAtText = hasCalibrationSaved()
    ? `前回の校正: ${formatDateTime(calibration.savedAt)}`
    : "まだ校正されていません。";

  return `
    <div class="screen-shell">
      <div class="screen-head">
        <div>
          <p class="eyebrow">VAS Calibration</p>
          <h2>10cm に合わせる</h2>
          <p class="screen-copy helper-text">
            お手元の定規と見比べながら、下の線を左右にドラッグしてちょうど 10cm に合わせてください。
          </p>
        </div>
        <span class="badge-soft">${escapeHtml(savedAtText)}</span>
      </div>

      <div class="calibration-card">
        <div class="calibration-bar-wrap">
          <div class="calibration-bar-shell">
            <div
              class="calibration-surface"
              data-calibration-surface
              style="--calibration-max-width: ${getCalibrationMaxPx()}px"
            >
              <div
                class="calibration-line"
                style="width: ${state.calibrationDraftPx}px"
              ></div>
            </div>
            <div class="calibration-readout">この線が 10cm になるよう合わせます。</div>
          </div>
        </div>

        <p class="field-note">
          校正値はこのブラウザに保存されます。必要な時だけ再調整してください。
        </p>
      </div>

      <div class="nav-row">
        <button class="button-ghost" type="button" data-action="prev">
          戻る
        </button>
        <button class="button-primary" type="button" data-action="save-calibration">
          校正を保存
        </button>
      </div>
    </div>
  `;
}

function renderTimepointScreen(screen) {
  const timepoint = buildTimepoints(state.patternKey).find(
    (entry) => entry.id === screen.timepointId,
  );
  const answeredCount = countAnsweredItemsForScreen(screen);

  return `
    <div class="screen-shell">
      <div class="screen-head">
        <div>
          <h2>${escapeHtml(timepoint ? timepoint.title : screen.title)}</h2>
        </div>
        <div class="status-tags">
          <span class="badge-soft">${screen.pageNumber} / ${screen.pageCount}</span>
          <span class="badge-soft" data-role="answered-count">${answeredCount} / ${getScreenItemCount(screen)} 項目</span>
        </div>
      </div>

      <div class="question-grid">
        ${
          screen.phase === "followup"
            ? `${renderStanfordSleepinessCard(screen.exportKey)}${renderReactionTimeCard(screen.exportKey)}`
            : `${renderVasSectionTitle()}${VAS_ITEMS.map((item) => renderVasCard(screen.exportKey, item)).join("")}`
        }
      </div>

      <div class="nav-row">
        <button class="button-ghost" type="button" data-action="prev">
          前へ戻る
        </button>
        <button class="button-primary" type="button" data-action="next">
          ${screen.pageNumber === screen.pageCount ? "回答を終了する" : "次へ進む"}
        </button>
      </div>
    </div>
  `;
}

function renderVasSectionTitle() {
  return `
    <section class="section-title-card">
      <h3 class="question-title">
        <span class="question-number">1.</span>
        <span>VAS</span>
      </h3>
      <p class="screen-copy helper-text">線をタップあるいはスライドして位置を決めてください。</p>
    </section>
  `;
}

function renderVasCard(exportKey, item) {
  const value = getStoredAnswer(exportKey, item.id);
  const widthPx = getVasTrackWidthPx();
  const markerLeft = value == null ? 0 : value;
  const opacity = value == null ? 0 : 1;

  return `
    <section class="vas-card">
      <h3 class="question-title">
        <span>${escapeHtml(item.prompt)}</span>
      </h3>

      <div class="vas-track-wrap">
        <div
          class="vas-track-shell"
          style="--vas-width: ${widthPx}px"
        >
          <div
            class="vas-track"
            data-export-key="${escapeAttribute(exportKey)}"
            data-item-id="${escapeAttribute(item.id)}"
          >
            <div
              class="vas-marker"
              style="left: ${markerLeft}%; opacity: ${opacity}"
            ></div>
          </div>
          <div class="vas-label-row">
            <span>${escapeHtml(item.leftLabel)}</span>
            <span>${escapeHtml(item.rightLabel)}</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderReactionTimeCard(exportKey) {
  const reactionTimes = getStoredReactionTimes(exportKey);

  return `
    <section class="vas-card reaction-card">
      <h3 class="question-title">
        <span class="question-number">${escapeHtml(String(REACTION_TIME_FIELD.number))}.</span>
        <span>${escapeHtml(REACTION_TIME_FIELD.prompt)}</span>
      </h3>

      ${REACTION_TIME_MODALITIES.map((modality) => `
        <div class="reaction-modality">
          <div class="reaction-modality-title">${escapeHtml(modality.label)}</div>
          <div class="reaction-grid">
            ${reactionTimes[modality.key]
              .map(
                (value, index) => `
                  <label class="field-stack reaction-field">
                    <span class="field-label reaction-label">${index + 1}回目</span>
                    <input
                      class="number-input reaction-input"
                      type="number"
                      min="0"
                      step="any"
                      inputmode="decimal"
                      data-field="reactionTime"
                      data-export-key="${escapeAttribute(exportKey)}"
                      data-reaction-modality="${escapeAttribute(modality.key)}"
                      data-reaction-index="${escapeAttribute(String(index))}"
                      placeholder="入力してください"
                      value="${escapeAttribute(value)}"
                    />
                  </label>
                `,
              )
              .join("")}
          </div>
        </div>
      `).join("")}
    </section>
  `;
}

function renderStanfordSleepinessCard(exportKey) {
  const selectedValue = getStoredStanfordSleepiness(exportKey);

  return `
    <section class="vas-card sleepiness-card">
      <h3 class="question-title">
        <span class="question-number">${escapeHtml(String(STANFORD_SLEEPINESS_FIELD.number))}.</span>
        <span>${escapeHtml(STANFORD_SLEEPINESS_FIELD.prompt)}</span>
      </h3>

      <div class="sleepiness-options">
        ${STANFORD_SLEEPINESS_FIELD.options
          .map((label, index) => {
            const value = String(index + 1);
            return `
              <label class="sleepiness-option">
                <input
                  type="radio"
                  name="stanford-sleepiness-${escapeAttribute(exportKey)}"
                  value="${escapeAttribute(value)}"
                  data-field="stanfordSleepiness"
                  data-export-key="${escapeAttribute(exportKey)}"
                  ${selectedValue === value ? "checked" : ""}
                />
                <span class="sleepiness-score">${escapeHtml(value)}</span>
                <span class="sleepiness-label">${escapeHtml(label)}</span>
              </label>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderHistory() {
  if (!historyEntries.length) {
    refs.historyList.innerHTML = `
      <div class="empty-state history-empty">
        まだ保存済みセッションはありません。今回の VAS を最後まで入力すると、ここからまとめて CSV 出力できます。
      </div>
    `;
    return;
  }

  refs.historyList.innerHTML = historyEntries
    .map((entry) => {
      const chips = [
        renderHistoryScoreChip("パターン", entry.patternKey || "-"),
        renderHistoryScoreChip("完了", `${countCompletedTimepointsInRecord(entry)} / ${getTimepointCount()}`),
      ].join("");

      return `
        <article class="history-item">
          <div class="history-topline">
            <div>
              <div class="history-title">${escapeHtml(entry.participantId || "患者ID未設定")}</div>
              <div class="history-meta">
                ${escapeHtml(formatDateValue(entry.sessionDate))} / パターン${escapeHtml(entry.patternKey || "-")} / 保存 ${escapeHtml(formatDateTime(entry.savedAt))}
              </div>
            </div>
            <div class="history-actions">
              <button class="button-secondary" type="button" data-action="history-export" data-record-id="${escapeAttribute(entry.id)}">
                この回をCSV出力
              </button>
              <button class="button-ghost danger" type="button" data-action="history-delete" data-record-id="${escapeAttribute(entry.id)}">
                削除
              </button>
            </div>
          </div>

          <div class="history-scores">
            ${chips}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderHistoryScoreChip(label, value) {
  return `<span class="mini-badge">${escapeHtml(label)} ${escapeHtml(value)}</span>`;
}

function handleViewClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const currentScreen = getCurrentScreen();

  if (action === "start") {
    state.savedRecordId = "";
    if (hasCalibrationSaved()) {
      clearCalibrationRoute();
      state.currentScreenIndex = getFirstTimepointScreenIndex();
    } else {
      state.calibrationDraftPx = Math.round(basePixelsPerMm * 100);
      state.calibrationNextIndex = getFirstTimepointScreenIndex();
      state.calibrationCancelIndex = 0;
      state.currentScreenIndex = getCalibrationScreenIndex();
    }
    persistDraft();
    render();
    scrollToTop();
    return;
  }

  if (action === "prev") {
    if (currentScreen.type === "calibration") {
      leaveCalibrationScreen();
      return;
    }

    goToPreviousScreen();
    return;
  }

  if (action === "next") {
    goToNextScreen();
    return;
  }

  if (action === "save-calibration") {
    calibration = {
      pixelsPerMm: state.calibrationDraftPx / 100,
      savedAt: new Date().toISOString(),
    };
    persistCalibration();

    const targetIndex = Number.isInteger(state.calibrationNextIndex)
      ? state.calibrationNextIndex
      : getFirstTimepointScreenIndex();

    clearCalibrationRoute();
    state.currentScreenIndex = clamp(targetIndex, 0, buildScreens().length - 1);
    persistDraft();
    render();
    scrollToTop();
    return;
  }

  if (action === "clear-vas") {
    const exportKey = button.dataset.exportKey;
    const itemId = button.dataset.itemId;
    delete state.answers[exportKey][itemId];
    persistDraft();
    renderCurrentScreen();
    renderStatus();
    return;
  }
}

function handleViewInput(event) {
  const target = event.target;
  const field = target.dataset.field;
  if (!field) {
    return;
  }

  if (field === "reactionTime") {
    const exportKey = target.dataset.exportKey;
    const reactionModality = target.dataset.reactionModality;
    const reactionIndex = Number(target.dataset.reactionIndex);
    if (!exportKey || !reactionModality || !Number.isInteger(reactionIndex)) {
      return;
    }

    const reactionTimes = getStoredReactionTimes(exportKey);
    reactionTimes[reactionModality][reactionIndex] = target.value;
    state.answers[exportKey].reactionTimes = reactionTimes;
    delete state.answers[exportKey].reactionTime;
    persistDraft();
    renderStatus();
    syncTimepointAnsweredCount(exportKey);
    return;
  }

  if (field === STANFORD_SLEEPINESS_FIELD.id) {
    const exportKey = target.dataset.exportKey;
    if (!exportKey) {
      return;
    }

    state.answers[exportKey][STANFORD_SLEEPINESS_FIELD.id] = target.value;
    persistDraft();
    renderStatus();
    syncTimepointAnsweredCount(exportKey);
    return;
  }

  state[field] = target.value;
  persistDraft();
  renderStatus();

  if (getCurrentScreen().type === "intro") {
    const startButton = refs.viewPanel.querySelector('[data-action="start"]');
    if (startButton) {
      startButton.disabled = !isIntroComplete();
    }
  }
}

function handlePointerDown(event) {
  const calibrationSurface = event.target.closest("[data-calibration-surface]");
  if (calibrationSurface) {
    event.preventDefault();
    calibrationPointerState = {
      pointerId: event.pointerId,
      surface: calibrationSurface,
    };

    if (calibrationSurface.setPointerCapture) {
      calibrationSurface.setPointerCapture(event.pointerId);
    }

    updateCalibrationFromPointer(calibrationSurface, event);
    return;
  }

  const track = event.target.closest(".vas-track");
  if (!track) {
    return;
  }

  event.preventDefault();
  vasPointerState = {
    pointerId: event.pointerId,
    track,
  };

  if (track.setPointerCapture) {
    track.setPointerCapture(event.pointerId);
  }

  updateVasAnswerFromPointer(track, event);
}

function handlePointerMove(event) {
  if (calibrationPointerState && calibrationPointerState.pointerId === event.pointerId) {
    updateCalibrationFromPointer(calibrationPointerState.surface, event, false);
    return;
  }

  if (!vasPointerState || vasPointerState.pointerId !== event.pointerId) {
    return;
  }

  updateVasAnswerFromPointer(vasPointerState.track, event, false);
}

function handlePointerEnd(event) {
  if (calibrationPointerState && calibrationPointerState.pointerId === event.pointerId) {
    updateCalibrationFromPointer(calibrationPointerState.surface, event);

    if (calibrationPointerState.surface.releasePointerCapture) {
      calibrationPointerState.surface.releasePointerCapture(event.pointerId);
    }

    calibrationPointerState = null;
    return;
  }

  if (!vasPointerState || vasPointerState.pointerId !== event.pointerId) {
    return;
  }

  updateVasAnswerFromPointer(vasPointerState.track, event);

  if (vasPointerState.track.releasePointerCapture) {
    vasPointerState.track.releasePointerCapture(event.pointerId);
  }

  vasPointerState = null;
}

function updateVasAnswerFromPointer(track, event, persist = true) {
  const rect = track.getBoundingClientRect();
  const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  const value = Number((ratio * 100).toFixed(1));
  const exportKey = track.dataset.exportKey;
  const itemId = track.dataset.itemId;

  state.answers[exportKey][itemId] = value;
  updateVasMarker(track, exportKey, itemId, value);

  if (persist) {
    persistDraft();
    renderStatus();
  }
}

function updateVasMarker(track, exportKey, itemId, value) {
  const marker = track.querySelector(".vas-marker");

  if (marker) {
    marker.style.left = `${value}%`;
    marker.style.opacity = "1";
  }
}

function updateCalibrationFromPointer(surface, event, persist = true) {
  const rect = surface.getBoundingClientRect();
  const surfaceStyle = window.getComputedStyle(surface);
  const paddingLeft = Number.parseFloat(surfaceStyle.paddingLeft) || 0;
  const width = clamp(
    event.clientX - rect.left - paddingLeft,
    getCalibrationMinPx(),
    getCalibrationMaxPx(),
  );

  state.calibrationDraftPx = Math.round(width);
  updateCalibrationLine(surface, state.calibrationDraftPx);

  if (persist) {
    persistDraft();
  }
}

function updateCalibrationLine(surface, widthPx) {
  const line = surface.querySelector(".calibration-line");
  if (line) {
    line.style.width = `${widthPx}px`;
  }
}

function handleHistoryClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const recordId = button.dataset.recordId;
  if (!recordId) {
    return;
  }

  if (action === "history-export") {
    const record = findHistoryEntry(recordId);
    if (record) {
      exportRecordsAsCsv(
        [record],
        `VAS_${sanitizeFileName(record.participantId || record.id)}.csv`,
      );
    }
    return;
  }

  if (action === "history-delete") {
    const record = findHistoryEntry(recordId);
    if (!record) {
      return;
    }

    const confirmed = window.confirm(
      `「${record.participantId || "この記録"}」を削除しますか？`,
    );
    if (!confirmed) {
      return;
    }

    historyEntries = historyEntries.filter((entry) => entry.id !== recordId);
    persistHistory();

    if (state.savedRecordId === recordId) {
      state.savedRecordId = "";
      persistDraft();
    }

    render();
  }
}

function openCalibrationFromCurrentPosition() {
  const calibrationIndex = getCalibrationScreenIndex();
  if (state.currentScreenIndex === calibrationIndex) {
    return;
  }

  state.calibrationDraftPx = Math.round(
    (calibration?.pixelsPerMm || basePixelsPerMm) * 100,
  );
  state.calibrationNextIndex = state.currentScreenIndex;
  state.calibrationCancelIndex = state.currentScreenIndex;
  state.currentScreenIndex = calibrationIndex;
  persistDraft();
  render();
  scrollToTop();
}

function leaveCalibrationScreen() {
  const targetIndex = Number.isInteger(state.calibrationCancelIndex)
    ? state.calibrationCancelIndex
    : 0;

  clearCalibrationRoute();
  state.currentScreenIndex = clamp(targetIndex, 0, buildScreens().length - 1);
  persistDraft();
  render();
  scrollToTop();
}

function clearCalibrationRoute() {
  state.calibrationNextIndex = null;
  state.calibrationCancelIndex = null;
}

function goToNextScreen() {
  const currentScreen = getCurrentScreen();

  if (currentScreen.type === "timepoint") {
    const missingItemIds = getMissingItemIdsForScreen(currentScreen);
    if (missingItemIds.length) {
      showMissingItemsAlert(missingItemIds);
      return;
    }

    if (currentScreen.pageNumber === currentScreen.pageCount) {
      finalizeCurrentSession();
      return;
    }
  } else if (!isCurrentScreenComplete()) {
    return;
  }

  state.currentScreenIndex = clamp(
    state.currentScreenIndex + 1,
    0,
    buildScreens().length - 1,
  );
  persistDraft();
  render();
  scrollToTop();
}

function goToPreviousScreen() {
  state.currentScreenIndex = clamp(
    state.currentScreenIndex - 1,
    0,
    buildScreens().length - 1,
  );
  persistDraft();
  render();
  scrollToTop();
}

function isCurrentScreenComplete() {
  const screen = getCurrentScreen();

  if (screen.type === "intro") {
    return isIntroComplete();
  }

  if (screen.type === "timepoint") {
    return isTimepointComplete(screen.exportKey);
  }

  return true;
}

function isIntroComplete() {
  return Boolean(
    state.participantId.trim() &&
      state.sessionDate &&
      state.patternKey &&
      PATTERN_DEFINITIONS[state.patternKey],
  );
}

function isTimepointComplete(exportKey) {
  return getMissingItemIdsForExportKey(exportKey).length === 0;
}

function getMissingItemIdsForExportKey(exportKey) {
  return [
    ...getMissingVasItemIdsForExportKey(exportKey),
    ...getMissingFollowupItemIdsForExportKey(exportKey),
  ];
}

function getMissingItemIdsForScreen(screen) {
  if (screen.phase === "followup") {
    return getMissingFollowupItemIdsForExportKey(screen.exportKey);
  }

  return getMissingVasItemIdsForExportKey(screen.exportKey);
}

function getMissingVasItemIdsForExportKey(exportKey) {
  return VAS_ITEMS.filter(
    (item) => getStoredAnswer(exportKey, item.id) == null,
  ).map((item) => item.id);
}

function getMissingFollowupItemIdsForExportKey(exportKey) {
  const missingItemIds = [];
  if (!getStoredStanfordSleepiness(exportKey)) {
    missingItemIds.push(STANFORD_SLEEPINESS_FIELD.id);
  }
  if (!areReactionTimesComplete(getStoredReactionTimes(exportKey))) {
    missingItemIds.push(REACTION_TIME_FIELD.id);
  }

  return missingItemIds;
}

function showMissingItemsAlert(itemIds) {
  const labels = itemIds
    .map((itemId) => {
      if (itemId === STANFORD_SLEEPINESS_FIELD.id) {
        return `${STANFORD_SLEEPINESS_FIELD.number}. ${STANFORD_SLEEPINESS_FIELD.prompt}`;
      }

      if (itemId === REACTION_TIME_FIELD.id) {
        return `${REACTION_TIME_FIELD.number}. ${REACTION_TIME_FIELD.prompt}（視覚・聴覚を各3回入力）`;
      }

      const item = VAS_ITEMS.find((entry) => entry.id === itemId);
      return item ? `1. VAS: ${item.prompt}` : itemId;
    })
    .join("\n");

  window.alert(`未回答の項目があります。\n${labels}`);
}

function getStoredAnswer(exportKey, itemId) {
  const value = state.answers[exportKey]?.[itemId];
  return value == null ? null : Number(value);
}

function getStoredReactionTimes(exportKey) {
  return normalizeReactionTimes(
    state.answers[exportKey]?.reactionTimes ?? state.answers[exportKey]?.reactionTime,
  );
}

function getStoredStanfordSleepiness(exportKey) {
  const value = state.answers[exportKey]?.[STANFORD_SLEEPINESS_FIELD.id];
  return value == null ? "" : String(value);
}

function areReactionTimesComplete(reactionTimes) {
  return REACTION_TIME_MODALITIES.every((modality) =>
    reactionTimes[modality.key].every((value) => String(value).trim()),
  );
}

function getAnswerEntryReactionTimes(answerEntry) {
  return normalizeReactionTimes(answerEntry?.reactionTimes ?? answerEntry?.reactionTime);
}

function isLegacyReactionTimeComplete(answerEntry) {
  if (!answerEntry || typeof answerEntry !== "object") {
    return false;
  }

  if (Array.isArray(answerEntry.reactionTimes)) {
    return false;
  }

  return String(answerEntry.reactionTime || "").trim() !== "";
}

function getCurrentScreen() {
  return buildScreens()[state.currentScreenIndex];
}

function getCalibrationScreenIndex() {
  return buildScreens().findIndex((screen) => screen.type === "calibration");
}

function getFirstTimepointScreenIndex() {
  return buildScreens().findIndex((screen) => screen.type === "timepoint");
}

function countAnsweredItemsForExportKey(exportKey) {
  const vasAnsweredCount = VAS_ITEMS.reduce((count, item) => {
    return getStoredAnswer(exportKey, item.id) == null ? count : count + 1;
  }, 0);
  const sleepinessAnsweredCount = getStoredStanfordSleepiness(exportKey) ? 1 : 0;
  const reactionTimeAnsweredCount = areReactionTimesComplete(getStoredReactionTimes(exportKey))
    ? 1
    : 0;

  return vasAnsweredCount + sleepinessAnsweredCount + reactionTimeAnsweredCount;
}

function countAnsweredItemsForScreen(screen) {
  if (screen.phase === "followup") {
    return getScreenItemCount(screen) - getMissingFollowupItemIdsForExportKey(screen.exportKey).length;
  }

  return getScreenItemCount(screen) - getMissingVasItemIdsForExportKey(screen.exportKey).length;
}

function countCompletedTimepoints() {
  return buildTimepoints(state.patternKey).reduce((count, timepoint) => {
    return isTimepointComplete(timepoint.exportKey) ? count + 1 : count;
  }, 0);
}

function countCompletedTimepointsInRecord(record) {
  return buildTimepoints(record.patternKey).reduce((count, timepoint) => {
    return countAnsweredItemsInRecord(record, timepoint.exportKey) === getTotalTimepointItemCount()
      ? count + 1
      : count;
  }, 0);
}

function countAnsweredItemsInRecord(record, exportKey) {
  const answeredCount = VAS_ITEMS.reduce((count, item) => {
    return record.answers?.[exportKey]?.[item.id] == null ? count : count + 1;
  }, 0);

  const answerEntry = record.answers?.[exportKey];
  const hasSleepiness = Boolean(answerEntry?.[STANFORD_SLEEPINESS_FIELD.id]);
  const hasReactionTime = areReactionTimesComplete(
    getAnswerEntryReactionTimes(answerEntry),
  ) || isLegacyReactionTimeComplete(answerEntry);

  return answeredCount + (hasSleepiness ? 1 : 0) + (hasReactionTime ? 1 : 0);
}

function getScreenItemCount(screen) {
  return screen.phase === "followup" ? 2 : VAS_ITEMS.length;
}

function getTotalTimepointItemCount() {
  return VAS_ITEMS.length + 2;
}

function getTimepointCount(patternKey = state?.patternKey) {
  return buildTimepoints(patternKey).length;
}

function getTimepointPageCount(patternKey = state?.patternKey) {
  return getTimepointCount(patternKey) * 2;
}

function syncTimepointAnsweredCount(_exportKey) {
  const answeredCountNode = refs.viewPanel.querySelector('[data-role="answered-count"]');
  if (!answeredCountNode) {
    return;
  }

  const screen = getCurrentScreen();
  answeredCountNode.textContent = `${countAnsweredItemsForScreen(screen)} / ${getScreenItemCount(screen)} 項目`;
}

function hasCalibrationSaved() {
  return Boolean(calibration?.savedAt);
}

function upsertCurrentRecord() {
  const record = buildRecord();
  historyEntries = [record, ...historyEntries.filter((entry) => entry.id !== record.id)];
  state.savedRecordId = record.id;
  persistDraft();
  persistHistory();
  return record;
}

function buildRecord() {
  return {
    id: state.savedRecordId || state.sessionId,
    savedAt: new Date().toISOString(),
    participantId: state.participantId.trim(),
    sessionDate: state.sessionDate,
    patternKey: state.patternKey,
    patternSequence: [...(PATTERN_DEFINITIONS[state.patternKey] || DEFAULT_PATTERN_SEQUENCE)],
    calibrationPixelsPerMm: calibration?.pixelsPerMm || basePixelsPerMm,
    answers: JSON.parse(JSON.stringify(state.answers)),
  };
}

function exportAllHistory() {
  if (!historyEntries.length) {
    window.alert("保存済み履歴がまだありません。");
    return;
  }

  exportRecordsAsCsv(
    historyEntries,
    `VAS_history-${timestampFilePart(new Date().toISOString())}.csv`,
  );
}

function exportRecordsAsCsv(records, filename) {
  const content = `\uFEFF${buildCsv(records)}`;
  downloadTextFile(
    filename,
    content,
    "text/csv;charset=utf-8",
  );
}

function buildCsv(records) {
  const rows = [buildExportColumns(), ...records.map((record) => buildExportRow(record))];
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

function buildExportColumns() {
  return [
    "SubjectNo",
    "Pattern",
    ...buildSummaryVasHeaders(),
  ];
}

function buildExportRow(record) {
  return [
    record.participantId,
    record.patternKey,
    ...buildSummaryVasValues(record),
  ];
}

function buildSummaryVasHeaders() {
  return [
    "B_threshold",
    "B_favo",
    "B_pungency",
    "B_comfort",
    "B_tiredness",
    "B_concentrate",
    "B_sleepiness",
    "B_v_reactiontime",
    "B_s_reactiontime",
    ...Array.from({ length: 4 }, (_item, index) => {
      const prefix = `C${index + 1}`;
      return [
        `${prefix}_threshold`,
        `${prefix}_favo`,
        `${prefix}_pungency`,
        `${prefix}_comfort`,
        `${prefix}_tiredness`,
        `${prefix}_concentrate`,
        `${prefix}_sleepiness`,
        `${prefix}_v_reactiontime`,
        `${prefix}_s_reactiontime`,
      ];
    }).flat(),
  ];
}

function buildSummaryVasValues(record) {
  const itemOrder = [
    "smell",
    "preference",
    "pungency",
    "comfort",
    "fatigue",
    "focus",
  ];
  const exportOrder = [
    CONTROL_EXPORT_KEY,
    ...CONDITION_EXPORT_KEYS,
  ];

  return exportOrder.flatMap((exportKey) =>
    [
      ...itemOrder.map((itemId) => formatScore(record.answers?.[exportKey]?.[itemId])),
      formatStanfordSleepiness(record.answers?.[exportKey]),
      formatReactionTimeAverage(record.answers?.[exportKey], "visual"),
      formatReactionTimeAverage(record.answers?.[exportKey], "auditory"),
    ],
  );
}

function formatScore(value) {
  return value == null ? "" : (Number(value) / 10).toFixed(1);
}

function formatReactionTimeAverage(answerEntry, modalityKey) {
  const values = getAnswerEntryReactionTimes(answerEntry)[modalityKey]
    .map((value) => String(value).trim())
    .filter((value) => value !== "")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return "";
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return trimTrailingZeros(average.toFixed(3));
}

function formatStanfordSleepiness(answerEntry) {
  const value = answerEntry?.[STANFORD_SLEEPINESS_FIELD.id];
  return value == null ? "" : String(value);
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function trimTrailingZeros(value) {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

function findHistoryEntry(recordId) {
  return historyEntries.find((entry) => entry.id === recordId);
}

function resetDraftWithConfirm() {
  const confirmed = window.confirm(
    "現在の下書きを破棄して最初からやり直しますか？ 保存済み履歴は消えません。",
  );
  if (!confirmed) {
    return;
  }

  state = createInitialState();
  localStorage.removeItem(STORAGE_KEYS.draft);
  persistDraft();
  render();
  scrollToTop();
}

function clearHistoryWithConfirm() {
  if (!historyEntries.length) {
    return;
  }

  const confirmed = window.confirm(
    "保存済み履歴をすべて削除しますか？ この操作は元に戻せません。",
  );
  if (!confirmed) {
    return;
  }

  historyEntries = [];
  localStorage.removeItem(STORAGE_KEYS.history);
  if (state.savedRecordId) {
    state.savedRecordId = "";
    persistDraft();
  }
  render();
}

function finalizeCurrentSession() {
  const confirmed = window.confirm("回答を確定して保存しますか？");
  if (!confirmed) {
    return;
  }

  upsertCurrentRecord();
  state = createInitialState();
  persistDraft();
  render();
  scrollToTop();
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function measureCssPixelsPerMm() {
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.left = "-9999px";
  probe.style.top = "-9999px";
  probe.style.width = "100mm";
  probe.style.height = "1px";
  document.body.appendChild(probe);
  const pixels = probe.getBoundingClientRect().width / 100;
  probe.remove();
  return pixels || 3.78;
}

function getVasTrackWidthPx() {
  const pixelsPerMm = calibration?.pixelsPerMm || basePixelsPerMm;
  return Math.round(pixelsPerMm * 100);
}

function getCalibrationMinPx() {
  return Math.round(basePixelsPerMm * 50);
}

function getCalibrationMaxPx() {
  return Math.round(basePixelsPerMm * 170);
}

function renderSelectOption(value, label, currentValue) {
  const selected = value === currentValue ? "selected" : "";
  return `<option value="${escapeAttribute(value)}" ${selected}>${escapeHtml(label)}</option>`;
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "auto" });
}

function createSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayInputValue() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function timestampFilePart(isoString) {
  const date = new Date(isoString);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}`;
}

function formatDateValue(value) {
  if (!value) {
    return "";
  }

  return value.replaceAll("-", "/");
}

function formatDateTime(isoString) {
  if (!isoString) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoString));
  } catch (_error) {
    return isoString;
  }
}

function sanitizeFileName(value) {
  return String(value).replace(/[^\p{L}\p{N}_-]+/gu, "-");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
