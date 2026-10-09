const mongoose = require('mongoose');

const medicalRecordSchema = new mongoose.Schema(
  {
    recordId: {
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
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
    },
    patientName: {
      type: String,
      trim: true,
    },
    doctor: {
      type: String,
      default: 'Dr. Rajesh Kumar',
      trim: true,
    },
    title: {
      type: String,
      required: [true, 'Please provide title for the medical record'],
      trim: true,
    },
    department: {
      type: String,
      default: 'General Medicine',
      trim: true,
    },
    type: {
      type: String,
      default: 'Medical Report',
      trim: true,
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
    description: {
      type: String,
      default: '',
    },
    diagnosis: {
      type: String,
      default: '',
    },
    symptoms: {
      type: String,
      default: '',
    },
    treatment: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Available', 'Pending'],
      default: 'Available',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('MedicalRecord', medicalRecordSchema);
