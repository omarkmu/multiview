import { Component, MarkdownRenderChild, MarkdownView, Workspace } from 'obsidian'
import { PageContext, SectionContext } from './context'
import { MultiviewState, MultiviewNavigator } from './navigator'
import { PageView, SectionView } from './view'
import MultiviewPlugin from '../main'

export type MultiviewIndex = number | string


interface ViewInfo<V, C> {
    container?: HTMLElement
    context?: C
    index: MultiviewIndex
    view: V
}

type PageInfo = ViewInfo<PageView, PageContext>

interface SectionInfo extends ViewInfo<SectionView, SectionContext> {
    order: number
}

interface MultiviewGoOptions {
    newState?: MultiviewState
    replace?: boolean
    enableSync?: boolean
}

interface MultiviewOptions {
    autosave: boolean
    trackHistory: boolean
    clearOnLoad: boolean
    resetScroll: boolean
    enableSync: boolean
}

export interface MultiviewInitOptions extends Partial<MultiviewOptions> {
    parent: { component?: Component, container: HTMLElement }
    views: Record<MultiviewIndex, PageView>
    id?: string
    loadState?: boolean
    sections?: Record<MultiviewIndex, SectionView>
    header?: SectionView
    footer?: SectionView
    state?: MultiviewState
    defaultState?: MultiviewState
    index?: MultiviewIndex
    defaultIndex?: MultiviewIndex
}

interface ObsidianView extends MarkdownView {
    headerEl?: HTMLElement
}

interface ObsidianSplitChild {
    view?: ObsidianView
    containerEl?: HTMLElement
    children?: ObsidianSplitChild[]
}

interface ObsidianSplit {
    children: ObsidianSplitChild[]
}


function getContainingView(workspace: Workspace, el: HTMLElement): ObsidianView {
    const splits = [
        workspace.rootSplit,
        workspace.leftSplit,
        workspace.rightSplit
    ]

    for (const split of splits) {
        const children = (split as unknown as ObsidianSplit)?.children
        if (!children) continue

        for (const child of children) {
            if (!child.containerEl?.contains(el)) continue

            if (child.view) return child.view

            if (!child.children) continue
            for (const innerChild of child.children) {
                if (!innerChild.containerEl?.contains(el)) continue
                if (innerChild.view) return innerChild.view
            }
        }
    }

    return null
}


export class MultiviewInstance extends MarkdownRenderChild {
    private static _instanceMap: Record<string, Set<MultiviewInstance>> = {}
    private static _freeInstances: Set<MultiviewInstance> = new Set()

    static clearInstances() {
        for (const set of Object.values(this._instanceMap).flat()) {
            for (const instance of set) instance._component.removeChild(instance)
        }

        for (const instance of this._freeInstances) {
            instance._component.removeChild(instance)
        }
    }

    private static _broadcast(instance: MultiviewInstance, idx: MultiviewIndex, options: MultiviewGoOptions) {
        if (!instance._id || !this._instanceMap[instance._id]) return
        if (!instance._options.enableSync || options.enableSync === false) return

        for (const other of this._instanceMap[instance._id]) {
            if (other === instance || !other._options.enableSync) continue
            other.go(idx, { ...options, enableSync: false })
        }
    }

    private static _deregisterInstance(instance: MultiviewInstance) {
        if (!instance._id || !(instance._id in this._instanceMap)) {
            this._freeInstances.delete(instance)
            return
        }

        this._instanceMap[instance._id].delete(instance)
        if (this._instanceMap[instance._id].size === 0) {
            delete this._instanceMap[instance._id]
        }
    }

    private static _registerInstance(instance: MultiviewInstance) {
        if (!instance._id) {
            this._freeInstances.add(instance)
            return
        }

        if (!(instance._id in this._instanceMap)) {
            this._instanceMap[instance._id] = new Set()
        }

        this._instanceMap[instance._id].add(instance)
    }

    private _component: Component
    private _container: HTMLElement
    private _id?: string
    private _navigator: MultiviewNavigator
    private _options: MultiviewOptions
    private _sections: Record<MultiviewIndex, SectionInfo> = {}
    private _sectionOrder: SectionInfo[] = []
    private _views: Record<MultiviewIndex, PageInfo>


    constructor(public plugin: MultiviewPlugin, options: MultiviewInitOptions) {
        const {
            views,
            parent=null,
            sections: _sections=null,
            header=null,
            footer=null,
            id=null,
            state=null,
            defaultState=null,
            index=null,
            defaultIndex=null,
            autosave=false,
            loadState=true,
            trackHistory=false,
            clearOnLoad=true,
            resetScroll=true,
            enableSync=true
        } = options

        const indices = Object.keys(views)
        const persistenceEnabled = loadState && id
        const persisted = persistenceEnabled && plugin.api.data.getPersistence(id)

        let initialIndex = index ?? persisted?.index ?? defaultIndex
        if (indices.length === 0) {
            throw new Error('must specify at least one view')
        }
        if (!(parent?.container instanceof HTMLElement)) {
            throw new Error('container must be an HTML element')
        }
        if (parent?.component && !(parent?.component instanceof Component)) {
            throw new Error('component must be a Component')
        }
        if (!(initialIndex in views)) {
            initialIndex = defaultIndex in views ? defaultIndex : indices[0]
        }

        const initialState = {
            ...defaultState,
            ...persisted && persisted.state,
            ...state
        }

        const sections: Record<MultiviewIndex, SectionView> = {
            ..._sections,
            ...header && { header },
            ...footer && { footer },
        }

        const container = createDiv({
            cls: 'mv-container',
            attr: { ...id && { ['data-mv-id']: id } }
        })

        super(parent.container.appendChild(container))

        this._id = id
        this._container = container
        this._component = parent?.component ?? plugin
        this._options = {
            autosave,
            trackHistory,
            clearOnLoad,
            resetScroll,
            enableSync
        }

        this._views = Object.entries(views)
            .filter(([k, v]) => k && v)
            .map(([k, v]) => ({
                index: k,
                view: v
            }))
            .reduce<Record<string, PageInfo>>((m, v) => {
                m[v.index] = v
                return m
            }, {})
        this._sectionOrder = Object.entries(sections)
            .filter(([k, v]) => k && v)
            .map(([k, v]) => {
                const entry = {
                    index: k,
                    order: typeof v.order === 'number' ? v.order : 0,
                    view: v
                }

                this._sections[k] = entry
                return entry
            })
            .sort((a, b) => a.order - b.order)

        this._navigator = new MultiviewNavigator(this, initialState, initialIndex)
        this._component.addChild(this)
    }


