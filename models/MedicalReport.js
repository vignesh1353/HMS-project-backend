const mongoose = require('mongoose');

const medicalReportSchema = new mongoose.Schema(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: [true, 'Please provide patient reference'],
      index: true,
    },
    patientUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: [true, 'Please provide doctor reference'],
      index: true,
    },
    doctorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: [true, 'Please provide appointment reference'],
      index: true,
    },
    visitDate: {
      type: String,
      default: () =>
        new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
        }),
    },
    symptoms: {
      type: String,
      default: '',
      trim: true,
    },
    chiefComplaint: {
      type: String,
      default: '',
      trim: true,
    },
    diagnosis: {
      type: String,
      required: [true, 'Please provide clinical diagnosis'],
      trim: true,
    },
    testInvestigation: {
      type: String,
      default: '',
      trim: true,
    },
    findings: {
      type: String,
      default: '',
      trim: true,
    },
    treatment: {
      type: String,
      default: '',
      trim: true,
    },
    doctorNotes: {
      type: String,
      default: '',
      trim: true,
    },
    followUpRecommendation: {
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
      enum: ['draft', 'pending_approval', 'approved', 'rejected'],
      default: 'draft',
      index: true,
    },
    isApproved: {
      type: Boolean,
      default: false,
      index: true,
    },
    approval: {
      isApproved: {
        type: Boolean,
        default: false,
      },
      approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      approvedByName: String,
      approvedAt: Date,
      approvalReference: String,
      rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      rejectedByName: String,
      rejectedAt: Date,
      rejectionReason: String,
    },
    revisions: [
      {
        revisionNumber: { type: Number, default: 1 },
        revisedAt: { type: Date, default: Date.now },
        revisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        diagnosis: String,
        treatment: String,
        doctorNotes: String,
        findings: String,
        comments: String,
      },
    ],
    medicineStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected', 'dispensed'],
      default: 'none',
      index: true,
    },
    medicineRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicineRequest',
    },
    medicineApproval: {
      status: String,
      approvedAt: Date,
      approvedByName: String,
      rejectedAt: Date,
      rejectedByName: String,
      rejectionReason: String,
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

module.exports = mongoose.model('MedicalReport', medicalReportSchema);
