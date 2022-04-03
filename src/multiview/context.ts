import { Creator, DropdownOptions, creator } from '../modules/creator'
import { MultiviewState } from './navigator'
import { MultiviewInstance, MultiviewIndex } from './instance'
import { PageView, SectionView } from './view'

export interface SectionDropdownOptions extends Omit<DropdownOptions, 'selectedIndex'> {
    selectedIndex?: MultiviewIndex
    displayKey?: MultiviewIndex
}

export abstract class MultiviewContext {
    protected _create: Creator

    constructor(protected _instance: MultiviewInstance, protected _index: MultiviewIndex, protected _view: unknown) {
        this._create = creator(this._instance.plugin, ()=> this.container)
    }

    abstract get container(): HTMLElement
    abstract get view(): unknown

    get create() { return this._create }
    get navigator() { return this._instance.navigator }
    get state() { return this._instance.navigator.state }

    get autosave() { return this._instance.options.autosave }
    set autosave(value) { this._instance.options.autosave = value }

    get clearOnLoad() { return this._instance.options.clearOnLoad }
    set clearOnLoad(value) { this._instance.options.clearOnLoad = value }

    get id() { return this._instance.id }
    set id(value) { this._instance.id = value }

    get resetScroll() { return this._instance.options.resetScroll }
    set resetScroll(value) { this._instance.options.resetScroll = value }

    get trackHistory() { return this._instance.options.trackHistory }
    set trackHistory(value) { this._instance.options.trackHistory = value }


    go(idx: MultiviewIndex, newState?: MultiviewState, replace?: boolean) {
        return this._instance.go(idx, { newState, replace })
    }

    save() {
        return this._instance.save()
    }

    setTitle(title: string) {
        return this._instance.setTitle(title)
    }
}

export class PageContext extends MultiviewContext {
    get container() { return this._instance.content[this._index] }
    get view(): PageView { return this._view as PageView }
}

export class SectionContext extends MultiviewContext {
    get container() { return this._instance.sectionContent[this._index] }
    get view(): SectionView { return this._view as SectionView }

    addDropdown(options: SectionDropdownOptions = {}) {
        let selectedIndex = options.selectedIndex
        let values = options.options

        // associates dropdown selectedIndex to multiview index
        let indexMap: MultiviewIndex[]

        if (!values) {
            selectedIndex ??= this.navigator.index
            indexMap = []
            values = Object.entries(this._instance.views).map(([k, v], i) => {
                const value = options.displayKey ? v[options.displayKey] : k
                if (k === selectedIndex) selectedIndex = i
                indexMap[i] = value
                return value
            })
        }

        this._create.dropdown({
            ...options,
            options: values,
            selectedIndex: typeof selectedIndex === 'number' ? selectedIndex : null,
            cls: options.cls ?? ['mv-dropdown'],
            events: {
                ...indexMap && {
                    change: (ev) => {
                        const target = ev.target as HTMLSelectElement
                        const idx = indexMap?.[target.selectedIndex]
                        if (idx) this._instance.go(idx)
                    }
                },
                ...options.events
            }
        })

        return this
    }
}
