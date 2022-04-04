import type { MultiviewContext, PageContext, SectionContext } from './context'
import type { MultiviewIndex } from './instance'

export interface MultiviewView<T extends MultiviewContext> {
    clearOnLoad?: boolean
    content?: (ctx: Omit<T, 'container'>) => HTMLElement | Promise<HTMLElement>
    load?: (ctx: T) => unknown
    [key: string]: unknown
}

export interface PageView extends MultiviewView<PageContext> {
    excludeSections?: MultiviewIndex[]
    resetScroll?: boolean
}
export interface SectionView extends MultiviewView<SectionContext> {
    order?: number
    prepend?: boolean
}
