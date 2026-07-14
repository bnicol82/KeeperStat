// Wraps a route handler so an unhandled error (DB constraint violation,
// connection hiccup, etc.) becomes a clean 500 instead of a raw stack trace
// leaking to the client.
export function withErrorHandling(handler) {
  return async function wrapped(req, res) {
    try {
      return await handler(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
    }
  };
}
