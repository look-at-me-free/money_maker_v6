(() => {
  "use strict";

  const LIBRARY_FILE = "library.json";
  const R2_BASE_URL = "https://pub-cd01009a7c6c464aa0b093e33aa5ae51.r2.dev";
  const WORKS_DIR = `${R2_BASE_URL}/works`;
  const ITEM_JSON_NAME = "item.json";

  const UI_PAGE_SIZE = 20;
  const SEARCH_DEBOUNCE_MS = 90;
  const OPEN_FIRST_ON_LOAD = true;
  const CLOSE_OTHERS_ON_OPEN = true;

  const TOP_ZONE = "5865232";
  const RIGHT_ZONE = "5865240";
  const BETWEEN_ZONE = "5865236";
  const END_ZONE = "5865236";
  const END_ADS = 24;
  const LAZY_ADS = true;

  let TOP_WORKS = [];
  let ARCHIVE_WORKS = [];
  let ITEMS = [];
  let SEARCH_INDEX = null;

  let CURRENT_DIR = "";
  let CURRENT_FILE = "";
  let CURRENT_UI_PAGE = 1;
  let CURRENT_WORK_TITLE = "";
  let CURRENT_CHUNK_TITLE = "";
  let CURRENT_ITEM_JSON = null;

  let searchWired = false;
  let topFlyoutsWired = false;
  let popstateWired = false;
  let adObserver = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizeKey(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function titleCaseSlug(slug) {
    return String(slug ?? "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, ch => ch.toUpperCase());
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
    return res.json();
  }

  function getQueryState() {
    const url = new URL(window.location.href);
    return {
      dir: url.searchParams.get("dir") || "",
      file: url.searchParams.get("file") || "",
      p: parseInt(url.searchParams.get("p") || "1", 10) || 1,
      hash: url.hash ? url.hash.slice(1) : ""
    };
  }

  function setQueryState(dir, file, p, hash = "", replace = false) {
    const url = new URL(window.location.href);
    url.searchParams.set("dir", dir);
    url.searchParams.set("file", file);
    url.searchParams.set("p", String(p));
    url.hash = hash ? `#${hash}` : "";
    const payload = { dir, file, p, hash };
    if (replace) history.replaceState(payload, "", url);
    else history.pushState(payload, "", url);
  }

  function buildItemJsonPath(workSlug, entryPathOrSlug) {
    const safeParts = String(entryPathOrSlug)
      .split("/")
      .filter(Boolean)
      .map(part => encodeURIComponent(part));

    return `${WORKS_DIR}/${encodeURIComponent(workSlug)}/${safeParts.join("/")}/${ITEM_JSON_NAME}`;
  }

  function buildImageUrl(baseUrl, pageNum, padding = 2, extension = "jpg") {
    const padded = String(pageNum).padStart(padding, "0");
    return `${baseUrl}/${padded}.${extension}`;
  }

  function currentMetaLine() {
    return [CURRENT_WORK_TITLE, CURRENT_CHUNK_TITLE].filter(Boolean).join(" • ");
  }

  async function loadWorksManifest() {
    const data = await fetchJson(LIBRARY_FILE);
    const works = Array.isArray(data.works) ? data.works : [];

    ARCHIVE_WORKS = works.map(work => ({
      id: work.id ?? null,
      slug: work.slug ?? "",
      display: work.display || work.dropdown_option_display || titleCaseSlug(work.slug),
      top_pill: work.top_pill !== false,
      entries: Array.isArray(work.entries) ? work.entries : []
    }));

    TOP_WORKS = ARCHIVE_WORKS.filter(work => work.top_pill);
  }

  function allKnownWorkPairs() {
    const pairs = [];
    for (const work of ARCHIVE_WORKS) {
      for (const entry of work.entries) {
        if (!work.slug || !entry?.slug) continue;
        pairs.push({ dir: work.slug, file: entry.slug, work, entry });
      }
    }
    return pairs;
  }

  function resolveWorkPair(dir, file) {
    const key = `${normalizeKey(dir)}::${normalizeKey(file)}`;
    return allKnownWorkPairs().find(
      x => `${normalizeKey(x.dir)}::${normalizeKey(x.file)}` === key
    ) || null;
  }

  function getFirstKnownWork() {
    for (const work of ARCHIVE_WORKS) {
      const first = work.entries?.[0];
      if (work.slug && first?.slug) return { dir: work.slug, file: first.slug };
    }
    return { dir: "", file: "" };
  }

  function getLastKnownWork() {
    const all = allKnownWorkPairs();
    return all.length ? { dir: all[all.length - 1].dir, file: all[all.length - 1].file } : { dir: "", file: "" };
  }

  function entryDisplay(work, entry, itemData = null) {
    const workName = work?.display || titleCaseSlug(work?.slug || "");
    const subtitle = itemData?.subtitle || entry?.subtitle || titleCaseSlug(entry?.slug || "");
    return `${workName} · ${subtitle}`;
  }

  async function loadWork(dir, file) {
    const resolved = resolveWorkPair(dir, file) || { dir, file, work: null, entry: null };
    const entryPath = resolved.entry?.path || resolved.file;
    const data = await fetchJson(buildItemJsonPath(resolved.dir, entryPath));

    CURRENT_DIR = resolved.dir;
    CURRENT_FILE = resolved.file;
    CURRENT_ITEM_JSON = data;
    CURRENT_WORK_TITLE = resolved.work?.display || data.title || titleCaseSlug(resolved.dir);
    CURRENT_CHUNK_TITLE = data.subtitle || resolved.entry?.subtitle || titleCaseSlug(resolved.file);

    const totalPages = Number.isFinite(data.pages) ? data.pages : 0;
    const padding = Number.isFinite(data.padding) ? data.padding : 2;
    const extension = data.extension || "jpg";
    const baseUrl = data.base_url || "";

    ITEMS = Array.from({ length: totalPages }, (_, idx) => {
      const pageNum = idx + 1;
      return {
        idx,
        page: pageNum,
        anchor: `page-${pageNum}`,
        title: `${CURRENT_WORK_TITLE} · ${CURRENT_CHUNK_TITLE} · Page ${pageNum}`,
        label: `Page ${pageNum}`,
        url: buildImageUrl(baseUrl, pageNum, padding, extension)
      };
    });

    SEARCH_INDEX = null;

    const titleEl = $("#currentWorkTitle");
    if (titleEl) titleEl.textContent = `${CURRENT_WORK_TITLE} • ${CURRENT_CHUNK_TITLE}`;

    const input = $("#q");
    if (input) input.value = "";

    const nav = $("#nav");
    if (nav) {
      nav.innerHTML = "";
      nav.style.display = "none";
    }
  }

  function totalUiPages() {
    return Math.max(1, Math.ceil(ITEMS.length / UI_PAGE_SIZE));
  }

  function clampCurrentPage(p) {
    const total = totalUiPages();
    const n = parseInt(p, 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(total, n);
  }

  function getUiPageRange(page) {
    const startIdx = (page - 1) * UI_PAGE_SIZE;
    const endIdx = Math.min(ITEMS.length - 1, startIdx + UI_PAGE_SIZE - 1);
    return { startIdx, endIdx };
  }

  function getVisibleItems() {
    const { startIdx, endIdx } = getUiPageRange(CURRENT_UI_PAGE);
    if (endIdx < startIdx) return [];
    return ITEMS.slice(startIdx, endIdx + 1);
  }

  function getUiPageForItemIndex(idx) {
    return Math.floor(idx / UI_PAGE_SIZE) + 1;
  }

  function getUiPageForAnchor(anchor) {
    const idx = ITEMS.findIndex(item => item.anchor === anchor);
    return idx === -1 ? 1 : getUiPageForItemIndex(idx);
  }

  function getUiPageLabel(page) {
    const { startIdx, endIdx } = getUiPageRange(page);
    if (ITEMS.length === 0 || endIdx < startIdx) return `Page ${page}`;
    const startNum = ITEMS[startIdx]?.page ?? (startIdx + 1);
    const endNum = ITEMS[endIdx]?.page ?? (endIdx + 1);
    return `Pages ${startNum}–${endNum}`;
  }

  function buildPagerSequence(current, total) {
    if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1);

    const set = new Set([1, 2, total - 1, total, current - 1, current, current + 1]);
    const nums = Array.from(set)
      .filter(n => n >= 1 && n <= total)
      .sort((a, b) => a - b);

    const out = [];
    for (let i = 0; i < nums.length; i++) {
      out.push(nums[i]);
      if (i < nums.length - 1 && nums[i + 1] - nums[i] > 1) out.push("...");
    }
    return out;
  }

  function renderPagerInto(el) {
    if (!el) return;

    const total = totalUiPages();
    if (total <= 1) {
      el.innerHTML = "";
      el.style.display = "none";
      return;
    }

    const seq = buildPagerSequence(CURRENT_UI_PAGE, total);
    let html = "";

    for (const token of seq) {
      if (token === "...") {
        html += `<span class="pager-ellipsis">…</span>`;
        continue;
      }

      const page = token;
      const href = `?dir=${encodeURIComponent(CURRENT_DIR)}&file=${encodeURIComponent(CURRENT_FILE)}&p=${page}`;
      const active = page === CURRENT_UI_PAGE ? " active" : "";

      html += `<a href="${href}" class="${active.trim()}" data-page="${page}">${escapeHtml(getUiPageLabel(page))}</a>`;
    }

    el.innerHTML = html;
    el.style.display = "flex";

    el.onclick = (e) => {
      const a = e.target.closest("a[data-page]");
      if (!a) return;
      e.preventDefault();
      const page = parseInt(a.dataset.page, 10);
      if (!Number.isFinite(page)) return;
      CURRENT_UI_PAGE = clampCurrentPage(page);
      setQueryState(CURRENT_DIR, CURRENT_FILE, CURRENT_UI_PAGE, "", false);
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  }

  function renderDynamicPagers() {
    renderPagerInto($("#dynamicTopPager"));
    renderPagerInto($("#dynamicBottomPager"));
  }

  function buildSearchIndex() {
    SEARCH_INDEX = ITEMS.map((item, i) => ({
      i,
      haystack: `${item.title} ${item.label} ${CURRENT_WORK_TITLE} ${CURRENT_CHUNK_TITLE}`.toLowerCase(),
      title: item.title,
      meta: item.label
    }));
  }

  function runSearch(query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return [];
    if (!SEARCH_INDEX) buildSearchIndex();
    return SEARCH_INDEX.filter(x => x.haystack.includes(q)).slice(0, 40);
  }

  function updateSearchResults(query) {
    const nav = $("#nav");
    const meta = $("#meta");
    const hits = runSearch(query);

    if (meta) {
      meta.textContent = hits.length
        ? `Matches: ${hits.length}`
        : `Pages: ${ITEMS.length} • ${getUiPageLabel(CURRENT_UI_PAGE)}`;
    }

    if (nav) {
      nav.innerHTML = hits.map(h => {
        const item = ITEMS[h.i];
        return `<a href="#${escapeHtml(item.anchor)}" data-i="${h.i}">${escapeHtml(h.title)}<span class="nav-id">${escapeHtml(h.meta)}</span></a>`;
      }).join("");
      nav.style.display = hits.length ? "flex" : "none";
    }
  }

  function jumpToItem(i) {
    if (!Number.isFinite(i) || i < 0 || i >= ITEMS.length) return;
    const page = getUiPageForItemIndex(i);
    const hash = ITEMS[i].anchor;
    CURRENT_UI_PAGE = clampCurrentPage(page);
    setQueryState(CURRENT_DIR, CURRENT_FILE, CURRENT_UI_PAGE, hash, false);
    render();

    requestAnimationFrame(() => {
      const el = document.getElementById(hash);
      if (el) {
        el.open = true;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  function wireSearchUI() {
    if (searchWired) return;
    searchWired = true;

    const input = $("#q");
    const nav = $("#nav");
    const meta = $("#meta");
    const clearBtn = $("#clear");

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (input) input.value = "";
        if (nav) {
          nav.innerHTML = "";
          nav.style.display = "none";
        }
        if (meta) meta.textContent = `Pages: ${ITEMS.length} • ${getUiPageLabel(CURRENT_UI_PAGE)}`;
      });
    }

    if (input) {
      let timer = null;
      input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => updateSearchResults(input.value || ""), SEARCH_DEBOUNCE_MS);
      });

      input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        const hits = runSearch(input.value || "");
        if (hits[0]) {
          e.preventDefault();
          jumpToItem(hits[0].i);
        }
      });
    }

    if (nav) {
      nav.addEventListener("click", (e) => {
        const a = e.target.closest("a[data-i]");
        if (!a) return;
        e.preventDefault();
        const i = parseInt(a.dataset.i, 10);
        if (Number.isFinite(i)) jumpToItem(i);
      });
    }
  }

  function ensureIns(slot) {
    if (!slot || slot.dataset.inited) return;
    slot.dataset.inited = "1";
    const ins = document.createElement("ins");
    ins.className = "eas6a97888e2";
    ins.setAttribute("data-zoneid", slot.dataset.zone);
    slot.appendChild(ins);
  }

  function serveAds() {
    (window.AdProvider = window.AdProvider || []).push({ serve: {} });
  }

  function initLazyAds() {
    if (adObserver || !LAZY_ADS) return;

    adObserver = new IntersectionObserver((entries) => {
      let didInit = false;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const slot = entry.target;
        ensureIns(slot);
        adObserver.unobserve(slot);
        didInit = true;
      }
      if (didInit) setTimeout(serveAds, 30);
    }, { root: null, rootMargin: "900px 0px", threshold: 0.01 });

    $$(".exo-slot[data-zone]").forEach(slot => adObserver.observe(slot));
  }

  function observeNewSlots(root) {
    if (!adObserver) return;
    $$(".exo-slot[data-zone]", root).forEach(slot => adObserver.observe(slot));
  }

  function initAllAdsNow() {
    $$(".exo-slot[data-zone]").forEach(ensureIns);
    serveAds();
  }

  function buildBetweenAd(count, zoneId) {
    const wrap = document.createElement("div");
    wrap.className = "between-ad";

    const grid = document.createElement("div");
    grid.className = "between-grid";

    for (let i = 0; i < count; i++) {
      const slot = document.createElement("div");
      slot.className = "exo-slot";
      slot.dataset.zone = zoneId;
      grid.appendChild(slot);
    }

    wrap.appendChild(grid);
    return wrap;
  }

  function buildEndAds(count, zoneId) {
    const wrap = document.createElement("section");
    wrap.className = "end-ads";
    wrap.id = "endAds";

    const title = document.createElement("p");
    title.className = "end-ads-title";
    title.textContent = "More panels";

    const grid = document.createElement("div");
    grid.className = "end-ads-grid";

    for (let i = 0; i < count; i++) {
      const slot = document.createElement("div");
      slot.className = "exo-slot";
      slot.dataset.zone = zoneId;
      grid.appendChild(slot);
    }

    wrap.appendChild(title);
    wrap.appendChild(grid);
    return wrap;
  }

  function wireTopFlyouts() {
    if (topFlyoutsWired) return;
    topFlyoutsWired = true;

    document.addEventListener("click", (e) => {
      const trigger = e.target.closest(".topworks-trigger");
      if (trigger) {
        const item = trigger.closest(".topworks-item");
        if (!item) return;
        e.preventDefault();
        const wasOpen = item.classList.contains("open");
        $$(".topworks-item.open").forEach(x => x.classList.remove("open"));
        if (!wasOpen) item.classList.add("open");
        return;
      }

      if (!e.target.closest(".topworks-item")) {
        $$(".topworks-item.open").forEach(x => x.classList.remove("open"));
      }
    });
  }

  function renderWorksNav() {
    const nav = $("#worksNav");
    if (!nav) return;

    let html = "";

    for (const work of TOP_WORKS) {
      const isActive = normalizeKey(work.slug) === normalizeKey(CURRENT_DIR);
      const entries = Array.isArray(work.entries) ? work.entries : [];

      html += `
        <div class="topworks-item${isActive ? " active" : ""}">
          <button class="topworks-trigger" type="button">
            <span>${escapeHtml(work.display)}</span>
            <span class="topworks-caret"></span>
          </button>
          <div class="topworks-flyout">
            <div class="topworks-links">
      `;

      for (const entry of entries) {
        const label = entryDisplay(work, entry);
        const active = isActive && normalizeKey(entry.slug) === normalizeKey(CURRENT_FILE) ? " active" : "";
        html += `
          <a
            href="?dir=${encodeURIComponent(work.slug)}&file=${encodeURIComponent(entry.slug)}&p=1"
            class="topworks-link${active}"
            data-dir="${escapeHtml(work.slug)}"
            data-file="${escapeHtml(entry.slug)}"
          >${escapeHtml(label)}</a>
        `;
      }

      html += `
            </div>
          </div>
        </div>
      `;
    }

    nav.innerHTML = html;

    nav.onclick = (e) => {
      const a = e.target.closest("a[data-dir][data-file]");
      if (!a) return;
      e.preventDefault();
      switchWork(a.dataset.dir, a.dataset.file, 1, false);
    };
  }

  function groupArchiveAlphabetically() {
    const works = [...ARCHIVE_WORKS].filter(x => x?.slug);
    works.sort((a, b) => a.display.localeCompare(b.display));

    const grouped = new Map();
    for (const work of works) {
      const letter = work.display.charAt(0).toUpperCase();
      if (!grouped.has(letter)) grouped.set(letter, []);
      grouped.get(letter).push(work);
    }
    return grouped;
  }

  function renderLibraryNav() {
    const root = $("#libraryNav");
    if (!root) return;

    const grouped = groupArchiveAlphabetically();
    let html = "";

    for (const [letter, works] of grouped) {
      html += `<div class="library-letter">${escapeHtml(letter)}</div>`;

      for (const work of works) {
        const isOpen = normalizeKey(work.slug) === normalizeKey(CURRENT_DIR);

        html += `
          <div class="library-item${isOpen ? " open" : ""}" data-dir="${escapeHtml(work.slug)}">
            <button class="library-trigger" type="button">
              <span>${escapeHtml(work.display)}</span>
              <span class="library-arrow">▶</span>
            </button>
            <div class="library-flyout">
              <div class="library-flyout-links">
        `;

        for (const entry of work.entries) {
          const label = entryDisplay(work, entry);
          const active =
            normalizeKey(work.slug) === normalizeKey(CURRENT_DIR) &&
            normalizeKey(entry.slug) === normalizeKey(CURRENT_FILE);

          html += `
            <a
              href="?dir=${encodeURIComponent(work.slug)}&file=${encodeURIComponent(entry.slug)}&p=1"
              class="library-flyout-link${active ? " active" : ""}"
              data-dir="${escapeHtml(work.slug)}"
              data-file="${escapeHtml(entry.slug)}"
            >${escapeHtml(label)}</a>
          `;
        }

        html += `
              </div>
            </div>
          </div>
        `;
      }
    }

    root.innerHTML = html;

    root.onclick = (e) => {
      const trigger = e.target.closest(".library-trigger");
      if (trigger) {
        const item = trigger.closest(".library-item");
        if (item) item.classList.toggle("open");
        return;
      }

      const a = e.target.closest("a[data-dir][data-file]");
      if (!a) return;
      e.preventDefault();
      switchWork(a.dataset.dir, a.dataset.file, 1, false);
    };
  }

  function makeDetails(item, idx) {
    const d = document.createElement("details");
    d.className = "card";
    d.dataset.idx = String(idx);
    d.id = item.anchor;

    const title = escapeHtml(item.label || item.title || `Page ${idx + 1}`);
    const metaLine = currentMetaLine();

    d.innerHTML = `
      <summary>
        <div class="leftstack">
          <div class="doc">${title}</div>
          ${metaLine ? `<div class="id">${escapeHtml(metaLine)}</div>` : ""}
        </div>

        <div class="actions">
          <button class="pill expbtn expand-btn" type="button" aria-label="Read page">
            ▶ READ <span class="chev"></span>
          </button>
          <div class="expand-hint">Opens below</div>
        </div>

        <div class="action-open">
          <a class="pill primary open-btn" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">OPEN</a>
          <div class="open-note">(opens in new tab)</div>
        </div>
      </summary>

      <div class="content image-content" data-src="${escapeHtml(item.url)}"></div>
    `;

    return d;
  }

  function renderVisibleItems(container) {
    const visibleItems = getVisibleItems();
    const frag = document.createDocumentFragment();

    const betweenEvery = CURRENT_ITEM_JSON?.ads?.between_every || 0;
    const betweenSlots = CURRENT_ITEM_JSON?.ads?.between_slots || 0;
    const betweenZone = String(CURRENT_ITEM_JSON?.subids?.between || BETWEEN_ZONE);

    visibleItems.forEach((item, localIdx) => {
      frag.appendChild(makeDetails(item, localIdx));

      const globalPos = ((CURRENT_UI_PAGE - 1) * UI_PAGE_SIZE) + localIdx + 1;
      const shouldInsertBetween =
        betweenEvery > 0 &&
        betweenSlots > 0 &&
        globalPos % betweenEvery === 0 &&
        localIdx + 1 < visibleItems.length;

      if (shouldInsertBetween) {
        frag.appendChild(buildBetweenAd(betweenSlots, betweenZone));
      }
    });

    container.appendChild(frag);
    observeNewSlots(container);
  }

  function renderRightRail() {
    const rail = $("#rightRail");
    if (!rail) return;
    const rightZone = String(CURRENT_ITEM_JSON?.subids?.right || RIGHT_ZONE);
    rail.innerHTML = `<div class="exo-slot" data-zone="${escapeHtml(rightZone)}"></div>`;
    observeNewSlots(rail);
  }

  function renderTopAd() {
    const slot = $(".top-ad .exo-slot");
    if (!slot) return;
    slot.dataset.zone = String(CURRENT_ITEM_JSON?.subids?.top || TOP_ZONE);
    if (adObserver) adObserver.observe(slot);
  }

  function render() {
    const container = $("#container");
    if (!container) return;

    container.replaceChildren();
    renderDynamicPagers();
    renderVisibleItems(container);

    const finalBlock = CURRENT_ITEM_JSON?.ads?.final_block || 0;
    if (finalBlock > 0) {
      const endZone = String(CURRENT_ITEM_JSON?.subids?.between || END_ZONE);
      container.appendChild(buildEndAds(finalBlock, endZone));
      observeNewSlots(container);
    }

    renderTopAd();
    renderRightRail();

    const meta = $("#meta");
    if (meta) meta.textContent = `Pages: ${ITEMS.length} • ${getUiPageLabel(CURRENT_UI_PAGE)}`;

    if (OPEN_FIRST_ON_LOAD) openFirstVisibleCard({ scroll: false });
    if (LAZY_ADS) setTimeout(serveAds, 80);
  }

  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement)) return;
    if (!d.classList.contains("card")) return;

    const content = d.querySelector(".content[data-src]");
    if (!content) return;

    const expBtn = d.querySelector(".expbtn");
    const hint = d.querySelector(".expand-hint");

    if (d.open) {
      if (expBtn) expBtn.innerHTML = '▲ HIDE <span class="chev"></span>';
      if (hint) hint.textContent = "Click to collapse";

      const isMobile = window.matchMedia("(max-width: 900px)").matches;
      if (!isMobile && CLOSE_OTHERS_ON_OPEN) {
        $$("details.card[open]").forEach(x => {
          if (x !== d) x.open = false;
        });
      }

      if (!content.querySelector("img")) {
        content.replaceChildren();
        const img = document.createElement("img");
        img.loading = "lazy";
        img.src = content.dataset.src;
        img.alt = d.querySelector(".doc")?.textContent || "Page image";
        content.appendChild(img);
      }
    } else {
      if (expBtn) expBtn.innerHTML = '▶ READ <span class="chev"></span>';
      if (hint) hint.textContent = "Opens below";
      content.replaceChildren();
    }
  }, true);

  function openFirstVisibleCard({ scroll = false } = {}) {
    const first = $("details.card");
    if (!first) return;
    first.open = true;
    if (scroll) first.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openHashTarget() {
    const { hash } = getQueryState();
    if (!hash) return;

    const page = getUiPageForAnchor(hash);
    if (page !== CURRENT_UI_PAGE) {
      CURRENT_UI_PAGE = clampCurrentPage(page);
      render();
    }

    requestAnimationFrame(() => {
      const el = document.getElementById(hash);
      if (!el) return;
      el.open = true;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function switchWork(dir, file, page = 1, replace = false) {
    await loadWork(dir, file);
    CURRENT_UI_PAGE = clampCurrentPage(page);
    renderWorksNav();
    renderLibraryNav();
    render();
    setQueryState(CURRENT_DIR, CURRENT_FILE, CURRENT_UI_PAGE, "", replace);
    openHashTarget();
  }

  async function boot() {
    try {
      await loadWorksManifest();
      wireSearchUI();
      wireTopFlyouts();

      const first = getFirstKnownWork();
      const qs = getQueryState();

      const dir = qs.dir || first.dir;
      const file = qs.file || first.file;
      const page = qs.p || 1;

      if (!dir || !file) {
        const meta = $("#meta");
        if (meta) meta.textContent = "No works found in library.json";
        return;
      }

      await switchWork(dir, file, page, true);

      const openFirstBtn = $("#openFirstTop");
      if (openFirstBtn) {
        openFirstBtn.addEventListener("click", () => {
          const firstCard = $("details.card");
          if (!firstCard) return;
          firstCard.open = true;
          firstCard.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }

      const openLastBtn = $("#openLastWorkTop");
      if (openLastBtn) {
        openLastBtn.addEventListener("click", async () => {
          const last = getLastKnownWork();
          if (!last.dir || !last.file) return;
          await switchWork(last.dir, last.file, 1, false);
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }

      if (LAZY_ADS) {
        initLazyAds();
        setTimeout(serveAds, 900);
      } else {
        initAllAdsNow();
      }

      if (!popstateWired) {
        popstateWired = true;
        window.addEventListener("popstate", async () => {
          const state = getQueryState();
          const firstKnown = getFirstKnownWork();
          await switchWork(
            state.dir || firstKnown.dir,
            state.file || firstKnown.file,
            state.p || 1,
            true
          );
        });
      }
    } catch (err) {
      console.error(err);
      const meta = $("#meta");
      if (meta) meta.textContent = `Load error: ${err.message}`;
    }
  }

  boot();
})();
