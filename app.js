const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/authRoutes');
const patientRoutes = require('./routes/patientRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const billingRoutes = require('./routes/billingRoutes');
const pharmacyRoutes = require('./routes/pharmacyRoutes');
const medicalRecordRoutes = require('./routes/medicalRecordRoutes');
const prescriptionRoutes = require('./routes/prescriptionRoutes');
const roomRoutes = require('./routes/roomRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const reportRoutes = require('./routes/reportRoutes');
const medicalReportRoutes = require('./routes/medicalReportRoutes');
const medicineRequestRoutes = require('./routes/medicineRequestRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();

// Security HTTP headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS configuration
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive for development & Postman
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP request logger
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'MedCare HMS Backend REST API is running smoothly',
    timestamp: new Date().toISOString(),
  });
});

// API Routes mounting
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/medicines', pharmacyRoutes);
app.use('/api/medical-records', medicalRecordRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/medical-reports', medicalReportRoutes);
app.use('/api/medicine-requests', medicineRequestRoutes);
app.use('/api/notifications', notificationRoutes);

// Catch 404 for undefined routes
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `API Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized Error Handler
app.use(errorHandler);

module.exports = app;
