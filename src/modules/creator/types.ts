import { Link } from 'obsidian-dataview'

export type EventListenerMap = {
    [K in keyof GlobalEventHandlersEventMap]?: (ev: GlobalEventHandlersEventMap[K]) => unknown
}

export interface CreateOptions extends DomElementInfo {
    children?: (string | Node)[]
    events?: EventListenerMap
}

export interface AnchorOptions extends Omit<CreateOptions, 'href'> {
    href?: Link | string
    internal?: boolean
    normalize?: boolean
    addAriaLabel?: boolean
    ariaLabelPosition?: 'top' | 'bottom' | 'left' | 'right'
}

export interface AudioOptions extends CreateOptions {
    src?: string
    autoplay?: boolean
    controls?: boolean
    loop?: boolean
    muted?: boolean
}

export interface DropdownOptions extends CreateOptions {
    options?: (string | Node)[]
    selectedIndex?: number
    innerOptions?: CreateOptions
}

export interface IconOptions {
    icon?: string
    size?: number
    parent?: HTMLElement
    prepend?: boolean
}

export interface ImageOptions extends CreateOptions {
    src?: string
    alt?: string
    width?: string
    height?: string
}

export interface PillOptions extends CreateOptions {
    values?: (string | Node)[]
    colors?: string[]
    innerOptions?: CreateOptions
}

export interface SpinnerOptions extends CreateOptions {
    id?: string
    variant?: string
    size?: string
    stroke?: string
    color?: string
}

export interface VideoOptions extends AudioOptions {
    width?: string
    height?: string
}

interface EmbedOptionsBase extends CreateOptions {
    embedType?: string
    alt?: string
    width?: string
    height?: string
    hash?: string
    internal?: boolean
}

export interface EmbedOptions extends EmbedOptionsBase {
    url: string
    source?: string
}

export interface PDFEmbedOptions extends EmbedOptions {
    page?: number
}

export interface YouTubeEmbedOptions extends EmbedOptionsBase {
    id: string
    timestamp?: string
}


export type EmbedCreator = {
    (options: string | EmbedOptions): HTMLElement
    audio: (options: Omit<EmbedOptions & AudioOptions, 'src'>) => HTMLAudioElement | HTMLSpanElement
    img(options: Omit<EmbedOptions & ImageOptions, 'src'>): HTMLImageElement | HTMLSpanElement
    parse(str: string): EmbedOptions
    pdf(options: PDFEmbedOptions): HTMLSpanElement
    pdfAsync(options: PDFEmbedOptions): Promise<HTMLSpanElement>
    video(options: Omit<EmbedOptions & VideoOptions, 'src'>): HTMLVideoElement | HTMLSpanElement
    youtube(options: YouTubeEmbedOptions): HTMLSpanElement
}

export interface CreatorCustomElements {
    <K extends keyof HTMLElementTagNameMap>(tag: K, options?: string | CreateOptions, callback?: (el: HTMLElementTagNameMap[K]) => void): HTMLElementTagNameMap[K]
    anchor: (options?: string | AnchorOptions, callback?: (el: HTMLAnchorElement) => void) => HTMLAnchorElement
    audio: (options?: string | AudioOptions, callback?: (el: HTMLAudioElement) => void) => HTMLAudioElement
    dropdown: (options?: string | DropdownOptions, callback?: (el: HTMLSelectElement) => void) => HTMLSelectElement
    embed: EmbedCreator
    icon: (options: string | IconOptions, callback?: (el: SVGElement | null) => void) => SVGElement | null
    img: (options?: string | ImageOptions, callback?: (el: HTMLImageElement) => void) => HTMLImageElement
    paragraph: (options?: string | CreateOptions, callback?: (el: HTMLParagraphElement) => void) => HTMLParagraphElement
    pill: (options?: string | PillOptions, callback?: (el: HTMLDivElement) => void) => HTMLDivElement
    spinner: (options?: string | SpinnerOptions, callback?: (el: HTMLElement) => void) => HTMLDivElement
    video: (options?: string | VideoOptions, callback?: (el: HTMLVideoElement) => void) => HTMLVideoElement
    creator: (parent: HTMLElement | (() => HTMLElement)) => Creator
}

type DeprecatedElements =
    | 'dialog'
    | 'dir'
    | 'font'
    | 'frame'
    | 'frameset'
    | 'marquee'
type OverwrittenElements =
    | 'audio'
    | 'img'
    | 'embed'
    | 'video'

export type Creator = CreatorCustomElements & Omit<{
    [K in keyof HTMLElementTagNameMap]: (options?: string | CreateOptions, callback?: (el: HTMLElementTagNameMap[K]) => void) => HTMLElementTagNameMap[K]
}, DeprecatedElements | OverwrittenElements>
