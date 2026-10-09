const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Room = require('../models/Room');
const User = require('../models/User');
const { createNotification } = require('../utils/notificationHelper');
const { getNextAppointmentId } = require('../utils/idGenerator');

// Helper to find appointment by mongo _id or appointmentId
const findAppointmentRecord = async (id) => {
  if (id.match(/^[0-9a-fA-F]{24}$/)) {
    return await Appointment.findById(id);
  }
  return await Appointment.findOne({ appointmentId: id });
};

// Normalize any time format ('10:00', '10:00 AM', '02:00 PM', '14:00') into standard HH:MM (24-hour)
const normalizeTimeSlot = (timeStr) => {
  if (!timeStr) return '';
  const str = String(timeStr).trim().toUpperCase();
  const ampmMatch = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2];
    const meridiem = ampmMatch[3].toUpperCase();
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }
  const militaryMatch = str.match(/^(\d{1,2}):(\d{2})/);
  if (militaryMatch) {
    const hours = String(parseInt(militaryMatch[1], 10)).padStart(2, '0');
    const minutes = militaryMatch[2];
    return `${hours}:${minutes}`;
  }
  return str;
};

// @desc    Get appointments (filtered by patient if role is patient, doctor if doctor)
// @route   GET /api/appointments
// @access  Private (Patient sees own; Doctor sees assigned; Admin/Staff sees all)
const getAppointments = async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const query = {};

    // Patient isolation
    if (req.user && req.user.role === 'patient') {
      const patient = await Patient.findOne({
        $or: [{ user: req.user.id }, { email: req.user.email }],
      });

      if (patient) {
        query.$or = [
          { patient: patient._id },
          { patientUser: req.user.id },
          { patientPhone: patient.phone },
          { patientName: new RegExp(patient.name, 'i') },
        ];
      } else {
        query.patientPhone = req.user.phone || '__none__';
      }
    }

    // Doctor isolation
    if (req.user && req.user.role === 'doctor') {
      const cleanUserName = (req.user.name || '').replace(/^Dr\.\s*/i, '').trim();
      const doctor = await Doctor.findOne({
        $or: [
          { user: req.user.id },
          { email: req.user.email },
          { name: new RegExp(cleanUserName || req.user.name, 'i') },
        ],
      });

      const cleanDocName = (doctor?.name || req.user.name || '').replace(/^Dr\.\s*/i, '').trim();
      const orConditions = [
        { doctorName: new RegExp(cleanDocName, 'i') },
        { doctorName: new RegExp(doctor?.name || req.user.name, 'i') },
      ];

      if (doctor) {
        orConditions.push({ doctor: doctor._id });
        orConditions.push({ assignedDoctor: doctor._id });
      }

      // CRITICAL WORKFLOW ENFORCEMENT:
      // When a patient books an appointment for a doctor, it goes directly to Admin first.
      // The selected doctor can ONLY see the appointment after Admin approves the request.
      // Pending requests awaiting Admin review MUST NOT be visible to the doctor.
      const doctorAllowedStatuses = ['approved', 'doctor_assigned', 'room_assigned', 'in_progress', 'completed', 'Confirmed', 'confirmed'];

      let statusCondition;
      if (status && status !== 'All') {
        if (doctorAllowedStatuses.map((s) => s.toLowerCase()).includes(status.toLowerCase())) {
          statusCondition = status;
        } else {
          statusCondition = '__forbidden__';
        }
      } else {
        statusCondition = { $in: doctorAllowedStatuses };
      }

      query.$and = [
        { $or: orConditions },
        { status: statusCondition }
      ];
    } else if (status && status !== 'All') {
      query.status = status;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const searchConditions = [
        { appointmentId: searchRegex },
        { patientName: searchRegex },
        { patientPhone: searchRegex },
        { doctorName: searchRegex },
        { department: searchRegex },
        { status: searchRegex },
        { roomNumber: searchRegex },
      ];

      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchConditions }];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
    }

    const appointments = await Appointment.find(query)
      .populate('patient')
      .populate('doctor')
      .populate('assignedDoctor')
      .populate('assignedRoom')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: appointments.length,
      data: appointments,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single appointment by ID or appointmentId
