const express = require('express');
const router = express.Router();
const {
  getRooms,
  getRoomById,
  createRoom,
  assignRoomDirect,
  updateRoom,
  updateRoomStatus,
  deleteRoom,
} = require('../controllers/roomController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

router.use(protect);

router.get('/', getRooms);
router.get('/:id', getRoomById);
router.post('/', authorizeRoles('admin', 'staff'), createRoom);
router.put('/:id', authorizeRoles('admin', 'staff'), updateRoom);
router.patch('/:id/assign', authorizeRoles('admin', 'staff'), assignRoomDirect);
router.patch('/:id/status', authorizeRoles('admin', 'staff'), updateRoomStatus);
router.delete('/:id', authorizeRoles('admin'), deleteRoom);

module.exports = router;
