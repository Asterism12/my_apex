/**
 * 界面层 
 */

let simInterval = null;
let currentTickSpeed = 150;
let originalTickSpeed = 150;
let autoSpectateMode = false;
let originalTtsChecked = true;
let isPaused = false;

let followedTeamId = null;
let lastFollowedCommIndex = 0;
let isTourBoardExpanded = false;

function setTourBoardExpanded(expanded) {
    isTourBoardExpanded = expanded;
    document.getElementById('tourBoardBody').style.display = isTourBoardExpanded ? 'block' : 'none';
    document.getElementById('tourToggleIcon').textContent = isTourBoardExpanded ? '▲' : '▼';
    document.getElementById('tourToggleText').textContent = isTourBoardExpanded ? '收起' : '展开';
}

document.getElementById('tourBoardHeader').addEventListener('click', () => {
    setTourBoardExpanded(!isTourBoardExpanded);
});

document.getElementById('startBtn').addEventListener('click', () => {
    currentTickSpeed = parseInt(document.getElementById('tickSpeed').value) || 150;
    const shrinkSpeed = parseInt(document.getElementById('shrinkSpeed').value) || 4;

    const customTeams = typeof APEX_TEAMS !== 'undefined' ? APEX_TEAMS : null;

    const response = sendBRAction({ type: 'START_TOURNAMENT', payload: { shrinkSpeed, customTeams } });
    if (response.success) {
        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('matchControls').style.display = 'block';
        document.getElementById('pauseBtn').style.display = 'inline-block';
        document.getElementById('pauseBtn').textContent = '⏸️ 暂停';
        document.getElementById('fastForwardBtn').style.display = 'inline-block';
        document.getElementById('autoSpectateBtn').style.display = 'inline-block';
        document.getElementById('nextMatchBtn').style.display = 'none';
        isPaused = false;
        document.getElementById('tourBoard').style.display = 'block';
        setTourBoardExpanded(false);
        document.getElementById('battleArea').style.display = 'block';
        
        setupMatch(response.state, response.tournament);
        runBRSimulation();
    } else {
        alert('启动失败: ' + response.error);
    }
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    isPaused = !isPaused;
    document.getElementById('pauseBtn').textContent = isPaused ? '▶️ 恢复' : '⏸️ 暂停';
});

document.getElementById('nextMatchBtn').addEventListener('click', () => {
    document.getElementById('matchControls').style.display = 'block';
    document.getElementById('pauseBtn').style.display = 'inline-block';
    document.getElementById('fastForwardBtn').style.display = 'inline-block';
    document.getElementById('autoSpectateBtn').style.display = 'inline-block';
    document.getElementById('nextMatchBtn').style.display = 'none';
    document.getElementById('commsReview').style.display = 'none';
    document.getElementById('pauseBtn').textContent = '⏸️ 暂停';
    isPaused = false;
    autoSpectateMode = false;
    
    currentTickSpeed = parseInt(document.getElementById('tickSpeed').value) || 150;
    
    const response = sendBRAction({ type: 'NEXT_MATCH' });
    if(response.success) {
        setupMatch(response.state, response.tournament);
        runBRSimulation();
    } else {
        alert('启动失败: ' + response.error);
    }
});

document.getElementById('fastForwardBtn').addEventListener('click', () => {
    currentTickSpeed = 5; // 2x faster than before
    runBRSimulation();
});

document.getElementById('autoSpectateBtn').addEventListener('click', () => {
    if (autoSpectateMode) return;
    originalTickSpeed = parseInt(document.getElementById('tickSpeed').value) || 150;
    originalTtsChecked = document.getElementById('liveTtsToggle').checked;
    currentTickSpeed = 5; // 2x faster than before
    autoSpectateMode = true;
    document.getElementById('liveTtsToggle').checked = false;
    document.getElementById('autoSpectateBtn').textContent = '⏩ 自动观战进行中...';
    document.getElementById('autoSpectateBtn').style.background = '#673ab7';
    runBRSimulation();
});

