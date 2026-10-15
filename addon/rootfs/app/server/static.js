/**
 * Serves the built client, rewritten for whatever path it is reached on.
 *
 * Ingress gives every session its own prefix — /api/hassio_ingress/<token>/ —
 * and strips it before proxying, so this process always sees plain "/". A
 * bundle built with absolute asset paths would therefore ask for /assets/x.js
 * at the *Home Assistant* root and 404.
 *
 * The fix is the one the Home Plot Tracker uses: the client is built with
 * relative URLs, and index.html gets a <base href> matching the prefix the
 * request actually arrived on, read from X-Ingress-Path. The header is absent
 * outside ingress, where the base is simply "/" and nothing changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
/** Only ever a path, never a scheme or host, so it cannot redirect elsewhere. */
function ingressBase(req, fallback) {
    const header = req.header('x-ingress-path');
    if (!header || !header.startsWith('/') || header.startsWith('//')) {
        return fallback === '' ? '/' : `${fallback}/`;
    }
    return header.endsWith('/') ? header : `${header}/`;
}
/**
 * Replaces the <base> tag, or inserts one if the document has none.
 *
 * HTML comments are masked out first. A comment that merely *mentions*
 * `<base href>` — the one in index.html explaining this very mechanism — is
 * otherwise matched ahead of the real tag, which then goes un-rewritten and
 * every asset 404s under ingress.
 */
function withBaseHref(html, base) {
    const tag = `<base href="${base}">`;
    const comments = [];
    const masked = html.replace(/<!--[\s\S]*?-->/g, (match) => {
        comments.push(match);
        return `\u0000c${comments.length - 1}\u0000`;
    });
    const rewritten = /<base\s[^>]*>/i.test(masked)
        ? masked.replace(/<base\s[^>]*>/i, tag)
        : masked.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n    ${tag}`);
    return rewritten.replace(/\u0000c(\d+)\u0000/g, (_, index) => comments[Number(index)]);
}
export function mountClient(app, clientDir, basePath) {
    const indexFile = path.join(clientDir, 'index.html');
    if (!fs.existsSync(indexFile)) {
        return { mounted: false, reason: `no index.html in ${clientDir}` };
    }
    const mountAt = basePath === '' ? '/' : basePath;
    // Hashed assets are immutable; index.html must never be cached or a stale
    // one would keep pointing at bundles that no longer exist after an update.
    app.use(mountAt, express.static(clientDir, {
        index: false,
        maxAge: '1y',
        immutable: true,
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html')) {
                res.setHeader('Cache-Control', 'no-store');
            }
        },
    }));
    // Everything else is a client route; hand back index.html and let the router
    // sort it out. Express 5 needs a named wildcard rather than a bare '*'.
    app.get(`${basePath}/*splat`, (req, res, next) => {
        if (req.path.startsWith(`${basePath}/api/`)) {
            next();
            return;
        }
        const html = fs.readFileSync(indexFile, 'utf8');
        res.setHeader('Cache-Control', 'no-store');
        res.type('html').send(withBaseHref(html, ingressBase(req, basePath)));
    });
    app.get(mountAt, (req, res) => {
        const html = fs.readFileSync(indexFile, 'utf8');
        res.setHeader('Cache-Control', 'no-store');
        res.type('html').send(withBaseHref(html, ingressBase(req, basePath)));
    });
    return { mounted: true };
}
export const __testing = { withBaseHref, ingressBase };
//# sourceMappingURL=static.js.map