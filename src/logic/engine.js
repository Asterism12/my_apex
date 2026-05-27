/**
 * 大逃杀逻辑引擎（纯函数计算）
 */

function initBRGame(payload) {
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
            x: Math.floor(Math.random() * 1000), // 1000x1000 map
            y: Math.floor(Math.random() * 1000),
            status: 'loot', // loot, move, fight, dead
            equipValue: 0,
            aggro: Math.floor(Math.random() * 100), // 激进度 0-100
            config: { aim: 50 + Math.random() * 50, exp: 50 + Math.random() * 50 },
            comms: [], // 存储由于语音播报的团队沟通日志
            players: [
                { id: `p1`, name: pNames[0], hp: 100, isDown: false, lastAtk: 0 },
                { id: `p2`, name: pNames[1], hp: 100, isDown: false, lastAtk: 0 },
                { id: `p3`, name: pNames[2], hp: 100, isDown: false, lastAtk: 0 }
            ]
        };
    }

    return {
        tick: 0,
        status: 'running',
        ring: { x: 500, y: 500, radius: 1000, stage: 1 },
        gameConfig: { shrinkSpeed: (payload && payload.shrinkSpeed !== undefined) ? parseInt(payload.shrinkSpeed) : 5 },
        teams,
        combats: [], // { id, teams: [], x, y }
        logs: [`[宏观Tick 0] 比赛开始！20支队伍已随机降落部署。`]
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
        newState.ring.radius -= newState.gameConfig.shrinkSpeed; 
    }

    // 2. 队伍状态更新与移动
    let aliveTeams = [];
    Object.values(newState.teams).forEach(team => {
        if (team.status === 'dead') return;
        aliveTeams.push(team);

        // 检测毒圈伤害
        let distToTarget = Math.hypot(team.x - newState.ring.x, team.y - newState.ring.y);
        if (distToTarget > newState.ring.radius) {
            addTeamComm(team, 'RING_MOVE', newState.tick);
            team.players.forEach(p => { if(!p.isDown) p.hp -= 1; });
            checkTeamAlive(team, newState);
        }

        if (team.status !== 'fight' && team.status !== 'dead') {
            // 向安全区移动或搜集
            if (distToTarget > newState.ring.radius) {
                // 跑毒
                team.x -= (team.x - newState.ring.x) * 0.1;
                team.y -= (team.y - newState.ring.y) * 0.1;
                team.status = 'move';
            } else {
                // 搜集物资 (装备值随时间上涨)
                if (team.equipValue < 100) team.equipValue += 1;
                team.status = 'loot';
                addTeamComm(team, 'LOOT', newState.tick);
                // 随机移动
                team.x += (Math.random() - 0.5) * 20;
                team.y += (Math.random() - 0.5) * 20;
            }
        }
    });

    // 3. 战斗实例化与检测（相遇）
    let availableTeams = aliveTeams.filter(t => t.status !== 'fight');
    for (let i = 0; i < availableTeams.length; i++) {
        for (let j = i + 1; j < availableTeams.length; j++) {
            let t1 = availableTeams[i];
            let t2 = availableTeams[j];
            if (t1.status !== 'fight' && t2.status !== 'fight') {
                if (Math.hypot(t1.x - t2.x, t1.y - t2.y) < 50) { // 遭遇判定距离
                    t1.status = 'fight';
                    t2.status = 'fight';
                    addTeamComm(t1, 'ENGAGE_ALERT', newState.tick);
                    addTeamComm(t1, 'ENGAGE_INFO', newState.tick + 1, t2.name);
                    addTeamComm(t2, 'ENGAGE_ALERT', newState.tick);
                    addTeamComm(t2, 'ENGAGE_INFO', newState.tick + 1, t1.name);
                    newState.combats.push({
                        id: `C_${t1.id}_${t2.id}`,
                        x: (t1.x + t2.x) / 2,
                        y: (t1.y + t2.y) / 2,
                        teams: [t1.id, t2.id]
                    });
                    newState.logs.push(`[Tick ${newState.tick}] 💥 ${t1.name} 与 ${t2.name} 遭遇，爆发战斗！`);
                }
            }
        }
    }

    // 4. 劝架系统 (Third-party)
    newState.combats.forEach(combat => {
        aliveTeams.forEach(t => {
            if (t.status !== 'fight') {
                let distToCombat = Math.hypot(t.x - combat.x, t.y - combat.y);
                if (distToCombat < 200 && t.aggro > 50) { // 听到枪声，根据激进度决定是否加入
                    t.status = 'fight';
                    t.x = combat.x; 
                    t.y = combat.y;
                    combat.teams.push(t.id);
                    addTeamComm(t, 'THIRD_PARTY', newState.tick);
                    newState.logs.push(`[Tick ${newState.tick}] ⚠️ ${t.name} 被枪声吸引，化身“黄雀”加入了战斗！`);
                }
            }
        });
    });

    // 5. 进行战斗微操作 (简化处理，每个战斗内的队伍随机互拍)
    let finalCombats = [];
    newState.combats.forEach(combat => {
        let fightingTeams = combat.teams.map(tid => newState.teams[tid]).filter(t => t.status !== 'dead');
        
        if (fightingTeams.length <= 1) {
            // 战斗结束
            if (fightingTeams.length === 1) {
                fightingTeams[0].status = 'loot'; // 赢家舔包
                fightingTeams[0].equipValue = Math.min(100, fightingTeams[0].equipValue + 20);
                newState.logs.push(`[Tick ${newState.tick}] 🏆 ${fightingTeams[0].name} 赢得了该区域的战斗！`);
            }
        } else {
            // 微观伤害计算：随机选队伍攻击
            fightingTeams.forEach(atkTeam => {
                let aliveDefenders = fightingTeams.filter(t => t.id !== atkTeam.id);
                if(aliveDefenders.length > 0) {
                    let targetTeam = aliveDefenders[Math.floor(Math.random() * aliveDefenders.length)];
                    let targetPlayer = targetTeam.players.find(p => !p.isDown);
                    let attackerPlayer = atkTeam.players.find(p => !p.isDown);
                    
                    if (targetPlayer && attackerPlayer && Math.random() < 0.3) { // 30% 命中一枪
                        let dmg = 15 + atkTeam.equipValue * 0.1;
                        targetPlayer.hp -= dmg;
                        if (targetPlayer.hp <= 0) {
                            targetPlayer.hp = 0;
                            targetPlayer.isDown = true;
                            addTeamComm(atkTeam, 'KILL', newState.tick, targetTeam.name);
                            addTeamComm(targetTeam, 'DOWN', newState.tick, atkTeam.name);
                            newState.logs.push(`[Tick ${newState.tick}] 🎯 ${atkTeam.name}(${attackerPlayer.name}) 击倒了 ${targetTeam.name}(${targetPlayer.name})！`);
                        }
                    }
                    checkTeamAlive(targetTeam, newState);
                }
            });
            finalCombats.push(combat); // 继续战斗
        }
    });
    newState.combats = finalCombats;

    // 6. 胜负判定
    let totalAlive = Object.values(newState.teams).filter(t => t.status !== 'dead');
    if (totalAlive.length === 1) {
        newState.status = 'end';
        addTeamComm(totalAlive[0], 'WIN', newState.tick);
        newState.logs.push(`👑 [终局] 比赛结束！${totalAlive[0].name} 成功存活，成为捍卫者！ (幸存耗时: ${newState.tick} Ticks)`);
    } else if (totalAlive.length === 0) {
        newState.status = 'end';
        newState.logs.push(`👑 [终局] 比赛结束！毒圈吞噬了所有人，没有任何队伍生还！`);
    }

    return newState;
}

