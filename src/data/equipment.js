/**
 * 装备系统 — 武器目录 & 补给品定义
 * 
 * 武器分为 近距离(CLOSE) 和 远距离(LONG) 两类，每类 T0~T3 四档。
 * 补给品为电池(battery)和医疗包(medkit)，团队共享。
 */

// ===== 武器等级 → 伤害倍率 =====
const WEAPON_DMG_MULT = {
    0: 1.00,  // T0 传说级
    1: 0.85,  // T1 史诗级
    2: 0.70,  // T2 稀有级
    3: 0.55   // T3 普通级
};

// ===== 近距离武器目录 =====
const CLOSE_WEAPONS = {
    0: [
        { name: '獒犬霰弹枪', nameEn: 'Mastiff Shotgun', ammoType: '霰弹' },
        { name: '和平捍卫者', nameEn: 'Peacekeeper', ammoType: '霰弹' }
    ],
    1: [
        { name: 'R-99 冲锋枪', nameEn: 'R-99 SMG', ammoType: '轻型' },
        { name: '电能冲锋枪', nameEn: 'Volt SMG', ammoType: '能量' },
        { name: 'CAR 冲锋枪', nameEn: 'C.A.R. SMG', ammoType: '轻型/重型' },
        { name: '猎兽冲锋枪', nameEn: 'Prowler Burst PDW', ammoType: '重型' }
    ],
    2: [
        { name: 'EVA-8 自动霰弹枪', nameEn: 'EVA-8 Auto', ammoType: '霰弹' },
        { name: '转换者冲锋枪', nameEn: 'Alternator SMG', ammoType: '轻型' },
        { name: 'RE-45 自动手枪', nameEn: 'RE-45 Auto', ammoType: '轻型' }
    ],
    3: [
        { name: '莫桑比克霰弹枪', nameEn: 'Mozambique Shotgun', ammoType: '霰弹' },
        { name: 'P2020 手枪', nameEn: 'P2020', ammoType: '轻型' }
    ]
};

// ===== 远距离武器目录 =====
const LONG_WEAPONS = {
    0: [
        { name: '克莱伯 .50口径', nameEn: 'Kraber .50-Cal', ammoType: '特殊' },
        { name: '充能步枪', nameEn: 'Charge Rifle', ammoType: '狙击' }
    ],
    1: [
        { name: '哨兵', nameEn: 'Sentinel', ammoType: '狙击' },
        { name: '长弓精确步枪', nameEn: 'Longbow DMR', ammoType: '狙击' },
        { name: 'R-301 卡宾枪', nameEn: 'R-301 Carbine', ammoType: '轻型' },
        { name: '平行步枪', nameEn: 'VK-47 Flatline', ammoType: '重型' }
    ],
    2: [
        { name: 'G7 侦察枪', nameEn: 'G7 Scout', ammoType: '轻型' },
        { name: '30-30 连发步枪', nameEn: '30-30 Repeater', ammoType: '重型' },
        { name: '三重击', nameEn: 'Triple Take', ammoType: '能量' },
        { name: '汗洛 burst 步枪', nameEn: 'Hemlok Burst AR', ammoType: '重型' },
        { name: '哈沃克步枪', nameEn: 'Havoc Rifle', ammoType: '能量' },
        { name: '复仇女神', nameEn: 'Nemesis Burst AR', ammoType: '能量' },
        { name: '喷火轻机枪', nameEn: 'M30 Spitfire', ammoType: '重型' }
    ],
    3: [
        { name: '专注轻机枪', nameEn: 'Devotion LMG', ammoType: '能量' },
        { name: 'L-STAR 能量机枪', nameEn: 'L-STAR EMG', ammoType: '能量' },
        { name: '暴走轻机枪', nameEn: 'Rampage LMG', ammoType: '重型' },
        { name: '波塞克弓', nameEn: 'Bocek Compound Bow', ammoType: '弓箭' },
        { name: '小帮手', nameEn: 'Wingman', ammoType: '重型' }
    ]
};

// ===== 搜索产出权重 =====
// 物品类型基础概率
const LOOT_TYPE_WEIGHTS = {
    closeWeapon: 0.35,
    longWeapon:  0.20,
    battery:     0.25,
    medkit:      0.20
};

