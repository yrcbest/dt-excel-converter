/**
 * Parse NSLOCTEXT("package", "key", "source") format.
 * Returns null if value doesn't match.
 */
export function parseNSLocText(value) {
    if (!value.startsWith('NSLOCTEXT('))
        return null;
    const inner = value.slice(10, -1).trim();
    const parts = [];
    let i = 0;
    while (i < inner.length && parts.length < 3) {
        if (inner[i] === '"') {
            i++;
            let s = '';
            while (i < inner.length && inner[i] !== '"') {
                s += inner[i];
                i++;
            }
            i++;
            parts.push(s);
        }
        else if (inner[i] === ',' || inner[i] === ' ' || inner[i] === '\t') {
            i++;
        }
        else {
            break;
        }
    }
    if (parts.length < 2)
        return null;
    return { pkg: parts[0], key: parts[1], source: parts[2] ?? '' };
}
export function buildNSLocText(pkg, key, source) {
    return `NSLOCTEXT("${pkg}", "${key}", "${source}")`;
}
