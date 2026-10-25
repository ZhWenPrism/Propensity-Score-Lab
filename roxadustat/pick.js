"use strict";

// Landing page: the group picks the agency it will play, confirms, and is locked to it
// until "重新开始" clears this browser's record.

const PICK_TAGLINE = {
  fda: "2021 年审评 · 手上有全球 III 期汇总数据",
  ema: "2021 年审评 · 手上有全球 III 期汇总数据",
  nmpa: "2018 年审评 · 全球心血管汇总尚未出来",
  pmda: "2019 年审评 · 依据日本的研究"
};

const stage = document.getElementById("draw-stage");
const grid = document.getElementById("pick-grid");
const confirmBox = document.getElementById("pick-confirm");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let picked = null;

function buildGrid() {
  grid.innerHTML = AGENCY_ORDER.map((k, i) => {
    const a = AGENCIES[k];
    return `<button type="button" class="pick-card pick-${k}" data-pick-agency="${k}" aria-pressed="false" style="--i:${i}">
      <span class="pk-check" aria-hidden="true">✓</span>
      <span class="pk-emblem">${a.short}</span>
      <span class="pk-name">${a.name}</span>
      <span class="pk-when">决策节点 ${a.when}</span>
      <span class="pk-tag">${PICK_TAGLINE[k]}</span>
    </button>`;
  }).join("");
}

function updatePick() {
  grid.classList.toggle("has-pick", !!picked);
  grid.querySelectorAll("[data-pick-agency]").forEach(b => b.setAttribute("aria-pressed", b.dataset.pickAgency === picked));
  if (!picked) {
    confirmBox.innerHTML = `<p class="dr-sub">点一张卡片，选定你们组要扮演的机构。</p><button class="draw-btn" type="button" disabled>确认，进入审评室</button>`;
    return;
  }
  const a = AGENCIES[picked];
  confirmBox.innerHTML = `<p class="dr-line">你们组扮演 <b>${a.name}</b></p>
    <p class="dr-sub">进入后，揭晓前只能看到这家机构在 ${a.when} 做决定时手上的证据。</p>
    <button class="draw-btn" type="button" id="draw-enter">确认，进入审评室</button>`;
}

function openStage() {
  picked = null;
  stage.hidden = false;
  document.body.classList.add("draw-open");
  buildGrid();
  updatePick();
  setTimeout(() => stage.focus(), 50);
}

function closeStage() {
  stage.classList.add("is-leaving");
  setTimeout(() => {
    stage.hidden = true;
    stage.classList.remove("is-leaving");
    document.body.classList.remove("draw-open");
    window.scrollTo({ top: 0, behavior: "instant" });
  }, reduceMotion ? 0 : 450);
}

grid.addEventListener("click", e => {
  const card = e.target.closest("[data-pick-agency]");
  if (!card) return;
  picked = card.dataset.pickAgency;
  updatePick();
});
confirmBox.addEventListener("click", e => {
  if (e.target.id !== "draw-enter" || !picked) return;
  state.agency = picked; state.viewAgency = picked;
  save(); renderAll(); closeStage();
});

if (!state.agency) openStage();
