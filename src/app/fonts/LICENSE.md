# Fonts in this directory

Both files are the `latin` subsets published by Google Fonts, byte-identical to
what `next/font/google` was downloading at build time before they were committed
here. They are kept in the repository so that `next build` does not depend on
fonts.googleapis.com answering — see the comment in `../layout.tsx`.

| File                             | Family             | Axis         | Version | Contents     |
| -------------------------------- | ------------------ | ------------ | ------- | ------------ |
| `cormorant-garamond-latin.woff2` | Cormorant Garamond | wght 300–700 | v21     | latin subset |
| `inter-latin.woff2`              | Inter              | wght 100–900 | v20     | latin subset |
| `cormorant-garamond-rupee.woff2` | Cormorant Garamond | wght 300–700 | v21     | U+20B9 only  |
| `inter-rupee.woff2`              | Inter              | wght 100–900 | v20     | U+20B9 only  |

The two `-rupee` files exist because neither family's latin subset contains the
rupee sign, so every price on the site was set in two typefaces — digits in
Inter, ₹ in whatever the system offered. They hold one glyph each and lead the
font stacks, supplying ₹ and falling through for everything else.

Both are licensed under the **SIL Open Font License, Version 1.1**, which
permits redistribution, including bundled in a repository and served from our own
domain. Neither font may be sold on its own, and neither may be released under
any other licence. The full text is at <https://openfontlicense.org>.

- Cormorant Garamond — Copyright 2015 The Cormorant Project Authors
  (<https://github.com/CatharsisFonts/Cormorant>)
- Inter — Copyright 2016 The Inter Project Authors
  (<https://github.com/rsms/inter>)

## Replacing or updating one

Fetch the stylesheet for the family, take the `src` URL under the `/* latin */`
comment, and download that file:

```
curl -A "Mozilla/5.0" "https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap"
```

Then check the weight axis of what you actually got, rather than assuming the
range in `layout.tsx` still holds:

```
python3 -c "from fontTools.ttLib import TTFont; f=TTFont('inter-latin.woff2'); \
print([(a.axisTag,a.minValue,a.maxValue) for a in f['fvar'].axes])"
```

A glyph the latin subset lacks needs its own file, the way ₹ did. Google will
subset to an exact string, which is how those two were made:

```
curl -A "Mozilla/5.0" --get \
  --data-urlencode "family=Inter:wght@100..900" \
  --data-urlencode "text=₹" \
  "https://fonts.googleapis.com/css2"
```

Check what came back actually contains it, rather than trusting the request:

```
python3 -c "from fontTools.ttLib import TTFont; \
print(0x20B9 in TTFont('inter-rupee.woff2').getBestCmap())"
```
