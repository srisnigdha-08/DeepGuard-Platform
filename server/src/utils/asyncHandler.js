// WHY asyncHandler?
// Without it, async errors in Express route handlers crash the server silently.
// This wrapper forwards rejections to Express error middleware automatically.
const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { asyncHandler };
