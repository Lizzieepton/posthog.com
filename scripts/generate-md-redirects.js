#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-var-requires */

/**
 * Generate `.md` twins for docs redirects.
 *
 * Every docs page is served twice: the HTML route, and a `.md` sibling written
 * by `generateRawMarkdownPages()` (gatsby/rawMarkdownUtils.ts) from the built
 * HTML. They are separate files on disk.
 *
 * Redirects in vercel.json are matched against literal paths, so a redirect
 * written for `/docs/a/b` never matches `/docs/a/b.md`. When a page moves, the
 * HTML redirects correctly and the `.md` 404s — silently, because nothing
 * renders a `.md` page for a human to notice.
 *
 * Splat sources like `/docs/llm-analytics/:path*` do match `.md` (a `.` is an
 * ordinary character inside a path segment), which is why some moves survive
 * and others don't. This script closes the gap for the literal ones.
 *
 * Idempotent — re-run it after adding redirects and commit the result.
 *
 * Usage:
 *   node scripts/generate-md-redirects.js          # rewrite vercel.json
 *   node scripts/generate-md-redirects.js --check  # exit 1 if out of date (CI)
 */

const fs = require('fs')
const path = require('path')

const VERCEL_JSON = path.join(__dirname, '..', 'vercel.json')

// A source we can safely mirror: a literal /docs/ path with no pattern syntax.
// Sources containing ':' or '*' already match the .md form on their own.
const isLiteralDocsPath = (value) =>
    typeof value === 'string' &&
    value.startsWith('/docs/') &&
    !value.includes(':') &&
    !value.includes('*') &&
    !value.includes('#') &&
    !value.includes('?') &&
    !value.endsWith('.md')

/**
 * Mirror every literal /docs/ redirect onto its .md sibling.
 *
 * Twins are inserted directly after their original so the pair stays together
 * in review, and so relative ordering is preserved — Vercel matches in array
 * order, and a source and its .md form can never both match one request.
 *
 * Chains keep working: because every link in a chain gets a twin, a .md request
 * follows exactly the same hops its HTML counterpart does.
 */
function withMarkdownTwins(redirects) {
    const existingSources = new Set(redirects.map((r) => r.source))
    const out = []

    for (const redirect of redirects) {
        out.push(redirect)

        const { source, destination } = redirect
        if (!isLiteralDocsPath(source)) continue
        // Only mirror when the target is itself a docs page, so a .md sibling
        // plausibly exists. Redirects out to /pricing or an external URL are
        // left alone — appending .md there would invent a path.
        if (!isLiteralDocsPath(destination)) continue

        const mdSource = `${source}.md`
        if (existingSources.has(mdSource)) continue
        existingSources.add(mdSource)

        out.push({ ...redirect, source: mdSource, destination: `${destination}.md` })
    }

    return out
}

function main() {
    const check = process.argv.includes('--check')
    const raw = fs.readFileSync(VERCEL_JSON, 'utf8')
    const config = JSON.parse(raw)

    const before = config.redirects.length
    config.redirects = withMarkdownTwins(config.redirects)
    const added = config.redirects.length - before

    // Match the file's existing formatting (4-space indent, trailing newline).
    const next = `${JSON.stringify(config, null, 4)}\n`

    if (check) {
        if (next !== raw) {
            console.error(
                `vercel.json is missing ${added} .md redirect twin(s).\n` +
                    'Run: node scripts/generate-md-redirects.js'
            )
            process.exit(1)
        }
        console.log('vercel.json .md redirect twins are up to date.')
        return
    }

    fs.writeFileSync(VERCEL_JSON, next)
    console.log(`Added ${added} .md redirect twin(s) (${before} → ${config.redirects.length}).`)
}

main()
