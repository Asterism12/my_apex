/**
 * 赛事大逃杀逻辑引擎（赛点制）
 */

const DEFAULT_SHRINK_SPEED = 4;

const PLACEMENT_SCORES = [0, 12, 9, 7, 5, 4, 3, 3, 2, 2, 2, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];

let tournamentState = null;

function initTournament(payload) {
    let teams = {};
    for (let i = 1; i <= 20; i++) {
        let tName = `Team ${i}`;
        let pNames = [`p1`, `p2`, `p3`];
        
        if (payload && payload.customTeams && payload.customTeams[i - 1]) {
            tName = payload.customTeams[i - 1].teamName;
            pNames = payload.customTeams[i - 1].players;
        }

        teams[`T${i}`] = {
            id: `T${i}`,
            name: tName,
            players: pNames,
            TotalScore: 0,
            TotalKills: 0,
            MatchesPlayed: 0,
            IsMatchPointEligible: false
        };
    }

    tournamentState = {
        matchCount: 0,
        status: 'IN_PROGRESS',
        championTeamId: null,
        teams: teams,
        gameConfig: { shrinkSpeed: (payload && payload.shrinkSpeed !== undefined) ? parseInt(payload.shrinkSpeed) : DEFAULT_SHRINK_SPEED }
    };

    return tournamentState;
}

function initMatch() {
    tournamentState.matchCount++;
    let teamsData = {};
    Object.values(tournamentState.teams).forEach(t => {
        let spawnR = Math.random() * 900;
        let spawnAngle = Math.random() * Math.PI * 2;
        teamsData[t.id] = {
            id: t.id,
            name: t.name,
            x: Math.floor(1000 + spawnR * Math.cos(spawnAngle)),
            y: Math.floor(1000 + spawnR * Math.sin(spawnAngle)),
            status: 'loot',
            equipValue: 0,
            aggro: t.IsMatchPointEligible ? 20 : (Math.floor(Math.random() * 50) + 50),
            aim: 50,
            experience: 50,
            terrain: 50,
            comms: [],
            kills: 0,
            placement: 20,
            players: [
                { id: `p1`, name: t.players[0], hp: 100, isDown: false, lastAtk: 0 },
                { id: `p2`, name: t.players[1], hp: 100, isDown: false, lastAtk: 0 },
                { id: `p3`, name: t.players[2], hp: 100, isDown: false, lastAtk: 0 }
            ]
        };
    });

    let eligibleCount = Object.values(tournamentState.teams).filter(t => t.IsMatchPointEligible).length;
    let initLogs = [`[赛事播报] Match ${tournamentState.matchCount} 比赛开始！`];
    if (eligibleCount > 0) {
        initLogs.push(`[赛事播报] 当前有 ${eligibleCount} 支赛点队伍！冠军可能会在本局诞生！`);
    }

    // 生成地图地形层 Zone（不重叠、全覆盖、多种地形）
    let terrainZones = [];
    let mapX = 0, mapY = 0, mapW = 2000, mapH = 2000;
    let cols = 3 + Math.floor(Math.random() * 3); // 3~5 列
    let rows = 2 + Math.floor(Math.random() * 3); // 2~4 行
    let baseW = mapW / cols;
    let baseH = mapH / rows;

    // 生成带随机偏移的列边界，保证不重叠且铺满
    let colBounds = [mapX];
    for (let i = 1; i < cols; i++) {
        let offset = (Math.random() - 0.5) * (baseW * 0.5);
        colBounds.push(Math.floor(mapX + i * baseW + offset));
    }
    colBounds.push(mapX + mapW);

    let rowBounds = [mapY];
    for (let i = 1; i < rows; i++) {
        let offset = (Math.random() - 0.5) * (baseH * 0.5);
        rowBounds.push(Math.floor(mapY + i * baseH + offset));
    }
    rowBounds.push(mapY + mapH);

    // 准备地形池，确保各种地形（包括开阔地）都会出现
    let totalCells = cols * rows;
    let urbanCount = Math.max(2, Math.floor(totalCells * 0.25));
    let hillsCount = Math.max(2, Math.floor(totalCells * 0.30));
    let openCount = totalCells - urbanCount - hillsCount;
    let terrainPool = [];
    for (let i = 0; i < urbanCount; i++) terrainPool.push({ type: 'urban', color: '#1a237e', priority: 3 });
    for (let i = 0; i < hillsCount; i++) terrainPool.push({ type: 'hills', color: '#1b5e20', priority: 2 });
    for (let i = 0; i < openCount; i++) terrainPool.push({ type: 'open', color: '#e65100', priority: 1 });
    terrainPool.sort(() => Math.random() - 0.5);

    let poolIdx = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            let t = terrainPool[poolIdx++];
            let x = colBounds[c];
            let y = rowBounds[r];
            let w = colBounds[c + 1] - colBounds[c];
            let h = rowBounds[r + 1] - rowBounds[r];
            terrainZones.push({
                x: x,
                y: y,
                width: w,
                height: h,
                type: t.type,
                color: t.color,
                priority: t.priority
            });
        }
    }

    return {
        tick: 0,
        status: 'running',
        ring: { x: 1000, y: 1000, radius: 1000, stage: 1 },
        teams: teamsData,
        combats: [],
        logs: initLogs,
        aliveTeamsCount: 20,
        terrainZones: terrainZones
    };
}

