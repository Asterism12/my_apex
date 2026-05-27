/**
 * 界面层 
 */

let simInterval = null;
let currentTickSpeed = 300;

let followedTeamId = null;
let lastFollowedCommIndex = 0;

document.getElementById('startBtn').addEventListener('click', () => {
    currentTickSpeed = parseInt(document.getElementById('tickSpeed').value) || 300;
    const shrinkSpeed = parseInt(document.getElementById('shrinkSpeed').value) || 10;

    // 载入真实队伍和队员名字数据
    const customTeams = typeof APEX_TEAMS !== 'undefined' ? APEX_TEAMS : null;

    const response = sendBRAction({ type: 'START', payload: { shrinkSpeed, customTeams } });
    if (response.success) {
        document.getElementById('battleArea').style.display = 'block';
        document.getElementById('logs').innerHTML = ''; 
        document.getElementById('liveTeamLogs').innerHTML = '';
        
        // 初始化跟随选择器
        const followSelect = document.getElementById('followTeamSelect');
        followSelect.innerHTML = '';
        Object.values(response.state.teams).forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            followSelect.appendChild(opt);
        });
        followedTeamId = followSelect.value;
        lastFollowedCommIndex = 0;

        renderBRState(response.state);
        runBRSimulation();
    } else {
        alert('启动失败: ' + response.error);
    }
});

document.getElementById('followTeamSelect').addEventListener('change', (e) => {
    followedTeamId = e.target.value;
    document.getElementById('liveTeamLogs').innerHTML = ''; // 切换时清空面板
    // 重置已播报索引，并将面板同步到该队已有进度
    lastFollowedCommIndex = 0; 
    // 中断可能在播的其他队伍语音
    ttsPlayer.stop();
});

function runBRSimulation() {
    if (simInterval) clearInterval(simInterval);

    simInterval = setInterval(() => {
        const response = sendBRAction({ type: 'TICK' });
        
        if (response.success) {
            renderBRState(response.state);
            if (response.state.status !== 'running') {
                clearInterval(simInterval);
                showCommsReview(response.state);
            }
        } else {
            console.error("Tick failed:", response.error);
            clearInterval(simInterval);
        }
    }, currentTickSpeed);
}

