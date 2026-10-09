const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema(
  {
    patientId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    name: {
      type: String,
      required: [true, 'Please provide patient name'],
      trim: true,
    },
    age: {
      type: Number,
      required: false,
      min: 0,
      max: 130,
    },
    dob: {
      type: String,
      default: '',
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other'],
      default: 'Male',
    },
    phone: {
      type: String,
      required: [true, 'Please provide patient phone number'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide patient email address'],
      lowercase: true,
      trim: true,
    },
    department: {
      type: String,
      default: 'General Medicine',
      trim: true,
    },
    doctor: {
      type: String,
      default: 'Dr. Rajesh Kumar',
      trim: true,
    },
    bloodGroup: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'],
      default: 'B+',
    },
    city: {
      type: String,
      default: 'Chennai',
      trim: true,
    },
    address: {
      type: String,
      default: '',
      trim: true,
    },
    emergencyName: {
      type: String,
      default: '',
      trim: true,
    },
    emergencyPhone: {
      type: String,
      default: '',
      trim: true,
    },
    medicalHistory: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
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

module.exports = mongoose.model('Patient', patientSchema);
