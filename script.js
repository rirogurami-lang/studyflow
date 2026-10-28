
const $ = (id) => document.getElementById(id);

const STORAGE_KEY = "studyflow-data-v2";
const LEGACY_PREFIX = "studyflow-";

// 日付を YYYY-MM-DD 形式で作る
function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 日付の表示用
function formatDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short"
  });
}

// 1日分の初期データ
function emptyDay() {
  return {
    tasks: [],
    studyMinutes: 0,
    goal: ""
  };
}

// 全日分の記録
let records = {};
let storageAvailable = true;
let saveMessage = "";

// 記録データが正しい形か簡単に確認する
function validDay(day) {
  return day &&
    Array.isArray(day.tasks) &&
    Number.isFinite(day.studyMinutes) &&
    day.studyMinutes >= 0 &&
    typeof day.goal === "string" &&
    day.tasks.every(task =>
      task &&
      typeof task.id === "string" &&
      typeof task.name === "string" &&
      typeof task.done === "boolean"
    );
}

function validRecords(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.entries(value).every(([key, day]) =>
    /^\d{4}-\d{2}-\d{2}$/.test(key) && validDay(day)
  );
}

// 今日の日付を決める
let currentDate = dateKey();
let data = emptyDay();

// 保存済みデータを読み込む
function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      const parsed = JSON.parse(saved);

      if (validRecords(parsed)) {
        records = parsed;
      } else {
        saveMessage = "保存データの形式が違うため、新しい記録として開始しました。";
      }
    } else {
      // 以前のバージョンの今日のデータを引き継ぐ
      const legacy = localStorage.getItem(LEGACY_PREFIX + currentDate);

      if (legacy) {
        const parsed = JSON.parse(legacy);

        if (validDay(parsed)) {
          records[currentDate] = parsed;
        }
      }
    }
  } catch (error) {
    storageAvailable = false;
    saveMessage = "保存データを読み込めません。ブラウザ設定を確認してください。";
    console.warn(error);
  }

  if (!records[currentDate]) {
    records[currentDate] = emptyDay();
  }

  data = records[currentDate];
}

// すべての日付の記録を保存する
function saveData() {
  records[currentDate] = data;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    storageAvailable = true;
    saveMessage = "";
  } catch (error) {
    storageAvailable = false;
    saveMessage = "保存できませんでした。バックアップを書き出してください。";
    console.warn(error);
  }

  updateBackupMessage();
}

// 今日の日付を表示する
$("todayDate").textContent = new Date().toLocaleDateString("ja-JP", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long"
}).toUpperCase();

// タスクを表示する
function renderTasks() {
  const list = $("taskList");
  list.replaceChildren();

  data.tasks.forEach((task) => {
    const item = document.createElement("div");
    item.className = "task-item" + (task.done ? " done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-check";
    checkbox.checked = task.done;
    checkbox.setAttribute("aria-label", task.name + "を完了にする");

    checkbox.addEventListener("change", () => {
      task.done = checkbox.checked;
      saveData();
      renderTasks();
      renderHistory();
    });

    const name = document.createElement("span");
    name.className = "task-name";
    name.textContent = task.name;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "削除";

    deleteButton.addEventListener("click", () => {
      data.tasks = data.tasks.filter(t => t.id !== task.id);
      saveData();
      renderTasks();
      renderHistory();
    });

    item.append(checkbox, name, deleteButton);
    list.appendChild(item);
  });

  const completed = data.tasks.filter(task => task.done).length;
  const total = data.tasks.length;

  $("completedCount").textContent = completed;
  $("totalCount").textContent = total;
  $("taskBadge").textContent = total + " TASKS";
  $("progressBar").style.width =
    (total === 0 ? 0 : completed / total * 100) + "%";
  $("emptyMessage").hidden = total > 0;
}

// 勉強時間を画面に表示する
function renderStudyTime() {
  $("studyHours").textContent = Math.floor(data.studyMinutes / 60);
  $("studyMinutes").textContent = data.studyMinutes % 60;
}

// 今日の目標を表示する
function renderGoal() {
  $("goalDisplay").textContent =
    data.goal || "今日の目標を設定しよう。";
}

// タスクを追加する
$("taskForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const input = $("taskInput");
  const name = input.value.trim();
  if (!name) return;

  data.tasks.push({
    id: Date.now() + "-" + Math.random().toString(36).slice(2),
    name,
    done: false
  });

  saveData();
  renderTasks();
  renderHistory();
  input.value = "";
  input.focus();
});

// 今日の目標を設定する
$("goalForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const input = $("goalInput");
  const goal = input.value.trim();
  if (!goal) return;

  data.goal = goal;
  saveData();
  renderGoal();
  input.value = "";
});

// 勉強時間を記録する
$("timeForm").addEventListener("submit", (event) => {
  event.preventDefault();

  const input = $("minutesInput");
  const minutes = Number(input.value);

  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    $("timeMessage").textContent = "1〜1440分の整数を入力してね。";
    return;
  }

  data.studyMinutes += minutes;
  saveData();
  renderStudyTime();
  renderChart();
  renderHistory();

  $("timeMessage").textContent = minutes + "分を記録したよ！";
  input.value = "";
});

