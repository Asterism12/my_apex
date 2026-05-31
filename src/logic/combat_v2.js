/**
 * 战斗模拟引擎 v2 - Burst-Fire 交火模型
 *
 * 暴露接口：
 *   processCombatTickV2(combat, teams, tick, state)
 *   → 返回 { logs: string[], combatEnded: boolean, winnerTeamId: string|null }
 */

function _getAttr(team, attr, defaultVal) {
    return team[attr] !== undefined ? team[attr] : (defaultVal !== undefined ? defaultVal : 50);
}

// ===== 微观地形层 =====
const MICRO_TERRAIN_POOLS = {
    urban: [
        { name: '建筑内', prob: 0.30, terrainBonus: 15, coverTable: { idle: 0.6, shooting: 0.4, healing_shield: 0.2, healing_hp: 0.2, reviving: 0.2, in_cover: 0.2 } },
        { name: '街道',   prob: 0.40, terrainBonus: 5,  coverTable: { idle: 1.0, shooting: 0.6, healing_shield: 0.35, healing_hp: 0.35, reviving: 0.35, in_cover: 0.35 } },
        { name: '楼顶',   prob: 0.20, terrainBonus: 20, coverTable: { idle: 0.6, shooting: 0.6, healing_shield: 0.35, healing_hp: 0.35, reviving: 0.35, in_cover: 0.35 } },
        { name: '窄巷',   prob: 0.10, terrainBonus: 10, coverTable: { idle: 0.6, shooting: 0.6, healing_shield: 0.25, healing_hp: 0.25, reviving: 0.25, in_cover: 0.25 } }
    ],
    hills: [
        { name: '坡顶', prob: 0.25, terrainBonus: 20, coverTable: { idle: 0.6, shooting: 0.6, healing_shield: 0.35, healing_hp: 0.35, reviving: 0.35, in_cover: 0.35 } },
        { name: '坡腰', prob: 0.30, terrainBonus: 5,  coverTable: { idle: 1.0, shooting: 0.6, healing_shield: 0.35, healing_hp: 0.35, reviving: 0.35, in_cover: 0.35 } },
        { name: '坡底', prob: 0.20, terrainBonus: -10, coverTable: { idle: 1.0, shooting: 0.8, healing_shield: 0.6, healing_hp: 0.6, reviving: 0.6, in_cover: 0.6 } },
        { name: '侧翼', prob: 0.25, terrainBonus: 0,  coverTable: { idle: 1.0, shooting: 0.6, healing_shield: 0.35, healing_hp: 0.35, reviving: 0.35, in_cover: 0.35 } }
    ],
    open: [
        { name: '岩石后',   prob: 0.25, terrainBonus: 5,  coverTable: { idle: 0.6, shooting: 0.6, healing_shield: 0.35, healing_hp: 0.35, reviving: 0.35, in_cover: 0.35 } },
        { name: '洼地',     prob: 0.25, terrainBonus: 0,  coverTable: { idle: 0.6, shooting: 0.6, healing_shield: 0.35, healing_hp: 0.35, reviving: 0.35, in_cover: 0.35 } },
        { name: '完全暴露', prob: 0.30, terrainBonus: -15, coverTable: { idle: 1.0, shooting: 1.0, healing_shield: 1.0, healing_hp: 1.0, reviving: 1.0, in_cover: 1.0 } },
        { name: '长草地',   prob: 0.20, terrainBonus: -5, coverTable: { idle: 0.8, shooting: 0.8, healing_shield: 0.6, healing_hp: 0.6, reviving: 0.6, in_cover: 0.6 } }
    ]
};

function rollMicroTerrain(macroType) {
    let pool = MICRO_TERRAIN_POOLS[macroType] || MICRO_TERRAIN_POOLS.open;
    let roll = Math.random();
    let acc = 0;
    for (let item of pool) {
        acc += item.prob;
        if (roll < acc) {
            return { ...item };
        }
    }
    return { ...pool[pool.length - 1] };
}

