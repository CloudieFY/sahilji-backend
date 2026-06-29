module.exports = function requireAdmin(req, res, next) {
  try {
    const role = String(req.get('x-user-role') || req.headers['x-user-role'] || '')
      .trim()
      .toLowerCase();
    const updateKeys = Object.keys(req.body || {});
    const isEmployeeReadyUpdate =
      role === 'employee' &&
      req.method === 'PATCH' &&
      req.originalUrl.startsWith('/api/rentals') &&
      updateKeys.length > 0 &&
      updateKeys.every(key => ['remarkCompleted', 'remarkConfirmedBy'].includes(key));

    const isEmployeeRentalUpdate =
      role === 'employee' &&
      req.method === 'PATCH' &&
      req.originalUrl.startsWith('/api/rentals');
      
    const canUserAddInventory =
      ['employee', 'reception'].includes(role) &&
      req.method === 'POST' &&
      req.originalUrl.startsWith('/api/items');

    console.info('[auth] requireAdmin check', {
      method: req.method,
      path: req.originalUrl,
      role: role || '(missing)',
      updateKeys,
      isEmployeeReadyUpdate,
      isEmployeeRentalUpdate,
      canUserAddInventory,
    });

    if (isEmployeeReadyUpdate || isEmployeeRentalUpdate || canUserAddInventory) {
      return next();
    }

    if (role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    next();
  } catch (err) {
    return res.status(403).json({ error: 'Admin only' });
  }
};
