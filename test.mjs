import test from 'node:test'
import assert from 'node:assert/strict'
import { parseIssue, formSections, isPublicUrl, readPage, formatPrice, firstImage } from './lib.mjs'

const form = (o) =>
  `### Link\n\n${o.link}\n\n### Status\n\n${o.status}\n\n### Category\n\n${o.category}\n\n### Price\n\n${o.price || '_No response_'}\n\n### Note\n\n${o.note || '_No response_'}\n\n### Photo\n\n${o.photo || '_No response_'}`

test('issue form body is read section by section', () => {
  const p = parseIssue({
    title: 'Cotton throw ',
    labels: [],
    body: form({ link: 'https://shop.example/throw', status: 'Own', category: 'Live', price: '₹3,699', note: 'Warm.' }),
  })
  assert.deepEqual(
    { title: p.title, link: p.link, status: p.status, category: p.category, price: p.price, note: p.note, photo: p.photo },
    { title: 'Cotton throw', link: 'https://shop.example/throw', status: 'own', category: 'live', price: '₹3,699', note: 'Warm.', photo: '' },
  )
})

test('"No response" is treated as empty', () => {
  const f = formSections(form({ link: 'https://a.example/x', status: 'Want', category: 'Eat' }))
  assert.equal(f.price, '')
  assert.equal(f.note, '')
})

test('plain body: first line is the link, the rest is the note, labels carry status', () => {
  const p = parseIssue({
    title: 'Brush pen',
    labels: [{ name: 'own' }, { name: 'work' }],
    body: 'https://shop.example/pen\nWrites like a dream.\nBought in Kyoto.',
  })
  assert.equal(p.link, 'https://shop.example/pen')
  assert.equal(p.status, 'own')
  assert.equal(p.category, 'work')
  assert.equal(p.note, 'Writes like a dream. Bought in Kyoto.')
})

test('a label overrides the form', () => {
  const p = parseIssue({
    title: 'x',
    labels: ['own'],
    body: form({ link: 'https://a.example/x', status: 'Want', category: 'Play' }),
  })
  assert.equal(p.status, 'own')
  assert.equal(p.category, 'play')
})

test('no status anywhere means want, a body that is not a link has no link', () => {
  const p = parseIssue({ title: 'x', labels: [], body: 'just thinking about this one' })
  assert.equal(p.status, 'want')
  assert.equal(p.link, '')
})

test('a pasted photo is found in markdown and html', () => {
  assert.equal(firstImage('![img](https://github.com/user-attachments/assets/abc)'), 'https://github.com/user-attachments/assets/abc')
  assert.equal(firstImage('<img width="1" src="https://github.com/user-attachments/assets/def" />'), 'https://github.com/user-attachments/assets/def')
  assert.equal(firstImage('![img](http://insecure.example/a.png)'), '')
})

test('private and non-web urls are refused', () => {
  for (const bad of ['http://localhost/x', 'http://127.0.0.1/x', 'http://169.254.169.254/latest', 'http://[::1]/x', 'file:///etc/passwd', 'http://intranet/x', 'http://svc.internal/x', 'ftp://a.example/x', 'not a url'])
    assert.equal(isPublicUrl(bad), false, bad)
  for (const ok of ['https://www.muji.com/p/1', 'http://shop.example.co.uk/a?b=1']) assert.equal(isPublicUrl(ok), true, ok)
})

test('picture and price come from the page head, relative urls resolved', () => {
  const html = `<head><meta property="og:image" content="/img/a&amp;b.jpg"><meta property="product:price:amount" content="1,344.50"><meta property="product:price:currency" content="usd"></head>`
  assert.deepEqual(readPage(html, 'https://shop.example/p/1'), { image: 'https://shop.example/img/a&b.jpg', price: '$1,344.50' })
})

test('content before property, twitter fallback, no price', () => {
  const html = `<meta content="https://cdn.example/t.png" name="twitter:image">`
  assert.deepEqual(readPage(html, 'https://shop.example/'), { image: 'https://cdn.example/t.png', price: '' })
})

test('prices format, unknown currencies keep their code, nonsense is dropped', () => {
  assert.equal(formatPrice('3699', 'INR'), '₹3,699')
  assert.equal(formatPrice('16', 'USD'), '$16')
  assert.equal(formatPrice('120', 'CHF'), 'CHF 120')
  assert.equal(formatPrice('free', 'USD'), '')
  assert.equal(formatPrice('0', 'USD'), '')
})
