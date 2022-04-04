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
