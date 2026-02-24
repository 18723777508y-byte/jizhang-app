const STORAGE_KEY = "ledger_app_v1";

const $ = (id) => document.getElementById(id);
const today = new Date().toISOString().slice(0, 10);

const els = {
  summaryCards: $("summaryCards"),
  installBtn: $("installBtn"),
  installHint: $("installHint"),
  txForm: $("txForm"),
  txType: $("txType"),
  txAmount: $("txAmount"),
  txDate: $("txDate"),
  txAccount: $("txAccount"),
  txToAccount: $("txToAccount"),
  txCategory: $("txCategory"),
  txTags: $("txTags"),
  txNote: $("txNote"),
  txSubmit: $("txSubmit"),
  txCancel: $("txCancel"),
  toAccountWrap: $("toAccountWrap"),
  txTableBody: $("txTableBody"),
  txCount: $("txCount"),
  filterStart: $("filterStart"),
  filterEnd: $("filterEnd"),
  filterType: $("filterType"),
  filterAccount: $("filterAccount"),
  filterCategory: $("filterCategory"),
  filterKeyword: $("filterKeyword"),
  filterReset: $("filterReset"),
  accountForm: $("accountForm"),
  accountName: $("accountName"),
  accountType: $("accountType"),
  accountOpening: $("accountOpening"),
  accountList: $("accountList"),
  categoryForm: $("categoryForm"),
  categoryName: $("categoryName"),
  categoryType: $("categoryType"),
  categoryList: $("categoryList"),
  budgetForm: $("budgetForm"),
  budgetMonth: $("budgetMonth"),
  budgetCategory: $("budgetCategory"),
  budgetAmount: $("budgetAmount"),
  budgetList: $("budgetList"),
  trendCanvas: $("trendCanvas"),
  categoryCanvas: $("categoryCanvas"),
  exportJsonBtn: $("exportJsonBtn"),
  exportCsvBtn: $("exportCsvBtn"),
  importInput: $("importInput")
};

let deferredInstallPrompt = null;

const DEFAULT_DATA = {
  accounts: [
    { id: uid(), name: "现金", type: "cash", openingBalance: 1000 },
    { id: uid(), name: "工资卡", type: "bank", openingBalance: 5000 }
  ],
  categories: [
    { id: uid(), name: "餐饮", type: "expense" },
    { id: uid(), name: "交通", type: "expense" },
    { id: uid(), name: "住房", type: "expense" },
    { id: uid(), name: "娱乐", type: "expense" },
    { id: uid(), name: "工资", type: "income" },
    { id: uid(), name: "兼职", type: "income" },
    { id: uid(), name: "理财", type: "income" }
  ],
  transactions: [],
  budgets: []
};

let state = loadState();
let editingTxId = null;

initialize();

function initialize() {
  els.txDate.value = today;
  els.budgetMonth.value = today.slice(0, 7);
  bindEvents();
  initPwa();
  renderAll();
}

