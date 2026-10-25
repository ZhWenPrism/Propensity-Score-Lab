"use strict";

// Board 5: homework. Name, read the debate, answer the questions (main layer + 1–2 sentence reason),
// submit. When the page is served by server/app.py the answers go to api/submit; otherwise the
// student downloads a text file to hand in. Reference answers appear only after submitting.
// Uses state/save/esc/srcChips/quoteBlock from app.js at call time.

const MIN_REASON = 8;
let apiOnline = null;

const HW_DEFAULTS = { started: false, name: "", answers: {}, submitted: false, submittedAt: null, online: false };
const hw = () => {
  state.hw = state.hw || {};
  for (const [k, v] of Object.entries(HW_DEFAULTS)) if (!(k in state.hw)) state.hw[k] = v && typeof v === "object" ? { ...v } : v;
  return state.hw;
};
const answerOf = id => hw().answers[id] || { layers: [], reason: "" };

function checkApi() {
  if (apiOnline !== null) return;
  apiOnline = false;
  fetch("api/health", { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then(j => { apiOnline = !!(j && j.ok); renderHwStatus(); })
    .catch(() => renderHwStatus());
}

function renderHwStatus() {
  const box = $("hw-online");
  if (!box) return;
  box.textContent = apiOnline ? "这个网址可以在线提交，老师会收到你的答案。" : "这个网址不能在线提交：提交后请下载答案文件，发给老师。";
  box.className = `hw-online${apiOnline ? " ok" : ""}`;
}

function debateBlock() {
  return `<div class="hw-reading"><h4>阅读材料：四家机构对辩</h4>
    <p class="sub">每句发言下附审评文件原文和页码。</p>
    <div class="debate-ctl"><button class="btn" type="button" id="debate-prev">上一句</button><button class="btn primary" type="button" id="debate-next">下一句</button><button class="btn" type="button" id="debate-all">全部展开</button><span class="count" id="debate-count"></span></div>
    <div class="debate" id="debate"></div></div>`;
}

function questionBlock(q, i) {
  const a = answerOf(q.id), locked = hw().submitted;
  const chips = Object.entries(LAYERS).map(([k, v]) => `<label><input type="radio" name="hw-${q.id}" data-hw-layer="${q.id}" value="${k}" ${a.layers.includes(k) ? "checked" : ""} ${locked ? "disabled" : ""}>${v}</label>`).join("");
  return `<li class="hw-q" id="hw-${q.id}">
    <div class="hw-qhead"><span class="hw-no">第 ${i + 1} 题</span><h4>${esc(q.title)}</h4></div>
    <p class="hw-stem">${esc(q.q)}</p>
    <div class="chips">${chips}</div>
    <label class="hw-why"><span>用 1–2 句话说明理由</span>
      <textarea data-hw-reason="${q.id}" maxlength="300" rows="2" ${locked ? "readonly" : ""} placeholder="例如：两家用的是同一批数据，差别在于……">${esc(a.reason)}</textarea></label>
    ${locked ? referenceBlock(q, a) : ""}
  </li>`;
}

function referenceBlock(q, a) {
  const same = a.layers[0] === q.answer[0];
  return `<div class="hw-ref">
    <div class="hw-ref-top"><span>参考答案：<b>${LAYERS[q.answer[0]]}</b></span><span class="${same ? "match" : "differ"}">${same ? "与你的选择一致" : `你的选择：${LAYERS[a.layers[0]] || "未选"}`}</span></div>
    <p class="hw-verdict">${esc(q.verdict)}</p>
    <ul>${q.points.map(p => `<li>${esc(p)}</li>`).join("")}</ul>
    <p class="hw-pitfall"><b>容易读错的地方：</b>${esc(q.pitfall)}</p>
    <div class="hw-src">出处 ${srcChips(q.src)}</div>
  </div>`;
}

function renderHomework() {
  const box = $("hw-panel");
  const h = hw();
  if (!state.compared) {
    box.innerHTML = `<div class="reveal-gate"><p>先完成第 4 步的四家比较，再开始课后作业。</p><button class="btn primary" type="button" disabled>开始课后作业</button></div>`;
    return;
  }
  if (!h.started) {
    box.innerHTML = `<div class="reveal-gate"><p>先填姓名，读完对辩材料，再答 ${HOMEWORK.length} 道题。提交后显示参考答案，提交后不能再修改。</p><button class="btn primary" type="button" id="hw-start">开始课后作业</button></div>`;
    return;
  }
  const a = AGENCIES[state.agency];
  const when = h.submittedAt ? new Date(h.submittedAt).toLocaleString("zh-CN", { hour12: false }) : "";
  const head = h.submitted
    ? `<div class="hw-done"><span><b>${esc(h.name)}</b>，作业已于 ${esc(when)} 提交。${h.online ? "老师已收到你的答案。" : "这个网址不能在线提交，请下载答案文件发给老师。"}</span>
        <button class="btn" type="button" id="hw-download">下载答案文件</button></div>`
    : `<div class="hw-name"><label for="hw-name">姓名</label><input id="hw-name" maxlength="40" autocomplete="name" value="${esc(h.name)}" placeholder="填写你的姓名"><span class="sub">你们组扮演 ${esc(a.short)}</span></div>
       <p class="hw-online" id="hw-online"></p>`;
  box.innerHTML = `${head}${debateBlock()}
    <h4 class="hw-qtitle">作业题：这个分歧主要属于哪一层？</h4>
    <p class="sub">证据不同：做决定时手上的数据不同。口径不同：数据一样，分析方法不同。价值不同：对风险和好处的取舍不同。每题选一个最主要的。</p>
    <ol class="hw-qs">${HOMEWORK.map(questionBlock).join("")}</ol>
    ${h.submitted ? "" : `<div class="hw-submit"><button class="btn primary" type="button" id="hw-submit">提交作业</button><span class="hw-msg" id="hw-msg" role="status"></span></div>`}`;
  renderDebate();
  if (!h.submitted) { checkApi(); renderHwStatus(); }
}

function homeworkText() {
  const h = hw(), ag = state.agency, d = state.decisions[ag] || {};
  const names = (map, ks) => (ks || []).map(k => map[k]).filter(Boolean).join("、") || "未填";
  const lines = [
    "获益-风险评估沙盘 · 课后作业",
    `姓名：${h.name}`,
    `扮演机构：${AGENCIES[ag].name}（${AGENCIES[ag].when}）`,
    `提交时间：${new Date(h.submittedAt).toLocaleString("zh-CN", { hour12: false })}`,
    "",
    `你们的结论：NDD ${DECISIONS[d.ndd] || "未填"}；DD ${DECISIONS[d.dd] || "未填"}；风险管理 ${names(RISK_TOOLS, d.rm)}`,
    `结论理由：${d.reason || "未填"}`,
    ""
  ];
  HOMEWORK.forEach((q, i) => {
    const a = answerOf(q.id);
    lines.push(`第 ${i + 1} 题 ${q.title}`, `  选择：${names(LAYERS, a.layers)}`, `  理由：${a.reason}`, "");
  });
  return lines.join("\r\n");
}

function downloadHomework() {
  const h = hw();
  const blob = new Blob(["﻿" + homeworkText()], { type: "text/plain;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `课后作业_${h.name}_${AGENCIES[state.agency].short}.txt`;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 0);
}

async function submitHomework() {
  const h = hw(), msg = $("hw-msg");
  h.name = ($("hw-name").value || "").trim();
  const missing = HOMEWORK.map((q, i) => {
    const a = answerOf(q.id);
    return !a.layers.length || a.reason.trim().length < MIN_REASON ? i + 1 : null;
  }).filter(Boolean);
  if (!h.name) { msg.textContent = "请先填写姓名。"; $("hw-name").focus(); return; }
  if (missing.length) { msg.textContent = `第 ${missing.join("、")} 题还没答完：每题选一层，并写一两句理由。`; $(`hw-${HOMEWORK[missing[0] - 1].id}`).scrollIntoView({ block: "center" }); return; }
  if (!confirm("提交后不能再修改，确定提交？")) return;
  msg.textContent = "正在提交……";
  $("hw-submit").disabled = true;
  h.submittedAt = new Date().toISOString();
  const payload = {
    name: h.name, agency: state.agency, client_time: h.submittedAt,
    decision: state.decisions[state.agency] || {},
    primary: { ndd: (NDD_ANALYSES.find(r => r.id === state.nddPick) || {}).label || "", dd: (DD_ANALYSES.find(r => r.id === state.ddPick) || {}).label || "" },
    answers: HOMEWORK.map(q => ({ id: q.id, layers: answerOf(q.id).layers, reason: answerOf(q.id).reason.trim() }))
  };
  let online = false;
  try {
    const r = await fetch("api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    online = r.ok && !!(await r.json()).ok;
  } catch { /* static hosting: no endpoint */ }
  h.submitted = true; h.online = online;
  save(); renderHomework();
  $("hw-panel").scrollIntoView();
}

const board5 = document.getElementById("board5");
board5.addEventListener("click", e => {
  const id = e.target.id;
  if (id === "hw-start") { hw().started = true; save(); renderHomework(); return; }
  if (id === "hw-submit") { submitHomework(); return; }
  if (id === "hw-download") { downloadHomework(); return; }
  if (id === "debate-next") { state.debateStep += 1; save(); renderDebate(); return; }
  if (id === "debate-prev") { state.debateStep = Math.max(1, state.debateStep - 1); save(); renderDebate(); return; }
  if (id === "debate-all") { state.debateAll = !state.debateAll; save(); renderDebate(); }
});
board5.addEventListener("change", e => {
  const q = e.target.dataset.hwLayer;
  if (!q || hw().submitted) return;
  hw().answers[q] = { ...answerOf(q), layers: [e.target.value] }; save();
});
board5.addEventListener("input", e => {
  if (hw().submitted) return;
  if (e.target.id === "hw-name") { hw().name = e.target.value; save(); return; }
  const q = e.target.dataset.hwReason;
  if (q) { hw().answers[q] = { ...answerOf(q), reason: e.target.value }; save(); }
});
