"use strict";

// Every number and quote below comes from a public regulatory document.
// src: [docKey, page, snippet]  -> snippet must appear on that PDF page (checked by tools/verify_sources.mjs)
// q:   { d: docKey, p: page, t: verbatim text } -> displayed quote, also checked
const FDA_ARCHIVE = "https://web.archive.org/web/20221215225010/https://www.fda.gov/media";

const DOCS = {
  fda_briefing: { label: "FDA 简报", url: `${FDA_ARCHIVE}/150728/download` },
  fda_minutes: { label: "FDA 会议纪要", url: `${FDA_ARCHIVE}/151422/download` },
  fda_presentations: { label: "FDA 会上幻灯片", url: `${FDA_ARCHIVE}/150756/download` },
  fda_questions: { label: "FDA 讨论问题", url: `${FDA_ARCHIVE}/150727/download` },
  ema_epar: { label: "EMA EPAR", url: "https://www.ema.europa.eu/en/documents/assessment-report/evrenzo-epar-public-assessment-report_en.pdf" },
  pmda_review_2019: { label: "PMDA 审评报告", url: "https://www.pmda.go.jp/files/000234811.pdf" },
  "cde_review_CXHS1700019-20": { label: "CDE 审评报告（透析）", url: null },
  "cde_review_CXHS1800013-14": { label: "CDE 审评报告（非透析）", url: null },
  cde_label_roxadustat: { label: "CDE 公示说明书", url: null },
  cde_2018_annual_report: { label: "CDE 2018 年度审评报告", url: null }
};

const AGENCIES = {
  fda: {
    short: "FDA", name: "美国 FDA", when: "2021-07-15", whenLabel: "咨询委员会会议",
    verdict: "咨询委员会投票反对批准：NDD 1 票赞成 / 13 票反对，DD 2 票赞成 / 12 票反对",
    src: [["fda_minutes", 5, "Vote Result: Yes: 1 No: 13 Abstain: 0"], ["fda_minutes", 6, "Vote Result: Yes: 2 No: 12 Abstain: 0"]]
  },
  ema: {
    short: "EMA", name: "欧盟 EMA（CHMP）", when: "2021-06-24", whenLabel: "CHMP 意见",
    verdict: "CHMP 一致认为获益-风险为正，适应症限定为 CKD 相关的症状性贫血",
    src: [["ema_epar", 9, "24 June 2021"], ["ema_epar", 152, "by consensus that the benefit-risk balance of Evrenzo is favourable"]]
  },
  nmpa: {
    short: "NMPA", name: "中国 NMPA / CDE", when: "2018-12-17", whenLabel: "透析适应症批准",
    verdict: "优先审评，批准透析适应症（2018-12-17），非透析适应症随后批准（2019-08-16）",
    src: [["cde_review_CXHS1700019-20", 4, "批准日期：2018 年 12 月 17 日"], ["cde_review_CXHS1800013-14", 4, "批准日期：2019 年 08 月 16 日"]]
  },
  pmda: {
    short: "PMDA", name: "日本 PMDA / MHLW", when: "2019-08-29", whenLabel: "新药第一部会审议",
    verdict: "新药第一部会认为可以批准（透析适应症），附 RMP 与说明书 WARNING",
    src: [["pmda_review_2019", 1, "may be approved"]]
  }
};
const AGENCY_ORDER = ["fda", "ema", "nmpa", "pmda"];

