const express = require('express');
const router = express.Router();
const {
  getMedicineRequests,
  getMedicineRequestById,
  createMedicineRequest,
  approveMedicineRequest,
  rejectMedicineRequest,
  dispenseMedicineRequest,
  deleteMedicineRequest,
} = require('../controllers/medicineRequestController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

router.use(protect);

router.get('/', getMedicineRequests);
router.get('/:id', getMedicineRequestById);
router.post('/', createMedicineRequest);

// Administrative Approval & Dispensing Workflows
router.patch('/:id/approve', authorizeRoles('admin'), approveMedicineRequest);
router.patch('/:id/reject', authorizeRoles('admin'), rejectMedicineRequest);
router.patch('/:id/dispense', authorizeRoles('admin', 'staff'), dispenseMedicineRequest);
router.delete('/:id', authorizeRoles('admin'), deleteMedicineRequest);

module.exports = router;