// 直近7日間のデータを作る
function getLastSevenDays() {
  const days = [];

  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - offset);

    const key = dateKey(date);
    const record = records[key] || emptyDay();

    days.push({
      key,
      label: (date.getMonth() + 1) + "/" + date.getDate(),
      minutes: record.studyMinutes,
      isToday: key === currentDate
    });
  }

  return days;
}

// 週間棒グラフを表示する
function renderChart() {
  const chart = $("weeklyChart");
  chart.replaceChildren();

  const days = getLastSevenDays();
  const total = days.reduce((sum, day) => sum + day.minutes, 0);
  const maxMinutes = Math.max(60, ...days.map(day => day.minutes));

  $("weeklyTotal").textContent =
    Math.floor(total / 60) > 0
      ? `${Math.floor(total / 60)}時間${total % 60}分`
      : `${total}分`;

  days.forEach((day) => {
    const column = document.createElement("div");
    column.className = "chart-day";

    const value = document.createElement("div");
    value.className = "chart-value";
    value.textContent = day.minutes + "分";

    const barArea = document.createElement("div");
    barArea.className = "chart-bar-area";

    const bar = document.createElement("div");
    bar.className = "chart-bar" + (day.isToday ? " today" : "");
    bar.style.height = day.minutes === 0
      ? "3px"
      : Math.max(5, day.minutes / maxMinutes * 100) + "%";

    bar.title = `${day.key}: ${day.minutes}分`;

    const label = document.createElement("div");
    label.className = "chart-label";
    label.textContent = day.label + (day.isToday ? " 今日" : "");

    barArea.appendChild(bar);
    column.append(value, barArea, label);
    chart.appendChild(column);
  });
}

// 日付ごとの履歴を表示する
function renderHistory() {
  const list = $("historyList");
  list.replaceChildren();

  const entries = Object.entries(records)
    .filter(([key, day]) =>
      key <= currentDate && validDay(day) &&
      (day.studyMinutes > 0 || day.tasks.length > 0 || day.goal)
    )
    .sort(([a], [b]) => b.localeCompare(a));

  entries.forEach(([key, day]) => {
    const item = document.createElement("div");
    item.className = "history-item";

    const details = document.createElement("div");

    const date = document.createElement("div");
    date.className = "history-date";
    date.textContent = key === currentDate
      ? formatDate(key) + "（今日）"
      : formatDate(key);

    const detail = document.createElement("div");
    detail.className = "history-detail";
    const completed = day.tasks.filter(task => task.done).length;
    detail.textContent =
      `タスク ${completed}/${day.tasks.length} 完了` +
      (day.goal ? " ・目標設定あり" : "");

    const time = document.createElement("div");
    time.className = "history-time";
    time.textContent = day.studyMinutes >= 60
      ? `${Math.floor(day.studyMinutes / 60)}時間${day.studyMinutes % 60}分`
      : `${day.studyMinutes}分`;

    details.append(date, detail);
    item.append(details, time);
    list.appendChild(item);
  });

  $("historyEmpty").hidden = entries.length > 0;
}

// バックアップの状態を表示する
function updateBackupMessage() {
  if (!storageAvailable) {
    $("backupMessage").textContent = saveMessage ||
      "保存に失敗しました。バックアップを試してください。";
  } else {
    $("backupMessage").textContent = saveMessage;
  }
}

// すべての記録をJSONファイルとして書き出す
$("exportButton").addEventListener("click", () => {
  const backup = {
    app: "StudyFlow",
    version: 2,
    exportedAt: new Date().toISOString(),
    records
  };

  const blob = new Blob(
    [JSON.stringify(backup, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "studyflow-backup-" + currentDate + ".json";
  link.click();
  URL.revokeObjectURL(url);

  $("backupMessage").textContent = "バックアップの書き出しを開始したよ！";
});

// 読み込みボタンでファイル選択画面を開く
$("importButton").addEventListener("click", () => {
  $("importFile").click();
});

// JSONバックアップを読み込む
$("importFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    const importedRecords = parsed.records;

    if (!validRecords(importedRecords)) {
      throw new Error("バックアップの形式が正しくありません。");
    }

    const confirmed = confirm(
      "読み込むと、現在のStudyFlowの記録が置き換わります。先に今のデータを書き出すことをおすすめします。続けますか？"
    );

    if (!confirmed) return;

    records = importedRecords;

    if (!records[currentDate]) {
      records[currentDate] = emptyDay();
    }

    data = records[currentDate];

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      storageAvailable = true;
      saveMessage = "";
    } catch (error) {
      storageAvailable = false;
      saveMessage = "読み込みましたが、ブラウザへの保存に失敗しました。";
    }

    renderTasks();
    renderStudyTime();
    renderGoal();
    renderChart();
    renderHistory();
    updateBackupMessage();

    if (storageAvailable) {
      $("backupMessage").textContent = "バックアップを読み込んだよ！";
    }
  } catch (error) {
    $("backupMessage").textContent =
      "読み込めませんでした。StudyFlowのバックアップJSONか確認してね。";
    console.warn(error);
  } finally {
    event.target.value = "";
  }
});

// 最初の画面を表示する
loadData();
renderTasks();
renderStudyTime();
renderGoal();
renderChart();
renderHistory();
updateBackupMessage();
