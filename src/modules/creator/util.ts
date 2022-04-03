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
