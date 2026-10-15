const success = (res, data = null, message = "Success", code = 200) =>
  res.status(code).json({ success: true, message, ...(data !== null && { data }) });

const created = (res, data = null, message = "Created") => success(res, data, message, 201);

const error = (res, message = "Error", code = 400, errors = null) =>
  res.status(code).json({ success: false, message, ...(errors && { errors }) });

const notFound    = (res, msg = "Not found")    => error(res, msg, 404);
const unauthorized= (res, msg = "Unauthorized") => error(res, msg, 401);
const forbidden   = (res, msg = "Forbidden")    => error(res, msg, 403);

module.exports = { success, created, error, notFound, unauthorized, forbidden };