function bindEvents() {
  els.txType.addEventListener("change", onTxTypeChange);

  els.txForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const type = els.txType.value;
    const amount = Number(els.txAmount.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      return alert("请输入正确的金额");
    }
    if (type === "transfer" && els.txAccount.value === els.txToAccount.value) {
      return alert("转出和转入账户不能相同");
    }

    const entry = {
      id: editingTxId || uid(),
      type,
      amount,
      date: els.txDate.value,
      accountId: els.txAccount.value,
      toAccountId: type === "transfer" ? els.txToAccount.value : "",
      categoryId: type === "transfer" ? "" : els.txCategory.value,
      tags: parseTags(els.txTags.value),
      note: els.txNote.value.trim()
    };

    if (!entry.date || !entry.accountId || (type !== "transfer" && !entry.categoryId)) {
      return alert("请完整填写必要字段");
    }

    if (editingTxId) {
      const idx = state.transactions.findIndex((x) => x.id === editingTxId);
      if (idx >= 0) state.transactions[idx] = entry;
    } else {
      state.transactions.push(entry);
    }

    resetTxForm();
    persistAndRender();
  });

  els.txCancel.addEventListener("click", resetTxForm);

  [
    els.filterStart,
    els.filterEnd,
    els.filterType,
    els.filterAccount,
    els.filterCategory,
    els.filterKeyword
  ].forEach((el) => el.addEventListener("input", renderTransactionTable));

  els.filterReset.addEventListener("click", () => {
    els.filterStart.value = "";
    els.filterEnd.value = "";
    els.filterType.value = "all";
    els.filterAccount.value = "all";
    els.filterCategory.value = "all";
    els.filterKeyword.value = "";
    renderTransactionTable();
  });

  els.accountForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = els.accountName.value.trim();
    const openingBalance = Number(els.accountOpening.value);
    if (!name) return;
    if (!Number.isFinite(openingBalance)) return alert("期初余额不正确");
    state.accounts.push({ id: uid(), name, type: els.accountType.value, openingBalance });
    els.accountForm.reset();
    persistAndRender();
  });

  els.categoryForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = els.categoryName.value.trim();
    const type = els.categoryType.value;
    if (!name) return;
    const exists = state.categories.some((c) => c.name === name && c.type === type);
    if (exists) return alert("该分类已存在");
    state.categories.push({ id: uid(), name, type });
    els.categoryForm.reset();
    persistAndRender();
  });

  els.budgetForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const month = els.budgetMonth.value;
    const categoryId = els.budgetCategory.value;
    const amount = Number(els.budgetAmount.value);
    if (!month || !categoryId || !Number.isFinite(amount) || amount <= 0) {
      return alert("预算信息不完整");
    }
    const existing = state.budgets.find((b) => b.month === month && b.categoryId === categoryId);
    if (existing) {
      existing.amount = amount;
    } else {
      state.budgets.push({ id: uid(), month, categoryId, amount });
    }
    els.budgetForm.reset();
    els.budgetMonth.value = today.slice(0, 7);
    persistAndRender();
  });

  els.exportJsonBtn.addEventListener("click", () => {
    downloadFile(
      "ledger-backup.json",
      JSON.stringify(state, null, 2),
      "application/json;charset=utf-8"
    );
  });

  els.exportCsvBtn.addEventListener("click", exportCsv);

  els.importInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      state = normalizeState(data);
      persistAndRender();
      alert("导入成功");
    } catch (err) {
      alert("导入失败：JSON 格式不正确");
    } finally {
      els.importInput.value = "";
    }
  });

  els.installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.installBtn.classList.add("hidden");
  });
}

function initPwa() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    els.installBtn.classList.remove("hidden");
    els.installHint.classList.remove("hidden");
    els.installHint.textContent = "已支持安装：点击“安装 APP”可加到手机桌面。";
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    els.installBtn.classList.add("hidden");
    els.installHint.classList.remove("hidden");
    els.installHint.textContent = "安装完成，后续可像普通 APP 一样打开。";
  });

  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    els.installHint.classList.remove("hidden");
    els.installHint.textContent = "要显示安装 APP，需通过 HTTPS 链接访问。";
  }
}

function renderAll() {
  renderSelects();
  renderSummary();
  renderTransactionTable();
  renderAccountList();
  renderCategoryList();
  renderBudgetList();
  renderCharts();
  onTxTypeChange();
}

function renderSelects() {
  const accountOptions = state.accounts
    .map((acc) => `<option value="${acc.id}">${escapeHtml(acc.name)}</option>`)
    .join("");

  els.txAccount.innerHTML = accountOptions;
  els.txToAccount.innerHTML = accountOptions;

  const filterAccountOptions =
    '<option value="all">全部</option>' +
    state.accounts
      .map((acc) => `<option value="${acc.id}">${escapeHtml(acc.name)}</option>`)
      .join("");
  const accountFilterValue = els.filterAccount.value;
  els.filterAccount.innerHTML = filterAccountOptions;
  if ([...els.filterAccount.options].some((o) => o.value === accountFilterValue)) {
    els.filterAccount.value = accountFilterValue;
  }

  const txType = els.txType.value;
  const txCats = state.categories.filter((c) => c.type === (txType === "expense" ? "expense" : "income"));
  els.txCategory.innerHTML = txCats
    .map((cat) => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`)
    .join("");

  const filterCategoryOptions =
    '<option value="all">全部</option>' +
    state.categories
      .map((cat) => `<option value="${cat.id}">${escapeHtml(cat.name)}（${cat.type === "expense" ? "支出" : "收入"}）</option>`)
      .join("");
  const catFilterValue = els.filterCategory.value;
  els.filterCategory.innerHTML = filterCategoryOptions;
  if ([...els.filterCategory.options].some((o) => o.value === catFilterValue)) {
    els.filterCategory.value = catFilterValue;
  }

  els.budgetCategory.innerHTML = state.categories
    .filter((c) => c.type === "expense")
    .map((cat) => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`)
    .join("");
}

