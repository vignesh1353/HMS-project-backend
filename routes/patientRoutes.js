const express = require('express');
const router = express.Router();
const {
  getPatients,
  getPatientById,
  getMyProfile,
  updateMyProfile,
  createPatient,
  updatePatient,
  deletePatient,
} = require('../controllers/patientController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

router.use(protect);

// Specific routes before :id
router.get('/me/profile', getMyProfile);
router.put('/me/profile', updateMyProfile);

router.get('/', authorizeRoles('admin', 'doctor', 'staff'), getPatients);
router.post('/', authorizeRoles('admin', 'staff'), createPatient);

router.get('/:id', getPatientById);
router.put('/:id', authorizeRoles('admin', 'staff'), updatePatient);
router.delete('/:id', authorizeRoles('admin'), deletePatient);

module.exports = router;