    get container(): HTMLElement { return this._container }
    get id(): string { return this._id }
    get navigator(): MultiviewNavigator { return this._navigator }
    get options(): MultiviewOptions { return this._options }
    get sections(): Record<MultiviewIndex, SectionInfo> { return this._sections }
    get views(): Record<MultiviewIndex, PageInfo> { return this._views }


    onload(): void {
        MultiviewInstance._registerInstance(this)
        this.go(this._navigator.index, { replace: false })
    }

    onunload(): void {
        MultiviewInstance._deregisterInstance(this)
        this._container.empty()
    }


    doResetScroll(): boolean {
        const view = getContainingView(this.plugin.app.workspace, this._container)
        if (!view) return false

        const markdownEmbeds = view.contentEl?.getElementsByClassName('markdown-embed')
        if (markdownEmbeds) {
            for (let i = 0; i < markdownEmbeds.length; i++) {
                const embed = markdownEmbeds[i]
                if (!embed.contains(this._container)) continue

                const content = embed.getElementsByClassName('markdown-embed-content')?.[0]
                if (!content) return false

                content.scrollTo({ top: 0 })
                return true
            }
        }

        view.currentMode?.applyScroll(0)
        return true
    }

    async go(idx: MultiviewIndex, options?: MultiviewGoOptions): Promise<void> {
        if (!this._views[idx]) return Promise.reject(`${idx} is not a valid view index`)
        MultiviewInstance._broadcast(this, idx, options)

        const replace = options?.replace ?? true
        const newState = options?.newState

        if (this._options.trackHistory && replace) {
            this._navigator.push(newState)
        } else if (newState) {
            this._navigator.update(newState, replace)
        }

        const info = this._views[idx]
        const view = info.view
        if (!info.container) {
            const ctx = info.context = new PageContext(this, idx, view)
            const content = view.content
                ? await view.content(ctx)
                : createDiv()

            if (!(content instanceof HTMLElement)) {
                return Promise.reject(`expected view ${idx}.content to return an HTML element`)
            }

            info.container = content
        }

        this._navigator.entry.index = idx
        if (view.load) {
            if (view.clearOnLoad || this._options.clearOnLoad && view.clearOnLoad !== false) {
                info.container.empty()
            }

            await view.load(info.context)
        }

        const prepend = []
        const append = []
        for (const entry of this._sectionOrder) {
            const { view: section, index } = entry
            if (view.excludeSections?.contains(index)) continue

            if (!entry.container) {
                const ctx = entry.context = new SectionContext(this, index, section)
                const content = section.content
                    ? await section.content(ctx)
                    : createDiv()

                if (!(content instanceof HTMLElement)) {
                    return Promise.reject(`expected section ${index}.content to return an HTML element`)
                }

                entry.container = content
            }

            if (section.load) {
                if (section.clearOnLoad || this._options.clearOnLoad && section.clearOnLoad !== false) {
                    entry.container.empty()
                }

                await section.load(entry.context)
            }

            if (section.prepend || (index === 'header' && section.prepend !== false)) {
                prepend.push(entry.container)
            } else {
                append.push(entry.container)
            }
        }

        // detach old view
        this._container.empty()

        // attach new view
        this._container.append(info.container)
        for (let i = prepend.length - 1; i >= 0; i--)
            this._container.prepend(prepend[i])
        for (const el of append) this._container.append(el)

        if (view.resetScroll || this._options.resetScroll && view.resetScroll !== false) {
            this.doResetScroll()
        }

        if (this._id && this._options.autosave) {
            await this.save()
        }
    }

    async save(): Promise<boolean> {
        if (!this._id) return false
        return await this.plugin.api.data.setPersistence(this._id, this._navigator.entry)
    }

    setTitle(title: string): boolean {
        const view = getContainingView(this.plugin.app.workspace, this._container)
        if (!view) return false

        let header
        const markdownEmbeds = view.contentEl?.getElementsByClassName('markdown-embed')
        if (markdownEmbeds) {
            for (let i = 0; i < markdownEmbeds.length; i++) {
                const embed = markdownEmbeds[i]
                if (!embed.contains(this._container)) continue

                header = embed.getElementsByClassName('markdown-embed-title')?.[0]
                break
            }
        }

        if (!header) {
            header = view.headerEl?.getElementsByClassName('view-header-title')?.[0]
            if (!header) return false
        }

        const existing = header.getText()
        const bar = existing.indexOf(' | ')

        const originalTitle = bar !== -1 ? existing.slice(0, bar) : existing
        if (title === '') {
            header.setText(originalTitle)
        } else {
            header.setText(`${originalTitle} | ${title}`)
        }

        return true
    }
}