function onTxTypeChange() {
  const type = els.txType.value;
  els.toAccountWrap.classList.toggle("hidden", type !== "transfer");
  els.txCategory.disabled = type === "transfer";
  els.txCategory.required = type !== "transfer";
  renderSelects();
}

function renderSummary() {
  const month = today.slice(0, 7);
  const balances = computeBalances();
  const totalAssets = balances.reduce((sum, a) => sum + a.balance, 0);

  const monthIncome = state.transactions
    .filter((t) => t.type === "income" && t.date.startsWith(month))
    .reduce((sum, t) => sum + t.amount, 0);
  const monthExpense = state.transactions
    .filter((t) => t.type === "expense" && t.date.startsWith(month))
    .reduce((sum, t) => sum + t.amount, 0);
  const monthNet = monthIncome - monthExpense;

  const cards = [
    { label: "总资产（按账户结余）", value: totalAssets, cls: "" },
    { label: `${month} 收入`, value: monthIncome, cls: "value-income" },
    { label: `${month} 支出`, value: monthExpense, cls: "value-expense" },
    { label: `${month} 结余`, value: monthNet, cls: monthNet >= 0 ? "value-income" : "value-expense" }
  ];

  els.summaryCards.innerHTML = cards
    .map(
      (c) => `
      <article class="card">
        <div class="label">${c.label}</div>
        <div class="value ${c.cls}">${money(c.value)}</div>
      </article>`
    )
    .join("");
}

function renderTransactionTable() {
  const rows = getFilteredTransactions();
  els.txCount.textContent = `共 ${rows.length} 条`;

  els.txTableBody.innerHTML = rows
    .map((tx) => {
      const account = findAccount(tx.accountId)?.name || "-";
      const toAccount = tx.type === "transfer" ? ` -> ${findAccount(tx.toAccountId)?.name || "?"}` : "";
      const category = tx.type === "transfer" ? "转账" : findCategory(tx.categoryId)?.name || "未分类";
      const tags = tx.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
      const amountClass = tx.type === "income" ? "value-income" : tx.type === "expense" ? "value-expense" : "value-transfer";
      const amountSign = tx.type === "income" ? "+" : tx.type === "expense" ? "-" : "~";

      return `
      <tr>
        <td>${tx.date}</td>
        <td>${typeLabel(tx.type)}</td>
        <td>${escapeHtml(account + toAccount)}</td>
        <td>${escapeHtml(category)}</td>
        <td class="${amountClass}">${amountSign}${money(tx.amount)}</td>
        <td>${tags}</td>
        <td>${escapeHtml(tx.note || "-")}</td>
        <td>
          <button data-action="edit" data-id="${tx.id}" class="ghost">编辑</button>
          <button data-action="delete" data-id="${tx.id}" class="ghost">删除</button>
        </td>
      </tr>`;
    })
    .join("");

  els.txTableBody.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (btn.dataset.action === "edit") {
        startEditTransaction(id);
      } else {
        deleteTransaction(id);
      }
    });
  });
}

function renderAccountList() {
  const balances = computeBalances();
  els.accountList.innerHTML = balances
    .map((acc) => {
      const used = state.transactions.some((t) => t.accountId === acc.id || t.toAccountId === acc.id);
      return `
      <li>
        <div>
          <strong>${escapeHtml(acc.name)}</strong>
          <span class="badge">${accountTypeLabel(acc.type)}</span>
          <div class="label">期初 ${money(acc.openingBalance)} · 当前 ${money(acc.balance)}</div>
        </div>
        <button class="ghost" ${used ? "disabled" : ""} data-delete-account="${acc.id}">删除</button>
      </li>`;
    })
    .join("");

  els.accountList.querySelectorAll("button[data-delete-account]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.deleteAccount;
      state.accounts = state.accounts.filter((a) => a.id !== id);
      persistAndRender();
    });
  });
}

