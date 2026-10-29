/* Sasta landing site — vanilla JS, no dependencies. */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(pointer: fine)").matches;
  const EASE = "cubic-bezier(.22,1,.36,1)";

  const PLATFORMS = [
    { k: "b", name: "Blinkit", l: "B" },
    { k: "z", name: "Zepto", l: "Z" },
    { k: "i", name: "Instamart", l: "I" },
    { k: "bb", name: "BigBasket", l: "bb" },
    { k: "f", name: "Flipkart Minutes", l: "F" },
    { k: "a", name: "Amazon Now", l: "a" },
  ];
  const BY = Object.fromEntries(PLATFORMS.map((p) => [p.k, p]));
  const COLOR = { b: "#f8cb46", z: "#7a3cc0", i: "#fc8019", bb: "#84c225", f: "#2874f0", a: "#ff9900" };
  const tile = (k, cls = "") => `<span class="pt p-${k} ${cls}" aria-hidden="true">${BY[k].l}</span>`;

  /* ---------- reveals ---------- */
  $$("[data-lines]").forEach((h) => $$(".line", h).forEach((l, i) => l.style.setProperty("--li", i)));
  ["[data-hv]", ".live"].forEach((s) => { const e = $(s); if (e) e.setAttribute("data-reveal", ""); });
  const targets = $$("[data-reveal], [data-lines]");
  const sib = new Map();
  targets.forEach((el) => {
    if (!el.matches("[data-reveal]")) return;
    const n = sib.get(el.parentElement) || 0;
    sib.set(el.parentElement, n + 1);
    el.style.setProperty("--d", Math.min(n, 7) * 80 + "ms");
  });
  const revealIO = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); revealIO.unobserve(e.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.1 });

  /* ---------- pointer effects ---------- */
  const mouse = { x: -999, y: -999, on: false };
  addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = e.pointerType === "mouse"; }, { passive: true });
  document.addEventListener("pointerleave", () => { mouse.on = false; });
  if (fine && !reduce) {
    $$("[data-magnetic]").forEach((b) => {
      b.addEventListener("pointermove", (e) => {
        const r = b.getBoundingClientRect();
        b.style.setProperty("--tx", (e.clientX - r.left - r.width / 2) * 0.22 + "px");
        b.style.setProperty("--ty", (e.clientY - r.top - r.height / 2) * 0.32 + "px");
      });
      b.addEventListener("pointerleave", () => { b.style.setProperty("--tx", "0px"); b.style.setProperty("--ty", "0px"); });
    });
  }
  $$("[data-spotlight]").forEach((c) => c.addEventListener("pointermove", (e) => {
    const r = c.getBoundingClientRect();
    c.style.setProperty("--mx", e.clientX - r.left + "px");
    c.style.setProperty("--my", e.clientY - r.top + "px");
  }));

  /* ---------- counters ---------- */
  const countIO = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    countIO.unobserve(e.target);
    const el = e.target, to = parseInt(el.dataset.count, 10);
    if (reduce || to === 0) { el.textContent = to; return; }
    const t0 = performance.now();
    const step = (now) => {
      const p = clamp((now - t0) / 1400);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 4)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), { threshold: 0.6 });
  $$("[data-count]").forEach((el) => countIO.observe(el));

  /* ---------- background canvas ---------- */
  const cv = $("#bg"), ctx = cv.getContext("2d");
  let W = 0, H = 0, parts = [], running = !reduce, scrollY = 0;
  const G = 40;
  const sizeCanvas = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = clamp(Math.round((W * H) / 36000), 14, 48);
    parts = Array.from({ length: n }, (_, i) => ({
      x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.18, vy: -0.05 - Math.random() * 0.22,
      r: 0.8 + Math.random() * 1.2, a: 0.14 + Math.random() * 0.3, hot: i % 5 === 0,
    }));
    paint(0);
  };
  const paint = (t) => {
    ctx.clearRect(0, 0, W, H);
    const oy = reduce ? 0 : -(scrollY * 0.12) % G;
    const mx = mouse.on ? mouse.x : -9999, my = mouse.y;
    ctx.fillStyle = "#fff";
    for (let y = oy; y < H + G; y += G) {
      for (let x = G / 2; x < W + G; x += G) {
        let a = 0.06 + 0.035 * Math.sin(x * 0.011 + y * 0.009 + t * 0.0006);
        const dx = x - mx, dy = y - my, d2 = dx * dx + dy * dy;
        if (d2 < 36000) a += (1 - d2 / 36000) * 0.5;
        ctx.globalAlpha = a;
        ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
      }
    }
    for (const p of parts) {
      ctx.globalAlpha = p.a;
      ctx.fillStyle = p.hot ? "#f39a40" : "#fff";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
      if (!reduce) {
        p.x += p.vx; p.y += p.vy;
        if (p.y < -6) { p.y = H + 6; p.x = Math.random() * W; }
        if (p.x < -6) p.x = W + 6; else if (p.x > W + 6) p.x = -6;
      }
    }
    ctx.globalAlpha = 1;
  };
  let raf = 0;
  const loop = (t) => { paint(t); raf = running ? requestAnimationFrame(loop) : 0; };
  sizeCanvas();
  if (!reduce) raf = requestAnimationFrame(loop);
  document.addEventListener("visibilitychange", () => {
    if (reduce) return;
    running = !document.hidden;
    if (running && !raf) raf = requestAnimationFrame(loop);
  });

  /* ---------- hero visual ---------- */
  const hv = $("[data-hv]"), stage = $("[data-stage]"), core = $("[data-core]");
  const HERO = { b: 17, z: 15, i: 18, bb: 15, f: 19, a: 20 };
  const RANK = ["bb", "z", "b", "i", "f", "a"];
  const SLOT = { b: [-118, -190], z: [122, -135], i: [-128, -48], bb: [130, 52], f: [-120, 132], a: [95, 198] };
  const orbs = [];
  PLATFORMS.forEach((p, idx) => {
    const rank = RANK.indexOf(p.k);
    const el = document.createElement("div");
    el.className = "orb" + (rank === 0 ? " orb--best" : rank === 1 ? " orb--tie" : "");
    el.style.setProperty("--i", idx);
    const badge = rank === 0 ? "Cheapest" : rank === 1 ? "Same price" : "";
    el.innerHTML = `<div class="orb__in" style="--i:${idx}"><span class="orb__rank">${rank + 1}</span><div class="pill">${tile(p.k)}<b>${p.k === "f" ? "Flipkart" : p.name}</b><output>₹${HERO[p.k]}</output></div>${badge ? `<span class="orb__badge">${badge}</span>` : ""}</div>`;
    stage.appendChild(el);
    orbs.push({ el, k: p.k, rank });
  });
  const jit = () => (Math.random() - 0.5) * 20;
  let sorted = false, hvTimer = 0;
  const place = () => {
    orbs.forEach((o) => {
      const [dx, dy] = SLOT[o.k];
      const x = sorted ? 160 : 260 + dx - 100 + jit();
      const y = sorted ? 96 + o.rank * 64 : 260 + dy - 24 + jit();
      o.el.style.setProperty("--x", x + "px");
      o.el.style.setProperty("--y", y + "px");
    });
    core.style.setProperty("--x", (sorted ? 195 : 195) + "px");
    core.style.setProperty("--y", (sorted ? 28 : 241) + "px");
  };
  const fitHero = () => {
    const w = hv.clientWidth || 520;
    const s = Math.min(1, w / 520, Math.max(0.62, (innerHeight - 200) / 520));
    hv.style.setProperty("--hs", s.toFixed(3));
  };
  const cycle = () => {
    if (document.hidden) { hvTimer = setTimeout(cycle, 1000); return; }
    sorted = !sorted;
    hv.classList.toggle("is-sorted", sorted);
    place();
    hvTimer = setTimeout(cycle, sorted ? 4600 : 3200);
  };
  function startHero() {
    if (reduce) { sorted = true; hv.classList.add("is-sorted"); place(); return; }
    hvTimer = setTimeout(cycle, 1900);
  }
  place(); fitHero();

  // status card bars
  const barsEl = $("[data-bars]");
  const barPrices = RANK.map((k) => [k, HERO[k]]);
  barsEl.innerHTML = barPrices.map(([k, p], i) =>
    `<div class="bar${p === 15 ? " is-best" : ""}" style="--bi:${i}"><i class="bar__b" data-h="${Math.round(((p - 10) / 10) * 100)}"></i><i class="bar__d" style="background:${COLOR[k]}"></i></div>`).join("");
  const barIO = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    barIO.disconnect();
    $$(".bar__b", barsEl).forEach((b) => { b.style.height = b.dataset.h + "%"; });
  }));
  barIO.observe(barsEl);

  /* ---------- nav + progress + tour (one rAF-throttled scroll pass) ---------- */
  const nav = $("[data-nav]");
  const links = $$(".nav__links a");
  const linkTargets = links.map((a) => $(a.getAttribute("href")));
  const progressEls = $$("[data-progress]");
  const steps = $$(".step"), screens = $$("[data-screens] .screen"), dots = $$("[data-dots] button");
  let lastY = scrollY, activeStep = -1, ps = 1;

  steps.forEach((s, i) => {
    const host = $(".step__phone", s);
    host.innerHTML = '<div class="phone" aria-hidden="true"><div class="phone__screen"></div></div>';
    const c = screens[i].cloneNode(true);
    c.classList.add("is-on");
    $(".phone__screen", host).appendChild(c);
  });
  const setStep = (i) => {
    if (i === activeStep) return;
    activeStep = i;
    steps.forEach((s, k) => s.classList.toggle("is-on", k === i));
    screens.forEach((s, k) => s.classList.toggle("is-on", k === i));
    dots.forEach((d, k) => { d.classList.toggle("is-on", k === i); });
  };
  dots.forEach((d, i) => d.addEventListener("click", () => steps[i].scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" })));
  const fitTour = () => {
    ps = clamp((innerHeight - 190) / 626, 0.58, 1.1);
    document.documentElement.style.setProperty("--ps", ps.toFixed(3));
  };

  const frame = () => {
    scrollY = window.scrollY;
    const vh = innerHeight;
    // reads
    const cur = linkTargets.map((t) => (t ? t.getBoundingClientRect().top : 1e9));
    const prog = progressEls.map((el) => el.getBoundingClientRect().top);
    const stepMid = innerWidth > 960 ? steps.map((s) => { const r = s.getBoundingClientRect(); return Math.abs(r.top + r.height / 2 - vh / 2); }) : null;
    // writes
    nav.classList.toggle("is-scrolled", scrollY > 24);
    const down = scrollY > lastY + 4, up = scrollY < lastY - 4;
    if (down && scrollY > vh * 0.6 && !nav.contains(document.activeElement)) nav.classList.add("is-hidden");
    else if (up || scrollY < vh * 0.6) nav.classList.remove("is-hidden");
    if (down || up) lastY = scrollY;
    let current = -1;
    cur.forEach((top, i) => { if (top < vh * 0.45) current = i; });
    links.forEach((a, i) => a.classList.toggle("is-current", i === current));
    progressEls.forEach((el, i) => el.style.setProperty("--p", clamp((vh * 0.95 - prog[i]) / (vh * 0.5)).toFixed(3)));
    if (stepMid) setStep(stepMid.indexOf(Math.min(...stepMid)));
  };
  let queued = false;
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; frame(); }); } };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", () => { fitTour(); fitHero(); sizeCanvas(); onScroll(); });
  fitTour(); setStep(0); frame();
  // keep first step lit on narrow screens (all steps are visible there)
  if (innerWidth <= 960) steps.forEach((s) => s.classList.add("is-on"));

  /* ---------- interactive demo ---------- */
  const DEMO = {
    lays: { title: "Lay's India's Magic Masala", sub: "48 g · MRP ₹20", p: { b: [17, 13], z: [15, 16], i: [18, 22], bb: [15, 6], f: [19, 18], a: [20, 28] } },
    butter: { title: "Amul Butter", sub: "100 g · MRP ₹62", p: { b: [60, 12], z: [56, 9], i: [62, 17], bb: [57, 21], f: [61, 24], a: null } },
    maggi: { title: "Maggi 2-minute Masala Noodles", sub: "4-pack, 280 g · MRP ₹68", p: { b: [62, 11], z: [60, 14], i: [64, 19], bb: [59, 25], f: [66, 23], a: [63, 30] } },
    coke: { title: "Coca-Cola", sub: "750 ml · MRP ₹40", p: { b: [38, 10], z: [36, 12], i: [40, 18], bb: [38, 24], f: null, a: [35, 31] } },
    eggs: { title: "Farm Fresh Eggs", sub: "6 pcs · MRP ₹66", p: { b: [54, 10], z: [52, 11], i: [55, 20], bb: [58, 25], f: [56, 22], a: [60, 33] } },
  };
  const rowsEl = $("[data-d-rows]");
  const rowMap = {};
  PLATFORMS.forEach((p) => {
    const li = document.createElement("li");
    li.className = "drow";
    li.innerHTML = `<em></em>${tile(p.k)}<div class="n"><b>${p.name}</b><small></small></div><div class="r"><u></u><strong></strong></div>`;
    rowMap[p.k] = li;
    rowsEl.appendChild(li);
  });
  let curKey = "lays", demoTimer = 0;
  const q = (li, s) => $(s, li);
  const reveal = (animate) => {
    const d = DEMO[curKey];
    const live = PLATFORMS.filter((p) => d.p[p.k]).sort((x, y) => d.p[x.k][0] - d.p[y.k][0] || d.p[x.k][1] - d.p[y.k][1]);
    const oos = PLATFORMS.filter((p) => !d.p[p.k]);
    const order = [...live, ...oos];
    const best = d.p[live[0].k][0];
    const first = animate ? Object.fromEntries(order.map((p) => [p.k, rowMap[p.k].getBoundingClientRect().top])) : null;
    order.forEach((p, i) => {
      const li = rowMap[p.k], v = d.p[p.k];
      li.classList.remove("is-wait", "is-best", "is-oos");
      q(li, "em").textContent = v ? i + 1 : "–";
      if (v) {
        const diff = v[0] - best;
        q(li, "small").textContent = v[1] + " min · in stock";
        q(li, "u").textContent = i === 0 ? "Cheapest" : diff === 0 ? "same" : "+₹" + diff;
        q(li, "strong").textContent = "₹" + v[0];
        if (i === 0) li.classList.add("is-best");
      } else {
        q(li, "small").textContent = "Out of stock";
        q(li, "u").textContent = "out";
        q(li, "strong").textContent = "—";
        li.classList.add("is-oos");
      }
      rowsEl.appendChild(li);
    });
    const worst = d.p[live[live.length - 1].k][0];
    $("[data-d-foot]").innerHTML = live.length > 1 && worst > best
      ? `Cheapest is <b>₹${worst - best} less</b> than the dearest in stock` + (oos.length ? ` · ${oos.length} out of stock` : "")
      : "Same price everywhere";
    if (!animate) return;
    order.forEach((p, i) => {
      const li = rowMap[p.k];
      const dy = first[p.k] - li.getBoundingClientRect().top;
      if (!dy) return;
      li.style.transition = "none";
      li.style.transform = `translateY(${dy}px)`;
    });
    rowsEl.offsetHeight; // commit start positions
    order.forEach((p, i) => {
      const li = rowMap[p.k];
      li.style.transition = `transform .95s ${EASE} ${i * 45}ms`;
      li.style.transform = "";
    });
    setTimeout(() => order.forEach((p) => { rowMap[p.k].style.transition = ""; }), 1400);
  };
  const play = (key, animate = true) => {
    curKey = key;
    clearTimeout(demoTimer);
    const d = DEMO[key];
    $("[data-d-title]").textContent = d.title;
    $("[data-d-sub]").textContent = d.sub;
    if (!animate || reduce) { reveal(false); return; }
    PLATFORMS.forEach((p) => {
      const li = rowMap[p.k];
      li.style.transition = ""; li.style.transform = "";
      li.classList.remove("is-best", "is-oos"); li.classList.add("is-wait");
      q(li, "em").textContent = "·"; q(li, "small").textContent = "searching…"; q(li, "strong").textContent = "···"; q(li, "u").textContent = "";
      rowsEl.appendChild(li);
    });
    $("[data-d-foot]").textContent = "Asking six apps…";
    demoTimer = setTimeout(() => reveal(true), 800);
  };
  const tabs = $$(".tab-pill");
  tabs.forEach((b) => b.addEventListener("click", () => {
    tabs.forEach((t) => { const on = t === b; t.classList.toggle("is-on", on); t.setAttribute("aria-pressed", on); });
    play(b.dataset.p);
  }));
  $("[data-d-replay]").addEventListener("click", () => play(curKey));
  play("lays", false);
  const demoIO = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { demoIO.disconnect(); setTimeout(() => play(curKey), 500); }
  }), { threshold: 0.45 });
  demoIO.observe($(".demo__panel"));

  /* ---------- FAQ accordion ---------- */
  $$(".faq details").forEach((d) => {
    const body = $(".faq__a", d);
    let anim = null;
    $("summary", d).addEventListener("click", (e) => {
      e.preventDefault();
      if (reduce) { d.open = !d.open; return; }
      if (anim) anim.cancel();
      if (d.open) {
        const h = body.offsetHeight;
        anim = body.animate({ height: [h + "px", "0px"] }, { duration: 360, easing: EASE });
        anim.onfinish = () => { d.open = false; anim = null; };
      } else {
        d.open = true;
        const h = body.offsetHeight;
        anim = body.animate({ height: ["0px", h + "px"] }, { duration: 460, easing: EASE });
        anim.onfinish = () => { anim = null; };
      }
    });
  });
  /* ---------- intro (runs last, once everything above exists) ---------- */
  const intro = () => {
  const startPage = () => {
    document.body.classList.remove("is-loading");
    targets.forEach((el) => revealIO.observe(el));
    startHero();
  };
  const counter = $("[data-intro-count]");
  let seen = false;
  try { seen = sessionStorage.getItem("sasta-intro") === "1"; } catch (e) { /* private mode */ }
  if (reduce || seen) {
    startPage();
  } else {
    const t0 = performance.now(), dur = 1250;
    const tick = (now) => {
      const p = clamp((now - t0) / dur);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      counter.textContent = String(Math.round(e * 6)).padStart(2, "0");
      if (p < 1) requestAnimationFrame(tick);
      else { try { sessionStorage.setItem("sasta-intro", "1"); } catch (e2) { /* ignore */ } setTimeout(startPage, 160); }
    };
    requestAnimationFrame(tick);
  }
  };
  intro();
})();
