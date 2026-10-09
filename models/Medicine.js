const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema(
  {
    medicineId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Please provide medicine name'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Please provide category'],
      default: 'Tablet',
      trim: true,
    },
    manufacturer: {
      type: String,
      required: [true, 'Please provide manufacturer'],
      trim: true,
    },
    batchNo: {
      type: String,
      required: [true, 'Please provide batch number'],
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, 'Please provide quantity'],
      min: [0, 'Quantity cannot be negative'],
      default: 0,
    },
    price: {
      type: Number,
      required: [true, 'Please provide price'],
      min: [0, 'Price cannot be negative'],
      default: 0,
    },
    expiryDate: {
      type: String,
      required: [true, 'Please provide expiry date'],
      trim: true,
    },
    supplier: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['Available', 'Low Stock', 'Out of Stock'],
      default: 'Available',
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

// Auto set status based on quantity
medicineSchema.pre('save', function () {
  if (this.quantity <= 0) {
    this.status = 'Out of Stock';
  } else if (this.quantity < 30) {
    this.status = 'Low Stock';
  } else {
    this.status = 'Available';
  }
});

module.exports = mongoose.model('Medicine', medicineSchema);
