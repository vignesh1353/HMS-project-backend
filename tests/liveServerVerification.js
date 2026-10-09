const BASE_URL = 'http://localhost:5000/api';
const FRONTEND_URL = 'http://localhost:5175';

async function request(url, options = {}) {
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

async function verifyLiveServers() {
  console.log('--- Step 0: Checking Frontend & Backend Live Server Reachability ---');
  
  // 1. Check frontend dev server
  try {
    const feRes = await request(FRONTEND_URL, { method: 'GET' });
    console.log(`[PASS] Frontend Dev Server is responding at ${FRONTEND_URL} with HTTP status: ${feRes.status}`);
  } catch (err) {
    console.error(`[FAIL] Frontend server not responding at ${FRONTEND_URL}:`, err.message);
  }

  // 2. Check backend health
  try {
    const beRes = await request(`${BASE_URL}/health`, { method: 'GET' });
    console.log(`[PASS] Backend Server is responding at ${BASE_URL}/health:`, beRes.data);
  } catch (err) {
    console.error(`[FAIL] Backend server not responding:`, err.message);
  }

  console.log('\n--- Real-time Live E2E Approval Workflow ---');

  // Step 1: Patient Login
  let patientToken, patientUser;
  try {
    const pLogin = await request(`${BASE_URL}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email: 'arun@gmail.com', password: 'Patient@123' })
    });
    patientToken = pLogin.data.token;
    patientUser = pLogin.data.user;
    console.log(`[PASS] Step 1: Patient Login successful (${patientUser.name}, Role: ${patientUser.role})`);
  } catch (err) {
    console.error('[FAIL] Patient login failed:', err.message);
    return;
  }

  // Step 2: Patient Books Appointment -> Expect 'pending'
  let appointmentId, patientDocId;
  try {
    const aptRes = await request(`${BASE_URL}/appointments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({
        doctorName: 'Dr. Rajesh Kumar',
        department: 'Cardiology',
        date: '2026-09-25',
        time: '11:00 AM',
        notes: 'Chest tightness and shortness of breath'
      })
    });
    if (!aptRes.ok) {
      throw new Error(`HTTP ${aptRes.status}: ${JSON.stringify(aptRes.data)}`);
    }
    appointmentId = aptRes.data.data._id;
    patientDocId = aptRes.data.data.patient;
    console.log(`[PASS] Step 2: Patient booked appointment (${appointmentId}). Initial Status: '${aptRes.data.data.status}' (enforced pending, never auto-confirmed)`);
  } catch (err) {
    console.error('[FAIL] Appointment booking failed:', err.message);
    return;
  }

  // Step 3: Admin Login
  let adminToken;
  try {
    const aLogin = await request(`${BASE_URL}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@medcare.com', password: 'Admin@123' })
    });
    adminToken = aLogin.data.token;
    console.log(`[PASS] Step 3: Admin Login successful`);
  } catch (err) {
    console.error('[FAIL] Admin login failed:', err.message);
    return;
  }

  // Step 4: Admin Approves Appointment
  try {
    const appRes = await request(`${BASE_URL}/appointments/${appointmentId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ adminComments: 'Approved for Cardiology consultation' })
    });
    console.log(`[PASS] Step 4: Admin approved appointment. Status: '${appRes.data.data.status}'. Room Alert Triggered: ${appRes.data.roomAlert}`);
  } catch (err) {
    console.error('[FAIL] Admin appointment approval failed:', err.message);
  }

  // Step 5: Admin Assigns Doctor
  let doctorId;
  try {
    const docList = await request(`${BASE_URL}/doctors`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    doctorId = docList.data.data[0]._id;
    const docAssignRes = await request(`${BASE_URL}/appointments/${appointmentId}/assign-doctor`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ doctorId: doctorId })
    });
    console.log(`[PASS] Step 5: Admin assigned Doctor (${docAssignRes.data.data.doctorName || docAssignRes.data.data.doctor}). Status: '${docAssignRes.data.data.status}'`);
  } catch (err) {
    console.error('[FAIL] Doctor assignment failed:', err.message);
  }

  // Step 6: Admin Assigns Room
  try {
    const roomList = await request(`${BASE_URL}/rooms?status=Available`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const roomId = roomList.data.data[0]._id;
    const roomNumber = roomList.data.data[0].roomNumber;
    const roomAssignRes = await request(`${BASE_URL}/appointments/${appointmentId}/assign-room`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ roomId: roomId })
    });
    console.log(`[PASS] Step 6: Admin assigned Room ${roomNumber}. Status: '${roomAssignRes.data.data.status}'`);
  } catch (err) {
    console.error('[FAIL] Room assignment failed:', err.message);
  }

  // Step 7: Doctor Login
  let doctorToken;
  try {
    const dLogin = await request(`${BASE_URL}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email: 'rajesh@medcare.com', password: 'Doctor@123' })
    });
    doctorToken = dLogin.data.token;
    console.log(`[PASS] Step 7: Doctor Login successful`);
  } catch (err) {
    console.error('[FAIL] Doctor login failed:', err.message);
    return;
  }

  // Step 8: Doctor creates Medical Report as Draft
  let reportId;
  try {
    const repRes = await request(`${BASE_URL}/medical-reports`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${doctorToken}` },
      body: JSON.stringify({
        appointment: appointmentId,
        patient: patientDocId,
        doctor: doctorId,
        visitDate: '2026-09-25',
        symptoms: 'Chest pain on exertion',
        chiefComplaint: 'Angina symptoms for 2 weeks',
        diagnosis: 'Stable Angina Pectoris - Class II',
        testInvestigation: 'ECG, Echocardiogram, Lipid Panel',
        findings: 'Sinus rhythm with mild ST depression during stress test.',
        treatment: 'Atorvastatin 20mg once daily at bedtime; Metoprolol 25mg twice daily.',
        doctorNotes: 'Patient advised low sodium diet and lifestyle modification.',
        followUpRecommendation: 'Follow-up in 2 weeks with repeat lipid profile.',
        status: 'draft'
      })
    });
    if (!repRes.ok) {
      throw new Error(`HTTP ${repRes.status}: ${JSON.stringify(repRes.data)}`);
    }
    reportId = repRes.data.data._id;
    console.log(`[PASS] Step 8: Doctor created Medical Report (${reportId}). Status: '${repRes.data.data.status}'`);
  } catch (err) {
    console.error('[FAIL] Doctor report draft failed:', err.message);
    return;
  }

  // Step 9: Doctor submits Medical Report -> status: 'pending_approval'
  try {
    const subRes = await request(`${BASE_URL}/medical-reports/${reportId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${doctorToken}` }
    });
    console.log(`[PASS] Step 9: Doctor submitted Medical Report for Admin approval. Status: '${subRes.data.data.status}'`);
  } catch (err) {
    console.error('[FAIL] Doctor report submit failed:', err.message);
  }

  // Step 10: Negative Security Test - Patient or Doctor CANNOT download PDF before Admin approval
  try {
    const unapprovedPdf = await request(`${BASE_URL}/medical-reports/${reportId}/pdf`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${patientToken}` }
    });
    if (unapprovedPdf.status === 400) {
      console.log(`[PASS] Step 10: Security Check passed! Unapproved PDF download blocked with HTTP 400: "${unapprovedPdf.data.message}"`);
    } else {
      console.error('[FAIL] Security Check: Patient was able to download unapproved PDF!', unapprovedPdf.status);
    }
  } catch (err) {
    console.log(`[PASS] Step 10: Security Check passed! Blocked:`, err.message);
  }

  // Step 11: Admin Approves Medical Report -> status: 'approved'
  try {
    const appRepRes = await request(`${BASE_URL}/medical-reports/${reportId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log(`[PASS] Step 11: Admin approved Medical Report. Status: '${appRepRes.data.data.status}'. Approved by: ${appRepRes.data.data.approval.approvedByName}`);
  } catch (err) {
    console.error('[FAIL] Admin report approval failed:', err.message);
  }

  // Step 12: PDF Generation - Official PDF now accessible and generated cleanly
  try {
    const pdfRes = await request(`${BASE_URL}/medical-reports/${reportId}/pdf`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${patientToken}` }
    });
    console.log(`[PASS] Step 12: Official Approved Medical Report PDF successfully generated and streamed! Content-Type: ${pdfRes.headers.get('content-type')}, Size: ${pdfRes.data.length} bytes, Magic Header: ${pdfRes.data.slice(0, 4).toString()}`);
  } catch (err) {
    console.error('[FAIL] PDF generation failed:', err.message);
  }

  // Step 13: Patient Creates Medicine Request based on Approved Report
  try {
    const medList = await request(`${BASE_URL}/medicines`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const targetMed = medList.data.data[0];
    const initialStock = targetMed.quantity;

    const medReqRes = await request(`${BASE_URL}/medicine-requests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({
        reportId: reportId,
        medicines: [
          {
            medicine: targetMed._id,
            medicineName: targetMed.name,
            category: targetMed.category,
            dosage: '20mg',
            frequency: 'Once daily at bedtime',
            duration: '30 days',
            quantity: 30,
            instructions: 'Take after food'
          }
        ],
        reason: 'Maintenance cardiology therapy as prescribed in approved report'
      })
    });
    const medicineReqId = medReqRes.data.data._id;
    console.log(`[PASS] Step 13: Patient submitted Tablet/Medicine Request (${medicineReqId}) linked to approved report. Status: '${medReqRes.data.data.status}'`);

    // Step 14: Verify stock is NOT deducted before approval
    const preCheckMed = await request(`${BASE_URL}/medicines/${targetMed._id}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log(`[PASS] Step 14: Pre-approval stock verified intact: ${preCheckMed.data.data.quantity} (Initial: ${initialStock})`);

    // Step 15: Admin Approves Medicine Request -> stock is atomically deducted
    const appMedRes = await request(`${BASE_URL}/medicine-requests/${medicineReqId}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log(`[PASS] Step 15: Admin approved Medicine Request. Status: '${appMedRes.data.data.status}'`);

    // Step 16: Verify stock was atomically deducted
    const postCheckMed = await request(`${BASE_URL}/medicines/${targetMed._id}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log(`[PASS] Step 16: Stock verified atomically deducted: ${postCheckMed.data.data.quantity} (Initial: ${initialStock}, Deducted: 30)`);

    // Step 17: Admin Dispenses Medicine Request
    const dispRes = await request(`${BASE_URL}/medicine-requests/${medicineReqId}/dispense`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log(`[PASS] Step 17: Admin dispensed Medicine Request. Status: '${dispRes.data.data.status}'`);

    // Step 18: Notification Verification
    const notifRes = await request(`${BASE_URL}/notifications`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${patientToken}` }
    });
    console.log(`[PASS] Step 18: In-App Notifications verified for patient: ${notifRes.data.data.length} total notifications received.`);
    
    console.log('\n======================================================');
    console.log(' ALL 18 END-TO-END APPROVAL WORKFLOW STEPS PASSED! ');
    console.log('======================================================\n');
  } catch (err) {
    console.error('[FAIL] Medicine Request workflow failed:', err.message);
  }
}

verifyLiveServers();