function renderCategoryList() {
  els.categoryList.innerHTML = state.categories
    .map((cat) => {
      const used = state.transactions.some((t) => t.categoryId === cat.id) ||
        state.budgets.some((b) => b.categoryId === cat.id);
      return `
      <li>
        <div>
          <strong>${escapeHtml(cat.name)}</strong>
          <span class="badge">${cat.type === "expense" ? "支出" : "收入"}</span>
        </div>
        <button class="ghost" ${used ? "disabled" : ""} data-delete-category="${cat.id}">删除</button>
      </li>`;
    })
    .join("");

  els.categoryList.querySelectorAll("button[data-delete-category]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.categories = state.categories.filter((c) => c.id !== btn.dataset.deleteCategory);
      persistAndRender();
    });
  });
}

function renderBudgetList() {
  els.budgetList.innerHTML = state.budgets
    .slice()
    .sort((a, b) => (a.month < b.month ? 1 : -1))
    .map((budget) => {
      const spent = state.transactions
        .filter(
          (t) =>
            t.type === "expense" && t.categoryId === budget.categoryId && t.date.startsWith(budget.month)
        )
        .reduce((sum, t) => sum + t.amount, 0);
      const pct = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
      const cls = pct > 100 ? "danger" : pct > 80 ? "warn" : "";
      const catName = findCategory(budget.categoryId)?.name || "已删除分类";

      return `
      <li>
        <div>
          <strong>${budget.month} · ${escapeHtml(catName)}</strong>
          <div class="label ${cls}">${money(spent)} / ${money(budget.amount)} (${pct.toFixed(1)}%)</div>
        </div>
        <button class="ghost" data-delete-budget="${budget.id}">删除</button>
      </li>`;
    })
    .join("");

  els.budgetList.querySelectorAll("button[data-delete-budget]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.budgets = state.budgets.filter((b) => b.id !== btn.dataset.deleteBudget);
      persistAndRender();
    });
  });
}

function renderCharts() {
  drawTrendChart();
  drawCategoryChart();
}

function drawTrendChart() {
  const canvas = els.trendCanvas;
  const ctx = canvas.getContext("2d");
  clearCanvas(ctx, canvas);

  const months = getRecentMonths(6);
  const data = months.map((month) => {
    const income = state.transactions
      .filter((t) => t.type === "income" && t.date.startsWith(month))
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = state.transactions
      .filter((t) => t.type === "expense" && t.date.startsWith(month))
      .reduce((sum, t) => sum + t.amount, 0);
    return { month, income, expense };
  });

  const max = Math.max(1, ...data.flatMap((x) => [x.income, x.expense]));
  const pad = { left: 60, right: 20, top: 20, bottom: 36 };
  const innerW = canvas.width - pad.left - pad.right;
  const innerH = canvas.height - pad.top - pad.bottom;
  const groupW = innerW / data.length;

  ctx.strokeStyle = "#d9d2c7";
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, canvas.height - pad.bottom);
  ctx.lineTo(canvas.width - pad.right, canvas.height - pad.bottom);
  ctx.stroke();

  if (!state.transactions.length) {
    drawEmpty(ctx, canvas, "暂无交易数据");
    return;
  }

  data.forEach((d, i) => {
    const baseX = pad.left + i * groupW;
    const barW = Math.min(24, groupW * 0.28);
    const gap = barW + 6;
    const incomeH = (d.income / max) * innerH;
    const expenseH = (d.expense / max) * innerH;
    const x1 = baseX + groupW / 2 - gap / 2 - barW;
    const x2 = baseX + groupW / 2 + gap / 2;
    const yIncome = canvas.height - pad.bottom - incomeH;
    const yExpense = canvas.height - pad.bottom - expenseH;

    ctx.fillStyle = "#1f9d6a";
    ctx.fillRect(x1, yIncome, barW, incomeH);
    ctx.fillStyle = "#d84141";
    ctx.fillRect(x2, yExpense, barW, expenseH);

    ctx.fillStyle = "#53616a";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(d.month.slice(5), baseX + groupW / 2, canvas.height - 12);
  });

  ctx.textAlign = "left";
  ctx.fillStyle = "#1f9d6a";
  ctx.fillRect(canvas.width - 180, 14, 14, 10);
  ctx.fillStyle = "#2f3b43";
  ctx.fillText("收入", canvas.width - 160, 24);
  ctx.fillStyle = "#d84141";
  ctx.fillRect(canvas.width - 110, 14, 14, 10);
  ctx.fillStyle = "#2f3b43";
  ctx.fillText("支出", canvas.width - 90, 24);
}

