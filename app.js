// 1) Paste your published CSV URL here:
const CSV_URL = "PASTE_YOUR_PUBLISHED_CSV_URL_HERE";

// --- UI state ---
let data = [];
let showMoreCols = false;
let sortKey = "Transition Score";
let sortDir = "desc";
let selectedId = null;

// Columns shown in the table (lean)
const baseCols = [
  { key:"Employee ID", label:"ID", sortable:true },
  { key:"Employee Name", label:"Employee", sortable:true },
  { key:"Role", label:"Role", sortable:true },
  { key:"Department", label:"Dept", sortable:true },
  { key:"Final Automation Risk (1-5)", label:"Automation Risk", sortable:true, render:(v)=>pillScore(v, true) },
  { key:"Final Future Role Fit (1-5)", label:"Future Fit", sortable:true, render:(v)=>pillScore(v, false) },
  { key:"Transition Score", label:"Transition Score", sortable:true, render:(v)=>pillTransition(v) },
  { key:"Recommendation", label:"Recommendation", sortable:true, render:(v)=>pillText(v) }
];

// Extra columns (optional)
const moreCols = [
  { key:"Skills", label:"Skills" },
  { key:"Domain", label:"Domain" },
  { key:"Estimated Reskill Cost", label:"Reskill Cost", sortable:true, render:(v)=>money(v) },
  { key:"External Hiring Cost", label:"Hire Cost", sortable:true, render:(v)=>money(v) },
  { key:"Time to Productivity (months)", label:"TTP (mo)", sortable:true }
];

const $ = (id)=>document.getElementById(id);

function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, (m)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}

function toNumber(v){
  const n = Number(String(v ?? "").replace(/[,₹\s]/g,""));
  return Number.isFinite(n) ? n : NaN;
}

function pillScore(v, isRisk){
  const n = toNumber(v);
  let cls = "good";
  if (n === 3) cls = "warn";
  if (n >= 4) cls = "bad";
  const label = isRisk ? `Risk ${isNaN(n) ? "-" : n}` : `Fit ${isNaN(n) ? "-" : n}`;
  return `<span class="pill ${cls}"><span class="mini"></span>${escapeHtml(label)}</span>`;
}

function pillTransition(v){
  const n = toNumber(v);
  let cls = "good";
  if (n < 3.2) cls = "warn";
  if (n < 2.2) cls = "bad";
  const show = Number.isFinite(n) ? n.toFixed(2) : "-";
  return `<span class="pill ${cls}"><span class="mini"></span>${show}</span>`;
}

function pillText(v){
  const s = String(v || "");
  let cls = "good";
  if (s.toLowerCase().includes("monitor")) cls = "warn";
  if (s.toLowerCase().includes("hire") || s.toLowerCase().includes("phase")) cls = "bad";
  return `<span class="pill ${cls}"><span class="mini"></span>${escapeHtml(s || "-")}</span>`;
}

function money(v){
  const n = toNumber(v);
  if (!Number.isFinite(n) || n === 0) return `<span class="muted">-</span>`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function getRiskBand(v){
  const n = toNumber(v);
  if (n <= 2) return "low";
  if (n === 3) return "mid";
  return "high";
}

function parseCSV(text){
  // Minimal CSV parser with quotes support
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i=0; i<text.length; i++){
    const ch = text[i];
    const next = text[i+1];

    if (ch === '"' && inQuotes && next === '"'){ cur += '"'; i++; continue; }
    if (ch === '"'){ inQuotes = !inQuotes; continue; }

    if (ch === "," && !inQuotes){
      row.push(cur); cur = ""; continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes){
      if (ch === "\r" && next === "\n") i++;
      row.push(cur); rows.push(row);
      row = []; cur = ""; continue;
    }
    cur += ch;
  }
  if (cur.length || row.length){ row.push(cur); rows.push(row); }

  const headers = rows.shift().map(h=>h.trim());
  return rows
    .filter(r=>r.some(x=>String(x).trim() !== ""))
    .map(r=>{
      const obj = {};
      headers.forEach((h, idx)=> obj[h] = (r[idx] ?? "").trim());
      return obj;
    });
}