function _initCombatV2(combat, allTeams) {
    let fightingTeams = combat.teams.map(tid => allTeams[tid]).filter(t => t && t.status !== 'dead');

    fightingTeams.forEach(team => {
        // 首次初始化时设置队伍系数
        if (team._v2AimCoeff === undefined) {
            team._v2AimCoeff = _getAttr(team, 'aim', 50) / 50;
            team._v2ExpBase = 1 + 0.005 * _getAttr(team, 'experience', 50);
        }

        team.players.forEach(p => {
            // 缺少 v2 属性说明是后续劝架加入的队员，需要补初始化
            if (p.shield === undefined || p.magAmmo === undefined) {
                p.shield = 50;
                p.magAmmo = 20;
                p.state = 'idle';
                p.stateTimer = 0;
                p.downTimer = 0;
                p.isDead = false;
                p.burstTotalTicks = 0;
                p.burstShotsLeft = 0;
                p.revivingTargetId = null;
                p._hitsThisTick = 0;
            }
        });
    });

    combat.v2Initialized = true;
}

function _getAliveEnemyPlayers(combat, allTeams, myTeamId) {
    let enemies = [];
    combat.teams.forEach(tid => {
        if (tid === myTeamId) return;
        let t = allTeams[tid];
        if (!t || t.status === 'dead') return;
        t.players.forEach(p => {
            if (!p.isDead && !p.isDown && p.hp > 0) enemies.push({ player: p, team: t });
        });
    });
    return enemies;
}

function _getAllEnemyPlayers(combat, allTeams, myTeamId) {
    let enemies = [];
    combat.teams.forEach(tid => {
        if (tid === myTeamId) return;
        let t = allTeams[tid];
        if (!t || t.status === 'dead') return;
        t.players.forEach(p => {
            if (!p.isDead && p.hp > 0) enemies.push({ player: p, team: t });
        });
    });
    return enemies;
}

function _getTerrainDiff(atkTeam, defTeam) {
    let atkTerrain = _getAttr(atkTeam, 'terrain', 50);
    let defTerrain = _getAttr(defTeam, 'terrain', 50);
    let atkBonus = (atkTeam.microTerrain && atkTeam.microTerrain.terrainBonus) ? atkTeam.microTerrain.terrainBonus : 0;
    let defBonus = (defTeam.microTerrain && defTeam.microTerrain.terrainBonus) ? defTeam.microTerrain.terrainBonus : 0;
    return (atkTerrain + atkBonus) - (defTerrain + defBonus);
}

function _getCoverMultiplier(defTeam, defenderPlayer) {
    let defaultCover = 1.0;
    switch (defenderPlayer.state) {
        case 'shooting': defaultCover = 0.6; break;
        case 'healing_shield':
        case 'healing_hp':
        case 'in_cover':
            defaultCover = 0.35; break;
        case 'reviving':
            defaultCover = 0.35; break;
        default:
            defaultCover = 1.0;
    }
    if (defTeam && defTeam.microTerrain && defTeam.microTerrain.coverTable) {
        let stateCover = defTeam.microTerrain.coverTable[defenderPlayer.state];
        if (stateCover !== undefined) return stateCover;
    }
    return defaultCover;
}

function _computeHitRate(atkTeam, defTeam, defPlayer) {
    let baseHit = 0.6;
    let aimCoeff = atkTeam._v2AimCoeff || 1.0;
    let expCoeff = defTeam._v2ExpBase || 1.25;
    let terrainDiff = _getTerrainDiff(atkTeam, defTeam);
    let terrainMod = 1.0;
    if (terrainDiff > 20) terrainMod = 1.15;
    else if (terrainDiff < -20) terrainMod = 0.85;

    let coverMult = _getCoverMultiplier(defTeam, defPlayer);

    let hitRate = baseHit * aimCoeff / expCoeff * terrainMod * coverMult;
    return Math.max(0.05, Math.min(0.95, hitRate));
}

function _selectTarget(atkTeam, combat, allTeams) {
    let enemies = _getAllEnemyPlayers(combat, allTeams, atkTeam.id);
    if (enemies.length === 0) return null;

    let scores = enemies.map(e => {
        let score = 0;
        let p = e.player;

        // 1. 已破甲且无盾（最优先）
        if (p.shield === 0 && !p.isDown) score += 100;

        // 2. 无法反击状态
        if (['reloading', 'healing_shield', 'healing_hp'].includes(p.state)) score += 80;

        // 3. HP 低
        score += (100 - p.hp) * 0.5;

        // 4. 随机扰动
        score += (Math.random() - 0.5) * 20;

        return { ...e, score };
    });

    scores.sort((a, b) => b.score - a.score);
    return scores[0];
}

