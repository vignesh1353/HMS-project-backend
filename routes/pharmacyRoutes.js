const express = require('express');
const router = express.Router();
const {
  getMedicines,
  getMedicineById,
  createMedicine,
  updateMedicine,
  updateStock,
  deleteMedicine,
} = require('../controllers/pharmacyController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

router.use(protect);

router.get('/', getMedicines);
router.get('/:id', getMedicineById);
router.post('/', authorizeRoles('admin', 'staff'), createMedicine);
router.put('/:id', authorizeRoles('admin', 'staff'), updateMedicine);
router.patch('/:id/stock', authorizeRoles('admin', 'staff'), updateStock);
router.delete('/:id', authorizeRoles('admin'), deleteMedicine);

module.exports = router;
