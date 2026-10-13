# ICU 倾向评分实验室

**[打开应用](https://zhwenprism.github.io/Propensity-Score-Lab/)**

网页即时生成 360 条完全合成的成人 ICU 入科记录，并同时展示 PSM、IPTW、OW 的逐人计算、基线平衡与 28 天死亡率差。数据字段参照 MIMIC-IV 的 `patients`、`admissions`、`icustays`、`chartevents`、`labevents` 和 `inputevents` 结构；**不含 MIMIC 原始患者记录，也不是对真实 MIMIC 分布的复刻**。

研究示例以 ICU 入科时为时间零点。年龄、性别、MAP、乳酸、肌酐及合成的治疗前 SOFA 用于估计接受去甲肾上腺素的倾向评分；治疗与 28 天结局随后生成。PSM 使用 logit(PS) 上 0.2 SD 卡钳的无放回 1:1 贪心匹配；IPTW 使用 `1/PS` 与 `1/(1−PS)`；OW 使用 `1−PS` 与 `PS`。三个方法面向的人群不同，页面上的单次死亡率差不能用于比较方法的真实临床优劣。

字段结构参考：[MIMIC-IV 官方文档](https://mimic.mit.edu/docs/iv/) · [PhysioNet MIMIC-IV v3.1](https://physionet.org/content/mimiciv/3.1/)
