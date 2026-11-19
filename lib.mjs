/**
 * Everything index.mjs needs that can be tested without the network: reading
 * an issue body, turning scraped meta tags into an image and a price, and
 * deciding whether a URL is safe to fetch from a CI runner.
 */

export const CATEGORIES = ['live', 'work', 'play', 'eat', 'wear', 'care']
export const STATUSES = ['own', 'want']

const NO_RESPONSE = /^_?no response_?$/i

/**
 * An issue form renders its answers as `### Label` headings, each followed by
 * the value. Returns them keyed by lower cased label.
 */
export function formSections(body) {
  const out = {}
  const parts = (body || '').split(/^###\s+/m).slice(1)
  for (const part of parts) {
    const nl = part.indexOf('\n')
    const label = (nl === -1 ? part : part.slice(0, nl)).trim().toLowerCase()
    const value = (nl === -1 ? '' : part.slice(nl + 1)).trim()
    out[label] = NO_RESPONSE.test(value) ? '' : value
  }
  return out
}

/** First image in a body, markdown or html, as an https url. */
export function firstImage(text) {
  const md = /!\[[^\]]*\]\((https:\/\/[^)\s]+)/.exec(text || '')
  if (md) return md[1]
  const html = /<img[^>]+src="(https:\/\/[^"]+)"/.exec(text || '')
  return html ? html[1] : ''
}

/**
 * Reads an issue into an object. Two shapes are accepted.
 *
 * The issue form: sections named Link, Status, Category, Price, Note, Photo.
 *
 * Plain, for adding something from a phone shortcut: first line is the link,
 * the rest is the note. Status and category then come from labels.
 *
 * Labels win over the form when both are present, because changing a label is
 * the quickest edit there is, and it should not need the body touched too.
 */
export function parseIssue(issue) {
  const body = issue.body || ''
  const labels = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name).toLowerCase())
  const f = formSections(body)
  const isForm = 'link' in f

  let link = ''
  let note = ''
  if (isForm) {
    link = f.link || ''
    note = f.note || ''
  } else {
    const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)
    link = lines[0] || ''
    note = lines.slice(1).join(' ')
  }
  link = /^https?:\/\//i.test(link) ? link.split(/\s/)[0] : ''

  const status =
    STATUSES.find((s) => labels.includes(s)) ||
    STATUSES.find((s) => s === (f.status || '').toLowerCase()) ||
    'want'
  const category =
    CATEGORIES.find((c) => labels.includes(c)) ||
    CATEGORIES.find((c) => c === (f.category || '').toLowerCase()) ||
    ''

  return {
    title: issue.title.trim(),
    link,
    status,
    category,
    price: (f.price || '').trim(),
    note,
    photo: firstImage(f.photo) || firstImage(body),
  }
}

/**
 * Only http(s) to a public looking host. The runner fetches whatever link an
 * issue carries, so a literal IP, localhost or an internal name must never get
 * that far. This is a first filter on the text; index.mjs also refuses to
 * follow a redirect to somewhere this would have refused.
 */
export function isPublicUrl(raw) {
  let u
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  const h = u.hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false
  if (!h.includes('.')) return false
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return false
  return true
}

function metaContent(html, names) {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]*>|<meta[^>]+content=["'][^"']*["'][^>]+(?:property|name)=["']${name}["'][^>]*>`,
      'i',
    )
    const tag = re.exec(html)
    if (!tag) continue
    const c = /content=["']([^"']*)["']/i.exec(tag[0])
    if (c && c[1].trim()) return decode(c[1].trim())
  }
  return ''
}

function decode(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

const SYMBOL = { USD: '$', INR: '₹', JPY: '¥', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$' }

export function formatPrice(amount, currency) {
  const n = Number(String(amount).replace(/,/g, ''))
  if (!isFinite(n) || n <= 0) return ''
  const sym = SYMBOL[(currency || '').toUpperCase()]
  const digits = n % 1 === 0 ? 0 : 2
  const num = n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: 2 })
  if (sym) return `${sym}${num}`
  return currency ? `${currency.toUpperCase()} ${num}` : ''
}

/**
 * Some stores answer a script with their logo or a stock placeholder in place
 * of the product. Amazon does it with a share icon. A picture like that is no
 * picture, so it is refused and the photo pasted into the issue takes over.
 */
const GENERIC_IMAGES = [/\/share-icons\//i, /\/previewdoh\//i, /\/amazon-logo/i, /\/placeholder/i, /\/default[-_]?image/i]
export function isGenericImage(url) {
  return GENERIC_IMAGES.some((re) => re.test(url || ''))
}

/** What a product page says about itself: a picture and, if it shares one, a price. */
export function readPage(html, pageUrl) {
  let image = metaContent(html, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'])
  if (image) {
    try {
      image = new URL(image, pageUrl).toString()
    } catch {
      image = ''
    }
  }
  const amount = metaContent(html, ['product:price:amount', 'og:price:amount'])
  const currency = metaContent(html, ['product:price:currency', 'og:price:currency'])
  const ok = /^https?:\/\//.test(image) && !isGenericImage(image)
  return { image: ok ? image : '', price: amount ? formatPrice(amount, currency) : '' }
}
