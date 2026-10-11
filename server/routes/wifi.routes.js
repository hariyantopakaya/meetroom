const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/rbac');
const wifiService = require('../services/wifiService');

const router = express.Router();
router.use(authenticate, requireAdmin);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.get('/:month', async (req, res, next) => {
  try {
    res.json({ setting: await wifiService.getMonthlySetting(req.params.month) });
  } catch (error) { next(error); }
});

router.put('/:month', async (req, res, next) => {
  try {
    const setting = await wifiService.saveMonthlySetting(req.params.month, req.body);
    res.json({ message: 'Wi-Fi bulanan disimpan. Semua voucher pada bulan ini memakai pengaturan yang sama.', setting });
  } catch (error) { next(error); }
});

module.exports = router;
