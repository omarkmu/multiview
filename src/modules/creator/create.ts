import { Component, setIcon } from 'obsidian'
import MultiviewPlugin from '../../main'
import { getCSSLength } from './util'
import { EmbedCreator } from './embed'
import {
    AnchorOptions,
    AudioOptions,
    CreateOptions,
    DropdownOptions,
    EventListenerMap,
    IconOptions,
    ImageOptions,
    PillOptions,
    SpinnerOptions,
    VideoOptions
} from './types'


function addEventListeners(node: Node, events: EventListenerMap, component: Component) {
    for (const [event, listener] of Object.entries(events)) {
        if (!events.hasOwnProperty(event)) continue
        node.addEventListener(event, listener)
        component.register(() => node.removeEventListener(event, listener))
    }
}

function normalizeURL(url: string, internal: boolean) {
    try {
        if (internal) {
            const slashIdx = url.lastIndexOf('/')
            url = slashIdx === -1 ? url : url.slice(slashIdx + 1)

            return url.endsWith('.md') ? url.slice(0, -3) : url
        } else {
            const hostname = (new URL(url)).hostname
            return hostname.startsWith('www.') ? hostname.slice(4) : hostname
        }
    } catch {
        return url
    }
}

const spinnerCounts: Record<string, number> = {
    circle: 1,
    heart: 1,
    ripple: 2,
    rolling: 1
}
const tagNames: (keyof HTMLElementTagNameMap)[] = [
    'a',
    'abbr',
    'address',
    'area',
    'article',
    'aside',
    'b',
    'base',
    'bdi',
    'bdo',
    'blockquote',
    'body',
    'br',
    'button',
    'canvas',
    'caption',
    'cite',
    'code',
    'col',
    'colgroup',
    'data',
    'datalist',
    'dd',
    'del',
    'details',
    'dfn',
    'div',
    'dl',
    'dt',
    'em',
    'fieldset',
    'figcaption',
    'figure',
    'footer',
    'form',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'head',
    'header',
    'hgroup',
    'hr',
    'html',
    'i',
    'iframe',
    'input',
    'ins',
    'kbd',
    'label',
    'legend',
    'li',
    'link',
    'main',
    'map',
    'mark',
    'menu',
    'meta',
    'meter',
    'nav',
    'noscript',
    'object',
    'ol',
    'optgroup',
    'option',
    'output',
    'p',
    'param',
    'picture',
    'pre',
    'progress',
    'q',
    'rp',
    'rt',
    'ruby',
    's',
    'samp',
    'script',
    'section',
    'select',
    'slot',
    'small',
    'source',
    'span',
    'strong',
    'style',
    'sub',
    'summary',
    'sup',
    'table',
    'tbody',
    'td',
    'template',
    'textarea',
    'tfoot',
    'th',
    'thead',
    'time',
    'title',
    'tr',
    'track',
    'u',
    'ul',
    'var',
    'wbr'
]


class _Creator extends Function {
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

