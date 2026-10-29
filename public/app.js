(() => {
  "use strict";

  const ELECTION_YEAR = 2026;
  const DATA_VERSION = "2026-10-06-region-scope-history-v1";
  const VIEWS = {
    home: ["Início", "Cadastros, cruzamentos e resultados organizados por área."],
    reports: ["Relatórios", "Escolha a listagem e confira a prévia antes de baixar."],
    management: ["Gestão", "Atualização dos resultados, backup, acessos e instalação."],
    distribution: ["Distribuição dos cadastros", "Cadastros por zona, seção, escola e bairro no município em análise."],
    "quality-review": ["Central de Qualidade", "Pendências, responsáveis, fontes documentais e andamento das conferências."],
    operations: ["Saúde e backups", "Funcionamento da plataforma, diagnóstico e cópias automáticas protegidas."],
    duplicates: ["Duplicidades", "Confira repetições, observações e divergências. Preserve o cadastro mais antigo quando os dados estiverem corretos."],
    "archived-records": ["Cadastros arquivados", "Consulte fichas, observações e histórico. Confira os dados antes de preparar uma reativação."],
    leadership: ["Mapa das lideranças", "Locais de referência das lideranças e seus cadastros vinculados."],
    intake: ["Recebimentos e importação", "Adicione cadastros por planilha, ficha ou formulário e revise antes de sincronizar."],
    "crm-settings": ["Backup e administração", "Cópia protegida, exportação, histórico e acesso à base de cadastros."],
    partnership: ["Dupla × cadastros", "Confira a compatibilidade da votação estadual e federal com os cadastros da liderança."],
    menu: ["Menu da plataforma", "Escolha a página que deseja consultar."],
    overview: ["Resumo do candidato", "Escolha o cargo, o recorte e o candidato para consultar a votação."],
    territory: ["Zonas e locais", "Refine por zona, seção, escola ou bairro. Os relatórios seguem os filtros."],
    map: ["Mapa eleitoral", "Escolha candidatos e cores para visualizar a votação nos municípios do Pará."],
    regional: ["Resultados por região", "Consulte a votação consolidada e todos os municípios de cada região."],
    archive: ["Eleições anteriores e partidos", "Deputados: 2014 a 2026. Vereador: 2020 e 2024, por município. Cada eleição consultada separadamente."],
    quocients: ["Quocientes e vagas", "Votos válidos, partidos, federações e distribuição das cadeiras no Pará."],
    council: ["Conselho Tutelar — 2023", "Ananindeua: escolas por conselho, votação homologada, gráficos e relatórios."],
    results: ["Resultados de 2026", "Consulte os cinco cargos por região, município e zona."],
    xray: ["Raio-X do candidato", "Veja a cobertura, os índices e os 30 municípios com mais votos."],
    comparison: ["Apurações individuais", "Consulte os resultados oficiais de um candidato por vez no recorte selecionado."],
    paired: ["Central de cruzamentos", "Compare os votos por seção e confira os totais de cada escola."],
    lists: ["Eleitores e lideranças", "Cadastre, edite e organize os eleitores por coordenador e liderança."],
    analysis: ["Candidato × cadastros", "Compare os cadastros e os votos agregados por seção."],
    base: ["Atualizar base eleitoral", "Importe, confira os totais e recupere versões anteriores por cargo."],
    help: ["Ajuda e fontes", "Critérios dos filtros, indicadores e relatórios."],
  };
  const REGION_SCOPE = "__region__";
  const STATE_SCOPE = "__state__";
  const MANUAL_SCOPE = "__selected__";
  let manualMunicipalityDraft = new Set();
  let manualPreferredCandidateId = "";
  let manualPlaceTimer;
  const cityCache = new Map();
  const scopeCache = new Map();
  let scopeWorkerJob = null;
  const historyCache = new Map();
  const historyRequests = new Map();
  const previousCandidateCache = new Map();
  const qualityCache = new WeakMap();
  let comparisonSelectorCity = null;
  const STORAGE_KEY = "analise-eleitoral-pa-liderancas-2026-v1";
  const DEFAULT_CITY_CODE = "4154";
  const OFFICES = {
    estadual: {
      label: "Deputado Estadual",
      dataPath: "./data",
      defaultCandidateNumber: "15789",
    },
    federal: {
      label: "Deputado Federal",
      dataPath: "./data/federal",
      defaultCandidateNumber: "",
    },
  };
  const ALL_LISTS = "__all__";
  const COORDINATOR_SCOPE_PREFIX = "__coordinator__:";
  const MAX_RENDER_ROWS = 250;
  const MAX_IMPORT_ROWS = 50000;
  const CHART_COLORS = ["#2358ed", "#7940d7", "#007b78", "#cb7015", "#c23a65", "#0b8eac", "#a154cf", "#488946", "#c45d21", "#4a65a9"];
  const COMPARE_COLORS = ["#2358ed", "#7940d7"];

  const numberFormatter = new Intl.NumberFormat("pt-BR");
  const percentFormatter = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const state = {
    view: "home",
    office: "estadual",
    index: null,
    statewide: null,
    regional: null,
    city: null,
    cityCode: "",
    previousStandardCityCode: DEFAULT_CITY_CODE,
    manualMunicipalityCodes: [],
    selectionMunicipality: "",
    selectionZone: "",
    selectionPlaceSearch: "",
    selectionPlace: "",
    selectionPlaces: [],
    candidate: null,
    candidateSearchRows: [],
    searchMatches: [],
    searchActiveIndex: -1,
    lists: [],
    activeListId: "",
    analysisScope: ALL_LISTS,
    analysisZone: "",
    analysis: null,
    territoryZone: "",
    territorySection: "",
    territoryPlace: "",
    territoryPlaces: [],
    territoryNeighborhood: "",
    regionFilter: "",
    regionalRegion: "",
    compareCandidateIds: ["", ""],
    completeReportLayout: "consolidated",
    indexRequest: 0,
    cityRequest: 0,
  };

  const el = (id) => document.getElementById(id);

  function showWorkspaceView(view, scroll = true) {
    if (window.CrossingHub && ["comparison", "analysis", "partnership"].includes(view)) {
      window.CrossingHub.fromLegacy(view,state);view="paired";
    }
    if (!VIEWS[view]) return;
    if (state.cityCode === MANUAL_SCOPE && ["comparison", "regional", "xray", "analysis"].includes(view)) {
      const candidateId = state.candidate?.[0] || "";
      const previousCode = state.previousStandardCityCode;
      loadCity(previousCode && previousCode !== REGION_SCOPE ? previousCode : DEFAULT_CITY_CODE, true, candidateId);
    }
    state.view = view;
    document.body.dataset.view = view;
    document.body.classList.add("platform-ready");
    document.querySelectorAll("[data-view-content]").forEach((node) => {
      node.classList.toggle("is-view-hidden", !node.dataset.viewContent.split(" ").includes(view));
    });
    document.querySelectorAll("button[data-view], a[data-view]").forEach((button) => {
      button.setAttribute("aria-current", button.dataset.view === view ? "page" : "false");
    });
    el("view-title").textContent = VIEWS[view][0];
    el("view-description").textContent = VIEWS[view][1];
    const electionStamp=document.querySelector('.election-stamp');
    if(electionStamp){const year=document.createElement('strong'),place=document.createElement('span');year.textContent=view==='council'?'2023':'2026';place.textContent=view==='council'?'Ananindeua':'Pará • 1º turno';electionStamp.replaceChildren(document.createTextNode(view==='council'?'Conselho Tutelar ':'Eleições '),year,document.createTextNode(' '),place);}
    const brandYear=document.querySelector('.brand small');if(brandYear)brandYear.textContent=view==='council'?'Pará • 2023':'Pará • 2026';
    el("complete-report-button").disabled = false;
    if (state.city && state.candidate) renderCandidate();
    if (view === "analysis") renderAnalysis();
    if (view === "paired") {if(window.CrossingHub)window.CrossingHub.activate();else window.PairedView?.activate();}
    if (view === "map") window.ElectoralMap?.activate();
    if (view === "archive") window.ElectionArchive?.activate();
    if (view === "quocients") window.Quocients?.activate();
    if (view === "council") window.CouncilTutelar?.activate();
    if (view === "results") window.Results2026?.activate();
    window.AppHome?.update?.(view);
    window.WorkspacePages?.update(view);
    if (scroll) {
      window.scrollTo?.({ top: 0, behavior: "auto" });
      el("view-title").focus?.({ preventScroll: true });
    }
  }

  function renderActiveCandidateView() {
    if (!state.city || !state.candidate) return;
    if (state.city.isManualSelection) return renderManualMunicipalities();
    if (state.view === "territory") renderTerritoryReport();
    if (state.view === "xray") renderCandidateXray();
    if (state.view === "regional") renderRegionalReport();
    if (state.view === "map") window.ElectoralMap?.render();
    if (state.view === "comparison") renderCandidateComparison();
    if (["overview", "territory"].includes(state.view)) ensureHistory(state.candidate);
  }

  function officeConfig() {
    return OFFICES[state.office] || OFFICES.estadual;
  }

  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function normalizeHeader(value) {
    return normalizeText(value).replace(/\s+/g, "");
  }

  function canonicalElectionNumber(value) {
    const raw = String(value ?? "").trim().replace(/\.0+$/, "");
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    return String(Number.parseInt(digits, 10));
  }

  function cleanTitle(value) {
    const raw = String(value ?? "").trim().replace(/\.0+$/, "");
    const digits = raw.replace(/\D/g, "");
    if (!digits) return raw;
    return digits;
  }

  function titleKey(value) {
    const digits = String(value ?? "").replace(/\D/g, "");
    return digits ? digits.padStart(12, "0") : "";
  }

  function fmtInt(value) {
    return numberFormatter.format(Number(value) || 0);
  }

  function fmtPercent(value) {
    return `${percentFormatter.format((Number(value) || 0) * 100)}%`;
  }

  function fmtSignedPercent(value) {
    if (!Number.isFinite(value)) return "—";
    const prefix = value > 0 ? "+" : "";
    return `${prefix}${percentFormatter.format(value * 100)}%`;
  }

  function createCell(text, className = "") {
    const td = document.createElement("td");
    td.textContent = text ?? "";
    if (className) td.className = className;
    return td;
  }

  function replaceTableBody(target, rows) {
    const fragment = document.createDocumentFragment();
    rows.forEach((row) => fragment.appendChild(row));
    target.replaceChildren(fragment);
  }

  function toast(message, type = "success") {
    const item = document.createElement("div");
    item.className = `toast${type === "error" ? " error" : ""}`;
    item.textContent = message;
    el("toast-region").appendChild(item);
    window.setTimeout(() => item.remove(), 5200);
  }

  function uid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `lista-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function loadStoredLists() {
    // The central workspace loads records after password unlock.
    state.lists = [];
  }

  function persistLists() {
    if (!window.CrmWorkspace?.canEdit()) {
      toast("Desbloqueie a base de lideranças antes de alterar as listas.", "error");
      return false;
    }
    window.CrmWorkspace.captureLists(state.lists).catch(error => toast(error.message, "error"));
    return true;
  }

  function sanitizeRecord(record) {
    return {
      ...record,
      name: String(record?.name ?? "").trim().slice(0, 120),
      title: cleanTitle(record?.title ?? "").slice(0, 24),
      zone: canonicalElectionNumber(record?.zone ?? "").slice(0, 6),
      section: canonicalElectionNumber(record?.section ?? "").slice(0, 6),
      contact: String(record?.contact ?? "").trim().slice(0, 60),
    };
  }

  function getActiveList() {
    return state.lists.find((list) => list.id === state.activeListId) || null;
  }

  function coordinatorKey(value) {
    return normalizeText(value) || "__unassigned__";
  }

  function coordinatorDisplay(value) {
    return String(value || "").trim() || "Não informado";
  }

  function coordinatorScopeValue(key) {
    return `${COORDINATOR_SCOPE_PREFIX}${encodeURIComponent(key)}`;
  }

  function coordinatorKeyFromScope(scope) {
    if (!String(scope).startsWith(COORDINATOR_SCOPE_PREFIX)) return null;
    try {
      return decodeURIComponent(String(scope).slice(COORDINATOR_SCOPE_PREFIX.length));
    } catch {
      return null;
    }
  }

  function coordinatorGroups() {
    const groups = new Map();
    state.lists.forEach((list) => {
      const key = coordinatorKey(list.coordinator);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          name: coordinatorDisplay(list.coordinator),
          lists: [],
        });
      }
      groups.get(key).lists.push(list);
    });
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  function uniqueListName(requested) {
    const base = String(requested || "Nova lista").trim().slice(0, 72) || "Nova lista";
    const existing = new Set(state.lists.map((list) => normalizeText(list.name)));
    if (!existing.has(normalizeText(base))) return base;
    let suffix = 2;
    while (existing.has(normalizeText(`${base} (${suffix})`))) suffix += 1;
    return `${base} (${suffix})`;
  }

  function createList(name, records = [], coordinator = "") {
    const list = {
      id: uid(),
      name: uniqueListName(name),
      coordinator: String(coordinator || "").trim().slice(0, 100),
      createdAt: new Date().toISOString(),
      records: records.map(sanitizeRecord),
    };
    state.lists.push(list);
    state.activeListId = list.id;
    state.analysisScope = state.lists.length === 1 ? list.id : ALL_LISTS;
    persistLists();
    renderLists();
    return list;
  }

  function validateRecords(records) {
    const seenTitles = new Set();
    const valid = [];
    const duplicateRows = [];
    const incompleteRows = [];

    records.forEach((record, index) => {
      const normalized = sanitizeRecord(record);
      const wrapped = {
        ...normalized,
        _listName: record._listName || "",
        _coordinator: record._coordinator || "",
        _sourceIndex: index,
      };
      if (!normalized.zone || !normalized.section || normalized.ready === false) {
        incompleteRows.push(wrapped);
        return;
      }
      const key = titleKey(normalized.title);
      if (key && seenTitles.has(key)) {
        duplicateRows.push(wrapped);
        return;
      }
      if (key) seenTitles.add(key);
      valid.push(wrapped);
    });

    return { valid, duplicateRows, incompleteRows };
  }

  function renderLists() {
    const managerSelect = el("list-select");
    const priorManager = state.activeListId;
    managerSelect.replaceChildren();

    if (!state.lists.length) {
      const option = new Option("Nenhuma lista cadastrada", "");
      managerSelect.add(option);
      managerSelect.disabled = true;
      state.activeListId = "";
    } else {
      state.lists.forEach((list) => {
        const coordinator = list.coordinator ? `${list.coordinator} → ` : "";
        managerSelect.add(new Option(`${coordinator}${list.name} (${fmtInt(list.records.length)})`, list.id));
      });
      state.activeListId = state.lists.some((list) => list.id === priorManager) ? priorManager : state.lists[0].id;
      managerSelect.value = state.activeListId;
      managerSelect.disabled = false;
    }

    el("delete-list-button").disabled = !state.activeListId;
    const renameButton = el("rename-list-button");
    if (renameButton) renameButton.disabled = !state.activeListId;
    el("coordinator-input").disabled = !state.activeListId;
    el("save-coordinator-button").disabled = !state.activeListId;
    el("export-lists-button").disabled = !state.lists.length;
    el("reset-imports-button").disabled = !state.lists.length;
    el("list-empty").hidden = Boolean(state.lists.length);
    el("list-content").hidden = !state.lists.length;

    const analysisSelect = el("analysis-list-select");
    analysisSelect.replaceChildren();
    if (!state.lists.length) {
      analysisSelect.add(new Option("Cadastre uma lista", ""));
      analysisSelect.disabled = true;
      state.analysisScope = ALL_LISTS;
    } else {
      analysisSelect.add(new Option(`Todas as listas — consolidado (${state.lists.length})`, ALL_LISTS));
      const groups = coordinatorGroups();
      const coordinatorOptions = document.createElement("optgroup");
      coordinatorOptions.label = "Coordenadores";
      groups.forEach((group) => {
        const suffix = group.lists.length === 1 ? "1 liderança" : `${group.lists.length} lideranças`;
        coordinatorOptions.appendChild(new Option(`${group.name} — ${suffix}`, coordinatorScopeValue(group.key)));
      });
      analysisSelect.appendChild(coordinatorOptions);

      const leadershipOptions = document.createElement("optgroup");
      leadershipOptions.label = "Lideranças";
      state.lists.forEach((list) => {
        leadershipOptions.appendChild(new Option(`${list.name} — Coord. ${coordinatorDisplay(list.coordinator)}`, list.id));
      });
      analysisSelect.appendChild(leadershipOptions);

      const scopedCoordinator = coordinatorKeyFromScope(state.analysisScope);
      const validScope = state.analysisScope === ALL_LISTS
        || state.lists.some((list) => list.id === state.analysisScope)
        || (scopedCoordinator !== null && groups.some((group) => group.key === scopedCoordinator));
      if (!validScope) state.analysisScope = ALL_LISTS;
      analysisSelect.value = state.analysisScope;
      analysisSelect.disabled = false;
    }

    renderZoneFilter();

    const active = getActiveList();
    if (active) {
      el("coordinator-input").value = active.coordinator || "";
      renderActiveList(active);
    } else {
      el("coordinator-input").value = "";
    }
    renderAnalysis();
  }

  function renderActiveList(list) {
    const validation = validateRecords(list.records);
    el("active-coordinator-name").textContent = coordinatorDisplay(list.coordinator);
    el("active-leadership-name").textContent = list.name;
    el("list-record-count").textContent = fmtInt(list.records.length);
    el("list-valid-count").textContent = fmtInt(validation.valid.length);
    el("list-invalid-count").textContent = fmtInt(validation.incompleteRows.length);
    el("list-duplicate-count").textContent = fmtInt(validation.duplicateRows.length);

    const limit = Math.min(list.records.length, 100);
    const rows = list.records.slice(0, limit).map((record, index) => {
      const tr = document.createElement("tr");
      tr.append(
        createCell(record.name || "—"),
        createCell(record.title || "—"),
        createCell(record.zone || "—"),
        createCell(record.section || "—"),
        createCell(record.contact || "—")
      );
      const actionCell = createCell("");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "icon-button";
      button.setAttribute("aria-label", `Remover ${record.name || "cadastro"}`);
      button.title = "Remover cadastro";
      button.textContent = "×";
      button.addEventListener("click", () => removeRecord(list.id, index));
      actionCell.appendChild(button);
      tr.appendChild(actionCell);
      return tr;
    });
    replaceTableBody(el("list-preview-body"), rows);
    el("list-preview-note").textContent = list.records.length > limit
      ? `Mostrando ${fmtInt(limit)} de ${fmtInt(list.records.length)}`
      : `${fmtInt(list.records.length)} registro(s)`;
  }

  function removeRecord(listId, index) {
    const list = state.lists.find((item) => item.id === listId);
    if (!list || !list.records[index]) return;
    const record = list.records[index];
    if (!window.confirm(`Remover ${record.name || "este cadastro"} da lista?`)) return;
    list.records.splice(index, 1);
    persistLists();
    renderLists();
    toast("Cadastro removido da lista.");
  }

  async function loadIndex(officeKey = state.office) {
    const keepManualScope = state.cityCode === MANUAL_SCOPE && state.manualMunicipalityCodes.length > 0;
    const preferredId = officeKey === state.office ? state.candidate?.[0] || "" : "";
    previousCandidateCache.clear();
    if (!OFFICES[officeKey]) return;
    if (officeKey !== state.office) manualPreferredCandidateId = "";
    const requestId = ++state.indexRequest;
    state.office = officeKey;
    state.cityRequest += 1;
    scopeWorkerJob?.cancel();
    state.index = null;
    state.statewide = null;
    state.regional = null;
    state.city = null;
    state.candidate = null;
    state.candidateSearchRows = [];
    state.compareCandidateIds = ["", ""];
    state.regionFilter = "";
    state.regionalRegion = "";
    resetTerritoryFilters();
    el("office-select").value = state.office;
    el("ibge-region-select").replaceChildren(new Option("Carregando regiões…", ""));
    el("ibge-region-select").disabled = true;
    el("region-filter-bar").hidden = true;
    el("municipality-select").replaceChildren(new Option("Carregando municípios…", ""));
    el("municipality-select").disabled = true;
    el("candidate-search").value = "";
    el("candidate-search").disabled = true;
    el("candidate-result").hidden = true;
    el("municipality-selection-result").hidden = true;
    el("municipality-picker").hidden = true;
    el("candidate-empty").hidden = false;
    el("retry-city-load").hidden = true;
    el("retry-city-load").onclick = null;
    el("candidate-empty-title").textContent = "Carregando a base eleitoral…";
    el("candidate-empty-description").textContent = "A consulta estará disponível em instantes.";
    el("base-source").textContent = `Carregando ${officeConfig().label.toLowerCase()}…`;
    renderAnalysis();
    try {
      const config = officeConfig();
      await window.PlatformTools.loadManifest(officeKey);
      if (requestId !== state.indexRequest) return;
      const [index,statewide,regional]=await Promise.all([
        ...["index.json","statewide.json","regional.json"].map(async file=>{
          const path=window.PlatformTools.dataURL(file,officeKey);
          if(window.ElectionDataCache)return window.ElectionDataCache.load(path);
          const response=await fetch(path);if(!response.ok)throw new Error("Base eleitoral indisponível.");return response.json();
        }),
        window.CandidateIdentity?window.CandidateIdentity.load(officeKey).catch(()=>null):null,
      ]);
      if (requestId !== state.indexRequest) return;
      if (Number(index.electionYear) !== ELECTION_YEAR || index.office !== state.office) {
        throw new Error(`Base eleitoral incompatível: esperado ${config.label} de ${ELECTION_YEAR}.`);
      }
      if (
        Number(statewide.electionYear) !== ELECTION_YEAR
        || statewide.office !== state.office
        || Number(statewide.totalVotes) !== Number(index.totals?.votes)
      ) {
        throw new Error(`Resumo estadual incompatível: esperado ${config.label} de ${ELECTION_YEAR}.`);
      }
      if (
        Number(regional.currentElectionYear) !== ELECTION_YEAR
        || Number(regional.previousElectionYear) !== 2022
        || regional.office !== state.office
        || regional.regions?.length !== 13
        || regional.municipalities?.length !== 144
      ) {
        throw new Error(`Resumo regional incompatível: esperado ${config.label}, 13 regiões, 2026 × 2022.`);
      }
      state.index = index;
      const imported = index.provenance?.appliedAt ? ` • Atualizada em ${new Date(index.provenance.appliedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "";
      el("active-data-provenance").textContent = `${index.source}${imported}`;
      state.statewide = statewide;
      state.regional = regional;
      const totals = state.index.totals || {};
      el("base-municipalities").textContent = fmtInt(totals.municipalities);
      el("base-candidates").textContent = fmtInt(totals.candidates);
      el("base-sections").textContent = fmtInt(totals.sections);
      el("base-votes").textContent = fmtInt(totals.votes);
      el("base-source").textContent = state.index.source || `TSE — votação por seção, ${config.label}, ${ELECTION_YEAR}`;
      populateRegionFilter();
      populateMunicipalities();
      const availableCities = filteredMunicipalities();
      if (keepManualScope) state.manualMunicipalityCodes = window.MunicipalitySelection.codes(state.manualMunicipalityCodes, index.municipalities);
      const initialCode = keepManualScope && state.manualMunicipalityCodes.length ? MANUAL_SCOPE : availableCities.some((city) => String(city[0]) === DEFAULT_CITY_CODE)
        ? DEFAULT_CITY_CODE
        : String(availableCities[0]?.[0] || "");
      el("municipality-select").value = initialCode;
      await loadCity(initialCode, true, keepManualScope ? preferredId : "");
    } catch (error) {
      if (requestId !== state.indexRequest) return;
      console.error(error);
      el("base-source").textContent = "Não foi possível carregar a base eleitoral.";
      el("candidate-empty-title").textContent = "Não foi possível carregar a base";
      el("candidate-empty-description").textContent = "Recarregue a página para tentar novamente.";
      toast("A base eleitoral não pôde ser carregada. Recarregue a página.", "error");
    }
  }

  function populateRegionFilter() {
    const select = el("ibge-region-select");
    select.replaceChildren(new Option("Todas as 13 regiões", ""));
    state.regional.regions.forEach(([id, name, count]) => {
      select.add(new Option(`${name} — ${fmtInt(count)} municípios`, String(id)));
    });
    select.value = state.regionFilter;
    select.disabled = false;
    renderRegionFilterBar();
  }

  function filteredMunicipalities() {
    if (!state.index) return [];
    if (!state.regionFilter || !state.regional) return [...state.index.municipalities];
    const regionMunicipalities = new Set(
      state.regional.municipalities
        .filter((item) => String(item[2]) === String(state.regionFilter))
        .map((item) => String(item[0]))
    );
    return state.index.municipalities.filter((city) => regionMunicipalities.has(String(city[0])));
  }

  function renderRegionFilterBar() {
    const bar = el("region-filter-bar");
    const region = state.regional?.regions?.find((item) => String(item[0]) === String(state.regionFilter));
    bar.hidden = !region;
    if (!region) return;
    el("region-filter-name").textContent = region[1];
    el("region-filter-detail").textContent = !state.city ? `${fmtInt(region[2])} municípios • Carregando o resultado…` : state.city.isRegional
      ? `${fmtInt(region[2])} municípios • Resultado consolidado de toda a região`
      : `${fmtInt(region[2])} municípios • Município: ${state.city?.m?.[1] || "carregando"}`;
  }

  function populateMunicipalities() {
    const select = el("municipality-select");
    select.replaceChildren(new Option("Todos os municípios do Pará", STATE_SCOPE));
    select.add(new Option(state.manualMunicipalityCodes.length ? `Seleção manual — ${fmtInt(state.manualMunicipalityCodes.length)} municípios` : "Selecionar vários municípios…", MANUAL_SCOPE));
    const cities = filteredMunicipalities().sort((a, b) => String(a[1]).localeCompare(String(b[1]), "pt-BR"));
    if (state.regionFilter) select.add(new Option("Todos os municípios da região — resultado consolidado", REGION_SCOPE));
    cities.forEach((city) => {
      const label = `${city[1]} — ${fmtInt(city[2])} candidatos`;
      select.add(new Option(label, String(city[0])));
    });
    select.disabled = false;
    el("open-municipality-picker").disabled = false;
    el("open-municipality-picker").textContent = state.cityCode === MANUAL_SCOPE && state.manualMunicipalityCodes.length
      ? `Editar seleção de ${fmtInt(state.manualMunicipalityCodes.length)} municípios` : "Selecionar municípios manualmente";
  }

  function renderMunicipalityPicker() {
    const query = normalizeText(el("municipality-picker-search").value);
    let shown = 0;
    for (const label of el("municipality-picker-options").children) {
      const matches = !query || normalizeText(label.dataset.name).includes(query);
      label.hidden = !matches;
      if (matches) shown++;
      label.querySelector("input").checked = manualMunicipalityDraft.has(label.dataset.code);
    }
    const count = manualMunicipalityDraft.size;
    el("municipality-picker-count").textContent = `${fmtInt(count)} município(s) selecionado(s)`;
    el("municipality-picker-no-match").hidden = shown > 0;
    el("municipality-picker-apply").disabled = !count;
    el("municipality-picker-clear").disabled = !count;
    el("municipality-picker-summary").textContent = state.manualMunicipalityCodes.length
      ? `Editar seleção de ${fmtInt(state.manualMunicipalityCodes.length)} municípios` : "Selecionar municípios manualmente";
  }

  function populateMunicipalityPicker() {
    const fragment = document.createDocumentFragment();
    [...(state.index?.municipalities || [])].sort((a,b) => String(a[1]).localeCompare(String(b[1]), "pt-BR")).forEach(([code,name]) => {
      const label = document.createElement("label"), checkbox = document.createElement("input"), text = document.createElement("span");
      label.className = "municipality-choice"; label.dataset.code = String(code); label.dataset.name = name;
      checkbox.type = "checkbox"; checkbox.value = String(code); checkbox.checked = manualMunicipalityDraft.has(String(code));
      text.textContent = name; label.append(checkbox, text); fragment.append(label);
    });
    el("municipality-picker-options").replaceChildren(fragment);
    renderMunicipalityPicker();
  }

  function openMunicipalityPicker() {
    if (!state.index) return;
    manualPreferredCandidateId = state.candidate?.[0] || manualPreferredCandidateId;
    manualMunicipalityDraft = new Set(state.manualMunicipalityCodes);
    if (state.cityCode !== MANUAL_SCOPE) {
      state.previousStandardCityCode = state.cityCode || DEFAULT_CITY_CODE;
      state.cityRequest++; scopeWorkerJob?.cancel();
      state.cityCode = MANUAL_SCOPE; state.city = null; state.candidate = null;
      state.regionFilter = ""; state.regionalRegion = "";
      el("ibge-region-select").value = ""; populateMunicipalities();
      el("candidate-result").hidden = true; el("municipality-selection-result").hidden = true;
      el("candidate-search").value = ""; el("candidate-search").disabled = true;
      el("candidate-loading").hidden = true; el("candidate-empty").hidden = false;
      el("retry-city-load").hidden = true; el("retry-city-load").onclick = null;
      el("candidate-empty-title").textContent = "Selecione os municípios";
      el("candidate-empty-description").textContent = "Marque os municípios e toque em Aplicar seleção.";
      hideCandidateResults(); renderRegionFilterBar();
    }
    el("municipality-select").value = MANUAL_SCOPE;
    showWorkspaceView("territory", false);
    el("municipality-picker").hidden = false; el("municipality-picker").open = true;
    el("municipality-picker-search").value = "";
    populateMunicipalityPicker(); el("municipality-picker-search").focus();
  }

  async function applyManualMunicipalities(values = [...manualMunicipalityDraft], preferredId = state.candidate?.[0] || manualPreferredCandidateId) {
    const selected = window.MunicipalitySelection.codes(values, state.index.municipalities);
    if (!selected.length) { toast("Selecione pelo menos um município.", "error"); return false; }
    state.manualMunicipalityCodes = selected;
    manualMunicipalityDraft = new Set(selected);
    state.selectionMunicipality = ""; state.selectionZone = ""; state.selectionPlaceSearch = ""; state.selectionPlace = ""; state.selectionPlaces = [];
    el("municipality-selection-place").value = "";
    if (!["overview", "territory"].includes(state.view)) showWorkspaceView("territory", false);
    await loadCity(MANUAL_SCOPE, true, preferredId);
    return !!state.city?.isManualSelection;
  }

  function manualSelectionData() {
    return window.MunicipalitySelection.data({city:state.city,candidate:state.candidate,index:state.index,
      municipality:state.selectionMunicipality,zone:state.selectionZone,placeSearch:state.selectionPlaceSearch,place:state.selectionPlace,places:state.selectionPlaces});
  }

  function selectionTable(headers, rows) {
    const wrap = document.createElement("div"), table = document.createElement("table"), head = document.createElement("thead"), body = document.createElement("tbody"), heading = document.createElement("tr");
    wrap.className = "table-wrap";
    headers.forEach(label => {const th = document.createElement("th"); th.scope = "col"; th.textContent = label; heading.append(th);});
    head.append(heading); rows.forEach(cells => {const tr = document.createElement("tr"); cells.forEach((cell,i) => tr.append(createCell(cell, i === cells.length-1 ? "number-cell" : ""))); body.append(tr);});
    table.append(head, body); wrap.append(table); return wrap;
  }

  function renderManualMunicipalities() {
    if (!state.city?.isManualSelection || !state.candidate) return;
    window.AppHome?.update?.(state.view);
    const all = window.MunicipalitySelection.data({city:state.city,candidate:state.candidate,index:state.index});
    const municipalitySelect = el("municipality-selection-city"), zoneSelect = el("municipality-selection-zone");
    municipalitySelect.replaceChildren(new Option("Todos os selecionados", ""), ...all.municipalities.map(m => new Option(m.name,m.code)));
    if (state.selectionMunicipality && !all.municipalities.some(m => m.code === state.selectionMunicipality)) state.selectionMunicipality = "";
    municipalitySelect.value = state.selectionMunicipality;
    const zones = all.zones.filter(z => !state.selectionMunicipality || z.municipalityCode === state.selectionMunicipality);
    if (state.selectionZone && !zones.some(z => z.municipalityCode+"|"+z.zone === state.selectionZone)) state.selectionZone = "";
    zoneSelect.replaceChildren(new Option("Todas as zonas", ""), ...zones.map(z => new Option(`Zona ${z.zone.padStart(3,"0")} • ${z.municipality}`, z.municipalityCode+"|"+z.zone)));
    zoneSelect.value = state.selectionZone;
    el("municipality-selection-place").value = state.selectionPlaceSearch;
    const placeOptions = all.places.filter(p => (!state.selectionMunicipality || p.municipalityCode === state.selectionMunicipality)
      && (!state.selectionZone || p.municipalityCode+"|"+p.zone === state.selectionZone)
      && (!state.selectionPlaceSearch || normalizeText(p.name).includes(normalizeText(state.selectionPlaceSearch))));
    const schools = new Map(placeOptions.map(p => [JSON.stringify([p.municipalityCode,p.name]), `${p.name} • ${p.municipality}`]));
    if (state.selectionPlace && !schools.has(state.selectionPlace)) state.selectionPlace = "";
    populateTerritorySelect("municipality-selection-school", "Todos os locais / escolas", [...schools.keys()].sort((a,b)=>schools.get(a).localeCompare(schools.get(b),"pt-BR")), state.selectionPlace, key=>schools.get(key));
    el("municipality-selection-school-status").textContent = state.selectionPlace
      ? `Escola selecionada: ${schools.get(state.selectionPlace)}. O detalhamento e os relatórios seguem este recorte.`
      : `${fmtInt(schools.size)} locais disponíveis. Selecione uma escola para consultar apenas suas seções.`;
    const manualSchools = new Map(all.places.map(p=>[JSON.stringify([p.municipalityCode,p.name]), `${p.name} • ${p.municipality}`]));
    window.SchoolPicker?.render(el("manual-school-picker"),{options:[...manualSchools].map(([value,label])=>({value,label})),selected:state.selectionPlaces.length?state.selectionPlaces:state.selectionPlace?[state.selectionPlace]:[],onApply:applyManualSchools});
    if(state.selectionPlaces.length){
      el("municipality-selection-school").disabled=true;
      el("municipality-selection-school-status").textContent=`${state.selectionPlaces.length} escolas selecionadas manualmente. O total abaixo soma apenas os locais selecionados e os demais filtros ativos.`;
    }
    const result = manualSelectionData(), cards = el("municipality-selection-cards");
    const opened = new Set([...cards.querySelectorAll("details[open]")].map(d => d.dataset.code)), initial = !cards.children.length;
    el("municipality-selection-title").textContent = `Resultados de ${fmtInt(result.municipalities.length)} municípios selecionados`;
    const ballot = candidateBallotName(state.candidate);
    el("municipality-selection-candidate").textContent = `${state.candidate[1]} — ${ballot || state.candidate[2]} • ${officeConfig().label}`;
    el("municipality-selection-source").textContent = `2026 • 1º turno • Fonte ativa: ${state.index.source} • Versão: ${window.PlatformTools.manifests.get(state.office)?.active || "bundled"}`;
    el("municipality-selection-total-count").textContent = fmtInt(result.municipalities.length);
    el("municipality-selection-total-votes").textContent = fmtInt(result.totalVotes);
    el("municipality-selection-filtered-votes").textContent = fmtInt(result.filteredVotes);
    el("municipality-selection-note").textContent = result.filtered
      ? `${fmtInt(result.filteredVotes)} votos no filtro. Os totais municipais mostram todos os votos da candidatura no município.`
      : "Abra um município para consultar os votos por zona e local de votação.";
    el("municipality-selection-clear").disabled = !result.filtered;
    const schoolTotals=new Map();result.places.forEach(p=>{const value=JSON.stringify([p.municipalityCode,p.name]);if(!schoolTotals.has(value))schoolTotals.set(value,{value,label:p.name+" • "+p.municipality,votes:0});schoolTotals.get(value).votes+=p.votes;});
    window.SchoolPicker?.summary(el("manual-school-results"),[...schoolTotals.values()],state.selectionPlaces,result.filteredVotes);
    const fragment = document.createDocumentFragment();
    result.municipalities.forEach((m,index) => {
      const detail = document.createElement("details"), summary = document.createElement("summary"), name = document.createElement("span"), title = document.createElement("strong"), total = document.createElement("b");
      detail.className = "municipality-result-card"; detail.dataset.code = m.code; detail.open = opened.has(m.code) || initial && index === 0;
      title.textContent = m.name; name.append(title); total.textContent = `${fmtInt(m.totalVotes)} votos`;
      if (result.filtered) {const filtered = document.createElement("small"); filtered.textContent = `${fmtInt(m.votes)} votos no filtro`; name.append(filtered);}
      summary.append(name,total); detail.append(summary);
      const content = document.createElement("div"); content.className = "municipality-result-detail";
      const populateDetail = () => {
        if (!detail.open || content.childElementCount) return;
        const zoneTitle = document.createElement("h4"), placeTitle = document.createElement("h4"); zoneTitle.textContent = "Votos por zona"; placeTitle.textContent = "Votos por local de votação";
        content.append(zoneTitle, selectionTable(["Zona","Votos 2026"],m.zones.map(z=>[z.zone.padStart(3,"0"),fmtInt(z.votes)])),placeTitle);
        let visible = 50; const placeWrap = document.createElement("div"), more = document.createElement("button"); more.type = "button"; more.className = "button secondary";
        const renderPlaces = () => {placeWrap.replaceChildren(selectionTable(["Zona","Local / escola","Votos 2026"],m.places.slice(0,visible).map(p=>[p.zone.padStart(3,"0"),p.name,fmtInt(p.votes)]))); more.hidden = visible >= m.places.length; more.textContent = `Ver mais locais (${fmtInt(Math.min(visible,m.places.length))} de ${fmtInt(m.places.length)})`;};
        more.addEventListener("click",()=>{visible+=50;renderPlaces();}); renderPlaces(); content.append(placeWrap,more);
        if (!m.zones.length) {const empty = document.createElement("p"); empty.className = "compact-note"; empty.textContent = "Nenhum local corresponde aos filtros neste município."; content.prepend(empty);}
      };
      detail.addEventListener("toggle",populateDetail); populateDetail();
      detail.append(content); fragment.append(detail);
    });
    cards.replaceChildren(fragment);
  }

  function exportManualMunicipalities() {
    if (!state.city?.isManualSelection || !state.candidate) return;
    const data = manualSelectionData(), rows = [["RESULTADOS DE 2026 — MUNICÍPIOS SELECIONADOS"],["Cargo",officeConfig().label],["Candidatura",state.candidate[1],candidateBallotName(state.candidate)||state.candidate[2]],["Fonte",state.index.source],[],
      ["Local / escola",data.filters.placeLabel||"Todos os locais"],["Busca por nome",state.selectionPlaceSearch||"Sem busca"],["Zona",state.selectionZone||"Todas"],[],
      ["TOTAIS MUNICIPAIS"],["Município","Votos no município","Votos no filtro"],...data.municipalities.map(m=>[m.name,m.totalVotes,m.votes]),[],
      ["VOTOS POR ZONA"],["Município","Zona","Votos 2026"],...data.zones.map(z=>[z.municipality,z.zone.padStart(3,"0"),z.votes]),[],
      ["VOTOS POR LOCAL"],["Município","Zona","Local / escola","Votos 2026"],...data.places.map(p=>[p.municipality,p.zone.padStart(3,"0"),p.name,p.votes])];
    downloadText(`municipios_selecionados_${state.office}_${state.candidate[1]}_2026.csv`,rows.map(row=>row.map(csvEscape).join(";")).join("\r\n"));
  }

  async function fetchCity(code, office = state.office) {
    if(window.ElectionDataCache){
      const city=await window.ElectionDataCache.load(window.PlatformTools.dataURL(`${encodeURIComponent(code)}.json`,office));
      if(Number(city.y)!==ELECTION_YEAR||city.o!==office||String(city.m?.[0])!==String(code))throw new Error("Base municipal incompatível.");
      return city;
    }
    const key = `${office}|${window.PlatformTools.manifests.get(office)?.active || "bundled"}|${code}`;
    if (cityCache.has(key)) return cityCache.get(key);
    const response = await fetch(window.PlatformTools.dataURL(`${encodeURIComponent(code)}.json`, office));
    if (!response.ok) throw new Error(`Falha ao carregar o município (${response.status}).`);
    const city = await response.json();
    if (Number(city.y) !== ELECTION_YEAR || city.o !== office || String(city.m?.[0]) !== String(code)) throw new Error("Base municipal de outro ano, cargo ou município.");
    cityCache.set(key, city);
    while(cityCache.size>8)cityCache.delete(cityCache.keys().next().value);
    return city;
  }

  function yieldToScreen() {
    return new Promise(resolve=>window.setTimeout(resolve,0));
  }

  async function loadConsolidatedScope(cities, scopeName, scopeCode, office, requestId) {
    const current=()=>requestId===state.cityRequest&&office===state.office;
    const cancelled=()=>Object.assign(new Error("Consulta cancelada."),{name:"AbortError"});
    const codes=cities.map(c=>String(c[0])),key=JSON.stringify([office,window.PlatformTools.manifests.get(office)?.active||"bundled",scopeCode,codes]);
    const progress=(done,phase="loading")=>{if(current())el("candidate-empty-description").textContent=phase==="aggregation"
      ? `${fmtInt(codes.length)} municípios carregados. Organizando os resultados…`
      : `${fmtInt(done)} de ${fmtInt(codes.length)} municípios carregados.`;};
    if(scopeCache.has(key)){
      const cached=scopeCache.get(key);scopeCache.delete(key);scopeCache.set(key,cached);
      await yieldToScreen();if(!current())throw cancelled();return cached;
    }
    await yieldToScreen();if(!current())throw cancelled();
    let city,worker;
    if(typeof window.Worker==="function")try{worker=new window.Worker("./scope-worker.mjs?v=2026-10-08-municipal-selection-v30",{type:"module"});}catch{}
    if(worker){
      try{
        city=await new Promise((resolve,reject)=>{
          let finished=false;
          const finish=(error,result)=>{if(finished)return;finished=true;worker.terminate();if(scopeWorkerJob===job)scopeWorkerJob=null;error?reject(error):resolve(result);};
          const job={cancel:()=>finish(cancelled())};scopeWorkerJob=job;
          worker.onmessage=({data})=>{
            if(data.requestId!==requestId||finished)return;
            if(!current())return finish(cancelled());
            if(data.type==="progress")progress(data.done,data.phase);
            if(data.type==="error")finish(new Error(data.message));
            if(data.type==="ready"){
              const result=data.city;
              if(result?.y!==ELECTION_YEAR||result.o!==office||result.m?.[0]!==scopeCode||result.municipalityCodes?.length!==codes.length)
                return finish(new Error("A consulta consolidada não corresponde à base ativa."));
              finish(null,result);
            }
          };
          worker.onerror=event=>{event.preventDefault?.();finish(Object.assign(new Error("Processamento em segundo plano indisponível."),{scopeWorkerUnavailable:true}));};
          try{worker.postMessage({requestId,office,year:ELECTION_YEAR,scopeName,scopeCode,
            requests:codes.map(code=>({code,url:window.PlatformTools.dataURL(`${encodeURIComponent(code)}.json`,office)})),roster:(state.statewide?.candidates||[]).map(c=>c.slice(0,3))});}
          catch{finish(Object.assign(new Error("Processamento em segundo plano indisponível."),{scopeWorkerUnavailable:true}));}
        });
      }catch(error){if(!error.scopeWorkerUnavailable)throw error;}
    }
    if(!city){
      const aggregator=window.ElectoralScope.createAggregator(scopeName,state.statewide?.candidates||[],scopeCode);
      for(let offset=0;offset<codes.length;offset+=3){
        const batch=await Promise.all(codes.slice(offset,offset+3).map(code=>fetchCity(code,office)));
        if(!current())throw cancelled();
        for(let i=0;i<batch.length;i++){await aggregator.addCityAsync(batch[i],{yieldControl:yieldToScreen,isCancelled:()=>!current()});batch[i]=null;}
        progress(Math.min(offset+3,codes.length));await yieldToScreen();
      }
      progress(codes.length,"aggregation");city=aggregator.finish();
    }
    if(!current())throw cancelled();
    scopeCache.set(key,city);while(scopeCache.size>1)scopeCache.delete(scopeCache.keys().next().value);
    return city;
  }

  function scopeMunicipalityCodes() {
    return state.city?.isRegional ? state.city.municipalityCodes : state.city ? [String(state.city.m[0])] : [];
  }

  function historicalScopeVotes(candidate = state.candidate) {
    const previous = previousRegionalCandidate(candidate);
    if (!previous) return null;
    const codes = new Set(scopeMunicipalityCodes());
    return (previous[6] || []).reduce((sum, [code, votes]) => sum + (codes.has(String(code)) ? Number(votes) || 0 : 0), 0);
  }

  function historyKey(candidate) {
    const previous = previousRegionalCandidate(candidate);
    return previous ? `${state.office}|${previous[0]}` : "";
  }

  async function ensureHistory(candidate) {
    const key = historyKey(candidate);
    if (!key || historyCache.has(key)) return;
    if (historyRequests.has(key)) return historyRequests.get(key);
    const previous = previousRegionalCandidate(candidate);
    const office = state.office;
    const pending = (async () => {
      try {
        const response = await fetch(`${OFFICES[office].dataPath}/history-2022/${encodeURIComponent(previous[0])}.json?v=${DATA_VERSION}`);
        if (!response.ok) throw new Error("Base histórica indisponível.");
        const history = await response.json();
        if (history.year !== 2022 || history.office !== office || String(history.candidateId) !== String(previous[0])) throw new Error("Base histórica incompatível.");
        historyCache.set(key, history);
        while(historyCache.size>4)historyCache.delete(historyCache.keys().next().value);
      } catch (error) {
        historyCache.set(key, { unavailable: true });
        console.error(error);
      } finally {
        historyRequests.delete(key);
        if (state.office === office && state.candidate && state.city) renderCandidate();
      }
    })();
    historyRequests.set(key, pending);
    return pending;
  }

  function previousTerritoryRows(candidate = state.candidate) {
    const history = historyCache.get(historyKey(candidate));
    if (!history || history.unavailable) return null;
    const codes = new Set(scopeMunicipalityCodes());
    const names = municipalityMetadata();
    return history.rows.filter(([code]) => codes.has(String(code))).map(([code, zone, section, place, votes]) => ({
      municipalityCode: String(code), zone: String(zone), section: String(section),
      rawPlace: place, place: state.city.isRegional ? `${place} • ${names.get(String(code))?.[1] || code}` : place,
      neighborhood: "Bairro histórico não disponível", votes: Number(votes) || 0,
    }));
  }

  function voteChangeCell(current, previous) {
    const change = window.ElectoralScope.change(current, previous);
    return createCell(change.label, `number-cell ${change.className}`);
  }

  function renderYearComparison(targetId, rows) {
    const target = el(targetId);
    const hasPrevious = rows.some((row) => row.previousVotes !== null && row.previousVotes !== undefined);
    const maxVotes = Math.max(1, ...rows.flatMap((row) => [row.votes || 0, row.previousVotes || 0]));
    const fragment = document.createDocumentFragment();
    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "chart-empty";
      empty.textContent = "Nenhum resultado disponível neste recorte.";
      fragment.appendChild(empty);
    }
    rows.forEach((item) => {
      const row = document.createElement("div");
      row.className = "regional-year-row";
      const label = document.createElement("span");
      label.className = "regional-year-label";
      label.textContent = item.name;
      label.title = item.name;
      const bars = document.createElement("div");
      bars.className = "regional-year-bars";
      const years = [["2026", item.votes, "current"]];
      if (hasPrevious) years.push(["2022", item.previousVotes, "previous"]);
      years.forEach(([year, votes, kind]) => {
        const bar = document.createElement("div");
        bar.className = "regional-year-bar";
        const yearLabel = document.createElement("span"); yearLabel.textContent = year;
        const track = document.createElement("div"); track.className = "regional-year-track";
        const fill = document.createElement("div"); fill.className = `regional-year-fill ${kind}`;
        fill.style.width = `${((Number(votes) || 0) / maxVotes) * 100}%`; fill.hidden = !votes;
        track.appendChild(fill);
        const value = document.createElement("strong"); value.textContent = votes === null || votes === undefined ? "—" : fmtInt(votes);
        bar.append(yearLabel, track, value); bars.appendChild(bar);
      });
      if (hasPrevious) {
        const change = window.ElectoralScope.change(item.votes || 0, item.previousVotes);
        const note = document.createElement("small"); note.className = `year-change ${change.className}`; note.textContent = change.label;
        bars.appendChild(note);
      }
      row.append(label, bars); fragment.appendChild(row);
    });
    target.replaceChildren(fragment);
  }

  function renderHistorySummary() {
    const previous = previousRegionalCandidate();
    const previousVotes = historicalScopeVotes();
    const change = window.ElectoralScope.change(state.candidate[3], previousVotes);
    el("candidate-votes-context").textContent = state.city.isStatewide ? "somados em todos os municípios do Pará"
      : state.city.isRegional ? "somados em todos os municípios da região" : "no município selecionado";
    el("candidate-rank-context").textContent = state.city.isStatewide ? "Posição no Pará"
      : state.city.isRegional ? "Posição na região" : "Posição no município";
    el("candidate-history-status").textContent = previous
      ? `2026 × 2022 • ${state.city.m[1]} • mesmo cargo e 1º turno.`
      : "Somente 2026 • sem participação correspondente confirmada em 2022 neste cargo.";
    el("candidate-history-previous").hidden = !previous;
    el("candidate-history-change").hidden = !previous;
    el("candidate-history-votes").textContent = previous ? fmtInt(previousVotes) : "—";
    el("candidate-history-variation").textContent = change.label;
    el("candidate-history-variation").className = change.className;
    el("candidate-history-identity").textContent = previous
      ? `Correspondência histórica: nome normalizado único nas duas bases, mesmo cargo e 1º turno. Nome de 2022: ${previous[2]}.`
      : "Não há correspondência única de nome em 2022. Isso não comprova que seja a primeira candidatura.";
    const priorTotals = new Map(state.regional.totals.previousMunicipalities);
    const priorDenominator = scopeMunicipalityCodes().reduce((sum, code) => sum + (priorTotals.get(String(code)) || 0), 0);
    el("candidate-history-share").hidden = !previous || !priorDenominator;
    if (previous && priorDenominator) {
      const currentShare = state.candidate[3] / Math.max(1, state.city.x[1]);
      const previousShare = previousVotes / priorDenominator;
      const delta = (currentShare - previousShare) * 100;
      el("candidate-history-share").textContent = `Participação nos votos nominais: 2026 ${fmtPercent(currentShare)} • 2022 ${fmtPercent(previousShare)} • Mudança ${delta > 0 ? "+" : ""}${percentFormatter.format(delta)} p.p.`;
    }

    const summary = statewideCandidate(state.candidate), allowed = new Set(scopeMunicipalityCodes());
    const coverage = (summary?.[6] || []).filter(([code, votes]) => allowed.has(String(code)) && votes > 0).length;
    const currentShare = state.city.x[1] ? fmtPercent(state.candidate[3] / state.city.x[1]) : "sem denominador disponível";
    let reading = `Em 2026, ${candidateBallotName(state.candidate) || state.candidate[2]} recebeu ${fmtInt(state.candidate[3])} votos em ${state.city.m[1]}, com ${currentShare} dos votos nominais de ${officeConfig().label} nesse recorte. Há votos em ${fmtInt(coverage)} de ${fmtInt(allowed.size)} municípios do recorte.`;
    if (previous) reading += ` Em 2022, a candidatura correspondente recebeu ${fmtInt(previousVotes)} votos no mesmo recorte. Variação: ${change.label}.`;
    el("candidate-factual-summary").textContent = reading;
  }

  function renderHistoricalDonut(targetId, rows) {
    const original = el(targetId);
    let panel = el(`${targetId}-history`);
    if (!panel) {
      panel = document.createElement("div"); panel.id = `${targetId}-history`; panel.className = "historical-donut-panel";
      original.closest(".chart-card").appendChild(panel);
    }
    panel.hidden = !rows;
    if (!rows) { panel.replaceChildren(); return; }
    const total = rows.reduce((sum, item) => sum + item.votes, 0);
    const heading = document.createElement("h5"); heading.textContent = "Eleição anterior • 2022";
    const layout = document.createElement("div"); layout.className = "donut-layout";
    const donut = document.createElement("div"); donut.className = "donut-chart"; donut.setAttribute("role", "img");
    const center = document.createElement("div"); const value = document.createElement("strong"); value.textContent = fmtInt(total);
    const caption = document.createElement("span"); caption.textContent = "votos • 2022"; center.append(value, caption); donut.appendChild(center);
    const legend = document.createElement("div"); legend.className = "chart-legend";
    let cursor = 0;
    const segments = [];
    rows.forEach((item, index) => {
      const color = CHART_COLORS[index % CHART_COLORS.length];
      const start = cursor; cursor += total ? item.votes / total * 360 : 0;
      segments.push(`${color} ${start}deg ${cursor}deg`);
      const entry = document.createElement("div"); entry.className = "legend-row";
      const swatch = document.createElement("span"); swatch.className = "legend-swatch"; swatch.style.background = color;
      const label = document.createElement("span"); label.textContent = item.label; label.title = item.label;
      const count = document.createElement("strong"); count.textContent = `${fmtInt(item.votes)} • ${fmtPercent(item.votes / Math.max(1, total))}`;
      entry.append(swatch, label, count); legend.appendChild(entry);
    });
    donut.style.background = total ? `conic-gradient(${segments.join(", ")})` : "#e8eef4";
    donut.setAttribute("aria-label", `2022: ${rows.map((item) => `${item.label}: ${fmtInt(item.votes)} votos`).join("; ")}`);
    layout.append(donut, legend); panel.replaceChildren(heading, layout);
  }

  async function applyRegionFilter(regionId) {
    const preferredCandidateId = state.candidate?.[0] || "";
    const previousCode = state.cityCode;
    state.regionFilter = String(regionId || "");
    state.regionalRegion = state.regionFilter;
    el("ibge-region-select").value = state.regionFilter;
    populateMunicipalities();
    const cities = filteredMunicipalities();
    const targetCode = state.regionFilter ? REGION_SCOPE
      : previousCode === STATE_SCOPE ? STATE_SCOPE
      : cities.some((city) => String(city[0]) === previousCode) ? previousCode
      : cities.some((city) => String(city[0]) === DEFAULT_CITY_CODE) ? DEFAULT_CITY_CODE
      : String(cities[0]?.[0] || "");
    el("municipality-select").value = targetCode;
    if (targetCode) await loadCity(targetCode, true, preferredCandidateId);
    renderRegionFilterBar();
  }

  async function loadCity(code, chooseDefaultCandidate = false, preferredCandidateId = "") {
    if (!code) return;
    code = String(code);
    if (code === MANUAL_SCOPE && !state.manualMunicipalityCodes.length) return openMunicipalityPicker();
    if ((code === STATE_SCOPE || code === MANUAL_SCOPE) && state.regionFilter) {
      state.regionFilter = "";
      el("ibge-region-select").value = "";
      populateMunicipalities();
    }
    const requestId = ++state.cityRequest;
    scopeWorkerJob?.cancel();
    if (manualPlaceTimer !== undefined) window.clearTimeout(manualPlaceTimer);
    if (code !== MANUAL_SCOPE) state.previousStandardCityCode = code;
    state.cityCode = String(code);
    el("municipality-select").value = String(code);
    state.city = null;
    state.candidate = null;
    state.compareCandidateIds = ["", ""];
    state.regionalRegion = state.regionFilter || "";
    resetTerritoryFilters();
    state.selectionMunicipality = ""; state.selectionZone = ""; state.selectionPlaceSearch = ""; state.selectionPlace = ""; state.selectionPlaces = [];
    el("municipality-selection-result").hidden = true;
    el("municipality-selection-cards").replaceChildren();
    el("municipality-picker").hidden = code !== MANUAL_SCOPE;
    if (code === MANUAL_SCOPE) {
      manualMunicipalityDraft = new Set(state.manualMunicipalityCodes);
      populateMunicipalities(); populateMunicipalityPicker();
      el("municipality-picker").open = false;
    }
    state.candidateSearchRows = [];
    el("candidate-search").value = "";
    el("candidate-search").disabled = true;
    el("candidate-loading").hidden = false;
    el("candidate-result").hidden = true;
    el("candidate-empty").hidden = false;
    el("retry-city-load").hidden = true;
    el("retry-city-load").onclick = null;
    el("candidate-empty-title").textContent = code === STATE_SCOPE ? "Reunindo todos os municípios do Pará…"
      : code === MANUAL_SCOPE ? "Reunindo os municípios selecionados…"
      : code === REGION_SCOPE ? "Reunindo todos os municípios da região…" : "Carregando o município…";
    el("candidate-empty-description").textContent = "Aguarde a atualização dos resultados.";
    renderRegionFilterBar();
    hideCandidateResults();
    renderAnalysis();

    try {
      const office = state.office;
      const config = OFFICES[office];
      let city;
      if (code === MANUAL_SCOPE) {
        const selected = window.MunicipalitySelection.codes(state.manualMunicipalityCodes, state.index.municipalities);
        const lookup = new Map(state.index.municipalities.map(m => [String(m[0]), m]));
        city = { ...await loadConsolidatedScope(selected.map(id => lookup.get(id)),
          `${fmtInt(selected.length)} municípios selecionados`, code, office, requestId), isManualSelection: true };
      } else if (code === STATE_SCOPE || (code === REGION_SCOPE && state.regionFilter)) {
        const region = state.regional.regions.find((item) => String(item[0]) === state.regionFilter);
        const cities = code === STATE_SCOPE ? state.index.municipalities : filteredMunicipalities();
        city = await loadConsolidatedScope(cities,
          code === STATE_SCOPE ? "Todos os municípios do Pará" : region[1], code, office, requestId);
      } else city = await fetchCity(code, office);
      if (requestId !== state.cityRequest) return;
      if (preferredCandidateId && !city.c.some((item) => String(item[0]) === String(preferredCandidateId))) {
        const preferred = statewideCandidate(preferredCandidateId);
        if (preferred) city = { ...city, c: [...city.c, [String(preferred[0]), preferred[1], preferred[2], 0,
          city.c.filter((item) => item[3] > 0).length + 1, []]] };
      }
      state.city = city;
      state.candidateSearchRows = city.c.map((candidate) => ({
        candidate,
        key: normalizeText(`${candidate[1]} ${candidate[2]} ${candidateBallotName(candidate)}`),
      }));
      el("candidate-search").disabled = false;
      if (chooseDefaultCandidate || preferredCandidateId) {
        const defaultNumber = config.defaultCandidateNumber;
        const candidate = city.c.find((item) => preferredCandidateId && String(item[0]) === String(preferredCandidateId))
          || (!city.isManualSelection && (city.c.find((item) => defaultNumber && String(item[1]) === defaultNumber)
          || [...city.c].sort((a, b) => b[3] - a[3])[0]));
        if (candidate) selectCandidate(candidate);
      }
      if (!state.candidate) {
        el("candidate-empty-title").textContent = "Selecione uma candidatura";
        el("candidate-empty-description").textContent = "Busque pelo nome ou número no campo acima.";
      }
    } catch (error) {
      if (requestId !== state.cityRequest) return;
      console.error(error);
      el("candidate-empty-title").textContent = "Não foi possível carregar o resultado";
      el("candidate-empty-description").textContent = "Confira a conexão e tente novamente.";
      el("retry-city-load").onclick = () => loadCity(code, chooseDefaultCandidate, preferredCandidateId);
      el("retry-city-load").hidden = false;
      toast("Não foi possível carregar o resultado completo deste recorte. Tente novamente.", "error");
    } finally {
      if (requestId === state.cityRequest) el("candidate-loading").hidden = true;
    }
  }

  function showCandidateResults(query = "") {
    if (!state.city) return;
    const normalized = normalizeText(query);
    let matches;
    if (!normalized) {
      matches = [...state.city.c].sort((a, b) => (state.city.isManualSelection ? 0 : b[3] - a[3]) || String(a[2]).localeCompare(String(b[2]), "pt-BR")).slice(0, 25);
    } else {
      const terms = normalized.split(" ").filter(Boolean);
      matches = state.candidateSearchRows
        .filter((row) => terms.every((term) => row.key.includes(term)))
        .map((row) => row.candidate)
        .sort((a, b) => {
          const aStarts = normalizeText(`${a[1]} ${a[2]}`).startsWith(normalized) ? 0 : 1;
          const bStarts = normalizeText(`${b[1]} ${b[2]}`).startsWith(normalized) ? 0 : 1;
          return aStarts - bStarts || (state.city.isManualSelection ? 0 : b[3] - a[3]) || String(a[2]).localeCompare(String(b[2]), "pt-BR");
        })
        .slice(0, 30);
    }
    state.searchMatches = matches;
    state.searchActiveIndex = -1;
    renderCandidateResults();
  }

  function renderCandidateResults() {
    const target = el("candidate-results");
    target.replaceChildren();
    if (!state.searchMatches.length) {
      const empty = document.createElement("div");
      empty.className = "search-no-results";
      empty.textContent = "Nenhuma candidatura encontrada neste recorte.";
      target.appendChild(empty);
    } else {
      state.searchMatches.forEach((candidate, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `search-option${index === state.searchActiveIndex ? " active" : ""}`;
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", index === state.searchActiveIndex ? "true" : "false");
        const number = document.createElement("b");
        number.textContent = candidate[1];
        const name = document.createElement("span");
        const ballotName = candidateBallotName(candidate);
        name.textContent = candidate[2] + (ballotName ? ` • Nome de urna: ${ballotName}` : "");
        const votes = document.createElement("small");
        votes.textContent = `${fmtInt(candidate[3])} votos`;
        button.append(number, name, votes);
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", () => selectCandidate(candidate));
        target.appendChild(button);
      });
    }
    target.hidden = false;
  }

  function hideCandidateResults() {
    el("candidate-results").hidden = true;
    state.searchActiveIndex = -1;
  }

  function resetTerritoryFilters() {
    state.territoryZone = "";
    state.territorySection = "";
    state.territoryPlace = "";
    state.territoryPlaces = [];
    state.territoryNeighborhood = "";
  }

  function selectedTerritorySchools() {
    return state.territoryPlaces.length ? state.territoryPlaces : state.territoryPlace ? [state.territoryPlace] : [];
  }

  function territorySchoolsLabel() {
    return selectedTerritorySchools().join("; ") || "Todos os locais";
  }

  function applyTerritorySchools(values) {
    state.territoryPlaces = [...new Set(values)];state.territoryPlace = "";
    state.territoryZone = "";state.territorySection = "";state.territoryNeighborhood = "";
    renderTerritoryReport();
  }

  function applyManualSchools(values) {
    window.clearTimeout(manualPlaceTimer);state.selectionPlaces = [...new Set(values)];state.selectionPlace = "";
    state.selectionMunicipality = "";state.selectionZone = "";state.selectionPlaceSearch = "";
    renderManualMunicipalities();
  }

  function territoryRowsForCandidate(candidate, includeZero = false) {
    if (!state.city || !candidate) return [];
    const votesBySection = includeZero ? new Map(candidate[5]) : null;
    const voteRows = includeZero ? state.city.s.map((_, index) => [index, votesBySection.get(index) || 0]) : candidate[5];
    return voteRows.map(([sectionIndex, votes]) => {
      const section = state.city.s[sectionIndex] || [];
      return {
        municipalityCode: String(section[4] || state.city.m[0]),
        rawPlace: String(section[5] || section[2] || "Local não informado"),
        rawNeighborhood: String(section[6] || section[3] || "Bairro não informado"),
        zone: String(section[0] ?? ""),
        section: String(section[1] ?? ""),
        place: String(section[2] || "Local não informado"),
        neighborhood: String(section[3] || "Bairro não informado"),
        votes: Number(votes) || 0,
      };
    });
  }

  function candidateTerritoryRows(includeZero = false) {
    return territoryRowsForCandidate(state.candidate, includeZero);
  }

  function uniqueSorted(values, numeric = false) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => numeric
      ? Number(a) - Number(b)
      : String(a).localeCompare(String(b), "pt-BR", { numeric: true }));
  }

  function populateTerritorySelect(id, allLabel, values, selected, optionLabel = (value) => value) {
    const select = el(id);
    const options = document.createDocumentFragment();
    options.appendChild(new Option(allLabel, ""));
    values.forEach((value) => options.appendChild(new Option(optionLabel(value), value)));
    select.replaceChildren(options);
    select.value = selected;
    select.disabled = !values.length;
    select.dispatchEvent(new Event("searchable:sync"));
  }

  function renderTerritoryFilters(allRows = []) {
    // The school catalogue belongs to the territory, including sections without votes.
    if (state.city) allRows = state.city.s.map(s=>({zone:String(s[0]),section:String(s[1]),place:String(s[2]||"Local não informado"),neighborhood:String(s[3]||"Bairro não informado")}));
    const zones = uniqueSorted(allRows.map((row) => row.zone), true);
    if (state.territoryZone && !zones.includes(state.territoryZone)) { state.territoryZone="";state.territorySection="";state.territoryNeighborhood=""; }
    populateTerritorySelect("territory-zone-select", "Todas as zonas", zones, state.territoryZone, (value) => `Zona ${value}`);

    const zoneRows = allRows.filter((row) => !state.territoryZone || row.zone === state.territoryZone);
    const sections = uniqueSorted(zoneRows.map((row) => row.section), true);
    if (state.territorySection && !sections.includes(state.territorySection)) {
      state.territorySection = "";
      state.territoryPlace = "";
      state.territoryNeighborhood = "";
    }
    populateTerritorySelect("territory-section-select", "Todas as seções", sections, state.territorySection, (value) => `Seção ${value}`);

    const sectionRows = zoneRows.filter((row) => !state.territorySection || row.section === state.territorySection);
    const places = uniqueSorted(sectionRows.map((row) => row.place));
    if (state.territoryPlace && !places.includes(state.territoryPlace)) {
      state.territoryPlace = "";
      state.territoryNeighborhood = "";
    }
    populateTerritorySelect("territory-place-select", "Todos os locais", places, state.territoryPlace);
    window.SearchableSelect?.attach(el("territory-place-select"));
    el("territory-place-clear").disabled = !state.territoryPlace;
    el("territory-place-status").textContent = state.territoryPlace
      ? `Escola selecionada: ${state.territoryPlace}. Os resultados, o PDF e o CSV seguem este filtro.`
      : `${fmtInt(places.length)} locais disponíveis. Selecione ou busque uma escola pelo nome.`;

    const selected = selectedTerritorySchools(),selectedSet=new Set(selected);
    const schoolOptions=uniqueSorted(allRows.map(row=>row.place)).map(value=>({value,label:value}));
    window.SchoolPicker?.render(el("territory-school-picker"),{options:schoolOptions,selected,onApply:applyTerritorySchools});
    if(state.territoryPlaces.length){
      el("territory-place-select").disabled=true;el("territory-place-select").dispatchEvent(new Event("searchable:sync"));
      el("territory-place-clear").disabled=false;
      const available=new Set(schoolOptions.map(o=>o.value)),missing=selected.filter(value=>!available.has(value)).length;
      el("territory-place-status").textContent=`${selected.length} escolas selecionadas manualmente. Os votos, PDF e CSV seguem a seleção e os demais filtros ativos.${missing?` ${missing} local(is) não encontrado(s) na base atual.`:""}`;
    }
    const placeRows = sectionRows.filter((row) => !selected.length || selectedSet.has(row.place));
    const neighborhoods = uniqueSorted(placeRows.map((row) => row.neighborhood));
    if (state.territoryNeighborhood && !neighborhoods.includes(state.territoryNeighborhood)) state.territoryNeighborhood = "";
    populateTerritorySelect("territory-neighborhood-select", "Todos os bairros", neighborhoods, state.territoryNeighborhood);
  }

  function filteredTerritoryRows(allRows = candidateTerritoryRows(Boolean(selectedTerritorySchools().length))) {
    const schools=new Set(selectedTerritorySchools());
    return allRows.filter((row) => (
      (!state.territoryZone || row.zone === state.territoryZone)
      && (!state.territorySection || row.section === state.territorySection)
      && (!schools.size || schools.has(row.place))
      && (!state.territoryNeighborhood || row.neighborhood === state.territoryNeighborhood)
    ));
  }

  function buildTerritoryReport(rows) {
    const zoneMap = new Map();
    const placeMap = new Map();
    const neighborhoodMap = new Map();

    rows.forEach((row) => {
      if (!zoneMap.has(row.zone)) zoneMap.set(row.zone, { zone: row.zone, sections: new Set(), votes: 0 });
      const zone = zoneMap.get(row.zone);
      zone.sections.add(`${row.municipalityCode}|${row.zone}|${row.section}`);
      zone.votes += row.votes;

      const placeKey = `${row.place}\u0000${row.neighborhood}`;
      if (!placeMap.has(placeKey)) {
        placeMap.set(placeKey, {
          place: row.place,
          neighborhood: row.neighborhood,
          zones: new Set(),
          sections: new Set(),
          votes: 0,
        });
      }
      const place = placeMap.get(placeKey);
      place.zones.add(row.zone);
      place.sections.add(`${row.municipalityCode}|${row.zone}|${row.section}`);
      place.votes += row.votes;

      if (!neighborhoodMap.has(row.neighborhood)) {
        neighborhoodMap.set(row.neighborhood, {
          neighborhood: row.neighborhood,
          places: new Set(),
          sections: new Set(),
          votes: 0,
        });
      }
      const neighborhood = neighborhoodMap.get(row.neighborhood);
      neighborhood.places.add(row.place);
      neighborhood.sections.add(`${row.municipalityCode}|${row.zone}|${row.section}`);
      neighborhood.votes += row.votes;
    });

    return {
      totalVotes: rows.reduce((sum, row) => sum + row.votes, 0),
      zoneRows: [...zoneMap.values()].sort((a, b) => Number(a.zone) - Number(b.zone)),
      placeRows: [...placeMap.values()].sort((a, b) => b.votes - a.votes || a.place.localeCompare(b.place, "pt-BR")),
      neighborhoodRows: [...neighborhoodMap.values()].sort((a, b) => b.votes - a.votes || a.neighborhood.localeCompare(b.neighborhood, "pt-BR")),
      sectionRows: [...rows].sort((a, b) => Number(a.zone) - Number(b.zone) || Number(a.section) - Number(b.section)),
    };
  }

  function renderRankingChart(targetId, rows, labelFor, totalVotes, limit = 10) {
    const target = el(targetId);
    const ranked = [...rows].sort((a, b) => b.votes - a.votes).slice(0, limit);
    if (!ranked.length) {
      const empty = document.createElement("div");
      empty.className = "chart-empty";
      empty.textContent = "Nenhum voto encontrado com estes filtros.";
      target.replaceChildren(empty);
      return;
    }
    const maxVotes = Math.max(1, ...ranked.map((item) => item.votes));
    const fragment = document.createDocumentFragment();
    ranked.forEach((item) => {
      const row = document.createElement("div");
      row.className = "ranking-row";
      const label = document.createElement("span");
      label.className = "ranking-label";
      label.textContent = labelFor(item);
      label.title = label.textContent;
      const track = document.createElement("div");
      track.className = "ranking-track";
      const fill = document.createElement("div");
      fill.className = "ranking-fill";
      fill.style.width = item.votes ? `${Math.max(1.5, (item.votes / maxVotes) * 100)}%` : "0%";
      fill.hidden = !item.votes;
      track.appendChild(fill);
      const value = document.createElement("strong");
      value.className = "ranking-value";
      value.textContent = `${fmtInt(item.votes)} • ${fmtPercent(item.votes / Math.max(1, totalVotes))}`;
      row.append(label, track, value);
      fragment.appendChild(row);
    });
    target.replaceChildren(fragment);
  }

  function renderTerritoryCharts(report) {
    const strongestZone = [...report.zoneRows].sort((a, b) => b.votes - a.votes)[0];
    const strongestNeighborhood = report.neighborhoodRows[0];
    const strongestPlace = report.placeRows[0];
    const total = Math.max(1, report.totalVotes);

    const setHighlight = (nameId, detailId, name, votes) => {
      const nameElement = el(nameId);
      nameElement.textContent = name || "—";
      nameElement.title = name || "";
      el(detailId).textContent = votes
        ? `${fmtInt(votes)} votos • ${fmtPercent(votes / total)} do filtro`
        : "Sem votos neste recorte";
    };
    setHighlight("territory-strongest-zone", "territory-strongest-zone-detail", strongestZone ? `Zona ${strongestZone.zone}` : "—", strongestZone?.votes || 0);
    setHighlight("territory-strongest-neighborhood", "territory-strongest-neighborhood-detail", strongestNeighborhood?.neighborhood || "—", strongestNeighborhood?.votes || 0);
    setHighlight("territory-strongest-place", "territory-strongest-place-detail", strongestPlace?.place || "—", strongestPlace?.votes || 0);

    const sortedZones = [...report.zoneRows].sort((a, b) => b.votes - a.votes);
    const slices = sortedZones.slice(0, 9).map((item) => ({ label: `Zona ${item.zone}`, votes: item.votes }));
    if (sortedZones.length > 9) {
      slices.push({ label: "Outras zonas", votes: sortedZones.slice(9).reduce((sum, item) => sum + item.votes, 0) });
    }
    const donut = el("territory-zone-donut");
    const legend = el("territory-zone-legend");
    el("territory-zone-donut-total").textContent = fmtInt(report.totalVotes);
    if (!report.totalVotes || !slices.length) {
      donut.style.background = "#e8eef4";
      donut.setAttribute("aria-label", "Nenhum voto encontrado com estes filtros.");
      legend.replaceChildren();
    } else {
      let cursor = 0;
      const segments = slices.map((slice, index) => {
        const start = cursor;
        cursor += (slice.votes / report.totalVotes) * 360;
        const end = index === slices.length - 1 ? 360 : cursor;
        return `${CHART_COLORS[index % CHART_COLORS.length]} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
      });
      donut.style.background = `conic-gradient(${segments.join(", ")})`;
      donut.setAttribute("aria-label", slices.map((slice) => `${slice.label}: ${fmtInt(slice.votes)} votos`).join("; "));
      const legendFragment = document.createDocumentFragment();
      slices.forEach((slice, index) => {
        const row = document.createElement("div");
        row.className = "legend-row";
        const swatch = document.createElement("span");
        swatch.className = "legend-swatch";
        swatch.style.background = CHART_COLORS[index % CHART_COLORS.length];
        const label = document.createElement("span");
        label.textContent = slice.label;
        const value = document.createElement("strong");
        value.textContent = `${fmtInt(slice.votes)} • ${fmtPercent(slice.votes / report.totalVotes)}`;
        row.append(swatch, label, value);
        legendFragment.appendChild(row);
      });
      legend.replaceChildren(legendFragment);
    }

    const schoolNames = new Set(selectedTerritorySchools().map(normalizeText));
    const historyRows = previousTerritoryRows();
    const previousFiltered = historyRows && historyRows.filter((row) => (
      (!state.territoryZone || row.zone === state.territoryZone)
      && (!state.territorySection || row.section === state.territorySection)
      && (!schoolNames.size || schoolNames.has(normalizeText(row.place)))
    ));
    const matchedSchools=new Set(previousFiltered?.map(r=>normalizeText(r.place)));
    const hasComparablePlace = !schoolNames.size || [...schoolNames].every(place=>matchedSchools.has(place));
    const allowHistory = !state.territoryNeighborhood && hasComparablePlace ? previousFiltered : null;
    const zoneMap = new Map();
    (allowHistory || []).forEach((row) => zoneMap.set(row.zone, (zoneMap.get(row.zone) || 0) + row.votes));
    const currentZoneMap = new Map(sortedZones.map((row) => [row.zone, row.votes]));
    const zoneKeys = uniqueSorted([...currentZoneMap.keys(), ...zoneMap.keys()], true);
    el("territory-zone-year-chart").hidden = !allowHistory;
    if (allowHistory) renderYearComparison("territory-zone-year-chart", zoneKeys.map((zone) => ({ name: `Zona ${zone}`,
      votes: currentZoneMap.get(zone) || 0, previousVotes: zoneMap.get(zone) || 0 })));
    const primaryZones = sortedZones.slice(0, 9).map((item) => item.zone);
    const previousSlices = primaryZones.map((zone) => ({ label: `Zona ${zone}`, votes: zoneMap.get(zone) || 0 }));
    const previousOthers = [...zoneMap].filter(([zone]) => !primaryZones.includes(zone)).reduce((sum, [, votes]) => sum + votes, 0);
    if (sortedZones.length > 9 || previousOthers) previousSlices.push({ label: "Outras zonas", votes: previousOthers });
    renderHistoricalDonut("territory-zone-donut", allowHistory ? previousSlices : null);
    renderRankingChart("territory-neighborhood-chart", report.neighborhoodRows, (item) => item.neighborhood, report.totalVotes);
    const previousPlaces = new Map();
    (allowHistory || []).forEach((row) => {
      const key = normalizeText(row.place);
      previousPlaces.set(key, (previousPlaces.get(key) || 0) + row.votes);
    });
    renderYearComparison("territory-place-chart", report.placeRows.slice(0, 10).map((item) => ({ name: item.place, votes: item.votes,
      previousVotes: allowHistory && previousPlaces.has(normalizeText(item.place)) ? previousPlaces.get(normalizeText(item.place)) : null })));
    const history = historyCache.get(historyKey(state.candidate));
    el("territory-history-note").textContent = previousRegionalCandidate()
      ? !history ? "Carregando o detalhamento de 2022…" : history.unavailable
        ? "Detalhamento histórico indisponível; não foi criada comparação com valores estimados."
        : state.territoryNeighborhood ? "Bairro selecionado: somente 2026. A base de 2022 não informa bairro."
        : "2022 usa os mesmos números de zona e os locais com nome correspondente. Bairros: somente 2026."
      : "Somente 2026: não há participação correspondente confirmada em 2022 neste cargo.";
  }

  function renderTerritoryReport() {
    if (state.view === "territory") window.AppHome?.update?.(state.view);
    if (!state.city || !state.candidate) return;
    renderTerritoryFilters();
    el("clear-territory-button").disabled = ![state.territoryZone, state.territorySection, selectedTerritorySchools().length, state.territoryNeighborhood].some(Boolean);
    const allRows = candidateTerritoryRows(Boolean(selectedTerritorySchools().length));
    const report = buildTerritoryReport(filteredTerritoryRows(allRows));
    const placeCount = new Set(report.sectionRows.map((row) => row.place)).size;
    const neighborhoodCount = new Set(report.sectionRows.map((row) => row.neighborhood)).size;

    el("territory-votes").textContent = fmtInt(report.totalVotes);
    el("territory-sections").textContent = fmtInt(report.sectionRows.length);
    el("territory-places").textContent = fmtInt(placeCount);
    el("territory-neighborhoods").textContent = fmtInt(neighborhoodCount);
    el("territory-sections-caption").textContent = selectedTerritorySchools().length ? "seções dos locais no filtro" : "com votos";
    const filterSummary = [
      state.territoryZone ? `Zona ${state.territoryZone}` : "Todas as zonas",
      state.territorySection ? `Seção ${state.territorySection}` : "Todas as seções",
    ];
    if (selectedTerritorySchools().length) filterSummary.push(`${selectedTerritorySchools().length} escola(s) selecionada(s)`);
    if (state.territoryNeighborhood) filterSummary.push(state.territoryNeighborhood);
    filterSummary.push(`${fmtInt(report.totalVotes)} votos`);
    el("territory-context").textContent = filterSummary.join(" • ");
    const schoolTotals=new Map();report.sectionRows.forEach(r=>{if(!schoolTotals.has(r.place))schoolTotals.set(r.place,{value:r.place,label:r.place,votes:0});schoolTotals.get(r.place).votes+=r.votes;});
    window.SchoolPicker?.summary(el("territory-school-results"),[...schoolTotals.values()],state.territoryPlaces,report.totalVotes);
    renderTerritoryCharts(report);

    replaceTableBody(el("territory-zone-body"), report.zoneRows.map((item) => {
      const tr = document.createElement("tr");
      tr.append(
        createCell(`Zona ${item.zone}`),
        createCell(fmtInt(item.sections.size), "number-cell"),
        createCell(fmtInt(item.votes), "number-cell")
      );
      return tr;
    }));

    replaceTableBody(el("territory-neighborhood-body"), report.neighborhoodRows.slice(0, MAX_RENDER_ROWS).map((item) => {
      const tr = document.createElement("tr");
      tr.append(
        createCell(item.neighborhood),
        createCell(fmtInt(item.places.size), "number-cell"),
        createCell(fmtInt(item.sections.size), "number-cell"),
        createCell(fmtInt(item.votes), "number-cell")
      );
      return tr;
    }));

    replaceTableBody(el("territory-place-body"), report.placeRows.slice(0, MAX_RENDER_ROWS).map((item) => {
      const tr = document.createElement("tr");
      tr.append(
        createCell(item.place),
        createCell(item.neighborhood),
        createCell([...item.zones].sort((a, b) => Number(a) - Number(b)).join(", ")),
        createCell(fmtInt(item.sections.size), "number-cell"),
        createCell(fmtInt(item.votes), "number-cell")
      );
      return tr;
    }));

    replaceTableBody(el("territory-section-body"), report.sectionRows.slice(0, MAX_RENDER_ROWS).map((item) => {
      const tr = document.createElement("tr");
      tr.append(
        createCell(item.zone),
        createCell(item.section),
        createCell(item.place),
        createCell(item.neighborhood),
        createCell(fmtInt(item.votes), "number-cell")
      );
      return tr;
    }));

    el("territory-zone-note").textContent = `${fmtInt(report.zoneRows.length)} zona(s)`;
    const tableNote = (count, label) => count > MAX_RENDER_ROWS
      ? `Mostrando ${fmtInt(MAX_RENDER_ROWS)} de ${fmtInt(count)} ${label} • Refine os filtros ou gere o relatório completo.`
      : `${fmtInt(count)} ${label}`;
    el("territory-neighborhood-note").textContent = tableNote(report.neighborhoodRows.length, "bairro(s)");
    el("territory-place-note").textContent = tableNote(report.placeRows.length, "local(is)");
    el("territory-section-note").textContent = tableNote(report.sectionRows.length, "seção(ões)");
  }

  function selectCandidate(candidate) {
    state.candidate = candidate;
    if (state.city?.isManualSelection) {
      manualPreferredCandidateId = String(candidate[0]);
      el("candidate-search").value = `${candidate[1]} — ${candidateBallotName(candidate) || candidate[2]}`;
      hideCandidateResults(); renderCandidate(); return;
    }
    state.regionalRegion = state.regionFilter || "";
    const selectedId = String(candidate[0]);
    const remaining = state.compareCandidateIds.filter((id) => id && id !== selectedId).slice(0, 1);
    state.compareCandidateIds = [selectedId, ...remaining, ""].slice(0, 2);
    resetTerritoryFilters();
    el("candidate-search").value = `${candidate[1]} — ${candidate[2]}`;
    hideCandidateResults();
    renderCandidate();
    renderAnalysis();
  }

  function candidateBallotName(candidate) {
    return window.CandidateIdentity?.ballot(candidate, state.office) || "";
  }

  function renderCandidate() {
    const candidate = state.candidate;
    const city = state.city;
    window.AppHome?.update?.(state.view);
    if (!candidate || !city) {
      el("candidate-result").hidden = true;
      el("municipality-selection-result").hidden = true;
      el("candidate-empty").hidden = false;
      return;
    }
    el("candidate-empty").hidden = true;
    if (city.isManualSelection) {
      el("candidate-result").hidden = true;
      el("municipality-selection-result").hidden = false;
      renderManualMunicipalities(); return;
    }
    el("municipality-selection-result").hidden = true;
    el("candidate-result").hidden = false;
    el("candidate-number").textContent = candidate[1];
    el("candidate-name").textContent = candidate[2];
    const ballotName = candidateBallotName(candidate);
    el("candidate-ballot-name").textContent = ballotName || "Não disponível nesta consulta";
    el("candidate-ballot-name").title = ballotName
      ? `TSE • Candidaturas 2026 • ${window.CandidateIdentity.source(state.office)?.generation || "2026"}`
      : "A identificação precisa corresponder ao cargo, número e nome completo da candidatura de 2026.";
    el("candidate-place").textContent = `${city.m[1]} • Pará • ${officeConfig().label}`;
    window.Results2026?.candidateInfo();
    renderDataStatus();
    renderHistorySummary();
    window.CrmWorkspace?.refreshSearchCoverage?.();
    renderRegionFilterBar();
    el("candidate-votes").textContent = fmtInt(candidate[3]);
    el("candidate-rank").textContent = `${fmtInt(candidate[4])}º`;
    el("candidate-share").textContent = fmtPercent(candidate[3] / (city.x?.[1] || 1));
    el("candidate-sections").textContent = fmtInt(candidate[5].length);

    if (state.view === "overview") renderCandidateOverview(candidate, city);
    renderActiveCandidateView();
  }

  function renderCandidateOverview(candidate, city) {
    const zoneTotals = new Map();
    const sectionRows = candidate[5].map(([sectionIndex, votes]) => {
      const section = city.s[sectionIndex];
      const zone = String(section[0]);
      zoneTotals.set(zone, (zoneTotals.get(zone) || 0) + votes);
      return { zone, section: String(section[1]), place: section[2], votes };
    });
    const zones = [...zoneTotals.entries()].sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]));
    const topZone = zones[0] || ["—", 0];
    el("candidate-top-zone").textContent = topZone[0] === "—" ? "—" : `Zona ${topZone[0]}`;
    el("candidate-top-zone-votes").textContent = `${fmtInt(topZone[1])} voto(s)`;
    el("zone-count").textContent = `${fmtInt(zones.length)} zona(s)`;

    const topSections = [...sectionRows]
      .sort((a, b) => b.votes - a.votes || Number(a.zone) - Number(b.zone) || Number(a.section) - Number(b.section))
      .slice(0, 10)
      .map((item) => {
        const tr = document.createElement("tr");
        tr.append(createCell(item.zone), createCell(item.section), createCell(item.place || "—"), createCell(fmtInt(item.votes), "number-cell"));
        return tr;
      });
    replaceTableBody(el("top-sections-body"), topSections);

    const maxZoneVotes = Math.max(1, ...zones.map((item) => item[1]));
    const zoneFragment = document.createDocumentFragment();
    zones.slice(0, 10).forEach(([zone, votes]) => {
      const row = document.createElement("div");
      row.className = "zone-bar";
      const label = document.createElement("span");
      label.textContent = `Zona ${zone}`;
      const track = document.createElement("div");
      track.className = "bar-track";
      const fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.width = `${Math.max(2, (votes / maxZoneVotes) * 100)}%`;
      track.appendChild(fill);
      const value = document.createElement("b");
      value.textContent = fmtInt(votes);
      row.append(label, track, value);
      zoneFragment.appendChild(row);
    });
    el("zone-bars").replaceChildren(zoneFragment);
    const schoolNames = new Set(selectedTerritorySchools().map(normalizeText));
    const historyRows = previousTerritoryRows();
    if (previousRegionalCandidate()) {
      const oldZones = new Map();
      (historyRows || []).forEach((row) => oldZones.set(row.zone, (oldZones.get(row.zone) || 0) + row.votes));
      const currentZones = new Map(zones);
      const zoneKeys = uniqueSorted([...currentZones.keys(), ...oldZones.keys()], true);
      renderYearComparison("zone-bars", zoneKeys.map((zone) => ({ name: `Zona ${zone}`, votes: currentZones.get(zone) || 0,
        previousVotes: historyRows ? oldZones.get(zone) || 0 : null })));
    }
  }

  function statewideCandidate(candidateOrId) {
    const candidateId = Array.isArray(candidateOrId) ? candidateOrId[0] : candidateOrId;
    return state.statewide?.candidates?.find((item) => String(item[0]) === String(candidateId)) || null;
  }

  function municipalityMetadata() {
    return new Map((state.index?.municipalities || []).map((item) => [String(item[0]), item]));
  }

  function municipalitiesWithVotes(votes, cities) {
    const allowed = new Set(cities.map((city) => String(city[0])));
    return new Set((votes || []).filter(([code, count]) => allowed.has(String(code)) && Number(count) > 0)
      .map(([code]) => String(code))).size;
  }

  function renderCandidateXray() {
    if (!state.candidate || !state.city || !state.statewide) return;
    const summary = statewideCandidate(state.candidate);
    if (!summary) return;
    const xrayCities = state.regionFilter ? filteredMunicipalities() : state.index.municipalities;
    const allowed = new Set(xrayCities.map((city) => String(city[0])));
    const totalMunicipalities = Math.max(1, xrayCities.length);
    const statewideVotes = Math.max(1, Number(state.statewide.totalVotes) || 0);
    const scopedVotes = (summary[6] || []).filter(([code]) => allowed.has(String(code)));
    const candidateVotes = scopedVotes.reduce((sum, [, votes]) => sum + Number(votes), 0);
    const municipalities = municipalityMetadata();
    const previous = previousRegionalCandidate();
    const oldVotes = new Map((previous?.[6] || []).map(([code, votes]) => [String(code), votes]));
    const top30 = scopedVotes.slice(0, 30).map(([code, votes]) => {
      const city = municipalities.get(String(code)) || [code, `Município ${code}`, 0, 0, 0, 0];
      return {
        code: String(code),
        name: city[1],
        votes: Number(votes) || 0,
        municipalityVotes: Number(city[5]) || 0,
        previousVotes: previous ? oldVotes.get(String(code)) || 0 : null,
      };
    });
    const top30Votes = top30.reduce((sum, item) => sum + item.votes, 0);

    el("xray-state-votes").textContent = fmtInt(candidateVotes);
    const regionName = state.regional?.regions?.find((item) => String(item[0]) === state.regionFilter)?.[1];
    el("xray-title").textContent = regionName ? `Desempenho em ${regionName}` : "Desempenho no Pará";
    el("xray-scope-note").textContent = `Eleição 2026 • ${fmtInt(totalMunicipalities)} municípios${previous ? " • comparação com 2022" : " • sem comparação histórica"}`;
    el("xray-votes-label").textContent = regionName ? "Votos na região" : "Votos no Pará";
    el("xray-rank-label").textContent = regionName ? "Ranking regional" : "Ranking estadual";
    el("xray-index-label").textContent = regionName ? "Índice regional" : "Índice estadual";
    el("xray-weight-label").textContent = state.city.isStatewide ? "Peso do recorte no Pará"
      : state.city.isRegional ? "Peso da região no Pará" : "Peso deste município no Pará";
    el("xray-state-rank").textContent = `${fmtInt(regionName ? regionalRank(state.regionFilter, summary[0]) : summary[4])}º`;
    const scopeTotal = regionName ? xrayCities.reduce((sum, city) => sum + Number(city[5] || 0), 0) : statewideVotes;
    el("xray-state-share").textContent = fmtPercent(candidateVotes / Math.max(1, scopeTotal));
    const votedMunicipalities = municipalitiesWithVotes(scopedVotes, xrayCities);
    el("xray-coverage").textContent = fmtInt(votedMunicipalities);
    el("xray-coverage-note").textContent = `de ${fmtInt(totalMunicipalities)} municípios ${regionName ? "na região" : "no Pará"}`;
    el("xray-coverage").title = "Municípios distintos com pelo menos um voto na base ativa de 2026. " + el("xray-coverage-note").textContent;
    el("xray-top30-share").textContent = fmtPercent(top30Votes / Math.max(1, candidateVotes));
    el("xray-city-share").textContent = fmtPercent((Number(state.candidate[3]) || 0) / Math.max(1, summary[3]));
    el("xray-weight-card").hidden = Boolean(state.city.isStatewide);
    for (const id of ["xray-state-rank", "xray-state-share"]) el(id).closest(".metric-card").hidden = Boolean(state.city.isStatewide || state.city.isRegional);

    renderYearComparison("xray-municipality-chart", top30);
    replaceTableBody(el("xray-top30-body"), top30.map((item, index) => {
      const tr = document.createElement("tr");
      tr.append(
        createCell(fmtInt(index + 1)),
        createCell(item.name),
        createCell(fmtInt(item.votes), "number-cell"),
        createCell(fmtPercent(item.votes / Math.max(1, candidateVotes)), "number-cell"),
        createCell(fmtPercent(item.votes / Math.max(1, item.municipalityVotes)), "number-cell"),
        createCell(previous ? fmtInt(item.previousVotes) : "—", "number-cell"),
        voteChangeCell(item.votes, item.previousVotes)
      );
      return tr;
    }));
  }

  function regionalVoteMap(rows) {
    return new Map((rows || []).map(([regionId, votes]) => [String(regionId), Number(votes) || 0]));
  }

  function currentRegionalCandidate(candidate = state.candidate) {
    if (!candidate || !state.regional) return null;
    return state.regional.currentCandidates.find((item) => String(item[0]) === String(candidate[0])) || null;
  }

  function previousRegionalCandidate(candidate = state.candidate) {
    if (!candidate || !state.regional) return null;
    const key = `${state.office}|${candidate[0]}`;
    if (!previousCandidateCache.has(key)) previousCandidateCache.set(key,
      window.ElectoralScope.previousCandidate(candidate, state.regional.previousCandidates, state.statewide?.candidates || []));
    return previousCandidateCache.get(key);
  }

  function regionalRank(regionId, candidateId, previous = false) {
    if (!state.regional) return 0;
    const rows = previous ? state.regional.previousCandidates : state.regional.currentCandidates;
    const row = rows.find((item) => String(item[0]) === String(candidateId));
    if (!row) return 0;
    const pairs = previous ? row[5] : row[1];
    const votes = regionalVoteMap(pairs).get(String(regionId)) || 0;
    let ahead = 0;
    rows.forEach((item) => {
      const itemPairs = previous ? item[5] : item[1];
      const itemVotes = regionalVoteMap(itemPairs).get(String(regionId)) || 0;
      if (itemVotes > votes) ahead += 1;
    });
    return ahead + 1;
  }

  function regionalReportData() {
    const current = currentRegionalCandidate();
    const previous = previousRegionalCandidate();
    const summary = statewideCandidate(state.candidate);
    if (!current || !summary || !state.regional) {
      return { rows: [], current, previous, currentTotal: 0, previousTotal: 0 };
    }
    const currentVotes = regionalVoteMap(current[1]);
    const previousVotes = regionalVoteMap(previous?.[5]);
    const currentTotals = regionalVoteMap(state.regional.totals?.current);
    const previousTotals = regionalVoteMap(state.regional.totals?.previous);
    const rows = state.regional.regions.map(([id, name, municipalities]) => {
      const currentValue = currentVotes.get(String(id)) || 0;
      const previousValue = previous ? previousVotes.get(String(id)) || 0 : null;
      return {
        id: String(id),
        name,
        municipalities: Number(municipalities) || 0,
        currentVotes: currentValue,
        previousVotes: previousValue,
        currentTotal: currentTotals.get(String(id)) || 0,
        previousTotal: previousTotals.get(String(id)) || 0,
        currentRank: regionalRank(id, current[0], false),
        previousRank: previous ? regionalRank(id, previous[0], true) : 0,
      };
    });
    return {
      rows,
      current,
      previous,
      currentTotal: Number(summary[3]) || 0,
      previousTotal: Number(previous?.[3]) || 0,
    };
  }

  function renderRegionalYearChart(rows, hasPrevious) {
    renderYearComparison("regional-year-chart", rows.map((item) => ({ name: item.name, votes: item.currentVotes,
      previousVotes: hasPrevious ? item.previousVotes : null })));
  }

  function renderRegionalDonut(rows, totalVotes) {
    const donut = el("regional-donut");
    const legend = el("regional-donut-legend");
    el("regional-donut-total").textContent = fmtInt(totalVotes);
    const sorted = [...rows].sort((a, b) => b.currentVotes - a.currentVotes);
    if (!totalVotes || !sorted.length) {
      donut.style.background = "#e8eef4";
      legend.replaceChildren();
      return;
    }
    let cursor = 0;
    const segments = sorted.map((item, index) => {
      const start = cursor;
      cursor += (item.currentVotes / totalVotes) * 360;
      const end = index === sorted.length - 1 ? 360 : cursor;
      return `${CHART_COLORS[index % CHART_COLORS.length]} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
    });
    donut.style.background = `conic-gradient(${segments.join(", ")})`;
    donut.setAttribute("aria-label", sorted.map((item) => `${item.name}: ${fmtInt(item.currentVotes)} votos`).join("; "));
    const fragment = document.createDocumentFragment();
    sorted.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "legend-row";
      const swatch = document.createElement("span");
      swatch.className = "legend-swatch";
      swatch.style.background = CHART_COLORS[index % CHART_COLORS.length];
      const label = document.createElement("span");
      label.textContent = item.name;
      const value = document.createElement("strong");
      value.textContent = `${fmtInt(item.currentVotes)} • ${fmtPercent(item.currentVotes / totalVotes)}`;
      row.append(swatch, label, value);
      fragment.appendChild(row);
    });
    legend.replaceChildren(fragment);
  }

  function regionalMunicipalityRows(regionId) {
    if (!state.regional || !state.candidate) return [];
    const summary = statewideCandidate(state.candidate);
    const votes = new Map((summary?.[6] || []).map(([code, value]) => [String(code), Number(value) || 0]));
    const previous = previousRegionalCandidate();
    const oldVotes = new Map((previous?.[6] || []).map(([code, value]) => [String(code), Number(value) || 0]));
    return state.regional.municipalities
      .filter((item) => String(item[2]) === String(regionId))
      .map(([code, name]) => ({ code: String(code), name, votes: votes.get(String(code)) || 0,
        previousVotes: previous ? oldVotes.get(String(code)) || 0 : null }))
      .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name, "pt-BR"));
  }

  function renderRegionalMunicipalityBreakdown() {
    if (!state.regional) return;
    const select = el("regional-region-select");
    select.replaceChildren();
    state.regional.regions.forEach(([id, name, count]) => {
      select.add(new Option(`${name} — ${fmtInt(count)} municípios`, String(id)));
    });
    if (!state.regional.regions.some((region) => String(region[0]) === String(state.regionalRegion))) {
      state.regionalRegion = String(state.regional.regions[0]?.[0] || "");
    }
    select.value = state.regionalRegion;
    const region = state.regional.regions.find((item) => String(item[0]) === String(state.regionalRegion));
    const rows = regionalMunicipalityRows(state.regionalRegion);
    const total = rows.reduce((sum, item) => sum + item.votes, 0);
    el("regional-municipality-chart-title").textContent = region ? `Municípios da região ${region[1]}` : "Municípios com maior votação";
    renderYearComparison("regional-municipality-chart", rows);
    replaceTableBody(el("regional-municipality-body"), rows.map((item, index) => {
      const tr = document.createElement("tr");
      tr.append(
        createCell(fmtInt(index + 1)),
        createCell(item.name),
        createCell(fmtInt(item.votes), "number-cell"),
        createCell(fmtPercent(item.votes / Math.max(1, total)), "number-cell"),
        createCell(item.previousVotes === null ? "—" : fmtInt(item.previousVotes), "number-cell"),
        voteChangeCell(item.votes, item.previousVotes)
      );
      return tr;
    }));
    el("regional-municipality-note").textContent = `${fmtInt(rows.length)} municípios (incluindo os sem votos) • ${fmtInt(total)} votos`;
  }

  function renderRegionalReport() {
    if (state.view === "regional") window.AppHome?.update?.(state.view);
    if (!state.candidate || !state.regional) return;
    const report = regionalReportData();
    if (!report.rows.length) return;
    const visibleRows = state.regionFilter ? report.rows.filter((item) => item.id === state.regionFilter) : report.rows;
    el("regional-overview-chart").hidden = Boolean(state.regionFilter);
    el("regional-table-scope").textContent = state.regionFilter ? "Região selecionada" : "13 regiões";
    const strongest = [...visibleRows].sort((a, b) => b.currentVotes - a.currentVotes)[0];
    if (!state.regionalRegion) state.regionalRegion = strongest?.id || String(state.regional.regions[0]?.[0] || "");
    const bestRank = Math.min(...visibleRows.filter((item) => item.currentVotes > 0).map((item) => item.currentRank));
    el("regional-region-label").textContent = state.regionFilter ? "Região selecionada" : "Região mais forte";
    el("regional-title").textContent = state.regionFilter ? `${strongest?.name || "Região"} • todos os municípios` : "Votação nas 13 regiões";
    el("regional-year-status").textContent = report.previous ? "Comparativo 2026 × 2022 • 1º turno" : "Eleição 2026 • sem comparação histórica";
    el("regional-year-previous-legend").hidden = !report.previous;
    el("regional-previous-columns-note").textContent = report.previous ? "2026 × 2022" : "2026 • sem participação anterior confirmada";
    el("regional-best-name").textContent = strongest?.name || "—";
    el("regional-best-name").title = strongest?.name || "";
    el("regional-best-votes").textContent = fmtInt(strongest?.currentVotes || 0);
    el("regional-best-share").textContent = fmtPercent((strongest?.currentVotes || 0) / Math.max(1, report.currentTotal));
    el("regional-best-rank").textContent = Number.isFinite(bestRank) ? `${fmtInt(bestRank)}º` : "—";
    const change = window.ElectoralScope.change(strongest?.currentVotes || 0, report.previous ? strongest?.previousVotes || 0 : null);
    el("regional-total-change").textContent = change.label;
    el("regional-total-change").className = change.className;
    el("regional-change-card").hidden = !report.previous;
    el("regional-previous-match").textContent = report.previous
      ? `Correspondência em 2022: ${report.previous[1]} — ${report.previous[2]} (${fmtInt(report.previousTotal)} votos).`
      : `Sem correspondência exata em 2022 para ${state.candidate[2]}.`;

    renderRegionalYearChart(visibleRows, Boolean(report.previous));
    const donutRows = state.regionFilter ? regionalMunicipalityRows(state.regionFilter).map((item) => ({ ...item, currentVotes: item.votes })) : report.rows;
    const donutTotal = donutRows.reduce((sum, item) => sum + item.currentVotes, 0);
    el("regional-donut-title").textContent = state.regionFilter ? "Distribuição entre todos os municípios da região" : "Distribuição regional";
    renderRegionalDonut(donutRows, donutTotal);
    renderHistoricalDonut("regional-donut", report.previous ? [...donutRows].sort((a, b) => b.currentVotes - a.currentVotes)
      .map((item) => ({ label: item.name, votes: item.previousVotes || 0 })) : null);
    replaceTableBody(el("regional-results-body"), visibleRows.map((item) => {
      const tr = document.createElement("tr");
      tr.append(
        createCell(item.name),
        createCell(fmtInt(item.municipalities), "number-cell"),
        createCell(fmtInt(item.currentVotes), "number-cell"),
        createCell(fmtPercent(item.currentVotes / Math.max(1, report.currentTotal)), "number-cell"),
        createCell(fmtPercent(item.currentVotes / Math.max(1, item.currentTotal)), "number-cell"),
        createCell(`${fmtInt(item.currentRank)}º`, "number-cell"),
        createCell(report.previous ? fmtInt(item.previousVotes) : "—", "number-cell"),
        voteChangeCell(item.currentVotes, report.previous ? item.previousVotes : null)
      );
      return tr;
    }));
    renderRegionalMunicipalityBreakdown();
  }

  function quantile(values, percentile) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) * percentile;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  }

  function candidateDistribution(summary) {
    const votesByMunicipality = new Map((summary?.[6] || []).map(([code, votes]) => [String(code), Number(votes) || 0]));
    return filteredMunicipalities().map(([code]) => votesByMunicipality.get(String(code)) || 0);
  }

  function distributionStats(summary) {
    const values = candidateDistribution(summary);
    return {
      min: values.length ? Math.min(...values) : 0,
      q1: quantile(values, .25),
      median: quantile(values, .5),
      q3: quantile(values, .75),
      max: values.length ? Math.max(...values) : 0,
    };
  }

  function populateComparisonSelectors() {
    if (!state.city) return;
    state.compareCandidateIds = window.CandidateApuration.normalizeSelection(state.compareCandidateIds,state.city.c);
    if (comparisonSelectorCity === state.city) {
      for (let index = 0; index < 2; index += 1) el(`compare-select-${index + 1}`).value = state.compareCandidateIds[index] || "";
      return;
    }
    const candidates = [...state.city.c].sort((a, b) => String(a[2]).localeCompare(String(b[2]), "pt-BR") || String(a[1]).localeCompare(String(b[1])));
    state.compareCandidateIds = state.compareCandidateIds.map((id) => (
      id && candidates.some((candidate) => String(candidate[0]) === String(id)) ? String(id) : ""
    ));
    for (let index = 0; index < 2; index += 1) {
      const select = el(`compare-select-${index + 1}`);
      const placeholder = index === 0 ? "Selecionar candidato 1" : "Selecionar candidato 2";
      select.replaceChildren(new Option(placeholder, ""));
      candidates.forEach((candidate) => {
        select.add(new Option(`${candidate[1]} — ${candidate[2]}`, String(candidate[0])));
      });
      select.value = state.compareCandidateIds[index] || "";
    }
    comparisonSelectorCity = state.city;
  }

  function selectedComparisonCandidates() {
    if (!state.city) return [];
    return state.compareCandidateIds.slice(0,2).map((candidateId, slot) => {
      if (!candidateId) return null;
      const candidate = state.city.c.find((item) => String(item[0]) === String(candidateId));
      if (!candidate) return null;
      return {
        slot,
        color: COMPARE_COLORS[slot],
        candidate,
        summary: statewideCandidate(candidate),
      };
    }).filter(Boolean);
  }

  function comparisonDataset(allMunicipalities = false) {
    if(allMunicipalities)return window.ComparisonReport.statewideQuery({office:state.office,index:state.index,statewide:state.statewide,regional:state.regional,
      candidateIds:state.compareCandidateIds,getPrevious:previousRegionalCandidate,ballotName:candidateBallotName});
    const query=window.ComparisonReport.query({office:state.office,city:state.city,index:state.index,regional:state.regional,candidateIds:state.compareCandidateIds,
      filters:{zone:state.territoryZone,section:state.territorySection,place:state.territoryPlace,neighborhood:state.territoryNeighborhood},
      getPrevious:previousRegionalCandidate,getHistory:previousTerritoryRows,ballotName:candidateBallotName});
    query.selections.forEach(selection=>{selection.summary=statewideCandidate(selection.candidate);});
    const places=new Map();
    query.selections.forEach((selection,i)=>selection.rows.forEach(row=>{
      const key=row.place+"\u0000"+row.neighborhood;
      if(!places.has(key))places.set(key,{key,label:row.place,neighborhood:row.neighborhood,values:Array(query.selections.length).fill(0)});
      places.get(key).values[i]+=row.votes;
    }));
    const previousPlaces=query.selections.map(selection=>{
      const totals=new Map();for(const row of selection.previousRows||[]){const key=normalizeText(row.place);totals.set(key,(totals.get(key)||0)+row.votes);}return totals;
    });
    const placeRows=[...places.values()].map(row=>{const key=normalizeText(row.label);return {...row,total:row.values.reduce((n,v)=>n+v,0),
      previousValues:previousPlaces.map(totals=>totals.has(key)?totals.get(key):null)};
    }).sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label,"pt-BR"));
    const statistics=values=>({min:values.length?Math.min(...values):0,q1:quantile(values,.25),median:quantile(values,.5),q3:quantile(values,.75),max:values.length?Math.max(...values):0});
    const stats=query.selections.flatMap((selection,i)=>{
      const current={...selection,year:2026,stats:statistics(query.municipalities.map(r=>r.values[i]))},previous=query.municipalities.map(r=>r.previousValues[i]);
      return selection.previous&&previous.length&&previous.every(v=>v!==null)?[current,{...selection,year:2022,stats:statistics(previous)}]:[current];
    });
    return {...query,placeRows,stats};
  }

  function renderComparisonLegend(selections) {
    const fragment = document.createDocumentFragment();
    selections.forEach(({ candidate, color }) => {
      const item = document.createElement("span");
      item.className = "comparison-legend-item";
      item.style.setProperty("--candidate-color", color);
      const swatch = document.createElement("span");
      const label = document.createElement("span");
      label.textContent = `${candidate[1]} — ${candidate[2]}`;
      item.append(swatch, label);
      fragment.appendChild(item);
    });
    el("comparison-legend").replaceChildren(fragment);
  }

  function renderGroupedComparisonChart(targetId, rows, selections) {
    const target = el(targetId);
    if (!rows.length || !selections.length) {
      const empty = document.createElement("div");
      empty.className = "chart-empty";
      empty.textContent = "Selecione candidatos com votação neste recorte.";
      target.replaceChildren(empty);
      return;
    }
    const maxVotes = Math.max(1, ...rows.flatMap((row) => [...row.values, ...(row.previousValues || [])].map((value) => Number(value) || 0)));
    const fragment = document.createDocumentFragment();
    rows.forEach((item) => {
      const row = document.createElement("div");
      row.className = "group-row";
      const label = document.createElement("span");
      label.className = "group-label";
      label.textContent = item.label;
      label.title = item.neighborhood ? `${item.label} • ${item.neighborhood}` : item.label;
      const bars = document.createElement("div");
      bars.className = "group-bars";
      selections.forEach(({ candidate, color }, index) => {
        const years = [[2026, item.values[index]]];
        if (previousRegionalCandidate(candidate) && item.previousValues) years.push([2022, item.previousValues[index]]);
        years.forEach(([year, rawVotes]) => {
          const votes = Number(rawVotes) || 0;
          const bar = document.createElement("div");
          bar.className = "group-bar";
          bar.style.setProperty("--candidate-color", color);
          const name = document.createElement("span");
          name.className = "group-bar-name";
          name.textContent = `${candidate[2]} • ${year}`;
          name.title = name.textContent;
          if (year === 2022) bar.classList.add("group-bar-previous");
          const track = document.createElement("div");
          track.className = "group-bar-track";
          const fill = document.createElement("div");
          fill.className = "group-bar-fill";
          fill.style.width = `${(votes / maxVotes) * 100}%`;
          fill.hidden = votes === 0;
          track.appendChild(fill);
          const value = document.createElement("strong");
          value.className = "group-bar-value";
          value.textContent = rawVotes === null || rawVotes === undefined ? "—" : fmtInt(votes);
          bar.append(name, track, value);
          bars.appendChild(bar);
        });
      });
      row.append(label, bars);
      fragment.appendChild(row);
    });
    target.replaceChildren(fragment);
  }

  function renderCandlestick(statsRows) {
    const target = el("comparison-candlestick");
    if (!statsRows.length) {
      const empty = document.createElement("div");
      empty.className = "chart-empty";
      empty.textContent = "Selecione ao menos um candidato.";
      target.replaceChildren(empty);
      return;
    }
    const scaleMax = Math.max(1, ...statsRows.map((item) => item.stats.max));
    const labels = [
      ["Min", "min"],
      ["Q1", "q1"],
      ["Mediana", "median"],
      ["Q3", "q3"],
      ["Máx", "max"],
    ];
    const fragment = document.createDocumentFragment();
    statsRows.forEach(({ candidate, color, stats, year }) => {
      const row = document.createElement("div");
      row.className = "candle-row";
      row.style.setProperty("--candidate-color", color);
      const name = document.createElement("span");
      name.className = "candle-name";
      name.textContent = `${candidate[1]} — ${candidate[2]} • ${year}`;
      name.title = name.textContent;
      const track = document.createElement("div");
      track.className = "candle-track";
      const whisker = document.createElement("div");
      whisker.className = "candle-whisker";
      whisker.style.left = `${(stats.min / scaleMax) * 100}%`;
      whisker.style.width = `${Math.max(0, ((stats.max - stats.min) / scaleMax) * 100)}%`;
      const box = document.createElement("div");
      box.className = "candle-box";
      box.style.left = `${(stats.q1 / scaleMax) * 100}%`;
      box.style.width = `${Math.max(0, ((stats.q3 - stats.q1) / scaleMax) * 100)}%`;
      const median = document.createElement("div");
      median.className = "candle-median";
      median.style.left = `${(stats.median / scaleMax) * 100}%`;
      track.append(whisker, box, median);
      const details = document.createElement("div");
      details.className = "candle-stats";
      labels.forEach(([label, key]) => {
        const item = document.createElement("span");
        const value = document.createElement("b");
        item.textContent = label;
        value.textContent = fmtInt(Math.round(stats[key]));
        item.appendChild(value);
        details.appendChild(item);
      });
      row.append(name, track, details);
      fragment.appendChild(row);
    });
    target.setAttribute("aria-label", statsRows.map(({ candidate, stats, year }) => (
      `${candidate[2]}, ${year}: mínimo ${fmtInt(stats.min)}, primeiro quartil ${fmtInt(Math.round(stats.q1))}, mediana ${fmtInt(Math.round(stats.median))}, terceiro quartil ${fmtInt(Math.round(stats.q3))}, máximo ${fmtInt(stats.max)}`
    )).join("; "));
    target.replaceChildren(fragment);
  }

  function renderComparisonPlaceTable(placeRows, selections) {
    const headRow = document.createElement("tr");
    const placeHead = document.createElement("th");
    placeHead.textContent = "Local / escola";
    const neighborhoodHead = document.createElement("th");
    neighborhoodHead.textContent = "Bairro";
    headRow.append(placeHead, neighborhoodHead);
    selections.forEach(({ candidate }) => {
      const th = document.createElement("th");
      th.className = "number-cell";
      th.textContent = candidate[1];
      th.title = candidate[2];
      headRow.appendChild(th);
    });
    const totalHead = document.createElement("th");
    totalHead.className = "number-cell";
    totalHead.textContent = "Total combinado";
    headRow.appendChild(totalHead);
    el("comparison-place-head").replaceChildren(headRow);

    replaceTableBody(el("comparison-place-body"), placeRows.slice(0, 10).map((item) => {
      const tr = document.createElement("tr");
      tr.append(createCell(item.label), createCell(item.neighborhood));
      item.values.forEach((value) => tr.appendChild(createCell(fmtInt(value), "number-cell")));
      tr.appendChild(createCell(fmtInt(item.total), "number-cell"));
      return tr;
    }));
  }

  function renderCandidateComparison() {
    if (state.view !== "comparison") return;
    window.AppHome?.update?.(state.view);
    if (!state.city || !state.statewide) return;
    populateComparisonSelectors();
    window.CandidateApuration.render();
  }

  function candidateSectionMaps() {
    const voteMap = new Map();
    const placeMap = new Map();
    if (!state.city || !state.candidate) return { voteMap, placeMap };
    state.city.s.forEach((section) => placeMap.set(`${section[0]}|${section[1]}`, section[2] || ""));
    state.candidate[5].forEach(([sectionIndex, votes]) => {
      const section = state.city.s[sectionIndex];
      voteMap.set(`${section[0]}|${section[1]}`, votes);
    });
    return { voteMap, placeMap };
  }

  function analyzeRecords(records) {
    const validation = validateRecords(records);
    const { voteMap, placeMap } = candidateSectionMaps();
    const groups = new Map();
    validation.valid.forEach((record) => {
      const key = `${record.zone}|${record.section}`;
      if (!groups.has(key)) groups.set(key, { key, zone: record.zone, section: record.section, records: [] });
      groups.get(key).records.push(record);
    });

    let hits = 0;
    let inVotingSections = 0;
    let votesInListedSections = 0;
    const sectionRows = [...groups.values()].map((group) => {
      const votes = voteMap.get(group.key) || 0;
      const estimatedHits = Math.min(group.records.length, votes);
      const rate = group.records.length ? estimatedHits / group.records.length : 0;
      hits += estimatedHits;
      if (votes > 0) inVotingSections += group.records.length;
      votesInListedSections += votes;
      return {
        ...group,
        place: placeMap.get(group.key) || "Seção não localizada na base",
        votes,
        hits: estimatedHits,
        rate,
      };
    }).sort((a, b) => Number(a.zone) - Number(b.zone) || Number(a.section) - Number(b.section));

    const sectionByKey = new Map(sectionRows.map((row) => [row.key, row]));
    const peopleRows = validation.valid.map((record) => {
      const section = sectionByKey.get(`${record.zone}|${record.section}`);
      let reading = "Sem voto do candidato na seção";
      let readingClass = "zero";
      if (section?.votes >= section?.records.length) {
        reading = "Compatível no conjunto da seção";
        readingClass = "good";
      } else if (section?.votes > 0) {
        reading = "Compatibilidade parcial na seção";
        readingClass = "medium";
      }
      return { ...record, votes: section?.votes || 0, reading, readingClass };
    });

    return {
      total: records.length,
      valid: validation.valid.length,
      incomplete: validation.incompleteRows.length,
      duplicates: validation.duplicateRows.length,
      hits,
      unmatched: Math.max(0, validation.valid.length - hits),
      rate: validation.valid.length ? hits / validation.valid.length : 0,
      inVotingSections,
      votesInListedSections,
      sectionRows,
      peopleRows,
    };
  }

  function unfilteredScopeRecords() {
    if (state.analysisScope === ALL_LISTS) {
      return state.lists.flatMap((list) => list.records.map((record) => ({
        ...record,
        _listName: list.name,
        _coordinator: coordinatorDisplay(list.coordinator),
      })));
    }
    const scopedCoordinator = coordinatorKeyFromScope(state.analysisScope);
    if (scopedCoordinator !== null) {
      const group = coordinatorGroups().find((item) => item.key === scopedCoordinator);
      return group ? group.lists.flatMap((list) => list.records.map((record) => ({
        ...record,
        _listName: list.name,
        _coordinator: group.name,
      }))) : [];
    }
    const list = state.lists.find((item) => item.id === state.analysisScope);
    return list ? list.records.map((record) => ({
      ...record,
      _listName: list.name,
      _coordinator: coordinatorDisplay(list.coordinator),
    })) : [];
  }

  function recordsForSelectedZone(records) {
    if (!state.analysisZone) return records;
    return records.filter((record) => canonicalElectionNumber(record.zone) === state.analysisZone);
  }

  function scopeRecords() {
    return recordsForSelectedZone(unfilteredScopeRecords());
  }

  function renderZoneFilter() {
    const select = el("analysis-zone-select");
    const zones = [...new Set(unfilteredScopeRecords()
      .map((record) => canonicalElectionNumber(record.zone))
      .filter(Boolean))]
      .sort((a, b) => Number(a) - Number(b));
    select.replaceChildren(new Option("Todas as zonas", ""));
    zones.forEach((zone) => select.add(new Option(`Zona ${zone}`, zone)));
    if (state.analysisZone && !zones.includes(state.analysisZone)) state.analysisZone = "";
    select.value = state.analysisZone;
    select.disabled = !zones.length;
  }

  function scopeLabel() {
    let label;
    if (state.analysisScope === ALL_LISTS) label = `todas as listas (${state.lists.length})`;
    const scopedCoordinator = coordinatorKeyFromScope(state.analysisScope);
    if (!label && scopedCoordinator !== null) {
      const group = coordinatorGroups().find((item) => item.key === scopedCoordinator);
      if (group) {
        const suffix = group.lists.length === 1 ? "1 liderança" : `${group.lists.length} lideranças`;
        label = `Coordenador ${group.name} — ${suffix}`;
      }
    }
    if (!label) {
      const list = state.lists.find((item) => item.id === state.analysisScope);
      label = list ? `Liderança ${list.name} — Coord. ${coordinatorDisplay(list.coordinator)}` : "lista selecionada";
    }
    return state.analysisZone ? `${label} • Zona ${state.analysisZone}` : label;
  }

  function renderAnalysis() {
    if (state.view !== "analysis") { state.analysis = null; return; }
    window.CrmWorkspace?.renderRegistrationSummary?.();
    const ready = Boolean(state.candidate && state.city && state.lists.length);
    el("analysis-empty").hidden = ready;
    el("analysis-content").hidden = !ready;
    if (!ready) {
      state.analysis = null;
      return;
    }

    const analysis = analyzeRecords(scopeRecords());
    state.analysis = analysis;
    const candidate = state.candidate;
    el("analysis-context").textContent = `${candidate[2]} (${candidate[1]}) × ${scopeLabel()}`;
    el("analysis-rate").textContent = fmtPercent(analysis.rate);
    el("rate-ring-label").textContent = fmtPercent(analysis.rate);
    el("rate-ring").style.setProperty("--rate", `${Math.max(0, Math.min(360, analysis.rate * 360))}deg`);
    el("analysis-valid").textContent = fmtInt(analysis.valid);
    el("analysis-hits").textContent = fmtInt(analysis.hits);
    el("analysis-unmatched").textContent = fmtInt(analysis.unmatched);
    el("analysis-in-voting-sections").textContent = fmtInt(analysis.inVotingSections);
    el("analysis-votes-listed").textContent = fmtInt(analysis.votesInListedSections);

    renderCoordinatorComparison();
    renderComparison();
    renderSectionAnalysis(analysis);
    renderPeopleAnalysis(analysis);
  }

  function rateClass(rate) {
    if (rate >= 0.75) return "good";
    if (rate > 0) return "medium";
    return "zero";
  }

  function renderCoordinatorComparison() {
    const rows = coordinatorGroups()
      .map((group) => {
        const records = group.lists.flatMap((list) => list.records.map((record) => ({
          ...record,
          _listName: list.name,
          _coordinator: group.name,
        })));
        return { group, analysis: analyzeRecords(recordsForSelectedZone(records)) };
      })
      .sort((a, b) => b.analysis.rate - a.analysis.rate || b.analysis.valid - a.analysis.valid)
      .map(({ group, analysis }) => {
        const tr = document.createElement("tr");
        tr.append(
          createCell(group.name),
          createCell(fmtInt(group.lists.length), "number-cell"),
          createCell(fmtInt(analysis.total), "number-cell"),
          createCell(fmtInt(analysis.valid), "number-cell"),
          createCell(fmtInt(analysis.hits), "number-cell")
        );
        const rateCell = createCell("", "number-cell");
        const pill = document.createElement("span");
        pill.className = `rate-pill ${rateClass(analysis.rate)}`;
        pill.textContent = fmtPercent(analysis.rate);
        rateCell.appendChild(pill);
        tr.appendChild(rateCell);
        return tr;
      });
    replaceTableBody(el("coordinator-compare-body"), rows);
    el("coordinator-compare-panel").hidden = !state.lists.length;
  }

  function renderComparison() {
    const rows = state.lists
      .map((list) => ({
        list,
        analysis: analyzeRecords(recordsForSelectedZone(list.records.map((record) => ({
          ...record,
          _listName: list.name,
          _coordinator: coordinatorDisplay(list.coordinator),
        })))),
      }))
      .sort((a, b) => b.analysis.rate - a.analysis.rate || b.analysis.valid - a.analysis.valid)
      .map(({ list, analysis }) => {
        const tr = document.createElement("tr");
        tr.append(
          createCell(coordinatorDisplay(list.coordinator)),
          createCell(list.name),
          createCell(fmtInt(analysis.total), "number-cell"),
          createCell(fmtInt(analysis.valid), "number-cell"),
          createCell(fmtInt(analysis.hits), "number-cell")
        );
        const rateCell = createCell("", "number-cell");
        const pill = document.createElement("span");
        pill.className = `rate-pill ${rateClass(analysis.rate)}`;
        pill.textContent = fmtPercent(analysis.rate);
        rateCell.appendChild(pill);
        tr.appendChild(rateCell);
        return tr;
      });
    replaceTableBody(el("compare-body"), rows);
    el("compare-panel").hidden = state.lists.length < 2;
  }

  function renderSectionAnalysis(analysis) {
    const limited = analysis.sectionRows.slice(0, MAX_RENDER_ROWS);
    const rows = limited.map((item) => {
      const tr = document.createElement("tr");
      tr.append(
        createCell(item.zone),
        createCell(item.section),
        createCell(item.place || "—"),
        createCell(fmtInt(item.records.length), "number-cell"),
        createCell(fmtInt(item.votes), "number-cell"),
        createCell(fmtInt(item.hits), "number-cell")
      );
      const rateCell = createCell("", "number-cell");
      const pill = document.createElement("span");
      pill.className = `rate-pill ${rateClass(item.rate)}`;
      pill.textContent = fmtPercent(item.rate);
      rateCell.appendChild(pill);
      tr.appendChild(rateCell);
      return tr;
    });
    replaceTableBody(el("section-analysis-body"), rows);
    el("section-analysis-note").textContent = analysis.sectionRows.length > limited.length
      ? `Mostrando ${fmtInt(limited.length)} de ${fmtInt(analysis.sectionRows.length)} seções`
      : `${fmtInt(analysis.sectionRows.length)} seção(ões)`;
  }

  function renderPeopleAnalysis(analysis) {
    const limited = analysis.peopleRows.slice(0, MAX_RENDER_ROWS);
    const rows = limited.map((item) => {
      const tr = document.createElement("tr");
      tr.append(
        createCell(item._coordinator || "Não informado"),
        createCell(item._listName || scopeLabel()),
        createCell(item.name || "—"),
        createCell(item.title || "—"),
        createCell(item.zone),
        createCell(item.section),
        createCell(fmtInt(item.votes), "number-cell")
      );
      const readingCell = createCell("");
      const pill = document.createElement("span");
      pill.className = `status-pill ${item.readingClass}`;
      pill.textContent = item.reading;
      readingCell.appendChild(pill);
      tr.appendChild(readingCell);
      return tr;
    });
    replaceTableBody(el("people-analysis-body"), rows);
    const excluded = analysis.incomplete + analysis.duplicates;
    const parts = [];
    if (analysis.peopleRows.length > limited.length) parts.push(`prévia de ${fmtInt(limited.length)} entre ${fmtInt(analysis.peopleRows.length)} válidos`);
    if (excluded) parts.push(`${fmtInt(analysis.incomplete)} incompleto(s) e ${fmtInt(analysis.duplicates)} título(s) repetido(s) fora do cálculo`);
    el("people-analysis-note").textContent = parts.length ? `Observação: ${parts.join("; ")}.` : "Todos os cadastros válidos estão exibidos.";
  }

  function detectDelimiter(text) {
    const sample = String(text).split(/\r?\n/).find((line) => line.trim()) || "";
    const candidates = ["\t", ";", ","];
    let best = ";";
    let bestCount = -1;
    candidates.forEach((delimiter) => {
      let count = 0;
      let inQuotes = false;
      for (let i = 0; i < sample.length; i += 1) {
        if (sample[i] === '"') inQuotes = !inQuotes;
        else if (!inQuotes && sample[i] === delimiter) count += 1;
      }
      if (count > bestCount) {
        best = delimiter;
        bestCount = count;
      }
    });
    return best;
  }

  function parseDelimitedText(text) {
    const delimiter = detectDelimiter(text);
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    const source = String(text).replace(/^\uFEFF/, "");
    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (char === '"') {
        if (inQuotes && source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        row.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && source[i + 1] === "\n") i += 1;
        row.push(field);
        if (row.some((item) => String(item).trim())) rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
    row.push(field);
    if (row.some((item) => String(item).trim())) rows.push(row);
    return rows;
  }

  function headerRole(value) {
    const header = normalizeHeader(value);
    if (!header) return "";
    if (header === "id" || header === "iddocadastro") return "id";
    if (header.includes("coordenador") || header.includes("coordenadora") || header === "coordenacao" || header === "coord") return "coordinator";
    if (header.includes("lideranca") || header === "lider" || header === "responsavel") return "leader";
    if (header === "mae" || header === "nomedamae" || header === "filiacaomaterna") return "mother";
    if (header === "cpf") return "cpf";
    if (header === "rg" || header === "identidade") return "rg";
    if (header === "nascimento" || header === "datadenascimento" || header === "datanascimento") return "birth";
    if (header === "observacoes" || header === "observacao" || header === "notas") return "notes";
    if (header === "fonte" || header === "origem" || header === "arquivofonte") return "source";
    if (header === "nome" || header.includes("nomecompleto") || header === "eleitor" || header === "eleitora") return "name";
    if (header.includes("titulo") || header === "inscricaoeleitoral") return "title";
    if (header === "zona" || header === "nrzona" || header === "zonaeleitoral") return "zone";
    if (header.includes("secao") || header === "nrsecao") return "section";
    if (header.includes("contato") || header.includes("telefone") || header.includes("whatsapp") || header === "celular") return "contact";
    return "";
  }

  function importBirth(value) {
    const text = String(value ?? "").trim();
    if (!text || /^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text.slice(0, 10);
    const local = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (local) return `${local[3]}-${local[2]}-${local[1]}`;
    if (/^\d+(?:\.\d+)?$/.test(text) && Number(text) >= 1 && Number(text) <= 73050) {
      return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(text)) * 86400000).toISOString().slice(0, 10);
    }
    return text;
  }

  function locateHeader(matrix) {
    const maxRows = Math.min(matrix.length, 30);
    let best = null;
    for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
      const mapping = {};
      matrix[rowIndex].forEach((value, columnIndex) => {
        const role = headerRole(value);
        if (role && mapping[role] === undefined) mapping[role] = columnIndex;
      });
      const score = Object.keys(mapping).length;
      const qualifies = mapping.zone !== undefined && mapping.section !== undefined && (mapping.name !== undefined || mapping.title !== undefined);
      if (qualifies && (!best || score > best.score)) best = { rowIndex, mapping, score };
    }
    return best;
  }

  function matrixToGroups(matrix, fallbackName, fallbackCoordinator = "") {
    const header = locateHeader(matrix);
    if (!header) {
      throw new Error("Não encontrei as colunas Zona e Seção. Confira os títulos da planilha ou baixe o modelo.");
    }
    const groups = new Map();
    const read = (row, role) => header.mapping[role] === undefined ? "" : String(row[header.mapping[role]] ?? "").trim();
    const defaultName = String(fallbackName || "Nova lista").trim() || "Nova lista";
    const defaultCoordinator = String(fallbackCoordinator || "").trim().slice(0, 100);

    matrix.slice(header.rowIndex + 1).forEach((row) => {
      const record = sanitizeRecord({
        id: read(row, "id"),
        name: read(row, "name"),
        title: read(row, "title"),
        zone: read(row, "zone"),
        section: read(row, "section"),
        contact: read(row, "contact"),
        mother: read(row, "mother"),
        cpf: read(row, "cpf"),
        rg: read(row, "rg"),
        birth: importBirth(read(row, "birth")),
        notes: read(row, "notes"),
        source: read(row, "source"),
      });
      const hasContent = Object.values(record).some(Boolean);
      if (!hasContent) return;
      const isSourceNote = !record.title && !record.zone && !record.section && !record.contact
        && /^(fonte|source)\b/.test(normalizeText(record.name));
      if (isSourceNote) return;
      const groupName = (read(row, "leader") || defaultName).slice(0, 80);
      const coordinator = (read(row, "coordinator") || defaultCoordinator).slice(0, 100);
      const groupKey = `${coordinatorKey(coordinator)}\u001f${normalizeText(groupName)}`;
      if (!groups.has(groupKey)) groups.set(groupKey, { name: groupName, coordinator, records: [] });
      groups.get(groupKey).records.push(record);
    });

    const total = [...groups.values()].reduce((sum, group) => sum + group.records.length, 0);
    if (!total) throw new Error("A planilha não possui cadastros abaixo do cabeçalho.");
    if (total > MAX_IMPORT_ROWS) throw new Error(`A importação excede o limite de ${fmtInt(MAX_IMPORT_ROWS)} cadastros por vez.`);
    return groups;
  }

  async function readTextFile(file) {
    const buffer = await file.arrayBuffer();
    let text = new TextDecoder("utf-8").decode(buffer);
    if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buffer);
    return parseDelimitedText(text);
  }

  function xmlDocument(xml, label) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error(`Arquivo XLSX inválido (${label}).`);
    return doc;
  }

  function resolveZipPath(basePath, target) {
    if (target.startsWith("/")) return target.slice(1);
    const parts = basePath.split("/");
    parts.pop();
    target.split("/").forEach((part) => {
      if (!part || part === ".") return;
      if (part === "..") parts.pop();
      else parts.push(part);
    });
    return parts.join("/");
  }

  function columnIndex(reference) {
    const letters = String(reference || "").match(/^[A-Z]+/i)?.[0]?.toUpperCase() || "A";
    let value = 0;
    for (const letter of letters) value = value * 26 + letter.charCodeAt(0) - 64;
    return value - 1;
  }

  function parseWorksheet(xml, sharedStrings) {
    const doc = xmlDocument(xml, "planilha");
    const rows = [];
    const rowNodes = [...doc.getElementsByTagNameNS("*", "row")];
    rowNodes.forEach((rowNode) => {
      const row = [];
      const cells = [...rowNode.getElementsByTagNameNS("*", "c")];
      cells.forEach((cell) => {
        const index = columnIndex(cell.getAttribute("r"));
        const type = cell.getAttribute("t") || "n";
        const valueNode = cell.getElementsByTagNameNS("*", "v")[0];
        let value = valueNode?.textContent ?? "";
        if (type === "s") value = sharedStrings[Number(value)] ?? "";
        else if (type === "inlineStr") value = [...cell.getElementsByTagNameNS("*", "t")].map((node) => node.textContent || "").join("");
        else if (type === "b") value = value === "1" ? "VERDADEIRO" : "FALSO";
        row[index] = value;
      });
      rows.push(row);
    });
    return rows;
  }

  async function readXlsxFile(file) {
    if (!window.JSZip) throw new Error("O leitor de XLSX não foi carregado. Recarregue a página ou use CSV.");
    const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
    const workbookFile = zip.file("xl/workbook.xml");
    const relsFile = zip.file("xl/_rels/workbook.xml.rels");
    if (!workbookFile || !relsFile) throw new Error("O arquivo não parece ser uma planilha XLSX válida.");
    const workbook = xmlDocument(await workbookFile.async("string"), "pasta de trabalho");
    const rels = xmlDocument(await relsFile.async("string"), "relações");
    const relationTargets = new Map(
      [...rels.getElementsByTagNameNS("*", "Relationship")].map((relation) => [
        relation.getAttribute("Id"),
        relation.getAttribute("Target"),
      ])
    );

    let sharedStrings = [];
    const sharedFile = zip.file("xl/sharedStrings.xml");
    if (sharedFile) {
      const sharedDoc = xmlDocument(await sharedFile.async("string"), "textos compartilhados");
      sharedStrings = [...sharedDoc.getElementsByTagNameNS("*", "si")].map((item) =>
        [...item.getElementsByTagNameNS("*", "t")].map((node) => node.textContent || "").join("")
      );
    }

    const sheets = [...workbook.getElementsByTagNameNS("*", "sheet")];
    let firstMatrix = null;
    for (const sheet of sheets) {
      const relationId = sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || sheet.getAttribute("r:id");
      const target = relationTargets.get(relationId);
      if (!target) continue;
      const path = resolveZipPath("xl/workbook.xml", target);
      const sheetFile = zip.file(path);
      if (!sheetFile) continue;
      const matrix = parseWorksheet(await sheetFile.async("string"), sharedStrings);
      if (!firstMatrix) firstMatrix = matrix;
      if (locateHeader(matrix)) return matrix;
    }
    if (firstMatrix) return firstMatrix;
    throw new Error("Nenhuma aba legível foi encontrada no arquivo XLSX.");
  }

  function fileStem(filename) {
    return String(filename || "Nova lista").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  }

  function addImportedGroups(groups) {
    let importedLists = 0;
    let importedRecords = 0;
    for (const group of groups.values()) {
      const list = {
        id: uid(),
        name: uniqueListName(group.name),
        coordinator: String(group.coordinator || "").trim().slice(0, 100),
        createdAt: new Date().toISOString(),
        records: group.records.map(sanitizeRecord),
      };
      state.lists.push(list);
      state.activeListId = list.id;
      importedLists += 1;
      importedRecords += list.records.length;
    }
    state.analysisScope = state.lists.length === 1 ? state.activeListId : ALL_LISTS;
    persistLists();
    renderLists();
    return { importedLists, importedRecords };
  }

  async function importFiles(files) {
    if (!files.length) return;
    const baseName = el("import-list-name").value.trim();
    const baseCoordinator = el("import-coordinator-name").value.trim();
    let listCount = 0;
    let recordCount = 0;
    for (const file of files) {
      try {
        const lower = file.name.toLowerCase();
        const matrix = lower.endsWith(".xlsx") ? await readXlsxFile(file) : await readTextFile(file);
        const groups = matrixToGroups(matrix, baseName || fileStem(file.name), baseCoordinator);
        const result = addImportedGroups(groups);
        listCount += result.importedLists;
        recordCount += result.importedRecords;
      } catch (error) {
        console.error(error);
        toast(`${file.name}: ${error.message}`, "error");
      }
    }
    if (recordCount) {
      toast(`${fmtInt(recordCount)} cadastro(s) importado(s) em ${fmtInt(listCount)} lista(s).`);
      el("import-list-name").value = "";
    }
    el("file-input").value = "";
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function downloadText(filename, text, type = "text/csv;charset=utf-8") {
    const blob = new Blob(["\uFEFF", text], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function exportLists() {
    if (!state.lists.length) return;
    const lines = [["Coordenador", "Liderança", "Nome", "Título", "Zona", "Seção", "Contato"]];
    state.lists.forEach((list) => list.records.forEach((record) => {
      lines.push([list.coordinator, list.name, record.name, record.title, record.zone, record.section, record.contact]);
    }));
    downloadText("listas_de_liderancas.csv", lines.map((row) => row.map(csvEscape).join(";")).join("\r\n"));
    toast("Listas exportadas. Guarde o arquivo para usar em outro aparelho.");
  }

  function exportModel() {
    const rows = [
      ["Coordenador", "Liderança", "Nome", "Título", "Zona", "Seção", "Contato"],
      ["RESPONSÁVEL DE EXEMPLO", "LIDERANÇA DE EXEMPLO", "Nome da pessoa", "000000000000", "1", "1", "(00) 00000-0000"],
    ];
    downloadText("modelo_listas_liderancas.csv", rows.map((row) => row.map(csvEscape).join(";")).join("\r\n"));
  }

  function exportTerritoryReport() {
    if (!state.candidate || !state.city) return;
    const candidate = state.candidate;
    const report = buildTerritoryReport(filteredTerritoryRows());
    const rows = [
      [`RELATÓRIO TERRITORIAL DA VOTAÇÃO OFICIAL — ${officeConfig().label.toUpperCase()} — ELEIÇÃO 2026`],
      ["Município", state.city.m[1]],
      ["Cargo", officeConfig().label],
      ["Candidato", candidate[2]],
      ["Nome de urna", candidateBallotName(candidate) || "Não disponível nesta consulta"],
      ["Número", candidate[1]],
      ["Zona", state.territoryZone ? `Zona ${state.territoryZone}` : "Todas as zonas"],
      ["Seção", state.territorySection ? `Seção ${state.territorySection}` : "Todas as seções"],
      ["Locais de votação selecionados", territorySchoolsLabel()],
      ["Bairro", state.territoryNeighborhood || "Todos os bairros"],
      ["Votos no filtro", report.totalVotes],
      ["Seções no filtro", report.sectionRows.length],
      [],
      ["VOTAÇÃO POR ZONA"],
      ["Zona", "Seções no filtro", "Votos"],
      ...report.zoneRows.map((item) => [item.zone, item.sections.size, item.votes]),
      [],
      ["VOTAÇÃO POR BAIRRO"],
      ["Bairro", "Locais", "Seções no filtro", "Votos"],
      ...report.neighborhoodRows.map((item) => [item.neighborhood, item.places.size, item.sections.size, item.votes]),
      [],
      ["VOTAÇÃO POR LOCAL DE VOTAÇÃO"],
      ["Local / escola", "Bairro", "Zonas", "Seções no filtro", "Votos"],
      ...report.placeRows.map((item) => [
        item.place,
        item.neighborhood,
        [...item.zones].sort((a, b) => Number(a) - Number(b)).join(", "),
        item.sections.size,
        item.votes,
      ]),
      [],
      ["VOTAÇÃO POR SEÇÃO"],
      ["Zona", "Seção", "Local / escola", "Bairro", "Votos"],
      ...report.sectionRows.map((item) => [item.zone, item.section, item.place, item.neighborhood, item.votes]),
    ];
    const safeCandidate = normalizeText(candidate[2]).replace(/\s+/g, "_") || candidate[1];
    const safeCity = normalizeText(state.city.m[1]).replace(/\s+/g, "_") || state.city.m[0];
    downloadText(
      `relatorio_territorial_${state.office}_${safeCandidate}_${safeCity}_2026.csv`,
      rows.map((row) => row.map(csvEscape).join(";")).join("\r\n")
    );
    toast("Relatório territorial exportado em CSV.");
  }

  function printTerritoryReport() {
    if (!state.candidate || !state.city) return;
    printWorkspace("print-territory");
  }

  function exportCandidateXray() {
    if (!state.candidate || !state.city || !state.statewide) return;
    const candidate = state.candidate;
    const summary = statewideCandidate(candidate);
    if (!summary) return;
    const municipalities = municipalityMetadata();
    const cities = filteredMunicipalities();
    const allowed = new Set(cities.map((city) => String(city[0])));
    const scopedVotes = (summary[6] || []).filter(([code]) => allowed.has(String(code)));
    const candidateTotal = scopedVotes.reduce((sum, [, votes]) => sum + Number(votes), 0);
    const previous = previousRegionalCandidate();
    const oldVotes = new Map((previous?.[6] || []).map(([code, votes]) => [String(code), votes]));
    const regionName = state.regional?.regions?.find((item) => String(item[0]) === state.regionFilter)?.[1];
    const top30 = scopedVotes.slice(0, 30).map(([code, votes], index) => {
      const city = municipalities.get(String(code)) || [code, `Município ${code}`, 0, 0, 0, 0];
      return [
        index + 1,
        city[1],
        votes,
        fmtPercent(votes / Math.max(1, candidateTotal)),
        fmtPercent(votes / Math.max(1, city[5])),
        previous ? oldVotes.get(String(code)) || 0 : "",
        window.ElectoralScope.change(votes, previous ? oldVotes.get(String(code)) || 0 : null).label,
      ];
    });
    const top30Votes = top30.reduce((sum, row) => sum + Number(row[2] || 0), 0);
    const rows = [
      [`RAIO-X DO CANDIDATO — ${officeConfig().label.toUpperCase()} — ELEIÇÃO 2026`],
      ["Candidato", candidate[2]],
      ["Nome de urna", candidateBallotName(candidate) || "Não disponível nesta consulta"],
      ["Número", candidate[1]],
      ["Recorte consultado", state.city.m[1]],
      ["Filtro regional", regionName || "Todas as regiões"],
      ["Votos no recorte do Raio-X", candidateTotal],
      ["Correspondência em 2022", previous ? previous[2] : "Não confirmada; somente 2026"],
      ["Votos no Pará", summary[3]],
      ["Ranking estadual", summary[4]],
      ["Índice estadual", fmtPercent(summary[3] / Math.max(1, state.statewide.totalVotes))],
      ["Municípios no filtro", cities.length],
      ["Municípios com votos", municipalitiesWithVotes(scopedVotes, cities)],
      ["Critério da contagem municipal", "Municípios distintos com pelo menos um voto na base ativa de 2026"],
      ["Concentração Top 30", fmtPercent(top30Votes / Math.max(1, candidateTotal))],
      ["Peso do recorte consultado no Pará", fmtPercent(candidate[3] / Math.max(1, summary[3]))],
      [],
      ["TOP 30 DE VOTAÇÃO POR MUNICÍPIO"],
      ["Posição", "Município", "Votos 2026", "% dos votos do candidato no filtro", "Índice municipal", "Votos 2022", "Variação"],
      ...top30,
    ];
    const safeCandidate = normalizeText(candidate[2]).replace(/\s+/g, "_") || candidate[1];
    downloadText(
      `raio_x_${state.office}_${safeCandidate}_2026.csv`,
      rows.map((row) => row.map(csvEscape).join(";")).join("\r\n")
    );
    toast("Raio-X exportado em CSV.");
  }

  function exportRegionalReport() {
    if (!state.candidate || !state.city || !state.regional) return;
    const report = regionalReportData();
    if (!report.rows.length) return;
    const region = state.regional.regions.find((item) => String(item[0]) === String(state.regionalRegion));
    const municipalityRows = regionalMunicipalityRows(state.regionalRegion);
    const municipalityTotal = municipalityRows.reduce((sum, item) => sum + item.votes, 0);
    const visibleRows = state.regionFilter ? report.rows.filter((item) => item.id === state.regionFilter) : report.rows;
    const rows = [
      [`RELATÓRIO DAS 13 REGIÕES — ${officeConfig().label.toUpperCase()} — ELEIÇÃO 2026`],
      ["Candidato", state.candidate[2]],
      ["Nome de urna", candidateBallotName(state.candidate) || "Não disponível nesta consulta"],
      ["Número", state.candidate[1]],
      ["Classificação territorial", state.regional.regionType],
      ["Filtro regional", state.regionFilter ? region?.[1] : "Todas as 13 regiões"],
      ["Regiões no filtro", visibleRows.length],
      ["Municípios no filtro", visibleRows.reduce((sum, item) => sum + item.municipalities, 0)],
      ["Correspondência em 2022", report.previous ? `${report.previous[1]} — ${report.previous[2]}` : "Não localizada pelo mesmo nome completo"],
      ["Votos estaduais 2026", report.currentTotal],
      ["Votos estaduais 2022", report.previous ? report.previousTotal : ""],
      ["Fonte regional", state.regional.sources?.regions || "Divisão territorial do Pará"],
      ["Fonte 2026", state.regional.sources?.current || "TSE"],
      ["Fonte 2022", state.regional.sources?.previous || "TSE"],
      [],
      ["RESULTADOS PELAS 13 REGIÕES DO PARÁ"],
      ["Região", "Municípios", "Votos 2026", "% dos votos do candidato", "Índice regional", "Posição regional", "Votos 2022", "Variação 2026 × 2022"],
      ...visibleRows.map((item) => [
        item.name,
        item.municipalities,
        item.currentVotes,
        fmtPercent(item.currentVotes / Math.max(1, report.currentTotal)),
        fmtPercent(item.currentVotes / Math.max(1, item.currentTotal)),
        item.currentRank,
        report.previous ? item.previousVotes : "",
        window.ElectoralScope.change(item.currentVotes, item.previousVotes).label,
      ]),
      [],
      [`MUNICÍPIOS DA REGIÃO ${String(region?.[1] || "").toUpperCase()}`],
      ["Posição", "Município", "Votos 2026", "% da votação regional do candidato", "Votos 2022", "Variação"],
      ...municipalityRows.map((item, index) => [
        index + 1,
        item.name,
        item.votes,
        fmtPercent(item.votes / Math.max(1, municipalityTotal)),
        item.previousVotes === null ? "" : item.previousVotes,
        window.ElectoralScope.change(item.votes, item.previousVotes).label,
      ]),
    ];
    const safeCandidate = normalizeText(state.candidate[2]).replace(/\s+/g, "_") || state.candidate[1];
    downloadText(
      `relatorio_regional_${state.office}_${safeCandidate}_2026.csv`,
      rows.map((row) => row.map(csvEscape).join(";")).join("\r\n")
    );
    toast("Relatório regional exportado em CSV.");
  }

  function changeCandidateQuery(index, event) {
    const candidateId = event.target.value;
    if(candidateId&&!state.city?.c.some(c=>String(c[0])===String(candidateId))){toast("Selecione um candidato do cargo ativo.","error");event.target.value=state.compareCandidateIds[index]||"";return;}
    const duplicate = candidateId && state.compareCandidateIds.some((id, otherIndex) => (
      otherIndex !== index && String(id) === String(candidateId)
    ));
    if (duplicate && window.CandidateApuration.getMode() !== "both") {
      state.compareCandidateIds[1-index] = "";
    } else if (duplicate) {
      toast("Este candidato já está selecionado no outro campo.", "error");
      event.target.value = state.compareCandidateIds[index] || "";
      return;
    }
    state.compareCandidateIds[index] = candidateId;
    renderCandidateComparison();
  }

  function exportCandidateComparison() {
    window.CandidateApuration.csv();
  }

  function printCandidateSection(className) {
    if (!state.candidate || !state.city) return;
    printWorkspace(className);
  }

  function reportQuerySignature() {
    return JSON.stringify([state.indexRequest,window.PlatformTools?.manifests.get(state.office)?.active,state.office,state.view,state.cityCode,state.candidate?.[0],state.regionFilter,state.regionalRegion,
      state.territoryZone,state.territorySection,state.territoryPlace,state.territoryPlaces,state.territoryNeighborhood,state.compareCandidateIds,state.analysisScope,state.analysisZone,state.completeReportLayout,
      state.manualMunicipalityCodes,state.selectionMunicipality,state.selectionZone,state.selectionPlaceSearch,state.selectionPlace,state.selectionPlaces]);
  }

  function completeCandidateReport() {
    const grouped = state.completeReportLayout === "regions";
    const report = pdfReport("overview");
    const previous = previousRegionalCandidate(), history = previousTerritoryRows();
    report.title = "Relatório completo do candidato";
    report.compactIndicators = true;
    report.meta = report.meta.filter(([label]) => !["Fonte do nome de urna", "Participação histórica"].includes(label));
    report.meta.push(["Conteúdo", "Regiões, municípios e zonas."], ["Organização", grouped ? "Separado por regiões" : "Consolidado"]);
    report.note = (previous ? "2026 × 2022: correspondência histórica única confirmada no mesmo cargo e turno. Verde: aumento; vermelho: queda. Com zero votos em 2022, não há base percentual." : "Somente 2026: sem correspondência histórica única confirmada neste cargo.") + " Azul: 2026; cinza: 2022. As barras usam a mesma escala em cada tabela. % mun.: participação nos votos nominais do município. Todos os municípios do recorte são incluídos, mesmo sem votos.";
    if (previous && !history) report.note += " Histórico por zona indisponível nesta consulta.";
    const codes = new Set(scopeMunicipalityCodes()), names = municipalityMetadata();
    const summary = statewideCandidate(state.candidate), votes = new Map(summary?.[6] || []), oldVotes = new Map(previous?.[6] || []);
    const municipalityRegions = new Map(state.regional.municipalities.map(row => [String(row[0]), String(row[2])]));
    const regionNames = new Map(state.regional.regions.map(row => [String(row[0]), row[1]]));
    const municipalities = [...codes].map(code => ({code, regionId: municipalityRegions.get(code), name: names.get(code)?.[1] || code,
      region: regionNames.get(municipalityRegions.get(code)) || "Região não informada", votes: Number(votes.get(code)) || 0,
      nominal: Number(names.get(code)?.[5]) || 0, previousVotes: previous ? Number(oldVotes.get(code)) || 0 : null,
    })).sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name, "pt-BR"));
    const regions = new Map();
    municipalities.forEach(row => {
      if (!regions.has(row.regionId)) regions.set(row.regionId, {id: row.regionId, name: row.region, votes: 0, nominal: 0, previousVotes: previous ? 0 : null, municipalities: 0});
      const region = regions.get(row.regionId);region.votes += row.votes;region.nominal += row.nominal;region.municipalities++;
      if (previous) region.previousVotes += row.previousVotes;
    });
    const regionalRows = [...regions.values()].sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name, "pt-BR"));
    const sectionVotes = new Map(state.candidate[5]);
    const rows = state.city.s.map((row, i) => ({municipalityCode: String(row[4] || state.city.m[0]), zone: String(row[0]), votes: Number(sectionVotes.get(i)) || 0}));
    const zoneRows = (current, prior) => {
      const map = new Map();
      const get = zone => {if (!map.has(zone)) map.set(zone, {name: `Zona ${zone}`, zone, votes: 0, previousVotes: prior ? 0 : null, municipalities: new Set()});return map.get(zone);};
      current.forEach(row => {const zone = get(row.zone);zone.votes += row.votes;zone.municipalities.add(row.municipalityCode);});
      (prior || []).forEach(row => {const zone = get(row.zone);zone.previousVotes += row.votes;zone.municipalities.add(row.municipalityCode);});
      return [...map.values()].sort((a, b) => Number(a.zone) - Number(b.zone));
    };
    const zones = zoneRows(rows, history), priorTotal = historicalScopeVotes();
    report.indicators = [
      {label: "Votos 2026", value: fmtInt(state.candidate[3])},
      {label: "Participação no recorte", value: fmtPercent(state.candidate[3] / Math.max(1, state.city.x[1])), note: "dos votos nominais do cargo"},
      {label: "Municípios com votos", value: fmtInt(municipalities.filter(row => row.votes > 0).length), note: `de ${fmtInt(codes.size)} municípios`},
      ...(previous ? [{label: "Votos 2022", value: fmtInt(priorTotal)}, {label: "Variação de votos", value: window.ElectoralScope.change(state.candidate[3], priorTotal).label}] : []),
      {label: "Zonas 2026", value: fmtInt(new Set(rows.map(row => row.zone)).size)},
    ];
    report.blocks = [];
    const old = value => value == null ? "—" : fmtInt(value);
    const change = row => row.previousVotes == null ? "—" : window.ElectoralScope.change(row.votes, row.previousVotes).label;
    const table = (title, headers, cells, values, widths) => report.blocks.push({type: "table", title,
      headers: [...headers, values.some(row => row.previousVotes != null) ? "2026 / 2022" : "Gráfico 2026"],
      rows: cells.map(row => [...row, ""]), widths: [...widths, 1.5], compact: true,
      comparison: values.map(row => ({current: row.votes, previous: row.previousVotes})),
    });
    const municipalTable = (title, list, includeRegion = false) => table(title,
      ["Município", ...(includeRegion ? ["Região"] : []), "Votos 2026", "% mun.", "Votos 2022", "Variação"],
      list.map(row => [row.name, ...(includeRegion ? [row.region] : []), fmtInt(row.votes), fmtPercent(row.votes / Math.max(1, row.nominal)), old(row.previousVotes), change(row)]),
      list, [2.7, ...(includeRegion ? [1.6] : []), .95, .95, .95, 1.2]);
    const zonesTable = (title, list) => table(title, ["Zona", "Municípios", "Votos 2026", "Votos 2022", "Variação"],
      list.map(row => [row.name, fmtInt(row.municipalities.size), fmtInt(row.votes), old(row.previousVotes), change(row)]), list, [1.2, 1.1, 1.1, 1.1, 1.4]);
    table("Todas as regiões do recorte", ["Região", "Municípios", "Votos 2026", "Votos 2022", "Variação"],
      regionalRows.map(row => [row.name, fmtInt(row.municipalities), fmtInt(row.votes), old(row.previousVotes), change(row)]), regionalRows, [2.4, 1.1, 1.1, 1.1, 1.3]);
    if (grouped) {
      [...regionalRows].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).forEach((region, i) => {
        const regionalMunicipalities = municipalities.filter(row => row.regionId === region.id), regionalCodes = new Set(regionalMunicipalities.map(row => row.code));
        const regionalZones = zoneRows(rows.filter(row => regionalCodes.has(row.municipalityCode)), history ? history.filter(row => regionalCodes.has(row.municipalityCode)) : null);
        report.blocks.push({type: "section", compact: true, title: `${i + 1}. Região: ${region.name}`});
        report.blocks.push({type: "indicators", compact: true, items: [
          {label: "Votos 2026 na região", value: fmtInt(region.votes), note: previous ? "2022: " + fmtInt(region.previousVotes) : "sem histórico confirmado"},
          {label: previous ? "Variação de votos" : "Participação regional", value: previous ? change(region) : fmtPercent(region.votes / Math.max(1, region.nominal))},
          {label: "Municípios com votos", value: fmtInt(regionalMunicipalities.filter(row => row.votes > 0).length), note: `de ${fmtInt(regionalMunicipalities.length)} municípios`},
        ]});
        municipalTable("Todos os municípios • " + region.name, regionalMunicipalities);
        zonesTable("Todas as zonas do recorte • " + region.name, regionalZones);
      });
    } else {
      municipalTable("Todos os municípios do recorte", municipalities, true);
      zonesTable("Todas as zonas do recorte", zones);
    }
    return report;
  }

  function pdfReport(view) {
    if (state.city?.isManualSelection) return window.MunicipalitySelection.report({result:manualSelectionData(),candidate:state.candidate,
      office:officeConfig().label,ballotName:candidateBallotName(state.candidate),source:state.index.source,
      version:window.PlatformTools.manifests.get(state.office)?.active || "bundled",places:view === "manual_places"});
    if (view.startsWith("comparison")) return window.ComparisonReport.build({data:comparisonDataset(view==="comparison_complete"),mode:view==="comparison_top30"?"top30":view==="comparison_complete"?"complete":"scope",layout:state.completeReportLayout});
    const annotate=report=>{const c=window.Results2026?.record(state.candidate,state.office);if(c)report.meta.push(["Partido e situação oficial 2026",c.party+" • "+c.status]);return report;};
    if (view === "complete") return annotate(completeCandidateReport());
    if (view === "xray") return annotate(window.MunicipalReport.build({office:state.office,candidate:state.candidate,index:state.index,statewide:state.statewide,regional:state.regional,cityCodes:filteredMunicipalities().map(c=>String(c[0])),ballotName:candidateBallotName(state.candidate)}));
    const previous = previousRegionalCandidate(), oldVotes = historicalScopeVotes();
    const source = state.index.provenance?.appliedAt
      ? `${state.index.source} • Atualizada em ${new Date(state.index.provenance.appliedAt).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}` : state.index.source;
    const regionName = state.regional.regions.find(r=>r[0]===state.regionFilter)?.[1];
    const report = {title:VIEWS[view]?.[0]||"Relatório eleitoral",subtitle:`${state.candidate[1]} — ${state.candidate[2]}`,
      generatedAt:new Date().toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}),meta:[
        ["Cargo",officeConfig().label],["Eleição","2026 • 1º turno • Pará"],["Região",regionName||"Todas as 13 regiões"],
        ["Município / recorte",state.city.m[1]],["Fonte 2026",source],
      ],indicators:[],blocks:[],note:previous
        ? `Comparação de votos com 2022 pelo nome normalizado único nas duas bases, mesmo cargo e turno. Nome em 2022: ${previous[2]}. Variação (%) = (votos de 2026 − votos de 2022) ÷ votos de 2022 × 100. Mudança de participação usa pontos percentuais (p.p.).`
        : "Somente 2026: não há correspondência única do nome em 2022 neste cargo. Isso não comprova que seja a primeira candidatura."};
    if(view!=="comparison") {
      report.meta.push(["Nome de urna",candidateBallotName(state.candidate)||"Não disponível nesta consulta"]);
      if(candidateBallotName(state.candidate))report.meta.push(["Fonte do nome de urna","TSE — Candidatos 2026 • "+window.CandidateIdentity.source(state.office).generation]);
    }
    if(previous)report.meta.push(["Fonte 2022",state.regional.sources.previous]);
    const metric=(label,value,note)=>({label,value,note});
    const yearValues=(current,prior)=>[{label:"2026",value:current,color:"#2358ed"},...(prior===null||prior===undefined?[]:[{label:"2022",value:prior,color:"#9cacbf"}])];
    const barRows=rows=>rows.map(r=>({label:r.name,values:yearValues(r.votes,r.previousVotes),change:r.previousVotes===null||r.previousVotes===undefined?"":window.ElectoralScope.change(r.votes,r.previousVotes).label}));
    const addTable=(title,headers,rows,widths)=>report.blocks.push({type:"table",title,headers,rows,widths});
    const addBars=(title,rows)=>report.blocks.push({type:"bars",title,rows:barRows(rows)});
    const addPies=(title,current,prior)=>{report.blocks.push({type:"pie",title:title+" • 2026",rows:current});if(prior)report.blocks.push({type:"pie",title:title+" • 2022",rows:prior});};
    const priorRows=previousTerritoryRows();
    if(view==="overview") {
      report.indicators=[metric("Votos no recorte",fmtInt(state.candidate[3])),metric("Posição",`${fmtInt(state.candidate[4])}º`),metric("Participação",fmtPercent(state.candidate[3]/Math.max(1,state.city.x[1])),"nos votos nominais do cargo")];
      if(previous)report.indicators.push(metric("Votos em 2022",fmtInt(oldVotes)),metric("Variação de votos",window.ElectoralScope.change(state.candidate[3],oldVotes).label));
      if(!el("candidate-history-share").hidden)report.meta.push(["Participação histórica",el("candidate-history-share").textContent]);
      const zones=new Map(),oldZones=new Map();candidateTerritoryRows().forEach(r=>zones.set(r.zone,(zones.get(r.zone)||0)+r.votes));(priorRows||[]).forEach(r=>oldZones.set(r.zone,(oldZones.get(r.zone)||0)+r.votes));
      const rows=uniqueSorted([...zones.keys(),...oldZones.keys()],true).map(zone=>({name:`Zona ${zone}`,votes:zones.get(zone)||0,previousVotes:priorRows?oldZones.get(zone)||0:null}));
      addBars("Votação por zona",rows);addTable("Resultados por zona",["Zona","Votos 2026","Votos 2022","Variação de votos"],rows.map(r=>[r.name,fmtInt(r.votes),r.previousVotes===null?"—":fmtInt(r.previousVotes),window.ElectoralScope.change(r.votes,r.previousVotes).label]),[2,1,1,1.4]);
    }
    if(view==="territory") {
      report.meta.push(["Zona",state.territoryZone||"Todas"],["Seção",state.territorySection||"Todas"],["Locais / escolas",territorySchoolsLabel()],["Bairro",state.territoryNeighborhood||"Todos"]);
      const data=buildTerritoryReport(filteredTerritoryRows());
      const schoolNames=new Set(selectedTerritorySchools().map(normalizeText));
      const filteredOld=priorRows?.filter(r=>(!state.territoryZone||r.zone===state.territoryZone)&&(!state.territorySection||r.section===state.territorySection)&&(!schoolNames.size||schoolNames.has(normalizeText(r.place))));
      const matchedSchools=new Set(filteredOld?.map(r=>normalizeText(r.place)));
      const historical=!state.territoryNeighborhood&&(!schoolNames.size||[...schoolNames].every(place=>matchedSchools.has(place)))?filteredOld:null;
      const oldZones=new Map(),oldPlaces=new Map(),oldSections=new Map();(historical||[]).forEach(r=>{oldZones.set(r.zone,(oldZones.get(r.zone)||0)+r.votes);oldPlaces.set(normalizeText(r.place),(oldPlaces.get(normalizeText(r.place))||0)+r.votes);oldSections.set(`${r.municipalityCode}|${r.zone}|${r.section}`,r);});
      report.note+=" Bairros: somente 2026. A comparação territorial usa os mesmos números de zona e seção e nomes correspondentes dos locais.";
      report.indicators=[metric("Votos no filtro",fmtInt(data.totalVotes)),metric("Seções no filtro",fmtInt(data.sectionRows.length)),metric("Locais de votação",fmtInt(data.placeRows.length))];
      if(historical)report.indicators.push(metric("Votos no filtro em 2022",fmtInt(historical.reduce((sum,r)=>sum+r.votes,0))));
      const currentZones=new Map(data.zoneRows.map(r=>[r.zone,r.votes]));
      const zoneRows=uniqueSorted([...currentZones.keys(),...oldZones.keys()],true).map(zone=>({name:`Zona ${zone}`,votes:currentZones.get(zone)||0,previousVotes:historical?oldZones.get(zone)||0:null}));
      addBars("Votação por zona",zoneRows);
      const slices=[...data.zoneRows].sort((a,b)=>b.votes-a.votes),keys=slices.slice(0,9).map(r=>r.zone);const currentPie=keys.map(k=>({label:`Zona ${k}`,value:currentZones.get(k)||0}));const oldPie=keys.map(k=>({label:`Zona ${k}`,value:oldZones.get(k)||0}));
      const restCurrent=slices.slice(9).reduce((sum,r)=>sum+r.votes,0),restOld=[...oldZones].filter(([k])=>!keys.includes(k)).reduce((sum,[,v])=>sum+v,0);if(restCurrent||restOld){currentPie.push({label:"Outras zonas",value:restCurrent});oldPie.push({label:"Outras zonas",value:restOld});}
      addPies("Distribuição dos votos por zona",currentPie,historical?oldPie:null);
      addBars("Locais com mais votos • Top 10",data.placeRows.slice(0,10).map(r=>({name:r.place,votes:r.votes,previousVotes:historical?(oldPlaces.get(normalizeText(r.place))??null):null})));
      addBars("Votação por bairro • 2026 • Top 10",data.neighborhoodRows.slice(0,10).map(r=>({name:r.neighborhood,votes:r.votes,previousVotes:null})));
      addTable("Todos os locais do filtro",["Local / escola","Bairro","Votos 2026","Votos 2022","Variação"],data.placeRows.map(r=>{const old=historical?(oldPlaces.get(normalizeText(r.place))??null):null;return [r.place,r.neighborhood,fmtInt(r.votes),old===null?"—":fmtInt(old),window.ElectoralScope.change(r.votes,old).label];}),[3,1.5,1,1,1.2]);
      addTable("Todos os bairros do filtro • 2026",["Bairro","Locais","Seções no filtro","Votos"],data.neighborhoodRows.map(r=>[r.neighborhood,fmtInt(r.places.size),fmtInt(r.sections.size),fmtInt(r.votes)]),[3,1,1.2,1]);
      addTable("Todas as seções do filtro",["Zona / seção","Local / escola","Bairro","Votos 2026","Votos 2022"],data.sectionRows.map(r=>{const old=oldSections.get(`${r.municipalityCode}|${r.zone}|${r.section}`);return [`${r.zone} / ${r.section}`,r.place,r.neighborhood,fmtInt(r.votes),old&&normalizeText(old.place)===normalizeText(r.place)?fmtInt(old.votes):"—"]; }),[1.1,3,1.5,1,1]);
    }
    if(view==="regional") {
      const data=regionalReportData(),rows=state.regionFilter?data.rows.filter(r=>r.id===state.regionFilter):data.rows;
      report.meta=report.meta.map(([label,value])=>[label,label==="Município / recorte"?(state.regionFilter?regionName+" • todos os municípios":"Todos os municípios das 13 regiões"):value]);
      const total=rows.reduce((n,r)=>n+r.currentVotes,0);report.indicators=[metric("Votos nas regiões do filtro",fmtInt(total)),metric("Regiões",fmtInt(rows.length)),metric("Municípios",fmtInt(rows.reduce((n,r)=>n+r.municipalities,0)))];
      addBars("Resultados por região",rows.map(r=>({name:r.name,votes:r.currentVotes,previousVotes:r.previousVotes})));
      addPies("Distribuição entre regiões",rows.map(r=>({label:r.name,value:r.currentVotes})),previous?rows.map(r=>({label:r.name,value:r.previousVotes})):null);
      addTable("Resultados das regiões",["Região","Votos 2026","Participação regional","Votos 2022","Variação"],rows.map(r=>[r.name,fmtInt(r.currentVotes),fmtPercent(r.currentVotes/Math.max(1,r.currentTotal)),r.previousVotes===null?"—":fmtInt(r.previousVotes),window.ElectoralScope.change(r.currentVotes,r.previousVotes).label]),[2.4,1,1.3,1,1.2]);
      // Include every municipality, even when the candidate has no votes there.
      for(const region of rows){const municipalities=regionalMunicipalityRows(region.id);addBars(`Todos os municípios • ${region.name}`,municipalities);addTable(`Municípios de ${region.name}`,["Município","Votos 2026","Votos 2022","Variação"],municipalities.map(r=>[r.name,fmtInt(r.votes),r.previousVotes===null?"—":fmtInt(r.previousVotes),window.ElectoralScope.change(r.votes,r.previousVotes).label]),[2.5,1,1,1.3]);}
    }
    if(view==="analysis") {
      const data=state.analysis;if(!data)throw new Error("Faça a conferência das listas antes de gerar o relatório.");
      report.meta.push(["Listas",scopeLabel()],["Zona da conferência",state.analysisZone||"Todas"]);report.note="Estimativa coletiva limitada aos votos agregados por seção. O voto é secreto; este relatório não identifica o voto de qualquer pessoa. A conferência usa os cadastros atuais e a votação de 2026.";
      report.indicators=[metric("Cadastros válidos",fmtInt(data.valid)),metric("Compatibilidade estimada",fmtInt(data.hits)),metric("Taxa estimada",fmtPercent(data.rate))];
      report.finalResult={title:"Resultado final do recorte",summary:"Até "+fmtInt(data.hits)+" de "+fmtInt(data.valid)+" cadastros • "+fmtPercent(data.rate),detail:"Estimativa coletiva limitada aos votos agregados das seções do recorte selecionado; não identifica o voto de pessoas cadastradas.",items:[["Cadastros válidos",fmtInt(data.valid)],["Compatibilidade estimada",fmtInt(data.hits)],["Taxa estimada",fmtPercent(data.rate)]]};
      report.blocks.push({type:"pie",title:"Compatibilidade coletiva • Cadastros atuais",rows:[{label:"Compatíveis com os totais das seções",value:data.hits},{label:"Sem compatibilidade nos totais",value:data.unmatched}]});
      const oldSectionVotes = new Map();
      (priorRows || []).forEach(r=>{const key=r.zone+"|"+r.section;oldSectionVotes.set(key,(oldSectionVotes.get(key)||0)+r.votes);});
      addBars("Votos nas seções cadastradas • Top 15",[...data.sectionRows].sort((a,b)=>b.votes-a.votes).slice(0,15).map(r=>({name:`Zona ${r.zone} • Seção ${r.section}`,votes:r.votes,previousVotes:priorRows?oldSectionVotes.get(r.zone+"|"+r.section)||0:null})));
      addTable("Conferência por seção",["Zona / seção","Local","Cadastros","Votos 2026","Estimativa","Taxa"],data.sectionRows.map(r=>[`${r.zone} / ${r.section}`,r.place,fmtInt(r.records.length),fmtInt(r.votes),fmtInt(r.hits),fmtPercent(r.rate)]),[1.2,3,1,1,1,1]);
    }
    return annotate(report);
  }

  function renderDataStatus() {
    if (!state.city || !state.index || !el("query-data-summary")) return;
    let coverage = qualityCache.get(state.city);
    if (!coverage) {
      const missing = value => !value || /nao (informado|identificado)|^sem /.test(normalizeText(value));
      coverage = {sections: state.city.s.length, places: state.city.s.filter(row => missing(row[2])).length,
        neighborhoods: state.city.s.filter(row => missing(row[3])).length};
      qualityCache.set(state.city, coverage);
    }
    const manifest = window.PlatformTools?.manifests.get(state.office), previous = previousRegionalCandidate();
    const xrayScope = state.regionFilter ? state.regional.regions.find(row => String(row[0]) === state.regionFilter)?.[1] : "Todos os municípios do Pará";
    const scope = state.view === "xray" ? xrayScope : state.view === "regional" ? (state.regionFilter ? xrayScope : "Todos os municípios das 13 regiões") : state.city.m[1];
    el("query-data-summary").textContent = `2026 • ${officeConfig().label} • ${scope} • ${navigator.onLine ? "Online" : "Offline"}`;
    const updatedAt = manifest?.updatedAt || state.index.provenance?.appliedAt;
    const values = [["Fonte ativa", state.index.source], ["Versão", manifest?.active === "bundled" || !manifest?.active ? "Base publicada inicialmente" : manifest.active],
      ["Atualização", updatedAt ? new Date(updatedAt).toLocaleString("pt-BR", {timeZone:"America/Sao_Paulo"}) : "Consulte a data de geração indicada na fonte."],
      ["Recorte do resultado", scope], ["Histórico", previous ? "Correspondência única em 2022 neste cargo. Cada gráfico exige dados disponíveis no mesmo recorte." : "Sem correspondência histórica única neste cargo; resultados de 2026."],
      ["Locais e bairros", `${state.city.m[1]}: ${fmtInt(coverage.sections)} seções; ${fmtInt(coverage.places)} sem local identificado; ${fmtInt(coverage.neighborhoods)} sem bairro informado.`]];
    el("query-data-detail").replaceChildren(...values.map(([label, value]) => {const row = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd");dt.textContent = label;dd.textContent = value;row.append(dt, dd);return row;}));
  }

  async function printWorkspace(className = "") {
    if(state.view==="paired"&&window.CrossingHub)return window.CrossingHub.report();
    if (state.view === "comparison" || className === "print-comparison") return window.CandidateApuration.openReports();
    if(!state.candidate||!state.city)return toast("Selecione um candidato antes de gerar o relatório.","error");
    const manual=!!state.city.isManualSelection,comparison=!manual&&(state.view==="comparison"||className==="print-comparison"),view=manual?"manual_municipalities":comparison?"comparison":className?className.replace("print-",""):state.view;
    const prepare=async(type,layout)=>{
      state.completeReportLayout=layout;
      const signature=reportQuerySignature(),isComparison=type.startsWith("comparison");
      const candidates=isComparison?selectedComparisonCandidates().map(s=>s.candidate):[state.candidate];
      if(isComparison&&candidates.length!==2)throw new Error("Selecione dois candidatos diferentes do mesmo cargo antes de gerar o relatório.");
      if(!manual&&type!=="comparison_complete")await Promise.all(candidates.map(ensureHistory));
      if(signature!==reportQuerySignature())throw new Error("A consulta mudou durante a preparação. Prepare a prévia novamente.");
      const report=pdfReport(type),name=isComparison?candidates.map(c=>c[1]).join("_x_"):normalizeText(state.candidate[2]).replace(/\s+/g,"_");
      return {report,filename:`relatorio_${type==="complete"?(layout==="regions"?"completo_por_regioes":"completo"):type}_${state.office}_${name}_2026.pdf`};
    };
    const choices=manual?[
      {id:"manual_municipalities",label:"Municípios e zonas",description:"Todos os municípios marcados, com seus totais e votos por zona. Formato compacto, sem seções."},
      {id:"manual_places",label:"Municípios, zonas e locais de votação",description:"Acrescenta todas as escolas do filtro. Confira a quantidade de páginas na prévia."},
    ]:comparison?[
      {id:"comparison",label:"Município / recorte selecionado — 2 candidatos",description:"Inclui os dois selecionados. No município: dois quadros na mesma página; no recorte: resumo e municípios. Sem escolas ou seções."},
      {id:"comparison_top30",label:"Top 30 municípios — 2 candidatos",description:"Até 30 municípios do recorte, ordenados pela soma de votos dos dois candidatos. Gráficos compactos e histórico disponível."},
      {id:"comparison_complete",label:"Completo — 144 municípios do Pará",regionalLayout:true,description:"Os dois candidatos em todos os 144 municípios e todas as zonas do estado, inclusive onde há zero votos. Organização consolidada ou por regiões."},
    ]:[
      {id:"overview",label:"Resumo do candidato",description:"Indicadores e votação por zona no município ou recorte selecionado."},
      {id:"complete",label:"Completo compacto",regionalLayout:true,description:"Regiões, todos os municípios e zonas do recorte. Gráficos e histórico disponível. Sem escolas ou seções."},
      {id:"xray",label:"Votação por município",description:"Todos os municípios da região escolhida, ou os 144 municípios do Pará. Inclui Top 30 e histórico disponível."},
      {id:"territory",label:"Detalhado — zonas, escolas e seções",description:"Segue os filtros de zona, seção, escola e bairro. Pode gerar muitas páginas; confira a prévia."},
      {id:"regional",label:"Resultados por região",description:"Regiões e municípios do filtro regional desta página, com comparativos disponíveis."},
      ...(state.view==="analysis"?[{id:"analysis",label:"Análise dos cadastros",description:"Cadastros e compatibilidade agregada por seção, conforme os filtros da análise."}]:[]),
    ];
    const options=choices.map(option=>({...option,prepare:layout=>prepare(option.id,layout)}));
    window.ReportCenter.open({options,defaultType:options.some(o=>o.id===view)?view:"complete",layout:state.completeReportLayout,signature:reportQuerySignature});
  }

  function exportAnalysis() {
    const analysis = state.analysis;
    if (!analysis || !state.candidate || !state.city) return;
    const candidate = state.candidate;
    const meta = [
      ["RELATÓRIO DE ANÁLISE ELEITORAL"],
      ["Município", state.city.m[1]],
      ["Cargo", officeConfig().label],
      ["Candidato", candidate[2]],
      ["Nome de urna", candidateBallotName(candidate) || "Não disponível nesta consulta"],
      ["Número", candidate[1]],
      ["Votos nominais", candidate[3]],
      ["Posição nominal", candidate[4]],
      ["Escopo", scopeLabel()],
      ["Zona analisada", state.analysisZone ? `Zona ${state.analysisZone}` : "Todas as zonas"],
      ["Cadastros válidos", analysis.valid],
      ["Acertos estimados", analysis.hits],
      ["Taxa estimada", fmtPercent(analysis.rate)],
      ["Aviso", "Estimativa coletiva por seção; não identifica votos individuais."],
      [],
      ["RESULTADO POR SEÇÃO"],
      ["Zona", "Seção", "Local", "Cadastros", "Votos do candidato", "Acertos estimados", "Taxa"],
    ];
    const sectionLines = analysis.sectionRows.map((row) => [row.zone, row.section, row.place, row.records.length, row.votes, row.hits, fmtPercent(row.rate)]);
    const peopleHeader = [[], ["CONFERÊNCIA DOS CADASTROS"], ["Coordenador", "Liderança", "Nome", "Título", "Zona", "Seção", "Contato", "Votos na seção", "Leitura coletiva"]];
    const personLines = analysis.peopleRows.map((row) => [row._coordinator || "Não informado", row._listName || scopeLabel(), row.name, row.title, row.zone, row.section, row.contact, row.votes, row.reading]);
    const allRows = [...meta, ...sectionLines, ...peopleHeader, ...personLines];
    const safeCandidate = normalizeText(candidate[2]).replace(/\s+/g, "_") || candidate[1];
    downloadText(`analise_${state.office}_${safeCandidate}_2026.csv`, allRows.map((row) => row.map(csvEscape).join(";")).join("\r\n"));
    toast("Análise exportada em CSV.");
  }

  function attachNavigationEvents() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest?.("button[data-view], a[data-view]");
      if (button && !button.disabled) { event.preventDefault(); showWorkspaceView(button.dataset.view); }
    });
  }

  function attachEvents() {
    attachNavigationEvents();
    document.querySelectorAll("[data-scroll-to]").forEach((button) => {
      button.addEventListener("click", () => el(button.dataset.scrollTo)?.scrollIntoView({ behavior: "smooth" }));
    });

    el("office-select").addEventListener("change", (event) => loadIndex(event.target.value));
    el("ibge-region-select").addEventListener("change", (event) => applyRegionFilter(event.target.value));
    el("municipality-select").addEventListener("change", (event) => event.target.value === MANUAL_SCOPE ? openMunicipalityPicker() : loadCity(event.target.value, true, state.candidate?.[0] || ""));
    el("open-municipality-picker").addEventListener("click", openMunicipalityPicker);
    el("municipality-picker-search").addEventListener("input", renderMunicipalityPicker);
    el("municipality-picker-options").addEventListener("change", event => {
      if (!event.target.matches('input[type="checkbox"]')) return;
      if (event.target.checked) manualMunicipalityDraft.add(event.target.value); else manualMunicipalityDraft.delete(event.target.value);
      renderMunicipalityPicker();
    });
    el("municipality-picker-clear").addEventListener("click", () => {manualMunicipalityDraft.clear(); renderMunicipalityPicker();});
    el("municipality-picker-apply").addEventListener("click", () => applyManualMunicipalities().catch(error => toast(error.message,"error")));
    el("municipality-selection-city").addEventListener("change", event => {state.selectionMunicipality=event.target.value;state.selectionZone="";renderManualMunicipalities();});
    el("municipality-selection-zone").addEventListener("change", event => {state.selectionZone=event.target.value;renderManualMunicipalities();});
    el("municipality-selection-place").addEventListener("input", event => {
      state.selectionPlaceSearch=event.target.value;state.selectionPlace="";state.selectionPlaces=[];window.clearTimeout(manualPlaceTimer);manualPlaceTimer=window.setTimeout(renderManualMunicipalities,120);
    });
    el("municipality-selection-school").addEventListener("change", event => {
      window.clearTimeout(manualPlaceTimer);state.selectionPlace=event.target.value;state.selectionPlaces=[];renderManualMunicipalities();
    });
    el("municipality-selection-clear").addEventListener("click", () => {
      window.clearTimeout(manualPlaceTimer);state.selectionMunicipality="";state.selectionZone="";state.selectionPlaceSearch="";state.selectionPlace="";state.selectionPlaces=[];renderManualMunicipalities();
    });
    el("municipality-selection-pdf").addEventListener("click", () => printWorkspace());
    el("municipality-selection-csv").addEventListener("click", exportManualMunicipalities);
    el("complete-report-organization").addEventListener("change", (event) => { state.completeReportLayout = event.target.value === "regions" ? "regions" : "consolidated"; });
    el("complete-report-button").addEventListener("click", () => printWorkspace(state.view === "comparison" ? "print-comparison" : "print-complete"));
    el("view-regional-button").addEventListener("click", () => {
      if (!state.candidate) return;
      showWorkspaceView("regional", false);
      el("regional-municipalities")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    el("candidate-search").addEventListener("focus", (event) => showCandidateResults(event.target.value));
    el("candidate-search").addEventListener("input", (event) => showCandidateResults(event.target.value));
    el("candidate-search").addEventListener("blur", () => window.setTimeout(hideCandidateResults, 140));
    el("candidate-search").addEventListener("keydown", (event) => {
      if (el("candidate-results").hidden && (event.key === "ArrowDown" || event.key === "ArrowUp")) showCandidateResults(event.currentTarget.value);
      if (!state.searchMatches.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        state.searchActiveIndex = Math.min(state.searchMatches.length - 1, state.searchActiveIndex + 1);
        renderCandidateResults();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        state.searchActiveIndex = Math.max(0, state.searchActiveIndex - 1);
        renderCandidateResults();
      } else if (event.key === "Enter" && state.searchActiveIndex >= 0) {
        event.preventDefault();
        selectCandidate(state.searchMatches[state.searchActiveIndex]);
      } else if (event.key === "Escape") {
        hideCandidateResults();
      }
    });

    el("list-select").addEventListener("change", (event) => {
      state.activeListId = event.target.value;
      renderLists();
    });
    const saveCoordinator = () => {
      const list = getActiveList();
      if (!list) return;
      list.coordinator = el("coordinator-input").value.trim().slice(0, 100);
      persistLists();
      renderLists();
      toast(list.coordinator ? `Coordenador ${list.coordinator} vinculado à liderança ${list.name}.` : "Coordenador removido desta liderança.");
    };
    el("save-coordinator-button").addEventListener("click", saveCoordinator);
    el("coordinator-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveCoordinator();
      }
    });
    el("territory-zone-select").addEventListener("change", (event) => {
      state.territoryZone = canonicalElectionNumber(event.target.value);
      state.territorySection = "";
      state.territoryPlace = "";
      state.territoryNeighborhood = "";
      renderTerritoryReport();
    });
    el("territory-section-select").addEventListener("change", (event) => {
      state.territorySection = canonicalElectionNumber(event.target.value);
      state.territoryPlace = "";
      state.territoryNeighborhood = "";
      renderTerritoryReport();
    });
    el("territory-place-select").addEventListener("change", (event) => {
      state.territoryPlace = event.target.value;state.territoryPlaces = [];
      state.territoryNeighborhood = "";
      renderTerritoryReport();
    });
    el("territory-place-clear").addEventListener("click", () => {
      state.territoryPlace = ""; state.territoryPlaces = []; state.territoryNeighborhood = ""; renderTerritoryReport();
    });
    el("territory-neighborhood-select").addEventListener("change", (event) => {
      state.territoryNeighborhood = event.target.value;
      renderTerritoryReport();
    });
    el("export-territory-button").addEventListener("click", exportTerritoryReport);
    el("clear-territory-button").addEventListener("click", () => { resetTerritoryFilters(); renderTerritoryReport(); });
    el("print-territory-button").addEventListener("click", printTerritoryReport);
    for (let index = 0; index < 2; index += 1) {
      el(`compare-select-${index + 1}`).addEventListener("change", event => changeCandidateQuery(index, event));
    }
    el("export-xray-button").addEventListener("click", exportCandidateXray);
    el("print-xray-button").addEventListener("click", () => printCandidateSection("print-xray"));
    el("regional-region-select").addEventListener("change", (event) => applyRegionFilter(event.target.value));
    el("export-regional-button").addEventListener("click", exportRegionalReport);
    el("print-regional-button").addEventListener("click", () => printCandidateSection("print-regional"));
    el("export-comparison-button").addEventListener("click", exportCandidateComparison);
    el("print-comparison-button").addEventListener("click", () => printWorkspace("print-comparison"));

    el("analysis-list-select").addEventListener("change", (event) => {
      state.analysisScope = event.target.value || ALL_LISTS;
      renderZoneFilter();
      renderAnalysis();
    });
    el("analysis-zone-select").addEventListener("change", (event) => {
      state.analysisZone = canonicalElectionNumber(event.target.value);
      renderAnalysis();
    });
    el("delete-list-button").addEventListener("click", () => {
      const list = getActiveList();
      if (!list || !window.confirm(`Excluir a lista “${list.name}” e seus ${fmtInt(list.records.length)} cadastros deste aparelho?`)) return;
      state.lists = state.lists.filter((item) => item.id !== list.id);
      state.activeListId = state.lists[0]?.id || "";
      state.analysisScope = ALL_LISTS;
      persistLists();
      renderLists();
      toast("Lista excluída deste aparelho.");
    });

    const renameButton = el("rename-list-button");
    if (renameButton) {
      renameButton.addEventListener("click", () => {
        const list = getActiveList();
        if (!list) return;
        const requested = window.prompt("Novo nome da lista:", list.name);
        if (requested === null || !requested.trim()) return;
        const oldName = list.name;
        list.name = requested.trim().slice(0, 80);
        if (state.lists.some((item) => item.id !== list.id && normalizeText(item.name) === normalizeText(list.name))) {
          list.name = oldName;
          toast("Já existe uma lista com esse nome.", "error");
          return;
        }
        persistLists();
        renderLists();
        toast("Lista renomeada.");
      });
    }

    el("file-input").addEventListener("change", (event) => importFiles([...event.target.files]));
    el("model-button").addEventListener("click", exportModel);
    el("export-lists-button").addEventListener("click", exportLists);
    el("reset-imports-button").addEventListener("click", () => {
      if (!state.lists.length) return;
      const recordCount = state.lists.reduce((sum, list) => sum + list.records.length, 0);
      const confirmed = window.confirm(
        `Preparar o arquivamento de ${fmtInt(state.lists.length)} lista(s) e ${fmtInt(recordCount)} cadastro(s)?\n\nVocê revisará a alteração antes de sincronizar. O histórico central será preservado.`
      );
      if (!confirmed) return;
      state.lists = [];
      state.activeListId = "";
      state.analysisScope = ALL_LISTS;
      state.analysisZone = "";
      state.analysis = null;
      try {
        persistLists();
      } catch (error) {
        console.warn("Não foi possível limpar as listas locais.", error);
      }
      renderLists();
      toast("Importações zeradas. O banco local está pronto para receber os dados atualizados.");
    });
    el("paste-button").addEventListener("click", () => {
      try {
        const text = el("paste-input").value;
        if (!text.trim()) throw new Error("Cole os dados antes de importar.");
        const groups = matrixToGroups(
          parseDelimitedText(text),
          el("import-list-name").value.trim() || "Dados colados",
          el("import-coordinator-name").value.trim()
        );
        const result = addImportedGroups(groups);
        el("paste-input").value = "";
        el("paste-details").open = false;
        toast(`${fmtInt(result.importedRecords)} cadastro(s) importado(s) em ${fmtInt(result.importedLists)} lista(s).`);
      } catch (error) {
        toast(error.message, "error");
      }
    });

    el("manual-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      let list = getActiveList();
      if (!list) {
        list = createList(
          el("import-list-name").value.trim() || "Minha liderança",
          [],
          el("import-coordinator-name").value.trim()
        );
      }
      list.records.push(sanitizeRecord({
        name: form.get("name"),
        title: form.get("title"),
        zone: form.get("zone"),
        section: form.get("section"),
        contact: form.get("contact"),
      }));
      persistLists();
      event.currentTarget.reset();
      renderLists();
      toast("Cadastro adicionado à lista.");
    });

    el("export-analysis-button").addEventListener("click", exportAnalysis);
    el("print-button").addEventListener("click", () => printWorkspace());
  }

  async function runGuidedQuery({office,region,city,candidate,candidateIds,zone,section,place,neighborhood,view,manualMunicipalityCodes,places,selectionPlaces,selectionPlace,selectionPlaceSearch,selectionMunicipality,selectionZone,guard=()=>true}) {
    if(!guard())return false;
    if(office&&office!==state.office)await loadIndex(office);
    if(!guard())return false;
    if(!state.index)throw new Error("A base eleitoral não está disponível neste aparelho.");
    if(region!==undefined&&region!==state.regionFilter)await applyRegionFilter(region);
    if(!guard())return false;
    if(city&&![REGION_SCOPE,STATE_SCOPE,MANUAL_SCOPE].includes(city)&&state.regionFilter&&!filteredMunicipalities().some(c=>String(c[0])===String(city)))await applyRegionFilter("");
    if(!guard())return false;
    if(city===MANUAL_SCOPE&&Array.isArray(manualMunicipalityCodes))await applyManualMunicipalities(manualMunicipalityCodes,candidate);
    else if(city)await loadCity(city,true,candidate);
    if(!guard())return false;
    if(candidate){
      if(!state.city?.c.some(c=>String(c[0])===String(candidate)))await loadCity(state.cityCode||DEFAULT_CITY_CODE,true,candidate);
      if(!guard())return false;
      const match=state.city?.c.find(c=>String(c[0])===String(candidate));
      if(!match)throw new Error("O candidato não está disponível nesta versão de 2026.");
      selectCandidate(match);
    }
    if(candidateIds)state.compareCandidateIds=candidateIds.slice(0,2);
    if(zone)state.territoryZone=String(Number(zone));
    if(section)state.territorySection=String(Number(section));
    if(place!==undefined){state.territoryPlace=place;state.territoryPlaces=[];}
    if(Array.isArray(places))state.territoryPlaces=[...new Set(places)];
    if(state.city?.isManualSelection){
      if(Array.isArray(selectionPlaces))state.selectionPlaces=[...new Set(selectionPlaces)];
      if(selectionPlace!==undefined)state.selectionPlace=selectionPlace;
      if(selectionPlaceSearch!==undefined)state.selectionPlaceSearch=selectionPlaceSearch;
      if(selectionMunicipality!==undefined)state.selectionMunicipality=selectionMunicipality;
      if(selectionZone!==undefined)state.selectionZone=selectionZone;
    }
    if(neighborhood!==undefined)state.territoryNeighborhood=neighborhood;
    showWorkspaceView(view||"overview");
    if(view==="map"&&candidate)window.ElectoralMap?.setCandidate(candidate);
    window.CrmWorkspace?.refreshSearchCoverage?.();
    return true;
  }

  window.PlatformPerformance={clear:()=>{cityCache.clear();scopeCache.clear();historyCache.clear();previousCandidateCache.clear();window.ElectionDataCache?.clear();}};

  function init() {
    loadStoredLists();
    window.ReportCenter?.init();
    window.CandidateApuration?.init({getState:()=>state,toast,download:downloadText});
    window.ComparisonReading?.init();
    window.ComparisonTerritory?.init();
    window.addEventListener("online", renderDataStatus);
    window.addEventListener("offline", renderDataStatus);
    window.PlatformTools.init({ state, loadIndex, applyRegionFilter, loadCity, selectCandidate,
      filteredMunicipalities, renderTerritoryFilters, showWorkspaceView, applyManualMunicipalities, renderManualMunicipalities, toast, fmtInt });
    if(window.CrossingHub)window.CrossingHub.init({getState:()=>state,toast,showView:showWorkspaceView,download:downloadText});
    else window.PairedView?.init({getState:()=>state,toast});
    window.ElectoralMap?.init({getState:()=>state,query:runGuidedQuery,fetchCity});
    window.ElectionArchive?.init({getState:()=>state,toast});
    window.Quocients?.init();
    window.CouncilTutelar?.init();
    window.Results2026?.init({getState:()=>state,toast,query:runGuidedQuery,refresh:()=>{if(state.candidate)renderCandidate();}});
    window.ZoneHistory?.init({getState:()=>state,getHistorical:async candidate=>{const previous=previousRegionalCandidate(candidate);await ensureHistory(candidate);return {previous,history:historyCache.get(historyKey(candidate))};}});
    window.PlatformHealth?.init({getState:()=>state});
    window.WorkspacePages?.init({getState:()=>state,showView:showWorkspaceView,report:()=>el("complete-report-button").click(),toast});
    attachEvents();
    el("summary-pdf-button").addEventListener("click", () => printWorkspace("print-overview"));
    window.AppHome?.init({getState:()=>state,showView:showWorkspaceView,query:runGuidedQuery,report:()=>el('complete-report-button').click(),candidateName:candidateBallotName});
    showWorkspaceView(window.WorkspacePages?.route()||"home", false);
    renderLists();
    window.CrmWorkspace?.init({state,storageKey:STORAGE_KEY,toast,showView:showWorkspaceView,
      reloadLists(lists){state.lists=lists;state.activeListId=lists[0]?.id||"";state.analysisScope=ALL_LISTS;renderLists();if(state.view==="analysis")renderAnalysis();},
      getRegistrationSummary:()=>({records:scopeRecords(),label:scopeLabel(),filterLabel:state.analysisZone?'Zona '+state.analysisZone:'Todas as zonas do escopo selecionado'}),
      query(params){return runGuidedQuery(params);}
    });
    loadIndex("estadual");
  }

  init();
})();
