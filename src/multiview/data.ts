import MultiviewPlugin from '../main'
import { NavigatorEntry } from './navigator'


export interface LoadOrderEntry {
    paths: string[]
}

export interface MultiviewSettings {
    enableMultiviewGlobal: boolean
    loadOrder: LoadOrderEntry[]
}

const PERSISTENCE = 'mv.persistence'
const SETTINGS = 'mv.settings'
const RESERVED = new Set([
    PERSISTENCE,
    SETTINGS
])

export default class DataHandler {
    private _disconnected = false
    constructor(private _plugin: MultiviewPlugin, private _data?: Record<string, unknown>) { }

    static async load(plugin: MultiviewPlugin): Promise<Record<string, unknown>> {
        const data = await plugin.loadData() ?? {}
        const defaultSettings: MultiviewSettings = {
            enableMultiviewGlobal: true,
            loadOrder: [{ paths: [] }],
        }

        return {
            ...data,
            [SETTINGS]: { // default settings
                ...defaultSettings,
                ...data[SETTINGS]
            }
        }
    }

    get settings(): MultiviewSettings { return this._data[SETTINGS] as MultiviewSettings }

    get<T>(key: string | string[], fallback?: T): unknown | T
    get<T>(key: string | string[], fallback?: T): unknown {
        let container = this._data
        const keys = typeof key === 'string' ? [key] : key ?? []
        if (keys.length === 0) return fallback ?? undefined

        for (const c_key of keys) {
            if (typeof container !== 'object' || container[c_key] === undefined) {
                return fallback ?? undefined
            }

            container = container[c_key] as Record<string, unknown>
        }

        return container
    }

    getPersistence(key: string | string[]): NavigatorEntry | undefined
    getPersistence<T>(key: string | string[], fallback?: T): NavigatorEntry | T
    getPersistence<T>(key: string | string[], fallback?: T): NavigatorEntry | T {
        return this.get([
            PERSISTENCE,
            ...typeof key === 'string' ? [key] : key ?? []
        ], fallback) as NavigatorEntry
    }

    getSetting<S extends keyof MultiviewSettings>(key: S): MultiviewSettings[S] | undefined
    getSetting<S extends keyof MultiviewSettings, T>(key: S, fallback: T): MultiviewSettings[S] | T
    getSetting<T>(key: string | string[], fallback?: T): unknown | T
    getSetting<T>(key: string | string[], fallback?: T): unknown | T {
        return this.get([
            SETTINGS,
            ...typeof key === 'string' ? [key] : key ?? []
        ], fallback)
    }

    getSettings(): MultiviewSettings {
        return this.get(SETTINGS) as MultiviewSettings
    }

    disconnect(): void {
        this._disconnected = true
    }

    async flush(): Promise<boolean> {
        if (this._disconnected) return false

        await this._plugin.saveData(this._data)
        return true
    }

    async set(key: string | string[], value: unknown): Promise<boolean> {
        if (!key) return false
        const keys = typeof key === 'string' ? [key] : key ?? []

        if (keys.length === 0 || RESERVED.has(keys[0])) return false
        return this._set(keys, value)
    }

    async setPersistence(key: string | string[], value: NavigatorEntry): Promise<boolean> {
        const keys = typeof key === 'string' ? [key] : key ?? []
        if (keys.length === 0) return false

        return await this._set([
            PERSISTENCE,
            ...keys
        ], value)
    }

    async updateSetting<S extends keyof MultiviewSettings>(key: S, value: MultiviewSettings[S]): Promise<boolean>
    async updateSetting(key: string | string[], value: unknown): Promise<boolean>
    async updateSetting(key: string | string[], value: unknown): Promise<boolean> {
        const keys = typeof key === 'string' ? [key] : key ?? []
        if (keys.length === 0) return false

        return await this._set([
            SETTINGS,
            ...keys
        ], value)
    }

    async updateSettings(value: MultiviewSettings): Promise<boolean> {
        this._data[SETTINGS] = value
        return await this.flush()
    }

    async remove(key?: string | string[]): Promise<boolean> {
        const keys = [...typeof key === 'string' ? [key] : key ?? []]
        if (keys.length === 0 || RESERVED.has(keys[0])) return false

        let container = this._data
        for (let i = 0; i < keys.length - 1; i++) {
            const c_key = keys[i]
            if (typeof container !== 'object') return false

            if (container[c_key] === undefined) {
                container[c_key] = {}
            }

            container = container[c_key] as Record<string, unknown>
        }

        if (typeof container !== 'object') return false

        delete container[keys[keys.length - 1]]
        return await this.flush()
    }


    private async _set(keys: string[], value: unknown): Promise<boolean> {
        let container = this._data
        for (let i = 0; i < keys.length - 1; i++) {
            if (typeof container !== 'object') return false

            const c_key = keys[i]
            if (container[c_key] === undefined) {
                container[c_key] = {}
            }

            container = container[c_key] as Record<string, unknown>
        }

        if (typeof container !== 'object') return false

        container[keys[keys.length - 1]] = value
        return await this.flush()
    }
}
