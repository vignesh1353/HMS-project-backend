const express = require('express');
const router = express.Router();
const {
  getMedicalReports,
  getMedicalReportById,
  createMedicalReport,
  submitMedicalReport,
  updateMedicalReport,
  approveMedicalReport,
  rejectMedicalReport,
  generateReportPdf,
  deleteMedicalReport,
} = require('../controllers/medicalReportController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

router.use(protect);

router.get('/', getMedicalReports);
router.get('/:id/pdf', generateReportPdf);
router.get('/:id', getMedicalReportById);

router.post('/', authorizeRoles('doctor', 'admin'), createMedicalReport);
router.post('/:id/submit', authorizeRoles('doctor', 'admin'), submitMedicalReport);
router.put('/:id', authorizeRoles('doctor', 'admin'), updateMedicalReport);

// Administrative Approval Workflows
router.patch('/:id/approve', authorizeRoles('admin'), approveMedicalReport);
router.patch('/:id/reject', authorizeRoles('admin'), rejectMedicalReport);
router.delete('/:id', authorizeRoles('admin'), deleteMedicalReport);

module.exports = router;
