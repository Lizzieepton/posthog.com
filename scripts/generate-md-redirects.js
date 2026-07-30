#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-var-requires */

/**
 * Mirror every literal /docs/ redirect onto its `.md` sibling.
 *
 * Docs `.md` files are separate files from the HTML pages, and vercel.json
 * matches redirects literally — so `/docs/a/b` never covers `/docs/a/b.md`,
 * and moved pages 404 there. Splat sources already match both.
 *
 * Idempotent. Re-run after adding redirects and commit the result.
 *
 *   node scripts/generate-md-redirects.js          # rewrite vercel.json
 *   node scripts/generate-md-redirects.js --check  # exit 1 if out of date
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
