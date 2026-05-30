/**
 * 控制层：BR本地模式适配器 (赛事)
 */

let _brGameState = null;

function sendBRAction(actionConfig) {
    try {
        if (actionConfig.type === 'START_TOURNAMENT') {
            initTournament(actionConfig.payload);
            _brGameState = initMatch();
            return { success: true, state: _brGameState, tournament: tournamentState };
        }

        if (actionConfig.type === 'NEXT_MATCH') {
            _brGameState = initMatch();
            return { success: true, state: _brGameState, tournament: tournamentState };
        }
        
        if (actionConfig.type === 'TICK') {
            if (!_brGameState) return { success: false, error: '状态未初始化' };
            _brGameState = processBRTick(_brGameState);
            return { success: true, state: _brGameState, tournament: tournamentState };
        }

        if (actionConfig.type === 'GET_STATE') {
            if (!_brGameState) return { success: false, error: '状态未初始化' };
            return { success: true, state: _brGameState, tournament: tournamentState };
        }

        return { success: false, error: `Unknown Action` };
    } catch (e) {
        return { success: false, error: e.message };
    }
}
