const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema(
  {
    doctorId: {
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
      required: [true, 'Please provide doctor name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide doctor email'],
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Please provide doctor phone number'],
      trim: true,
    },
    specialization: {
      type: String,
      default: 'General Medicine',
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    qualification: {
      type: String,
      default: 'MBBS, MD',
      trim: true,
    },
    experience: {
      type: String,
      default: '5 Years',
      trim: true,
    },
    availability: {
      type: String,
      default: 'Mon - Fri',
      trim: true,
    },
    timing: {
      type: String,
      default: '10:00 AM - 2:00 PM',
      trim: true,
    },
    consultationFee: {
      type: Number,
      default: 500,
    },
    status: {
      type: String,
      enum: ['Available', 'Not Available', 'Busy', 'On Leave'],
      default: 'Available',
    },
    patients: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Set department from specialization if not specified
doctorSchema.pre('save', function () {
  if (!this.department) {
    this.department = this.specialization;
  }
});

module.exports = mongoose.model('Doctor', doctorSchema);
