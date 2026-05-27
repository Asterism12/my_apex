# Web 语音播报系统 (TTS System) 设计文档

## 一、 系统概述
作为团队沟通日志系统的延伸扩展，本系统将引入浏览器的原生 **Web Speech API**（即文本转语音 Text-to-Speech，简称 TTS）。这使得在赛后复复盘沟通时，用户不仅可以“看”文字日志，还可以“听”到战队队员的对话。系统将为不同的队员分配不同的音色/语调，真实模拟小队语音频道的收听体验。

## 二、 核心技术选型
采用纯前端标准接口：`window.speechSynthesis` 与 `SpeechSynthesisUtterance`。
- **优点**：无需访问外网服务器，无 API 调用成本，纯白嫖；兼容大部分现代浏览器（Chrome / Edge / Firefox 等）。
- **缺点**：受限于本地操作系统的语音包质量，效果可能存在机械感（不过在无线电通讯的设定下，略带机械音反而符合“小队麦克风通讯”的氛围）。

## 三、 功能模块与机制设计

### 1. 角色音色映射机制 (Voice Assigment)
为了区分 3 名不同队员的说话声音，采用“动态分配不同声线/音调”的策略。
- 浏览器加载时调用 `speechSynthesis.getVoices()` 获取本地支持的所有音色清单（挑出可用的中文语音包）。
- 如果系统可用语音包较少（例如只有 1 种女声，1 种男声），则通过修改 `pitch`（音高，0到2的浮点数）和 `rate`（语速）来为 3 名队员制造听觉差异：
  - 队员1（稳重指挥）：`pitch: 0.8`, `rate: 3.4`
  - 队员2（激进突击）：`pitch: 1.3`, `rate: 3.8`
  - 队员3（辅助后勤）：`pitch: 1.0`, `rate: 3.3`

### 2. 队列控制系统 (Playback Queue)
由于沟通记录是多个依次排列的字符串，不能同时调用朗读指令。需要实现一个播放队列控制器：
- 将玩家选择的 Team 日志数组转换为队列对象。
- 使用 `utterance.onend` 事件监听单条语音播放结束，结束后自动从队列中取出并 `speak()` 下一条语音。
- UI 侧必须提供以下控制方法：**播放 (Play)**、**暂停 (Pause)**、**停止 (Stop)**。

### 3. UI 联动高亮展示 (UI Synchronization)
为了达到完美的沉浸效果，语音播报进行时，前端 UI 应该同步显示当前正在朗读的那一句话：
- 在 `utterance.onstart` 事件中，查询当前正在播报哪一条。
- 在 DOM 树中查找到该条聊天气泡，并做 CSS 高亮突出（如添加边框发光、修改背景色，或自动滚动 `scrollIntoView` 确保它在屏幕视野内）。
- `onend` 后移除高亮。

## 四、 架构接入点说明

本系统完全挂载于**界面层（UI Layer，如 `app.js` 或拆分为独立的 `ttsPlayer.js`）**。
- **逻辑层** 无感知，不需要任何改动日志的生成逻辑。
- **控制层** 无感知。
- **用户交互流程**：
  1. 比赛结束，弹出“战队沟通日志面板”。
  2. 用户在下拉框选取了 “TSM” 队伍并点击确认，文字日志渲染在屏幕上。
  3. 面板底部显示一个 `[▶️ 播放语音通讯]` 的按钮。
  4. 点击播放后，系统提取该队伍的 `comms` 数组，通过 TTS 引擎逐句诵读，同步高亮聊天记录。

## 五、 关键伪代码示例

```javascript
// ttsPlayer.js
class CommTTSPlayer {
    constructor(commsArray) {
        this.synth = window.speechSynthesis;
        this.comms = commsArray;
        this.currentIndex = 0;
        this.playerVoices = {}; // 存储按选手名字映射的语音配置
    }

    // 初始化为三名队员分配不同的特征配置
    initPlayerVoices(players) {
        // ...从 players 中按规则分配不同 pitch 和 rate
    }

    play() {
        if (this.synth.paused) {
            this.synth.resume();
            return;
        }
        this.speakNext();
    }

    speakNext() {
        if (this.currentIndex >= this.comms.length) return; // 播报完毕

        const log = this.comms[this.currentIndex];
        const utterance = new SpeechSynthesisUtterance(log.text);
        
        // 读取专属该队员的音频配置
        const config = this.playerVoices[log.speaker]; 
        utterance.pitch = config.pitch;
        utterance.rate = config.rate;

        // UI 联动事件
        utterance.onstart = () => highlightDomElement(this.currentIndex);
        utterance.onend = () => {
            unhighlightDomElement(this.currentIndex);
            this.currentIndex++;
            this.speakNext(); // 链式调用队列下一句
        };

        this.synth.speak(utterance);
    }

    pause() {
        this.synth.pause();
    }

    stop() {
        this.synth.cancel();
        this.currentIndex = 0;
    }
}
```

## 六、 注意事项与浏览器安全限制
现代浏览器存在**自动播放拦截（Autoplay Policy）**，因此不能在比赛结束或组件加载后立刻**自动**调用 `TTS.speak()`。语音播报的启动**必须要有用户的显式交互**（例如要求用户显式点击一次 `[▶️ 播放]` 按钮），方可顺利调用 Web Speech API。