// ---- Board 1: time-locked evidence packages --------------------------------
const PACKAGES = {
  nmpa: {
    headline: "2018 年底做决定：只有中国和早期研究的数据，全球心血管安全性汇总还没出来",
    locked: true,
    facts: [
      { k: "关键研究（透析）", v: "806：随机、开放，对照阿法依泊汀，n=305；按符合方案集，Hb 变化差值 95% CI 下限 +0.2 g/L，高于非劣效界值 −10 g/L", src: [["cde_label_roxadustat", 3, "FGCL-4592-806（N=305）"], ["cde_review_CXHS1700019-20", 13, "95%CI下限+0.2g/L高于-10g/L"]] },
      { k: "关键研究（非透析）", v: "808：双盲，对照安慰剂，n=154；第 7–9 周 Hb 升高 19.0 g/L，安慰剂组下降 3.9 g/L", src: [["cde_label_roxadustat", 3, "FGCL-4592-808（N=154）"], ["cde_review_CXHS1800013-14", 9, "升高19.0g/L，而安慰剂组受试者的平均Hb水平自基线降低3.9g/L"]] },
      { k: "安全性数据库", v: "截至 2018 年 7 月，41 项试验中 2,333 人用过罗沙司他（含健康受试者），213 人用药超过 1 年", src: [["cde_review_CXHS1700019-20", 16, "2333名受试者接受了罗沙司他治疗，有213例用药时间超过1年"]] },
      { k: "心血管证据", v: "国外 11 项试验仍在进行；心血管事件作为“缺失信息”管理", src: [["cde_review_CXHS1700019-20", 14, "国外有11项临床试验正在进行中，约5300名受试者接受罗沙司他治疗"], ["cde_review_CXHS1700019-20", 15, "将心血管事件作为缺失信息"]] },
      { k: "血栓", v: "中国 II/III 期罗沙司他组“血栓形成”：透析 4.2%、非透析 1.2%；说明书与已发表 ESA 试验（按每 100 人年）比较，认为“并未高于”", src: [["cde_label_roxadustat", 9, "血栓形成 4.2% 1.2%"], ["cde_label_roxadustat", 8, "罗沙司他临床试验中报告的心血管事件发生率并未高于 ESAs 类药物"]] }
    ],
    missing: "全球 III 期的 MACE 汇总分析（FDA、EMA 2021 年才评估）"
  },
  pmda: {
    headline: "2019 年做决定：依据 5 项日本研究，手上同样没有全球 MACE 汇总",
    locked: true,
    facts: [
      { k: "时间", v: "2018-09-28 申请；2019-08-29 新药第一部会审议", src: [["pmda_review_2019", 1, "may be approved"]] },
      { k: "关键研究", v: "0307：双盲，对照 darbepoetin alfa，透析患者从 ESA 转换，24 周；Hb 差值 −0.02 g/dL [−0.18, 0.15]，非劣效界值 −0.75 g/dL", src: [["pmda_review_2019", 50, "−0.02 [−0.18, 0.15] g/dL"], ["pmda_review_2019", 50, "−0.75 g/dL"]] },
      { k: "血栓", v: "0307：血栓栓塞相关事件 9.3%（14/150）vs 3.9%（6/152）；血透汇总（无对照）11.3%（44/388），以分流闭塞为主", src: [["pmda_review_2019", 73, "Thromboembolism-related events total 9.3 (14) 3.9 (6) 11.3 (44)"]] },
      { k: "同一批数据，不同口径", v: "说明书把日本 444 例中的“血栓形成”记为 6 例（1.4%）；PMDA 按 SMQ 统计，血透汇总为 44/388（11.3%）", src: [["cde_label_roxadustat", 9, "6（1.4%）例血栓形成"], ["pmda_review_2019", 72, "Embolic and thrombotic events (narrow"]] },
      { k: "处理方式", v: "说明书 WARNING：可能引起严重血栓栓塞，包括脑梗、心梗、肺栓塞", src: [["pmda_review_2019", 89, "Roxadustat therapy may cause serious thromboembolism including cerebral infarction, myocardial infarction, and pulmona"]] }
    ],
    missing: "全球 III 期的 MACE 汇总分析"
  },
  ema: {
    headline: "2021 年做决定：手上有全球 8 项 III 期和完整的心血管安全性汇总",
    locked: false,
    facts: [
      { k: "数据规模", v: "8 项 III 期（非透析 4 项、透析 4 项），II/III 期共 12,048 人", src: [["ema_epar", 109, "Overall A total of 12,048 patients were treated in phase 2 and phase 3 studies"]] },
      { k: "差异性脱落", v: "非透析安慰剂对照汇总中，治疗中止：罗沙司他 37.8%，安慰剂 59.2%", src: [["ema_epar", 140, "was higher for placebo 1115 [59.2%]) than for roxadustat (901 [37.8%])"]] },
      { k: "分析原则", v: "按 EMA 心血管安全指南，首选包含治疗期事件的 on-treatment 分析；考虑到 ESA 已知的心血管风险，采用更严的 1.3 界值", src: [["ema_epar", 132, "An analysis, including the on-treatment events, is the preferred analysis according to the EMA reflection paper."], ["ema_epar", 132, "outside the 1.3 margin"]] },
      { k: "结构化评估", v: "EPAR 第 3.6 节给出官方效应表（Table 52 非透析、Table 53 透析）", src: [["ema_epar", 146, "3.6. Effects Table"]] }
    ],
    missing: null
  },
  fda: {
    headline: "2021 年做决定：和 EMA 同一批全球数据，但汇总方式和主要分析不同",
    locked: false,
    facts: [
      { k: "非透析汇总", v: "001/060/608 三项安慰剂对照研究，共 4,270 人；完成率罗沙司他 62%、安慰剂 41%", src: [["fda_briefing", 31, "all 4270 randomized subjects"], ["fda_briefing", 17, "62% and 41% of patients randomized to roxadustat and placebo"]] },
      { k: "透析汇总", v: "002/063/064 三项 epoetin alfa 对照研究；610、613 不纳入汇总，单独分析", src: [["fda_briefing", 14, "Trials 610 and 613 were not considered sufficiently similar to the others to allow inclusion in the meta-analyses."]] },
      { k: "分析原则", v: "FDA 没有事先同意非劣效界值，看 HR 的估计值和置信区间", src: [["fda_briefing", 47, "The FDA did not agree prospectively on a risk margin"]] },
      { k: "已知的外部决定", v: "中国 2018-12、日本 2019-09 已批准", src: [["fda_briefing", 8, "China"]] }
    ],
    missing: null
  }
};

// ---- Board 2: analyses --------------------------------------------------
const NDD_ANALYSES = [
  { id: "fda_onstudy", agency: "fda", label: "On-study", role: "FDA 预设主要分析", hr: 1.10, lo: 0.96, hi: 1.27,
    what: "随机化后的全部随访都计入，停药后发生的事件也算", events: "480 / 4509.6 人年 vs 350 / 3406.2 人年",
    src: [["fda_briefing", 47, "1.10 (0.96, 1.27) 1.38 (1.11, 1.70)"]] },
  { id: "fda_ot7", agency: "fda", label: "OT+7", role: "FDA 敏感性分析", hr: 1.38, lo: 1.11, hi: 1.70,
    what: "只计用药期间和末次给药后 7 天内的事件", events: "277 / 3843.2 人年 vs 131 / 2331.6 人年",
    src: [["fda_briefing", 47, "1.10 (0.96, 1.27) 1.38 (1.11, 1.70)"]] },
  { id: "ema_ipcw", agency: "ema", label: "On-treatment OT-28 + IPCW", role: "EMA 依据的主要分析", hr: 1.26, lo: 1.02, hi: 1.55,
    what: "计末次给药后 28 天内的事件，并按停药概率加权，校正信息性删失", events: "344（14.4%）vs 166（8.8%）",
    src: [["ema_epar", 144, "on-treatment HR of 1.26 (1.02 -1.55) for MACE (based on 344 (14.4%) vs 166 (8.8%) events"]] },
  { id: "ema_itt", agency: "ema", label: "ITT", role: "EMA：不作首选", hr: 1.10, lo: 0.96, hi: 1.27,
    what: "随机化后全部随访；EMA 认为敏感度低，停药后改用 ESA 会带来新的混杂", events: "480（20.1%）vs 350（18.6%）",
    src: [["ema_epar", 122, "480 (20.1%) vs 350 (18.6%) with IR 10.6 vs 10.3 and HR 1.10 (0.96, 1.27)"]] }
];