// @route   GET /api/appointments/:id
// @access  Private
const getAppointmentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const appointment = await findAppointmentRecord(id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: `Appointment not found with ID ${id}`,
      });
    }

    // Role isolation check for patients
    if (req.user && req.user.role === 'patient') {
      const patient = await Patient.findOne({
        $or: [{ user: req.user.id }, { email: req.user.email }],
      });

      const isOwner =
        (patient && appointment.patient && appointment.patient.toString() === patient._id.toString()) ||
        (patient && appointment.patientPhone === patient.phone) ||
        (appointment.patientUser && appointment.patientUser.toString() === req.user.id);

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: You can only view your own appointments',
        });
      }
    }
 
    // Role isolation check for doctors
    if (req.user && req.user.role === 'doctor') {
      const isPending = ['pending', 'Pending'].includes(appointment.status);
      if (isPending) {
        return res.status(403).json({
          success: false,
          message: 'Appointment request is awaiting administrative approval and has not yet been routed to the doctor.',
        });
      }
    }

    res.status(200).json({
      success: true,
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create / Book an appointment (Always status: pending for patients)
// @route   POST /api/appointments
// @access  Public / Private (Patient or Admin)
const createAppointment = async (req, res, next) => {
  try {
    const {
      patientName,
      patientPhone,
      doctorName,
      doctor,
      department,
      date,
      time,
      type,
      notes,
      issues,
    } = req.body;

    if (!doctorName || !date || !time) {
      return res.status(400).json({
        success: false,
        message: 'Doctor, appointment date, and appointment time are required',
      });
    }

    let finalPatientName = patientName;
    let finalPatientPhone = patientPhone;
    let patientRef = null;
    let patientUserRef = null;

    if (req.user && req.user.role === 'patient') {
      patientUserRef = req.user.id;
      const patient = await Patient.findOne({
        $or: [{ user: req.user.id }, { email: req.user.email }],
      });

      if (patient) {
        finalPatientName = finalPatientName || patient.name;
        finalPatientPhone = finalPatientPhone || patient.phone;
        patientRef = patient._id;
      } else {
        finalPatientName = finalPatientName || req.user.name;
        finalPatientPhone = finalPatientPhone || req.user.phone || '9876543210';
      }
    }

    if (!finalPatientName || !finalPatientPhone) {
      return res.status(400).json({
        success: false,
        message: 'Patient name and phone number are required',
      });
    }

    const appointmentId = req.body.appointmentId || (await getNextAppointmentId());

    let finalDepartment = department;
    let doctorRef = null;

    if (doctor && String(doctor).match(/^[0-9a-fA-F]{24}$/)) {
      doctorRef = doctor;
      const foundDoctor = await Doctor.findById(doctor);
      if (foundDoctor) {
        finalDepartment = finalDepartment || foundDoctor.department || foundDoctor.specialization;
      }
    } else {
      const foundDoctor = await Doctor.findOne({
        $or: [{ name: doctorName }, { name: `Dr. ${doctorName}` }],
      });
      if (foundDoctor) {
        doctorRef = foundDoctor._id;
        finalDepartment = finalDepartment || foundDoctor.department || foundDoctor.specialization;
      }
    }

    // Doctor time conflict check: prevent double booking on the same date and time slot
    const cleanDoc = (doctorName || '').replace(/^Dr\.\s*/i, '').trim();
    const docFilters = [
      { doctorName: new RegExp(`^Dr\\.\\s*${cleanDoc}$`, 'i') },
      { doctorName: new RegExp(`^${cleanDoc}$`, 'i') },
      { doctorName: new RegExp(cleanDoc, 'i') },
    ];
    if (doctorRef) {
      docFilters.push({ doctor: doctorRef });
      docFilters.push({ assignedDoctor: doctorRef });
    }
    if (doctor && String(doctor).match(/^[0-9a-fA-F]{24}$/)) {
      docFilters.push({ doctor });
      docFilters.push({ assignedDoctor: doctor });
    }

    const sameDayAppointments = await Appointment.find({
      date: new RegExp(`^${date.trim()}$`, 'i'),
      status: { $nin: ['rejected', 'Rejected', 'cancelled', 'Cancelled'] },
      $or: docFilters,
    });

    const requestedSlot = normalizeTimeSlot(time);
    const conflictingAppointment = sameDayAppointments.find(
      (a) => normalizeTimeSlot(a.time) === requestedSlot
    );

    if (conflictingAppointment) {
      return res.status(400).json({
        success: false,
        message: `Dr. ${cleanDoc} already has an appointment booked on ${date} at ${time}. Please select another time slot.`,
      });
    }

    // Appointments booked by patients strictly default to 'pending'
    const isPatient = req.user && req.user.role === 'patient';
    const status = isPatient ? 'pending' : (req.body.status || 'pending');

    const appointment = await Appointment.create({
      appointmentId,
      patient: patientRef,
      patientUser: patientUserRef,
      doctor: doctorRef,
      assignedDoctor: isPatient ? null : (req.body.assignedDoctor || doctorRef),
      patientName: finalPatientName,
      patientPhone: finalPatientPhone,
      doctorName: doctorName.startsWith('Dr.') ? doctorName : `Dr. ${doctorName}`,
      department: finalDepartment || 'General Medicine',
      date,
      time,
      type: type || 'Consultation',
      status,
      notes: notes || '',
      issues: Array.isArray(issues) ? issues : (issues ? [issues] : []),
    });

    // Notify Admins about new appointment request
    await createNotification({
      recipientRole: 'admin',
      type: 'appointment_booked',
      title: 'New Appointment Request',
      message: `New appointment ${appointment.appointmentId} booked by ${finalPatientName} for ${date} at ${time}. Requires Admin Approval.`,
      relatedEntity: 'Appointment',
      relatedEntityId: appointment.appointmentId,
    });

    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully. Awaiting administrative approval.',
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin Approve Appointment & Trigger Room Alert
// @route   PATCH /api/appointments/:id/approve
// @access  Private (Admin / Staff only)
const approveAppointment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { adminComments, doctorId, doctorName, department, roomId, roomNumber } = req.body;
    const appointment = await findAppointmentRecord(id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: `Appointment not found with ID ${id}`,
      });
    }

    if (appointment.status === 'approved' || appointment.status === 'doctor_assigned' || appointment.status === 'room_assigned') {
      return res.status(400).json({
        success: false,
        message: `Appointment is already approved with status: ${appointment.status}`,
      });
    }

    // 1. Assign Doctor if specified or resolve existing doctor / doctorName
    let doctorDoc = null;
    if (doctorId && String(doctorId).match(/^[0-9a-fA-F]{24}$/)) {
      doctorDoc = await Doctor.findById(doctorId);
    } else if (doctorId) {
      doctorDoc = await Doctor.findOne({ doctorId });
    } else if (doctorName) {
      const clean = doctorName.replace(/^Dr\.\s*/i, '').trim();
      doctorDoc = await Doctor.findOne({
        $or: [{ name: doctorName }, { name: `Dr. ${clean}` }, { name: new RegExp(clean, 'i') }],
      });
    } else if (appointment.doctor) {
      doctorDoc = await Doctor.findById(appointment.doctor);
    } else if (appointment.doctorName) {
      const clean = appointment.doctorName.replace(/^Dr\.\s*/i, '').trim();
      doctorDoc = await Doctor.findOne({
        $or: [{ name: appointment.doctorName }, { name: `Dr. ${clean}` }, { name: new RegExp(clean, 'i') }],
      });
    }

    if (doctorDoc) {
      appointment.doctor = doctorDoc._id;
      appointment.assignedDoctor = doctorDoc._id;
      appointment.doctorName = doctorDoc.name;
      appointment.department = department || doctorDoc.department || doctorDoc.specialization || appointment.department;
      appointment.doctorAssignedAt = new Date();
    } else if (doctorName) {
      appointment.doctorName = doctorName.startsWith('Dr.') ? doctorName : `Dr. ${doctorName}`;
      appointment.doctorAssignedAt = new Date();
    }

    // 2. Assign Room if specified
    let room = null;
    if (roomId && String(roomId).match(/^[0-9a-fA-F]{24}$/)) {
      room = await Room.findById(roomId);
    } else if (roomNumber || roomId) {
      room = await Room.findOne({ roomNumber: roomNumber || roomId });
    }

    if (room) {
      if (room.status === 'Available' || (room.assignedAppointment && room.assignedAppointment.toString() === appointment._id.toString())) {
        room.status = 'Assigned';
        room.assignedAppointment = appointment._id;
        room.assignedPatient = appointment.patient || null;
        room.assignedPatientName = appointment.patientName;
        if (room.availableBeds > 0 && room.status !== 'Assigned') {
          room.availableBeds -= 1;
        }
        await room.save();

        appointment.assignedRoom = room._id;
        appointment.roomNumber = room.roomNumber;
        appointment.roomAssignedAt = new Date();
      }
    }

    // 3. Determine status
    // When an admin approves an appointment, status transitions to 'approved'.
    // If a room or doctor was explicitly provided in the approve payload, advance accordingly.
    if ((roomId || roomNumber) && appointment.roomNumber) {
      appointment.status = 'room_assigned';
    } else if (doctorId) {
      appointment.status = 'doctor_assigned';
    } else {
      appointment.status = 'approved';
    }

    appointment.approval = {
      approvedBy: req.user._id,
      approvedByName: req.user.name,
      approvedAt: new Date(),
      adminComments: adminComments || 'Approved by medical administration.',
    };

    await appointment.save();

    // 4. Notifications
    // Notify Patient
    if (appointment.patientUser) {
      await createNotification({
        recipient: appointment.patientUser,
        recipientRole: 'patient',
        type: 'appointment_approved',
        title: 'Appointment Approved',
        message: `Your appointment ${appointment.appointmentId} with ${appointment.doctorName || 'Doctor'} on ${appointment.date} has been approved.${appointment.roomNumber ? ` Assigned Room: ${appointment.roomNumber}.` : ' Room allocation is in progress.'}`,
        relatedEntity: 'Appointment',
        relatedEntityId: appointment.appointmentId,
      });
    }

    // Notify Assigned Doctor
    let doctorUserId = null;
    if (doctorDoc && doctorDoc.user) {
      doctorUserId = doctorDoc.user;
    } else if (appointment.assignedDoctor || appointment.doctor) {
      const doc = await Doctor.findById(appointment.assignedDoctor || appointment.doctor);
      if (doc && doc.user) doctorUserId = doc.user;
    }
    if (!doctorUserId && appointment.doctorName) {
      const clean = appointment.doctorName.replace(/^Dr\.\s*/i, '').trim();
      const docUser = await User.findOne({ role: 'doctor', name: new RegExp(clean, 'i') });
      if (docUser) doctorUserId = docUser._id;
    }

    if (doctorUserId) {
      await createNotification({
        recipient: doctorUserId,
        recipientRole: 'doctor',
        type: 'appointment_approved',
        title: 'New Confirmed Appointment Assigned',
        message: `Appointment ${appointment.appointmentId} for patient ${appointment.patientName} on ${appointment.date} at ${appointment.time} has been approved.${appointment.roomNumber ? ` Assigned Room: ${appointment.roomNumber}.` : ''}`,
        relatedEntity: 'Appointment',
        relatedEntityId: appointment.appointmentId,
      });
    }

    // Room alert for staff if room pending
    if (!appointment.roomNumber) {
      await createNotification({
        recipientRole: 'admin',
        type: 'room_alert',
        title: 'Room Alert: Confirmed Appointment',
        message: `Confirmed appointment ${appointment.appointmentId} (Patient: ${appointment.patientName}, Doctor: ${appointment.doctorName}, Date: ${appointment.date} ${appointment.time}). Room: Pending assignment.`,
        relatedEntity: 'Appointment',
        relatedEntityId: appointment.appointmentId,
      });
    }

    const populatedAppointment = await Appointment.findById(appointment._id)
      .populate('patient')
      .populate('doctor')
      .populate('assignedDoctor')
      .populate('assignedRoom');

    res.status(200).json({
      success: true,
      message: `Appointment approved successfully${appointment.roomNumber ? ` with Room ${appointment.roomNumber}` : ''}!`,
      data: populatedAppointment,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin Reject Appointment
// @route   PATCH /api/appointments/:id/reject
// @access  Private (Admin / Staff only)
const rejectAppointment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejectionReason, reason } = req.body;
    const appointment = await findAppointmentRecord(id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: `Appointment not found with ID ${id}`,
      });
    }

    const finalReason = rejectionReason || reason || 'Slot unavailable. Please re-schedule.';

    appointment.status = 'rejected';
    appointment.approval = {
      ...appointment.approval,
      rejectedBy: req.user._id,
      rejectedByName: req.user.name,
      rejectedAt: new Date(),
      rejectionReason: finalReason,
    };

    await appointment.save();

    // Notify Patient
    if (appointment.patientUser) {
      await createNotification({
        recipient: appointment.patientUser,
        recipientRole: 'patient',
        type: 'appointment_rejected',
        title: 'Appointment Rejected',
        message: `Your appointment ${appointment.appointmentId} was rejected. Reason: ${finalReason}`,
        relatedEntity: 'Appointment',
        relatedEntityId: appointment.appointmentId,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Appointment rejected successfully.',
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin Assign Doctor to Appointment
// @route   PATCH /api/appointments/:id/assign-doctor
// @access  Private (Admin / Staff only)
const assignDoctor = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { doctorId, doctorName, department } = req.body;

    const appointment = await findAppointmentRecord(id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: `Appointment not found with ID ${id}`,
      });
    }

    if (appointment.status === 'rejected' || appointment.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: `Cannot assign doctor to an appointment with status '${appointment.status}'`,
      });
    }

    let doctorDoc = null;
    if (doctorId && String(doctorId).match(/^[0-9a-fA-F]{24}$/)) {
      doctorDoc = await Doctor.findById(doctorId);
    } else if (doctorId) {
      doctorDoc = await Doctor.findOne({ doctorId });
    } else if (doctorName) {
      doctorDoc = await Doctor.findOne({
        $or: [{ name: doctorName }, { name: `Dr. ${doctorName}` }],
      });
    }

    if (!doctorDoc && !doctorName) {
      return res.status(400).json({
        success: false,
        message: 'Doctor ID or valid Doctor name is required',
      });
    }

    appointment.assignedDoctor = doctorDoc ? doctorDoc._id : appointment.assignedDoctor;
    appointment.doctor = doctorDoc ? doctorDoc._id : appointment.doctor;
    appointment.doctorName = doctorDoc ? doctorDoc.name : doctorName;
    appointment.department = department || (doctorDoc && (doctorDoc.department || doctorDoc.specialization)) || appointment.department;
    appointment.doctorAssignedAt = new Date();

    // Advance status if current status is pending or approved
    if (appointment.status === 'pending' || appointment.status === 'approved') {
      appointment.status = 'doctor_assigned';
    }

    await appointment.save();

    // Notify Patient
    if (appointment.patientUser) {
      await createNotification({
        recipient: appointment.patientUser,
        recipientRole: 'patient',
        type: 'doctor_assigned',
        title: 'Doctor Assigned',
        message: `Doctor ${appointment.doctorName} has been assigned to your appointment ${appointment.appointmentId}.`,
        relatedEntity: 'Appointment',
        relatedEntityId: appointment.appointmentId,
      });
    }

    // Notify Doctor if user account linked
    if (doctorDoc && doctorDoc.user) {
      await createNotification({
        recipient: doctorDoc.user,
        recipientRole: 'doctor',
        type: 'appointment_assigned',
        title: 'New Patient Consultation Assigned',
        message: `Patient ${appointment.patientName} scheduled for ${appointment.date} at ${appointment.time}.`,
        relatedEntity: 'Appointment',
        relatedEntityId: appointment.appointmentId,
      });
    }

    res.status(200).json({
      success: true,
      message: `Doctor ${appointment.doctorName} assigned successfully`,
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin Assign Room to Appointment
// @route   PATCH /api/appointments/:id/assign-room
// @access  Private (Admin / Staff only)
const assignRoom = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { roomId, roomNumber } = req.body;

    const appointment = await findAppointmentRecord(id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: `Appointment not found with ID ${id}`,
      });
    }

    if (appointment.status === 'rejected' || appointment.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: `Cannot assign room to an appointment with status '${appointment.status}'`,
      });
    }

    let room = null;
    if (roomId && String(roomId).match(/^[0-9a-fA-F]{24}$/)) {
      room = await Room.findById(roomId);
    } else if (roomNumber || roomId) {
      room = await Room.findOne({ roomNumber: roomNumber || roomId });
    }

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Specified room was not found',
      });
    }

    // Enforce business rule: Do not assign an unavailable or occupied room
    if (room.status !== 'Available') {
      return res.status(400).json({
        success: false,
        message: `Room ${room.roomNumber} is currently '${room.status}' and cannot be assigned.`,
      });
    }

    // Update Room status to 'Assigned'
    room.status = 'Assigned';
    room.assignedAppointment = appointment._id;
    room.assignedPatient = appointment.patient || null;
    room.assignedPatientName = appointment.patientName;
    if (room.availableBeds > 0) {
      room.availableBeds -= 1;
    }
    await room.save();

    // Update appointment
    appointment.assignedRoom = room._id;
    appointment.roomNumber = room.roomNumber;
    appointment.roomAssignedAt = new Date();

    // Advance status to room_assigned
    if (['pending', 'approved', 'doctor_assigned'].includes(appointment.status)) {
      appointment.status = 'room_assigned';
    }

    await appointment.save();

    // Notify Patient
    if (appointment.patientUser) {
      await createNotification({
        recipient: appointment.patientUser,
        recipientRole: 'patient',
        type: 'room_assigned',
        title: 'Room Assigned',
        message: `Room ${room.roomNumber} (${room.roomType}) assigned for your appointment ${appointment.appointmentId}.`,
        relatedEntity: 'Appointment',
        relatedEntityId: appointment.appointmentId,
      });
    }

    // Notify Doctor
    let doctorUserId = null;
    if (appointment.assignedDoctor || appointment.doctor) {
      const doc = await Doctor.findById(appointment.assignedDoctor || appointment.doctor);
      if (doc && doc.user) doctorUserId = doc.user;
    }
    if (!doctorUserId && appointment.doctorName) {
      const clean = appointment.doctorName.replace(/^Dr\.\s*/i, '').trim();
      const docUser = await User.findOne({ role: 'doctor', name: new RegExp(clean, 'i') });
      if (docUser) doctorUserId = docUser._id;
    }
    if (doctorUserId) {
      await createNotification({
        recipient: doctorUserId,
        recipientRole: 'doctor',
        type: 'room_assigned',
        title: 'Room Allocated for Patient Appointment',
        message: `Room ${room.roomNumber} (${room.roomType}) allocated for patient ${appointment.patientName} (${appointment.appointmentId}).`,
        relatedEntity: 'Appointment',
        relatedEntityId: appointment.appointmentId,
      });
    }

    const populatedAppointment = await Appointment.findById(appointment._id)
      .populate('patient')
      .populate('doctor')
      .populate('assignedDoctor')
      .populate('assignedRoom');

    res.status(200).json({
      success: true,
      message: `Room ${room.roomNumber} assigned successfully`,
      data: populatedAppointment,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update appointment status with state machine validation
// @route   PATCH /api/appointments/:id/status
// @access  Private (Patient can cancel; Admin can advance lifecycle)
const updateAppointmentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Please provide status to update',
      });
    }

    const appointment = await findAppointmentRecord(id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: `Appointment not found with ID ${id}`,
      });
    }

    // Patient can ONLY cancel their own appointment
    if (req.user && req.user.role === 'patient') {
      if (status !== 'cancelled' && status !== 'Cancelled') {
        return res.status(403).json({
          success: false,
          message: 'Patients can only cancel their appointments',
        });
      }
    }

    // Valid state transitions
    const validTransitions = {
      pending: ['approved', 'rejected', 'cancelled'],
      approved: ['doctor_assigned', 'room_assigned', 'in_progress', 'cancelled'],
      doctor_assigned: ['room_assigned', 'in_progress', 'cancelled'],
      room_assigned: ['in_progress', 'cancelled'],
      confirmed: ['room_assigned', 'in_progress', 'cancelled'],
      scheduled: ['room_assigned', 'in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      completed: [],
      rejected: [],
      cancelled: [],
    };

    const current = (appointment.status || 'pending').toLowerCase();
    const target = status.toLowerCase();

    // If admin is updating and transition is specified, enforce state validation
    if (validTransitions[current] && !validTransitions[current].includes(target) && target !== current) {
      // Allow admin override if setting to completed or cancelled
      if (req.user && req.user.role !== 'admin') {
        return res.status(400).json({
          success: false,
          message: `Invalid status transition from '${current}' to '${target}'.`,
        });
      }
    }

    appointment.status = status;
    await appointment.save();

    // Free up room if completed or cancelled
    if ((target === 'completed' || target === 'cancelled') && appointment.assignedRoom) {
      const room = await Room.findById(appointment.assignedRoom);
      if (room && (room.status === 'Assigned' || room.status === 'Occupied')) {
        room.status = 'Available';
        room.assignedAppointment = null;
        room.assignedPatient = null;
        room.assignedPatientName = '';
        room.availableBeds = Math.min(room.bedCount, room.availableBeds + 1);
        await room.save();
      }
    }

    res.status(200).json({
      success: true,
      message: `Appointment status updated to ${target}`,
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update appointment details
// @route   PUT /api/appointments/:id
// @access  Private (Admin / Staff)
const updateAppointment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const appointment = await findAppointmentRecord(id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: `Appointment not found with ID ${id}`,
      });
    }

    const updated = await Appointment.findByIdAndUpdate(
      appointment._id,
      req.body,
      { returnDocument: 'after', runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Appointment updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete appointment
// @route   DELETE /api/appointments/:id
// @access  Private (Admin only)
const deleteAppointment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const appointment = await findAppointmentRecord(id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: `Appointment not found with ID ${id}`,
      });
    }

    await Appointment.findByIdAndDelete(appointment._id);

    res.status(200).json({
      success: true,
      message: 'Appointment deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Check doctor availability for a given date and time
// @route   GET /api/appointments/check-availability
// @access  Public / Protected
const checkDoctorAvailability = async (req, res, next) => {
  try {
    const { doctorName, doctorId, date, time } = req.query;
    if (!doctorName && !doctorId) {
      return res.status(400).json({ success: false, message: 'Doctor name or ID is required' });
    }
    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required' });
    }

    const cleanDoc = (doctorName || '').replace(/^Dr\.\s*/i, '').trim();
    const docFilters = [];
    if (cleanDoc) {
      docFilters.push({ doctorName: new RegExp(`^Dr\\.\\s*${cleanDoc}$`, 'i') });
      docFilters.push({ doctorName: new RegExp(`^${cleanDoc}$`, 'i') });
      docFilters.push({ doctorName: new RegExp(cleanDoc, 'i') });
    }
    if (doctorId && String(doctorId).match(/^[0-9a-fA-F]{24}$/)) {
      docFilters.push({ doctor: doctorId });
      docFilters.push({ assignedDoctor: doctorId });
    }

    const appointmentsOnDate = await Appointment.find({
      date: new RegExp(`^${date.trim()}$`, 'i'),
      status: { $nin: ['rejected', 'Rejected', 'cancelled', 'Cancelled'] },
      $or: docFilters,
    }).select('time date doctorName');

    const bookedSlots = appointmentsOnDate.map((a) => a.time);

    let isAvailable = true;
    if (time) {
      const requestedSlot = normalizeTimeSlot(time);
      isAvailable = !appointmentsOnDate.some(
        (a) => normalizeTimeSlot(a.time) === requestedSlot
      );
    }

    res.status(200).json({
      success: true,
      available: isAvailable,
      bookedSlots,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
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
};
