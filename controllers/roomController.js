const Room = require('../models/Room');

// @desc    Get all rooms with filter
// @route   GET /api/rooms
// @access  Private (Admin / Staff)
const getRooms = async (req, res, next) => {
  try {
    const { search, roomType, status } = req.query;
    const query = {};

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { roomNumber: searchRegex },
        { roomType: searchRegex },
        { floor: searchRegex },
        { doctor: searchRegex },
        { status: searchRegex },
        { assignedPatientName: searchRegex },
      ];
    }

    if (roomType && roomType !== 'All') {
      query.roomType = roomType;
    }

    if (status && status !== 'All') {
      query.status = status;
    }

    const rooms = await Room.find(query)
      .populate('assignedAppointment')
      .populate('assignedPatient')
      .sort({ roomNumber: 1 });

    res.status(200).json({
      success: true,
      count: rooms.length,
      data: rooms,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single room by ID or roomNumber
// @route   GET /api/rooms/:id
// @access  Private
const getRoomById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let room;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      room = await Room.findById(id).populate('assignedAppointment').populate('assignedPatient');
    } else {
      room = await Room.findOne({ roomNumber: id }).populate('assignedAppointment').populate('assignedPatient');
    }

    if (!room) {
      return res.status(404).json({
        success: false,
        message: `Room not found with ID ${id}`,
      });
    }

    res.status(200).json({
      success: true,
      data: room,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add a new room
// @route   POST /api/rooms
// @access  Private (Admin / Staff)
const createRoom = async (req, res, next) => {
  try {
    const {
      roomNumber,
      roomType,
      floor,
      bedCount,
      availableBeds,
      doctor,
      status,
      price,
    } = req.body;

    if (!roomNumber || bedCount === undefined || price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Room number, bed count, and price are required',
      });
    }

    const existingRoom = await Room.findOne({ roomNumber });
    if (existingRoom) {
      return res.status(409).json({
        success: false,
        message: `Room number ${roomNumber} already exists`,
      });
    }

    const room = await Room.create({
      roomNumber,
      roomType: roomType || 'General Ward',
      floor: floor || 'Ground Floor',
      bedCount: Number(bedCount),
      availableBeds: availableBeds !== undefined ? Number(availableBeds) : Number(bedCount),
      doctor: doctor || 'Dr. Rajesh Kumar',
      status: status || 'Available',
      price: Number(price),
    });

    res.status(201).json({
      success: true,
      message: 'Room created successfully',
      data: room,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Assign Room directly to patient/appointment
// @route   PATCH /api/rooms/:id/assign
// @access  Private (Admin / Staff)
const assignRoomDirect = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { appointmentId, patientId, patientName, status } = req.body;

    let room = await Room.findById(id);
    if (!room) {
      room = await Room.findOne({ roomNumber: id });
    }

    if (!room) {
      return res.status(404).json({
        success: false,
        message: `Room not found with ID ${id}`,
      });
    }

    if (status === 'Available') {
      // Releasing room
      room.status = 'Available';
      room.assignedAppointment = null;
      room.assignedPatient = null;
      room.assignedPatientName = '';
      room.availableBeds = room.bedCount;
    } else {
      // Assigning room
      if (room.status !== 'Available' && room.status !== 'Assigned') {
        return res.status(400).json({
          success: false,
          message: `Room is currently ${room.status} and cannot be assigned.`,
        });
      }

      room.status = status || 'Assigned';
      if (appointmentId) room.assignedAppointment = appointmentId;
      if (patientId) room.assignedPatient = patientId;
      if (patientName) room.assignedPatientName = patientName;
      if (room.availableBeds > 0) room.availableBeds -= 1;
    }

    await room.save();

    res.status(200).json({
      success: true,
      message: `Room updated successfully`,
      data: room,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update room
// @route   PUT /api/rooms/:id
// @access  Private (Admin / Staff)
const updateRoom = async (req, res, next) => {
  try {
    const { id } = req.params;
    let room = await Room.findById(id);

    if (!room) {
      room = await Room.findOne({ roomNumber: id });
    }

    if (!room) {
      return res.status(404).json({
        success: false,
        message: `Room not found with ID ${id}`,
      });
    }

    const updated = await Room.findByIdAndUpdate(
      room._id,
      req.body,
      { returnDocument: 'after', runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Room updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update room status
// @route   PATCH /api/rooms/:id/status
// @access  Private (Admin / Staff)
const updateRoomStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Please provide status to update',
      });
    }

    let room = await Room.findById(id);
    if (!room) {
      room = await Room.findOne({ roomNumber: id });
    }

    if (!room) {
      return res.status(404).json({
        success: false,
        message: `Room not found with ID ${id}`,
      });
    }

    room.status = status;
    if (status === 'Available') {
      room.assignedAppointment = null;
      room.assignedPatient = null;
      room.assignedPatientName = '';
    }
    await room.save();

    res.status(200).json({
      success: true,
      message: `Room status updated to ${status}`,
      data: room,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete room
// @route   DELETE /api/rooms/:id
// @access  Private (Admin only)
const deleteRoom = async (req, res, next) => {
  try {
    const { id } = req.params;
    let room = await Room.findById(id);

    if (!room) {
      room = await Room.findOne({ roomNumber: id });
    }

    if (!room) {
      return res.status(404).json({
        success: false,
        message: `Room not found with ID ${id}`,
      });
    }

    await Room.findByIdAndDelete(room._id);

    res.status(200).json({
      success: true,
      message: 'Room deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRooms,
  getRoomById,
  createRoom,
  assignRoomDirect,
  updateRoom,
  updateRoomStatus,
  deleteRoom,
};