const DD_ANALYSES = [
  { id: "fda_dd_ot7", agency: "fda", group: "base", label: "MACE · OT+7 · 002/063/064", role: "FDA 预设主要分析", hr: 1.02, lo: 0.88, hi: 1.20,
    src: [["fda_briefing", 51, "1.02 (0.88, 1.20) 1.14 (1.00, 1.30)"]] },
  { id: "fda_dd_onstudy", agency: "fda", group: "base", label: "MACE · On-study · 002/063/064", role: "FDA 敏感性分析", hr: 1.14, lo: 1.00, hi: 1.30,
    src: [["fda_briefing", 51, "1.02 (0.88, 1.20) 1.14 (1.00, 1.30)"]] },
  { id: "fda_dd_death", agency: "fda", group: "base", label: "全因死亡 · On-study · 002/063/064", role: "FDA", hr: 1.17, lo: 1.02, hi: 1.35,
    src: [["fda_briefing", 53, "the HR was 1.17, with a 95% CI that excluded 1 (1.02, 1.35)"]] },
  { id: "fda_613_death", agency: "fda", group: "s613", label: "全因死亡 · OT+7 · 仅 613", role: "FDA 单列，不入汇总", hr: 1.54, lo: 1.04, hi: 2.28,
    src: [["fda_briefing", 53, "The nominal HR was 1.54, and the 95% CI (1.04, 2.28) excluded 1."]] },
  { id: "ema_dd_all", agency: "ema", group: "s613", label: "MACE · OT-7 · 4 项研究（含 613）", role: "EMA 汇总", hr: 1.09, lo: 0.95, hi: 1.26,
    src: [["ema_epar", 124, "HR of 1.09 (0.95 – 1.26)"]] },
  { id: "ema_stable", agency: "ema", group: "split", label: "MACE · 稳定透析（从 ESA 转换）", role: "EMA 拆分", hr: 1.18, lo: 1.00, hi: 1.38,
    src: [["ema_epar", 148, "stable DD subpool (HR 1.18 (1.00 – 1.38)"]] },
  { id: "ema_correction", agency: "ema", group: "split", label: "MACE · Hb 校正池（基线与中止率可比）", role: "EMA 拆分", hr: 0.81, lo: 0.62, hi: 1.05,
    src: [["ema_epar", 148, "(HR 0.81 (0.62, 1.05) for OT-7"]] },
  { id: "ema_esa7000", agency: "ema", group: "split", label: "MACE · 基线 ESA >7000 IU/周", role: "EMA 风险因素", hr: 1.49, lo: 1.13, hi: 1.97,
    src: [["ema_epar", 134, "1.49 (1.13, 1.97)"]] }
];

// Effects tables: rates per 100 patient-years unless noted.
const EFFECTS = {
  ndd: {
    note: "EMA 效应表（Table 52）和 FDA 严重不良事件表的数字。EMA 注明：除主要 Hb 终点外，其余都没有经过正式检验。",
    noteSrc: [["ema_epar", 147, "Overall data as presented have only been formally tested for the primary Hb endpoint."]],
    favourable: [
      { k: "Hb 应答（前 24 周）", r: "80.2%", c: "8.7%", unit: "比例", src: [["ema_epar", 146, "1899 (80.2) 163 (8.7)"]] },
      { k: "救援治疗（RBC 输血、静脉铁、ESA）", r: "10.4", c: "41.0", unit: "/100 人年", per: true, src: [["ema_epar", 82, "10.4 41.0"]] },
      { k: "RBC 输血", r: "5.0%", c: "12.9%", unit: "比例", src: [["ema_epar", 82, "(5.0) (12.9)"]] }
    ],
    unfavourable: [
      { k: "MACE（on-treatment，OT-28）", r: "8.7", c: "6.8", unit: "/100 人年", per: true, by: "ema", src: [["ema_epar", 147, "8.7 6.8"]] },
      { k: "全因死亡（OT-28）", r: "6.4", c: "5.0", unit: "/100 人年", per: true, by: "ema", overlap: true, src: [["ema_epar", 146, "6.4 5.0"]] },
      { k: "血管通路血栓", r: "1.5", c: "0.3", unit: "/100 人年", per: true, by: "ema", src: [["ema_epar", 147, "Thrombotic IR 1.5 0.3"]] },
      { k: "深静脉血栓", r: "0.6", c: "0.2", unit: "/100 人年", per: true, by: "ema", src: [["ema_epar", 147, "deep vein IR 0.6 0.2"]] },
      { k: "高钾血症", r: "7.0", c: "5.7", unit: "/100 人年", per: true, by: "ema", src: [["ema_epar", 147, "IR 7.0 5.7"]] },
      { k: "严重败血症/感染性休克（FDA，OT+7）", r: "2.25", c: "0.95", unit: "/100 人年", per: true, by: "fda", src: [["fda_presentations", 32, "Sepsis/septic shock 87 (3.65) 22 (1.17) 2.25 0.95"]] },
      { k: "严重癫痫（FDA，OT+7）", r: "0.2", c: "0.0", unit: "/100 人年", per: true, by: "fda", src: [["fda_presentations", 32, "Seizure FDA 9 (0.38) 1 (0.05) 0.2 0.0"]] }
    ],
    tradeoff: { benefitKey: "救援治疗", riskKey: "MACE（on-treatment，OT-28）" }
  },
  dd: {
    note: "EMA 效应表（Table 53）和 FDA 严重不良事件表（Table 23）的数字。对照是 ESA，不是安慰剂。",
    noteSrc: [["ema_epar", 148, "Table 53: Effects table for roxadustat in CKD patients on dialysis"]],
    favourable: [
      { k: "Hb 较基线变化（稳定透析池，第 28–36 周）", r: "0.58 g/dL", c: "0.28 g/dL", unit: "均值", src: [["ema_epar", 148, "g/dL 0.58 0.28"]] },
      { k: "Hb 应答（063，前 24 周）", r: "88.2%", c: "84.4%", unit: "比例", src: [["ema_epar", 148, "88.2 84.4"]] },
      { k: "月均静脉铁（002）", r: "58.7 mg", c: "91.3 mg", unit: "均值", src: [["ema_epar", 104, "IV iron use (mg) 58.7 91.3"]] },
      { k: "救援治疗（RBC 输血）", r: "相近", c: "相近", unit: "", src: [["ema_epar", 148, "Similar need for rescue therapy (RBC transfusion)"]] }
    ],
    unfavourable: [
      { k: "MACE（on-treatment，OT-7）", r: "9.4", c: "8.9", unit: "/100 人年", per: true, by: "ema", src: [["ema_epar", 148, "9.4 IR 8.9"]] },
      { k: "全因死亡（OT-7）", r: "6.7", c: "6.2", unit: "/100 人年", per: true, by: "ema", overlap: true, src: [["ema_epar", 133, "IR of 6.7 vs 6.2 per 100 PY"]] },
      { k: "严重血栓事件（FDA，OT+7）", r: "7.27", c: "5.37", unit: "/100 人年", per: true, by: "fda", src: [["fda_briefing", 41, "Thrombosis 241 (12.42) 201 (10.36) 7.27 5.37 1.90"]] },
      { k: "严重通路血栓（FDA）", r: "3.65", c: "2.51", unit: "/100 人年", per: true, by: "fda", src: [["fda_briefing", 41, "Device/shunt thrombosis 121 (6.24) 94 (4.85) 3.65 2.51"]] },
      { k: "严重深静脉血栓（FDA）", r: "0.72", c: "0.19", unit: "/100 人年", per: true, by: "fda", src: [["fda_briefing", 41, "24 (1.24) 7 (0.36) 0.72 0.19"]] },
      { k: "严重癫痫（FDA）", r: "0.78", c: "0.51", unit: "/100 人年", per: true, by: "fda", src: [["fda_briefing", 41, "Seizure FDA 26 (1.34) 19 (0.98) 0.78 0.51"]] },
      { k: "严重胰腺炎（FDA）", r: "0.60", c: "0.29", unit: "/100 人年", per: true, by: "fda", src: [["fda_briefing", 41, "Pancreatitis FDA 20 (1.03) 11 (0.57) 0.60 0.29"]] }
    ],
    tradeoff: null
  }
};

