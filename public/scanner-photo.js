// One in-memory photo per scanner session. Retry reuses the prepared image;
// nothing is written to the media store until the diary Add is confirmed.
export function createScannerPhoto(file, { normalize, resize }) {
  let prepared;
  const session = {
    file, normalized: null, imageDataUrl: '',
    prepare() {
      prepared ||= (async () => {
        session.normalized ||= await normalize(file);
        session.imageDataUrl ||= await resize(session.normalized.full);
        return session;
      })().catch(error => { prepared = null; throw error; });
      return prepared;
    },
  };
  return session;
}
