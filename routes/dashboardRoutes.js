const express = require('express');
const router = express.Router();
const {
  getAdminStats,
  getClientStats,
  getDoctorStats,
} = require('../controllers/dashboardController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

router.use(protect);

router.get('/stats', authorizeRoles('admin', 'staff'), getAdminStats);
router.get('/client-stats', getClientStats);
router.get('/doctor-stats', authorizeRoles('doctor', 'admin'), getDoctorStats);

module.exports = router;