// ---- Board 3: what each agency actually did ------------------------------
const REVEAL = {
  fda: {
    steps: [
      { k: "疗效", v: "两个人群的 Hb 疗效都不成问题，审议焦点在安全性", q: { d: "fda_briefing", p: 7, t: "As is the case with ESAs, roxadustat is titrated to achieve a target Hb level, and roxadustat's efficacy is not in question." } },
      { k: "NDD 的 MACE", v: "主要分析 On-study 1.10；OT+7 的 1.38 值得关注，但两组暴露不同，单独看不是公平的随机比较", q: { d: "fda_briefing", p: 47, t: "Although the exclusion of 1 in the OT+7 analysis merits concern, the differential exposure between roxadustat and placebo complicates the interpretation of the OT+7 analysis in isolation, as this may not represent a fair randomized comparison." } },
      { k: "DD 的 MACE", v: "主要分析中性，敏感性分析不利，结论是无法下结论", q: { d: "fda_briefing", p: 59, t: "In general, concordance between primary statistical analyses and sensitivity analyses provides confidence in the validity of the results. With the observed discordance here, the results are inconclusive." } },
      { k: "血栓与剂量", v: "低剂量方案能降低风险，听起来合理，但没有证据", q: { d: "fda_briefing", p: 12, t: "Their prediction seems plausible, but is unproven. Our findings show only associations, without proven cause and effect." } },
      { k: "委员会理由", v: "安全风险、缓解方案未经检验、上市后难以得到确定性数据", q: { d: "fda_minutes", p: 5, t: "Committee members cited the following as their reasons for voting against approval: concerning safety risks, untested proposed mitigation dosing strategy with unknown efficacy, sicker patients with greater need to demonstrate safety, and difficulty in obtaining more definitive data in the post-marketing setting." } }
    ],
    choices: { ndd: "fda_onstudy", decisionNdd: "reject", decisionDd: "reject", rm: ["trial"] }
  },
  ema: {
    steps: [
      { k: "疗效", v: "NDD 对安慰剂明确改善 Hb；与 ESA 相当", q: { d: "ema_epar", p: 109, t: "Treatment with roxadustat shows comparable efficacy for correcting and maintaining Hb levels versus ESA therapy and was maintained over time in both groups." } },
      { k: "NDD 的 MACE", v: "主要分析 HR 1.26，上限超过 1.3 界值；风险不能排除", q: { d: "ema_epar", p: 132, t: "Both the MACE and MACE+ primary analyses are suggestive of an increased CV safety risk for treatment with roxadustat with a HR > 1 and with an upper CI outside the 1.3 margin." } },
      { k: "DD 的 MACE", v: "风险增加由从 ESA 转换的研究驱动，归因于转换设计", q: { d: "ema_epar", p: 151, t: "In dialysis patients compared to ESA therapy, the observed increase in MACE and mortality risk is driven by the conversion to ESA studies, and can likely explained by dysregulation of ESA stabilised patients with randomisation to roxadustat" } },
      { k: "血栓", v: "静脉血栓倾向明确，NDD 对安慰剂最明显；列为已识别风险，SmPC 要求 Hb 监测", q: { d: "ema_epar", p: 151, t: "This is most pronounced in the non-dialysis patients compared to placebo but also observed for dialysis patients compared to ESA therapy." } },
      { k: "结论", v: "获益只在本应符合 ESA 治疗条件的患者中超过风险，因此限定适用人群", q: { d: "ema_epar", p: 151, t: "Based on this certainty, it is proposed that treatment with roxadustat should be restricted to those patients that would normally qualify for ESA therapy." } }
    ],
    choices: { ndd: "ema_ipcw", decisionNdd: "conditional", decisionDd: "conditional", rm: ["label", "monitor", "restrict"] }
  },
  nmpa: {
    steps: [
      { k: "需求与定位", v: "全新作用机制、口服、提高铁利用率、无需静脉补铁；以“具有明显治疗优势创新药”纳入优先审评", q: { d: "cde_2018_annual_report", p: 13, t: "该药品具有全新作用机制，与现有常规治疗药物相比，可口服给药，在提高铁利用率、无需静脉补铁等方面具有临床优势。" } },
      { k: "疗效", v: "806 对阿法依泊汀非劣效；808 对安慰剂优效", q: { d: "cde_review_CXHS1700019-20", p: 13, t: "治疗差异（罗沙司他－阿法依泊汀）的95%CI下限+0.2g/L高于-10g/L，因此确立了罗沙司他与阿法依泊汀相比具有非劣效性。" } },
      { k: "心血管与血栓", v: "按当时数据未提示风险增加，但长期样本有限，心血管事件作为缺失信息", q: { d: "cde_review_CXHS1700019-20", p: 15, t: "尽管临床研究中未观察到增加心血管事件的风险，但考虑本品目前长期用药样本量毕竟有限，将心血管事件作为缺失信息，不作为已经识别的潜在风险。" } },
      { k: "获益-风险", v: "口服、依从性更好，获益风险比有利", q: { d: "cde_review_CXHS1700019-20", p: 16, t: "罗沙司他的安全性总体耐受良好，目前国内外已获得的安全性数据未提示罗沙司他有增加 CKD 患者发生心、脑血管事件、血栓栓塞、高血压和肿瘤的风险。本品作为口服小分子药物，与 EPO 相比，具有更好的用药依从性，提供了有利的获益风险比。" } },
      { k: "上市后", v: "PASS 2,000 例、用药至少 12 个月，另有重点监测与剂量优化研究", q: { d: "cde_review_CXHS1700019-20", p: 20, t: "上市后安全性研究（PASS）：一项多中心、开放、单臂、前瞻性研究，用于治疗透析和未透析的 CKD 贫血患者，入组 2000 例，受试者将接受罗沙司他治疗至少 12 个月。" } }
    ],
    choices: { ndd: null, decisionNdd: "approve", decisionDd: "approve", rm: ["pass"] }
  },
  pmda: {
    steps: [
      { k: "疗效", v: "0307 对 darbepoetin 非劣效", q: { d: "pmda_review_2019", p: 61, t: "Non-inferiority of the roxadustat to the DA group was thus demonstrated." } },
      { k: "血栓", v: "血栓栓塞相关事件高于 DA 组", q: { d: "pmda_review_2019", p: 73, t: "Although the majority of thromboembolism-related events in HD patients receiving roxadustat were mild or moderate in severity, the incidence of thromboembolism-related events in the roxadustat group was higher than that in the DA group." } },
      { k: "安全性判断", v: "以基于 Hb 的仔细剂量调整为前提，安全性可以接受", q: { d: "pmda_review_2019", p: 66, t: "the safety of roxadustat in patients with renal anemia on HD or PD is acceptable with a view to dose adjustment based on careful monitoring of Hb values, etc." } },
      { k: "定位", v: "作用机制不同于 ESA 的口服药，是新的治疗选择", q: { d: "pmda_review_2019", p: 77, t: "Because roxadustat is an oral drug with its action mechanism different from ESAs, roxadustat can become a new treatment option for dialysis patients with renal anemia." } },
      { k: "风险管理", v: "说明书 WARNING：严重血栓栓塞", q: { d: "pmda_review_2019", p: 89, t: "Roxadustat therapy may cause serious thromboembolism including cerebral infarction, myocardial infarction, and pulmona" } }
    ],
    choices: { ndd: null, decisionNdd: null, decisionDd: "approve", rm: ["label", "monitor", "pass"] }
  }
};

