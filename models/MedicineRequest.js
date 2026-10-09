const mongoose = require('mongoose');

const medicineItemSchema = new mongoose.Schema({
  medicine: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
  },
  medicineName: {
    type: String,
    required: [true, 'Please provide medicine or tablet name'],
    trim: true,
  },
  category: {
    type: String,
    default: 'Tablet',
    trim: true,
  },
  dosage: {
    type: String,
    required: [true, 'Please provide dosage (e.g. 500mg)'],
    trim: true,
  },
  frequency: {
    type: String,
    required: [true, 'Please provide frequency (e.g. Twice daily)'],
    trim: true,
  },
  duration: {
    type: String,
    required: [true, 'Please provide duration (e.g. 5 days)'],
    trim: true,
  },
  quantity: {
    type: Number,
    required: [true, 'Please provide quantity'],
    min: [1, 'Quantity must be at least 1'],
  },
  instructions: {
    type: String,
    default: 'Take after meals',
    trim: true,
  },
});

const medicineRequestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: false,
      index: true,
    },
    patientId: {
      type: String,
      trim: true,
      index: true,
    },
    patientReferenceNumber: {
      type: String,
      trim: true,
    },
    patientName: {
      type: String,
      trim: true,
    },
    patientUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    report: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicalReport',
      index: true,
    },
    prescription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prescription',
      index: true,
    },
    prescriptionNo: {
      type: String,
      trim: true,
      index: true,
    },
    source: {
      type: String,
      enum: ['report', 'prescription'],
      default: 'report',
      index: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
    },
    medicines: {
      type: [medicineItemSchema],
      validate: [
        (val) => val.length > 0,
        'At least one medicine item must be requested',
      ],
    },
    reason: {
      type: String,
      default: '',
      trim: true,
    },
    additionalNotes: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending_approval', 'approved', 'rejected', 'dispensed', 'cancelled'],
      default: 'pending_approval',
      index: true,
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
    },
    dispensedAt: Date,
    dispensedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('MedicineRequest', medicineRequestSchema);