function drawCategoryChart() {
  const canvas = els.categoryCanvas;
  const ctx = canvas.getContext("2d");
  clearCanvas(ctx, canvas);

  const month = today.slice(0, 7);
  const sums = new Map();
  state.transactions
    .filter((t) => t.type === "expense" && t.date.startsWith(month))
    .forEach((tx) => sums.set(tx.categoryId, (sums.get(tx.categoryId) || 0) + tx.amount));

  const entries = [...sums.entries()]
    .map(([categoryId, amount]) => ({
      category: findCategory(categoryId)?.name || "未分类",
      amount
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  const total = entries.reduce((s, e) => s + e.amount, 0);
  if (!entries.length || total <= 0) {
    drawEmpty(ctx, canvas, "本月暂无支出数据");
    return;
  }

  const colors = ["#d4612b", "#1f9d6a", "#2573c2", "#d08a00", "#9357c9", "#4f6b7c", "#cd5f91", "#2a8f8f"];
  const pad = { left: 180, top: 20, right: 24, bottom: 26 };
  const barH = 22;
  const gap = 10;
  const usableW = canvas.width - pad.left - pad.right;

  entries.forEach((entry, i) => {
    const y = pad.top + i * (barH + gap);
    const w = (entry.amount / total) * usableW;
    const color = colors[i % colors.length];
    const pct = ((entry.amount / total) * 100).toFixed(1);

    ctx.fillStyle = "#3a4650";
    ctx.textAlign = "right";
    ctx.font = "13px sans-serif";
    ctx.fillText(entry.category, pad.left - 10, y + 16);

    ctx.fillStyle = color;
    ctx.fillRect(pad.left, y, w, barH);

    ctx.fillStyle = "#3a4650";
    ctx.textAlign = "left";
    ctx.fillText(`${money(entry.amount)} (${pct}%)`, pad.left + w + 8, y + 16);
  });
}

function getFilteredTransactions() {
  const start = els.filterStart.value;
  const end = els.filterEnd.value;
  const type = els.filterType.value;
  const accountId = els.filterAccount.value;
  const categoryId = els.filterCategory.value;
  const keyword = els.filterKeyword.value.trim().toLowerCase();

  return state.transactions
    .filter((tx) => {
      if (start && tx.date < start) return false;
      if (end && tx.date > end) return false;
      if (type !== "all" && tx.type !== type) return false;
      if (accountId !== "all" && tx.accountId !== accountId && tx.toAccountId !== accountId) return false;
      if (categoryId !== "all" && tx.categoryId !== categoryId) return false;
      if (keyword) {
        const hay = `${tx.note} ${tx.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(keyword)) return false;
      }
      return true;
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));
}

function startEditTransaction(id) {
  const tx = state.transactions.find((x) => x.id === id);
  if (!tx) return;
  editingTxId = id;
  els.txType.value = tx.type;
  onTxTypeChange();
  els.txAmount.value = String(tx.amount);
  els.txDate.value = tx.date;
  els.txAccount.value = tx.accountId;
  if (tx.type === "transfer") els.txToAccount.value = tx.toAccountId;
  if (tx.type !== "transfer") els.txCategory.value = tx.categoryId;
  els.txTags.value = tx.tags.join(",");
  els.txNote.value = tx.note || "";
  els.txSubmit.textContent = "保存修改";
  els.txCancel.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteTransaction(id) {
  if (!confirm("确定删除这条交易吗？")) return;
  state.transactions = state.transactions.filter((tx) => tx.id !== id);
  if (editingTxId === id) resetTxForm();
  persistAndRender();
}

function resetTxForm() {
  editingTxId = null;
  els.txForm.reset();
  els.txType.value = "expense";
  els.txDate.value = today;
  els.txSubmit.textContent = "新增记录";
  els.txCancel.classList.add("hidden");
  onTxTypeChange();
}

function computeBalances() {
  const map = new Map(state.accounts.map((a) => [a.id, Number(a.openingBalance) || 0]));
  for (const tx of state.transactions) {
    if (tx.type === "income") {
      map.set(tx.accountId, (map.get(tx.accountId) || 0) + tx.amount);
    } else if (tx.type === "expense") {
      map.set(tx.accountId, (map.get(tx.accountId) || 0) - tx.amount);
    } else if (tx.type === "transfer") {
      map.set(tx.accountId, (map.get(tx.accountId) || 0) - tx.amount);
      map.set(tx.toAccountId, (map.get(tx.toAccountId) || 0) + tx.amount);
    }
  }

  return state.accounts.map((a) => ({ ...a, balance: map.get(a.id) || 0 }));
}

function persistAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_DATA);
    return normalizeState(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_DATA);
  }
}

function normalizeState(data) {
  const safe = {
    accounts: Array.isArray(data?.accounts) ? data.accounts : [],
    categories: Array.isArray(data?.categories) ? data.categories : [],
    transactions: Array.isArray(data?.transactions) ? data.transactions : [],
    budgets: Array.isArray(data?.budgets) ? data.budgets : []
  };

  const accounts = safe.accounts
    .map((a) => ({
      id: String(a.id || uid()),
      name: String(a.name || "未命名账户"),
      type: String(a.type || "cash"),
      openingBalance: Number(a.openingBalance) || 0
    }))
    .filter((a) => a.id && a.name);

  const categories = safe.categories
    .map((c) => ({
      id: String(c.id || uid()),
      name: String(c.name || "未分类"),
      type: c.type === "income" ? "income" : "expense"
    }))
    .filter((c) => c.id && c.name);

  const accountSet = new Set(accounts.map((a) => a.id));
  const categorySet = new Set(categories.map((c) => c.id));

  const transactions = safe.transactions
    .map((t) => ({
      id: String(t.id || uid()),
      type: ["income", "expense", "transfer"].includes(t.type) ? t.type : "expense",
      amount: Number(t.amount) || 0,
      date: String(t.date || today),
      accountId: String(t.accountId || ""),
      toAccountId: String(t.toAccountId || ""),
      categoryId: String(t.categoryId || ""),
      tags: Array.isArray(t.tags) ? t.tags.map(String).slice(0, 20) : [],
      note: String(t.note || "")
    }))
    .filter((t) => t.amount > 0 && accountSet.has(t.accountId))
    .filter((t) => t.type === "transfer" ? accountSet.has(t.toAccountId) : true)
    .filter((t) => (t.type === "transfer" ? true : categorySet.has(t.categoryId)));

  const budgets = safe.budgets
    .map((b) => ({
      id: String(b.id || uid()),
      month: String(b.month || today.slice(0, 7)).slice(0, 7),
      categoryId: String(b.categoryId || ""),
      amount: Number(b.amount) || 0
    }))
    .filter((b) => b.amount > 0 && categorySet.has(b.categoryId));

  if (!accounts.length || !categories.length) {
    return structuredClone(DEFAULT_DATA);
  }
  return { accounts, categories, transactions, budgets };
}

function exportCsv() {
  const header = ["id", "date", "type", "account", "toAccount", "category", "amount", "tags", "note"];
  const rows = state.transactions.map((t) => [
    t.id,
    t.date,
    t.type,
    findAccount(t.accountId)?.name || "",
    findAccount(t.toAccountId)?.name || "",
    findCategory(t.categoryId)?.name || "",
    t.amount,
    t.tags.join("|"),
    t.note
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  downloadFile("transactions.csv", "\uFEFF" + csv, "text/csv;charset=utf-8");
}

function csvCell(v) {
  const s = String(v ?? "").replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

function downloadFile(filename, content, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function drawEmpty(ctx, canvas, text) {
  ctx.fillStyle = "#748089";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}

function clearCanvas(ctx, canvas) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function findAccount(id) {
  return state.accounts.find((a) => a.id === id);
}

function findCategory(id) {
  return state.categories.find((c) => c.id === id);
}

function parseTags(raw) {
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function getRecentMonths(count) {
  const arr = [];
  const d = new Date();
  d.setDate(1);
  for (let i = count - 1; i >= 0; i -= 1) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    arr.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return arr;
}

function accountTypeLabel(type) {
  return (
    {
      cash: "现金",
      bank: "银行卡",
      credit: "信用账户",
      wallet: "电子钱包"
    }[type] || "其他"
  );
}

function typeLabel(type) {
  return (
    {
      income: "收入",
      expense: "支出",
      transfer: "转账"
    }[type] || type
  );
}

function money(num) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2
  }).format(Number(num) || 0);
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
