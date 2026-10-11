const express = require('express');
const exportService = require('../services/exportService');
const { authenticate } = require('../middleware/auth');
const { requireStaff, requireAdmin } = require('../middleware/rbac');

const router = express.Router();

// Export Bookings as Excel (.xlsx) — Staff & Admin
router.get('/bookings/excel', authenticate, requireStaff, async (req, res, next) => {
  try {
    const month = req.query.month ? parseInt(req.query.month, 10) : null;
    const year = req.query.year ? parseInt(req.query.year, 10) : null;

    const buffer = await exportService.exportBookingsExcel({ month, year });

    const filename = `bookings_report_${year || 'all'}_${month || 'all'}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// Export Bookings as PDF (.pdf) — Staff & Admin
router.get('/bookings/pdf', authenticate, requireStaff, async (req, res, next) => {
  try {
    const month = req.query.month ? parseInt(req.query.month, 10) : null;
    const year = req.query.year ? parseInt(req.query.year, 10) : null;

    const buffer = await exportService.exportBookingsPdf({ month, year });

    const filename = `bookings_report_${year || 'all'}_${month || 'all'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// Export Users as Excel (.xlsx) — Admin only
router.get('/users/excel', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const buffer = await exportService.exportUsersExcel();
    const filename = `user_management_export_${Date.now()}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// Export Users as PDF (.pdf) — Admin only
router.get('/users/pdf', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const buffer = await exportService.exportUsersPdf();
    const filename = `user_management_export_${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
