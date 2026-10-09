const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    reportName: {
      type: String,
      required: [true, 'Please provide report name'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['Patient', 'Doctor', 'Pharmacy', 'Appointment', 'Billing', 'General'],
      default: 'General',
    },
    department: {
      type: String,
      default: 'All Departments',
      trim: true,
    },
    generatedBy: {
      type: String,
      default: 'Admin',
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
    period: {
      type: String,
      enum: ['Daily', 'Weekly', 'Monthly', 'Yearly', 'All'],
      default: 'Monthly',
    },
    records: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['Completed', 'Pending', 'In Progress'],
      default: 'Completed',
    },
    description: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Report', reportSchema);