// ---- Board 3: scripted debate (every line grounded in a quote) ----------
const DEBATE = [
  {
    title: "第 1 轮 · NDD 的 MACE 该看哪种分析？",
    lines: [
      { who: "host", say: "非透析的三项安慰剂对照研究里，完成率是罗沙司他 62%、安慰剂 41%。同一批数据，FDA 和 EMA 选了不同的主要分析。", q: { d: "fda_briefing", p: 17, t: "62% and 41% of patients randomized to roxadustat and placebo, respectively, completed" } },
      { who: "fda", say: "安慰剂组退出的多是贫血没改善、病情更重的人，这类人心血管风险更高。", q: { d: "fda_briefing", p: 13, t: "Patients with more advanced disease whose Hb was poorly responsive to the study drug were more likely to leave the study, and experience has shown that such patients are at greater risk of cardiovascular events." } },
      { who: "fda", say: "OT+7 把这些人退出后的观察期截掉了，所以它的偏倚对罗沙司他不利。我们以 On-study 为主，HR 1.10。", q: { d: "fda_briefing", p: 48, t: "Thus, the differential dropout may contribute to a biased estimate of the treatment effect in the OT+7 analysis that disfavors roxadustat." } },
      { who: "ema", say: "按我们的心血管安全指南，首选包含治疗期事件的分析。按停药概率加权后 HR 1.26，上限超过 1.3。", q: { d: "ema_epar", p: 132, t: "An analysis, including the on-treatment events, is the preferred analysis according to the EMA reflection paper." } },
      { who: "ema", say: "ITT（随机化后全部随访）敏感度低：停药后患者可能改用 ESA，事件更多来自背景风险和后续治疗。", q: { d: "ema_epar", p: 132, t: "However, this method is not preferred due to lower sensitivity, because events will be less likely due to the randomised treatment and more likely due to the background event rate and subsequent therapies (especially due to the possibility of introducing ESA therapy after treatment discontinuation)" } },
      { who: "fda", say: "我们也承认 On-study 有缺点：救援治疗的暴露会影响比较。", q: { d: "fda_presentations", p: 55, t: "Exposure to rescue therapy might impact the comparison of risks" } },
      { who: "ema", say: "我们的加权能不能把残余混杂校正干净，也不确定。", q: { d: "ema_epar", p: 144, t: "Whether this method is able to appropriately correct for any residual confounding is uncertain." } },
      { who: "host", say: "两家都承认差异性脱落让结果难以解读。分歧在于：用哪种分析作主要依据，以及偏倚朝哪个方向。可以回到工作台，用“脱落偏倚原理演示”看看两种担心各自成立的条件。", q: null }
    ]
  },
  {
    title: "第 2 轮 · 透析人群的风险从哪来？",
    lines: [
      { who: "fda", say: "我们只汇总三项可比的研究。613 用了两种 ESA 对照、只在欧洲做、还允许用美国未批准的 ESA，所以单列。", q: { d: "fda_briefing", p: 14, t: "the study differs from those above because it employed two active comparators (darbepoetin alfa and epoetin alfa), was conducted exclusively in Europe, and permitted use of an ESA that is not licensed in the US." } },
      { who: "fda", say: "主要分析 HR 1.02，中性；但 On-study 的全因死亡 HR 1.17，置信区间不含 1。", q: { d: "fda_briefing", p: 53, t: "In the On-Study analysis, the HR was 1.17, with a 95% CI that excluded 1 (1.02, 1.35) (Figure 12)." } },
      { who: "ema", say: "我们把 4 项研究都汇总，再拆开看：风险集中在从稳定 ESA 治疗被换成罗沙司他的患者。", q: { d: "ema_epar", p: 133, t: "This has been clarified by the design related issue of the need for switching to roxadustat treatment in one study arm whereas ESA patients could remain on their stabilised dose for maintaining their Hb level in the target range." } },
      { who: "ema", say: "临床上，没有理由的话不会把稳定的 ESA 患者换药。", q: { d: "ema_epar", p: 133, t: "As clarified, such switching strategy for a stable ESA treated patient is not common clinical practice unless there is a valid clinical indication to do so." } },
      { who: "fda", say: "新进入透析（incident）没有标准定义，方案又多次修订，所以我们没有做这个亚组。", q: { d: "fda_briefing", p: 23, t: "Incident dialysis did not have a standard definition. Because of the multiple amendments and lack of a standardized definition, FDA did not further analyze this subgroup." } },
      { who: "host", say: "讨论：用拆分来解释风险、再据此限定人群，和“风险来自药物本身”相比，各需要什么证据才站得住？", q: null }
    ]
  },
  {
    title: "第 3 轮 · 血栓能不能靠剂量和说明书管住？",
    lines: [
      { who: "pmda", say: "日本 0307 里，血栓栓塞相关事件比 DA 组多。", q: { d: "pmda_review_2019", p: 73, t: "Although the majority of thromboembolism-related events in HD patients receiving roxadustat were mild or moderate in severity, the incidence of thromboembolism-related events in the roxadustat group was higher than that in the DA group." } },
      { who: "pmda", say: "我们的判断是：以基于 Hb 的仔细剂量调整为前提，安全性可以接受，并在说明书加 WARNING。", q: { d: "pmda_review_2019", p: 66, t: "the safety of roxadustat in patients with renal anemia on HD or PD is acceptable with a view to dose adjustment based on careful monitoring of Hb values, etc." } },
      { who: "fda", say: "Hb 上升越快，血栓越多，这只是关联。降低起始剂量能降风险，合理但没被证明。", q: { d: "fda_briefing", p: 12, t: "Their prediction seems plausible, but is unproven. Our findings show only associations, without proven cause and effect." } },
      { who: "fda", say: "委员会的意见是：建模不能代替批准前的临床试验。", q: { d: "fda_minutes", p: 6, t: "Several committee members remained concerned that the Applicant's proposed dosing regimen to reduce thrombosis risks was not tested, and stated that modeling should not replace a clinical trial prior to approval." } },
      { who: "ema", say: "我们把血栓列为已识别风险，在说明书警告部分写入 Hb 监测要求。", q: { d: "ema_epar", p: 136, t: "Recommendations for haemoglobin monitoring are included in the Special warnings and precautions for use section (SmPC section 4.4)." } },
      { who: "nmpa", say: "按 2018 年的数据，没有提示血栓栓塞风险增加。", q: { d: "cde_review_CXHS1700019-20", p: 16, t: "目前国内外已获得的安全性数据未提示罗沙司他有增加 CKD 患者发生心、脑血管事件、血栓栓塞、高血压和肿瘤的风险。" } },
      { who: "host", say: "注意口径：说明书把日本 444 例中的“血栓形成”记为 1.4%，PMDA 按 SMQ 统计血透汇总是 11.3%。同一批数据，定义不同，数字差了约 8 倍。", q: { d: "cde_label_roxadustat", p: 9, t: "报告了 2（0.5%）例心肌梗死、5（1.1%）例心力衰竭、6（1.4%）例脑血管意外、6（1.4%）例血栓形成" } }
    ]
  },
  {
    title: "第 4 轮 · 没有全球心血管数据，为什么能先批？",
    lines: [
      { who: "nmpa", say: "截至 2018 年 7 月，41 项试验里 2,333 人用过罗沙司他，213 人用药超过一年。", q: { d: "cde_review_CXHS1700019-20", p: 16, t: "完成的临床试验中共 2333 名受试者接受了罗沙司他治疗，有 213 例用药时间超过 1 年，获得了较为充分的长期用药数据。" } },
      { who: "nmpa", say: "但长期样本毕竟有限，所以心血管事件作为缺失信息，靠上市后研究补。", q: { d: "cde_review_CXHS1700019-20", p: 15, t: "尽管临床研究中未观察到增加心血管事件的风险，但考虑本品目前长期用药样本量毕竟有限，将心血管事件作为缺失信息，不作为已经识别的潜在风险。" } },
      { who: "pmda", say: "它是作用机制不同于 ESA 的口服药，可以成为新的治疗选择。", q: { d: "pmda_review_2019", p: 77, t: "Because roxadustat is an oral drug with its action mechanism different from ESAs, roxadustat can become a new treatment option for dialysis patients with renal anemia." } },
      { who: "fda", say: "我们不要求新药比现有治疗更好或更安全，但会结合已有疗法来权衡。", q: { d: "fda_briefing", p: 12, t: "Our standards do not state that a drug must be more effective than existing treatment(s) to merit approval, or be safer than existing treatments. Yet when weighing the approval of a new drug, we do consider its benefits and risks in context, including the availability of other therapies." } },
      { who: "ema", say: "我们的办法是把获益-风险结论限定在本应符合 ESA 治疗条件的患者。", q: { d: "ema_epar", p: 151, t: "Based on this certainty, it is proposed that treatment with roxadustat should be restricted to those patients that would normally qualify for ESA therapy." } },
      { who: "host", say: "中日先批，首先是证据不同；欧美结论相反，主要是分析口径和价值判断不同。最后一步，请把每个分歧点归到这三层。", q: null }
    ]
  }
];

