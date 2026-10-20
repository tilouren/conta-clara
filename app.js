(() => {
  "use strict";

  const STORAGE_KEY = "conta-clara.records.v1";
  const WALLETS_KEY = "conta-clara.wallets.v1";
  const POSITIONS_KEY = "conta-clara.positions.v1";
  const THEME_KEY = "conta-clara.theme.v1";
  const BACKUP_NAME = "conta-clara-backup";
  const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
  const MAX_POSITIONS = 10000;
  const VALID_KINDS = ["income", "expense", "credit", "investment"];
  const VALID_ASSET_TYPES = ["ETF", "Cripto", "Ações", "Outro"];
  const SUPPORTED_CRYPTO_SYMBOLS = new Set(["BTC", "ETH", "BNB", "XRP", "SOL", "DOGE", "ADA", "TRX", "AVAX", "LINK"]);
  const STOCK_SYMBOL_PATTERN = /^[A-Z0-9.^=-]{1,16}$/;
  const EXPENSE_SECTIONS = [
    { name: "Casa e serviços", categories: ["Habitação", "Contas da casa", "Serviços domésticos", "Telecomunicações"] },
    { name: "Compras e deslocações", categories: ["Supermercado", "Refeições e entregas", "Transportes", "Levantamentos"] },
    { name: "Saúde e proteção", categories: ["Saúde", "Seguros"] },
    { name: "Subscrições e digital", categories: ["Subscrições", "Serviços digitais"] },
    { name: "Pessoal e outros", categories: ["Lazer", "Educação", "Comissões bancárias", "Outras despesas"] }
  ];
  const ADJUSTABLE_EXPENSE_CATEGORIES = new Set([
    "Contas da casa", "Supermercado", "Refeições e entregas", "Transportes", "Levantamentos",
    "Telecomunicações", "Subscrições", "Serviços digitais", "Comissões bancárias", "Lazer", "Educação", "Outras despesas"
  ]);
  const CATEGORIES = {
    income: ["Salário fixo", "Salário variável", "Trabalho independente", "Prestação social", "Reembolso", "Outro rendimento"],
    expense: ["Habitação", "Contas da casa", "Supermercado", "Refeições e entregas", "Transportes", "Levantamentos", "Saúde", "Seguros", "Serviços domésticos", "Telecomunicações", "Subscrições", "Serviços digitais", "Comissões bancárias", "Lazer", "Educação", "Outras despesas"],
    credit: ["Crédito habitação", "Crédito pessoal", "Cartão de crédito", "Crédito automóvel", "Outro crédito"],
    investment: ["Poupança", "Fundos", "ETF", "Cripto", "Ações", "Planos de reforma", "Outro investimento"]
  };
  const KIND_LABELS = {
    income: "Rendimento",
    expense: "Despesa",
    credit: "Crédito",
    investment: "Investimento"
  };
  const KIND_ICONS = { income: "↗", expense: "↘", credit: "⌁", investment: "◈" };
  const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  const elements = {
    monthPicker: document.querySelector("#month-picker"),
    monthHeading: document.querySelector("#month-heading"),
    monthPill: document.querySelector("#month-pill"),
    balanceTotal: document.querySelector("#balance-total"),
    incomeTotal: document.querySelector("#income-total"),
    expenseTotal: document.querySelector("#expense-total"),
    creditTotal: document.querySelector("#credit-total"),
    investmentTotal: document.querySelector("#investment-total"),
    flowChart: document.querySelector("#flow-chart"),
    categoryBreakdown: document.querySelector("#category-breakdown"),
    showExpenseDetails: document.querySelector("#show-expense-details"),
    expenseDetailsDialog: document.querySelector("#expense-details-dialog"),
    expenseDetailsMonth: document.querySelector("#expense-details-month"),
    expenseDetailsList: document.querySelector("#expense-details-list"),
    analyzeExpenses: document.querySelector("#analyze-expenses"),
    expenseGuidance: document.querySelector("#expense-guidance"),
    movementCount: document.querySelector("#movement-count"),
    movementList: document.querySelector("#movement-list"),
    emptyState: document.querySelector("#empty-state"),
    noResults: document.querySelector("#no-results"),
    movementSearch: document.querySelector("#movement-search"),
    dialog: document.querySelector("#movement-dialog"),
    form: document.querySelector("#movement-form"),
    dialogTitle: document.querySelector("#dialog-title"),
    kindField: document.querySelector("#kind-field"),
    categoryField: document.querySelector("#category-field"),
    categoryLabel: document.querySelector("#category-label"),
    descriptionField: document.querySelector("#description-field"),
    amountField: document.querySelector("#amount-field"),
    dateField: document.querySelector("#date-field"),
    recurringField: document.querySelector("#recurring-field"),
    formError: document.querySelector("#form-error"),
    saveButton: document.querySelector("#save-movement"),
    toast: document.querySelector("#toast"),
    storageWarning: document.querySelector("#storage-warning"),
    backupFile: document.querySelector("#backup-file"),
    walletList: document.querySelector("#wallet-list"),
    positionList: document.querySelector("#position-list"),
    refreshQuotes: document.querySelector("#refresh-quotes"),
    quoteStatus: document.querySelector("#quote-status"),
    portfolioEmpty: document.querySelector("#portfolio-empty"),
    portfolioMarketTotal: document.querySelector("#portfolio-market-total"),
    portfolioCostTotal: document.querySelector("#portfolio-cost-total"),
    portfolioChangeTotal: document.querySelector("#portfolio-change-total"),
    statementFile: document.querySelector("#statement-file"),
    statementImportError: document.querySelector("#statement-import-error"),
    reviewDialog: document.querySelector("#statement-review-dialog"),
    reviewIntro: document.querySelector("#review-intro"),
    reviewNotice: document.querySelector("#review-notice"),
    reviewList: document.querySelector("#review-list"),
    reviewCount: document.querySelector("#review-count"),
    reviewActionStatus: document.querySelector("#review-action-status"),
    toggleAllReviewed: document.querySelector("#toggle-all-reviewed"),
    reviewError: document.querySelector("#review-error"),
    confirmImport: document.querySelector("#confirm-import"),
    progressDialog: document.querySelector("#statement-progress-dialog"),
    progressStatus: document.querySelector("#progress-status"),
    walletDialog: document.querySelector("#wallet-dialog"),
    walletForm: document.querySelector("#wallet-form"),
    walletError: document.querySelector("#wallet-error"),
    positionDialog: document.querySelector("#position-dialog"),
    positionForm: document.querySelector("#position-form"),
    positionError: document.querySelector("#position-error"),
    themeToggle: document.querySelector("#theme-toggle"),
    updateNotice: document.querySelector("#update-notice"),
    offlineStatus: document.querySelector("#offline-status")
  };

  const euro = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
  const dateFormatter = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
  let records = [];
  let wallets = [];
  let positions = [];
  let reviewItems = [];
  let reviewSourceName = "";
  let reviewSkippedCount = 0;
  let editingId = null;
  let editingWalletId = null;
  let editingPositionId = null;
  let storageReady = true;
  let portfolioStorageReady = true;
  let analysisController = null;
  let analysisSequence = 0;
  let theme = "light";
  let toastTimeout = null;
  let quoteRefreshInProgress = false;
  let appVersion = null;
  let availableAppVersion = null;
  let dismissedAppVersion = null;
  let offlineController = "serviceWorker" in navigator ? navigator.serviceWorker.controller : null;

  async function checkForAppUpdate() {
    try {
      const response = await window.fetch("/api/version", {
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`O servidor local respondeu com o estado ${response.status}.`);
      const payload = await response.json();
      if (typeof payload.version !== "string" || !/^[a-f0-9]{16}$/.test(payload.version)) {
        throw new Error("A versão recebida pelo servidor local é inválida.");
      }
      if (appVersion === null) {
        appVersion = payload.version;
        return;
      }
      if (payload.version === appVersion || payload.version === dismissedAppVersion) return;
      availableAppVersion = payload.version;
      elements.updateNotice.hidden = false;
    } catch (error) {
      if (error instanceof TypeError || !navigator.onLine) return;
      if (appVersion === null) return;
      elements.updateNotice.querySelector("span").textContent = `Não foi possível verificar atualizações: ${error.message}`;
      elements.updateNotice.hidden = false;
    }
  }

  function reloadUpdatedApp() {
    const openDialog = document.querySelector("dialog[open]");
    if (openDialog && !window.confirm("A app vai recarregar. As alterações já guardadas mantêm-se, mas os dados ainda não guardados em formulários ou na revisão do extrato serão perdidos. Continuar?")) return;
    window.location.reload();
  }

  function updateOfflineStatus() {
    if (!window.isSecureContext || !("serviceWorker" in navigator)) {
      elements.offlineStatus.textContent = "Para usar sem o computador, esta app tem de ser instalada a partir de um endereço HTTPS seguro.";
    } else if (!navigator.onLine) {
      elements.offlineStatus.textContent = "Sem Internet. A app e os dados guardados estão disponíveis neste dispositivo; as cotações online não.";
    } else if (navigator.serviceWorker.controller) {
      elements.offlineStatus.textContent = "App guardada neste dispositivo para utilização sem ligação. As cotações online requerem Internet.";
    } else {
      elements.offlineStatus.textContent = "A preparar a app para utilização sem ligação neste dispositivo…";
    }
  }

  async function registerOfflineApp() {
    updateOfflineStatus();
    if (!window.isSecureContext || !("serviceWorker" in navigator)) return;
    try {
      await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
      await navigator.serviceWorker.ready;
      updateOfflineStatus();
    } catch (error) {
      elements.offlineStatus.textContent = `Não foi possível preparar a utilização offline: ${error.message}`;
    }
  }

  function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function currentMonthString() {
    return localDateString().slice(0, 7);
  }

  function isValidDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime()) && localDateString(date) === value;
  }

  function isValidMonth(value) {
    return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  }

  function isValidRecord(record) {
    if (!record || typeof record !== "object" || Array.isArray(record)) return false;
    if (typeof record.id !== "string" || record.id.length < 1 || record.id.length > 100) return false;
    if (!VALID_KINDS.includes(record.kind) || !CATEGORIES[record.kind].includes(record.category)) return false;
    if (typeof record.description !== "string" || record.description.trim().length < 1 || record.description.trim().length > 120) return false;
    if (typeof record.amount !== "number" || !Number.isFinite(record.amount) || record.amount <= 0 || record.amount > 999999999) return false;
    if (!isValidDate(record.date) || typeof record.recurring !== "boolean") return false;
    if (record.kind === "expense" || record.kind === "credit") {
      if (record.nature !== "fixed" && record.nature !== "variable") return false;
    } else if (record.nature !== null) {
      return false;
    }
    return true;
  }

  function validateRecords(input) {
    if (!Array.isArray(input) || input.length > 10000) throw new Error("A cópia deve conter uma lista válida com até 10 000 movimentos.");
    const ids = new Set();
    for (const record of input) {
      if (!isValidRecord(record)) throw new Error("A cópia contém um movimento inválido ou incompleto.");
      if (ids.has(record.id)) throw new Error("A cópia contém identificadores de movimentos repetidos.");
      ids.add(record.id);
    }
    return input.map(record => ({
      id: record.id,
      kind: record.kind,
      category: record.category,
      description: record.description.trim(),
      amount: record.amount,
      date: record.date,
      recurring: record.recurring,
      nature: record.nature
    }));
  }

  function validateWallets(input) {
    if (!Array.isArray(input) || input.length > 500) throw new Error("A cópia deve conter até 500 carteiras.");
    const ids = new Set();
    const names = new Set();
    return input.map(wallet => {
      if (!wallet || typeof wallet !== "object" || Array.isArray(wallet)
        || typeof wallet.id !== "string" || wallet.id.length < 1 || wallet.id.length > 100
        || typeof wallet.name !== "string" || !wallet.name.trim() || wallet.name.trim().length > 60
        || typeof wallet.provider !== "string" || wallet.provider.trim().length > 60
        || ids.has(wallet.id)) {
        throw new Error("A cópia contém uma carteira inválida ou duplicada.");
      }
      const normalizedName = wallet.name.trim().toLocaleLowerCase("pt-PT");
      if (names.has(normalizedName)) throw new Error("As carteiras não podem ter nomes repetidos.");
      ids.add(wallet.id);
      names.add(normalizedName);
      return { id: wallet.id, name: wallet.name.trim(), provider: wallet.provider.trim() };
    });
  }

  function validatePositions(input, allowedWallets) {
    if (!Array.isArray(input) || input.length > MAX_POSITIONS) {
      throw new Error(`A cópia deve conter até ${MAX_POSITIONS} posições.`);
    }
    const walletIds = new Set(allowedWallets.map(wallet => wallet.id));
    const ids = new Set();
    for (const position of input) {
      if (!position || typeof position !== "object" || Array.isArray(position)
        || typeof position.id !== "string" || position.id.length < 1 || position.id.length > 100
        || !walletIds.has(position.walletId)
        || typeof position.name !== "string" || !position.name.trim() || position.name.trim().length > 80
        || typeof position.symbol !== "string" || position.symbol.trim().length > 16
        || !VALID_ASSET_TYPES.includes(position.assetType)
        || typeof position.units !== "number" || !Number.isFinite(position.units) || position.units <= 0 || position.units > 999999999
        || typeof position.averagePrice !== "number" || !Number.isFinite(position.averagePrice) || position.averagePrice < 0 || position.averagePrice > 999999999
        || typeof position.currentPrice !== "number" || !Number.isFinite(position.currentPrice) || position.currentPrice < 0 || position.currentPrice > 999999999
        || (position.quoteUpdatedAt !== undefined && position.quoteUpdatedAt !== null
          && (typeof position.quoteUpdatedAt !== "string" || !Number.isFinite(Date.parse(position.quoteUpdatedAt))))
        || position.units * Math.max(position.averagePrice, position.currentPrice) > 999999999999999
        || ids.has(position.id)) {
        throw new Error("A cópia contém uma posição inválida ou sem carteira correspondente.");
      }
      ids.add(position.id);
    }
    return input.map(position => ({
      id: position.id,
      walletId: position.walletId,
      name: position.name.trim(),
      symbol: position.symbol.trim(),
      assetType: position.assetType,
      units: position.units,
      averagePrice: position.averagePrice,
      currentPrice: position.currentPrice,
      ...(position.quoteUpdatedAt ? { quoteUpdatedAt: position.quoteUpdatedAt } : {})
    }));
  }

  function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function persistBundle(entries, errorMessage) {
    const storage = window.localStorage;
    const previous = new Map();
    try {
      for (const key of Object.keys(entries)) previous.set(key, storage.getItem(key));
      for (const [key, value] of Object.entries(entries)) {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, value);
      }
      return true;
    } catch (error) {
      for (const [key, value] of previous) {
        try {
          if (value === null) storage.removeItem(key);
          else storage.setItem(key, value);
        } catch (rollbackError) {
          storageReady = false;
          portfolioStorageReady = false;
          showStorageWarning("O navegador não conseguiu concluir ou anular esta gravação. Não foram importados movimentos; crie uma cópia de segurança dos dados que ainda consiga exportar e liberte espaço no navegador.");
        }
      }
      showToast(errorMessage, true);
      return false;
    }
  }

  function showToast(message, isError = false) {
    window.clearTimeout(toastTimeout);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("error", isError);
    elements.toast.classList.add("visible");
    toastTimeout = window.setTimeout(() => elements.toast.classList.remove("visible"), 3600);
  }

  function showStorageWarning(message) {
    elements.storageWarning.textContent = message;
    elements.storageWarning.hidden = false;
  }

  function saveRecords(nextRecords) {
    if (!storageReady) {
      showToast("Não foi possível guardar. Importe uma cópia de segurança válida para reativar o armazenamento.", true);
      return false;
    }
    if (!persistBundle({ [STORAGE_KEY]: JSON.stringify(nextRecords) }, "Não foi possível guardar os movimentos no armazenamento local.")) return false;
    records = nextRecords;
    return true;
  }

  function loadRecords() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === null) return;
      records = validateRecords(JSON.parse(stored));
    } catch (error) {
      records = [];
      storageReady = false;
      showStorageWarning("Os dados guardados não puderam ser lidos porque estão danificados ou indisponíveis. Importe uma cópia de segurança válida para recuperar o acesso; não serão gravados novos dados até lá.");
    }
  }

  function loadPortfolio() {
    try {
      wallets = validateWallets(JSON.parse(window.localStorage.getItem(WALLETS_KEY) || "[]"));
      positions = validatePositions(JSON.parse(window.localStorage.getItem(POSITIONS_KEY) || "[]"), wallets);
    } catch (error) {
      wallets = [];
      positions = [];
      portfolioStorageReady = false;
      showStorageWarning("As carteiras e posições não puderam ser lidas. Importe uma cópia de segurança válida para recuperar os dados; não serão gravadas novas posições.");
    }
  }

  function saveWallets(nextWallets, nextPositions = positions) {
    if (!portfolioStorageReady) {
      showToast("Não foi possível guardar carteiras ou posições até importar uma cópia válida.", true);
      return false;
    }
    let validatedWallets;
    let validatedPositions;
    try {
      validatedWallets = validateWallets(nextWallets);
      validatedPositions = validatePositions(nextPositions, validatedWallets);
    } catch (error) {
      showToast(error.message, true);
      return false;
    }
    if (!persistBundle({
      [WALLETS_KEY]: JSON.stringify(validatedWallets),
      [POSITIONS_KEY]: JSON.stringify(validatedPositions)
    }, "Não foi possível guardar a carteira no armazenamento local.")) return false;
    wallets = validatedWallets;
    positions = validatedPositions;
    return true;
  }

  function savePositions(nextPositions) {
    if (!portfolioStorageReady) {
      showToast("Não foi possível guardar posições até importar uma cópia válida.", true);
      return false;
    }
    let validatedPositions;
    try {
      validatedPositions = validatePositions(nextPositions, wallets);
    } catch (error) {
      showToast(error.message, true);
      return false;
    }
    if (!persistBundle({ [POSITIONS_KEY]: JSON.stringify(validatedPositions) }, "Não foi possível guardar as posições no armazenamento local.")) return false;
    positions = validatedPositions;
    return true;
  }

  function monthParts(month) {
    const [year, monthNumber] = month.split("-").map(Number);
    return { year, monthNumber, endDay: new Date(year, monthNumber, 0).getDate() };
  }

  function movementsForMonth(month) {
    const { year, monthNumber, endDay } = monthParts(month);
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(endDay).padStart(2, "0")}`;
    return records.flatMap(record => {
      if (record.recurring) {
        if (record.date > monthEnd) return [];
        const day = Math.min(Number(record.date.slice(-2)), endDay);
        return [{ record, occurrenceDate: `${month}-${String(day).padStart(2, "0")}` }];
      }
      if (record.date >= monthStart && record.date <= monthEnd) {
        return [{ record, occurrenceDate: record.date }];
      }
      return [];
    }).sort((a, b) => b.occurrenceDate.localeCompare(a.occurrenceDate) || b.record.description.localeCompare(a.record.description));
  }

  function monthLabel(month) {
    const { year, monthNumber } = monthParts(month);
    return `${MONTHS[monthNumber - 1]} ${year}`;
  }

  function formatDate(value) {
    return dateFormatter.format(new Date(`${value}T12:00:00`));
  }

  function renderSummary(monthMovements) {
    const totals = { income: 0, expense: 0, credit: 0, investment: 0 };
    for (const { record } of monthMovements) totals[record.kind] += record.amount;
    const outflow = totals.expense + totals.credit + totals.investment;
    elements.balanceTotal.textContent = euro.format(totals.income - outflow);
    elements.incomeTotal.textContent = euro.format(totals.income);
    elements.expenseTotal.textContent = euro.format(totals.expense);
    elements.creditTotal.textContent = euro.format(totals.credit);
    elements.investmentTotal.textContent = euro.format(totals.investment);
    elements.monthHeading.textContent = `Aqui está o ponto de situação de ${monthLabel(elements.monthPicker.value)}.`;
    elements.monthPill.textContent = monthLabel(elements.monthPicker.value);

    const maxValue = Math.max(totals.income, outflow, 1);
    const incomeHeight = totals.income ? Math.max(5, Math.round(totals.income / maxValue * 68)) : 3;
    const outflowHeight = outflow ? Math.max(5, Math.round(outflow / maxValue * 68)) : 3;
    elements.flowChart.innerHTML = `
      <div class="flow-column">
        <span class="flow-amount">${euro.format(totals.income)}</span>
        <div class="flow-bar income-bar" style="height:${incomeHeight}px"></div>
        <span class="flow-label">Entradas</span>
      </div>
      <div class="flow-column">
        <span class="flow-amount">${euro.format(outflow)}</span>
        <div class="flow-bar outflow-bar" style="height:${outflowHeight}px"></div>
        <span class="flow-label">Saídas</span>
      </div>`;

  }

  function renderCategoryBreakdown(monthMovements) {
    const categoryTotals = new Map();
    for (const { record } of monthMovements) {
      if (record.kind !== "expense") continue;
      const totals = categoryTotals.get(record.category) || { amount: 0, count: 0 };
      totals.amount = roundMoney(totals.amount + record.amount);
      totals.count += 1;
      categoryTotals.set(record.category, totals);
    }
    const totalExpenses = [...categoryTotals.values()].reduce((sum, totals) => sum + totals.amount, 0);
    if (totalExpenses === 0) {
      elements.categoryBreakdown.innerHTML = '<p class="category-empty">As despesas por tema aparecerão aqui quando registar ou importar movimentos.</p>';
      return;
    }

    elements.categoryBreakdown.innerHTML = EXPENSE_SECTIONS.map(section => {
      const categories = section.categories
        .map(category => [category, categoryTotals.get(category)])
        .filter(([, totals]) => totals)
        .sort((a, b) => b[1].amount - a[1].amount);
      if (categories.length === 0) return "";
      const sectionTotal = categories.reduce((sum, [, totals]) => sum + totals.amount, 0);
      const rows = categories.map(([category, totals]) => {
        const share = Math.round(totals.amount / totalExpenses * 100);
        return `<div class="expense-category">
          <div class="expense-category-heading">
            <span>${escapeHtml(category)}<small>${totals.count} ${totals.count === 1 ? "movimento" : "movimentos"} · ${share}% do total</small></span>
            <strong>${euro.format(totals.amount)}</strong>
          </div>
          <div class="expense-category-track" role="img" aria-label="${escapeHtml(category)}: ${share}% das despesas">
            <span style="width:${Math.max(3, share)}%"></span>
          </div>
        </div>`;
      }).join("");
      return `<section class="expense-section" aria-label="${escapeHtml(section.name)}">
        <div class="expense-section-heading"><h3>${escapeHtml(section.name)}</h3><strong>${euro.format(sectionTotal)}</strong></div>
        <div class="expense-section-categories">${rows}</div>
      </section>`;
    }).join("");
  }

  function renderExpenseDetails(monthMovements) {
    elements.expenseDetailsMonth.textContent = monthLabel(elements.monthPicker.value);
    const expenses = monthMovements.filter(({ record }) => record.kind === "expense");
    if (expenses.length === 0) {
      elements.expenseDetailsList.innerHTML = '<p class="category-empty">Ainda não há despesas registadas neste mês.</p>';
      return;
    }

    const topics = EXPENSE_SECTIONS.map(section => {
      const categories = section.categories.map(category => ({
        category,
        movements: expenses.filter(({ record }) => record.category === category)
      })).filter(group => group.movements.length > 0);
      if (categories.length === 0) return "";

      const sectionTotal = categories.reduce((sum, group) => sum + group.movements.reduce((categorySum, { record }) => categorySum + record.amount, 0), 0);
      const sectionCount = categories.reduce((sum, group) => sum + group.movements.length, 0);
      const categoryContent = categories.map(group => {
        const categoryTotal = group.movements.reduce((sum, { record }) => sum + record.amount, 0);
        const movementRows = group.movements.map(({ record, occurrenceDate }) => `<li class="expense-detail-row">
          <div class="expense-detail-information">
            <strong>${escapeHtml(record.description)}</strong>
            <span>${formatDate(occurrenceDate)} · ${record.recurring ? "Recorrente" : record.nature === "fixed" ? "Fixa" : "Variável"}</span>
          </div>
          <strong class="expense-detail-amount">${euro.format(record.amount)}</strong>
          <button class="button button-secondary expense-edit-button" type="button" data-expense-edit="${escapeHtml(record.id)}">Editar</button>
        </li>`).join("");
        return `<section class="expense-detail-category">
          <div class="expense-detail-category-heading"><h4>${escapeHtml(group.category)}</h4><strong>${euro.format(categoryTotal)}</strong></div>
          <ul class="expense-detail-movements">${movementRows}</ul>
        </section>`;
      }).join("");

      return `<details class="expense-topic">
        <summary>
          <span class="expense-topic-name">${escapeHtml(section.name)}<small>${sectionCount} ${sectionCount === 1 ? "despesa" : "despesas"}</small></span>
          <strong>${euro.format(sectionTotal)}</strong>
        </summary>
        <div class="expense-topic-content">${categoryContent}</div>
      </details>`;
    }).filter(Boolean);

    elements.expenseDetailsList.innerHTML = topics.join("");
  }

  function monthAtOffset(month, offset) {
    const { year, monthNumber } = monthParts(month);
    const date = new Date(year, monthNumber - 1 + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function renderExpenseGuidance() {
    if (elements.expenseGuidance.hidden) return;
    const selectedMonth = elements.monthPicker.value;
    const months = Array.from({ length: 6 }, (_, index) => monthAtOffset(selectedMonth, index - 5));
    const history = months.map(month => ({
      month,
      expenses: movementsForMonth(month).filter(({ record }) => record.kind === "expense")
    }));
    const recent = history.slice(-3);
    const previous = history.slice(0, 3);
    const total = period => period.reduce((sum, month) => sum + month.expenses.reduce((monthSum, { record }) => monthSum + record.amount, 0), 0);
    const previousTotal = total(previous);
    const recentTotal = total(recent);
    const allExpenses = history.flatMap(month => month.expenses);
    if (allExpenses.length === 0) {
      elements.expenseGuidance.innerHTML = '<p class="guidance-empty">Ainda não há despesas nos últimos seis meses para analisar. Registe ou importe movimentos e volte a analisar; não são usados dados de demonstração.</p>';
      return;
    }

    const adjustableByCategory = new Map();
    for (const { expenses } of recent) {
      for (const { record } of expenses) {
        if (!ADJUSTABLE_EXPENSE_CATEGORIES.has(record.category)) continue;
        adjustableByCategory.set(record.category, (adjustableByCategory.get(record.category) || 0) + record.amount);
      }
    }
    const topAdjustable = [...adjustableByCategory.entries()].sort((a, b) => b[1] - a[1])[0];
    const advice = [];
    if (topAdjustable) {
      const [category, amount] = topAdjustable;
      const monthlyAverage = amount / recent.length;
      const potentialSaving = roundMoney(monthlyAverage * 0.1);
      const tips = {
        "Supermercado": "Planear as compras e comparar preços pode ajudar a reduzir compras por impulso.",
        "Refeições e entregas": "Comparar o custo das entregas com refeições planeadas pode revelar margem para poupar.",
        "Transportes": "Rever passes, trajetos e deslocações pode ajudar a baixar esta despesa.",
        "Levantamentos": "Registar para que servem os levantamentos ajuda a identificar despesas em dinheiro que podem passar despercebidas.",
        "Subscrições": "Confirme se continua a utilizar cada serviço e se há um plano mais económico.",
        "Serviços digitais": "Reveja serviços digitais e renovações que já não utiliza.",
        "Telecomunicações": "Compare o tarifário atual com alternativas adequadas às suas necessidades.",
        "Contas da casa": "Rever consumos e tarifários pode ajudar a reduzir contas da casa.",
        "Lazer": "Definir um limite mensal para lazer permite reduzir excessos sem eliminar a categoria."
      };
      const savingText = potentialSaving > 0
        ? ` Reduzir esta categoria em 10% representaria cerca de ${euro.format(potentialSaving)} por mês, como cenário indicativo.`
        : "";
      advice.push(`<article class="guidance-card"><h4>Despesa a rever: ${escapeHtml(category)}</h4><p>Média de ${euro.format(monthlyAverage)} por mês nos três meses mais recentes.${escapeHtml(tips[category] || "Verifique se há despesas que possa ajustar sem comprometer as necessidades essenciais.")}${escapeHtml(savingText)}</p></article>`);
    } else {
      advice.push('<article class="guidance-card"><h4>Reveja despesas recorrentes</h4><p>Não há despesas variáveis registadas no período recente. Confirme se as despesas fixas e as subscrições continuam adequadas às suas necessidades.</p></article>');
    }

    const subscriptionTotal = recent.reduce((sum, month) => sum + month.expenses.reduce((monthSum, { record }) => (
      ["Subscrições", "Serviços digitais"].includes(record.category) ? monthSum + record.amount : monthSum
    ), 0), 0);
    if (subscriptionTotal > 0) {
      advice.push(`<article class="guidance-card"><h4>Subscrições e serviços digitais</h4><p>Média de ${euro.format(subscriptionTotal / recent.length)} por mês nos três meses mais recentes. Reveja serviços duplicados, renovações e utilização.</p></article>`);
    }

    if (previousTotal > 0) {
      const difference = roundMoney(recentTotal - previousTotal);
      if (difference > 0) {
        const percentage = Math.round(difference / previousTotal * 100);
        advice.push(`<article class="guidance-card"><h4>Acompanhe a evolução das despesas</h4><p>As despesas dos três meses mais recentes aumentaram ${euro.format(difference)} (${percentage}%) face aos três meses anteriores. Reveja as categorias que mais contribuíram para a diferença.</p></article>`);
      } else if (difference < 0) {
        advice.push(`<article class="guidance-card"><h4>Compare os períodos</h4><p>As despesas dos três meses mais recentes diminuíram ${euro.format(Math.abs(difference))} face aos três meses anteriores. Continue a acompanhar as categorias principais.</p></article>`);
      } else {
        advice.push('<article class="guidance-card"><h4>Despesas estáveis</h4><p>As despesas totais mantiveram-se nos dois períodos comparados. Continue a acompanhar as categorias principais.</p></article>');
      }
    } else {
      advice.push('<article class="guidance-card"><h4>Construa histórico</h4><p>Ainda não há três meses anteriores com despesas para comparar. Mais registos permitem identificar tendências com maior contexto.</p></article>');
    }

    elements.expenseGuidance.innerHTML = `<p class="guidance-range">Análise dos seis meses até ${escapeHtml(monthLabel(selectedMonth))}. Orientações informativas calculadas apenas com os seus registos locais; não são aconselhamento financeiro.</p><div class="guidance-cards">${advice.join("")}</div>`;
  }

  function renderMovements(monthMovements) {
    const query = elements.movementSearch.value.trim().toLocaleLowerCase("pt-PT");
    const filtered = monthMovements.filter(({ record }) => !query
      || record.description.toLocaleLowerCase("pt-PT").includes(query)
      || record.category.toLocaleLowerCase("pt-PT").includes(query));
    elements.movementCount.textContent = `${monthMovements.length} ${monthMovements.length === 1 ? "movimento neste mês" : "movimentos neste mês"}`;
    elements.emptyState.hidden = monthMovements.length > 0;
    elements.noResults.hidden = monthMovements.length === 0 || filtered.length > 0;
    elements.movementList.innerHTML = filtered.map(({ record, occurrenceDate }) => {
      const isIncome = record.kind === "income";
      const kindClass = record.kind === "expense" ? "expense-tag" : record.kind === "credit" ? "credit-tag" : record.kind === "investment" ? "investment-tag" : "";
      const symbolClass = record.kind === "income" ? "" : record.kind;
      const typeText = record.kind === "expense" || record.kind === "credit"
        ? (record.nature === "fixed" ? "Fixa" : "Variável")
        : (record.recurring ? "Mensal" : "Pontual");
      const amountLabel = `${isIncome ? "+" : "−"} ${euro.format(record.amount)}`;
      return `<tr>
        <td data-label="Movimento"><div class="movement-name">
          <span class="movement-symbol ${symbolClass}" aria-hidden="true">${KIND_ICONS[record.kind]}</span>
          <span><span class="movement-title" title="${escapeHtml(record.description)}">${escapeHtml(record.description)}</span>
          <span class="movement-subtitle">${record.recurring ? "Movimento recorrente" : escapeHtml(KIND_LABELS[record.kind])}</span></span>
        </div></td>
        <td data-label="Categoria">${escapeHtml(record.category)}</td>
        <td data-label="Data">${formatDate(occurrenceDate)}</td>
        <td data-label="Tipo"><span class="type-label">${typeText}</span></td>
        <td data-label="Montante" class="movement-amount ${isIncome ? "" : "outflow"}">${amountLabel}</td>
        <td data-label="Ações"><div class="row-actions">
          <button class="row-action" type="button" data-edit="${escapeHtml(record.id)}" aria-label="Editar ${escapeHtml(record.description)}" title="Editar">✎</button>
          <button class="row-action delete" type="button" data-delete="${escapeHtml(record.id)}" aria-label="Apagar ${escapeHtml(record.description)}" title="Apagar">×</button>
        </div></td>
      </tr>`;
    }).join("");
    elements.movementList.hidden = filtered.length === 0;
  }

  function portfolioPositionValue(position) {
    return position.units * position.currentPrice;
  }

  function portfolioPositionCost(position) {
    return position.units * position.averagePrice;
  }

  function walletForPosition(walletId) {
    return wallets.find(wallet => wallet.id === walletId);
  }

  function renderPortfolio() {
    const marketValue = roundMoney(positions.reduce((sum, position) => sum + portfolioPositionValue(position), 0));
    const investedCost = roundMoney(positions.reduce((sum, position) => sum + portfolioPositionCost(position), 0));
    const change = roundMoney(marketValue - investedCost);
    elements.portfolioMarketTotal.textContent = euro.format(marketValue);
    elements.portfolioCostTotal.textContent = euro.format(investedCost);
    elements.portfolioChangeTotal.textContent = euro.format(change);
    elements.portfolioChangeTotal.classList.toggle("negative", change < 0);
    elements.portfolioChangeTotal.classList.toggle("positive", change > 0);

    const walletMarketTotals = new Map(wallets.map(wallet => [wallet.id, 0]));
    for (const position of positions) {
      walletMarketTotals.set(position.walletId, (walletMarketTotals.get(position.walletId) || 0) + portfolioPositionValue(position));
    }
    elements.walletList.innerHTML = wallets.map(wallet => {
      const walletPositions = positions.filter(position => position.walletId === wallet.id);
      return `<article class="wallet-card" data-wallet-card="${escapeHtml(wallet.id)}">
        <div class="wallet-heading">
          <span class="wallet-icon" aria-hidden="true">◈</span>
          <div class="wallet-title"><strong>${escapeHtml(wallet.name)}</strong><span>${escapeHtml(wallet.provider || "Carteira manual")}</span></div>
          <span class="wallet-total">${euro.format(roundMoney(walletMarketTotals.get(wallet.id) || 0))}</span>
        </div>
        <div class="wallet-card-footer">
          <span>${walletPositions.length} ${walletPositions.length === 1 ? "posição" : "posições"}</span>
          <div class="wallet-actions">
            <button class="text-button" type="button" data-add-position="${escapeHtml(wallet.id)}">+ Adicionar posição</button>
            <button class="row-action" type="button" data-edit-wallet="${escapeHtml(wallet.id)}" aria-label="Editar carteira ${escapeHtml(wallet.name)}" title="Editar carteira">✎</button>
            <button class="row-action delete" type="button" data-delete-wallet="${escapeHtml(wallet.id)}" aria-label="Apagar carteira ${escapeHtml(wallet.name)}" title="Apagar carteira">×</button>
          </div>
        </div>
      </article>`;
    }).join("");

    elements.portfolioEmpty.hidden = positions.length > 0;
    const emptyHeading = elements.portfolioEmpty.querySelector("strong");
    const emptyText = elements.portfolioEmpty.querySelector("p");
    const emptyButton = elements.portfolioEmpty.querySelector("button");
    if (wallets.length > 0) {
      emptyHeading.textContent = "Ainda não há posições nesta carteira";
      emptyText.textContent = "Adicione os ativos que quer acompanhar. Pode rever as unidades e atualizar as cotações suportadas quando quiser.";
      emptyButton.textContent = "Adicionar posição";
    } else {
      emptyHeading.textContent = "As suas posições começam aqui";
      emptyText.textContent = "Crie uma carteira e registe os símbolos dos seus ativos. Pode atualizar as cotações suportadas quando quiser.";
      emptyButton.textContent = "Criar carteira";
    }

    elements.positionList.innerHTML = positions.map(position => {
      const wallet = walletForPosition(position.walletId);
      const currentValue = roundMoney(portfolioPositionValue(position));
      const positionChange = roundMoney(currentValue - portfolioPositionCost(position));
      return `<tr>
        <td data-label="Ativo"><span class="position-name">${escapeHtml(position.name)}</span>${position.symbol ? `<span class="position-symbol">${escapeHtml(position.symbol)}</span>` : ""}</td>
        <td data-label="Tipo">${escapeHtml(position.assetType)}</td>
        <td data-label="Carteira">${escapeHtml(wallet ? wallet.name : "Carteira indisponível")}</td>
        <td data-label="Unidades" class="portfolio-number">${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 8 }).format(position.units)}</td>
        <td data-label="Cotação atual" class="portfolio-number">${euro.format(position.currentPrice)}${position.quoteUpdatedAt ? `<small class="quote-updated-at">Online · ${escapeHtml(quoteTimestampLabel(position.quoteUpdatedAt))}</small>` : ""}</td>
        <td data-label="Valor atual" class="portfolio-number"><strong>${euro.format(currentValue)}</strong></td>
        <td data-label="Variação" class="portfolio-number ${positionChange < 0 ? "negative" : "positive"}">${positionChange > 0 ? "+" : ""}${euro.format(positionChange)}</td>
        <td data-label="Ações"><div class="row-actions">
          <button class="row-action" type="button" data-edit-position="${escapeHtml(position.id)}" aria-label="Editar posição ${escapeHtml(position.name)}" title="Editar cotação ou posição">✎</button>
          <button class="row-action delete" type="button" data-delete-position="${escapeHtml(position.id)}" aria-label="Apagar posição ${escapeHtml(position.name)}" title="Apagar posição">×</button>
        </div></td>
      </tr>`;
    }).join("");
    elements.positionList.hidden = positions.length === 0;
    elements.refreshQuotes.disabled = quoteRefreshInProgress || !positions.some(isOnlineQuoteSupported);
  }

  function isOnlineQuoteSupported(position) {
    const symbol = position.symbol.trim().toLocaleUpperCase("pt-PT");
    return ((position.assetType === "Ações" || position.assetType === "ETF") && STOCK_SYMBOL_PATTERN.test(symbol))
      || (position.assetType === "Cripto" && SUPPORTED_CRYPTO_SYMBOLS.has(symbol));
  }

  function quoteTimestampLabel(value) {
    return new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  }

  async function refreshPortfolioQuotes() {
    if (quoteRefreshInProgress) return;
    const stockSymbols = [...new Set(positions
      .filter(position => position.assetType === "Ações" || position.assetType === "ETF")
      .map(position => position.symbol.trim().toLocaleUpperCase("pt-PT"))
      .filter(symbol => STOCK_SYMBOL_PATTERN.test(symbol)))];
    const cryptoSymbols = [...new Set(positions
      .filter(position => position.assetType === "Cripto")
      .map(position => position.symbol.trim().toLocaleUpperCase("pt-PT"))
      .filter(symbol => SUPPORTED_CRYPTO_SYMBOLS.has(symbol)))];
    if (stockSymbols.length === 0 && cryptoSymbols.length === 0) {
      elements.quoteStatus.textContent = "Adicione uma ação ou ETF com símbolo, ou uma criptomoeda suportada, para atualizar cotações.";
      return;
    }

    quoteRefreshInProgress = true;
    elements.refreshQuotes.disabled = true;
    elements.quoteStatus.textContent = "A consultar as cotações públicas. Nenhum valor da carteira é enviado.";
    try {
      const params = new URLSearchParams();
      if (stockSymbols.length) params.set("stocks", stockSymbols.join(","));
      if (cryptoSymbols.length) params.set("crypto", cryptoSymbols.join(","));
      const response = await window.fetch(`/api/quotes?${params}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!response.ok) {
        const message = response.status === 404
          ? "Este alojamento HTTPS serve a app offline, mas não tem o serviço de cotações ativo. Ligue ao servidor local para atualizar cotações."
          : `O serviço de cotações respondeu com o estado ${response.status}.`;
        throw new Error(message);
      }
      const payload = await response.json();

      const quotes = new Map();
      const quoteErrors = [];
      for (const [market, marketQuotes] of [["stocks", payload.stocks || []], ["crypto", payload.cryptos || []]]) {
        for (const quote of marketQuotes) {
          if (quote.error) quoteErrors.push(`${quote.symbol}: ${quote.error}`);
          else if (typeof quote.symbol === "string" && Number.isFinite(quote.priceEur) && quote.priceEur > 0
            && typeof quote.updatedAt === "string" && Number.isFinite(Date.parse(quote.updatedAt))) {
            quotes.set(`${market}:${quote.symbol.toLocaleUpperCase("pt-PT")}`, quote);
          } else {
            quoteErrors.push(`${quote.symbol || "Ativo"}: resposta de cotação inválida.`);
          }
        }
      }

      let updatedCount = 0;
      const nextPositions = positions.map(position => {
        const symbol = position.symbol.trim().toLocaleUpperCase("pt-PT");
        const market = position.assetType === "Cripto" ? "crypto" : "stocks";
        const quote = quotes.get(`${market}:${symbol}`);
        if (!isOnlineQuoteSupported(position) || !quote) return position;
        updatedCount += 1;
        return {
          ...position,
          currentPrice: Math.round(quote.priceEur * 100000000) / 100000000,
          quoteUpdatedAt: quote.updatedAt
        };
      });
      if (updatedCount > 0 && !savePositions(nextPositions)) {
        elements.quoteStatus.textContent = "As cotações foram recebidas, mas não foi possível guardá-las neste navegador.";
        return;
      }
      if (updatedCount > 0) render();

      const unsupportedCount = positions.filter(position => !isOnlineQuoteSupported(position)).length;
      const notices = [];
      if (quoteErrors.length) notices.push(quoteErrors.join(" "));
      if (unsupportedCount) notices.push(`${unsupportedCount} ${unsupportedCount === 1 ? "posição não tem" : "posições não têm"} um símbolo suportado.`);
      if (updatedCount === 0) {
        elements.quoteStatus.textContent = `Não foi atualizada nenhuma cotação. ${notices.join(" ")}`.trim();
        showToast("Não foi possível atualizar as cotações. Consulte a mensagem junto da carteira.", true);
      } else {
        const quoteDates = [...quotes.values()].map(quote => quote.updatedAt);
        const latestQuoteDate = quoteDates.reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest);
        elements.quoteStatus.textContent = `${updatedCount} ${updatedCount === 1 ? "cotação atualizada" : "cotações atualizadas"}. Última atualização de mercado: ${quoteTimestampLabel(latestQuoteDate)}.${notices.length ? ` ${notices.join(" ")}` : ""}`;
        if (quoteErrors.length) showToast(`${updatedCount} cotações atualizadas; algumas não puderam ser obtidas.`, true);
        else showToast(`${updatedCount} ${updatedCount === 1 ? "cotação atualizada" : "cotações atualizadas"}.`);
      }
    } catch (error) {
      elements.quoteStatus.textContent = `Não foi possível atualizar cotações: ${error.message}`;
      showToast("Não foi possível atualizar as cotações. Verifique a ligação à Internet e tente novamente.", true);
    } finally {
      quoteRefreshInProgress = false;
      elements.refreshQuotes.disabled = !positions.some(isOnlineQuoteSupported);
    }
  }

  function render() {
    const monthMovements = movementsForMonth(elements.monthPicker.value);
    renderSummary(monthMovements);
    renderCategoryBreakdown(monthMovements);
    if (elements.expenseDetailsDialog.open) renderExpenseDetails(monthMovements);
    renderMovements(monthMovements);
    renderPortfolio();
    if (!elements.expenseGuidance.hidden) renderExpenseGuidance();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function applyTheme(nextTheme) {
    theme = nextTheme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#151a18" : "#f5f7f4";
    elements.themeToggle.setAttribute("aria-label", `Mudar para modo ${theme === "light" ? "escuro" : "claro"}`);
    elements.themeToggle.querySelector(".theme-icon").textContent = theme === "light" ? "☾" : "☀";
    elements.themeToggle.querySelector(".theme-label").textContent = theme === "light" ? "Modo escuro" : "Modo claro";
    elements.themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  }

  function loadTheme() {
    try {
      const stored = window.localStorage.getItem(THEME_KEY);
      applyTheme(stored === "dark" ? "dark" : "light");
    } catch (error) {
      applyTheme("light");
    }
  }

  function openWalletForm(wallet = null) {
    editingWalletId = wallet ? wallet.id : null;
    elements.walletForm.reset();
    elements.walletError.hidden = true;
    elements.walletForm.elements.name.value = wallet ? wallet.name : "";
    elements.walletForm.elements.provider.value = wallet ? wallet.provider : "";
    document.querySelector("#wallet-dialog-title").textContent = wallet ? "Editar carteira" : "Nova carteira";
    document.querySelector("#save-wallet").textContent = wallet ? "Guardar alterações" : "Guardar carteira";
    elements.walletDialog.showModal();
    elements.walletForm.elements.name.focus();
  }

  function openPositionForm(position = null, walletId = "") {
    if (wallets.length === 0) {
      showToast("Crie primeiro uma carteira para associar esta posição.", true);
      openWalletForm();
      return;
    }
    editingPositionId = position ? position.id : null;
    elements.positionForm.reset();
    elements.positionError.hidden = true;
    const walletSelect = elements.positionForm.elements.walletId;
    walletSelect.replaceChildren(...wallets.map(wallet => {
      const option = document.createElement("option");
      option.value = wallet.id;
      option.textContent = wallet.name;
      return option;
    }));
    document.querySelector("#position-dialog-title").textContent = position ? "Editar posição" : "Nova posição";
    document.querySelector("#save-position").textContent = position ? "Guardar alterações" : "Guardar posição";
    if (position) {
      walletSelect.value = position.walletId;
      elements.positionForm.elements.assetType.value = position.assetType;
      elements.positionForm.elements.symbol.value = position.symbol;
      elements.positionForm.elements.name.value = position.name;
      elements.positionForm.elements.units.value = String(position.units);
      elements.positionForm.elements.averagePrice.value = String(position.averagePrice);
      elements.positionForm.elements.currentPrice.value = String(position.currentPrice);
    } else {
      walletSelect.value = wallets.find(wallet => wallet.id === walletId)?.id || wallets[0].id;
    }
    elements.positionDialog.showModal();
    elements.positionForm.elements.name.focus();
  }

  function assetValueFromInput(input) {
    const value = input.valueAsNumber;
    return Number.isFinite(value) ? value : null;
  }

  function saveThemePreference(nextTheme) {
    if (!persistBundle({ [THEME_KEY]: nextTheme }, "Não foi possível guardar a preferência de tema neste navegador.")) return;
    applyTheme(nextTheme);
  }

  function reviewSignature(item) {
    return `${item.date}|${item.amount.toFixed(2)}|${ContaClaraStatementParser.normalize(item.description)}`;
  }

  function updateReviewDuplicates(deselectDuplicates = false) {
    const seen = new Set(records.map(record => reviewSignature(record)));
    for (const item of reviewItems) {
      const signature = reviewSignature(item);
      item.duplicate = seen.has(signature);
      if (item.duplicate && deselectDuplicates) item.selected = false;
      seen.add(signature);
    }
  }

  function makeCategoryOptions(kind, selectedCategory) {
    return CATEGORIES[kind].map(category => `<option value="${escapeHtml(category)}"${category === selectedCategory ? " selected" : ""}>${escapeHtml(category)}</option>`).join("");
  }

  function updateReviewSummary() {
    const selected = reviewItems.filter(item => item.selected).length;
    const duplicateCount = reviewItems.filter(item => item.duplicate).length;
    const selectedDuplicateCount = reviewItems.filter(item => item.duplicate && item.selected).length;
    elements.reviewCount.textContent = `${selected} de ${reviewItems.length} selecionados · ${duplicateCount} possíveis duplicados identificados.`;
    elements.confirmImport.textContent = `Confirmar e importar ${selected} ${selected === 1 ? "movimento" : "movimentos"}`;
    elements.confirmImport.disabled = selected === 0;
    const allSelected = reviewItems.length > 0 && selected === reviewItems.length;
    elements.toggleAllReviewed.textContent = allSelected ? "Desselecionar todos" : "Selecionar todos";
    elements.toggleAllReviewed.setAttribute("aria-pressed", String(allSelected));
    elements.toggleAllReviewed.disabled = reviewItems.length === 0;
    elements.reviewNotice.textContent = [
      reviewSkippedCount ? `${reviewSkippedCount} linhas sem movimento reconhecível foram ignoradas.` : "",
      selectedDuplicateCount
        ? `${selectedDuplicateCount} ${selectedDuplicateCount === 1 ? "possível duplicado selecionado" : "possíveis duplicados selecionados"}; confirme que os quer importar.`
        : duplicateCount ? "Os possíveis duplicados ficam desmarcados por precaução. Pode selecioná-los individualmente ou usar «Selecionar todos» após confirmar." : "Confirme manualmente as descrições, os montantes e as categorias.",
      "Nenhum movimento foi guardado ainda."
    ].filter(Boolean).join(" ");
  }

  function renderStatementReview() {
    const kindLabels = { income: "Rendimento", expense: "Despesa", credit: "Crédito", investment: "Investimento" };
    elements.reviewList.innerHTML = reviewItems.map(item => {
      const typeOptions = VALID_KINDS.map(kind => `<option value="${kind}"${item.kind === kind ? " selected" : ""}>${kindLabels[kind]}</option>`).join("");
      const duplicateText = `<span class="review-flag duplicate"${item.duplicate ? "" : " hidden"}>Possível duplicado</span>`;
      const confidenceClass = item.confidence === "low" ? "uncertain" : "confident";
      const confidenceText = item.confidence === "low" ? "Rever categoria" : "Correspondência provável";
      return `<tr class="review-row ${item.duplicate ? "is-duplicate" : ""}" data-review-row="${escapeHtml(item.id)}">
        <td data-label="Importar"><input class="review-checkbox" type="checkbox" data-review="selected" aria-label="Importar ${escapeHtml(item.description)}" ${item.selected ? "checked" : ""}></td>
        <td data-label="Data"><input class="review-input review-date" data-review="date" type="date" value="${escapeHtml(item.date)}" required aria-label="Data de ${escapeHtml(item.description)}"></td>
        <td data-label="Descrição"><input class="review-input review-description" data-review="description" type="text" maxlength="120" value="${escapeHtml(item.description)}" required aria-label="Descrição de ${escapeHtml(item.description)}"></td>
        <td data-label="Tipo e categoria"><div class="review-selects"><select class="review-input review-kind" data-review="kind" aria-label="Tipo de ${escapeHtml(item.description)}">${typeOptions}</select><select class="review-input review-category" data-review="category" aria-label="Categoria de ${escapeHtml(item.description)}">${makeCategoryOptions(item.kind, item.category)}</select></div></td>
        <td data-label="Montante (€)"><input class="review-input review-amount" data-review="amount" type="number" min="0.01" max="999999999" step="0.01" inputmode="decimal" value="${item.amount.toFixed(2)}" required aria-label="Montante de ${escapeHtml(item.description)}"></td>
        <td data-label="Análise"><span class="review-flag ${confidenceClass}">${confidenceText}</span>${duplicateText}</td>
      </tr>`;
    }).join("");
    updateReviewSummary();
  }

  function updateMatchingReviewCategories(item) {
    const normalizedDescription = ContaClaraStatementParser.normalize(item.description);
    const matchingItems = [];
    for (const candidate of reviewItems) {
      if (candidate === item || candidate.kind !== item.kind
        || ContaClaraStatementParser.normalize(candidate.description) !== normalizedDescription
        || candidate.category === item.category) continue;
      candidate.category = item.category;
      matchingItems.push(candidate);
    }
    return matchingItems;
  }

  function changeReviewKind(row, item, kind) {
    item.kind = kind;
    item.category = CATEGORIES[kind][0];
    item.nature = kind === "expense" || kind === "credit" ? "variable" : null;
    row.querySelector('[data-review="category"]').innerHTML = makeCategoryOptions(kind, item.category);
    row.dataset.kind = kind;
  }

  function refreshReviewRow(row, item) {
    row.classList.toggle("is-duplicate", item.duplicate);
    const duplicateFlag = row.querySelector(".review-flag.duplicate");
    if (duplicateFlag) duplicateFlag.hidden = !item.duplicate;
    updateReviewSummary();
  }

  function showStatementReview(fileName, parsed) {
    reviewSourceName = fileName;
    reviewSkippedCount = parsed.skipped;
    reviewItems = parsed.transactions;
    updateReviewDuplicates(true);
    elements.reviewIntro.textContent = `${reviewItems.length} ${reviewItems.length === 1 ? "movimento encontrado" : "movimentos encontrados"} no ficheiro "${fileName}" (${parsed.format}). Reverifique as sugestões.`;
    elements.reviewError.hidden = true;
    elements.reviewActionStatus.textContent = "";
    renderStatementReview();
    elements.reviewDialog.showModal();
    document.querySelector("#cancel-review").focus();
  }

  async function analyseStatement(file) {
    analysisSequence += 1;
    const sequence = analysisSequence;
    analysisController = new AbortController();
    elements.statementImportError.hidden = true;
    elements.progressDialog.showModal();
    elements.progressStatus.textContent = "O ficheiro permanece neste dispositivo. A análise não envia dados para qualquer serviço.";
    document.querySelector("#cancel-analysis").disabled = false;
    try {
      const parsed = await ContaClaraStatementParser.parseStatementFile(file, null, {
        signal: analysisController.signal,
        onProgress: (page, total) => {
          elements.progressStatus.textContent = `A ler a página ${page} de ${total} do PDF, localmente…`;
        }
      });
      if (sequence !== analysisSequence || analysisController.signal.aborted) return;
      if (elements.progressDialog.open) elements.progressDialog.close();
      showStatementReview(file.name, parsed);
    } catch (error) {
      if (elements.progressDialog.open) elements.progressDialog.close();
      if (sequence !== analysisSequence) return;
      if (analysisController.signal.aborted) {
        showToast("Análise cancelada. Nenhum movimento foi guardado.");
      } else {
        elements.statementImportError.textContent = error.message || "Não foi possível analisar este extrato. Escolha outro ficheiro ou registe os movimentos manualmente.";
        elements.statementImportError.hidden = false;
        elements.statementImportError.focus();
      }
    } finally {
      if (sequence === analysisSequence) analysisController = null;
    }
  }

  function cancelStatementAnalysis() {
    if (analysisController) {
      analysisSequence += 1;
      analysisController.abort();
      analysisController = null;
    }
    if (elements.progressDialog.open) elements.progressDialog.close();
    showToast("Análise cancelada. Nenhum movimento foi guardado.");
  }

  function confirmStatementImport() {
    elements.reviewError.hidden = true;
    if (!storageReady) {
      elements.reviewError.textContent = "O armazenamento local não está disponível. A importação foi cancelada.";
      elements.reviewError.hidden = false;
      return;
    }
    const selected = reviewItems.filter(item => item.selected);
    if (selected.length === 0) {
      elements.reviewError.textContent = "Selecione pelo menos um movimento para importar.";
      elements.reviewError.hidden = false;
      return;
    }
    for (const item of selected) {
      if (!isValidDate(item.date) || !item.description.trim() || item.description.trim().length > 120
        || !VALID_KINDS.includes(item.kind) || !CATEGORIES[item.kind].includes(item.category)
        || !Number.isFinite(item.amount) || item.amount <= 0 || item.amount > 999999999) {
        elements.reviewError.textContent = "Corrija as datas, descrições, tipos, categorias e montantes inválidos antes de confirmar.";
        elements.reviewError.hidden = false;
        return;
      }
    }
    const existing = new Set(records.map(reviewSignature));
    const newlyDuplicated = selected.filter(item => existing.has(reviewSignature(item)) && !item.duplicate);
    if (newlyDuplicated.length > 0) {
      for (const item of newlyDuplicated) {
        item.duplicate = true;
        item.selected = false;
      }
      renderStatementReview();
      elements.reviewError.textContent = "Alguns movimentos foram adicionados noutro separador. Foram desmarcados para evitar duplicados; reveja novamente antes de confirmar.";
      elements.reviewError.hidden = false;
      return;
    }
    const newRecords = selected.map(item => ({
      id: idForNewRecord(),
      kind: item.kind,
      category: item.category,
      description: item.description.trim(),
      amount: roundMoney(item.amount),
      date: item.date,
      recurring: false,
      nature: item.kind === "expense" || item.kind === "credit" ? (item.nature || "variable") : null
    }));
    if (!saveRecords([...records, ...newRecords])) {
      elements.reviewError.textContent = "Não foi possível guardar a importação. Nenhum movimento foi confirmado.";
      elements.reviewError.hidden = false;
      return;
    }
    elements.reviewDialog.close();
    elements.movementSearch.value = "";
    elements.monthPicker.value = newRecords[0].date.slice(0, 7);
    render();
    showToast(`${newRecords.length} ${newRecords.length === 1 ? "movimento importado" : "movimentos importados"} de "${reviewSourceName}".`);
    reviewItems = [];
    reviewSourceName = "";
  }

  function populateCategories(kind, selectedCategory = null) {
    const categoryLabels = {
      income: "Origem do rendimento",
      expense: "Categoria da despesa",
      credit: "Tipo de crédito",
      investment: "Tipo de investimento"
    };
    elements.categoryLabel.textContent = categoryLabels[kind];
    elements.categoryField.replaceChildren(...CATEGORIES[kind].map(category => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      return option;
    }));
    if (selectedCategory && CATEGORIES[kind].includes(selectedCategory)) {
      elements.categoryField.value = selectedCategory;
    }
  }

  function setDefaultNature() {
    const kind = elements.kindField.value;
    const category = elements.categoryField.value;
    const isFixed = category === "Salário fixo" || ((kind === "expense" || kind === "credit") && elements.form.elements.nature.value === "fixed");
    elements.recurringField.checked = isFixed;
  }

  function ensureNatureField() {
    let nature = elements.form.elements.nature;
    if (nature) return nature;
    const label = document.createElement("label");
    label.className = "field";
    label.id = "nature-field-wrap";
    label.innerHTML = '<span>Tipo</span><select name="nature" required><option value="variable">Variável</option><option value="fixed">Fixa</option></select>';
    elements.form.querySelector(".recurrence-hint").before(label);
    nature = label.querySelector("select");
    nature.addEventListener("change", setDefaultNature);
    return nature;
  }

  function removeNatureField() {
    document.querySelector("#nature-field-wrap")?.remove();
  }

  function updateTypeFields(preserveNature = false) {
    const kind = elements.kindField.value;
    populateCategories(kind, preserveNature ? elements.categoryField.value : null);
    if (kind === "expense" || kind === "credit") {
      const nature = ensureNatureField();
      if (!preserveNature) nature.value = "variable";
    } else {
      removeNatureField();
    }
    if (!preserveNature) setDefaultNature();
  }

  function openNewMovement(kind = "income") {
    editingId = null;
    elements.form.reset();
    elements.formError.hidden = true;
    elements.dialogTitle.textContent = "Novo movimento";
    elements.saveButton.textContent = "Guardar movimento";
    elements.kindField.disabled = false;
    elements.kindField.value = kind;
    elements.dateField.value = localDateString();
    updateTypeFields();
    elements.dialog.showModal();
    elements.descriptionField.focus();
  }

  function openEditMovement(id) {
    const record = records.find(item => item.id === id);
    if (!record) return;
    editingId = id;
    elements.formError.hidden = true;
    elements.dialogTitle.textContent = "Editar movimento";
    elements.saveButton.textContent = "Guardar alterações";
    elements.kindField.disabled = false;
    elements.kindField.value = record.kind;
    updateTypeFields(true);
    elements.categoryField.value = record.category;
    elements.descriptionField.value = record.description;
    elements.amountField.value = String(record.amount);
    elements.dateField.value = record.date;
    elements.recurringField.checked = record.recurring;
    if (record.nature !== null) elements.form.elements.nature.value = record.nature;
    elements.dialog.showModal();
    elements.descriptionField.focus();
  }

  function idForNewRecord() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `mov-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  elements.form.addEventListener("submit", event => {
    event.preventDefault();
    elements.formError.hidden = true;
    if (!elements.form.reportValidity()) return;

    const kind = elements.kindField.value;
    const amount = elements.amountField.valueAsNumber;
    const description = elements.descriptionField.value.trim();
    const date = elements.dateField.value;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999) {
      elements.formError.textContent = "Introduza um montante superior a zero e até 999 999 999 €.";
      elements.formError.hidden = false;
      return;
    }
    const record = {
      id: editingId || idForNewRecord(),
      kind,
      category: elements.categoryField.value,
      description,
      amount: Math.round(amount * 100) / 100,
      date,
      recurring: elements.recurringField.checked,
      nature: kind === "expense" || kind === "credit" ? elements.form.elements.nature.value : null
    };
    if (!isValidRecord(record)) {
      elements.formError.textContent = "Verifique os dados introduzidos e tente novamente.";
      elements.formError.hidden = false;
      return;
    }
    const nextRecords = editingId
      ? records.map(item => item.id === editingId ? record : item)
      : [...records, record];
    if (!saveRecords(nextRecords)) return;
    elements.dialog.close();
    render();
    showToast(editingId ? "Movimento atualizado." : "Movimento guardado.");
  });

  elements.walletForm.addEventListener("submit", event => {
    event.preventDefault();
    elements.walletError.hidden = true;
    if (!elements.walletForm.reportValidity()) return;
    const name = elements.walletForm.elements.name.value.trim();
    const provider = elements.walletForm.elements.provider.value.trim();
    if (wallets.some(wallet => wallet.id !== editingWalletId && wallet.name.toLocaleLowerCase("pt-PT") === name.toLocaleLowerCase("pt-PT"))) {
      elements.walletError.textContent = "Já existe uma carteira com este nome. Escolha outro nome para a identificar facilmente.";
      elements.walletError.hidden = false;
      elements.walletForm.elements.name.focus();
      return;
    }
    const wallet = { id: editingWalletId || idForNewRecord(), name, provider };
    const nextWallets = editingWalletId
      ? wallets.map(existingWallet => existingWallet.id === editingWalletId ? wallet : existingWallet)
      : [...wallets, wallet];
    if (!saveWallets(nextWallets)) {
      elements.walletError.textContent = "Não foi possível guardar a carteira. Verifique o armazenamento e tente novamente.";
      elements.walletError.hidden = false;
      return;
    }
    elements.walletDialog.close();
    render();
    showToast(editingWalletId ? "Carteira atualizada." : "Carteira criada.");
    if (!editingWalletId && wallets.length === 1) openPositionForm(null, wallet.id);
  });

  elements.positionForm.addEventListener("submit", event => {
    event.preventDefault();
    elements.positionError.hidden = true;
    if (!elements.positionForm.reportValidity()) return;
    const position = {
      id: editingPositionId || idForNewRecord(),
      walletId: elements.positionForm.elements.walletId.value,
      assetType: elements.positionForm.elements.assetType.value,
      symbol: elements.positionForm.elements.symbol.value.trim().toLocaleUpperCase("pt-PT"),
      name: elements.positionForm.elements.name.value.trim(),
      units: assetValueFromInput(elements.positionForm.elements.units),
      averagePrice: assetValueFromInput(elements.positionForm.elements.averagePrice),
      currentPrice: assetValueFromInput(elements.positionForm.elements.currentPrice),
      quoteUpdatedAt: null
    };
    const invalid = !position.walletId || !position.name
      || !VALID_ASSET_TYPES.includes(position.assetType)
      || !Number.isFinite(position.units) || position.units <= 0
      || !Number.isFinite(position.averagePrice) || position.averagePrice < 0
      || !Number.isFinite(position.currentPrice) || position.currentPrice < 0
      || position.units > 999999999 || position.averagePrice > 999999999 || position.currentPrice > 999999999
      || position.units * Math.max(position.averagePrice, position.currentPrice) > 999999999999999;
    if (invalid) {
      elements.positionError.textContent = "Verifique a carteira, as unidades e os preços em euros. As unidades têm de ser positivas.";
      elements.positionError.hidden = false;
      return;
    }
    const nextPositions = editingPositionId
      ? positions.map(existingPosition => existingPosition.id === editingPositionId ? position : existingPosition)
      : [...positions, position];
    if (!savePositions(nextPositions)) {
      elements.positionError.textContent = "Não foi possível guardar a posição. Verifique o armazenamento e tente novamente.";
      elements.positionError.hidden = false;
      return;
    }
    elements.positionDialog.close();
    render();
    showToast(editingPositionId ? "Posição atualizada." : "Posição adicionada.");
  });

  elements.kindField.addEventListener("change", () => updateTypeFields());
  elements.categoryField.addEventListener("change", setDefaultNature);
  elements.monthPicker.addEventListener("change", () => {
    if (!isValidMonth(elements.monthPicker.value)) elements.monthPicker.value = currentMonthString();
    render();
  });
  elements.movementSearch.addEventListener("input", render);
  elements.analyzeExpenses.addEventListener("click", () => {
    elements.expenseGuidance.hidden = false;
    renderExpenseGuidance();
    elements.expenseGuidance.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  elements.showExpenseDetails.addEventListener("click", () => {
    renderExpenseDetails(movementsForMonth(elements.monthPicker.value));
    elements.expenseDetailsDialog.showModal();
  });
  document.querySelector("#close-expense-details").addEventListener("click", () => elements.expenseDetailsDialog.close());
  document.querySelector("#dismiss-expense-details").addEventListener("click", () => elements.expenseDetailsDialog.close());
  elements.expenseDetailsList.addEventListener("click", event => {
    const editButton = event.target.closest("[data-expense-edit]");
    if (!editButton) return;
    const record = records.find(item => item.id === editButton.dataset.expenseEdit);
    if (!record) return;
    elements.expenseDetailsDialog.close();
    openEditMovement(record.id);
  });
  document.querySelector("#top-add").addEventListener("click", () => openNewMovement());
  document.querySelector("#sidebar-add").addEventListener("click", () => openNewMovement());
  document.querySelector("#empty-add").addEventListener("click", () => openNewMovement());
  document.querySelector("#close-dialog").addEventListener("click", () => elements.dialog.close());
  document.querySelector("#cancel-dialog").addEventListener("click", () => elements.dialog.close());
  document.querySelector("#add-wallet").addEventListener("click", () => openWalletForm());
  elements.refreshQuotes.addEventListener("click", () => void refreshPortfolioQuotes());
  document.querySelector("#portfolio-empty-add").addEventListener("click", () => {
    if (wallets.length === 0) openWalletForm();
    else openPositionForm();
  });
  document.querySelector("#cancel-wallet-dialog").addEventListener("click", () => elements.walletDialog.close());
  document.querySelector("#close-position-dialog").addEventListener("click", () => elements.positionDialog.close());
  document.querySelector("#cancel-position-dialog").addEventListener("click", () => elements.positionDialog.close());
  document.querySelector("#portfolio-empty-add").addEventListener("click", () => {
    if (wallets.length === 0) openWalletForm();
    else openPositionForm();
  });
  document.querySelector("#import-statement").addEventListener("click", () => {
    elements.statementImportError.hidden = true;
    elements.statementFile.click();
  });
  elements.statementFile.addEventListener("change", () => {
    const file = elements.statementFile.files && elements.statementFile.files[0];
    elements.statementFile.value = "";
    if (file) void analyseStatement(file);
  });
  document.querySelector("#cancel-analysis").addEventListener("click", cancelStatementAnalysis);
  elements.progressDialog.addEventListener("cancel", event => {
    event.preventDefault();
    cancelStatementAnalysis();
  });
  document.querySelector("#close-review-dialog").addEventListener("click", () => elements.reviewDialog.close());
  document.querySelector("#cancel-review").addEventListener("click", () => {
    elements.reviewDialog.close();
    reviewItems = [];
    elements.reviewActionStatus.textContent = "";
    showToast("Importação cancelada. Nenhum movimento foi guardado.");
  });
  elements.confirmImport.addEventListener("click", confirmStatementImport);
  elements.toggleAllReviewed.addEventListener("click", () => {
    const allSelected = reviewItems.length > 0 && reviewItems.every(item => item.selected);
    const duplicateCount = reviewItems.filter(item => item.duplicate).length;
    const duplicateWarning = duplicateCount
      ? ` Inclui ${duplicateCount} ${duplicateCount === 1 ? "possível duplicado" : "possíveis duplicados"}.`
      : "";
    if (!allSelected && duplicateCount > 0
      && !window.confirm(`Selecionar todos os ${reviewItems.length} movimentos?${duplicateWarning} Pretende continuar?`)) return;
    const selected = !allSelected;
    for (const item of reviewItems) item.selected = selected;
    for (const checkbox of elements.reviewList.querySelectorAll('[data-review="selected"]')) checkbox.checked = selected;
    elements.reviewActionStatus.textContent = "";
    updateReviewSummary();
  });
  elements.reviewList.addEventListener("change", event => {
    const field = event.target.closest("[data-review]");
    const row = field && field.closest("[data-review-row]");
    if (!field || !row) return;
    const item = reviewItems.find(candidate => candidate.id === row.dataset.reviewRow);
    if (!item) return;
    if (field.dataset.review === "selected") item.selected = field.checked;
    if (field.dataset.review === "kind") {
      changeReviewKind(row, item, field.value);
      updateReviewDuplicates();
      refreshReviewRow(row, item);
      return;
    }
    if (field.dataset.review === "category") {
      item.category = field.value;
      const matchingItems = updateMatchingReviewCategories(item);
      const matchingIds = new Set(matchingItems.map(candidate => candidate.id));
      for (const matchingRow of elements.reviewList.querySelectorAll("[data-review-row]")) {
        if (!matchingIds.has(matchingRow.dataset.reviewRow)) continue;
        matchingRow.querySelector('[data-review="category"]').value = item.category;
      }
      elements.reviewActionStatus.textContent = matchingItems.length
        ? `Categoria aplicada também a ${matchingItems.length} ${matchingItems.length === 1 ? "movimento" : "movimentos"} com a mesma descrição e tipo.`
        : "Não há outros movimentos com a mesma descrição e tipo.";
      updateReviewSummary();
      return;
    }
    if (field.dataset.review === "date") item.date = field.value;
    if (field.dataset.review === "description") item.description = field.value;
    if (field.dataset.review === "amount") item.amount = field.valueAsNumber;
    renderStatementReview();
  });
  elements.reviewList.addEventListener("input", event => {
    const field = event.target.closest('[data-review="description"], [data-review="amount"], [data-review="date"]');
    const row = field && field.closest("[data-review-row]");
    const item = row && reviewItems.find(candidate => candidate.id === row.dataset.reviewRow);
    if (!item) return;
    if (field.dataset.review === "description") item.description = field.value;
    if (field.dataset.review === "amount") item.amount = field.valueAsNumber;
    if (field.dataset.review === "date") item.date = field.value;
    updateReviewDuplicates();
    refreshReviewRow(row, item);
  });
  document.querySelector("#theme-toggle").addEventListener("click", () => saveThemePreference(theme === "light" ? "dark" : "light"));
  elements.walletList.addEventListener("click", event => {
    const addButton = event.target.closest("[data-add-position]");
    const editButton = event.target.closest("[data-edit-wallet]");
    const deleteButton = event.target.closest("[data-delete-wallet]");
    if (addButton) openPositionForm(null, addButton.dataset.addPosition);
    if (editButton) {
      const wallet = wallets.find(item => item.id === editButton.dataset.editWallet);
      if (wallet) openWalletForm(wallet);
    }
    if (deleteButton) {
      const wallet = wallets.find(item => item.id === deleteButton.dataset.deleteWallet);
      if (!wallet) return;
      const count = positions.filter(position => position.walletId === wallet.id).length;
      const detail = count ? ` Esta ação apaga também ${count} ${count === 1 ? "posição" : "posições"} desta carteira.` : "";
      if (!window.confirm(`Apagar a carteira "${wallet.name}"?${detail}`)) return;
      if (saveWallets(wallets.filter(item => item.id !== wallet.id), positions.filter(position => position.walletId !== wallet.id))) {
        render();
        showToast("Carteira apagada.");
      }
    }
  });
  elements.positionList.addEventListener("click", event => {
    const editButton = event.target.closest("[data-edit-position]");
    const deleteButton = event.target.closest("[data-delete-position]");
    if (editButton) {
      const position = positions.find(item => item.id === editButton.dataset.editPosition);
      if (position) openPositionForm(position);
    }
    if (deleteButton) {
      const position = positions.find(item => item.id === deleteButton.dataset.deletePosition);
      if (!position || !window.confirm(`Apagar a posição "${position.name}" da carteira?`)) return;
      if (savePositions(positions.filter(item => item.id !== position.id))) {
        render();
        showToast("Posição apagada.");
      }
    }
  });
  function syncNavigation() {
    const currentHash = window.location.hash || "#resumo";
    document.querySelectorAll(".sidebar .nav-link[href^='#'], .mobile-nav a[href^='#']").forEach(link => {
      const active = link.getAttribute("href") === currentHash;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }
  window.addEventListener("hashchange", syncNavigation);
  syncNavigation();

  elements.movementList.addEventListener("click", event => {
    const editButton = event.target.closest("[data-edit]");
    const deleteButton = event.target.closest("[data-delete]");
    if (editButton) openEditMovement(editButton.dataset.edit);
    if (deleteButton) {
      const record = records.find(item => item.id === deleteButton.dataset.delete);
      if (!record) return;
      const recurringNote = record.recurring ? " Esta ação remove também as ocorrências nos outros meses." : "";
      if (!window.confirm(`Apagar "${record.description}"?${recurringNote}`)) return;
      if (saveRecords(records.filter(item => item.id !== record.id))) {
        render();
        showToast("Movimento apagado.");
      }
    }
  });

  document.querySelector("#export-backup").addEventListener("click", () => {
    try {
      const payload = {
        app: "conta-clara",
        version: 2,
        exportedAt: new Date().toISOString(),
        records,
        wallets,
        positions,
        theme
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${BACKUP_NAME}-${localDateString()}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast("Cópia de segurança exportada.");
    } catch (error) {
      showToast("Não foi possível exportar a cópia de segurança.", true);
    }
  });

  document.querySelector("#import-backup").addEventListener("click", () => elements.backupFile.click());
  elements.backupFile.addEventListener("change", async () => {
    const file = elements.backupFile.files && elements.backupFile.files[0];
    if (!file) return;
    elements.backupFile.value = "";
    if (file.size > MAX_BACKUP_BYTES) {
      showToast("A cópia excede o limite de 10 MB.", true);
      return;
    }
    try {
      const payload = JSON.parse(await file.text());
      if (!payload || payload.app !== "conta-clara" || ![1, 2].includes(payload.version)) {
        throw new Error("Formato ou versão de cópia não reconhecidos.");
      }
      const importedRecords = validateRecords(payload.records);
      const importedWallets = payload.version === 2 ? validateWallets(payload.wallets) : wallets;
      const importedPositions = payload.version === 2 ? validatePositions(payload.positions, importedWallets) : positions;
      const importedTheme = payload.version === 2 && ["light", "dark"].includes(payload.theme) ? payload.theme : theme;
      const legacyNotice = payload.version === 1 ? " Os backups antigos não incluíam carteiras, que serão mantidas." : " A importação substitui movimentos, carteiras e preferências atuais.";
      if (!window.confirm(`A cópia contém ${importedRecords.length} ${importedRecords.length === 1 ? "movimento" : "movimentos"} e ${importedPositions.length} ${importedPositions.length === 1 ? "posição" : "posições"}.${legacyNotice} Continuar?`)) return;
      if (!persistBundle({
        [STORAGE_KEY]: JSON.stringify(importedRecords),
        [WALLETS_KEY]: JSON.stringify(importedWallets),
        [POSITIONS_KEY]: JSON.stringify(importedPositions),
        [THEME_KEY]: importedTheme
      }, "Não foi possível guardar a cópia importada. Verifique o espaço no navegador e tente novamente.")) {
        showStorageWarning("O navegador não conseguiu guardar a cópia importada. Verifique o espaço disponível e tente novamente.");
        return;
      }
      storageReady = true;
      portfolioStorageReady = true;
      records = importedRecords;
      wallets = importedWallets;
      positions = importedPositions;
      applyTheme(importedTheme);
      elements.storageWarning.hidden = true;
      render();
      showToast("Cópia de segurança importada.");
    } catch (error) {
      showToast(error instanceof SyntaxError ? "O ficheiro não contém JSON válido." : error.message || "Não foi possível importar esta cópia.", true);
    }
  });

  window.addEventListener("storage", event => {
    if (event.key === THEME_KEY) {
      applyTheme(event.newValue === "dark" ? "dark" : "light");
      return;
    }
    if (event.key === WALLETS_KEY || event.key === POSITIONS_KEY) {
      try {
        const storedWallets = validateWallets(JSON.parse(window.localStorage.getItem(WALLETS_KEY) || "[]"));
        const storedPositions = validatePositions(JSON.parse(window.localStorage.getItem(POSITIONS_KEY) || "[]"), storedWallets);
        wallets = storedWallets;
        positions = storedPositions;
        renderPortfolio();
        showToast("As carteiras foram atualizadas noutro separador.");
      } catch (error) {
        portfolioStorageReady = false;
        showStorageWarning("As carteiras atualizadas noutro separador são inválidas. Importe uma cópia de segurança válida antes de continuar.");
      }
      return;
    }
    if (event.key !== STORAGE_KEY) return;
    try {
      records = event.newValue === null ? [] : validateRecords(JSON.parse(event.newValue));
      render();
      showToast("Os dados foram atualizados noutro separador.");
    } catch (error) {
      storageReady = false;
      showStorageWarning("Os dados atualizados noutro separador são inválidos. Importe uma cópia válida antes de continuar.");
    }
  });

  document.querySelector("#reload-updated-app").addEventListener("click", reloadUpdatedApp);
  document.querySelector("#dismiss-update-notice").addEventListener("click", () => {
    dismissedAppVersion = availableAppVersion;
    availableAppVersion = null;
    elements.updateNotice.hidden = true;
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkForAppUpdate();
  });
  window.addEventListener("online", updateOfflineStatus);
  window.addEventListener("offline", updateOfflineStatus);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      updateOfflineStatus();
      const controller = navigator.serviceWorker.controller;
      if (offlineController && controller && controller !== offlineController) {
        availableAppVersion = "service-worker";
        elements.updateNotice.querySelector("span").textContent = "Está disponível uma versão mais recente da Conta Clara.";
        elements.updateNotice.hidden = false;
      }
      offlineController = controller;
    });
  }

  elements.monthPicker.value = currentMonthString();
  loadRecords();
  loadPortfolio();
  loadTheme();
  updateTypeFields();
  render();
  void checkForAppUpdate();
  void registerOfflineApp();
  window.setInterval(() => {
    if (document.visibilityState === "visible") void checkForAppUpdate();
  }, 60000);
})();
