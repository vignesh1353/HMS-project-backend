const express = require('express');
const router = express.Router();
const {
  getReports,
  getReportById,
  createReport,
  deleteReport,
} = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

router.use(protect);

router.get('/', getReports);
router.get('/:id', getReportById);
router.post('/', authorizeRoles('admin', 'staff'), createReport);
router.delete('/:id', authorizeRoles('admin'), deleteReport);

module.exports = router;
