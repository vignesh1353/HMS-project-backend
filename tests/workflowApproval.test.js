const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const Room = require('../models/Room');
const Medicine = require('../models/Medicine');
const MedicalReport = require('../models/MedicalReport');
const MedicineRequest = require('../models/MedicineRequest');
const Notification = require('../models/Notification');

describe('Hospital Approval-Based Clinical & Administrative Workflow (Full 20-Step Lifecycle & Security)', () => {
  let adminToken = '';
  let adminUser = null;
  let doctorToken = '';
  let doctorUser = null;
  let doctorDoc = null;
  let patientToken = '';
  let patientUser = null;
  let patientDoc = null;
  let otherPatientToken = '';
  let otherPatientDoc = null;

  let testAppointmentId = '';
  let testAppointmentMongoId = '';
  let testRoomId = '';
  let testReportId = '';
  let testReportMongoId = '';
  let testMedicineRequestId = '';
  let testMedicineId = '';
  const initialStock = 50;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hospital_management');
    }

    // 1. Authenticate Admin
    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@medcare.com', password: 'Admin@123' });
    adminToken = adminRes.body.token;
    adminUser = adminRes.body.user;

    // 2. Authenticate Doctor
    const docRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'rajesh@medcare.com', password: 'Doctor@123' });
    doctorToken = docRes.body.token;
    doctorUser = docRes.body.user;
    doctorDoc = await Doctor.findOne({ email: 'rajesh@medcare.com' });

    // 3. Register & Login Patient A
    const patientAEmail = `workflow_patient_a_${Date.now()}@medcare.test`;
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Workflow Patient A',
        email: patientAEmail,
        password: 'Patient@123',
        phone: '9888877771',
        age: 35,
        gender: 'Male',
      });
    patientToken = regRes.body.token;
    patientUser = regRes.body.user;
    patientDoc = await Patient.findOne({ email: patientAEmail });

    // 4. Register & Login Patient B (For unauthorized cross-access testing)
    const patientBEmail = `workflow_patient_b_${Date.now()}@medcare.test`;
    const regBRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Workflow Patient B',
        email: patientBEmail,
        password: 'Patient@123',
        phone: '9888877772',
        age: 29,
        gender: 'Female',
      });
    otherPatientToken = regBRes.body.token;
    otherPatientDoc = await Patient.findOne({ email: patientBEmail });

    // 5. Create a test medicine in inventory
    const med = await Medicine.create({
      medicineId: `MED-WORKFLOW-${Date.now().toString().slice(-4)}`,
      name: 'WorkflowTestillin 500mg',
      category: 'Tablet',
      manufacturer: 'MedCare Labs',
      batchNo: 'WFL-001',
      quantity: initialStock,
      price: 50,
      expiryDate: 'Dec 2028',
      status: 'Available',
    });
    testMedicineId = med._id.toString();

    // 6. Create a test available room
    const room = await Room.create({
      roomNumber: `W-${Date.now().toString().slice(-3)}`,
      roomType: 'General Ward',
      floor: 'First Floor',
      bedCount: 2,
      availableBeds: 2,
      doctor: 'Dr. Rajesh Kumar',
      status: 'Available',
      price: 1200,
    });
    testRoomId = room._id.toString();
  });

  afterAll(async () => {
    // Cleanup created test records
    if (patientUser) {
      await User.findByIdAndDelete(patientUser.id);
      if (patientDoc) await Patient.findByIdAndDelete(patientDoc._id);
    }
    if (otherPatientDoc) {
      await User.findByIdAndDelete(otherPatientDoc.user);
      await Patient.findByIdAndDelete(otherPatientDoc._id);
    }
    if (testAppointmentMongoId) await Appointment.findByIdAndDelete(testAppointmentMongoId);
    if (testRoomId) await Room.findByIdAndDelete(testRoomId);
    if (testReportMongoId) await MedicalReport.findByIdAndDelete(testReportMongoId);
    if (testMedicineRequestId) await MedicineRequest.findByIdAndDelete(testMedicineRequestId);
    if (testMedicineId) await Medicine.findByIdAndDelete(testMedicineId);

    await mongoose.connection.close();
  });

  // STEP 1 & 2: Patient books appointment -> Status MUST be 'pending'
  test('Step 1 & 2: Patient books appointment -> status is pending (cannot be confirmed directly)', async () => {
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctorName: doctorDoc ? doctorDoc.name : 'Dr. Rajesh Kumar',
        date: 'Sep 20, 2026',
        time: '10:30 AM',
        department: 'Cardiology',
        type: 'Consultation',
        notes: 'Experiencing mild chest pressure',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('pending');
    testAppointmentId = res.body.data.appointmentId;
    testAppointmentMongoId = res.body.data._id;
  });

  // STEP 3: Admin reviews pending appointments
  test('Step 3: Admin views pending appointments directly in approval queue', async () => {
    const res = await request(app)
      .get('/api/appointments?status=pending')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    const found = res.body.data.find((a) => a.appointmentId === testAppointmentId);
    expect(found).toBeDefined();
    expect(found.status).toBe('pending');
  });

  // WORKFLOW RULE: Doctor cannot view pending appointment before Admin approval
  test('Step 3b: Workflow Rule - Doctor cannot see appointment while pending (goes directly to Admin first)', async () => {
    const docListRes = await request(app)
      .get('/api/appointments')
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(docListRes.statusCode).toBe(200);
    const foundInDocList = docListRes.body.data.find((a) => a.appointmentId === testAppointmentId);
    expect(foundInDocList).toBeUndefined();

    const docGetRes = await request(app)
      .get(`/api/appointments/${testAppointmentMongoId}`)
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(docGetRes.statusCode).toBe(403);
  });

  // STEP 4: Admin approves appointment -> triggers status: approved + room alert
  test('Step 4: Admin approves appointment -> status becomes approved and room alert dispatched', async () => {
    const res = await request(app)
      .patch(`/api/appointments/${testAppointmentMongoId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ adminComments: 'Approved by Medical Superintendent' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('approved');
    expect(res.body.data.approval.approvedByName).toBe(adminUser.name);

    // Check Room Alert in Notification collection
    const roomAlert = await Notification.findOne({
      type: 'room_alert',
      relatedEntityId: testAppointmentId,
    });
    expect(roomAlert).toBeDefined();
    expect(roomAlert.title).toContain('Room Alert');
  });

  // WORKFLOW RULE: After Admin approval, appointment is now routed to Doctor
  test('Step 4b: Workflow Rule - After Admin approval, appointment is routed and visible to Doctor', async () => {
    const docListRes = await request(app)
      .get('/api/appointments')
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(docListRes.statusCode).toBe(200);
    const foundInDocList = docListRes.body.data.find((a) => a.appointmentId === testAppointmentId);
    expect(foundInDocList).toBeDefined();
    expect(['approved', 'doctor_assigned', 'room_assigned']).toContain(foundInDocList.status);
  });

  // STEP 5: Admin assigns doctor -> status becomes doctor_assigned
  test('Step 5: Admin assigns doctor to appointment', async () => {
    const res = await request(app)
      .patch(`/api/appointments/${testAppointmentMongoId}/assign-doctor`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        doctorId: doctorDoc._id.toString(),
        doctorName: doctorDoc.name,
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('doctor_assigned');
    expect(res.body.data.assignedDoctor).toBeDefined();
  });

  // STEP 6: Admin assigns available room -> room becomes Assigned, appointment status = room_assigned
  test('Step 6: Admin assigns available room -> room marked Assigned and appointment status updated', async () => {
    const res = await request(app)
      .patch(`/api/appointments/${testAppointmentMongoId}/assign-room`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId: testRoomId,
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('room_assigned');
    expect(res.body.data.roomNumber).toBeDefined();

    // Verify room status was updated to Assigned
    const room = await Room.findById(testRoomId);
    expect(room.status).toBe('Assigned');
  });

  // STEP 7: Doctor creates medical report -> starts as 'draft'
  test('Step 7: Doctor creates medical report as draft', async () => {
    const res = await request(app)
      .post('/api/medical-reports')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patient: patientDoc._id,
        appointment: testAppointmentMongoId,
        visitDate: 'Sep 20, 2026',
        symptoms: 'Substernal tightness and fatigue',
        chiefComplaint: 'Cardiovascular assessment',
        diagnosis: 'Mild Angina Pectoris (Class I)',
        findings: 'Stress ECG normal, blood pressure slightly elevated.',
        treatment: 'Prescribe WorkflowTestillin 500mg, rest, low sodium diet.',
        doctorNotes: 'Patient advised routine monitoring.',
        status: 'draft',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('draft');
    testReportId = res.body.data.reportId;
    testReportMongoId = res.body.data._id;
  });

  // STEP 8: Doctor submits report for Admin approval -> status = pending_approval
  test('Step 8: Doctor submits report -> status becomes pending_approval', async () => {
    const res = await request(app)
      .post(`/api/medical-reports/${testReportMongoId}/submit`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('pending_approval');
  });

  // STEP 9: Unapproved Report PDF Access is BLOCKED
  test('Step 9: PDF generation is blocked before admin approval (Rule 5 & 12)', async () => {
    const res = await request(app)
      .get(`/api/medical-reports/${testReportMongoId}/pdf`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('approved');
  });

  // STEP 10: Admin approves report -> status = approved
  test('Step 10: Admin approves report -> status becomes approved', async () => {
    const res = await request(app)
      .patch(`/api/medical-reports/${testReportMongoId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('approved');
    expect(res.body.data.approval.approvedByName).toBeDefined();
  });

  // STEP 11: Approved Report PDF Generation
  test('Step 11: Approved report generates professional hospital PDF stream', async () => {
    const res = await request(app)
      .get(`/api/medical-reports/${testReportMongoId}/pdf`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  // STEP 12: Patient views approved report
  test('Step 12: Patient can view own approved report', async () => {
    const res = await request(app)
      .get(`/api/medical-reports/${testReportMongoId}`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reportId).toBe(testReportId);
  });

  // STEP 13: Patient submits medicine request based on approved report
  test('Step 13: Patient submits medicine request linked to approved report -> status pending_approval', async () => {
    const reqQty = 10;
    const res = await request(app)
      .post('/api/medicine-requests')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        reportId: testReportId,
        medicines: [
          {
            medicine: testMedicineId,
            medicineName: 'WorkflowTestillin 500mg',
            dosage: '500mg',
            frequency: 'Twice daily',
            duration: '5 days',
            quantity: reqQty,
            instructions: 'Take after meals',
          },
        ],
        reason: 'Medication as prescribed in approved report',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('pending_approval');
    testMedicineRequestId = res.body.data._id;

    // Verify stock is NOT deducted yet (Rule 8)
    const med = await Medicine.findById(testMedicineId);
    expect(med.quantity).toBe(initialStock);
  });

  // STEP 14: Admin views and approves medicine request -> stock safely deducted
  test('Step 14: Admin approves medicine request -> pharmacy inventory safely updated', async () => {
    const res = await request(app)
      .patch(`/api/medicine-requests/${testMedicineRequestId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('approved');

    // Verify stock has been safely and atomically deducted
    const med = await Medicine.findById(testMedicineId);
    expect(med.quantity).toBe(initialStock - 10);
  });

  // STEP 15: Staff dispenses medicine request
  test('Step 15: Dispense medication to patient -> status dispensed', async () => {
    const res = await request(app)
      .patch(`/api/medicine-requests/${testMedicineRequestId}/dispense`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('dispensed');
  });

  // NEGATIVE TEST 1: Patient tries to approve appointment -> 403
  test('Negative: Patient cannot approve appointment', async () => {
    const res = await request(app)
      .patch(`/api/appointments/${testAppointmentMongoId}/approve`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.statusCode).toBe(403);
  });

  // NEGATIVE TEST 2: Patient tries to approve medical report -> 403
  test('Negative: Patient cannot approve medical report', async () => {
    const res = await request(app)
      .patch(`/api/medical-reports/${testReportMongoId}/approve`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.statusCode).toBe(403);
  });

  // NEGATIVE TEST 3: Patient tries to approve medicine request -> 403
  test('Negative: Patient cannot approve medicine request', async () => {
    const res = await request(app)
      .patch(`/api/medicine-requests/${testMedicineRequestId}/approve`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(res.statusCode).toBe(403);
  });

  // NEGATIVE TEST 4: Doctor tries to approve own report -> 403
  test('Negative: Doctor cannot approve their own report (Rule 4)', async () => {
    const res = await request(app)
      .patch(`/api/medical-reports/${testReportMongoId}/approve`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(res.statusCode).toBe(403);
  });

  // NEGATIVE TEST 5: Wrong patient accessing another patient report -> 403
  test('Negative: Unauthorized patient cannot access another patient report (Rule 10)', async () => {
    const res = await request(app)
      .get(`/api/medical-reports/${testReportMongoId}`)
      .set('Authorization', `Bearer ${otherPatientToken}`);

    expect(res.statusCode).toBe(403);
  });

  // NEGATIVE TEST 6: Wrong patient accessing another patient PDF -> 403
  test('Negative: Unauthorized patient cannot download another patient report PDF', async () => {
    const res = await request(app)
      .get(`/api/medical-reports/${testReportMongoId}/pdf`)
      .set('Authorization', `Bearer ${otherPatientToken}`);

    expect(res.statusCode).toBe(403);
  });

  // NEGATIVE TEST 7: Medicine quantity greater than inventory stock -> 400 Insufficient stock
  test('Negative: Medicine request with quantity > stock cannot be approved (Rule 9)', async () => {
    // Create another request asking for 9999 units
    const overReq = await MedicineRequest.create({
      requestId: `MED-REQ-OVER-${Date.now()}`,
      patient: patientDoc._id,
      patientUser: patientUser.id,
      report: testReportMongoId,
      medicines: [
        {
          medicine: testMedicineId,
          medicineName: 'WorkflowTestillin 500mg',
          dosage: '500mg',
          frequency: 'Once',
          duration: '1 day',
          quantity: 9999, // Stock is only 40
        },
      ],
      status: 'pending_approval',
    });

    const res = await request(app)
      .patch(`/api/medicine-requests/${overReq._id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Insufficient pharmacy inventory');

    await MedicineRequest.findByIdAndDelete(overReq._id);
  });

  // NEGATIVE TEST 8: Cannot create medicine request on unapproved draft report
  test('Negative: Cannot create medicine request on unapproved draft report (Rule 6)', async () => {
    const unapprovedReport = await MedicalReport.create({
      reportId: `REP-DRAFT-${Date.now()}`,
      patient: patientDoc._id,
      doctor: doctorDoc._id,
      appointment: testAppointmentMongoId,
      diagnosis: 'Draft condition',
      status: 'draft',
    });

    const res = await request(app)
      .post('/api/medicine-requests')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        reportId: unapprovedReport._id.toString(),
        medicines: [
          {
            medicineName: 'Paracetamol 500mg',
            quantity: 5,
            dosage: '500mg',
            frequency: 'Once',
            duration: '1 day',
          },
        ],
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('officially approved report');

    await MedicalReport.findByIdAndDelete(unapprovedReport._id);
  });

  // NEGATIVE TEST 9: Cannot assign an already occupied or unavailable room
  test('Negative: Cannot assign room that is already occupied or assigned (Rule 2)', async () => {
    // Room testRoomId was marked 'Assigned' in Step 6
    const res = await request(app)
      .patch(`/api/appointments/${testAppointmentMongoId}/assign-room`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roomId: testRoomId });

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('cannot be assigned');
  });

  // NOTIFICATIONS: Query user and admin notifications
  test('Notifications: Admin and Patient receive real-time notifications', async () => {
    const adminNotifRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminNotifRes.statusCode).toBe(200);
    expect(adminNotifRes.body.count).toBeGreaterThan(0);

    const patientNotifRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(patientNotifRes.statusCode).toBe(200);
    expect(patientNotifRes.body.count).toBeGreaterThan(0);
  });
});
