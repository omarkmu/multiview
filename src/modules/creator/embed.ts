import { requestUrl } from 'obsidian'
import type MultiviewPlugin from '../../main'
import type { Creator } from './create'
import type { AudioOptions, EmbedOptions, ImageOptions, PDFEmbedOptions, VideoOptions, YouTubeEmbedOptions } from './types'


const youtubePattern = /^(?:https:\/\/(?:(?:youtu.be)|(?:(?:www\.)?youtube\.com))\/(?:watch\?v=)?(?:([^&?]+)(?:[&?]t=(\d+)s?)?))$/

const audioHandler: EmbedHandler = {
    match: extensionMatcher(new Set([
        'MP3',
        'WEBM',
        'WAV',
        'M4A',
        'OGG',
        '3GP',
        'FLAC'
    ])),
    handle: (embed, options) => embed.audio(options)
}
const imageHandler: EmbedHandler = {
    match: extensionMatcher(new Set([
        'PNG',
        'JPG',
        'JPEG',
        'GIF',
        'BMP',
        'SVG'
    ])),
    handle: (embed, options) => embed.img(options)
}
const videoHandler: EmbedHandler = {
    match: extensionMatcher(new Set([
        'MP4',
        'WEBM',
        'OGV'
    ])),
    handle: (embed, options) => embed.video(options)
}
const pdfHandler: EmbedHandler = {
    match: (options) => options.url.toUpperCase().endsWith('.PDF'),
    handle: (embed, options) => embed.pdf(options),
}
const youtubeHandler: EmbedHandler = {
    pattern: youtubePattern,
    handle: (embed, options, matches: RegExpMatchArray) => {
        const [, id, timestamp] = matches
        return embed.youtube({ ...options, id, timestamp })
    }
}
const typeHandlers: Record<string, EmbedHandler> = {
    audio: audioHandler,
    image: imageHandler,
    video: videoHandler,
    pdf: pdfHandler,
    youtube: youtubeHandler,
}
const embedHandlers = [
    audioHandler,
    imageHandler,
    videoHandler,
    pdfHandler,
    youtubeHandler,
]
const cssUnits = new Set([
    '%',
    'CM',
    'MM',
    'IN',
    'PX',
    'PT',
    'PC',
    'EM',
    'EX',
    'CH',
    'VW',
    'VH',
    'REM',
    'VMIN',
    'VMAX',
])


function buildStyleString(contents: Record<string, string | number>, existing: unknown) {
    const result = []

    if (existing) result.push(existing.toString())

    Object.entries(contents)
        .filter(([k, v]) => contents.hasOwnProperty(k) && v !== null && v !== undefined)
        .forEach(([k, v]) => result.push(`${k}: ${v}`))

    return result.join(';')
}

function extractURLComponents(url: string): URLComponents {
    const hash = url.lastIndexOf('#')
    if (hash !== -1) {
        return {
            url: url.slice(0, hash),
            hash: url.slice(hash),
        }
    }

    return { url }
}

export function getCSSLength(value: unknown, fallback: string=null) {
    if (!value) return fallback

    const str = value.toString()
    for (let i = 1; i < 5; i++) {
        if (str.length <= i) break

        if (cssUnits.has(str.slice(-i).toUpperCase())) {
            return str
        }
    }

    if (isNaN(parseInt(str))) return fallback
    return `${value}px`
}

function tryHandle(mod: EmbedCreator, handler: EmbedHandler, options: EmbedOptions): HTMLElement | false {
    let arg
    if (handler.pattern) {
        arg = options.url.match(handler.pattern)
        if (!arg || arg.length === 0) return false
    } else if (handler.match) {
        arg = options.url

        try {
            if (!handler.match(options)) return false
        } catch (e) {
            console.error(e)
            return false
        }
    }

    try {
        return handler.handle(mod, options, arg)
    } catch (e) {
        console.error(e)
        return false
    }
}

function trySetSource(el: { src?: string }, plugin: MultiviewPlugin, url: string, source?: string): boolean {
    const file = plugin.app.metadataCache.getFirstLinkpathDest(url ?? '', source ?? '')
    if (!file) return false

    el.src = plugin.app.vault.getResourcePath(file)
    return true
}

function extensionMatcher(supportedTypes: Set<string>) {
    return (options: EmbedOptions) => {
        const period = options.url.lastIndexOf('.')
        if (period === -1) return false

        const ext = options.url.slice(period + 1)
        return supportedTypes.has(ext.toUpperCase())
    }
}

