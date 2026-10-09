const mongoose = require('mongoose');

const prescriptionItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  dosage: {
    type: String,
    required: true,
    trim: true,
  },
  frequency: {
    type: String,
    required: true,
    trim: true,
  },
  duration: {
    type: String,
    required: true,
    trim: true,
  },
  timing: {
    type: String,
    default: 'After Food',
    trim: true,
  },
});

const prescriptionSchema = new mongoose.Schema(
  {
    prescriptionNo: {
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
    patientName: {
      type: String,
      trim: true,
    },
    doctor: {
      type: String,
      required: [true, 'Please provide doctor name'],
      trim: true,
    },
    department: {
      type: String,
      default: 'General Medicine',
      trim: true,
    },
    date: {
      type: String,
      default: () => new Date().toISOString().split('T')[0],
    },
    diagnosis: {
      type: String,
      required: [true, 'Please provide diagnosis'],
      trim: true,
    },
    medicines: [prescriptionItemSchema],
    instructions: {
      type: String,
      default: '',
    },
    patientUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    doctorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'issued', 'pending_approval', 'approved', 'rejected', 'dispensed'],
      default: 'active',
      index: true,
    },
    approvalStatus: {
      type: String,
      enum: ['Active', 'Issued', 'Pending', 'Approved', 'Rejected'],
      default: 'Active',
      index: true,
    },
    isApproved: {
      type: Boolean,
      default: true,
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
    medicineRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicineRequest',
    },
    deletedFromAdmin: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Prescription', prescriptionSchema);