function processBRTick(state) {
    let newState = JSON.parse(JSON.stringify(state));
    newState.tick += 1;
    newState.logs = [];

    if (newState.status !== 'running') return newState;

    if (newState.tick === 1) {
        Object.values(newState.teams).forEach(t => addTeamComm(t, 'DROP', newState.tick));
    }

    // 1. 缩圈逻辑
    if (newState.tick % 10 === 0 && newState.ring.radius > 50) {
        newState.ring.radius -= tournamentState.gameConfig.shrinkSpeed; 
    }

    // 2. 队伍状态更新与移动
    let aliveTeams = [];
    Object.values(newState.teams).forEach(team => {
        if (team.status === 'dead') return;

        let distToTarget = Math.hypot(team.x - newState.ring.x, team.y - newState.ring.y);
        if (distToTarget > newState.ring.radius) {
            addTeamComm(team, 'RING_MOVE', newState.tick);
            team.players.forEach(p => { if(!p.isDown) p.hp -= 1; });
            checkTeamAlive(team, newState);
        }

        if (team.status !== 'fight' && team.status !== 'dead') {
            if (distToTarget > newState.ring.radius) {
                team.x -= (team.x - newState.ring.x) * 0.1;
                team.y -= (team.y - newState.ring.y) * 0.1;
                team.status = 'move';
            } else {
                let macroTerrain = _getMacroTerrainAt(team.x, team.y, newState.terrainZones);
                let lootRate = (macroTerrain === 'urban') ? 1.5 : 1;
                if (team.equipValue < 100) {
                    team.equipValue = Math.min(100, team.equipValue + lootRate);
                    team.status = 'loot';
                    addTeamComm(team, 'LOOT', newState.tick);
                } else {
                    team.status = 'move';
                }
                team.x += (Math.random() - 0.5) * 40;
                team.y += (Math.random() - 0.5) * 40;
            }
        }

        if (team.status !== 'dead') {
            aliveTeams.push(team);
        }
    });

    // 3. 战斗实例化与检测（相遇）
    let availableTeams = aliveTeams.filter(t => t.status !== 'fight' && t.status !== 'dead');
    for (let i = 0; i < availableTeams.length; i++) {
        for (let j = i + 1; j < availableTeams.length; j++) {
            let t1 = availableTeams[i];
            let t2 = availableTeams[j];
            if (t1.status !== 'fight' && t2.status !== 'fight') {
                if (Math.hypot(t1.x - t2.x, t1.y - t2.y) < 50) { 
                    t1.status = 'fight';
                    t2.status = 'fight';
                    addTeamComm(t1, 'ENGAGE_ALERT', newState.tick);
                    addTeamComm(t1, 'ENGAGE_INFO', newState.tick + 1, t2.name);
                    addTeamComm(t2, 'ENGAGE_ALERT', newState.tick);
                    addTeamComm(t2, 'ENGAGE_INFO', newState.tick + 1, t1.name);
                    let combatX = (t1.x + t2.x) / 2;
                    let combatY = (t1.y + t2.y) / 2;
                    let macroType = _getMacroTerrainAt(combatX, combatY, newState.terrainZones);
                    t1.microTerrain = rollMicroTerrain(macroType);
                    t2.microTerrain = rollMicroTerrain(macroType);
                    newState.combats.push({
                        id: `C_${t1.id}_${t2.id}`,
                        x: combatX,
                        y: combatY,
                        teams: [t1.id, t2.id],
                        macroTerrain: macroType
                    });
                    newState.logs.push(`[Tick ${newState.tick}] 💥 ${t1.name} 与 ${t2.name} 遭遇，爆发战斗！（地形：${macroType === 'urban' ? '城区' : (macroType === 'hills' ? '丘陵' : '开阔地')}）`);
                }
            }
        }
    }

    // 4. 劝架系统 (Third-party)
    newState.combats.forEach(combat => {
        aliveTeams.forEach(t => {
            if (t.status !== 'fight' && t.status !== 'dead') {
                let distToCombat = Math.hypot(t.x - combat.x, t.y - combat.y);
                if (distToCombat < 200 && t.aggro > 50) { 
                    t.status = 'fight';
                    t.x = combat.x; 
                    t.y = combat.y;
                    let macroType = _getMacroTerrainAt(combat.x, combat.y, newState.terrainZones);
                    t.microTerrain = rollMicroTerrain(macroType);
                    combat.teams.push(t.id);
                    addTeamComm(t, 'THIRD_PARTY', newState.tick);
                    newState.logs.push(`[Tick ${newState.tick}] ⚠️ ${t.name} 被枪声吸引，化身“黄雀”加入了战斗！（地形：${macroType === 'urban' ? '城区' : (macroType === 'hills' ? '丘陵' : '开阔地')}）`);
                }
            }
        });
    });

    // 5. 战斗微操作 (v2 Burst-Fire 引擎)
    let finalCombats = [];
    newState.combats.forEach(combat => {
        let fightingTeams = combat.teams.map(tid => newState.teams[tid]).filter(t => t && t.status !== 'dead');

        if (fightingTeams.length <= 1) {
            combat.teams.forEach(tid => {
                let t = newState.teams[tid];
                if (t && t.status !== 'dead') {
                    t.status = 'loot';
                    t.equipValue = Math.min(100, t.equipValue + 20);
                    _restoreTeamAfterCombat(t, newState.tick, newState.logs);
                }
            });
            if (fightingTeams.length === 1) {
                newState.logs.push(`[Tick ${newState.tick}] 🏆 ${fightingTeams[0].name} 赢得了该区域的战斗！`);
            }
        } else {
            let result = processCombatTickV2(combat, newState.teams, newState.tick, newState);
            newState.logs.push(...result.logs);

            // 检查参战队伍存活状态（v2 倒地兼容）
            combat.teams.forEach(tid => {
                let t = newState.teams[tid];
                if (t && t.status !== 'dead') checkTeamAlive(t, newState);
            });

            if (result.combatEnded) {
                combat.teams.forEach(tid => {
                    let t = newState.teams[tid];
                    if (t && t.status !== 'dead') {
                        t.status = 'loot';
                        t.equipValue = Math.min(100, t.equipValue + 20);
                        _restoreTeamAfterCombat(t, newState.tick, newState.logs);
                    }
                });
                if (result.winnerTeamId) {
                    newState.logs.push(`[Tick ${newState.tick}] 🏆 ${newState.teams[result.winnerTeamId].name} 赢得了该区域的战斗！`);
                }
            } else {
                finalCombats.push(combat);
            }
        }
    });
    newState.combats = finalCombats;

    // 6. 胜负判定与局末结算
    let totalAlive = Object.values(newState.teams).filter(t => t.status !== 'dead');
    if (totalAlive.length <= 1) {
        newState.status = 'end';
        if (totalAlive.length === 1) {
            let winner = totalAlive[0];
            winner.placement = 1;
            addTeamComm(winner, 'WIN', newState.tick);
            newState.logs.push(`👑 [本局结束] ${winner.name} 成为本局捍卫者！ (幸存耗时: ${newState.tick} Ticks)`);
        } else {
            newState.logs.push(`👑 [本局结束] 毒圈吞噬了所有人！`);
        }

        // 结算赛事积分
        Object.values(newState.teams).forEach(t => {
            if (t.status !== 'dead' && t.placement === 20) {
                t.placement = 1; // Double check for winner
            }
            let roundScore = t.kills + (PLACEMENT_SCORES[t.placement] || 0);
            let tourTeam = tournamentState.teams[t.id];
            tourTeam.TotalScore += roundScore;
            tourTeam.TotalKills += t.kills;
            tourTeam.MatchesPlayed++;
        });

        // 判断夺冠
        if (totalAlive.length === 1 && tournamentState.teams[totalAlive[0].id].IsMatchPointEligible) {
            tournamentState.status = 'FINISHED';
            tournamentState.championTeamId = totalAlive[0].id;
            newState.logs.push(`🏆 [赛事落幕] 恭喜 ${totalAlive[0].name} 斩获冠军！经历 ${tournamentState.matchCount} 局鏖战，比赛正式落幕！`);
        } else {
            let newEligibleCount = 0;
            Object.values(tournamentState.teams).forEach(tourTeam => {
                if (tourTeam.TotalScore >= 50 && !tourTeam.IsMatchPointEligible) {
                    tourTeam.IsMatchPointEligible = true;
                    newState.logs.push(`🔥 [赛点开启] ${tourTeam.name} 总分已达 ${tourTeam.TotalScore} 分，下局将进入赛点！`);
                    newEligibleCount++;
                }
            });
            if (newEligibleCount === 0 && totalAlive.length === 1 && tournamentState.teams[totalAlive[0].id].TotalScore >= 50) {
                 newState.logs.push(`⚠️ [赛事广播] 赛点队伍 ${totalAlive[0].name} 虽然吃鸡但因上局未达赛点，因此本局不夺冠！`);
            }
        }
    }

    return newState;
}

