# 倾向评分实验室 | Propensity Score Lab

一个可直接在浏览器打开的中文交互式教学网页，演示倾向评分（PS）、倾向评分匹配（PSM）、逆概率加权（IPTW）和重叠加权（OW）。适合在课堂上对比不同治疗分配场景下的患者配对、个人权重、基线平衡与示例疗效估计。

**在线演示：** https://zhwenprism.github.io/Propensity-Score-Lab/

## 使用

打开在线演示，或下载仓库后直接打开 `index.html`。选择治疗选择偏向，切换 PSM / IPTW / OW，观察 PS 分布、基线特征的标准化均数差（SMD）、纳入人数或权重及示例疗效比较。点击“换一批患者”可观察抽样波动；在患者表中输入编号可查看个人结果。

## 计算说明

- 页面每次生成 240 名**完全模拟**的患者。年龄、基线病情严重度和肾功能在用药前确定。模拟的用药选择受这些变量影响；模拟结局中的治疗作用固定为 +8 分。不同随机抽样的估计值会波动。
- 页面使用 Logistic 回归从用药前变量和实际治疗组拟合 `PS = P(药物 A | 用药前特征)`，不使用结局拟合 PS。
- PSM：按 PS 的 logit 距离进行 1:1、无放回、最近邻匹配；卡钳为 `0.2 × SD(logit PS)`。表中的效应是成功配对的用药患者与其对照者的结局差平均值。
- IPTW：用药者 `1/PS`，对照者 `1/(1−PS)`；报告原始权重、两组有效样本量和加权均值差。示例中未做权重截断。
- OW：用药者 `1−PS`，对照者 `PS`；报告两组有效样本量和加权均值差。
- SMD 使用两组加权均值之差除以**处理前**两组标准差的平方平均的平方根。图中 0.1 为常用参考线，不是普遍适用的判定规则。

这三种方法对应不同的目标人群。网页展示的单次估计结果不能用来给方法排名，也不能证明真实临床疗效。真实研究还需处理未测量混杂、时间顺序、治疗选择的重叠，以及结局分析和不确定性估计。

## 资料

- Rosenbaum PR, Rubin DB. The central role of the propensity score in observational studies for causal effects. *Biometrika*. 1983. https://doi.org/10.1093/biomet/70.1.41
- Austin PC, Stuart EA. Moving towards best practice when using inverse probability of treatment weighting. *Statistics in Medicine*. 2015. https://pmc.ncbi.nlm.nih.gov/articles/PMC4626409/
- Li F, Morgan KL, Zaslavsky AM. Balancing covariates via propensity score weighting. *Journal of the American Statistical Association*. 2018. https://doi.org/10.1080/01621459.2016.1260466

## 技术

原生 HTML、CSS 和 JavaScript；无需安装依赖。网页在浏览器本地生成和计算模拟数据，不上传患者数据。