function buildDropdown(id, values){
  const el = $(id);
  el.innerHTML = el.innerHTML.split("</option>")[0] + "</option>"; // keep first option only
  values.forEach(v=>{
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    el.appendChild(opt);
  });
}

function filtered(){
  const q = ($("search").value || "").trim().toLowerCase();
  const dept = $("dept").value;
  const rec = $("rec").value;
  const riskBand = $("riskBand").value;

  return data.filter(r=>{
    const hay = Object.values(r).join(" ").toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (dept && r["Department"] !== dept) return false;
    if (rec && r["Recommendation"] !== rec) return false;
    if (riskBand && getRiskBand(r["Final Automation Risk (1-5)"]) !== riskBand) return false;
    return true;
  });
}

function sortRows(rows){
  const key = sortKey;
  const dir = sortDir === "asc" ? 1 : -1;

  return rows.slice().sort((a,b)=>{
    const va = a[key];
    const vb = b[key];
    const na = toNumber(va), nb = toNumber(vb);
    const bothNum = Number.isFinite(na) && Number.isFinite(nb);
    if (bothNum) return (na - nb) * dir;
    return String(va||"").localeCompare(String(vb||"")) * dir;
  });
}

function renderCards(){
  const rows = filtered();
  const total = rows.length;
  const byRec = rows.reduce((acc,r)=>{
    const k = r["Recommendation"] || "Unspecified";
    acc[k] = (acc[k]||0)+1;
    return acc;
  }, {});

  const transitionPlan = byRec["Transition Plan"] || 0;
  const monitor = byRec["Monitor"] || 0;
  const reskill = rows.filter(r => (r["Reskill vs Hire Decision"]||"").toLowerCase().includes("reskill")).length;

  const cards = [
    { label:"Total employees (filtered)", value: total, note:"Current view based on filters" },
    { label:"Transition Plan", value: transitionPlan, note:"Needs active transition tracking" },
    { label:"Reskill decisions", value: reskill, note:"Often cheaper than hiring" },
    { label:"Monitor", value: monitor, note:"Watch performance + initiative" }
  ];

  const container = $("cards");
  container.innerHTML = "";
  cards.forEach(c=>{
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="label"><span class="dot"></span>${escapeHtml(c.label)}</div>
      <div class="value">${c.value}</div>
      <div class="small">${escapeHtml(c.note)}</div>
    `;
    container.appendChild(div);
  });
}

function renderTable(){
  const cols = showMoreCols ? baseCols.concat(moreCols) : baseCols;

  // header
  const theadRow = $("theadRow");
  theadRow.innerHTML = "";
  cols.forEach(c=>{
    const th = document.createElement("th");
    th.textContent = c.label;
    if (c.sortable){
      th.classList.add("sortable");
      th.addEventListener("click", ()=>{
        if (sortKey === c.key){
          sortDir = sortDir === "asc" ? "desc" : "asc";
        } else {
          sortKey = c.key;
          sortDir = "desc";
        }
        renderTable();
      });
    }
    theadRow.appendChild(th);
  });

  // body
  const rows = sortRows(filtered());
  const tbody = $("tbody");
  tbody.innerHTML = "";

  $("empty").style.display = rows.length ? "none" : "block";

  rows.forEach(r=>{
    const tr = document.createElement("tr");
    const id = r["Employee ID"];
    tr.dataset.id = id;

    cols.forEach(c=>{
      const td = document.createElement("td");
      const val = r[c.key];
      td.innerHTML = c.render ? c.render(val, r) : escapeHtml(val ?? "");
      tr.appendChild(td);
    });

    tr.addEventListener("click", ()=>selectRow(id));
    tbody.appendChild(tr);
  });

  // highlight selected
  [...tbody.querySelectorAll("tr")].forEach(tr=>{
    tr.style.background = (tr.dataset.id === selectedId) ? "rgba(96,165,250,.12)" : "";
  });

  renderCards();
}

function selectRow(id){
  selectedId = id;
  const r = data.find(x=>x["Employee ID"] === id);
  if (!r) return;

  $("detail").innerHTML = `
    <div class="kv">
      <div class="box"><div class="k">Employee</div><div class="v">${escapeHtml(r["Employee Name"])} <span class="muted">(${escapeHtml(r["Employee ID"])})</span></div></div>
      <div class="box"><div class="k">Role</div><div class="v">${escapeHtml(r["Role"])} <span class="muted">| ${escapeHtml(r["Department"])}</span></div></div>
    </div>

    <div class="kv">
      <div class="box"><div class="k">Automation Risk</div><div class="v">${pillScore(r["Final Automation Risk (1-5)"], true)}</div></div>
      <div class="box"><div class="k">Future Fit</div><div class="v">${pillScore(r["Final Future Role Fit (1-5)"], false)}</div></div>
    </div>

    <div class="kv">
      <div class="box"><div class="k">Transition Score</div><div class="v">${pillTransition(r["Transition Score"])}</div></div>
      <div class="box"><div class="k">Recommendation</div><div class="v">${pillText(r["Recommendation"])}</div></div>
    </div>

    <div class="kv">
      <div class="box"><div class="k">Reskill Cost</div><div class="v">${money(r["Estimated Reskill Cost"])}</div></div>
      <div class="box"><div class="k">External Hiring Cost</div><div class="v">${money(r["External Hiring Cost"])}</div></div>
    </div>

    <div class="kv">
      <div class="box"><div class="k">Time to Productivity</div><div class="v">${escapeHtml(r["Time to Productivity (months)"] || "-")}</div></div>
      <div class="box"><div class="k">Decision</div><div class="v">${escapeHtml(r["Reskill vs Hire Decision"] || "-")}</div></div>
    </div>

    <div class="block"><div class="k">Skills / Domain</div><div class="v">${escapeHtml(r["Skills"] || "-")}\n${escapeHtml(r["Domain"] || "")}</div></div>
    <div class="block"><div class="k">Appraisal Comments</div><div class="v">${escapeHtml(r["Appraisal Comments"] || "-")}</div></div>
    <div class="block"><div class="k">Manager Extra Notes</div><div class="v">${escapeHtml(r["Manager Extra Notes"] || "-")}</div></div>
  `;

  renderTable();
}

function resetFilters(){
  $("search").value = "";
  $("dept").value = "";
  $("rec").value = "";
  $("riskBand").value = "";
  renderTable();
}

async function init(){
  const res = await fetch(CSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("CSV fetch failed");
  const text = await res.text();
  data = parseCSV(text);

  buildDropdown("dept", [...new Set(data.map(d=>d["Department"]).filter(Boolean))].sort());
  buildDropdown("rec", [...new Set(data.map(d=>d["Recommendation"]).filter(Boolean))].sort());

  renderTable();
}

["search","dept","rec","riskBand"].forEach(id=>{
  $(id).addEventListener("input", renderTable);
  $(id).addEventListener("change", renderTable);
});

$("toggleCols").addEventListener("click", ()=>{
  showMoreCols = !showMoreCols;
  $("toggleCols").textContent = showMoreCols ? "Show fewer columns" : "Show more columns";
  renderTable();
});

$("reset").addEventListener("click", resetFilters);
$("clearSel").addEventListener("click", ()=>{
  selectedId = null;
  $("detail").innerHTML = `<div class="empty">Click a row to view details.</div>`;
  renderTable();
});

init().catch(err=>{
  console.error(err);
  $("empty").style.display = "block";
  $("empty").textContent = "Could not load data. Check CSV URL + publish settings.";
});