const ATTRIBUTION = [
  { id: "d1", text: "NDD 的 MACE：FDA 以 On-study 为主（1.10），EMA 以加权 on-treatment 为主（1.26）", answer: ["method"], note: "同一批数据，主要分析不同；中日决策时没有这批数据，也算证据不同。", alsoEvidence: true },
  { id: "d2", text: "DD 的 MACE：FDA 不纳入 613，EMA 纳入并按“转换 / 校正”拆分", answer: ["method", "value"], note: "纳入与拆分是分析选择；据拆分结果限定人群是价值判断。" },
  { id: "d3", text: "血栓：PMDA 和 EMA 认为靠说明书和 Hb 监测可以管理，FDA 委员会要求先做试验", answer: ["value", "evidence"], note: "风险可否靠工具管理是价值判断；CDE 用跨试验比较、FDA 用同期对照，证据强度不同。" },
  { id: "d4", text: "Hb 过冲：FDA 关注上升速度与血栓的关联，EMA 认为过冲不能解释风险、关注低反应者", answer: ["method"], note: "对同一现象的解释框架不同。" },
  { id: "d5", text: "口服的价值：FDA 认为对血透患者优势不明显，CDE 和 PMDA 把“口服、新机制”作为主要获益", answer: ["value"], note: "未满足需求和便利性的权重不同。" },
  { id: "d6", text: "不确定性：FDA 委员会要上市前验证，CDE 和 PMDA 用上市后研究，EMA 用限定人群", answer: ["value"], note: "监管工具和风险容忍度不同。" },
  { id: "d7", text: "数据诚信：FibroGen 披露心血管主分析用了事后更改的分层因素", answer: ["method"], note: "分层因素是分析选择；按文件原文，FDA 和 EMA 都认为结果相近，没有作为决策依据。" }
];

const LAYERS = { evidence: "证据不同", method: "口径不同", value: "价值不同" };

