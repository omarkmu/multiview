import { Component, MarkdownRenderChild, MarkdownView, Workspace } from 'obsidian'
import { PageContext, SectionContext } from './context'
import { MultiviewState, MultiviewNavigator } from './navigator'
import { PageView, SectionView } from './view'
import MultiviewPlugin from '../main'

export type MultiviewIndex = number | string


interface SectionOrdering {
    index: MultiviewIndex,
    order: number,
    section: SectionView
}

interface MultiviewGoOptions {
    newState?: MultiviewState
    replace?: boolean
    oldIndex?: MultiviewIndex
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
    navigator: MultiviewNavigator
    component: Component
    container: HTMLElement
    id?: string
    options: MultiviewOptions

    views: Record<MultiviewIndex, PageView>
    content: Record<MultiviewIndex, HTMLElement> = {}
    context: Record<MultiviewIndex, PageContext> = {}

    sections: Record<MultiviewIndex, SectionView> = {}
    sectionOrdering: SectionOrdering[] = []
    sectionContent: Record<MultiviewIndex, HTMLElement> = {}
    sectionContext: Record<MultiviewIndex, SectionContext> = {}

    private static _instanceMap: Record<string, MultiviewInstance[]> = {}
    private static _freeInstances: Set<MultiviewInstance> = new Set()

    static clearInstances() {
        for (const instance of Object.values(this._instanceMap).flat()) {
            instance.component.removeChild(instance)
        }

        for (const instance of this._freeInstances) {
            instance.component.removeChild(instance)
        }
    }

    private static _broadcast(instance: MultiviewInstance, idx: MultiviewIndex, options: MultiviewGoOptions) {
        if (!instance.id || !this._instanceMap[instance.id]) return
        if (!instance.options.enableSync || options.enableSync === false) return

        for (const other of this._instanceMap[instance.id]) {
            if (other === instance) continue
            other.go(idx, { ...options, enableSync: false })
        }
    }

    private static _deregisterInstance(instance: MultiviewInstance) {
        if (!instance.id || !(instance.id in this._instanceMap)) {
            this._freeInstances.delete(instance)
            return
        }

        this._instanceMap[instance.id].remove(instance)
        if (this._instanceMap[instance.id].length === 0) {
            delete this._instanceMap[instance.id]
        }
    }

    private static _registerInstance(instance: MultiviewInstance) {
        if (!instance.id) {
            this._freeInstances.add(instance)
            return
        }

        if (!(instance.id in this._instanceMap)) {
            this._instanceMap[instance.id] = []
        }

        this._instanceMap[instance.id].push(instance)
    }


    constructor(public plugin: MultiviewPlugin, options: MultiviewInitOptions) {
        const {
            views: _views,
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

        const views = {..._views}
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

        super(parent.container)

        this.id = id
        this.views = views
        this.container = parent.container
        this.component = parent?.component ?? plugin
        this.options = {
            autosave,
            trackHistory,
            clearOnLoad,
            resetScroll,
            enableSync
        }

        this.sectionOrdering = Object.entries(sections)
            .filter(v => v)
            .map(([k, v]) => {
                this.sections[k] = v
                return {
                    index: k,
                    order: typeof v.order === 'number' ? v.order : 0,
                    section: v
                }
            })
            .sort((a, b) => a.order - b.order)

        this.navigator = new MultiviewNavigator(this, initialState, initialIndex)
        this.component.addChild(this)
    }


    onload(): void {
        MultiviewInstance._registerInstance(this)
        this.go(this.navigator.index, { replace: false })
    }

    onunload(): void {
        MultiviewInstance._deregisterInstance(this)

        for (const el of Object.values(this.content).flat()) el.detach()
        for (const el of Object.values(this.sectionContent).flat()) el.detach()
    }


    doResetScroll(): boolean {
        const view = getContainingView(this.plugin.app.workspace, this.container)
        if (!view) return false

        const markdownEmbeds = view.contentEl?.getElementsByClassName('markdown-embed')
        if (markdownEmbeds) {
            for (let i = 0; i < markdownEmbeds.length; i++) {
                const embed = markdownEmbeds[i]
                if (!embed.contains(this.container)) continue

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
        if (!this.views[idx]) return Promise.reject(`${idx} is not a valid view index`)
        MultiviewInstance._broadcast(this, idx, options)

        const oldIdx = options?.oldIndex ?? this.navigator.index
        const replace = options?.replace ?? true
        const newState = options?.newState

        if (this.options.trackHistory && replace) {
            this.navigator.push(newState)
        } else if (newState) {
            this.navigator.update(newState, replace)
        }

        const view = this.views[idx]
        if (!(idx in this.content)) {
            const ctx = this.context[idx] = new PageContext(this, idx, view)
            const content = view.content
                ? await view.content(ctx)
                : createDiv()

            if (!(content instanceof HTMLElement))
                return Promise.reject(`expected view ${idx}.content to return an HTML element`)
            this.content[idx] = content
        }

        this.navigator.entry.index = idx
        if (view.load) {
            if (view.clearOnLoad || this.options.clearOnLoad && view.clearOnLoad !== false) {
                this.content[idx].empty()
            }

            await view.load(this.context[idx])
        }

        const prepend = []
        const append = []
        for (const { section, index } of this.sectionOrdering) {
            if (view.excludeSections?.contains(index)) continue

            if (!this.sectionContent[index]) {
                const ctx = this.sectionContext[index] = new SectionContext(this, index, section)
                const content = section.content
                    ? await section.content(ctx)
                    : createDiv()

                if (!(content instanceof HTMLElement)) return Promise.reject(`expected section ${index}.content to return an HTML element`)
                this.sectionContent[index] = content
            }

            if (section.load) {
                if (section.clearOnLoad || this.options.clearOnLoad && section.clearOnLoad !== false) {
                    this.sectionContent[index].empty()
                }

                await section.load(this.sectionContext[index])
            }

            if (section.prepend || (index === 'header' && section.prepend !== false)) {
                prepend.push(this.sectionContent[index])
            } else {
                append.push(this.sectionContent[index])
            }
        }

        // detach old view
        for (const el of Object.values(this.sectionContent))
            el.detach()
        this.content[oldIdx]?.detach()

        // attach new view
        this.container.append(this.content[idx])
        for (let i = prepend.length - 1; i >= 0; i--)
            this.container.prepend(prepend[i])
        for (const el of append) this.container.append(el)

        if (view.resetScroll || this.options.resetScroll && view.resetScroll !== false) {
            this.doResetScroll()
        }

        if (this.id && this.options.autosave) {
            await this.save()
        }
    }

    async save(): Promise<boolean> {
        if (!this.id) return false
        return await this.plugin.api.data.setPersistence(this.id, this.navigator.entry)
    }

    setTitle(title: string): boolean {
        const view = getContainingView(this.plugin.app.workspace, this.container)
        if (!view) return false

        let header
        const markdownEmbeds = view.contentEl?.getElementsByClassName('markdown-embed')
        if (markdownEmbeds) {
            for (let i = 0; i < markdownEmbeds.length; i++) {
                const embed = markdownEmbeds[i]
                if (!embed.contains(this.container)) continue

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