function checkTeamAlive(team, state) {
    if (team.status === 'dead') return;
    let anyAlive = team.players.some(p => !p.isDown && p.hp > 0);
    if (!anyAlive) {
        team.status = 'dead';
        let remaining = Object.values(state.teams).filter(t => t.status !== 'dead').length - 1;
        addTeamComm(team, 'DEAD', state.tick);
        state.logs.push(`💀 [淘汰] ${team.name} 已被全数淘汰。 剩余队伍: ${remaining}`);
    }
}

function addTeamComm(team, type, tick, targetName = "") {
    const lines = typeof COMM_CORPUS !== 'undefined' ? COMM_CORPUS[type] : [type];
    if (!lines || !lines.length) return;
    
    // Cooldown check for generic events to avoid spamming
    if (["WIN", "DEAD", "KILL", "DOWN", "DROP", "ENGAGE_ALERT", "ENGAGE_INFO", "THIRD_PARTY"].indexOf(type) === -1) {
        if (team.lastCommTick && tick - team.lastCommTick < 15) return;
        if (Math.random() > 0.1) return; // Only 10% chance
    }

    let alivePlayers = team.players.filter(p => !p.isDown);
    let speakers = alivePlayers.length ? alivePlayers : team.players; 
    let speaker = speakers[Math.floor(Math.random() * speakers.length)];

    let line = lines[Math.floor(Math.random() * lines.length)];
    line = line.replace('{敌方}', targetName || '敌人');

    team.comms.push({ tick, speaker: speaker.name, text: line, type });
    team.lastCommTick = tick;
}