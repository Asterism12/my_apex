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
    // 生成 20 个资源点
    let resourcePoints = _generateResourcePoints();

    // 为每支队伍分配一个唯一的降落资源点
    let shuffledRP = [...resourcePoints].sort(() => Math.random() - 0.5);

    let teamsData = {};
    Object.values(tournamentState.teams).forEach((t, i) => {
        let drop = shuffledRP[i] || { x: 1000, y: 1000 };
        // 每个队员各自随机 T3 武器
        let players = [
            { id: `p1`, name: t.players[0], hp: 100, isDown: false, lastAtk: 0, shield: 50, shieldMax: 50,
              closeWeapon: getRandomT3Weapon('close'), longWeapon: getRandomT3Weapon('long') },
            { id: `p2`, name: t.players[1], hp: 100, isDown: false, lastAtk: 0, shield: 50, shieldMax: 50,
              closeWeapon: getRandomT3Weapon('close'), longWeapon: getRandomT3Weapon('long') },
            { id: `p3`, name: t.players[2], hp: 100, isDown: false, lastAtk: 0, shield: 50, shieldMax: 50,
              closeWeapon: getRandomT3Weapon('close'), longWeapon: getRandomT3Weapon('long') }
        ];
        teamsData[t.id] = {
            id: t.id,
            name: t.name,
            x: drop.x,
            y: drop.y,
            status: 'loot',
            aggro: t.IsMatchPointEligible ? 20 : (Math.floor(Math.random() * 50) + 50),
            aim: 50,
            experience: 50,
            terrain: 50,
            comms: [],
            kills: 0,
            placement: 20,
            teamTotalDamage: 0,
            _evoLevel: 1,
            _lastDamagerTeamId: null,
            supplies: { batteries: 2, medkits: 2 },
            players: players
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
        terrainZones: terrainZones,
        resourcePoints: resourcePoints
    };
}

function processBRTick(state) {
    // let newState = JSON.parse(JSON.stringify(state));
    let newState = state;
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
    let shrinkSpeed = tournamentState.gameConfig.shrinkSpeed;
    Object.values(newState.teams).forEach(team => {
        if (team.status === 'dead') return;

        let distToTarget = Math.hypot(team.x - newState.ring.x, team.y - newState.ring.y);
        // 预判：下一次缩圈后是否还在安全区内？提前向圈内移动
        let predictedRadius = newState.ring.radius - shrinkSpeed;
        let isOutsideOrSoon = distToTarget > predictedRadius;
        let isOutside = distToTarget > newState.ring.radius;

        if (isOutside) {
            addTeamComm(team, 'RING_MOVE', newState.tick);
            team.players.forEach(p => { if(!p.isDown) p.hp -= 1; });
            checkTeamAlive(team, newState);
        }

        if (team.status !== 'fight' && team.status !== 'dead') {
            if (isOutsideOrSoon) {
                team.x -= (team.x - newState.ring.x) * 0.1;
                team.y -= (team.y - newState.ring.y) * 0.1;
                team.status = 'move';
                if (!isOutside) {
                    // 提前进圈也播报一下
                    addTeamComm(team, 'RING_MOVE', newState.tick);
                }
            } else {
                let searchResult = _processLoot(team, newState.teams, newState.resourcePoints, newState.terrainZones, newState.tick);
                if (searchResult.looted) {
                    team.status = 'loot';
                    if (searchResult.log) newState.logs.push(searchResult.log);
                } else {
                    team.status = 'move';
                    team.x += (Math.random() - 0.5) * 40;
                    team.y += (Math.random() - 0.5) * 40;
                }
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

        // 如果战斗地点即将不在安全区内，向圈内迁移（防止长时间战斗因缩圈变成圈外打架）
        let combatDist = Math.hypot(combat.x - newState.ring.x, combat.y - newState.ring.y);
        let predictedRadius = newState.ring.radius - tournamentState.gameConfig.shrinkSpeed;
        if (combatDist > predictedRadius) {
            let oldX = combat.x, oldY = combat.y;
            combat.x -= (combat.x - newState.ring.x) * 0.1;
            combat.y -= (combat.y - newState.ring.y) * 0.1;
            // 同步更新所有参战队伍的位置
            combat.teams.forEach(tid => {
                let t = newState.teams[tid];
                if (t && t.status !== 'dead') {
                    t.x = combat.x;
                    t.y = combat.y;
                }
            });
            newState.logs.push(`[Tick ${newState.tick}] 🔥 安全区缩小，战斗地点向圈内迁移 (${Math.round(oldX)},${Math.round(oldY)}) → (${Math.round(combat.x)},${Math.round(combat.y)})`);
        }

        if (fightingTeams.length <= 1) {
            _distributeEliminatedEquip(combat, newState.teams, newState.tick, newState.logs);
            combat.teams.forEach(tid => {
                let t = newState.teams[tid];
                if (t && t.status !== 'dead') {
                    t.status = 'loot';
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

            _distributeEliminatedEquip(combat, newState.teams, newState.tick, newState.logs);

            if (result.combatEnded) {
                combat.teams.forEach(tid => {
                    let t = newState.teams[tid];
                    if (t && t.status !== 'dead') {
                        t.status = 'loot';
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
    let shieldMax = team.players[0] && team.players[0].shieldMax ? team.players[0].shieldMax : 50;
    team.players.forEach(p => {
        if (p.isDown || p.isDead || p.hp < 100 || (p.shield !== undefined && p.shield < (p.shieldMax || 50))) {
            if (p.isDown || p.isDead) revivedCount++;
        }
        p.hp = 100;
        p.shield = p.shieldMax || 50;
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
    // teamTotalDamage 不清零，跨战斗持续累积
    if (revivedCount > 0) {
        logs.push(`[Tick ${tick}] ♻️ ${team.name} 战后休整，${revivedCount} 名队员复活并恢复满状态！(🛡️${shieldMax}甲)`);
    } else {
        logs.push(`[Tick ${tick}] ♻️ ${team.name} 战后休整，全员恢复满状态！`);
    }
}

function _distributeEliminatedEquip(combat, teams, tick, logs) {
    let eliminated = combat.teams
        .map(tid => teams[tid])
        .filter(t => t && t.status === 'dead' && !t._equipLooted);
    let survivors = combat.teams
        .map(tid => teams[tid])
        .filter(t => t && t.status !== 'dead');

    if (eliminated.length === 0) return;

    eliminated.forEach(elim => {
        // 找出最后一个对其造成伤害的队伍
        let looterTeam = null;
        if (elim._lastDamagerTeamId && survivors.find(s => s.id === elim._lastDamagerTeamId)) {
            looterTeam = survivors.find(s => s.id === elim._lastDamagerTeamId);
        } else if (survivors.length > 0) {
            // 没有记录伤害来源时，随机分配给一个幸存者
            looterTeam = survivors[Math.floor(Math.random() * survivors.length)];
        }

        if (!looterTeam) {
            elim._equipLooted = true;
            return;
        }

        let batteryGain = elim.supplies ? (elim.supplies.batteries || 0) : 0;
        let medkitGain = elim.supplies ? (elim.supplies.medkits || 0) : 0;
        let supplyParts = [];
        if (batteryGain > 0) {
            looterTeam.supplies.batteries = (looterTeam.supplies.batteries || 0) + batteryGain;
            supplyParts.push(`电池×${batteryGain}`);
        }
        if (medkitGain > 0) {
            looterTeam.supplies.medkits = (looterTeam.supplies.medkits || 0) + medkitGain;
            supplyParts.push(`医疗包×${medkitGain}`);
        }

        // 武器择优替换：每把死者武器只能被一名队员拿走
        let weaponUpgrades = [];
        // 收集所有死者的武器池
        let deadCloseWeapons = [];
        let deadLongWeapons = [];
        elim.players.forEach(deadP => {
            if (deadP.closeWeapon) deadCloseWeapons.push(deadP.closeWeapon);
            if (deadP.longWeapon) deadLongWeapons.push(deadP.longWeapon);
        });
        // 按 tier 升序排列（更好的武器优先分配）
        deadCloseWeapons.sort((a, b) => a.tier - b.tier);
        deadLongWeapons.sort((a, b) => a.tier - b.tier);

        // 分配近战武器：每把武器只给第一个需要的队员
        deadCloseWeapons.forEach(weapon => {
            for (let myP of looterTeam.players) {
                if (myP.isDead) continue;
                if (!myP.closeWeapon || weapon.tier < myP.closeWeapon.tier) {
                    myP.closeWeapon = { ...weapon };
                    weaponUpgrades.push(`${myP.name}→${weaponShortLabel(weapon)}`);
                    break; // 这把武器已被拿走，不再分配给其他人
                }
            }
        });

        // 分配远程武器：每把武器只给第一个需要的队员
        deadLongWeapons.forEach(weapon => {
            for (let myP of looterTeam.players) {
                if (myP.isDead) continue;
                if (!myP.longWeapon || weapon.tier < myP.longWeapon.tier) {
                    myP.longWeapon = { ...weapon };
                    weaponUpgrades.push(`${myP.name}→${weaponShortLabel(weapon)}(远)`);
                    break; // 这把武器已被拿走，不再分配给其他人
                }
            }
        });

        // 清零败方
        if (elim.supplies) {
            elim.supplies.batteries = 0;
            elim.supplies.medkits = 0;
        }
        elim._equipLooted = true;

        let parts = [];
        if (supplyParts.length > 0) parts.push(supplyParts.join('、'));
        if (weaponUpgrades.length > 0) parts.push('武器升级: ' + weaponUpgrades.join(', '));

        if (parts.length > 0) {
            logs.push(`[Tick ${tick}] 💰 ${looterTeam.name} 舔了 ${elim.name} 的包，获得 ${parts.join(' | ')}`);
        }
    });
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
    if (team.comms.length > 50) {
        team.comms = team.comms.slice(-50);
    }
    team.lastCommTick = tick;
}

function _generateResourcePoints() {
    let mapW = 2000, mapH = 2000;
    let minDist = Math.hypot(mapW, mapH) * 0.15;
    let points = [];
    let cols = 4, rows = 5;
    let cellW = mapW / cols;
    let cellH = mapH / rows;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            let cx = c * cellW + cellW / 2;
            let cy = r * cellH + cellH / 2;
            let offsetRange = Math.min(cellW, cellH) * 0.35;
            let px = Math.floor(cx + (Math.random() - 0.5) * 2 * offsetRange);
            let py = Math.floor(cy + (Math.random() - 0.5) * 2 * offsetRange);
            px = Math.max(50, Math.min(mapW - 50, px));
            py = Math.max(50, Math.min(mapH - 50, py));
            points.push({ x: px, y: py });
        }
    }

    points.sort(() => Math.random() - 0.5);
    let tiers = [
        { count: 3, min: 12, max: 18, color: '#ffd700', label: '高级' },
        { count: 7, min: 7, max: 11, color: '#9c27b0', label: '中级' },
        { count: 10, min: 3, max: 6, color: '#ffffff', label: '低级' }
    ];
    let idx = 0;
    let resourcePoints = [];
    for (let tier of tiers) {
        for (let i = 0; i < tier.count; i++) {
            let total = Math.floor(tier.min + Math.random() * (tier.max - tier.min + 1));
            resourcePoints.push({
                id: `RP_${idx}`,
                x: points[idx].x,
                y: points[idx].y,
                resourceTokens: total,
                tier: tier.label,
                color: tier.color,
                radius: Math.hypot(mapW, mapH) * 0.05
            });
            idx++;
        }
    }
    return resourcePoints;
}

function _processLoot(team, allTeams, resourcePoints, terrainZones, tick) {
    let radius = Math.hypot(2000, 2000) * 0.05;
    let nearest = null;
    let nearestDist = Infinity;
    for (let rp of resourcePoints) {
        let d = Math.hypot(team.x - rp.x, team.y - rp.y);
        if (d < radius && d < nearestDist) {
            nearest = rp;
            nearestDist = d;
        }
    }

    if (!nearest || nearest.resourceTokens <= 0) {
        return { looted: false };
    }

    let teamsHere = Object.values(allTeams).filter(t =>
        t.id !== team.id && t.status !== 'dead' && Math.hypot(t.x - nearest.x, t.y - nearest.y) < radius
    );
    let isCompeting = teamsHere.length > 0;

    let macroTerrain = _getMacroTerrainAt(team.x, team.y, terrainZones);
    // 城区搜索频率 +20%：每 0.8 轮一次搜索，这里简化处理为偶尔双倍消耗
    let tokensToConsume = 1;
    if (!isCompeting && macroTerrain === 'urban' && Math.random() < 0.2) {
        tokensToConsume = 2;
    }

    let actualTokens = Math.min(tokensToConsume, nearest.resourceTokens);
    nearest.resourceTokens -= actualTokens;

    let logs = [];
    for (let t = 0; t < actualTokens; t++) {
        let loot = rollLoot(nearest.tier);

        if (loot.type === 'battery') {
            team.supplies.batteries = (team.supplies.batteries || 0) + 1;
            logs.push(`[Tick ${tick}] 🔋 ${team.name} 搜到 1 个电池 (库存: ${team.supplies.batteries})`);
        } else if (loot.type === 'medkit') {
            team.supplies.medkits = (team.supplies.medkits || 0) + 1;
            logs.push(`[Tick ${tick}] 💊 ${team.name} 搜到 1 个医疗包 (库存: ${team.supplies.medkits})`);
        } else {
            // 武器
            let weaponType = loot.type; // 'closeWeapon' or 'longWeapon'
            let weapon = loot.weapon;
            let typeLabel = weaponType === 'closeWeapon' ? '近战' : '远程';
            // 随机选一名队员
            let alivePlayers = team.players.filter(p => !p.isDead);
            if (alivePlayers.length === 0) continue;
            let player = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];

            let result = tryReplaceWeapon(player, weapon);
            if (result.replaced) {
                let oldLabel = result.oldWeapon ? weaponShortLabel(result.oldWeapon) : '无';
                logs.push(`[Tick ${tick}] 🔫 ${team.name}-${player.name} 拾取了[${typeLabel}] ${weaponShortLabel(weapon)}，换下了 ${oldLabel}`);
            } else {
                logs.push(`[Tick ${tick}] 🗑️ ${team.name}-${player.name} 看了一眼[${typeLabel}] ${weaponShortLabel(weapon)}，觉得不如手上的`);
            }
        }
    }

    addTeamComm(team, 'LOOT', tick);

    let depletedLog = null;
    if (nearest.resourceTokens <= 0) {
        depletedLog = `[Tick ${tick}] 📦 资源点 [${nearest.x.toFixed(0)}, ${nearest.y.toFixed(0)}] (${nearest.tier}) 已被搜刮完毕！`;
    }

    // 返回最新一条武器/补给品 log（避免刷屏），以及枯竭 log
    let mainLog = logs.length > 0 ? logs[logs.length - 1] : null;
    let combinedLog = [mainLog, depletedLog].filter(Boolean).join(' | ');
    return { looted: true, log: combinedLog || null };
}

function _findNearestResourcePoint(x, y, resourcePoints) {
    let nearest = null;
    let bestDist = Infinity;
    for (let rp of resourcePoints) {
        if (rp.resourceTokens <= 0) continue;
        let d = Math.hypot(x - rp.x, y - rp.y);
        if (d < bestDist) {
            bestDist = d;
            nearest = rp;
        }
    }
    return nearest;
}