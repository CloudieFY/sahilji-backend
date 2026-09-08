const { resolveAuth } = require('./auth');

/**
 * Authorisation gate for mutating endpoints.
 *
 *   admin      -> everything
 *   reception  -> manage clients, rentals and inventory (front-desk workflow)
 *   employee   -> only rental readiness / dryclean / delivery-status updates,
 *                 plus adding inventory
 */
module.exports = function requireAdmin(req, res, next) {
  try {
    const { role } = resolveAuth(req);
    const path = req.originalUrl || req.url || '';
    const method = req.method;
    const updateKeys = Object.keys(req.body || {});

    if (role === 'admin') return next();

    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    // Reception desk: full CRUD on clients / rentals / inventory.
    const receptionAllowed =
      role === 'reception' &&
      isMutation &&
      (path.startsWith('/api/customers') ||
        path.startsWith('/api/rentals') ||
        path.startsWith('/api/items'));

    // Employees may add inventory.
    const employeeAddInventory =
      role === 'employee' && method === 'POST' && path.startsWith('/api/items');

    // Employees may update rental readiness / dryclean / delivery status.
    const employeeRentalUpdate =
      role === 'employee' && method === 'PATCH' && path.startsWith('/api/rentals');

    console.info('[auth] requireAdmin check', {
      method,
      path,
      role: role || '(missing)',
      updateKeys,
      receptionAllowed,
      employeeAddInventory,
      employeeRentalUpdate,
    });

    if (receptionAllowed || employeeAddInventory || employeeRentalUpdate) {
      return next();
    }

    return res.status(403).json({ error: 'Not authorised for this action' });
  } catch (err) {
    return res.status(403).json({ error: 'Not authorised for this action' });
  }
};
