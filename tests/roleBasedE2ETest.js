const BASE_URL = 'http://localhost:5000/api';

async function req(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else if (contentType.includes('application/pdf')) {
    const buf = await res.arrayBuffer();
    data = Buffer.from(buf);
  } else {
    data = await res.text();
  }
  return { status: res.status, headers: res.headers, data, ok: res.ok };
}

async function runRoleAudit() {
  console.log('================================================================');
  console.log('  FULL-STACK HOSPITAL ROLES & FEATURES END-TO-END VERIFICATION  ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // =================================================================
  // 1. PATIENT ROLE & WORKFLOW
  // =================================================================
  console.log('--- 1. Testing PATIENT Role & Features ---');

  // 1.1 Login
  const pLogin = await req(`${BASE_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: 'arun@gmail.com', password: 'Patient@123' })
  });
  assert(pLogin.status === 200 && pLogin.data.token, 'Patient login successful');
  const pToken = pLogin.data.token;
  const pAuth = { Authorization: `Bearer ${pToken}` };

  // 1.2 Patient Dashboard Stats
  const pStats = await req(`${BASE_URL}/dashboard/client-stats`, { method: 'GET', headers: pAuth });
  assert(pStats.status === 200 && pStats.data.success, 'Patient dashboard stats retrieved');

  // 1.3 Patient Books Appointment (must be status: pending)
  const pBook = await req(`${BASE_URL}/appointments`, {
    method: 'POST',
    headers: pAuth,
    body: JSON.stringify({
      doctorName: 'Dr. Rajesh Kumar',
      department: 'Cardiology',
      date: '2026-10-05',
      time: '10:00 AM',
      notes: 'Cardiology follow-up for audit'
    })
  });
  assert(pBook.status === 201 && pBook.data.data.status === 'pending', 'Appointment booked with enforced status: pending');
  const appointmentId = pBook.data.data._id;
  const patientDocId = pBook.data.data.patient;

  // 1.4 Patient Views Own Appointments
  const pApts = await req(`${BASE_URL}/appointments`, { method: 'GET', headers: pAuth });
  assert(pApts.status === 200 && pApts.data.data.some(a => a._id === appointmentId), 'Patient can view own booked appointment');

  // 1.5 Security: Patient CANNOT approve own appointment
  const pApproveFail = await req(`${BASE_URL}/appointments/${appointmentId}/approve`, {
    method: 'PATCH',
    headers: pAuth,
    body: JSON.stringify({})
  });
  assert(pApproveFail.status === 403, 'Security: Patient blocked from approving appointment (403)');

  // 1.6 Approval Workflow Guard: Selected doctor CANNOT see appointment while status is pending
  const dPreLogin = await req(`${BASE_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: 'rajesh@medcare.com', password: 'Doctor@123' })
  });
  const dPreAuth = { Authorization: `Bearer ${dPreLogin.data.token}` };
  const dPreApts = await req(`${BASE_URL}/appointments`, { method: 'GET', headers: dPreAuth });
  const docCanSeePending = dPreApts.data.data.some(a => a._id === appointmentId);
  assert(!docCanSeePending, 'Approval Guard: Selected doctor cannot view pending appointment before Admin approval');
  const dPreGetById = await req(`${BASE_URL}/appointments/${appointmentId}`, { method: 'GET', headers: dPreAuth });
  assert(dPreGetById.status === 403, 'Security Guard: Doctor blocked with 403 when trying to fetch unapproved pending appointment');

  // =================================================================
  // 2. ADMIN ROLE & WORKFLOW
  // =================================================================
  console.log('\n--- 2. Testing ADMIN Role & Features ---');

  // 2.1 Admin Login
  const aLogin = await req(`${BASE_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@medcare.com', password: 'Admin@123' })
  });
  assert(aLogin.status === 200 && aLogin.data.token, 'Admin login successful');
  const aToken = aLogin.data.token;
  const aAuth = { Authorization: `Bearer ${aToken}` };

  // 2.2 Admin Dashboard Stats
  const aStats = await req(`${BASE_URL}/dashboard/stats`, { method: 'GET', headers: aAuth });
  assert(aStats.status === 200 && aStats.data.data.totalAppointments >= 1, 'Admin dashboard stats retrieved');

  // 2.3 Admin Approves Appointment
  const aApproveApt = await req(`${BASE_URL}/appointments/${appointmentId}/approve`, {
    method: 'PATCH',
    headers: aAuth,
    body: JSON.stringify({ adminComments: 'Approved by Medical Superintendent' })
  });
  assert(aApproveApt.status === 200 && aApproveApt.data.data.status === 'approved', 'Admin approved appointment');

  // 2.4 Admin Assigns Doctor
  const docList = await req(`${BASE_URL}/doctors`, { method: 'GET', headers: aAuth });
  const targetDoctor = docList.data.data.find(d => d.email === 'rajesh@medcare.com') || docList.data.data[0];
  const aAssignDoc = await req(`${BASE_URL}/appointments/${appointmentId}/assign-doctor`, {
    method: 'PATCH',
    headers: aAuth,
    body: JSON.stringify({ doctorId: targetDoctor._id })
  });
  assert(aAssignDoc.status === 200 && aAssignDoc.data.data.status === 'doctor_assigned', 'Admin assigned doctor to appointment');

  // 2.5 Admin Assigns Room
  let availRooms = await req(`${BASE_URL}/rooms?status=Available`, { method: 'GET', headers: aAuth });
  let targetRoom = (availRooms.data && availRooms.data.data && availRooms.data.data.length > 0) ? availRooms.data.data[0] : null;
  if (!targetRoom) {
    const newRoom = await req(`${BASE_URL}/rooms`, {
      method: 'POST',
      headers: aAuth,
      body: JSON.stringify({
        roomNumber: `E2E-R-${Date.now().toString().slice(-4)}`,
        roomType: 'General Ward',
        floor: '3rd Floor',
        bedCount: 2,
        availableBeds: 2,
        price: 1500,
        status: 'Available'
      })
    });
    targetRoom = newRoom.data.data;
  }
  assert(targetRoom && targetRoom._id, 'Admin has available room for assignment');
  const aAssignRoom = await req(`${BASE_URL}/appointments/${appointmentId}/assign-room`, {
    method: 'PATCH',
    headers: aAuth,
    body: JSON.stringify({ roomId: targetRoom._id })
  });
  assert(aAssignRoom.status === 200 && aAssignRoom.data.data.status === 'room_assigned', 'Admin assigned room to appointment');

  // 2.6 Admin Module Views (Doctors, Patients, Rooms, Pharmacy, Billing, Notifications)
  const aPatients = await req(`${BASE_URL}/patients`, { method: 'GET', headers: aAuth });
  assert(aPatients.status === 200 && aPatients.data.data.length > 0, 'Admin patients directory accessible');

  const aRooms = await req(`${BASE_URL}/rooms`, { method: 'GET', headers: aAuth });
  assert(aRooms.status === 200 && aRooms.data.data.length > 0, 'Admin rooms directory accessible');

  const aMeds = await req(`${BASE_URL}/medicines`, { method: 'GET', headers: aAuth });
  assert(aMeds.status === 200 && aMeds.data.data.length > 0, 'Admin pharmacy inventory accessible');

  const aBills = await req(`${BASE_URL}/billing`, { method: 'GET', headers: aAuth });
  assert(aBills.status === 200, 'Admin billing invoices accessible');

  const aNotifs = await req(`${BASE_URL}/notifications`, { method: 'GET', headers: aAuth });
  assert(aNotifs.status === 200 && aNotifs.data.data.length > 0, 'Admin live notifications accessible');

  // =================================================================
  // 3. DOCTOR ROLE & WORKFLOW
  // =================================================================
  console.log('\n--- 3. Testing DOCTOR Role & Features ---');

  // 3.1 Doctor Login
  const dLogin = await req(`${BASE_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: 'rajesh@medcare.com', password: 'Doctor@123' })
  });
  assert(dLogin.status === 200 && dLogin.data.token, 'Doctor login successful');
  const dToken = dLogin.data.token;
  const dAuth = { Authorization: `Bearer ${dToken}` };

  // 3.2 Doctor Dashboard Stats
  const dStats = await req(`${BASE_URL}/dashboard/doctor-stats`, { method: 'GET', headers: dAuth });
  assert(dStats.status === 200 && dStats.data.success, 'Doctor dashboard stats retrieved');

  // 3.3 Doctor Views Assigned Appointments
  const dApts = await req(`${BASE_URL}/appointments`, { method: 'GET', headers: dAuth });
  assert(dApts.status === 200 && dApts.data.data.some(a => a._id === appointmentId), 'Doctor views assigned consultation');

  // 3.4 Doctor Starts Consultation (status: in_progress)
  const dStart = await req(`${BASE_URL}/appointments/${appointmentId}/status`, {
    method: 'PATCH',
    headers: dAuth,
    body: JSON.stringify({ status: 'in_progress' })
  });
  assert(dStart.status === 200 && dStart.data.data.status === 'in_progress', 'Doctor starts consultation (in_progress)');

  // 3.5 Doctor Creates Clinical Medical Report as Draft
  const dDraft = await req(`${BASE_URL}/medical-reports`, {
    method: 'POST',
    headers: dAuth,
    body: JSON.stringify({
      appointment: appointmentId,
      patient: patientDocId,
      visitDate: '2026-10-05',
      symptoms: 'Fatigue and occasional chest pain',
      chiefComplaint: 'Cardiovascular checkup',
      diagnosis: 'Atherosclerotic Heart Disease - Mild',
      testInvestigation: 'Stress Echo, Lipid Panel',
      findings: 'LVEF 60%, normal wall motion.',
      treatment: 'Aspirin 75mg daily, Rosuvastatin 10mg.',
      doctorNotes: 'Maintain moderate cardio exercises.',
      status: 'draft'
    })
  });
  assert(dDraft.status === 201 && dDraft.data.data.status === 'draft', 'Doctor creates clinical report draft');
  const reportId = dDraft.data.data._id;

  // 3.6 Security: Doctor CANNOT self-approve own report
  const dSelfApprove = await req(`${BASE_URL}/medical-reports/${reportId}/approve`, {
    method: 'PATCH',
    headers: dAuth,
    body: JSON.stringify({})
  });
  assert(dSelfApprove.status === 403, 'Security: Doctor blocked from self-approving report (403)');

  // 3.7 Doctor Submits Report for Admin Approval
  const dSubmit = await req(`${BASE_URL}/medical-reports/${reportId}/submit`, {
    method: 'POST',
    headers: dAuth
  });
  assert(dSubmit.status === 200 && dSubmit.data.data.status === 'pending_approval', 'Doctor submits report for Admin approval');

  // 3.8 Security: Patient CANNOT download PDF before approval
  const unapprovedPdf = await req(`${BASE_URL}/medical-reports/${reportId}/pdf`, {
    method: 'GET',
    headers: pAuth
  });
  assert(unapprovedPdf.status === 400, 'Security: Unapproved report PDF download blocked (400)');

  // 3.9 Admin Rejection & Doctor Revision Workflow Test
  const aRejectReport = await req(`${BASE_URL}/medical-reports/${reportId}/reject`, {
    method: 'PATCH',
    headers: aAuth,
    body: JSON.stringify({ rejectionReason: 'Please attach specific lipid profile values.' })
  });
  assert(aRejectReport.status === 200 && aRejectReport.data.data.status === 'rejected', 'Admin rejects report with feedback');

  // 3.10 Doctor Edits & Resubmits Report
  const dResubmit = await req(`${BASE_URL}/medical-reports/${reportId}`, {
    method: 'PUT',
    headers: dAuth,
    body: JSON.stringify({
      findings: 'LVEF 60%, LDL 110 mg/dL, HDL 48 mg/dL, Triglycerides 140 mg/dL.',
      status: 'pending_approval',
      submitForApproval: true
    })
  });
  assert(dResubmit.status === 200 && dResubmit.data.data.status === 'pending_approval', 'Doctor edits and resubmits rejected report');

  // 3.11 Admin Approves Final Report
  const aApproveReport = await req(`${BASE_URL}/medical-reports/${reportId}/approve`, {
    method: 'PATCH',
    headers: aAuth
  });
  assert(aApproveReport.status === 200 && aApproveReport.data.data.status === 'approved', 'Admin approves revised clinical report');

  // 3.12 Official PDF Generation Test
  const officialPdf = await req(`${BASE_URL}/medical-reports/${reportId}/pdf`, {
    method: 'GET',
    headers: pAuth
  });
  const isPdf = Buffer.isBuffer(officialPdf.data) && officialPdf.data.slice(0, 4).toString() === '%PDF';
  assert(officialPdf.status === 200 && isPdf, 'Official certified PDF successfully generated and streamed');

  // 3.13 Doctor Issues Prescription
  const dPrescribe = await req(`${BASE_URL}/prescriptions`, {
    method: 'POST',
    headers: dAuth,
    body: JSON.stringify({
      patient: patientDocId,
      patientName: 'Arun Kumar',
      doctor: 'Dr. Rajesh Kumar',
      department: 'Cardiology',
      diagnosis: 'Atherosclerotic Heart Disease',
      medicines: [
        { name: 'Aspirin', dosage: '75mg', frequency: 'Once daily', duration: '30 days', instructions: 'Take after meal' },
        { name: 'Rosuvastatin', dosage: '10mg', frequency: 'Once daily at bedtime', duration: '30 days', instructions: 'Take at night' }
      ],
      instructions: 'Dietary low fat, routine lipid profile after 60 days.'
    })
  });
  assert(dPrescribe.status === 201 && dPrescribe.data.data.prescriptionNo, 'Doctor successfully issued prescription');
  const issuedRxNo = dPrescribe.data.data.prescriptionNo;

  // 3.14 Patient Directly Receives Prescription (No Admin Approval Required)
  const pPrescriptions = await req(`${BASE_URL}/prescriptions`, { method: 'GET', headers: pAuth });
  const patientHasRx = pPrescriptions.status === 200 && pPrescriptions.data.data.some(p => p.prescriptionNo === issuedRxNo);
  assert(patientHasRx, 'Patient directly received and can view doctor prescription without Admin approval');

  // 3.15 Admin Visibility of All Prescriptions
  const aPrescriptions = await req(`${BASE_URL}/prescriptions`, { method: 'GET', headers: aAuth });
  const adminHasRx = aPrescriptions.status === 200 && aPrescriptions.data.data.some(p => p.prescriptionNo === issuedRxNo);
  assert(adminHasRx, 'Admin has full visibility to view the doctor-issued prescription');

  // 3.16 Doctor Issues Clinical Report Directly to Patient (No Admin Approval Required)
  const dDirectReport = await req(`${BASE_URL}/medical-reports`, {
    method: 'POST',
    headers: dAuth,
    body: JSON.stringify({
      appointment: appointmentId,
      patient: patientDocId,
      visitDate: '2026-10-06',
      symptoms: 'Stable follow-up evaluation',
      chiefComplaint: 'Post-consultation clinical summary',
      diagnosis: 'Hypertensive Heart Disease - Controlled',
      testInvestigation: 'Echocardiography, Blood pressure profile',
      findings: 'Blood pressure 120/80 mmHg, heart rate regular.',
      treatment: 'Continue current medication regimen, low sodium diet.',
      doctorNotes: 'Excellent progress, next review in 3 months.',
      status: 'approved',
      directToPatient: true
    })
  });
  assert(dDirectReport.status === 201 && dDirectReport.data.data.status === 'approved', 'Doctor issues clinical report directly to patient');
  const directReportId = dDirectReport.data.data._id;
  const directReportCode = dDirectReport.data.data.reportId;

  // 3.17 Patient Directly Receives Clinical Report and Can Download Certified PDF
  const pDirectReports = await req(`${BASE_URL}/medical-reports`, { method: 'GET', headers: pAuth });
  const patientHasDirectReport = pDirectReports.status === 200 && pDirectReports.data.data.some(r => r.reportId === directReportCode || r._id === directReportId);
  assert(patientHasDirectReport, 'Patient directly received and can view clinical report without Admin approval');

  const pDirectPdf = await req(`${BASE_URL}/medical-reports/${directReportId}/pdf`, {
    method: 'GET',
    headers: pAuth
  });
  const isDirectPdf = Buffer.isBuffer(pDirectPdf.data) && pDirectPdf.data.slice(0, 4).toString() === '%PDF';
  assert(pDirectPdf.status === 200 && isDirectPdf, 'Patient can immediately download certified PDF for directly issued report');

  // 3.18 Admin Has Full Real-time Visibility of Clinical Report
  const aDirectReports = await req(`${BASE_URL}/medical-reports`, { method: 'GET', headers: aAuth });
  const adminHasDirectReport = aDirectReports.status === 200 && aDirectReports.data.data.some(r => r.reportId === directReportCode || r._id === directReportId);
  assert(adminHasDirectReport, 'Admin has full real-time visibility over the doctor-issued clinical report');

  // =================================================================
  // 4. PHARMACY MEDICINE REQUEST & ATOMIC INVENTORY DEDUCTION
  // =================================================================
  console.log('\n--- 4. Testing Pharmacy Tablet Request & Inventory Protection ---');

  // 4.1 Get medicine item & initial stock
  let allMeds = await req(`${BASE_URL}/medicines`, { method: 'GET', headers: aAuth });
  let medItem = (allMeds.data && allMeds.data.data) ? allMeds.data.data.find(m => m.quantity >= 20) : null;
  if (!medItem) {
    const newMed = await req(`${BASE_URL}/medicines`, {
      method: 'POST',
      headers: aAuth,
      body: JSON.stringify({
        name: `E2E-Paracetamol-${Date.now().toString().slice(-4)}`,
        category: 'Tablet',
        manufacturer: 'MedCare Pharma',
        batchNo: `BATCH-${Date.now().toString().slice(-4)}`,
        quantity: 100,
        price: 25,
        expiryDate: '2028-12-31'
      })
    });
    medItem = newMed.data.data;
  }
  const initialStock = medItem.quantity;

  // 4.2 Patient Submits Medicine Request Linked to Approved Report
  const pMedReq = await req(`${BASE_URL}/medicine-requests`, {
    method: 'POST',
    headers: pAuth,
    body: JSON.stringify({
      reportId: reportId,
      medicines: [
        {
          medicine: medItem._id,
          medicineName: medItem.name,
          category: medItem.category,
          dosage: '10mg',
          frequency: 'Once daily',
          duration: '10 days',
          quantity: 10,
          instructions: 'Take daily'
        }
      ],
      reason: 'Medication prescribed in approved medical report'
    })
  });
  assert(pMedReq.status === 201 && pMedReq.data.data.status === 'pending_approval', 'Patient submitted medicine request (pending_approval)');
  const medReqId = pMedReq.data.data._id;

  // 4.3 Verify Stock is NOT deducted prior to approval
  const stockPre = await req(`${BASE_URL}/medicines/${medItem._id}`, { method: 'GET', headers: aAuth });
  assert(stockPre.data.data.quantity === initialStock, 'Pharmacy stock intact prior to Admin approval');

  // 4.4 Admin Approves Medicine Request -> Atomic Deduction
  const aApproveMed = await req(`${BASE_URL}/medicine-requests/${medReqId}/approve`, {
    method: 'PATCH',
    headers: aAuth
  });
  assert(aApproveMed.status === 200 && aApproveMed.data.data.status === 'approved', 'Admin approved medicine request');

  // 4.5 Verify Stock is Atomically Deducted
  const stockPost = await req(`${BASE_URL}/medicines/${medItem._id}`, { method: 'GET', headers: aAuth });
  assert(stockPost.data.data.quantity === initialStock - 10, `Pharmacy stock atomically deducted: ${initialStock} -> ${stockPost.data.data.quantity}`);

  // 4.6 Dispense Medicine
  const aDispense = await req(`${BASE_URL}/medicine-requests/${medReqId}/dispense`, {
    method: 'PATCH',
    headers: aAuth
  });
  assert(aDispense.status === 200 && aDispense.data.data.status === 'dispensed', 'Pharmacy staff dispensed medications');

  // =================================================================
  // SUMMARY
  // =================================================================
  console.log('\n================================================================');
  console.log(`  FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 100% OF ALL ROLES AND FEATURES PASSED WITH ZERO FAILURES! 🎉\n');
  }
}

runRoleAudit().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
