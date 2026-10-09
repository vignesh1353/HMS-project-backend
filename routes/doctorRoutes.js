const express = require('express');
const router = express.Router();
const {
  getDoctors,
  getDoctorById,
  createDoctor,
  updateDoctor,
  deleteDoctor,
} = require('../controllers/doctorController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

// Public or authenticated reading
router.get('/', getDoctors);
router.get('/:id', getDoctorById);

// Admin only write routes
router.post('/', protect, authorizeRoles('admin'), createDoctor);
router.put('/:id', protect, authorizeRoles('admin'), updateDoctor);
router.delete('/:id', protect, authorizeRoles('admin'), deleteDoctor);

module.exports = router;
