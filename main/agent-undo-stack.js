"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearUndoHistory = exports.getUndoHistory = exports.undoLastAction = exports.recordAgentAction = exports.agentUndoStack = void 0;
/**
 * Agent Action Undo & Reversible Operations Stack
 */
class AgentUndoStack {
    constructor() {
        Object.defineProperty(this, "stack", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "maxStackSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 50
        });
    }
    /**
     * Synthesizes the inverse JavaScript code needed to revert a DOM/browser action.
     */
    generateInverseJS(action) {
        switch (action.type) {
            case 'type':
            case 'fill_form': {
                if (action.selector && action.previousValue !== undefined) {
                    const escapedSel = JSON.stringify(action.selector);
                    const escapedVal = JSON.stringify(action.previousValue);
                    return `(function() {
            try {
              const el = document.querySelector(${escapedSel});
              if (el) {
                el.focus();
                el.value = ${escapedVal};
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return { success: true, message: 'Restored previous input value' };
              }
              return { success: false, error: 'Element not found' };
            } catch (e) {
              return { success: false, error: String(e) };
            }
          })()`;
                }
                if (action.formFields && action.formFields.length > 0) {
                    const fieldsJSON = JSON.stringify(action.formFields);
                    return `(function() {
            try {
              const fields = ${fieldsJSON};
              let restored = 0;
              for (const f of fields) {
                const el = document.querySelector(f.selector);
                if (el && f.previousValue !== undefined) {
                  el.focus();
                  el.value = f.previousValue;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  restored++;
                }
              }
              return { success: true, restoredCount: restored };
            } catch (e) {
              return { success: false, error: String(e) };
            }
          })()`;
                }
                return undefined;
            }
            case 'navigate': {
                return `(function() {
          try {
            window.history.back();
            return { success: true, message: 'Navigated back' };
          } catch(e) {
            return { success: false, error: String(e) };
          }
        })()`;
            }
            case 'scroll': {
                return `(function() {
          try {
            window.scrollBy({ top: -${action.value ? parseInt(action.value, 10) : 300}, behavior: 'smooth' });
            return { success: true };
          } catch (e) {
            return { success: false, error: String(e) };
          }
        })()`;
            }
            default:
                return undefined;
        }
    }
    record(actionReq) {
        const undoJs = this.generateInverseJS(actionReq.action);
        const recorded = {
            id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            stepNumber: actionReq.stepNumber,
            goal: actionReq.goal,
            timestamp: Date.now(),
            url: actionReq.url,
            action: actionReq.action,
            undoJsCode: undoJs,
            canUndo: !!undoJs,
        };
        this.stack.push(recorded);
        if (this.stack.length > this.maxStackSize) {
            this.stack.shift();
        }
        return recorded;
    }
    popUndo() {
        while (this.stack.length > 0) {
            const last = this.stack.pop();
            if (last && last.canUndo && last.undoJsCode) {
                return {
                    success: true,
                    actionId: last.id,
                    undoJsCode: last.undoJsCode,
                };
            }
        }
        return {
            success: false,
            actionId: '',
            error: 'No reversible actions remaining in stack',
        };
    }
    getHistory() {
        return [...this.stack].reverse();
    }
    clear() {
        this.stack = [];
    }
}
exports.agentUndoStack = new AgentUndoStack();
const recordAgentAction = (req) => exports.agentUndoStack.record(req);
exports.recordAgentAction = recordAgentAction;
const undoLastAction = () => exports.agentUndoStack.popUndo();
exports.undoLastAction = undoLastAction;
const getUndoHistory = () => exports.agentUndoStack.getHistory();
exports.getUndoHistory = getUndoHistory;
const clearUndoHistory = () => exports.agentUndoStack.clear();
exports.clearUndoHistory = clearUndoHistory;
