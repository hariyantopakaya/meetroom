function errorHandler(err, req, res, next) {
  if (err.name === 'ZodError') {
    const errorDetails = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    return res.status(400).json({
      error: `Validation error: ${errorDetails}`,
      details: err.errors,
    });
  }

  const statusCode = err.statusCode || 500;
  if (statusCode >= 500) console.error('[SERVER ERROR]', err.code || err.name || 'Unknown error');
  const message = statusCode >= 500 ? 'Internal Server Error' : (err.message || 'Request failed');

  res.status(statusCode).json({
    error: message,
  });
}

module.exports = errorHandler;
