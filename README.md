# materials

Things I own and things I want. Each one is an issue in this repo. A workflow
turns them into [`api.json`](api.json), which
[materials.bhaumikmistry.com](https://materials.bhaumikmistry.com) reads
directly, so adding an object needs no deploy.

## Adding one

Open a new issue and pick **Object**. The title is the name.

| Field | |
|---|---|
| Link | Required. The picture and, when the page shares one, the price are read from here. |
| Status | Own or Want. |
| Category | Live, Work, Play, Eat, Wear or Care. |
| Price | Optional. Wins over a price found on the page. Write it as it should show. |
| Note | Optional. A line on why. |
| Photo | Optional. Drag an image in. Only used when the link has no picture. |

From a phone, a plain issue works too: the first line of the body is the link,
the rest is the note, and the `own` / `want` and category labels carry the
rest. A label always wins over the form, so changing one is the whole edit.

## Rules

- Only issues opened by the repo owner show up. Anyone can open an issue on a
  public repo, and none of them should appear on the site.
- Open or closed makes no difference, both show. To remove an object, delete
  the issue.
- A link is read once. Edit the link to read it again.
- Links to localhost, private addresses and non-web schemes are never fetched.

## Development

```
node --test test.mjs
GITHUB_TOKEN=$(gh auth token) node index.mjs
```

`lib.mjs` has the parsing and page reading, `index.mjs` talks to GitHub and the
web.