function setupMatch(state, tournament) {
    document.getElementById('logs').innerHTML = ''; 
    document.getElementById('liveTeamLogs').innerHTML = '';
    autoSpectateMode = false;
    document.getElementById('autoSpectateBtn').textContent = '🎯 快进至交火';
    document.getElementById('autoSpectateBtn').style.background = '#9c27b0';
    setTourBoardExpanded(false);
    
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
    ttsPlayer.stop();
    
    const response = sendBRAction({ type: 'GET_STATE' });
    if (response.success && response.state.teams[followedTeamId]) {
        lastFollowedCommIndex = response.state.teams[followedTeamId].comms.length;
    } else {
        lastFollowedCommIndex = 0;
    }
});

function runBRSimulation() {
    if (simInterval) clearInterval(simInterval);

    simInterval = setInterval(() => {
        if (isPaused) return;
        const response = sendBRAction({ type: 'TICK' });
        
        if (response.success) {
            renderBRState(response.state, response.tournament);
            if (response.state.status !== 'running') {
                clearInterval(simInterval);
                document.getElementById('matchControls').style.display = 'block';
                document.getElementById('pauseBtn').style.display = 'none';
                document.getElementById('fastForwardBtn').style.display = 'none';
                document.getElementById('autoSpectateBtn').style.display = 'none';
                isPaused = false;
                autoSpectateMode = false;
                renderTournamentBoard(response.tournament); // 最终更新计分板
                setTourBoardExpanded(true);
                if(response.tournament.status === 'FINISHED') {
                    document.getElementById('nextMatchBtn').style.display = 'none';
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

/**
 * 渲染当前追踪队伍的图形化战斗状态面板
 */
function renderCombatStatusHTML(state, tournament, t) {
    const tourTeam = tournament.teams[t.id];
    const mpText = tourTeam.IsMatchPointEligible ? '<span class="match-point-fire">🔥赛点</span>' : `积分:${tourTeam.TotalScore}`;
    const statusText = t.status === 'dead' ? `第 ${t.placement} 名` : (t.status === 'fight' ? '🔥 交火中' : (t.status === 'move' ? '跑毒中' : '搜集中'));

    const renderCard = (p, teamCtx, isEnemy) => {
        const hpPct = Math.max(0, p.hp);
        const shieldPct = p.shield !== undefined ? Math.max(0, p.shield) : 0;
        const mag = p.magAmmo !== undefined ? p.magAmmo : '-';
        const nameColor = isEnemy ? 'color:#ff8a80;' : 'color:#81c784;';
        const isDead = p.isDead || p.state === 'dead';
        const isDown = p.isDown;

        let stateLabel = '';
        let stateBg = '';
        if (isDead) { stateLabel = '淘汰'; stateBg = 'background:#424242;color:#9e9e9e;'; }
        else if (isDown) { stateLabel = '倒地'; stateBg = 'background:#b71c1c;color:#ffcdd2;'; }
        else if (p.state === 'shooting') { stateLabel = '开火'; stateBg = 'background:#b71c1c;color:#ffebee;'; }
        else if (p.state === 'reloading') { stateLabel = '换弹'; stateBg = 'background:#e65100;color:#fff3e0;'; }
        else if (p.state === 'healing_shield') { stateLabel = '打电'; stateBg = 'background:#0d47a1;color:#e3f2fd;'; }
        else if (p.state === 'healing_hp') { stateLabel = '打药'; stateBg = 'background:#1b5e20;color:#e8f5e9;'; }
        else if (p.state === 'reviving') { stateLabel = '救援'; stateBg = 'background:#4a148c;color:#f3e5f5;'; }
        else if (p.state === 'in_cover') { stateLabel = '掩体'; stateBg = 'background:#3e2723;color:#efebe9;'; }
        else { stateLabel = '空闲'; stateBg = 'background:#1b5e20;color:#e8f5e9;'; }

        let targetHtml = '';
        if (p.state === 'shooting' && p._lastTargetName) {
            targetHtml = `<div style="font-size:10px;color:#ffca28;margin-top:2px;">➤ 攻击 ${p._lastTargetName}</div>`;
        } else if (p.state === 'reviving' && p.revivingTargetId) {
            const targetPlayer = teamCtx.players.find(tp => tp.id === p.revivingTargetId);
            const targetName = targetPlayer ? targetPlayer.name : p.revivingTargetId;
            targetHtml = `<div style="font-size:10px;color:#ce93d8;margin-top:2px;">➤ 拉起 ${targetName}</div>`;
        }

        let magHtml = '';
        if (p.state === 'shooting') {
            magHtml = `<span style="color:#ffca28;font-size:10px;margin-left:4px;">🔫${mag}</span>`;
        }

        return `
        <div class="combat-player-card ${isDead?'dead':''}" style="${isDown?'border-color:#b71c1c;':''}">
            <div class="combat-player-name" style="${nameColor}">${p.name}${magHtml}</div>
            <div class="combat-bars">
                <div class="hp-bar-bg"><div class="hp-bar-fill" style="width:${hpPct}%;"></div></div>
                ${shieldPct > 0 ? `<div class="shield-bar-bg"><div class="shield-bar-fill" style="width:${Math.min(100, shieldPct*2)}%;"></div></div>` : '<div style="height:2px;"></div>'}
            </div>
            <div class="combat-meta">
                <span class="combat-state-badge" style="${stateBg}">${stateLabel}</span>
                <span style="font-size:10px;color:#aaa;">♥${hpPct.toFixed(0)} ${shieldPct>0?`🛡${shieldPct}`:''}</span>
            </div>
            ${targetHtml}
        </div>`;
    };

    // 非交火 / 死亡状态：简洁卡片布局
    if (t.status !== 'fight') {
        let cards = t.status === 'dead' ? '' : t.players.map(p => renderCard(p, t, false)).join('');
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <strong>${t.name}</strong>
                <span style="font-size:11px;">${mpText} | 击杀:${t.kills} | 装备:${t.equipValue}</span>
            </div>
            <div style="font-size:12px; color:#aaa; margin-bottom:8px;">[${statusText}]</div>
            <div class="combat-sides" style="flex-direction:column; gap:6px;">
                ${cards || '<div style="color:#777;">全员淘汰</div>'}
            </div>
        `;
    }

    // 交火状态：对阵面板
    let myCombat = state.combats.find(c => c.teams.includes(t.id));
    let enemyIds = myCombat ? myCombat.teams.filter(id => id !== t.id) : [];
    let enemyTeams = enemyIds.map(id => state.teams[id]).filter(et => et && et.status !== 'dead');
    let enemyNames = enemyTeams.map(et => et.name).join(' & ');

    const _calcTerrainValue = (team) => {
        let base = team.terrain !== undefined ? team.terrain : 50;
        let bonus = (team.microTerrain && team.microTerrain.terrainBonus !== undefined) ? team.microTerrain.terrainBonus : 0;
        return base + bonus;
    };
    let myTerrainVal = _calcTerrainValue(t);

    let allyCards = t.players.map(p => renderCard(p, t, false)).join('');
    let enemyCards = enemyTeams.map(et => {
        let etTerrain = et.microTerrain ? ` <span style="color:#ffca28;font-weight:normal;">🌍${et.microTerrain.name}</span>` : '';
        let etTerrainVal = _calcTerrainValue(et);
        let diff = myTerrainVal - etTerrainVal;
        let diffColor = diff > 0 ? '#4caf50' : (diff < 0 ? '#f44336' : '#aaa');
        let diffText = diff > 0 ? `+${diff}` : `${diff}`;
        return `<div style="margin-bottom:6px;"><div style="font-size:11px;font-weight:bold;color:#ff8a80;text-align:center;margin-bottom:4px;">${et.name}${etTerrain} <span style="color:#aaa;font-weight:normal;">| 地形值:${etTerrainVal} | 优势差:<span style="color:${diffColor};">${diffText}</span></span></div>` + et.players.map(p => renderCard(p, et, true)).join('') + `</div>`;
    }).join('');

    let myTerrainLabel = t.microTerrain ? ` <span style="color:#ffca28;font-weight:normal;">🌍${t.microTerrain.name}</span>` : '';
    myTerrainLabel += ` <span style="color:#aaa;font-weight:normal;">(地形值:${myTerrainVal})</span>`;
    let macroLabel = '';
    if (myCombat && myCombat.macroTerrain) {
        let mName = myCombat.macroTerrain === 'urban' ? '城区' : (myCombat.macroTerrain === 'hills' ? '丘陵' : '开阔地');
        macroLabel = `<span style="color:#80cbc4;">🗺️${mName}</span>`;
    }

    return `
        <div class="combat-arena">
            <div class="combat-vs-header">
                <span style="color:#81c784;">${t.name}</span>
                <span style="color:#f44336;margin:0 6px;">⚔ VS ⚔</span>
                <span style="color:#ff8a80;">${enemyNames || '???'}</span>
            </div>
            <div style="font-size:11px;color:#aaa;text-align:center;margin-bottom:8px;">${mpText} | 击杀:${t.kills} | 装备:${t.equipValue}${macroLabel ? ' | ' + macroLabel : ''}</div>
            <div class="combat-sides">
                <div class="combat-side">
                    <div class="combat-side-title" style="color:#4caf50;">我方 ${t.name}${myTerrainLabel}</div>
                    ${allyCards}
                </div>
                <div class="combat-side">
                    <div class="combat-side-title" style="color:#f44336;">敌方 ${enemyNames || '???'}</div>
                    ${enemyCards || '<div style="color:#777;font-size:12px;text-align:center;">无情报</div>'}
                </div>
            </div>
        </div>
    `;
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
    const MAP_RATIO = MAP_SIZE / 2000;
    const ringEl = document.getElementById('miniMapRing');
    let rR = state.ring.radius * MAP_RATIO;
    let rX = state.ring.x * MAP_RATIO - rR;
    let rY = state.ring.y * MAP_RATIO - rR;
    ringEl.style.width = `${rR * 2}px`;
    ringEl.style.height = `${rR * 2}px`;
    ringEl.style.left = `${rX}px`;
    ringEl.style.top = `${rY}px`;

    const mapContainer = document.getElementById('miniMap');
    document.querySelectorAll('.map-team, .map-combat, .map-zone').forEach(el => el.remove());

    // 渲染地形层 Zone（矩形）
    if (state.terrainZones) {
        state.terrainZones.forEach(z => {
            let el = document.createElement('div');
            el.className = 'map-zone';
            el.style.position = 'absolute';
            el.style.left = `${z.x * MAP_RATIO}px`;
            el.style.top = `${z.y * MAP_RATIO}px`;
            el.style.width = `${z.width * MAP_RATIO}px`;
            el.style.height = `${z.height * MAP_RATIO}px`;
            el.style.borderRadius = '4px';
            el.style.background = z.color;
            el.style.opacity = '0.22';
            el.style.pointerEvents = 'none';
            el.style.zIndex = 1;
            mapContainer.appendChild(el);
        });
    }

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

    const _stateLabel = (p) => {
        if (p.isDead || p.state === 'dead') return '<span style="color:#777;">💀淘汰</span>';
        if (p.isDown) return '<span style="color:#f44336;">倒地</span>';
        const labels = { idle:'空闲', shooting:'🔥开火', reloading:'🔄换弹', healing_shield:'🔋打电', healing_hp:'💉打药', reviving:'🤝救援', 'in_cover':'🛡️缩掩体' };
        return labels[p.state] || p.state;
    };
    const _shieldHtml = (p) => p.shield !== undefined ? `<span style="color:#2196f3;">🛡️${p.shield}</span>` : '';

    const teamListHtml = Object.values(state.teams).map(t => {
        let statusClass = t.status === 'dead' ? 'team-dead' : (t.status === 'fight' ? 'team-fighting' : 'team-alive');
        let playersInfo = t.status === 'dead' ? '全员淘汰' : t.players.map(p => {
            let s = _shieldHtml(p);
            let st = _stateLabel(p);
            return `${p.name}: ` + (p.isDown ? `♥️0 ${st}` : `♥️${p.hp.toFixed(0)} ${s} ${st}`);
        }).join(' | ');
        let statusText = t.status === 'dead' ? `第 ${t.placement} 名` : (t.status === 'fight' ? '交火中' : (t.status === 'move' ? '跑毒中' : '搜集中'));
        let terrainText = (t.status === 'fight' && t.microTerrain) ? ` | 🌍${t.microTerrain.name}` : '';
        let mpIcon = tournament.teams[t.id].IsMatchPointEligible ? '🔥' : '';
        
        return `<div class="team-item ${statusClass}">
            <strong>${mpIcon}${t.name}</strong> [${statusText}${terrainText}] - 击杀: ${t.kills} | 本局装备: ${t.equipValue} <br/> 队员: ${playersInfo}
        </div>`;
    }).join('');
    document.getElementById('teamList').innerHTML = teamListHtml;

    if (followedTeamId && state.teams[followedTeamId]) {
        const t = state.teams[followedTeamId];

        // 自动观战模式：跟踪队伍进入交火时恢复原速和语音
        if (autoSpectateMode && t.status === 'fight') {
            autoSpectateMode = false;
            currentTickSpeed = originalTickSpeed;
            document.getElementById('liveTtsToggle').checked = originalTtsChecked;
            document.getElementById('autoSpectateBtn').textContent = '🎯 快进至交火';
            document.getElementById('autoSpectateBtn').style.background = '#9c27b0';
            runBRSimulation();
        }

        let statusText = t.status === 'dead' ? `第 ${t.placement} 名` : (t.status === 'fight' ? '🔥 交火中' : (t.status === 'move' ? '跑毒中' : '搜集中'));
        
        // 战斗详情：若正在交火，显示敌方信息
        let combatInfo = '';
        let enemyCards = '';
        if (t.status === 'fight') {
            let myCombat = state.combats.find(c => c.teams.includes(t.id));
            if (myCombat) {
                let enemyIds = myCombat.teams.filter(id => id !== t.id);
                let enemyNames = enemyIds.map(id => {
                    let et = state.teams[id];
                    return et ? (et.status === 'dead' ? `<span style="color:#777;text-decoration:line-through;">${et.name}</span>` : `<span style="color:#f44336;">${et.name}</span>`) : id;
                }).join('、');
                let macroLabel = '';
                if (myCombat && myCombat.macroTerrain) {
                    let mName = myCombat.macroTerrain === 'urban' ? '城区' : (myCombat.macroTerrain === 'hills' ? '丘陵' : '开阔地');
                    macroLabel = `<span style="color:#80cbc4;">🗺️${mName}</span>`;
                }
                combatInfo = `<div style="margin:6px 0; padding:4px 8px; background:#331111; border-radius:4px; border-left:3px solid #f44336; font-size:13px;">⚔️ 交战对手: ${enemyNames}${macroLabel ? ' | ' + macroLabel : ''}</div>`;

                // 敌方队员状态卡片
                enemyIds.forEach(eid => {
                    let et = state.teams[eid];
                    if (!et || et.status === 'dead') return;
                    let etTerrain = et.microTerrain ? ` <span style="color:#ffca28;font-weight:normal;">🌍${et.microTerrain.name}</span>` : '';
                    enemyCards += `<div style="margin-top:8px; padding:6px 10px; background:#2a1111; border-radius:6px; border:1px solid #441111;">
                        <div style="font-size:12px; font-weight:bold; color:#ff8a80; margin-bottom:6px;">🎯 ${et.name}${etTerrain}</div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">` + et.players.map(p => {
                            let hpPct = Math.max(0, p.hp);
                            let shieldPct = p.shield !== undefined ? Math.max(0, p.shield) : 0;
                            let stateLabel = '';
                            let stateColor = '#888';
                            if (p.isDead || p.state === 'dead') { stateLabel = '💀淘汰'; stateColor = '#777'; }
                            else if (p.isDown) { stateLabel = '倒地'; stateColor = '#f44336'; }
                            else if (p.state === 'shooting') { stateLabel = '开火中'; stateColor = '#f44336'; }
                            else if (p.state === 'reloading') { stateLabel = '换弹'; stateColor = '#ff9800'; }
                            else if (p.state === 'healing_shield') { stateLabel = '打电'; stateColor = '#2196f3'; }
                            else if (p.state === 'healing_hp') { stateLabel = '打药'; stateColor = '#4caf50'; }
                            else if (p.state === 'reviving') { stateLabel = '救援'; stateColor = '#9c27b0'; }
                            else if (p.state === 'in_cover') { stateLabel = '缩掩体'; stateColor = '#ff5722'; }
                            else { stateLabel = '空闲'; stateColor = '#4caf50'; }
                            return `
                            <div style="flex:1; min-width:80px; background:#1a1a1a; padding:6px; border-radius:4px; border:1px solid #333;">
                                <div style="font-weight:bold; font-size:12px; margin-bottom:3px;">${p.name}</div>
                                <div style="font-size:11px; margin-bottom:3px;">
                                    <span style="color:#f44336;">♥️${hpPct.toFixed(0)}</span>
                                    ${shieldPct > 0 ? `<span style="color:#2196f3;"> 🛡️${shieldPct}</span>` : '<span style="color:#555;"> 🛡️0</span>'}
                                </div>
                                <div style="width:100%; height:3px; background:#333; border-radius:2px; margin-bottom:3px; overflow:hidden;">
                                    <div style="width:${hpPct}%; height:100%; background:linear-gradient(90deg,#f44336,#e53935);"></div>
                                </div>
                                ${shieldPct > 0 ? `<div style="width:100%; height:2px; background:#333; border-radius:2px; margin-bottom:3px; overflow:hidden;">
                                    <div style="width:${Math.min(100, shieldPct * 2)}%; height:100%; background:linear-gradient(90deg,#2196f3,#03a9f4);"></div>
                                </div>` : ''}
                                <div style="font-size:11px; color:${stateColor}; font-weight:bold;">${stateLabel}</div>
                            </div>`;
                        }).join('') + `</div></div>`;
                });
            }
        }

        // 队员详细状态卡片
        let playersCards = '';
        if (t.status !== 'dead') {
            playersCards = '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">' + t.players.map(p => {
                let hpPct = Math.max(0, p.hp);
                let shieldPct = p.shield !== undefined ? Math.max(0, p.shield) : 0;
                let mag = p.magAmmo !== undefined ? p.magAmmo : '-';
                let stateLabel = '';
                let stateColor = '#888';
                if (p.isDead || p.state === 'dead') { stateLabel = '💀淘汰'; stateColor = '#777'; }
                else if (p.isDown) { stateLabel = '倒地'; stateColor = '#f44336'; }
                else if (p.state === 'shooting') { stateLabel = '开火中'; stateColor = '#f44336'; }
                else if (p.state === 'reloading') { stateLabel = '换弹'; stateColor = '#ff9800'; }
                else if (p.state === 'healing_shield') { stateLabel = '打电'; stateColor = '#2196f3'; }
                else if (p.state === 'healing_hp') { stateLabel = '打药'; stateColor = '#4caf50'; }
                else if (p.state === 'reviving') { stateLabel = '救援'; stateColor = '#9c27b0'; }
                else if (p.state === 'in_cover') { stateLabel = '缩掩体'; stateColor = '#ff5722'; }
                else { stateLabel = '空闲'; stateColor = '#4caf50'; }

                return `
                <div style="flex:1; min-width:90px; background:#1a1a1a; padding:8px; border-radius:6px; border:1px solid #333;">
                    <div style="font-weight:bold; font-size:13px; margin-bottom:4px;">${p.name}</div>
                    <div style="font-size:11px; margin-bottom:4px;">
                        <span style="color:#f44336;">♥️${hpPct.toFixed(0)}</span>
                        ${shieldPct > 0 ? `<span style="color:#2196f3;"> 🛡️${shieldPct}</span>` : '<span style="color:#555;"> 🛡️0</span>'}
                    </div>
                    <div style="width:100%; height:4px; background:#333; border-radius:2px; margin-bottom:4px; overflow:hidden;">
                        <div style="width:${hpPct}%; height:100%; background:linear-gradient(90deg,#f44336,#e53935);"></div>
                    </div>
                    ${shieldPct > 0 ? `<div style="width:100%; height:3px; background:#333; border-radius:2px; margin-bottom:4px; overflow:hidden;">
                        <div style="width:${Math.min(100, shieldPct * 2)}%; height:100%; background:linear-gradient(90deg,#2196f3,#03a9f4);"></div>
                    </div>` : ''}
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px;">
                        <span style="color:${stateColor}; font-weight:bold;">${stateLabel}</span>
                        ${p.state === 'shooting' ? `<span style="color:#ffca28;">🔫${mag}</span>` : ''}
                    </div>
                </div>`;
            }).join('') + '</div>';
        } else {
            playersCards = '<div style="color:#777; margin-top:8px;">全员淘汰</div>';
        }
        
        document.getElementById('liveTeamStatus').innerHTML = renderCombatStatusHTML(state, tournament, t);

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
