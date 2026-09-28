# Fonts in this directory

Both files are the `latin` subsets published by Google Fonts, byte-identical to
what `next/font/google` was downloading at build time before they were committed
here. They are kept in the repository so that `next build` does not depend on
fonts.googleapis.com answering — see the comment in `../layout.tsx`.

| File                             | Family             | Axis         | Version |
| -------------------------------- | ------------------ | ------------ | ------- |
| `cormorant-garamond-latin.woff2` | Cormorant Garamond | wght 300–700 | v21     |
| `inter-latin.woff2`              | Inter              | wght 100–900 | v20     |

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

Note that neither family's latin subset contains the rupee sign (U+20B9), so it
renders from the fallback stack. That was equally true of the Google-hosted
subsets and is not a consequence of self-hosting.