function checkTeamAlive(team, state) {
    if (team.status === 'dead') return;
    let anyStanding = team.players.some(p => !p.isDead && !p.isDown && p.hp > 0);
    if (!anyStanding) {
        // 淘汰时清理所有残留队员状态
        team.players.forEach(p => {
            if (!p.isDead) {
                p.isDead = true;
                p.hp = 0;
                p.isDown = false;
                p.state = 'dead';
            }
        });
        team.placement = state.aliveTeamsCount;
        state.aliveTeamsCount--;
        team.status = 'dead';
        let remaining = state.aliveTeamsCount;
        addTeamComm(team, 'DEAD', state.tick);
        
        let tourTeam = tournamentState.teams[team.id];
        if (tourTeam.IsMatchPointEligible) {
            state.logs.push(`💀 [淘汰] ${team.name} (赛点队伍) 已被淘汰！ 剩余队伍: ${remaining}`);
        } else {
            state.logs.push(`💀 [淘汰] ${team.name} 已被全数淘汰。 剩余队伍: ${remaining}`);
        }
    }
}

function _restoreTeamAfterCombat(team, tick, logs) {
    let revivedCount = 0;
    team.players.forEach(p => {
        if (p.isDown || p.isDead || p.hp < 100 || (p.shield !== undefined && p.shield < 50)) {
            if (p.isDown || p.isDead) revivedCount++;
        }
        p.hp = 100;
        p.shield = 50;
        p.magAmmo = 20;
        p.state = 'idle';
        p.stateTimer = 0;
        p.downTimer = 0;
        p.isDown = false;
        p.isDead = false;
        p.revivingTargetId = null;
        p.burstTotalTicks = 0;
        p.burstShotsLeft = 0;
        p._hitsThisTick = 0;
        p._lastTargetName = null;
        p._lastTargetTeam = null;
    });
    team.microTerrain = null;
    if (revivedCount > 0) {
        logs.push(`[Tick ${tick}] ♻️ ${team.name} 战后休整，${revivedCount} 名队员复活并恢复满状态！`);
    } else {
        logs.push(`[Tick ${tick}] ♻️ ${team.name} 战后休整，全员恢复满状态！`);
    }
}

