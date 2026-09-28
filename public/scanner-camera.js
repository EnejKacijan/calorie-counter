// A pending permission request cannot be aborted. Its eventual stream must still
// be stopped if the scanner has closed or changed mode in the meantime.
export async function cameraPermissionState(navigatorLike) {
  if (!navigatorLike?.permissions?.query) return "unsupported";
  try {
    const { state } = await navigatorLike.permissions.query({ name: "camera" });
    return ["granted", "prompt", "denied"].includes(state) ? state : "unsupported";
  } catch { return "unsupported"; }
}

export function createScannerCamera(video, mediaDevices, onState = () => {}) {
  let generation = 0;
  function stop() {
    generation++;
    video.srcObject?.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    video.hidden = true;
  }
  async function start() {
    stop();
    const token = generation;
    if (!mediaDevices?.getUserMedia) {
      const error = new Error("Camera unavailable. Take or choose a photo below.");
      error.name = "CameraUnsupportedError";
      onState({ phase: "unsupported", errorName: error.name });
      throw error;
    }
    onState({ phase: "requesting", request: "pending" });
    let stream;
    try { stream = await mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } }); }
    catch (error) {
      if (token === generation) onState({ phase: "error", request: "rejected", errorName: error.name || "Error" });
      throw error;
    }
    if (token !== generation) { stream.getTracks().forEach(track => track.stop()); return false; }
    onState({ phase: "playing", request: "resolved" });
    try {
      video.srcObject = stream;
      video.muted = true;
      video.hidden = false;
      await video.play();
      // A successful play promise alone is not a capturable frame.
      if (token === generation && video.readyState !== undefined && (!video.videoWidth || video.readyState < 2)) {
        const error = new Error("The camera preview did not become ready."); error.name = "CameraPreviewError"; throw error;
      }
    } catch (error) {
      if (token === generation) {
        if (video.srcObject !== stream) stream.getTracks().forEach(track => track.stop());
        stop(); onState({ phase: "play-error", request: "resolved", errorName: error.name || "Error" });
      }
      throw error;
    }
    if (token === generation) onState({ phase: "ready", request: "resolved", errorName: "" });
    return token === generation;
  }
  return { start, stop };
}
