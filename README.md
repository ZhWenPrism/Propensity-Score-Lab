# ICU 倾向评分实验室

**[打开应用](https://zhwenprism.github.io/Propensity-Score-Lab/)**

网页即时生成 360 条完全合成的成人 ICU 入科记录，按一条完整的分析流程演示 PSM、IPTW 和 OW。数据字段参照 MIMIC-IV 的 `patients`、`admissions`、`icustays`、`chartevents`、`labevents` 和 `inputevents` 结构；**不含 MIMIC 原始患者记录，也不是对真实 MIMIC 分布的复刻**。

## 页面流程

1. **选指标**：勾选进入 PS 模型的变量（6 个混杂因素、1 个工具变量、1 个只影响结局的变量），显示 OR、c-statistic，以及每个人的 PS 相对默认模型的变化。
2. **PS 分布**：调整前、PSM 配对后、IPTW 加权后、OW 加权后的镜像直方图与重叠系数 OVL；Love plot 同时列出未入模的变量。
3. **个人贡献**：按 PS 排列的队列图，可切换方法；点击任一患者查看 PSM 配对对象、IPTW / OW 权重及其占本组总权重的比例。
4. **极端个体**：IPTW 权重最大的 6 人，可逐个排除后整条流程重算，并与预设的权重截断（1%/99%）和 PS 修剪（0.1–0.9）对照。
5. **生存结局**：四组 Kaplan–Meier 曲线（未调整、PSM、加权 KM），Cox HR (95% CI)、P 值、28 天死亡率差，以及各估计目标在这批合成数据中的真值。

## 方法要点

- 时间零点为 ICU 入科。治疗为入科时启动去甲肾上腺素，结局为 28 天内死亡时间（第 28 天行政删失）。
- PS：logistic 回归。PSM：logit(PS) 上 0.2 SD 卡钳的无放回 1:1 贪心匹配。IPTW：`1/PS` 与 `1/(1−PS)`。OW：`1−PS` 与 `PS`。
- HR：加权 Cox 模型（Breslow），PSM 用按配对聚类的 robust SE，IPTW / OW 用 robust sandwich SE；权重视为已知，未计入 PS 估计的不确定性。
- 三种方法的估计目标不同（PSM：配上的去甲患者；IPTW：ATE；OW：ATO），结果应与各自的真值比较。页面上的效应量与 P 值仅用于方法教学。

## 文件

`sim.js` 数据生成 · `stats.js` PS、匹配、加权、Cox、KM · `charts.js` SVG 图 · `app.js` 交互。纯静态页面，无需构建。

字段结构参考：[MIMIC-IV 官方文档](https://mimic.mit.edu/docs/iv/) · [PhysioNet MIMIC-IV v3.1](https://physionet.org/content/mimiciv/3.1/)