const DECISIONS = {
  approve: "批准",
  conditional: "附条件批准 / 限定人群",
  trial: "要求先做试验再说",
  reject: "不批准"
};
const RISK_TOOLS = {
  label: "说明书警告",
  monitor: "Hb 监测与剂量规则",
  restrict: "限定适用人群",
  pass: "上市后安全性研究",
  rems: "REMS / 额外风险管理",
  trial: "批准前验证低剂量方案"
};

// ---- Per-agency workbench (before reveal each group sees only its own agency's data) ----
const FDA_EFFECTS = {
  ndd: {
    note: "FDA 简报与会上幻灯片的数字。严重不良事件为 OT+7 窗口；输血减少是探索性分析。",
    noteSrc: [["fda_questions", 1, "an absolute reduction in RBC transfusions of approximately 10% compared to placebo"]],
    favourable: [
      { k: "RBC 输血（001）", r: "12.7%", c: "23.3%", unit: "比例", src: [["fda_briefing", 19, "176 (12.7) 320 (23.3)"]] },
      { k: "RBC 输血（060）", r: "5.6%", c: "15.4%", unit: "比例", src: [["fda_briefing", 19, "34 (5.6) 47 (15.4)"]] },
      { k: "RBC 输血（608）", r: "8.5%", c: "19.2%", unit: "比例", src: [["fda_briefing", 19, "33 (8.5) 39 (19.2)"]] }
    ],
    unfavourable: [
      { k: "MACE（On-study）", r: "10.6", c: "10.3", unit: "/100 人年", per: true, by: "fda", src: [["fda_briefing", 47, "480 (10.6) 350 (10.3)"]] },
      { k: "MACE（OT+7）", r: "7.2", c: "5.6", unit: "/100 人年", per: true, by: "fda", src: [["fda_briefing", 47, "277 (7.2) 131 (5.6)"]] },
      { k: "严重血栓事件", r: "3.62", c: "2.50", unit: "/100 人年", per: true, by: "fda", src: [["fda_presentations", 32, "Thrombotic events 140 (5.87) 58 (3.08) 3.62 2.50"]] },
      { k: "严重通路血栓", r: "0.93", c: "0.34", unit: "/100 人年", per: true, by: "fda", src: [["fda_presentations", 32, "Device/shunt thrombosis 36 (1.51) 8 (0.42) 0.93 0.34"]] },
      { k: "严重深静脉血栓", r: "0.52", c: "0.09", unit: "/100 人年", per: true, by: "fda", src: [["fda_presentations", 32, "Deep vein thrombosis (term) 20 (0.84) 2 (0.11) 0.52 0.09"]] },
      { k: "严重败血症/感染性休克", r: "2.25", c: "0.95", unit: "/100 人年", per: true, by: "fda", src: [["fda_presentations", 32, "Sepsis/septic shock 87 (3.65) 22 (1.17) 2.25 0.95"]] },
      { k: "严重癫痫", r: "0.2", c: "0.0", unit: "/100 人年", per: true, by: "fda", src: [["fda_presentations", 32, "Seizure FDA 9 (0.38) 1 (0.05) 0.2 0.0"]] },
      { k: "严重高钾血症", r: "1.45", c: "0.95", unit: "/100 人年", per: true, by: "fda", src: [["fda_presentations", 32, "Hyperkalemia (term) 56 (2.35) 22 (1.17) 1.45 0.95"]] }
    ],
    tradeoffText: "获益是“患者比例”（输血少了约 10 个百分点），风险是“每 100 人年”的发生率，单位不同，要先换算才能放在一起比。两个 MACE 窗口算出的超额事件也差很多。"
  },
  dd: {
    note: "FDA 简报 Table 23（严重不良事件，OT+7）和 MACE 表。对照是 epoetin alfa。",
    noteSrc: [["fda_briefing", 41, "Serious thrombotic events and seizures are again prominent."]],
    favourable: [
      { k: "Hb 变化差值（002 / 063 / 064）", r: "0.09 / 0.18 / 0.48 g/dL", c: "—", unit: "罗沙司他 − EA", src: [["fda_briefing", 28, "0.09 (0.01, 0.18) 0.18 (0.08, 0.29) 0.48 (0.37, 0.59)"]] },
      { k: "RBC 输血", r: "无法下结论", c: "", unit: "", src: [["fda_briefing", 27, "it cannot be concluded that subjects who received roxadustat required fewer RBC transfusions"]] }
    ],
    unfavourable: [
      { k: "MACE（OT+7）", r: "9.4", c: "9.3", unit: "/100 人年", per: true, by: "fda", src: [["fda_briefing", 51, "306 (9.4) 339 (9.3)"]] },
      { k: "MACE（On-study）", r: "12.4", c: "10.9", unit: "/100 人年", per: true, by: "fda", src: [["fda_briefing", 51, "482 (12.4) 451 (10.9)"]] },
      { k: "严重血栓", r: "7.27", c: "5.37", unit: "/100 人年", per: true, by: "fda", src: [["fda_briefing", 41, "Thrombosis 241 (12.42) 201 (10.36) 7.27 5.37"]] },
      { k: "严重通路血栓", r: "3.65", c: "2.51", unit: "/100 人年", per: true, by: "fda", src: [["fda_briefing", 41, "Device/shunt thrombosis 121 (6.24) 94 (4.85) 3.65 2.51"]] },
      { k: "严重深静脉血栓", r: "0.72", c: "0.19", unit: "/100 人年", per: true, by: "fda", src: [["fda_briefing", 41, "24 (1.24) 7 (0.36) 0.72 0.19"]] },
      { k: "严重癫痫", r: "0.78", c: "0.51", unit: "/100 人年", per: true, by: "fda", src: [["fda_briefing", 41, "Seizure FDA 26 (1.34) 19 (0.98) 0.78 0.51"]] },
      { k: "严重胰腺炎", r: "0.60", c: "0.29", unit: "/100 人年", per: true, by: "fda", src: [["fda_briefing", 41, "Pancreatitis FDA 20 (1.03) 11 (0.57) 0.60 0.29"]] },
      { k: "严重低血糖", r: "0.87", c: "0.67", unit: "/100 人年", per: true, by: "fda", src: [["fda_briefing", 41, "Hypoglycemia FDA 29 (1.49) 25 (1.29) 0.87 0.67"]] }
    ],
    tradeoffText: "Hb 与 epoetin alfa 相当，输血差异无法下结论。主要获益是口服；FDA 认为对血透患者口服的优势不明显。"
  }
};

