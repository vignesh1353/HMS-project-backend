const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide an email address'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/,
        'Please provide a valid email address',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [6, 'Password must be at least 6 characters long'],
      select: false,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    role: {
      type: String,
      enum: ['admin', 'patient', 'doctor', 'staff'],
      default: 'patient',
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    patientProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
    },
    doctorProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare entered password with hashed password
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate JWT token
userSchema.methods.generateAuthToken = function () {
  return jwt.sign(
    {
      id: this._id,
      email: this.email,
      role: this.role,
      name: this.name,
      patientProfile: this.patientProfile,
      doctorProfile: this.doctorProfile,
    },
    process.env.JWT_SECRET || 'super_secret_jwt_key_medcare_hms_2026_production',
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    }
  );
};

module.exports = mongoose.model('User', userSchema);
