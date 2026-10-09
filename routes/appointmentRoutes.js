const express = require('express');
const router = express.Router();
const {
  getAppointments,
  getAppointmentById,
  createAppointment,
  approveAppointment,
  rejectAppointment,
  assignDoctor,
  assignRoom,
  updateAppointment,
  updateAppointmentStatus,
  deleteAppointment,
  checkDoctorAvailability,
} = require('../controllers/appointmentController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

// Optional auth middleware for POST /api/appointments so guests/patients can book
const optionalAuth = async (req, res, next) => {
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    return protect(req, res, next);
  }
  next();
};

router.post('/', optionalAuth, createAppointment);
router.get('/check-availability', optionalAuth, checkDoctorAvailability);

// Protected routes
router.use(protect);

router.get('/', getAppointments);
router.get('/:id', getAppointmentById);

// Admin / Staff Approval & Allocation Workflows
router.patch('/:id/approve', authorizeRoles('admin', 'staff'), approveAppointment);
router.patch('/:id/reject', authorizeRoles('admin', 'staff'), rejectAppointment);
router.patch('/:id/assign-doctor', authorizeRoles('admin', 'staff'), assignDoctor);
router.patch('/:id/assign-room', authorizeRoles('admin', 'staff'), assignRoom);

// Status update & modifications
router.patch('/:id/status', updateAppointmentStatus);
router.put('/:id', authorizeRoles('admin', 'staff'), updateAppointment);
router.delete('/:id', authorizeRoles('admin'), deleteAppointment);

module.exports = router;