function _selectTargetOrDowned(atkTeam, combat, allTeams) {
    let allEnemies = _getAllEnemyPlayers(combat, allTeams, atkTeam.id);
    let downedEnemies = allEnemies.filter(e => e.player.isDown);

    if (downedEnemies.length > 0 && Math.random() < 0.7) {
        return downedEnemies[Math.floor(Math.random() * downedEnemies.length)];
    }

    return _selectTarget(atkTeam, combat, allTeams);
}

function _fireBullet(attackerPlayer, attackerTeam, combat, allTeams, tick, logs) {
    attackerPlayer.magAmmo--;

    let target = _selectTargetOrDowned(attackerTeam, combat, allTeams);
    if (!target) return;

    let targetPlayer = target.player;
    let targetTeam = target.team;

    let hitRate = _computeHitRate(attackerTeam, targetTeam, targetPlayer);

    if (Math.random() > hitRate) {
        return; // 未命中
    }

    // 命中：基础伤害 20，装备值影响火力倍率
    let baseDmg = 20;
    let equipMult = 0.3 + 0.7 * Math.min(attackerTeam.equipValue || 0, 100) / 100;
    let damage = Math.floor(baseDmg * equipMult);
    let isHeadshot = false;
    let aimCoeff = attackerTeam._v2AimCoeff || 1.0;
    if (Math.random() < 0.1 * aimCoeff) {
        damage = Math.floor(damage * 1.75);
        isHeadshot = true;
    }

    targetPlayer._hitsThisTick++;

    let logMsg = '';

    if (!targetPlayer.isDown && targetPlayer.shield > 0) {
        targetPlayer.shield -= damage;
        if (targetPlayer.shield <= 0) {
            targetPlayer.shield = 0;
            _tryAddComm(attackerTeam, 'SHIELD_BREAK', tick, attackerPlayer.name, targetTeam.name);
            logMsg = `[Tick ${tick}] ${attackerTeam.name}-${attackerPlayer.name} ${isHeadshot ? '爆头' : '命中'} ${targetTeam.name}-${targetPlayer.name}，破甲！`;
        } else {
            logMsg = `[Tick ${tick}] ${attackerTeam.name}-${attackerPlayer.name} ${isHeadshot ? '爆头' : '命中'} ${targetTeam.name}-${targetPlayer.name}，护盾-${damage} (剩余 ${targetPlayer.shield})`;
        }
    } else {
        // 打肉或补倒地
        targetPlayer.hp -= damage;
        if (targetPlayer.hp <= 0) {
            targetPlayer.hp = 0;
            if (targetPlayer.isDown) {
                // 补人
                targetPlayer.isDown = false;
                targetPlayer.isDead = true;
                targetPlayer.state = 'dead';
                logMsg = `[Tick ${tick}] 💀 ${attackerTeam.name}-${attackerPlayer.name} 补掉了 ${targetTeam.name}-${targetPlayer.name}！`;
                _tryAddComm(attackerTeam, 'EXECUTION', tick, attackerPlayer.name, targetTeam.name);
            } else {
                // 首次击倒
                targetPlayer.isDown = true;
                targetPlayer.state = 'downed';
                targetPlayer.stateTimer = 0;
                let expVal = _getAttr(targetTeam, 'experience', 50);
                targetPlayer.downTimer = Math.floor(100 + expVal * 0.5);
                attackerTeam.kills++;
                _tryAddComm(attackerTeam, 'KILL', tick, attackerPlayer.name, targetTeam.name);
                _tryAddComm(targetTeam, 'DOWN', tick, targetPlayer.name, attackerTeam.name);
                logMsg = `[Tick ${tick}] 🎯 ${attackerTeam.name}-${attackerPlayer.name} 击倒了 ${targetTeam.name}-${targetPlayer.name}！`;
            }
        } else {
            logMsg = `[Tick ${tick}] ${attackerTeam.name}-${attackerPlayer.name} ${isHeadshot ? '爆头' : '命中'} ${targetTeam.name}-${targetPlayer.name}，HP-${damage} (剩余 ${targetPlayer.hp})`;
        }
    }

    if (logMsg) logs.push(logMsg);

    if (isHeadshot) {
        _tryAddComm(attackerTeam, 'HEADSHOT', tick, attackerPlayer.name, targetTeam.name);
    }

    // 记录当前射击目标，供前端UI展示
    attackerPlayer._lastTargetName = targetPlayer.name;
    attackerPlayer._lastTargetTeam = targetTeam.name;
}

