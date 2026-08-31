(function () {
  "use strict";

  // ---------------- Default / initial shape ----------------

  function defaultState() {
    return {
      people: [
        { id: "a", name: "", colorToken: "accent" },
        { id: "b", name: "", colorToken: "plum" }
      ],
      household: { shopping: [], tasks: [], expenses: [], bills: [] },
      personal: { a: { entries: [] }, b: { entries: [] } },
      meta: { updatedAt: null, updatedBy: null }
    };
  }

  // Firebase Realtime Database drops empty arrays/objects on write, so any
  // snapshot we read back may be missing branches that were emptied out.
  // Rebuild them so the rest of the app never has to null-check.
  function normalizeState(state) {
    state = state || {};
    if (!Array.isArray(state.people) || !state.people.length) state.people = defaultState().people;
    state.household = state.household || {};
    state.household.shopping = state.household.shopping || [];
    state.household.tasks = state.household.tasks || [];
    state.household.expenses = state.household.expenses || [];
    state.household.bills = state.household.bills || [];
    state.personal = state.personal || {};
    state.people.forEach(function (p) {
      state.personal[p.id] = state.personal[p.id] || { entries: [] };
      state.personal[p.id].entries = state.personal[p.id].entries || [];
    });
    state.meta = state.meta || { updatedAt: null, updatedBy: null };
    return state;
  }

  var STATE = defaultState();

  var ui = {
    tab: "casa",
    switcherOpen: false,
    editingSelf: false,
    pendingSlot: null,
    authError: null,
    authBusy: false
  };

  // whoAmI is derived from the authenticated Firebase user (email "a@casaemdia.invalid"
  // -> "a"), never from localStorage — real login is what remembers who you are now.
  var whoAmI = null;

  // ---------------- Firebase wiring ----------------

  var firebaseReady = false;
  var firebaseError = null;
  var online = null; // null = unknown yet, true/false once we hear from .info/connected
  var dbRef = null;
  var pendingWrites = {};
  var auth = null;
  var authUser = null; // firebase.User once signed in, else null

  function isConfigured() {
    var c = window.FIREBASE_CONFIG;
    return !!(c && c.apiKey && c.apiKey.indexOf("SUA_API_KEY") === -1 && c.databaseURL);
  }

  function slotEmail(slot) {
    return slot + "@casaemdia.invalid";
  }

  function initFirebase() {
    if (!isConfigured()) { render(); return; }
    try {
      firebase.initializeApp(window.FIREBASE_CONFIG);
      auth = firebase.auth();
      var db = firebase.database();

      db.ref(".info/connected").on("value", function (snap) {
        online = snap.val() === true;
        render();
      });

      auth.onAuthStateChanged(function (user) {
        authUser = user;
        if (user && !dbRef) {
          whoAmI = (user.email || "").split("@")[0];
          dbRef = db.ref("casaEmDia/" + (window.CASA_APP_ID || "default"));
          dbRef.on("value", function (snap) {
            if (snap.exists()) {
              STATE = normalizeState(snap.val());
            } else {
              // Nothing in the database yet: seed it with whatever STATE already holds
              // (never a fresh blank object) so an in-flight edit — e.g. the display name
              // just set right after creating an account — isn't discarded by this read.
              STATE = normalizeState(STATE);
              dbRef.set(STATE);
            }
            firebaseReady = true;
            render();
          }, function (err) {
            firebaseError = (err && err.message) || "Erro ao ler o banco de dados.";
            render();
          });
        }
        if (!user) { dbRef = null; firebaseReady = false; whoAmI = null; }
        render();
      });
    } catch (e) {
      firebaseError = e && e.message ? e.message : String(e);
      render();
    }
  }

  function friendlyAuthError(err) {
    var code = err && err.code;
    if (code === "auth/wrong-password" || code === "auth/invalid-credential" || code === "auth/invalid-login-credentials") return "Senha incorreta. Tente de novo.";
    if (code === "auth/weak-password") return "A senha precisa ter pelo menos 6 caracteres.";
    if (code === "auth/too-many-requests") return "Muitas tentativas. Espere um pouco e tente de novo.";
    if (code === "auth/network-request-failed") return "Sem conexão com a internet agora.";
    return (err && err.message) || "Não consegui entrar. Tente de novo.";
  }

  function submitAuthSlot(slot, name, password) {
    if (!auth) return;
    ui.authError = null;
    ui.authBusy = true;
    render();
    var email = slotEmail(slot);
    auth.signInWithEmailAndPassword(email, password).then(function () {
      afterAuthSuccess(slot, name);
    }).catch(function (err) {
      if (err && err.code === "auth/user-not-found") {
        auth.createUserWithEmailAndPassword(email, password).then(function () {
          afterAuthSuccess(slot, name);
        }).catch(function (err2) {
          ui.authBusy = false;
          ui.authError = friendlyAuthError(err2);
          render();
        });
      } else {
        ui.authBusy = false;
        ui.authError = friendlyAuthError(err);
        render();
      }
    });
  }

  function afterAuthSuccess(slot, name) {
    ui.authBusy = false;
    ui.pendingSlot = null;
    ui.authError = null;
    name = (name || "").trim();
    // people/{slot}.name is written once we're authenticated (rules require auth for writes).
    var tryWriteName = function () {
      if (!dbRef) { setTimeout(tryWriteName, 150); return; }
      if (name) {
        var p = personById(slot);
        if (p) p.name = name;
        syncPath("people", STATE.people);
      }
    };
    tryWriteName();
    render();
  }

  function signOut() {
    if (auth) auth.signOut();
    ui.switcherOpen = false;
  }

  function syncPath(path, value) {
    if (!firebaseReady || !dbRef) return;
    if (pendingWrites[path]) clearTimeout(pendingWrites[path]);
    pendingWrites[path] = setTimeout(function () {
      delete pendingWrites[path];
      dbRef.child(path).set(value).catch(function () { /* será re-sincronizado no próximo listener */ });
      dbRef.child("meta").set({ updatedAt: new Date().toISOString(), updatedBy: whoAmI }).catch(function () {});
    }, 400);
  }

  // ---------------- Utilities ----------------

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function fmtBRL(n) {
    n = Number(n) || 0;
    try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n); }
    catch (e) { return "R$ " + n.toFixed(2); }
  }

  function fmtDate(iso) {
    if (!iso) return "";
    try {
      var parts = iso.split("-");
      var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    } catch (e) { return iso; }
  }

  function todayISO() {
    var d = new Date();
    var m = (d.getMonth() + 1 < 10 ? "0" : "") + (d.getMonth() + 1);
    var day = (d.getDate() < 10 ? "0" : "") + d.getDate();
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function personById(id) {
    return STATE.people.find(function (p) { return p.id === id; }) || null;
  }
  function personName(id) {
    var p = personById(id);
    return p && p.name ? p.name : "Sem nome";
  }
  function personColor(id) {
    var p = personById(id);
    return p ? p.colorToken : "accent";
  }

  function escapeHTML(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---------------- Mutations ----------------

  function addShopping(text) {
    text = (text || "").trim();
    if (!text) return;
    STATE.household.shopping.unshift({ id: uid(), text: text, done: false, addedBy: whoAmI });
    render(); syncPath("household/shopping", STATE.household.shopping);
  }
  function toggleShopping(id) {
    var it = STATE.household.shopping.find(function (x) { return x.id === id; });
    if (it) { it.done = !it.done; render(); syncPath("household/shopping", STATE.household.shopping); }
  }
  function removeShopping(id) {
    STATE.household.shopping = STATE.household.shopping.filter(function (x) { return x.id !== id; });
    render(); syncPath("household/shopping", STATE.household.shopping);
  }

  function addTask(text, assignedTo) {
    text = (text || "").trim();
    if (!text) return;
    STATE.household.tasks.unshift({ id: uid(), text: text, done: false, assignedTo: assignedTo || null, addedBy: whoAmI });
    render(); syncPath("household/tasks", STATE.household.tasks);
  }
  function toggleTask(id) {
    var it = STATE.household.tasks.find(function (x) { return x.id === id; });
    if (it) { it.done = !it.done; render(); syncPath("household/tasks", STATE.household.tasks); }
  }
  function removeTask(id) {
    STATE.household.tasks = STATE.household.tasks.filter(function (x) { return x.id !== id; });
    render(); syncPath("household/tasks", STATE.household.tasks);
  }

  function addExpense(desc, amount, paidBy) {
    desc = (desc || "").trim();
    amount = Number(amount);
    if (!desc || !amount || amount <= 0 || !paidBy) return;
    STATE.household.expenses.unshift({ id: uid(), desc: desc, amount: amount, paidBy: paidBy, date: todayISO(), addedBy: whoAmI });
    render(); syncPath("household/expenses", STATE.household.expenses);
  }
  function removeExpense(id) {
    STATE.household.expenses = STATE.household.expenses.filter(function (x) { return x.id !== id; });
    render(); syncPath("household/expenses", STATE.household.expenses);
  }

  function addBill(desc, amount, dueDate) {
    desc = (desc || "").trim();
    amount = Number(amount);
    if (!desc || !amount || amount <= 0 || !dueDate) return;
    STATE.household.bills.push({ id: uid(), desc: desc, amount: amount, dueDate: dueDate, paid: false, addedBy: whoAmI });
    STATE.household.bills.sort(function (a, b) { return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0; });
    render(); syncPath("household/bills", STATE.household.bills);
  }
  function toggleBill(id) {
    var it = STATE.household.bills.find(function (x) { return x.id === id; });
    if (it) { it.paid = !it.paid; render(); syncPath("household/bills", STATE.household.bills); }
  }
  function removeBill(id) {
    STATE.household.bills = STATE.household.bills.filter(function (x) { return x.id !== id; });
    render(); syncPath("household/bills", STATE.household.bills);
  }

  function addPersonalEntry(desc, amount, kind) {
    desc = (desc || "").trim();
    amount = Number(amount);
    if (!desc || !amount || amount <= 0 || !whoAmI) return;
    var signed = kind === "out" ? -Math.abs(amount) : Math.abs(amount);
    if (!STATE.personal[whoAmI]) STATE.personal[whoAmI] = { entries: [] };
    STATE.personal[whoAmI].entries.unshift({ id: uid(), desc: desc, amount: signed, date: todayISO() });
    render(); syncPath("personal/" + whoAmI + "/entries", STATE.personal[whoAmI].entries);
  }
  function removePersonalEntry(id) {
    if (!whoAmI || !STATE.personal[whoAmI]) return;
    STATE.personal[whoAmI].entries = STATE.personal[whoAmI].entries.filter(function (x) { return x.id !== id; });
    render(); syncPath("personal/" + whoAmI + "/entries", STATE.personal[whoAmI].entries);
  }

  function renameSelf(name) {
    name = (name || "").trim();
    var p = personById(whoAmI);
    if (p && name) { p.name = name; render(); syncPath("people", STATE.people); }
  }

  // ---------------- Rendering ----------------

  function renderBanner() {
    if (firebaseError) {
      return '<div class="setup-banner">Não consegui conectar ao Firebase (' + escapeHTML(firebaseError) + '). Os dados não serão salvos nem sincronizados até corrigir <code>firebase-config.js</code>.</div>';
    }
    if (!isConfigured()) {
      return '<div class="setup-banner">Firebase ainda não configurado — nada será salvo nem sincronizado entre celulares. Veja o <strong>README.md</strong> do repositório para configurar (leva uns 10 minutos).</div>';
    }
    return "";
  }

  function renderAuthGate() {
    if (ui.pendingSlot) {
      var slot = ui.pendingSlot;
      var color = personColor(slot);
      return '<div class="onboarding"><div class="onboarding-inner">' +
        '<p class="eyebrow">Casa em Dia</p>' +
        '<h1 class="onboarding-title">Entrar</h1>' +
        '<p class="onboarding-sub">Se é a primeira vez nesse perfil, a senha que você digitar agora vira sua senha daqui pra frente — guarde ela.</p>' +
        '<form class="onboard-name-form auth-form" data-form="auth-slot" data-id="' + slot + '" style="flex-direction:column;align-items:stretch;gap:.6rem;">' +
        '<input class="input" name="name" placeholder="Seu nome" maxlength="30" data-focus="auth-name" autocomplete="name">' +
        '<input class="input" name="password" type="password" placeholder="Sua senha" minlength="6" maxlength="100" data-focus="auth-password" autocomplete="current-password">' +
        (ui.authError ? '<p class="auth-error">' + escapeHTML(ui.authError) + "</p>" : "") +
        '<button class="btn btn-' + color + '" type="submit"' + (ui.authBusy ? " disabled" : "") + ">" + (ui.authBusy ? "Entrando…" : "Entrar") + "</button>" +
        '<button class="icon-btn" type="button" data-action="cancel-slot">‹ Escolher outro perfil</button>' +
        "</form>" +
        "</div></div>";
    }

    var cards = STATE.people.map(function (p) {
      return '<button class="onboard-card tone-' + p.colorToken + '" data-action="choose-slot" data-id="' + p.id + '">' +
        '<span class="onboard-card-name">Perfil ' + (p.colorToken === "accent" ? "verde" : "rosa") + "</span>" +
        '<span class="onboard-card-hint">Entrar ou criar conta neste perfil</span>' +
        "</button>";
    }).join("");

    return '<div class="onboarding"><div class="onboarding-inner">' +
      '<p class="eyebrow">Casa em Dia</p>' +
      '<h1 class="onboarding-title">Quem é você?</h1>' +
      '<p class="onboarding-sub">Cada uma tem sua própria senha — só quem sabe a senha do perfil consegue entrar e ver os dados.</p>' +
      '<div class="onboard-cards">' + cards + "</div>" +
      "</div></div>";
  }

  function renderSyncStatus() {
    if (!isConfigured() || firebaseError) return "";
    var cls = "sync-status " + (online === true ? "is-online" : online === false ? "is-offline" : "is-syncing");
    var label = online === true ? "sincronizado" : online === false ? "sem conexão" : "conectando";
    return '<span class="' + cls + '"><span class="sync-dot"></span>' + label + "</span>";
  }

  function renderHeader() {
    return '<header class="topbar">' +
      '<span class="topbar-eyebrow">Casa em Dia</span>' +
      '<span style="display:flex;align-items:center;">' +
      renderSyncStatus() +
      '<button class="chip tone-' + personColor(whoAmI) + '" data-action="open-switcher">' +
      '<span class="chip-dot"></span><span>' + escapeHTML(personName(whoAmI)) + "</span>" +
      "</button>" +
      "</span>" +
      "</header>";
  }

  function renderSwitcher() {
    var me = personById(whoAmI);
    var meRow = ui.editingSelf
      ? '<form class="switcher-row switcher-row-edit" data-form="rename-self">' +
        '<input class="input" name="name" value="' + escapeHTML((me && me.name) || "") + '" maxlength="30" data-focus="rename-self">' +
        '<button class="btn-small btn-' + personColor(whoAmI) + '" type="submit">Salvar</button>' +
        "</form>"
      : '<div class="switcher-row" data-action="noop">' +
        '<span class="switcher-pick tone-' + personColor(whoAmI) + '">' +
        '<span class="chip-dot"></span><span>' + escapeHTML(personName(whoAmI)) + "</span>" +
        "</span>" +
        '<button class="icon-btn" data-action="edit-self">Editar</button>' +
        "</div>";

    return '<div class="sheet-backdrop" data-action="close-switcher">' +
      '<div class="sheet" data-action="noop">' +
      '<p class="sheet-title">Você está entrando como</p>' +
      meRow +
      '<button class="btn-small" data-action="sign-out" style="margin-top:.4rem;background:var(--surface-2);color:var(--ink);">Sair deste perfil</button>' +
      '<p class="sheet-note">Sair permite que outra pessoa entre com o próprio perfil e senha neste celular.</p>' +
      "</div></div>";
  }

  function renderTabbar() {
    var tabs = [
      { id: "casa", label: "Casa" },
      { id: "financeiro", label: "Financeiro" },
      { id: "pessoal", label: "Meu financeiro" }
    ];
    return '<nav class="tabbar">' + tabs.map(function (t) {
      return '<button class="tabbar-btn' + (ui.tab === t.id ? " is-active" : "") + '" data-action="set-tab" data-id="' + t.id + '">' + t.label + "</button>";
    }).join("") + "</nav>";
  }

  function renderShoppingCard() {
    var items = STATE.household.shopping;
    var pending = items.filter(function (i) { return !i.done; });
    var done = items.filter(function (i) { return i.done; });
    function row(i) {
      return '<li class="list-row' + (i.done ? " is-done" : "") + '">' +
        '<button class="check" data-action="toggle-shopping" data-id="' + i.id + '" aria-label="Marcar"></button>' +
        '<span class="list-row-text">' + escapeHTML(i.text) + "</span>" +
        '<button class="icon-btn" data-action="remove-shopping" data-id="' + i.id + '">Remover</button>' +
        "</li>";
    }
    var body = items.length
      ? ('<ul class="list">' + pending.map(row).join("") + "</ul>" +
         (done.length ? '<details class="done-drawer"><summary>' + done.length + " concluído" + (done.length > 1 ? "s" : "") + '</summary><ul class="list">' + done.map(row).join("") + "</ul></details>" : ""))
      : '<p class="empty">Nada na lista ainda. Adicione o primeiro item.</p>';

    return '<section class="card">' +
      '<h2 class="card-title">Lista de compras</h2>' +
      '<form class="add-row" data-form="add-shopping">' +
      '<input class="input" name="text" placeholder="Adicionar item" maxlength="60" data-focus="add-shopping-input">' +
      '<button class="btn btn-accent" type="submit">Adicionar</button>' +
      "</form>" + body +
      "</section>";
  }

  function renderTasksCard() {
    var items = STATE.household.tasks;
    var pending = items.filter(function (i) { return !i.done; });
    var done = items.filter(function (i) { return i.done; });
    function row(i) {
      var tag = i.assignedTo
        ? '<span class="tag tone-' + personColor(i.assignedTo) + '">' + escapeHTML(personName(i.assignedTo)) + "</span>"
        : '<span class="tag">Qualquer uma</span>';
      return '<li class="list-row' + (i.done ? " is-done" : "") + '">' +
        '<button class="check" data-action="toggle-task" data-id="' + i.id + '" aria-label="Marcar"></button>' +
        '<span class="list-row-text">' + escapeHTML(i.text) + "</span>" + tag +
        '<button class="icon-btn" data-action="remove-task" data-id="' + i.id + '">Remover</button>' +
        "</li>";
    }
    var options = '<option value="">Qualquer uma</option>' + STATE.people.map(function (p) {
      return '<option value="' + p.id + '">' + escapeHTML(p.name || "Sem nome") + "</option>";
    }).join("");
    var body = items.length
      ? ('<ul class="list">' + pending.map(row).join("") + "</ul>" +
         (done.length ? '<details class="done-drawer"><summary>' + done.length + " concluída" + (done.length > 1 ? "s" : "") + '</summary><ul class="list">' + done.map(row).join("") + "</ul></details>" : ""))
      : '<p class="empty">Nenhuma tarefa ainda.</p>';

    return '<section class="card">' +
      '<h2 class="card-title">Tarefas de casa</h2>' +
      '<form class="add-row add-row-task" data-form="add-task">' +
      '<input class="input" name="text" placeholder="Adicionar tarefa" maxlength="60" data-focus="add-task-input">' +
      '<select class="select" name="assignedTo">' + options + "</select>" +
      '<button class="btn btn-accent" type="submit">Adicionar</button>' +
      "</form>" + body +
      "</section>";
  }

  function renderExpensesCard() {
    var list = STATE.household.expenses;
    var ids = STATE.people.map(function (p) { return p.id; });
    var totals = {};
    list.forEach(function (e) { totals[e.paidBy] = (totals[e.paidBy] || 0) + Number(e.amount); });
    var t0 = totals[ids[0]] || 0, t1 = totals[ids[1]] || 0;
    var diff = t0 - t1;
    var balanceLine;
    if (Math.abs(diff) < 0.01) {
      balanceLine = "As contas estão equilibradas entre vocês.";
    } else {
      var ower = diff > 0 ? ids[1] : ids[0];
      var owed = diff > 0 ? ids[0] : ids[1];
      balanceLine = escapeHTML(personName(ower)) + " deve " + fmtBRL(Math.abs(diff) / 2) + " para " + escapeHTML(personName(owed)) + " (considerando divisão igual).";
    }
    function row(e) {
      return '<li class="list-row money-row">' +
        '<div class="money-row-main"><span class="list-row-text">' + escapeHTML(e.desc) + "</span>" +
        '<span class="tag tone-' + personColor(e.paidBy) + '">' + escapeHTML(personName(e.paidBy)) + "</span></div>" +
        '<span class="money-amount">' + fmtBRL(e.amount) + "</span>" +
        '<span class="list-row-date">' + fmtDate(e.date) + "</span>" +
        '<button class="icon-btn" data-action="remove-expense" data-id="' + e.id + '">Remover</button>' +
        "</li>";
    }
    var options = STATE.people.map(function (p) { return '<option value="' + p.id + '">' + escapeHTML(p.name || "Sem nome") + "</option>"; }).join("");

    return '<section class="card">' +
      '<h2 class="card-title">Gastos da casa</h2>' +
      '<div class="stat-row"><div class="stat"><span class="stat-label">Total registrado</span><span class="stat-value">' + fmtBRL(t0 + t1) + "</span></div></div>" +
      '<p class="balance-note">' + balanceLine + "</p>" +
      '<form class="add-row add-row-expense" data-form="add-expense">' +
      '<input class="input" name="desc" placeholder="Descrição" maxlength="60" data-focus="add-expense-desc">' +
      '<input class="input input-money" name="amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="Valor">' +
      '<select class="select" name="paidBy">' + options + "</select>" +
      '<button class="btn btn-accent" type="submit">Adicionar</button>' +
      "</form>" +
      (list.length ? '<ul class="list">' + list.map(row).join("") + "</ul>" : '<p class="empty">Nenhum gasto registrado ainda.</p>') +
      "</section>";
  }

  function renderBillsCard() {
    var list = STATE.household.bills;
    var today = todayISO();
    function status(b) {
      if (b.paid) return { label: "Pago", tone: "good" };
      if (b.dueDate < today) return { label: "Vencida", tone: "critical" };
      return { label: "A vencer", tone: "warn" };
    }
    function row(b) {
      var s = status(b);
      return '<li class="list-row money-row">' +
        '<button class="check" data-action="toggle-bill" data-id="' + b.id + '" aria-label="Marcar como paga"></button>' +
        '<div class="money-row-main"><span class="list-row-text' + (b.paid ? " is-done" : "") + '">' + escapeHTML(b.desc) + "</span>" +
        '<span class="badge tone-' + s.tone + '">' + s.label + "</span></div>" +
        '<span class="money-amount">' + fmtBRL(b.amount) + "</span>" +
        '<span class="list-row-date">vence ' + fmtDate(b.dueDate) + "</span>" +
        '<button class="icon-btn" data-action="remove-bill" data-id="' + b.id + '">Remover</button>' +
        "</li>";
    }
    return '<section class="card">' +
      '<h2 class="card-title">Contas a pagar</h2>' +
      '<form class="add-row add-row-bill" data-form="add-bill">' +
      '<input class="input" name="desc" placeholder="Descrição" maxlength="60" data-focus="add-bill-desc">' +
      '<input class="input input-money" name="amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="Valor">' +
      '<input class="input" name="dueDate" type="date">' +
      '<button class="btn btn-accent" type="submit">Adicionar</button>' +
      "</form>" +
      (list.length ? '<ul class="list">' + list.map(row).join("") + "</ul>" : '<p class="empty">Nenhuma conta cadastrada ainda.</p>') +
      "</section>";
  }

  function renderPessoalTab() {
    var data = STATE.personal[whoAmI] || { entries: [] };
    var saldo = data.entries.reduce(function (s, e) { return s + Number(e.amount); }, 0);
    function row(e) {
      var isOut = e.amount < 0;
      return '<li class="list-row money-row">' +
        '<div class="money-row-main"><span class="list-row-text">' + escapeHTML(e.desc) + "</span></div>" +
        '<span class="money-amount ' + (isOut ? "is-negative" : "is-positive") + '">' + (isOut ? "-" : "+") + fmtBRL(Math.abs(e.amount)) + "</span>" +
        '<span class="list-row-date">' + fmtDate(e.date) + "</span>" +
        '<button class="icon-btn" data-action="remove-personal" data-id="' + e.id + '">Remover</button>' +
        "</li>";
    }
    return '<section class="card">' +
      '<h2 class="card-title">Meu financeiro — ' + escapeHTML(personName(whoAmI)) + "</h2>" +
      '<div class="stat-row"><div class="stat"><span class="stat-label">Saldo</span><span class="stat-value' + (saldo < 0 ? " is-negative" : "") + '">' + fmtBRL(saldo) + "</span></div></div>" +
      '<form class="add-row add-row-personal" data-form="add-personal">' +
      '<input class="input" name="desc" placeholder="Descrição" maxlength="60" data-focus="add-personal-desc">' +
      '<input class="input input-money" name="amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="Valor">' +
      '<select class="select" name="kind"><option value="out">Saída</option><option value="in">Entrada</option></select>' +
      '<button class="btn btn-plum" type="submit">Adicionar</button>' +
      "</form>" +
      (data.entries.length ? '<ul class="list">' + data.entries.map(row).join("") : '<p class="empty">Nenhum lançamento ainda.</p>') +
      (data.entries.length ? "</ul>" : "") +
      '<p class="privacy-note">Só quem entra com a senha do seu perfil vê isso. A outra pessoa da casa tem seu próprio login e não vê seus lançamentos por padrão — mas como os dois perfis moram no mesmo banco, alguém com acesso direto ao banco de dados tecnicamente poderia ver tudo. Para o dia a dia, é privado.</p>' +
      "</section>";
  }

  function renderTabContent() {
    if (ui.tab === "casa") return renderShoppingCard() + renderTasksCard();
    if (ui.tab === "financeiro") return renderExpensesCard() + renderBillsCard();
    return renderPessoalTab();
  }

  function renderShell() {
    var banner = renderBanner();
    if (!isConfigured() || firebaseError) return banner + renderAuthGate();
    if (!authUser) return banner + renderAuthGate();
    if (!firebaseReady) return banner + '<div class="onboarding"><div class="onboarding-inner"><p class="eyebrow">Casa em Dia</p><h1 class="onboarding-title">Carregando…</h1></div></div>';
    return banner + '<div class="app-shell">' +
      renderHeader() +
      '<main class="content">' + renderTabContent() + "</main>" +
      renderTabbar() +
      "</div>" +
      (ui.switcherOpen ? renderSwitcher() : "");
  }

  function render() {
    var root = document.getElementById("root");
    if (!root) return;
    var active = document.activeElement;
    var focusKey = active && active.dataset ? active.dataset.focus : null;
    var selStart = null, selEnd = null;
    if (focusKey && "selectionStart" in active) { selStart = active.selectionStart; selEnd = active.selectionEnd; }
    root.innerHTML = renderShell();
    if (focusKey) {
      var el = root.querySelector('[data-focus="' + focusKey + '"]');
      if (el) {
        el.focus();
        if (selStart !== null && "setSelectionRange" in el) {
          try { el.setSelectionRange(selStart, selEnd); } catch (e) {}
        }
      }
    }
  }

  // ---------------- Event delegation ----------------

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.dataset.action;
    var id = el.dataset.id;
    switch (action) {
      case "noop": break;
      case "open-switcher": ui.switcherOpen = true; render(); break;
      case "close-switcher": ui.switcherOpen = false; ui.editingSelf = false; render(); break;
      case "choose-slot": ui.pendingSlot = id; ui.authError = null; render(); break;
      case "cancel-slot": ui.pendingSlot = null; ui.authError = null; render(); break;
      case "edit-self": ui.editingSelf = true; render(); break;
      case "sign-out": signOut(); render(); break;
      case "set-tab": ui.tab = id; render(); break;
      case "toggle-shopping": toggleShopping(id); break;
      case "remove-shopping": removeShopping(id); break;
      case "toggle-task": toggleTask(id); break;
      case "remove-task": removeTask(id); break;
      case "toggle-bill": toggleBill(id); break;
      case "remove-bill": removeBill(id); break;
      case "remove-expense": removeExpense(id); break;
      case "remove-personal": removePersonalEntry(id); break;
    }
  });

  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || !form.dataset || !form.dataset.form) return;
    e.preventDefault();
    var fd = new FormData(form);
    switch (form.dataset.form) {
      case "auth-slot":
        submitAuthSlot(form.dataset.id, fd.get("name"), fd.get("password"));
        break;
      case "rename-self":
        renameSelf(fd.get("name"));
        ui.editingSelf = false;
        render();
        break;
      case "add-shopping": addShopping(fd.get("text")); break;
      case "add-task": addTask(fd.get("text"), fd.get("assignedTo")); break;
      case "add-expense": addExpense(fd.get("desc"), fd.get("amount"), fd.get("paidBy")); break;
      case "add-bill": addBill(fd.get("desc"), fd.get("amount"), fd.get("dueDate")); break;
      case "add-personal": addPersonalEntry(fd.get("desc"), fd.get("amount"), fd.get("kind")); break;
    }
  });

  render();
  initFirebase();
})();
