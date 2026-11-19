/**
 * Builds api.json from the issues in this repo.
 *
 * One issue per object. The link is read once for a picture and a price, and
 * the result is kept in api.json, so a run only visits links it has not seen.
 * A picture found on the link wins; a photo pasted into the issue is the
 * fallback for pages that have none.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { parseIssue, isPublicUrl, readPage, isGenericImage } from './lib.mjs'

const [OWNER, NAME] = (process.env.GITHUB_REPOSITORY || 'bhaumikmistry/materials').split('/')
const TOKEN = process.env.GITHUB_TOKEN
const FETCH_TIMEOUT_MS = 15000
const UA = 'Mozilla/5.0 (compatible; materials-bot; +https://materials.bhaumikmistry.com)'

if (!TOKEN) {
  console.error('Missing GITHUB_TOKEN')
  process.exit(1)
}

async function gh(endpoint) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
  return res.json()
}

async function allIssues() {
  let all = []
  for (let page = 1; ; page++) {
    const batch = await gh(`/repos/${OWNER}/${NAME}/issues?state=all&per_page=100&page=${page}`)
    if (!batch.length) return all
    all = all.concat(batch)
  }
}

/** Follows redirects by hand so every hop is checked, not only the first. */
async function fetchPage(url) {
  let current = url
  for (let hop = 0; hop < 5; hop++) {
    if (!isPublicUrl(current)) throw new Error(`refusing ${current}`)
    const res = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).toString()
      continue
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    // The head is all that is read, so a huge page costs nothing.
    return { html: (await res.text()).slice(0, 400_000), url: current }
  }
  throw new Error('too many redirects')
}

function previous() {
  if (!existsSync('api.json')) return new Map()
  try {
    return new Map(JSON.parse(readFileSync('api.json', 'utf8')).map((o) => [o.id, o]))
  } catch {
    return new Map()
  }
}

async function main() {
  const before = previous()
  // Anyone can open an issue on a public repo. Only the owner's become objects.
  const issues = (await allIssues()).filter((i) => !i.pull_request && i.user?.login === OWNER)
  console.log(`Found ${issues.length} issues from ${OWNER}`)

  const objects = []
  let visited = 0
  for (const issue of issues) {
    const p = parseIssue(issue)
    const old = before.get(issue.number)
    const sameLink = old && old.link === p.link

    // A cached picture that is now known to be generic is dropped, and the link read again.
    const staleGeneric = Boolean(sameLink && isGenericImage(old.image))
    let image = sameLink && old.imageSource === 'link' && !staleGeneric ? old.image : ''
    let price = p.price || (sameLink ? old.scrapedPrice || '' : '')
    let scrapedPrice = sameLink ? old.scrapedPrice || '' : ''
    // Only a link that was actually read counts as seen, so a page that was
    // down on one run is tried again on the next.
    let checked = Boolean(sameLink && old.checked && !staleGeneric)

    if (p.link && isPublicUrl(p.link) && !checked) {
      visited++
      try {
        const { html, url } = await fetchPage(p.link)
        const page = readPage(html, url)
        image = page.image
        scrapedPrice = page.price
        checked = true
        if (!p.price) price = page.price
      } catch (e) {
        console.log(`  #${issue.number} ${p.link}: ${e.message}`)
      }
    }

    const imageSource = image ? 'link' : p.photo ? 'photo' : ''
    objects.push({
      id: issue.number,
      title: p.title,
      link: p.link,
      domain: p.link ? new URL(p.link).hostname.replace(/^www\./, '') : '',
      status: p.status,
      category: p.category,
      price,
      scrapedPrice,
      note: p.note,
      image: image || p.photo,
      imageSource,
      checked,
      createdAt: issue.created_at,
    })
  }

  objects.sort((a, b) => {
    const d = new Date(b.createdAt) - new Date(a.createdAt)
    return d !== 0 ? d : b.id - a.id
  })

  writeFileSync('api.json', JSON.stringify(objects, null, 2) + '\n')
  const count = (k, v) => objects.filter((o) => o[k] === v).length
  console.log(`Wrote api.json: ${objects.length} objects (${count('status', 'own')} own, ${count('status', 'want')} want)`)
  console.log(`  ${visited} links visited, ${objects.filter((o) => !o.image).length} without a picture`)
  const uncategorised = objects.filter((o) => !o.category).length
  if (uncategorised) console.log(`  ${uncategorised} without a category`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