function createPDFElements(create: Creator, options: PDFEmbedOptions): [HTMLSpanElement, HTMLIFrameElement, string] {
    const {
        url,
        hash: _hash,
        width,
        height,
        page,
        alt
    } = options

    const hash = _hash ?? (page ? `#page=${page}` : '')
    const iframe = create('iframe', {
        attr: {
            style: 'width: 100%; height: 100%',
            referrerPolicy: 'no-referrer'
        }
    })
    const span = create.span({
        ...options,
        children: [ iframe ],
        cls: [
            ...typeof options.cls === 'string' ? [options.cls] : options.cls ?? [],
            'pdf-embed'
        ],
        attr: {
            ...(options.attr ?? {}),
            style: buildStyleString({
                width: getCSSLength(width),
                height: getCSSLength(height)
            }, options.attr?.style),
            src: url,
            alt: alt ?? url,
            contenteditable: false
        }
    })

    return [span, iframe, hash]
}

async function loadPDF(plugin: MultiviewPlugin, options: PDFEmbedOptions, span: HTMLSpanElement, iframe: HTMLIFrameElement, hash: string) {
    const {
        url,
        internal,
        source
    } = options

    const onLoadOptions = { once: true }
    const onLoad = () => {
        // so the proper css applies
        span.classList.add('is-loaded', 'internal-embed')
    }

    let file
    if (internal === false || !(file = plugin.app.metadataCache.getFirstLinkpathDest(url, source ?? ''))) {
        if (internal === true) {
            onLoad()
            span.classList.add('mv-invalid-embed')
            return span
        }

        // performing a HEAD request here because PDF iframes cannot be sandboxed
        // the content-type should be checked, at least
        let response
        try {
            response = await requestUrl({ url: url + hash, method: 'HEAD' })
        } catch (e) {
            onLoad()
            span.classList.add('mv-invalid-embed')
            span.removeChild(iframe)
            return Promise.reject(e)
        }

        const contentType = response.headers?.['content-type']
        if (contentType?.toLowerCase() == 'application/pdf') {
            iframe.addEventListener('load', onLoad, onLoadOptions)
            iframe.setAttribute('src', url + hash)
        } else {
            onLoad()
            span.classList.add('mv-invalid-embed')
            span.removeChild(iframe)
        }

        return span
    }

    const path = file.path
    iframe.addEventListener('load', onLoad, onLoadOptions)

    const buf = await plugin.app.vault.adapter.readBinary(path)
    const objURL = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }))

    span.setAttribute('src', path + hash)
    span.classList.add('internal-embed')
    iframe.setAttribute('src', objURL + hash)

    return span
}


class _EmbedCreator extends Function {
    audio: (options: Omit<EmbedOptions & AudioOptions, 'src'>) => HTMLAudioElement | HTMLSpanElement
    img: (options: Omit<EmbedOptions & ImageOptions, 'src'>) => HTMLImageElement | HTMLSpanElement
    parse: (str: string) => EmbedOptions
    pdf: (options: PDFEmbedOptions) => HTMLSpanElement
    pdfAsync: (options: PDFEmbedOptions) => Promise<HTMLSpanElement>
    video: (options: Omit<EmbedOptions & VideoOptions, 'src'>) => HTMLVideoElement | HTMLSpanElement
    youtube: (options: YouTubeEmbedOptions) => HTMLSpanElement