function _getMacroTerrainAt(x, y, zones) {
    if (!zones || zones.length === 0) return 'open';
    let matched = zones.filter(z => x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height);
    if (matched.length === 0) return 'open';
    matched.sort((a, b) => b.priority - a.priority);
    return matched[0].type;
}

function addTeamComm(team, type, tick, targetName = "") {
    const lines = typeof COMM_CORPUS !== 'undefined' ? COMM_CORPUS[type] : [type];
    if (!lines || !lines.length) return;
    
    if (["WIN", "DEAD", "KILL", "DOWN", "DROP", "ENGAGE_ALERT", "ENGAGE_INFO", "THIRD_PARTY", "SHIELD_BREAK", "REVIVE_START", "REVIVE_SUCCESS", "REVIVE_CANCEL", "EXECUTION", "HEADSHOT"].indexOf(type) === -1) {
        if (team.lastCommTick && tick - team.lastCommTick < 15) return;
        if (Math.random() > 0.1) return;
    }

    let alivePlayers = team.players.filter(p => !p.isDown);
    let speakers = alivePlayers.length ? alivePlayers : team.players; 
    let speaker = speakers[Math.floor(Math.random() * speakers.length)];

    let line = lines[Math.floor(Math.random() * lines.length)];
    line = line.replace('{敌方}', targetName || '敌人');

    team.comms.push({ tick, speaker: speaker.name, text: line, type });
    team.lastCommTick = tick;
}