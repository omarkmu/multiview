import type MultiviewPlugin from 'src/main'
import type { MultiviewIndex, MultiviewInitOptions } from './instance'
import type { PageView, SectionView } from './view'


export class MultiviewBuilder {
    private _options: MultiviewInitOptions


    constructor(private _plugin: MultiviewPlugin, options: MultiviewInitOptions) {
        this._options = {
            ...options,
            views: { ...options?.views },
            sections: { ...options?.sections },
            parent: {
                component: options?.parent?.component,
                container: options?.parent?.container,
            }
        }
    }


    render(): this {
        this._plugin.api.render(this._options)
        return this
    }

    withHeader(callbackOrView: SectionView | SectionViewCallback): this {
        return this.withSection('header', callbackOrView)
    }

    withFooter(callbackOrView: SectionView | SectionViewCallback): this {
        return this.withSection('footer', callbackOrView)
    }

    withSection(idx: MultiviewIndex, callbackOrView: SectionView | SectionViewCallback): this {
        const section  = typeof callbackOrView === 'function'
            ? callbackOrView(this)
            : callbackOrView

        this._options.sections[idx] = section
        return this
    }

    withSections(sections: Record<MultiviewIndex, SectionView | SectionViewCallback>): this {
        for (const [idx, section] of Object.entries(sections)) {
            this.withSection(idx, section)
        }

        return this
    }

    withView(idx: MultiviewIndex, callbackOrView: PageView | PageViewCallback): this {
        const view = typeof callbackOrView === 'function'
            ? callbackOrView(this)
            : callbackOrView

        this._options.views[idx] = view
        return this
    }

    withViews(views: Record<MultiviewIndex, PageView | PageViewCallback>): this {
        for (const [idx, view] of Object.entries(views)) {
            this.withView(idx, view)
        }

        return this
    }
}

type PageViewCallback = (builder: MultiviewBuilder) => PageView
type SectionViewCallback = (builder: MultiviewBuilder) => SectionView