    //@ts-ignore
    constructor(plugin: MultiviewPlugin, create: Creator) {
        const embed = ((options) => {
            if (typeof options === 'string') {
                options = embed.parse(options)
            }

            if (!options?.url) return null

            const typeHandler = typeHandlers[options.embedType]
            const seen = new Set<EmbedHandler>()
            if (typeHandler) {
                seen.add(typeHandler)
                const result = tryHandle(embed, typeHandler, options)
                if (result) return result
            }

            for (const handler of embedHandlers) {
                if (seen.has(handler)) continue

                const result = tryHandle(embed, handler, options)
                if (result) return result
            }
        }) as EmbedCreator

        embed.audio = (options) => {
            const {
                url,
                alt,
                internal,
                source,
            } = options

            const audio = create.audio({
                ...options,
                attr: {
                    ...options?.attr,
                    ...alt && {alt}
                },
                src: internal === false ? url : null
            })

            if (internal === false) return audio

            const success = trySetSource(audio, plugin, url, source)
            if (success || internal) {
                return create.span({
                    ...options,
                    children: [ audio ],
                    attr: {
                        ...alt && {alt},
                        src: url,
                        ...options?.attr,
                    },
                    cls: [
                        ...typeof options?.cls === 'string' ? [options.cls] : options?.cls ?? [],
                        'internal-embed',
                        'media-embed',
                        ...success ? ['is-loaded'] : [],
                    ]
                })
            } else if (!internal) {
                audio.src = url
            }

            return audio
        }

        embed.img = (options) => {
            const {
                url,
                internal,
                source,
                width,
                height,
                alt,
            } = options

            const image = create.img({
                ...options,
                src: internal === false ? url : null
            })

            if (internal === false) return image

            const success = trySetSource(image, plugin, url, source)
            if (success || internal) {
                return create.span({
                    ...options,
                    children: [ image ],
                    attr: {
                        ...width && {width},
                        ...height && {height},
                        ...alt && {alt},
                        src: url,
                        ...options.attr,
                    },
                    cls: [
                        ...typeof options.cls === 'string' ? [options.cls] : options.cls ?? [],
                        'internal-embed',
                        'image-embed',
                        ...success ? ['is-loaded'] : [],
                    ]
                })
            } else if (!internal) {
                image.src = url
            }

            return image
        }

        embed.parse = (str) => {
            if (!(str = str?.trim())) return null

            let url
            let hash
            let alt
            let internal

            let splitIdx
            if (str.startsWith('![[') && str.endsWith(']]')) {
                const bar = str.indexOf('|')

                if (bar === -1) {
                    ({ url, hash } = extractURLComponents(str.slice(3, -2)))

                    return {
                        url,
                        hash,
                        internal: true
                    }
                }

                url = str.slice(3, bar)
                alt = str.slice(bar + 1, -2)
                internal = true
            } else if (str.startsWith('![') && str.endsWith(')') && (splitIdx = str.indexOf('](')) !== -1) {
                url = str.slice(splitIdx + 2, -1)
                alt = str.slice(2, splitIdx)
            } else {
                ({ url, hash } = extractURLComponents(str))
                return {
                    url,
                    hash,
                    internal: (str.contains(':')) ? false : undefined
                }
            }

            ({ url, hash } = extractURLComponents(url))
            if (!internal) internal = (url.contains(':')) ? false : undefined

            let width
            let height

            const bar = alt.lastIndexOf('|')
            const checkSize = alt.slice(bar + 1)
            const xIdx = checkSize.indexOf('x')
            if (xIdx !== -1) {
                const checkWidth = checkSize.slice(0, xIdx)
                const checkHeight = checkSize.slice(xIdx + 1)

                if (!isNaN(parseInt(checkWidth)) && !isNaN(parseInt(checkHeight))) {
                    width = checkWidth
                    height = checkHeight
                    alt = bar !== -1 ? alt.slice(0, bar) : undefined
                }
            } else {
                const num = parseInt(checkSize)
                if (!isNaN(num)) {
                    width = checkSize
                    alt = bar !== -1 ? alt.slice(0, bar) : undefined
                }
            }

            return {
                url,
                hash,
                internal,
                alt,
                width,
                height
            }
        }

        embed.pdf = (options) => {
            const [span, iframe, hash] = createPDFElements(create, options)
            loadPDF(plugin, options, span, iframe, hash)

            return span
        }
        embed.pdfAsync = async (options) => {
            const [span, iframe, hash] = createPDFElements(create, options)
            return loadPDF(plugin, options, span, iframe, hash)
        }

        embed.video = (options) => {
            const {
                url,
                width,
                height,
                alt,
                internal,
                source,
            } = options

            const video = create.video({
                ...options,
                attr: {
                    ...options?.attr,
                    ...alt && {alt}
                },
                src: internal === false ? url : null
            })

            if (internal === false) return video

            const success = trySetSource(video, plugin, url, source)
            if (success || internal) {
                return create.span({
                    ...options,
                    children: [ video ],
                    attr: {
                        ...width && {width},
                        ...height && {height},
                        ...alt && {alt},
                        src: url,
                        ...options.attr,
                    },
                    cls: [
                        ...typeof options.cls === 'string' ? [options.cls] : options.cls ?? [],
                        'internal-embed',
                        'media-embed',
                        ...success ? ['is-loaded'] : [],
                    ]
                })
            } else if (!internal) {
                video.src = url
            }

            return video
        }

        embed.youtube = (options) => {
            const { width, height, alt, url } = options
            let { id, timestamp } = options

            const matches = url && url.match(youtubePattern)
            if (matches) {
                [, id, timestamp] = matches
            }

            return create.span({
                ...options,
                children: [
                    create.iframe({
                        attr: {
                            sandbox: 'allow-forms allow-presentation allow-same-origin allow-scripts allow-modals',
                            style: buildStyleString({
                                width: getCSSLength(width, '560px'),
                                height: getCSSLength(height, '315px')
                            }, options.attr?.style),
                            src: `https://www.youtube-nocookie.com/embed/${id}${timestamp ? `?start=${timestamp}`: ''}`,
                            alt: alt !== null && alt !== undefined ? alt : 'YouTube video player',
                            frameborder: '0',
                            allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
                            allowfullscreen: '',
                            referrerPolicy: 'no-referrer'
                        }
                    })
                ]
            })
        }

        Object.setPrototypeOf(embed, _EmbedCreator.prototype)
        return embed
    }
}


interface EmbedHandler {
    pattern?: RegExp
    match?: (options: EmbedOptions) => boolean,
    handle?: (mod: EmbedCreator, options: EmbedOptions, arg: RegExpMatchArray | string) => HTMLElement
}

interface URLComponents {
    url: string
    hash?: string
}

export type EmbedCreator = _EmbedCreator & {
    (options: string | EmbedOptions): HTMLElement
}
export const EmbedCreator = _EmbedCreator as {
    new(plugin: MultiviewPlugin, create: Creator): EmbedCreator
}
