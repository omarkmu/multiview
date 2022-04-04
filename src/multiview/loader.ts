import { Notice, TFile, TFolder } from 'obsidian'
import MultiviewPlugin from '../main'

type ModuleAwaiter = (success: boolean, err?: unknown) => void
export type ExtensionHandler = (info: { path: string, source: string, skip: symbol }) => Promise<unknown>
export type ModuleCallback = (skip: symbol) => unknown

interface JsRecord {
    callbacks: ModuleAwaiter[]
    awaiting: JsRecord[]
    path: string
}

interface ModuleErrorOptions {
    cause?: unknown
    source?: string
}


const SKIP = Symbol('SKIP')

class ModuleLoadError extends Error {
    source?: string
    cause?: unknown

    constructor(message: string, options?: ModuleErrorOptions) {
        super(message)

        this.name = 'ModuleLoadError'
        this.source = options?.source
        this.cause = options?.cause
    }
}

export default class Loader {
    private _extensions: Record<string, ExtensionHandler> = {}
    private _cache: Record<string, unknown> = {}
    private _errors: Record<string, unknown> = {}
    private _loading: Record<string, JsRecord> = {}
    private _modules: Record<string, ModuleCallback> = {}
    private _paths: Set<string> = new Set()
    private _reloadQueue: (() => void)[] = []
    private _reloading = false

    private _jsHandler = this.registerExtension('js', async ({path, source}) => {
        if (this._cache[path]) return this._cache[path]

        for (const jsPath of this._resolveJs(path)) {
            if (this._cache[jsPath]) return this._cache[jsPath]

            // throw if a previous load failed
            if (this._errors[jsPath]) throw this._errors[jsPath]

            // if the file is loading, wait for it to finish
            const rec = this._loading[jsPath]
            if (rec) return await this._awaitLoading(rec, source)

            // try loading a file
            const file = this._plugin.app.vault.getAbstractFileByPath(jsPath)
            if (!(file instanceof TFile) || file.extension?.toLowerCase() !== 'js') continue

            const filePath = file.path
            const newRecord: JsRecord = {
                path: filePath,
                callbacks: [],
                awaiting: []
            }

            this._loading[filePath] = newRecord
            if (await this._loadFile(filePath)) {
                return this._cache[filePath]
            } else {
                throw this._errors[filePath]
            }
        }

        return SKIP
    })
    private _jsonHandler = this.registerExtension('json', async ({path}) => {
        if (!path.toLowerCase().endsWith('.json')) path += '.json'

        const file = this._plugin.app.vault.getAbstractFileByPath(path)
        if (!(file instanceof TFile)) return SKIP

        const parsed = JSON.parse(await this._plugin.app.vault.cachedRead(file))
        this._cache[path] = parsed
        return parsed
    })

    constructor(private _plugin: MultiviewPlugin, modules?: Record<string, ModuleCallback>) {
        for (const key of Object.keys(modules ?? {})) {
            this.registerModule(key, modules[key])
        }
    }

    get cache() { return this._cache }
    get extensions() { return this._extensions }

    eval(code: string | string[]): unknown {
        if (Array.isArray(code)) code = code.join('')

        return function() {
            return (0, eval)(code as string)
        }.call(undefined)
    }

    registerExtension(extension: string, handler: ExtensionHandler): ExtensionHandler {
        if (handler) {
            this._extensions[extension.toLowerCase()] = handler
        } else {
            delete this._extensions[extension.toLowerCase()]
        }

        return handler
    }

    registerModule(id: string, module: ModuleCallback): ModuleCallback {
        if (id.startsWith('/')) {
            throw new Error('module ID cannot start with /')
        }

        this._modules[id] = module
        return module
    }

    async reload(): Promise<void> {
        if (this._reloading) {
            return new Promise((resolve) => {
                this._reloadQueue.push(() => resolve(this._doReload()))
            })
        }

        return this._doReload()
    }

