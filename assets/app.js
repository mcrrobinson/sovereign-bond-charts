(async function () {
  const data = await d3.json("data/data.json");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DURATION = reduceMotion ? 0 : 650;

  // ---------- data helpers ----------

  const monthShift = (ym, months) => {
    const [y, m] = ym.split("-").map(Number);
    const t = y * 12 + (m - 1) + months;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
  };
  // Value for a month, falling back up to two months earlier to bridge reporting gaps.
  const valueAt = (series, ym) => {
    for (let k = 0; k <= 2; k++) {
      const v = series[monthShift(ym, -k)];
      if (v != null) return v;
    }
    return null;
  };
  const latestKey = (series) => Object.keys(series).sort().at(-1);
  const monthName = (ym) => d3.timeFormat("%b %Y")(d3.timeParse("%Y-%m")(ym));

  // The debt series runs into this year's IMF forecast; "where countries stand" uses the latest estimate.
  const lastDebtYear = data.debtForecastFrom - 1;
  const lastMonth = d3.max(data.countries, (c) => latestKey(data.series[c.iso3].yield));

  const rows = data.countries.map((c) => {
    const s = data.series[c.iso3];
    const month = latestKey(s.yield);
    const debtYear = lastDebtYear;
    return {
      ...c,
      month,
      debtYear,
      yield: s.yield[month],
      neer: valueAt(s.neer, month),
      debt: s.debt[debtYear],
      // Change over one calendar year: December to December for yield and currency, and the
      // year-on-year change in debt. The current year runs from December to the latest month.
      change(year) {
        const from = `${year - 1}-12`;
        const to = year === data.debtForecastFrom ? lastMonth : `${year}-12`;
        const y0 = valueAt(s.yield, from), y1 = valueAt(s.yield, to);
        const n0 = valueAt(s.neer, from), n1 = valueAt(s.neer, to);
        const d0 = s.debt[year - 1], d1 = s.debt[year];
        if ([y0, y1, n0, n1, d0, d1].some((v) => v == null)) return null;
        return { dYield: y1 - y0, dDebt: d1 - d0, dFx: (n1 / n0 - 1) * 100 };
      },
    };
  });

  const groupColor = (g) => (g === "em" ? "var(--s-em)" : "var(--s-adv)");
  const groupName = (g) => (g === "em" ? "Emerging market" : "Advanced economy");
  const signed = (v, digits = 2) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(digits);

  // ---------- tooltip ----------

  const tip = document.getElementById("tip");
  const showTip = (el, html) => {
    const b = el.getBoundingClientRect();
    tip.innerHTML = html;
    tip.hidden = false;
    const w = tip.offsetWidth;
    const x = Math.min(Math.max(b.left + b.width / 2, w / 2 + 8), window.innerWidth - w / 2 - 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${b.top}px`;
  };
  const hideTip = () => (tip.hidden = true);
  window.addEventListener("scroll", hideTip, { passive: true });
  const tipRow = (label, value) => `<div class="row"><span>${label}</span><span>${value}</span></div>`;

  // ---------- label placement ----------

  // Greedy: try right, left, above, below each bubble; keep the first spot that
  // clears every other bubble and every label already placed.
  function placeLabels(nodes, width, height) {
    const CH = 6.6, H = 11, placed = [];
    const hitsCircle = (box, n) => {
      const cx = Math.max(box.x0, Math.min(n.x, box.x1));
      const cy = Math.max(box.y0, Math.min(n.y, box.y1));
      return (cx - n.x) ** 2 + (cy - n.y) ** 2 < (n.r + 1) ** 2;
    };
    const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    for (const n of [...nodes].sort((a, b) => b.r - a.r)) {
      const w = n.label.length * CH, g = 3;
      const cands = [
        { x: n.x + n.r + g, y: n.y + 4, anchor: "start", box: [n.x + n.r + g, n.y - H / 2, n.x + n.r + g + w, n.y + H / 2] },
        { x: n.x - n.r - g, y: n.y + 4, anchor: "end", box: [n.x - n.r - g - w, n.y - H / 2, n.x - n.r - g, n.y + H / 2] },
        { x: n.x, y: n.y - n.r - g - 2, anchor: "middle", box: [n.x - w / 2, n.y - n.r - g - H, n.x + w / 2, n.y - n.r - g] },
        { x: n.x, y: n.y + n.r + g + 9, anchor: "middle", box: [n.x - w / 2, n.y + n.r + g, n.x + w / 2, n.y + n.r + g + H] },
        { x: n.x + n.r * 0.7 + g, y: n.y - n.r * 0.7 - 2, anchor: "start", box: [n.x + n.r * 0.7 + g, n.y - n.r * 0.7 - g - H, n.x + n.r * 0.7 + g + w, n.y - n.r * 0.7 - g] },
        { x: n.x - n.r * 0.7 - g, y: n.y - n.r * 0.7 - 2, anchor: "end", box: [n.x - n.r * 0.7 - g - w, n.y - n.r * 0.7 - g - H, n.x - n.r * 0.7 - g, n.y - n.r * 0.7 - g] },
        { x: n.x + n.r * 0.7 + g, y: n.y + n.r * 0.7 + 9, anchor: "start", box: [n.x + n.r * 0.7 + g, n.y + n.r * 0.7 + g - 2, n.x + n.r * 0.7 + g + w, n.y + n.r * 0.7 + g + H - 2] },
        { x: n.x - n.r * 0.7 - g, y: n.y + n.r * 0.7 + 9, anchor: "end", box: [n.x - n.r * 0.7 - g - w, n.y + n.r * 0.7 + g - 2, n.x - n.r * 0.7 - g, n.y + n.r * 0.7 + g + H - 2] },
      ].map((c) => ({ ...c, box: { x0: c.box[0], y0: c.box[1], x1: c.box[2], y1: c.box[3] } }));
      const inside = (b) => b.x0 >= 0 && b.x1 <= width && b.y0 >= 0 && b.y1 <= height;
      const ok = (c) => inside(c.box) && !placed.some((p) => overlaps(p, c.box)) && !nodes.some((o) => o !== n && hitsCircle(c.box, o));
      // No clear spot: leave the bubble unlabelled rather than overprint; hover still names it.
      const pick = cands.find(ok);
      if (pick) placed.push(pick.box);
      Object.assign(n, pick ? { lx: pick.x, ly: pick.y, anchor: pick.anchor, show: true } : { lx: n.x, ly: n.y, anchor: "middle", show: false });
    }
  }

  // ---------- generic bubble chart ----------

  function bubbleChart(container, opts) {
    const W = 1000, H = 560, m = { l: 64, r: 24, t: 18, b: 54 };
    const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", opts.aria);
    const gridX = svg.append("g").attr("class", "grid");
    const gridY = svg.append("g").attr("class", "grid");
    const zeros = svg.append("g");
    svg.append("line").attr("class", "baseline").attr("x1", m.l).attr("x2", W - m.r).attr("y1", H - m.b).attr("y2", H - m.b);
    const axX = svg.append("g").attr("transform", `translate(0,${H - m.b})`);
    const axY = svg.append("g").attr("transform", `translate(${m.l},0)`);
    svg.append("text").attr("class", "axis-title").attr("x", (W + m.l - m.r) / 2).attr("y", H - 12).attr("text-anchor", "middle").text(opts.xTitle);
    svg.append("text").attr("class", "axis-title").attr("transform", `translate(16 ${(H - m.b + m.t) / 2}) rotate(-90)`).attr("text-anchor", "middle").text(opts.yTitle);
    const mark = svg.append("text").attr("class", "watermark").attr("x", W - m.r - 12).attr("y", H - m.b - 14).attr("text-anchor", "end");
    const bubbles = svg.append("g");
    const labels = svg.append("g");
    let first = true; // draw the first frame complete, animate only later updates

    function update(items, { x, y, xTicks, yTicks, xFmt, yFmt, watermark = "", duration = DURATION }) {
      x.range([m.l, W - m.r]);
      y.range([H - m.b, m.t]);
      mark.text(watermark);
      const t = svg.transition().duration(first || reduceMotion ? 0 : duration).ease(d3.easeCubicInOut);
      first = false;

      const styleAxis = (g) => g.call((s) => s.select(".domain").remove()).call((s) => s.selectAll(".tick line").remove());
      axX.transition(t).call(d3.axisBottom(x).tickValues(xTicks).tickFormat(xFmt).tickSize(0).tickPadding(10)).call(styleAxis);
      axY.transition(t).call(d3.axisLeft(y).tickValues(yTicks).tickFormat(yFmt).tickSize(0).tickPadding(10)).call(styleAxis);
      gridX.selectAll("line").data(xTicks, (d) => d).join(
        (e) => e.append("line").attr("y1", m.t).attr("y2", H - m.b).attr("x1", x).attr("x2", x),
        (u) => u.call((u) => u.transition(t).attr("x1", x).attr("x2", x)),
      );
      gridY.selectAll("line").data(yTicks, (d) => d).join(
        (e) => e.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y).attr("y2", y),
        (u) => u.call((u) => u.transition(t).attr("y1", y).attr("y2", y)),
      );
      const zeroLines = [];
      if (opts.zeroLines) {
        zeroLines.push({ k: "x", x1: x(0), x2: x(0), y1: m.t, y2: H - m.b });
        zeroLines.push({ k: "y", x1: m.l, x2: W - m.r, y1: y(0), y2: y(0) });
      }
      zeros.selectAll("line").data(zeroLines, (d) => d.k).join("line").attr("class", "zero")
        .transition(t).attr("x1", (d) => d.x1).attr("x2", (d) => d.x2).attr("y1", (d) => d.y1).attr("y2", (d) => d.y2);

      const nodes = items.map((d) => ({ d, x: x(d.x), y: y(d.y), r: d.r, label: d.label || d.iso2 }));
      placeLabels(nodes, W, H - m.b);
      nodes.sort((a, b) => b.r - a.r); // big ones underneath

      bubbles.selectAll("g.bubble").data(nodes, (n) => n.d.iso3).join(
        (e) => {
          const g = e.append("g").attr("class", "bubble").attr("tabindex", 0).attr("transform", (n) => `translate(${n.x},${n.y})`);
          g.append("circle").attr("r", (n) => n.r);
          return g;
        },
        (u) => u,
        (x) => x.remove(),
      )
        .order()
        .attr("aria-label", (n) => n.d.aria)
        .classed("hollow", (n) => n.d.hollow)
        .on("mouseenter focus", function (_, n) { showTip(this.querySelector("circle"), n.d.tip); })
        .on("mouseleave blur", hideTip)
        .call((g) => g.transition(t).attr("transform", (n) => `translate(${n.x},${n.y})`))
        .select("circle")
        .call((c) => c.transition(t).attr("r", (n) => n.r)
          .attr("fill", (n) => (n.d.hollow ? "var(--surface)" : groupColor(n.d.group)))
          .style("stroke", (n) => (n.d.hollow ? groupColor(n.d.group) : null)));

      labels.selectAll("text").data(nodes, (n) => n.d.iso3).join((e) => e.append("text").attr("class", "lbl").attr("x", (n) => n.lx).attr("y", (n) => n.ly))
        .text((n) => n.label)
        .attr("text-anchor", (n) => n.anchor)
        .attr("visibility", (n) => (n.show ? null : "hidden"))
        .transition(t).attr("x", (n) => n.lx).attr("y", (n) => n.ly);
    }
    return { update };
  }

  // Draws a row of reference circles so bubble size can be read.
  function sizeKey(el, entries) {
    el.innerHTML = entries.map(({ r, label, hollow }) => {
      const s = Math.ceil(r * 2 + 4);
      const fill = hollow ? "var(--surface)" : "var(--muted)";
      const stroke = hollow ? "var(--muted)" : "none";
      return `<span class="k"><svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/></svg>${label}</span>`;
    }).join("");
  }

  // ---------- chart 1: levels ----------

  // Size by the move since 2020 rather than the index itself: indices cluster around 100,
  // so area proportional to the index makes every bubble look the same.
  const R1 = 28; // radius at the largest move
  const vs2020 = (v) => v - 100;
  const maxMove = d3.max(rows, (r) => Math.abs(vs2020(r.neer))) || 1;
  const rNeer = (v) => Math.max(3, Math.sqrt(Math.abs(vs2020(v)) / maxMove) * R1);
  const pct = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
  const months = [...new Set(rows.map((r) => r.month))].sort();
  document.getElementById("levels-sub").textContent =
    `10-year yield: ${monthName(months.at(-1))} average` +
    (months.length > 1 ? ` (${rows.filter((r) => r.month !== months.at(-1)).map((r) => `${r.iso2} ${monthName(r.month)}`).join(", ")})` : "") +
    ` · Debt: ${rows[0].debtYear} · Currency: same month as yield`;
  sizeKey(document.getElementById("levels-key"), [
    { r: rNeer(110), label: "10%" }, { r: rNeer(130), label: "30% vs 2020" },
    { r: 7, label: "Solid: stronger than 2020" }, { r: 7, label: "Ring: weaker than 2020", hollow: true },
  ]);

  const levels = bubbleChart(document.getElementById("levels"), {
    aria: "Bubble chart of government debt to GDP against 10-year bond yield, sized by currency change since 2020",
    xTitle: "Government debt, % of GDP →",
    yTitle: "10-year bond yield (log scale) →",
  });
  const maxDebt = d3.max(rows, (r) => r.debt);
  levels.update(
    rows.map((r) => ({
      ...r, x: r.debt, y: r.yield, r: rNeer(r.neer), hollow: r.neer < 100,
      aria: `${r.name}: debt ${r.debt.toFixed(0)}% of GDP, yield ${r.yield.toFixed(2)}%, currency ${pct(vs2020(r.neer))} vs 2020`,
      tip: `<b>${r.name}</b>` +
        tipRow("10-year yield", `${r.yield.toFixed(2)}%`) +
        tipRow(`Debt / GDP (${r.debtYear})`, `${r.debt.toFixed(1)}%`) +
        tipRow(r.euro ? "Euro vs 2020" : "Currency vs 2020", pct(vs2020(r.neer))) +
        tipRow("Month", monthName(r.month)),
    })),
    {
      x: d3.scaleLinear().domain([0, Math.ceil((maxDebt * 1.06) / 50) * 50]),
      y: d3.scaleLog().domain([0.3, 16]),
      xTicks: d3.range(0, Math.ceil((maxDebt * 1.06) / 50) * 50 + 1, 50),
      yTicks: [0.5, 1, 2, 5, 10],
      xFmt: (v) => `${v}%`,
      yFmt: (v) => `${v}%`,
    },
  );

  // ---------- chart 2: change year by year ----------

  const change = bubbleChart(document.getElementById("change"), {
    aria: "Animated bubble chart of each year's change in debt to GDP against the change in bond yield, sized by currency change",
    xTitle: "Change in debt over the year, percentage points of GDP →",
    yTitle: "Change in 10-year yield over the year, points →",
    zeroLines: true,
  });

  // Axes stay fixed across years so movement between frames means something. They cover
  // about 98% of country-years; the rest (the euro crisis, Ireland's 2015 GDP revision)
  // are pinned to the edge with an arrow, and the tooltip gives the real figure.
  const X2 = [-20, 30], Y2 = [-4, 4];
  const x2 = d3.scaleLinear().domain(X2), y2 = d3.scaleLinear().domain(Y2);
  const R2 = 26, FX_MAX = 20; // radius at a 20% currency move; bigger moves are capped
  const rFx = (v) => Math.max(3, Math.sqrt(Math.min(Math.abs(v), FX_MAX) / FX_MAX) * R2);
  sizeKey(document.getElementById("change-key"), [
    { r: rFx(5), label: "5%" }, { r: rFx(FX_MAX), label: `${FX_MAX}%+ currency move` },
    { r: 7, label: "Solid: currency strengthened" }, { r: 7, label: "Ring: currency weakened", hollow: true },
  ]);

  const firstYear = +d3.min(data.countries, (c) => Object.keys(data.series[c.iso3].yield).sort()[0]).slice(0, 4) + 1;
  const lastYear = data.debtForecastFrom;
  const isPartial = (year) => year === lastYear;
  const yearName = (year) => (isPartial(year) ? `${year} to ${d3.timeFormat("%b")(d3.timeParse("%Y-%m")(lastMonth))}` : `${year}`);
  const pin = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));

  function drawChange(year, duration) {
    const items = rows.map((r) => ({ r, c: r.change(year) })).filter((o) => o.c);
    document.getElementById("change-sub").textContent = isPartial(year)
      ? `${year} so far: yields and currency Dec ${year - 1} → ${monthName(lastMonth)}, debt is the IMF forecast for ${year}`
      : `${year}: yields and currency Dec ${year - 1} → Dec ${year}, debt ${year - 1} → ${year}` +
        (year === lastDebtYear ? " (IMF estimate)" : "");

    change.update(
      items.map(({ r, c }) => {
        const arrow = (c.dDebt > X2[1] ? "→" : c.dDebt < X2[0] ? "←" : "") + (c.dYield > Y2[1] ? "↑" : c.dYield < Y2[0] ? "↓" : "");
        return {
          ...r, x: pin(c.dDebt, X2), y: pin(c.dYield, Y2), r: rFx(c.dFx), hollow: c.dFx < 0,
          label: r.iso2 + (arrow ? ` ${arrow}` : ""),
          aria: `${r.name}, ${yearName(year)}: debt ${signed(c.dDebt, 1)} points, yield ${signed(c.dYield)} points, currency ${signed(c.dFx, 1)}%` +
            (arrow ? " (off the chart; pinned to the edge)" : ""),
          tip: `<b>${r.name}, ${yearName(year)}</b>` +
            tipRow("Yield change", `${signed(c.dYield)} pts`) +
            tipRow(isPartial(year) ? "Debt/GDP (forecast)" : "Debt/GDP change", `${signed(c.dDebt, 1)} pts`) +
            tipRow(r.euro ? "Euro" : "Currency", `${signed(c.dFx, 1)}%`) +
            (arrow ? tipRow("Off the chart", arrow) : ""),
        };
      }),
      {
        x: x2, y: y2,
        xTicks: d3.range(X2[0], X2[1] + 1, 5), yTicks: d3.range(Y2[0], Y2[1] + 1, 1),
        xFmt: (v) => (v === 0 ? "0" : signed(v, 0)),
        yFmt: (v) => (v === 0 ? "0" : signed(v, 0)),
        watermark: yearName(year),
        duration,
      },
    );
    renderTable(year);
  }

  // ---------- table ----------

  function renderTable(year) {
    const unit = yearName(year);
    const head = `<thead><tr><th>Country</th><th>Group</th><th class="n">Yield</th><th class="n">Debt/GDP</th><th class="n">Currency</th>` +
      `<th class="n">Δ yield (${unit})</th><th class="n">Δ debt (${unit})</th><th class="n">Δ currency (${unit})</th></tr></thead>`;
    const body = [...rows].sort((a, b) => b.debt - a.debt).map((r) => {
      const c = r.change(year);
      const cell = (v, d, suffix = "") => `<td class="n">${c ? signed(v, d) + suffix : "–"}</td>`;
      return `<tr><td>${r.name}</td><td>${r.group === "em" ? "Emerging" : "Advanced"}</td>` +
        `<td class="n">${r.yield.toFixed(2)}%</td><td class="n">${r.debt.toFixed(1)}%</td><td class="n">${r.neer.toFixed(1)}</td>` +
        cell(c && c.dYield, 2) + cell(c && c.dDebt, 1) + cell(c && c.dFx, 1, "%") + "</tr>";
    }).join("");
    document.getElementById("tbl").innerHTML = head + "<tbody>" + body + "</tbody>";
  }

  // ---------- year slider and play button ----------

  const FRAME_MS = 1100;
  const slider = document.getElementById("year");
  const out = document.getElementById("year-out");
  const play = document.getElementById("play");
  slider.min = firstYear;
  slider.max = lastYear;
  document.getElementById("year-min").textContent = firstYear;
  document.getElementById("year-max").textContent = lastYear;
  let timer = null;

  const show = (year, duration) => {
    slider.value = year;
    out.textContent = yearName(year);
    slider.setAttribute("aria-valuetext", yearName(year));
    drawChange(year, duration);
  };
  const stop = () => {
    clearInterval(timer);
    timer = null;
    play.setAttribute("aria-pressed", "false");
    play.setAttribute("aria-label", "Play");
  };
  play.addEventListener("click", () => {
    if (timer) return stop();
    if (+slider.value >= lastYear) show(firstYear);
    play.setAttribute("aria-pressed", "true");
    play.setAttribute("aria-label", "Pause");
    timer = setInterval(() => {
      const next = +slider.value + 1;
      if (next > lastYear) return stop();
      show(next, FRAME_MS * 0.85);
      if (next === lastYear) stop();
    }, FRAME_MS);
  });
  slider.addEventListener("input", () => {
    stop();
    show(+slider.value, 350);
  });
  // Open on ?year=YYYY if given, otherwise the latest full year.
  const asked = +new URLSearchParams(location.search).get("year");
  show(asked >= firstYear && asked <= lastYear ? asked : lastDebtYear);

  // ---------- sources ----------

  document.getElementById("src").innerHTML =
    `<p>Data refreshed ${data.updated}. Yields: ${data.sources.yield} (<a href="https://data-explorer.oecd.org/">OECD</a>). ` +
    `Currency: ${data.sources.neer} (<a href="https://data.bis.org/topics/EER">BIS</a>). ` +
    `Debt: ${data.sources.debt} (<a href="https://www.imf.org/external/datamapper/GGXWDG_NGDP@WEO">IMF</a>); the latest year is an IMF estimate.</p>` +
    `<p>Yields are monthly averages, so they can differ from today's market quote. Brazil, Turkey, Singapore and Indonesia are left out because no free source publishes a current, comparable 10-year yield for them.</p>`;
})();
