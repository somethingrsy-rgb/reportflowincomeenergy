const { json } = require("./_config");

// Older open browser tabs still call this endpoint after saving.
// Saving now sends the push, so acknowledge without sending a second one.
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "POST only" });
  // `sent` is a legacy acknowledgement, not a delivery receipt.
  return json(200, { ok: true, sent: true, handledByServer: true, skipped: "handled-by-queue-write" });
};