// 武器 tier 基础权重
const LOOT_TIER_WEIGHTS = [0.05, 0.15, 0.30, 0.50]; // T0, T1, T2, T3

// 高级资源点武器 tier 权重
const LOOT_TIER_HIGH = [0.12, 0.25, 0.33, 0.30];

// 低级资源点武器 tier 权重
const LOOT_TIER_LOW = [0.02, 0.08, 0.25, 0.65];

// ===== 工具函数 =====

/**
 * 根据权重数组随机选取索引
 */
function _weightedRandom(weights) {
    let total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
        acc += weights[i];
        if (roll < acc) return i;
    }
    return weights.length - 1;
}

/**
 * 创建一个 Weapon 对象
 */
function _makeWeapon(type, tier, weaponData) {
    return {
        type: type,
        tier: tier,
        name: weaponData.name,
        nameEn: weaponData.nameEn,
        ammoType: weaponData.ammoType,
        dmgMult: WEAPON_DMG_MULT[tier]
    };
}

/**
 * 从 T3 池随机获取一把武器
 */
function getRandomT3Weapon(type) {
    let pool = (type === 'close') ? CLOSE_WEAPONS[3] : LONG_WEAPONS[3];
    let idx = Math.floor(Math.random() * pool.length);
    return _makeWeapon(type, 3, pool[idx]);
}

/**
 * 根据资源点等级 ROLL 武器 tier
 */
function _rollWeaponTier(rpTier) {
    let weights;
    if (rpTier === '高级') {
        weights = LOOT_TIER_HIGH;
    } else if (rpTier === '低级') {
        weights = LOOT_TIER_LOW;
    } else {
        weights = LOOT_TIER_WEIGHTS;
    }
    return _weightedRandom(weights);
}

/**
 * 随机 ROLL 一把指定类型的武器
 */
function rollWeapon(type, rpTier) {
    let tier = _rollWeaponTier(rpTier);
    let pool = (type === 'close') ? CLOSE_WEAPONS[tier] : LONG_WEAPONS[tier];
    let idx = Math.floor(Math.random() * pool.length);
    return _makeWeapon(type, tier, pool[idx]);
}

/**
 * 搜索掷骰：消耗1 token，返回产出物品
 * 返回 { type: 'closeWeapon'|'longWeapon'|'battery'|'medkit', weapon?: {...} }
 */
function rollLoot(rpTier) {
    let typeWeights = [
        LOOT_TYPE_WEIGHTS.closeWeapon,
        LOOT_TYPE_WEIGHTS.longWeapon,
        LOOT_TYPE_WEIGHTS.battery,
        LOOT_TYPE_WEIGHTS.medkit
    ];
    let typeIdx = _weightedRandom(typeWeights);
    let types = ['closeWeapon', 'longWeapon', 'battery', 'medkit'];
    let resultType = types[typeIdx];

    if (resultType === 'closeWeapon') {
        return { type: 'closeWeapon', weapon: rollWeapon('close', rpTier) };
    } else if (resultType === 'longWeapon') {
        return { type: 'longWeapon', weapon: rollWeapon('long', rpTier) };
    } else {
        return { type: resultType };
    }
}

/**
 * 尝试替换队员武器
 * 返回 { replaced: bool, oldWeapon, newWeapon, playerName }
 */
function tryReplaceWeapon(player, newWeapon) {
    let current = (newWeapon.type === 'close') ? player.closeWeapon : player.longWeapon;
    if (!current || newWeapon.tier < current.tier) {
        let old = current;
        if (newWeapon.type === 'close') {
            player.closeWeapon = newWeapon;
        } else {
            player.longWeapon = newWeapon;
        }
        return { replaced: true, oldWeapon: old, newWeapon: newWeapon };
    }
    return { replaced: false };
}

/**
 * 获取队员武器的显示标签（简短版）
 */
function weaponShortLabel(weapon) {
    if (!weapon) return '无';
    let tierLabel = ['T0', 'T1', 'T2', 'T3'][weapon.tier];
    return `${tierLabel} ${weapon.name}`;
}
