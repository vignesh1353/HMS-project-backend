const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
  {
    appointmentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
    },
    patientUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
    },
    assignedDoctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
    },
    assignedRoom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
    },
    roomNumber: {
      type: String,
      default: '',
      trim: true,
    },
    patientName: {
      type: String,
      required: [true, 'Please provide patient name'],
      trim: true,
    },
    patientPhone: {
      type: String,
      required: [true, 'Please provide patient phone number'],
      trim: true,
    },
    doctorName: {
      type: String,
      required: [true, 'Please provide doctor name'],
      trim: true,
    },
    department: {
      type: String,
      required: [true, 'Please provide department'],
      trim: true,
    },
    date: {
      type: String,
      required: [true, 'Please provide appointment date'],
      trim: true,
    },
    time: {
      type: String,
      required: [true, 'Please provide appointment time'],
      trim: true,
    },
    type: {
      type: String,
      default: 'Consultation',
      trim: true,
    },
    status: {
      type: String,
      enum: [
        'pending',
        'approved',
        'rejected',
        'doctor_assigned',
        'room_assigned',
        'in_progress',
        'completed',
        'cancelled',
        'Pending',
        'Confirmed',
        'Scheduled',
        'Completed',
        'Cancelled',
      ],
      default: 'pending',
    },
    notes: {
      type: String,
      default: '',
    },
    issues: {
      type: [String],
      default: [],
    },
    hospital: {
      type: String,
      default: 'MedCare Hospital',
    },
    approval: {
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      approvedByName: String,
      approvedAt: Date,
      rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      rejectedByName: String,
      rejectedAt: Date,
      rejectionReason: String,
      adminComments: String,
    },
    doctorAssignedAt: Date,
    roomAssignedAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Appointment', appointmentSchema);
