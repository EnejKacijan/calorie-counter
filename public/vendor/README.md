# Barcode decoder

`zxing-browser-0.2.1.min.js` is the unchanged UMD distribution from `@zxing/browser` 0.2.1, installed with npm. It is loaded only when a barcode photo is decoded. It makes no image-upload requests.

Sources and documentation: https://github.com/zxing-js/browser and https://github.com/zxing-js/library.

The browser layer is MIT-licensed (`ZXING-LICENSE`); the bundled decoding library is Apache-2.0-licensed (`ZXING-LIBRARY-LICENSE`). The text-encoding dependency's notice is included as `ZXING-TEXT-ENCODING-LICENSE`. Keep these licenses when redistributing the app. Update the vendored distribution together with its pinned npm dependency and rerun `scripts/package-scan-qa.mjs`.