    //@ts-ignore
    constructor(plugin: MultiviewPlugin, parent?: HTMLElement | (() => HTMLElement), owner?: Component) {
        const getParent = parent instanceof HTMLElement ? (() => parent) : parent
        const component = owner ?? plugin

        const create = ((tag, options, callback) => {
            options = typeof options === 'string' ? { cls: options, parent: getParent?.() } : {
                ...options,
                parent: options?.parent ?? getParent?.()
            }

            const el = createEl(tag, options)
            if (options.events) addEventListeners(el, options.events, component)
            if (options.children) el.append(...options.children.filter(n => n))

            callback?.(el)
            return el
        }) as Creator

        Object.assign(create, tagNames.reduce((map, tag) => {
            map[tag] = (options: CreateOptions, callback: (el: HTMLElement) => void) => create(tag, options, callback)
            return map
        }, {} as Record<keyof HTMLElementTagNameMap, unknown>))

        create.embed = new EmbedCreator(plugin, create)
        create.paragraph = create.p

        create.anchor = (options, callback) => {
            options = (typeof options === 'string' ? { cls: options } : options) ?? {}

            const {
                cls,
                text: _text,
                href: _href='',
                internal=true,
                normalize=false,
                addAriaLabel=true,
                ariaLabelPosition='top',
            } = options

            const href = typeof _href === 'string'
                ? _href
                : _href?.path ?? ''
            const text = (typeof _href === 'string' ? _text : _text ?? _href?.display)
                ?? (normalize ? normalizeURL(href, internal) : href) ?? ''

            return create.a({
                ...options,
                href,
                text,
                cls: [
                    internal ? 'internal-link' : 'external-link',
                    ...(typeof cls === 'string' ? [cls] : cls ?? [])
                ],
                attr: {
                    rel: 'noreferrer', // same functionality as noopener, plus no Referer header is sent
                    target: '_blank',
                    ...href && { ['data-href']: href },
                    ...addAriaLabel && href && href !== text && {
                        ['aria-label']: href,
                        ['aria-label-position']: ariaLabelPosition
                    },
                    ...options.attr
                }
            }, callback)
        }

        create.audio = (options, callback) => {
            options = (typeof options === 'string' ? { cls: options } : options) ?? {}

            const {
                src,
                autoplay=false,
                controls=false,
                muted=false,
                loop=false,
            } = options

            return create('audio', {
                ...options,
                attr: {
                    ...autoplay && {autoplay: ''},
                    ...controls && {controls: ''},
                    ...muted && {muted: ''},
                    ...loop && {loop: ''},
                    ...src !== null && {src},
                    referrerPolicy: 'no-referrer',
                    ...options.attr
                }
            }, callback)
        }

        create.dropdown = (options, callback) => {
            options = (typeof options === 'string' ? { cls: options } : options) ?? {}

            const {
                options: values=[],
                selectedIndex=0,
                cls=null,
                innerOptions=null
            } = options

            return create.select({
                ...options,
                cls: [
                    'dropdown',
                    ...(typeof cls === 'string' ? [cls] : cls ?? [])
                ],
                children: [
                    ...(options.children ?? []),
                    ...values.map((value, idx) => {
                        const isNode = typeof value !== 'string'
                        return create.option({
                            text: isNode ? '' : value,
                            ...innerOptions,
                            cls,
                            children: isNode && value ? [value] : null,
                            attr: {
                                ...innerOptions?.attr,
                                ...selectedIndex === idx && { selected: '' }
                            }
                        })
                    })
                ]
            }, callback)
        }

        create.icon = (options, callback) => {
            const div = createDiv()

            if (typeof options === 'string') {
                options = { icon: options }
            }

            setIcon(div, options.icon, options.size)
            const icon = div.firstChild as SVGElement

            const parent = options.parent ?? getParent?.()
            if (icon && parent) {
                if (options.prepend) {
                    parent.prepend(icon)
                } else {
                    parent.appendChild(icon)
                }
            }

            callback?.(icon)
            return icon
        }

        create.img = (options, callback) => {
            options = (typeof options === 'string' ? { cls: options } : options) ?? {}

            const {
                src=null,
                alt=null,
                width=null,
                height=null,
            } = options

            return create('img', {
                ...options,
                attr: {
                    ...src !== null && {src},
                    ...alt !== null && {alt},
                    ...width !== null && {width},
                    ...height !== null && {height},
                    referrerPolicy: 'no-referrer',
                    ...options.attr
                }
            }, callback)
        }

        create.pill = (options, callback) => {
            options = (typeof options === 'string' ? { cls: options } : options) ?? {}

            const {
                values,
                innerOptions=null
            } = options

            const innerCls = typeof innerOptions?.cls === 'string'
                ? [innerOptions.cls]
                : innerOptions?.cls ?? []

            return create.div({
                ...options,
                children: [
                    ...options.children ?? [],
                    ...values.map((value, idx) => {
                        const cls = ['mv-pill', ...innerCls]

                        if (values.length === 1) {
                            cls.push('mv-pill-single')
                        } else if (idx === 0) {
                            cls.push('mv-pill-left')
                        } else if (idx === values.length - 1) {
                            cls.push('mv-pill-right')
                        } else {
                            cls.push('mv-pill-middle')
                        }

                        const isNode = typeof value !== 'string'
                        return create.span({
                            text: isNode ? '' : value,
                            ...innerOptions,
                            cls,
                            children: isNode && value ? [value] : null,
                        })
                    })
                ]
            }, callback)
        }

        create.spinner = (options, callback) => {
            options = (typeof options === 'string' ? { cls: options } : options) ?? {}

            const {
                id=null,
                parent=null,
                cls=null,
                size: _size=null,
                stroke=null,
                color=null,
                variant='rolling'
            } = options

            if (id) {
                let existing
                for (const spinner of fishAll(`div.mv-lds[data-spinner-id="${id}"]`)) {
                    const isCopy = !parent || parent.contains(spinner)
                    if (!existing && isCopy) {
                        existing = spinner
                        continue
                    }

                    if (isCopy) spinner.detach()
                }

                if (existing) return existing as HTMLDivElement
            }

            const size = getCSSLength(_size)

            const styleColor = color ? `--mv-lds-color: ${color};` : ''
            const styleSize = size ? `--mv-lds-size: ${size};` : ''
            const styleStroke = stroke ? `--mv-lds-stroke: ${stroke};` : ''

            return create.div({
                ...options,
                cls: [
                    'mv-lds',
                    ...(typeof cls === 'string' ? [cls] : cls ?? [])
                ],
                attr: {
                    ...options.attr,
                    ...(styleColor || styleSize || styleStroke) && {
                        style: `${styleColor}${styleSize}${styleStroke}${options.attr?.style ?? ''}`
                    },
                    ...id && { ['data-spinner-id']: id }
                },
                children: [
                    create.div({
                        cls: `mv-lds-${variant}`,
                        children: [...Array(spinnerCounts[variant] ?? 1)].map(() => create.div())
                    })
                ]
            }, callback)
        }

        create.video = (options, callback) => {
            options = (typeof options === 'string' ? { cls: options } : options) ?? {}

            const {
                autoplay=false,
                controls=false,
                muted=false,
                loop=false,
                src=null,
                width=null,
                height=null,
            } = options

            return create('video', {
                ...options,
                attr: {
                    ...autoplay && {autoplay: ''},
                    ...controls && {controls: ''},
                    ...muted && {muted: ''},
                    ...loop && {loop: ''},
                    ...width !== null && {width},
                    ...height !== null && {height},
                    ...src !== null && {src},
                    referrerPolicy: 'no-referrer',
                    ...options.attr
                }
            }, callback)
        }

        Object.setPrototypeOf(create, _Creator.prototype)
        return create
    }
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
type ExcludedElements = DeprecatedElements | OverwrittenElements

export type Creator = _Creator & {
    <K extends keyof HTMLElementTagNameMap>(tag: K, options?: string | CreateOptions, callback?: (el: HTMLElementTagNameMap[K]) => void): HTMLElementTagNameMap[K]
} & Omit<{
    [K in keyof HTMLElementTagNameMap]: (options?: string | CreateOptions, callback?: (el: HTMLElementTagNameMap[K]) => void) => HTMLElementTagNameMap[K]
}, ExcludedElements>
export const Creator = _Creator as {
    new(plugin: MultiviewPlugin, parent?: HTMLElement | (() => HTMLElement), owner?: Component): Creator
}
