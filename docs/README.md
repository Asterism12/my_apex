# 项目设计文档总览

本文档目录包含 `Apex 世界赛决赛模拟系统` 的全部设计文档。各文档按**由底层到上层、由核心到扩展**的顺序组织，建议新成员按以下路径阅读。

---

## 阅读路线图

```
┌──────────────────────────────────────────────────────────┐
│  第一步：技术架构（全局视角）                              │
│  ├─ architecture_design.md                               │
│                                                          │
│  第二步：核心战斗层                                        │
│  ├─ combat_simulator_design.md  →  br_match_design.md    │
│                                                          │
│  第三步：赛事总控层                                        │
│  ├─ tournament_design.md                                 │
│                                                          │
│  第四步：沉浸体验扩展（可选，相对独立）                     │
│  ├─ team_comms_design.md  →  tts_design.md               │
└──────────────────────────────────────────────────────────┘
```

---

## 文档清单与关联关系

### 1. `architecture_design.md` — 三层架构技术实现文档
- **定位**：全局技术架构说明书
- **内容**：界面层、逻辑层、控制层的分层职责，以及控制层的**本地/HTTP 双模式适配机制**
- **阅读建议**：**最先阅读**。理解代码目录 `src/ui/`、`src/logic/`、`src/control/` 的划分依据。

---

### 2. `combat_simulator_design.md` — 3v3 战斗模拟器系统设计
- **定位**：最底层的微观战斗核心
- **内容**：两支队伍（3v3）的属性配置、Tick 级攻击计算、伤害与状态管理、胜负判定
- **关联**：`br_match_design.md` 中的**局部战斗场**复用了此 3v3 引擎的微观 Tick 逻辑
- **阅读建议**：在理解架构后阅读，掌握队伍属性（枪法、战斗经验、地形优势）如何映射为内部系数。

---

### 3. `br_match_design.md` — 大逃杀单局模拟系统设计
- **定位**：20 队大逃杀单局（Battle Royale Match）
- **内容**：大地图与随机出生、宏观/微观双层 Tick、资源搜集（Loot）、缩圈机制、多队混战（劝架）
- **关联**：
  - **向上依赖**：`combat_simulator_design.md`（局部交战时实例化 3v3 战斗场）
  - **被扩展**：`tournament_design.md`（单局被封装为多局赛事中的一个 Match）
  - **联动**：`team_comms_design.md`（队伍状态机直接驱动沟通事件触发）
- **阅读建议**：掌握 3v3 核心后阅读，重点理解宏观 Tick 与微观战斗场的切换机制。

---

### 4. `tournament_design.md` — 世界赛决赛模拟系统设计（赛点制）
- **定位**：多局赛事总控与赛点制（Match Point）规则
- **内容**：ALGS 积分规则（击杀分 + 排名分）、跨局状态继承、赛点触发与夺冠判定
- **关联**：**直接扩展** `br_match_design.md`，将其从单局模拟提升为连续多局赛事
- **阅读建议**：理解单局 BR 逻辑后阅读，关注 `Tournament State` 与单局 `Match State` 的边界。

---

### 5. `team_comms_design.md` — 团队沟通日志系统设计
- **定位**：沉浸感扩展 —— 战队内部语音频道模拟
- **内容**：基于游戏 Tick 状态机的事件分类（DROP / LOOT / RING_MOVE / ENGAGE / COMBAT_FEEDBACK / THIRD_PARTY / GAME_OVER）、语料数据字典结构
- **关联**：
  - **数据源**：`br_match_design.md` 中定义的队伍状态（`status`、`tick`、`Combat Instance`）
  - **前端展示**：`tts_design.md` 将其文本日志转为语音播报
- **阅读建议**：可在理解 BR 状态机后阅读，相对独立。

---

### 6. `tts_design.md` — Web 语音播报系统设计
- **定位**：`team_comms_design.md` 的前端语音延伸
- **内容**：Web Speech API 选型、角色音色映射（pitch / rate）、播放队列控制、UI 高亮同步
- **关联**：**仅依赖** `team_comms_design.md` 生成的 `comms` 数组；对逻辑层、控制层零侵入
- **阅读建议**：最后阅读，纯界面层实现，了解浏览器 TTS 接入即可。

---

## 快速索引

| 你想了解什么 | 推荐阅读文档 |
|-------------|-------------|
| 代码目录为什么这样划分 | `architecture_design.md` |
| 3v3 战斗的命中/伤害怎么计算 | `combat_simulator_design.md` |
| 20 队大地图、缩圈、劝架怎么实现 | `br_match_design.md` |
| 赛点制积分规则与多局循环 | `tournament_design.md` |
| 沟通日志的触发时机与语料结构 | `team_comms_design.md` |
| 赛后语音复盘与音色分配 | `tts_design.md` |

---

## 源码对应速查

| 文档 | 主要对应源码 |
|------|-------------|
| `architecture_design.md` | `src/control/localAdapter.js` |
| `combat_simulator_design.md` | `src/logic/engine.js`（局部战斗场逻辑） |
| `br_match_design.md` | `src/logic/engine.js`（宏观 Tick、缩圈、队伍状态） |
| `tournament_design.md` | `src/logic/engine.js`（`initTournament`、积分结算） |
| `team_comms_design.md` | `src/data/corpus.js`、`src/logic/engine.js`（`addTeamComm`） |
| `tts_design.md` | `src/ui/app.js`（赛后复盘面板、语音播放控制） |
