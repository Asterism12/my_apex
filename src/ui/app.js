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

    const customTeams = typeof APEX_TEAMS !== 'undefined' ? APEX_TEAMS : null;

    const response = sendBRAction({ type: 'START_TOURNAMENT', payload: { shrinkSpeed, customTeams } });
    if (response.success) {
        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('fastForwardBtn').style.display = 'inline-block';
        document.getElementById('tourBoard').style.display = 'block';
        document.getElementById('battleArea').style.display = 'block';
        
        setupMatch(response.state, response.tournament);
        runBRSimulation();
    } else {
        alert('启动失败: ' + response.error);
    }
});

document.getElementById('nextMatchBtn').addEventListener('click', () => {
    document.getElementById('nextMatchBtn').style.display = 'none';
    document.getElementById('commsReview').style.display = 'none';
    document.getElementById('fastForwardBtn').style.display = 'inline-block';
    
    currentTickSpeed = parseInt(document.getElementById('tickSpeed').value) || 300;
    
    const response = sendBRAction({ type: 'NEXT_MATCH' });
    if(response.success) {
        setupMatch(response.state, response.tournament);
        runBRSimulation();
    } else {
        alert('启动失败: ' + response.error);
    }
});

document.getElementById('fastForwardBtn').addEventListener('click', () => {
    currentTickSpeed = 10; // Set to very fast
    runBRSimulation();
});

function setupMatch(state, tournament) {
    document.getElementById('logs').innerHTML = ''; 
    document.getElementById('liveTeamLogs').innerHTML = '';
    
    renderTournamentBoard(tournament);

    const followSelect = document.getElementById('followTeamSelect');
    followSelect.innerHTML = '';
    Object.values(state.teams).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        followSelect.appendChild(opt);
    });
    // Check if we need to preserve followedTeamId
    if (followedTeamId && state.teams[followedTeamId]) {
        followSelect.value = followedTeamId;
    } else {
        followedTeamId = followSelect.value;
    }
    
    lastFollowedCommIndex = 0;
    renderBRState(state, tournament);
}

