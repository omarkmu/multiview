import { MultiviewInstance, MultiviewIndex } from './instance'

export type MultiviewState = Record<string, unknown>

export interface NavigatorEntry {
    state: MultiviewState
    index: MultiviewIndex
}

export class MultiviewNavigator {
    private _backEntries: NavigatorEntry[] = []
    private _forwardEntries: NavigatorEntry[] = []
    private _entry: NavigatorEntry

    constructor(private _instance: MultiviewInstance, state: MultiviewState, index: MultiviewIndex) {
        this._entry = {
            state,
            index
        }
    }

    get canGoBack() { return this._backEntries.length > 0 }
    get canGoForward() { return this._forwardEntries.length > 0 }
    get entry() { return this._entry }
    get index() { return this._entry.index }
    get state() { return this._entry.state }


    clear() {
        this._backEntries = []
        this._forwardEntries = []
    }

    update(state: MultiviewState, replace=false) {
        if (replace) {
            this._entry.state = { ...state }
        } else {
            Object.assign(this._entry.state, { ...state })
        }
    }

    push(state?: MultiviewState) {
        this._forwardEntries = []
        this._backEntries.push(this._entry)

        this._entry = {
            state: {...state},
            index: this._entry.index
        }
    }

    reload() {
        return this._instance.go(this._entry.index)
    }

    back() {
        if (!this.canGoBack)
            return Promise.reject('cannot go back; history stack is empty')
        return this.go(-1)
    }

    forward() {
        if (!this.canGoForward)
            return Promise.reject('cannot go forward; history stack is empty')
        return this.go(1)
    }

    go(delta?: number) {
        if (delta === 0) return this.reload()

        const isNeg = delta < 0
        const value = isNeg ? -delta : delta
        const target = isNeg ? this._backEntries : this._forwardEntries
        const opposite = isNeg ? this._forwardEntries : this._backEntries

        if (value > target.length) {
            return Promise.reject('supplied delta is beyond the history length')
        }

        for (let i = 0; i < value; i++) {
            opposite.push(this._entry)
            this._entry = target.pop()
        }

        return this._instance.go(this._entry.index, { replace: false })
    }
}
