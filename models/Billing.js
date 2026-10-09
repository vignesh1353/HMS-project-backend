const mongoose = require('mongoose');

const billingSchema = new mongoose.Schema(
  {
    billNumber: {
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
    patientId: {
      type: String,
      trim: true,
    },
    patientName: {
      type: String,
      required: [true, 'Please provide patient name'],
      trim: true,
    },
    age: {
      type: Number,
      min: 0,
      max: 130,
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
    billDate: {
      type: String,
      required: true,
      default: () =>
        new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
        }),
    },
    consultation: {
      type: Number,
      default: 0,
      min: 0,
    },
    roomCharges: {
      type: Number,
      default: 0,
      min: 0,
    },
    medicineCharges: {
      type: Number,
      default: 0,
      min: 0,
    },
    testCharges: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentStatus: {
      type: String,
      enum: ['Paid', 'Pending', 'Cancelled'],
      default: 'Paid',
    },
    paymentMethod: {
      type: String,
      enum: ['Cash', 'UPI', 'Card', 'Not Paid'],
      default: 'Cash',
    },
    approvalStatus: {
      type: String,
      enum: ['Pending', 'Approved'],
      default: 'Pending',
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Auto calculate total amount before save
billingSchema.pre('save', function () {
  this.totalAmount =
    (Number(this.consultation) || 0) +
    (Number(this.roomCharges) || 0) +
    (Number(this.medicineCharges) || 0) +
    (Number(this.testCharges) || 0);
});

module.exports = mongoose.model('Billing', billingSchema);