function renderTournamentBoard(tournament) {
    document.getElementById('tourTitle').textContent = `赛事总积分榜 - Match ${tournament.matchCount}`;
    const tbody = document.getElementById('tourTableBody');
    tbody.innerHTML = '';
    
    // Sort logic
    let sortedTeams = Object.values(tournament.teams).sort((a, b) => {
        if(b.TotalScore !== a.TotalScore) return b.TotalScore - a.TotalScore;
        return b.TotalKills - a.TotalKills;
    });

    sortedTeams.forEach((t, index) => {
        const tr = document.createElement('tr');
        let nameHtml = t.name;
        if(tournament.championTeamId === t.id) nameHtml += ' 👑🏆';
        let statusHtml = t.IsMatchPointEligible ? '<span class="match-point-fire">🔥 赛点</span>' : '-';
        if(tournament.championTeamId === t.id) statusHtml = '<span style="color:#ffd700;">🏆 冠军</span>';
        
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${nameHtml}</strong></td>
            <td>${t.TotalScore}</td>
            <td>${t.TotalKills}</td>
            <td>${statusHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}

document.getElementById('followTeamSelect').addEventListener('change', (e) => {
    followedTeamId = e.target.value;
    document.getElementById('liveTeamLogs').innerHTML = ''; 
    lastFollowedCommIndex = 0; 
    ttsPlayer.stop();
});

function runBRSimulation() {
    if (simInterval) clearInterval(simInterval);

    simInterval = setInterval(() => {
        const response = sendBRAction({ type: 'TICK' });
        
        if (response.success) {
            renderBRState(response.state, response.tournament);
            if (response.state.status !== 'running') {
                clearInterval(simInterval);
                document.getElementById('fastForwardBtn').style.display = 'none';
                renderTournamentBoard(response.tournament); // 最终更新计分板
                if(response.tournament.status === 'FINISHED') {
                    // tournament over
                } else {
                    document.getElementById('nextMatchBtn').style.display = 'inline-block';
                }
                showCommsReview(response.state);
            }
        } else {
            console.error("Tick failed:", response.error);
            clearInterval(simInterval);
        }
    }, currentTickSpeed);
}

function renderBRState(state, tournament) {
    let aliveCount = state.aliveTeamsCount;
    document.getElementById('mapStatus').innerHTML = `
        <div style="display:flex; justify-content: space-between; margin-bottom: 10px;">
            <span>Tick: ${state.tick}</span>
            <span>安全区半径: ${state.ring.radius.toFixed(1)}m</span>
            <span>存活队伍: <strong style="color:#ffca28;">${aliveCount} / 20</strong></span>
        </div>
    `;

    // ==== 渲染大地图 ====
    const MAP_SIZE = 400;
    const MAP_RATIO = MAP_SIZE / 1000;
    const ringEl = document.getElementById('miniMapRing');
    let rR = state.ring.radius * MAP_RATIO;
    let rX = state.ring.x * MAP_RATIO - rR;
    let rY = state.ring.y * MAP_RATIO - rR;
    ringEl.style.width = `${rR * 2}px`;
    ringEl.style.height = `${rR * 2}px`;
    ringEl.style.left = `${rX}px`;
    ringEl.style.top = `${rY}px`;

    const mapContainer = document.getElementById('miniMap');
    document.querySelectorAll('.map-team, .map-combat').forEach(el => el.remove());

    state.combats.forEach(c => {
        let el = document.createElement('div');
        el.className = 'map-combat';
        el.innerHTML = '💥';
        el.style.position = 'absolute';
        el.style.left = `${c.x * MAP_RATIO - 10}px`;
        el.style.top = `${c.y * MAP_RATIO - 10}px`;
        el.style.fontSize = '20px';
        el.style.zIndex = 5;
        mapContainer.appendChild(el);
    });

    Object.values(state.teams).forEach(t => {
        if (t.status === 'dead') return;
        let el = document.createElement('div');
        el.className = 'map-team';
        
        let color = '#4caf50'; // loot/idle
        if (t.status === 'fight') color = '#f44336'; // 交火中
        else if (t.status === 'move') color = '#ff9800'; // 跑毒中

        el.style.position = 'absolute';
        el.style.width = '12px';
        el.style.height = '12px';
        el.style.backgroundColor = color;
        el.style.borderRadius = '50%';
        el.style.left = `${t.x * MAP_RATIO - 6}px`;
        el.style.top = `${t.y * MAP_RATIO - 6}px`;
        el.style.zIndex = 10;
        
        if (tournament.teams[t.id].IsMatchPointEligible) {
            el.style.boxShadow = '0 0 8px 2px #ffeb3b';
            el.style.border = '1px solid #fff';
        } else {
            el.style.border = '1px solid #222';
        }
        
        let label = document.createElement('span');
        label.textContent = t.name.replace('Team ', 'T');
        label.style.position = 'absolute';
        label.style.color = '#fff';
        label.style.fontSize = '11px';
        label.style.left = '16px';
        label.style.top = '-3px';
        label.style.fontWeight = 'bold';
        label.style.textShadow = '1px 1px 2px #000, -1px -1px 2px #000, 1px -1px 2px #000, -1px 1px 2px #000';
        label.style.whiteSpace = 'nowrap';
        
        if (t.id === followedTeamId) {
            el.style.transform = 'scale(1.5)';
            el.style.zIndex = 100;
            label.style.color = '#00e5ff';
        }

        el.appendChild(label);
        mapContainer.appendChild(el);
    });
    // ==== 地图渲染结束 ====

    const teamListHtml = Object.values(state.teams).map(t => {
        let statusClass = t.status === 'dead' ? 'team-dead' : (t.status === 'fight' ? 'team-fighting' : 'team-alive');
        let playersInfo = t.status === 'dead' ? '全员淘汰' : t.players.map(p => `${p.name}: ` + (p.isDown ? '♥️0' : `♥️${p.hp.toFixed(0)}`)).join(' | ');
        let statusText = t.status === 'dead' ? `第 ${t.placement} 名` : (t.status === 'fight' ? '交火中' : (t.status === 'move' ? '跑毒中' : '搜集中'));
        let mpIcon = tournament.teams[t.id].IsMatchPointEligible ? '🔥' : '';
        
        return `<div class="team-item ${statusClass}">
            <strong>${mpIcon}${t.name}</strong> [${statusText}] - 击杀: ${t.kills} | 本局装备: ${t.equipValue} <br/> 队员: ${playersInfo}
        </div>`;
    }).join('');
    document.getElementById('teamList').innerHTML = teamListHtml;

    if (followedTeamId && state.teams[followedTeamId]) {
        const t = state.teams[followedTeamId];
        let statusText = t.status === 'dead' ? `第 ${t.placement} 名` : (t.status === 'fight' ? '交火中' : (t.status === 'move' ? '跑毒中' : '搜集中'));
        let playersInfo = t.status === 'dead' ? '全员淘汰' : t.players.map(p => `${p.name}: ` + (p.isDown ? '<span style="color:#f44336;">倒地</span>' : `<span style="color:#4caf50;">♥️${p.hp.toFixed(0)}</span>`)).join(' | ');
        
        let tourTeam = tournament.teams[t.id];
        let mpText = tourTeam.IsMatchPointEligible ? '<span class="match-point-fire">🔥赛点队伍</span>' : `积分: ${tourTeam.TotalScore}`;

        document.getElementById('liveTeamStatus').innerHTML = `
            <strong>${t.name}</strong> (${mpText}) [${statusText}] <br/>
            队员: ${playersInfo} <br/>
            局击杀: ${t.kills} | 装备值: ${t.equipValue}
        `;

        const logsContainer = document.getElementById('liveTeamLogs');
        const liveTtsEnabled = document.getElementById('liveTtsToggle').checked;

        if (t.comms && t.comms.length > lastFollowedCommIndex) {
            if (ttsPlayer.comms.length === 0 || ttsPlayer.comms !== t.comms) {
               ttsPlayer.playerVoices = {};
            }
            const configs = [{ pitch: 0.8, rate: 3.4 }, { pitch: 1.3, rate: 3.8 }, { pitch: 1.0, rate: 3.3 }];
            if(Object.keys(ttsPlayer.playerVoices).length === 0) {
               t.players.forEach((p, idx) => {
                   ttsPlayer.playerVoices[p.name] = configs[idx % configs.length];
               });
            }

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

                if (liveTtsEnabled) {
                    ttsPlayer.pushLiveComm(comm, `live-comm-${i}`);
                }
            }
            lastFollowedCommIndex = t.comms.length;
            logsContainer.scrollTop = logsContainer.scrollHeight;
        }
    }

    if (state.logs && state.logs.length > 0) {
        const logsDiv = document.getElementById('logs');
        state.logs.forEach(log => {
            const p = document.createElement('p');
            p.textContent = log;
            if (log.includes('淘汰') || log.includes('终局') || log.includes('结束')) {
                p.className = 'log-fatal'; 
            } else if (log.includes('赛点开启') || log.includes('夺冠') || log.includes('冠军')) {
                p.className = 'log-highlight'; 
                p.style.color = '#ffeb3b';
                p.style.fontWeight = 'bold';
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
        this.liveQueue = []; 
        
        const configs = [
            { pitch: 0.8, rate: 3.4 }, 
            { pitch: 1.3, rate: 3.8 }, 
            { pitch: 1.0, rate: 3.3 }
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
        
        if (window.speechSynthesis.getVoices().length > 0) {
            const voices = window.speechSynthesis.getVoices();
            utterance.voice = voices.find(v => v.lang.includes('zh') || v.name.includes('Chinese')) || voices[0];
        }

        const config = this.playerVoices[nextItem.log.speaker] || { pitch: 1.0, rate: 3.4 };
        utterance.pitch = config.pitch;
        utterance.rate = config.rate;

        utterance.onstart = () => {
            const el = document.getElementById(nextItem.elId);
            if (el) {
                el.classList.add('comm-highlight');
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
        
        if (window.speechSynthesis.getVoices().length > 0) {
            const voices = window.speechSynthesis.getVoices();
            utterance.voice = voices.find(v => v.lang.includes('zh') || v.name.includes('Chinese')) || voices[0];
        }

        const config = this.playerVoices[log.speaker] || { pitch: 1.0, rate: 3.4 };
        utterance.pitch = config.pitch;
        utterance.rate = config.rate;

        utterance.onstart = () => {
            const el = document.getElementById(`comm-${this.currentIndex}`);
            if (el) {
                el.classList.add('comm-highlight');
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
        this.liveQueue = []; 
        document.querySelectorAll('.comm-highlight').forEach(el => el.classList.remove('comm-highlight'));
    }
}
const ttsPlayer = new CommTTSPlayer();

document.getElementById('playAudioBtn').addEventListener('click', () => ttsPlayer.play());
document.getElementById('stopAudioBtn').addEventListener('click', () => ttsPlayer.stop());

function showCommsReview(state) {
    document.getElementById('commsReview').style.display = 'block';
    
    document.getElementById('commsReview').scrollIntoView({ behavior: 'smooth' });

    const select = document.getElementById('teamSelect');
    select.innerHTML = '';
    
    Object.values(state.teams).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name + (t.status === 'dead' ? ` (淘汰, 第${t.placement}名)` : ' (本局捍卫者)');
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

    ttsPlayer.loadComms(team.comms, team.players);
}