function renderBRState(state) {
    // 渲染地图和圈状态
    let aliveCount = Object.values(state.teams).filter(t => t.status !== 'dead').length;
    document.getElementById('mapStatus').innerHTML = `
        <p>Tick: ${state.tick}</p>
        <p>安全区半径: ${state.ring.radius.toFixed(1)}m</p>
        <p>存活队伍: <strong style="color:#ffca28;">${aliveCount} / 20</strong></p>
    `;

    // 渲染各个队伍状态
    const teamListHtml = Object.values(state.teams).map(t => {
        let statusClass = t.status === 'dead' ? 'team-dead' : (t.status === 'fight' ? 'team-fighting' : 'team-alive');
        let playersInfo = t.status === 'dead' ? '全员淘汰' : t.players.map(p => `${p.name}: ` + (p.isDown ? '♥️0' : `♥️${p.hp.toFixed(0)}`)).join(' | ');
        let statusText = t.status === 'dead' ? '淘汰' : (t.status === 'fight' ? '交火中' : (t.status === 'move' ? '跑毒中' : '搜集中'));
        
        return `<div class="team-item ${statusClass}">
            <strong>${t.name}</strong> [${statusText}] - 装备值: ${t.equipValue} <br/> 队员: ${playersInfo}
        </div>`;
    }).join('');
    document.getElementById('teamList').innerHTML = teamListHtml;

    // 渲染跟随队伍
    if (followedTeamId && state.teams[followedTeamId]) {
        const t = state.teams[followedTeamId];
        let statusText = t.status === 'dead' ? '淘汰' : (t.status === 'fight' ? '交火中' : (t.status === 'move' ? '跑毒中' : '搜集中'));
        let playersInfo = t.status === 'dead' ? '全员淘汰' : t.players.map(p => `${p.name}: ` + (p.isDown ? '<span style="color:#f44336;">倒地</span>' : `<span style="color:#4caf50;">♥️${p.hp.toFixed(0)}</span>`)).join(' | ');
        
        document.getElementById('liveTeamStatus').innerHTML = `
            <strong>${t.name}</strong> [${statusText}] <br/>
            队员: ${playersInfo} <br/>
            击杀: ${t.kills} | 装备值: ${t.equipValue}
        `;

        const logsContainer = document.getElementById('liveTeamLogs');
        const liveTtsEnabled = document.getElementById('liveTtsToggle').checked;

        // 加载新产生的通信日志
        if (t.comms && t.comms.length > lastFollowedCommIndex) {
            // 如果TTS队列为空或者换了队伍，我们要确保playerVoices配置正确
            if (ttsPlayer.comms.length === 0 || ttsPlayer.comms !== t.comms) {
               ttsPlayer.playerVoices = {};
               const configs = [{ pitch: 0.8, rate: 1.7 }, { pitch: 1.3, rate: 1.9 }, { pitch: 1.0, rate: 1.65 }];
            for (let i = lastFollowedCommIndex; i < t.comms.length; i++) {
                const comm = t.comms[i];
                const p = document.createElement('p');
                p.id = `live-comm-${i}`;
                
                let tagColor = '#bbb';
                if (comm.type === 'ENGAGE_ALERT' || comm.type === 'ENGAGE_INFO' || comm.type === 'THIRD_PARTY') tagColor = '#ff9800';
                if (comm.type === 'KILL' || comm.type === 'WIN') tagColor = '#4caf50';
                if (comm.type === 'DOWN' || comm.type === 'DEAD') tagColor = '#f44336';

                p.innerHTML = `<span style="color:#666;">[Tick ${comm.tick}]</span> 
                               <strong style="color:#2196f3;">[${comm.speaker}]</strong> 
                               <span style="color:${tagColor};">[${comm.type}]</span>: 
                               <span style="color:#eaeaea; font-size:14px; margin-left: 5px;">${comm.text}</span>`;
                logsContainer.appendChild(p);

                // 实时TTS播放
                if (liveTtsEnabled) {
                    ttsPlayer.pushLiveComm(comm, `live-comm-${i}`);
                }
            }
            lastFollowedCommIndex = t.comms.length;
            logsContainer.scrollTop = logsContainer.scrollHeight;
        }
    }

    // 渲染日志
    if (state.logs && state.logs.length > 0) {
        const logsDiv = document.getElementById('logs');
        state.logs.forEach(log => {
            const p = document.createElement('p');
            p.textContent = log;
            if (log.includes('淘汰') || log.includes('终局')) {
                p.className = 'log-fatal'; 
            } else if (log.includes('遭遇') || log.includes('黄雀')) {
                p.className = 'log-highlight'; 
            }
            logsDiv.prepend(p);
        });
    }
}

// ----------------------------------------------------
// 队伍语音与 TTS 播报系统
// ----------------------------------------------------
class CommTTSPlayer {
    constructor() {
        this.synth = window.speechSynthesis;
        this.comms = [];
        this.currentIndex = 0;
        this.playerVoices = {};
        this.liveQueue = [];
    }

    loadComms(commsArray, players) {
        this.stop();
        this.comms = commsArray;
        this.currentIndex = 0;
        this.liveQueue = []; // 清空实时队列
        
        // 按照队员顺序给前两人分配不同的特征，形成区分，提高默认TTS播报语速
        const configs = [
            { pitch: 0.8, rate: 1.7 }, 
            { pitch: 1.3, rate: 1.9 }, 
            { pitch: 1.0, rate: 1.65 }
        ];
        players.forEach((p, idx) => {
            this.playerVoices[p.name] = configs[idx % configs.length];
        });
    }

    pushLiveComm(comm, elementId) {
        this.liveQueue = this.liveQueue || [];
        this.liveQueue.push({ log: comm, elId: elementId });
        this.processLiveQueue();
    }

    processLiveQueue() {
        if (this.synth.speaking) return; 
        if (!this.liveQueue || this.liveQueue.length === 0) return;

        const nextItem = this.liveQueue.shift();
        const utterance = new SpeechSynthesisUtterance(nextItem.log.text);
        
        // 尝试寻找中文语音
        if (window.speechSynthesis.getVoices().length > 0) {
            const voices = window.speechSynthesis.getVoices();
            utterance.voice = voices.find(v => v.lang.includes('zh') || v.name.includes('Chinese')) || voices[0];
        }

        const config = this.playerVoices[nextItem.log.speaker] || { pitch: 1.0, rate: 1.7 };
        utterance.pitch = config.pitch;
        utterance.rate = config.rate;

        utterance.onstart = () => {
            const el = document.getElementById(nextItem.elId);
            if (el) {
                el.classList.add('comm-highlight');
                el.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
        };
        
        utterance.onend = () => {
            const el = document.getElementById(nextItem.elId);
            if (el) el.classList.remove('comm-highlight');
            setTimeout(() => this.processLiveQueue(), 150); 
        };
        
        utterance.onerror = () => {
            this.processLiveQueue();
        }

        this.synth.speak(utterance);
    }

    play() {
        if (this.synth.speaking && this.synth.paused) {
            this.synth.resume();
            return;
        }
        if (this.synth.speaking) return; 
        this.speakNext();
    }

    speakNext() {
        if (this.currentIndex >= this.comms.length) return;

        const log = this.comms[this.currentIndex];
        const utterance = new SpeechSynthesisUtterance(log.text);
        
        // 尝试寻找中文语音
        if (window.speechSynthesis.getVoices().length > 0) {
            const voices = window.speechSynthesis.getVoices();
            utterance.voice = voices.find(v => v.lang.includes('zh') || v.name.includes('Chinese')) || voices[0];
        }

        const config = this.playerVoices[log.speaker] || { pitch: 1.0, rate: 1.7 };
        utterance.pitch = config.pitch;
        utterance.rate = config.rate;

        utterance.onstart = () => {
            const el = document.getElementById(`comm-${this.currentIndex}`);
            if (el) {
                el.classList.add('comm-highlight');
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        };
        
        utterance.onend = () => {
            const el = document.getElementById(`comm-${this.currentIndex}`);
            if (el) el.classList.remove('comm-highlight');
            this.currentIndex++;
            setTimeout(() => this.speakNext(), 150); 
        };
        
        utterance.onerror = () => {
            this.currentIndex++;
            this.speakNext();
        }

        this.synth.speak(utterance);
    }

    stop() {
        this.synth.cancel();
        this.currentIndex = 0;
        this.liveQueue = []; // 清空实时队列
        document.querySelectorAll('.comm-highlight').forEach(el => el.classList.remove('comm-highlight'));
    }
}
const ttsPlayer = new CommTTSPlayer();

document.getElementById('playAudioBtn').addEventListener('click', () => ttsPlayer.play());
document.getElementById('stopAudioBtn').addEventListener('click', () => ttsPlayer.stop());

function showCommsReview(state) {
    document.getElementById('commsReview').style.display = 'block';
    
    // 滑到最底以查看新展示面板
    document.getElementById('commsReview').scrollIntoView({ behavior: 'smooth' });

    const select = document.getElementById('teamSelect');
    select.innerHTML = '';
    
    // Sort array so that winners are on top or just sequentially
    Object.values(state.teams).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name + (t.status === 'dead' ? ' (淘汰)' : ' (捍卫者冠军)');
        select.appendChild(opt);
    });

    if (Object.values(state.teams).length > 0) {
        loadTeamComms(Object.values(state.teams)[0].id, state);
    }

    select.addEventListener('change', (e) => {
        ttsPlayer.stop();
        loadTeamComms(e.target.value, state);
    });
}

function loadTeamComms(teamId, state) {
    const team = state.teams[teamId];
    const logContainer = document.getElementById('commsLog');
    logContainer.innerHTML = '';

    team.comms.forEach((comm, idx) => {
        const p = document.createElement('p');
        p.id = `comm-${idx}`;
        p.className = 'comm-item';
        // 动态标签样式
        let tagColor = '#bbb';
        if (comm.type === 'ENGAGE_ALERT' || comm.type === 'ENGAGE_INFO' || comm.type === 'THIRD_PARTY') tagColor = '#ff9800';
        if (comm.type === 'KILL' || comm.type === 'WIN') tagColor = '#4caf50';
        if (comm.type === 'DOWN' || comm.type === 'DEAD') tagColor = '#f44336';

        p.innerHTML = `<span style="color:#666;">[Tick ${comm.tick}]</span> 
                       <strong style="color:#2196f3; display:inline-block; width:120px;">[${comm.speaker}]</strong> 
                       <span style="color:${tagColor};">[${comm.type}]</span>: 
                       <span style="color:#eaeaea; font-size:14px; margin-left: 5px;">${comm.text}</span>`;
        logContainer.appendChild(p);
    });

    // 预载好参数分层
    ttsPlayer.loadComms(team.comms, team.players);
}