const NMPA_PANEL = {
  efficacy: [
    { k: "806 · 透析 · 对照阿法依泊汀 · 开放", v: "Hb 差值 95% CI 下限 +0.2 g/L，高于非劣效界值 −10 g/L", src: [["cde_review_CXHS1700019-20", 13, "95%CI下限+0.2g/L高于-10g/L"]] },
    { k: "808 · 非透析 · 对照安慰剂 · 双盲", v: "第 7–9 周 Hb：+19.0 g/L vs −3.9 g/L（p < 0.00001）", src: [["cde_review_CXHS1800013-14", 9, "升高19.0g/L，而安慰剂组受试者的平均Hb水平自基线降低3.9g/L"]] }
  ],
  followup: { v: "806：204 人用药 6 个月，其中 111 人延至一年；808：128 人用药 6 个月", src: [["cde_label_roxadustat", 8, "其中的 111 名受试者又继续接受罗沙司他治疗至一年"], ["cde_label_roxadustat", 8, "128 名受试者接受了罗沙司他治疗 6 个月"]] },
  compare: [
    { k: "心力衰竭", cn: ["1.5%", "2.5%"], esa: ["7.3", "5.9"], src: [["cde_label_roxadustat", 8, "心力衰竭 1.5% 2.5%"], ["cde_label_roxadustat", 9, "心力衰竭 7.3 5.9"]] },
    { k: "心肌梗死", cn: ["0.4%", "0.0%"], esa: ["3.8", "2.5"], src: [["cde_label_roxadustat", 9, "心肌梗死 0.4% 0.0%"], ["cde_label_roxadustat", 9, "心肌梗死 3.8 2.5"]] },
    { k: "血栓形成", cn: ["4.2%", "1.2%"], esa: ["21.7", "6.5"], src: [["cde_label_roxadustat", 9, "血栓形成 4.2% 1.2%"], ["cde_label_roxadustat", 9, "血栓形成 21.7 6.5"]] },
    { k: "高血压（严重）", cn: ["0.4%", "1.6%"], esa: ["14.9", "13.5"], src: [["cde_label_roxadustat", 9, "高血压（严重） 0.4% 1.6%"], ["cde_label_roxadustat", 9, "高血压（严重） 14.9 13.5"]] }
  ],
  compareNote: { v: "说明书据此认为心血管事件发生率“并未高于 ESAs 类药物”", src: [["cde_label_roxadustat", 8, "罗沙司他临床试验中报告的心血管事件发生率并未高于 ESAs 类药物"]] },
  questions: [
    "表 6 是百分比，表 7 是每 100 病人暴露年，单位不同，能直接比吗？",
    "表 7 的数字来自其他药物试验的 ESA 组，人群、随访时长和中国试验一样吗？",
    "没有同期对照时，“并未高于 ESA”这个结论有多强？如果要你批，你会加什么条件？"
  ]
};

const PMDA_PANEL = {
  ni: { diff: -0.02, lo: -0.18, hi: 0.15, margin: -0.75, src: [["pmda_review_2019", 50, "−0.02 [−0.18, 0.15] g/dL"], ["pmda_review_2019", 50, "non-inferiority margin, −0.75 g/dL"]] },
  safety: [
    { k: "死亡", r: "2 例", c: "0 例", src: [["pmda_review_2019", 51, "Deaths occurred in 2 subjects in the roxadustat group"]] },
    { k: "死亡以外的严重不良事件", r: "19.3%", c: "14.5%", src: [["pmda_review_2019", 51, "19.3% (29/150)"], ["pmda_review_2019", 51, "14.5% (22 of 152)"]] },
    { k: "所有不良反应", r: "22.0%", c: "13.2%", src: [["pmda_review_2019", 51, "All adverse drug reactions 22.0 (33) 13.2 (20)"]] },
    { k: "血栓栓塞相关事件", r: "9.3%", c: "3.9%", src: [["pmda_review_2019", 73, "Thromboembolism-related events total 9.3 (14) 3.9 (6)"]] },
    { k: "其中分流闭塞", r: "4.7%", c: "2.0%", src: [["pmda_review_2019", 73, "Shunt occlusion 4.7 (7) 2.0 (3)"]] }
  ],
  pooled: [
    { k: "血透汇总（无同期对照）血栓栓塞相关事件", v: "11.3%（44/388）", src: [["pmda_review_2019", 72, "11.3% (44 of 388 subjects)"]] },
    { k: "严重血栓栓塞相关事件", v: "罗沙司他汇总 8.2% vs DA 2.6%", src: [["pmda_review_2019", 72, "8.2% in the roxadustat group (32 of 388"], ["pmda_review_2019", 72, "2.6% in the DA group (4 of 152 subjects"]] }
  ],
  questions: [
    "0307 两组各约 150 人、24 周，死亡 2 例 vs 0 例能说明什么？",
    "血透汇总 11.3% 来自没有对照的研究，拿它和 0307 的 DA 组 3.9% 比合适吗？",
    "如果血栓和 Hb 上升太快有关，能不能靠剂量规则和说明书来管？"
  ]
};

const WORKBENCH = {
  fda: { ndd: ["fda_onstudy", "fda_ot7"], dd: ["fda_dd_ot7", "fda_dd_onstudy", "fda_dd_death", "fda_613_death"] },
  ema: { ndd: ["ema_ipcw", "ema_itt"], dd: ["ema_dd_all", "ema_stable", "ema_correction", "ema_esa7000"] }
};

// ---- Board 3: decision timeline (dates only from the documents) ---------
const TIMELINE = [
  { date: "2018-12-17", agency: "nmpa", label: "批准透析适应症", src: [["cde_review_CXHS1700019-20", 4, "批准日期：2018 年 12 月 17 日"]] },
  { date: "2019-08-16", agency: "nmpa", label: "批准非透析适应症", src: [["cde_review_CXHS1800013-14", 4, "批准日期：2019 年 08 月 16 日"]] },
  { date: "2019-08-29", agency: "pmda", label: "新药第一部会审议（透析）", src: [["pmda_review_2019", 1, "In its meeting held on August 29, 2019, the First Committee on New Drugs"]] },
  { date: "2021-06-24", agency: "ema", label: "CHMP 意见", src: [["ema_epar", 9, "24 June 2021"]] },
  { date: "2021-07-15", agency: "fda", label: "咨询委员会会议", src: [["fda_briefing", 1, "July 15, 2021"]] }
];
