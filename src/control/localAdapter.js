/**
 * 控制层：BR本地模式适配器
 */

let _brGameState = null;

function sendBRAction(actionConfig) {
    try {
        if (actionConfig.type === 'START') {
            _brGameState = initBRGame(actionConfig.payload);
            return { success: true, state: _brGameState };
        }
        
        if (actionConfig.type === 'TICK') {
            if (!_brGameState) return { success: false, error: '状态未初始化' };
            _brGameState = processBRTick(_brGameState);
            return { success: true, state: _brGameState };
        }

        return { success: false, error: `Unknown Action` };
    } catch (e) {
        return { success: false, error: e.message };
    }
}
