"use strict";

(function () {
  /* ── Constants ───────────────────────────────────────────── */
  const AUTH_STORAGE_KEY = "gestao_auth_v2";
  const API_TIMEOUT_MS = 12000;
  const API_BASE_URL = resolveApiBaseUrl();
  const CURRENCY = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  const METHOD_LABELS = {
    pix: "PIX",
    debito: "Débito",
    credito: "Crédito",
    dinheiro: "Dinheiro",
    transferencia: "Transferência",
    outros: "Outros",
  };

  /* ── DOM Cache ───────────────────────────────────────────── */
  // CSV inference dictionaries (kept centralized to avoid future rule drift).
  const CARD_BILL_REGEX = /\b(?:pag(?:amento|to)?\s*(?:de\s*)?fatura|fatura\s*(?:do|de)?\s*cart(?:a|ã)o|pgto\s*cart(?:a|ã)o|pag(?:amento)?\s*cart(?:a|ã)o|cart(?:a|ã)o\s*de\s*cr[eé]dito)\b/i;
  const PIX_TRANSFER_HINT_REGEX = /\b(?:enviado|enviada|recebido|recebida|devolu(?:c|ç)ao|transfer(?:encia)?|ted|doc|cpf|cnpj|chave|favorecido)\b/i;
  const SUBSCRIPTION_KEYWORDS = [
    "dl\\*google", "google\\s*(one|play|storage|premium|workspace)", "youtube\\s*(prem|premium|music)",
    "amazonprimebr", "amazon\\s*prime", "prime\\s*video", "netflix", "spotify", "deezer", "tidal",
    "disney\\+?", "star\\+?", "hbo\\s*(max)?", "\\bmax\\b", "paramount\\+?", "globoplay", "crunchyroll",
    "apple\\s*(music|tv|one|arcade|icloud)", "apple\\.com\\/bill", "icloud", "dropbox", "onedrive",
    "chatgpt", "openai", "perplexity", "notion", "canva", "adobe", "figma", "grammarly", "midjourney",
    "microsoft\\s*365", "office\\s*365", "github\\s*(copilot)?", "vercel", "fly\\.io", "cloudflare",
    "railway", "render", "heroku", "digitalocean", "linode", "\\baws\\b", "google\\s*cloud", "\\bgcp\\b",
    "\\bazure\\b", "supabase", "mongodb\\s*atlas", "uol\\s*host", "hostinger", "hostgator", "namecheap",
    "nordvpn", "expressvpn", "surfshark", "kaspersky", "avast", "mcafee",
    "strava", "myfitnesspal", "headspace", "calm", "linkedin\\s*premium", "x\\s*premium", "patreon",
    "substack", "meta\\s*verified", "discord\\s*nitro", "telegram\\s*premium",
  ];
  const SUBSCRIPTION_REGEX = new RegExp(SUBSCRIPTION_KEYWORDS.join("|"), "i");

  const el = {
    globalLoader: document.getElementById("globalLoader"),
    loaderText: document.getElementById("loaderText"),
    authShell: document.getElementById("authShell"),
    dashboardShell: document.getElementById("dashboardShell"),
    authMessage: document.getElementById("authMessage"),
    appMessage: document.getElementById("appMessage"),
    confirmModal: document.getElementById("confirmModal"),
    confirmTitle: document.getElementById("confirmTitle"),
    confirmMessage: document.getElementById("confirmMessage"),
    confirmCancelBtn: document.getElementById("confirmCancelBtn"),
    confirmCloseBtn: document.getElementById("confirmCloseBtn"),
    confirmOkBtn: document.getElementById("confirmOkBtn"),

    showLoginBtn: document.getElementById("showLoginBtn"),
    showRegisterBtn: document.getElementById("showRegisterBtn"),
    loginForm: document.getElementById("loginForm"),
    registerForm: document.getElementById("registerForm"),
    loginEmail: document.getElementById("loginEmail"),
    loginPassword: document.getElementById("loginPassword"),
    registerName: document.getElementById("registerName"),
    registerEmail: document.getElementById("registerEmail"),
    registerPassword: document.getElementById("registerPassword"),
    forgotPasswordForm: document.getElementById("forgotPasswordForm"),
    forgotEmail: document.getElementById("forgotEmail"),
    forgotSuccessMsg: document.getElementById("forgotSuccessMsg"),
    resetPasswordForm: document.getElementById("resetPasswordForm"),
    resetNewPassword: document.getElementById("resetNewPassword"),
    resetConfirmPassword: document.getElementById("resetConfirmPassword"),
    showForgotBtn: document.getElementById("showForgotBtn"),
    backToLoginBtn: document.getElementById("backToLoginBtn"),
    addCategoryQuickBtn: document.getElementById("addCategoryQuickBtn"),

    userInitial: document.getElementById("userInitial"),
    userNameText: document.getElementById("userNameText"),
    logoutBtn: document.getElementById("logoutBtn"),

    sidebar: document.getElementById("sidebar"),
    sidebarToggle: document.getElementById("sidebarToggle"),
    sidebarOverlay: document.getElementById("sidebarOverlay"),

    monthPicker: document.getElementById("monthPicker"),
    prevMonthBtn: document.getElementById("prevMonthBtn"),
    nextMonthBtn: document.getElementById("nextMonthBtn"),
    focusTransactionBtn: document.getElementById("focusTransactionBtn"),

    kpiBalance: document.getElementById("kpiBalance"),
    kpiIncome: document.getElementById("kpiIncome"),
    kpiExpense: document.getElementById("kpiExpense"),
    kpiInvestment: document.getElementById("kpiInvestment"),

    transactionForm: document.getElementById("transactionForm"),
    transactionDescription: document.getElementById("transactionDescription"),
    transactionAmount: document.getElementById("transactionAmount"),
    transactionDate: document.getElementById("transactionDate"),
    transactionCategory: document.getElementById("transactionCategory"),
    transactionType: document.getElementById("transactionType"),
    transactionMethod: document.getElementById("transactionMethod"),
    transactionSubmitBtn: document.getElementById("transactionSubmitBtn"),
    cancelTransactionEditBtn: document.getElementById("cancelTransactionEditBtn"),

    searchInput: document.getElementById("searchInput"),
    filterType: document.getElementById("filterType"),
    filterCategory: document.getElementById("filterCategory"),
    filterMethod: document.getElementById("filterMethod"),
    filterRecurrence: document.getElementById("filterRecurrence"),
    transactionsTableBody: document.getElementById("transactionsTableBody"),
    transactionsCardsContainer: document.getElementById("transactionsCardsContainer"),
    transactionsEmptyState: document.getElementById("transactionsEmptyState"),
    tableFilterSummary: document.getElementById("tableFilterSummary"),
    tablePagination: document.getElementById("tablePagination"),

    transactionRecurrence: document.getElementById("transactionRecurrence"),
    transactionInstallments: document.getElementById("transactionInstallments"),
    transactionRecurrenceEnd: document.getElementById("transactionRecurrenceEnd"),
    installmentsLabel: document.getElementById("installmentsLabel"),
    recurrenceEndLabel: document.getElementById("recurrenceEndLabel"),

    themeToggle: document.getElementById("themeToggle"),

    investmentsKpis: document.getElementById("investmentsKpis"),
    investmentsList: document.getElementById("investmentsList"),

    changePasswordForm: document.getElementById("changePasswordForm"),
    currentPassword: document.getElementById("currentPassword"),
    newPassword: document.getElementById("newPassword"),
    confirmNewPassword: document.getElementById("confirmNewPassword"),

    budgetForm: document.getElementById("budgetForm"),
    budgetCategory: document.getElementById("budgetCategory"),
    budgetLimit: document.getElementById("budgetLimit"),
    budgetsList: document.getElementById("budgetsList"),

    goalForm: document.getElementById("goalForm"),
    goalName: document.getElementById("goalName"),
    goalTarget: document.getElementById("goalTarget"),
    goalCurrent: document.getElementById("goalCurrent"),
    goalDueDate: document.getElementById("goalDueDate"),
    goalSubmitBtn: document.getElementById("goalSubmitBtn"),
    cancelGoalEditBtn: document.getElementById("cancelGoalEditBtn"),
    goalsList: document.getElementById("goalsList"),

    projectionForm: document.getElementById("projectionForm"),
    projectionMonths: document.getElementById("projectionMonths"),
    projectionIncome: document.getElementById("projectionIncome"),
    projectionExpense: document.getElementById("projectionExpense"),
    projectionInvestment: document.getElementById("projectionInvestment"),
    projectionSummary: document.getElementById("projectionSummary"),

    cashFlowChart: document.getElementById("cashFlowChart"),
    projectionChart: document.getElementById("projectionChart"),
    expenseByCategoryChart: document.getElementById("expenseByCategoryChart"),

    exportCsvBtn: document.getElementById("exportCsvBtn"),
    importCsvBtn: document.getElementById("importCsvBtn"),
    sendSummaryBtn: document.getElementById("sendSummaryBtn"),
    deleteAllTransactionsBtn: document.getElementById("deleteAllTransactionsBtn"),
    csvInput: document.getElementById("csvInput"),

    kpiNetWorth: document.getElementById("kpiNetWorth"),
    kpiCreditCard: document.getElementById("kpiCreditCard"),
    alertsBar: document.getElementById("alertsBar"),

    transactionAccount: document.getElementById("transactionAccount"),

    accountForm: document.getElementById("accountForm"),
    accountName: document.getElementById("accountName"),
    accountType: document.getElementById("accountType"),
    accountInitialBalance: document.getElementById("accountInitialBalance"),
    accountColor: document.getElementById("accountColor"),
    accountSubmitBtn: document.getElementById("accountSubmitBtn"),
    cancelAccountEditBtn: document.getElementById("cancelAccountEditBtn"),
    accountsList: document.getElementById("accountsList"),

    categoryForm: document.getElementById("categoryForm"),
    categoryName: document.getElementById("categoryName"),
    categoryType: document.getElementById("categoryType"),
    categoryIcon: document.getElementById("categoryIcon"),
    categorySubmitBtn: document.getElementById("categorySubmitBtn"),
    cancelCategoryEditBtn: document.getElementById("cancelCategoryEditBtn"),
    categoriesList: document.getElementById("categoriesList"),

    reportContent: document.getElementById("reportContent"),
    installmentsContent: document.getElementById("installmentsContent"),

    csvDropZone: document.getElementById("csvDropZone"),
    patrimonioEvolutionChart: document.getElementById("patrimonioEvolutionChart"),
    compareMonth: document.getElementById("compareMonth"),
    compareContent: document.getElementById("compareContent"),
    exportPdfBtn: document.getElementById("exportPdfBtn"),
    reportPanel: document.getElementById("reportPanel"),
  };

  /* ── State ───────────────────────────────────────────────── */
  const PAGE_KEYS = ["dashboard","transactions","accounts","budgets","goals","investments","projection","reports","installments","settings"];
  let currentPage = "dashboard";

  const state = {
    token: "",
    user: null,
    selectedMonth: getCurrentMonth(),
    transactions: [],
    budgets: [],
    goals: [],
    categories: [],
    accounts: [],
    projection: { months: 6, income: null, expense: null, investment: null, updatedAt: "" },
    tablePage: 1,
    tablePageSize: 10,
  };

  let editingTransactionId = null;
  let editingBudgetId = null;
  let editingGoalId = null;
  let editingCategoryId = null;
  let editingAccountId = null;
  let cashFlowChartInstance = null;
  let projectionChartInstance = null;
  let expenseChartInstance = null;
  let dialogResolver = null;
  let dialogEscHandler = null;
  let dialogLastFocused = null;

  // Default category type mapping
  const defaultCategoryTypes = {
    // Receitas
    "salário": "receita", "salario": "receita", "freelance": "receita", "bônus": "receita",
    "bonus": "receita", "comissão": "receita", "comissao": "receita", "rendimento": "receita",
    // Despesas
    "aluguel": "despesa", "alimentação": "despesa", "alimentacao": "despesa", "transporte": "despesa",
    "saúde": "despesa", "saude": "despesa", "educação": "despesa", "educacao": "despesa",
    "lazer": "despesa", "vestuário": "despesa", "vestuario": "despesa", "moradia": "despesa",
    "contas": "despesa", "água": "despesa", "agua": "despesa", "luz": "despesa", "internet": "despesa",
    "telefone": "despesa", "gás": "despesa", "gas": "despesa", "assinaturas": "despesa", "fatura": "despesa",
    "supermercado": "despesa", "restaurante": "despesa", "farmácia": "despesa", "farmacia": "despesa", "transferência": "despesa", "transferencia": "despesa",
    // Investimentos
    "ações": "investimento", "acoes": "investimento", "fundos": "investimento", "cdb": "investimento",
    "tesouro": "investimento", "poupança": "investimento", "poupanca": "investimento", "criptomoedas": "investimento"
  };
  let patrimonioChartInstance = null;

  /* ── Init ────────────────────────────────────────────────── */
  init();

  function init() {
    applyTheme(localStorage.getItem("gofund_theme") || "dark");
    bindEvents();
    el.monthPicker.value = state.selectedMonth;
    el.transactionDate.value = getTodayDate();
    restoreSession();
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }

  /* ── Event Bindings ──────────────────────────────────────── */
  function bindEvents() {
    if (el.confirmModal) {
      el.confirmCancelBtn?.addEventListener("click", () => closeDialog(false));
      el.confirmCloseBtn?.addEventListener("click", () => closeDialog(false));
      el.confirmOkBtn?.addEventListener("click", () => closeDialog(true));
      el.confirmModal.addEventListener("click", (event) => {
        if (event.target === el.confirmModal) closeDialog(false);
      });
    }

    // Auth
    el.showLoginBtn.addEventListener("click", () => setAuthMode("login"));
    el.showRegisterBtn.addEventListener("click", () => setAuthMode("register"));
    el.loginForm.addEventListener("submit", (e) => void handleLogin(e));
    el.registerForm.addEventListener("submit", (e) => void handleRegister(e));
    el.logoutBtn.addEventListener("click", handleLogout);

    // Sidebar mobile
    el.sidebarToggle.addEventListener("click", toggleSidebar);
    el.sidebarOverlay.addEventListener("click", closeSidebar);

    // Page navigation via sidebar
    el.sidebar.querySelectorAll(".sidebar-nav a[data-page]").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        navigateTo(link.dataset.page);
        closeSidebar();
      });
    });

    // Month navigation
    el.monthPicker.addEventListener("change", () => {
      if (!/^\d{4}-\d{2}$/.test(el.monthPicker.value)) {
        el.monthPicker.value = state.selectedMonth;
        return;
      }
      state.selectedMonth = el.monthPicker.value;
      renderAll();
    });
    el.prevMonthBtn.addEventListener("click", () => shiftMonth(-1));
    el.nextMonthBtn.addEventListener("click", () => shiftMonth(1));
    el.focusTransactionBtn.addEventListener("click", () => {
      navigateTo("transactions");
      setTimeout(() => {
        el.transactionForm.scrollIntoView({ behavior: "smooth", block: "start" });
        el.transactionDescription.focus();
      }, 120);
    });

    // Transactions
    el.transactionForm.addEventListener("submit", (e) => void handleTransactionSubmit(e));
    el.cancelTransactionEditBtn.addEventListener("click", resetTransactionForm);
    el.transactionsTableBody.addEventListener("click", (e) => void handleTransactionTableActions(e));
    el.searchInput.addEventListener("input", () => { state.tablePage = 1; renderTransactionsTable(); });
    el.filterType.addEventListener("change", () => { state.tablePage = 1; renderTransactionsTable(); });
    el.filterCategory.addEventListener("change", () => { state.tablePage = 1; renderTransactionsTable(); });
    el.filterMethod.addEventListener("change", () => { state.tablePage = 1; renderTransactionsTable(); });
    el.filterRecurrence.addEventListener("change", () => { state.tablePage = 1; renderTransactionsTable(); });

    // Recurrence toggle
    el.transactionRecurrence.addEventListener("change", toggleRecurrenceFields);

    // Auto-recurring for subscriptions and auto-fill type from category
    el.transactionCategory.addEventListener("change", () => {
      const cat = normalizeString(el.transactionCategory.options[el.transactionCategory.selectedIndex]?.text || "").toLowerCase();
      if (cat === "assinaturas" && el.transactionRecurrence.value === "none") {
        el.transactionRecurrence.value = "monthly";
        toggleRecurrenceFields();
      } else if (cat !== "assinaturas" && el.transactionRecurrence.value === "monthly") {
        el.transactionRecurrence.value = "none";
        toggleRecurrenceFields();
      }
      // Auto-fill type based on category
      const matchingCategory = state.categories.find(c => normalizeString(c.name).toLowerCase() === cat);
      if (matchingCategory && matchingCategory.type && matchingCategory.type !== "todas") {
        el.transactionType.value = matchingCategory.type;
      } else if (defaultCategoryTypes[cat]) {
        el.transactionType.value = defaultCategoryTypes[cat];
      }
    });

    // Quick add category button -> navigate to settings
    el.addCategoryQuickBtn.addEventListener("click", () => {
      navigateTo("settings");
      setTimeout(() => el.categoryName?.focus(), 200);
    });

    // Forgot password
    el.showForgotBtn.addEventListener("click", () => setAuthMode("forgot"));
    el.backToLoginBtn.addEventListener("click", () => setAuthMode("login"));
    el.forgotPasswordForm.addEventListener("submit", (e) => void handleForgotPassword(e));
    el.resetPasswordForm.addEventListener("submit", (e) => void handleResetPassword(e));

    // Theme
    el.themeToggle.addEventListener("click", () => {
      applyTheme(document.body.dataset.theme === "dark" ? "light" : "dark");
    });

    // Budgets
    el.budgetForm.addEventListener("submit", (e) => void handleBudgetSubmit(e));
    el.budgetsList.addEventListener("click", (e) => void handleBudgetActions(e));

    // Goals
    el.goalForm.addEventListener("submit", (e) => void handleGoalSubmit(e));
    el.cancelGoalEditBtn.addEventListener("click", resetGoalForm);
    el.goalsList.addEventListener("click", (e) => void handleGoalActions(e));
    el.goalsList.addEventListener("submit", (e) => void handleGoalContribution(e));

    // Projection
    el.projectionForm.addEventListener("submit", (e) => void handleProjectionSubmit(e));

    // Investments
    el.investmentsList.addEventListener("submit", (e) => void handleInvestmentYield(e));

    // Password change
    el.changePasswordForm.addEventListener("submit", (e) => void handleChangePassword(e));

    // CSV
    el.exportCsvBtn.addEventListener("click", exportCsv);
    el.importCsvBtn.addEventListener("click", () => el.csvInput.click());
    el.sendSummaryBtn.addEventListener("click", sendMonthlySummary);
    el.deleteAllTransactionsBtn.addEventListener("click", deleteAllTransactions);
    el.csvInput.addEventListener("change", (e) => void importCsv(e));

    // Categories CRUD
    el.categoryForm.addEventListener("submit", (e) => void handleCategorySubmit(e));
    el.cancelCategoryEditBtn.addEventListener("click", resetCategoryForm);
    el.categoriesList.addEventListener("click", (e) => void handleCategoryActions(e));

    // Accounts CRUD
    el.accountForm.addEventListener("submit", (e) => void handleAccountSubmit(e));
    el.cancelAccountEditBtn.addEventListener("click", resetAccountForm);
    el.accountsList.addEventListener("click", (e) => void handleAccountActions(e));

    // PDF Export
    el.exportPdfBtn.addEventListener("click", () => void exportPdf());

    // Comparative mode
    el.compareMonth.addEventListener("change", renderCompareContent);

    // Keyboard shortcuts
    document.addEventListener("keydown", handleGlobalKeydown);

    // Drag & drop CSV
    const content = document.querySelector(".content");
    if (content) {
      content.addEventListener("dragenter", (e) => { e.preventDefault(); el.csvDropZone.classList.remove("hidden"); });
      el.csvDropZone.addEventListener("dragover", (e) => { e.preventDefault(); });
      el.csvDropZone.addEventListener("dragleave", (e) => { if (e.target === el.csvDropZone) el.csvDropZone.classList.add("hidden"); });
      el.csvDropZone.addEventListener("drop", (e) => {
        e.preventDefault(); el.csvDropZone.classList.add("hidden");
        const file = e.dataTransfer?.files?.[0];
        if (file && file.name.endsWith(".csv")) void importCsvFile(file);
        else showMessage("app", "Solte um arquivo .csv válido.", "danger");
      });
    }
  }

  /* ── Sidebar Mobile ──────────────────────────────────────── */
  function toggleSidebar() {
    el.sidebar.classList.toggle("is-open");
    el.sidebarOverlay.classList.toggle("is-open");
  }

  function closeSidebar() {
    el.sidebar.classList.remove("is-open");
    el.sidebarOverlay.classList.remove("is-open");
  }

  /* ── Page Navigation ─────────────────────────────────────── */
  function navigateTo(page) {
    if (!PAGE_KEYS.includes(page)) return;
    currentPage = page;
    // Sidebar active link
    el.sidebar.querySelectorAll(".sidebar-nav a[data-page]").forEach((a) => {
      a.classList.toggle("is-active", a.dataset.page === page);
    });
    // Show / hide pages
    document.querySelectorAll(".page[data-page]").forEach((sec) => {
      sec.classList.toggle("active", sec.dataset.page === page);
    });
    // Lazy-render heavy pages
    if (page === "reports") { renderMonthlyReport(); renderPatrimonioEvolutionChart(); renderCompareContent(); }
    if (page === "installments") renderInstallmentPlan();
    if (page === "investments") renderInvestments();
    if (page === "projection") { renderProjectionSummary(); renderProjectionChart(buildProjectionModel()); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ── Keyboard Shortcuts ──────────────────────────────────── */
  function handleGlobalKeydown(e) {
    if (isDialogOpen()) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDialog(false);
      }
      return;
    }

    // Ignore when typing in inputs
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      if (e.key === "Escape") e.target.blur();
      return;
    }
    if (el.authShell && !el.authShell.classList.contains("hidden")) return;

    switch (e.key) {
      case "n": case "N":
        e.preventDefault();
        navigateTo("transactions");
        setTimeout(() => el.transactionDescription.focus(), 100);
        break;
      case "ArrowLeft":
        e.preventDefault(); shiftMonth(-1);
        break;
      case "ArrowRight":
        e.preventDefault(); shiftMonth(1);
        break;
      case "/":
        e.preventDefault();
        navigateTo("transactions");
        setTimeout(() => el.searchInput.focus(), 100);
        break;
      case "Escape":
        el.csvDropZone.classList.add("hidden");
        break;
      default: {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= PAGE_KEYS.length) {
          e.preventDefault();
          navigateTo(PAGE_KEYS[num - 1]);
        } else if (e.key === "0") {
          e.preventDefault();
          navigateTo(PAGE_KEYS[9]); // settings
        }
      }
    }
  }

  /* ── Theme ──────────────────────────────────────────────── */
  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    localStorage.setItem("gofund_theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "dark" ? "#060a14" : "#f0f2f5";
    if (!el.dashboardShell.classList.contains("hidden")) {
      requestAnimationFrame(() => renderCharts());
    }
  }

  /* ── Recurrence Field Toggle ───────────────────────────────── */
  function toggleRecurrenceFields() {
    const mode = el.transactionRecurrence.value;
    el.installmentsLabel.classList.toggle("hidden", mode !== "installments");
    el.recurrenceEndLabel.classList.toggle("hidden", mode !== "monthly");
    if (mode !== "installments") el.transactionInstallments.value = "";
    if (mode !== "monthly") el.transactionRecurrenceEnd.value = "";
  }

  /* ── Auth ─────────────────────────────────────────────────── */
  function restoreSession() {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) { showAuth(); return; }
    try {
      const session = JSON.parse(raw);
      if (!session?.token) { showAuth(); return; }
      state.token = session.token;
      void loadBootstrap();
    } catch { showAuth(); }
  }

  function setAuthMode(mode) {
    const isLogin = mode === "login";
    const isRegister = mode === "register";
    const isForgot = mode === "forgot";
    const isReset = mode === "reset";
    el.showLoginBtn.classList.toggle("is-active", isLogin || isForgot);
    el.showRegisterBtn.classList.toggle("is-active", isRegister);
    el.loginForm.classList.toggle("hidden", !isLogin);
    el.registerForm.classList.toggle("hidden", !isRegister);
    el.forgotPasswordForm.classList.toggle("hidden", !isForgot);
    el.resetPasswordForm.classList.toggle("hidden", !isReset);
    if (isForgot) el.forgotSuccessMsg.classList.add("hidden");
  }

  async function handleLogin(event) {
    event.preventDefault();
    const payload = { email: normalizeString(el.loginEmail.value), password: el.loginPassword.value };
    if (!payload.email || !payload.password) {
      showMessage("auth", "Informe email e senha.", "error");
      return;
    }
    const btn = el.loginForm.querySelector('button[type="submit"]');
    setBtnLoading(btn, true, "Entrando…");
    try {
      const result = await apiRequest("/api/auth/login", { method: "POST", auth: false, body: payload });
      applyAuthResult(result);
      showMessage("app", "Login realizado com sucesso.", "success");
    } catch (error) {
      showMessage("auth", getErrorMessage(error, "Falha no login."), "error");
    } finally { setBtnLoading(btn, false, "Entrar"); }
  }

  async function handleRegister(event) {
    event.preventDefault();
    const payload = {
      name: normalizeString(el.registerName.value),
      email: normalizeString(el.registerEmail.value),
      password: el.registerPassword.value,
    };
    if (!payload.name || !payload.email || payload.password.length < 8) {
      showMessage("auth", "Preencha nome, email e senha com no mínimo 8 caracteres.", "error");
      return;
    }
    const btn = el.registerForm.querySelector('button[type="submit"]');
    setBtnLoading(btn, true, "Criando conta…");
    try {
      const result = await apiRequest("/api/auth/register", { method: "POST", auth: false, body: payload });
      applyAuthResult(result);
      showMessage("app", "Conta criada com sucesso.", "success");
    } catch (error) {
      showMessage("auth", getErrorMessage(error, "Falha no cadastro."), "error");
    } finally { setBtnLoading(btn, false, "Criar conta"); }
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    const email = normalizeString(el.forgotEmail.value);
    if (!email) { showMessage("auth", "Informe seu email.", "error"); return; }
    const btn = el.forgotPasswordForm.querySelector('button[type="submit"]');
    setBtnLoading(btn, true, "Enviando…");
    try {
      await apiRequest("/api/auth/request-reset", { method: "POST", auth: false, body: { email } });
      el.forgotSuccessMsg.classList.remove("hidden");
    } catch (error) {
      showMessage("auth", getErrorMessage(error, "Falha ao enviar link."), "error");
    } finally { setBtnLoading(btn, false, "Enviar link"); }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    const newPass = el.resetNewPassword.value;
    const confirmPass = el.resetConfirmPassword.value;
    if (newPass.length < 8) { showMessage("auth", "A nova senha deve ter no mínimo 8 caracteres.", "error"); return; }
    if (newPass !== confirmPass) { showMessage("auth", "As senhas não conferem.", "error"); return; }
    const params = new URLSearchParams(window.location.search);
    const token = params.get("reset-token");
    if (!token) { showMessage("auth", "Token de redefinição ausente.", "error"); return; }
    const btn = el.resetPasswordForm.querySelector('button[type="submit"]');
    setBtnLoading(btn, true, "Redefinindo…");
    try {
      await apiRequest("/api/auth/confirm-reset", { method: "POST", auth: false, body: { token, newPassword: newPass } });
      showMessage("auth", "Senha redefinida com sucesso! Faça login.", "success");
      window.history.replaceState({}, document.title, window.location.pathname);
      setAuthMode("login");
    } catch (error) {
      showMessage("auth", getErrorMessage(error, "Falha ao redefinir senha. Link expirado?"), "error");
    } finally { setBtnLoading(btn, false, "Redefinir Senha"); }
  }

  function handleLogout() {
    Object.assign(state, { token: "", user: null, transactions: [], budgets: [], goals: [], categories: [], accounts: [] });
    localStorage.removeItem(AUTH_STORAGE_KEY);
    showAuth();
  }

  function applyAuthResult(result) {
    if (!result?.token || !result?.user) throw new Error("Resposta de autenticação inválida.");
    state.token = String(result.token);
    state.user = normalizeUser(result.user);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: state.token }));
    void loadBootstrap();
  }

  async function loadBootstrap() {
    try {
      const data = await apiRequest("/api/bootstrap");
      state.user = normalizeUser(data.user || {});
      state.transactions = Array.isArray(data.transactions) ? data.transactions.map(normalizeTransaction).filter(isValidTransaction) : [];
      state.budgets = Array.isArray(data.budgets) ? data.budgets.map(normalizeBudget).filter(isValidBudget) : [];
      state.goals = Array.isArray(data.goals) ? data.goals.map(normalizeGoal).filter(isValidGoal) : [];
      state.categories = Array.isArray(data.categories) ? data.categories : [];
      state.accounts = Array.isArray(data.accounts) ? data.accounts : [];
      state.projection = normalizeProjection(data.projection);
      el.monthPicker.value = state.selectedMonth;
      hydrateProjectionForm();
      resetTransactionForm();
      resetGoalForm();
      showDashboard();
      renderAll();
    } catch (error) {
      state.token = "";
      localStorage.removeItem(AUTH_STORAGE_KEY);
      showAuth();
      showMessage("auth", getErrorMessage(error, "Sessão inválida. Faça login novamente."), "error");
    }
  }

  function showAuth() {
    el.dashboardShell.classList.add("hidden");
    el.authShell.classList.remove("hidden");
    // Check for reset token in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset-token")) {
      setAuthMode("reset");
    } else {
      setAuthMode("login");
    }
  }

  function showDashboard() {
    el.authShell.classList.add("hidden");
    el.dashboardShell.classList.remove("hidden");
    const name = state.user?.name || "Usuário";
    el.userNameText.textContent = name;
    el.userInitial.textContent = name.charAt(0).toUpperCase();
    navigateTo("dashboard");
  }

  /* ── Render All ──────────────────────────────────────────── */
  function renderAll() {
    populateCategoryFilter();
    populateCategorySelect();
    populateAccountSelector();
    renderKpis();
    renderNetWorthKpi();
    renderAlerts();
    renderTransactionsTable();
    renderBudgets();
    renderGoals();
    renderCharts();
    renderCategories();
    renderAccounts();
    // Lazy pages re-render if currently visible
    if (currentPage === "investments") renderInvestments();
    if (currentPage === "projection") { renderProjectionSummary(); renderProjectionChart(buildProjectionModel()); }
    if (currentPage === "reports") { renderMonthlyReport(); renderPatrimonioEvolutionChart(); renderCompareContent(); }
    if (currentPage === "installments") renderInstallmentPlan();
  }

  function populateCategoryFilter() {
    const cats = new Set();
    state.transactions.forEach((t) => cats.add(t.category));
    const prev = el.filterCategory.value;
    el.filterCategory.innerHTML = '<option value="todas">Todas Categorias</option>' +
      [...cats].sort((a, b) => a.localeCompare(b, "pt-BR")).map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    if ([...cats].some((c) => c === prev || c.toLowerCase() === prev.toLowerCase())) el.filterCategory.value = prev;
  }

  /* ── KPIs ────────────────────────────────────────────────── */

  function renderKpis() {
    const monthly = getMonthlyTransactions(state.selectedMonth);
    // Excluir compras no cartão de crédito dos KPIs — o gasto real é a fatura
    const cashItems = monthly.filter((t) => t.method !== "credito");
    const income = sumByType(cashItems, "receita");
    const expense = sumByType(cashItems, "despesa");
    const investment = sumByType(cashItems, "investimento");
    el.kpiBalance.textContent = formatCurrency(income - expense - investment);
    el.kpiIncome.textContent = formatCurrency(income);
    el.kpiExpense.textContent = formatCurrency(expense);
    el.kpiInvestment.textContent = formatCurrency(investment);
    // KPI informativo: gastos no cartão de crédito este mês
    const creditSpend = monthly.filter((t) => t.method === "credito" && t.type === "despesa").reduce((s, t) => s + t.amount, 0);
    if (el.kpiCreditCard) el.kpiCreditCard.textContent = formatCurrency(creditSpend);
  }

  function sumByType(items, type) {
    return items.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
  }

  /* ── Transactions Table ──────────────────────────────────── */
  function getMonthlyTransactions(month) {
    const effective = [];
    for (const t of state.transactions) {
      const tMonth = t.date.slice(0, 7);

      if (t.recurrence === "monthly") {
        if (tMonth > month) continue;
        if (t.recurrenceEnd && t.recurrenceEnd.slice(0, 7) < month) continue;
        if (tMonth === month) {
          effective.push(t);
        } else {
          const day = Number(t.date.slice(8, 10));
          const [y, m] = month.split("-").map(Number);
          const lastDay = new Date(y, m, 0).getDate();
          const eDay = String(Math.min(day, lastDay)).padStart(2, "0");
          effective.push({ ...t, date: `${month}-${eDay}`, isVirtual: true, originalId: t.id });
        }
        continue;
      }

      if (t.installments > 1) {
        const [sy, sm] = t.date.slice(0, 7).split("-").map(Number);
        const [vy, vm] = month.split("-").map(Number);
        const diff = (vy - sy) * 12 + (vm - sm);
        if (diff >= 0 && diff < t.installments) {
          const day = Number(t.date.slice(8, 10));
          const lastDay = new Date(vy, vm, 0).getDate();
          const eDay = String(Math.min(day, lastDay)).padStart(2, "0");
          const entry = { ...t, installmentNumber: diff + 1 };
          if (diff > 0) { entry.date = `${month}-${eDay}`; entry.isVirtual = true; entry.originalId = t.id; }
          effective.push(entry);
        }
        continue;
      }

      if (tMonth === month) effective.push(t);
    }
    return effective;
  }

  function getFilteredTransactions() {
    const search = normalizeString(el.searchInput.value).toLowerCase();
    const typeFilter = el.filterType.value;
    const catFilter = el.filterCategory.value;
    const methodFilter = el.filterMethod.value;
    const recFilter = el.filterRecurrence.value;
    return getMonthlyTransactions(state.selectedMonth)
      .filter((t) => {
        if (typeFilter !== "todos" && t.type !== typeFilter) return false;
        if (catFilter !== "todas" && t.category.toLowerCase() !== catFilter.toLowerCase()) return false;
        if (methodFilter !== "todos" && t.method !== methodFilter) return false;
        if (recFilter !== "todos" && (t.recurrence || "none") !== recFilter) return false;
        if (!search) return true;
        return `${t.description} ${t.category} ${t.method}`.toLowerCase().includes(search);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }

  function renderTransactionsTable() {
    const items = getFilteredTransactions();
    const total = items.length;
    const pageSize = state.tablePageSize;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (state.tablePage > totalPages) state.tablePage = totalPages;
    const start = (state.tablePage - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);

    el.transactionsTableBody.innerHTML = "";
    el.transactionsCardsContainer.innerHTML = "";
    if (!total) {
      el.transactionsEmptyState.style.display = "block";
      el.tableFilterSummary.innerHTML = "";
      el.tablePagination.innerHTML = "";
      return;
    }
    el.transactionsEmptyState.style.display = "none";

    // Filter summary with totals
    const totalIncome = items.filter((t) => t.type === "receita").reduce((s, t) => s + t.amount, 0);
    const totalExpense = items.filter((t) => t.type === "despesa").reduce((s, t) => s + t.amount, 0);
    const totalInvest = items.filter((t) => t.type === "investimento").reduce((s, t) => s + t.amount, 0);
    const parts = [`<strong>${total}</strong> movimentações`];
    if (totalIncome > 0) parts.push(`<span class="positive">+${formatCurrency(totalIncome)}</span>`);
    if (totalExpense > 0) parts.push(`<span class="negative">-${formatCurrency(totalExpense)}</span>`);
    if (totalInvest > 0) parts.push(`<span class="warning">${formatCurrency(totalInvest)}</span>`);
    el.tableFilterSummary.innerHTML = `<span>${parts.join(" &middot; ")}</span><span>Pág ${state.tablePage}/${totalPages}</span>`;

    // Render table rows (desktop)
    el.transactionsTableBody.innerHTML = pageItems.map((t) => {
      const cls = t.type === "receita" ? "value-income" : t.type === "despesa" ? "value-expense" : t.type === "transferencia" ? "value-transfer" : "value-investment";
      const sign = t.type === "receita" ? "+" : "-";
      const isCC = t.method === "credito";
      let badges = `<span class="tag ${t.type}">${t.type === "transferencia" ? "transferência" : t.type}</span>`;
      if (isCC) badges += ` <span class="tag credito-badge">💳 próx. fatura</span>`;
      if (t.recurrence === "monthly") badges += ` <span class="tag recurrence">mensal</span>`;
      if (t.installments > 1) badges += ` <span class="tag recurrence">${t.installmentNumber || 1}/${t.installments}</span>`;
      const actions = t.isVirtual
        ? `<button class="mini-btn" data-action="edit-transaction" data-id="${t.originalId || t.id}" type="button">Ver original</button>`
        : `<button class="mini-btn" data-action="edit-transaction" data-id="${t.id}" type="button">Editar</button>
           <button class="mini-btn" data-action="delete-transaction" data-id="${t.id}" type="button">Excluir</button>`;
      return `<tr class="${isCC ? "credit-card-row" : ""}">
        <td>${escapeHtml(t.description)}</td>
        <td>${escapeHtml(t.category)}</td>
        <td>${escapeHtml(getMethodLabel(t.method))}</td>
        <td>${formatDate(t.date)}</td>
        <td class="${cls}">${sign} ${formatCurrency(t.amount)}</td>
        <td>${badges}<div class="mini-actions">${actions}</div></td>
      </tr>`;
    }).join("");

    // Render cards (mobile)
    el.transactionsCardsContainer.innerHTML = pageItems.map((t) => {
      const cls = t.type === "receita" ? "value-income" : t.type === "despesa" ? "value-expense" : t.type === "transferencia" ? "value-transfer" : "value-investment";
      const sign = t.type === "receita" ? "+" : "-";
      const isCC = t.method === "credito";
      const actions = t.isVirtual
        ? `<button class="btn ghost" data-action="edit-transaction" data-id="${t.originalId || t.id}" type="button">Ver original</button>`
        : `<button class="btn ghost" data-action="edit-transaction" data-id="${t.id}" type="button">Editar</button>
           <button class="btn ghost" data-action="delete-transaction" data-id="${t.id}" type="button">Excluir</button>`;

      let badges = `<span class="tag ${t.type}">${t.type === "transferencia" ? "transferência" : t.type}</span>`;
      if (isCC) badges += ` <span class="tag credito-badge">💳 próx. fatura</span>`;
      if (t.recurrence === "monthly") badges += ` <span class="tag recurrence">mensal</span>`;
      if (t.installments > 1) badges += ` <span class="tag recurrence">${t.installmentNumber || 1}/${t.installments}</span>`;

      return `<div class="transaction-card ${isCC ? "credit-card-row" : ""}">
        <div class="transaction-card-header">
          <div class="transaction-card-title">${escapeHtml(t.description)}</div>
          <div class="transaction-card-amount ${cls}">${sign}${formatCurrency(t.amount)}</div>
        </div>
        <div class="transaction-card-body">
          <div class="transaction-card-row">
            <span class="transaction-card-label">Categoria</span>
            <span>${escapeHtml(t.category)}</span>
          </div>
          <div class="transaction-card-row">
            <span class="transaction-card-label">Método</span>
            <span>${escapeHtml(getMethodLabel(t.method))}</span>
          </div>
          <div class="transaction-card-row">
            <span class="transaction-card-label">Data</span>
            <span>${formatDate(t.date)}</span>
          </div>
          <div class="transaction-card-row">
            <span class="transaction-card-label">Tipo</span>
            <span>${badges}</span>
          </div>
        </div>
        <div class="transaction-card-actions">${actions}</div>
      </div>`;
    }).join("");

    // Pagination controls
    if (totalPages <= 1) { el.tablePagination.innerHTML = ""; return; }
    let pag = `<button ${state.tablePage <= 1 ? "disabled" : ""} data-page="${state.tablePage - 1}">&lt;</button>`;
    const maxBtns = 7;
    let s = Math.max(1, state.tablePage - Math.floor(maxBtns / 2));
    let e = Math.min(totalPages, s + maxBtns - 1);
    if (e - s + 1 < maxBtns) s = Math.max(1, e - maxBtns + 1);
    if (s > 1) pag += `<button data-page="1">1</button><span class="page-info">…</span>`;
    for (let i = s; i <= e; i++) pag += `<button data-page="${i}" class="${i === state.tablePage ? 'is-active' : ''}">${i}</button>`;
    if (e < totalPages) pag += `<span class="page-info">…</span><button data-page="${totalPages}">${totalPages}</button>`;
    pag += `<button ${state.tablePage >= totalPages ? "disabled" : ""} data-page="${state.tablePage + 1}">&gt;</button>`;
    el.tablePagination.innerHTML = pag;
    el.tablePagination.querySelectorAll("button[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tablePage = Number(btn.dataset.page);
        renderTransactionsTable();
      });
    });
  }

  /* ── Transaction CRUD ────────────────────────────────────── */
  async function handleTransactionSubmit(event) {
    event.preventDefault();
    const recMode = el.transactionRecurrence.value;
    const payload = {
      id: editingTransactionId || undefined,
      description: normalizeString(el.transactionDescription.value),
      amount: Number(el.transactionAmount.value),
      date: el.transactionDate.value,
      category: normalizeCategory(el.transactionCategory.value),
      type: el.transactionType.value,
      method: el.transactionMethod.value,
      recurrence: recMode === "monthly" ? "monthly" : "none",
      recurrenceEnd: recMode === "monthly" ? el.transactionRecurrenceEnd.value || "" : "",
      installments: recMode === "installments" ? Number(el.transactionInstallments.value) || 0 : 0,
      accountId: el.transactionAccount.value || "",
    };
    if (!isValidTransaction(payload)) { showMessage("app", "Dados inválidos.", "error"); return; }
    try {
      if (editingTransactionId) {
        const updated = normalizeTransaction(await apiRequest(`/api/transactions/${encodeURIComponent(editingTransactionId)}`, { method: "PUT", body: payload }));
        const idx = state.transactions.findIndex((t) => t.id === editingTransactionId);
        if (idx >= 0) state.transactions[idx] = updated;
        showMessage("app", "Movimentação atualizada.", "success");
      } else {
        const created = normalizeTransaction(await apiRequest("/api/transactions", { method: "POST", body: payload }));
        state.transactions.push(created);
        showMessage("app", "Movimentação criada.", "success");
      }
      resetTransactionForm();
      renderAll();
    } catch (error) {
      showMessage("app", getErrorMessage(error, "Falha ao salvar."), "error");
    }
  }

  async function handleTransactionTableActions(event) {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const { id, action } = btn.dataset;
    const item = state.transactions.find((t) => t.id === id);
    if (!item) return;

    if (action === "edit-transaction") {
      editingTransactionId = item.id;
      el.transactionDescription.value = item.description;
      el.transactionAmount.value = item.amount;
      el.transactionDate.value = item.date;
      el.transactionCategory.value = item.category;
      el.transactionType.value = item.type;
      el.transactionMethod.value = item.method;
      el.transactionAccount.value = item.accountId || "";
      // Populate recurrence fields
      if (item.recurrence === "monthly") {
        el.transactionRecurrence.value = "monthly";
        el.transactionRecurrenceEnd.value = item.recurrenceEnd || "";
      } else if (item.installments > 1) {
        el.transactionRecurrence.value = "installments";
        el.transactionInstallments.value = item.installments;
      } else {
        el.transactionRecurrence.value = "none";
      }
      toggleRecurrenceFields();
      el.transactionSubmitBtn.textContent = "Atualizar";
      el.cancelTransactionEditBtn.classList.remove("hidden");
      el.transactionForm.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (action === "delete-transaction") {
      const confirmed = await showConfirmDialog({
        title: "Excluir movimentação",
        message: "Deseja excluir esta movimentação?",
        confirmLabel: "Excluir",
        tone: "danger",
      });
      if (!confirmed) return;
      try {
        await apiRequest(`/api/transactions/${encodeURIComponent(id)}`, { method: "DELETE", expectNoContent: true });
        state.transactions = state.transactions.filter((t) => t.id !== id);
        resetTransactionForm();
        renderAll();
        showMessage("app", "Movimentação removida.", "success");
      } catch (error) {
        showMessage("app", getErrorMessage(error, "Falha ao excluir."), "error");
      }
    }
  }

  function resetTransactionForm() {
    editingTransactionId = null;
    el.transactionForm.reset();
    el.transactionDate.value = getTodayDate();
    el.transactionType.value = "receita";
    el.transactionMethod.value = "pix";
    el.transactionRecurrence.value = "none";
    toggleRecurrenceFields();
    el.transactionSubmitBtn.textContent = "Salvar";
    el.cancelTransactionEditBtn.classList.add("hidden");
  }

  /* ── Budgets ─────────────────────────────────────────────── */
  function renderBudgets() {
    if (!state.budgets.length) {
      el.budgetsList.innerHTML = '<div class="info-banner"><p><strong>💰 Orçamentos</strong></p><p>Defina limites de gastos por categoria para controlar suas despesas. O sistema alertará quando você ultrapassar os limites.</p></div><p class="empty-state">Nenhum orçamento definido. Use o formulário acima para criar seu primeiro orçamento.</p>';
      return;
    }
    const expenses = {};
    getMonthlyTransactions(state.selectedMonth)
      .filter((t) => t.type === "despesa" || t.type === "investimento")
      .forEach((t) => { expenses[t.category.toLowerCase()] = (expenses[t.category.toLowerCase()] || 0) + t.amount; });

    el.budgetsList.innerHTML = state.budgets
      .slice().sort((a, b) => a.category.localeCompare(b.category, "pt-BR"))
      .map((b) => {
        const used = expenses[b.category.toLowerCase()] || 0;
        const ratio = b.limit > 0 ? used / b.limit : 0;
        const width = Math.min(ratio * 100, 100);
        const isOver = ratio > 1;
        return `<article class="item-card">
          <h4>${escapeHtml(b.category)}</h4>
          <p>${formatCurrency(used)} / ${formatCurrency(b.limit)} (${(ratio * 100).toFixed(1)}%)</p>
          <div class="progress${isOver ? " over-budget" : ""}"><span style="width:${width}%"></span></div>
          <div class="mini-actions">
            <button class="mini-btn" data-action="edit-budget" data-id="${b.id}" type="button">Editar</button>
            <button class="mini-btn" data-action="delete-budget" data-id="${b.id}" type="button">Excluir</button>
          </div>
        </article>`;
      }).join("");
  }

  async function handleBudgetSubmit(event) {
    event.preventDefault();
    const payload = { id: editingBudgetId || undefined, category: normalizeCategory(el.budgetCategory.value), limit: Number(el.budgetLimit.value) };
    if (!payload.category || !Number.isFinite(payload.limit) || payload.limit <= 0) {
      showMessage("app", "Categoria e limite são obrigatórios.", "error");
      return;
    }
    try {
      if (editingBudgetId) {
        const updated = normalizeBudget(await apiRequest(`/api/budgets/${encodeURIComponent(editingBudgetId)}`, { method: "PUT", body: payload }));
        const idx = state.budgets.findIndex((b) => b.id === editingBudgetId);
        if (idx >= 0) state.budgets[idx] = updated;
      } else {
        state.budgets.push(normalizeBudget(await apiRequest("/api/budgets", { method: "POST", body: payload })));
      }
      editingBudgetId = null;
      el.budgetForm.reset();
      renderBudgets();
      showMessage("app", "Orçamento salvo.", "success");
    } catch (error) {
      showMessage("app", getErrorMessage(error, "Falha ao salvar orçamento."), "error");
    }
  }

  async function handleBudgetActions(event) {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const { id, action } = btn.dataset;
    const item = state.budgets.find((b) => b.id === id);
    if (!item) return;

    if (action === "edit-budget") {
      editingBudgetId = item.id;
      el.budgetCategory.value = item.category;
      el.budgetLimit.value = item.limit;
      el.budgetCategory.focus();
      showMessage("app", "Editando orçamento.", "success");
      return;
    }
    if (action === "delete-budget") {
      const confirmed = await showConfirmDialog({
        title: "Excluir orçamento",
        message: "Deseja excluir este orçamento?",
        confirmLabel: "Excluir",
        tone: "danger",
      });
      if (!confirmed) return;
      try {
        await apiRequest(`/api/budgets/${encodeURIComponent(id)}`, { method: "DELETE", expectNoContent: true });
        state.budgets = state.budgets.filter((b) => b.id !== id);
        if (editingBudgetId === id) resetBudgetForm();
        renderBudgets();
        showMessage("app", "Orçamento removido.", "success");
      } catch (error) {
        showMessage("app", getErrorMessage(error, "Falha ao excluir."), "error");
      }
    }
  }

  function resetBudgetForm() { editingBudgetId = null; el.budgetForm.reset(); }

  /* ── Goals ───────────────────────────────────────────────── */
  async function handleGoalSubmit(event) {
    event.preventDefault();
    const payload = {
      id: editingGoalId || undefined,
      name: normalizeString(el.goalName.value),
      target: Number(el.goalTarget.value),
      current: Number(el.goalCurrent.value),
      dueDate: el.goalDueDate.value || "",
    };
    if (!isValidGoal(payload)) { showMessage("app", "Dados inválidos para meta.", "error"); return; }
    try {
      if (editingGoalId) {
        const updated = normalizeGoal(await apiRequest(`/api/goals/${encodeURIComponent(editingGoalId)}`, { method: "PUT", body: payload }));
        const idx = state.goals.findIndex((g) => g.id === editingGoalId);
        if (idx >= 0) state.goals[idx] = updated;
        showMessage("app", "Meta atualizada.", "success");
      } else {
        state.goals.push(normalizeGoal(await apiRequest("/api/goals", { method: "POST", body: payload })));
        showMessage("app", "Meta criada.", "success");
      }
      resetGoalForm();
      renderGoals();
    } catch (error) {
      showMessage("app", getErrorMessage(error, "Falha ao salvar meta."), "error");
    }
  }

  async function handleGoalActions(event) {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const { id, action } = btn.dataset;
    const goal = state.goals.find((g) => g.id === id);
    if (!goal) return;

    if (action === "edit-goal") {
      editingGoalId = goal.id;
      el.goalName.value = goal.name;
      el.goalTarget.value = goal.target;
      el.goalCurrent.value = goal.current;
      el.goalDueDate.value = goal.dueDate || "";
      el.goalSubmitBtn.textContent = "Atualizar Meta";
      el.cancelGoalEditBtn.classList.remove("hidden");
      el.goalForm.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (action === "delete-goal") {
      const confirmed = await showConfirmDialog({
        title: "Excluir meta",
        message: "Deseja excluir esta meta?",
        confirmLabel: "Excluir",
        tone: "danger",
      });
      if (!confirmed) return;
      try {
        await apiRequest(`/api/goals/${encodeURIComponent(id)}`, { method: "DELETE", expectNoContent: true });
        state.goals = state.goals.filter((g) => g.id !== id);
        if (editingGoalId === id) resetGoalForm();
        renderGoals();
        showMessage("app", "Meta removida.", "success");
      } catch (error) {
        showMessage("app", getErrorMessage(error, "Falha ao excluir meta."), "error");
      }
    }
  }

  async function handleGoalContribution(event) {
    const form = event.target.closest("form[data-action='add-goal-value']");
    if (!form) return;
    event.preventDefault();
    const id = String(form.dataset.id || "");
    const input = form.querySelector("input[name='goalContribution']");
    const amount = Number(input?.value || "");
    if (!id || !Number.isFinite(amount) || amount <= 0) {
      showMessage("app", "Informe um aporte válido.", "error");
      return;
    }
    try {
      const updated = normalizeGoal(await apiRequest(`/api/goals/${encodeURIComponent(id)}/contributions`, { method: "POST", body: { amount } }));
      const idx = state.goals.findIndex((g) => g.id === id);
      if (idx >= 0) state.goals[idx] = updated;
      if (input) input.value = "";
      renderGoals();
      showMessage("app", "Aporte registrado.", "success");
    } catch (error) {
      showMessage("app", getErrorMessage(error, "Falha ao registrar aporte."), "error");
    }
  }

  function resetGoalForm() {
    editingGoalId = null;
    el.goalForm.reset();
    el.goalSubmitBtn.textContent = "Criar Meta";
    el.cancelGoalEditBtn.classList.add("hidden");
  }

  /* ── Investments ─────────────────────────────────────────── */
  function getInvestmentYields() {
    try { return JSON.parse(localStorage.getItem("gofund_investment_yields") || "{}"); } catch { return {}; }
  }

  function setInvestmentYield(category, rate) {
    const yields = getInvestmentYields();
    yields[category] = rate;
    localStorage.setItem("gofund_investment_yields", JSON.stringify(yields));
  }

  function getInvestmentStats() {
    const allInvestments = state.transactions.filter((t) => t.type === "investimento");
    const totalInvested = allInvestments.reduce((s, t) => s + t.amount, 0);
    if (totalInvested <= 0) return { totalInvested: 0, avgMonthlyRate: 0, estimatedMonthlyYield: 0 };
    const yields = getInvestmentYields();
    const groups = {};
    allInvestments.forEach((t) => {
      if (!groups[t.category]) groups[t.category] = 0;
      groups[t.category] += t.amount;
    });
    let weightedSum = 0;
    Object.entries(groups).forEach(([cat, total]) => { weightedSum += (yields[cat] || 0) * total; });
    const avgMonthlyRate = weightedSum / totalInvested / 100;
    return { totalInvested: round2(totalInvested), avgMonthlyRate, estimatedMonthlyYield: round2(totalInvested * avgMonthlyRate) };
  }

  function renderInvestments() {
    const monthly = getMonthlyTransactions(state.selectedMonth);
    const investments = monthly.filter((t) => t.type === "investimento");
    const allInvestments = state.transactions.filter((t) => t.type === "investimento");
    const totalAllTime = allInvestments.reduce((s, t) => s + t.amount, 0);
    const totalThisMonth = investments.reduce((s, t) => s + t.amount, 0);

    const groups = {};
    investments.forEach((t) => {
      const cat = t.category;
      if (!groups[cat]) groups[cat] = { total: 0, count: 0 };
      groups[cat].total += t.amount;
      groups[cat].count++;
    });

    const yields = getInvestmentYields();
    let projected12 = 0;
    Object.entries(groups).forEach(([cat, data]) => {
      const r = (yields[cat] || 0) / 100;
      projected12 += r > 0 ? data.total * Math.pow(1 + r, 12) : data.total;
    });

    const avgYield = Object.keys(groups).length > 0
      ? Object.entries(groups).reduce((s, [cat, d]) => s + (yields[cat] || 0) * d.total, 0) / Math.max(totalThisMonth, 1)
      : 0;

    el.investmentsKpis.innerHTML = `
      <article class="kpi-card"><p>Investido este mês</p><strong class="warning">${formatCurrency(totalThisMonth)}</strong></article>
      <article class="kpi-card"><p>Total investido (geral)</p><strong class="warning">${formatCurrency(totalAllTime)}</strong></article>
      <article class="kpi-card"><p>Projeção 12 meses</p><strong class="positive">${formatCurrency(projected12)}</strong></article>
      <article class="kpi-card"><p>Rend. médio ponderado</p><strong>${avgYield.toFixed(2)}% a.m.</strong></article>
    `;

    if (!Object.keys(groups).length) {
      el.investmentsList.innerHTML = `
        <div class="info-banner" style="margin-bottom: 1.5rem;">
          <p><strong>📊 Como usar a Carteira de Investimentos</strong></p>
          <p>Esta seção acompanha automaticamente seus investimentos registrados como movimentações do tipo "Investimento".</p>
          <p><strong>Para começar:</strong> Crie uma movimentação do tipo "Investimento" na aba Movimentações.</p>
          <p><strong>Defina taxas de rendimento:</strong> Para ver projeções futuras, informe a taxa mensal esperada de cada categoria.</p>
        </div>
        <p class="empty-state">Nenhum investimento neste mês. Registre investimentos na aba Movimentações para começar a acompanhar.</p>
      `;
      return;
    }

    // Reference rates
    const CDI_MENSAL = 1.15;
    const POUPANCA_MENSAL = 0.60;

    el.investmentsList.innerHTML = `
      <div class="info-banner" style="margin-bottom: 1.5rem;">
        <p><strong>📊 Dica:</strong> Informe a taxa de rendimento mensal esperada de cada categoria para ver projeções futuras do seu patrimônio.</p>
      </div>
      <article class="item-card" style="border-color: var(--border-accent);">
        <h4>Referências de Mercado</h4>
        <p>CDI: ~${CDI_MENSAL}% a.m. · Poupança: ~${POUPANCA_MENSAL}% a.m.</p>
      </article>
    ` + Object.entries(groups)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([cat, data]) => {
        const yieldPct = yields[cat] || 0;
        const r = yieldPct / 100;
        const proj = r > 0 ? data.total * Math.pow(1 + r, 12) : data.total;
        const gain = proj - data.total;
        return `<article class="item-card">
          <h4>${escapeHtml(cat)}</h4>
          <p>Aplicado: ${formatCurrency(data.total)} (${data.count} operações)</p>
          <p>Rend.: <strong>${yieldPct.toFixed(2)}%</strong> a.m. · Projeção 12m: <span class="positive">${formatCurrency(proj)}</span> (${gain >= 0 ? "+" : ""}${formatCurrency(gain)})</p>
          <form class="mini-actions" data-action="set-yield" data-category="${escapeHtml(cat)}">
            <input type="number" name="yield" min="0" max="100" step="0.01" placeholder="% mensal" value="${yieldPct || ""}" />
            <button class="mini-btn" type="submit">Definir Rend.</button>
          </form>
        </article>`;
      }).join("");
  }

  function handleInvestmentYield(event) {
    const form = event.target.closest("form[data-action='set-yield']");
    if (!form) return;
    event.preventDefault();
    const cat = form.dataset.category;
    const input = form.querySelector("input[name='yield']");
    const val = Number(input?.value || 0);
    if (val < 0 || val > 100) { showMessage("app", "Rendimento deve ser entre 0% e 100%.", "error"); return; }
    setInvestmentYield(cat, val);
    renderInvestments();
    showMessage("app", `Rendimento de ${cat} atualizado para ${val.toFixed(2)}%.`, "success");
  }

  /* ── Password Change ─────────────────────────────────────── */
  async function handleChangePassword(event) {
    event.preventDefault();
    const current = el.currentPassword.value;
    const newPwd = el.newPassword.value;
    const confirm = el.confirmNewPassword.value;

    if (!current) { showMessage("app", "Informe a senha atual.", "error"); return; }
    if (newPwd.length < 8) { showMessage("app", "Nova senha deve ter no mínimo 8 caracteres.", "error"); return; }
    if (newPwd !== confirm) { showMessage("app", "As senhas não conferem.", "error"); return; }
    if (!/[a-zA-Z]/.test(newPwd) || !/\d/.test(newPwd)) {
      showMessage("app", "Nova senha deve conter letras e números.", "error"); return;
    }

    try {
      await apiRequest("/api/auth/password", { method: "PUT", body: { currentPassword: current, newPassword: newPwd } });
      el.changePasswordForm.reset();
      showMessage("app", "Senha alterada com sucesso.", "success");
    } catch (error) {
      showMessage("app", getErrorMessage(error, "Falha ao alterar senha."), "error");
    }
  }

  function renderGoals() {
    if (!state.goals.length) {
      el.goalsList.innerHTML = '<div class="info-banner"><p><strong>🎯 Metas Financeiras</strong></p><p>Crie metas de economia com valor alvo e prazo. Faça aportes regulares e acompanhe o progresso visual.</p></div><p class="empty-state">Nenhuma meta cadastrada. Defina objetivos financeiros acima para começar a poupar.</p>';
      return;
    }
    const today = new Date(`${getTodayDate()}T00:00:00`);
    el.goalsList.innerHTML = state.goals
      .slice().sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return a.name.localeCompare(b.name, "pt-BR");
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      })
      .map((g) => {
        const ratio = g.target > 0 ? g.current / g.target : 0;
        const percent = Math.min(ratio * 100, 100);
        const due = g.dueDate ? new Date(`${g.dueDate}T00:00:00`) : null;
        const isComplete = g.current >= g.target;
        const isOverdue = Boolean(due && !isComplete && due < today);
        const dueText = g.dueDate ? formatGoalDueDate(g.dueDate) : "Sem prazo";
        const status = isComplete ? "✓ Concluída" : isOverdue ? "⚠ Atrasada" : "Em andamento";
        return `<article class="item-card">
          <h4>${escapeHtml(g.name)}</h4>
          <p>${formatCurrency(g.current)} / ${formatCurrency(g.target)} (${(ratio * 100).toFixed(1)}%)</p>
          <p>${escapeHtml(dueText)} — ${status}</p>
          <div class="progress"><span style="width:${percent}%"></span></div>
          <form class="mini-actions" data-action="add-goal-value" data-id="${g.id}">
            <input type="number" name="goalContribution" min="0.01" step="0.01" placeholder="Aporte (R$)" required />
            <button class="mini-btn" type="submit">Adicionar</button>
          </form>
          <div class="mini-actions">
            <button class="mini-btn" data-action="edit-goal" data-id="${g.id}" type="button">Editar</button>
            <button class="mini-btn" data-action="delete-goal" data-id="${g.id}" type="button">Excluir</button>
          </div>
        </article>`;
      }).join("");
  }

  /* ── Projection ──────────────────────────────────────────── */

  /* ── Net Worth KPI ───────────────────────────────────────── */
  function renderNetWorthKpi() {
    // Compras no cartão não afetam patrimônio — o gasto real é a fatura paga
    const real = state.transactions.filter((t) => t.method !== "credito");
    const totalIncome = real.filter((t) => t.type === "receita").reduce((s, t) => s + t.amount, 0);
    const totalExpense = real.filter((t) => t.type === "despesa").reduce((s, t) => s + t.amount, 0);
    const totalInvestment = real.filter((t) => t.type === "investimento").reduce((s, t) => s + t.amount, 0);
    // Transferências e compras cartão não afetam patrimônio líquido
    const cash = totalIncome - totalExpense - totalInvestment;
    const goalsSaved = state.goals.reduce((s, g) => s + g.current, 0);
    const investStats = getInvestmentStats();
    const netWorth = round2(cash + investStats.totalInvested + goalsSaved);
    el.kpiNetWorth.textContent = formatCurrency(netWorth);
    el.kpiNetWorth.className = netWorth >= 0 ? "positive" : "negative";
  }

  /* ── Alerts & Notifications ──────────────────────────────── */
  function renderAlerts() {
    const alerts = [];
    const month = state.selectedMonth;
    const monthly = getMonthlyTransactions(month);
    const expenses = {};
    monthly.filter((t) => (t.type === "despesa" || t.type === "investimento") && t.method !== "credito")
      .forEach((t) => { expenses[t.category.toLowerCase()] = (expenses[t.category.toLowerCase()] || 0) + t.amount; });

    state.budgets.forEach((b) => {
      const used = expenses[b.category.toLowerCase()] || 0;
      if (used > b.limit) {
        alerts.push({ type: "danger", icon: "🔴", text: `Orçamento de "${b.category}" excedido: ${formatCurrency(used)} / ${formatCurrency(b.limit)} (${((used / b.limit) * 100).toFixed(0)}%)` });
      } else if (used > b.limit * 0.85) {
        alerts.push({ type: "warning", icon: "⚠️", text: `"${b.category}" atingiu ${((used / b.limit) * 100).toFixed(0)}% do orçamento (${formatCurrency(used)} / ${formatCurrency(b.limit)})` });
      }
    });

    const today = new Date(`${getTodayDate()}T00:00:00`);
    state.goals.forEach((g) => {
      if (g.current >= g.target) return;
      if (!g.dueDate) return;
      const due = new Date(`${g.dueDate}T00:00:00`);
      const diff = Math.ceil((due - today) / 86400000);
      if (diff < 0) {
        alerts.push({ type: "danger", icon: "🎯", text: `Meta "${g.name}" venceu há ${Math.abs(diff)} dias — faltam ${formatCurrency(g.target - g.current)}` });
      } else if (diff <= 15) {
        alerts.push({ type: "warning", icon: "🎯", text: `Meta "${g.name}" vence em ${diff} dias — faltam ${formatCurrency(g.target - g.current)}` });
      }
    });

    const recurring = state.transactions.filter((t) => t.recurrence === "monthly");
    const upcomingRecurring = recurring.filter((t) => {
      const tMonth = t.date.slice(0, 7);
      if (tMonth > month) return false;
      if (t.recurrenceEnd && t.recurrenceEnd.slice(0, 7) < month) return false;
      return true;
    });
    if (upcomingRecurring.length > 0) {
      const total = upcomingRecurring.reduce((s, t) => s + t.amount, 0);
      alerts.push({ type: "info", icon: "🔁", text: `${upcomingRecurring.length} despesas recorrentes este mês (${formatCurrency(total)})` });
    }

    el.alertsBar.innerHTML = alerts.map((a) => `
      <div class="alert-item alert-${a.type}">
        <span class="alert-icon">${a.icon}</span>
        <span class="alert-text">${escapeHtml(a.text)}</span>
        <button class="alert-dismiss" onclick="this.parentElement.remove()" type="button">&times;</button>
      </div>
    `).join("");
  }

  /* ── Categories CRUD ─────────────────────────────────────── */
  function populateCategorySelect() {
    const cats = state.categories.length > 0 ? state.categories : [];
    const usedCats = new Set(state.transactions.map((t) => t.category));
    const all = new Set([...cats.map((c) => c.name), ...usedCats]);
    const sorted = [...all].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const options = `<option value="" disabled selected>Selecione...</option>` + sorted.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");

    // Transaction category
    const prevTx = el.transactionCategory.value;
    el.transactionCategory.innerHTML = options;
    if (prevTx && sorted.includes(prevTx)) el.transactionCategory.value = prevTx;

    // Budget category
    const prevBudget = el.budgetCategory.value;
    el.budgetCategory.innerHTML = options;
    if (prevBudget && sorted.includes(prevBudget)) el.budgetCategory.value = prevBudget;
  }

  function renderCategories() {
    if (!state.categories.length) {
      el.categoriesList.innerHTML = '<div class="info-banner"><p><strong>🏷️ Categorias Personalizadas</strong></p><p>Crie categorias personalizadas para organizar suas movimentações. O sistema já possui categorias padrão, mas você pode adicionar as suas.</p></div><p class="empty-state">Nenhuma categoria personalizada. Use o formulário acima para criar novas categorias.</p>';
      return;
    }
    const typeLabels = { receita: "Receita", despesa: "Despesa", investimento: "Investimento", todas: "Todas" };
    el.categoriesList.innerHTML = state.categories
      .slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((c) => `<article class="item-card">
        <h4>${escapeHtml(c.icon || "📁")} ${escapeHtml(c.name)}</h4>
        <p>Tipo: ${typeLabels[c.type] || c.type}</p>
        <div class="mini-actions">
          <button class="mini-btn" data-action="edit-category" data-id="${c.id}" type="button">Editar</button>
          <button class="mini-btn" data-action="delete-category" data-id="${c.id}" type="button">Excluir</button>
        </div>
      </article>`).join("");
  }

  async function handleCategorySubmit(event) {
    event.preventDefault();
    const payload = {
      id: editingCategoryId || undefined,
      name: normalizeString(el.categoryName.value),
      type: el.categoryType.value,
      icon: normalizeString(el.categoryIcon.value) || "📁",
    };
    if (!payload.name) { showMessage("app", "Nome da categoria é obrigatório.", "error"); return; }
    try {
      if (editingCategoryId) {
        const updated = await apiRequest(`/api/categories/${encodeURIComponent(editingCategoryId)}`, { method: "PUT", body: payload });
        const idx = state.categories.findIndex((c) => c.id === editingCategoryId);
        if (idx >= 0) state.categories[idx] = updated;
        showMessage("app", "Categoria atualizada.", "success");
      } else {
        const created = await apiRequest("/api/categories", { method: "POST", body: payload });
        state.categories.push(created);
        showMessage("app", "Categoria criada.", "success");
      }
      resetCategoryForm();
      renderCategories();
      populateCategorySelect();
    } catch (error) {
      showMessage("app", getErrorMessage(error, "Falha ao salvar categoria."), "error");
    }
  }

  async function handleCategoryActions(event) {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const { id, action } = btn.dataset;
    const item = state.categories.find((c) => c.id === id);
    if (!item) return;
    if (action === "edit-category") {
      editingCategoryId = item.id;
      el.categoryName.value = item.name;
      el.categoryType.value = item.type;
      el.categoryIcon.value = item.icon || "";
      el.categorySubmitBtn.textContent = "Atualizar";
      el.cancelCategoryEditBtn.classList.remove("hidden");
      el.categoryForm.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (action === "delete-category") {
      const confirmed = await showConfirmDialog({
        title: "Excluir categoria",
        message: `Excluir a categoria "${item.name}"?`,
        confirmLabel: "Excluir",
        tone: "danger",
      });
      if (!confirmed) return;
      try {
        await apiRequest(`/api/categories/${encodeURIComponent(id)}`, { method: "DELETE", expectNoContent: true });
        state.categories = state.categories.filter((c) => c.id !== id);
        if (editingCategoryId === id) resetCategoryForm();
        renderCategories();
        populateCategorySelect();
        showMessage("app", "Categoria removida.", "success");
      } catch (error) {
        showMessage("app", getErrorMessage(error, "Falha ao excluir categoria."), "error");
      }
    }
  }

  function resetCategoryForm() {
    editingCategoryId = null;
    el.categoryForm.reset();
    el.categorySubmitBtn.textContent = "Criar Categoria";
    el.cancelCategoryEditBtn.classList.add("hidden");
  }

  /* ── Accounts CRUD ───────────────────────────────────────── */
  function populateAccountSelector() {
    const sel = el.transactionAccount;
    const prev = sel.value;
    sel.innerHTML = '<option value="">Sem conta</option>' +
      state.accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
    if (state.accounts.some((a) => a.id === prev)) sel.value = prev;
  }

  function getAccountBalance(accountId) {
    const account = state.accounts.find((a) => a.id === accountId);
    if (!account) return 0;
    // Balance computed from transactions (backend auto-creates "Saldo inicial" receita)
    let balance = 0;
    const linked = state.transactions.filter((t) => t.accountId === accountId);
    linked.forEach((t) => {
      if (t.type === "transferencia") return;
      if (t.method === "credito") return;
      balance += t.type === "receita" ? t.amount : -t.amount;
    });
    // Fallback for legacy accounts without auto-transaction
    if (balance === 0 && (account.initialBalance || 0) > 0 && linked.length === 0) {
      balance = account.initialBalance;
    }
    return round2(balance);
  }

  function renderAccounts() {
    if (!state.accounts.length) {
      el.accountsList.innerHTML = '<div class="info-banner"><p><strong>🏦 Contas e Cartões</strong></p><p>Cadastre suas contas bancárias e cartões para separar transações entre diferentes origens. Você pode acompanhar o saldo de cada conta individualmente.</p></div><p class="empty-state">Nenhuma conta cadastrada. Adicione suas contas acima para organizar melhor suas finanças.</p>';
      return;
    }
    const typeLabels = { corrente: "Conta Corrente", poupanca: "Poupança", carteira: "Carteira", investimento: "Investimento", credito: "Cartão de Crédito" };
    el.accountsList.innerHTML = state.accounts
      .slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((a) => {
        const bal = getAccountBalance(a.id);
        return `<article class="account-card" style="border-left-color:${escapeHtml(a.color || "#5e7fff")}">
          <div class="account-info">
            <h4>${escapeHtml(a.name)}</h4>
            <p>${typeLabels[a.type] || a.type}</p>
          </div>
          <div>
            <span class="account-balance ${bal >= 0 ? "positive" : "negative"}">${formatCurrency(bal)}</span>
            <div class="mini-actions" style="margin-top:0.5rem">
              <button class="mini-btn" data-action="edit-account" data-id="${a.id}" type="button">Editar</button>
              <button class="mini-btn" data-action="delete-account" data-id="${a.id}" type="button">Excluir</button>
            </div>
          </div>
        </article>`;
      }).join("");
  }

  async function handleAccountSubmit(event) {
    event.preventDefault();
    const payload = {
      id: editingAccountId || undefined,
      name: normalizeString(el.accountName.value),
      type: el.accountType.value,
      initialBalance: Number(el.accountInitialBalance.value) || 0,
      color: el.accountColor.value || "#5e7fff",
    };
    if (!payload.name) { showMessage("app", "Nome da conta é obrigatório.", "error"); return; }
    try {
      if (editingAccountId) {
        const updated = await apiRequest(`/api/accounts/${encodeURIComponent(editingAccountId)}`, { method: "PUT", body: payload });
        const idx = state.accounts.findIndex((a) => a.id === editingAccountId);
        if (idx >= 0) state.accounts[idx] = updated;
        showMessage("app", "Conta atualizada.", "success");
      } else {
        const created = await apiRequest("/api/accounts", { method: "POST", body: payload });
        state.accounts.push(created);
        showMessage("app", "Conta criada.", "success");
      }
      await refreshTransactionsSnapshotForImport();
      resetAccountForm();
      renderAccounts();
      populateAccountSelector();
      renderAll();
    } catch (error) {
      showMessage("app", getErrorMessage(error, "Falha ao salvar conta."), "error");
    }
  }

  async function handleAccountActions(event) {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;
    const { id, action } = btn.dataset;
    const item = state.accounts.find((a) => a.id === id);
    if (!item) return;
    if (action === "edit-account") {
      editingAccountId = item.id;
      el.accountName.value = item.name;
      el.accountType.value = item.type;
      el.accountInitialBalance.value = item.initialBalance || 0;
      el.accountColor.value = item.color || "#5e7fff";
      el.accountSubmitBtn.textContent = "Atualizar Conta";
      el.cancelAccountEditBtn.classList.remove("hidden");
      el.accountForm.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (action === "delete-account") {
      const confirmed = await showConfirmDialog({
        title: "Excluir conta",
        message: `Excluir a conta "${item.name}"?`,
        confirmLabel: "Excluir",
        tone: "danger",
      });
      if (!confirmed) return;
      try {
        await apiRequest(`/api/accounts/${encodeURIComponent(id)}`, { method: "DELETE", expectNoContent: true });
        state.accounts = state.accounts.filter((a) => a.id !== id);
        if (editingAccountId === id) resetAccountForm();
        renderAccounts();
        populateAccountSelector();
        showMessage("app", "Conta removida.", "success");
      } catch (error) {
        showMessage("app", getErrorMessage(error, "Falha ao excluir conta."), "error");
      }
    }
  }

  function resetAccountForm() {
    editingAccountId = null;
    el.accountForm.reset();
    el.accountColor.value = "#5e7fff";
    el.accountSubmitBtn.textContent = "Criar Conta";
    el.cancelAccountEditBtn.classList.add("hidden");
  }

  /* ── Monthly Report ──────────────────────────────────────── */
  function renderMonthlyReport() {
    const curMonth = state.selectedMonth;
    const prevMonth = getMonthShift(curMonth, -1);
    const curTx = getMonthlyTransactions(curMonth);
    const prevTx = getMonthlyTransactions(prevMonth);

    const curIncome = sumByType(curTx, "receita");
    const prevIncome = sumByType(prevTx, "receita");
    const curExpense = sumByType(curTx, "despesa");
    const prevExpense = sumByType(prevTx, "despesa");
    const curInvest = sumByType(curTx, "investimento");
    const prevInvest = sumByType(prevTx, "investimento");
    const curBalance = curIncome - curExpense - curInvest;
    const prevBalance = prevIncome - prevExpense - prevInvest;

    function changeInfo(cur, prev) {
      if (prev === 0) return { pct: cur > 0 ? 100 : 0, cls: cur > 0 ? "up" : "neutral" };
      const pct = ((cur - prev) / prev) * 100;
      return { pct: round2(pct), cls: pct > 1 ? "up" : pct < -1 ? "down" : "neutral" };
    }

    const incChange = changeInfo(curIncome, prevIncome);
    const expChange = changeInfo(curExpense, prevExpense);
    const invChange = changeInfo(curInvest, prevInvest);
    const balChange = changeInfo(curBalance, prevBalance);

    const arrow = (cls) => cls === "up" ? "↑" : cls === "down" ? "↓" : "→";

    // Category breakdown
    const curCats = {};
    curTx.filter((t) => t.type === "despesa").forEach((t) => { curCats[t.category] = (curCats[t.category] || 0) + t.amount; });
    const prevCats = {};
    prevTx.filter((t) => t.type === "despesa").forEach((t) => { prevCats[t.category] = (prevCats[t.category] || 0) + t.amount; });
    const allCats = new Set([...Object.keys(curCats), ...Object.keys(prevCats)]);

    let catHtml = "";
    if (allCats.size > 0) {
      catHtml = `<h3 class="section-title">Despesas por Categoria</h3><div class="report-category-list">` +
        [...allCats].sort((a, b) => (curCats[b] || 0) - (curCats[a] || 0))
          .map((c) => {
            const cur = curCats[c] || 0;
            const prev = prevCats[c] || 0;
            const ch = changeInfo(cur, prev);
            return `<div class="report-category-row">
              <span>${escapeHtml(c)}</span>
              <span>${formatCurrency(cur)} <span class="report-change ${ch.cls}">${arrow(ch.cls)} ${Math.abs(ch.pct).toFixed(0)}%</span> <small style="color:var(--text-muted)">vs ${formatCurrency(prev)}</small></span>
            </div>`;
          }).join("") + `</div>`;
    }

    el.reportContent.innerHTML = `
      <div class="report-grid">
        <div class="report-card">
          <p>Receitas</p>
          <div class="report-value">${formatCurrency(curIncome)}</div>
          <div class="report-change ${incChange.cls}">${arrow(incChange.cls)} ${Math.abs(incChange.pct).toFixed(1)}% vs mês anterior</div>
        </div>
        <div class="report-card">
          <p>Despesas</p>
          <div class="report-value">${formatCurrency(curExpense)}</div>
          <div class="report-change ${expChange.cls === "up" ? "down" : expChange.cls === "down" ? "up" : "neutral"}">${arrow(expChange.cls)} ${Math.abs(expChange.pct).toFixed(1)}%</div>
        </div>
        <div class="report-card">
          <p>Investimentos</p>
          <div class="report-value">${formatCurrency(curInvest)}</div>
          <div class="report-change ${invChange.cls}">${arrow(invChange.cls)} ${Math.abs(invChange.pct).toFixed(1)}%</div>
        </div>
        <div class="report-card">
          <p>Saldo Líquido</p>
          <div class="report-value">${formatCurrency(curBalance)}</div>
          <div class="report-change ${balChange.cls}">${arrow(balChange.cls)} ${Math.abs(balChange.pct).toFixed(1)}%</div>
        </div>
      </div>
      ${catHtml}
    `;
  }

  /* ── Installment Planner ─────────────────────────────────── */
  function renderInstallmentPlan() {
    const today = getTodayDate();
    const currentMonth = state.selectedMonth;
    const installmentTx = state.transactions.filter((t) => t.installments > 1);

    if (!installmentTx.length) {
      el.installmentsContent.innerHTML = '<p class="empty-state">Nenhuma compra parcelada encontrada.</p>';
      return;
    }

    // Group future installments by month
    const futureByMonth = {};
    let totalFutureCommitment = 0;

    installmentTx.forEach((t) => {
      const [sy, sm] = t.date.slice(0, 7).split("-").map(Number);
      for (let i = 0; i < t.installments; i++) {
        const d = new Date(sy, sm - 1 + i, 1);
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (m < currentMonth) continue;
        if (!futureByMonth[m]) futureByMonth[m] = [];
        futureByMonth[m].push({
          description: t.description,
          category: t.category,
          amount: t.amount,
          installment: i + 1,
          total: t.installments,
        });
        totalFutureCommitment += t.amount;
      }
    });

    const months = Object.keys(futureByMonth).sort();
    if (!months.length) {
      el.installmentsContent.innerHTML = '<p class="empty-state">Nenhuma parcela futura pendente.</p>';
      return;
    }

    el.installmentsContent.innerHTML = `
      <div style="margin-bottom:1rem">
        <strong>Compromisso total futuro:</strong> <span class="negative">${formatCurrency(totalFutureCommitment)}</span>
        <span style="color:var(--text-muted); margin-left:0.5rem">(${months.length} meses)</span>
      </div>
      <div class="installment-timeline">
        ${months.map((m) => {
          const items = futureByMonth[m];
          const monthTotal = items.reduce((s, i) => s + i.amount, 0);
          const isCurrentMonth = m === currentMonth;
          return `<div class="installment-group" ${isCurrentMonth ? 'style="border-color:var(--primary)"' : ""}>
            <h4>${formatMonthLabel(m)} ${isCurrentMonth ? "(atual)" : ""} — ${formatCurrency(monthTotal)}</h4>
            ${items.map((i) => `<div class="installment-row">
              <span class="inst-desc">${escapeHtml(i.description)}</span>
              <span class="inst-info">${i.installment}/${i.total} · ${escapeHtml(i.category)}</span>
              <span class="inst-amount negative">${formatCurrency(i.amount)}</span>
            </div>`).join("")}
          </div>`;
        }).join("")}
      </div>
    `;
  }

  /* ── Patrimônio Evolution Chart ────────────────────────── */
  function renderPatrimonioEvolutionChart() {
    if (!el.patrimonioEvolutionChart) return;
    const theme = getChartTheme();
    const months = getMonthSequence(state.selectedMonth, -11, 0);
    const labels = months.map(formatMonthLabel);
    const invStats = getInvestmentStats();
    const data = months.map((m) => {
      const cash = getClosingCash(m);
      return round2(cash + invStats.totalInvested);
    });

    if (patrimonioChartInstance) patrimonioChartInstance.destroy();
    patrimonioChartInstance = new Chart(el.patrimonioEvolutionChart, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Patrimônio Líquido",
          data,
          borderColor: theme.primary,
          backgroundColor: withAlpha(theme.primary, 0.12),
          fill: true, tension: 0.35, pointRadius: 3, pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: theme.textMuted, font: { size: 11 } }, grid: { display: false } },
          y: { ticks: { color: theme.textMuted, callback: (v) => formatAxisValue(v) }, grid: { color: theme.grid } },
        },
      },
    });
  }

  /* ── Comparative Mode ──────────────────────────────────── */
  function renderCompareContent() {
    if (!el.compareContent || !el.compareMonth) return;
    const compare = el.compareMonth.value;
    if (!compare || !/^\d{4}-\d{2}$/.test(compare)) {
      el.compareContent.innerHTML = '<p class="empty-state">Selecione um mês para comparar.</p>';
      return;
    }
    const current = state.selectedMonth;
    const txCur = getMonthlyTransactions(current);
    const txCmp = getMonthlyTransactions(compare);
    const sumCur = { income: sumByType(txCur, "receita"), expense: sumByType(txCur, "despesa"), investment: sumByType(txCur, "investimento") };
    const sumCmp = { income: sumByType(txCmp, "receita"), expense: sumByType(txCmp, "despesa"), investment: sumByType(txCmp, "investimento") };

    function diffBadge(a, b) {
      if (b === 0) return "";
      const pct = (((a - b) / Math.abs(b)) * 100).toFixed(1);
      const cls = Number(pct) > 0 ? "up" : Number(pct) < 0 ? "down" : "neutral";
      return `<span class="report-change ${cls}">${Number(pct) > 0 ? "+" : ""}${pct}%</span>`;
    }

    function colHtml(label, sum, tx) {
      return `<div class="compare-col"><h4>${escapeHtml(label)}</h4>
        <div class="report-grid">
          <div class="report-card"><p>Receitas</p><div class="report-value positive">${formatCurrency(sum.income)}</div></div>
          <div class="report-card"><p>Despesas</p><div class="report-value negative">${formatCurrency(sum.expense)}</div></div>
          <div class="report-card"><p>Investimentos</p><div class="report-value warning">${formatCurrency(sum.investment)}</div></div>
          <div class="report-card"><p>Saldo</p><div class="report-value">${formatCurrency(sum.income - sum.expense - sum.investment)}</div></div>
        </div>
        <p style="margin-top:.5rem;font-size:.82rem;color:var(--text-muted)">${tx.length} transações</p>
      </div>`;
    }

    el.compareContent.innerHTML = `
      <div class="compare-grid">
        ${colHtml(formatMonthLabel(current), sumCur, txCur)}
        ${colHtml(formatMonthLabel(compare), sumCmp, txCmp)}
      </div>
      <div class="report-grid" style="margin-top:1rem">
        <div class="report-card"><p>Δ Receitas</p><div class="report-value">${formatCurrency(sumCur.income - sumCmp.income)}</div>${diffBadge(sumCur.income, sumCmp.income)}</div>
        <div class="report-card"><p>Δ Despesas</p><div class="report-value">${formatCurrency(sumCur.expense - sumCmp.expense)}</div>${diffBadge(sumCur.expense, sumCmp.expense)}</div>
        <div class="report-card"><p>Δ Investimentos</p><div class="report-value">${formatCurrency(sumCur.investment - sumCmp.investment)}</div>${diffBadge(sumCur.investment, sumCmp.investment)}</div>
      </div>`;
  }

  /* ── PDF Export ─────────────────────────────────────────── */
  async function exportPdf() {
    if (typeof html2canvas === "undefined" || typeof jspdf === "undefined") {
      showMessage("app", "Bibliotecas de PDF não carregadas. Recarregue a página.", "error");
      return;
    }
    showMessage("app", "Gerando PDF… aguarde.", "info");
    try {
      // Captura o painel do relatório mensal
      const target = el.reportPanel;
      if (!target) { showMessage("app", "Painel de relatório não encontrado.", "error"); return; }

      const canvas = await html2canvas(target, {
        scale: 2,
        backgroundColor: getCssVar("--surface") || "#0e1322",
        useCORS: true,
        scrollY: -window.scrollY,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;

      // Multi-page: se a imagem for mais alta que uma página A4
      let y = margin;
      const usableH = pageH - margin * 2;
      if (imgH <= usableH) {
        pdf.addImage(imgData, "PNG", margin, y, imgW, imgH);
      } else {
        let remainingH = imgH;
        while (remainingH > 0) {
          pdf.addImage(imgData, "PNG", margin, y - (imgH - remainingH), imgW, imgH);
          remainingH -= usableH;
          if (remainingH > 0) {
            pdf.addPage();
            y = margin;
          }
        }
      }

      pdf.save(`relatorio-${state.selectedMonth}.pdf`);
      showMessage("app", "PDF salvo como relatorio-" + state.selectedMonth + ".pdf", "success");
    } catch (err) {
      showMessage("app", "Erro ao gerar PDF: " + getErrorMessage(err), "error");
    }
  }

  /* ── Drag & drop CSV helper ────────────────────────────── */
  async function importCsvFile(file) {
    await importCsvCore(file);
  }

  /* ── Projection (original) ────────────────────────────── */
  function hydrateProjectionForm() {
    const p = normalizeProjection(state.projection);
    state.projection = p;
    el.projectionMonths.value = String(p.months);
    el.projectionIncome.value = p.income ?? "";
    el.projectionExpense.value = p.expense ?? "";
    el.projectionInvestment.value = p.investment ?? "";
  }

  async function handleProjectionSubmit(event) {
    event.preventDefault();
    const months = Number(el.projectionMonths.value);
    const income = parseOptionalNumber(el.projectionIncome.value);
    const expense = parseOptionalNumber(el.projectionExpense.value);
    const investment = parseOptionalNumber(el.projectionInvestment.value);

    if (!Number.isInteger(months) || months < 1 || months > 24) {
      showMessage("app", "Meses futuros: 1 a 24.", "error"); return;
    }
    if ([income, expense, investment].some((v) => v !== null && v < 0)) {
      showMessage("app", "Valores não podem ser negativos.", "error"); return;
    }
    try {
      const updated = normalizeProjection(await apiRequest("/api/projection", { method: "PUT", body: { months, income, expense, investment } }));
      state.projection = updated;
      hydrateProjectionForm();
      renderProjectionSummary();
      renderCharts();
      showMessage("app", "Projeção atualizada.", "success");
    } catch (error) {
      showMessage("app", getErrorMessage(error, "Falha ao atualizar projeção."), "error");
    }
  }

  function renderProjectionSummary() {
    const m = buildProjectionModel();
    const outflow = m.expectedExpense + m.expectedInvestment;
    const label = m.expectedNet >= 0 ? "Crescimento mensal esperado" : "Redução mensal esperada";
    const horizon = m.futureMonths[m.futureMonths.length - 1] || state.selectedMonth;

    let yieldHtml = "";
    if (m.investedCapital > 0 && m.avgYieldRate > 0) {
      yieldHtml = `
        <article class="summary-pill"><p>Patrimônio investido</p><strong class="warning">${formatCurrency(m.investedCapital)}</strong></article>
        <article class="summary-pill"><p>Rend. mensal estimado</p><strong class="positive">${formatCurrency(m.estimatedMonthlyYield)} (${m.avgYieldRate.toFixed(2)}%)</strong></article>
        <article class="summary-pill"><p>Rendimentos acum. (${m.futureMonths.length}m)</p><strong class="positive">${formatCurrency(m.totalProjectedYields)}</strong></article>
        <article class="summary-pill"><p>Patrimônio projetado em ${formatMonthLabel(horizon)}</p><strong>${formatCurrency(m.projectedEndPatrimonio)}</strong></article>
      `;
    } else if (m.investedCapital > 0) {
      yieldHtml = `
        <article class="summary-pill"><p>Patrimônio investido</p><strong class="warning">${formatCurrency(m.investedCapital)}</strong></article>
        <article class="summary-pill"><p>Rend. mensal estimado</p><strong>Defina rendimentos na carteira</strong></article>
      `;
    }

    el.projectionSummary.innerHTML = `
      <article class="summary-pill"><p>Saldo de caixa atual</p><strong>${formatCurrency(m.currentCash)}</strong></article>
      <article class="summary-pill"><p>Receita mensal esperada</p><strong>${formatCurrency(m.expectedIncome)}</strong></article>
      <article class="summary-pill"><p>Saída mensal esperada</p><strong>${formatCurrency(outflow)}</strong></article>
      <article class="summary-pill"><p>${label}</p><strong>${formatCurrency(m.expectedNet)}</strong></article>
      <article class="summary-pill"><p>Caixa projetado em ${formatMonthLabel(horizon)}</p><strong>${formatCurrency(m.projectedEndCash)}</strong></article>
      ${yieldHtml}
      <article class="summary-pill"><p>Base de cálculo</p><strong>${escapeHtml(m.basisDescription)}</strong></article>
    `;
  }

  function buildProjectionModel() {
    const p = normalizeProjection(state.projection);
    const historyMonths = getMonthSequence(state.selectedMonth, -5, 0);
    const futureMonths = getMonthSequence(state.selectedMonth, 1, p.months);
    const monthlyMap = getMonthlySummaryMap(state.transactions);
    const avgMonths = getMonthSequence(state.selectedMonth, -2, 0);
    const avg = getAverageMonthlyFlow(monthlyMap, avgMonths);

    const expectedIncome = p.income ?? avg.income;
    const expectedExpense = p.expense ?? avg.expense;
    const expectedInvestment = p.investment ?? avg.investment;
    const expectedNet = round2(expectedIncome - expectedExpense - expectedInvestment);

    // Investment yield projection
    const investStats = getInvestmentStats();
    const rate = investStats.avgMonthlyRate;

    const labels = historyMonths.concat(futureMonths).map(formatMonthLabel);
    const actual = historyMonths.map((m) => round2(getClosingCash(m)));
    futureMonths.forEach(() => actual.push(null));

    const projected = new Array(labels.length).fill(null);
    const projectedPatrimonio = new Array(labels.length).fill(null);
    const startIdx = historyMonths.length - 1;
    let rolling = round2(getClosingCash(state.selectedMonth));
    projected[startIdx] = rolling;

    // Patrimônio = caixa + capital investido (investimento é ativo, não perda)
    let investedCapital = investStats.totalInvested;
    projectedPatrimonio[startIdx] = round2(rolling + investedCapital);
    let totalYields = 0;

    for (let i = startIdx + 1; i < projected.length; i++) {
      rolling = round2(rolling + expectedNet);
      projected[i] = rolling;
      // Capital investido cresce com novo aporte mensal + rendimento composto
      const monthlyYield = round2(investedCapital * rate);
      investedCapital = round2(investedCapital + expectedInvestment + monthlyYield);
      totalYields += monthlyYield;
      projectedPatrimonio[i] = round2(rolling + investedCapital);
    }

    return {
      labels, actual, projected, projectedPatrimonio,
      expectedIncome, expectedExpense, expectedInvestment, expectedNet,
      projectedEndCash: rolling,
      projectedEndPatrimonio: projectedPatrimonio[projectedPatrimonio.length - 1] || round2(rolling + investedCapital),
      currentCash: round2(getClosingCash(state.selectedMonth)),
      currentPatrimonio: round2(rolling + investStats.totalInvested),
      investedCapital: investStats.totalInvested,
      avgYieldRate: round2(rate * 10000) / 100,
      estimatedMonthlyYield: investStats.estimatedMonthlyYield,
      totalProjectedYields: round2(totalYields),
      futureMonths, basisDescription: getProjectionBasis(p, avg),
    };
  }

  /* ── Charts ──────────────────────────────────────────────── */
  function renderCharts() {
    const monthly = getMonthlyTransactions(state.selectedMonth);
    renderCashFlowChart(monthly);
    renderExpenseChart(monthly);
    if (currentPage === "projection") {
      renderProjectionChart(buildProjectionModel());
    }
  }

  function formatAxisValue(value) {
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
    if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
    return `${sign}R$ ${Math.round(abs).toLocaleString("pt-BR")}`;
  }

  function getYAxisConfig(theme, dataArrays) {
    const allValues = dataArrays.flat().filter((v) => v != null && Number.isFinite(v));
    const maxAbs = allValues.length > 0 ? Math.max(...allValues.map(Math.abs)) : 0;
    const suggestedMax = maxAbs < 10 ? 100 : undefined;
    return {
      grid: { color: theme.gridColor },
      ticks: {
        color: theme.labelColor,
        callback: (v) => formatAxisValue(Number(v)),
        maxTicksLimit: 7,
        precision: 0,
        font: { size: 12 },
        padding: 4,
      },
      beginAtZero: true,
      suggestedMax,
    };
  }

  function renderCashFlowChart(transactions) {
    if (typeof Chart === "undefined") return;
    const [y, m] = state.selectedMonth.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    const daily = new Array(days).fill(0);
    const dailyPatri = new Array(days).fill(0);
    transactions.forEach((t) => {
      const d = Number(t.date.slice(8, 10)) - 1;
      if (d >= 0 && d < days) {
        if (t.type === "transferencia") return; // Transferências não afetam fluxo de caixa
        if (t.method === "credito") return; // Compras cartão são informativas — fatura é o gasto real
        daily[d] += (t.type === "receita" ? 1 : -1) * t.amount;
        // Patrimônio: investimento é transferência (não saída), despesa é saída
        if (t.type === "receita") dailyPatri[d] += t.amount;
        else if (t.type === "despesa") dailyPatri[d] -= t.amount;
        // investimento: 0 no patrimônio (ativo transferido)
      }
    });
    const labels = [], cumulative = [], patriCumulative = [];
    let running = 0, patriRunning = 0;
    const investStats = getInvestmentStats();
    const dailyYield = days > 0 ? investStats.estimatedMonthlyYield / days : 0;
    for (let i = 0; i < days; i++) {
      running += daily[i];
      patriRunning += dailyPatri[i] + dailyYield;
      cumulative.push(round2(running));
      patriCumulative.push(round2(patriRunning));
      labels.push(String(i + 1).padStart(2, "0"));
    }
    const theme = getChartTheme();
    const pos = cumulative[cumulative.length - 1] >= 0;
    const datasets = [
      { label: "Fluxo de caixa", data: cumulative, borderColor: pos ? theme.positiveColor : theme.negativeColor, backgroundColor: pos ? theme.positiveFill : theme.negativeFill, fill: true, tension: 0.3, pointRadius: 1, pointHoverRadius: 5, borderWidth: 2 },
    ];
    if (investStats.totalInvested > 0) {
      datasets.push({ label: "Patrimônio (c/ rendimentos)", data: patriCumulative, borderColor: theme.patrimonioColor, backgroundColor: "transparent", borderDash: [4, 3], tension: 0.3, pointRadius: 1, pointHoverRadius: 5, borderWidth: 2, fill: false });
    }
    const allData = [cumulative];
    if (investStats.totalInvested > 0) allData.push(patriCumulative);
    if (cashFlowChartInstance) cashFlowChartInstance.destroy();
    cashFlowChartInstance = new Chart(el.cashFlowChart.getContext("2d"), {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { left: 4, right: 12, top: 8, bottom: 4 } },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: datasets.length > 1, labels: { color: theme.labelColor, usePointStyle: true, boxWidth: 8, padding: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${formatCurrency(c.parsed.y || 0)}` } },
        },
        scales: {
          x: { grid: { color: theme.gridColor }, ticks: { color: theme.labelColor, maxTicksLimit: 10, font: { size: 11 } } },
          y: getYAxisConfig(theme, allData),
        },
      },
    });
  }

  function renderProjectionChart(model) {
    if (typeof Chart === "undefined") return;
    const theme = getChartTheme();
    if (projectionChartInstance) projectionChartInstance.destroy();
    const datasets = [
      { label: "Saldo real", data: model.actual, borderColor: theme.actualColor, backgroundColor: "transparent", pointRadius: 4, pointHoverRadius: 6, tension: 0.2, spanGaps: false, borderWidth: 2 },
      { label: "Caixa projetado", data: model.projected, borderColor: theme.projectedColor, backgroundColor: theme.projectedFill, borderDash: [6, 4], pointRadius: 4, pointHoverRadius: 6, fill: true, tension: 0.2, spanGaps: false, borderWidth: 2 },
    ];
    const yData = [model.actual, model.projected];
    if (model.investedCapital > 0) {
      datasets.push({ label: "Patrimônio projetado", data: model.projectedPatrimonio, borderColor: theme.patrimonioColor, backgroundColor: theme.patrimonioFill, borderDash: [3, 3], pointRadius: 3, pointHoverRadius: 5, fill: false, tension: 0.2, spanGaps: false, borderWidth: 2 });
      yData.push(model.projectedPatrimonio);
    }
    projectionChartInstance = new Chart(el.projectionChart.getContext("2d"), {
      type: "line",
      data: { labels: model.labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { left: 4, right: 12, top: 8, bottom: 4 } },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: theme.labelColor, usePointStyle: true, boxWidth: 8, padding: 16, font: { size: 12 } } },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${formatCurrency(c.parsed.y || 0)}` } },
        },
        scales: {
          x: { grid: { color: theme.gridColor }, ticks: { color: theme.labelColor, maxRotation: 45, minRotation: 0, font: { size: 11 } } },
          y: getYAxisConfig(theme, yData),
        },
      },
    });
  }

  function renderExpenseChart(transactions) {
    if (typeof Chart === "undefined") return;
    const totals = {};
    transactions.filter((t) => t.type === "despesa" && t.method !== "credito").forEach((t) => { totals[t.category] = (totals[t.category] || 0) + t.amount; });
    let labels = Object.keys(totals), values = labels.map((l) => totals[l]);
    const hasData = values.length > 0;
    if (!hasData) { labels = ["Sem despesas"]; values = [1]; }
    const theme = getChartTheme();
    const colors = getChartColors(labels.length);
    if (expenseChartInstance) expenseChartInstance.destroy();
    expenseChartInstance = new Chart(el.expenseByCategoryChart.getContext("2d"), {
      type: "doughnut",
      data: { labels, datasets: [{ data: values, borderWidth: 2, borderColor: theme.surfaceBorder, backgroundColor: hasData ? colors : [theme.emptyColor] }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom", labels: { color: theme.labelColor, usePointStyle: true, boxWidth: 8, padding: 14 } }, tooltip: { callbacks: { label: (c) => { if (!hasData) return "Sem dados"; const total = values.reduce((s, v) => s + v, 0); return `${c.label}: ${formatCurrency(c.parsed || 0)} (${total > 0 ? ((c.parsed / total) * 100).toFixed(1) : "0.0"}%)`; } } } } },
    });
  }

  /* ── CSV ──────────────────────────────────────────────────── */
  async function sendMonthlySummary() {
    try {
      el.sendSummaryBtn.disabled = true;
      el.sendSummaryBtn.textContent = "Enviando…";
      const res = await apiRequest(`/api/summary/send?month=${state.selectedMonth}`, { method: "POST" });
      showMessage("app", res.message || "Resumo enviado!", "success");
    } catch (error) {
      showMessage("app", getErrorMessage(error, "Falha ao enviar resumo."), "error");
    } finally {
      el.sendSummaryBtn.disabled = false;
      el.sendSummaryBtn.textContent = "📊 Resumo";
    }
  }

  async function deleteAllTransactions() {
    const count = state.transactions.length;
    if (!count) { showMessage("app", "Não há movimentações para excluir.", "error"); return; }
    const firstConfirm = await showConfirmDialog({
      title: "Excluir todas as movimentações",
      message: `ATENÇÃO: isso vai excluir permanentemente todas as ${count} movimentações.`,
      confirmLabel: "Continuar",
      tone: "danger",
    });
    if (!firstConfirm) return;
    const secondConfirm = await showConfirmDialog({
      title: "Confirmar exclusão total",
      message: "Última confirmação: deseja realmente excluir tudo?",
      confirmLabel: "Excluir tudo",
      tone: "danger",
    });
    if (!secondConfirm) return;
    try {
      el.deleteAllTransactionsBtn.disabled = true;
      el.deleteAllTransactionsBtn.textContent = "Excluindo…";
      const res = await apiRequest("/api/transactions", { method: "DELETE" });
      state.transactions = [];
      showMessage("app", res.message || `${count} movimentações excluídas.`, "success");
      renderAll();
    } catch (error) {
      showMessage("app", getErrorMessage(error, "Falha ao excluir movimentações."), "error");
    } finally {
      el.deleteAllTransactionsBtn.disabled = false;
      el.deleteAllTransactionsBtn.textContent = "🗑️ Apagar Tudo";
    }
  }

  function exportCsv() {
    if (!state.transactions.length) { showMessage("app", "Sem movimentações para exportar.", "error"); return; }
    const headers = ["id", "date", "type", "category", "method", "description", "amount", "recurrence", "recurrenceEnd", "installments", "createdAt"];
    const rows = state.transactions.map((t) => [t.id, t.date, t.type, t.category, t.method, t.description, t.amount.toFixed(2), t.recurrence || "none", t.recurrenceEnd || "", t.installments || 0, t.createdAt]);
    const csv = [headers.join(",")].concat(rows.map((r) => r.map(csvEscape).join(","))).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: `movimentacoes-${state.selectedMonth}.csv` });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showMessage("app", "CSV exportado.", "success");
  }

  async function importCsv(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await importCsvCore(file);
    } finally {
      event.target.value = "";
    }
  }

  async function importCsvCore(file) {
    showLoader("Importando CSV...");
    try {
      const text = await readFileAsText(file);
      const parsed = parseTransactionsFromCsv(text);
      if (!parsed.items.length) { showMessage("app", "Nenhuma movimentacao valida no CSV.", "error"); return; }

      await refreshTransactionsSnapshotForImport();
      const existing = buildExistingFingerprints();
      const preview = buildImportPreview(parsed.items, existing);
      const invalidPreview = parsed.skipped + preview.invalid;
      const confirmText = [
        `Resumo da importacao (${file.name}):`,
        `- Novas para importar: ${preview.toImport.length}`,
        `- Duplicatas ja existentes: ${preview.duplicatesExisting}`,
        `- Duplicatas dentro do arquivo: ${preview.duplicatesInFile}`,
        `- Linhas invalidas: ${invalidPreview}`,
      ].join("\n");
      const confirmed = await showConfirmDialog({
        title: "Confirmar importação CSV",
        message: `${confirmText}\n\nDeseja continuar?`,
        confirmLabel: "Importar",
      });
      if (!confirmed) return;

      if (!preview.toImport.length) {
        showMessage("app", "Nada novo para importar (somente duplicatas/invalidas).", "error");
        return;
      }

      const result = await apiRequest("/api/transactions/import", {
        method: "POST",
        body: { items: preview.toImport.map((item) => toPayload(item, false)) },
      });

      await refreshTransactionsSnapshotForImport();
      renderAll();

      const imported = Number(result?.imported || 0);
      const duplicates = preview.duplicatesExisting + preview.duplicatesInFile + Number(result?.duplicates || 0);
      const invalid = invalidPreview + Math.max(0, Number(result?.invalid || 0) - preview.invalid);
      const parts = [`${imported} importadas`];
      if (duplicates) parts.push(`${duplicates} duplicatas ignoradas`);
      if (invalid) parts.push(`${invalid} invalidas`);
      showMessage("app", parts.join(", ") + ".", imported > 0 ? "success" : "error");
    } catch (error) {
      showMessage("app", getErrorMessage(error, "Falha ao importar CSV."), "error");
    } finally {
      hideLoader();
    }
  }

  function buildImportPreview(parsedItems, existingFingerprints) {
    const toImport = [];
    const inFileFingerprints = new Set();
    let duplicatesExisting = 0;
    let duplicatesInFile = 0;
    let invalid = 0;

    for (const item of parsedItems) {
      if (!isValidTransaction(item)) { invalid++; continue; }
      const fp = txnFingerprint(item.date, item.description, item.amount);
      if (existingFingerprints.has(fp)) { duplicatesExisting++; continue; }
      if (inFileFingerprints.has(fp)) { duplicatesInFile++; continue; }
      inFileFingerprints.add(fp);
      toImport.push(item);
    }

    return { toImport, duplicatesExisting, duplicatesInFile, invalid };
  }

  function parseTransactionsFromCsv(csvText) {
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error("CSV vazio.");
    const delimiter = detectCsvDelimiter(lines[0]);
    const headers = parseCsvLine(lines[0], delimiter).map(normalizeHeader);
    const idx = {
      id: findHeaderIdx(headers, ["id", "identificador"]),
      date: findHeaderIdx(headers, ["date", "data", "datalancamento", "datamovimento", "datatransacao", "transactiondate"]),
      type: findHeaderIdx(headers, ["type", "tipo"]),
      category: findHeaderIdx(headers, ["category", "categoria"]),
      method: findHeaderIdx(headers, ["method", "metodo", "metododepagamento", "pagamento", "meiodepagamento"]),
      description: findHeaderIdx(headers, ["description", "descricao", "title", "titulo", "historico", "detalhes", "estabelecimento", "favorecido", "memo"]),
      amount: findHeaderIdx(headers, ["amount", "valor", "valorr", "valorliquido", "valoroperacao"]),
      debit: findHeaderIdx(headers, ["debit", "debito", "saida", "saidas", "withdrawal", "valorsaida"]),
      credit: findHeaderIdx(headers, ["credit", "credito", "entrada", "entradas", "deposit", "valorentrada"]),
      recurrence: findHeaderIdx(headers, ["recurrence", "recorrencia"]),
      recurrenceEnd: findHeaderIdx(headers, ["recurrenceend", "recurrence_end", "fimrecorrencia"]),
      installments: findHeaderIdx(headers, ["installments", "parcelas"]),
      createdAt: findHeaderIdx(headers, ["createdat", "created_at"]),
    };
    // Minimum: date, description, and either amount or split debit/credit columns
    const hasAmountColumn = idx.amount >= 0;
    const hasSplitAmountColumns = idx.debit >= 0 || idx.credit >= 0;
    if (idx.date < 0 || idx.description < 0 || (!hasAmountColumn && !hasSplitAmountColumns)) {
      throw new Error("Cabeçalho CSV inválido. Mínimo: Data, Descrição e Valor (ou Débito/Crédito).");
    }
    const isBankCsv = idx.type < 0 || idx.category < 0 || idx.method < 0;
    // Detect credit card CSV: header uses "title" (Nubank credit card format)
    const isCreditCardCsv = isBankCsv && headers.includes("title");
    const items = []; let skipped = 0;
    lines.slice(1).forEach((line) => {
      const cols = parseCsvLine(line, delimiter);
      let rawAmount = idx.amount >= 0 ? parseFlexibleNumber(cols[idx.amount]) : NaN;
      if (!Number.isFinite(rawAmount) && (idx.debit >= 0 || idx.credit >= 0)) {
        const creditAmount = idx.credit >= 0 ? parseFlexibleNumber(cols[idx.credit]) : NaN;
        const debitAmount = idx.debit >= 0 ? parseFlexibleNumber(cols[idx.debit]) : NaN;
        if (Number.isFinite(creditAmount) && Math.abs(creditAmount) > 0) rawAmount = Math.abs(creditAmount);
        else if (Number.isFinite(debitAmount) && Math.abs(debitAmount) > 0) rawAmount = -Math.abs(debitAmount);
      }
      const rawDesc = String(cols[idx.description] || "");
      const rawDate = String(cols[idx.date] || "");
      if (!Number.isFinite(rawAmount) || rawAmount === 0) { skipped++; return; }

      // Parse date: support DD/MM/YYYY → YYYY-MM-DD
      let parsedDate = rawDate;
      const brDate = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (brDate) parsedDate = `${brDate[3]}-${brDate[2]}-${brDate[1]}`;
      const brDateDash = rawDate.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      if (brDateDash) parsedDate = `${brDateDash[3]}-${brDateDash[2]}-${brDateDash[1]}`;
      const isoSlashDate = rawDate.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
      if (isoSlashDate) parsedDate = `${isoSlashDate[1]}-${isoSlashDate[2]}-${isoSlashDate[3]}`;

      // For bank CSVs, infer type/category/method from description and amount sign
      let inferredType = idx.type >= 0 ? String(cols[idx.type] || "") : "";
      let inferredCategory = idx.category >= 0 ? String(cols[idx.category] || "") : "";
      let inferredMethod = idx.method >= 0 ? String(cols[idx.method] || "") : "";

      if (isCreditCardCsv) {
        const desc = rawDesc.toLowerCase();
        // Skip credit card internal operations only when amount is negative (credits/payments)
        // Positive "Parcelamento de Fatura" entries are real installment charges (refinanced bill)
        if (rawAmount <= 0 && (desc.includes("pagamento recebido") || desc.includes("parcelamento de fatura"))) { skipped++; return; }
        // Credit card: positive = despesa (compras), negative = estorno/reembolso
        if (!inferredType) {
          inferredType = rawAmount >= 0 ? "despesa" : "receita";
        }
        if (!inferredMethod) inferredMethod = "credito";
        if (!inferredCategory) inferredCategory = inferCategoryFromDescription(desc, { method: inferredMethod, type: inferredType });
      } else if (isBankCsv) {
        const desc = rawDesc.toLowerCase();
        // Type: positive = receita, negative = despesa
        if (!inferredType) {
          if (rawAmount > 0) inferredType = "receita";
          else if (desc.includes("aplicação") || desc.includes("aplicacao") || desc.includes("rdb") || desc.includes("investimento")) inferredType = "investimento";
          else inferredType = "despesa";
        }
        // Method
        if (!inferredMethod) {
          if (CARD_BILL_REGEX.test(desc)) inferredMethod = "transferencia";
          else if (desc.includes("pix")) inferredMethod = "pix";
          else if (desc.includes("débito") || desc.includes("debito")) inferredMethod = "debito";
          else if (desc.includes("crédito") || desc.includes("credito")) inferredMethod = "credito";
          else if (desc.includes("boleto")) inferredMethod = "transferencia";
          else if (desc.includes("transferência") || desc.includes("transferencia")) inferredMethod = "transferencia";
          else inferredMethod = "pix";
        }
        // Category
        if (!inferredCategory) {
          inferredCategory = inferCategoryFromDescription(desc, { method: inferredMethod, type: inferredType });
        }
      }

      // Credit card payment from bank statement stays as despesa (real cash outflow)
      // Category hint for fatura payments
      const descLower = rawDesc.toLowerCase();
      if (inferredType === "despesa" && CARD_BILL_REGEX.test(descLower)) {
        inferredCategory = "Fatura";
        if (inferredMethod === "credito") inferredMethod = "transferencia";
      }

      // Detect installments from description: "Parcela X/Y" or "X/Y"
      let inferredInstallments = idx.installments >= 0 ? Number(cols[idx.installments]) || 0 : 0;
      let inferredRecurrence = idx.recurrence >= 0 ? String(cols[idx.recurrence] || "none") : "none";
      let inferredRecurrenceEnd = idx.recurrenceEnd >= 0 ? String(cols[idx.recurrenceEnd] || "") : "";
      const parcelaMatch = rawDesc.match(/[Pp]arcela\s*(\d+)\s*\/\s*(\d+)/);
      if (parcelaMatch && inferredInstallments <= 0) {
        const curInst = parseInt(parcelaMatch[1]);
        const totalInst = parseInt(parcelaMatch[2]);
        if (totalInst > 1 && curInst >= 1 && curInst <= totalInst) {
          inferredInstallments = totalInst;
          // Adjust date to installment 1 start date
          if (curInst > 1 && parsedDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [py, pm, pd] = parsedDate.split("-").map(Number);
            const startDate = new Date(py, pm - 1 - (curInst - 1), pd);
            parsedDate = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(Math.min(pd, new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate())).padStart(2, "0")}`;
          }
        }
      }

      // Detect monthly subscriptions from credit card CSV
      if (isCreditCardCsv && inferredInstallments <= 0 && inferredRecurrence === "none") {
        if (isSubscriptionDescription(rawDesc)) {
          inferredRecurrence = "monthly";
        }
      }

      // Also detect subscriptions from bank CSV (Tim, internet providers, etc.)
      if (isBankCsv && inferredInstallments <= 0 && inferredRecurrence === "none") {
        if (isSubscriptionDescription(rawDesc) || /copel|sanepar|compagas|enel|cemig|celesc|claro\b|vivo\b|tim\*|tim\b|oi\b|net\b|sky\b|aluguel|condom[ií]nio|seguro\s*(auto|vida|resid)/i.test(rawDesc.toLowerCase())) {
          inferredRecurrence = "monthly";
        }
      }

      const item = normalizeTransaction({
        id: idx.id >= 0 ? String(cols[idx.id] || "") : "",
        date: parsedDate, type: inferredType,
        category: inferredCategory, method: inferredMethod,
        description: rawDesc,
        amount: Math.abs(rawAmount),
        recurrence: inferredRecurrence,
        recurrenceEnd: inferredRecurrenceEnd,
        installments: inferredInstallments,
        createdAt: idx.createdAt >= 0 ? String(cols[idx.createdAt] || new Date().toISOString()) : new Date().toISOString(),
      });
      isValidTransaction(item) ? items.push(item) : skipped++;
    });
    return { items, skipped };
  }

  function isSubscriptionDescription(desc) {
    return SUBSCRIPTION_REGEX.test(String(desc || ""));
  }

  function inferCategoryFromDescription(desc, context = {}) {
    const normalizedDesc = String(desc || "").toLowerCase();
    const method = normalizeString(context.method || "").toLowerCase();
    const type = normalizeString(context.type || "").toLowerCase();

    if (type === "despesa" && CARD_BILL_REGEX.test(normalizedDesc)) return "Fatura";
    if (isSubscriptionDescription(normalizedDesc)) return "Assinaturas";

    const rules = [
      // ── Supermercado / Mercado ──
      [/supermercado|condor|angeloni|festval|carrefour|atacad[ãa]o|big\b|assa[ií]|walmart|p[ãa]o de a[çc][úu]car|extra\s*hiper|zaffari|nacional|koch|bistek|giassi|fort\s*atacadista|sams?\s*club|makro|maxxi|mini\s*mercado|mini\s*pre[çc]o|dia\s*supermercado/, "Supermercado"],
      // ── Alimentação / Restaurante / Delivery ──
      [/restaurante|lanchonete|churrascaria|sorveteria|burger|mcdonald|mc\s*donald|subway|pizza|sushi|shawarma|shawarm|ifood|rappi|99\s*food|madeinchina|habib|bobs?\b|kfc|outback|spoleto|giraffas|coco\s*bambu|cantina|bistr[oô]|a\s*baiana|temakeria|acai|a[çc]a[ií]/, "Alimentação"],
      [/padaria|confeitaria|cafe\b|café|padariae|starbucks|cafeteria|doceria|bolo|torta/, "Alimentação"],
      // ── Transporte / Combustível ──
      [/posto|combustivel|combust[ií]vel|shell\b|ipiranga|petrobras|auto\s*posto|ale\b|br\s*distribuidora|gasolina|etanol|diesel|gnv/, "Transporte"],
      [/uber|99\b|cabify|estacionamento|estapar|zona\s*azul|park|vaga\s*livre/, "Transporte"],
      [/ped[áa]gio|sem\s*parar|veloe|move\s*mais|conect\s*car|auto\s*pista/, "Transporte"],
      [/mec[âa]nica|oficina|borracharia|pneu|auto\s*el[eé]trica|auto\s*pe[çc]as|funilaria|lava\s*(r[áa]pido|jato|car)/, "Transporte"],
      // ── Saúde / Farmácia / Médico ──
      [/farm[áa]cia|panvel|drogaria|droga\s*raia|drogasil|pague\s*menos|ultrafarm|rede\s*d['']or|farma/, "Saúde"],
      [/hospital|cl[ií]nica|m[ée]dico|lab(orat[óo]rio)?|consult(a|[oó]rio)|dentista|odonto|fisio(terapia)?|psic[oó]logo|exame|unimed|amil|sulam[ée]rica|hapvida|prevent\s*senior|bradesco\s*sa[úu]de/, "Saúde"],
      [/[óo]tica|[óo]culos|lentes|vision/, "Saúde"],
      // ── Moradia / Contas da casa ──
      [/copel|sanepar|compagas|energi[as]|eletri|[áa]gua\b|enel|cemig|ceee|celesc|coelba|equatorial|neoenergia|light\b|celpe|cosern/, "Contas"],
      [/aluguel|condom[ií]nio|iptu|seguro\s*resid/, "Moradia"],
      // ── Internet / Telefone / TV ──
      [/internet|telefone|claro\b|vivo\b|tim\*|tim\b|oi\b|net\b|sky\b|brisanet|desktop\b|algar|sercomtel/, "Internet"],
      // ── Educação ──
      [/universidade|faculdade|escola|curso|cultura|livraria|associa[çc][ãa]o.*cultura|apc|saraiva|amazon\s*kindle/, "Educação"],
      [/udemy|coursera|alura|rocketseat|origamid|domestika|duolingo/, "Educação"],
      // ── Lazer / Entretenimento ──
      [/cinema|teatro|steam|playstation|xbox|game|nuuvem|sharkcraft|ingresso/, "Lazer"],
      [/bar\b|pub\b|cerveja|balada|boate|show|festival|parque|praia|hotel|hostel|airbnb|booking/, "Lazer"],
      // ── Assinaturas digitais ──
      [/dl\*google|google\s*(one|play|storage|premium)|amazonprimebr|youtube\s*prem|icloud|dropbox|adobe|chatgpt|openai|canva|notion|figma|github|heroku|vercel|fly\.io|microsoft\s*365|office\s*365/, "Assinaturas"],
      [/apple\.com|apple\s*music|apple\s*one|apple\s*arcade/, "Assinaturas"],
      // ── Compras Online ──
      [/amazon|mercadolivre|mercado\s*livre|shopee|aliexpress|shein|magalu|magazine|americanas|casas\s*bahia|submarino|kabum|pichau|terabyte/, "Compras Online"],
      // ── Vestuário ──
      [/roupa|vestu[áa]rio|renner|cea\b|c&a|riachuelo|zara|semina|hering|marisa|centauro|netshoes|adidas|nike|puma|decathlon|lupo/, "Vestuário"],
      // ── Pet / Animais ──
      [/pet\s*shop|pet\s*center|cobasi|petz|veterin[áa]rio|ra[çc][ãa]o|cachorro|gato/, "Pet"],
      // ── Investimento ──
      [/aplica[çc][ãa]o|rdb|cdb|tesouro|investimento|poupan[çc]a|fundo|a[çc][ãa]o|etf|cri\b|cra\b|debenture|lci|lca|coe|previdencia/, "Investimento"],
      // ── Salário / Receita ──
      [/sal[áa]rio|folha\s*de\s*pagamento|pro\s*labore|honorario|freelance|comiss[ãa]o|bonifica[çc][ãa]o/, "Salário"],
      // ── Fatura ──
      [/fatura|pgto\s*cart|cart[ãa]o\s*de\s*cr[ée]dito/, "Fatura"],
      // ── Impostos / Governo ──
      [/receita\s*federal|imposto|darf|gps|inss|irpf|irpj|icms|iss\b|simples\s*nacional|das\b|gru\b|detran|dpvat|ipva|licenciamento/, "Impostos"],
      // ── Internet / Domínio / Hosting ──
      [/registrobr|registro\.br|hostgator|locaweb|godaddy|cloudflare|namecheap/, "Internet"],
      // ── Seguros ──
      [/seguro\s*(auto|vida|viagem)|porto\s*seguro|liberty|mapfre|zurich|tokio\s*marine|sulam[ée]rica\s*segur/, "Seguros"],
      // ── Transferências genéricas ──
      [/transfer[êe]ncia\s*recebida/, "Transferência"],
    ];
    for (const [regex, cat] of rules) {
      if (regex.test(normalizedDesc)) return cat;
    }

    const isPix = method === "pix" || /\bpix\b/.test(normalizedDesc);
    if (isPix && PIX_TRANSFER_HINT_REGEX.test(normalizedDesc)) return "Transferência";
    if (isPix && type === "despesa") return "Outros";
    if (isPix && type === "receita") return "Outros";
    if (isPix) return "Transferência";
    return "Outros";
  }

  /* ── API ─────────────────────────────────────────────────── */
  async function apiRequest(path, options = {}) {
    const method = options.method || "GET";
    const expectNoContent = Boolean(options.expectNoContent);
    const useAuth = options.auth !== false;
    const ctrl = new AbortController();
    const tid = window.setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
    try {
      const headers = {};
      if (options.body) headers["Content-Type"] = "application/json";
      if (useAuth && state.token) headers.Authorization = `Bearer ${state.token}`;
      const res = await fetch(`${API_BASE_URL}${path}`, {
        method, headers, body: options.body ? JSON.stringify(options.body) : undefined, signal: ctrl.signal,
      });
      if (expectNoContent && res.status === 204) return null;
      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await res.json() : null;
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("Tempo de resposta excedido.");
      throw error;
    } finally { window.clearTimeout(tid); }
  }

  function resolveApiBaseUrl() {
    const custom = String(window.GESTAO_API_URL || window.__GESTAO_API_URL || "").replace(/\s+/g, " ").trim();
    if (custom) return custom.replace(/\/+$/, "");
    const { protocol, hostname } = window.location || {};
    // Local dev: same host, port 8080.  Production (Vercel): same-origin via rewrites proxy.
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//${hostname}:8080`;
    }
    return ""; // same-origin — Vercel rewrites proxy /api/* to Fly.io
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function shiftMonth(offset) {
    const [y, m] = state.selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + offset, 1);
    state.selectedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    el.monthPicker.value = state.selectedMonth;
    renderAll();
  }

  function showMessage(scope, message, type) {
    const target = scope === "auth" ? el.authMessage : el.appMessage;
    target.textContent = normalizeString(message);
    target.classList.remove("success", "error");
    if (type) target.classList.add(type);

    // Auto-hide messages after delay
    const delay = type === "success" ? 3000 : type === "error" ? 5000 : 4000;
    setTimeout(() => {
      if (target.textContent === normalizeString(message)) {
        target.textContent = "";
        target.classList.remove("success", "error");
      }
    }, delay);
  }

  function isDialogOpen() {
    return Boolean(el.confirmModal && !el.confirmModal.classList.contains("hidden"));
  }

  function closeDialog(result) {
    if (!isDialogOpen()) return;
    if (dialogEscHandler) {
      document.removeEventListener("keydown", dialogEscHandler);
      dialogEscHandler = null;
    }
    el.confirmModal.classList.add("hidden");
    el.confirmModal.setAttribute("aria-hidden", "true");
    if (dialogLastFocused && typeof dialogLastFocused.focus === "function") {
      dialogLastFocused.focus();
    }
    const resolver = dialogResolver;
    dialogResolver = null;
    if (resolver) resolver(Boolean(result));
  }

  function showDialog(options = {}) {
    if (!el.confirmModal || !el.confirmTitle || !el.confirmMessage || !el.confirmOkBtn || !el.confirmCancelBtn) {
      showMessage("app", "Modal de confirmação indisponível no momento.", "error");
      return Promise.resolve(false);
    }

    if (dialogResolver) {
      closeDialog(false);
    }

    const {
      title = "Confirmar ação",
      message = "Tem certeza?",
      confirmLabel = "Confirmar",
      cancelLabel = "Cancelar",
      tone = "primary",
      hideCancel = false,
    } = options;

    dialogLastFocused = document.activeElement;
    el.confirmTitle.textContent = normalizeString(title);
    el.confirmMessage.textContent = normalizeString(message);
    el.confirmModal.classList.remove("hidden");
    el.confirmModal.setAttribute("aria-hidden", "false");

    el.confirmCancelBtn.textContent = normalizeString(cancelLabel);
    el.confirmCancelBtn.classList.toggle("hidden", hideCancel);
    el.confirmCancelBtn.disabled = hideCancel;

    el.confirmOkBtn.textContent = normalizeString(confirmLabel);
    el.confirmOkBtn.classList.toggle("dialog-ok-danger", tone === "danger");
    el.confirmOkBtn.classList.toggle("primary", tone !== "danger");
    el.confirmOkBtn.classList.add("btn", "tiny");

    dialogEscHandler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog(false);
      }
    };
    document.addEventListener("keydown", dialogEscHandler);

    setTimeout(() => {
      if (hideCancel) el.confirmOkBtn.focus();
      else el.confirmCancelBtn.focus();
    }, 0);

    return new Promise((resolve) => {
      dialogResolver = resolve;
    });
  }

  async function showConfirmDialog(options = {}) {
    return showDialog({ ...options, hideCancel: false });
  }

  async function showAlertDialog(options = {}) {
    await showDialog({
      ...options,
      hideCancel: true,
      confirmLabel: options.confirmLabel || "Entendi",
      tone: options.tone || "primary",
    });
  }

  /* ── Global Loader ─────────────────────────────────────── */
  let loaderStack = 0;
  function showLoader(msg) {
    loaderStack++;
    if (el.loaderText) el.loaderText.textContent = msg || "Carregando…";
    if (el.globalLoader) el.globalLoader.classList.remove("hidden");
  }
  function hideLoader() {
    loaderStack = Math.max(0, loaderStack - 1);
    if (loaderStack === 0 && el.globalLoader) el.globalLoader.classList.add("hidden");
  }
  function setBtnLoading(btn, loading, originalText) {
    if (!btn) return;
    if (loading) { btn.dataset.origText = btn.textContent; btn.disabled = true; btn.classList.add("is-loading"); btn.textContent = originalText || "Aguarde…"; }
    else { btn.disabled = false; btn.classList.remove("is-loading"); btn.textContent = btn.dataset.origText || originalText || btn.textContent; }
  }

  function getErrorMessage(error, fallback) {
    const text = normalizeString(String(error?.message || ""));
    return text ? `${fallback} (${text})` : fallback;
  }

  function toPayload(t, preserveId) {
    const p = { date: t.date, type: t.type, category: t.category, method: t.method, description: t.description, amount: Number(t.amount), recurrence: t.recurrence || "none", recurrenceEnd: t.recurrenceEnd || "", installments: Number(t.installments) || 0 };
    if (preserveId && t.id) p.id = t.id;
    return p;
  }

  async function refreshTransactionsSnapshotForImport() {
    try {
      const data = await apiRequest("/api/bootstrap");
      if (Array.isArray(data.transactions)) {
        state.transactions = data.transactions.map(normalizeTransaction).filter(isValidTransaction);
      }
    } catch (_) { /* fallback: keep current in-memory snapshot */ }
  }


  function normalizeDescriptionForFingerprint(description) {
    return normalizeString(String(description))
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Create a fingerprint for deduplication: date + canonical description + amount */
  function txnFingerprint(date, description, amount) {
    const d = normalizeDescriptionForFingerprint(description);
    return `${date}|${d}|${Math.abs(Number(amount)).toFixed(2)}`;
  }

  /** Build a Set of fingerprints from existing transactions */
  function buildExistingFingerprints() {
    const set = new Set();
    for (const t of state.transactions) {
      set.add(txnFingerprint(t.date, t.description, t.amount));
    }
    return set;
  }

  /* ── Normalizers ─────────────────────────────────────────── */
  function normalizeUser(u) {
    return { id: normalizeString(String(u?.id || "")), name: normalizeString(u?.name || "") || "Usuário", email: normalizeString(String(u?.email || "")) };
  }

  function normalizeTransaction(t) {
    return {
      id: normalizeString(String(t?.id || createId())), date: normalizeString(String(t?.date || "")),
      type: normalizeString(String(t?.type || "")).toLowerCase(), category: normalizeCategory(String(t?.category || "")),
      method: normalizeString(String(t?.method || "")).toLowerCase(), description: normalizeString(String(t?.description || "")),
      amount: Number(t?.amount), createdAt: normalizeString(String(t?.createdAt || t?.created_at || new Date().toISOString())),
      updatedAt: normalizeString(String(t?.updatedAt || t?.updated_at || new Date().toISOString())),
      recurrence: normalizeString(String(t?.recurrence || "none")),
      recurrenceEnd: normalizeString(String(t?.recurrenceEnd || t?.recurrence_end || "")),
      installments: Number(t?.installments) || 0,
      accountId: normalizeString(String(t?.accountId || t?.account_id || "")),
    };
  }

  function normalizeBudget(b) {
    return { id: normalizeString(String(b?.id || createId())), category: normalizeCategory(String(b?.category || "")), limit: Number(b?.limit), createdAt: normalizeString(String(b?.createdAt || b?.created_at || "")), updatedAt: normalizeString(String(b?.updatedAt || b?.updated_at || "")) };
  }

  function normalizeGoal(g) {
    return { id: normalizeString(String(g?.id || createId())), name: normalizeString(String(g?.name || "")), target: Number(g?.target), current: Number(g?.current), dueDate: normalizeString(String(g?.dueDate || g?.due_date || "")), createdAt: normalizeString(String(g?.createdAt || g?.created_at || "")), updatedAt: normalizeString(String(g?.updatedAt || g?.updated_at || "")) };
  }

  function normalizeProjection(p) {
    const months = clamp(Number.isInteger(Number(p?.months)) ? Number(p.months) : 6, 1, 24);
    const income = parseOptionalNumber(p?.income);
    const expense = parseOptionalNumber(p?.expense);
    const investment = parseOptionalNumber(p?.investment);
    return { months, income: income !== null && income >= 0 ? round2(income) : null, expense: expense !== null && expense >= 0 ? round2(expense) : null, investment: investment !== null && investment >= 0 ? round2(investment) : null, updatedAt: normalizeString(String(p?.updatedAt || p?.updated_at || "")) };
  }

  /* ── Validators ──────────────────────────────────────────── */
  function isValidTransaction(t) {
    if (!t || typeof t !== "object") return false;
    if (t.id != null && !normalizeString(t.id)) return false;
    if (!isValidDate(t.date)) return false;
    if (!["receita", "despesa", "investimento", "transferencia"].includes(t.type)) return false;
    if (!normalizeString(t.category) || !METHOD_LABELS[t.method]) return false;
    if (!normalizeString(t.description)) return false;
    return Number.isFinite(t.amount) && t.amount > 0;
  }

  function isValidBudget(b) {
    if (!b || typeof b !== "object") return false;
    if (b.id != null && !normalizeString(b.id)) return false;
    return Boolean(normalizeString(b.category)) && Number.isFinite(b.limit) && b.limit > 0;
  }

  function isValidGoal(g) {
    if (!g || typeof g !== "object") return false;
    if (g.id != null && !normalizeString(g.id)) return false;
    if (!normalizeString(g.name)) return false;
    if (!Number.isFinite(g.target) || g.target <= 0) return false;
    if (!Number.isFinite(g.current) || g.current < 0) return false;
    if (g.dueDate && !isValidDate(g.dueDate)) return false;
    return true;
  }

  /* ── Date / Format Utilities ─────────────────────────────── */
  function getCurrentMonth() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`; }
  function getTodayDate() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; }

  function isValidDate(v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return false;
    const [y, m, d] = String(v).split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() + 1 === m && date.getDate() === d;
  }

  function formatDate(v) { const [y, m, d] = String(v).split("-"); return d && m && y ? `${d}/${m}/${y}` : v; }
  function formatCurrency(v) { return CURRENCY.format(Number(v) || 0); }
  function formatMonthLabel(mv) { const [y, m] = mv.split("-"); const d = new Date(Number(y), Number(m) - 1, 1); return `${d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}/${String(d.getFullYear()).slice(-2)}`; }

  function formatGoalDueDate(dueDate) {
    const today = new Date(`${getTodayDate()}T00:00:00`);
    const due = new Date(`${dueDate}T00:00:00`);
    const diff = Math.ceil((due - today) / 86400000);
    if (diff === 0) return `Vence hoje (${formatDate(dueDate)})`;
    if (diff > 0) return `Vence em ${diff} dias (${formatDate(dueDate)})`;
    return `Venceu há ${Math.abs(diff)} dias (${formatDate(dueDate)})`;
  }

  /* ── Month Sequence Helpers ──────────────────────────────── */
  function getMonthSequence(base, start, end) { const seq = []; for (let o = start; o <= end; o++) seq.push(getMonthShift(base, o)); return seq; }
  function getMonthShift(base, offset) { const [y, m] = base.split("-").map(Number); const d = new Date(y, m - 1 + offset, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

  function getMonthlySummaryMap(transactions) {
    // Build a set of months from -5 to 0 relative to selected month to expand recurrences
    const map = new Map();
    const historyMonths = getMonthSequence(state.selectedMonth, -5, 0);
    historyMonths.forEach((m) => {
      const expanded = getMonthlyTransactions(m);
      expanded.forEach((t) => {
        if (t.type === "transferencia") return; // Transferências não contam no resumo mensal
        if (t.method === "credito") return; // Compras cartão = informativo
        const c = map.get(m) || { income: 0, expense: 0, investment: 0 };
        if (t.type === "receita") c.income += t.amount;
        else if (t.type === "despesa") c.expense += t.amount;
        else if (t.type === "investimento") c.investment += t.amount;
        map.set(m, c);
      });
    });
    return map;
  }

  function getAverageMonthlyFlow(map, months) {
    let inc = 0, exp = 0, inv = 0, pts = 0;
    months.forEach((m) => { const s = map.get(m); if (!s) return; inc += s.income; exp += s.expense; inv += s.investment; pts++; });
    return pts ? { income: round2(inc / pts), expense: round2(exp / pts), investment: round2(inv / pts) } : { income: 0, expense: 0, investment: 0 };
  }

  function getClosingCash(month) {
    // Expand all months up to target and accumulate
    let cash = 0;
    // Collect all unique months from earliest transaction to target month
    const months = new Set();
    state.transactions.forEach((t) => {
      const m = t.date.slice(0, 7);
      if (m <= month) months.add(m);
    });
    // Also add months between earliest recurring start and target
    state.transactions.forEach((t) => {
      if (t.recurrence === "monthly" || t.installments > 1) {
        const start = t.date.slice(0, 7);
        let cur = start;
        while (cur <= month) {
          months.add(cur);
          cur = getMonthShift(cur, 1);
        }
      }
    });
    const sortedMonths = [...months].sort();
    sortedMonths.forEach((m) => {
      const expanded = getMonthlyTransactions(m);
      expanded.forEach((t) => {
        if (t.type === "transferencia") return; // Transferências não afetam caixa
        if (t.method === "credito") return; // Compras cartão = informativo, fatura paga = despesa real
        cash += t.type === "receita" ? t.amount : -t.amount;
      });
    });
    return round2(cash);
  }

  function getProjectionBasis(proj, avg) {
    const i = proj.income !== null ? `Receita: ${formatCurrency(proj.income)}` : `Receita média: ${formatCurrency(avg.income)}`;
    const e = proj.expense !== null ? `Despesa: ${formatCurrency(proj.expense)}` : `Despesa média: ${formatCurrency(avg.expense)}`;
    const v = proj.investment !== null ? `Invest.: ${formatCurrency(proj.investment)}` : `Invest. médio: ${formatCurrency(avg.investment)}`;
    return `${i} / ${e} / ${v}`;
  }

  /* ── Chart Theme ─────────────────────────────────────────── */
  function getChartTheme() {
    return {
      labelColor: getCssVar("--text-secondary"), gridColor: withAlpha(getCssVar("--text-muted"), 0.15),
      positiveColor: getCssVar("--success"), negativeColor: getCssVar("--danger"),
      positiveFill: withAlpha(getCssVar("--success"), 0.12), negativeFill: withAlpha(getCssVar("--danger"), 0.12),
      projectedColor: getCssVar("--primary-soft"), projectedFill: withAlpha(getCssVar("--primary"), 0.1),
      actualColor: getCssVar("--primary"), surfaceBorder: getCssVar("--border"), emptyColor: withAlpha(getCssVar("--text-muted"), 0.25),
      patrimonioColor: getCssVar("--warning"), patrimonioFill: withAlpha(getCssVar("--warning"), 0.08),
    };
  }

  function getCssVar(name) { return getComputedStyle(document.body).getPropertyValue(name).trim(); }

  function withAlpha(color, alpha) {
    const v = String(color || "").trim();
    if (!v) return `rgba(99,110,124,${alpha})`;
    if (v.startsWith("#")) {
      const hex = v.slice(1); const n = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
      const [r, g, b] = [n.slice(0, 2), n.slice(2, 4), n.slice(4, 6)].map((h) => parseInt(h, 16));
      return [r, g, b].some(isNaN) ? `rgba(99,110,124,${alpha})` : `rgba(${r},${g},${b},${alpha})`;
    }
    if (v.startsWith("rgb(")) { const p = v.replace("rgb(", "").replace(")", "").split(",").map((s) => parseInt(s.trim(), 10)); return p.length === 3 && !p.some(isNaN) ? `rgba(${p[0]},${p[1]},${p[2]},${alpha})` : `rgba(99,110,124,${alpha})`; }
    return v.startsWith("rgba(") ? v : `rgba(99,110,124,${alpha})`;
  }

  function getChartColors(q) {
    const palette = ["#5e7fff", "#7b59ff", "#10d884", "#ff5a65", "#f5b74e", "#48b8ff", "#22c55e", "#ef4444", "#14b8a6", "#f97316"];
    return Array.from({ length: q }, (_, i) => palette[i % palette.length]);
  }

  /* ── String Utilities ────────────────────────────────────── */
  function normalizeString(v) { return String(v || "").replace(/\s+/g, " ").trim(); }
  function normalizeCategory(v) { const n = normalizeString(v); return n ? n.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ") : ""; }
  function getMethodLabel(m) { return METHOD_LABELS[m] || m; }
  function parseOptionalNumber(v) { if (v == null) return null; const n = typeof v === "number" ? v : Number(String(v).trim()); return Number.isFinite(n) ? n : null; }
  function round2(n) { return Number(n.toFixed(2)); }
  function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
  function createId() { return window.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function escapeHtml(v) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

  function normalizeHeader(v) { return normalizeString(String(v || "").replace(/^\uFEFF/, "")).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""); }
  function findHeaderIdx(headers, aliases) { for (const a of aliases) { const i = headers.indexOf(a); if (i >= 0) return i; } return -1; }

  function parseFlexibleNumber(v) {
    const t = String(v ?? "").replace(/[^\d,.\-]/g, "").trim();
    if (!t) return NaN;
    let n = t;
    if (t.includes(",") && t.includes(".")) n = t.replace(/\./g, "").replace(",", ".");
    else if (t.includes(",") && !t.includes(".")) n = t.replace(",", ".");
    return Number(n);
  }

  function detectCsvDelimiter(headerLine) {
    const candidates = [",", ";", "\t"];
    const counts = candidates.map((candidate) => ({ candidate, count: countUnquotedDelimiters(headerLine, candidate) }));
    counts.sort((a, b) => b.count - a.count);
    return counts[0].count > 0 ? counts[0].candidate : ",";
  }

  function countUnquotedDelimiters(line, delimiter) {
    let inQ = false;
    let count = 0;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') i++;
        else inQ = !inQ;
        continue;
      }
      if (!inQ && c === delimiter) count++;
    }
    return count;
  }

  function parseCsvLine(line, delimiter = ",") {
    const vals = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (c === delimiter && !inQ) { vals.push(cur); cur = ""; }
      else cur += c;
    }
    vals.push(cur); return vals;
  }

  function csvEscape(v) { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }
  function readFileAsText(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onerror = () => rej(new Error("Falha ao ler arquivo.")); r.onload = () => res(String(r.result || "")); r.readAsText(f); }); }

  /* ── Frontend Error Logging ────────────────────────────── */
  function logToBackend(level, message, extra) {
    try {
      const body = JSON.stringify({ level, message, url: location.href, ua: navigator.userAgent, ...extra });
      navigator.sendBeacon?.(API_BASE_URL + "/api/log", new Blob([body], { type: "application/json" }))
        || fetch(API_BASE_URL + "/api/log", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    } catch (_) { /* silent */ }
  }

  window.addEventListener("error", (e) => {
    logToBackend("error", e.message || "uncaught error", { stack: e.error?.stack });
  });
  window.addEventListener("unhandledrejection", (e) => {
    logToBackend("error", String(e.reason || "unhandled promise rejection"), { stack: e.reason?.stack });
  });

})();