    resolve(id: string, source?: string): Set<string> {
        if (typeof id !== 'string') throw new Error(`expected id argument to be a string, got ${typeof id}`)
        if (id === '') throw new Error('expected non-empty string for id argument')

        const target = id.split('/').filter(s => s !== '')
        if (target.length === 0) return new Set()

        const absolute = []
        const relative = source?.split('/').filter(s => s !== '') ?? []
        relative.pop()
        for (const part of target) {
            if (part === '.') {
                continue
            } else if (part === '..') {
                absolute.pop()
                relative.pop()
            } else {
                absolute.push(part)
                relative.push(part)
            }
        }

        const paths = new Set<string>()
        const absolutePath = absolute.join('/')

        const isRelative = source && (target[0] === '.' || target[0] === '..')
        const isRoot = id.trimStart()[0] === '/'
        if (isRoot) {
            // path relative to root
            paths.add(absolutePath)
        } else {
            // path relative to source directory
            paths.add(relative.join('/'))
        }

        if (!isRoot && !isRelative) {
            // module paths
            for (const searchPath of this._paths) {
                paths.add(`${searchPath}/${absolutePath}`)
            }
        }

        return paths
    }

    async require(id: string, source?: string): Promise<unknown> {
        if (this._modules[id]) {
            const result = this._modules[id](SKIP)
            if (result !== SKIP) return result
        }

        let resolved
        try {
            resolved = this.resolve(id, source)
        } catch (e) {
            return this._error(e.message, { source })
        }

        for (const path of resolved) {
            if (this._cache[path]) return this._cache[path]

            const lastPeriod = path.lastIndexOf('.')
            const ext = lastPeriod !== -1 ? path.slice(lastPeriod + 1).toLowerCase() : null

            const handler = this._extensions[ext]
            try {
                if (handler) {
                    const result = await handler({ path, source, skip: SKIP })
                    if (result !== SKIP) return result
                }

                // don't infer explicit extensions
                if (ext) continue

                // try js
                if (handler !== this._jsHandler) {
                    const jsResult = await this._jsHandler({ path, source, skip: SKIP })
                    if (jsResult !== SKIP) return jsResult
                }

                // try json
                if (handler !== this._jsonHandler) {
                    const jsonResult = await this._jsonHandler({ path, source, skip: SKIP })
                    if (jsonResult !== SKIP) return jsonResult
                }
            } catch (e) {
                return this._error(
                    `error occurred while loading required module ${id}`,
                    { cause: e, source }
                )
            }
        }

        try {
            return require(id)
        } catch (e) {
            // ignore
        }

        return this._error(`cannot find module '${id}'`, { source })
    }

    requireImmediate(id: string): unknown | null {
        if (this._modules[id]) {
            const result = this._modules[id](SKIP)
            if (result !== SKIP) return result
        }

        for (const path of this.resolve(id)) {
            if (this._cache[path]) return this._cache[path]

            for (const jsPath of this._resolveJs(path)) {
                if (this._cache[jsPath]) return this._cache[jsPath]
            }
        }

        try {
            return require(id)
        } catch (e) {
            // ignore
        }

        return null
    }


    private _awaitLoading(record: JsRecord, source?: string): Promise<unknown> | unknown {
        const sourceRecord = this._loading[source]
        if (sourceRecord) {
            sourceRecord.awaiting.push(record)
            if (this._detectCycle(sourceRecord)) {
                while (sourceRecord.awaiting.contains(record))
                    sourceRecord.awaiting.remove(record)
                return this._error('circular require detected', { source })
            }
        }

        return new Promise((resolve, reject) => {
            record.callbacks.push((success, err) => {
                while (sourceRecord && sourceRecord.awaiting.contains(record)) {
                    sourceRecord.awaiting.remove(record)
                }

                if (success) {
                    resolve(this._cache[record.path])
                } else {
                    reject(err)
                }
            })
        })
    }

