import * as obsidian from 'obsidian'
import { DataHandler } from './data'
import { Loader, ExtensionHandler } from './loader'
import { MultiviewInstance, MultiviewInitOptions } from './instance'
import { MultiviewBuilder } from './builder'
import { Creator } from '../modules/creator'
import type MultiviewPlugin from '../main'


function createRequire(api: MultiviewAPI, source?: string): MultiviewRequire {
    const ctx = (id: string) => api.loader.require(id, source)
    const immediate = (id: string) => api.loader.requireImmediate(id)

    Object.defineProperty(ctx, 'cache', {
        get() { return api.loader.cache }
    })

    Object.defineProperty(ctx, 'extensions', {
        get() { return api.loader.extensions }
    })

    Object.defineProperty(ctx, 'immediate', {
        get() { return immediate }
    })

    return ctx as MultiviewRequire
}


export class MultiviewAPIProxy {
    build: (options: MultiviewInitOptions) => MultiviewBuilder
    require: MultiviewRequire
    render: (options: MultiviewInitOptions) => void


    constructor(private _api: MultiviewAPI, private _source: string) {
        this.build = (options) => this._api.build(options)
        this.require = createRequire(this._api, this._source)
        this.render = (options) => this._api.render(options)
    }


    get create() { return this._api.create }
    get data() { return this._api.data }
    get loader() { return this._api.loader }
    get plugin() { return this._api.plugin }
}

export class MultiviewAPI {
    public readonly data: DataHandler
    public readonly create: Creator
    public readonly loader: Loader
    public readonly require: MultiviewRequire


    constructor(public readonly plugin: MultiviewPlugin, data: Record<string, unknown>) {
        this.require = createRequire(this)
        this.create = new Creator(plugin)
        this.data = new DataHandler(plugin, data)
        this.loader = new Loader(plugin, this._getRequireModules())
    }


    build(options: MultiviewInitOptions): MultiviewBuilder {
        return new MultiviewBuilder(this.plugin, options)
    }

    createProxy(source: string): MultiviewAPIProxy {
        return new MultiviewAPIProxy(this, source)
    }

    render(options: MultiviewInitOptions): void {
        new MultiviewInstance(this.plugin, options)
    }


    private _getRequireModules(): Record<string, (invalid: symbol) => unknown> {
        return {
            obsidian: () => obsidian,
            creator: () => this.create,
            dataview: (invalid) => {
                const plugins = this.plugin.app.plugins
                if (!plugins.enabledPlugins.has('dataview')) return invalid
                return plugins.plugins?.dataview?.api
            }
        }
    }
}


interface MultiviewRequire {
    (id: string): unknown
    readonly cache: Record<string, unknown>
    readonly extensions: Record<string, ExtensionHandler>
}
