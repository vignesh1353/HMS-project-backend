const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const Billing = require('../models/Billing');
const Medicine = require('../models/Medicine');
const MedicalRecord = require('../models/MedicalRecord');
const Prescription = require('../models/Prescription');
const Room = require('../models/Room');

describe('MedCare HMS End-to-End Core User Flows (10 Flows)', () => {
  let adminToken = '';
  let patientToken = '';
  let patientId = '';
  let patientEmail = `e2e_flow_patient_${Date.now()}@medcare.test`;
  let doctorDocId = '';
  let appointmentDocId = '';
  let billDocId = '';
  let medicineDocId = '';

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hospital_management');
    }

    // Login as existing seeded admin
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@medcare.com', password: 'Admin@123' });
    adminToken = adminRes.body.token;
  });

  afterAll(async () => {
    // Cleanup records created during E2E test
    if (patientEmail) {
      const user = await User.findOne({ email: patientEmail });
      if (user) {
        await Patient.deleteMany({ user: user._id });
        await User.deleteOne({ _id: user._id });
      }
    }
    if (appointmentDocId) {
      await Appointment.findByIdAndDelete(appointmentDocId);
    }
    if (doctorDocId) {
      await Doctor.findByIdAndDelete(doctorDocId);
    }
    if (billDocId) {
      await Billing.findByIdAndDelete(billDocId);
    }
    if (medicineDocId) {
      await Medicine.findByIdAndDelete(medicineDocId);
    }
    await mongoose.connection.close();
  });

  // FLOW 1: Patient Registration
  test('Flow 1: Patient Registration registers a new user with patient role and creates Patient profile', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'E2E Flow Patient',
        email: patientEmail,
        password: 'Password@123',
        phone: '9988776655',
        gender: 'Male',
        dob: '1995-04-12',
        bloodGroup: 'O+',
        address: '456 Healthcare Blvd',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('patient');
    expect(res.body.user.email).toBe(patientEmail);
  });

  // FLOW 2: Patient Login & JWT Generation
  test('Flow 2: Patient Login with credentials generates valid JWT token and profile data', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: patientEmail,
        password: 'Password@123',
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('patient');

    patientToken = res.body.token;

    // Verify token works on /api/auth/me
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(meRes.statusCode).toBe(200);
    expect(meRes.body.user.email).toBe(patientEmail);
  });

  // FLOW 3: Patient Books Appointment
  test('Flow 3: Patient books an appointment and status is saved', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorName: 'Dr. Rajesh Kumar',
        department: 'Cardiology',
        date: '2026-10-15',
        time: '11:00 AM',
        type: 'Consultation',
        notes: 'E2E test booking for cardiac checkup',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.appointmentId).toBeDefined();
    expect(res.body.data.doctorName).toBe('Dr. Rajesh Kumar');
    appointmentDocId = res.body.data._id;
    expect(res.body.data.status).toBe('pending');
  });

  // FLOW 4: Admin Sees the New Appointment in Real-Time
  test('Flow 4: Admin can view all appointments including the newly booked appointment', async () => {
    const res = await request(app)
      .get('/api/appointments')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    const found = res.body.data.find(apt => apt._id === appointmentDocId);
    expect(found).toBeDefined();
    expect(found.doctorName).toBe('Dr. Rajesh Kumar');
  });

  // FLOW 5: Admin Manages Doctors (CRUD)
  test('Flow 5: Admin can Create, Read, Update, and Delete a doctor', async () => {
    // 1. Create
    const createRes = await request(app)
      .post('/api/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Dr. E2E Specialist',
        email: `specialist_${Date.now()}@medcare.com`,
        phone: '9876500001',
        department: 'Neurology',
        specialization: 'Neurosurgeon',
        qualification: 'MBBS, MCh',
        experience: '14 Years',
        consultationFee: 1500,
        availability: 'Mon - Fri',
        timing: '09:00 AM - 01:00 PM',
      });

    expect(createRes.statusCode).toBe(201);
    expect(createRes.body.success).toBe(true);
    doctorDocId = createRes.body.data._id;

    // 2. Read
    const getRes = await request(app)
      .get(`/api/doctors/${doctorDocId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.body.data.specialization).toBe('Neurosurgeon');

    // 3. Update
    const updateRes = await request(app)
      .put(`/api/doctors/${doctorDocId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        consultationFee: 1800,
        experience: '15 Years',
      });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.body.data.consultationFee).toBe(1800);

    // 4. Delete
    const deleteRes = await request(app)
      .delete(`/api/doctors/${doctorDocId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    doctorDocId = null; // Cleaned up
  });

  // FLOW 6: Billing Creation & Status Update
  test('Flow 6: Admin creates an invoice and updates payment status to Paid', async () => {
    // 1. Create Invoice
    const createRes = await request(app)
      .post('/api/billing')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        patientName: 'E2E Flow Patient',
        patientId: 'PAT-E2E-1',
        doctor: 'Dr. Rajesh Kumar',
        billDate: '2026-10-15',
        consultation: 500,
        roomCharges: 1000,
        medicineCharges: 600,
        testCharges: 400,
        paymentStatus: 'Pending',
      });

    expect(createRes.statusCode).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.totalAmount).toBe(2500);
    expect(createRes.body.data.paymentStatus).toBe('Pending');
    billDocId = createRes.body.data._id;

    // 2. Patch Payment Status
    const patchRes = await request(app)
      .patch(`/api/billing/${billDocId}/payment-status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        paymentStatus: 'Paid',
        paymentMethod: 'UPI',
      });

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.body.data.paymentStatus).toBe('Paid');
    expect(patchRes.body.data.paymentMethod).toBe('UPI');
  });

  // FLOW 7: Pharmacy Medicine Inventory & Stock Update
  test('Flow 7: Admin adds a medicine to inventory and updates its stock count', async () => {
    // 1. Create Medicine
    const createRes = await request(app)
      .post('/api/medicines')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'E2E Flow Antibiotic 500mg',
        category: 'Tablet',
        manufacturer: 'PharmaCorp',
        batchNo: `BAT-${Date.now().toString().slice(-4)}`,
        quantity: 100,
        price: 85,
        expiryDate: '2028-06-30',
        supplier: 'National Med Ltd',
      });

    expect(createRes.statusCode).toBe(201);
    expect(createRes.body.data.status).toBe('Available');
    medicineDocId = createRes.body.data._id;

    // 2. Update Stock
    const stockRes = await request(app)
      .patch(`/api/medicines/${medicineDocId}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantity: 20 });

    expect(stockRes.statusCode).toBe(200);
    expect(stockRes.body.data.quantity).toBe(20);
    expect(stockRes.body.data.status).toBe('Low Stock');
  });

  // FLOW 8: Medical Records Retrieval & Patient Data Isolation
  test('Flow 8: Patient requests medical records and only sees records belonging to them', async () => {
    const res = await request(app)
      .get('/api/medical-records')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Newly registered patient has 0 personal medical records initially (strict isolation)
    expect(res.body.count).toBe(0);
  });

  // FLOW 9: Prescriptions Retrieval & Patient Data Isolation
  test('Flow 9: Patient requests prescriptions and only receives their own prescriptions', async () => {
    const res = await request(app)
      .get('/api/prescriptions')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Strict isolation prevents patient from viewing other patients' prescriptions
    expect(res.body.count).toBe(0);
  });

  // FLOW 10: Authorization Rejection for Unauthorized Role
  test('Flow 10: Unauthorized role (Patient) attempting Admin actions is rejected with 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/doctors')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        name: 'Malicious Attempt Doctor',
        department: 'Cardiology',
      });

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not authorized|forbidden/i);
  });
});