function _tryAddComm(team, type, tick, speakerName, targetName) {
    if (typeof addTeamComm === 'function') {
        addTeamComm(team, type, tick, targetName || '');
    }
}

function _processPlayerTick(player, team, combat, allTeams, tick, logs) {
    // 倒地队员强制锁定状态，不再执行任何主动行为
    if (player.isDown) {
        player.state = 'downed';
        return;
    }

    // 1. 状态倒计时递减
    if (player.stateTimer > 0) {
        player.stateTimer--;
    }

    // 2. 射击状态发弹判定
    if (player.state === 'shooting') {
        let elapsed = player.burstTotalTicks - player.stateTimer;
        if (elapsed > 0 && elapsed % 2 === 0 && player.burstShotsLeft > 0) {
            _fireBullet(player, team, combat, allTeams, tick, logs);
            player.burstShotsLeft--;
        }
        if (player.stateTimer <= 0) {
            player.burstTotalTicks = 0;
            player.burstShotsLeft = 0;
            player._lastTargetName = null;
            player._lastTargetTeam = null;
            if (!player.isDown) {
                // design doc: shooting → 弹匣空 → reloading；否则回到 idle
                if (player.magAmmo <= 0) {
                    player.state = 'reloading';
                    player.stateTimer = 18;
                    player.magAmmo = 20;
                    _tryAddComm(team, 'RELOAD', tick, player.name, '');
                } else {
                    player.state = 'idle';
                }
            }
        }
        return;
    }

    // 3. 非射击状态且 timer > 0：保持状态
    if (player.stateTimer > 0) {
        return;
    }

    // 4. 状态结束 → idle
    if (player.state !== 'idle') {
        // 救援成功结算
        if (player.state === 'reviving' && player.revivingTargetId) {
            let target = team.players.find(p => p.id === player.revivingTargetId);
            if (target && target.isDown) {
                target.isDown = false;
                target.hp = 25;
                target.shield = 0;
                target.downTimer = 0;
                target.state = 'idle';
                _tryAddComm(team, 'REVIVE_SUCCESS', tick, player.name, target.name);
            }
            player.revivingTargetId = null;
        }

        // 打电池完成 → 护盾回满
        if (player.state === 'healing_shield') {
            player.shield = 50;
            logs.push(`[Tick ${tick}] 🔋 ${team.name}-${player.name} 护盾恢复完毕！`);
        }

        // 打医疗包完成 → HP 回满
        if (player.state === 'healing_hp') {
            player.hp = 100;
            logs.push(`[Tick ${tick}] 💉 ${team.name}-${player.name} 生命值恢复完毕！`);
        }

        player.state = 'idle';
    }

    // 5. idle 状态下的主动决策
    if (player.isDead || player.isDown || player.hp <= 0) return;

    let enemyAlive = _getAliveEnemyPlayers(combat, allTeams, team.id);

    // a) 弹匣快空了，且场上存在可攻击目标，打光换弹
    if (player.magAmmo <= 3 && player.magAmmo > 0 && enemyAlive.length > 0) {
        player.burstShotsLeft = player.magAmmo;
        player.burstTotalTicks = player.burstShotsLeft * 2;
        player.stateTimer = player.burstTotalTicks;
        player.state = 'shooting';
        return;
    }

    // a2) 弹匣已空
    if (player.magAmmo <= 0) {
        player.state = 'reloading';
        player.stateTimer = 18;
        player.magAmmo = 20;
        _tryAddComm(team, 'RELOAD', tick, player.name, '');
        return;
    }

    // b) 无盾，未被集火，且无人正在拉你
    if (player.shield === 0 && player._hitsThisTick < 2) {
        let beingRevived = team.players.some(p => p.state === 'reviving' && p.revivingTargetId === player.id);
        if (!beingRevived) {
            player.state = 'healing_shield';
            player.stateTimer = 15;
            _tryAddComm(team, 'HEALING_SHIELD', tick, player.name, '');
            return;
        }
    }

    // c) HP ≤ 25，未被集火
    if (player.hp <= 25 && player._hitsThisTick < 2) {
        player.state = 'healing_hp';
        player.stateTimer = 12;
        _tryAddComm(team, 'HEALING_HP', tick, player.name, '');
        return;
    }

    // d) 有队友倒地，且自己不是唯一站着的，且未被集火
    let downedTeammates = team.players.filter(p => p.isDown && p.hp > 0);
    let standingTeammates = team.players.filter(p => !p.isDown && p.hp > 0);
    if (downedTeammates.length > 0 && standingTeammates.length > 1 && player._hitsThisTick < 2) {
        player.state = 'reviving';
        player.stateTimer = 20;
        player.revivingTargetId = downedTeammates[0].id;
        _tryAddComm(team, 'REVIVE_START', tick, player.name, downedTeammates[0].name);
        return;
    }

    // e) 存在可攻击目标
    if (enemyAlive.length > 0) {
        let burstLen = 5 + Math.floor(Math.random() * 4);
        burstLen = Math.min(burstLen, player.magAmmo);
        if (burstLen <= 0) {
            player.state = 'reloading';
            player.stateTimer = 18;
            player.magAmmo = 20;
            _tryAddComm(team, 'RELOAD', tick, player.name, '');
            return;
        }
        player.burstShotsLeft = burstLen;
        player.burstTotalTicks = burstLen * 2;
        player.stateTimer = player.burstTotalTicks;
        player.state = 'shooting';
        return;
    }
}

