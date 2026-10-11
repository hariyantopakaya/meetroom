function errorHandler(err, req, res, next) {
  console.error('[SERVER ERROR]', err);

  if (err.name === 'ZodError') {
    const errorDetails = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    return res.status(400).json({
      error: `Validation error: ${errorDetails}`,
      details: err.errors,
    });
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: message,
  });
}

module.exports = errorHandler;
