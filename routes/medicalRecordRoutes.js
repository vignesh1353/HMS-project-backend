const express = require('express');
const router = express.Router();
const {
  getMedicalRecords,
  getMedicalRecordById,
  createMedicalRecord,
  updateMedicalRecord,
  deleteMedicalRecord,
} = require('../controllers/medicalRecordController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

router.use(protect);

router.get('/', getMedicalRecords);
router.get('/:id', getMedicalRecordById);
router.post('/', authorizeRoles('admin', 'doctor'), createMedicalRecord);
router.put('/:id', authorizeRoles('admin', 'doctor'), updateMedicalRecord);
router.delete('/:id', authorizeRoles('admin'), deleteMedicalRecord);

module.exports = router;
