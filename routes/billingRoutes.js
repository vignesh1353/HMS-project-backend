const express = require('express');
const router = express.Router();
const {
  getBills,
  getBillById,
  createBill,
  updateBill,
  updatePaymentStatus,
  approveBill,
  deleteBill,
} = require('../controllers/billingController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

router.use(protect);

router.get('/', getBills);
router.get('/:id', getBillById);
router.post('/', authorizeRoles('admin', 'staff'), createBill);
router.put('/:id', authorizeRoles('admin', 'staff'), updateBill);
router.patch('/:id/payment-status', authorizeRoles('admin', 'staff'), updatePaymentStatus);
router.patch('/:id/approve', authorizeRoles('admin', 'staff'), approveBill);
router.delete('/:id', authorizeRoles('admin'), deleteBill);

module.exports = router;