function processCombatTickV2(combat, teams, tick, state) {
    let logs = [];

    _initCombatV2(combat, teams);

    let fightingTeams = combat.teams.map(tid => teams[tid]).filter(t => t && t.status !== 'dead');
    if (fightingTeams.length < 2) {
        return { logs, combatEnded: true, winnerTeamId: fightingTeams.length === 1 ? fightingTeams[0].id : null };
    }

    // 1. 重置每 tick 命中计数
    fightingTeams.forEach(t => {
        t.players.forEach(p => { p._hitsThisTick = 0; });
    });

    // 2. 处理倒地倒计时
    fightingTeams.forEach(t => {
        t.players.forEach(p => {
            if (p.isDown && p.downTimer > 0) {
                p.downTimer--;
                if (p.downTimer <= 0) {
                    p.hp = 0;
                    p.isDown = false;
                    p.isDead = true;
                    p.state = 'dead';
                    logs.push(`[Tick ${tick}] 💀 ${t.name}-${p.name} 流血过久，已被淘汰。`);
                }
            }
        });
    });

    // 3. 主状态机（每个队员）
    fightingTeams.forEach(t => {
        t.players.forEach(p => {
            _processPlayerTick(p, t, combat, teams, tick, logs);
        });
    });

    // 4. 强制流转：被打缩了 + 救援打断
    fightingTeams.forEach(t => {
        t.players.forEach(p => {
            // 救援打断
            if (p.state === 'reviving' && p._hitsThisTick > 0) {
                p.state = 'idle';
                p.stateTimer = 0;
                p.revivingTargetId = null;
                _tryAddComm(t, 'REVIVE_CANCEL', tick, p.name, '');
            }

            // 被压制
            if (p._hitsThisTick >= 2 && ['idle', 'shooting', 'reloading'].includes(p.state)) {
                p.state = 'in_cover';
                p.stateTimer = 5;
                p.burstTotalTicks = 0;
                logs.push(`[Tick ${tick}] ${t.name}-${p.name} 被火力压制，缩回掩体！`);
                _tryAddComm(t, 'SUPPRESSION', tick, p.name, '');
            }
        });
    });

    // 5. 胜负判定（全队倒地即判负，不再等待流血倒计时）
    let aliveTeams = [];
    combat.teams.forEach(tid => {
        let t = teams[tid];
        if (!t || t.status === 'dead') return;
        let anyStanding = t.players.some(p => !p.isDead && !p.isDown && p.hp > 0);
        if (anyStanding) {
            aliveTeams.push(t);
        }
    });

    if (aliveTeams.length <= 1) {
        return {
            logs,
            combatEnded: true,
            winnerTeamId: aliveTeams.length === 1 ? aliveTeams[0].id : null
        };
    }

    return { logs, combatEnded: false, winnerTeamId: null };
}