    private _detectCycle(source: JsRecord) {
        const seen = new Set()
        const stack = [source]

        while (stack.length > 0) {
            const current = stack.pop()
            if (seen.has(current)) return true

            for (const record of current.awaiting) {
                stack.push(record)
            }

            seen.add(current)
        }

        return false
    }

    private async _doReload(): Promise<void> {
        this._reloading = true
        this._loading = {}
        this._cache = {}
        this._errors = {}
        this._paths = new Set()

        const seen = new Set<string>()
        const records = this._plugin.api.data.getSetting('loadOrder')
            .map(entry => this._generateJsRecords(entry.paths, seen))
            .flat()

        let failures = 0
        for (const rec of records) {
            if (this._cache[rec.path]) continue
            this._loading[rec.path] = rec
            failures += (await this._loadFile(rec.path)) ? 0 : 1
        }

        if (failures > 0) {
            const s = failures === 1 ? '' : 's'
            new Notice(`[Multiview] ${failures} user module${s} failed to load. Please see the console for more information.`)
        }

        if (this._plugin.app.plugins.enabledPlugins.has('dataview')) {
            this._plugin.app.plugins.plugins.dataview?.api?.index?.touch()
        }

        this._reloading = false

        // reload again if queued
        const nextReload = this._reloadQueue.shift()
        nextReload?.()
    }

    private _error(message: string, options?: ModuleErrorOptions) {
        return Promise.reject(new ModuleLoadError(message, options))
    }

    /**
     * Generates a single level of JS file records given an array of paths.
     * @param paths The paths to generate JS file records for.
     * @param seen A set of filenames which have already been added to the load list.
     * @returns An array of JS file records.
     */
    private _generateJsRecords(paths: string[], seen: Set<string>) {
        const records: JsRecord[] = []
        const dirStack: TFolder[] = []

        const addRecord = (file: TFile) => {
            if (seen.has(file.path) || file.extension?.toLowerCase() !== 'js') return

            seen.add(file.path)
            records.push({
                path: file.path,
                callbacks: [],
                awaiting: []
            })
        }

        // handle each supplied path
        for (const path of paths) {
            try {
                const file = this._plugin.app.vault.getAbstractFileByPath(path)
                if (file instanceof TFile) {
                    addRecord(file)
                } else if (file instanceof TFolder) {
                    this._paths.add(path.split('/').filter(s => s !== '').join('/'))
                    dirStack.push(file)
                }
            } catch (e) {
                console.error(e)
                return []
            }
        }

        // collect files recursively
        while (dirStack.length > 0) {
            const directory = dirStack.pop()

            for (const file of directory.children) {
                if (file instanceof TFile) {
                    addRecord(file)
                } else if (file instanceof TFolder) {
                    dirStack.push(file)
                }
            }
        }

        // alphabetize by fully-qualified name
        return records.sort((a: JsRecord, b: JsRecord) => {
            if (a.path < b.path) return -1
            if (a.path > b.path) return 1
            return 0
        })
    }

    private async _loadFile(path: string): Promise<boolean> {
        try {
            const wrapped = this.eval([
                '(async function(module, require, multiview){',
                await this._plugin.app.vault.adapter.read(path),
                '})'
            ]) as ((...args: unknown[]) => unknown)

            const proxy = this._plugin.api.createProxy(path)
            const module = { exports: {} }

            await wrapped(module, proxy.require, proxy)
            this._cache[path] = module.exports

            return this._signal(path, true)
        } catch (e) {
            this._errors[path] = e
            console.error(`failed to load file ${path}:`, e)
            return this._signal(path, false, e)
        }
    }

    private _resolveJs(path: string): string[] {
        if (path.toLowerCase().endsWith('.js')) return [path]
        return [`${path}.js`, `${path}/index.js`]
    }

    private _signal(path: string, success: boolean, err?: unknown): boolean {
        const record = this._loading[path]
        if (!record) return success

        for (const callback of record.callbacks) {
            callback(success, err)
        }

        delete this._loading[path]
        return success
    }
}
