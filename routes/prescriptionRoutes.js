const express = require('express');
const router = express.Router();
const {
  getPrescriptions,
  getPrescriptionById,
  createPrescription,
  approvePrescription,
  rejectPrescription,
  updatePrescription,
  deletePrescription,
} = require('../controllers/prescriptionController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

router.use(protect);

router.get('/', getPrescriptions);
router.get('/:id', getPrescriptionById);
router.post('/', authorizeRoles('admin', 'doctor'), createPrescription);
router.patch('/:id/approve', authorizeRoles('admin'), approvePrescription);
router.patch('/:id/reject', authorizeRoles('admin'), rejectPrescription);
router.put('/:id', authorizeRoles('admin', 'doctor'), updatePrescription);
router.delete('/:id', authorizeRoles('admin'), deletePrescription);

module.exports = router;

