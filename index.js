(() => {
  "use strict";

  const LIBRARY_FILE = "library.json";
  const R2_BASE_URL = "https://pub-cd01009a7c6c464aa0b093e33aa5ae51.r2.dev";
  const WORKS_DIR = `${R2_BASE_URL}/works`;
  const ITEM_JSON_NAME = "item.json";

  const ZONES = {
    topBanner: 5865232,
    leftRail: 5865238,
    rightRail: 5865240,
    betweenMulti: 5867482
  };

  let ARCHIVE_WORKS = [];
  let CURRENT_WORK = null;
  let CURRENT_ENTRY = null;
  let CURRENT_ITEM = null;
  let topFlyoutsWired = false;

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function $$(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

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

  function serveAds() {
    (window.AdProvider = window.AdProvider || []).push({ serve: {} });
  }

  function makeIns(zoneId, sub = 1, sub2 = 1, sub3 = 1) {
    const ins = document.createElement("ins");
    ins.className = "eas6a97888e38";
    ins.setAttribute("data-zoneid", String(zoneId));
    ins.setAttribute("data-sub", String(sub));
    ins.setAttribute("data-sub2", String(sub2));
    ins.setAttribute("data-sub3", String(sub3));
    return ins;
  }

  function fillSlot(el, zoneId, sub = 1, sub2 = 1, sub3 = 1) {
    if (!el) return;
    el.innerHTML = "";
    el.appendChild(makeIns(zoneId, sub, sub2, sub3));
    serveAds();
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url} (${res.status})`);
    }
    return res.json();
  }

  async function loadLibrary() {
    const data = await fetchJson(LIBRARY_FILE);
    ARCHIVE_WORKS = Array.isArray(data.works) ? data.works : [];
  }

  function getQueryState() {
    const url = new URL(window.location.href);
    return {
      dir: url.searchParams.get("dir") || "",
      file: url.searchParams.get("file") || ""
    };
  }

  function setQueryState(dir, file, replace = false) {
    const url = new URL(window.location.href);
    url.searchParams.set("dir", dir);
    url.searchParams.set("file", file);

    if (replace) {
      history.replaceState({ dir, file }, "", url);
    } else {
      history.pushState({ dir, file }, "", url);
    }
  }

  function getFirstEntry() {
    for (const work of ARCHIVE_WORKS) {
      const first = Array.isArray(work.entries) ? work.entries[0] : null;
      if (work?.slug && first?.slug) {
        return { work, entry: first };
      }
    }
    return { work: null, entry: null };
  }

  function resolveSelection(dir, file) {
    const d = normalizeKey(dir);
    const f = normalizeKey(file);

    for (const work of ARCHIVE_WORKS) {
      if (normalizeKey(work.slug) !== d) continue;
      for (const entry of work.entries || []) {
        if (normalizeKey(entry.slug) === f) {
          return { work, entry };
        }
      }
    }

    return null;
  }

  function buildItemJsonPath(workSlug, entryPathOrSlug) {
    const safeParts = String(entryPathOrSlug)
      .split("/")
      .filter(Boolean)
      .map(part => encodeURIComponent(part));

    return `${WORKS_DIR}/${encodeURIComponent(workSlug)}/${safeParts.join("/")}/${ITEM_JSON_NAME}`;
  }

  function normalizeBaseUrl(url) {
    return String(url || "").replace(/\/+$/, "");
  }

  function buildImageList(manifest) {
    if (Array.isArray(manifest.images) && manifest.images.length) {
      return manifest.images;
    }

    if (Number.isFinite(manifest.pages) && manifest.pages > 0) {
      const ext = manifest.extension || "jpg";
      const padding = Number.isFinite(manifest.padding) ? manifest.padding : 2;

      return Array.from({ length: manifest.pages }, (_, i) => {
        const n = String(i + 1).padStart(padding, "0");
        return `${n}.${ext}`;
      });
    }

    return [];
  }

  function getSubids(manifest) {
    const fallbackWork = Number(manifest.id) || 1;

    return {
      work: manifest.subids?.work ?? fallbackWork,
      top: manifest.subids?.top ?? fallbackWork + 10,
      left: manifest.subids?.left ?? fallbackWork + 20,
      right: manifest.subids?.right ?? fallbackWork + 30,
      between: manifest.subids?.between ?? fallbackWork + 40
    };
  }

  function imageBlock(src, alt) {
    const wrap = document.createElement("div");
    wrap.className = "image-wrap";

    const img = document.createElement("img");
    img.src = src;
    img.alt = alt;
    img.loading = "lazy";
    img.decoding = "async";

    wrap.appendChild(img);
    return wrap;
  }

  function betweenAd(manifest, groupNumber, slotCount) {
    const subids = getSubids(manifest);

    const wrap = document.createElement("div");
    wrap.className = "slot";

    const grid = document.createElement("div");
    grid.className = "between-grid";

    for (let i = 1; i <= slotCount; i++) {
      const slot = document.createElement("div");
      slot.className = "slot";

      slot.appendChild(
        makeIns(
          ZONES.betweenMulti,
          subids.between,
          subids.work,
          Number(`${groupNumber}${i}`)
        )
      );

      grid.appendChild(slot);
    }

    wrap.appendChild(grid);
    return wrap;
  }

  function endAds(manifest, count) {
    const subids = getSubids(manifest);

    const wrap = document.createElement("div");
    wrap.className = "slot";

    const grid = document.createElement("div");
    grid.className = "end-grid";

    for (let i = 1; i <= count; i++) {
      const slot = document.createElement("div");
      slot.className = "slot";

      slot.appendChild(
        makeIns(
          ZONES.betweenMulti,
          subids.between,
          subids.work,
          9000 + i
        )
      );

      grid.appendChild(slot);
    }

    wrap.appendChild(grid);
    return wrap;
  }

  function fillRailStacks(subids) {
    const leftSlots = [
      "leftRailSlot1",
      "leftRailSlot2",
      "leftRailSlot3",
      "leftRailSlot4",
      "leftRailSlot5",
      "leftRailSlot6"
    ];

    const rightSlots = [
      "rightRailSlot1",
      "rightRailSlot2",
      "rightRailSlot3",
      "rightRailSlot4",
      "rightRailSlot5",
      "rightRailSlot6"
    ];

    leftSlots.forEach((id, index) => {
      fillSlot(
        document.getElementById(id),
        ZONES.leftRail,
        subids.left,
        subids.work,
        index + 1
      );
    });

    rightSlots.forEach((id, index) => {
      fillSlot(
        document.getElementById(id),
        ZONES.rightRail,
        subids.right,
        subids.work,
        index + 1
      );
    });
  }

  function renderWorksNav() {
    const nav = document.getElementById("worksNav");
    if (!nav) return;

    let html = "";

    for (const work of ARCHIVE_WORKS.filter(w => w.top_pill !== false)) {
      const isActive = normalizeKey(work.slug) === normalizeKey(CURRENT_WORK?.slug);
      const entries = Array.isArray(work.entries) ? work.entries : [];

      html += `
        <div class="topworks-item${isActive ? " active" : ""}">
          <button class="topworks-trigger" type="button">
            <span>${escapeHtml(work.display || titleCaseSlug(work.slug))}</span>
            <span class="topworks-caret"></span>
          </button>
          <div class="topworks-flyout">
            <div class="topworks-links">
      `;

      for (const entry of entries) {
        const label = `${work.display || titleCaseSlug(work.slug)} · ${entry.subtitle || titleCaseSlug(entry.slug)}`;
        const active =
          isActive && normalizeKey(entry.slug) === normalizeKey(CURRENT_ENTRY?.slug)
            ? " active"
            : "";

        html += `
          <a
            href="?dir=${encodeURIComponent(work.slug)}&file=${encodeURIComponent(entry.slug)}"
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
      switchEntry(a.dataset.dir, a.dataset.file, false);
    };
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

  async function buildReader() {
    const reader = document.getElementById("reader");
    if (!reader) return;

    const state = getQueryState();
    let resolved = resolveSelection(state.dir, state.file);

    if (!resolved) {
      const first = getFirstEntry();
      resolved = first.work && first.entry ? first : null;
      if (resolved) {
        setQueryState(resolved.work.slug, resolved.entry.slug, true);
      }
    }

    if (!resolved) {
      throw new Error("No works found in library.json");
    }

    CURRENT_WORK = resolved.work;
    CURRENT_ENTRY = resolved.entry;

    const entryPath = resolved.entry.path || resolved.entry.slug;
    const itemUrl = buildItemJsonPath(resolved.work.slug, entryPath);
    const manifest = await fetchJson(itemUrl);

    CURRENT_ITEM = manifest;

    const title = `${resolved.work.display || titleCaseSlug(resolved.work.slug)} · ${manifest.subtitle || resolved.entry.subtitle || titleCaseSlug(resolved.entry.slug)}`;
    const workTitleEl = document.getElementById("workTitle");
    if (workTitleEl) {
      workTitleEl.textContent = title;
    }

    renderWorksNav();

    const subids = getSubids(manifest);

    fillSlot(
      document.getElementById("topBannerSlot"),
      ZONES.topBanner,
      subids.top,
      subids.work,
      1
    );

    fillRailStacks(subids);

    reader.innerHTML = "";

    const note = document.createElement("div");
    note.className = "note";
    note.textContent = "At most they simply have to scroll. And that’s easy.";
    reader.appendChild(note);

    const images = buildImageList(manifest);
    const base = normalizeBaseUrl(manifest.base_url);

    if (!base) {
      throw new Error(`Manifest for ${resolved.entry.slug} is missing base_url`);
    }

    if (!images.length) {
      throw new Error(`Manifest for ${resolved.entry.slug} has no images`);
    }

    const betweenEvery = Number(manifest.ads?.between_every) || 0;
    const betweenSlots = Number(manifest.ads?.between_slots) || 3;
    const finalBlock = Number(manifest.ads?.final_block) || 0;

    let groupNumber = 0;

    for (let i = 0; i < images.length; i++) {
      reader.appendChild(
        imageBlock(
          `${base}/${images[i]}`,
          `${manifest.title || resolved.work.display || resolved.work.slug} page ${i + 1}`
        )
      );

      const pageNumber = i + 1;
      const shouldInsertBetween =
        betweenEvery > 0 &&
        pageNumber % betweenEvery === 0 &&
        pageNumber < images.length;

      if (shouldInsertBetween) {
        groupNumber += 1;
        reader.appendChild(betweenAd(manifest, groupNumber, betweenSlots));
      }
    }

    if (finalBlock > 0) {
      reader.appendChild(endAds(manifest, finalBlock));
    }

    serveAds();
  }

  async function switchEntry(dir, file, replace = false) {
    setQueryState(dir, file, replace);
    await buildReader();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function boot() {
    await loadLibrary();
    wireTopFlyouts();
    await buildReader();

    window.addEventListener("popstate", async () => {
      await buildReader();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    boot().catch(err => {
      console.error(err);

      const workTitleEl = document.getElementById("workTitle");
      if (workTitleEl) {
        workTitleEl.textContent = "Failed to load work";
      }

      const reader = document.getElementById("reader");
      if (reader) {
        reader.innerHTML = `
          <div class="note">
            Failed to load this work. Please check library.json, item.json, base_url, and image filenames.
          </div>
        `;
      }
    });
  });
})();
