const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    roomNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    roomType: {
      type: String,
      enum: ['General Ward', 'Semi Private', 'Private Room', 'ICU'],
      default: 'General Ward',
    },
    floor: {
      type: String,
      default: 'Ground Floor',
      trim: true,
    },
    bedCount: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    availableBeds: {
      type: Number,
      required: true,
      min: 0,
      default: 1,
    },
    doctor: {
      type: String,
      default: 'Dr. Rajesh Kumar',
      trim: true,
    },
    status: {
      type: String,
      enum: ['Available', 'Assigned', 'Occupied', 'Maintenance', 'Full'],
      default: 'Available',
    },
    assignedAppointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
    },
    assignedPatient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
    },
    assignedPatientName: {
      type: String,
      default: '',
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      default: 1000,
    },
    date: {
      type: String,
      default: () =>
        new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
        }),
    },
  },
  {
    timestamps: true,
  }
);

// Auto-adjust status based on available beds if not manually set to Maintenance/Assigned/Occupied
roomSchema.pre('save', function () {
  if (!['Maintenance', 'Assigned', 'Occupied'].includes(this.status)) {
    if (this.availableBeds <= 0) {
      this.status = 'Full';
    } else {
      this.status = 'Available';
    }
  }
});

module.exports = mongoose.model('Room', roomSchema);
