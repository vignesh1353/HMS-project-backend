const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const User = require('../models/User');

describe('MedCare HMS Backend API Test Suite', () => {
  let adminToken = '';
  let patientToken = '';
  let createdDoctorId = '';
  let createdPatientId = '';
  let createdAppointmentId = '';

  beforeAll(async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/hospital_management';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Health Check API', () => {
    it('GET /api/health should return status 200 and success', async () => {
      const res = await request(app).get('/api/health');
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('running');
    });
  });

  describe('Authentication & Authorization APIs', () => {
    it('POST /api/auth/login with valid admin credentials should return 200 and JWT', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@medcare.com', password: 'Admin@123' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.role).toBe('admin');
      adminToken = res.body.token;
    });

    it('POST /api/auth/login with valid patient credentials should return 200 and JWT', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'arun@gmail.com', password: 'Patient@123' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.role).toBe('patient');
      patientToken = res.body.token;
    });

    it('POST /api/auth/login with invalid password should return 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@medcare.com', password: 'WrongPassword' });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/auth/register should register a new patient user', async () => {
      const randomEmail = `testpatient_${Date.now()}@test.com`;
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test Patient',
          email: randomEmail,
          password: 'Password@123',
          phone: '9988776655',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.role).toBe('patient');
    });

    it('GET /api/auth/me with valid token should return current user info', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe('admin@medcare.com');
    });

    it('GET /api/auth/me without token should return 401 Unauthorized', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('Patient accessing Admin-only endpoint should return 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/doctors')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          name: 'Hacked Doctor',
          email: 'hack@medcare.com',
          phone: '1234567890',
          specialization: 'General',
        });

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Doctors APIs', () => {
    it('GET /api/doctors should return list of doctors', async () => {
      const res = await request(app).get('/api/doctors');
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('POST /api/doctors should create a new doctor when admin', async () => {
      const res = await request(app)
        .post('/api/doctors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Dr. Test Surgeon',
          email: `testsurgeon_${Date.now()}@medcare.com`,
          phone: '+91 99999 88888',
          specialization: 'Surgery',
          experience: '6 Years',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toContain('Dr.');
      createdDoctorId = res.body.data._id;
    });

    it('PUT /api/doctors/:id should update doctor details when admin', async () => {
      const res = await request(app)
        .put(`/api/doctors/${createdDoctorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'Busy' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Busy');
    });

    it('DELETE /api/doctors/:id should delete doctor when admin', async () => {
      const res = await request(app)
        .delete(`/api/doctors/${createdDoctorId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Patients APIs', () => {
    it('GET /api/patients should return list of patients for admin', async () => {
      const res = await request(app)
        .get('/api/patients')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('GET /api/patients/me/profile should return logged-in patient profile', async () => {
      const res = await request(app)
        .get('/api/patients/me/profile')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('arun@gmail.com');
    });

    it('PUT /api/patients/me/profile should update profile', async () => {
      const res = await request(app)
        .put('/api/patients/me/profile')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ city: 'Bengaluru' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.city).toBe('Bengaluru');
    });
  });

  describe('Appointments APIs & Data Isolation', () => {
    it('POST /api/appointments should allow patient to book appointment', async () => {
      const res = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          doctorName: 'Dr. Rajesh Kumar',
          department: 'Cardiology',
          date: 'Sep 20, 2026',
          time: '11:00 AM',
          type: 'Consultation',
          notes: 'Routine checkup',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.appointmentId).toBeDefined();
      createdAppointmentId = res.body.data._id;
    });

    it('PATCH /api/appointments/:id/status should allow patient to cancel own appointment', async () => {
      const res = await request(app)
        .patch(`/api/appointments/${createdAppointmentId}/status`)
        .set('Authorization', `Bearer ${patientToken}`)
        .send({ status: 'Cancelled' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('Cancelled');
    });

    it('GET /api/appointments for patient should only return patient appointments', async () => {
      const res = await request(app)
        .get('/api/appointments')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      // Ensure all returned appointments are for this patient
      res.body.data.forEach((apt) => {
        expect(apt.patientPhone === '9876543210' || apt.patientName.includes('Arun')).toBe(true);
      });
    });
  });

  describe('Pharmacy & Inventory APIs', () => {
    it('GET /api/medicines should return medicines inventory', async () => {
      const res = await request(app)
        .get('/api/medicines')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('POST /api/medicines with negative quantity should be rejected', async () => {
      const res = await request(app)
        .post('/api/medicines')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Invalid Med',
          category: 'Tablet',
          manufacturer: 'Test',
          batchNo: 'B-123',
          quantity: -5,
          price: 10,
          expiryDate: 'Dec 2026',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Dashboard Statistics APIs', () => {
    it('GET /api/dashboard/stats should return real MongoDB counts for admin', async () => {
      const res = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalPatients).toBeGreaterThan(0);
      expect(res.body.data.totalDoctors).toBeGreaterThan(0);
      expect(res.body.data.totalAppointments).toBeGreaterThan(0);
      expect(res.body.data.totalBeds).toBeGreaterThan(0);
    });

    it('GET /api/dashboard/client-stats should return personal counts for patient', async () => {
      const res = await request(app)
        .get('/api/dashboard/client-stats')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.patientName).toBeDefined();
    });
  });
});
